// CampusGrid — frontend app logic (API-driven)
document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;
  const noAuth = document.body.hasAttribute('data-no-auth');

  if (!noAuth && !CampusAPI.getToken()) {
    window.location.href = 'login.html';
    return;
  }

  // Nav highlight
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === page);
  });

  // Reveal animation
  document.querySelectorAll('.quick-card, .list-item, .card, .more-item, .route-step, .occ-card, .pace-card, .leader-row').forEach((el, i) => {
    el.classList.add('reveal');
    el.style.animationDelay = (i * 0.04) + 's';
  });

  // Generic toggles with persistence
  initPrefToggles();
  $$('.switch').forEach(sw => {
    if (!sw.closest('[data-pref]')) {
      sw.addEventListener('click', () => sw.classList.toggle('on'));
    }
  });

  // Count-up (triggered after data load too)
  runCountUps();

  // Chip rows
  document.querySelectorAll('.chip-row').forEach(row => {
    row.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        row.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        row.dispatchEvent(new CustomEvent('chipchange', { detail: { label: chip.textContent.trim() } }));
      });
    });
  });

  // Live sync clock from API
  initLiveClock();

  // Page loaders
  const loaders = {
    home: loadHome,
    navigate: loadNavigation,
    directory: loadDirectory,
    assistant: loadAssistant,
    more: () => {},
    login: () => {}
  };

  try {
    if (page === 'home') await loadHome();
    else if (page === 'navigate') await loadNavigation();
    else if (document.body.dataset.load === 'directory' || page === 'directory') await loadDirectory();
    else if (page === 'assistant') await loadAssistant();
    else if (location.pathname.includes('realtime')) await loadRealtime();
    else if (location.pathname.includes('attendance')) await loadAttendance();
    else if (location.pathname.includes('sustainability')) await loadSustainability();
    else if (location.pathname.includes('accessibility')) await loadAccessibility();
    else if (location.pathname.includes('settings')) await loadSettings();
  } catch (err) {
    console.error('Page load error:', err);
    showToast(err.message || 'Failed to load data');
  }
});

// ---- Helpers ----
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso.split(' ')[1]?.slice(0, 5) || iso;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function runCountUps() {
  $$('.count-up').forEach(el => {
    const target = parseFloat(el.dataset.target || '0');
    const suffix = el.dataset.suffix || '';
    const dur = 900;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

function setCountUp(el, val, suffix = '') {
  if (!el) return;
  el.dataset.target = val;
  el.dataset.suffix = suffix;
  runCountUps();
}

function showToast(msg) {
  let t = $('.cg-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'cg-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function facilityLink(slug) {
  if (['dk12', 'fluid-lab', 'tutorial-t3'].includes(slug)) return `attendance.html#${slug}`;
  if (slug === 'library-l2' || slug === 'dewan-utama') return `realtime.html#${slug}`;
  return `navigation.html?dest=${slug}`;
}

function listItem({ icon = '◉', title, sub, tag, tagClass = '', href = '#' }) {
  return `<a href="${href}" class="list-item">
    <div class="li-icon">${icon}</div>
    <div class="li-body"><div class="li-title">${esc(title)}</div><div class="li-sub">${esc(sub)}</div></div>
    ${tag ? `<div class="li-tag ${tagClass}">${esc(tag)}</div>` : ''}
  </a>`;
}

function initPrefToggles() {
  $$('.toggle-row[data-pref]').forEach(row => {
    const sw = $('.switch', row);
    if (!sw) return;
    sw.addEventListener('click', async () => {
      sw.classList.toggle('on');
      const key = row.dataset.pref;
      if (!key || !CampusAPI.getToken()) return;
      try {
        await CampusAPI.updatePreferences({ [key]: sw.classList.contains('on') });
        showToast('Preference saved');
      } catch (e) { showToast(e.message); }
    });
  });
}

async function applyPrefsToToggles(prefs) {
  if (!prefs) return;
  $$('.toggle-row[data-pref]').forEach(row => {
    const key = row.dataset.pref;
    const sw = $('.switch', row);
    if (sw && prefs[key] !== undefined) sw.classList.toggle('on', prefs[key]);
  });
}

function initLiveClock() {
  const liveClocks = $$('.live-seconds');
  if (!liveClocks.length) return;
  async function tick() {
    try {
      const { last_sync } = await CampusAPI.request('/meta/sync');
      const secs = Math.max(0, Math.floor((Date.now() - new Date(last_sync + 'Z').getTime()) / 1000));
      liveClocks.forEach(el => { el.textContent = secs + 's ago'; });
    } catch {
      liveClocks.forEach(el => { el.textContent = 'live'; });
    }
  }
  tick();
  setInterval(tick, 5000);
}

// ---- Home ----
async function loadHome() {
  const data = await CampusAPI.home();
  const g = $('.greeting');
  if (g) g.textContent = data.greeting;
  const banner = $('.core-banner .cb-sub');
  if (banner) banner.textContent = `${data.grid.headcount} on grid · ${data.attendance_summary.classes_logged}/${data.attendance_summary.total_expected} classes logged today`;

  const seeAll = $('.section-label .see-all');
  if (seeAll) {
    const label = seeAll.parentElement;
    let sib = label.nextElementSibling;
    while (sib && !sib.classList.contains('section-label')) {
      const next = sib.nextElementSibling;
      if (sib.classList.contains('list-item')) sib.remove();
      sib = next;
    }
    data.live_facilities.slice(0, 3).forEach(f => {
      const icon = ['dk12', 'fluid-lab', 'tutorial-t3'].includes(f.slug) ? '◈' : '◉';
      label.insertAdjacentHTML('afterend', listItem({
        icon,
        title: f.name,
        sub: f.subtitle || `${f.current_count} people · RFID snapshot`,
        tag: f.pct ? f.pct + '%' : f.status,
        tagClass: f.tag || '',
        href: facilityLink(f.slug)
      }));
    });
  }

  const homeSearch = $('#homeSearchInput');
  if (homeSearch) {
    homeSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter' && homeSearch.value.trim()) {
        window.location.href = 'directory.html?q=' + encodeURIComponent(homeSearch.value.trim());
      }
    });
  }
}

// ---- Navigation ----
async function loadNavigation() {
  const params = new URLSearchParams(location.search);
  const dest = params.get('dest') || 'dk12';
  const mode = params.get('mode') || 'standard';

  const originInput = $$('.search-bar input')[0];
  const destInput = $$('.search-bar input')[1];
  if (originInput) { originInput.removeAttribute('readonly'); originInput.value = 'Your Location'; }
  if (destInput) { destInput.removeAttribute('readonly'); }

  async function fetchRoute() {
    const to = params.get('dest') || destInput?.value.split('—')[0].trim().toLowerCase().replace(/\s+/g, '-') || dest;
    const route = await CampusAPI.route(to, mode);
    if (destInput) destInput.value = route.destination.name + (route.destination.subtitle ? ' — ' + route.destination.subtitle.split('·')[0] : '');

    const mins = $('.stat-row .stat-box .num');
    if (mins) setCountUp(mins, route.walking_minutes, ' min');
    const dist = $$('.stat-row .stat-box .num')[1];
    if (dist) setCountUp(dist, route.distance_m, 'm');

    const stepsEl = $('.route-steps');
    if (stepsEl) {
      stepsEl.innerHTML = '<div class="route-line"></div>' + route.steps.map(s => `
        <div class="route-step">
          <div class="route-dot">${s.num}</div>
          <div><div class="rs-title">${esc(s.title)}</div><div class="rs-sub">${esc(s.sub)}</div></div>
        </div>`).join('');
      $$('.route-step', stepsEl).forEach((el, i) => { el.classList.add('reveal'); el.style.animationDelay = (i * 0.05) + 's'; });
    }

    const path = $('svg path');
    if (path && route.path) path.setAttribute('d', route.path.replace(/^M/, 'M').split(' L').join(' L'));

    return route;
  }

  await fetchRoute();

  if (destInput) {
    destInput.addEventListener('change', async () => {
      const slug = destInput.dataset.slug || dest;
      params.set('dest', slug);
      history.replaceState(null, '', '?' + params);
      await fetchRoute();
    });
  }

  const startBtn = $('.btn.solid');
  if (startBtn && startBtn.tagName === 'BUTTON') {
    startBtn.addEventListener('click', async () => {
      const to = params.get('dest') || dest;
      try {
        await CampusAPI.startNavigation(to, originInput?.value, mode);
        startBtn.textContent = 'Navigation Active ✓';
        startBtn.style.background = 'var(--teal)';
        showToast('Route started — follow turn-by-turn');
      } catch (e) { showToast(e.message); }
    });
  }
}

// ---- Directory ----
async function loadDirectory() {
  const searchInput = $('.search-bar input');
  const params = new URLSearchParams(location.search);
  if (params.get('q') && searchInput) searchInput.value = params.get('q');

  const listContainer = document.createElement('div');
  listContainer.id = 'dirResults';
  const label = $('.section-label');
  if (label) label.after(listContainer);

  async function render(q, type) {
    const typeMap = { All: 'all', Rooms: 'rooms', Staff: 'staff', Labs: 'labs', Services: 'services' };
    const rows = await CampusAPI.directory(q, typeMap[type] || 'all');
    listContainer.innerHTML = rows.map(r => listItem({
      icon: '▦',
      title: r.name,
      sub: r.subtitle,
      tag: 'Route →',
      href: `navigation.html?dest=${r.slug}`
    })).join('') || '<div class="card dim-card"><div class="dim-text">No results found.</div></div>';
    $$('.list-item', listContainer).forEach((el, i) => { el.classList.add('reveal'); el.style.animationDelay = (i * 0.04) + 's'; });
  }

  await render(params.get('q') || '', 'All');

  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const chip = $('.chip-row .chip.active');
        render(searchInput.value.trim(), chip?.textContent.trim() || 'All');
      }, 250);
    });
  }

  const chipRow = $('.chip-row');
  if (chipRow) {
    chipRow.addEventListener('chipchange', e => {
      render(searchInput?.value.trim() || '', e.detail.label);
    });
  }

  // Remove old static items
  $$('a.list-item[href="navigation.html"]').forEach(el => {
    if (!el.closest('#dirResults')) el.remove();
  });
  if (label) label.textContent = 'Search Results';
}

// ---- Assistant ----
async function loadAssistant() {
  const chatScroll = $('#chatScroll');
  const tt = await CampusAPI.timetable();

  const uploadSub = $('.upload-sub');
  if (uploadSub && tt.timetable) {
    uploadSub.textContent = `${tt.timetable.filename} · parsed ${tt.timetable.class_count} classes, ${tt.timetable.location_count} locations`;
  }

  // Hidden file input for timetable re-upload
  const uploadCard = $('.upload-card');
  if (uploadCard) {
    uploadCard.style.cursor = 'pointer';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.ics,.csv,.pdf';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
    uploadCard.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      try {
        const r = await CampusAPI.uploadTimetable(fileInput.files[0]);
        if (uploadSub) uploadSub.textContent = `${r.filename} · parsed ${r.class_count} classes, ${r.location_count} locations`;
        showToast('Timetable synced');
      } catch (e) { showToast(e.message); }
    });
  }

  function addBubble(text, who, route, routeDest, routeHref, routeMode) {
    const b = document.createElement('div');
    b.className = 'bubble ' + who + ' reveal';
    b.textContent = text;
    if (route) {
      const chipEl = document.createElement('div');
      chipEl.className = 'route-chip';
      chipEl.textContent = route;
      chipEl.style.cursor = 'pointer';
      chipEl.addEventListener('click', () => {
        if (routeHref) location.href = routeHref;
        else location.href = `navigation.html?dest=${routeDest || 'dk12'}${routeMode ? '&mode=' + routeMode : ''}`;
      });
      b.appendChild(chipEl);
    }
    chatScroll.appendChild(b);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  async function sendMessage(q) {
    if (!q.trim()) return;
    addBubble(q, 'user');
    try {
      const r = await CampusAPI.chat(q);
      addBubble(r.text, 'bot', r.route, r.route_dest, r.route_href, r.route_mode);
    } catch (e) {
      addBubble('Sorry, I could not reach the grid right now.', 'bot');
    }
  }

  $$('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      sendMessage(chip.textContent.trim());
      chip.classList.add('used');
      chip.style.opacity = '0.35';
      chip.style.pointerEvents = 'none';
    });
  });

  const input = $('.chat-input-row input');
  const sendBtn = $('.chat-input-row button');
  if (sendBtn) sendBtn.addEventListener('click', () => { sendMessage(input.value); input.value = ''; });
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { sendMessage(input.value); input.value = ''; } });
}

// ---- Realtime ----
async function loadRealtime() {
  const [walkways, facilities, events] = await Promise.all([
    CampusAPI.walkways(),
    CampusAPI.facilities(),
    CampusAPI.events()
  ]);

  const paceLabel = $$('.section-label').find(el => el.textContent.includes('Walkway'));
  if (paceLabel) {
    let el = paceLabel.nextElementSibling;
    while (el && !el.classList.contains('section-label')) {
      const next = el.nextElementSibling;
      if (el.classList.contains('pace-card')) el.remove();
      el = next;
    }
    walkways.forEach(w => {
      const cls = w.status === 'slow' ? 'slow' : w.status === 'clear' ? 'fast' : 'normal';
      paceLabel.insertAdjacentHTML('afterend', `
        <div class="pace-card">
          <div class="pace-head"><div class="pace-name">${esc(w.name)}</div><div class="pace-val">${w.pace} m/s · ${esc(w.status)}</div></div>
          <div class="pace-bar"><div class="pace-fill ${cls}"></div></div>
        </div>`);
    });
  }

  const facLabel = $$('.section-label').find(el => el.textContent.includes('Facility'));
  if (facLabel) {
    let el = facLabel.nextElementSibling;
    while (el && !el.classList.contains('section-label')) {
      const next = el.nextElementSibling;
      if (el.classList.contains('list-item')) el.remove();
      el = next;
    }
    facilities.forEach(f => {
      facLabel.insertAdjacentHTML('afterend', listItem({
        icon: ['lecture', 'lab', 'tutorial'].includes(f.type) ? '◈' : '◉',
        title: f.name,
        sub: f.subtitle,
        tag: f.pct ? f.pct + '%' : f.status,
        tagClass: f.tag || '',
        href: ['lecture', 'lab', 'tutorial'].includes(f.type) ? `attendance.html#${f.slug}` : `realtime.html#${f.slug}`
      }));
    });
  }

  const evLabel = $$('.section-label').find(el => el.textContent.includes('Events'));
  if (evLabel) {
    let el = evLabel.nextElementSibling;
    while (el && !el.classList.contains('bottom-nav')) {
      const next = el.nextElementSibling;
      if (el.classList.contains('list-item')) el.remove();
      el = next;
    }
    events.forEach(ev => {
      evLabel.insertAdjacentHTML('afterend', listItem({
        icon: '✦',
        title: ev.title,
        sub: ev.subtitle,
        tag: 'Today',
        href: ev.location_slug ? facilityLink(ev.location_slug) : 'realtime.html'
      }));
    });
  }

  const chipRow = $('.chip-row');
  if (chipRow) {
    chipRow.addEventListener('chipchange', async e => {
      const facs = await CampusAPI.facilities(e.detail.label);
      if (!facLabel) return;
      let el = facLabel.nextElementSibling;
      while (el && !el.classList.contains('section-label')) {
        const next = el.nextElementSibling;
        if (el.classList.contains('list-item')) el.remove();
        el = next;
      }
      facs.forEach(f => {
        facLabel.insertAdjacentHTML('afterend', listItem({
          icon: '◈',
          title: f.name,
          sub: f.subtitle,
          tag: f.pct ? f.pct + '%' : f.status,
          tagClass: f.tag || '',
          href: `attendance.html#${f.slug}`
        }));
      });
    });
  }
}

// ---- Attendance ----
async function loadAttendance() {
  const [me, occ, alerts] = await Promise.all([
    CampusAPI.attendanceMe(),
    CampusAPI.occupancy(),
    CampusAPI.alerts()
  ]);

  const heroStat = $('.hero-stat');
  const heroSub = $('.hero-sub');
  if (heroStat) heroStat.textContent = `${me.status} · ${me.classes_logged} / ${me.total_expected} classes`;
  if (heroSub && me.last_tap) heroSub.textContent = `Last tap: ${me.last_tap.facility} doorway · ${fmtTime(me.last_tap.time)}`;

  const nums = $$('.stat-row .stat-box .num');
  if (nums[0]) setCountUp(nums[0], me.grid.headcount, '');
  if (nums[1]) setCountUp(nums[1], me.grid.active_doorways, '');

  const occLabel = $$('.section-label').find(el => el.textContent.includes('Occupancy'));
  if (occLabel) {
    let el = occLabel.nextElementSibling;
    while (el && !el.classList.contains('section-label')) {
      const next = el.nextElementSibling;
      if (el.classList.contains('occ-card')) el.remove();
      el = next;
    }
    occ.forEach(f => {
      const fillCls = f.pct >= 90 ? 'full' : f.pct >= 70 ? '' : f.pct >= 50 ? 'moderate' : '';
      const tag = f.pct >= 90 ? 'Full' : f.pct >= 70 ? 'Busy' : f.pct >= 50 ? 'Moderate' : 'Free';
      occLabel.insertAdjacentHTML('afterend', `
        <a href="realtime.html#${f.slug}" class="occ-card" id="${f.slug}" style="display:block;color:inherit;">
          <div class="occ-head">
            <div><div class="occ-title">${esc(f.name)}</div><div class="occ-sub">${esc(f.session_info || f.subtitle)} · ${f.current_count} / ${f.capacity} seats</div></div>
            <div class="li-tag ${f.tag || ''}">${tag}</div>
          </div>
          <div class="occ-bar"><div class="occ-fill ${fillCls}" style="width:${f.pct}%;"></div></div>
          <div class="occ-meta">RFID snapshot · ${f.current_count} people · 1 min ago</div>
        </a>`);
    });
  }

  const alertLabel = $$('.section-label').find(el => el.textContent.includes('Integrity'));
  if (alertLabel) {
    let el = alertLabel.nextElementSibling;
    while (el && !el.classList.contains('card')) {
      const next = el.nextElementSibling;
      if (el.classList.contains('flag-card')) el.remove();
      el = next;
    }
    alerts.forEach(a => {
      alertLabel.insertAdjacentHTML('afterend', `
        <div class="flag-card">
          <div class="flag-icon">⚠</div>
          <div><div class="flag-title">Doorway ${esc(a.doorway)} · ${fmtTime(a.flagged_at)}</div>
          <div class="flag-sub">${esc(a.description)}</div></div>
        </div>`);
    });
  }

  if (location.hash) {
    const target = $(location.hash);
    target?.scrollIntoView({ behavior: 'smooth' });
  }
}

// ---- Sustainability ----
async function loadSustainability() {
  const data = await CampusAPI.sustainability();
  await applyPrefsToToggles(data.preferences);

  const gauge = $('.gauge-num');
  if (gauge) setCountUp(gauge, data.stats.walkability_score, '');

  const statNums = $$('.stat-row .stat-box .num');
  if (statNums[0]) setCountUp(statNums[0], data.stats.co2_kg, ' kg');
  if (statNums[1]) setCountUp(statNums[1], data.stats.distance_km, ' km');

  const lbLabel = $$('.section-label').find(el => el.textContent.includes('Leaderboard'));
  if (lbLabel) {
    let el = lbLabel.nextElementSibling;
    while (el && !el.classList.contains('section-label')) {
      const next = el.nextElementSibling;
      if (el.classList.contains('leader-row') || (el.classList.contains('toggle-row') && el.dataset.pref)) {
        if (el.classList.contains('leader-row')) el.remove();
      }
      el = next;
    }
    const toggle = lbLabel.nextElementSibling?.classList.contains('toggle-row') ? lbLabel.nextElementSibling : null;
    data.leaderboard.forEach(l => {
      (toggle || lbLabel).insertAdjacentHTML('afterend', `
        <div class="leader-row${l.display_name.includes('(you)') ? ' you' : ''}">
          <div class="leader-rank${l.rank_num > 2 ? ' dim-rank' : ''}">${l.rank_num}</div>
          <div class="leader-body"><div class="leader-name">${esc(l.display_name)}</div><div class="leader-steps">${l.steps.toLocaleString()} steps</div></div>
        </div>`);
    });
  }

  const chart = $('.bar-chart');
  if (chart && data.history.length) {
    const max = Math.max(...data.history.map(h => h.distance_km), 0.1);
    chart.innerHTML = data.history.map(h => {
      const pct = Math.round((h.distance_km / max) * 100);
      return `<div class="bar" style="height:${Math.max(pct, 8)}%;"><span>${h.distance_km}</span></div>`;
    }).join('');
    const lbls = $('.bar-chart-lbls');
    if (lbls) lbls.innerHTML = data.history.map(h => `<div>${h.day_label}</div>`).join('');
  }

  // Wire leaderboard toggle
  const lbToggle = $$('.toggle-row[data-pref="show_name_leaderboard"] .switch')[0];
  if (lbToggle) {
    lbToggle.addEventListener('click', () => setTimeout(loadSustainability, 400));
  }
}

// ---- Accessibility ----
async function loadAccessibility() {
  const prefs = await CampusAPI.preferences();
  await applyPrefsToToggles(prefs);

  const route = await CampusAPI.accessibleRoute('dewan-utama');
  const stepsEl = $('.route-steps');
  if (stepsEl && route?.steps) {
    stepsEl.innerHTML = '<div class="route-line"></div>' + route.steps.map(s => `
      <div class="route-step"><div class="route-dot">${s.num}</div>
      <div><div class="rs-title">${esc(s.title)}</div><div class="rs-sub">${esc(s.sub)}</div></div></div>`).join('');
  }

  const entLabel = $$('.section-label').find(el => el.textContent.includes('Entrances'));
  if (entLabel) {
    const entrances = await CampusAPI.entrances();
    let el = entLabel.nextElementSibling;
    while (el && !el.style?.marginTop) {
      const next = el.nextElementSibling;
      if (el.classList.contains('list-item')) el.remove();
      el = next;
    }
    entrances.forEach(e => {
      entLabel.insertAdjacentHTML('afterend', listItem({
        icon: '♿',
        title: e.name,
        sub: e.subtitle,
        tag: e.status === 'open' ? 'Open' : 'Closed',
        tagClass: 'free',
        href: `navigation.html?dest=${e.slug}&mode=accessible`
      }));
    });
  }

  const startLink = $('a.btn.solid');
  if (startLink) startLink.href = 'navigation.html?dest=dewan-utama&mode=accessible';
}

// ---- Settings ----
async function loadSettings() {
  const [settings, logs] = await Promise.all([CampusAPI.settings(), CampusAPI.logs()]);
  $('#setName').textContent = settings.user.name;
  $('#setEmail').textContent = settings.user.email;
  $('#setRfid').textContent = settings.user.rfid_tag || '—';
  await applyPrefsToToggles(settings.preferences);

  const logList = $('#logList');
  if (logList) {
    logList.innerHTML = logs.slice(0, 10).map(l => `
      <div class="list-item" style="pointer-events:none;">
        <div class="li-icon">◉</div>
        <div class="li-body"><div class="li-title">${esc(l.action)}</div><div class="li-sub">${esc(l.details || '')} · ${fmtTime(l.created_at)}</div></div>
      </div>`).join('') || '<div class="card dim-card"><div class="dim-text">No activity yet.</div></div>';
  }

  $('#logoutBtn')?.addEventListener('click', () => {
    CampusAPI.setToken(null);
    CampusAPI.setUser(null);
    window.location.href = 'login.html';
  });
}
