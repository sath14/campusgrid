# How to run CampusGrid SYSTEM

## Master laptop

1. `INSTALL.bat`
2. `START.bat` (or `START-ALL.bat`)
3. Note your LAN IP (`ipconfig`)

| Portal | URL | Login |
|--------|-----|-------|
| Students | `http://LAN_IP:3000` | Matrix ID / Matrix ID |
| Admin | `http://LAN_IP:3000/admin` | ADMIN / ADMIN123 |
| Lecturer | `http://LAN_IP:3000/lecturer` | LECT01 / LECT123 |

Demo student: `A22DEMO001` / `A22DEMO001`

## Arduino main head

Keep using `edge/arduino/rfid_edge_mega` + `START-AGENT.bat` on the master laptop.

## Add an ESP32-S3 later

1. Flash `edge/esp32-s3-usb-webcam`
2. Admin → **ESP32 devices** → enter its IP
3. Webcam optional — taps work without it

## Phone APK / PC app

See `README.md` and `PACKAGING.md` (`clients/android`, `clients/desktop`).
