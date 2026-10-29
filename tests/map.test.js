import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIC_REGIONS, REGION_IDS, SIDE_ADJ, neighbors, isConnectedBySides } from '../shared/engine/board.js';
import { TERRITORIES, CAPITALS, BRIDGES } from '../shared/config/map.js';
import { FACTIONS, FACTION_IDS } from '../shared/config/factions.js';
import { newGame, createRaw, readyAll, cmd, giveCard, activePlayer } from './helpers.js';

// Проверки раздела 15 ТЗ «География карты».

test('15.1–15.2: 36 районов L1–L18 и P1–P18, коды уникальны', () => {
  assert.equal(REGION_IDS.length, 36);
  const expected = [...Array.from({ length: 18 }, (_, i) => `L${i + 1}`), ...Array.from({ length: 18 }, (_, i) => `P${i + 1}`)];
  assert.deepEqual([...REGION_IDS].sort(), expected.sort());
  assert.equal(REGION_IDS.filter((r) => r[0] === 'L').length, 18);
});

test('15.3: мосты B1 L14↔P11, B2 L17↔P6, B3 L15↔P10 соединяют разные острова', () => {
  assert.deepEqual(BRIDGES.map((b) => `${b.id}:${b.a}-${b.b}`), ['B1:L14-P11', 'B2:L17-P6', 'B3:L15-P10']);
  const s = newGame();
  for (const b of BRIDGES) {
    assert.notEqual(b.a[0], b.b[0]);
    assert.ok(neighbors(s, b.a).includes(b.b));
    assert.ok(neighbors(s, b.b).includes(b.a));
  }
});

test('15.5: сухопутные соседства — ровно таблица ТЗ, симметричны и внутри острова', () => {
  const edges = new Set();
  for (const [a, list] of Object.entries(SIDE_ADJ)) {
    for (const b of list) {
      assert.ok(SIDE_ADJ[b].includes(a), `${a}→${b} несимметрично`);
      assert.equal(a[0], b[0], 'сухопутных связей между островами нет');
      edges.add([a, b].sort().join('-'));
    }
  }
  assert.equal(edges.size, 77);
  assert.deepEqual(SIDE_ADJ.L12.slice().sort(), ['L11', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18'].sort());
  assert.deepEqual(SIDE_ADJ.P4.slice().sort(), ['P2', 'P3', 'P5', 'P7', 'P8', 'P16', 'P18'].sort());
});

test('15.5: море и стенка — независимые признаки из таблиц ТЗ', () => {
  const sea = REGION_IDS.filter((r) => STATIC_REGIONS[r].coastal).sort();
  const wall = REGION_IDS.filter((r) => STATIC_REGIONS[r].wall).sort();
  assert.deepEqual(sea, ['L1', 'L2', 'L5', 'L9', 'L10', 'L13', 'L14', 'L15', 'L17', 'L18', 'P1', 'P2', 'P5', 'P6', 'P10', 'P11'].sort());
  assert.deepEqual(wall, ['L1', 'L3', 'L6', 'L9', 'P1', 'P3', 'P11', 'P13', 'P14', 'P15', 'P17', 'P18'].sort());
  assert.ok(STATIC_REGIONS.L1.coastal && STATIC_REGIONS.L1.wall, 'L1: море и стенка одновременно');
});

test('15.6: семь фракций с цветами и укрепрайонами из ТЗ', () => {
  const spec = {
    enforcers: ['#F02D36', 'P17'], matriarchy: ['#FF5DA8', 'P1'], syndicate: ['#9B5CFF', 'L1'], merchants: ['#FFD52A', 'L9'],
    anarchists: ['#36D96D', 'P12'], aristocrats: ['#20C9F8', 'L15'], pirates: ['#FF7A24', 'P5'],
  };
  assert.equal(FACTION_IDS.length, 7);
  for (const [f, [color, cap]] of Object.entries(spec)) {
    assert.equal(FACTIONS[f].color, color, f);
    assert.equal(CAPITALS[f], cap, f);
    assert.equal(STATIC_REGIONS[cap].type, 'capital');
    assert.equal(STATIC_REGIONS[cap].homeFaction, f);
  }
});

test('исходная принадлежность районов — по таблицам раздела 3', () => {
  const own = (f) => TERRITORIES[f].regions.slice().sort();
  assert.deepEqual(own('syndicate'), ['L1', 'L2', 'L5', 'L12', 'L16'].sort());
  assert.deepEqual(own('merchants'), ['L3', 'L6', 'L8', 'L9', 'L10'].sort());
  assert.deepEqual(own('aristocrats'), ['L11', 'L13', 'L14', 'L15'].sort());
  assert.deepEqual(own('matriarchy'), ['P1', 'P2', 'P3', 'P4'].sort());
  assert.deepEqual(own('pirates'), ['P5', 'P6', 'P10', 'P11'].sort());
  assert.deepEqual(own('anarchists'), ['P9', 'P12', 'P13', 'P14'].sort());
  assert.deepEqual(own('enforcers'), ['P15', 'P16', 'P17', 'P18'].sort());
  assert.deepEqual(own('N2'), ['L4', 'L7'], 'Лес');
  assert.deepEqual(own('N1'), ['L17', 'L18'], 'Военная база');
  assert.deepEqual(own('N3'), ['P7', 'P8'], 'Энергостанция');
  assert.equal(REGION_IDS.filter((r) => STATIC_REGIONS[r].type === 'neutral').length, 6);
  const all = Object.values(TERRITORIES).flatMap((t) => t.regions);
  assert.equal(new Set(all).size, 36);
});

test('все территории связны по сухопутным соседствам', () => {
  for (const t of Object.values(TERRITORIES)) assert.ok(isConnectedBySides(t.regions), `${t.name} несвязна`);
});

test('ТЗ 8, 15.7, 15.9: в начале всё белое, кроме укрепрайонов активных фракций', () => {
  const s = createRaw();
  assert.equal(s.phase, 'draft');
  const owned = REGION_IDS.filter((r) => s.regions[r].owner).sort();
  assert.deepEqual(owned, ['L1', 'L9', 'P12', 'P5', 'P17'].sort());
  assert.equal(s.regions.L1.owner, 'p1');
  assert.equal(s.regions.P17.owner, 'p5');
  // невыбранные фракции: Матриархат и Аристократы — ничейные, включая укрепрайоны
  for (const r of [...TERRITORIES.matriarchy.regions, ...TERRITORIES.aristocrats.regions]) assert.equal(s.regions[r].owner, null, r);
  assert.equal(s.regions.P1.owner, null);
  assert.equal(s.regions.L15.owner, null);
});

test('15.10: уничтожение района удаляет все его связи, включая мост; соседние районы целы', () => {
  let s = readyAll(newGame());
  const p = activePlayer(s);
  const c = giveCard(s, p, 'nuke');
  s = cmd(s, { type: 'playCard', player: p, card: c, target: { region: 'L14' } });
  assert.equal(s.regions.L14.destroyed, true);
  assert.equal(s.regions.L14.owner, null);
  assert.deepEqual(neighbors(s, 'L14'), []);
  assert.ok(!neighbors(s, 'P11').includes('L14'), 'мост B1 через уничтоженный район не работает');
  assert.equal(s.bridges.B1.destroyed, false, 'сам мост не уничтожается');
  assert.equal(s.regions.P11.destroyed, false);
  assert.ok(!neighbors(s, 'L13').includes('L14'));
});

test('15.10: уничтожение моста удаляет только его связь и не трогает районы', () => {
  let s = readyAll(newGame());
  const p = activePlayer(s);
  const c = giveCard(s, p, 'bridge_blast');
  s = cmd(s, { type: 'playCard', player: p, card: c, target: { bridge: 'B2' } });
  assert.equal(s.bridges.B2.destroyed, true);
  assert.ok(!neighbors(s, 'L17').includes('P6'));
  assert.ok(neighbors(s, 'L14').includes('P11'), 'другие мосты целы');
  assert.ok(neighbors(s, 'L17').includes('L18'), 'сухопутные связи целы');
  assert.equal(s.regions.L17.destroyed, false);
  assert.equal(s.regions.P6.destroyed, false);
});
