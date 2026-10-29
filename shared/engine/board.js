// Граф карты: соседство по сторонам + мосты. Уничтоженные районы и мосты исключаются динамически.
import { buildRegions, buildSideAdjacency, BRIDGES, TERRITORIES } from '../config/map.js';

export const STATIC_REGIONS = buildRegions();
export const SIDE_ADJ = buildSideAdjacency(STATIC_REGIONS);
export const REGION_IDS = Object.keys(STATIC_REGIONS);

export function isLive(state, id) {
  const r = state.regions[id];
  return !!r && !r.destroyed;
}

/** Живые соседи района (по сторонам и по целым мостам). */
export function neighbors(state, id) {
  if (!isLive(state, id)) return [];
  const out = SIDE_ADJ[id].filter((n) => isLive(state, n));
  for (const b of Object.values(state.bridges)) {
    if (b.destroyed) continue;
    if (b.a === id && isLive(state, b.b)) out.push(b.b);
    else if (b.b === id && isLive(state, b.a)) out.push(b.a);
  }
  return out;
}

/** Есть ли у игрока район, с которого можно атаковать target. */
export function hasAttackSource(state, playerId, target) {
  for (const n of neighbors(state, target)) {
    const r = state.regions[n];
    if (r.owner === playerId && !r.inviolable) return true;
  }
  return false;
}

export function bordersWall(id) {
  return !!STATIC_REGIONS[id]?.wall;
}

export function isCoastal(state, id) {
  return !!state.regions[id]?.coastal;
}

/** Связна ли группа районов (по сторонам, без учёта мостов) — для проверки территорий. */
export function isConnectedBySides(ids) {
  if (!ids.length) return true;
  const set = new Set(ids);
  const seen = new Set([ids[0]]);
  const stack = [ids[0]];
  while (stack.length) {
    const cur = stack.pop();
    for (const n of SIDE_ADJ[cur]) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen.size === set.size;
}

export function territoryRegions(tid) {
  return TERRITORIES[tid].regions;
}

export function bridgesBetween(state, a, b) {
  return Object.values(state.bridges).filter((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

/** Соседние ли два живых района (для «Урагана»). */
export function areAdjacent(state, a, b) {
  return neighbors(state, a).includes(b);
}
