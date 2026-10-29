import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RoomManager } from '../server/rooms.js';
import { Store } from '../server/store.js';
import { startServer } from '../server/server.js';
import { activePlayer, legalTargets, draftOptions } from '../shared/engine/game.js';

// Стартовый выбор районов через сервер: каждый берёт первый доступный.
function draftThrough(m, code, tokens) {
  let g = m.rooms.get(code).game;
  while (g.phase === 'draft') {
    m.command(code, tokens[activePlayer(g)], { type: 'draftPick', region: draftOptions(g)[0] });
    g = m.rooms.get(code).game;
  }
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labean-'));
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const m = new RoomManager({ store: new Store(dir), now: clock.now });
  const host = m.createRoom({ name: 'Хост' });
  const tokens = { p1: host.token };
  for (let i = 2; i <= 5; i++) tokens[`p${i}`] = m.join(host.code, { name: `И${i}` }).token;
  return { dir, clock, m, code: host.code, tokens };
}

test('комната: 5 мест, старт только хостом, фракции уникальны', () => {
  const { m, code, tokens } = setup();
  assert.throws(() => m.join(code, { name: 'лишний' }), /заняты/);
  m.chooseFaction(code, tokens.p2, 'pirates');
  assert.throws(() => m.chooseFaction(code, tokens.p3, 'pirates'), /уже выбрали/);
  assert.throws(() => m.start(code, tokens.p2), /создатель/);
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  const v = m.view(code, tokens.p2);
  assert.equal(v.game.players.find((p) => p.id === 'p2').faction, 'pirates');
  assert.equal(new Set(v.game.players.map((p) => p.faction)).size, 5);
});

test('игрок определяется по токену: подмена поля player не работает', () => {
  const { m, code, tokens } = setup();
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  const g = m.rooms.get(code).game;
  const notActive = g.order.find((p) => p !== activePlayer(g));
  assert.throws(() => m.command(code, tokens[notActive], { type: 'ready', player: activePlayer(g) }), /не ваш ход/);
  assert.throws(() => m.command(code, tokens.p1, { type: 'timeout' }), /только серверу/);
  assert.throws(() => m.view(code, 'чужой-токен'), /не участник/);
});

test('сервер отдаёт каждому только его представление', () => {
  const { m, code, tokens } = setup();
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  const raw = JSON.stringify(m.view(code, tokens.p2));
  const g = m.rooms.get(code).game;
  for (const uid of g.players.p1.hand) assert.ok(!raw.includes(`"${uid}"`));
  assert.ok(!raw.includes(tokens.p1), 'чужие токены не утекают');
});

test('повторный запрос с тем же id команды не выполняется дважды', () => {
  const { m, code, tokens } = setup();
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  let g = m.rooms.get(code).game;
  while (g.phase === 'prep') { m.command(code, tokens[activePlayer(g)], { type: 'ready', id: `r${g.version}` }); g = m.rooms.get(code).game; }
  const p = activePlayer(g);
  const unit = g.players[p].hand[0];
  const region = legalTargets(g, p, unit)[0];
  const r1 = m.command(code, tokens[p], { type: 'placeUnit', unit, region, id: 'click-1' });
  const r2 = m.command(code, tokens[p], { type: 'placeUnit', unit, region, id: 'click-1' });
  assert.equal(r1.duplicate, false);
  assert.equal(r2.duplicate, true);
  assert.equal(m.rooms.get(code).game.actions.length, 1);
});

test('сохранение и восстановление: перезапуск сервера продолжает партию', () => {
  const { dir, m, code, tokens, clock } = setup();
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  const g = m.rooms.get(code).game;
  m.command(code, tokens[activePlayer(g)], { type: 'ready' });
  const v1 = m.rooms.get(code).game.version;
  const m2 = new RoomManager({ store: new Store(dir), now: clock.now });
  const g2 = m2.rooms.get(code).game;
  assert.equal(g2.version, v1);
  assert.deepEqual(g2.players.p1.hand, m.rooms.get(code).game.players.p1.hand);
  // продолжение работает
  m2.command(code, tokens[activePlayer(g2)], { type: 'ready' });
  assert.equal(m2.rooms.get(code).game.version, v1 + 1);
});

test('таймер стартового выбора: по истечении район закрепляется случайно', () => {
  const { m, code, tokens, clock } = setup();
  m.updateSettings(code, tokens.p1, { rules: { draftSeconds: 20 } });
  m.start(code, tokens.p1);
  for (const t of Object.values(tokens)) m.connect(code, t);
  clock.advance(21_000);
  m.tick();
  const g = m.rooms.get(code).game;
  assert.equal(activePlayer(g), 'p2');
  assert.equal(g.draft.picks.p1.length, 1);
});

test('таймер хода: по истечении ход пропускается', () => {
  const { m, code, tokens, clock } = setup();
  m.updateSettings(code, tokens.p1, { rules: { turnSeconds: 30, prepSeconds: 10 } });
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  for (const t of Object.values(tokens)) m.connect(code, t);
  const first = activePlayer(m.rooms.get(code).game);
  clock.advance(11_000);
  m.tick();
  assert.notEqual(activePlayer(m.rooms.get(code).game), first);
});

test('отключение: после паузы ход отключившегося пропускается; подтверждённые действия сохраняются', () => {
  const { m, code, tokens, clock } = setup();
  m.updateSettings(code, tokens.p1, { rules: { turnSeconds: 0, prepSeconds: 0, reconnectGraceSeconds: 20 } });
  m.start(code, tokens.p1);
  draftThrough(m, code, tokens);
  for (const t of Object.values(tokens)) m.connect(code, t);
  let g = m.rooms.get(code).game;
  while (g.phase === 'prep') { m.command(code, tokens[activePlayer(g)], { type: 'ready' }); g = m.rooms.get(code).game; }
  const p = activePlayer(g);
  const unit = g.players[p].hand[0];
  m.command(code, tokens[p], { type: 'placeUnit', unit, region: legalTargets(g, p, unit)[0] });
  const next = activePlayer(m.rooms.get(code).game);
  m.disconnect(code, tokens[next]);
  clock.advance(10_000); m.tick();
  assert.equal(activePlayer(m.rooms.get(code).game), next, 'ещё ждём');
  m.disconnect(code, tokens[p]); // отключение уже походившего ничего не отменяет
  clock.advance(11_000); m.tick();
  g = m.rooms.get(code).game;
  assert.notEqual(activePlayer(g), next, 'ход пропущен');
  assert.equal(g.actions.length, 1, 'подтверждённое действие сохранилось');
});

test('HTTP: создание комнаты, подключение, состояние и SSE', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labean-http-'));
  const { server } = startServer({ port: 0, dataDir: dir });
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    const host = await post('/api/rooms', { name: 'Хост' });
    assert.ok(host.ok && host.code && host.token);
    const enc = encodeURIComponent(host.code);
    const seats = await post(`/api/rooms/${enc}/test-seats`, { token: host.token });
    assert.equal(seats.seats.length, 4);
    const started = await post(`/api/rooms/${enc}/start`, { token: host.token });
    assert.equal(started.game.phase, 'draft', 'партия начинается со стартового выбора районов');
    assert.equal(started.game.draft.options.length, 31);
    const bad = await post(`/api/rooms/${enc}/command`, { token: seats.seats[2].token, command: { type: 'ready' } });
    assert.equal(bad.ok, false);
    const res = await fetch(`${base}/api/rooms/${enc}/events?token=${host.token}`);
    const reader = res.body.getReader();
    const { value } = await reader.read();
    assert.ok(new TextDecoder().decode(value).length > 0);
    await reader.cancel();
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    const code2 = await fetch(`${base}/server/rooms.js`);
    assert.equal(code2.status, 404, 'серверный код не раздаётся');
    const data = await fetch(`${base}/data/rooms/x.json`);
    assert.equal(data.status, 404);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('компьютер: создатель заполняет места ботами, боты ходят сами, человек может доиграть', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labean-bots-'));
  let t = 1_000_000;
  const m = new RoomManager({ store: new Store(dir), now: () => t });
  const host = m.createRoom({ name: 'Я' });
  m.updateSettings(host.code, host.token, { rules: { turnSeconds: 0, prepSeconds: 0, draftSeconds: 0 } });
  m.fillBots(host.code, host.token);
  const v = m.view(host.code, host.token);
  assert.equal(v.lobby.seats.length, 5);
  assert.equal(v.lobby.seats.filter((s) => s.bot).length, 4);
  // друг может войти — он вытесняет одного компьютера
  const friend = m.join(host.code, { name: 'Друг' });
  assert.equal(m.view(host.code, host.token).lobby.seats.filter((s) => s.bot).length, 3);
  m.start(host.code, host.token);
  const humans = { p1: host.token, [friend.playerId]: friend.token };
  let guard = 0;
  while (m.rooms.get(host.code).status === 'playing' && guard++ < 5000) {
    const g = m.rooms.get(host.code).game;
    const a = activePlayer(g);
    if (g.phase === 'summary') {
      for (const [pid, tok] of Object.entries(humans)) if (!g.summaryAcks[pid]) m.command(host.code, tok, { type: 'ackSummary' });
    } else if (humans[a]) {
      const cmd = g.phase === 'draft' ? { type: 'draftPick', region: draftOptions(g)[0] }
        : g.phase === 'prep' ? { type: 'ready' } : g.phase === 'redirect' ? { type: 'redirectDone' } : { type: 'skipTurn' };
      m.command(host.code, humans[a], cmd);
    }
    t += 1000;
    m.tick();
  }
  const g = m.rooms.get(host.code).game;
  assert.equal(g.phase, 'finished');
  assert.ok(g.players.p2.bot || g.players.p3.bot);
});
