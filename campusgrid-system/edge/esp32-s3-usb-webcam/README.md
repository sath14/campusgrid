# CampusGrid ESP32-S3 edge node

Plug-and-play doorway / place module.

## Role vs Arduino

| Device | Role |
|--------|------|
| **Arduino Mega** (USB on master laptop) | **Main head** — rapid-tap integrity + webcam agent |
| **ESP32-S3** (this sketch) | Extra nodes — RFID + optional USB webcam, added over time |

## Add a new ESP32

1. Flash `esp32_s3_edge.ino` with `config.h` (WiFi + master laptop IP).
2. Open Serial Monitor → copy the printed LAN IP.
3. On the server: **Admin → ESP32 devices → Add** name + IP + place slug.
4. Device calls `GET /api/edge/device-config?ip=...` and starts posting taps.

## Webcam missing

Firmware still posts RFID taps with `webcam_available: false`.  
No headcount / tap photo until a camera works — **attendance and class sessions still run**.

## Livecount vs facial

- **Cafeteria / library / counselling** livecount = RFID taps + headcount readings.
- **Facial recognition** is toggled in Admin and stored on the **server** from tap photos — not used for place livecount on the ESP32.
