/*
 * CampusGrid Edge — ESP32 RFID over WiFi (future doorway nodes)
 *
 * When ready:
 *   1. Copy config.h.example -> config.h
 *   2. Set WiFi SSID/password + master laptop IP
 *   3. Wire RC522 (3.3V!) to ESP32 pins in config.h
 *   4. Flash with Arduino IDE (ESP32 board pack) or PlatformIO
 *
 * Posts to Edge Gateway:
 *   POST http://GATEWAY/api/edge/tap
 *   Header: X-Device-Key
 *
 * Optional later: add ESP32-CAM and POST /api/edge/headcount
 *
 * NOTE: For now production path is Arduino Mega USB on master laptop.
 *       This sketch is ready when you deploy WiFi doorways.
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
const unsigned long DEBOUNCE_MS = 50;

void uidToChars(byte* uid, byte uidSize, char* out) {
  const char hex[] = "0123456789ABCDEF";
  byte pos = 0;
  for (byte i = 0; i < uidSize; i++) {
    out[pos++] = hex[(uid[i] >> 4) & 0x0F];
    out[pos++] = hex[uid[i] & 0x0F];
  }
  out[pos] = '\0';
}

bool postTap(const char* uid, unsigned long intervalMs, bool flagged) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/tap";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  String body = "{";
  body += "\"uid\":\"" + String(uid) + "\",";
  body += "\"interval_ms\":" + String(intervalMs) + ",";
  body += "\"flagged\":" + String(flagged ? "true" : "false") + ",";
  body += "\"source\":\"esp32-wifi\",";
  body += "\"doorway\":\"" + String(DOORWAY) + "\",";
  body += "\"facility_slug\":\"" + String(FACILITY_SLUG) + "\"";
  body += "}";

  int code = http.POST(body);
  Serial.printf("POST tap -> %d\n", code);
  http.end();
  return code >= 200 && code < 300;
}

// Optional stub for later ESP32-CAM headcount
bool postHeadcount(int count) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/headcount";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  String body = "{\"count\":" + String(count) +
                ",\"source\":\"esp32-cam\",\"doorway\":\"" + String(DOORWAY) +
                "\",\"facility_slug\":\"" + String(FACILITY_SLUG) + "\"}";
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  SPI.begin();
  rfid.PCD_Init();
  Serial.println("ESP32 RFID edge ready");
}

void loop() {
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
  bool flagged = false;
  if (hasPreviousTap) {
    interval = now - lastTapMs;
    if (interval < MIN_TAP_INTERVAL_MS) flagged = true;
  }

  Serial.printf("TAP %s interval=%lu flag=%d\n", uid, interval, flagged);
  postTap(uid, interval, flagged);

  strcpy(lastUid, uid);
  lastTapMs = now;
  hasPreviousTap = true;

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
