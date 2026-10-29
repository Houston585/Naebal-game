// Связь с сервером: REST для команд, SSE для получения состояния.
const tokenKey = (code) => `labean:token:${code}`;

export const tokens = {
  get(code) { try { return localStorage.getItem(tokenKey(code)); } catch { return null; } },
  set(code, t) { try { localStorage.setItem(tokenKey(code), t); } catch { /* приватный режим */ } },
};

async function post(path, body) {
  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'Нет связи с сервером. Проверьте подключение — действие не отправлено.' };
  }
  try { return await res.json(); } catch { return { ok: false, error: `Сервер ответил ошибкой ${res.status}.` }; }
}

export const api = {
  createRoom: (name) => post('/api/rooms', { name }),
  join: (code, name) => post(`/api/rooms/${encodeURIComponent(code)}/join`, { name }),
};

export class ServerClient {
  constructor(code, token) {
    this.code = code;
    this.token = token;
    this.listeners = new Set();
    this.status = 'connecting';
    this.cmdSeq = 0;
  }
  base() { return `/api/rooms/${encodeURIComponent(this.code)}`; }
  onUpdate(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(data) {
    this.last = data;
    this.clockOffset = data.lobby?.serverNow ? data.lobby.serverNow - Date.now() : 0;
    for (const fn of this.listeners) fn(data);
  }
  onStatus(fn) { this.statusFn = fn; }
  setStatus(s) { this.status = s; this.statusFn?.(s); }

  connect() {
    this.es?.close();
    this.es = new EventSource(`${this.base()}/events?token=${encodeURIComponent(this.token)}`);
    this.es.addEventListener('state', (e) => { this.setStatus('online'); this.emit(JSON.parse(e.data)); });
    this.es.onerror = () => { this.setStatus('offline'); };
  }
  close() { this.es?.close(); }

  async call(action, body = {}) {
    const r = await post(`${this.base()}/${action}`, { token: this.token, ...body });
    if (r.ok && r.lobby) this.emit({ lobby: r.lobby, game: r.game });
    return r;
  }
  faction(f) { return this.call('faction', { faction: f }); }
  settings(s) { return this.call('settings', { settings: s }); }
  testSeats() { return post(`${this.base()}/test-seats`, { token: this.token }); }
  start() { return this.call('start'); }
  command(cmd) {
    // id делает повторную отправку безопасной (двойной клик, повтор после обрыва)
    const id = cmd.id ?? `${Date.now().toString(36)}-${++this.cmdSeq}`;
    return this.call('command', { command: { ...cmd, id } });
  }
}
