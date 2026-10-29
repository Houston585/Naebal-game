import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, checkIntegrity, unitCensus, legalTargets } from '../shared/engine/game.js';
import { STARTING_ARMY } from '../shared/config/units.js';
import { newGame, readyAll, skipRest, ackAll, cmd, activePlayer, giveUnit } from './helpers.js';

test('старт: у каждого стандартная армия из 10 классических юнитов, резерв 18', () => {
  const s = newGame();
  assert.equal(s.phase, 'prep');
  assert.equal(s.round, 1);
  for (const p of s.order) {
    const types = s.players[p].hand.map((u) => s.units[u].type).sort();
    const expected = STARTING_ARMY.flatMap(([t, n]) => Array(n).fill(t)).sort();
    assert.deepEqual(types, expected);
  }
  assert.equal(unitCensus(s).reserve, 18);
  assert.equal(unitCensus(s).total, 68);
  assert.deepEqual(checkIntegrity(s), []);
});

test('у каждого игрока одна карта топ-оперативника, без повторов', () => {
  const s = newGame();
  const ops = s.order.map((p) => s.players[p].operative.card);
  assert.equal(new Set(ops).size, 5);
});

test('в раунде у каждого игрока 5 ходов по кругу; ход завершается после выставления юнита', () => {
  let s = readyAll(newGame());
  assert.equal(s.phase, 'turns');
  const seen = [];
  while (s.phase === 'turns') {
    const p = activePlayer(s);
    seen.push(p);
    const unit = s.players[p].hand.find((u) => legalTargets(s, p, u).length);
    if (!unit) { s = cmd(s, { type: 'skipTurn', player: p }); continue; }
    const before = s.turn.cycle;
    s = cmd(s, { type: 'placeUnit', player: p, unit, region: legalTargets(s, p, unit)[0] });
    if (s.phase === 'turns') assert.notEqual(activePlayer(s) === p && s.turn.cycle === before, true, 'ход перешёл');
  }
  assert.equal(seen.length, 25);
  for (const p of s.order) assert.equal(seen.filter((x) => x === p).length, 5);
  assert.deepEqual(seen.slice(0, 5), seen.slice(5, 10), 'каждый круг в том же порядке');
  assert.equal(s.phase, 'summary');
  assert.equal(s.lastSummary.battles.length > 0, true);
});

test('5 ходов позволяют сложить силы на одном районе: две пехоты по 1 и 2 = 3 > 2 берут нейтральный район', () => {
  let s = readyAll(newGame());
  const place = (type, region) => {
    const p = activePlayer(s);
    const unit = s.players[p].hand.find((u) => s.units[u].type === type);
    s = cmd(s, { type: 'placeUnit', player: p, unit, region });
  };
  const skip = () => { s = cmd(s, { type: 'skipTurn', player: activePlayer(s) }); };
  place('infantry1', 'L4');            // p1, круг 1
  for (let i = 0; i < 4; i++) skip();
  place('apc2', 'L4');                 // p1, круг 2
  s = skipRest(s);
  const b = s.lastSummary.battles.find((x) => x.region === 'L4');
  assert.equal(b.attacks.p1, 3);
  assert.equal(s.regions.L4.owner, 'p1');
});

test('игрок без юнитов и карт хода пропускается автоматически', () => {
  let s = readyAll(newGame());
  s.players.p2.hand.forEach((u) => { s.units[u].location = 'pool'; s.units[u].holder = null; });
  s.players.p2.hand = [];
  s = cmd(s, { type: 'skipTurn', player: 'p1' });
  assert.equal(activePlayer(s), 'p3');
  assert.ok(s.log.some((e) => e.type === 'turnSkipped' && e.data.reason === 'empty' && e.data.player === 'p2'));
});

test('нельзя ходить не в свой ход', () => {
  const s = readyAll(newGame());
  const other = s.order.find((p) => p !== activePlayer(s));
  const unit = s.players[other].hand[0];
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: other, unit, region: 'L4' }), /не ваш ход/);
});

test('подтверждённое действие нельзя отменить и нельзя выставить второй юнит в этот ход', () => {
  let s = readyAll(newGame());
  const p = activePlayer(s);
  const unit = s.players[p].hand[0];
  s = cmd(s, { type: 'placeUnit', player: p, unit, region: legalTargets(s, p, unit)[0] });
  assert.notEqual(activePlayer(s), p, 'ход перешёл');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: p, unit: s.players[p].hand[0], region: 'L1' }), /не ваш ход/);
  assert.throws(() => applyCommand(s, { type: 'undo', player: p }), /Неизвестная команда/);
});

test('нельзя использовать отсутствующий или уже задействованный юнит', () => {
  let s = readyAll(newGame());
  const p = activePlayer(s);
  const foreign = s.players[s.order.find((x) => x !== p)].hand[0];
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: p, unit: foreign, region: 'L1' }), /нет такого юнита/);
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: p, unit: 'u9999', region: 'L1' }), /нет такого юнита/);
});

test('атака без соседнего своего района отклоняется; ошибка не меняет состояние', () => {
  const s = readyAll(newGame());
  const p = activePlayer(s); // p1 — Синдикат: L1 L2 L5 L12
  const tank = s.players[p].hand.find((u) => s.units[u].type === 'tank');
  const before = JSON.stringify(s);
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: p, unit: tank, region: 'P5' }), /Нет пути/);
  assert.equal(JSON.stringify(s), before);
});

test('морской юнит: только районы с водной границей; с моря — без сухопутного соседства', () => {
  const s = readyAll(newGame());
  const p = activePlayer(s);
  const boat = s.players[p].hand.find((u) => s.units[u].type === 'boat');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: p, unit: boat, region: 'L4' }), /водной границей/);
  assert.ok(legalTargets(s, p, boat).includes('P2'), 'далёкий прибрежный район доступен с моря');
  assert.ok(!legalTargets(s, p, boat).includes('P18'), 'П18 — стенка, но не море');
});

test('защита собственного района без нападения разрешена', () => {
  let s = readyAll(newGame());
  const p = activePlayer(s);
  const unit = s.players[p].hand.find((u) => s.units[u].type === 'apc2');
  s = cmd(s, { type: 'placeUnit', player: p, unit, region: 'L2' });
  assert.equal(s.actions[0].kind, 'defend');
});

test('после раунда все юниты с карты уходят в пул и перераспределяются без дубликатов и потерь', () => {
  let s = readyAll(newGame());
  while (s.phase === 'turns') {
    const p = activePlayer(s);
    const unit = s.players[p].hand[0];
    s = cmd(s, { type: 'placeUnit', player: p, unit, region: legalTargets(s, p, unit)[0] ?? 'L1' });
  }
  assert.equal(s.phase, 'summary');
  assert.equal(unitCensus(s).board, 0);
  s = ackAll(s);
  assert.equal(s.round, 2);
  assert.deepEqual(checkIntegrity(s), []);
  const c = unitCensus(s);
  assert.equal(c.hand, 50);
  assert.equal(c.reserve, 18);
  for (const p of s.order) assert.equal(s.players[p].hand.length, 10, 'распределение поровну');
});

test('в подготовке к 4-му раунду каждый получает по одному доп. юниту из ограниченного пула', () => {
  let s = newGame();
  for (let r = 1; r <= 3; r++) s = ackAll(skipRest(readyAll(s)));
  assert.equal(s.round, 4);
  const c = unitCensus(s);
  assert.equal(c.reserve, 13);
  assert.equal(c.hand, 55);
  for (const p of s.order) assert.equal(s.players[p].hand.length, 11);
  assert.equal(s.log.filter((e) => e.type === 'unitGranted' && e.round === 4).length, 5);
  assert.deepEqual(checkIntegrity(s), []);
});

test('пять раундов в правильном порядке, затем итоговый подсчёт', () => {
  let s = newGame();
  const rounds = [];
  while (s.phase !== 'finished') {
    rounds.push(s.round);
    s = skipRest(readyAll(s));
    s = ackAll(s);
  }
  assert.deepEqual(rounds, [1, 2, 3, 4, 5]);
  assert.ok(s.result);
  // Никто не атаковал: у каждого укрепрайон (2) + три района (3×1) = 5 → общая ничья.
  for (const p of s.order) assert.equal(s.result.scores[p], 5);
  assert.deepEqual(s.result.winners.sort(), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.equal(s.result.draw, true);
});

test('очки: обычный 1, столица 2, нейтральный 0, уничтоженный 0', () => {
  let s = readyAll(newGame());
  s.regions.L4.owner = 'p1';   // нейтральный — 0
  s.regions.L15.owner = 'p1';  // ничейный укрепрайон невыбранной фракции — 2
  s = skipRest(s);
  assert.equal(s.lastSummary.scores.p1, 2 + 3 + 0 + 2);
});

test('таймаут хода пропускает ход; таймаут подготовки завершает подготовку игрока', () => {
  let s = newGame();
  const first = activePlayer(s);
  s = cmd(s, { type: 'timeout' });
  assert.notEqual(activePlayer(s), first);
  s = readyAll(s);
  const p = activePlayer(s);
  s = cmd(s, { type: 'timeout' });
  assert.notEqual(activePlayer(s), p);
  assert.ok(s.log.some((e) => e.type === 'turnSkipped' && e.data.player === p));
});

test('порядок ходов сдвигается каждый раунд (rotate)', () => {
  let s = readyAll(newGame());
  assert.equal(activePlayer(s), 'p1');
  s = ackAll(skipRest(s));
  s = readyAll(s);
  assert.equal(activePlayer(s), 'p2');
});

test('случайное распределение (distribution=random) не теряет юниты', () => {
  let s = newGame({ rules: { distribution: 'random' } });
  for (let r = 1; r <= 3; r++) {
    s = ackAll(skipRest(readyAll(s)));
    assert.deepEqual(checkIntegrity(s), []);
    assert.equal(unitCensus(s).total, 68);
  }
});

test('лимит доп. юнитов: новых копий не создаётся', () => {
  let s = newGame();
  for (const u of Object.values(s.units)) if (u.location === 'reserve') { u.location = 'pool'; }
  for (let r = 1; r <= 3; r++) s = ackAll(skipRest(readyAll(s)));
  assert.equal(unitCensus(s).total, 68);
  assert.ok(s.log.some((e) => e.type === 'reserveEmpty'));
  void giveUnit;
});
