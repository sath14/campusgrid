/*
 * CampusGrid — ESP32-S3-CAM (built-in OV2640) + RC522 RFID
 *
 * This is NOT the classic "ESP32-CAM AI-Thinker" board.
 * Use board: ESP32S3 Dev Module (enable PSRAM / OPI PSRAM if available).
 *
 * Default camera pins = common AliExpress ESP32-S3-CAM (N16R8 style).
 * If camera init fails, edit CAMERA_* pins in config.h for YOUR board
 * (XIAO Sense, Freenove, etc. differ).
 *
 * Admin: add this board's Wi‑Fi IP under Devices (same plug-and-play flow).
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
int deviceId = 0;
String doorway = DOORWAY_FALLBACK;
String placeSlug = PLACE_FALLBACK;
String visionMode = "headcount";
bool cameraReady = false;

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
  config.pin_d0 = CAM_Y2;
  config.pin_d1 = CAM_Y3;
  config.pin_d2 = CAM_Y4;
  config.pin_d3 = CAM_Y5;
  config.pin_d4 = CAM_Y6;
  config.pin_d5 = CAM_Y7;
  config.pin_d6 = CAM_Y8;
  config.pin_d7 = CAM_Y9;
  config.pin_xclk = CAM_XCLK;
  config.pin_pclk = CAM_PCLK;
  config.pin_vsync = CAM_VSYNC;
  config.pin_href = CAM_HREF;
  config.pin_sccb_sda = CAM_SIOD;
  config.pin_sccb_scl = CAM_SIOC;
  config.pin_pwdn = CAM_PWDN;
  config.pin_reset = CAM_RESET;
  config.xclk_freq_hz = 20000000;
  config.frame_size = FRAMESIZE_QVGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 12;
  config.fb_count = psramFound() ? 2 : 1;
  if (!psramFound()) config.fb_location = CAMERA_FB_IN_DRAM;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("S3-CAM init failed 0x%x — taps still work without photo\n", err);
    return false;
  }
  Serial.println("ESP32-S3-CAM OV2640 ready");
  return true;
}

String jpegToBase64(const uint8_t* buf, size_t len) {
  size_t outLen = 0;
  mbedtls_base64_encode(NULL, 0, &outLen, buf, len);
  unsigned char* tmp = (unsigned char*)malloc(outLen + 1);
  if (!tmp) return "";
  size_t written = 0;
  if (mbedtls_base64_encode(tmp, outLen + 1, &written, buf, len) != 0) {
    free(tmp);
    return "";
  }
  tmp[written] = 0;
  String out = String((char*)tmp);
  free(tmp);
  return out;
}

String captureJpegBase64() {
  if (!cameraReady) return "";
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return "";
  String b64 = jpegToBase64(fb->buf, fb->len);
  esp_camera_fb_return(fb);
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
  if (code != 200) { http.end(); return false; }
  String body = http.getString();
  http.end();
  auto extract = [&](const char* key) -> String {
    String k = String("\"") + key + "\":";
    int i = body.indexOf(k);
    if (i < 0) return "";
    i += k.length();
    while (i < (int)body.length() && body[i] == ' ') i++;
    if (body[i] == '"') {
      i++;
      int j = body.indexOf('"', i);
      return body.substring(i, j);
    }
    int j = i;
    while (j < (int)body.length() && body[j] != ',' && body[j] != '}') j++;
    return body.substring(i, j);
  };
  String id = extract("device_id"); if (id.length()) deviceId = id.toInt();
  String d = extract("doorway"); if (d.length()) doorway = d;
  String p = extract("place_slug"); if (p.length()) placeSlug = p;
  String v = extract("vision_mode"); if (v.length()) visionMode = v;
  return true;
}

bool postTap(const char* uid, unsigned long intervalMs, const String& photoB64) {
  HTTPClient http;
  http.begin(String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/tap");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  bool hasCam = photoB64.length() > 0;
  String body = "{";
  body += "\"uid\":\"" + String(uid) + "\",";
  body += "\"interval_ms\":" + String(intervalMs) + ",";
  body += "\"source\":\"esp32-s3-cam\",";
  body += "\"doorway\":\"" + doorway + "\",";
  body += "\"place_slug\":\"" + placeSlug + "\",";
  body += "\"device_id\":" + String(deviceId) + ",";
  body += "\"device_ip\":\"" + WiFi.localIP().toString() + "\",";
  body += "\"webcam_available\":" + String(hasCam ? "true" : "false");
  if (hasCam) body += ",\"photo_jpeg_base64\":\"" + photoB64 + "\"";
  body += "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("tap HTTP %d\n", code);
  return code >= 200 && code < 300;
}

bool postHeadcount(int count) {
  HTTPClient http;
  http.begin(String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/headcount-place");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  String body = "{\"count\":" + String(count) +
                ",\"place_slug\":\"" + placeSlug +
                "\",\"doorway\":\"" + doorway +
                "\",\"source\":\"esp32-s3-cam\"}";
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(400);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.println();
  Serial.print("ESP32-S3-CAM IP: ");
  Serial.println(WiFi.localIP());

  cameraReady = initCamera();
  SPI.begin(RC522_SCK, RC522_MISO, RC522_MOSI, RC522_SS);
  rfid.PCD_Init();
  pullConfig();
}

void loop() {
  static unsigned long lastCfg = 0;
  if (millis() - lastCfg > 60000UL) { pullConfig(); lastCfg = millis(); }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) { delay(10); return; }

  char uid[11];
  uidToChars(rfid.uid.uidByte, rfid.uid.size, uid);
  unsigned long now = millis();
  if (strcmp(uid, lastUid) == 0 && (now - lastTapMs) < 100) {
    rfid.PICC_HaltA(); rfid.PCD_StopCrypto1(); return;
  }
  unsigned long interval = hasPreviousTap ? (now - lastTapMs) : 999999UL;
  String photo = captureJpegBase64();
  postTap(uid, interval, photo);
  if (visionMode == "headcount" && photo.length() > 0) postHeadcount(1);

  strcpy(lastUid, uid);
  lastTapMs = now;
  hasPreviousTap = true;
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
