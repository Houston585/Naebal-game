import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, legalTargets, checkIntegrity, unitCensus } from '../shared/engine/game.js';
import { neighbors } from '../shared/engine/board.js';
import { ALL_CARDS, TERRITORY_REWARDS } from '../shared/config/cards.js';
import { TERRITORIES } from '../shared/config/map.js';
import { newGame, readyAll, skipRest, ackAll, cmd, activePlayer, giveCard, setOperative, forceAction, giveUnit } from './helpers.js';

const play = (s, player, card, target) => cmd(s, { type: 'playCard', player, card, target });
const place = (s, player, type, region) => cmd(s, { type: 'placeUnit', player, unit: giveUnit(s, player, type), region });

test('каждая карта из конфигурации имеет обработчик и валидатор цели', async () => {
  const { EFFECTS, TARGET_VALIDATORS } = await import('../shared/engine/effects.js');
  for (const c of Object.values(ALL_CARDS)) {
    assert.ok(EFFECTS[c.effect], `${c.id}: нет обработчика ${c.effect}`);
    assert.ok(TARGET_VALIDATORS[c.target], `${c.id}: нет валидатора ${c.target}`);
  }
  for (const list of Object.values(TERRITORY_REWARDS)) for (const id of list) assert.ok(ALL_CARDS[id]);
});

// ---------- момент розыгрыша
test('топ-оперативник — только в подготовке и только один раз', () => {
  let s = newGame();
  const p = activePlayer(s);
  const op = setOperative(s, p, 'den_olches');
  s = play(s, p, op, { region: 'L2' });
  assert.equal(s.players[p].operativeUsed, true);
  assert.throws(() => applyCommand(s, { type: 'playCard', player: p, card: op, target: { region: 'L2' } }), /уже использована/);
  // в ходах — нельзя
  let t = newGame();
  const q = activePlayer(t);
  const op2 = setOperative(t, q, 'den_olches');
  t = readyAll(t);
  while (activePlayer(t) !== q) t = cmd(t, { type: 'skipTurn', player: activePlayer(t) });
  assert.throws(() => applyCommand(t, { type: 'playCard', player: q, card: op2, target: { region: 'L2' } }), /только в подготовке/);
});

test('карта хода — не больше maxCardsPerTurn и до выставления юнита', () => {
  let s = readyAll(newGame());
  const p = activePlayer(s);
  const c1 = giveCard(s, p, 'mutation');
  const c2 = giveCard(s, p, 'uav');
  s = play(s, p, c1, {});
  assert.throws(() => applyCommand(s, { type: 'playCard', player: p, card: c2, target: {} }), /не больше 1/);
});

// ---------- топ-оперативники
test('Душнила и Решала: +10 к защите собственного района', () => {
  let s = newGame();
  const p = 'p1';
  const op = setOperative(s, p, 'den_olches');
  s = play(s, p, op, { region: 'L2' });
  assert.throws(() => { const t = newGame(); const o = setOperative(t, 'p1', 'den_olches'); play(t, 'p1', o, { region: 'L9' }); }, /собственный/);
  s = readyAll(s);
  forceAction(s, 'p2', 'commando', 'L2');
  forceAction(s, 'p2', 'tank', 'L2'); // 11 против 1 + 10
  s = skipRest(s);
  assert.equal(s.regions.L2.owner, 'p1');
  assert.equal(s.lastSummary.battles.find((b) => b.region === 'L2').defenseTotal, 11);
});

test('Озеро в лесу: цель воюет только морскими юнитами', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'lysy');
  s = play(s, 'p1', op, { player: 'p2' });
  s = readyAll(s);
  s = cmd(s, { type: 'skipTurn', player: 'p1' });
  assert.equal(activePlayer(s), 'p2');
  const tank = s.players.p2.hand.find((u) => s.units[u].type === 'tank');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p2', unit: tank, region: 'L4' }), /только морскими/);
  const boat = s.players.p2.hand.find((u) => s.units[u].type === 'boat');
  assert.ok(legalTargets(s, 'p2', boat).length > 0);
});

test('ЗаМир: чужой район нельзя атаковать или защищать до конца раунда', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'sery');
  assert.throws(() => play(s, 'p1', op, { region: 'L2' }), /не контролируете/);
  s = play(s, 'p1', op, { region: 'L9' });
  s = readyAll(s);
  s = cmd(s, { type: 'skipTurn', player: 'p1' });
  const u = s.players.p2.hand.find((x) => s.units[x].type === 'apc2');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p2', unit: u, region: 'L9' }), /ЗаМир/);
});

test('Авторитет: после ходов — фаза перенаправления, не больше 6 юнитов, только юниты противников', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'shlots');
  s = play(s, 'p1', op, {});
  assert.ok(s.log.some((e) => e.type === 'cardPlayed' && e.data.card === 'shlots'), 'факт публичный');
  s = readyAll(s);
  s = place(s, 'p1', 'apc2', 'L4');
  s = place(s, 'p2', 'tank', 'L4'); // Коммерсанты атакуют Л4 танком
  s = place(s, 'p3', 'infantry1', 'P8');
  s = place(s, 'p4', 'infantry1', 'P9');
  s = place(s, 'p5', 'infantry1', 'P12');
  s = skipRest(s);
  assert.equal(s.phase, 'redirect');
  assert.equal(activePlayer(s), 'p1');
  const mine = s.actions.find((a) => a.player === 'p1');
  assert.throws(() => applyCommand(s, { type: 'redirectMove', player: 'p1', action: mine.id, region: 'L5' }), /противников/);
  const tankAct = s.actions.find((a) => a.player === 'p2');
  s = cmd(s, { type: 'redirectMove', player: 'p1', action: tankAct.id, region: 'L9' }); // танк уходит защищать свой укрепрайон
  s = cmd(s, { type: 'redirectDone', player: 'p1' });
  // Танк перенаправлен на собственный укрепрайон — стал защитником (2 + 5 = 7). Л4: атака 2 против защиты 2 — без захвата.
  const l10 = s.lastSummary.battles.find((b) => b.region === 'L9');
  assert.equal(l10.defenseTotal, 7);
  assert.equal(s.regions.L4.owner, null);
  assert.ok(s.log.some((e) => e.type === 'unitRedirected'));
});

test('Авторитет: лимит в 6 перенаправлений', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'shlots');
  s = play(s, 'p1', op, {});
  s = readyAll(s);
  s = skipRest(s);
  // нет ходов противников — фаза перенаправления пропускается
  assert.equal(s.phase, 'summary');
  // искусственно: 7 действий противников
  let t = newGame();
  const o = setOperative(t, 'p1', 'shlots');
  t = play(t, 'p1', o, {});
  t = readyAll(t);
  for (let i = 0; i < 7; i++) forceAction(t, 'p2', i % 2 ? 'infantry1' : 'apc2', 'L4');
  t = skipRest(t);
  assert.equal(t.phase, 'redirect');
  const ids = t.actions.filter((a) => a.player === 'p2').map((a) => a.id);
  for (let i = 0; i < 6; i++) t = cmd(t, { type: 'redirectMove', player: 'p1', action: ids[i], region: 'L5' });
  assert.throws(() => applyCommand(t, { type: 'redirectMove', player: 'p1', action: ids[6], region: 'L5' }), /не больше 6/);
});

test('В лес и в лес: тайный бонус +5 или +10 только к атаке сыгравшего', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'fedos_dron');
  s = play(s, 'p1', op, { region: 'L4' });
  const e = s.effects.find((x) => x.effect === 'secretAttackBonus');
  assert.ok([5, 10].includes(e.hidden.value));
  s = readyAll(s);
  forceAction(s, 'p1', 'infantry1', 'L4');
  forceAction(s, 'p2', 'infantry1', 'L4');
  s = skipRest(s);
  const b = s.lastSummary.battles.find((x) => x.region === 'L4');
  assert.equal(b.attacks.p1, 1 + e.hidden.value);
  assert.equal(b.attacks.p2, 1);
});

test('Амбициозы: немедленный контроль над районом', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'sencha_vovan');
  s = play(s, 'p1', op, { region: 'P5' });
  assert.equal(s.regions.P5.owner, 'p1');
});

test('Платон и Назар: восстановление уничтоженного района, контроль — в конце раунда', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'nuke');
  s = play(s, 'p1', c, { region: 'L4' });
  s = ackAll(skipRest(s));
  assert.equal(s.regions.L4.destroyed, true);
  const p = activePlayer(s);
  const op = setOperative(s, p, 'platon_nazar');
  assert.throws(() => applyCommand(s, { type: 'playCard', player: p, card: op, target: { region: 'L5' } }), /уничтоженный/);
  s = play(s, p, op, { region: 'L4' });
  assert.equal(s.regions.L4.destroyed, false);
  assert.equal(s.regions.L4.owner, null, 'до конца раунда — ничей');
  assert.ok(neighbors(s, 'L4').includes('L5'), 'связи вернулись');
  s = skipRest(readyAll(s));
  assert.equal(s.regions.L4.owner, p);
});

test('Морская пехота: +7 к атаке на прибрежный район; не прибрежный — нельзя', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'natalya');
  assert.throws(() => play(s, 'p1', op, { region: 'L4' }), /водной границей/);
  s = play(s, 'p1', op, { region: 'L17' });
  s = readyAll(s);
  forceAction(s, 'p1', 'decoy', 'L17');
  s = skipRest(s);
  assert.equal(s.regions.L17.owner, 'p1'); // 0 + 7 > 2 (нейтральный)
});

test('Креативная: противник может задействовать не более 3 юнитов', () => {
  let s = newGame({ rules: { unitsPerTurn: 5 } });
  const op = setOperative(s, 'p1', 'ulya');
  assert.throws(() => play(s, 'p1', op, { player: 'p1' }), /противник/);
  s = play(s, 'p1', op, { player: 'p2' });
  s = readyAll(s);
  s = cmd(s, { type: 'skipTurn', player: 'p1' });
  for (let i = 0; i < 3; i++) s = place(s, 'p2', 'infantry1', 'L10');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p2', unit: s.players.p2.hand[0], region: 'L10' }), /лимит/);
});

test('Госушница: два района от одного игрока другому; себе — нельзя', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'sanya');
  assert.throws(() => play(s, 'p1', op, { from: 'p2', to: 'p1', regions: ['L9', 'L11'] }), /себе/);
  assert.throws(() => play(s, 'p1', op, { from: 'p2', to: 'p3', regions: ['L9', 'P1'] }), /не принадлежит/);
  s = play(s, 'p1', op, { from: 'p2', to: 'p3', regions: ['L3', 'L6'] });
  assert.equal(s.regions.L3.owner, 'p3');
  assert.equal(s.regions.L6.owner, 'p3');
});

// ---------- карты-награды
test('БПЛА: полный состав сил соперников — только сыгравшему', async () => {
  const { viewFor } = await import('../shared/engine/views.js');
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'uav');
  s = play(s, 'p1', c, {});
  const v1 = viewFor(s, 'p1');
  const v2 = viewFor(s, 'p2');
  assert.equal(v1.me.reveals.length, 1);
  assert.equal(v1.me.reveals[0].data.p2.hand.length, 10);
  assert.equal(v2.me.reveals.length, 0);
  assert.ok(!JSON.stringify(v2).includes('"hand":["'), 'чужие руки не утекают');
});

test('Атомная бомбардировка: район и юниты на нём уничтожены, район чёрный и без владельца', () => {
  let s = readyAll(newGame());
  s = place(s, 'p1', 'tank', 'L4');
  const tankUid = Object.values(s.units).find((u) => u.location === 'board').uid;
  const c = giveCard(s, 'p2', 'nuke');
  s = play(s, 'p2', c, { region: 'L4' });
  assert.equal(s.regions.L4.destroyed, true);
  assert.equal(s.units[tankUid].location, 'destroyed');
  assert.equal(s.actions.length, 0);
  assert.equal(unitCensus(s).total, 68, 'реестр сохраняет уничтоженные юниты');
  const u = s.players.p2.hand[0];
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p2', unit: u, region: 'L4' }), /уничтожен/);
});

test('Неприкосновенность: нельзя атаковать и нельзя атаковать с него; атомная — можно', () => {
  let s = newGame();
  const c = giveCard(s, 'p2', 'inviolable');
  s = readyAll(s);
  s = cmd(s, { type: 'skipTurn', player: 'p1' });
  assert.throws(() => play(s, 'p2', c, { region: 'L4' }), /собственный/);
  s = play(s, 'p2', c, { region: 'L6' });
  s = cmd(s, { type: 'skipTurn', player: 'p2' });
  assert.equal(s.regions.L6.inviolable, true);
  // Анархисты (P1 у моста) не могут атаковать Л6
  const inf = s.players.p3.hand.find((u) => s.units[u].type === 'infantry1');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p3', unit: inf, region: 'L6' }), /неприкосновен/);
  // Коммерсанты не атакуют через Л6 (P1 соседствует только с Л6 через мост)
  s = skipRest(s);
  s = ackAll(s);
  s = readyAll(s);
  while (activePlayer(s) !== 'p2') s = cmd(s, { type: 'skipTurn', player: activePlayer(s) });
  const tank = s.players.p2.hand.find((u) => s.units[u].type !== 'boat' && s.units[u].type !== 'gunboat' && s.units[u].type !== 'seals');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p2', unit: tank, region: 'P1' }), /Нет пути/);
  // атомная работает
  const n = giveCard(s, 'p2', 'nuke');
  s = play(s, 'p2', n, { region: 'L6' });
  assert.equal(s.regions.L6.destroyed, true);
});

test('Святыня: нельзя атаковать, но с неё можно атаковать; атомная уничтожает', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'shrine');
  s = play(s, 'p1', c, { region: 'L2' });
  assert.equal(activePlayer(s), 'p1', 'карта не завершает ход');
  s = place(s, 'p1', 'apc2', 'L4'); // атака с Л2 разрешена
  const inf = s.players.p2.hand.find((u) => s.units[u].type === 'infantry1');
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p2', unit: inf, region: 'L2' }), /святыня/);
});

test('Водная защита: морские юниты могут действовать на внутреннем районе', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'water_defense');
  s = play(s, 'p1', c, { region: 'L8' });
  assert.equal(s.regions.L8.coastal, true);
  const boat = s.players.p1.hand.find((u) => s.units[u].type === 'boat');
  assert.ok(legalTargets(s, 'p1', boat).includes('L8'));
});

test('Поддержка с воздуха: все защитники раунда получают +1', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'air_support');
  s = play(s, 'p1', c, {});
  forceAction(s, 'p2', 'infantry1', 'L3'); // 1 + 1 + 1 = 3
  forceAction(s, 'p1', 'infantry3', 'L3'); // 3 — не превосходит
  s = skipRest(s);
  assert.equal(s.regions.L3.owner, 'p2');
  assert.equal(s.lastSummary.battles.find((b) => b.region === 'L3').defenseTotal, 3);
});

test('Ураган: сметает юниты двух соседних районов в пул, не уничтожая', () => {
  let s = readyAll(newGame());
  s = place(s, 'p1', 'tank', 'L4');
  s = place(s, 'p2', 'apc4', 'L7');
  const c = giveCard(s, 'p3', 'hurricane');
  assert.throws(() => play(s, 'p3', c, { regions: ['L4', 'L12'] }), /соседними/);
  s = play(s, 'p3', c, { regions: ['L4', 'L7'] });
  assert.equal(s.actions.length, 0);
  assert.equal(unitCensus(s).destroyed, 0);
  assert.deepEqual(checkIntegrity(s), []);
});

// ---------- нейтральные карты
test('Ковровка: территория становится ничейной, юнит в этот ход не выставляется', () => {
  let s = readyAll(newGame());
  s = place(s, 'p1', 'apc2', 'L2'); // защитник Синдиката
  const c = giveCard(s, 'p2', 'carpet');
  s = play(s, 'p2', c, { territory: 'syndicate' });
  for (const r of TERRITORIES.syndicate.regions) assert.equal(s.regions[r].owner, null);
  assert.equal(activePlayer(s), 'p3', 'ход Коммерсантов завершён картой');
  s = skipRest(s);
  assert.equal(s.regions.L2.owner, null);
  assert.equal(unitCensus(s).board, 0, 'юниты ушли в сброс по окончании раунда');
});

test('Подрыв моста: мост разрушен, повторно нельзя', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'bridge_blast');
  s = play(s, 'p1', c, { bridge: 'B2' });
  assert.equal(s.bridges.B2.destroyed, true);
  const c2 = giveCard(s, 'p2', 'bridge_blast');
  s = cmd(s, { type: 'skipTurn', player: 'p1' });
  assert.throws(() => play(s, 'p2', c2, { bridge: 'B2' }), /разрушен/);
});

test('Тайные силы: цель уничтожена, один случайный другой район сыгравшего становится ничейным', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'secret_forces');
  const mine = Object.keys(s.regions).filter((r) => s.regions[r].owner === 'p1');
  forceAction(s, 'p1', 'apc2', mine[1]);                 // защитник на одном из своих районов
  s = play(s, 'p1', c, { region: 'P9' });
  assert.equal(s.regions.P9.destroyed, true);
  const after = Object.keys(s.regions).filter((r) => s.regions[r].owner === 'p1');
  assert.equal(after.length, mine.length - 1, 'потерян ровно один район');
  const lost = mine.find((r) => !after.includes(r));
  assert.equal(s.regions[lost].owner, null);
  assert.equal(s.regions[lost].destroyed, false, 'ничейный, не уничтоженный');
  assert.equal(s.regions.P12.owner, 'p3', 'чужие районы не затронуты');
  if (lost === mine[1]) assert.ok(s.actions.filter((a) => a.region === lost && a.player === 'p1').every((a) => a.void));
});

test('Тайные силы по своему району: потерянный район — другой', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'secret_forces');
  s = play(s, 'p1', c, { region: 'L2' });
  assert.equal(s.regions.L2.destroyed, true);
  assert.equal(Object.keys(s.regions).filter((r) => s.regions[r].owner === 'p1').length, 2);
});

test('Забвение: владельцы своего и чужого района меняются местами', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'oblivion');
  s = play(s, 'p1', c, { own: 'L1', enemy: 'P10' });
  assert.equal(s.regions.P10.owner, 'p1');
  assert.equal(s.regions.L1.owner, 'p4');
});

test('Мутация: юниты этого хода получают +2 к атаке', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'mutation');
  s = play(s, 'p1', c, {});
  s = place(s, 'p1', 'infantry1', 'L4'); // 1 + 2 = 3 > 2
  s = skipRest(s);
  assert.equal(s.regions.L4.owner, 'p1');
});

test('Кислотный дождь: две столицы без встроенной защиты, защитники остаются; можно одну и ту же сторону', () => {
  let s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'acid_rain');
  assert.throws(() => play(s, 'p1', c, { regions: ['L10', 'L9'] }), /не столица/);
  s = play(s, 'p1', c, { regions: ['L9', 'P12'] });
  s = place(s, 'p1', 'infantry1', 'L4');
  forceAction(s, 'p1', 'infantry1', 'L9'); // 1 > 0
  forceAction(s, 'p4', 'apc2', 'P12');
  forceAction(s, 'p5', 'infantry1', 'P12'); // защита 0, атаки 2 и 1
  s = skipRest(s);
  assert.equal(s.regions.L9.owner, 'p1');
  assert.equal(s.regions.P12.owner, 'p4');
});

// ---------- карты-награды за территории
test('награда — первому, кто полностью захватил территорию; повторно не выдаётся; раздел — никому', () => {
  let s = readyAll(newGame());
  // Матриархат (не в игре): П1–П4. Отдаём p2 три района, четвёртый он захватывает в бою.
  for (const r of ['P1', 'P2', 'P3']) s.regions[r].owner = 'p2';
  forceAction(s, 'p2', 'tank', 'P4');
  s = skipRest(s);
  assert.equal(s.claimedRewards.matriarchy, 'p2');
  assert.equal(s.players.p2.cards.length, 1);
  assert.ok(TERRITORY_REWARDS.matriarchy.includes(s.players.p2.cards[0].card));
  // Отбираем и захватываем снова — карты нет
  s = ackAll(s);
  s.regions.P4.owner = 'p1';
  s = readyAll(s);
  forceAction(s, 'p2', 'commando', 'P4');
  s = skipRest(s);
  assert.equal(s.regions.P4.owner, 'p2');
  assert.equal(s.players.p2.cards.length, 1);
});

test('стартовая территория не даёт награду без захвата; разделённая — никому', () => {
  let s = skipRest(readyAll(newGame()));
  assert.deepEqual(s.claimedRewards, {});
  s = ackAll(s);
  s = readyAll(s);
  forceAction(s, 'p1', 'tank', 'L4'); // Лес: Л4 у p1, Л7 ничей
  s = skipRest(s);
  assert.equal(s.claimedRewards.N2, undefined);
});

test('нейтральная территория даёт одну из своих двух карт', () => {
  let s = readyAll(newGame());
  s.regions.L7.owner = 'p1';
  forceAction(s, 'p1', 'tank', 'L4');
  s = skipRest(s);
  assert.equal(s.claimedRewards.N2, 'p1', 'Лес');
  assert.ok(['secret_forces', 'oblivion'].includes(s.players.p1.cards[0].card));
});

test('доп. юнит за захват: выдаётся из ограниченного пула, публично', () => {
  let s = readyAll(newGame({ rules: { captureUnitReward: { enabled: true, chance: 1, regionTypes: ['normal', 'capital', 'neutral'] } } }));
  forceAction(s, 'p1', 'tank', 'L4');
  s = skipRest(s);
  assert.equal(s.lastSummary.unitRewards.length, 1);
  assert.equal(unitCensus(s).reserve, 17);
  s = ackAll(s);
  assert.equal(s.players.p1.hand.length, 11);
  assert.deepEqual(checkIntegrity(s), []);
});
