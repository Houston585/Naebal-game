import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBattle } from '../shared/engine/battle.js';
import { newGame, readyAll, skipRest, forceAction } from './helpers.js';

// --- Обязательные примеры ТЗ 3.3 (чистая функция)
test('нейтральный район, защита 2, атаки 3 и 3 — не захвачен', () => {
  const r = resolveBattle({ owner: null, baseDefense: 2, attacks: { a: 3, b: 3 } });
  assert.equal(r.outcome, 'tie');
  assert.equal(r.newOwner, null);
});

test('нейтральный район, защита 2, атаки 4 и 3 — захватывает игрок с силой 4', () => {
  const r = resolveBattle({ owner: null, baseDefense: 2, attacks: { a: 4, b: 3 } });
  assert.equal(r.outcome, 'captured');
  assert.equal(r.winner, 'a');
});

test('защита 4, атака 4 — район остаётся у владельца', () => {
  const r = resolveBattle({ owner: 'd', baseDefense: 1, defense: 3, attacks: { a: 4 } });
  assert.equal(r.outcome, 'held');
  assert.equal(r.newOwner, 'd');
});

test('два игрока атакуют занятый район одинаковой силой — район остаётся у владельца', () => {
  const r = resolveBattle({ owner: 'd', baseDefense: 1, defense: 0, attacks: { a: 5, b: 5 } });
  assert.equal(r.outcome, 'tie');
  assert.equal(r.newOwner, 'd');
});

test('атака должна строго превосходить защиту', () => {
  assert.equal(resolveBattle({ owner: null, baseDefense: 2, attacks: { a: 2 } }).outcome, 'held');
  assert.equal(resolveBattle({ owner: null, baseDefense: 2, attacks: { a: 3 } }).outcome, 'captured');
});

// --- Те же сценарии через полный движок (расчёт после последнего хода)
function battle(setup) {
  let s = readyAll(newGame());
  setup(s);
  s = skipRest(s);
  return s;
}

test('движок: силы одного игрока по району складываются', () => {
  const s = battle((s) => {
    forceAction(s, 'p1', 'infantry1', 'L4'); // Л4 — нейтральный, защита 2
    forceAction(s, 'p1', 'apc2', 'L4');      // 1 + 2 = 3 > 2
  });
  assert.equal(s.regions.L4.owner, 'p1');
  const b = s.lastSummary.battles.find((x) => x.region === 'L4');
  assert.equal(b.attacks.p1, 3);
});

test('движок: силы разных игроков не складываются (3 и 4 против защиты 4)', () => {
  const s = battle((s) => {
    forceAction(s, 'p1', 'infantry3', 'L4');
    forceAction(s, 'p2', 'apc4', 'L4');
    forceAction(s, 'p2', 'infantry1', 'L4'); // p2: 5 против базы 2 — захват; без сложения с p1
  });
  const b = s.lastSummary.battles.find((x) => x.region === 'L4');
  assert.deepEqual(b.attacks, { p1: 3, p2: 5 });
  assert.equal(s.regions.L4.owner, 'p2');
});

test('движок: ничья атакующих на нейтральном районе — никто не захватывает', () => {
  const s = battle((s) => {
    forceAction(s, 'p1', 'infantry3', 'L4');
    forceAction(s, 'p2', 'infantry3', 'L4');
  });
  assert.equal(s.regions.L4.owner, null);
  assert.equal(s.lastSummary.battles.find((x) => x.region === 'L4').outcome, 'tie');
});

test('движок: встроенная защита складывается с защитниками; равенство оставляет район', () => {
  const s = battle((s) => {
    forceAction(s, 'p2', 'infantry3', 'L3'); // Л3 Коммерсантов: 1 + 3 = 4
    forceAction(s, 'p1', 'apc4', 'L3');      // 4 — не превосходит
  });
  assert.equal(s.regions.L3.owner, 'p2');
  const b = s.lastSummary.battles.find((x) => x.region === 'L3');
  assert.equal(b.defenseTotal, 4);
  assert.equal(b.outcome, 'held');
});

test('движок: защитник удерживает район при достаточной защите, атака сильнее — захват', () => {
  const s = battle((s) => {
    forceAction(s, 'p2', 'infantry1', 'L3'); // защита 2
    forceAction(s, 'p1', 'infantry3', 'L3'); // 3 > 2
  });
  assert.equal(s.regions.L3.owner, 'p1');
});

test('движок: районы меняют владельца только после расчёта', () => {
  let s = readyAll(newGame());
  forceAction(s, 'p1', 'tank', 'L4');
  assert.equal(s.regions.L4.owner, null, 'до конца раунда владелец не меняется');
  s = skipRest(s);
  assert.equal(s.regions.L4.owner, 'p1');
});

test('движок: укреплённый район имеет защиту 2', () => {
  const s = battle((s) => { forceAction(s, 'p1', 'apc2', 'L9'); }); // Л9 — укрепрайон Коммерсантов
  assert.equal(s.regions.L9.owner, 'p2');
  assert.equal(s.lastSummary.battles.find((x) => x.region === 'L9').defenseTotal, 2);
});

test('движок: ничейный район невыбранной фракции защищается только встроенной защитой', () => {
  const s = battle((s) => { forceAction(s, 'p2', 'apc2', 'L13'); }); // Л13 — Аристократы (не в игре), защита 1
  assert.equal(s.regions.L13.owner, 'p2');
});

test('движок: ничейный укрепрайон невыбранной фракции — защита 2', () => {
  const s = battle((s) => { forceAction(s, 'p2', 'apc2', 'L15'); });
  assert.equal(s.regions.L15.owner, null);
  assert.equal(s.lastSummary.battles.find((x) => x.region === 'L15').defenseTotal, 2);
});
