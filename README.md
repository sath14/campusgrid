# CampusGrid

Smart campus platform — RFID attendance, live occupancy, AI assistant, navigation, and sustainability tracking. Built for KMKK / campus judging demo.

## Live demo

**Login:** `sath@campusgrid.edu` / `demo123`

## What's in this repo

| Folder | Description |
|---|---|
| `campusgrid app/` | Mobile HTML prototype (9 screens) |
| `backend/` | Node.js + Express + SQLite API |
| `api/` | Vercel serverless entry point |
| `campusgrid_presentation (3).html` | Pitch deck |
| `campusgrid_speeches.txt` | 5-speaker script |

## Run locally

**Requirements:** Node.js 22+

```bash
npm install
npm start
```

Open **http://localhost:3000**

## Deploy to Vercel

### 1. Push to GitHub

Install [Git](https://git-scm.com/download/win), then in this folder:

```bash
git init
git add .
git commit -m "Initial commit — CampusGrid prototype"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/campusgrid.git
git push -u origin main
```

Or create a repo at [github.com/new](https://github.com/new) and drag-drop upload the folder.

### 2. Connect Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Vercel auto-detects settings from `vercel.json`
4. Add environment variable:
   - `JWT_SECRET` = any long random string
5. Click **Deploy**

Your app will be live at `https://your-project.vercel.app`

### Vercel notes

- Frontend and API deploy together
- SQLite uses `/tmp` on Vercel (resets on cold starts — fine for demo)
- For persistent production data, use [Turso](https://turso.tech) or host the backend on Railway/Render

## Deploy frontend only (no API)

If you only need the static prototype without login/backend, set Vercel **Output Directory** to `campusgrid app`.

## Project structure

```
campusgrid/
├── campusgrid app/     ← HTML prototype
│   ├── index.html
│   ├── login.html
│   ├── attendance.html
│   └── assets/
├── backend/            ← Express API (local dev)
├── api/                ← Vercel serverless wrapper
├── vercel.json
└── package.json
```

## Demo account

| Field | Value |
|---|---|
| Email | sath@campusgrid.edu |
| Password | demo123 |

## License

Educational / competition use — KMKK CampusGrid project.
