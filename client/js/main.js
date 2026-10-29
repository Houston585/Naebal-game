// Точка входа клиента: маршрутизация между заставкой, лобби и партией.
import { api, tokens, ServerClient } from './net.js';
import { LocalClient } from './local.js';
import { GameScreen } from './ui/game.js';
import { homeHTML, lobbyHTML } from './ui/screens.js';
import { FACTION_IDS } from '../../shared/config/factions.js';

const root = document.getElementById('app');
const LOCAL_ONLY = !!window.LABEAN_LOCAL_ONLY;
try { if (localStorage.getItem('labean:calm')) document.body.classList.add('calm'); } catch { /* */ }

let client = null;
let screen = null;
let lobbyExtra = {};

function roomFromPath() {
  const m = decodeURIComponent(location.pathname).match(/\/room\/([^/?#]+)/);
  return m ? m[1].toUpperCase() : null;
}

function showHome(error = '') {
  screen?.destroy?.(); screen = null;
  client?.close?.(); client = null;
  const local = new LocalClient();
  root.innerHTML = homeHTML({ localOnly: LOCAL_ONLY, savedLocal: local.hasSaved(), error });
  root.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    if (form.dataset.form === 'create') {
      const r = await api.createRoom(fd.get('name'));
      if (!r.ok) return showHome(r.error);
      tokens.set(r.code, r.token);
      go(`/room/${r.code}`);
    } else if (form.dataset.form === 'join') {
      const code = String(fd.get('code')).trim().toUpperCase();
      const r = await api.join(code, fd.get('name'));
      if (!r.ok) return showHome(r.error);
      tokens.set(r.code, r.token);
      go(`/room/${r.code}`);
    } else if (form.dataset.form === 'local') {
      const shuffled = [...FACTION_IDS].sort(() => Math.random() - 0.5).slice(0, 5);
      let botN = 0;
      const players = [1, 2, 3, 4, 5].map((i) => {
        const bot = i > 1 && fd.get(`bot${i}`) === 'on';
        const name = bot ? `Компьютер ${++botN}` : String(fd.get(`p${i}`) || (i === 1 ? 'Вы' : `Игрок ${i}`)).slice(0, 24);
        return { id: `p${i}`, name, faction: shuffled[i - 1], bot };
      });
      local.newGame(players);
      startLocal(local);
    }
  };
  root.onclick = (e) => {
    if (e.target.closest('[data-act="resume-local"]')) startLocal(local);
  };
}

function startLocal(local) {
  root.onsubmit = null; root.onclick = null;
  client = local;
  screen = new GameScreen(root, client, { onExit: () => { if (local.state?.phase === 'finished') local.reset(); showHome(); } });
  client.onUpdate((d) => screen.update(d));
  client.connect();
}

function go(path) {
  history.pushState({}, '', path);
  route();
}

function route() {
  const code = roomFromPath();
  if (LOCAL_ONLY || !code) return showHome();
  const params = new URLSearchParams(location.search);
  const t = params.get('t');
  if (t) { tokens.set(code, t); history.replaceState({}, '', `/room/${code}`); }
  const token = tokens.get(code);
  if (!token) return showHome('Чтобы войти в комнату, введите её код и своё имя.');
  openRoom(code, token);
}

function openRoom(code, token) {
  root.onsubmit = null; root.onclick = null;
  client = new ServerClient(code, token);
  client.onUpdate((data) => {
    if (!data.game) {
      screen?.destroy?.(); screen = null;
      renderLobby(data);
    } else {
      if (!screen) { root.onclick = null; root.onchange = null; screen = new GameScreen(root, client); }
      screen.update(data);
    }
  });
  client.onStatus(() => screen?.render());
  fetch(`/api/rooms/${encodeURIComponent(code)}/state?token=${encodeURIComponent(token)}`)
    .then((r) => r.json())
    .then((r) => {
      if (!r.ok) return showHome(r.error);
      client.emit(r);
      client.connect();
    })
    .catch(() => showHome('Сервер недоступен.'));
}

function renderLobby(data) {
  root.innerHTML = lobbyHTML(data, lobbyExtra);
  root.onclick = async (e) => {
    const f = e.target.closest('[data-faction]');
    if (f && !f.disabled) {
      const r = await client.faction(f.getAttribute('aria-pressed') === 'true' ? null : f.dataset.faction);
      if (!r.ok) alertBox(r.error);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') { const r = await client.start(); if (!r.ok) alertBox(r.error); }
    if (act === 'bots') { const r = await client.call('bots'); if (!r.ok) alertBox(r.error); return; }
    if (act === 'bots-remove') { const r = await client.call('bots-remove'); if (!r.ok) alertBox(r.error); return; }
    if (act === 'test-seats') {
      const r = await client.testSeats();
      if (!r.ok) return alertBox(r.error);
      lobbyExtra.testLinks = r.seats.map((s) => ({ name: s.name, url: `${location.origin}/room/${encodeURIComponent(client.code)}?t=${s.token}` }));
      renderLobby(client.last);
    }
  };
  root.onchange = async (e) => {
    const el = e.target.closest('[data-setting]');
    if (!el) return;
    const key = el.dataset.setting;
    const val = el.type === 'checkbox' ? { enabled: el.checked } : el.type === 'number' ? Number(el.value) : el.value;
    const r = await client.settings({ rules: { ...data.lobby.settings.rules, [key]: val } });
    if (!r.ok) alertBox(r.error);
  };
}

function alertBox(msg) {
  const s = document.querySelector('.toast-stack') ?? Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toast-stack' });
  const el = document.createElement('div');
  el.className = 'toast toast--error';
  el.innerHTML = `<div></div><div>${String(msg).replace(/</g, '&lt;')}</div>`;
  s.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

window.addEventListener('popstate', route);
route();
