/*
 * CampusGrid Edge — ESP32-CAM (AI-Thinker) + RC522 RFID + OV2640
 *
 * Use this on a NORMAL ESP32 (not S3) when you want a camera.
 * Do NOT plug a USB webcam into a normal ESP32 — use this board instead.
 *
 * Board in Arduino IDE: "AI Thinker ESP32-CAM"
 * Camera: OV2640 (built onto ESP32-CAM)
 *
 * Flow:
 *   1. Copy config.h.example → config.h
 *   2. Flash, open Serial (115200), copy LAN IP
 *   3. Admin → ESP32 devices → Add IP + place slug
 *   4. On card tap: capture JPEG → POST /api/edge/tap (with photo)
 *      If vision=headcount: also POST /api/edge/headcount-place (simple count)
 *
 * If camera init fails, RFID taps still post with webcam_available=false.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"
#include "config.h"

MFRC522 rfid(RC522_SS, RC522_RST);

char lastUid[11] = "";
unsigned long lastTapMs = 0;
bool hasPreviousTap = false;
const unsigned long DEBOUNCE_MS = 100;

int deviceId = 0;
String doorway = DOORWAY_FALLBACK;
String placeSlug = PLACE_FALLBACK;
String visionMode = "headcount";
bool cameraReady = false;

// AI-Thinker ESP32-CAM OV2640 pins
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

void uidToChars(byte* uid, byte uidSize, char* out) {
  const char hex[] = "0123456789ABCDEF";
  byte pos = 0;
  for (byte i = 0; i < uidSize; i++) {
    out[pos++] = hex[(uid[i] >> 4) & 0x0F];
    out[pos++] = hex[uid[i] & 0x0F];
  }
  out[pos] = '\0';
}

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA; // small enough for RAM + HTTP
  config.jpeg_quality = 15;
  config.fb_count = 1;
  config.grab_mode = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed 0x%x — continuing without cam\n", err);
    return false;
  }
  Serial.println("OV2640 camera ready");
  return true;
}

String jpegToBase64(const uint8_t* buf, size_t len) {
  size_t outLen = 0;
  mbedtls_base64_encode(NULL, 0, &outLen, buf, len);
  String out;
  out.reserve(outLen + 4);
  unsigned char* tmp = (unsigned char*)malloc(outLen + 1);
  if (!tmp) return "";
  size_t written = 0;
  if (mbedtls_base64_encode(tmp, outLen + 1, &written, buf, len) != 0) {
    free(tmp);
    return "";
  }
  tmp[written] = 0;
  out = String((char*)tmp);
  free(tmp);
  return out;
}

String captureJpegBase64() {
  if (!cameraReady) return "";
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    return "";
  }
  String b64 = jpegToBase64(fb->buf, fb->len);
  esp_camera_fb_return(fb);
  Serial.printf("JPEG captured, b64 len=%u\n", (unsigned)b64.length());
  return b64;
}

bool pullConfig() {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT +
               "/api/edge/device-config?ip=" + WiFi.localIP().toString();
  http.begin(url);
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("Config pull HTTP %d — add this IP in Admin → Devices\n", code);
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();

  auto extract = [&](const char* key) -> String {
    String k = String("\"") + key + "\":";
    int i = body.indexOf(k);
    if (i < 0) return "";
    i += k.length();
    while (i < (int)body.length() && (body[i] == ' ')) i++;
    if (body[i] == '"') {
      i++;
      int j = body.indexOf('"', i);
      return body.substring(i, j);
    }
    int j = i;
    while (j < (int)body.length() && body[j] != ',' && body[j] != '}') j++;
    return body.substring(i, j);
  };

  String id = extract("device_id");
  if (id.length()) deviceId = id.toInt();
  String d = extract("doorway"); if (d.length()) doorway = d;
  String p = extract("place_slug"); if (p.length()) placeSlug = p;
  String v = extract("vision_mode"); if (v.length()) visionMode = v;

  Serial.printf("Config id=%d doorway=%s place=%s vision=%s\n",
                deviceId, doorway.c_str(), placeSlug.c_str(), visionMode.c_str());
  return true;
}

bool postTap(const char* uid, unsigned long intervalMs, const String& photoB64) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/tap";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  bool hasCam = photoB64.length() > 0;
  String body = "{";
  body += "\"uid\":\"" + String(uid) + "\",";
  body += "\"interval_ms\":" + String(intervalMs) + ",";
  body += "\"source\":\"esp32-cam\",";
  body += "\"doorway\":\"" + doorway + "\",";
  body += "\"place_slug\":\"" + placeSlug + "\",";
  body += "\"facility_slug\":\"" + placeSlug + "\",";
  body += "\"device_id\":" + String(deviceId) + ",";
  body += "\"device_ip\":\"" + WiFi.localIP().toString() + "\",";
  body += "\"webcam_available\":" + String(hasCam ? "true" : "false");
  if (hasCam) {
    body += ",\"photo_jpeg_base64\":\"" + photoB64 + "\"";
  }
  body += "}";

  int code = http.POST(body);
  Serial.printf("POST tap -> %d (photo=%d)\n", code, hasCam);
  http.end();
  return code >= 200 && code < 300;
}

bool postHeadcount(int count) {
  if (count < 0) return false;
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/headcount-place";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  String body = "{";
  body += "\"count\":" + String(count) + ",";
  body += "\"place_slug\":\"" + placeSlug + "\",";
  body += "\"doorway\":\"" + doorway + "\",";
  body += "\"source\":\"esp32-cam-ov2640\"";
  body += "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("POST headcount -> %d\n", code);
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // Flash LED off (GPIO 4 on AI-Thinker) — optional
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32-CAM IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("Add this IP in Admin → Devices");

  cameraReady = initCamera();

  SPI.begin(RC522_SCK, RC522_MISO, RC522_MOSI, RC522_SS);
  rfid.PCD_Init();

  pullConfig();
  Serial.println("ESP32-CAM edge ready (OV2640 optional for photos)");
}

void loop() {
  static unsigned long lastCfg = 0;
  if (millis() - lastCfg > 60000UL) {
    pullConfig();
    lastCfg = millis();
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(10);
    return;
  }

  char uid[11];
  uidToChars(rfid.uid.uidByte, rfid.uid.size, uid);
  unsigned long now = millis();

  if (strcmp(uid, lastUid) == 0 && (now - lastTapMs) < DEBOUNCE_MS) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  unsigned long interval = 999999UL;
  if (hasPreviousTap) interval = now - lastTapMs;
  Serial.printf("TAP %s interval=%lu\n", uid, interval);

  String photo = captureJpegBase64(); // empty if camera failed — OK
  postTap(uid, interval, photo);

  // Livecount: report at least 1 person when a photo was taken (simple doorway presence).
  // Better multi-person CV can be done later on the laptop from stored photos.
  if (visionMode == "headcount" && photo.length() > 0) {
    postHeadcount(1);
  }

  strcpy(lastUid, uid);
  lastTapMs = now;
  hasPreviousTap = true;

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
