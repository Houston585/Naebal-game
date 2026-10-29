import { createGame, applyCommand, activePlayer } from '../shared/engine/game.js';

export const FACTION_SET = ['syndicate', 'merchants', 'anarchists', 'pirates', 'enforcers'];
// Неигровые в этой раскладке: Матриархат и Аристократы.

// Стартовый выбор в тестах: каждый берёт по три района своей фракции (там, где они есть).
// Итог: p1 Синдикат L1 L2 L5 L12 · p2 Коммерсанты L9 L3 L6 L8 · p3 Анархисты P12 P9 P13 P14 ·
//       p4 Пираты P5 P6 P10 P11 · p5 Силовики P17 P15 P16 P18. Ничейные: Аристократы, Матриархат, L16, L10, нейтральные.
export const TEST_DRAFT = {
  syndicate: ['L2', 'L5', 'L12'], merchants: ['L3', 'L6', 'L8'], anarchists: ['P9', 'P13', 'P14'],
  pirates: ['P6', 'P10', 'P11'], enforcers: ['P15', 'P16', 'P18'],
};

export function createRaw(opts = {}) {
  return createGame({
    id: opts.id ?? 'test',
    seed: opts.seed ?? 'seed-1',
    players: (opts.factions ?? FACTION_SET).map((f, i) => ({ id: `p${i + 1}`, name: `Игрок ${i + 1}`, faction: f })),
    rules: { prepSeconds: 0, turnSeconds: 0, redirectSeconds: 0, draftSeconds: 0, stash: { enabled: false }, ...(opts.rules ?? {}) },
    now: 0,
  });
}

export function draftAll(s, picks = TEST_DRAFT) {
  while (s.phase === 'draft') {
    const p = activePlayer(s);
    const f = s.players[p].faction;
    const region = picks[f].find((r) => s.regions[r].owner === null);
    s = cmd(s, { type: 'draftPick', player: p, region });
  }
  return s;
}

export function newGame(opts = {}) {
  return draftAll(createRaw(opts), opts.picks);
}

let cmdN = 0;
export function cmd(s, c) {
  return applyCommand(s, { id: `t${++cmdN}`, now: 0, ...c }).state;
}

/** Пройти подготовку (все готовы). */
export function readyAll(s) {
  while (s.phase === 'prep') s = cmd(s, { type: 'ready', player: activePlayer(s) });
  return s;
}

/** Пропустить ходы до конца раунда. */
export function skipRest(s) {
  while (s.phase === 'turns') s = cmd(s, { type: 'skipTurn', player: activePlayer(s) });
  return s;
}

export function ackAll(s) {
  for (const p of s.order) if (s.phase === 'summary') s = cmd(s, { type: 'ackSummary', player: p });
  return s;
}

/** Даёт игроку юнит нужного типа (переносит из чужой руки/пула/резерва) — для сценарных тестов. */
export function giveUnit(s, pid, type) {
  const u = Object.values(s.units).find((x) => x.type === type && (x.location === 'pool' || x.location === 'reserve' || (x.location === 'hand' && x.holder !== pid)))
    ?? Object.values(s.units).find((x) => x.type === type && x.location === 'hand' && x.holder === pid);
  if (!u) throw new Error(`no unit ${type}`);
  if (u.location === 'hand' && u.holder === pid) return u.uid;
  if (u.location === 'hand') s.players[u.holder].hand = s.players[u.holder].hand.filter((x) => x !== u.uid);
  u.location = 'hand'; u.holder = pid;
  s.players[pid].hand.push(u.uid);
  return u.uid;
}

/** Ставит действие напрямую, минуя очередность (для проверки расчёта боёв). */
export function forceAction(s, pid, type, region) {
  const uid = giveUnit(s, pid, type);
  s.players[pid].hand = s.players[pid].hand.filter((x) => x !== uid);
  s.units[uid].location = 'board';
  s.actions.push({ id: `a${++s.counters.action}`, round: s.round, player: pid, unit: uid, region, kind: s.regions[region].owner === pid ? 'defend' : 'attack', mutation: false, void: false });
  return uid;
}

export function giveCard(s, pid, card) {
  const uid = `c${++s.counters.card}`;
  s.players[pid].cards.push({ uid, card });
  return uid;
}

export function setOperative(s, pid, card) {
  s.players[pid].operative = { uid: `op-${pid}`, card };
  s.players[pid].operativeUsed = false;
  return `op-${pid}`;
}

/** Переводит партию прямо к ходам и возвращает состояние. */
export function toTurns(s) { return readyAll(s); }

export { activePlayer };
