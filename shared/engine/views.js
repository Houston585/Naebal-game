// Представление партии для конкретного игрока. Скрытая информация вырезается здесь,
// на стороне сервера: клиент физически не получает чужие юниты, карты и тайные бонусы (ТЗ 5.2, 16.5).
import { UNIT_TYPES } from '../config/units.js';
import { activePlayer, legalTargets, computeScores, draftOptions } from './game.js';

export function viewFor(state, me) {
  const isPlayer = !!state.players[me];
  const players = state.order.map((pid) => {
    const p = state.players[pid];
    return {
      id: pid, name: p.name, faction: p.faction, seat: p.seat, bot: !!p.bot,
      handCount: p.hand.length,
      cardCount: p.cards.length,
      operativeUsed: p.operativeUsed,
      operativeCard: p.operativeUsed ? p.operative.card : null,
      usedCards: p.usedCards.map((c) => c.card),
    };
  });

  const actions = state.actions.map((a) => {
    const base = { id: a.id, player: a.player, region: a.region, redirected: !!a.redirected };
    if (a.player === me) {
      const t = state.units[a.unit].type;
      return { ...base, unitType: t, strength: UNIT_TYPES[t].strength, kind: a.kind, mutation: a.mutation };
    }
    return base;
  });

  const effects = state.effects.map((e) => {
    const out = { id: e.id, card: e.card, owner: e.owner, effect: e.effect, duration: e.duration, data: e.data };
    if (e.hidden && e.owner === me) out.secret = e.hidden;
    return out;
  });

  const log = state.log
    .filter((e) => !e.to || e.to.includes(me))
    .slice(-250)
    .map((e) => ({
      seq: e.seq, round: e.round, type: e.type, data: e.data,
      text: e.privateTo?.includes(me) && e.privateText ? `${e.text} ${e.privateText}` : e.text,
      mine: !!e.privateTo?.includes(me),
    }));

  let mine = null;
  if (isPlayer) {
    const p = state.players[me];
    const canAct = activePlayer(state) === me && state.phase === 'turns';
    mine = {
      id: me,
      hand: p.hand.map((uid) => {
        const t = state.units[uid].type;
        return { uid, type: t, strength: UNIT_TYPES[t].strength, naval: UNIT_TYPES[t].naval, legal: canAct ? legalTargets(state, me, uid) : [] };
      }),
      operative: p.operative,
      operativeUsed: p.operativeUsed,
      cards: p.cards,
      reveals: state.privateReveals[me],
    };
  }

  return {
    id: state.id, version: state.version, round: state.round, rounds: state.rules.rounds,
    phase: state.phase, deadline: state.deadline,
    active: activePlayer(state),
    order: state.order,
    prepOrder: state.prep?.order ?? null,
    turnOrder: state.turn?.order ?? null,
    turn: state.turn ? { placed: state.turn.placed, cardsUsed: state.turn.cardsUsed, mutation: state.turn.mutation, cycle: state.turn.cycle, cycles: state.turn.cycles, index: state.turn.index } : null,
    redirect: state.redirect,
    draft: state.draft ? { ...state.draft, options: state.phase === 'draft' ? draftOptions(state) : [] } : null,
    players, npcFactions: state.npcFactions,
    regions: state.regions, bridges: state.bridges,
    actions, effects, log,
    claimedRewards: state.claimedRewards,
    reserveCount: Object.values(state.units).filter((u) => u.location === 'reserve').length,
    stashLeft: Object.keys(state.stash ?? {}).length, // сколько тайников осталось — без мест
    scores: computeScores(state),
    summaryAcks: state.summaryAcks,
    lastSummary: state.lastSummary,
    history: state.history,
    result: state.result,
    rules: {
      maxCardsPerTurn: state.rules.maxCardsPerTurn, unitsPerTurn: state.rules.unitsPerTurn,
      baseDefense: state.rules.baseDefense, points: state.rules.points, navalAttackFromSea: state.rules.navalAttackFromSea,
    },
    me: mine,
  };
}
