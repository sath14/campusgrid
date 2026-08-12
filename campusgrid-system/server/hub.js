/**
 * CampusGrid Hub — ESP32 plug-and-play, places livecount, class sessions,
 * lecturer attendance, login logs, tap photos, vision toggles.
 * Arduino Mega remains the main head (USB agent). ESP32-S3 nodes are add-on.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const LIVECOUNT_KINDS = new Set(['cafeteria', 'library', 'counselling', 'common']);
const CLASS_KINDS = new Set(['lecture', 'tutorial', 'lab']);

function durationForType(classType) {
  const t = String(classType || '').toLowerCase();
  if (t === 'lab') return 120;
  return 60; // lecture + tutorial
}

function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO system_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function refreshPlaceLiveCount(db, slug) {
  if (!slug) return null;
  const place = db.prepare('SELECT * FROM places WHERE slug = ?').get(slug);
  if (!place || !place.livecount_enabled) return place || null;
  // Livecount = RFID taps in window + latest headcount reading (NOT facial recognition)
  const taps = Number(place.current_taps) || 0;
  const heads = Number(place.current_headcount) || 0;
  const live = Math.max(taps, heads);
  db.prepare('UPDATE places SET live_count = ? WHERE slug = ?').run(live, slug);
  return db.prepare('SELECT * FROM places WHERE slug = ?').get(slug);
}

function findMatchingTimetable(db, placeSlug) {
  const now = new Date();
  const dow = now.getDay(); // 0 Sun
  const hhmm = now.toTimeString().slice(0, 5);
  return db.prepare(
    `SELECT * FROM class_timetable
     WHERE place_slug = ? AND active = 1 AND day_of_week = ?
       AND start_time <= ?
     ORDER BY start_time DESC LIMIT 1`
  ).get(placeSlug, dow, hhmm);
}

function getActiveSession(db, placeSlug) {
  return db.prepare(
    `SELECT * FROM class_sessions
     WHERE place_slug = ? AND status = 'active' AND datetime(ends_at) > datetime('now')
     ORDER BY id DESC LIMIT 1`
  ).get(placeSlug);
}

function closeExpiredSessions(db) {
  db.prepare(
    `UPDATE class_sessions SET status = 'ended'
     WHERE status = 'active' AND datetime(ends_at) <= datetime('now')`
  ).run();
}

function startOrGetSession(db, placeSlug, rfidTag) {
  closeExpiredSessions(db);
  const place = db.prepare('SELECT * FROM places WHERE slug = ?').get(placeSlug);
  if (!place || !CLASS_KINDS.has(String(place.kind).toLowerCase())) {
    // Also allow facilities mapped as lecture/lab/tutorial via place kind from timetable
    const tt = findMatchingTimetable(db, placeSlug);
    if (!tt) return getActiveSession(db, placeSlug);
  }

  let session = getActiveSession(db, placeSlug);
  if (session) return session;

  const tt = findMatchingTimetable(db, placeSlug);
  if (!tt) return null;

  const duration = tt.duration_minutes || durationForType(tt.class_type);
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + duration * 60 * 1000);

  const id = db.prepare(
    `INSERT INTO class_sessions
      (timetable_id, class_code, class_name, class_type, place_slug, lecturer_id, started_at, ends_at, status, started_by_rfid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  ).run(
    tt.id,
    tt.class_code,
    tt.class_name,
    tt.class_type,
    placeSlug,
    tt.lecturer_id,
    startedAt.toISOString(),
    endsAt.toISOString(),
    rfidTag || null
  ).lastInsertRowid;

  return db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(id);
}

function saveTapPhoto(DATA_DIR, b64, rfidTag) {
  if (!b64) return null;
  try {
    const dir = path.join(DATA_DIR, 'tap_photos');
    fs.mkdirSync(dir, { recursive: true });
    const file = `tap_${Date.now()}_${String(rfidTag || 'unknown').replace(/[^A-Z0-9]/gi, '')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(b64, 'base64'));
    return file;
  } catch (e) {
    console.warn('tap photo save failed', e.message);
    return null;
  }
}

function processEdgeTap(db, DATA_DIR, body) {
  const uid = String(body.uid || body.rfid_tag || '').toUpperCase();
  if (!uid) return { error: 'uid required', status: 400 };

  const doorway = body.doorway || 'unknown';
  const placeSlug = body.place_slug || body.facility_slug || null;
  const source = body.source || 'edge';
  const deviceId = body.device_id ? Number(body.device_id) : null;
  const intervalMs = body.interval_ms == null ? null : Number(body.interval_ms);
  const tappedAt = body.ts || new Date().toISOString();
  const webcamAvailable = body.webcam_available !== false && body.webcam_available !== 0;

  // Mark device online
  if (deviceId) {
    db.prepare(
      `UPDATE edge_devices SET online = 1, last_seen = datetime('now') WHERE id = ?`
    ).run(deviceId);
  } else if (body.device_ip) {
    db.prepare(
      `UPDATE edge_devices SET online = 1, last_seen = datetime('now') WHERE ip_address = ?`
    ).run(String(body.device_ip));
  }

  db.prepare(
    `INSERT INTO edge_taps (rfid_tag, doorway, facility_slug, source, interval_ms, flagged, tapped_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(uid, doorway, placeSlug, source, intervalMs, tappedAt);

  db.prepare('INSERT INTO rfid_taps (rfid_tag, doorway, user_id) VALUES (?, ?, NULL)').run(uid, doorway);

  const user = db.prepare('SELECT * FROM users WHERE upper(rfid_tag) = ?').get(uid);
  let photoFile = null;
  if (webcamAvailable) {
    photoFile = saveTapPhoto(DATA_DIR, body.photo_jpeg_base64 || '', uid);
  }
  // Continue without headcount/facial if webcam missing — still record tap

  if (photoFile) {
    db.prepare(
      `INSERT INTO tap_photos (rfid_tag, user_id, device_id, doorway, place_slug, photo_file, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(uid, user?.id || null, deviceId, doorway, placeSlug, photoFile, tappedAt);

    // Facial enrollment / records when vision_mode is facial (server-side archive)
    const vision = getSetting(db, 'vision_mode', 'headcount');
    if (vision === 'facial' && user?.id) {
      db.prepare(
        `INSERT INTO face_records (user_id, photo_file, source, captured_at) VALUES (?, ?, 'tap', ?)`
      ).run(user.id, photoFile, tappedAt);
      if (!user.face_file) {
        db.prepare('UPDATE users SET face_file = ? WHERE id = ?').run(photoFile, user.id);
      }
    }
  }

  let session = null;
  if (placeSlug) {
    const place = db.prepare('SELECT * FROM places WHERE slug = ?').get(placeSlug);
    const kind = String(place?.kind || '').toLowerCase();

    if (place && (LIVECOUNT_KINDS.has(kind) || place.livecount_enabled)) {
      db.prepare('UPDATE places SET current_taps = current_taps + 1 WHERE slug = ?').run(placeSlug);
      refreshPlaceLiveCount(db, placeSlug);
    }

    if (CLASS_KINDS.has(kind) || findMatchingTimetable(db, placeSlug)) {
      session = startOrGetSession(db, placeSlug, uid);
      if (session && user) {
        try {
          db.prepare(
            `INSERT INTO session_attendance (session_id, user_id, rfid_tag, photo_file, tapped_at)
             VALUES (?, ?, ?, ?, ?)`
          ).run(session.id, user.id, uid, photoFile, tappedAt);
        } catch (_) {
          /* duplicate tap in same session */
        }
      }
    }

    if (user) {
      db.prepare(
        `INSERT INTO attendance_records (user_id, facility_slug, class_name, status, tapped_at)
         VALUES (?, ?, ?, 'present', ?)`
      ).run(user.id, placeSlug, session?.class_name || null, tappedAt);
    }
  }

  db.prepare(`UPDATE grid_stats SET last_sync = datetime('now') WHERE id = 1`).run();

  return {
    ok: true,
    webcam_used: Boolean(photoFile),
    webcam_available: webcamAvailable,
    session_id: session?.id || null,
    class_name: session?.class_name || null,
    ends_at: session?.ends_at || null,
    photo_file: photoFile,
    // For ESP32-C3 / LCD doorway displays
    known: Boolean(user),
    name: user?.name || null,
    matrix_id: user?.matrix_id || null,
    display_line: user
      ? `Welcome ${user.name}`
      : 'Unknown card',
    matrix_line: user?.matrix_id ? `MK-${user.matrix_id}` : 'MK----------'
  };
}

function registerHubRoutes(app, deps) {
  const {
    db,
    DATA_DIR,
    authRequired,
    adminRequired,
    edgeAuth,
    getUser,
    logActivity,
    bcrypt,
    jwt,
    JWT_SECRET
  } = deps;

  const TAP_PHOTOS = path.join(DATA_DIR, 'tap_photos');
  const FACES = path.join(DATA_DIR, 'faces');
  fs.mkdirSync(TAP_PHOTOS, { recursive: true });
  fs.mkdirSync(FACES, { recursive: true });

  app.use('/tap-photos', require('express').static(TAP_PHOTOS));

  function lecturerRequired(req, res, next) {
    authRequired(req, res, () => {
      const user = getUser(req.user.id);
      if (!user || (user.role !== 'lecturer' && user.role !== 'admin')) {
        return res.status(403).json({ error: 'Lecturer access only' });
      }
      req.lecturer = user;
      next();
    });
  }

  // ---- Settings / vision toggle ----
  app.get('/api/admin/settings', adminRequired, (_req, res) => {
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const out = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json(out);
  });

  app.patch('/api/admin/settings', adminRequired, (req, res) => {
    const allowed = ['vision_mode', 'facial_enrollment'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) setSetting(db, k, req.body[k]);
    }
    // vision_mode: headcount | facial
    if (req.body.vision_mode && !['headcount', 'facial'].includes(req.body.vision_mode)) {
      return res.status(400).json({ error: 'vision_mode must be headcount or facial' });
    }
    logActivity(req.user.id, 'settings_update', JSON.stringify(req.body));
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });

  // ---- ESP32 plug-and-play devices ----
  app.get('/api/admin/devices', adminRequired, (_req, res) => {
    res.json(db.prepare('SELECT * FROM edge_devices ORDER BY id DESC').all());
  });

  app.post('/api/admin/devices', adminRequired, (req, res) => {
    const name = String(req.body.name || '').trim();
    const ip = String(req.body.ip_address || req.body.ip || '').trim();
    if (!name || !ip) return res.status(400).json({ error: 'name and ip_address required' });

    try {
      const id = db.prepare(
        `INSERT INTO edge_devices
          (name, ip_address, device_type, doorway, place_slug, vision_mode, webcam_enabled, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        name,
        ip,
        req.body.device_type || 'esp32-s3',
        req.body.doorway || name,
        req.body.place_slug || null,
        req.body.vision_mode || getSetting(db, 'vision_mode', 'headcount'),
        req.body.webcam_enabled === false || req.body.webcam_enabled === 0 ? 0 : 1,
        req.body.notes || null
      ).lastInsertRowid;
      logActivity(req.user.id, 'device_add', `${name} @ ${ip}`);
      res.status(201).json(db.prepare('SELECT * FROM edge_devices WHERE id = ?').get(id));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Device IP already registered' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/admin/devices/:id', adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM edge_devices WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const fields = {
      name: req.body.name ?? row.name,
      ip_address: req.body.ip_address ?? req.body.ip ?? row.ip_address,
      doorway: req.body.doorway ?? row.doorway,
      place_slug: req.body.place_slug ?? row.place_slug,
      vision_mode: req.body.vision_mode ?? row.vision_mode,
      webcam_enabled:
        req.body.webcam_enabled === undefined
          ? row.webcam_enabled
          : req.body.webcam_enabled
            ? 1
            : 0,
      notes: req.body.notes ?? row.notes
    };
    db.prepare(
      `UPDATE edge_devices SET name=?, ip_address=?, doorway=?, place_slug=?, vision_mode=?, webcam_enabled=?, notes=?
       WHERE id=?`
    ).run(
      fields.name,
      fields.ip_address,
      fields.doorway,
      fields.place_slug,
      fields.vision_mode,
      fields.webcam_enabled,
      fields.notes,
      id
    );
    res.json(db.prepare('SELECT * FROM edge_devices WHERE id = ?').get(id));
  });

  app.delete('/api/admin/devices/:id', adminRequired, (req, res) => {
    db.prepare('DELETE FROM edge_devices WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  /** ESP32 pulls its config by IP (plug-and-play) */
  app.get('/api/edge/device-config', edgeAuth, (req, res) => {
    const ip = String(req.query.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .replace(/^::ffff:/, '')
      .split(',')[0]
      .trim();
    const device =
      db.prepare('SELECT * FROM edge_devices WHERE ip_address = ?').get(ip) ||
      (req.query.device_id
        ? db.prepare('SELECT * FROM edge_devices WHERE id = ?').get(Number(req.query.device_id))
        : null);
    if (!device) {
      return res.status(404).json({
        error: 'Device not registered. Add its IP in Admin → Devices.',
        hint: ip
      });
    }
    db.prepare(`UPDATE edge_devices SET online = 1, last_seen = datetime('now') WHERE id = ?`).run(device.id);
    const vision = device.vision_mode || getSetting(db, 'vision_mode', 'headcount');
    res.json({
      device_id: device.id,
      name: device.name,
      doorway: device.doorway,
      place_slug: device.place_slug,
      vision_mode: vision,
      // Facial recognition for records is server-side; livecount uses headcount+taps only
      capture_photo_on_tap: true,
      headcount_enabled: vision === 'headcount',
      facial_enabled: vision === 'facial',
      webcam_required: false // continue without webcam
    });
  });

  // Enhanced edge tap (keeps Arduino path working via same endpoint body)
  app.post('/api/edge/tap-v2', edgeAuth, (req, res) => {
    const result = processEdgeTap(db, DATA_DIR, req.body);
    if (result.error) return res.status(result.status || 400).json(result);
    res.status(201).json(result);
  });

  app.post('/api/edge/headcount-place', edgeAuth, (req, res) => {
    const count = Number(req.body.count);
    const placeSlug = req.body.place_slug || req.body.facility_slug;
    if (!Number.isFinite(count) || !placeSlug) {
      return res.status(400).json({ error: 'count and place_slug required' });
    }
    // If webcam missing, ESP32 should simply not call this — tap path still works
    db.prepare(
      `UPDATE places SET current_headcount = ? WHERE slug = ?`
    ).run(Math.round(count), placeSlug);
    const place = refreshPlaceLiveCount(db, placeSlug);

    db.prepare(
      `INSERT INTO doorway_headcounts (doorway, facility_slug, people_count, source, captured_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      req.body.doorway || placeSlug,
      placeSlug,
      Math.round(count),
      req.body.source || 'esp32-webcam',
      req.body.ts || new Date().toISOString()
    );

    res.status(201).json({ ok: true, place });
  });

  /** IR / ultrasonic pathway sensors → walkway pace + congestion */
  app.post('/api/edge/pathway', edgeAuth, (req, res) => {
    const slug = String(req.body.walkway_slug || req.body.slug || 'block-a-c').trim();
    const speed = Number(req.body.speed_mps);
    const crossings = Number(req.body.crossings_per_min);
    const busy = String(req.body.busy_level || '').toLowerCase(); // low|medium|high

    let pace = Number.isFinite(speed) ? speed : null;
    if (pace == null && Number.isFinite(crossings)) {
      // Heuristic: more crossings → slower effective walking pace
      if (crossings >= 40) pace = 0.55;
      else if (crossings >= 20) pace = 0.85;
      else pace = 1.15;
    }
    if (pace == null) {
      if (busy === 'high') pace = 0.55;
      else if (busy === 'medium') pace = 0.85;
      else pace = 1.15;
    }

    const status =
      pace < 0.7 ? 'congested' : pace < 1.0 ? 'busy' : 'clear';

    const existing = db.prepare('SELECT * FROM walkways WHERE slug = ?').get(slug);
    if (existing) {
      db.prepare(`UPDATE walkways SET pace = ?, status = ? WHERE slug = ?`).run(pace, status, slug);
    } else {
      db.prepare(
        `INSERT INTO walkways (slug, name, pace, status) VALUES (?, ?, ?, ?)`
      ).run(slug, req.body.name || slug, pace, status);
    }

    const row = db.prepare('SELECT * FROM walkways WHERE slug = ?').get(slug);
    res.status(201).json({
      ok: true,
      walkway: row,
      crossings_per_min: Number.isFinite(crossings) ? crossings : null,
      busy_level: busy || status
    });
  });

  /** Lookup card for LCD doorways (ESP32-C3 etc.) */
  app.get('/api/edge/lookup', edgeAuth, (req, res) => {
    const uid = String(req.query.uid || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const user = db.prepare(
      'SELECT id, name, matrix_id, rfid_tag, role FROM users WHERE upper(rfid_tag) = ?'
    ).get(uid);
    if (!user) {
      return res.json({
        known: false,
        display_line: 'Unknown card',
        matrix_line: 'MK----------'
      });
    }
    res.json({
      known: true,
      name: user.name,
      matrix_id: user.matrix_id,
      display_line: `Welcome ${user.name}`,
      matrix_line: `MK-${user.matrix_id}`
    });
  });

  // ---- Places ----
  app.get('/api/admin/places', adminRequired, (_req, res) => {
    closeExpiredSessions(db);
    res.json(db.prepare('SELECT * FROM places ORDER BY name').all());
  });

  app.post('/api/admin/places', adminRequired, (req, res) => {
    const name = String(req.body.name || '').trim();
    const slug = String(req.body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '');
    const kind = String(req.body.kind || 'common').toLowerCase();
    if (!name || !slug) return res.status(400).json({ error: 'name required' });
    try {
      const id = db.prepare(
        `INSERT INTO places (slug, name, kind, capacity, livecount_enabled)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        slug,
        name,
        kind,
        Number(req.body.capacity) || 0,
        LIVECOUNT_KINDS.has(kind) || req.body.livecount_enabled ? 1 : 0
      ).lastInsertRowid;
      res.status(201).json(db.prepare('SELECT * FROM places WHERE id = ?').get(id));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Place slug already exists' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/places/live', authRequired, (_req, res) => {
    closeExpiredSessions(db);
    res.json(
      db.prepare(
        `SELECT slug, name, kind, capacity, live_count, current_taps, current_headcount, livecount_enabled
         FROM places WHERE livecount_enabled = 1 ORDER BY name`
      ).all()
    );
  });

  // ---- Timetable (admin) ----
  app.get('/api/admin/timetable', adminRequired, (_req, res) => {
    res.json(
      db.prepare(
        `SELECT t.*, u.name AS lecturer_name FROM class_timetable t
         LEFT JOIN users u ON u.id = t.lecturer_id
         ORDER BY t.day_of_week, t.start_time`
      ).all()
    );
  });

  app.post('/api/admin/timetable', adminRequired, (req, res) => {
    const classType = String(req.body.class_type || 'lecture').toLowerCase();
    const duration = Number(req.body.duration_minutes) || durationForType(classType);
    const id = db.prepare(
      `INSERT INTO class_timetable
        (class_code, class_name, class_type, place_slug, lecturer_id, day_of_week, start_time, duration_minutes, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      String(req.body.class_code || '').trim(),
      String(req.body.class_name || '').trim(),
      classType,
      String(req.body.place_slug || '').trim(),
      req.body.lecturer_id || null,
      Number(req.body.day_of_week),
      String(req.body.start_time || '').trim(),
      duration
    ).lastInsertRowid;
    // Ensure place exists for classroom
    const place = db.prepare('SELECT id FROM places WHERE slug = ?').get(req.body.place_slug);
    if (!place) {
      db.prepare(
        `INSERT INTO places (slug, name, kind, capacity, livecount_enabled) VALUES (?, ?, ?, 0, 0)`
      ).run(req.body.place_slug, req.body.class_name || req.body.place_slug, classType);
    } else {
      db.prepare('UPDATE places SET kind = ? WHERE slug = ?').run(classType, req.body.place_slug);
    }
    res.status(201).json(db.prepare('SELECT * FROM class_timetable WHERE id = ?').get(id));
  });

  app.delete('/api/admin/timetable/:id', adminRequired, (req, res) => {
    db.prepare('DELETE FROM class_timetable WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/admin/sessions', adminRequired, (_req, res) => {
    closeExpiredSessions(db);
    res.json(db.prepare('SELECT * FROM class_sessions ORDER BY id DESC LIMIT 100').all());
  });

  // ---- Data tabs ----
  app.get('/api/admin/login-logs', adminRequired, (_req, res) => {
    res.json(db.prepare('SELECT * FROM login_logs ORDER BY id DESC LIMIT 300').all());
  });

  app.get('/api/admin/tap-photos', adminRequired, (_req, res) => {
    res.json(
      db.prepare(
        `SELECT p.*, u.name AS student_name, u.matrix_id
         FROM tap_photos p LEFT JOIN users u ON u.id = p.user_id
         ORDER BY p.id DESC LIMIT 200`
      ).all()
    );
  });

  app.get('/api/admin/users', adminRequired, (_req, res) => {
    res.json(
      db.prepare(
        `SELECT id, email, name, rfid_tag, matrix_id, face_file, role, created_at FROM users ORDER BY role, name`
      ).all()
    );
  });

  app.get('/api/admin/face-records', adminRequired, (_req, res) => {
    res.json(
      db.prepare(
        `SELECT f.*, u.name, u.matrix_id FROM face_records f
         JOIN users u ON u.id = f.user_id
         ORDER BY f.id DESC LIMIT 300`
      ).all()
    );
  });

  app.get('/api/admin/live-view', adminRequired, (_req, res) => {
    closeExpiredSessions(db);
    const devices = db.prepare('SELECT * FROM edge_devices ORDER BY last_seen DESC').all();
    const places = db.prepare('SELECT * FROM places ORDER BY name').all();
    const sessions = db.prepare(`SELECT * FROM class_sessions WHERE status = 'active'`).all();
    const recentTaps = db.prepare('SELECT * FROM edge_taps ORDER BY id DESC LIMIT 30').all();
    const recentPhotos = db.prepare('SELECT * FROM tap_photos ORDER BY id DESC LIMIT 12').all();
    const vision_mode = getSetting(db, 'vision_mode', 'headcount');
    res.json({
      vision_mode,
      arduino_main_head: getSetting(db, 'arduino_is_main_head', '1') === '1',
      devices,
      places,
      active_sessions: sessions,
      recent_taps: recentTaps,
      recent_photos: recentPhotos
    });
  });

  // ---- Lecturer portal ----
  app.get('/api/lecturer/sessions', lecturerRequired, (req, res) => {
    closeExpiredSessions(db);
    const rows =
      req.lecturer.role === 'admin'
        ? db.prepare('SELECT * FROM class_sessions ORDER BY id DESC LIMIT 100').all()
        : db.prepare(
            `SELECT * FROM class_sessions WHERE lecturer_id = ? ORDER BY id DESC LIMIT 100`
          ).all(req.lecturer.id);
    res.json(rows);
  });

  app.get('/api/lecturer/sessions/:id/attendance', lecturerRequired, (req, res) => {
    const session = db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(Number(req.params.id));
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (
      req.lecturer.role !== 'admin' &&
      session.lecturer_id &&
      session.lecturer_id !== req.lecturer.id
    ) {
      return res.status(403).json({ error: 'Not your class session' });
    }
    const rows = db.prepare(
      `SELECT sa.*, u.name, u.matrix_id, u.face_file AS profile_face
       FROM session_attendance sa
       LEFT JOIN users u ON u.id = sa.user_id
       WHERE sa.session_id = ?
       ORDER BY sa.tapped_at`
    ).all(session.id);
    res.json({ session, attendance: rows });
  });

  app.get('/api/lecturer/me', lecturerRequired, (req, res) => {
    res.json({ user: req.lecturer });
  });

  // Create lecturer accounts from admin
  app.post('/api/admin/lecturers', adminRequired, (req, res) => {
    const matrix = String(req.body.matrix_id || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim().toUpperCase();
    const password = String(req.body.password || matrix);
    if (!matrix || !name) return res.status(400).json({ error: 'matrix_id and name required' });
    try {
      const hash = bcrypt.hashSync(password, 10);
      const id = db.prepare(
        `INSERT INTO users (email, password_hash, name, rfid_tag, matrix_id, face_file, role)
         VALUES (?, ?, ?, NULL, ?, NULL, 'lecturer')`
      ).run(`${matrix.toLowerCase()}@campusgrid.lecturer`, hash, name, matrix).lastInsertRowid;
      res.status(201).json(getUser(id));
    } catch (e) {
      res.status(409).json({ error: 'Lecturer already exists or invalid data' });
    }
  });
}

module.exports = {
  registerHubRoutes,
  processEdgeTap,
  getSetting,
  setSetting,
  refreshPlaceLiveCount,
  durationForType,
  closeExpiredSessions
};
