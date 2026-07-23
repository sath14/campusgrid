// =====================================================================
// CampusGrid — shared client-side state & simulation layer
// Everything here is simulated in the browser (localStorage) so the
// prototype behaves like a working app with no real backend attached.
// =====================================================================

const CG = (() => {
  const STORE_KEY = 'cg_state_v1';

  const DEFAULT_STATE = {
    prefs: {
      avoidStairs: true,
      preferShade: false,
      announceRoute: false,
      greenRoutes: true,
      showNameOnLeaderboard: false
    },
    destination: 'dk12',
    rooms: {
      dk12:      { name: 'DK12 — Lecture Hall',        sub: 'Block C, Level 1 · Capacity 60',   cat: 'rooms',  occ: 0.55, cap: 60,  hasStairs: true  },
      fmlab:     { name: 'Fluid Mechanics Lab',         sub: 'Block D, Level 2 · Eng. Dept',     cat: 'labs',   occ: 0.10, cap: 24,  hasStairs: true  },
      workshop2: { name: 'Workshop 2',                  sub: 'Block D, Level 1 · Eng. Dept',     cat: 'labs',   occ: 0.05, cap: 20,  hasStairs: false },
      library:   { name: 'Main Library, Level 2',       sub: 'Quiet zone',                       cat: 'rooms',  occ: 0.38, cap: 220, hasStairs: false },
      dewan:     { name: 'Dewan Utama',                 sub: 'Main Hall · Capacity 800',         cat: 'rooms',  occ: 0.70, cap: 800, hasStairs: false },
      aina:      { name: 'Puan Aina Rahman',            sub: 'Physics Unit · Office B-204',      cat: 'staff',  occ: null, cap: null, hasStairs: false },
      saffairs:  { name: 'Student Affairs Office',      sub: 'Admin Block, Ground Floor',        cat: 'services', occ: null, cap: null, hasStairs: false }
    },
    walkways: {
      blockAC: { name: 'Block A → Block C covered walk', pace: 62 },
      libDewan:{ name: 'Library → Dewan Utama path',      pace: 96 }
    },
    attendance: {
      dk12: { taps: 41, camera: 41, events: [
        { room: 'DK12', time: '3:01pm', taps: 41, camera: 41, flagged: false },
        { room: 'Fluid Mechanics Lab', time: '2:58pm', taps: 18, camera: 17, flagged: true },
        { room: 'Workshop 2', time: '2:45pm', taps: 12, camera: 12, flagged: false }
      ]}
    },
    leaderboard: [
      { rank: 1, name: 'Anonymous Panther #114', km: 18.4, self: false },
      { rank: 2, name: 'Sath', km: 14.9, self: true },
      { rank: 3, name: 'Anonymous Panther #058', km: 13.2, self: false }
    ]
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return clone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULT_STATE), parsed, {
        prefs: Object.assign(clone(DEFAULT_STATE.prefs), parsed.prefs || {}),
        rooms: Object.assign(clone(DEFAULT_STATE.rooms), parsed.rooms || {}),
        walkways: Object.assign(clone(DEFAULT_STATE.walkways), parsed.walkways || {}),
        attendance: Object.assign(clone(DEFAULT_STATE.attendance), parsed.attendance || {})
      });
    } catch (e) {
      return clone(DEFAULT_STATE);
    }
  }

  let state = load();

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore quota errors */ }
  }

  function reset() {
    state = clone(DEFAULT_STATE);
    save();
    location.reload();
  }

  return { state, save, reset, get: () => state };
})();

const DESTINATIONS = {
  dk12: {
    label: 'DK12 — Thermodynamics II', block: 'Block C, Level 1', distance: 480, time: 6,
    normal: [
      { t: 'Exit KMKK Block A, head east', s: 'Past the courtyard, 90m' },
      { t: 'Turn left at the covered walkway', s: 'Continue toward Block C, 260m' },
      { t: 'Take the stairs to Level 1', s: 'DK12 is the second door on the right' },
      { t: 'Arrive at DK12', s: 'Thermodynamics II · Block C, Level 1', done: true }
    ],
    accessible: [
      { t: 'Exit KMKK Block A, head east', s: 'Past the courtyard, 90m' },
      { t: 'Turn left at the covered walkway', s: 'Continue toward Block C, 260m' },
      { t: 'Take the lift to Level 1', s: 'Step-free — adds about 3 minutes' },
      { t: 'Arrive at DK12', s: 'Thermodynamics II · Block C, Level 1', done: true }
    ]
  },
  library: {
    label: 'Main Library, Level 2', block: 'Central Block', distance: 260, time: 4,
    normal: [
      { t: 'Head toward Central Block', s: '180m along the main path' },
      { t: 'Enter through the main doors', s: 'Take the stairs to Level 2' },
      { t: 'Arrive at the quiet zone', s: 'Main Library, Level 2', done: true }
    ],
    accessible: [
      { t: 'Head toward Central Block', s: '180m along the main path' },
      { t: 'Enter through the lift lobby', s: 'Step-free access to all 3 levels' },
      { t: 'Arrive at the quiet zone', s: 'Main Library, Level 2', done: true }
    ]
  },
  dewan: {
    label: 'Dewan Utama', block: 'Main Hall', distance: 340, time: 5,
    normal: [
      { t: 'Ramp exit — Block A, East', s: 'Step-free from ground level' },
      { t: 'Cross the courtyard', s: 'Toward the main hall entrance' },
      { t: 'Arrive at Dewan Utama', s: 'Main entrance', done: true }
    ],
    accessible: [
      { t: 'Ramp exit — Block A, East', s: 'Step-free from ground level' },
      { t: 'Lift to Level 1, covered walkway', s: 'Avoids the Block C stairwell' },
      { t: 'Arrive at Dewan Utama, side entrance', s: 'Step-free access, adds ~3 min', done: true }
    ]
  },
  fmlab: {
    label: 'Fluid Mechanics Lab', block: 'Block D, Level 2', distance: 520, time: 7,
    normal: [
      { t: 'Head toward Block D', s: '300m past the workshop yard' },
      { t: 'Take the stairs to Level 2', s: 'Lab is at the end of the corridor' },
      { t: 'Arrive at Fluid Mechanics Lab', s: 'Block D, Level 2', done: true }
    ],
    accessible: [
      { t: 'Head toward Block D', s: '300m past the workshop yard' },
      { t: 'Take the lift to Level 2', s: 'Step-free — adds about 3 minutes' },
      { t: 'Arrive at Fluid Mechanics Lab', s: 'Block D, Level 2', done: true }
    ]
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === page);
  });

  const revealables = document.querySelectorAll('.quick-card, .list-item, .card, .more-item, .route-step');
  revealables.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.animationDelay = (i * 0.05) + 's';
  });

  document.querySelectorAll('.switch').forEach(sw => {
    sw.addEventListener('click', () => {
      sw.classList.toggle('on');
      const prefKey = sw.dataset.pref;
      if (prefKey) {
        CG.state.prefs[prefKey] = sw.classList.contains('on');
        CG.save();
        document.dispatchEvent(new CustomEvent('cg:prefchange', { detail: prefKey }));
      }
    });
  });

  document.querySelectorAll('.switch[data-pref]').forEach(sw => {
    const val = CG.state.prefs[sw.dataset.pref];
    sw.classList.toggle('on', !!val);
  });

  function countUp(el, target, suffix) {
    const dur = 900;
    const start = performance.now();
    const from = parseFloat(el.dataset.cur || '0');
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (target - from) * eased;
      el.textContent = Math.round(val) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.dataset.cur = target;
    }
    requestAnimationFrame(tick);
  }
  document.querySelectorAll('.count-up').forEach(el => {
    const target = parseFloat(el.dataset.target || '0');
    const suffix = el.dataset.suffix || '';
    countUp(el, target, suffix);
  });

  document.querySelectorAll('.chip-row').forEach(row => {
    row.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        row.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filterTarget = row.dataset.filterTarget;
        if (filterTarget) applyFilter(document.querySelector(filterTarget), chip.dataset.filter);
      });
    });
  });

  function applyFilter(listEl, filter) {
    if (!listEl) return;
    const items = listEl.querySelectorAll('[data-cat]');
    let visible = 0;
    items.forEach(item => {
      const show = !filter || filter === 'all' || item.dataset.cat === filter;
      item.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    const emptyNote = listEl.querySelector('.empty-note');
    if (emptyNote) emptyNote.classList.toggle('hidden', visible > 0);
  }

  const liveClocks = document.querySelectorAll('.live-seconds');
  if (liveClocks.length) {
    let secs = 0;
    setInterval(() => {
      secs += 4;
      liveClocks.forEach(el => { el.textContent = secs + 's ago'; });
    }, 4000);
  }

  const homeSearch = document.getElementById('homeSearch');
  if (homeSearch) {
    homeSearch.removeAttribute('readonly');
    homeSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && homeSearch.value.trim()) {
        location.href = 'directory.html?q=' + encodeURIComponent(homeSearch.value.trim());
      }
    });
  }

  const dirList = document.getElementById('dirList');
  if (dirList) {
    const dirSearch = document.getElementById('dirSearch');
    const params = new URLSearchParams(location.search);
    const initialQ = params.get('q') || '';
    if (initialQ && dirSearch) dirSearch.value = initialQ;

    function runDirFilter() {
      const q = (dirSearch.value || '').toLowerCase().trim();
      const activeChip = dirList.parentElement.querySelector('.chip.active');
      const cat = activeChip ? activeChip.dataset.filter : 'all';
      const items = dirList.querySelectorAll('[data-cat]');
      let visible = 0;
      items.forEach(item => {
        const text = (item.dataset.search || item.textContent).toLowerCase();
        const matchesCat = cat === 'all' || item.dataset.cat === cat;
        const matchesQ = !q || text.includes(q);
        const show = matchesCat && matchesQ;
        item.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      const emptyNote = document.getElementById('dirEmpty');
      if (emptyNote) emptyNote.classList.toggle('hidden', visible > 0);
    }
    if (dirSearch) {
      dirSearch.addEventListener('input', runDirFilter);
      runDirFilter();
    }
    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', runDirFilter);
    });
    dirList.querySelectorAll('[data-dest]').forEach(item => {
      item.addEventListener('click', () => {
        CG.state.destination = item.dataset.dest;
        CG.save();
      });
    });
  }

  const routeSteps = document.getElementById('routeSteps');
  if (routeSteps) {
    const destSelect = document.getElementById('destSelect');
    const mapLine = document.getElementById('mapLine');
    const timeStat = document.getElementById('timeStat');
    const distStat = document.getElementById('distStat');
    const startBtn = document.getElementById('startNavBtn');
    const destLabel = document.getElementById('destLabel');

    if (destSelect) destSelect.value = CG.state.destination;

    function currentDest() {
      const id = destSelect ? destSelect.value : CG.state.destination;
      return { id, data: DESTINATIONS[id] || DESTINATIONS.dk12 };
    }

    function renderRoute() {
      const { data } = currentDest();
      const avoidStairs = CG.state.prefs.avoidStairs;
      const steps = avoidStairs ? data.accessible : data.normal;
      const extra = avoidStairs && JSON.stringify(data.accessible) !== JSON.stringify(data.normal) ? 3 : 0;

      routeSteps.querySelectorAll('.route-step').forEach(el => el.remove());
      steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.className = 'route-step reveal';
        div.style.animationDelay = (i * 0.06) + 's';
        div.innerHTML = '<div class="route-dot">' + (step.done ? '✓' : (i + 1)) + '</div>' +
          '<div><div class="rs-title">' + step.t + '</div><div class="rs-sub">' + step.s + '</div></div>';
        routeSteps.appendChild(div);
      });

      if (destLabel) destLabel.textContent = data.label;
      if (timeStat) { timeStat.dataset.target = data.time + extra; countUp(timeStat, data.time + extra, ' min'); }
      if (distStat) { distStat.dataset.target = data.distance; countUp(distStat, data.distance, 'm'); }
      if (mapLine) mapLine.setAttribute('stroke-dasharray', avoidStairs ? '2 5' : '6 6');

      if (startBtn) {
        startBtn.textContent = 'Start Navigation';
        startBtn.classList.remove('done');
        startBtn.disabled = false;
        startBtn.onclick = null;
        startBtn.dataset.busy = '0';
      }
    }

    if (destSelect) destSelect.addEventListener('change', () => {
      CG.state.destination = destSelect.value;
      CG.save();
      renderRoute();
      attachStart();
    });
    document.addEventListener('cg:prefchange', (e) => { if (e.detail === 'avoidStairs') renderRoute(); });

    function attachStart() {
      if (!startBtn) return;
      startBtn.onclick = () => {
        if (startBtn.dataset.busy === '1') return;
        const stepsEls = routeSteps.querySelectorAll('.route-step');
        if (!stepsEls.length) return;
        startBtn.dataset.busy = '1';
        startBtn.disabled = true;
        let i = 0;
        const { id } = currentDest();
        function advance() {
          if (i > 0 && stepsEls[i - 1]) stepsEls[i - 1].style.opacity = '0.45';
          if (i < stepsEls.length) {
            const dot = stepsEls[i].querySelector('.route-dot');
            dot.style.background = 'var(--cyan)';
            dot.style.color = 'var(--deep)';
            startBtn.textContent = 'Navigating… ' + stepsEls[i].querySelector('.rs-title').textContent;
            i++;
            setTimeout(advance, 900);
          } else {
            startBtn.textContent = 'Arrived — RFID tap logged ✓';
            startBtn.classList.add('done');
            startBtn.disabled = false;
            startBtn.dataset.busy = '0';
            if (id === 'dk12' && CG.state.attendance.dk12) {
              const a = CG.state.attendance.dk12;
              a.taps++;
              a.camera++;
              a.events.unshift({ room: 'DK12', time: 'just now', taps: a.taps, camera: a.camera, flagged: false });
              a.events = a.events.slice(0, 8);
              CG.save();
            }
            startBtn.onclick = () => location.href = 'attendance.html';
          }
        }
        advance();
      };
    }

    renderRoute();
    attachStart();
  }

  const accPreview = document.getElementById('accPreview');
  if (accPreview) {
    function renderAccPreview() {
      const avoid = CG.state.prefs.avoidStairs;
      const steps = avoid ? DESTINATIONS.dewan.accessible : DESTINATIONS.dewan.normal;
      accPreview.querySelectorAll('.route-step').forEach(el => el.remove());
      steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.className = 'route-step reveal';
        div.style.animationDelay = (i * 0.06) + 's';
        div.innerHTML = '<div class="route-dot">' + (step.done ? '✓' : (i + 1)) + '</div>' +
          '<div><div class="rs-title">' + step.t + '</div><div class="rs-sub">' + step.s + '</div></div>';
        accPreview.appendChild(div);
      });
    }
    document.addEventListener('cg:prefchange', renderAccPreview);
    renderAccPreview();
  }

  const rtList = document.getElementById('rtRoomList');
  if (rtList) {
    function renderRooms() {
      Object.entries(CG.state.rooms).forEach(([id, room]) => {
        if (room.occ === null) return;
        const el = rtList.querySelector('[data-room="' + id + '"]');
        if (!el) return;
        const pct = Math.round(room.occ * 100);
        const busy = room.occ > 0.55;
        el.querySelector('.li-sub').textContent = room.sub + ' · ' + pct + '% full';
        const tag = el.querySelector('.li-tag');
        tag.textContent = busy ? 'Busy' : 'Free';
        tag.className = 'li-tag ' + (busy ? 'busy' : 'free');
      });
    }
    function tickRooms() {
      Object.values(CG.state.rooms).forEach(room => {
        if (room.occ === null) return;
        const delta = (Math.random() - 0.5) * 0.08;
        room.occ = Math.min(0.98, Math.max(0.02, room.occ + delta));
      });
      CG.save();
      renderRooms();
    }
    renderRooms();
    setInterval(tickRooms, 4000);

    const wwList = document.getElementById('walkwayList');
    if (wwList) {
      function renderWalkways() {
        Object.entries(CG.state.walkways).forEach(([id, w]) => {
          const el = wwList.querySelector('[data-walk="' + id + '"]');
          if (!el) return;
          const slow = w.pace < 80;
          el.querySelector('.li-sub').textContent = 'Avg. pace ' + Math.round(w.pace) + '% of normal' + (slow ? ' · congested' : '');
          const tag = el.querySelector('.li-tag');
          tag.textContent = slow ? 'Slow' : 'Clear';
          tag.className = 'li-tag ' + (slow ? 'busy' : 'free');
        });
      }
      function tickWalkways() {
        Object.values(CG.state.walkways).forEach(w => {
          w.pace = Math.min(100, Math.max(35, w.pace + (Math.random() - 0.5) * 10));
        });
        CG.save();
        renderWalkways();
      }
      renderWalkways();
      setInterval(tickWalkways, 4500);
    }
  }

  const lbList = document.getElementById('leaderboardList');
  if (lbList) {
    function renderLeaderboard() {
      const showName = CG.state.prefs.showNameOnLeaderboard;
      CG.state.leaderboard.forEach(entry => {
        const el = lbList.querySelector('[data-rank="' + entry.rank + '"]');
        if (!el) return;
        const label = entry.self ? (showName ? 'Sath' : 'Anonymous Panther #077') : entry.name;
        el.querySelector('.li-title').textContent = label;
        el.querySelector('.li-sub').textContent = entry.km + ' km this week';
      });
    }
    document.addEventListener('cg:prefchange', (e) => { if (e.detail === 'showNameOnLeaderboard') renderLeaderboard(); });
    renderLeaderboard();
  }

  const attCard = document.getElementById('attCard');
  if (attCard) {
    const eventsList = document.getElementById('attEvents');
    const tapsEl = document.getElementById('tapsNum');
    const camEl = document.getElementById('camNum');
    const statusTag = document.getElementById('attStatus');
    const recordBtn = document.getElementById('viewRecordBtn');
    const recordPanel = document.getElementById('recordPanel');

    function renderEvents() {
      const ev = CG.state.attendance.dk12.events.slice(0, 5);
      eventsList.innerHTML = '';
      ev.forEach((e, i) => {
        const div = document.createElement('div');
        div.className = 'list-item' + (i === 0 ? ' flash-in' : '');
        div.innerHTML = '<div class="li-icon">◈</div>' +
          '<div class="li-body"><div class="li-title">' + e.room + ' · ' + e.time + '</div>' +
          '<div class="li-sub">' + e.taps + ' taps · ' + e.camera + ' counted on camera</div></div>' +
          '<div class="li-tag ' + (e.flagged ? 'warn' : 'free') + '">' + (e.flagged ? 'Flagged' : 'Verified') + '</div>';
        eventsList.appendChild(div);
      });
    }

    function tick() {
      const a = CG.state.attendance.dk12;
      const mismatch = Math.random() < 0.12;
      a.taps += 1;
      a.camera += mismatch ? 0 : 1;
      const flagged = a.taps !== a.camera;
      a.events.unshift({ room: 'DK12', time: 'just now', taps: a.taps, camera: a.camera, flagged: flagged });
      a.events = a.events.slice(0, 8);
      CG.save();

      countUp(tapsEl, a.taps, '');
      countUp(camEl, a.camera, '');
      statusTag.textContent = flagged ? 'Mismatch — flagged for review' : 'Counts match — verified';
      statusTag.className = 'li-tag ' + (flagged ? 'warn' : 'free');
      renderEvents();
    }

    tapsEl.dataset.target = CG.state.attendance.dk12.taps;
    camEl.dataset.target = CG.state.attendance.dk12.camera;
    countUp(tapsEl, CG.state.attendance.dk12.taps, '');
    countUp(camEl, CG.state.attendance.dk12.camera, '');
    renderEvents();
    setInterval(tick, 5000);

    if (recordBtn && recordPanel) {
      recordBtn.addEventListener('click', () => {
        recordPanel.classList.toggle('hidden');
        recordBtn.textContent = recordPanel.classList.contains('hidden') ? 'View My Attendance Record' : 'Hide My Attendance Record';
      });
    }
  }

  const chatScroll = document.getElementById('chatScroll');
  if (chatScroll) {
    const responses = [
      { keys: ['next class', "where's my class", 'my class'],
        text: 'Your next class is Thermodynamics II in DK12, Block C — 6 minutes away on foot.',
        route: 'Start route to DK12 →', link: 'navigation.html' },
      { keys: ['when should i leave', 'leave for', 'what time should i leave'],
        text: 'Thermodynamics II starts at 3:30pm in DK12. The Block C walkway is running slower than usual (crowd ping: 62%) — leave Block A by 3:19pm instead of 3:23pm to be safe.',
        route: 'Start route to DK12 →', link: 'navigation.html' },
      { keys: ['library', 'busy'],
        text: 'Main Library is at 62% capacity right now. Level 2 quiet zone has the most open seats.',
        route: 'Navigate to Library, Level 2 →', link: 'navigation.html' },
      { keys: ['accessible', 'wheelchair', 'stairs'],
        text: "Here's a step-free route to Dewan Utama — ramps and lift access included, adds about 3 minutes.",
        route: 'Start accessible route →', link: 'navigation.html' },
      { keys: ['attendance', 'rfid', 'flagged'],
        text: 'DK12 attendance is currently verified — RFID tap count matches the camera headcount for this session.',
        route: 'View Smart Attendance →', link: 'attendance.html' },
      { keys: ['leaderboard', 'rank', 'steps', 'walk'],
        text: "You're currently #2 on the weekly walking leaderboard with 14.9 km — 3.5 km behind first place.",
        route: 'View Sustainability →', link: 'sustainability.html' }
    ];

    function findResponse(q) {
      const lower = q.toLowerCase();
      for (const r of responses) {
        if (r.keys.some(function (k) { return lower.includes(k); })) return r;
      }
      return { text: "I don't have live data for that yet in this prototype — but in the full version, that would pull from the Grid in real time.", route: null };
    }

    function addBubble(text, who, route, link) {
      const b = document.createElement('div');
      b.className = 'bubble ' + who + ' reveal';
      b.textContent = text;
      if (route) {
        const chipEl = document.createElement('div');
        chipEl.className = 'route-chip';
        chipEl.textContent = route;
        if (link) chipEl.addEventListener('click', function () { location.href = link; });
        b.appendChild(chipEl);
      }
      chatScroll.appendChild(b);
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    function handleQuery(q) {
      if (!q.trim()) return;
      addBubble(q, 'user');
      setTimeout(function () {
        const r = findResponse(q);
        addBubble(r.text, 'bot', r.route, r.link);
      }, 550);
    }

    document.querySelectorAll('.prompt-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        handleQuery(chip.textContent.trim());
        chip.parentElement.classList.add('hidden');
      });
    });

    const chatInput = document.querySelector('.chat-input-row input');
    const chatSendBtn = document.querySelector('.chat-input-row button');
    if (chatInput && chatSendBtn) {
      function send() {
        const val = chatInput.value;
        if (!val.trim()) return;
        handleQuery(val);
        chatInput.value = '';
      }
      chatSendBtn.addEventListener('click', send);
      chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    }
  }
});
