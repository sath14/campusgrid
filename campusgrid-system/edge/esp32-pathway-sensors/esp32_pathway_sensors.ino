/*
 * CampusGrid — pathway IR / ultrasonic sensors (any ESP32 / C3 / S3)
 *
 * Measures crossings + estimates walkway busy-ness / speed, then posts:
 *   POST /api/edge/pathway
 *
 * Wire TWO sensors a known distance apart for speed, OR one sensor for
 * crossing rate (people density proxy).
 *
 * Defaults use HC-SR04 ultrasonic; IR beam-break can set SENSOR_MODE to IR.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include "config.h"

unsigned long windowStart = 0;
int crossings = 0;
float lastSpeed = 0;
unsigned long tA = 0, tB = 0;
bool armedA = true, armedB = true;

float readUltrasonicCm(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long us = pulseIn(echo, HIGH, 30000UL);
  if (!us) return 999;
  return us / 58.0;
}

bool beamBrokenIR(int pin) {
  // ACTIVE_LOW beam-break modules: LOW = broken
  return digitalRead(pin) == LOW;
}

void postPathway(float speed, float perMin, const char* busy) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String("http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/api/edge/pathway");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  String body = "{";
  body += "\"walkway_slug\":\"" + String(WALKWAY_SLUG) + "\",";
  body += "\"name\":\"" + String(WALKWAY_NAME) + "\",";
  body += "\"speed_mps\":" + String(speed, 2) + ",";
  body += "\"crossings_per_min\":" + String(perMin, 1) + ",";
  body += "\"busy_level\":\"" + String(busy) + "\"";
  body += "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("pathway HTTP %d speed=%.2f xpm=%.1f %s\n", code, speed, perMin, busy);
}

void setup() {
  Serial.begin(115200);
#if SENSOR_MODE == 1
  pinMode(TRIG_A, OUTPUT);
  pinMode(ECHO_A, INPUT);
  pinMode(TRIG_B, OUTPUT);
  pinMode(ECHO_B, INPUT);
#else
  pinMode(IR_A, INPUT_PULLUP);
  pinMode(IR_B, INPUT_PULLUP);
#endif
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(400);
  Serial.println(WiFi.localIP());
  windowStart = millis();
}

void loop() {
  bool hitA = false, hitB = false;
#if SENSOR_MODE == 1
  hitA = readUltrasonicCm(TRIG_A, ECHO_A) < DETECT_CM;
  hitB = readUltrasonicCm(TRIG_B, ECHO_B) < DETECT_CM;
#else
  hitA = beamBrokenIR(IR_A);
  hitB = beamBrokenIR(IR_B);
#endif

  unsigned long now = millis();
  if (hitA && armedA) {
    tA = now;
    armedA = false;
    crossings++;
  }
  if (!hitA) armedA = true;

  if (hitB && armedB) {
    tB = now;
    armedB = false;
    if (tA && tB > tA) {
      float dt = (tB - tA) / 1000.0;
      if (dt > 0.05 && dt < 5.0) lastSpeed = SENSOR_GAP_M / dt;
    }
  }
  if (!hitB) armedB = true;

  if (now - windowStart >= 60000UL) {
    float perMin = crossings;
    const char* busy = "low";
    if (perMin >= 40) busy = "high";
    else if (perMin >= 20) busy = "medium";
    float speed = lastSpeed > 0.1 ? lastSpeed : (perMin >= 40 ? 0.55 : 1.15);
    postPathway(speed, perMin, busy);
    crossings = 0;
    windowStart = now;
  }
  delay(40);
}
