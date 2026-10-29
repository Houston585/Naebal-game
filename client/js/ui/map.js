// Игровая карта: PNG-подложка + SVG-слой районов и мостов + текстовый слой (ТЗ «География карты», 14).
// PNG и геометрия не меняются никогда; состояние района меняет только цвет заливки,
// прозрачность и контур остаются исходными. Подсветка выбора — отдельные контуры поверх.
import { STATIC_REGIONS } from '../../../shared/engine/board.js';
import { FACTIONS } from '../../../shared/config/factions.js';
import { MAP_SIZE, ZONES, BRIDGE_SHAPES, TEXT_LAYER } from './mapgeom.js';
import { emblemGroup } from '../art/emblems.js';

export const WIDTH = MAP_SIZE.width;
export const HEIGHT = MAP_SIZE.height;
const MAP_URL = new URL('../../assets/map.png', import.meta.url).href;

const INK = '#1C1B19', PAPER = '#E4DAC4', LIME = '#C6E33B', RUST = '#B4442A', SEA = '#5E7F7B';
export const COLOR_UNOWNED = '#FFFFFF';
export const COLOR_DESTROYED = '#000000';

export function anchorOf(id) {
  const z = ZONES[id];
  return { x: z.anchor[0], y: z.anchor[1], r: z.r };
}

/** Цвет заливки района по состоянию (ТЗ 13): уничтожен — чёрный, есть владелец — цвет фракции, иначе белый. */
export function regionFill(view, id) {
  const r = view.regions[id];
  if (r.destroyed) return COLOR_DESTROYED;
  if (!r.owner) return COLOR_UNOWNED;
  const p = view.players.find((x) => x.id === r.owner);
  return p ? FACTIONS[p.faction].color : COLOR_UNOWNED;
}

const SITE_ICON = {
  military_base: `<path d="M-1 7V-8" stroke="${INK}" stroke-width="2"/><path d="M-1 -8H8L5 -4.5L8 -1H-1Z" fill="${RUST}" stroke="${INK}" stroke-width="1.4"/>`,
  forest: `<path d="M0 -9L7 1H3L8 8H-8L-3 1H-7Z" fill="#3F7A3A" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
  power_station: `<path d="M2 -9L-6 1H0L-2 9L6 -2H0Z" fill="${LIME}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
};
const CAPITAL_ICON = `<path d="M-8 8V-3H-5V-7H-2V-3H2V-7H5V-3H8V8Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><rect x="-2" y="2" width="4" height="6" fill="${INK}"/>`;

/** Подпись района: плашка с кодом, значок укрепрайона или нейтрального типа, эмблема владельца. */
function labelSVG(view, id, x, y) {
  const s = STATIC_REGIONS[id];
  const r = view.regions[id];
  const owner = r.owner ? view.players.find((p) => p.id === r.owner) : null;
  const icon = s.capital ? CAPITAL_ICON : s.site ? SITE_ICON[s.site] : '';
  const textW = s.label.length * 10 + 8;
  const w = textW + (icon ? 22 : 0);
  const x0 = x - w / 2;
  const parts = [`<rect x="${x0}" y="${y - 12}" width="${w}" height="24" rx="12" fill="${r.destroyed ? '#3A3632' : INK}" fill-opacity=".82"/>`];
  if (icon) parts.push(`<g transform="translate(${x0 + 14} ${y})">${icon}</g>`);
  parts.push(`<text x="${x0 + (icon ? 22 : 0) + textW / 2}" y="${y + 5.5}" text-anchor="middle" font-family="Unbounded, Arial, sans-serif" font-weight="600" font-size="14" fill="${r.destroyed ? '#8E8A80' : '#FFFFFF'}">${s.label}</text>`);
  if (owner && !r.destroyed) parts.push(emblemGroup(owner.faction, x0 + w + 13, y, 26));
  return parts.join('');
}

/**
 * view — представление партии для игрока; ui — состояние интерфейса:
 *  legal:Set, selected:Set, bridgeTargets:Set, summary:bool, dragFor:bool, captured:Set, flash:Set, selectedBridge
 */
export function renderMap(view, ui = {}) {
  const players = Object.fromEntries(view.players.map((p) => [p.id, p]));
  const meId = view.me?.id;
  const eff = (name) => view.effects.filter((e) => e.effect === name);
  const frozen = new Set(eff('freezeRegion').map((e) => e.data.region));
  const acid = new Set(eff('removeBaseDefense').flatMap((e) => e.data.regions));
  const denBonus = new Set(eff('defenseBonus').map((e) => e.data.region));
  const atkMarks = new Set([...eff('attackBonus'), ...eff('secretAttackBonus')].map((e) => e.data.region));
  const battles = ui.summary && view.lastSummary ? Object.fromEntries(view.lastSummary.battles.map((b) => [b.region, b])) : {};

  const zones = [];
  const overlays = [];
  for (const id of Object.keys(ZONES)) {
    const z = ZONES[id];
    const r = view.regions[id];
    const cls = ['region'];
    if (ui.legal?.has(id)) cls.push('legal');
    if (ui.selected?.has(id)) cls.push('selected');
    if (ui.captured?.has(id)) cls.push('captured');
    if (ui.flash?.has(id)) cls.push('destroyed-now');
    const s = STATIC_REGIONS[id];
    zones.push(`<g class="${cls.join(' ')}" data-region="${id}" tabindex="${ui.legal?.has(id) ? 0 : -1}" role="button" aria-label="Район ${s.label}">
      <path class="region-fill" d="${z.d}" fill="${regionFill(view, id)}" fill-opacity="${z.fillOpacity}" stroke="${z.stroke}" stroke-opacity="${z.strokeOpacity}"/>
      <path class="region-hover" d="${z.d}" fill="none" stroke="#FFFFFF" stroke-width="3"/>
      <path class="region-hl" d="${z.d}" fill="none" stroke="${LIME}" stroke-width="3"/>
      <path class="region-sel" d="${z.d}" fill="none" stroke="#FFFFFF" stroke-width="9"/>
      <path class="region-sel" d="${z.d}" fill="none" stroke="${INK}" stroke-width="3"/>
      ${r.pendingOwner ? `<path d="${z.d}" fill="none" stroke="${LIME}" stroke-width="3" stroke-dasharray="10 8"/>` : ''}
    </g>`);

    // подписи, статусы, отряды — слой без событий мыши
    const { x, y } = anchorOf(id);
    const parts = [labelSVG(view, id, x, y - 14)];
    const badges = [];
    if (r.inviolable) badges.push(`<path d="M-8 7V-2C-8 -11 8 -11 8 -2V7Z" fill="#fff" fill-opacity=".8" stroke="${INK}" stroke-width="2"/><circle cy="-11" r="2.2" fill="${INK}"/>`);
    if (r.shrine) badges.push(`<circle r="8" fill="${INK}" fill-opacity=".5" stroke="${LIME}" stroke-width="3"/>`);
    if (!s.coastal && r.coastal && !r.destroyed) badges.push(`<circle r="10" fill="${INK}" fill-opacity=".6"/><path d="M-7 -1Q-3.5 -5 0 -1T7 -1M-7 4Q-3.5 0 0 4T7 4" stroke="#9FD3CE" stroke-width="2.2" fill="none"/>`);
    if (frozen.has(id)) badges.push(`<path d="M-5 -3V-6C-5 -12 5 -12 5 -6V-3" stroke="${INK}" stroke-width="2.4" fill="none"/><rect x="-8" y="-3" width="16" height="12" rx="2" fill="${LIME}" stroke="${INK}" stroke-width="2"/>`);
    if (denBonus.has(id)) badges.push(`<path d="M0 -10L9 -6V1C9 6 5 9 0 11C-5 9 -9 6 -9 1V-6Z" fill="${LIME}" stroke="${INK}" stroke-width="2"/>`);
    if (acid.has(id)) badges.push(`<path d="M0 -10C-6 -2 -7 3 -7 5C-7 9 -4 11 0 11C4 11 7 9 7 5C7 3 6 -2 0 -10Z" fill="${LIME}" stroke="${INK}" stroke-width="2"/>`);
    if (atkMarks.has(id)) badges.push(`<path d="M-9 6L0 -9L9 6Z" fill="${RUST}" stroke="${INK}" stroke-width="2"/>`);
    badges.forEach((b, i) => parts.push(`<g transform="translate(${x - (badges.length - 1) * 11 + i * 22} ${y - 40})">${b}</g>`));

    const b = battles[id];
    if (b && ui.summary) parts.push(battleNumbers(b, x, y + 16, players));
    else parts.push(markers(view, id, x, y + 18, players, meId, ui));
    overlays.push(`<g class="region-meta" pointer-events="none">${parts.join('')}</g>`);
  }

  const bridges = Object.entries(BRIDGE_SHAPES).map(([id, z]) => {
    const st = view.bridges[id];
    const target = ui.bridgeTargets?.has(id);
    const sel = ui.selectedBridge === id;
    const a = STATIC_REGIONS[st.a].label, bb = STATIC_REGIONS[st.b].label;
    return `<g class="bridge${target ? ' target' : ''}${sel ? ' selected' : ''}" data-bridge="${id}">
      <path d="${z.d}" fill="${st.destroyed ? COLOR_DESTROYED : z.fill}" fill-opacity="${z.fillOpacity}" stroke="${z.stroke}" stroke-opacity="${z.strokeOpacity}"/>
      <path class="bridge-hl" d="${z.d}" fill="none" stroke="${LIME}" stroke-width="${sel ? 6 : 4}"/>
      <title>Мост ${id}: ${a} — ${bb}${st.destroyed ? ' (разрушен)' : ''}</title></g>`;
  }).join('');

  return `<svg class="map-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="group" aria-label="Карта островов Лабеан" preserveAspectRatio="xMidYMid meet">
    <image href="${MAP_URL}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="none"/>
    <g class="zones">${zones.join('')}</g>
    <g class="bridges">${bridges}</g>
    <g class="text-layer" pointer-events="none">${TEXT_LAYER}</g>
    <g class="meta-layer">${overlays.join('')}</g>
  </svg>`;
}

/** Отряды на районе: одна метка на игрока. Свои — суммарная сила, чужие — число отрядов. */
function markers(view, id, x, y, players, meId, ui) {
  const acts = view.actions.filter((a) => a.region === id);
  if (!acts.length) return '';
  const out = [];
  const badge = (mx, my, text, fill) => `<g transform="translate(${mx + 12} ${my - 11})"><rect x="-11" y="-9" width="22" height="18" rx="9" fill="${fill}" stroke="${PAPER}" stroke-width="1.5"/><text y="4" text-anchor="middle" font-family="Unbounded, Arial, sans-serif" font-size="10" font-weight="700" fill="#fff">${text}</text></g>`;
  if (ui.dragFor) {
    // фаза «Авторитета»: каждый отряд отдельно, чтобы его можно было перетащить
    const n = acts.length, perRow = 4;
    acts.forEach((a, i) => {
      const p = players[a.player];
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
      const mx = x - (inRow - 1) * 13 + (i % perRow) * 26, my = y + row * 26;
      const drag = a.player !== meId ? ' draggable' : '';
      out.push(`<g class="marker${drag}${a.redirected ? ' moved' : ''}" data-action="${a.id}" pointer-events="all">${emblemGroup(p.faction, mx, my, 24)}<title>${FACTIONS[p.faction].name}: отряд</title></g>`);
    });
    return out.join('');
  }
  const groups = [];
  for (const a of acts) {
    let g = groups.find((q) => q.player === a.player);
    if (!g) { g = { player: a.player, list: [] }; groups.push(g); }
    g.list.push(a);
  }
  groups.forEach((g, i) => {
    const p = players[g.player];
    const mx = x - (groups.length - 1) * 17 + i * 34, my = y;
    const mine = g.player === meId;
    let extra = '';
    let title = `${FACTIONS[p.faction].name}: ${g.list.length} ${g.list.length === 1 ? 'отряд' : g.list.length < 5 ? 'отряда' : 'отрядов'}`;
    if (mine && g.list[0].strength != null) {
      const kind = g.list[0].kind;
      const sum = g.list.reduce((t, a) => t + a.strength + (a.mutation && a.kind === 'attack' ? 2 : 0), 0);
      extra = badge(mx, my, sum, kind === 'defend' ? INK : RUST);
      title = `Ваши силы: ${sum} (${kind === 'defend' ? 'защита' : 'атака'}, отрядов: ${g.list.length})`;
    } else if (g.list.length > 1) extra = badge(mx, my, `×${g.list.length}`, '#4A4740');
    out.push(`<g class="marker" data-action="${g.list[0].id}">${emblemGroup(p.faction, mx, my, 28)}${extra}<title>${title}</title></g>`);
  });
  return out.join('');
}

function battleNumbers(b, x, y, players) {
  if (b.outcome === 'frozen') {
    return `<g><rect x="${x - 42}" y="${y - 11}" width="84" height="22" rx="11" fill="${INK}" fill-opacity=".8"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="Golos Text, Arial, sans-serif" font-size="12" fill="#fff">заморожен</text></g>`;
  }
  const atk = Object.entries(b.attacks ?? {}).sort((a, z) => z[1] - a[1]).slice(0, 3);
  const n = 1 + atk.length;
  const x0 = x - (n - 1) * 15;
  const parts = [`<g transform="translate(${x0} ${y})"><path d="M0 -13L12 -8V1C12 8 6 12 0 14C-6 12 -12 8 -12 1V-8Z" fill="${INK}" stroke="${PAPER}" stroke-width="1.2"/><text y="4" text-anchor="middle" font-family="Unbounded, Arial, sans-serif" font-size="12" font-weight="700" fill="#fff">${b.defenseTotal}</text></g>`];
  atk.forEach(([pid, v], i) => {
    const p = players[pid];
    const cx = x0 + (i + 1) * 30;
    const win = b.winner === pid;
    parts.push(`<g>${emblemGroup(p.faction, cx, y - 6, 20)}<rect x="${cx - 11}" y="${y + 4}" width="22" height="15" rx="2" fill="${win ? RUST : PAPER}" stroke="${INK}" stroke-width="1.5"/><text x="${cx}" y="${y + 15.5}" text-anchor="middle" font-family="Unbounded, Arial, sans-serif" font-size="10" font-weight="700" fill="${win ? '#fff' : INK}">${v}</text></g>`);
  });
  return `<g>${parts.join('')}</g>`;
}

/** Карта для заставки: стартовые цвета фракций по исходной принадлежности. */
export function renderPreviewMap() {
  const regions = {};
  for (const [id, s] of Object.entries(STATIC_REGIONS)) regions[id] = { owner: s.homeFaction, destroyed: false, coastal: s.coastal };
  const view = {
    regions, bridges: Object.fromEntries(['B1', 'B2', 'B3'].map((b) => [b, { id: b, a: '', b: '' }])),
    players: Object.keys(FACTIONS).map((f) => ({ id: f, faction: f })), effects: [], actions: [], me: null,
  };
  const zones = Object.entries(ZONES).map(([id, z]) => `<path d="${z.d}" fill="${regionFill(view, id)}" fill-opacity="${z.fillOpacity}" stroke="${z.stroke}" stroke-opacity="${z.strokeOpacity}"/>`).join('');
  const bridges = Object.values(BRIDGE_SHAPES).map((z) => `<path d="${z.d}" fill="${z.fill}" fill-opacity="${z.fillOpacity}" stroke="${z.stroke}" stroke-opacity="${z.strokeOpacity}"/>`).join('');
  return `<svg class="map-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true"><image href="${MAP_URL}" width="${WIDTH}" height="${HEIGHT}"/>${zones}${bridges}<g>${TEXT_LAYER}</g></svg>`;
}
