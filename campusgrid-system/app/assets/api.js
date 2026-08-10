const API_BASE = window.location.origin + '/api';

const CampusAPI = {
  getToken() {
    return localStorage.getItem('cg_token');
  },

  setToken(token) {
    if (token) localStorage.setItem('cg_token', token);
    else localStorage.removeItem('cg_token');
  },

  getUser() {
    try { return JSON.parse(localStorage.getItem('cg_user')); } catch { return null; }
  },

  setUser(user) {
    if (user) localStorage.setItem('cg_user', JSON.stringify(user));
    else localStorage.removeItem('cg_user');
  },

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const token = this.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
      this.setToken(null);
      this.setUser(null);
      if (!window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
      }
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  login(matrixId, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ matrix_id: matrixId, email: matrixId, password })
    });
  },

  register(email, password, name) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
  },

  registerForm(formData) {
    return this.request('/auth/register', { method: 'POST', body: formData });
  },

  me() { return this.request('/auth/me'); },
  home() { return this.request('/home'); },
  directory(q, type) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    return this.request('/directory?' + params);
  },
  route(to, mode) {
    const params = new URLSearchParams({ to });
    if (mode) params.set('mode', mode);
    return this.request('/routes?' + params);
  },
  startNavigation(to, from, mode) {
    return this.request('/navigation/start', { method: 'POST', body: JSON.stringify({ to, from, mode }) });
  },
  walkways() { return this.request('/walkways'); },
  facilities(type) {
    const params = type ? '?type=' + encodeURIComponent(type) : '';
    return this.request('/facilities' + params);
  },
  events() { return this.request('/events'); },
  attendanceMe() { return this.request('/attendance/me'); },
  occupancy() { return this.request('/attendance/occupancy'); },
  alerts() { return this.request('/attendance/alerts'); },
  timetable() { return this.request('/timetable'); },
  uploadTimetable(file) {
    const fd = new FormData();
    fd.append('file', file);
    return this.request('/timetable/upload', { method: 'POST', body: fd, headers: {} });
  },
  addClass(payload) {
    return this.request('/timetable/classes', { method: 'POST', body: JSON.stringify(payload) });
  },
  chat(message) {
    return this.request('/assistant/chat', { method: 'POST', body: JSON.stringify({ message }) });
  },
  hub() { return this.request('/me/hub'); },
  distances() { return this.request('/distances'); },
  addDistance(payload) {
    return this.request('/distances', { method: 'POST', body: JSON.stringify(payload) });
  },
  deleteDistance(id) {
    return this.request('/distances/' + id, { method: 'DELETE' });
  },
  entrances() { return this.request('/accessibility/entrances'); },
  accessibleRoute(to) { return this.request('/accessibility/route?to=' + encodeURIComponent(to || 'dewan-utama')); },
  sustainability() { return this.request('/sustainability'); },
  preferences() { return this.request('/users/me/preferences'); },
  updatePreferences(prefs) {
    return this.request('/users/me/preferences', { method: 'PATCH', body: JSON.stringify(prefs) });
  },
  settings() { return this.request('/settings'); },
  logs() { return this.request('/logs'); },
  rfidTap(doorway, facility_slug, class_name) {
    return this.request('/rfid/tap', { method: 'POST', body: JSON.stringify({ doorway, facility_slug, class_name }) });
  }
};

window.CampusAPI = CampusAPI;
