import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, checkIntegrity, unitCensus } from '../shared/engine/game.js';
import { viewFor } from '../shared/engine/views.js';
import { CAPITALS } from '../shared/config/map.js';
import { newGame, createRaw, readyAll, skipRest, ackAll, cmd, forceAction, giveCard, setOperative } from './helpers.js';

const STASH = { stash: { enabled: true, count: 'rest', excludeCapitals: true } };

test('тайники: 5 доп. юнитов остаются на раздачу перед 4-м раундом, 13 спрятаны в разных районах', () => {
  const s = createRaw({ rules: STASH });
  const c = unitCensus(s);
  assert.equal(c.reserve, 5);
  assert.equal(c.stash, 13);
  assert.equal(c.total, 68);
  const spots = Object.keys(s.stash);
  assert.equal(new Set(spots).size, 13);
  for (const f of ['syndicate', 'merchants', 'anarchists', 'pirates', 'enforcers']) assert.ok(!spots.includes(CAPITALS[f]), 'не в укрепрайоне игрока');
  for (const uid of Object.values(s.stash)) assert.equal(s.units[uid].location, 'stash');
});

test('тайники случайны: разные партии — разные районы', () => {
  const a = Object.keys(createRaw({ rules: STASH, seed: 'a' }).stash).sort().join();
  const b = Object.keys(createRaw({ rules: STASH, seed: 'b' }).stash).sort().join();
  assert.notEqual(a, b);
});

test('где лежат тайники, клиент не узнаёт', () => {
  const s = createRaw({ rules: STASH });
  const v = viewFor(s, 'p1');
  const raw = JSON.stringify(v);
  assert.equal(v.stashLeft, 13);
  for (const uid of Object.values(s.stash)) assert.ok(!raw.includes(`"${uid}"`));
  assert.ok(!raw.includes('"stash":{'));
});

test('стартовый выбор тайник не открывает', () => {
  let s = createRaw({ rules: STASH });
  const before = Object.keys(s.stash).length;
  // каждый берёт районы из тестовой раскладки; часть из них может быть с тайником
  s = newGame({ rules: STASH });
  assert.equal(Object.keys(s.stash).length, before);
  assert.ok(!s.log.some((e) => e.type === 'unitGranted'));
});

test('захват района с тайником: юнит уходит захватившему со следующего раунда, событие публичное', () => {
  let s = readyAll(newGame({ rules: STASH }));
  // кладём тайник в нейтральный Л4, захватываем его танком
  const uid = Object.values(s.stash)[0];
  s.stash = { L4: uid };
  forceAction(s, 'p1', 'tank', 'L4');
  s = skipRest(s);
  assert.equal(s.regions.L4.owner, 'p1');
  assert.equal(s.units[uid].location, 'granted');
  assert.equal(s.stash.L4, undefined);
  assert.deepEqual(s.lastSummary.unitRewards.map((r) => r.region), ['L4']);
  const ev = viewFor(s, 'p2').log.find((e) => e.type === 'unitGranted');
  assert.ok(ev.text.includes('тайник'));
  const handBefore = s.players.p1.hand.length;
  s = ackAll(s);
  assert.ok(s.players.p1.hand.includes(uid));
  assert.equal(s.units[uid].holder, 'p1');
  assert.deepEqual(checkIntegrity(s), []);
  void handBefore;
});

test('тайник открывается и при захвате картой', () => {
  let s = newGame({ rules: STASH });
  const uid = Object.values(s.stash)[0];
  s.stash = { P2: uid };
  const op = setOperative(s, 'p1', 'sencha_vovan');
  s = cmd(s, { type: 'playCard', player: 'p1', card: op, target: { region: 'P2' } });
  assert.equal(s.units[uid].holder, 'p1');
});

test('неудачная атака тайник не открывает; уничтоженный район возвращает юнит в резерв', () => {
  let s = readyAll(newGame({ rules: STASH }));
  const [u1, u2] = Object.values(s.stash);
  s.stash = { L4: u1, L7: u2 };
  forceAction(s, 'p1', 'infantry1', 'L4'); // 1 против 2 — не взят
  const c = giveCard(s, 'p1', 'nuke');
  s = cmd(s, { type: 'playCard', player: 'p1', card: c, target: { region: 'L7' } });
  assert.equal(s.units[u2].location, 'reserve');
  s = skipRest(s);
  assert.equal(s.regions.L4.owner, null);
  assert.equal(s.stash.L4, u1);
  assert.equal(unitCensus(s).total, 68);
});

test('полная партия с тайниками сохраняет реестр юнитов', () => {
  let s = newGame({ rules: STASH });
  for (let r = 0; r < 5; r++) { s = skipRest(readyAll(s)); s = ackAll(s); }
  assert.equal(s.phase, 'finished');
  assert.equal(unitCensus(s).total, 68);
  void applyCommand;
});
