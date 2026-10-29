// HTTP-сервер без внешних зависимостей: статика клиента, REST-команды и поток SSE для синхронизации.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager, RoomError } from './rooms.js';
import { Store } from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, 'data', 'rooms');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const subscribers = new Map(); // code -> Set<{ res, token, last }>

export function startServer({ port = PORT, dataDir = DATA_DIR, now } = {}) {
  const manager = new RoomManager({ store: new Store(dataDir), now, onChange: (code) => queueMicrotask(() => broadcast(manager, code)) });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname.startsWith('/api/')) return await api(manager, req, res, url);
      return serveStatic(url.pathname, res);
    } catch (e) {
      console.error(e);
      send(res, 500, { ok: false, error: 'Внутренняя ошибка сервера.' });
    }
  });

  const timer = setInterval(() => manager.tick(), 500);
  const heartbeat = setInterval(() => {
    for (const set of subscribers.values()) for (const s of set) s.res.write(': ping\n\n');
  }, 20000);
  server.on('close', () => { clearInterval(timer); clearInterval(heartbeat); });
  server.listen(port);
  return { server, manager };
}

// ---------------------------------------------------------------- API
async function api(manager, req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',code,action]
  const body = req.method === 'POST' ? await readJson(req) : {};
  const token = body.token ?? url.searchParams.get('token');
  try {
    if (parts[1] === 'health') return send(res, 200, { ok: true, rooms: manager.rooms.size });
    if (parts[1] !== 'rooms') return send(res, 404, { ok: false, error: 'Нет такого адреса.' });
    if (parts.length === 2 && req.method === 'POST') return send(res, 200, { ok: true, ...manager.createRoom(body) });
    const code = decodeURIComponent(parts[2] ?? '').toUpperCase();
    const action = parts[3];
    if (req.method === 'GET' && action === 'events') return sse(manager, req, res, code, token);
    if (req.method === 'GET' && action === 'state') return send(res, 200, { ok: true, ...manager.view(code, token) });
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Метод не поддерживается.' });
    switch (action) {
      case 'join': return send(res, 200, { ok: true, ...manager.join(code, body) });
      case 'faction': manager.chooseFaction(code, token, body.faction ?? null); break;
      case 'settings': manager.updateSettings(code, token, body.settings ?? {}); break;
      case 'test-seats': return send(res, 200, { ok: true, seats: manager.fillTestSeats(code, token) });
      case 'bots': manager.fillBots(code, token); break;
      case 'bots-remove': manager.removeBots(code, token); break;
      case 'start': manager.start(code, token); break;
      case 'command': {
        const r = manager.command(code, token, body.command);
        return send(res, 200, { ok: true, ...r, ...manager.view(code, token) });
      }
      default: return send(res, 404, { ok: false, error: 'Нет такого действия.' });
    }
    return send(res, 200, { ok: true, ...manager.view(code, token) });
  } catch (e) {
    if (e instanceof RoomError) return send(res, e.status, { ok: false, code: e.code, error: e.message });
    throw e;
  }
}

function sse(manager, req, res, code, token) {
  try { manager.view(code, token); } catch (e) {
    if (e instanceof RoomError) return send(res, e.status, { ok: false, code: e.code, error: e.message });
    throw e;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 1500\n\n');
  const sub = { res, token, last: null };
  if (!subscribers.has(code)) subscribers.set(code, new Set());
  subscribers.get(code).add(sub);
  manager.connect(code, token);
  pushTo(manager, code, sub);
  req.on('close', () => {
    subscribers.get(code)?.delete(sub);
    manager.disconnect(code, token);
  });
}

function broadcast(manager, code) {
  const set = subscribers.get(code);
  if (!set) return;
  for (const sub of set) pushTo(manager, code, sub);
}

function pushTo(manager, code, sub) {
  const v = manager.version(code);
  if (sub.last === v) return;
  sub.last = v;
  try {
    const data = JSON.stringify(manager.view(code, sub.token));
    sub.res.write(`event: state\ndata: ${data}\n\n`);
  } catch { /* комната или место исчезли */ }
}

// ---------------------------------------------------------------- статика
function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel.startsWith('/room/')) rel = '/client/index.html';
  const allowed = rel.startsWith('/client/') || rel.startsWith('/shared/') || rel === '/favicon.ico' || rel === '/play.html';
  if (!allowed) return send(res, 404, 'Не найдено', 'text/plain; charset=utf-8');
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Запрещено', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Не найдено', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
  console.log(`Острова Лабеан: http://localhost:${PORT}`);
}
