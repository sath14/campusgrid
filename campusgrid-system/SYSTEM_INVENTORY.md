# CampusGrid — full inventory

What exists in `campusgrid-system` after the hub + hardware expansions.

---

## 1. Core software (master laptop)

| Part | Path | Purpose |
|------|------|---------|
| Node API + SQLite | `server/server.js`, `server/db.js`, `server/hub.js` | Auth, timetable AI, attendance, edge ingest, admin/lecturer APIs |
| Student web app | `app/` | Login, home, navigation, directory, assistant, My Data, places, notices, … |
| Admin console | `admin/` | Devices, places, timetable, vision toggle, live view, photos, login log, integrity |
| Lecturer portal | `lecturer/` | Class sessions + student tap photos |
| Data | `data/` | `campusgrid.db`, `faces/`, `tap_photos/`, `incidents/` |
| Run scripts | `INSTALL.bat`, `START.bat`, `START-ALL.bat`, `START-AGENT.bat`, `PACKAGE-ZIP.*` | Install / run / zip |
| Docs | `README.md`, `HOW_TO_RUN.md`, `PACKAGING.md` | Setup |

**Logins**

- Admin: `ADMIN` / `ADMIN123` → `/admin`
- Lecturer: `LECT01` / `LECT123` → `/lecturer`
- Demo student: `A22DEMO001` / `A22DEMO001`

---

## 2. What changed (recent hub work)

- Arduino Mega stays **main head**
- Admin can **add ESP32 by IP** (plug-and-play)
- Places livecount = **taps + headcount** (not facial)
- Vision toggle: headcount ↔ facial **records**
- Class timetable + sessions (lecture/tutorial **60 min**, lab **120 min**)
- Tap photos stored; login log; live view
- Lecturer attendance with photos
- Student **Campus places** + **Notices**
- APK (JDK 25) + desktop Electron clients under `clients/`
- Edge APIs: tap returns `display_line` / `matrix_line` for LCDs
- Pathway API for IR/ultrasonic → walkway congestion
- Card lookup API for doorway LCDs

---

## 3. Hardware firmware folders

| Folder | Board | Does |
|--------|-------|------|
| `edge/arduino/rfid_edge_mega/` | **Arduino Mega** | Main head RFID + LCD integrity path |
| `edge/agent/` | PC Python | USB serial + laptop webcam agent |
| `edge/esp32-s3-cam/` | **ESP32-S3-CAM (OV2640)** | Your camera board — RFID + tap photo |
| `edge/esp32-cam/` | Classic ESP32-CAM AI-Thinker | Older module (not S3) |
| `edge/esp32-s3-usb-webcam/` | ESP32-S3 + USB cam | Optional USB webcam path |
| `edge/esp32/` | Normal ESP32 | RFID only |
| `edge/esp32-c3-rfid-lcd/` | **ESP32-C3 SuperMini** | RFID + LCD Welcome / `MK-…` |
| `edge/esp32-pathway-sensors/` | Any ESP | IR / ultrasonic → walkway busy/speed |
| `edge/esp32/rfid_headcount_wifi/` | ESP32 | Older WiFi RFID sketch |

---

## 4. Clients

| Client | Path | Notes |
|--------|------|-------|
| Android APK | `clients/android/` | Capacitor, JDK 25, connect to laptop IP |
| Desktop EXE | `clients/desktop/` | Electron thin client |

---

## 5. Recommended roles for your boards

| Your gear | Use as |
|-----------|--------|
| Arduino Mega | Main head (keep) |
| **ESP32-S3-CAM** | Photo doorways / livecount places |
| **ESP32-C3 SuperMini + LCD** | Simple “Welcome + MK-…” doors (replaces needing S3 everywhere) |
| IR / ultrasonic pair | Walkway congestion → AI leave-time |
