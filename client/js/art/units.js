// Юниты как настольные миниатюры: силуэт на круглой подставке, viewBox 0 0 64 64.
// Цвета: INK — силуэт, accent — цвет владельца (детали), MILK — блики.
// Сила НЕ влияет на размер фигурки — она выводится отдельной плашкой интерфейса.
const INK = '#1C1B19';
const MILK = '#EDE6D6';

const base = (a) => `<ellipse cx="32" cy="57" rx="23" ry="5.5" fill="${INK}"/><ellipse cx="32" cy="55.5" rx="21" ry="4" fill="${a}"/>`;
const soldier = (a, { x = 32, helmet = true, beret = null, mask = false } = {}) => `
  <g transform="translate(${x - 32} 0)">
    <path d="M24 54L26 38H38L40 54H35L32 44L29 54Z" fill="${INK}"/>
    <path d="M23 39C23 30 26 26 32 26C38 26 41 30 41 39Z" fill="${INK}"/>
    <rect x="25" y="31" width="14" height="4" fill="${a}"/>
    <circle cx="32" cy="20" r="6" fill="${INK}"/>
    ${helmet ? `<path d="M24.5 19C24.5 12 28 9.5 32 9.5C36 9.5 39.5 12 39.5 19Z" fill="${a}" stroke="${INK}" stroke-width="1.6"/>` : ''}
    ${beret ? `<path d="M25 16C25 11 30 9 35 10C40 11 41 15 39 17H25Z" fill="${beret}" stroke="${INK}" stroke-width="1.4"/>` : ''}
    ${mask ? `<rect x="27.5" y="18" width="9" height="2.6" rx="1" fill="${MILK}"/>` : ''}
  </g>`;

export const UNIT_ART = {
  infantry: (a) => `${base(a)}${soldier(a)}<path d="M40 30L50 14" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  infantry_heavy: (a) => `${base(a)}${soldier(a, { x: 24 })}${soldier(a, { x: 40 })}
    <path d="M48 30L57 16" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><rect x="13" y="28" width="6" height="11" rx="1.5" fill="${a}" stroke="${INK}" stroke-width="1.5"/>`,
  apc: (a) => `${base(a)}
    <path d="M10 46V34L18 26H46L54 34V46Z" fill="${INK}"/>
    <path d="M20 30H44L48 35H16Z" fill="${a}"/>
    <rect x="22" y="37" width="5" height="4" fill="${MILK}"/><rect x="31" y="37" width="5" height="4" fill="${MILK}"/>
    ${[17, 32, 47].map((x) => `<circle cx="${x}" cy="49" r="5.5" fill="${INK}" stroke="${a}" stroke-width="2"/>`).join('')}`,
  apc_heavy: (a) => `${base(a)}
    <path d="M8 47V33L17 25H47L56 33V47Z" fill="${INK}"/>
    <path d="M24 25V18H40V25Z" fill="${a}" stroke="${INK}" stroke-width="2"/><path d="M40 20H58" stroke="${INK}" stroke-width="4"/>
    <path d="M15 31H49L52 36H12Z" fill="${a}"/>
    ${[15, 26, 38, 49].map((x) => `<circle cx="${x}" cy="49.5" r="5" fill="${INK}" stroke="${a}" stroke-width="2"/>`).join('')}`,
  tank: (a) => `${base(a)}
    <rect x="7" y="40" width="50" height="12" rx="6" fill="${INK}"/>
    ${[13, 21, 29, 37, 45, 52].map((x) => `<circle cx="${x}" cy="46" r="2.6" fill="${a}"/>`).join('')}
    <path d="M11 40L15 31H49L53 40Z" fill="${a}" stroke="${INK}" stroke-width="2"/>
    <path d="M22 31C22 23 27 20 33 20C39 20 43 23 43 31Z" fill="${INK}"/>
    <path d="M42 25H62" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="31" cy="25" r="2" fill="${MILK}"/>`,
  boat: (a) => `${waves(a)}
    <path d="M8 38H56L48 49H16Z" fill="${INK}"/><path d="M12 38H52L50 41H14Z" fill="${a}"/>
    <path d="M24 38L30 20L33 38" fill="${INK}"/><path d="M32 21L44 33H32Z" fill="${MILK}" stroke="${INK}" stroke-width="1.5"/>`,
  gunboat: (a) => `${waves(a)}
    <path d="M6 37H58L50 49H14Z" fill="${INK}"/><path d="M10 37H54L52 40H12Z" fill="${a}"/>
    <rect x="22" y="27" width="14" height="10" fill="${INK}"/><rect x="25" y="29" width="4" height="3" fill="${MILK}"/>
    <path d="M42 33L54 26" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M40 37V31H46V37" fill="${a}" stroke="${INK}" stroke-width="1.5"/>`,
  // Морские котики — буквально: котик в маске для ныряния и с ножом в зубах.
  seals: (a) => `${waves(a)}
    <path d="M14 48C12 36 20 24 32 22C44 20 52 28 52 38C52 44 48 48 42 48Z" fill="${INK}"/>
    <path d="M44 46L56 52L46 52Z" fill="${INK}"/>
    <rect x="22" y="26" width="18" height="9" rx="4" fill="${a}" stroke="${INK}" stroke-width="2"/>
    <rect x="25" y="28" width="5" height="5" rx="2" fill="${MILK}"/><rect x="32" y="28" width="5" height="5" rx="2" fill="${MILK}"/>
    <path d="M14 38H26" stroke="${MILK}" stroke-width="2.2" stroke-linecap="round"/><path d="M8 38H14" stroke="${INK}" stroke-width="2.2"/>`,
  rear_agent: (a) => `${base(a)}
    <path d="M22 54L24 30H40L42 54Z" fill="${INK}"/>
    <path d="M24 30L32 42L40 30" fill="${a}"/>
    <circle cx="32" cy="21" r="6.5" fill="${INK}"/>
    <path d="M22 17H42" stroke="${INK}" stroke-width="3"/><path d="M26 17C26 11 29 9 32 9C35 9 38 11 38 17Z" fill="${INK}"/>
    <rect x="40" y="40" width="12" height="9" rx="1.5" fill="${a}" stroke="${INK}" stroke-width="2"/><path d="M44 40V38H48V40" stroke="${INK}" stroke-width="1.5" fill="none"/>
    <rect x="27" y="20" width="10" height="2.4" fill="${MILK}"/>`,
  // Обманка: похожая фигура, но с повязкой и костылём. Противник видит лишь эмблему, своё назначение юнит раскрывает только владельцу.
  decoy: (a) => `${base(a)}
    <path d="M25 54L27 38H38L39 54H35L32 45L29 54Z" fill="${INK}"/>
    <path d="M23 40C23 31 26 27 32 27C38 27 41 31 41 40Z" fill="${INK}"/>
    <circle cx="32" cy="21" r="6" fill="${INK}"/>
    <path d="M25 18C27 14 37 14 39 18" stroke="${MILK}" stroke-width="3" fill="none"/>
    <path d="M45 54L42 30" stroke="${INK}" stroke-width="2.5"/><path d="M39 30H45" stroke="${INK}" stroke-width="2.5"/>
    <path d="M18 54V22" stroke="${INK}" stroke-width="2"/><path d="M18 22L10 25L16 28L9 31L18 33Z" fill="${a}" stroke="${INK}" stroke-width="1.2"/>`,
  gunner: (a) => `${base(a)}${soldier(a, { x: 24 })}
    <path d="M30 36H56" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <rect x="34" y="31" width="11" height="9" rx="1" fill="${a}" stroke="${INK}" stroke-width="2"/>
    <path d="M40 40L34 53M40 40L46 53M40 40V53" stroke="${INK}" stroke-width="2.4"/>
    <path d="M38 41C38 46 42 48 44 47" stroke="${a}" stroke-width="2" fill="none" stroke-dasharray="2 1.5"/>`,
  purple_berets: (a) => `${base(a)}${soldier(a, { x: 24, helmet: false, beret: '#7B3FA8' })}${soldier(a, { x: 40, helmet: false, beret: '#7B3FA8' })}
    <path d="M48 30L56 18" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  submarine: (a) => `${waves(a, 40)}
    <path d="M6 42C6 34 14 32 32 32C50 32 58 36 58 42C58 48 50 50 32 50C14 50 6 48 6 42Z" fill="${INK}"/>
    <path d="M24 32V24H36V32" fill="${INK}"/><path d="M30 24V14H35" stroke="${INK}" stroke-width="2.5" fill="none"/>
    <rect x="13" y="38" width="38" height="3" fill="${a}"/>
    ${[18, 26, 34, 42].map((x) => `<circle cx="${x}" cy="45" r="1.8" fill="${MILK}"/>`).join('')}`,
  commando: (a) => `${base(a)}
    <path d="M18 54L22 40L30 36L40 42L46 54H40L36 46L28 47L24 54Z" fill="${INK}"/>
    <path d="M22 41C20 32 24 26 31 26C38 26 42 31 42 38L36 40Z" fill="${INK}"/>
    <circle cx="33" cy="20" r="6.5" fill="${INK}"/><rect x="28" y="18" width="10" height="3" rx="1" fill="${a}"/>
    <path d="M42 34L56 28" stroke="${MILK}" stroke-width="2.6" stroke-linecap="round"/><path d="M40 35L44 33" stroke="${INK}" stroke-width="4"/>
    <path d="M24 32L36 36" stroke="${a}" stroke-width="3"/>`,
};

function waves(a, y = 50) {
  return `<path d="M4 ${y + 2}Q12 ${y - 3} 20 ${y + 2}T36 ${y + 2}T52 ${y + 2}T64 ${y}V${y + 10}H4Z" fill="${INK}"/>
    <path d="M6 ${y + 4}Q14 ${y} 22 ${y + 4}T38 ${y + 4}T54 ${y + 4}" stroke="${a}" stroke-width="2" fill="none"/>`;
}

export function unitSVG(art, accent = '#CDB98C', size = 56) {
  return `<svg class="unit-art" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${UNIT_ART[art](accent)}</svg>`;
}
