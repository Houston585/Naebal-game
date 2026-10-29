import { FACTIONS } from '../../../shared/config/factions.js';
import { STATIC_REGIONS } from '../../../shared/engine/board.js';
import { emblemSVG } from '../art/emblems.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const label = (rid) => STATIC_REGIONS[rid]?.label ?? rid;
export const fname = (faction) => FACTIONS[faction]?.name ?? '';

export function ownerInfo(view, owner) {
  if (!owner) return { name: 'ничей', faction: null };
  if (owner.startsWith('npc:')) { const f = owner.slice(4); return { name: `${fname(f)} (неигровые)`, faction: f, npc: true }; }
  const p = view.players.find((x) => x.id === owner);
  return { name: p ? `${fname(p.faction)} (${p.name})` : owner, faction: p?.faction, player: p };
}

export function playerTag(view, pid, size = 20) {
  const p = view.players.find((x) => x.id === pid);
  if (!p) return '';
  return `<span class="chip">${emblemSVG(p.faction, { size })}<span>${esc(fname(p.faction))}</span></span>`;
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
