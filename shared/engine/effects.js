// Единый механизм эффектов карт (ТЗ 10).
// Каждая карта описана данными (config/cards.js), а её логика — обработчиком здесь.
// Обработчик: validate(ctx) — бросает GameError при недопустимой цели; apply(ctx) — меняет состояние.
// Порядок разрешения эффектов в конце раунда зафиксирован в game.js → resolveRound (см. RESOLUTION_ORDER).
import { fail } from './errors.js';
import { isLive, areAdjacent, territoryRegions, STATIC_REGIONS } from './board.js';
import { TERRITORIES } from '../config/map.js';

const regionLabel = (state, id) => STATIC_REGIONS[id]?.label ?? id;

// ---------- проверки целей ----------
function needRegion(ctx, key = 'region') {
  const id = ctx.target?.[key];
  if (!id || !ctx.state.regions[id]) fail('BAD_TARGET', 'Выберите район.');
  return id;
}
function needLive(ctx, id) {
  if (!isLive(ctx.state, id)) fail('BAD_TARGET', `Район ${regionLabel(ctx.state, id)} уничтожен.`);
}
function needPlayer(ctx, key = 'player') {
  const id = ctx.target?.[key];
  if (!id || !ctx.state.players[id]) fail('BAD_TARGET', 'Выберите игрока.');
  return id;
}

export const TARGET_VALIDATORS = {
  none: () => {},
  region(ctx) { needLive(ctx, needRegion(ctx)); },
  liveRegion(ctx) { needLive(ctx, needRegion(ctx)); },
  ownRegion(ctx) {
    const id = needRegion(ctx); needLive(ctx, id);
    if (ctx.state.regions[id].owner !== ctx.player) fail('BAD_TARGET', 'Нужен ваш собственный район.');
  },
  notOwnRegion(ctx) {
    const id = needRegion(ctx); needLive(ctx, id);
    if (ctx.state.regions[id].owner === ctx.player) fail('BAD_TARGET', 'Нужен район, который вы не контролируете.');
  },
  coastalRegion(ctx) {
    const id = needRegion(ctx); needLive(ctx, id);
    if (!ctx.state.regions[id].coastal) fail('BAD_TARGET', 'Нужен район с водной границей.');
  },
  destroyedRegion(ctx) {
    const id = needRegion(ctx);
    if (!ctx.state.regions[id].destroyed) fail('BAD_TARGET', 'Нужен уничтоженный район.');
  },
  anyPlayer(ctx) { needPlayer(ctx); },
  opponent(ctx) {
    const p = needPlayer(ctx);
    if (p === ctx.player) fail('BAD_TARGET', 'Нужен противник, а не вы.');
  },
  transfer(ctx) {
    const from = needPlayer(ctx, 'from');
    const to = needPlayer(ctx, 'to');
    if (from === ctx.player || to === ctx.player) fail('BAD_TARGET', 'Нельзя забирать у себя или передавать себе.');
    if (from === to) fail('BAD_TARGET', 'Отдающий и получающий игроки должны различаться.');
    const regs = ctx.target.regions;
    if (!Array.isArray(regs) || regs.length !== 2 || regs[0] === regs[1]) fail('BAD_TARGET', 'Выберите ровно два разных района.');
    for (const r of regs) {
      if (!ctx.state.regions[r]) fail('BAD_TARGET', 'Неизвестный район.');
      needLive(ctx, r);
      if (ctx.state.regions[r].owner !== from) fail('BAD_TARGET', `Район ${regionLabel(ctx.state, r)} не принадлежит выбранному игроку.`);
    }
  },
  territory(ctx) {
    const t = ctx.target?.territory;
    if (!t || !TERRITORIES[t]) fail('BAD_TARGET', 'Выберите территорию.');
  },
  bridge(ctx) {
    const b = ctx.target?.bridge;
    if (!b || !ctx.state.bridges[b]) fail('BAD_TARGET', 'Выберите мост.');
    if (ctx.state.bridges[b].destroyed) fail('BAD_TARGET', 'Этот мост уже разрушен.');
  },
  twoAdjacentRegions(ctx) {
    const regs = ctx.target?.regions;
    if (!Array.isArray(regs) || regs.length !== 2) fail('BAD_TARGET', 'Выберите два соседних района.');
    for (const r of regs) { if (!ctx.state.regions[r]) fail('BAD_TARGET', 'Неизвестный район.'); needLive(ctx, r); }
    if (!areAdjacent(ctx.state, regs[0], regs[1])) fail('BAD_TARGET', 'Районы должны быть соседними.');
  },
  twoCapitals(ctx) {
    const regs = ctx.target?.regions;
    if (!Array.isArray(regs) || regs.length !== 2 || regs[0] === regs[1]) fail('BAD_TARGET', 'Выберите две разные столицы.');
    for (const r of regs) {
      if (!ctx.state.regions[r]) fail('BAD_TARGET', 'Неизвестный район.');
      needLive(ctx, r);
      if (STATIC_REGIONS[r].type !== 'capital') fail('BAD_TARGET', `${regionLabel(ctx.state, r)} — не столица.`);
    }
  },
  swap(ctx) {
    const own = ctx.target?.own, enemy = ctx.target?.enemy;
    if (!own || !enemy || !ctx.state.regions[own] || !ctx.state.regions[enemy]) fail('BAD_TARGET', 'Выберите свой и чужой район.');
    needLive(ctx, own); needLive(ctx, enemy);
    if (ctx.state.regions[own].owner !== ctx.player) fail('BAD_TARGET', 'Первый район должен быть вашим.');
    const eo = ctx.state.regions[enemy].owner;
    if (!eo || eo === ctx.player) fail('BAD_TARGET', 'Второй район должен принадлежать другой стороне.');
  },
};

// ---------- обработчики эффектов ----------
const addEffect = (ctx, effect, duration, data = {}, hidden = undefined) => {
  const e = {
    id: `e${++ctx.state.counters.effect}`, card: ctx.card.id, owner: ctx.player,
    effect, duration, round: ctx.state.round, data,
  };
  if (hidden) e.hidden = hidden;
  ctx.state.effects.push(e);
  return e;
};

export const EFFECTS = {
  defenseBonus: {
    apply(ctx) {
      addEffect(ctx, 'defenseBonus', 'round', { region: ctx.target.region, bonus: ctx.card.params.bonus });
      return `защита района ${regionLabel(ctx.state, ctx.target.region)} +${ctx.card.params.bonus}`;
    },
  },
  navalOnly: {
    apply(ctx) {
      addEffect(ctx, 'navalOnly', 'round', { player: ctx.target.player });
      return `у игрока «${ctx.state.players[ctx.target.player].name}» в этом раунде воюют только морские юниты`;
    },
  },
  freezeRegion: {
    apply(ctx) {
      addEffect(ctx, 'freezeRegion', 'round', { region: ctx.target.region });
      return `район ${regionLabel(ctx.state, ctx.target.region)} заморожен до конца раунда`;
    },
  },
  redirect: {
    apply(ctx) {
      addEffect(ctx, 'redirect', 'round', { maxUnits: ctx.card.params.maxUnits, moved: [] });
      return 'в конце раунда будут перенаправлены до 6 юнитов противников';
    },
  },
  secretAttackBonus: {
    apply(ctx) {
      const value = ctx.rng.pick(ctx.card.params.options);
      addEffect(ctx, 'secretAttackBonus', 'round', { region: ctx.target.region }, { value });
      ctx.privateNote = `Выпал бонус +${value} к атаке на ${regionLabel(ctx.state, ctx.target.region)}.`;
      return `тайный бонус к атаке на ${regionLabel(ctx.state, ctx.target.region)}`;
    },
  },
  seizeRegion: {
    validate(ctx) {
      const r = ctx.state.regions[ctx.target.region];
      const rules = ctx.state.rules.seizeAllowed;
      if (!rules.neutral && r.owner === null) fail('BAD_TARGET', 'Ничейные районы выбирать нельзя.');
      if (!rules.protected && (r.inviolable || r.shrine)) fail('BAD_TARGET', 'Защищённые картами районы выбирать нельзя.');
    },
    apply(ctx) {
      ctx.setOwner(ctx.target.region, ctx.player, 'card');
      return `район ${regionLabel(ctx.state, ctx.target.region)} занят без боя`;
    },
  },
  restoreRegion: {
    apply(ctx) {
      const id = ctx.target.region;
      const r = ctx.state.regions[id];
      r.destroyed = false;
      r.owner = null;
      r.pendingOwner = ctx.player;
      r.coastal = STATIC_REGIONS[id].coastal;
      ctx.emit('regionRestored', { region: id, player: ctx.player }, `Район ${regionLabel(ctx.state, id)} восстановлен.`);
      return `район ${regionLabel(ctx.state, id)} восстановлен и перейдёт под контроль в конце раунда`;
    },
  },
  attackBonus: {
    apply(ctx) {
      addEffect(ctx, 'attackBonus', 'round', { region: ctx.target.region, bonus: ctx.card.params.bonus });
      return `+${ctx.card.params.bonus} к атаке на ${regionLabel(ctx.state, ctx.target.region)}`;
    },
  },
  unitLimit: {
    apply(ctx) {
      addEffect(ctx, 'unitLimit', 'round', { player: ctx.target.player, limit: ctx.card.params.limit });
      return `игрок «${ctx.state.players[ctx.target.player].name}» ограничен тремя юнитами на раунд`;
    },
  },
  transferRegions: {
    apply(ctx) {
      for (const r of ctx.target.regions) ctx.setOwner(r, ctx.target.to, 'card');
      const labels = ctx.target.regions.map((r) => regionLabel(ctx.state, r)).join(' и ');
      return `${labels}: от «${ctx.state.players[ctx.target.from].name}» к «${ctx.state.players[ctx.target.to].name}»`;
    },
  },
  revealArmies: {
    apply(ctx) {
      const s = ctx.state;
      const snapshot = {};
      for (const p of s.order) {
        if (p === ctx.player) continue;
        const hand = s.players[p].hand.map((u) => s.units[u].type);
        const placed = s.actions.filter((a) => a.player === p).map((a) => ({ type: s.units[a.unit].type, region: a.region }));
        snapshot[p] = { hand, placed };
      }
      s.privateReveals[ctx.player].push({ round: s.round, kind: 'uav', data: snapshot });
      ctx.privateNote = 'БПЛА передал разведданные: состав сил соперников открыт только вам.';
      return 'дрон в воздухе, разведданные получены';
    },
  },
  destroyRegion: {
    apply(ctx) {
      ctx.destroyRegion(ctx.target.region);
      return `цель — ${regionLabel(ctx.state, ctx.target.region)}`;
    },
  },
  inviolable: {
    apply(ctx) {
      const r = ctx.state.regions[ctx.target.region];
      r.inviolable = true;
      return `район ${regionLabel(ctx.state, ctx.target.region)} неприкосновенен навсегда`;
    },
  },
  shrine: {
    apply(ctx) {
      ctx.state.regions[ctx.target.region].shrine = true;
      return `район ${regionLabel(ctx.state, ctx.target.region)} объявлен святыней`;
    },
  },
  makeCoastal: {
    apply(ctx) {
      ctx.state.regions[ctx.target.region].coastal = true;
      return `у района ${regionLabel(ctx.state, ctx.target.region)} появилась водная граница`;
    },
  },
  defendersBonus: {
    apply(ctx) {
      addEffect(ctx, 'defendersBonus', 'round', { bonus: ctx.card.params.bonus });
      return 'все защитники этого раунда получают +1';
    },
  },
  sweep: {
    apply(ctx) {
      let n = 0;
      for (const region of ctx.target.regions) n += ctx.sweepRegion(region);
      const labels = ctx.target.regions.map((r) => regionLabel(ctx.state, r)).join(' и ');
      return `районы ${labels} сметены (юнитов: ${n})`;
    },
  },
  neutralizeTerritory: {
    validate(ctx) {
      const t = TERRITORIES[ctx.target.territory];
      const live = t.regions.filter((r) => isLive(ctx.state, r));
      if (!live.length) fail('BAD_TARGET', 'На территории не осталось живых районов.');
      if (!ctx.state.rules.allowOwnTerritoryCarpet && live.some((r) => ctx.state.regions[r].owner === ctx.player)) {
        fail('BAD_TARGET', 'Нельзя выбирать территорию со своими районами.');
      }
    },
    apply(ctx) {
      const t = TERRITORIES[ctx.target.territory];
      for (const r of t.regions) {
        if (!isLive(ctx.state, r)) continue;
        ctx.setOwner(r, null, 'card');
        for (const a of ctx.state.actions) if (a.region === r && !a.void) { a.void = true; a.voidReason = 'carpet'; }
      }
      return `территория ${t.name} стала ничейной`;
    },
  },
  destroyBridge: {
    apply(ctx) {
      const b = ctx.state.bridges[ctx.target.bridge];
      b.destroyed = true;
      ctx.emit('bridgeDestroyed', { bridge: b.id }, `Мост ${regionLabel(ctx.state, b.a)} — ${regionLabel(ctx.state, b.b)} разрушен.`);
      return `мост ${regionLabel(ctx.state, b.a)} — ${regionLabel(ctx.state, b.b)} взорван`;
    },
  },
  secretForces: {
    // Плата за удар: выбранный район уничтожается, а один случайный другой район сыгравшего
    // становится ничейным (нейтральным для всей карты). Если других районов нет — только уничтожение.
    apply(ctx) {
      const target = ctx.target.region;
      ctx.destroyRegion(target);
      const own = Object.keys(ctx.state.regions).filter((id) => {
        const r = ctx.state.regions[id];
        return id !== target && !r.destroyed && r.owner === ctx.player;
      });
      let extra = '; у сыгравшего не осталось других районов';
      if (own.length) {
        const lost = ctx.rng.pick(own);
        ctx.setOwner(lost, null, 'card');
        // его защитники на этом районе больше ничего не защищают
        for (const a of ctx.state.actions) if (a.region === lost && a.player === ctx.player && !a.void) { a.void = true; a.voidReason = 'secretForces'; }
        extra = `; в уплату район ${regionLabel(ctx.state, lost)} сыгравшего стал ничейным`;
      }
      return `${regionLabel(ctx.state, target)} уничтожен${extra}`;
    },
  },
  swapRegions: {
    apply(ctx) {
      const { own, enemy } = ctx.target;
      const enemyOwner = ctx.state.regions[enemy].owner;
      ctx.setOwner(enemy, ctx.player, 'card');
      ctx.setOwner(own, enemyOwner, 'card');
      return `районы ${regionLabel(ctx.state, own)} и ${regionLabel(ctx.state, enemy)} поменялись владельцами`;
    },
  },
  mutation: {
    apply(ctx) {
      ctx.state.turn.mutation = true;
      return 'юниты этого хода получают +2 к атаке';
    },
  },
  removeBaseDefense: {
    apply(ctx) {
      addEffect(ctx, 'removeBaseDefense', 'round', { regions: ctx.target.regions.slice() });
      const labels = ctx.target.regions.map((r) => regionLabel(ctx.state, r)).join(' и ');
      return `столицы ${labels} без встроенной защиты до конца раунда`;
    },
  },
};

export function territoryAllOwnedBy(state, tid) {
  const live = territoryRegions(tid).filter((r) => isLive(state, r));
  if (!live.length) return null;
  const owner = state.regions[live[0]].owner;
  if (!owner || owner.startsWith('npc:')) return null;
  return live.every((r) => state.regions[r].owner === owner) ? owner : null;
}
