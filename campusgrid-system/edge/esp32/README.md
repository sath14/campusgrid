# ESP32 RFID only (no camera)

For a **normal ESP32 without a camera**.

If you need tap photos / doorway images, buy **ESP32-CAM (OV2640)** and use `../esp32-cam/` instead.

## Setup

1. Copy `config.h.example` → `config.h`
2. Set Wi‑Fi + master laptop IP + RC522 pins
3. Flash, copy Serial IP → Admin → ESP32 devices

Taps post to `/api/edge/tap`. Works without any camera.
