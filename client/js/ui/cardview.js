// Шаблон карточки: единый для всех категорий, соотношение 5:7.
// Текст и название — HTML поверх, в изображения не впечатываются.
import { ALL_CARDS } from '../../../shared/config/cards.js';
import { TERRITORIES } from '../../../shared/config/map.js';
import { illustrationSVG } from '../art/illustrations.js';

const CATEGORY = {
  operative: 'Топ-оперативник',
  reward: 'Награда территории',
  neutral: 'Нейтральная территория',
};

const SITE = { military_base: 'Военная база', forest: 'Лес', power_station: 'Энергостанция' };

/**
 * state: 'ready' | 'used' | 'locked' | 'hidden'
 */
// Готовые карточки художника (название и текст уже нарисованы). Имя файла = код карты.
// Карты без файла показываются векторным шаблоном ниже.
export const CARD_ART = new Set([
  'den_olches', 'lysy', 'sery', 'shlots', 'fedos_dron', 'sencha_vovan', 'platon_nazar', 'natalya', 'ulya', 'sanya',
  'uav', 'nuke', 'air_support', 'inviolable', 'shrine', 'water_defense', 'hurricane',
  'carpet', 'bridge_blast', 'secret_forces', 'oblivion', 'mutation', 'acid_rain',
]);
const artUrl = (id) => new URL(`../../assets/cards/${id}.jpg`, import.meta.url).href;

export function cardHTML(cardId, { state = 'ready', uid = '', from = null, compact = false, hint = '', big = false, armed = false } = {}) {
  const c = ALL_CARDS[cardId];
  if (!c) return '';
  if (CARD_ART.has(cardId)) {
    return `<article class="card card--image card--${c.category} card--${state}${compact ? ' card--compact' : ''}${big ? ' card--big' : ''}${armed ? ' armed' : ''}" ${uid ? `data-card-uid="${uid}"` : ''} data-card="${c.id}" tabindex="${uid ? 0 : -1}" role="${uid ? 'button' : 'img'}" aria-label="Карта «${c.name}»: ${c.text}" title="${c.name}">
      <img src="${artUrl(cardId)}" alt="" loading="lazy" decoding="async" draggable="false">
      ${state === 'used' ? '<span class="card__stamp">Использована</span>' : ''}
      ${hint ? `<span class="card__badge">${hint}</span>` : ''}
    </article>`;
  }
  const sub = c.category === 'operative' ? c.who
    : c.category === 'neutral' ? SITE[c.site]
      : from && TERRITORIES[from] ? `За «${TERRITORIES[from].name}»` : 'Фракционная территория';
  const when = c.phases.includes('prep') && c.phases.includes('turn') ? 'Подготовка или ход' : c.phases.includes('prep') ? 'Подготовка' : 'Свой ход';
  return `<article class="card card--${c.category} card--${state}${compact ? ' card--compact' : ''}${big ? ' card--big' : ''}${armed ? ' armed' : ''}" ${uid ? `data-card-uid="${uid}"` : ''} data-card="${c.id}" tabindex="${uid ? 0 : -1}" role="${uid ? 'button' : 'img'}" aria-label="Карта «${c.name}»">
    <header class="card__band"><span>${CATEGORY[c.category]}</span><span class="card__when">${when}</span></header>
    <div class="card__art">${illustrationSVG(c.id, c.category)}</div>
    <div class="card__body">
      <h4 class="card__name">${c.name}</h4>
      <p class="card__sub">${sub}</p>
      ${compact ? '' : `<p class="card__text">${c.text}</p>`}
      ${hint ? `<p class="card__hint">${hint}</p>` : ''}
    </div>
    ${state === 'used' ? '<span class="card__stamp">Использована</span>' : ''}
  </article>`;
}

/** Рубашка карты: противник видит только факт наличия. */
export function cardBackHTML() {
  return `<article class="card card--back" aria-label="Скрытая карта"><div class="card__backmark"></div></article>`;
}
