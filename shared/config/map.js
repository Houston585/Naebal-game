// Карта мира по ТЗ «География карты» (v2). Источник истины — таблицы ТЗ, а не изображение.
// Геометрия районов для отрисовки лежит отдельно: client/js/ui/mapgeom.js (из MAP_FRAME.svg).

export const ISLANDS = {
  L: { id: 'L', name: 'Западный остров', archipelago: 'Архипелаг «Потеря»', prefix: 'Л' },
  P: { id: 'P', name: 'Восточный остров', archipelago: 'Архипелаг «Трудный»', prefix: 'П' },
};

// Таблицы раздела 3–4 ТЗ: [код, фракция/тип, укрепрайон?, сухопутные соседи, море, стенка]
// Фракция — исходная принадлежность района. Она НЕ означает владения (ТЗ 13).
const R = [
  ['L1', 'syndicate', true, 'L2 L3', true, true],
  ['L2', 'syndicate', false, 'L1 L3 L4 L5', true, false],
  ['L3', 'merchants', false, 'L1 L2 L4 L6', false, true],
  ['L4', 'forest', false, 'L2 L3 L5 L11 L7', false, false],
  ['L5', 'syndicate', false, 'L2 L4 L11 L16 L17', true, false],
  ['L6', 'merchants', false, 'L3 L7 L8 L9', false, true],
  ['L7', 'forest', false, 'L4 L6 L8 L10 L11', false, false],
  ['L8', 'merchants', false, 'L6 L7 L10 L9', false, false],
  ['L9', 'merchants', true, 'L6 L8 L10', true, true],
  ['L10', 'merchants', false, 'L7 L8 L9 L11 L13', true, false],
  ['L11', 'aristocrats', false, 'L4 L5 L7 L10 L12 L13 L16', false, false],
  ['L12', 'syndicate', false, 'L11 L13 L14 L15 L16 L17 L18', false, false],
  ['L13', 'aristocrats', false, 'L10 L11 L12 L14', true, false],
  ['L14', 'aristocrats', false, 'L12 L13 L15', true, false],
  ['L15', 'aristocrats', true, 'L12 L14 L18', true, false],
  ['L16', 'syndicate', false, 'L5 L11 L12 L17', false, false],
  ['L17', 'military_base', false, 'L5 L12 L16 L18', true, false],
  ['L18', 'military_base', false, 'L12 L15 L17', true, false],
  ['P1', 'matriarchy', true, 'P2 P3', true, true],
  ['P2', 'matriarchy', false, 'P1 P3 P4 P5', true, false],
  ['P3', 'matriarchy', false, 'P1 P2 P4 P18', false, true],
  ['P4', 'matriarchy', false, 'P2 P3 P5 P7 P8 P16 P18', false, false],
  ['P5', 'pirates', true, 'P2 P4 P6 P7', true, false],
  ['P6', 'pirates', false, 'P5 P7 P10', true, false],
  ['P7', 'power_station', false, 'P4 P5 P6 P8 P9 P10', false, false],
  ['P8', 'power_station', false, 'P4 P7 P9 P12 P15 P16', false, false],
  ['P9', 'anarchists', false, 'P7 P8 P10 P11 P12', false, false],
  ['P10', 'pirates', false, 'P6 P7 P9 P11', true, false],
  ['P11', 'pirates', false, 'P9 P10 P12 P13', true, true],
  ['P12', 'anarchists', true, 'P8 P9 P11 P13 P14 P15', false, false],
  ['P13', 'anarchists', false, 'P11 P12 P14', false, true],
  ['P14', 'anarchists', false, 'P12 P13 P15', false, true],
  ['P15', 'enforcers', false, 'P8 P12 P14 P16 P17', false, true],
  ['P16', 'enforcers', false, 'P4 P8 P15 P17 P18', false, false],
  ['P17', 'enforcers', true, 'P15 P16 P18', false, true],
  ['P18', 'enforcers', false, 'P3 P4 P16 P17', false, true],
];

const SITE_TERRITORY = { military_base: 'N1', forest: 'N2', power_station: 'N3' };

// Территории (наборы районов для карт-наград): 7 фракционных + 3 нейтральные.
export const TERRITORIES = {
  syndicate:   { id: 'syndicate',   kind: 'faction', faction: 'syndicate',   name: 'Синдикат' },
  merchants:   { id: 'merchants',   kind: 'faction', faction: 'merchants',   name: 'Коммерсанты' },
  aristocrats: { id: 'aristocrats', kind: 'faction', faction: 'aristocrats', name: 'Аристократы' },
  matriarchy:  { id: 'matriarchy',  kind: 'faction', faction: 'matriarchy',  name: 'Матриархат' },
  pirates:     { id: 'pirates',     kind: 'faction', faction: 'pirates',     name: 'Пираты' },
  anarchists:  { id: 'anarchists',  kind: 'faction', faction: 'anarchists',  name: 'Анархисты' },
  enforcers:   { id: 'enforcers',   kind: 'faction', faction: 'enforcers',   name: 'Силовики' },
  N1:          { id: 'N1',          kind: 'neutral', site: 'military_base',  name: 'Военная база' },
  N2:          { id: 'N2',          kind: 'neutral', site: 'forest',         name: 'Лес' },
  N3:          { id: 'N3',          kind: 'neutral', site: 'power_station',  name: 'Энергостанция' },
};
for (const t of Object.values(TERRITORIES)) {
  t.regions = R.filter(([, f]) => (t.kind === 'faction' ? f === t.faction : SITE_TERRITORY[f] === t.id)).map(([id]) => id);
}

// Укрепрайоны (ТЗ 10).
export const CAPITALS = Object.fromEntries(R.filter((r) => r[2]).map(([id, f]) => [f, id]));

// Мосты (ТЗ 6). ID — основные, используются в логике.
export const BRIDGES = [
  { id: 'B1', a: 'L14', b: 'P11' },
  { id: 'B2', a: 'L17', b: 'P6' },
  { id: 'B3', a: 'L15', b: 'P10' },
];

/** Статическое описание 36 районов (неизменяемая география, ТЗ 13). */
export function buildRegions() {
  const regions = {};
  for (const [id, home, capital, nb, sea, wall] of R) {
    const island = id[0];
    const neutralSite = SITE_TERRITORY[home] ? home : null;
    regions[id] = {
      id,
      label: `${ISLANDS[island].prefix}${id.slice(1)}`,
      island,
      territory: neutralSite ? SITE_TERRITORY[home] : home,
      homeFaction: neutralSite ? null : home,
      site: neutralSite,
      type: neutralSite ? 'neutral' : capital ? 'capital' : 'normal',
      capital,
      neighbors: nb.split(' '),
      coastal: sea,      // bordersSea
      wall,              // bordersWall
    };
  }
  return regions;
}

/** Сухопутное соседство — ровно таблица ТЗ. Мосты учитываются отдельно. */
export function buildSideAdjacency(regions) {
  return Object.fromEntries(Object.values(regions).map((r) => [r.id, r.neighbors.slice()]));
}
