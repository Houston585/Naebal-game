// Иллюстрации карт. Единый стиль: трафаретная печать в 3–4 краски на бумаге,
// чёрный контур, растровые точки, одна акцентная краска на карту. viewBox 0 0 200 140, без текста.
const INK = '#1C1B19', MILK = '#EDE6D6', SAND = '#CDB98C', RUST = '#B4442A', LIME = '#C6E33B', DUST = '#8E8A80', SEA = '#5E7F7B', PAPER = '#E4DAC4';

let uid = 0;
const dots = (id, color, gap = 6, r = 1.2) => `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${gap / 2}" cy="${gap / 2}" r="${r}" fill="${color}"/></pattern>`;
const sun = (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`;
const pine = (x, y, h, c = INK) => `<path d="M${x} ${y - h}L${x + h * 0.32} ${y - h * 0.45}H${x + h * 0.14}L${x + h * 0.4} ${y}H${x - h * 0.4}L${x - h * 0.14} ${y - h * 0.45}H${x - h * 0.32}Z" fill="${c}"/>`;
const person = (x, y, s = 1, c = INK, extra = '') => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-34" r="7" fill="${c}"/><path d="M-9 -24H9L11 0H4L0 -12L-4 0H-11Z" fill="${c}"/>${extra}</g>`;
const house = (x, y, w, c, roof = INK) => `<g><rect x="${x}" y="${y}" width="${w}" height="${w * 0.7}" fill="${c}" stroke="${INK}" stroke-width="3"/><path d="M${x - 4} ${y}L${x + w / 2} ${y - w * 0.5}L${x + w + 4} ${y}Z" fill="${roof}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><rect x="${x + w * 0.38}" y="${y + w * 0.32}" width="${w * 0.24}" height="${w * 0.38}" fill="${INK}"/></g>`;
const ground = (y, c = SAND) => `<path d="M0 ${y}Q50 ${y - 6} 100 ${y}T200 ${y}V140H0Z" fill="${c}"/>`;
const sea = (y, c = SEA) => `<path d="M0 ${y}Q12 ${y - 5} 25 ${y}T50 ${y}T75 ${y}T100 ${y}T125 ${y}T150 ${y}T175 ${y}T200 ${y}V140H0Z" fill="${c}"/><path d="M8 ${y + 10}q8-4 16 0M60 ${y + 16}q8-4 16 0M120 ${y + 9}q8-4 16 0M168 ${y + 18}q8-4 16 0" stroke="${MILK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;

const ART = {
  // ---------------- Топ-оперативники
  // Душнила и Решала: один читает лекцию с поднятым пальцем, второй уже звонит «кому надо»; за ними стена в лесах.
  den_olches: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    <rect x="96" y="22" width="92" height="88" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M96 ${36 + i * 20}H188" stroke="${INK}" stroke-width="2"/>`).join('')}
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${98 + i * 19}" y="10" width="10" height="13" fill="${DUST}" stroke="${INK}" stroke-width="3"/>`).join('')}
    <path d="M106 44h68v14h-68z" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
    ${ground(118)}
    ${person(48, 118, 1.5, INK, `<path d="M-9 -22L-20 -44" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="-21" cy="-47" r="3" fill="${INK}"/><rect x="-6" y="-38" width="12" height="4" rx="2" fill="${MILK}"/>`)}
    ${person(82, 118, 1.5, RUST, `<rect x="6" y="-44" width="7" height="14" rx="2" fill="${INK}"/><path d="M8 -24L12 -36" stroke="${RUST}" stroke-width="5"/>`)}
    <path d="M14 28h34l-6 8h-8z" fill="${MILK}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 22h3M28 22h3M36 22h3" stroke="${INK}" stroke-width="3"/>`,
  // Озеро в лесу: лысина отражается в озере — само озеро и есть лысая голова.
  lysy: (p) => `<rect width="200" height="140" fill="${PAPER}"/>
    <rect width="200" height="70" fill="url(#${p}d)"/>
    ${[10, 28, 46, 152, 170, 188].map((x, i) => pine(x, 82, 44 + (i % 3) * 8)).join('')}
    <ellipse cx="100" cy="98" rx="64" ry="30" fill="${SEA}" stroke="${INK}" stroke-width="3"/>
    <path d="M58 92C60 74 78 64 100 64C122 64 140 74 142 92" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="86" cy="74" rx="12" ry="4" fill="#fff" opacity=".7"/>
    <path d="M56 92C52 92 52 104 58 104M144 92C148 92 148 104 142 104" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M70 110q6-4 12 0M110 114q6-4 12 0M92 120q6-3 12 0" stroke="${MILK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    ${pine(78, 64, 24, LIME)}`,
  // ЗаМир: серый голубь мира несёт в клюве амбарный замок.
  sery: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    <path d="M0 120L40 100L80 116L130 96L200 118V140H0Z" fill="${DUST}"/>
    <path d="M10 104h180" stroke="${INK}" stroke-width="2" stroke-dasharray="3 5"/>
    ${[20, 60, 100, 140, 180].map((x) => `<path d="M${x} 96v16" stroke="${INK}" stroke-width="3"/>`).join('')}
    <path d="M60 64C64 46 88 40 104 48L142 30C136 50 124 60 112 64L130 74C112 80 92 80 78 74L54 84L60 70Z" fill="${MILK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M96 52C108 40 122 26 146 20C140 36 126 50 110 58" fill="${DUST}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="70" cy="56" r="2.6" fill="${INK}"/><path d="M60 58L50 60L58 64" fill="${RUST}" stroke="${INK}" stroke-width="2"/>
    <path d="M48 62v8" stroke="${INK}" stroke-width="2"/>
    <path d="M40 76c0-8 16-8 16 0" fill="none" stroke="${INK}" stroke-width="4"/><rect x="36" y="74" width="24" height="18" rx="2" fill="${LIME}" stroke="${INK}" stroke-width="3"/><circle cx="48" cy="83" r="2.5" fill="${INK}"/>`,
  // Авторитет: огромная рука с печаткой переставляет фигурки по карте.
  shlots: (p) => `<rect width="200" height="140" fill="${PAPER}"/>
    <path d="M10 80L190 70L196 134L4 136Z" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    <path d="M40 78L44 134M90 75L92 135M140 72L142 135M8 104L194 100" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 4"/>
    ${[[30, 112], [62, 98], [120, 118], [170, 96]].map(([x, y]) => `<g><ellipse cx="${x}" cy="${y + 8}" rx="9" ry="3" fill="${INK}"/><path d="M${x - 5} ${y + 7}L${x - 3} ${y - 6}H${x + 3}L${x + 5} ${y + 7}Z" fill="${INK}"/><circle cx="${x}" cy="${y - 9}" r="4.5" fill="${INK}"/></g>`).join('')}
    <path d="M150 116q-20-30 -40-26" stroke="${RUST}" stroke-width="3" fill="none" stroke-dasharray="5 4"/><path d="M110 86l-2 9 8-4z" fill="${RUST}"/>
    <path d="M84 6C92 6 98 14 100 30L104 58L112 56C118 54 122 60 118 66L108 76C102 82 92 84 84 82L70 78C62 74 58 66 60 56L64 30C66 14 74 6 84 6Z" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    <path d="M70 46H96M68 58H94" stroke="${INK}" stroke-width="2.4"/>
    <rect x="76" y="34" width="14" height="10" rx="3" fill="${LIME}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M86 82L84 96" stroke="${INK}" stroke-width="2"/>${person(84, 112, 0.5, INK)}`,
  // В лес и в лес: двое бегут в чащу, над ними подброшен игральный кубик.
  fedos_dron: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(116, SAND)}
    ${[110, 128, 146, 164, 182, 196, 138, 172].map((x, i) => pine(x, 116 + (i > 5 ? 10 : 0), 54 + (i % 3) * 10, i % 4 === 1 ? LIME : INK)).join('')}
    ${person(54, 120, 1.3, INK, `<path d="M-9 -20L-20 -10M9 -20L18 -30" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`)}
    ${person(84, 118, 1.3, RUST, `<path d="M-9 -20L-18 -30M9 -20L20 -12" stroke="${RUST}" stroke-width="5" stroke-linecap="round"/>`)}
    <path d="M10 104h26M16 96h18M22 112h20" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <g transform="rotate(18 70 36)"><rect x="56" y="22" width="28" height="28" rx="4" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    ${[[63, 29], [77, 29], [70, 36], [63, 43], [77, 43]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${INK}"/>`).join('')}</g>`,
  // Амбициозы: двое на шаткой лестнице втыкают флаг в чужую крышу.
  sencha_vovan: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>${sun(160, 36, 20, LIME)}
    ${ground(120)}
    ${house(96, 70, 64, DUST, RUST)}
    <path d="M60 128L104 46M78 130L118 52" stroke="${INK}" stroke-width="4"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${66 + i * 7} ${117 - i * 13}L${82 + i * 7} ${119 - i * 13}" stroke="${INK}" stroke-width="3"/>`).join('')}
    <path d="M128 38V6" stroke="${INK}" stroke-width="3"/><path d="M128 6H156L150 14L156 22H128Z" fill="${RUST}" stroke="${INK}" stroke-width="2.5"/>
    ${person(110, 56, 0.9, INK, `<path d="M8 -20L18 -28" stroke="${INK}" stroke-width="5"/>`)}
    ${person(92, 92, 0.9, RUST, `<path d="M8 -22L16 -34" stroke="${RUST}" stroke-width="5"/>`)}`,
  // Платон и Назар: кран опускает блок в чёрную воронку — район возвращается на карту.
  platon_nazar: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(112)}
    <ellipse cx="120" cy="118" rx="54" ry="14" fill="${INK}"/>
    <path d="M78 116L70 106M162 116L172 104M120 104L118 96" stroke="${INK}" stroke-width="3"/>
    <path d="M30 120V18H42V120" fill="none" stroke="${INK}" stroke-width="4"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M30 ${24 + i * 20}L42 ${38 + i * 20}" stroke="${INK}" stroke-width="2.5"/>`).join('')}
    <path d="M24 18H150" stroke="${INK}" stroke-width="5"/><path d="M36 18L60 6L84 18" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M128 18V62" stroke="${INK}" stroke-width="2.5"/><path d="M122 62h12l-6 8z" fill="${INK}"/>
    <rect x="104" y="70" width="48" height="30" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
    <path d="M110 80h36M110 90h36" stroke="${INK}" stroke-width="2"/>
    ${person(64, 120, 0.9, RUST, `<path d="M-8 -22h16v-4h-16z" fill="${LIME}"/>`)}${person(84, 120, 0.9, INK, `<path d="M-8 -42h16v-4h-16z" fill="${LIME}"/>`)}`,
  // Наталья: тельняшка, берет, якорь на плече, за спиной высадка с моря.
  natalya: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${sea(108)}
    <path d="M150 104h40l-6 8h-30z" fill="${INK}"/><path d="M158 104v-14h12v14" fill="${INK}"/>
    <path d="M52 140C52 104 66 92 92 92C118 92 132 104 132 140Z" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${56 + i * 2} ${102 + i * 9}H${128 - i * 2}" stroke="${SEA}" stroke-width="4.5"/>`).join('')}
    <path d="M80 92L92 108L104 92" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    <path d="M78 60C78 42 106 42 106 60V72C106 84 98 92 92 92C86 92 78 84 78 72Z" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    <path d="M72 50C72 34 112 30 116 46L114 52H74Z" fill="${INK}"/><circle cx="104" cy="44" r="3" fill="${RUST}"/>
    <path d="M84 64h6M96 64h6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M88 78q4 3 8 0" stroke="${RUST}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M78 58C70 66 70 80 76 90M106 58C114 66 114 80 108 90" stroke="${INK}" stroke-width="4" fill="none"/>
    <path d="M140 36V82M128 46H152M126 70C128 82 152 82 154 70" stroke="${RUST}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="140" cy="30" r="5" fill="none" stroke="${RUST}" stroke-width="4"/>`,
  // Креативная: кисть закрашивает лишние фигурки — в бою остаются только три.
  ulya: (p) => `<rect width="200" height="140" fill="${PAPER}"/>
    <path d="M0 0H200V60Q150 70 100 58T0 64Z" fill="url(#${p}d)"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<g transform="translate(${22 + i * 24} 112)"><ellipse cy="10" rx="9" ry="3" fill="${INK}"/><path d="M-5 9L-3 -6H3L5 9Z" fill="${INK}"/><circle cy="-10" r="5" fill="${INK}"/></g>`).join('')}
    <path d="M86 84H196V130H86Z" fill="${LIME}" opacity=".92"/>
    <path d="M86 84q10 6 0 12q10 6 0 12q10 6 0 12q8 6 0 10" fill="none" stroke="${INK}" stroke-width="2"/>
    <path d="M150 20L118 76" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M118 76L110 86L122 84Z" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
    <path d="M144 30L156 36" stroke="${RUST}" stroke-width="8"/>
    <ellipse cx="44" cy="40" rx="26" ry="18" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    <circle cx="34" cy="36" r="4" fill="${RUST}"/><circle cx="48" cy="32" r="4" fill="${SEA}"/><circle cx="58" cy="42" r="4" fill="${LIME}"/><circle cx="40" cy="48" r="5" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`,
  // Госушница: гигантская печать «одобрено» штампует два домика, перетаскивая их на другой лист.
  sanya: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    <rect x="14" y="58" width="80" height="70" fill="${MILK}" stroke="${INK}" stroke-width="3" transform="rotate(-4 54 92)"/>
    <rect x="108" y="62" width="80" height="66" fill="${MILK}" stroke="${INK}" stroke-width="3" transform="rotate(3 148 94)"/>
    ${[0, 1, 2].map((i) => `<path d="M24 ${74 + i * 12}h50" stroke="${DUST}" stroke-width="3"/>`).join('')}
    ${house(122, 92, 22, SAND)}${house(154, 94, 20, SAND)}
    <path d="M70 108q40 -30 60 -10" stroke="${RUST}" stroke-width="3" fill="none" stroke-dasharray="5 4"/>
    <rect x="70" y="8" width="40" height="22" rx="10" fill="${RUST}" stroke="${INK}" stroke-width="3"/>
    <rect x="84" y="28" width="12" height="22" fill="${INK}"/>
    <rect x="62" y="48" width="56" height="12" rx="2" fill="${INK}"/>
    <circle cx="150" cy="104" r="26" fill="none" stroke="${RUST}" stroke-width="4" opacity=".85"/><circle cx="150" cy="104" r="20" fill="none" stroke="${RUST}" stroke-width="2" opacity=".85"/>`,

  // ---------------- Карты-награды
  uav: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    <path d="M100 58L30 140H170Z" fill="${LIME}" opacity=".55"/>
    <path d="M0 118L60 112L120 124L200 110V140H0Z" fill="${SAND}"/>
    ${[[40, 126], [96, 128], [148, 124]].map(([x, y]) => `<path d="M${x - 8} ${y}h16v-8h-16z" fill="${INK}"/>`).join('')}
    <path d="M58 40H142" stroke="${INK}" stroke-width="5"/>
    ${[52, 148].map((x) => `<ellipse cx="${x}" cy="32" rx="22" ry="4" fill="none" stroke="${INK}" stroke-width="3"/><path d="M${x} 32V42" stroke="${INK}" stroke-width="4"/>`).join('')}
    <rect x="82" y="36" width="36" height="22" rx="8" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    <circle cx="100" cy="58" r="9" fill="${INK}"/><circle cx="100" cy="58" r="4.5" fill="${RUST}"/><circle cx="98" cy="56" r="1.6" fill="${MILK}"/>`,
  nuke: (p) => `<rect width="200" height="140" fill="${INK}"/>
    <rect width="200" height="140" fill="url(#${p}d)" opacity=".5"/>
    <ellipse cx="100" cy="128" rx="90" ry="12" fill="${RUST}"/>
    <path d="M86 128C90 108 90 92 88 78H112C110 92 110 108 114 128Z" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    <path d="M88 84C70 86 64 80 72 76C80 72 120 72 128 76C136 80 130 86 112 84Z" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    <path d="M58 54C52 34 70 18 86 24C92 10 116 10 120 24C138 18 152 36 142 54C150 66 132 80 116 72C108 82 92 82 84 72C66 80 48 66 58 54Z" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
    <path d="M78 44c6 4 14 4 20 0M106 38c6 4 14 4 20 0M88 58c8 3 20 3 28 0" stroke="${INK}" stroke-width="2.5" fill="none"/>`,
  air_support: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(124)}
    <path d="M60 30C80 22 130 22 150 30C130 36 80 36 60 30Z" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    <path d="M86 18H128L124 24H90ZM86 40H128L124 34H90Z" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    <path d="M150 30L164 20V40Z" fill="${DUST}" stroke="${INK}" stroke-width="3"/><path d="M58 22V38" stroke="${INK}" stroke-width="4"/>
    <path d="M70 70C70 52 102 52 102 70Z" fill="${MILK}" stroke="${INK}" stroke-width="3"/><path d="M70 70L82 90M102 70L90 90M86 70V90" stroke="${INK}" stroke-width="2"/>
    <rect x="78" y="88" width="16" height="12" fill="${RUST}" stroke="${INK}" stroke-width="3"/>
    <path d="M140 124V96H176V124" fill="${DUST}" stroke="${INK}" stroke-width="3"/><path d="M134 96H182" stroke="${INK}" stroke-width="5"/>
    <path d="M150 84h16v12h-16z" fill="${LIME}" stroke="${INK}" stroke-width="3"/>`,
  // Неприкосновенность: квартал под стеклянным колпаком, как экспонат.
  inviolable: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    <rect x="44" y="118" width="112" height="14" fill="${INK}"/><rect x="36" y="112" width="128" height="8" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    ${house(70, 86, 26, SAND, RUST)}${house(104, 82, 28, MILK)}
    <path d="M48 112V56C48 22 152 22 152 56V112" fill="${MILK}" fill-opacity=".25" stroke="${INK}" stroke-width="3.5"/>
    <path d="M62 50C64 38 76 32 86 32" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"/>
    <circle cx="100" cy="20" r="7" fill="${INK}"/>
    <path d="M160 40l12-12M164 56h16M160 72l12 10" stroke="${RUST}" stroke-width="4" stroke-linecap="round"/>`,
  // Святыня: район на постаменте с нимбом и свечками, вокруг — нарисованная мелом запретная линия.
  shrine: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    <circle cx="100" cy="50" r="40" fill="${LIME}" opacity=".8"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = (i * 30) * Math.PI / 180; return `<path d="M${100 + Math.cos(a) * 44} ${50 + Math.sin(a) * 44}L${100 + Math.cos(a) * 54} ${50 + Math.sin(a) * 54}" stroke="${INK}" stroke-width="3"/>`; }).join('')}
    ${ground(118)}
    <path d="M70 118V96H130V118" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    ${house(82, 72, 36, MILK, RUST)}
    ${[56, 144].map((x) => `<rect x="${x - 3}" y="98" width="6" height="20" fill="${MILK}" stroke="${INK}" stroke-width="2"/><path d="M${x} 98c-4-6 0-10 0-12c0 2 4 6 0 12z" fill="${RUST}"/>`).join('')}
    <ellipse cx="100" cy="128" rx="86" ry="8" fill="none" stroke="${MILK}" stroke-width="3" stroke-dasharray="7 6"/>`,
  water_defense: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${sea(70)}
    <path d="M44 120C40 96 62 84 100 84C138 84 160 96 156 120Z" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    ${house(86, 92, 26, MILK)}
    ${[[30, 92], [58, 78], [100, 72], [142, 78], [170, 92]].map(([x, y]) => `<g><path d="M${x - 7} ${y + 8}H${x + 7}L${x + 4} ${y - 4}H${x - 4}Z" fill="${RUST}" stroke="${INK}" stroke-width="2.5"/><path d="M${x} ${y - 4}V${y - 12}" stroke="${INK}" stroke-width="2.5"/><circle cx="${x}" cy="${y - 14}" r="2.5" fill="${LIME}" stroke="${INK}" stroke-width="1.5"/></g>`).join('')}
    <path d="M14 104q86 30 172 0" stroke="${MILK}" stroke-width="2" stroke-dasharray="4 5" fill="none"/>`,
  hurricane: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(122)}
    <path d="M100 124C96 108 82 104 80 92C78 78 96 74 92 60C88 46 64 46 60 30C56 16 76 8 100 8C140 8 162 16 160 30C158 44 130 46 124 60C118 74 132 82 124 96C118 108 104 110 100 124Z" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    <path d="M74 26C96 34 128 34 148 24M84 52C100 58 118 58 130 50M88 80C96 84 112 84 118 80" stroke="${MILK}" stroke-width="3" fill="none"/>
    ${[[30, 40, -30], [168, 60, 40], [40, 92, 60], [158, 100, -20]].map(([x, y, r]) => `<g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y + 8}" rx="8" ry="2.6" fill="${INK}"/><path d="M${x - 4} ${y + 7}L${x - 3} ${y - 4}H${x + 3}L${x + 4} ${y + 7}Z" fill="${RUST}" stroke="${INK}" stroke-width="1.5"/><circle cx="${x}" cy="${y - 8}" r="4" fill="${RUST}" stroke="${INK}" stroke-width="1.5"/></g>`).join('')}`,

  // ---------------- Карты нейтральных территорий
  // Ковровка: буквальный ковёр с узором раскатывается по территории.
  carpet: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(70, DUST)}
    ${house(18, 56, 22, MILK)}${house(150, 52, 24, MILK)}
    <path d="M30 120L150 92L196 112L76 140Z" fill="${RUST}" stroke="${INK}" stroke-width="3"/>
    <path d="M44 120L148 96L180 110L76 134Z" fill="none" stroke="${LIME}" stroke-width="2.5"/>
    ${[[96, 112], [120, 106], [72, 118], [144, 102]].map(([x, y]) => `<path d="M${x} ${y - 6}L${x + 8} ${y}L${x} ${y + 6}L${x - 8} ${y}Z" fill="${SAND}" stroke="${INK}" stroke-width="1.5"/>`).join('')}
    <ellipse cx="34" cy="116" rx="16" ry="12" fill="${RUST}" stroke="${INK}" stroke-width="3"/><ellipse cx="34" cy="116" rx="8" ry="6" fill="none" stroke="${INK}" stroke-width="2"/>
    <path d="M100 20L104 50" stroke="${INK}" stroke-width="3"/><path d="M88 10H120L114 20H94Z" fill="${INK}"/>`,
  bridge_blast: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${sea(100)}
    <path d="M0 70H76L84 78L78 84H0Z" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    <path d="M200 70H124L118 78L124 84H200Z" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    ${[18, 50, 150, 182].map((x) => `<path d="M${x} 84V120" stroke="${INK}" stroke-width="6"/>`).join('')}
    <path d="M100 76L84 52L96 58L100 36L106 58L120 50L108 76Z" fill="${LIME}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    ${[[88, 96, 20], [112, 104, -30], [100, 88, 10]].map(([x, y, r]) => `<rect x="${x - 6}" y="${y - 3}" width="12" height="6" fill="${DUST}" stroke="${INK}" stroke-width="2" transform="rotate(${r} ${x} ${y})"/>`).join('')}
    <g transform="translate(150 28) rotate(20)"><rect x="-14" y="-6" width="28" height="12" rx="3" fill="${RUST}" stroke="${INK}" stroke-width="3"/><path d="M14 0C22 -2 22 -10 28 -12" stroke="${INK}" stroke-width="2" fill="none"/></g>`,
  // Тайные силы: тёмный лес и глаза, которые смотрят на вас.
  secret_forces: () => `<rect width="200" height="140" fill="${INK}"/>
    ${[10, 34, 58, 82, 106, 130, 154, 178, 198].map((x, i) => pine(x, 140, 70 + (i % 3) * 18, i % 2 ? '#2B3A2E' : '#333028')).join('')}
    ${[[50, 72], [96, 60], [144, 80], [120, 104], [70, 110]].map(([x, y], i) => `<g><ellipse cx="${x}" cy="${y}" rx="6" ry="${i % 2 ? 2.5 : 3.6}" fill="${LIME}"/><ellipse cx="${x + 16}" cy="${y}" rx="6" ry="${i % 2 ? 2.5 : 3.6}" fill="${LIME}"/><circle cx="${x + 1}" cy="${y}" r="1.6" fill="${INK}"/><circle cx="${x + 17}" cy="${y}" r="1.6" fill="${INK}"/></g>`).join('')}
    <circle cx="164" cy="24" r="12" fill="${MILK}"/><circle cx="170" cy="20" r="11" fill="${INK}"/>`,
  // Забвение: два домика меняются местами в тумане, над ними — незабудки.
  oblivion: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(116)}
    ${house(26, 80, 34, RUST)}${house(140, 80, 34, SEA)}
    <path d="M70 70C90 40 112 40 132 66" stroke="${INK}" stroke-width="3.5" fill="none"/><path d="M132 66l-12-2 8-9z" fill="${INK}"/>
    <path d="M130 106C110 126 90 126 70 106" stroke="${INK}" stroke-width="3.5" fill="none"/><path d="M70 106l12 1-7 9z" fill="${INK}"/>
    <path d="M0 96C30 86 60 100 100 92C140 84 170 98 200 90V108C160 116 120 104 90 112C56 120 30 108 0 114Z" fill="${MILK}" opacity=".75"/>
    ${[[96, 22], [112, 30], [84, 34]].map(([x, y]) => `<g>${[0, 72, 144, 216, 288].map((a) => `<circle cx="${x + Math.cos(a * Math.PI / 180) * 5}" cy="${y + Math.sin(a * Math.PI / 180) * 5}" r="4" fill="${SEA}"/>`).join('')}<circle cx="${x}" cy="${y}" r="2.5" fill="${LIME}"/></g>`).join('')}`,
  // Мутация: градирня станции и трёхглазый боец, светящийся кислотой.
  mutation: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(122, DUST)}
    <path d="M110 122C116 94 116 66 106 36H164C154 66 154 94 160 122Z" fill="${MILK}" stroke="${INK}" stroke-width="3"/>
    <path d="M112 60H158M114 84H156" stroke="${RUST}" stroke-width="5"/>
    <path d="M118 30C112 20 124 10 132 16C138 4 156 8 154 22C164 22 164 34 154 34H118Z" fill="${LIME}" stroke="${INK}" stroke-width="3"/>
    <circle cx="58" cy="78" r="38" fill="${LIME}" opacity=".45"/>
    <path d="M38 122L42 90H74L78 122Z" fill="${INK}"/>
    <path d="M36 92C36 74 42 66 58 66C74 66 80 74 80 92Z" fill="${INK}"/>
    <circle cx="58" cy="52" r="14" fill="${SAND}" stroke="${INK}" stroke-width="3"/>
    ${[[51, 50], [65, 50], [58, 42]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${MILK}" stroke="${INK}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1.5" fill="${INK}"/>`).join('')}
    <path d="M80 88L96 70M36 88L22 72" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
  acid_rain: (p) => `<rect width="200" height="140" fill="url(#${p}d)"/>
    ${ground(122)}
    ${[40, 120].map((x) => `<g><path d="M${x} 122V88H${x + 44}V122" fill="${DUST}" stroke="${INK}" stroke-width="3"/>${[0, 1, 2, 3].map((i) => `<rect x="${x + i * 12}" y="80" width="8" height="9" fill="${DUST}" stroke="${INK}" stroke-width="2.5"/>`).join('')}<path d="M${x + 16} 122V104H${x + 28}V122" fill="${INK}"/><path d="M${x + 6} 96l6 10M${x + 36} 94l-4 12" stroke="${RUST}" stroke-width="2.5"/></g>`).join('')}
    <path d="M30 40C24 26 40 14 54 20C60 4 92 2 100 18C112 8 134 12 136 28C152 26 160 42 148 50H36C24 50 22 42 30 40Z" fill="${DUST}" stroke="${INK}" stroke-width="3"/>
    <path d="M100 26C108 16 128 18 130 34C144 30 150 46 140 50" fill="none" stroke="${INK}" stroke-width="2"/>
    ${[[44, 60], [60, 72], [76, 58], [92, 68], [108, 60], [124, 74], [140, 62], [56, 52], [116, 52]].map(([x, y]) => `<path d="M${x} ${y}c-3 6-3 9 0 10c3-1 3-4 0-10z" fill="${LIME}" stroke="${INK}" stroke-width="1.5"/>`).join('')}`,
};

const BG = { operative: RUST, reward: SEA, neutral: SAND };

/** SVG-иллюстрация карты. category задаёт цвет растровой подложки. */
export function illustrationSVG(cardId, category) {
  const id = `ill${++uid}`;
  const tint = BG[category] ?? DUST;
  const draw = ART[cardId];
  return `<svg class="card-art" viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>${dots(`${id}d`, tint, 7, 1.7)}</defs>
    <rect width="200" height="140" fill="${PAPER}"/>
    ${draw ? draw(id) : ''}
  </svg>`;
}

export const ILLUSTRATED = Object.keys(ART);
