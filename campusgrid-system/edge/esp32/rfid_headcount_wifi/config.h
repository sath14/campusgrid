// Edit these before flashing ESP32. Safe defaults for LAN testing.
#pragma once

#define WIFI_SSID       "YOUR_ROUTER_SSID"
#define WIFI_PASSWORD   "YOUR_ROUTER_PASSWORD"

#define GATEWAY_HOST    "192.168.1.50"
#define GATEWAY_PORT    8080
#define DEVICE_KEY      "campusgrid-edge-secret"

#define DOORWAY         "DK12-door-ESP"
#define FACILITY_SLUG   "dk12"
#define MIN_TAP_INTERVAL_MS 200

#define RC522_SS   5
#define RC522_RST  22
