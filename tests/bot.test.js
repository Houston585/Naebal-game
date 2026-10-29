import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, checkIntegrity, unitCensus } from '../shared/engine/game.js';
import { botStep, botToAct } from '../shared/engine/bot.js';
import { Rng } from '../shared/engine/rng.js';

const FACTIONS = ['syndicate', 'merchants', 'anarchists', 'pirates', 'enforcers'];

function botsOnly(seed, rules = {}) {
  return createGame({
    id: seed, seed, now: 0,
    players: FACTIONS.map((f, i) => ({ id: `p${i + 1}`, name: `Компьютер ${i + 1}`, faction: f, bot: true })),
    rules: { prepSeconds: 0, turnSeconds: 0, redirectSeconds: 0, draftSeconds: 0, ...rules },
  });
}

test('пять компьютеров доигрывают партию до конца без ошибок и потерь юнитов', () => {
  for (const seed of ['b1', 'b2', 'b3', 'b4']) {
    let s = botsOnly(seed);
    const r = new Rng({ s: seed.charCodeAt(1) * 977 });
    const rand = () => r.next();
    let steps = 0;
    while (s.phase !== 'finished' && steps++ < 3000) {
      const pid = botToAct(s);
      assert.ok(pid, `в фазе ${s.phase} некому ходить`);
      const before = s.version;
      s = botStep(s, pid, { now: 0, rand });
      assert.ok(s.version > before, `бот ${pid} застрял в фазе ${s.phase}`);
      assert.deepEqual(checkIntegrity(s), []);
    }
    assert.equal(s.phase, 'finished', seed);
    assert.equal(unitCensus(s).total, 68);
    const captured = s.history.reduce((t, h) => t + h.battles.filter((b) => b.outcome === 'captured').length, 0);
    assert.ok(captured >= 5, `боты должны реально воевать: захватов ${captured}`);
  }
});

test('компьютер выбирает район, соседний со своими', () => {
  const s = botsOnly('near');
  const t = botStep(s, 'p1', { now: 0, rand: () => 0.5 });
  const picked = t.draft.picks.p1[0];
  assert.ok(['L2', 'L3'].includes(picked), `выбран ${picked}`);
});
