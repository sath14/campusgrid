# CampusGrid SYSTEM — How to run

**Extract to:** `C:\Users\sath\Downloads\campusgrid-system`

One backend for **students** + **server admin**.  
Arduino taps are **not** live-connected to the student frontend.

---

## Integrity rule (rapid taps)

When **2+ card taps** happen with gaps **&lt; 200 ms**:

1. Webcam takes a **headcount** (and a photo if flagged)
2. If **heads ≥ taps** → **OK** (even if more people than taps — ignore)
3. If **heads &lt; taps** → **FLAG** + photo sent to **Admin**

Example: 2 taps in &lt;200ms, camera sees 1 person → FLAG + snapshot for admin.

---

## Install once

```bat
cd /d C:\Users\sath\Downloads\campusgrid-system
INSTALL.bat
```

---

## Run

```bat
START-ALL.bat
```

Or:

1. `START.bat` — website + admin API  
2. `START-AGENT.bat` — Arduino USB + webcam  

Upload Mega sketch first: `edge\arduino\rfid_edge_mega\rfid_edge_mega.ino`  
Close Serial Monitor before the agent.

---

## URLs

| Who | URL |
|-----|-----|
| Students (phones/PC) | `http://YOUR_LAN_IP:3000` |
| Server admin | `http://YOUR_LAN_IP:3000/admin` |

Admin login:

- Matrix: **`ADMIN`**
- Password: **`ADMIN123`**

Student demo:

- Matrix: **`A22DEMO001`**
- Password: **`A22DEMO001`**

---

## Student registration

In the student app → Register:

1. NAME in **CAPITAL LETTERS**
2. Matrix ID (= password)
3. RFID UID from card tap
4. Face photo of that person

Student screens do **not** show live Arduino tap streams. Attendance may still update quietly when a registered RFID is used.

---

## Timetable + AI leave guidance

1. Log in as a student
2. Open **Assistant** or **More → My Data**
3. Upload a CSV/ICS timetable (sample: `data\sample_timetable.csv`)

CSV columns:

```text
name,location,start_time,end_time,day
Thermodynamics II,DK12,15:00,16:00,Mon
```

Ask the assistant things like:

- “When should I leave for my next class?”
- “How far is my next class?”

It answers with **where**, **leave-by time**, **distance (m)**, and **average walk minutes** using your saved timetable + live walkway pace.

---

## Recorded distances (add later)

On **My Data**, enter a distance (km), optional from/to/note, and save.  
All distance logs stay under that user’s account and update sustainability totals.

---

## One place for each user

Everything for one login is stored together in SQLite under that `user_id`:

- Profile / Matrix ID / RFID / face photo
- Timetable + classes
- Attendance
- Recorded distances
- Activity log

Open **More → My Data** to see it all.

---

## Admin console

At `/admin` you see:

- Open integrity flags
- Tap count vs headcount
- Captured doorway photos
- Admin-only tap log
- Review / dismiss actions
