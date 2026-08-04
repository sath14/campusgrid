/*
 * CampusGrid Edge - Arduino Mega 2560
 * RFID tap + interval timing + rapid-tap flag (< 200 ms)
 *
 * Same pin layout (do not change):
 *   RC522: SDA(SS)->D10  SCK->D52  MOSI->D51  MISO->D50  RST->D9  3.3V  GND
 *   LCD:   VCC->5V       GND->GND  SDA->D20   SCL->D21
 *
 * Serial @ 115200:
 *   TAP:UID:C3ABA12C:INTERVAL:350:FLAG:0
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <MFRC522.h>

#define RC522_SS   10
#define RC522_RST  9
#define LCD_ADDR   0x3F   // change to 0x27 if blank
#define LCD_COLS   16
#define LCD_ROWS   2

const unsigned long MIN_TAP_INTERVAL_MS = 200;

MFRC522 rfid(RC522_SS, RC522_RST);
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

char lastUid[11] = "";
unsigned long lastTapMs = 0;
bool hasPreviousTap = false;
const unsigned long DEBOUNCE_MS = 50;

void lcdShow(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void uidToChars(byte* uid, byte uidSize, char* out) {
  const char hex[] = "0123456789ABCDEF";
  byte pos = 0;
  for (byte i = 0; i < uidSize; i++) {
    out[pos++] = hex[(uid[i] >> 4) & 0x0F];
    out[pos++] = hex[uid[i] & 0x0F];
  }
  out[pos] = '\0';
}

void setup() {
  Serial.begin(115200);

  Wire.begin();
  delay(200);

  lcd.init();
  lcd.backlight();

  pinMode(RC522_RST, OUTPUT);
  digitalWrite(RC522_RST, HIGH);
  SPI.begin();
  rfid.PCD_Init();

  lcdShow("CampusGrid Edge", "Scan RFID card");
  Serial.println(F("EDGE_READY"));
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
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
    if (interval < MIN_TAP_INTERVAL_MS) {
      flagged = true;
    }
  }

  Serial.print(F("TAP:UID:"));
  Serial.print(uid);
  Serial.print(F(":INTERVAL:"));
  Serial.print(interval);
  Serial.print(F(":FLAG:"));
  Serial.println(flagged ? 1 : 0);

  if (flagged) {
    lcdShow("FLAGGED <200ms", uid);
  } else if (!hasPreviousTap) {
    lcdShow("Tap OK", uid);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(uid);
    lcd.setCursor(0, 1);
    lcd.print(interval);
    lcd.print(" ms");
  }

  strcpy(lastUid, uid);
  lastTapMs = now;
  hasPreviousTap = true;

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
