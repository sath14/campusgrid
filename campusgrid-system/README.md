# CampusGrid SYSTEM

One package: student app + admin backend + Arduino/webcam integrity.

Extract to: `C:\Users\sath\Downloads\campusgrid-system`

1. `INSTALL.bat`
2. `START-ALL.bat`
3. Students → `http://LAN_IP:3000`
4. Admin → `http://LAN_IP:3000/admin` (`ADMIN` / `ADMIN123`)

Student data (profile, RFID, face, timetable, attendance, recorded distances) is stored **per user** in one place — open **More → My Data**.

Upload a timetable on **Assistant** or **My Data**; the AI tells you when to leave, where to go, distance, and average walk time. You can add recorded distances later.

### Phone APK + PC app

Thin clients that connect to this server:

- `clients/android` → build an **APK** (Android Studio)
- `clients/desktop` → build a **Windows .exe** (Electron)

Step-by-step: **PACKAGING.md**

See **HOW_TO_RUN.md**.
