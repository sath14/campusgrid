# Package CampusGrid as APK + PC app

These clients **do not replace** the backend.  
Your **master laptop** still runs `START.bat` (SQLite + API).  
The phone APK and PC app only **connect** to that server on the same Wi‑Fi.

```
Phone / PC app ──► http://MASTER_LAN_IP:3000 ──► SQLite on master laptop
```

Folders created for you:

| Folder | What it is |
|--------|------------|
| `clients/android` | Capacitor shell → build an **APK** |
| `clients/desktop` | Electron shell → build a **Windows .exe** |

---

## Before anything

1. On the master laptop: `INSTALL.bat` then `START.bat`
2. Find the laptop LAN IP (PowerShell):

```powershell
ipconfig
```

Look for **IPv4 Address** under Wi‑Fi (example `192.168.1.5`).

3. On a phone/browser test first: `http://192.168.1.5:3000`

---

# A) Android APK (phone)

### What you need installed

1. **Node.js** (same as CampusGrid)
2. **Android Studio** — https://developer.android.com/studio  
   - During setup, install **Android SDK**, **SDK Platform**, **Android Virtual Device** (optional)
3. A phone with **USB debugging** on, or use an emulator

### Step 1 — Prepare the Capacitor project

```bat
cd /d C:\Users\sath\Downloads\campusgrid-system\clients\android
SETUP.bat
```

Or manually:

```bat
cd clients\android
npm install
npx cap add android
npx cap sync android
```

### Step 2 — Allow HTTP to the laptop (important)

Android blocks plain `http://` unless you allow cleartext.

1. Copy this file:

`clients\android\network_security_config.xml`

into:

`clients\android\android\app\src\main\res\xml\network_security_config.xml`

(Create the `xml` folder if missing.)

2. Open:

`clients\android\android\app\src\main\AndroidManifest.xml`

Inside the `<application ...>` tag, add:

```xml
android:usesCleartextTraffic="true"
android:networkSecurityConfig="@xml/network_security_config"
```

Also add internet permission if not already present (near top, before `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Step 3 — Open in Android Studio and build APK

```bat
cd clients\android
npx cap open android
```

In Android Studio:

1. Wait for Gradle sync to finish  
2. Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
3. When done, click **locate** — typical path:

`clients\android\android\app\build\outputs\apk\debug\app-debug.apk`

4. Copy that APK to the phone and install (enable “Install unknown apps” if asked)

### Step 4 — Use the app

1. Master laptop: `START.bat` running  
2. Phone on **same Wi‑Fi**  
3. Open CampusGrid APK → enter `http://YOUR_LAN_IP:3000` → **Open CampusGrid**  
4. Login / register as usual — data is saved on the **laptop backend**

### Optional: release (signed) APK

For sharing outside debug:

1. Android Studio → **Build → Generate Signed Bundle / APK**  
2. Create a keystore (save the passwords!)  
3. Build a **release** APK  

(Debug APK is fine for demos / class projects.)

---

# B) PC app (Windows .exe)

### Dev run (no installer yet)

```bat
cd /d C:\Users\sath\Downloads\campusgrid-system\clients\desktop
INSTALL-AND-RUN.bat
```

Enter `http://127.0.0.1:3000` if the server is on the same PC,  
or the master laptop’s LAN IP if this is another PC.

### Build installer (.exe)

```bat
cd clients\desktop
BUILD-EXE.bat
```

Output:

`clients\desktop\dist\CampusGrid-Setup-1.0.0.exe`

Install that on student PCs. They still need the **master laptop server** running (or run the server on that same PC).

---

## Important reminders

- **APK / EXE = thin clients.** They do not contain the SQLite database.
- User data is logged on the **master laptop** backend, same as the browser.
- Phone and laptop must be on the **same network**.
- Windows Firewall may ask to allow Node on first `START.bat` — allow it on private networks.

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| APK can’t open server | Wrong IP; not same Wi‑Fi; cleartext HTTP not enabled |
| Connection refused | `START.bat` not running on master |
| Login works on PC browser but not phone | Firewall blocking port **3000** |
| `npx cap add android` fails | Install Android Studio / SDK first |
| Electron build slow first time | Normal — downloads Electron binaries |

---

## File map

```
clients/
  android/
    www/index.html          ← server picker screen inside APK
    capacitor.config.json
    network_security_config.xml
    SETUP.bat
  desktop/
    main.js                 ← Electron window
    renderer/index.html     ← server picker
    INSTALL-AND-RUN.bat
    BUILD-EXE.bat
```
