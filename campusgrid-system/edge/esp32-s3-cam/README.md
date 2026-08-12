# CampusGrid — ESP32-S3-CAM (your board)

This folder is for **ESP32-S3-CAM** with built-in **OV2640**, not the old ESP32-CAM (ESP32 classic) module.

| Board | Folder |
|-------|--------|
| **ESP32-S3-CAM** (you) | `edge/esp32-s3-cam/` ← use this |
| Classic ESP32-CAM AI-Thinker | `edge/esp32-cam/` |
| ESP32-S3 + USB webcam | `edge/esp32-s3-usb-webcam/` |

## Arduino IDE

- Board: **ESP32S3 Dev Module**
- PSRAM: **OPI PSRAM** (if your module has PSRAM)
- USB CDC on Boot: as needed for Serial

## Camera pins

Default `config.h` uses a common AliExpress **ESP32-S3-CAM N16R8** pin map.  
If `Camera init failed`, change `CAM_*` pins for your exact PCB (XIAO Sense uses different GPIOs).

## Setup

1. Copy `config.h.example` → `config.h`
2. Wire RC522 on free GPIOs (3.3V)
3. Flash → Serial → copy IP → Admin → Devices

Taps work even if the camera fails to init.
