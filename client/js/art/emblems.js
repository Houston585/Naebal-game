// Эмблемы фракций. Оригинальные векторные знаки, viewBox 0 0 100 100.
// glyph(fg, bg) рисует знак цветом fg; bg нужен для «вырезов».
// Правило системы: знак всегда читается силуэтом в одном цвете на круглой плашке — от 14px до экрана загрузки.
import { FACTIONS } from '../../../shared/config/factions.js';

const G = {
  // Синдикат: опечатанный восьмиугольник с замочной скважиной — «всё под пломбой».
  syndicate: (fg, bg) => `
    <path d="M32 7H68L93 32V68L68 93H32L7 68V32Z" fill="${fg}"/>
    <path d="M35 16H65L84 35V65L65 84H35L16 65V35Z" fill="${bg}"/>
    <circle cx="50" cy="41" r="11" fill="${fg}"/>
    <path d="M43 48H57L62 72H38Z" fill="${fg}"/>
    <rect x="22" y="47" width="7" height="6" fill="${fg}"/><rect x="71" y="47" width="7" height="6" fill="${fg}"/>`,
  // Матриархат: матрёшка с нимбом-шестернёй — культ порядка, который начинается дома.
  matriarchy: (fg, bg) => `
    ${Array.from({ length: 9 }, (_, i) => { const a = (-160 + i * 17.5) * Math.PI / 180; const x = 50 + Math.cos(a) * 36, y = 36 + Math.sin(a) * 36; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" fill="${fg}"/>`; }).join('')}
    <circle cx="50" cy="34" r="17" fill="${fg}"/>
    <path d="M50 46C28 46 22 66 26 82C29 92 71 92 74 82C78 66 72 46 50 46Z" fill="${fg}"/>
    <circle cx="50" cy="35" r="9" fill="${bg}"/>
    <path d="M38 66Q50 74 62 66" stroke="${bg}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="50" cy="78" r="5" fill="${bg}"/>`,
  // Анархисты: перечёркнутый дорожный знак с трещиной — правила как предложение.
  anarchists: (fg) => `
    <path d="M51 9L93 84L9 87Z" fill="none" stroke="${fg}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M47 33L55 50L45 56L56 74" fill="none" stroke="${fg}" stroke-width="6" stroke-linejoin="bevel"/>
    <path d="M12 16L90 94" stroke="${fg}" stroke-width="10" stroke-linecap="square"/>
    <circle cx="84" cy="22" r="4" fill="${fg}"/><circle cx="90" cy="33" r="2.5" fill="${fg}"/>`,
  // Коммерсанты: ценник со штрихкодом — у всего есть цена.
  merchants: (fg, bg) => `
    <path d="M6 50L36 17H93V83H36Z" fill="${fg}"/>
    <circle cx="30" cy="50" r="8" fill="${bg}"/>
    ${[[48, 4], [55, 2], [60, 6], [69, 2], [74, 3], [80, 5]].map(([x, w]) => `<rect x="${x}" y="30" width="${w}" height="40" fill="${bg}"/>`).join('')}`,
  // Силовики: щит с забралом и полосами ограждения — «пройдёмте».
  enforcers: (fg, bg) => `
    <defs><clipPath id="enf-clip-${bg.slice(1)}"><path d="M50 7L89 19V50C89 75 71 88 50 96C29 88 11 75 11 50V19Z"/></clipPath></defs>
    <path d="M50 7L89 19V50C89 75 71 88 50 96C29 88 11 75 11 50V19Z" fill="${fg}"/>
    <rect x="24" y="33" width="52" height="9" fill="${bg}"/>
    <g clip-path="url(#enf-clip-${bg.slice(1)})">${[0, 1, 2, 3, 4].map((i) => `<path d="M${-6 + i * 24} 100L${14 + i * 24} 56H${26 + i * 24}L${6 + i * 24} 100Z" fill="${bg}"/>`).join('')}</g>`,
  // Аристократы: монокль на цепочке под трёхзубой короной — демонстративная элитарность.
  aristocrats: (fg, bg) => `
    <path d="M30 22L38 6L46 18L54 4L62 18L70 6L78 22Z" fill="${fg}"/>
    <circle cx="54" cy="50" r="23" fill="none" stroke="${fg}" stroke-width="9"/>
    <circle cx="61" cy="43" r="5" fill="${fg}"/>
    <path d="M36 66C26 74 22 82 26 94" fill="none" stroke="${fg}" stroke-width="5" stroke-dasharray="6 4" stroke-linecap="round"/>
    <circle cx="26" cy="94" r="5" fill="${fg}"/>`,
  // Пираты: якорь-крючок под навигационной звездой — свои маршруты.
  pirates: (fg) => `
    <path d="M50 3L54 13L64 17L54 21L50 31L46 21L36 17L46 13Z" fill="${fg}"/>
    <circle cx="50" cy="38" r="6" fill="none" stroke="${fg}" stroke-width="5"/>
    <path d="M50 44V90" stroke="${fg}" stroke-width="8"/>
    <path d="M33 53H67" stroke="${fg}" stroke-width="7" stroke-linecap="round"/>
    <path d="M17 64C19 84 35 91 50 91C65 91 81 84 83 64" fill="none" stroke="${fg}" stroke-width="7" stroke-linecap="round"/>
    <path d="M10 70L17 60L25 69Z" fill="${fg}"/><path d="M75 69L83 60L90 70Z" fill="${fg}"/>`,
};

/** Только знак (для крупных иллюстраций и водяных знаков). */
export function glyph(faction, fg, bg = 'transparent') {
  return G[faction](fg, bg);
}

/** Эмблема-плашка: круг цвета фракции, знак цветом эмблемы. npc — пунктирный обод (неигровая фракция). */
export function emblemSVG(faction, { size = 32, npc = false, ring = true, title = true } = {}) {
  const f = FACTIONS[faction];
  if (!f) return '';
  return `<svg class="emblem" viewBox="-8 -8 116 116" width="${size}" height="${size}" role="img" aria-label="${f.name}">
    ${title ? `<title>${f.name}${npc ? ' (неигровая)' : ''}</title>` : ''}
    <circle cx="50" cy="50" r="56" fill="${f.color}" ${ring ? `stroke="#1C1B19" stroke-width="5" ${npc ? 'stroke-dasharray="9 7"' : ''}` : ''}/>
    <g transform="translate(11 11) scale(.78)">${G[faction](f.emblemColor, f.color)}</g>
  </svg>`;
}

/** Знак внутри SVG-карты (без обёртки <svg>). */
export function emblemGroup(faction, x, y, size, { npc = false } = {}) {
  const f = FACTIONS[faction];
  const k = size / 116;
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${k}) translate(8 8)">
    <circle cx="50" cy="50" r="56" fill="${f.color}" stroke="#1C1B19" stroke-width="6" ${npc ? 'stroke-dasharray="10 8"' : ''}/>
    <g transform="translate(11 11) scale(.78)">${G[faction](f.emblemColor, f.color)}</g>
  </g>`;
}
