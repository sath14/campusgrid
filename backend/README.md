# CampusGrid Backend

Node.js + Express + SQLite API for accounts, RFID logging, attendance, and live campus data.

## Requirements

- Node.js 22 or later (uses built-in `node:sqlite` — no Python or build tools needed)

## Quick start

```bash
cd backend
npm install
npm start
```

Open **http://localhost:3000** in your browser.

## Demo login

| Email | Password |
|---|---|
| sath@campusgrid.edu | demo123 |

## What the backend provides

- **Accounts** — register, login (JWT), profile, RFID tag ID
- **RFID logging** — tap events, attendance records, occupancy counts
- **Real-time data** — facilities, walkway pace, grid headcount
- **AI assistant** — chat endpoint with live grid context
- **Sustainability** — stats, weekly leaderboard, walking history
- **Activity logs** — all user actions stored in SQLite
- **Preferences** — toggles persisted (accessibility, notifications, leaderboard visibility)

## Database

SQLite file: `backend/campusgrid.db` (created automatically on first run)

## API overview

| Endpoint | Description |
|---|---|
| `POST /api/auth/login` | Sign in |
| `POST /api/auth/register` | Create account |
| `GET /api/home` | Home screen data |
| `GET /api/directory?q=&type=` | Search directory |
| `GET /api/routes?to=&mode=` | Navigation route |
| `POST /api/navigation/start` | Start navigation session |
| `GET /api/facilities` | Live facility occupancy |
| `GET /api/walkways` | Walkway pace data |
| `GET /api/attendance/me` | Your attendance today |
| `POST /api/rfid/tap` | Simulate RFID tap |
| `POST /api/assistant/chat` | AI assistant |
| `GET /api/sustainability` | Stats + leaderboard |
| `PATCH /api/users/me/preferences` | Save toggles |
| `GET /api/logs` | Your activity log |

## Running for judging

1. Start the server: `npm start`
2. Open http://localhost:3000
3. Sign in with demo account
4. All app pages load live data from the API

The HTML prototype is served from `campusgrid app/` automatically — no separate static server needed.
