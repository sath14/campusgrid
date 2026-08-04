const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const fs = require('fs');
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'faces'), { recursive: true });

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'campusgrid.db')
  : path.join(DATA_DIR, 'campusgrid.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      rfid_tag TEXT UNIQUE,
      matrix_id TEXT UNIQUE,
      face_file TEXT,
      role TEXT DEFAULT 'student',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      avoid_stairs INTEGER DEFAULT 1,
      shaded_paths INTEGER DEFAULT 0,
      voice_guidance INTEGER DEFAULT 0,
      green_routes INTEGER DEFAULT 1,
      show_name_leaderboard INTEGER DEFAULT 1,
      notifications_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS directory_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      subtitle TEXT,
      type TEXT NOT NULL,
      capacity INTEGER,
      building TEXT,
      floor TEXT,
      popular INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      subtitle TEXT,
      type TEXT NOT NULL,
      capacity INTEGER,
      current_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'free',
      session_info TEXT
    );

    CREATE TABLE IF NOT EXISTS walkways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pace REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      location_slug TEXT,
      status TEXT DEFAULT 'upcoming'
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      facility_slug TEXT NOT NULL,
      class_name TEXT,
      status TEXT DEFAULT 'present',
      tapped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integrity_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doorway TEXT NOT NULL,
      rfid_count INTEGER NOT NULL,
      camera_count INTEGER NOT NULL,
      description TEXT,
      flagged_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timetables (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT,
      class_count INTEGER DEFAULT 0,
      location_count INTEGER DEFAULT 0,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      location_slug TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      day_of_week INTEGER
    );

    CREATE TABLE IF NOT EXISTS sustainability_stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      walkability_score INTEGER DEFAULT 0,
      co2_kg REAL DEFAULT 0,
      distance_km REAL DEFAULT 0,
      weekly_steps INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      display_name TEXT NOT NULL,
      steps INTEGER NOT NULL,
      is_anonymous INTEGER DEFAULT 0,
      rank_num INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walking_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_label TEXT NOT NULL,
      distance_km REAL NOT NULL,
      day_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS distance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      distance_km REAL NOT NULL,
      from_label TEXT,
      to_label TEXT,
      note TEXT,
      recorded_at TEXT NOT NULL,
      source TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS accessible_entrances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      subtitle TEXT,
      status TEXT DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS navigation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      from_loc TEXT,
      to_slug TEXT NOT NULL,
      mode TEXT DEFAULT 'standard',
      started_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rfid_taps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfid_tag TEXT NOT NULL,
      doorway TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      tapped_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grid_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      headcount INTEGER DEFAULT 847,
      active_doorways INTEGER DEFAULT 38,
      last_sync TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS edge_taps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfid_tag TEXT NOT NULL,
      doorway TEXT NOT NULL,
      facility_slug TEXT,
      source TEXT,
      interval_ms INTEGER,
      flagged INTEGER DEFAULT 0,
      tapped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rapid_tap_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doorway TEXT NOT NULL,
      uids TEXT NOT NULL,
      interval_ms INTEGER NOT NULL,
      source TEXT,
      flagged_at TEXT NOT NULL,
      tap_count INTEGER,
      headcount INTEGER,
      photo_file TEXT,
      verdict TEXT DEFAULT 'flagged'
    );

    CREATE TABLE IF NOT EXISTS doorway_headcounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doorway TEXT NOT NULL,
      facility_slug TEXT,
      people_count INTEGER NOT NULL,
      source TEXT,
      captured_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doorway TEXT NOT NULL,
      facility_slug TEXT,
      uids TEXT NOT NULL,
      tap_count INTEGER NOT NULL,
      headcount INTEGER NOT NULL,
      interval_ms INTEGER,
      photo_file TEXT,
      verdict TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'open',
      source TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      admin_note TEXT
    );
  `);

  // Safe migrations for older DBs
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('matrix_id')) {
    db.exec('ALTER TABLE users ADD COLUMN matrix_id TEXT');
  }
  if (!cols.includes('face_file')) {
    db.exec('ALTER TABLE users ADD COLUMN face_file TEXT');
  }
  if (!cols.includes('role')) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'`);
  }

  // Extra columns on rapid_tap_flags if missing
  const flagCols = db.prepare('PRAGMA table_info(rapid_tap_flags)').all().map((c) => c.name);
  if (flagCols.length && !flagCols.includes('tap_count')) {
    try { db.exec('ALTER TABLE rapid_tap_flags ADD COLUMN tap_count INTEGER'); } catch (_) {}
  }
  if (flagCols.length && !flagCols.includes('headcount')) {
    try { db.exec('ALTER TABLE rapid_tap_flags ADD COLUMN headcount INTEGER'); } catch (_) {}
  }
  if (flagCols.length && !flagCols.includes('photo_file')) {
    try { db.exec('ALTER TABLE rapid_tap_flags ADD COLUMN photo_file TEXT'); } catch (_) {}
  }
  if (flagCols.length && !flagCols.includes('verdict')) {
    try { db.exec(`ALTER TABLE rapid_tap_flags ADD COLUMN verdict TEXT DEFAULT 'flagged'`); } catch (_) {}
  }
}

function seedDb() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const hash = bcrypt.hashSync('A22DEMO001', 10);
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, name, rfid_tag, matrix_id, face_file, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertUser.run(
    'a22demo001@campusgrid.student',
    hash,
    'SATH KUMAR',
    'C3ABA12C',
    'A22DEMO001',
    null,
    'student'
  );
  const hash2 = bcrypt.hashSync('A22DEMO002', 10);
  insertUser.run(
    'a22demo002@campusgrid.student',
    hash2,
    'DEMO USER',
    'BD28FB03',
    'A22DEMO002',
    null,
    'student'
  );

  // Server admin account (admin console)
  const adminHash = bcrypt.hashSync('ADMIN123', 10);
  insertUser.run(
    'admin@campusgrid.local',
    adminHash,
    'SERVER ADMIN',
    null,
    'ADMIN',
    null,
    'admin'
  );

  const sathId = 1;
  db.prepare(
    `INSERT INTO user_preferences (user_id) VALUES (?)`
  ).run(sathId);
  db.prepare(`INSERT INTO user_preferences (user_id) VALUES (2)`).run();

  db.prepare(`INSERT INTO grid_stats (id, headcount, active_doorways) VALUES (1, 847, 38)`).run();

  const facilities = [
    ['dk12', 'DK12 — Lecture Hall', 'Thermodynamics II · ends 3:20pm', 'lecture', 180, 142, 'busy', 'Thermodynamics II'],
    ['fluid-lab', 'Fluid Mechanics Lab', 'Block D · no session booked', 'lab', 24, 18, 'moderate', null],
    ['library-l2', 'Main Library, Level 2', 'Quiet zone · 38% occupied', 'library', 200, 76, 'free', 'Quiet zone'],
    ['dewan-utama', 'Dewan Utama', 'Leadership talk · ends in 12 min', 'hall', 800, 620, 'busy', 'Leadership talk'],
    ['tutorial-t3', 'Tutorial Room T3', 'Calculus II · 28 / 30 seats', 'tutorial', 30, 28, 'full', 'Calculus II']
  ];
  const insFac = db.prepare(
    `INSERT INTO facilities (slug, name, subtitle, type, capacity, current_count, status, session_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  facilities.forEach(f => insFac.run(...f));

  const walkways = [
    ['block-a-c', 'Block A → Block C', 0.6, 'slow'],
    ['walkway-library', 'Main Walkway → Library', 1.1, 'normal'],
    ['residential-lecture', 'Residential → Lecture Block', 1.4, 'clear']
  ];
  const insWalk = db.prepare('INSERT INTO walkways (slug, name, pace, status) VALUES (?, ?, ?, ?)');
  walkways.forEach(w => insWalk.run(...w));

  db.prepare(`INSERT INTO events (title, subtitle, location_slug, status) VALUES (?, ?, ?, ?)`)
    .run('JPP Town Hall', '6:00pm · Dewan Utama', 'dewan-utama', 'today');

  const directory = [
    ['dk12', 'DK12 — Lecture Hall', 'Block C, Level 1 · Capacity 180', 'rooms', 180, 'Block C', 'Level 1', 1],
    ['fluid-lab', 'Fluid Mechanics Lab', 'Block D, Level 2 · Eng. Dept', 'labs', 24, 'Block D', 'Level 2', 1],
    ['puan-aina', 'Puan Aina Rahman', 'Physics Unit · Office B-204', 'staff', null, 'Block B', 'Level 2', 1],
    ['student-affairs', 'Student Affairs Office', 'Admin Block, Ground Floor', 'services', null, 'Admin Block', 'Ground', 1],
    ['library', 'Main Library', 'Central Block · 3 levels', 'rooms', null, 'Central Block', 'All', 1],
    ['dewan-utama', 'Dewan Utama', 'Main Hall · Capacity 800', 'rooms', 800, 'Main Hall', 'Ground', 1],
    ['tutorial-t3', 'Tutorial Room T3', 'Block B, Level 1 · Capacity 30', 'rooms', 30, 'Block B', 'Level 1', 0],
    ['b204', 'Office B-204', 'Physics Unit · Puan Aina Rahman', 'rooms', null, 'Block B', 'Level 2', 0]
  ];
  const insDir = db.prepare(
    `INSERT INTO directory_entries (slug, name, subtitle, type, capacity, building, floor, popular) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  directory.forEach(d => insDir.run(...d));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const taps = [
    [sathId, 'dk12', 'Thermodynamics II', 'present', `${today} 06:14:00`],
    [sathId, 'tutorial-t3', 'Calculus II', 'present', `${today} 08:30:00`],
    [sathId, 'fluid-lab', 'Lab Session', 'present', `${today} 10:00:00`],
    [sathId, 'dk12', 'Thermodynamics II', 'present', `${today} 14:14:00`]
  ];
  const insAtt = db.prepare(
    `INSERT INTO attendance_records (user_id, facility_slug, class_name, status, tapped_at) VALUES (?, ?, ?, ?, ?)`
  );
  taps.forEach(t => insAtt.run(...t));

  db.prepare(
    `INSERT INTO integrity_alerts (doorway, rfid_count, camera_count, description, flagged_at) VALUES (?, ?, ?, ?, ?)`
  ).run('DK12-B', 2, 1, '2 RFID reads · 1 body on camera — flagged for admin review', `${today} 14:08:00`);

  db.prepare(
    `INSERT INTO timetables (user_id, filename, class_count, location_count, synced_at) VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(sathId, 'thermo_w2026.ics', 6, 4);

  const classes = [
    [sathId, 'Thermodynamics II', 'dk12', '15:00', '16:20', 4],
    [sathId, 'Calculus II', 'tutorial-t3', '09:00', '10:30', 4],
    [sathId, 'Fluid Mechanics Lab', 'fluid-lab', '11:00', '13:00', 4],
    [sathId, 'Engineering Ethics', 'dk12', '08:00', '09:30', 2],
    [sathId, 'Physics Tutorial', 'tutorial-t3', '14:00', '15:00', 3],
    [sathId, 'Study Block', 'library-l2', '17:00', '19:00', 4]
  ];
  const insClass = db.prepare(
    `INSERT INTO classes (user_id, name, location_slug, start_time, end_time, day_of_week) VALUES (?, ?, ?, ?, ?, ?)`
  );
  classes.forEach(c => insClass.run(...c));

  db.prepare(
    `INSERT INTO sustainability_stats (user_id, walkability_score, co2_kg, distance_km, weekly_steps) VALUES (?, ?, ?, ?, ?)`
  ).run(sathId, 82, 4, 6.2, 12640);
  db.prepare(
    `INSERT INTO sustainability_stats (user_id, walkability_score, co2_kg, distance_km, weekly_steps) VALUES (?, ?, ?, ?, ?)`
  ).run(2, 71, 2.5, 4.1, 8800);

  const leaders = [
    [null, 'Student #2847', 14820, 1, 1],
    [sathId, 'Sath', 12640, 0, 2],
    [null, 'Student #1093', 11205, 1, 3],
    [null, 'Anonymous', 9870, 1, 4]
  ];
  const insLead = db.prepare(
    `INSERT INTO leaderboard (user_id, display_name, steps, is_anonymous, rank_num) VALUES (?, ?, ?, ?, ?)`
  );
  leaders.forEach(l => insLead.run(...l));

  const history = [
    [sathId, 'Mon', 1.1, 1], [sathId, 'Tue', 1.8, 2], [sathId, 'Wed', 0.8, 3],
    [sathId, 'Thu', 2.2, 4], [sathId, 'Fri', 1.5, 5], [sathId, 'Sat', 0.5, 6], [sathId, 'Sun', 0.4, 7]
  ];
  const insHist = db.prepare(
    `INSERT INTO walking_history (user_id, day_label, distance_km, day_order) VALUES (?, ?, ?, ?)`
  );
  history.forEach(h => insHist.run(...h));

  const entrances = [
    ['block-a-east', 'Block A — East Ramp', 'Level access, automatic doors', 'open'],
    ['library-lift', 'Library — Lift Lobby', 'Serves all 3 levels', 'open']
  ];
  const insEnt = db.prepare(
    `INSERT INTO accessible_entrances (slug, name, subtitle, status) VALUES (?, ?, ?, ?)`
  );
  entrances.forEach(e => insEnt.run(...e));

  db.prepare(`INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)`)
    .run(sathId, 'login', 'Initial seed login');
}

module.exports = { db, initDb, seedDb, DB_PATH };
