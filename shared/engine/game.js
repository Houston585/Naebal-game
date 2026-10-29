// Игровой движок «Острова Лабеан».
// Все изменения состояния — через applyCommand(state, cmd): функция работает на копии,
// и при ошибке исходное состояние не меняется (атомарность, ТЗ 16.6).
import { DEFAULT_RULES } from '../config/rules.js';
import { UNIT_TYPES, STARTING_ARMY, EXTRA_POOL } from '../config/units.js';
import { ALL_CARDS, OPERATIVES, TERRITORY_REWARDS } from '../config/cards.js';
import { TERRITORIES, BRIDGES, CAPITALS } from '../config/map.js';
import { FACTIONS, FACTION_IDS } from '../config/factions.js';
import { STATIC_REGIONS, REGION_IDS, isLive, hasAttackSource } from './board.js';
import { resolveBattle } from './battle.js';
import { Rng, seedFrom } from './rng.js';
import { GameError, fail } from './errors.js';
import { EFFECTS, TARGET_VALIDATORS, territoryAllOwnedBy } from './effects.js';

export { GameError };

/** Версия географии. Сохранённые партии другой версии не продолжаются. */
export const MAP_VERSION = 2;

const label = (id) => STATIC_REGIONS[id]?.label ?? id;
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

// Порядок разрешения в конце раунда (ТЗ 10, 17.4). Фиксирован и не зависит от порядка кода.
export const RESOLUTION_ORDER = [
  '1. Эффекты, сыгранные в подготовке и в ходах, уже применены в момент розыгрыша (захват, уничтожение, обмен, ураган).',
  '2. «Авторитет» (Шльоц): перенаправление юнитов противников до расчёта боёв.',
  '3. Отмена недействительных действий: цель уничтожена, заморожена («ЗаМир»), неприкосновенна/святыня (для атак).',
  '4. Расчёт всех районов одновременно: встроенная защита (с «Кислотным дождём») + защитники (+«Поддержка с воздуха») + «Душнила и Решала»; атаки по игрокам (+«Мутация», +«Морская пехота», +«В лес и в лес»).',
  '5. Смена владельцев по итогам боёв.',
  '6. Передача восстановленных районов («Платон и Назар»).',
  '7. Карты-награды за полностью захваченные территории.',
  '8. Дополнительные юниты за захват (если включено).',
  '9. Все юниты с карты возвращаются в общий пул; временные эффекты снимаются.',
];

// ---------------------------------------------------------------- создание партии
export function createGame({ id, seed, players, rules = {}, now = Date.now() }) {
  const r = { ...DEFAULT_RULES, ...rules };
  if (!Array.isArray(players) || players.length !== r.players) fail('SETUP', `Нужно ровно ${r.players} игроков.`);
  const factions = players.map((p) => p.faction);
  if (new Set(factions).size !== factions.length) fail('SETUP', 'Фракции игроков должны различаться.');
  for (const f of factions) if (!FACTIONS[f]) fail('SETUP', `Неизвестная фракция ${f}.`);

  const state = {
    id, version: 0, createdAt: now, rules: r, mapVersion: MAP_VERSION,
    rng: { s: seedFrom(seed ?? id ?? 'labean') },
    counters: { unit: 0, action: 0, effect: 0, card: 0, event: 0 },
    order: players.map((p) => p.id),
    players: {},
    npcFactions: FACTION_IDS.filter((f) => !factions.includes(f)),
    regions: {}, bridges: {}, units: {},
    round: 0, phase: 'setup', deadline: null,
    prep: null, turn: null, redirect: null, draft: null,
    actions: [], effects: [],
    claimedRewards: {},
    pendingGrants: {},
    privateReveals: {},
    gainedThisRound: {},
    history: [], log: [], processed: {},
    summaryAcks: {}, lastSummary: null, result: null,
  };
  const rng = new Rng(state.rng);
  const factionOwner = {};
  players.forEach((p, i) => {
    state.players[p.id] = {
      id: p.id, name: p.name, faction: p.faction, seat: i, bot: !!p.bot,
      hand: [], cards: [], usedCards: [], operative: null, operativeUsed: false,
    };
    factionOwner[p.faction] = p.id;
    state.privateReveals[p.id] = [];
    state.pendingGrants[p.id] = [];
  });
  // ТЗ 8: до стартовой фазы все районы ничейные (белые).
  for (const rid of REGION_IDS) {
    const s = STATIC_REGIONS[rid];
    state.regions[rid] = {
      owner: null,
      destroyed: false, coastal: s.coastal, inviolable: false, shrine: false, pendingOwner: null,
    };
  }
  // ТЗ 10: укрепрайоны активных фракций закрепляются автоматически.
  // Районы невыбранных фракций, включая их укрепрайоны, остаются ничейными (ТЗ 12).
  for (const [f, pid] of Object.entries(factionOwner)) state.regions[CAPITALS[f]].owner = pid;
  for (const b of BRIDGES) state.bridges[b.id] = { ...b, destroyed: false };

  // Реестр юнитов: классические — по стандартной армии на каждого игрока, дополнительные — в резерве.
  const newUnit = (type, location, holder = null) => {
    const uid = `u${++state.counters.unit}`;
    state.units[uid] = { uid, type, location, holder };
    return uid;
  };
  for (const pid of state.order) {
    for (const [type, n] of STARTING_ARMY) for (let i = 0; i < n; i++) newUnit(type, 'pool');
  }
  for (const [type, n] of EXTRA_POOL) for (let i = 0; i < n; i++) newUnit(type, r.extrasStartInReserve ? 'reserve' : 'pool');

  // Тайники: часть дополнительных юнитов прячется в случайные районы. Кто первым возьмёт район
  // под контроль (боем или картой, но не стартовым выбором), тот получает юнит. Где тайники — знает только сервер.
  state.stash = {};
  if (r.stash?.enabled) {
    const reserve = rng.shuffle(Object.values(state.units).filter((u) => u.location === 'reserve').map((u) => u.uid));
    const keep = r.bonusUnitBeforeRound && r.bonusUnitBeforeRound <= r.rounds ? state.order.length : 0;
    const want = r.stash.count === 'rest' ? reserve.length - keep : Math.min(r.stash.count, reserve.length - keep);
    const activeCapitals = new Set(factions.map((f) => CAPITALS[f]));
    const spots = rng.shuffle(REGION_IDS.filter((rid) => !(r.stash.excludeCapitals && activeCapitals.has(rid))));
    for (let i = 0; i < Math.max(0, want) && i < spots.length; i++) {
      const uid = reserve[i];
      state.units[uid].location = 'stash';
      state.stash[spots[i]] = uid;
    }
  }

  // Топ-оперативники — по одной случайной карте каждому, без повторов.
  const ops = rng.shuffle(Object.keys(OPERATIVES));
  state.order.forEach((pid, i) => {
    const cardUid = `c${++state.counters.card}`;
    state.players[pid].operative = { uid: cardUid, card: ops[i] };
  });

  emit(state, 'gameCreated', {}, 'Партия создана. Укрепрайоны закреплены за фракциями игроков.');
  startDraft(state, rng, now);
  return state;
}

// ---------------------------------------------------------------- стартовый выбор районов (ТЗ 11)
function startDraft(state, rng, now) {
  const picks = state.rules.draftPicks;
  if (!picks) { startRound(state, rng, now, true); return; }
  state.phase = 'draft';
  state.draft = { order: state.order.slice(), index: 0, cycle: 1, cycles: picks, picks: Object.fromEntries(state.order.map((p) => [p, []])) };
  emit(state, 'draftStart', {}, `Стартовый выбор: каждый игрок по очереди берёт ещё ${picks} ${picks === 1 ? 'район' : 'района'}.`);
  setDeadline(state, now, state.rules.draftSeconds);
}

/** Районы, доступные для стартового выбора: живые и ничейные. Других ограничений ТЗ не задаёт. */
export function draftOptions(state) {
  return REGION_IDS.filter((rid) => !state.regions[rid].destroyed && state.regions[rid].owner === null);
}

function draftPick(state, rng, now, pid, rid, auto = false) {
  state.regions[rid].owner = pid;
  state.draft.picks[pid].push(rid);
  const f = FACTIONS[state.players[pid].faction];
  emit(state, 'draftPick', { player: pid, region: rid, auto }, `${f.name}: ${auto ? 'время вышло, случайно закреплён' : 'выбран'} район ${label(rid)}.`);
  const d = state.draft;
  d.index += 1;
  if (d.index >= d.order.length) { d.index = 0; d.cycle += 1; }
  if (d.cycle > d.cycles || !draftOptions(state).length) {
    emit(state, 'draftEnd', {}, 'Стартовый выбор окончен. У каждого игрока укрепрайон и три района.');
    state.draft.done = true;
    startRound(state, rng, now, true);
    return;
  }
  setDeadline(state, now, state.rules.draftSeconds);
}

// ---------------------------------------------------------------- журнал событий
function emit(state, type, data, text, opts = {}) {
  const e = { seq: ++state.counters.event, round: state.round, type, data, text };
  if (opts.to) e.to = opts.to;           // приватное событие
  if (opts.privateText) e.privateText = opts.privateText;
  if (opts.privateTo) e.privateTo = opts.privateTo;
  state.log.push(e);
  return e;
}

// ---------------------------------------------------------------- раунд
function startRound(state, rng, now, first = false) {
  state.round += 1;
  state.actions = [];
  state.effects = state.effects.filter((e) => e.duration === 'permanent');
  state.gainedThisRound = {};
  for (const pid of state.order) state.gainedThisRound[pid] = [];
  emit(state, 'roundStart', { round: state.round }, `Раунд ${state.round} начался.`);

  dealUnits(state, rng, first);

  // Дополнительная выдача перед 4-м раундом (ТЗ 3.1).
  if (state.round === state.rules.bonusUnitBeforeRound) {
    for (const pid of state.order) {
      const uid = drawFromReserve(state, rng);
      if (uid) grantUnit(state, pid, uid, 'bonus');
      else emit(state, 'reserveEmpty', { player: pid }, 'В резерве не осталось дополнительных юнитов.');
    }
  }
  // Юниты, полученные за захваты в прошлом раунде.
  for (const pid of state.order) {
    for (const uid of state.pendingGrants[pid]) {
      state.units[uid].location = 'hand';
      state.units[uid].holder = pid;
      state.players[pid].hand.push(uid);
    }
    state.pendingGrants[pid] = [];
  }

  const order = state.rules.prepOrder === 'random' ? rng.shuffle(state.order) : rotate(state.order, state.rules.turnOrder === 'rotate' ? state.round - 1 : 0);
  state.prep = { order, index: 0 };
  state.turn = null;
  state.redirect = null;
  state.phase = 'prep';
  setDeadline(state, now, state.rules.prepSeconds);
}

function rotate(arr, k) {
  const n = arr.length;
  const s = ((k % n) + n) % n;
  return arr.slice(s).concat(arr.slice(0, s));
}

function setDeadline(state, now, secs) {
  state.deadline = secs > 0 ? now + secs * 1000 : null;
}

function dealUnits(state, rng, first) {
  for (const pid of state.order) state.players[pid].hand = [];
  const circulating = Object.values(state.units)
    .filter((u) => u.location === 'pool' || u.location === 'hand' || u.location === 'board')
    .filter((u) => !Object.values(state.pendingGrants).some((g) => g.includes(u.uid)));
  for (const u of circulating) { u.location = 'pool'; u.holder = null; }

  const give = (pid, uid) => {
    state.units[uid].location = 'hand';
    state.units[uid].holder = pid;
    state.players[pid].hand.push(uid);
  };

  if (first && state.rules.initialDeal === 'standardSet') {
    // Каждому — стандартная армия из 10 классических юнитов.
    const byType = {};
    for (const u of circulating) (byType[u.type] ||= []).push(u.uid);
    for (const pid of state.order) {
      for (const [type, n] of STARTING_ARMY) for (let i = 0; i < n; i++) give(pid, byType[type].shift());
    }
    // Оставшиеся (если доп. юниты стартуют в раздаче) — поровну.
    const rest = Object.values(byType).flat();
    rng.shuffle(rest).forEach((uid, i) => give(state.order[i % state.order.length], uid));
  } else {
    const shuffled = rng.shuffle(circulating.map((u) => u.uid));
    if (state.rules.distribution === 'random') {
      for (const uid of shuffled) give(rng.pick(state.order), uid);
    } else {
      const start = rng.int(state.order.length);
      shuffled.forEach((uid, i) => give(state.order[(start + i) % state.order.length], uid));
    }
  }
  const counts = state.order.map((p) => state.players[p].hand.length);
  emit(state, 'unitsDealt', { counts }, `Юниты перемешаны и розданы (${counts.join(' / ')}).`);
}

function drawFromReserve(state, rng) {
  const reserve = Object.values(state.units).filter((u) => u.location === 'reserve');
  if (!reserve.length) return null;
  return rng.pick(reserve).uid;
}

function grantUnit(state, pid, uid, reason) {
  const u = state.units[uid];
  u.location = 'hand';
  u.holder = pid;
  state.players[pid].hand.push(uid);
  const t = UNIT_TYPES[u.type];
  const f = FACTIONS[state.players[pid].faction];
  emit(state, 'unitGranted', { player: pid, type: u.type, reason },
    `${f.name}: получен дополнительный юнит «${t.name}».`);
}

// ---------------------------------------------------------------- активный игрок
export function activePlayer(state) {
  if (state.phase === 'draft') return state.draft.order[state.draft.index];
  if (state.phase === 'prep') return state.prep.order[state.prep.index];
  if (state.phase === 'turns') return state.turn.order[state.turn.index];
  if (state.phase === 'redirect') return state.redirect.player;
  return null;
}

function roundEffects(state, effect) {
  return state.effects.filter((e) => e.effect === effect && e.duration === 'round');
}

// ---------------------------------------------------------------- команды
/**
 * Применяет команду. Возвращает новое состояние. Исходное не меняется.
 * cmd: { id, type, player, now, ...payload }
 * Повторная команда с тем же id не выполняется повторно (идемпотентность).
 */
export function applyCommand(prev, cmd) {
  if (cmd.id && prev.processed[cmd.id]) {
    return { state: prev, duplicate: true, result: prev.processed[cmd.id] };
  }
  const state = clone(prev);
  const rng = new Rng(state.rng);
  const now = cmd.now ?? Date.now();
  const handler = HANDLERS[cmd.type];
  if (!handler) fail('UNKNOWN_COMMAND', `Неизвестная команда ${cmd.type}.`);
  if (state.phase === 'finished' && cmd.type !== 'noop') fail('FINISHED', 'Партия завершена.');
  const result = handler(state, cmd, rng, now) ?? {};
  state.version += 1;
  if (cmd.id) {
    state.processed[cmd.id] = { ok: true, version: state.version, ...result };
    const keys = Object.keys(state.processed);
    if (keys.length > 600) for (const k of keys.slice(0, keys.length - 600)) delete state.processed[k];
  }
  return { state, result };
}

function requireActive(state, cmd, phase) {
  if (state.phase !== phase) fail('WRONG_PHASE', phaseError(phase));
  if (!state.players[cmd.player]) fail('NO_PLAYER', 'Игрок не найден.');
  if (activePlayer(state) !== cmd.player) fail('NOT_YOUR_TURN', 'Сейчас не ваш ход.');
}

function phaseError(phase) {
  return {
    prep: 'Это действие доступно только в подготовке раунда.',
    draft: 'Это действие доступно только в стартовом выборе районов.',
    turns: 'Это действие доступно только во время ходов.',
    redirect: 'Сейчас не фаза «Авторитета».',
    summary: 'Сейчас не сводка раунда.',
  }[phase] ?? 'Неподходящая фаза.';
}

const HANDLERS = {
  // --- карты (и в подготовке, и в ходе)
  playCard(state, cmd, rng, now) {
    if (state.phase !== 'prep' && state.phase !== 'turns') fail('WRONG_PHASE', 'Карты играются в подготовке или в свой ход.');
    requireActive(state, cmd, state.phase);
    const pl = state.players[cmd.player];
    let cardId, isOperative = false, cardUid = cmd.card;
    if (pl.operative && pl.operative.uid === cardUid) {
      if (pl.operativeUsed) fail('CARD_USED', 'Карта топ-оперативника уже использована.');
      cardId = pl.operative.card; isOperative = true;
    } else {
      const c = pl.cards.find((x) => x.uid === cardUid);
      if (!c) fail('NO_CARD', 'У вас нет такой карты.');
      cardId = c.card;
    }
    const card = ALL_CARDS[cardId];
    const phaseKey = state.phase === 'prep' ? 'prep' : 'turn';
    if (!card.phases.includes(phaseKey)) {
      fail('CARD_TIMING', card.phases.includes('prep') ? 'Эту карту можно сыграть только в подготовке раунда.' : 'Эту карту можно сыграть только в свой ход.');
    }
    if (phaseKey === 'turn') {
      if (state.turn.cardsUsed >= state.rules.maxCardsPerTurn) fail('CARD_LIMIT', `За ход можно сыграть не больше ${state.rules.maxCardsPerTurn} карт.`);
      if (state.turn.placed > 0) fail('CARD_TIMING', 'Карту нужно сыграть до выставления юнита.');
      if (card.consumesTurnUnit && state.turn.placed >= state.rules.unitsPerTurn) fail('CARD_TIMING', 'Юнит в этом ходу уже выставлен.');
    }
    const ctx = makeCtx(state, rng, cmd.player, card, cmd.target ?? {});
    TARGET_VALIDATORS[card.target](ctx);
    EFFECTS[card.effect].validate?.(ctx);
    const summary = EFFECTS[card.effect].apply(ctx);

    if (isOperative) pl.operativeUsed = true;
    else {
      pl.cards = pl.cards.filter((x) => x.uid !== cardUid);
      pl.usedCards.push({ uid: cardUid, card: cardId, round: state.round });
    }
    const f = FACTIONS[pl.faction];
    emit(state, 'cardPlayed', { player: cmd.player, card: cardId, target: publicTarget(card, cmd.target) },
      `${f.name} · «${card.name}»: ${summary}.`,
      ctx.privateNote ? { privateText: ctx.privateNote, privateTo: [cmd.player] } : {});

    if (phaseKey === 'turn') {
      state.turn.cardsUsed += 1;
      if (card.consumesTurnUnit) { state.turn.placed = state.rules.unitsPerTurn; endTurn(state, rng, now, 'card'); }
    }
    return { card: cardId };
  },

  // --- стартовая фаза: выбрать район
  draftPick(state, cmd, rng, now) {
    requireActive(state, cmd, 'draft');
    const r = state.regions[cmd.region];
    if (!r) fail('NO_REGION', 'Такого района нет.');
    if (r.destroyed) fail('DESTROYED', `Район ${label(cmd.region)} уничтожен.`);
    if (r.owner) fail('TAKEN', `Район ${label(cmd.region)} уже занят.`);
    draftPick(state, rng, now, cmd.player, cmd.region);
    return { region: cmd.region };
  },

  // --- подготовка: игрок закончил
  ready(state, cmd, rng, now) {
    requireActive(state, cmd, 'prep');
    advancePrep(state, rng, now);
  },

  // --- ход: выставить юнит
  placeUnit(state, cmd, rng, now) {
    requireActive(state, cmd, 'turns');
    const v = validatePlacement(state, cmd.player, cmd.unit, cmd.region);
    if (!v.ok) fail(v.code, v.message);
    const pl = state.players[cmd.player];
    pl.hand = pl.hand.filter((u) => u !== cmd.unit);
    state.units[cmd.unit].location = 'board';
    const action = {
      id: `a${++state.counters.action}`, round: state.round, player: cmd.player, unit: cmd.unit,
      region: cmd.region, kind: v.kind, mutation: !!state.turn.mutation, void: false,
    };
    state.actions.push(action);
    state.turn.placed += 1;
    const f = FACTIONS[pl.faction];
    const t = UNIT_TYPES[state.units[cmd.unit].type];
    emit(state, 'unitPlaced', { player: cmd.player, region: cmd.region, action: action.id },
      `${f.name}: отряд выставлен на ${label(cmd.region)}.`,
      { privateText: `Вы выставили «${t.name}» (${t.strength}) на ${label(cmd.region)} — ${v.kind === 'defend' ? 'защита' : 'атака'}.`, privateTo: [cmd.player] });
    if (state.turn.placed >= state.rules.unitsPerTurn) endTurn(state, rng, now, 'placed');
    return { action: action.id };
  },

  // --- ход: пропустить (вручную)
  skipTurn(state, cmd, rng, now) {
    requireActive(state, cmd, 'turns');
    const f = FACTIONS[state.players[cmd.player].faction];
    emit(state, 'turnSkipped', { player: cmd.player, reason: 'manual' }, `${f.name}: ход пропущен.`);
    endTurn(state, rng, now, 'skip');
  },

  // --- «Авторитет»: перенаправить один юнит
  redirectMove(state, cmd) {
    requireActive(state, cmd, 'redirect');
    const r = state.redirect;
    if (r.moved.length >= r.maxUnits) fail('LIMIT', `Можно перенаправить не больше ${r.maxUnits} юнитов.`);
    const a = state.actions.find((x) => x.id === cmd.action);
    if (!a || a.void) fail('BAD_TARGET', 'Такого действия нет.');
    if (a.player === cmd.player) fail('BAD_TARGET', 'Перенаправлять можно только юниты противников.');
    if (r.moved.includes(a.id)) fail('BAD_TARGET', 'Этот юнит уже перенаправлен.');
    if (a.region === cmd.region) fail('BAD_TARGET', 'Юнит уже стоит на этом районе.');
    const v = validateRedirectTarget(state, a, cmd.region);
    if (!v.ok) fail(v.code, v.message);
    const from = a.region;
    a.region = cmd.region;
    a.kind = v.kind;
    a.redirected = true;
    r.moved.push(a.id);
    emit(state, 'unitRedirected', { action: a.id, from, to: cmd.region },
      `«Авторитет» перенаправил отряд ${FACTIONS[state.players[a.player].faction].name}: ${label(from)} → ${label(cmd.region)}.`);
    return { moved: r.moved.length };
  },

  redirectDone(state, cmd, rng, now) {
    requireActive(state, cmd, 'redirect');
    resolveRound(state, rng, now);
  },

  // --- сводка: игрок ознакомился
  ackSummary(state, cmd, rng, now) {
    if (state.phase !== 'summary') fail('WRONG_PHASE', phaseError('summary'));
    if (!state.players[cmd.player]) fail('NO_PLAYER', 'Игрок не найден.');
    state.summaryAcks[cmd.player] = true;
    if (state.order.every((p) => state.summaryAcks[p])) nextRoundOrFinish(state, rng, now);
  },

  // --- истечение таймера (присылает сервер)
  timeout(state, cmd, rng, now) {
    if (cmd.expectVersion != null && cmd.expectVersion !== state.version) fail('STALE', 'Состояние изменилось.');
    const p = activePlayer(state);
    if (state.phase === 'draft') {
      draftPick(state, rng, now, p, rng.pick(draftOptions(state)), true);
    } else if (state.phase === 'prep') {
      emit(state, 'prepTimeout', { player: p }, `${FACTIONS[state.players[p].faction].name}: время подготовки вышло.`);
      advancePrep(state, rng, now);
    } else if (state.phase === 'turns') {
      emit(state, 'turnSkipped', { player: p, reason: cmd.reason ?? 'timeout' },
        `${FACTIONS[state.players[p].faction].name}: ${cmd.reason === 'disconnect' ? 'игрок не вернулся вовремя' : 'время хода вышло'} — ход пропущен.`);
      endTurn(state, rng, now, 'timeout');
    } else if (state.phase === 'redirect') {
      resolveRound(state, rng, now);
    } else if (state.phase === 'summary') {
      nextRoundOrFinish(state, rng, now);
    } else fail('WRONG_PHASE', 'Нечего пропускать.');
  },

  noop() {},
};

function publicTarget(card, target) {
  if (!target) return null;
  return JSON.parse(JSON.stringify(target));
}

function makeCtx(state, rng, player, card, target) {
  const ctx = {
    state, rng, player, card, target, privateNote: null,
    emit: (type, data, text) => emit(state, type, data, text),
    setOwner: (rid, owner, how) => setOwner(state, rid, owner, how),
    destroyRegion: (rid) => destroyRegion(state, rid),
    sweepRegion: (rid) => sweepRegion(state, rid),
  };
  return ctx;
}

function setOwner(state, rid, owner, how) {
  const r = state.regions[rid];
  const prev = r.owner;
  r.owner = owner;
  if (owner && state.gainedThisRound[owner] && prev !== owner) state.gainedThisRound[owner].push(rid);
  if (owner && prev !== owner && state.players[owner]) claimStash(state, rid, owner);
  return prev;
}

/** Игрок взял район под контроль — если там тайник, юнит уходит ему (в руку со следующего раунда). */
function claimStash(state, rid, pid) {
  const uid = state.stash?.[rid];
  if (!uid) return;
  delete state.stash[rid];
  const u = state.units[uid];
  u.location = 'granted';
  u.holder = pid;
  state.pendingGrants[pid].push(uid);
  (state.stashClaims ||= []).push({ player: pid, type: u.type, region: rid, round: state.round });
  emit(state, 'unitGranted', { player: pid, type: u.type, reason: 'stash', region: rid },
    `${FACTIONS[state.players[pid].faction].name}: в районе ${label(rid)} найден тайник — дополнительный юнит «${UNIT_TYPES[u.type].name}» (в руке со следующего раунда).`);
}

function destroyRegion(state, rid) {
  const r = state.regions[rid];
  r.destroyed = true;
  r.owner = null;
  r.pendingOwner = null;
  r.inviolable = false;
  r.shrine = false;
  // Тайник в уничтоженном районе пропадает: юнит возвращается в резерв (копии не теряются).
  if (state.stash?.[rid]) {
    state.units[state.stash[rid]].location = 'reserve';
    delete state.stash[rid];
    emit(state, 'stashLost', { region: rid }, `В районе ${label(rid)} был тайник — он сгорел вместе с районом.`);
  }
  // Юниты на уничтоженном районе уничтожаются вместе с ним (ТЗ 8.9).
  let killed = 0;
  for (const a of state.actions) {
    if (a.region === rid && !a.void) {
      a.void = true; a.voidReason = 'destroyed';
      state.units[a.unit].location = 'destroyed';
      killed++;
    }
  }
  state.actions = state.actions.filter((a) => !(a.region === rid && a.voidReason === 'destroyed'));
  emit(state, 'regionDestroyed', { region: rid, killed }, `Район ${label(rid)} уничтожен${killed ? ` вместе с юнитами (${killed})` : ''}.`);
}

function sweepRegion(state, rid) {
  // Юниты сметаются в общий сброс (пул), не уничтожаются (ТЗ 8.14).
  let n = 0;
  for (const a of state.actions) {
    if (a.region === rid && !a.void) {
      state.units[a.unit].location = 'pool';
      state.units[a.unit].holder = null;
      n++;
    }
  }
  state.actions = state.actions.filter((a) => !(a.region === rid && !a.void));
  return n;
}

// ---------------------------------------------------------------- проверки выставления
export function validatePlacement(state, pid, unitUid, rid) {
  const no = (code, message) => ({ ok: false, code, message });
  const pl = state.players[pid];
  if (!pl) return no('NO_PLAYER', 'Игрок не найден.');
  const u = state.units[unitUid];
  if (!u || u.holder !== pid) return no('NO_UNIT', 'У вас нет такого юнита.');
  if (u.location !== 'hand') return no('UNIT_USED', 'Этот юнит уже задействован.');
  const r = state.regions[rid];
  if (!r) return no('NO_REGION', 'Такого района нет.');
  if (r.destroyed) return no('DESTROYED', `Район ${label(rid)} уничтожен.`);
  if (r.pendingOwner) return no('PENDING', `Район ${label(rid)} восстанавливается и в этом раунде недоступен.`);
  if (roundEffects(state, 'freezeRegion').some((e) => e.data.region === rid)) return no('FROZEN', `«ЗаМир»: район ${label(rid)} нельзя атаковать или защищать в этом раунде.`);
  const type = UNIT_TYPES[u.type];
  if (roundEffects(state, 'navalOnly').some((e) => e.data.player === pid) && !type.naval) {
    return no('NAVAL_ONLY', '«Озеро в лесу»: в этом раунде вы воюете только морскими юнитами.');
  }
  const limit = roundEffects(state, 'unitLimit').filter((e) => e.data.player === pid).map((e) => e.data.limit);
  if (limit.length) {
    const used = state.actions.filter((a) => a.player === pid).length;
    if (used >= Math.min(...limit)) return no('UNIT_LIMIT', '«Креативная»: лимит юнитов на этот раунд исчерпан.');
  }
  if (r.owner === pid) {
    if (type.naval && !r.coastal) return no('NO_WATER', 'Морской юнит может защищать только район с водной границей.');
    return { ok: true, kind: 'defend' };
  }
  if (r.inviolable) return no('INVIOLABLE', `Район ${label(rid)} неприкосновенен.`);
  if (r.shrine) return no('SHRINE', `Район ${label(rid)} — святыня, его нельзя атаковать.`);
  if (type.naval) {
    if (!r.coastal) return no('NO_WATER', 'Морской юнит может атаковать только район с водной границей.');
    if (state.rules.navalAttackFromSea) return { ok: true, kind: 'attack' };
  }
  if (state.rules.requireAdjacencyForLand && !hasAttackSource(state, pid, rid)) {
    return no('NO_ROUTE', `Нет пути к ${label(rid)}: нужен соседний ваш район или мост.`);
  }
  return { ok: true, kind: 'attack' };
}

function validateRedirectTarget(state, action, rid) {
  const no = (code, message) => ({ ok: false, code, message });
  const r = state.regions[rid];
  if (!r) return no('NO_REGION', 'Такого района нет.');
  if (r.destroyed) return no('DESTROYED', 'Район уничтожен.');
  if (r.pendingOwner) return no('PENDING', 'Район восстанавливается.');
  if (roundEffects(state, 'freezeRegion').some((e) => e.data.region === rid)) return no('FROZEN', 'Район заморожен «ЗаМиром».');
  const type = UNIT_TYPES[state.units[action.unit].type];
  if (type.naval && !r.coastal) return no('NO_WATER', 'Этот юнит не может действовать на районе без водной границы.');
  if (r.owner === action.player) return { ok: true, kind: 'defend' };
  if (r.inviolable || r.shrine) return no('PROTECTED', 'Этот район нельзя атаковать.');
  return { ok: true, kind: 'attack' };
}

/** Районы, куда игрок может выставить юнит (для подсветки в интерфейсе). */
export function legalTargets(state, pid, unitUid) {
  return REGION_IDS.filter((rid) => validatePlacement(state, pid, unitUid, rid).ok);
}

// ---------------------------------------------------------------- переходы фаз
function advancePrep(state, rng, now) {
  state.prep.index += 1;
  if (state.prep.index < state.prep.order.length) {
    setDeadline(state, now, state.rules.prepSeconds);
    return;
  }
  const order = rotate(state.order, state.rules.turnOrder === 'rotate' ? state.round - 1 : 0);
  // Ходы идут кругами: в каждом круге все игроки по разу, всего turnsPerPlayerPerRound кругов.
  state.turn = { order, index: 0, cycle: 1, cycles: state.rules.turnsPerPlayerPerRound, placed: 0, cardsUsed: 0, mutation: false };
  state.phase = 'turns';
  emit(state, 'turnsStart', { order }, `Подготовка окончена. Начинаются ходы: ${state.turn.cycles} ${state.turn.cycles === 1 ? 'круг' : 'кругов'}.`);
  if (!skipIdle(state)) { finishTurns(state, rng, now); return; }
  setDeadline(state, now, state.rules.turnSeconds);
}

/** Есть ли у игрока что делать в ходе: юнит в руке или карта, которую можно сыграть в ход. */
function canAct(state, pid) {
  const p = state.players[pid];
  return p.hand.length > 0 || p.cards.some((c) => ALL_CARDS[c.card].phases.includes('turn'));
}

/** Переходит к следующему ходу. Возвращает false, если ходы раунда закончились. */
function nextTurnSlot(state) {
  const t = state.turn;
  // партии, сохранённые до введения кругов, доигрываются с одним кругом
  if (t.cycle == null) { t.cycle = 1; t.cycles = 1; }
  t.index += 1;
  if (t.index >= t.order.length) { t.index = 0; t.cycle += 1; }
  return t.cycle <= t.cycles;
}

/** Автоматически пропускает игроков, у которых нечем ходить. false — ходы закончились. */
function skipIdle(state) {
  const t = state.turn;
  let guard = 0;
  while (!canAct(state, t.order[t.index])) {
    const pid = t.order[t.index];
    emit(state, 'turnSkipped', { player: pid, reason: 'empty' }, `${FACTIONS[state.players[pid].faction].name}: юниты закончились — ход пропущен.`);
    if (!nextTurnSlot(state) || ++guard > 200) return false;
  }
  return true;
}

function endTurn(state, rng, now) {
  state.turn.placed = 0;
  state.turn.cardsUsed = 0;
  state.turn.mutation = false;
  if (nextTurnSlot(state) && skipIdle(state)) {
    setDeadline(state, now, state.rules.turnSeconds);
    return;
  }
  finishTurns(state, rng, now);
}

function finishTurns(state, rng, now) {
  const shl = roundEffects(state, 'redirect')[0];
  const anyEnemyActions = shl && state.actions.some((a) => a.player !== shl.owner && !a.void);
  if (shl && anyEnemyActions) {
    state.phase = 'redirect';
    state.redirect = { player: shl.owner, maxUnits: shl.data.maxUnits, moved: [] };
    emit(state, 'redirectStart', { player: shl.owner }, `«Авторитет»: ${FACTIONS[state.players[shl.owner].faction].name} перенаправляет юниты.`);
    setDeadline(state, now, state.rules.redirectSeconds);
    return;
  }
  resolveRound(state, rng, now);
}

// ---------------------------------------------------------------- итоги раунда
function resolveRound(state, rng, now) {
  state.phase = 'resolving';
  const s = state;
  const frozen = new Set(roundEffects(s, 'freezeRegion').map((e) => e.data.region));
  const acid = new Set(roundEffects(s, 'removeBaseDefense').flatMap((e) => e.data.regions));
  const airBonus = roundEffects(s, 'defendersBonus').reduce((sum, e) => sum + e.data.bonus, 0);
  const defBonus = roundEffects(s, 'defenseBonus');
  const atkBonus = roundEffects(s, 'attackBonus');
  const secret = roundEffects(s, 'secretAttackBonus');

  const battles = [];
  const changes = [];
  for (const rid of REGION_IDS) {
    const r = s.regions[rid];
    const acts = s.actions.filter((a) => a.region === rid && !a.void);
    if (!acts.length && !defBonus.some((e) => e.data.region === rid)) continue;
    if (r.destroyed || r.pendingOwner) continue;
    if (frozen.has(rid)) {
      if (acts.length) battles.push({ region: rid, outcome: 'frozen', owner: r.owner, units: acts.length });
      continue;
    }
    const owner = r.owner;
    const stype = STATIC_REGIONS[rid].type;
    const base = acid.has(rid) ? 0 : s.rules.baseDefense[stype];
    let defense = 0;
    const defenders = [];
    const attacks = {};
    for (const a of acts) {
      const t = UNIT_TYPES[s.units[a.unit].type];
      if (owner && a.player === owner) {
        const v = t.strength + airBonus;
        defense += v;
        defenders.push(a.player);
      } else {
        attacks[a.player] = (attacks[a.player] ?? 0) + t.strength + (a.mutation ? 2 : 0);
      }
    }
    for (const e of defBonus) if (e.data.region === rid && owner === e.owner) defense += e.data.bonus;
    // Атаки на неприкосновенный район / святыню недействительны (могли стать такими после выставления).
    if (r.inviolable || r.shrine) for (const k of Object.keys(attacks)) delete attacks[k];
    for (const p of Object.keys(attacks)) {
      for (const e of atkBonus) if (e.data.region === rid && e.owner === p) attacks[p] += e.data.bonus;
      for (const e of secret) if (e.data.region === rid && e.owner === p) attacks[p] += e.hidden.value;
    }
    const res = resolveBattle({ owner, baseDefense: base, defense, attacks });
    battles.push({
      region: rid, owner, base, defense, defenseTotal: res.defenseTotal, attacks: { ...attacks },
      defenders: defenders.length, outcome: res.outcome, winner: res.winner, leaders: res.leaders, maxAttack: res.maxAttack,
    });
    if (res.outcome === 'captured') changes.push([rid, res.winner, owner]);
  }
  // Одновременная смена владельцев.
  for (const [rid, winner, prev] of changes) {
    setOwner(s, rid, winner, 'battle');
    const f = FACTIONS[s.players[winner].faction];
    emit(s, 'regionCaptured', { region: rid, player: winner, prev }, `${f.name}: захвачен ${label(rid)}.`);
  }
  // Восстановленные районы переходят к игроку, применившему карту.
  for (const rid of REGION_IDS) {
    const r = s.regions[rid];
    if (r.pendingOwner) {
      const p = r.pendingOwner;
      r.pendingOwner = null;
      setOwner(s, rid, p, 'restore');
      emit(s, 'regionTransferred', { region: rid, player: p }, `${FACTIONS[s.players[p].faction].name}: восстановленный район ${label(rid)} переходит под контроль.`);
    }
  }
  // Карты-награды за полностью захваченные территории.
  const rewards = [];
  for (const tid of Object.keys(TERRITORIES)) {
    if (s.claimedRewards[tid]) continue;
    const owner = territoryAllOwnedBy(s, tid);
    if (!owner) continue;
    const gained = s.gainedThisRound[owner] ?? [];
    if (!TERRITORIES[tid].regions.some((x) => gained.includes(x))) continue;
    const cardId = rng.pick(TERRITORY_REWARDS[tid]);
    const uid = `c${++s.counters.card}`;
    s.players[owner].cards.push({ uid, card: cardId, from: tid });
    s.claimedRewards[tid] = owner;
    rewards.push({ territory: tid, player: owner, card: cardId });
    const f = FACTIONS[s.players[owner].faction];
    emit(s, 'rewardGranted', { territory: tid, player: owner }, `${f.name}: территория «${TERRITORIES[tid].name}» захвачена полностью — получена карта-награда.`,
      { privateText: `Карта-награда за «${TERRITORIES[tid].name}»: «${ALL_CARDS[cardId].name}».`, privateTo: [owner] });
  }
  // Дополнительные юниты за захват (параметризовано, по умолчанию выключено).
  const unitRewards = [];
  const cur = s.rules.captureUnitReward;
  if (cur?.enabled) {
    for (const [rid, winner] of changes) {
      if (!cur.regionTypes.includes(STATIC_REGIONS[rid].type)) continue;
      if (rng.next() >= cur.chance) continue;
      const uid = drawFromReserve(s, rng);
      if (!uid) continue;
      s.units[uid].location = 'granted';
      s.units[uid].holder = winner;
      s.pendingGrants[winner].push(uid);
      unitRewards.push({ player: winner, type: s.units[uid].type, region: rid });
      emit(s, 'unitGranted', { player: winner, type: s.units[uid].type, reason: 'capture' },
        `${FACTIONS[s.players[winner].faction].name}: за захват ${label(rid)} получен дополнительный юнит «${UNIT_TYPES[s.units[uid].type].name}».`);
    }
  }
  // Сводка раунда.
  const cardsPlayed = s.log.filter((e) => e.round === s.round && e.type === 'cardPlayed').map((e) => ({ player: e.data.player, card: e.data.card }));
  const grants = s.log.filter((e) => e.round === s.round && e.type === 'unitGranted').map((e) => e.data);
  for (const c of s.stashClaims ?? []) if (c.round === s.round) unitRewards.push(c);
  const summary = { round: s.round, battles, rewards, unitRewards, cardsPlayed, grants, scores: computeScores(s) };
  s.history.push(summary);
  s.lastSummary = summary;

  // Все юниты с карты — в общий пул.
  for (const a of s.actions) {
    const u = s.units[a.unit];
    if (u.location === 'board') { u.location = 'pool'; u.holder = null; }
  }
  s.actions = [];
  s.effects = s.effects.filter((e) => e.duration === 'permanent');
  emit(s, 'roundEnd', { round: s.round }, `Раунд ${s.round} завершён. Захвачено районов: ${changes.length}.`);

  if (s.round >= s.rules.rounds) {
    finishGame(s);
    return;
  }
  s.phase = 'summary';
  s.summaryAcks = {};
  setDeadline(s, now, s.rules.summarySeconds);
}

function nextRoundOrFinish(state, rng, now) {
  if (state.round >= state.rules.rounds) finishGame(state);
  else startRound(state, rng, now);
}

export function computeScores(state) {
  const scores = {};
  for (const p of state.order) scores[p] = 0;
  for (const rid of REGION_IDS) {
    const r = state.regions[rid];
    if (r.destroyed) continue;
    if (!r.owner || !scores.hasOwnProperty(r.owner)) continue;
    scores[r.owner] += state.rules.points[STATIC_REGIONS[rid].type] ?? 0;
  }
  return scores;
}

function finishGame(state) {
  const scores = computeScores(state);
  const max = Math.max(...Object.values(scores));
  const winners = Object.keys(scores).filter((p) => scores[p] === max);
  state.result = { scores, winners, draw: winners.length > 1 };
  state.phase = 'finished';
  state.deadline = null;
  const names = winners.map((p) => FACTIONS[state.players[p].faction].name).join(', ');
  emit(state, 'gameEnd', state.result, winners.length > 1 ? `Ничья: ${names} (${max} очк.).` : `Победа: ${names} (${max} очк.).`);
}

// ---------------------------------------------------------------- проверки целостности
export function unitCensus(state) {
  const c = { total: 0, reserve: 0, pool: 0, hand: 0, board: 0, destroyed: 0, granted: 0 };
  for (const u of Object.values(state.units)) { c.total++; c[u.location] = (c[u.location] ?? 0) + 1; }
  return c;
}

export function checkIntegrity(state) {
  const errors = [];
  const seen = new Set();
  for (const pid of state.order) {
    for (const uid of state.players[pid].hand) {
      if (seen.has(uid)) errors.push(`Юнит ${uid} у двух игроков`);
      seen.add(uid);
      const u = state.units[uid];
      if (!u || u.location !== 'hand' || u.holder !== pid) errors.push(`Юнит ${uid} в руке ${pid} не согласован`);
    }
  }
  for (const a of state.actions) {
    if (seen.has(a.unit)) errors.push(`Юнит ${a.unit} одновременно в руке и на карте`);
    seen.add(a.unit);
  }
  const expected = state.order.length * 10 + 18;
  if (Object.keys(state.units).length !== expected) errors.push(`В реестре ${Object.keys(state.units).length} юнитов, ожидалось ${expected}`);
  return errors;
}
