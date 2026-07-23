const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, initDb, seedDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'campusgrid-dev-secret-change-in-production';
const PORT = process.env.PORT || 3000;
const APP_DIR = path.join(__dirname, '..', 'campusgrid app');

initDb();
seedDb();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

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

function getUser(id) {
  return db.prepare('SELECT id, email, name, rfid_tag, created_at FROM users WHERE id = ?').get(id);
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

function assistantReply(message, userId) {
  const q = message.toLowerCase().trim();
  const prefs = getPrefs(userId);
  const nextClass = db.prepare(
    `SELECT c.*, d.name AS location_name FROM classes c
     LEFT JOIN directory_entries d ON d.slug = c.location_slug
     WHERE c.user_id = ? ORDER BY c.start_time LIMIT 1`
  ).get(userId);
  const blockC = db.prepare("SELECT * FROM walkways WHERE slug = 'block-a-c'").get();
  const library = db.prepare("SELECT * FROM facilities WHERE slug = 'library-l2'").get();
  const dk12 = db.prepare("SELECT * FROM facilities WHERE slug = 'dk12'").get();

  if (q.includes('leave') && (q.includes('dk12') || q.includes('thermo'))) {
    const congested = blockC && blockC.pace < 0.8;
    const leaveMin = congested ? 12 : 8;
    return {
      text: congested
        ? `Thermodynamics II starts at 3:00 pm. Block C walkway is congested (${blockC.pace} m/s vs normal 1.2). Leave by 2:48 pm — 4 minutes earlier than usual.`
        : `Thermodynamics II starts at 3:00 pm. Walkways are clear. Leave by 2:52 pm.`,
      route: 'Start route to DK12 →',
      route_dest: 'dk12'
    };
  }
  if (q.includes('block c') && (q.includes('crowd') || q.includes('busy') || q.includes('walkway'))) {
    return {
      text: blockC.pace < 0.8
        ? `Yes — Block A → Block C is slow right now (${blockC.pace} m/s, 50% below normal). 847 people on grid; peak corridor between classes.`
        : 'Block C walkway is moving normally right now (~1.1 m/s).',
      route: 'See alternate route →',
      route_dest: 'dk12'
    };
  }
  if (q.includes('quiet') || q.includes('free room') || q.includes('study')) {
    const lab = db.prepare("SELECT * FROM facilities WHERE slug = 'fluid-lab'").get();
    return {
      text: `Fluid Mechanics Lab has ${lab.capacity - lab.current_count} free stations (${facilityPct(lab)}% occupied). Tutorial T3 is full. Main Library Level 2 is at ${facilityPct(library)}% — best option.`,
      route: 'Navigate to Library L2 →',
      route_dest: 'library-l2'
    };
  }
  if (q.includes('next class')) {
    const loc = nextClass?.location_name || nextClass?.location_slug || 'campus';
    return {
      text: `Your next class is ${nextClass?.name || 'Thermodynamics II'} in ${loc} — ${buildRoute(nextClass?.location_slug || 'dk12')?.walking_minutes || 6} minutes away at current walkway pace.`,
      route: `Start route to ${nextClass?.location_slug?.toUpperCase() || 'DK12'} →`,
      route_dest: nextClass?.location_slug || 'dk12'
    };
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
      text: `You're marked present for ${summary.total} classes today. Last tap logged at DK12 doorway.`,
      route: 'View attendance →',
      route_dest: null,
      route_href: 'attendance.html'
    };
  }
  return {
    text: "Let me check the grid for you. Try asking about your next class, walkway congestion, or quiet study spots.",
    route: null
  };
}

// ---- Auth ----
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, rfid_tag } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name, rfid_tag) VALUES (?, ?, ?, ?)'
    ).run(email, hash, name, rfid_tag || `RFID-${Date.now()}`);
    const userId = result.lastInsertRowid;
    db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    db.prepare('INSERT INTO sustainability_stats (user_id) VALUES (?)').run(userId);
    logActivity(userId, 'register', email);
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: getUser(userId) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email or RFID tag already registered' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  logActivity(user.id, 'login', email);
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
  const classes = db.prepare('SELECT * FROM classes WHERE user_id = ? ORDER BY start_time').all(req.user.id);
  res.json({ timetable: tt, classes });
});

app.post('/api/timetable/upload', authRequired, upload.single('file'), (req, res) => {
  const filename = req.file?.originalname || 'uploaded.ics';
  const classCount = Math.max(1, (req.file?.buffer?.toString().match(/BEGIN:VEVENT/g) || []).length || 6);
  db.prepare(
    `INSERT INTO timetables (user_id, filename, class_count, location_count, synced_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET filename=excluded.filename, class_count=excluded.class_count, synced_at=datetime('now')`
  ).run(req.user.id, filename, classCount, 4);
  logActivity(req.user.id, 'timetable_upload', filename);
  res.json({ filename, class_count: classCount, location_count: 4, synced_at: new Date().toISOString() });
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

// ---- Static app + fallback ----
app.use(express.static(APP_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(APP_DIR, 'login.html'));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CampusGrid server running at http://localhost:${PORT}`);
    console.log(`Demo login: sath@campusgrid.edu / demo123`);
  });
}
