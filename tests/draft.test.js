import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, activePlayer, draftOptions, unitCensus } from '../shared/engine/game.js';
import { viewFor } from '../shared/engine/views.js';
import { REGION_IDS } from '../shared/engine/board.js';
import { createRaw, newGame, cmd, readyAll, skipRest } from './helpers.js';

const pick = (s, region) => cmd(s, { type: 'draftPick', player: activePlayer(s), region });

test('ТЗ 11: каждый по очереди выбирает три района — 3 круга по 5 игроков', () => {
  let s = createRaw();
  const seen = [];
  const free = ['L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L11', 'L12', 'L13', 'L14', 'L16', 'L17', 'L18'];
  for (const r of free) {
    seen.push(activePlayer(s));
    s = pick(s, r);
  }
  assert.deepEqual(seen, ['p1', 'p2', 'p3', 'p4', 'p5', 'p1', 'p2', 'p3', 'p4', 'p5', 'p1', 'p2', 'p3', 'p4', 'p5']);
  assert.equal(s.phase, 'prep', 'после выбора начинается подготовка первого раунда');
  assert.equal(s.round, 1);
  for (const p of s.order) assert.equal(REGION_IDS.filter((r) => s.regions[r].owner === p).length, 4, `${p}: укрепрайон + 3`);
});

test('район не может принадлежать двоим: занятый и укрепрайон активной фракции выбрать нельзя', () => {
  let s = createRaw();
  assert.throws(() => applyCommand(s, { type: 'draftPick', player: 'p1', region: 'L9' }), /уже занят/);
  s = pick(s, 'L2');
  assert.throws(() => applyCommand(s, { type: 'draftPick', player: 'p2', region: 'L2' }), /уже занят/);
  assert.throws(() => applyCommand(s, { type: 'draftPick', player: 'p3', region: 'L3' }), /не ваш ход/);
});

test('доступны все белые районы: нейтральные, чужие исходные, укрепрайон невыбранной фракции', () => {
  let s = createRaw();
  assert.equal(draftOptions(s).length, 31);
  s = pick(s, 'L4');   // Лес
  s = pick(s, 'L15');  // укрепрайон Аристократов — фракция не в игре
  s = pick(s, 'P2');   // исходно Матриархат
  assert.equal(s.regions.L4.owner, 'p1');
  assert.equal(s.regions.L15.owner, 'p2');
  assert.equal(s.regions.P2.owner, 'p3');
});

test('таймаут выбора закрепляет случайный белый район', () => {
  let s = createRaw();
  s = cmd(s, { type: 'timeout' });
  const got = REGION_IDS.filter((r) => s.regions[r].owner === 'p1');
  assert.equal(got.length, 2);
  assert.ok(s.log.some((e) => e.type === 'draftPick' && e.data.auto));
  assert.equal(activePlayer(s), 'p2');
});

test('стартовый выбор не даёт карту-награду, даже если территория собрана целиком', () => {
  let s = newGame(); // Пираты, Анархисты, Силовики выбрали свои районы целиком
  s = skipRest(readyAll(s));
  assert.deepEqual(s.claimedRewards, {});
});

test('юниты раздаются в начале первого раунда, после выбора', () => {
  const s = createRaw();
  assert.equal(unitCensus(s).hand, 0);
  const t = newGame();
  assert.equal(unitCensus(t).hand, 50);
});

test('представление выбора одинаково для всех и показывает доступные районы', () => {
  const s = createRaw();
  const v = viewFor(s, 'p2');
  assert.equal(v.phase, 'draft');
  assert.equal(v.active, 'p1');
  assert.equal(v.draft.options.length, 31);
  assert.deepEqual(v.draft.picks.p1, []);
});
