# CampusGrid SYSTEM

One package: **student app + admin + lecturer portal + Arduino main head + ESP32-S3 plug-and-play nodes + Android APK + desktop client**.

Extract anywhere, e.g.:

`C:\Users\User\Downloads\campusgrid\campusgrid-system`

---

## Quick start (master laptop)

1. Install **Node.js 22+**
2. Double-click `INSTALL.bat` (runs `npm install`)
3. Double-click `START.bat` or `START-ALL.bat`
4. Open:
   - Students → `http://LAN_IP:3000`
   - Admin → `http://LAN_IP:3000/admin` — **ADMIN / ADMIN123**
   - Lecturer → `http://LAN_IP:3000/lecturer` — **LECT01 / LECT123**
5. Optional integrity agent: `START-AGENT.bat` (Arduino Mega USB + webcam on the master laptop)

Demo student: **A22DEMO001 / A22DEMO001**

---

## How the hardware fits together

| Piece | Role |
|-------|------|
| **Arduino Mega** (USB on master laptop) | **Main head** — RFID + rapid-tap integrity (+ laptop webcam via Python agent) |
| **ESP32-S3-CAM (OV2640)** | Doorway nodes with built-in camera + RFID → `edge/esp32-s3-cam/` |
| **ESP32-C3 SuperMini + LCD** | Simple doors: Welcome + `MK-…` → `edge/esp32-c3-rfid-lcd/` |
| **IR / ultrasonic** | Pathway busy / speed → `edge/esp32-pathway-sensors/` |
| Classic ESP32-CAM AI-Thinker | Only if you have that old module → `edge/esp32-cam/` |
| **Master laptop** | Node server, SQLite, admin, photo storage |

Full list: **SYSTEM_INVENTORY.md**

---

## Livecount vs facial recognition

- **Cafeteria, library, counselling** (and other admin-added *common* places):  
  **live count = RFID taps + headcount**. Facial recognition is **not** used for this count on the ESP32.
- **Admin → Vision toggle**: switch global mode between **headcount** and **facial recognition records**.
- Facial mode archives tap photos into face records on the **server** for recognition history.
- Cameras take a picture when a card is read → stored under `data/tap_photos/`.

---

## Classes (lecture / tutorial / lab)

1. Admin adds timetable rows (**Admin → Class timetable**): place, type, day, start time, lecturer.
2. Durations: **lecture & tutorial = 60 minutes**, **lab = 120 minutes**.
3. After the scheduled start, the **first RFID tap** opens a **class session** and attendance is recorded against that class.
4. Lecturers open `/lecturer` to see attendance with the **correct tap photo** (and profile face when available).

---

## Admin console tabs

| Tab | Purpose |
|-----|---------|
| Live view | Places, active sessions, recent taps/photos |
| ESP32 devices | Add/remove nodes by IP |
| Places | Add cafeteria/library/counselling/classrooms |
| Class timetable | Schedule lectures/tutorials/labs |
| Vision toggle | Headcount ↔ facial records |
| Integrity | Arduino rapid-tap flags + incident photos |
| Tap photos | All card-read photos |
| Login log | Who signed in |
| Users / faces | Accounts + facial archive; create lecturers |

---

## Student app extras

- **More → Campus places** — live occupancy for livecount spaces  
- **More → Notices** — RFID / class / campus tips  
- Existing: attendance, navigation, directory, assistant, My Data, sustainability, accessibility  

---

## Android APK

Path: `clients/android`

Requires **JDK 25** + Android SDK (see `clients/android/README.md`).

```bat
cd clients\android
SETUP.bat
```

Or CLI:

```bash
export JAVA_HOME=/path/to/jdk-25
export ANDROID_HOME=/path/to/Android/Sdk
./BUILD-APK.sh
```

APK output:

`clients/android/android/app/build/outputs/apk/debug/app-debug.apk`

Phone must be on the same Wi‑Fi as the master laptop. Enter `http://LAN_IP:3000` in the shell.

---

## Desktop (Windows) app

Path: `clients/desktop`

```bat
cd clients\desktop
INSTALL-AND-RUN.bat
```

Build installer:

```bat
BUILD-EXE.bat
```

Output: `clients/desktop/dist/CampusGrid-Setup-1.0.0.exe`

Same idea as the APK — thin client that opens the server URL.

Full packaging notes: **PACKAGING.md**

---

## Folders

```
campusgrid-system/
├── server/                 Node API + SQLite
├── app/                    Student web UI
├── admin/                  Admin console
├── lecturer/               Lecturer attendance portal
├── data/                   DB, faces/, tap_photos/, incidents/
├── edge/
│   ├── arduino/            Main head (Mega)
│   ├── agent/              USB RFID + webcam Python agent
│   ├── esp32/              RFID-only WiFi ESP32
│   ├── esp32-cam/          ESP32-CAM + OV2640 (normal ESP32 + camera)
│   └── esp32-s3-usb-webcam/  ESP32-S3 + optional USB webcam
├── clients/
│   ├── android/            Capacitor APK (JDK 25)
│   └── desktop/            Electron .exe
├── INSTALL.bat / START.bat / START-ALL.bat / START-AGENT.bat
└── README.md               ← this file
```

---

## Edge API (for firmware / agent)

- `POST /api/edge/tap` — RFID tap (optional `photo_jpeg_base64`, `webcam_available`)
- `POST /api/edge/headcount-place` — headcount for a place slug
- `POST /api/edge/integrity` — Arduino rapid-tap verdict + photo
- `GET /api/edge/device-config?ip=` — ESP32 pulls admin registration  
Header: `X-Device-Key: campusgrid-edge-secret` (or env `EDGE_KEY`)

---

## Package this folder as a zip

From the parent of `campusgrid-system`:

```bat
PACKAGE-ZIP.bat
```

Or:

```bash
./PACKAGE-ZIP.sh
```

Creates `campusgrid-system.zip` ready to copy to another PC.
