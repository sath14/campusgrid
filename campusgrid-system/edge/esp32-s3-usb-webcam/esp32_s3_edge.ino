/*
 * CampusGrid Edge — ESP32-S3 + RFID + optional USB webcam
 *
 * Architecture:
 *   Arduino Mega (USB on master laptop) = MAIN HEAD (integrity + rapid-tap)
 *   ESP32-S3 nodes = plug-and-play doorway/place modules added over time
 *
 * Admin setup:
 *   1. Flash this sketch (set WiFi + GATEWAY in config.h)
 *   2. Note the ESP32 LAN IP from Serial
 *   3. Admin → Devices → Add name + IP + place slug
 *   4. Device pulls doorway/place/vision config from:
 *        GET /api/edge/device-config?ip=<its-ip>
 *
 * On RFID tap:
 *   - POST /api/edge/tap  (always — works even if webcam missing)
 *   - If USB webcam available: capture JPEG, include photo_jpeg_base64
 *   - If vision=headcount and webcam ok: also POST /api/edge/headcount-place
 *   - Facial recognition records are handled on the SERVER from tap photos
 *     (livecount for cafeteria/library/counselling = taps + headcount only)
 *
 * Libraries (Arduino IDE / Library Manager):
 *   - MFRC522
 *   - ArduinoJson (optional; we build JSON manually)
 *   - ESP32 built-in WiFi + HTTPClient
 *
 * USB webcam on ESP32-S3 is board/firmware specific. This sketch uses a
 * soft stub: if WEBCAM_AVAILABLE is 0 / capture fails, taps still post.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include "config.h"

MFRC522 rfid(RC522_SS, RC522_RST);

char lastUid[11] = "";
unsigned long lastTapMs = 0;
bool hasPreviousTap = false;
const unsigned long DEBOUNCE_MS = 80;

int deviceId = 0;
String doorway = DOORWAY_FALLBACK;
String placeSlug = PLACE_FALLBACK;
String visionMode = "headcount";
bool webcamOk = false;

void uidToChars(byte* uid, byte uidSize, char* out) {
  const char hex[] = "0123456789ABCDEF";
  byte pos = 0;
  for (byte i = 0; i < uidSize; i++) {
    out[pos++] = hex[(uid[i] >> 4) & 0x0F];
    out[pos++] = hex[uid[i] & 0x0F];
  }
  out[pos] = '\0';
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
    Serial.printf("Config pull failed HTTP %d — using fallbacks. Add IP in Admin → Devices.\n", code);
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();

  // Minimal parsing without ArduinoJson dependency
  auto extract = [&](const char* key) -> String {
    String k = String("\"") + key + "\":";
    int i = body.indexOf(k);
    if (i < 0) return "";
    i += k.length();
    while (i < (int)body.length() && (body[i] == ' ' || body[i] == '\"')) {
      if (body[i] == '\"') { i++; break; }
      i++;
    }
    if (body[i - 1] == '\"') {
      int j = body.indexOf('\"', i);
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

  Serial.printf("Config OK id=%d doorway=%s place=%s vision=%s\n",
                deviceId, doorway.c_str(), placeSlug.c_str(), visionMode.c_str());
  return true;
}

/**
 * Try USB webcam capture. Returns empty string if unavailable.
 * Replace the stub with your ESP32-S3 USB Host UVC capture code.
 */
String captureJpegBase64() {
  if (!WEBCAM_ENABLED) return "";
  // STUB: return empty → server continues without photo / headcount
  // When you wire UVC capture, fill jpeg bytes and base64-encode here.
  webcamOk = false;
  return "";
}

int estimateHeadcountStub() {
  // Without a real vision pipeline, skip headcount (do not invent numbers).
  return -1;
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
  body += "\"source\":\"esp32-s3\",";
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
  Serial.printf("POST tap -> %d (webcam=%d)\n", code, hasCam);
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
  body += "\"source\":\"esp32-s3-webcam\"";
  body += "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("POST headcount -> %d\n", code);
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(400);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32-S3 IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("Add this IP in Admin → Devices for plug-and-play.");

  SPI.begin();
  rfid.PCD_Init();

  pullConfig();
  Serial.println("ESP32-S3 edge ready (webcam optional)");
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

  String photo = captureJpegBase64(); // empty if no webcam — OK
  postTap(uid, interval, photo);

  // Livecount headcount only when vision=headcount AND webcam worked
  if (visionMode == "headcount" && photo.length() > 0) {
    int hc = estimateHeadcountStub();
    if (hc >= 0) postHeadcount(hc);
  }
  // facial mode: server stores tap photo into face_records — no ESP32 FR needed

  strcpy(lastUid, uid);
  lastTapMs = now;
  hasPreviousTap = true;

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
