import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, checkIntegrity, unitCensus, legalTargets, activePlayer } from '../shared/engine/game.js';
import { viewFor } from '../shared/engine/views.js';
import { OPERATIVES } from '../shared/config/cards.js';
import { Rng } from '../shared/engine/rng.js';
import { newGame, readyAll, skipRest, ackAll, cmd, setOperative, giveCard } from './helpers.js';

// ---------- скрытая информация
test('другие игроки не видят тип и силу чужого юнита', () => {
  let s = readyAll(newGame());
  const tank = s.players.p1.hand.find((u) => s.units[u].type === 'tank');
  s = cmd(s, { type: 'placeUnit', player: 'p1', unit: tank, region: 'L4' });
  const mine = viewFor(s, 'p1').actions[0];
  const theirs = viewFor(s, 'p2').actions[0];
  assert.equal(mine.unitType, 'tank');
  assert.equal(theirs.unitType, undefined);
  assert.equal(theirs.strength, undefined);
  assert.equal(theirs.player, 'p1', 'эмблема (фракция) видна');
  const raw = JSON.stringify(viewFor(s, 'p2'));
  assert.ok(!raw.includes(tank), 'идентификатор чужого юнита не передаётся');
});

test('состав чужой армии и чужие карты не попадают в данные клиента', () => {
  const s = newGame();
  const v = viewFor(s, 'p2');
  const raw = JSON.stringify(v);
  for (const uid of s.players.p1.hand) assert.ok(!raw.includes(`"${uid}"`));
  // чужой топ-оперативник скрыт до розыгрыша
  const op1 = s.players.p1.operative.card;
  const others = v.players.find((p) => p.id === 'p1');
  assert.equal(others.operativeCard, null);
  assert.equal(v.me.operative.card, s.players.p2.operative.card);
  assert.ok(!raw.includes(`"card":"${op1}"`) || op1 === s.players.p2.operative.card);
});

test('тайный бонус «В лес и в лес» виден только владельцу', () => {
  let s = newGame();
  const op = setOperative(s, 'p1', 'fedos_dron');
  s = cmd(s, { type: 'playCard', player: 'p1', card: op, target: { region: 'L4' } });
  const v1 = viewFor(s, 'p1').effects.find((e) => e.effect === 'secretAttackBonus');
  const v2 = viewFor(s, 'p2').effects.find((e) => e.effect === 'secretAttackBonus');
  assert.ok(v1.secret.value);
  assert.equal(v2.secret, undefined);
  assert.ok(!JSON.stringify(viewFor(s, 'p2').log).includes('Выпал бонус'));
  assert.ok(JSON.stringify(viewFor(s, 'p1').log).includes('Выпал бонус'));
});

test('какая карта-награда выпала — знает только получатель; факт — все', () => {
  let s = readyAll(newGame());
  s.regions.L7.owner = 'p1';   // Лес: Л4 + Л7
  const tank = s.players.p1.hand.find((u) => s.units[u].type === 'tank');
  s = cmd(s, { type: 'placeUnit', player: 'p1', unit: tank, region: 'L4' });
  s = skipRest(s);
  const card = s.players.p1.cards[0].card;
  const v2 = viewFor(s, 'p2');
  assert.equal(v2.players.find((p) => p.id === 'p1').cardCount, 1);
  const ev = v2.log.find((e) => e.type === 'rewardGranted');
  assert.ok(ev);
  assert.ok(!ev.text.includes('«Тайные силы»') && !ev.text.includes('«Забвение»'));
  assert.equal(viewFor(s, 'p1').me.cards[0].card, card);
});

// ---------- идемпотентность и атомарность
test('повторная команда с тем же id не выполняется дважды', () => {
  const s = readyAll(newGame());
  const unit = s.players.p1.hand[0];
  const c = { id: 'same-id', type: 'placeUnit', player: 'p1', unit, region: legalTargets(s, 'p1', unit)[0], now: 0 };
  const r1 = applyCommand(s, c);
  const r2 = applyCommand(r1.state, c);
  assert.equal(r2.duplicate, true);
  assert.equal(r2.state, r1.state);
  assert.equal(r2.state.actions.length, 1);
});

test('недопустимое действие не меняет состояние и не завершает ход', () => {
  const s = readyAll(newGame());
  const snap = JSON.stringify(s);
  assert.throws(() => applyCommand(s, { type: 'placeUnit', player: 'p1', unit: s.players.p1.hand[0], region: 'P18x' }));
  assert.equal(JSON.stringify(s), snap);
  assert.equal(activePlayer(s), 'p1');
});

test('расчёт раунда атомарен: при сбое в обработчике состояние не меняется', () => {
  const s = readyAll(newGame());
  const c = giveCard(s, 'p1', 'nuke');
  const snap = JSON.stringify(s);
  assert.throws(() => applyCommand(s, { type: 'playCard', player: 'p1', card: c, target: { region: 'NOPE' } }));
  assert.equal(JSON.stringify(s), snap);
});

test('восстановление из сохранения: JSON-копия продолжает партию детерминированно', () => {
  let a = newGame({ seed: 'restore' });
  a = ackAll(skipRest(readyAll(a)));
  const b = JSON.parse(JSON.stringify(a));
  const a2 = ackAll(skipRest(readyAll(a)));
  const b2 = ackAll(skipRest(readyAll(b)));
  assert.deepEqual(a2.players.p1.hand, b2.players.p1.hand);
  assert.deepEqual(a2.rng, b2.rng);
});

test('ГСЧ воспроизводим при одинаковом зерне', () => {
  const x = new Rng({ s: 42 }), y = new Rng({ s: 42 });
  for (let i = 0; i < 10; i++) assert.equal(x.next(), y.next());
});

// ---------- полная партия
function randomGame(seed) {
  let s = newGame({ seed, id: `full-${seed}` });
  const rng = new Rng({ s: [...seed].reduce((a, c) => a + c.charCodeAt(0), 7) });
  const opCount = {};
  // раздадим каждому по паре карт-наград, чтобы прогнать эффекты в партии
  const extra = ['uav', 'nuke', 'air_support', 'inviolable', 'shrine', 'water_defense', 'hurricane', 'carpet', 'bridge_blast', 'secret_forces', 'oblivion', 'mutation', 'acid_rain'];
  s.order.forEach((p, i) => { giveCard(s, p, extra[i]); giveCard(s, p, extra[(i + 5) % extra.length]); });
  let guard = 0;
  while (s.phase !== 'finished' && guard++ < 2000) {
    const p = activePlayer(s);
    if (s.phase === 'summary') { s = ackAll(s); continue; }
    if (s.phase === 'redirect') {
      const enemy = s.actions.filter((a) => a.player !== p);
      for (const a of enemy.slice(0, 2)) {
        try { s = cmd(s, { type: 'redirectMove', player: p, action: a.id, region: rng.pick(Object.keys(s.regions)) }); } catch { /* недопустимая цель */ }
      }
      s = cmd(s, { type: 'redirectDone', player: p });
      continue;
    }
    // попробовать карту
    const pl = s.players[p];
    const candidates = [];
    if (s.phase === 'prep' && !pl.operativeUsed) candidates.push(pl.operative.uid);
    candidates.push(...pl.cards.map((c) => c.uid));
    for (const c of candidates) {
      if (rng.next() < 0.5) continue;
      const target = randomTarget(s, p, rng);
      try { s = cmd(s, { type: 'playCard', player: p, card: c, target }); opCount[c] = 1; } catch { /* цель не подошла */ }
      if (activePlayer(s) !== p) break;
    }
    if (activePlayer(s) !== p || s.phase === 'finished') continue;
    if (s.phase === 'prep') { s = cmd(s, { type: 'ready', player: p }); continue; }
    if (s.phase === 'turns') {
      const opts = s.players[p].hand.flatMap((u) => legalTargets(s, p, u).map((r) => [u, r]));
      if (opts.length && rng.next() < 0.9) {
        const [unit, region] = rng.pick(opts);
        s = cmd(s, { type: 'placeUnit', player: p, unit, region });
      } else s = cmd(s, { type: 'skipTurn', player: p });
    }
    const errs = checkIntegrity(s);
    if (errs.length) throw new Error(errs.join('; '));
  }
  return s;
}

function randomTarget(s, p, rng) {
  const regions = Object.keys(s.regions);
  const others = s.order.filter((x) => x !== p);
  const own = regions.filter((r) => s.regions[r].owner === p);
  const caps = ['L2', 'L10', 'L14', 'P2', 'P5', 'P9', 'P12'];
  return {
    region: rng.next() < 0.5 && own.length ? rng.pick(own) : rng.pick(regions),
    player: rng.pick(others),
    from: others[0], to: others[1],
    regions: rng.next() < 0.5 ? [rng.pick(caps), rng.pick(caps)] : [rng.pick(regions), rng.pick(regions)],
    territory: rng.pick(['syndicate', 'N1', 'pirates', 'N3']),
    bridge: rng.pick(['B1', 'B2', 'B3']),
    own: own[0], enemy: rng.pick(regions),
  };
}

test('полная партия из 5 раундов со случайными действиями и картами — без потерь и дубликатов', () => {
  for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'omega', 'zeta']) {
    const s = randomGame(seed);
    assert.equal(s.phase, 'finished', seed);
    assert.equal(s.history.length, 5);
    assert.ok(s.result.winners.length >= 1);
    assert.equal(unitCensus(s).total, 68);
    void OPERATIVES;
  }
});
