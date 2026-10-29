// Компьютерный игрок. Принимает решения по тому же представлению партии, что видит человек
// (viewFor): чужие армии, карты и тайники ему неизвестны. Команды проходят обычную проверку движка.
import { STATIC_REGIONS } from './board.js';
import { ALL_CARDS } from '../config/cards.js';
import { TERRITORIES } from '../config/map.js';
import { viewFor } from './views.js';
import { applyCommand, activePlayer } from './game.js';

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

function ctxOf(view, rand) {
  const me = view.me.id;
  const ids = Object.keys(view.regions);
  const live = ids.filter((r) => !view.regions[r].destroyed);
  const mine = live.filter((r) => view.regions[r].owner === me);
  const others = view.players.filter((p) => p.id !== me);
  const leader = others.slice().sort((a, b) => (view.scores[b.id] - view.scores[a.id]) || (rand() - 0.5))[0];
  const weakest = others.slice().sort((a, b) => view.scores[a.id] - view.scores[b.id])[0];
  const value = (r) => {
    const t = STATIC_REGIONS[r].type;
    return (view.rules.points[t] ?? 0) + (t === 'neutral' ? 0.6 : 0) + (view.regions[r].owner && view.regions[r].owner !== me ? 0.4 : 0);
  };
  return { me, ids, live, mine, others, leader, weakest, value };
}

// ---------------------------------------------------------------- стартовый выбор
function draftChoice(view, rand) {
  const { me, mine } = ctxOf(view, rand);
  const myFaction = view.players.find((p) => p.id === me).faction;
  const near = new Set(mine.flatMap((r) => STATIC_REGIONS[r].neighbors));
  const score = (r) => {
    const s = STATIC_REGIONS[r];
    return (near.has(r) ? 3 : 0) + (s.homeFaction === myFaction ? 2 : 0) + (s.capital ? 2.5 : 0)
      + (s.coastal ? 0.5 : 0) + (s.type === 'neutral' ? 0.4 : 0) + rand() * 0.8;
  };
  const best = view.draft.options.slice().sort((a, b) => score(b) - score(a))[0];
  return { type: 'draftPick', region: best };
}

// ---------------------------------------------------------------- цели карт
function cardTarget(view, cardId, rand, plan) {
  const c = ctxOf(view, rand);
  const { me, live, mine, leader, weakest } = c;
  const notMine = live.filter((r) => view.regions[r].owner !== me);
  const leaderRegions = live.filter((r) => view.regions[r].owner === leader?.id);
  const capitalOf = (pid) => live.find((r) => STATIC_REGIONS[r].capital && view.regions[r].owner === pid);
  const myCapital = capitalOf(me) ?? mine[0];
  const enemyCapitals = live.filter((r) => STATIC_REGIONS[r].capital && view.regions[r].owner && view.regions[r].owner !== me);
  switch (cardId) {
    case 'den_olches': return myCapital ? { region: myCapital } : null;
    case 'lysy': case 'ulya': return leader ? { player: leader.id } : null;
    case 'sery': return leaderRegions.length ? { region: capitalOf(leader.id) ?? pick(leaderRegions, rand) } : null;
    case 'shlots': case 'uav': case 'air_support': return {};
    case 'fedos_dron': return plan ? { region: plan } : null;
    case 'natalya': { const t = notMine.filter((r) => view.regions[r].coastal); return t.length ? { region: plan && view.regions[plan].coastal ? plan : pick(t, rand) } : null; }
    case 'sencha_vovan': { const t = enemyCapitals[0] ?? live.find((r) => STATIC_REGIONS[r].capital && !view.regions[r].owner); return t ? { region: t } : null; }
    case 'platon_nazar': { const d = c.ids.filter((r) => view.regions[r].destroyed); return d.length ? { region: pick(d, rand) } : null; }
    case 'sanya': {
      if (!leader || leaderRegions.length < 2 || weakest.id === leader.id) return null;
      const two = leaderRegions.filter((r) => !STATIC_REGIONS[r].capital).slice(0, 2);
      return two.length === 2 ? { from: leader.id, to: weakest.id, regions: two } : null;
    }
    case 'nuke': { const t = capitalOf(leader?.id) ?? enemyCapitals[0]; return t ? { region: t } : null; }
    case 'inviolable': case 'shrine': return myCapital ? { region: myCapital } : null;
    case 'water_defense': { const t = mine.find((r) => !view.regions[r].coastal); return t ? { region: t } : null; }
    case 'hurricane': {
      const hot = mine.filter((r) => view.actions.some((a) => a.region === r && a.player !== me));
      for (const r of hot) {
        const n = STATIC_REGIONS[r].neighbors.find((x) => !view.regions[x].destroyed);
        if (n) return { regions: [r, n] };
      }
      return null;
    }
    case 'carpet': {
      if (!leader) return null;
      const best = Object.values(TERRITORIES).map((t) => ({ t, n: t.regions.filter((r) => view.regions[r].owner === leader.id).length, mineN: t.regions.filter((r) => view.regions[r].owner === me).length }))
        .filter((x) => x.mineN === 0).sort((a, b) => b.n - a.n)[0];
      return best && best.n >= 2 ? { territory: best.t.id } : null;
    }
    case 'bridge_blast': { const b = Object.values(view.bridges).filter((x) => !x.destroyed); return b.length ? { bridge: pick(b, rand).id } : null; }
    case 'secret_forces': { if (mine.length < 4) return null; const t = capitalOf(leader?.id) ?? enemyCapitals[0]; return t ? { region: t } : null; }
    case 'oblivion': {
      const own = mine.filter((r) => !STATIC_REGIONS[r].capital).sort((a, b) => c.value(a) - c.value(b))[0];
      const enemy = enemyCapitals[0] ?? notMine.find((r) => view.regions[r].owner);
      return own && enemy ? { own, enemy } : null;
    }
    case 'mutation': return {};
    case 'acid_rain': return enemyCapitals.length >= 2 ? { regions: enemyCapitals.slice(0, 2) } : null;
    default: return null;
  }
}

/** Карту стоит играть сейчас? Возвращает команду playCard или null. */
function maybeCard(view, rand, phase, plan) {
  const me = view.me;
  const options = [];
  if (phase === 'prep' && me.operative && !me.operativeUsed) options.push({ uid: me.operative.uid, card: me.operative.card, chance: view.round >= 2 ? 0.75 : 0.35 });
  for (const c of me.cards) {
    const card = ALL_CARDS[c.card];
    const key = phase === 'prep' ? 'prep' : 'turn';
    if (!card.phases.includes(key)) continue;
    if (phase === 'turns' && (view.turn.placed > 0 || view.turn.cardsUsed >= view.rules.maxCardsPerTurn)) continue;
    if (c.card === 'mutation' && !me.hand.some((u) => u.legal.length && u.strength > 0)) continue;
    options.push({ uid: c.uid, card: c.card, chance: phase === 'prep' ? 0.5 : 0.3 });
  }
  for (const o of options) {
    if (rand() > o.chance) continue;
    const target = cardTarget(view, o.card, rand, plan);
    if (target) return { type: 'playCard', card: o.uid, target };
  }
  return null;
}

// ---------------------------------------------------------------- ход
function attackPlan(view, rand) {
  const c = ctxOf(view, rand);
  const me = c.me;
  const hand = view.me.hand.filter((u) => u.strength > 0);
  const attackable = new Set(hand.flatMap((u) => u.legal).filter((r) => view.regions[r].owner !== me));
  const mySum = (r) => view.actions.filter((a) => a.region === r && a.player === me && a.kind === 'attack').reduce((t, a) => t + a.strength, 0);
  const rivals = (r) => view.actions.filter((a) => a.region === r && a.player !== me && a.player !== view.regions[r].owner).length;
  const need = (r) => {
    const reg = view.regions[r];
    const base = view.rules.baseDefense[STATIC_REGIONS[r].type];
    const ownerDef = reg.owner ? view.actions.filter((a) => a.region === r && a.player === reg.owner).length * 2.5 + 1 : 0;
    return base + ownerDef + rivals(r) * 2.5;
  };
  let best = null, bestScore = -Infinity;
  for (const r of attackable) {
    const have = mySum(r), req = need(r);
    if (have > req + 3) continue; // уже с запасом
    const remaining = Math.max(1, req + 1 - have);
    const score = (c.value(r) + 0.5) / remaining + (have > 0 ? 0.8 : 0) + rand() * 0.3;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best ? { region: best, remaining: Math.max(1, need(best) + 1 - mySum(best)) } : null;
}

function turnChoice(view, rand) {
  const c = ctxOf(view, rand);
  const me = c.me;
  const hand = view.me.hand;
  const plan = attackPlan(view, rand);
  const card = maybeCard(view, rand, 'turns', plan?.region);
  if (card) return card;
  if (!hand.some((u) => u.legal.length)) return { type: 'skipTurn' };

  // защита: свой район, на котором стоят чужие отряды
  const threats = c.mine.map((r) => ({ r, n: view.actions.filter((a) => a.region === r && a.player !== me).length, def: view.actions.filter((a) => a.region === r && a.player === me).reduce((t, a) => t + a.strength, 0) }))
    .filter((x) => x.n > 0 && x.def < x.n * 3).sort((a, b) => (b.n * c.value(b.r)) - (a.n * c.value(a.r)));
  if (threats.length && rand() < 0.55) {
    const r = threats[0].r;
    const units = hand.filter((u) => u.legal.includes(r) && u.strength > 0).sort((a, b) => b.strength - a.strength);
    if (units.length) return { type: 'placeUnit', unit: units[0].uid, region: r };
  }
  if (plan) {
    const units = hand.filter((u) => u.legal.includes(plan.region) && u.strength > 0).sort((a, b) => a.strength - b.strength);
    const enough = units.find((u) => u.strength >= plan.remaining);
    const u = enough ?? units[units.length - 1];
    if (u) return { type: 'placeUnit', unit: u.uid, region: plan.region };
  }
  // обманка или что угодно допустимое
  const any = hand.filter((u) => u.legal.length);
  const u = any.find((x) => x.strength === 0) ?? pick(any, rand);
  const targets = u.legal.filter((r) => view.regions[r].owner !== me);
  return { type: 'placeUnit', unit: u.uid, region: targets.length ? pick(targets, rand) : pick(u.legal, rand) };
}

function redirectChoice(view, rand) {
  const me = view.me.id;
  if (view.redirect.moved.length >= view.redirect.maxUnits) return { type: 'redirectDone' };
  const threat = view.actions.find((a) => a.player !== me && view.regions[a.region].owner === me && !view.redirect.moved.includes(a.id));
  if (!threat) return { type: 'redirectDone' };
  const away = Object.keys(view.regions).filter((r) => !view.regions[r].destroyed && !view.regions[r].owner && view.regions[r].coastal);
  return away.length ? { type: 'redirectMove', action: threat.id, region: pick(away, rand) } : { type: 'redirectDone' };
}

/** Решение бота по его представлению партии. */
export function botCommand(view, rand = Math.random) {
  switch (view.phase) {
    case 'draft': return draftChoice(view, rand);
    case 'prep': return maybeCard(view, rand, 'prep', attackPlan(view, rand)?.region) ?? { type: 'ready' };
    case 'turns': return turnChoice(view, rand);
    case 'redirect': return redirectChoice(view, rand);
    case 'summary': return { type: 'ackSummary' };
    default: return null;
  }
}

const FALLBACK = { draft: null, prep: { type: 'ready' }, turns: { type: 'skipTurn' }, redirect: { type: 'redirectDone' }, summary: { type: 'ackSummary' } };

/**
 * Один шаг бота pid. Возвращает новое состояние. Если решение отклонено движком,
 * бот делает безопасный ход (готов / пропуск), поэтому партия никогда не застревает.
 */
export function botStep(state, pid, { now = Date.now(), rand = Math.random } = {}) {
  const view = viewFor(state, pid);
  const cmd = botCommand(view, rand);
  const tries = [cmd];
  if (state.phase === 'draft') tries.push({ type: 'draftPick', region: pick(view.draft.options, rand) });
  else if (FALLBACK[state.phase]) tries.push(FALLBACK[state.phase]);
  for (const c of tries) {
    if (!c) continue;
    try { return applyCommand(state, { ...c, player: pid, now }).state; } catch { /* следующая попытка */ }
  }
  return state;
}

/** Кому из ботов сейчас ходить (или кому подтвердить сводку). */
export function botToAct(state) {
  if (state.phase === 'summary') return state.order.find((p) => state.players[p].bot && !state.summaryAcks[p]) ?? null;
  const a = activePlayer(state);
  return a && state.players[a]?.bot ? a : null;
}
