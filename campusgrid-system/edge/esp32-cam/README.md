# CampusGrid — ESP32-CAM (normal ESP32 + camera)

Use this when you have a **regular ESP32 / ESP32-CAM**, not ESP32-S3.

## What camera to buy

| Use | Buy |
|-----|-----|
| **Recommended** | **ESP32-CAM (AI-Thinker) with OV2640** |
| Also OK | ESP32 + separate **OV2640** module |
| Avoid | USB webcam on normal ESP32 (needs ESP32-S3 USB Host) |

The OV2640 is on the board. Prefer the **ESP32-S3-CAM** folder if that is what you own:

→ `../esp32-s3-cam/`

## Role

| Board | Role |
|-------|------|
| Arduino Mega (laptop USB) | Main head / integrity |
| **ESP32-CAM** (this folder) | Doorway node: RFID + tap photo |
| ESP32 without cam | RFID only (`../esp32/rfid_headcount_wifi`) |
| ESP32-S3 + USB cam | Optional later (`../esp32-s3-usb-webcam`) |

## Setup

1. Arduino IDE → Board: **AI Thinker ESP32-CAM**
2. Install ESP32 board pack + **MFRC522** library
3. Copy `config.h.example` → `config.h` (Wi‑Fi + laptop IP)
4. Wire RC522 (3.3V) per pins in `config.h`
5. Flash (use FTDI / USB-TTL; hold IO0 to GND while flashing if needed)
6. Serial Monitor 115200 → copy **IP**
7. Master laptop Admin → **ESP32 devices** → Add that IP + place (e.g. `library`)

## Behaviour

- Card tap → JPEG photo (if camera works) → `POST /api/edge/tap`
- Camera missing/fail → tap still logged (`webcam_available: false`)
- Headcount mode → also posts a simple presence count for livecount places
- Facial records are stored on the **server** from tap photos (Admin vision toggle)

## Power tip

ESP32-CAM needs a solid 5V supply (many brown out on weak USB). Prefer a dedicated 5V adapter on the 5V pin.
