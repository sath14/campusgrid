#pragma once

// Copy to config.h and edit (config.h is gitignored if you prefer secrets local)

#define WIFI_SSID       "YOUR_WIFI"
#define WIFI_PASSWORD   "YOUR_PASSWORD"

#define GATEWAY_HOST    "192.168.1.10"   // master laptop LAN IP
#define GATEWAY_PORT    3000
#define DEVICE_KEY      "campusgrid-edge-secret"

// Used until Admin registers this ESP32 IP
#define DOORWAY_FALLBACK  "ESP32-NEW"
#define PLACE_FALLBACK    "library"

// RC522 SPI pins — adjust for your ESP32-S3 board
#define RC522_SS   10
#define RC522_RST  9

// Set 0 to never attempt USB webcam (taps still work)
#define WEBCAM_ENABLED 1
