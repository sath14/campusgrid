/*
 * CampusGrid — ESP32-C3 SuperMini doorway
 * RC522 RFID + 16x2 I2C LCD
 *
 * Replaces a full ESP32-S3 at simple doors:
 *   Line1: Welcome NAME   (or Unknown card)
 *   Line2: MK-A22XXXXXX   (or MK----------)
 *
 * No camera required. Register this C3's Wi‑Fi IP in Admin → Devices.
 *
 * Libraries: MFRC522, LiquidCrystal_I2C (or LiquidCrystal I2C)
 * Board: ESP32C3 Dev Module / SuperMini
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

MFRC522 rfid(RC522_SS, RC522_RST);
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

char lastUid[11] = "";
unsigned long lastTapMs = 0;

void uidToChars(byte* uid, byte uidSize, char* out) {
  const char hex[] = "0123456789ABCDEF";
  byte pos = 0;
  for (byte i = 0; i < uidSize; i++) {
    out[pos++] = hex[(uid[i] >> 4) & 0x0F];
    out[pos++] = hex[uid[i] & 0x0F];
  }
  out[pos] = '\0';
}

void showLcd(const String& line1, const String& line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

String jsonStr(const String& body, const char* key) {
  String k = String("\"") + key + "\":\"";
  int i = body.indexOf(k);
  if (i < 0) return "";
  i += k.length();
  int j = body.indexOf('"', i);
  if (j < 0) return "";
  return body.substring(i, j);
}

bool postTapAndDisplay(const char* uid) {
  if (WiFi.status() != WL_CONNECTED) {
    showLcd("Offline", "No WiFi");
    return false;
  }
  HTTPClient http;
  String url = String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/tap";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  String body = "{";
  body += "\"uid\":\"" + String(uid) + "\",";
  body += "\"source\":\"esp32-c3\",";
  body += "\"doorway\":\"" + String(DOORWAY) + "\",";
  body += "\"place_slug\":\"" + String(PLACE_SLUG) + "\",";
  body += "\"device_ip\":\"" + WiFi.localIP().toString() + "\",";
  body += "\"webcam_available\":false";
  body += "}";

  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  Serial.printf("tap %d %s\n", code, resp.c_str());

  String welcome = jsonStr(resp, "display_line");
  String matrix = jsonStr(resp, "matrix_line");
  if (!welcome.length()) welcome = "Unknown card";
  if (!matrix.length()) matrix = "MK----------";

  // Prefer short welcome for 16-char LCD
  if (welcome.startsWith("Welcome ")) {
    String name = welcome.substring(8);
    if (name.length() > 16) name = name.substring(0, 16);
    showLcd(name, matrix);
  } else {
    showLcd(welcome.substring(0, 16), matrix.substring(0, 16));
  }
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(300);

  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();
  showLcd("CampusGrid", "Connecting...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("C3 IP: ");
  Serial.println(WiFi.localIP());
  showLcd("Ready", WiFi.localIP().toString());

  SPI.begin(RC522_SCK, RC522_MISO, RC522_MOSI, RC522_SS);
  rfid.PCD_Init();
  delay(1500);
  showLcd("Tap your card", " ");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(15);
    return;
  }

  char uid[11];
  uidToChars(rfid.uid.uidByte, rfid.uid.size, uid);
  unsigned long now = millis();
  if (strcmp(uid, lastUid) == 0 && (now - lastTapMs) < 1200) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  showLcd("Reading...", uid);
  postTapAndDisplay(uid);

  strcpy(lastUid, uid);
  lastTapMs = now;
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(2500);
  showLcd("Tap your card", " ");
}
