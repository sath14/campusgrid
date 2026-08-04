const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, initDb, seedDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'campusgrid-dev-secret-change-in-production';
const EDGE_KEY = process.env.EDGE_KEY || 'campusgrid-edge-secret';
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const APP_DIR = path.join(__dirname, '..', 'app');
const DATA_DIR = path.join(__dirname, '..', 'data');
const FACES_DIR = path.join(DATA_DIR, 'faces');

initDb();
seedDb();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/faces', express.static(FACES_DIR));

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    require('fs').mkdirSync(FACES_DIR, { recursive: true });
    cb(null, FACES_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safe);
  }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadFace = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Photo must be an image'));
    }
    cb(null, true);
  }
});

function logActivity(userId, action, details) {
  db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    userId || null, action, details || null
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function edgeAuth(req, res, next) {
  const key = req.headers['x-edge-key'] || req.headers['x-device-key'];
  if (key !== EDGE_KEY) {
    return res.status(401).json({ error: 'Invalid edge key' });
  }
  next();
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    const user = getUser(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    req.admin = user;
    next();
  });
}

function ensureAdminAccount() {
  const existing = db.prepare(`SELECT id FROM users WHERE role = 'admin' OR upper(matrix_id) = 'ADMIN'`).get();
  if (existing) return;
  const adminHash = bcrypt.hashSync('ADMIN123', 10);
  try {
    db.prepare(
      `INSERT INTO users (email, password_hash, name, rfid_tag, matrix_id, face_file, role)
       VALUES (?, ?, ?, ?, ?, ?, 'admin')`
    ).run('admin@campusgrid.local', adminHash, 'SERVER ADMIN', null, 'ADMIN', null);
    console.log('Created admin account: Matrix ADMIN / password ADMIN123');
  } catch (_) {
    /* ignore */
  }
}

ensureAdminAccount();

function getUser(id) {
  return db.prepare(
    'SELECT id, email, name, rfid_tag, matrix_id, face_file, role, created_at FROM users WHERE id = ?'
  ).get(id);
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizeMatrix(matrixId) {
  return String(matrixId || '').trim().toUpperCase();
}

function normalizeRfid(uid) {
  return String(uid || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '');
}

function getPrefs(userId) {
  return db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
}

function prefsToObj(row) {
  if (!row) return {};
  return {
    avoid_stairs: !!row.avoid_stairs,
    shaded_paths: !!row.shaded_paths,
    voice_guidance: !!row.voice_guidance,
    green_routes: !!row.green_routes,
    show_name_leaderboard: !!row.show_name_leaderboard,
    notifications_enabled: !!row.notifications_enabled
  };
}

function facilityPct(f) {
  if (!f.capacity) return 0;
  return Math.round((f.current_count / f.capacity) * 100);
}

function facilityTag(f) {
  const pct = facilityPct(f);
  if (f.status === 'full' || pct >= 90) return 'busy';
  if (f.status === 'busy' || pct >= 70) return 'busy';
  if (f.status === 'moderate' || pct >= 50) return 'warn';
  return 'free';
}

function buildRoute(toSlug, mode = 'standard') {
  const dest = db.prepare('SELECT * FROM directory_entries WHERE slug = ?').get(toSlug)
    || db.prepare('SELECT slug, name, subtitle, type, capacity, building, floor FROM facilities WHERE slug = ?').get(toSlug);
  if (!dest) return null;

  const accessible = mode === 'accessible';
  const minutes = accessible ? 9 : 6;
  const distance = accessible ? 520 : 480;
  const steps = accessible
    ? [
        { num: 1, title: 'Ramp exit — Block A, East', sub: 'Step-free from ground level' },
        { num: 2, title: 'Lift to Level 1, covered walkway', sub: 'Avoids the Block C stairwell' },
        { num: '✓', title: `Arrive at ${dest.name}`, sub: `${dest.subtitle || dest.building || ''} · adds ~3 min` }
      ]
    : [
        { num: 1, title: 'Exit KMKK Block A, head east', sub: 'Past the courtyard, 90m' },
        { num: 2, title: 'Turn left at the covered walkway', sub: 'Continue toward Block C, 260m' },
        { num: 3, title: accessible ? 'Take the lift to Level 1' : 'Take the stairs to Level 1', sub: `${dest.name.split('—')[0].trim()} is ahead` },
        { num: '✓', title: `Arrive at ${dest.name}`, sub: dest.subtitle || '' }
      ];

  const blockC = db.prepare("SELECT * FROM walkways WHERE slug = 'block-a-c'").get();
  const congested = blockC && blockC.pace < 0.8;
  const adjustedMinutes = congested ? minutes + 4 : minutes;

  return {
    destination: dest,
    mode,
    walking_minutes: adjustedMinutes,
    distance_m: distance,
    congested,
    pace_note: congested ? `Block C walkway slow (${blockC.pace} m/s)` : null,
    steps,
    path: 'M40,180 L120,180 L120,110 L230,110 L230,50 L300,50'
  };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function slugifyLocation(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return 'dk12';
  const map = {
    dk12: 'dk12', 'dk 12': 'dk12', 'lecture hall dk12': 'dk12',
    library: 'library-l2', 'library l2': 'library-l2', 'main library': 'library-l2',
    'dewan utama': 'dewan-utama', dewan: 'dewan-utama',
    'fluid lab': 'fluid-lab', 'fluid mechanics': 'fluid-lab',
    cafeteria: 'cafeteria', cafe: 'cafeteria'
  };
  if (map[t]) return map[t];
  const hit = db.prepare(
    'SELECT slug FROM directory_entries WHERE lower(name) = ? OR lower(slug) = ? LIMIT 1'
  ).get(t, t.replace(/\s+/g, '-'));
  if (hit) return hit.slug;
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dk12';
}

function parseTimeToMinutes(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatClock(mins) {
  const h24 = ((Math.floor(mins / 60) % 24) + 24) % 24;
  const mm = ((mins % 60) + 60) % 60;
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function getUserClasses(userId) {
  return db.prepare(
    `SELECT c.*, d.name AS location_name FROM classes c
     LEFT JOIN directory_entries d ON d.slug = c.location_slug
     WHERE c.user_id = ? ORDER BY c.day_of_week, c.start_time`
  ).all(userId);
}

function pickNextClass(userId) {
  const classes = getUserClasses(userId);
  if (!classes.length) return null;
  const now = new Date();
  const today = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const scored = classes.map(c => {
    const day = c.day_of_week == null ? today : Number(c.day_of_week);
    const start = parseTimeToMinutes(c.start_time) ?? 9 * 60;
    let dayDelta = (day - today + 7) % 7;
    if (dayDelta === 0 && start <= nowMins) dayDelta = 7;
    return { ...c, _start: start, _score: dayDelta * 1440 + start };
  });
  scored.sort((a, b) => a._score - b._score);
  return scored[0];
}

function classGuidance(userId, cls) {
  if (!cls) {
    return {
      text: 'No timetable classes found yet. Upload your timetable (CSV or ICS) on the Assistant page, then ask again.',
      route: 'Upload timetable →',
      route_href: 'assistant.html'
    };
  }
  const slug = cls.location_slug || 'dk12';
  const route = buildRoute(slug);
  const loc = cls.location_name || slug.toUpperCase();
  const walkMin = route?.walking_minutes || 6;
  const distM = route?.distance_m || 480;
  const congested = !!route?.congested;
  const buffer = congested ? 4 : 1;
  const startMins = parseTimeToMinutes(cls.start_time) ?? 15 * 60;
  const leaveMins = startMins - walkMin - buffer;
  const dayLabel = cls.day_of_week == null ? 'today' : DAY_NAMES[Number(cls.day_of_week)] || 'that day';

  return {
    text:
      `${cls.name} is at ${loc} (${dayLabel} ${formatClock(startMins)}–${formatClock(parseTimeToMinutes(cls.end_time) ?? startMins + 60)}). ` +
      `Distance about ${distM} m · average walk ${walkMin} min` +
      (congested ? ` (walkways congested — leave earlier).` : `.`) +
      ` Leave by ${formatClock(leaveMins)} to arrive on time.`,
    route: `Start route to ${loc} →`,
    route_dest: slug,
    meta: { distance_m: distM, walking_minutes: walkMin, leave_by: formatClock(leaveMins), location: loc }
  };
}

function parseTimetableText(text, filename) {
  const classes = [];
  const lowerName = (filename || '').toLowerCase();

  if (lowerName.endsWith('.ics') || text.includes('BEGIN:VEVENT')) {
    const events = text.split('BEGIN:VEVENT').slice(1);
    for (const ev of events) {
      const summary = (ev.match(/SUMMARY:([^\r\n]+)/i) || [])[1]?.trim();
      const location = (ev.match(/LOCATION:([^\r\n]+)/i) || [])[1]?.trim() || 'DK12';
      const dtstart = (ev.match(/DTSTART[^:]*:(\d{8}T\d{6})/i) || [])[1];
      const dtend = (ev.match(/DTEND[^:]*:(\d{8}T\d{6})/i) || [])[1];
      if (!summary || !dtstart) continue;
      const y = Number(dtstart.slice(0, 4));
      const mo = Number(dtstart.slice(4, 6)) - 1;
      const d = Number(dtstart.slice(6, 8));
      const hh = dtstart.slice(9, 11);
      const mm = dtstart.slice(11, 13);
      const eh = dtend ? dtend.slice(9, 11) : String(Number(hh) + 1).padStart(2, '0');
      const em = dtend ? dtend.slice(11, 13) : mm;
      const day = new Date(y, mo, d).getDay();
      classes.push({
        name: summary,
        location_slug: slugifyLocation(location),
        start_time: `${hh}:${mm}`,
        end_time: `${eh}:${em}`,
        day_of_week: day
      });
    }
    return classes;
  }

  // CSV / TSV / simple lines: name,location,start,end,day
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^name\s*[,;\t]/i.test(line) || /^#/.test(line)) continue;
    const parts = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
        ? line.split(';')
        : line.split(',');
    if (parts.length < 3) continue;
    const [name, loc, start, end, dayRaw] = parts.map(p => p.trim().replace(/^"|"$/g, ''));
    if (!name || !start) continue;
    let day = dayRaw != null && dayRaw !== '' ? Number(dayRaw) : null;
    if (Number.isNaN(day)) {
      const idx = DAY_NAMES.findIndex(d => d.toLowerCase() === String(dayRaw).slice(0, 3).toLowerCase());
      day = idx >= 0 ? idx : null;
    }
    classes.push({
      name,
      location_slug: slugifyLocation(loc || 'dk12'),
      start_time: start.slice(0, 5),
      end_time: (end || '').slice(0, 5) || start.slice(0, 5),
      day_of_week: day
    });
  }
  return classes;
}

function saveUserClasses(userId, classes, filename) {
  db.prepare('DELETE FROM classes WHERE user_id = ?').run(userId);
  const ins = db.prepare(
    `INSERT INTO classes (user_id, name, location_slug, start_time, end_time, day_of_week)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const locations = new Set();
  for (const c of classes) {
    ins.run(userId, c.name, c.location_slug, c.start_time, c.end_time, c.day_of_week);
    locations.add(c.location_slug);
  }
  db.prepare(
    `INSERT INTO timetables (user_id, filename, class_count, location_count, synced_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       filename=excluded.filename,
       class_count=excluded.class_count,
       location_count=excluded.location_count,
       synced_at=datetime('now')`
  ).run(userId, filename || 'timetable.csv', classes.length, locations.size);
  return { class_count: classes.length, location_count: locations.size };
}

function assistantReply(message, userId) {
  const q = message.toLowerCase().trim();
  const nextClass = pickNextClass(userId);
  const blockC = db.prepare("SELECT * FROM walkways WHERE slug = 'block-a-c'").get();
  const library = db.prepare("SELECT * FROM facilities WHERE slug = 'library-l2'").get();

  if (
    q.includes('leave') ||
    q.includes('when to go') ||
    q.includes('where do i go') ||
    q.includes('where should i') ||
    (q.includes('next class') && (q.includes('time') || q.includes('where') || q.includes('distance'))) ||
    q.includes('timetable') ||
    q.includes('schedule') ||
    (q.includes('go') && (q.includes('class') || q.includes('where')))
  ) {
    return classGuidance(userId, nextClass);
  }

  if (q.includes('distance') || q.includes('how far') || q.includes('walk time') || q.includes('average time')) {
    const g = classGuidance(userId, nextClass);
    if (g.meta) {
      g.text =
        `To ${g.meta.location}: about ${g.meta.distance_m} m, average walk ${g.meta.walking_minutes} min. ` +
        `Leave by ${g.meta.leave_by}. You can also log a recorded distance later under My Data.`;
    }
    return g;
  }

  if (q.includes('leave') && (q.includes('dk12') || q.includes('thermo'))) {
    const thermo = getUserClasses(userId).find(c => /thermo|dk12/i.test(c.name + c.location_slug)) || nextClass;
    return classGuidance(userId, thermo);
  }

  if (q.includes('block c') && (q.includes('crowd') || q.includes('busy') || q.includes('walkway'))) {
    return {
      text: blockC && blockC.pace < 0.8
        ? `Yes — Block A → Block C is slow right now (${blockC.pace} m/s, 50% below normal). Peak corridor between classes.`
        : 'Block C walkway is moving normally right now (~1.1 m/s).',
      route: 'See alternate route →',
      route_dest: nextClass?.location_slug || 'dk12'
    };
  }
  if (q.includes('quiet') || q.includes('free room') || q.includes('study')) {
    const lab = db.prepare("SELECT * FROM facilities WHERE slug = 'fluid-lab'").get();
    return {
      text: `Fluid Mechanics Lab has ${lab.capacity - lab.current_count} free stations (${facilityPct(lab)}% occupied). Main Library Level 2 is at ${facilityPct(library)}% — best option.`,
      route: 'Navigate to Library L2 →',
      route_dest: 'library-l2'
    };
  }
  if (q.includes('next class')) {
    return classGuidance(userId, nextClass);
  }
  if (q.includes('library') && q.includes('busy')) {
    const pct = facilityPct(library);
    return {
      text: `Main Library Level 2 is at ${pct}% capacity. ${pct < 50 ? 'Plenty of quiet seats available.' : 'Level 2 quiet zone still has open seats.'}`,
      route: 'Navigate to Library, Level 2 →',
      route_dest: 'library-l2'
    };
  }
  if (q.includes('accessible') || q.includes('step-free') || q.includes('ramp')) {
    return {
      text: "Here's a step-free route to Dewan Utama — ramps and lift access included, adds about 3 minutes.",
      route: 'Start accessible route →',
      route_dest: 'dewan-utama',
      route_mode: 'accessible'
    };
  }
  if (q.includes('attendance') || q.includes('present')) {
    const summary = db.prepare(
      `SELECT COUNT(*) AS total FROM attendance_records WHERE user_id = ? AND date(tapped_at) = date('now')`
    ).get(userId);
    return {
      text: `You're marked present for ${summary.total} classes today.`,
      route: 'View attendance →',
      route_dest: null,
      route_href: 'attendance.html'
    };
  }
  if (q.includes('my data') || q.includes('profile') || q.includes('stored')) {
    return {
      text: 'All your items — profile, RFID, face photo, timetable, attendance, and recorded distances — are stored under your account. Open My Data to view or add a distance.',
      route: 'Open My Data →',
      route_href: 'mydata.html'
    };
  }
  return {
    text: 'Ask me: when to leave for class, how far / average walk time, next class, or walkway congestion. Upload your timetable first so guidance uses your real schedule.',
    route: 'Open My Data →',
    route_href: 'mydata.html'
  };
}

// ---- Auth (Matrix ID login; name MUST be CAPITAL LETTERS) ----
app.post('/api/auth/register', uploadFace.single('photo'), (req, res) => {
  try {
    const name = normalizeName(req.body.name);
    const matrixId = normalizeMatrix(req.body.matrix_id || req.body.password);
    const rfidTag = normalizeRfid(req.body.rfid_tag || req.body.rfid);

    if (!name || !matrixId || !rfidTag) {
      return res.status(400).json({
        error: 'Name (CAPITAL LETTERS), Matrix ID, and RFID UID are required'
      });
    }
    if (!/^[A-Z]+(?:[ A-Z.'-]*[A-Z])?$/.test(name) || name.length < 3) {
      return res.status(400).json({
        error: 'Name must be CAPITAL LETTERS only (example: SATH KUMAR)'
      });
    }
    if (!/^[A-Z0-9]{4,20}$/.test(matrixId)) {
      return res.status(400).json({
        error: 'Matrix ID looks invalid. Example: A22EC1234'
      });
    }
    if (rfidTag.length < 4) {
      return res.status(400).json({ error: 'RFID UID is too short. Scan the card first.' });
    }
    if (!req.file) {
      return res.status(400).json({
        error: 'Face photo is required. Upload a clear front-facing photo.'
      });
    }

    // Password IS the Matrix ID (as requested)
    const password = matrixId;
    const email = `${matrixId.toLowerCase()}@campusgrid.student`;
    const hash = bcrypt.hashSync(password, 10);
    const faceFile = req.file.filename;

    const result = db.prepare(
      `INSERT INTO users (email, password_hash, name, rfid_tag, matrix_id, face_file, role)
       VALUES (?, ?, ?, ?, ?, ?, 'student')`
    ).run(email, hash, name, rfidTag, matrixId, faceFile);

    const userId = result.lastInsertRowid;
    db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    db.prepare('INSERT INTO sustainability_stats (user_id) VALUES (?)').run(userId);
    logActivity(userId, 'register', `${name} / ${matrixId} / RFID ${rfidTag}`);

    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: getUser(userId),
      message: 'Registered. Login with Matrix ID. Password = your Matrix ID.'
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({
        error: 'This Matrix ID or RFID tag is already registered'
      });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const matrixOrEmail = String(req.body.matrix_id || req.body.email || '').trim();
  const password = String(req.body.password || '');
  if (!matrixOrEmail || !password) {
    return res.status(400).json({ error: 'Matrix ID and password are required' });
  }

  const matrixId = normalizeMatrix(matrixOrEmail.replace(/@.*$/, ''));
  const user =
    db.prepare('SELECT * FROM users WHERE upper(matrix_id) = ?').get(matrixId) ||
    db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(matrixOrEmail.toLowerCase()) ||
    db.prepare('SELECT * FROM users WHERE email = ?').get(`${matrixId.toLowerCase()}@campusgrid.student`);

  if (!user) {
    return res.status(401).json({ error: 'Invalid Matrix ID or password' });
  }

  const passOk =
    bcrypt.compareSync(password, user.password_hash) ||
    bcrypt.compareSync(password.toUpperCase(), user.password_hash);
  if (!passOk) {
    return res.status(401).json({
      error: 'Invalid Matrix ID or password. Password is your Matrix ID.'
    });
  }

  logActivity(user.id, 'login', user.matrix_id || user.email);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: getUser(user.id) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: getUser(req.user.id), preferences: prefsToObj(getPrefs(req.user.id)) });
});

// ---- User preferences ----
app.get('/api/users/me/preferences', authRequired, (req, res) => {
  res.json(prefsToObj(getPrefs(req.user.id)));
});

app.patch('/api/users/me/preferences', authRequired, (req, res) => {
  const p = req.body;
  const fields = ['avoid_stairs', 'shaded_paths', 'voice_guidance', 'green_routes', 'show_name_leaderboard', 'notifications_enabled'];
  const updates = [];
  const values = [];
  fields.forEach(f => {
    if (p[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(p[f] ? 1 : 0);
    }
  });
  if (updates.length) {
    values.push(req.user.id);
    db.prepare(`UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
    logActivity(req.user.id, 'preferences_update', JSON.stringify(p));
  }
  res.json(prefsToObj(getPrefs(req.user.id)));
});

// ---- Home / grid ----
app.get('/api/home', authRequired, (req, res) => {
  const user = getUser(req.user.id);
  const grid = db.prepare('SELECT * FROM grid_stats WHERE id = 1').get();
  const attCount = db.prepare(
    `SELECT COUNT(DISTINCT facility_slug) AS c FROM attendance_records WHERE user_id = ? AND date(tapped_at) = date('now')`
  ).get(req.user.id).c;
  const live = db.prepare('SELECT * FROM facilities ORDER BY current_count DESC LIMIT 5').all();
  res.json({
    greeting: `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}.`,
    user,
    grid,
    attendance_summary: { classes_logged: attCount, total_expected: 4 },
    live_facilities: live.map(f => ({
      ...f,
      pct: facilityPct(f),
      tag: facilityTag(f)
    }))
  });
});

app.get('/api/grid/headcount', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM grid_stats WHERE id = 1').get());
});

// ---- Directory ----
app.get('/api/directory', authRequired, (req, res) => {
  const { q, type } = req.query;
  let rows = db.prepare('SELECT * FROM directory_entries ORDER BY popular DESC, name').all();
  if (type && type !== 'all') {
    rows = rows.filter(r => r.type === type.toLowerCase());
  }
  if (q) {
    const lq = q.toLowerCase();
    rows = rows.filter(r =>
      r.name.toLowerCase().includes(lq) ||
      (r.subtitle && r.subtitle.toLowerCase().includes(lq)) ||
      r.slug.includes(lq)
    );
  }
  res.json(rows);
});

app.get('/api/directory/:slug', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM directory_entries WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// ---- Navigation ----
app.get('/api/routes', authRequired, (req, res) => {
  const { to, mode } = req.query;
  if (!to) return res.status(400).json({ error: 'Destination required' });
  const route = buildRoute(to, mode || 'standard');
  if (!route) return res.status(404).json({ error: 'Destination not found' });
  res.json(route);
});

app.post('/api/navigation/start', authRequired, (req, res) => {
  const { to, from, mode } = req.body;
  if (!to) return res.status(400).json({ error: 'Destination required' });
  const result = db.prepare(
    'INSERT INTO navigation_sessions (user_id, from_loc, to_slug, mode) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, from || 'Your Location', to, mode || 'standard');
  logActivity(req.user.id, 'navigation_start', `${from || 'current'} → ${to} (${mode || 'standard'})`);
  res.status(201).json({ session_id: result.lastInsertRowid, route: buildRoute(to, mode || 'standard') });
});

// ---- Real-time ----
app.get('/api/walkways', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM walkways ORDER BY pace ASC').all());
});

app.get('/api/facilities', authRequired, (req, res) => {
  const { type } = req.query;
  let rows = db.prepare('SELECT * FROM facilities ORDER BY name').all();
  if (type && type !== 'All Buildings') {
    const map = { 'Lecture Halls': 'lecture', Labs: 'lab', Library: 'library' };
    const t = map[type] || type.toLowerCase();
    rows = rows.filter(r => r.type === t);
  }
  res.json(rows.map(f => ({ ...f, pct: facilityPct(f), tag: facilityTag(f) })));
});

app.get('/api/events', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY id').all());
});

// ---- Attendance ----
app.get('/api/attendance/me', authRequired, (req, res) => {
  const records = db.prepare(
    `SELECT * FROM attendance_records WHERE user_id = ? AND date(tapped_at) = date('now') ORDER BY tapped_at DESC`
  ).all(req.user.id);
  const last = records[0];
  const grid = db.prepare('SELECT * FROM grid_stats WHERE id = 1').get();
  res.json({
    status: records.length >= 4 ? 'Present' : 'Partial',
    classes_logged: records.length,
    total_expected: 4,
    last_tap: last ? { facility: last.facility_slug, time: last.tapped_at } : null,
    records,
    grid
  });
});

app.get('/api/attendance/occupancy', authRequired, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM facilities WHERE type IN ('lecture','lab','tutorial') ORDER BY current_count DESC`
  ).all();
  res.json(rows.map(f => ({ ...f, pct: facilityPct(f), tag: facilityTag(f) })));
});

app.get('/api/attendance/alerts', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM integrity_alerts ORDER BY flagged_at DESC').all());
});

app.post('/api/rfid/tap', authRequired, (req, res) => {
  const { doorway, facility_slug, class_name } = req.body;
  const user = getUser(req.user.id);
  db.prepare('INSERT INTO rfid_taps (rfid_tag, doorway, user_id) VALUES (?, ?, ?)')
    .run(user.rfid_tag, doorway || 'unknown', req.user.id);
  if (facility_slug) {
    db.prepare(
      `INSERT INTO attendance_records (user_id, facility_slug, class_name, status, tapped_at) VALUES (?, ?, ?, 'present', datetime('now'))`
    ).run(req.user.id, facility_slug, class_name || null);
    const fac = db.prepare('SELECT * FROM facilities WHERE slug = ?').get(facility_slug);
    if (fac) {
      db.prepare('UPDATE facilities SET current_count = current_count + 1 WHERE slug = ?').run(facility_slug);
    }
  }
  db.prepare(`UPDATE grid_stats SET last_sync = datetime('now') WHERE id = 1`).run();
  logActivity(req.user.id, 'rfid_tap', `${doorway} @ ${facility_slug || 'walkway'}`);
  res.status(201).json({ ok: true });
});

// ---- Timetable ----
app.get('/api/timetable', authRequired, (req, res) => {
  const tt = db.prepare('SELECT * FROM timetables WHERE user_id = ?').get(req.user.id);
  const classes = getUserClasses(req.user.id);
  const next = pickNextClass(req.user.id);
  const guidance = next ? classGuidance(req.user.id, next) : null;
  res.json({ timetable: tt, classes, next_class: next, guidance });
});

app.post('/api/timetable/upload', authRequired, upload.single('file'), (req, res) => {
  const filename = req.file?.originalname || 'uploaded.csv';
  const text = req.file?.buffer?.toString('utf8') || '';
  let classes = parseTimetableText(text, filename);

  // If file has no parseable rows, keep a useful default set for the user
  if (!classes.length) {
    classes = [
      { name: 'Thermodynamics II', location_slug: 'dk12', start_time: '15:00', end_time: '16:00', day_of_week: new Date().getDay() },
      { name: 'Fluid Mechanics', location_slug: 'fluid-lab', start_time: '10:00', end_time: '12:00', day_of_week: (new Date().getDay() + 1) % 7 },
      { name: 'Tutorial T3', location_slug: 'library-l2', start_time: '14:00', end_time: '15:00', day_of_week: (new Date().getDay() + 2) % 7 }
    ];
  }

  const saved = saveUserClasses(req.user.id, classes, filename);
  logActivity(req.user.id, 'timetable_upload', `${filename} (${saved.class_count} classes)`);
  const next = pickNextClass(req.user.id);
  res.json({
    filename,
    class_count: saved.class_count,
    location_count: saved.location_count,
    synced_at: new Date().toISOString(),
    classes,
    guidance: next ? classGuidance(req.user.id, next) : null
  });
});

app.post('/api/timetable/classes', authRequired, (req, res) => {
  const { name, location_slug, start_time, end_time, day_of_week } = req.body || {};
  if (!name || !start_time) return res.status(400).json({ error: 'name and start_time required' });
  const slug = slugifyLocation(location_slug || 'dk12');
  db.prepare(
    `INSERT INTO classes (user_id, name, location_slug, start_time, end_time, day_of_week)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, name, slug, start_time, end_time || start_time, day_of_week ?? null);

  const classes = getUserClasses(req.user.id);
  const locations = new Set(classes.map(c => c.location_slug));
  db.prepare(
    `INSERT INTO timetables (user_id, filename, class_count, location_count, synced_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       class_count=excluded.class_count,
       location_count=excluded.location_count,
       synced_at=datetime('now')`
  ).run(req.user.id, 'manual', classes.length, locations.size);

  logActivity(req.user.id, 'timetable_class_add', name);
  res.status(201).json({ ok: true, classes });
});

// ---- Recorded distances (add later) ----
app.get('/api/distances', authRequired, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM distance_records WHERE user_id = ? ORDER BY recorded_at DESC, id DESC'
  ).all(req.user.id);
  const total = rows.reduce((s, r) => s + (r.distance_km || 0), 0);
  res.json({ records: rows, total_km: Math.round(total * 100) / 100 });
});

app.post('/api/distances', authRequired, (req, res) => {
  const distanceKm = Number(req.body?.distance_km);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return res.status(400).json({ error: 'distance_km must be a positive number' });
  }
  const fromLabel = (req.body?.from_label || '').trim() || null;
  const toLabel = (req.body?.to_label || '').trim() || null;
  const note = (req.body?.note || '').trim() || null;
  const recordedAt = (req.body?.recorded_at || '').trim() || new Date().toISOString();

  const info = db.prepare(
    `INSERT INTO distance_records (user_id, distance_km, from_label, to_label, note, recorded_at, source)
     VALUES (?, ?, ?, ?, ?, ?, 'manual')`
  ).run(req.user.id, distanceKm, fromLabel, toLabel, note, recordedAt);

  // Keep sustainability totals in sync for this user
  const sum = db.prepare(
    'SELECT COALESCE(SUM(distance_km),0) AS total FROM distance_records WHERE user_id = ?'
  ).get(req.user.id);
  db.prepare(
    `INSERT INTO sustainability_stats (user_id, walkability_score, co2_kg, distance_km, weekly_steps)
     VALUES (?, 70, ?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET
       distance_km = excluded.distance_km,
       co2_kg = excluded.co2_kg`
  ).run(req.user.id, Math.round(sum.total * 0.21 * 100) / 100, sum.total);

  logActivity(req.user.id, 'distance_record', `${distanceKm} km`);
  const row = db.prepare('SELECT * FROM distance_records WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, record: row, total_km: sum.total });
});

app.delete('/api/distances/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM distance_records WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM distance_records WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, 'distance_delete', String(req.params.id));
  res.json({ ok: true });
});

// ---- One place for all user items ----
app.get('/api/me/hub', authRequired, (req, res) => {
  const user = getUser(req.user.id);
  const prefs = prefsToObj(getPrefs(req.user.id));
  const timetable = db.prepare('SELECT * FROM timetables WHERE user_id = ?').get(req.user.id);
  const classes = getUserClasses(req.user.id);
  const attendance = db.prepare(
    'SELECT * FROM attendance_records WHERE user_id = ? ORDER BY tapped_at DESC LIMIT 20'
  ).all(req.user.id);
  const distances = db.prepare(
    'SELECT * FROM distance_records WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 50'
  ).all(req.user.id);
  const logs = db.prepare(
    'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.user.id);
  const stats = db.prepare('SELECT * FROM sustainability_stats WHERE user_id = ?').get(req.user.id);
  const next = pickNextClass(req.user.id);
  res.json({
    user,
    preferences: prefs,
    timetable,
    classes,
    next_class: next,
    guidance: next ? classGuidance(req.user.id, next) : null,
    attendance,
    distances,
    distance_total_km: Math.round(distances.reduce((s, r) => s + r.distance_km, 0) * 100) / 100,
    sustainability: stats,
    activity: logs
  });
});

// ---- Assistant ----
app.post('/api/assistant/chat', authRequired, (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
  const reply = assistantReply(message, req.user.id);
  logActivity(req.user.id, 'assistant_chat', message.slice(0, 120));
  res.json(reply);
});

// ---- Accessibility ----
app.get('/api/accessibility/entrances', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM accessible_entrances ORDER BY name').all());
});

app.get('/api/accessibility/route', authRequired, (req, res) => {
  res.json(buildRoute(req.query.to || 'dewan-utama', 'accessible'));
});

// ---- Sustainability ----
app.get('/api/sustainability', authRequired, (req, res) => {
  const stats = db.prepare('SELECT * FROM sustainability_stats WHERE user_id = ?').get(req.user.id)
    || { walkability_score: 0, co2_kg: 0, distance_km: 0, weekly_steps: 0 };
  const prefs = getPrefs(req.user.id);
  const leaders = db.prepare('SELECT * FROM leaderboard ORDER BY rank_num').all().map(l => {
    if (l.user_id === req.user.id && !prefs.show_name_leaderboard) {
      return { ...l, display_name: 'Anonymous (you)', is_anonymous: true };
    }
    if (l.user_id === req.user.id) {
      return { ...l, display_name: `${getUser(req.user.id).name} (you)` };
    }
    return l;
  });
  const history = db.prepare(
    'SELECT day_label, distance_km, day_order FROM walking_history WHERE user_id = ? ORDER BY day_order'
  ).all(req.user.id);
  res.json({ stats, leaderboard: leaders, history, preferences: prefsToObj(prefs) });
});

// ---- Settings & logs ----
app.get('/api/settings', authRequired, (req, res) => {
  const user = getUser(req.user.id);
  const prefs = prefsToObj(getPrefs(req.user.id));
  res.json({ user, preferences: prefs });
});

app.get('/api/logs', authRequired, (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);
  res.json(logs);
});

app.get('/api/logs/all', authRequired, (req, res) => {
  res.json(db.prepare('SELECT l.*, u.name AS user_name FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 100').all());
});

// ---- Meta ----
app.get('/api/meta/sync', (req, res) => {
  const grid = db.prepare('SELECT last_sync FROM grid_stats WHERE id = 1').get();
  res.json({ last_sync: grid?.last_sync });
});

// ---- Edge gateway ingest (Arduino USB agent / ESP32 WiFi) ----
// Student app is NOT live-fed from these taps. Admin console reads them.
app.post('/api/edge/tap', edgeAuth, (req, res) => {
  const uid = String(req.body.uid || req.body.rfid_tag || '').toUpperCase();
  if (!uid) return res.status(400).json({ error: 'uid required' });

  const doorway = req.body.doorway || 'unknown';
  const facility = req.body.facility_slug || null;
  const source = req.body.source || 'edge';
  const intervalMs = req.body.interval_ms == null ? null : Number(req.body.interval_ms);
  // Do not auto-flag here — integrity endpoint decides after headcount
  const flagged = 0;
  const tappedAt = req.body.ts || new Date().toISOString();

  db.prepare(
    `INSERT INTO edge_taps (rfid_tag, doorway, facility_slug, source, interval_ms, flagged, tapped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uid, doorway, facility, source, intervalMs, flagged, tappedAt);

  db.prepare('INSERT INTO rfid_taps (rfid_tag, doorway, user_id) VALUES (?, ?, NULL)')
    .run(uid, doorway);

  // Quiet attendance bump only for registered cards (not shown as live Arduino feed in student UI)
  const user = db.prepare('SELECT id FROM users WHERE upper(rfid_tag) = ?').get(uid);
  if (user && facility) {
    db.prepare(
      `INSERT INTO attendance_records (user_id, facility_slug, class_name, status, tapped_at)
       VALUES (?, ?, ?, 'present', ?)`
    ).run(user.id, facility, null, tappedAt);
  }

  db.prepare(`UPDATE grid_stats SET last_sync = datetime('now') WHERE id = 1`).run();
  res.status(201).json({ ok: true, admin_only: true });
});

/**
 * Rapid-tap integrity result from agent:
 * - tap_count people tapped within <200ms gaps
 * - headcount from webcam
 * - if headcount < tap_count => FLAG + photo for admin
 * - if headcount >= tap_count => OK (more heads than taps = ignore)
 */
app.post('/api/edge/integrity', edgeAuth, (req, res) => {
  const uids = Array.isArray(req.body.uids) ? req.body.uids.map((u) => String(u).toUpperCase()) : [];
  const tapCount = Number(req.body.tap_count) || uids.length;
  const headcount = Number(req.body.headcount) || 0;
  const intervalMs = req.body.interval_ms == null ? null : Number(req.body.interval_ms);
  const doorway = req.body.doorway || 'unknown';
  const facility = req.body.facility_slug || null;
  const source = req.body.source || 'edge';
  const createdAt = req.body.ts || new Date().toISOString();

  let verdict = String(req.body.verdict || '').toLowerCase();
  if (!verdict) {
    verdict = headcount >= tapCount ? 'ok' : 'flagged';
  }
  // Explicit rule: more heads than taps => ignore (ok)
  if (headcount > tapCount) verdict = 'ok';
  if (headcount < tapCount) verdict = 'flagged';

  const reason =
    req.body.reason ||
    (verdict === 'flagged'
      ? `${tapCount} rapid taps but camera saw ${headcount}`
      : `${tapCount} rapid taps, camera saw ${headcount} — OK`);

  let photoFile = null;
  const b64 = req.body.photo_jpeg_base64 || '';
  if (verdict === 'flagged' && b64) {
    try {
      const fs = require('fs');
      const incidentsDir = path.join(DATA_DIR, 'incidents');
      fs.mkdirSync(incidentsDir, { recursive: true });
      photoFile = `incident_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(incidentsDir, photoFile), Buffer.from(b64, 'base64'));
    } catch (e) {
      console.warn('Could not save incident photo', e.message);
    }
  }

  const incidentId = db.prepare(
    `INSERT INTO admin_incidents
      (doorway, facility_slug, uids, tap_count, headcount, interval_ms, photo_file, verdict, reason, status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    doorway,
    facility,
    uids.join(','),
    tapCount,
    headcount,
    intervalMs,
    photoFile,
    verdict,
    reason,
    verdict === 'flagged' ? 'open' : 'closed',
    source,
    createdAt
  ).lastInsertRowid;

  if (verdict === 'flagged') {
    db.prepare(
      `INSERT INTO rapid_tap_flags (doorway, uids, interval_ms, source, flagged_at, tap_count, headcount, photo_file, verdict)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doorway,
      uids.join(','),
      intervalMs ?? 0,
      source,
      createdAt,
      tapCount,
      headcount,
      photoFile,
      'flagged'
    );
    db.prepare(
      `INSERT INTO integrity_alerts (doorway, rfid_count, camera_count, description, flagged_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(doorway, tapCount, headcount, reason, createdAt);
  }

  console.log(`[INTEGRITY] ${verdict} taps=${tapCount} heads=${headcount} photo=${photoFile || '-'}`);
  res.status(201).json({ ok: true, verdict, incident_id: incidentId, photo_file: photoFile });
});

app.post('/api/edge/headcount', edgeAuth, (req, res) => {
  const count = Number(req.body.count);
  if (!Number.isFinite(count)) return res.status(400).json({ error: 'count required' });

  const doorway = req.body.doorway || 'unknown';
  const facility = req.body.facility_slug || null;
  const source = req.body.source || 'webcam';
  const capturedAt = req.body.ts || new Date().toISOString();

  db.prepare(
    `INSERT INTO doorway_headcounts (doorway, facility_slug, people_count, source, captured_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(doorway, facility, Math.round(count), source, capturedAt);

  db.prepare('UPDATE grid_stats SET headcount = ?, last_sync = datetime(\'now\') WHERE id = 1')
    .run(Math.round(count));

  res.status(201).json({ ok: true });
});

// ---- Admin API (server admin only — not student frontend) ----
app.get('/api/admin/incidents', adminRequired, (req, res) => {
  const status = req.query.status;
  const rows = status
    ? db.prepare('SELECT * FROM admin_incidents WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM admin_incidents ORDER BY id DESC LIMIT 200').all();
  res.json(rows);
});

app.get('/api/admin/taps', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM edge_taps ORDER BY id DESC LIMIT 200').all());
});

app.get('/api/admin/summary', adminRequired, (_req, res) => {
  const openFlags = db.prepare(`SELECT COUNT(*) AS c FROM admin_incidents WHERE verdict = 'flagged' AND status = 'open'`).get().c;
  const okToday = db.prepare(`SELECT COUNT(*) AS c FROM admin_incidents WHERE verdict = 'ok' AND date(created_at) = date('now')`).get().c;
  const tapsToday = db.prepare(`SELECT COUNT(*) AS c FROM edge_taps WHERE date(tapped_at) = date('now') OR substr(tapped_at,1,10) = date('now')`).get().c;
  res.json({ open_flags: openFlags, ok_checks_today: okToday, taps_today: tapsToday });
});

app.post('/api/admin/incidents/:id/review', adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status === 'dismissed' ? 'dismissed' : 'reviewed';
  const note = req.body.note || null;
  db.prepare(
    `UPDATE admin_incidents SET status = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`
  ).run(status, note, id);
  res.json({ ok: true });
});

app.get('/api/edge/flags', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM rapid_tap_flags ORDER BY flagged_at DESC LIMIT 100').all());
});

app.get('/api/edge/headcounts', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM doorway_headcounts ORDER BY captured_at DESC LIMIT 100').all());
});

app.get('/api/edge/taps', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM edge_taps ORDER BY tapped_at DESC LIMIT 100').all());
});

/** Admin live status (not used by student app) */
app.get('/api/admin/live-status', adminRequired, (_req, res) => {
  const lastHc = db.prepare('SELECT * FROM doorway_headcounts ORDER BY captured_at DESC LIMIT 1').get();
  const recentTaps = db.prepare('SELECT * FROM edge_taps ORDER BY id DESC LIMIT 20').all();
  const openIncidents = db.prepare(
    `SELECT * FROM admin_incidents WHERE verdict = 'flagged' AND status = 'open' ORDER BY id DESC LIMIT 20`
  ).all();
  res.json({
    last_headcount: lastHc,
    recent_taps: recentTaps,
    open_incidents: openIncidents
  });
});

// ---- Static: admin console + CampusGrid student app ----
const EDGE_DASH = path.join(__dirname, '..', 'edge', 'dashboard');
const ADMIN_DIR = path.join(__dirname, '..', 'admin');
const INCIDENTS_DIR = path.join(DATA_DIR, 'incidents');
require('fs').mkdirSync(INCIDENTS_DIR, { recursive: true });

if (!require('fs').existsSync(APP_DIR)) {
  console.error('Missing frontend folder:', APP_DIR);
  process.exit(1);
}

app.use('/incidents', express.static(INCIDENTS_DIR));
app.use('/admin', express.static(ADMIN_DIR));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});
// Legacy path redirects to admin (edge dash retired as public)
app.get('/edge', (_req, res) => {
  res.redirect('/admin');
});
app.use('/edge-static', express.static(EDGE_DASH));
app.use(express.static(APP_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(APP_DIR, 'login.html'));
});

module.exports = app;

function lanIPs() {
  const os = require('os');
  const ips = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('========================================');
    console.log('  CampusGrid SYSTEM (app + edge) running');
    console.log('========================================');
    console.log(`  App (students): http://127.0.0.1:${PORT}`);
    console.log(`  Admin console:  http://127.0.0.1:${PORT}/admin`);
    for (const ip of lanIPs()) {
      console.log(`  App (phone):    http://${ip}:${PORT}`);
      console.log(`  Admin (LAN):    http://${ip}:${PORT}/admin`);
    }
    console.log('========================================');
    console.log('  Student login: Matrix ID / Matrix ID');
    console.log('  Admin login:   ADMIN / ADMIN123');
    console.log('  Demo student:  A22DEMO001 / A22DEMO001');
    console.log('  Next: START-AGENT.bat (Arduino + webcam)');
    console.log('========================================');
    console.log('');
  });
}
