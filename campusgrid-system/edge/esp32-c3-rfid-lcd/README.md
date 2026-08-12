# ESP32-C3 SuperMini — RFID + LCD doorway

Lightweight replacement for a full ESP32-S3 at doors that only need:

```
NAME / Welcome
MK-A22XXXXXX
```

## Hardware

- ESP32-C3 SuperMini
- RC522 (3.3V)
- 16×2 LCD with I2C backpack (`0x27` or `0x3F`)

## Libraries

- MFRC522
- LiquidCrystal_I2C

## Setup

1. Edit `config.h` (Wi‑Fi + laptop IP)
2. Flash (Board: ESP32C3 Dev Module)
3. Serial → copy IP → **Admin → Devices** (optional but recommended)
4. Student must be registered with that RFID + Matrix ID for `MK-...` to show

Unknown cards show `MK----------`.

No camera on this node — that is fine. Use ESP32-S3-CAM only where you want tap photos.
