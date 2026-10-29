// Игровой экран: карта, рука, карты, панель действия, сводки и уведомления.
// Интерфейс только собирает намерение игрока; что допустимо — решает движок (сервер).
import { FACTIONS } from '../../../shared/config/factions.js';
import { UNIT_TYPES } from '../../../shared/config/units.js';
import { ALL_CARDS } from '../../../shared/config/cards.js';
import { TERRITORIES } from '../../../shared/config/map.js';
import { STATIC_REGIONS, areAdjacent } from '../../../shared/engine/board.js';
import { TARGET_VALIDATORS } from '../../../shared/engine/effects.js';
import { renderMap, WIDTH } from './map.js';
import { cardHTML } from './cardview.js';
import { emblemSVG } from '../art/emblems.js';
import { unitSVG } from '../art/units.js';
import { esc, label, fname, ownerInfo, playerTag, plural } from './util.js';

const PHASE = { draft: 'Выбор районов', prep: 'Подготовка', turns: 'Ходы', redirect: '«Авторитет»', resolving: 'Подсчёт', summary: 'Итоги раунда', finished: 'Партия окончена' };
const OUTCOME = { captured: 'Захвачен', held: 'Удержан', tie: 'Ничья атакующих', quiet: 'Без атаки', frozen: 'Заморожен' };

export class GameScreen {
  constructor(root, client, { onExit } = {}) {
    this.root = root;
    this.client = client;
    this.onExit = onExit;
    this.ui = this.freshUi();
    this.lastSeq = null;
    this.prevRegions = null;
    this.modal = null;          // { kind, ... }
    this.pending = false;
    this.toasts = [];
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('mousemove', (e) => this.onHover(e));
    root.addEventListener('mouseleave', () => this.hideTip());
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-region],[data-card-uid]')) { e.preventDefault(); e.target.click(); } if (e.key === 'Escape') this.cancel(); });
    root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.timerInt = setInterval(() => this.tickTimer(), 250);
  }
  freshUi() { return { unit: null, region: null, card: null, draft: {}, redirectPick: null, captured: new Set(), flash: new Set() }; }
  destroy() { clearInterval(this.timerInt); }

  // ------------------------------------------------ данные
  update(data) {
    const prev = this.view;
    this.data = data;
    this.view = data.game;
    const v = this.view;
    // сбрасываем выбор, если сменилась фаза/активный игрок
    if (!prev || prev.phase !== v.phase || prev.active !== v.active || prev.round !== v.round) {
      this.ui = { ...this.freshUi() };
      if (v.phase === 'summary' && !v.summaryAcks?.[v.me?.id ?? '__'] ) this.modal = { kind: 'summary' };
      if (v.phase === 'finished') this.modal = { kind: 'final' };
      if (this.modal?.kind === 'summary' && v.phase !== 'summary') this.modal = v.phase === 'finished' ? { kind: 'final' } : null;
    }
    if (this.ui.unit && !v.me?.hand.some((u) => u.uid === this.ui.unit)) this.ui.unit = null;
    // анимации смены владельца и уничтожения
    this.ui.captured = new Set();
    this.ui.flash = new Set();
    if (this.prevRegions) {
      for (const [id, r] of Object.entries(v.regions)) {
        const p = this.prevRegions[id];
        if (!p) continue;
        if (r.destroyed && !p.destroyed) this.ui.flash.add(id);
        else if (r.owner !== p.owner) this.ui.captured.add(id);
      }
    }
    this.prevRegions = JSON.parse(JSON.stringify(v.regions));
    this.collectToasts(v);
    this.render();
  }

  collectToasts(v) {
    const maxSeq = v.log.length ? v.log[v.log.length - 1].seq : 0;
    if (this.lastSeq === null) { this.lastSeq = maxSeq; return; }
    const fresh = v.log.filter((e) => e.seq > this.lastSeq);
    this.lastSeq = maxSeq;
    for (const e of fresh) {
      if (e.type === 'unitGranted') {
        const p = v.players.find((x) => x.id === e.data.player);
        const t = UNIT_TYPES[e.data.type];
        this.toast(`${unitSVG(t.art, FACTIONS[p.faction].color, 44)}`, `<b>${esc(fname(p.faction))}</b> получает дополнительный юнит: <b>${esc(t.name)}</b>${e.data.player === v.me?.id ? ' — он уже в вашей руке.' : '.'}`);
      } else if (e.type === 'rewardGranted') {
        if (e.data.player === v.me?.id) {
          const c = v.me.cards.find((x) => x.from === e.data.territory);
          if (c) this.modal = { kind: 'gotCard', card: c };
        } else {
          const p = v.players.find((x) => x.id === e.data.player);
          this.toast(emblemSVG(p.faction, { size: 36 }), esc(e.text));
        }
      } else if (e.type === 'regionDestroyed' || e.type === 'bridgeDestroyed') {
        this.toast('<span class="boom"></span>', esc(e.text), 'battle');
      } else if (e.type === 'cardPlayed' && e.data.player !== v.me?.id) {
        const p = v.players.find((x) => x.id === e.data.player);
        this.toast(emblemSVG(p.faction, { size: 36 }), esc(e.text));
      } else if (e.type === 'cardPlayed' && e.data.card === 'uav') {
        this.modal = { kind: 'uav' };
      } else if (e.mine && e.type === 'cardPlayed' && e.text.includes('Выпал')) {
        this.toast('', esc(e.text));
      } else if (e.type === 'turnSkipped' && e.data.reason !== 'manual') {
        this.toast('', esc(e.text), 'error');
      }
    }
  }

  toast(icon, html, kind = '') {
    const stack = this.ensureToastStack();
    const el = document.createElement('div');
    el.className = `toast${kind ? ` toast--${kind}` : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div>${icon}</div><div>${html}</div>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 7000 : 5500);
  }
  ensureToastStack() {
    let s = document.querySelector('.toast-stack');
    if (!s) { s = document.createElement('div'); s.className = 'toast-stack'; s.setAttribute('aria-live', 'polite'); document.body.appendChild(s); }
    return s;
  }

  // ------------------------------------------------ вычисления
  me() { return this.view.me; }
  myTurn() {
    const v = this.view;
    // за одним экраном стартовый выбор открытый: выбирает тот, чья очередь, без шторки
    if (v.phase === 'draft' && this.client.local) return !this.playerOf(v.active)?.bot;
    return !!v.me && v.active === v.me.id && ['draft', 'prep', 'turns', 'redirect'].includes(v.phase);
  }
  playerOf(pid) { return this.view.players.find((p) => p.id === pid); }

  cardIsPlayable(cardId, isOperative) {
    const v = this.view;
    if (!this.myTurn()) return false;
    const c = ALL_CARDS[cardId];
    if (v.phase === 'prep') return c.phases.includes('prep');
    if (v.phase === 'turns') {
      if (isOperative) return false;
      return c.phases.includes('turn') && v.turn.cardsUsed < v.rules.maxCardsPerTurn && v.turn.placed === 0;
    }
    return false;
  }

  pseudoState() {
    const v = this.view;
    return { regions: v.regions, bridges: v.bridges, players: Object.fromEntries(v.players.map((p) => [p.id, p])) };
  }

  validTarget(card, target) {
    try {
      TARGET_VALIDATORS[card.target]({ state: this.pseudoState(), player: this.view.me.id, card, target });
      return true;
    } catch { return false; }
  }

  /** Районы, доступные на текущем шаге выбора цели карты. */
  cardCandidates() {
    const { card, draft } = this.ui;
    if (!card) return new Set();
    const c = ALL_CARDS[card.card];
    const v = this.view;
    const ids = Object.keys(v.regions);
    const live = (r) => !v.regions[r].destroyed;
    const out = new Set();
    switch (c.target) {
      case 'region': case 'liveRegion': case 'ownRegion': case 'notOwnRegion': case 'coastalRegion': case 'destroyedRegion':
        for (const r of ids) if (this.validTarget(c, { region: r })) out.add(r);
        break;
      case 'territory':
        for (const r of ids) if (live(r)) out.add(r);
        break;
      case 'transfer':
        if (draft.from && draft.to) for (const r of ids) if (live(r) && v.regions[r].owner === draft.from && !(draft.regions ?? []).includes(r)) out.add(r);
        break;
      case 'twoAdjacentRegions': {
        const first = draft.regions?.[0];
        for (const r of ids) if (live(r) && (!first || (r !== first && areAdjacent(this.pseudoState(), first, r)))) out.add(r);
        break;
      }
      case 'twoCapitals':
        for (const r of ids) if (live(r) && STATIC_REGIONS[r].type === 'capital' && !(draft.regions ?? []).includes(r)) out.add(r);
        break;
      case 'swap':
        if (!draft.own) { for (const r of ids) if (live(r) && v.regions[r].owner === v.me.id) out.add(r); }
        else for (const r of ids) if (live(r) && v.regions[r].owner && v.regions[r].owner !== v.me.id) out.add(r);
        break;
      default: break;
    }
    return out;
  }

  cardTargetComplete() {
    const { card, draft } = this.ui;
    const c = ALL_CARDS[card.card];
    switch (c.target) {
      case 'none': return true;
      case 'anyPlayer': case 'opponent': return !!draft.player;
      case 'transfer': return draft.from && draft.to && draft.regions?.length === 2;
      case 'territory': return !!draft.territory;
      case 'bridge': return !!draft.bridge;
      case 'twoAdjacentRegions': case 'twoCapitals': return draft.regions?.length === 2;
      case 'swap': return draft.own && draft.enemy;
      default: return !!draft.region;
    }
  }

  // ------------------------------------------------ рендер
  render() {
    const v = this.view;
    if (!v) return;
    const legal = new Set();
    const selected = new Set();
    let bridgeTargets = new Set();
    if (this.ui.card) {
      for (const r of this.cardCandidates()) legal.add(r);
      const d = this.ui.draft;
      for (const r of [d.region, d.own, d.enemy, ...(d.regions ?? [])]) if (r) selected.add(r);
      if (d.territory) for (const r of TERRITORIES[d.territory].regions) selected.add(r);
      if (ALL_CARDS[this.ui.card.card].target === 'bridge') bridgeTargets = new Set(Object.values(v.bridges).filter((b) => !b.destroyed).map((b) => b.id));
    } else if (this.ui.unit) {
      const u = v.me.hand.find((x) => x.uid === this.ui.unit);
      for (const r of u?.legal ?? []) legal.add(r);
      if (this.ui.region) selected.add(this.ui.region);
    } else if (v.phase === 'draft' && this.myTurn()) {
      for (const r of v.draft.options) legal.add(r);
      if (this.ui.region) selected.add(this.ui.region);
    } else if (v.phase === 'redirect' && this.myTurn() && this.ui.redirectPick) {
      for (const r of Object.keys(v.regions)) if (!v.regions[r].destroyed) legal.add(r);
    }
    const mapHtml = renderMap(v, {
      legal, selected, bridgeTargets,
      summary: v.phase === 'summary' || v.phase === 'finished',
      dragFor: v.phase === 'redirect' && this.myTurn(),
      captured: this.ui.captured, flash: this.ui.flash, selectedBridge: this.ui.draft?.bridge,
    });

    const localCurtain = this.data.local?.curtain;
    this.root.innerHTML = `
      <div class="game">
        ${this.topbarHTML()}
        <main class="stage">
          <section class="map-stage" aria-label="Карта">
            <div class="map-frame">${mapHtml}</div>
          </section>
          <aside class="side">${this.playersHTML()}${this.cardsHTML()}${this.logHTML()}${this.rewardsHTML()}${this.legendHTML()}</aside>
        </main>
        <footer class="dock">${this.actionBarHTML()}${v.phase === 'draft' ? '' : this.handHTML()}</footer>
        <div class="tooltip" hidden></div>
      </div>
      ${this.modalHTML()}
      ${localCurtain ? this.curtainHTML() : ''}
    `;
    this.tickTimer();
  }

  topbarHTML() {
    const v = this.view;
    const active = v.active ? this.playerOf(v.active) : null;
    const pips = Array.from({ length: v.rounds }, (_, i) => `<span class="round-pip ${i + 1 < v.round ? 'done' : i + 1 === v.round ? 'now' : ''}" title="Раунд ${i + 1}"></span>`).join('');
    const who = active ? `${emblemSVG(active.faction, { size: 22 })} <span class="phase-who">${active.id === v.me?.id && !this.client.local ? 'ваше решение' : `${esc(fname(active.faction))} (${esc(active.name)})`}</span>` : '';
    const net = this.client.local ? 'за одним экраном' : this.client.status === 'offline' ? '<span style="color:var(--rust-2)">нет связи, переподключаемся…</span>' : `комната ${esc(this.data.lobby.code)}`;
    return `<header class="topbar">
      <div class="brand">Острова Лабеан<small>${net}</small></div>
      <div class="rounds" aria-label="Раунд ${v.round} из ${v.rounds}">${pips}<span class="phase-who" style="margin-left:8px">${v.round ? `Раунд ${v.round} из ${v.rounds}` : 'До первого раунда'}${v.phase === 'turns' && v.turn ? `, круг ходов ${v.turn.cycle} из ${v.turn.cycles}` : ''}${v.phase === 'draft' ? `, выбор: круг ${v.draft.cycle} из ${v.draft.cycles}` : ''}</span></div>
      <div class="phase-box"><span class="phase-name">${PHASE[v.phase] ?? v.phase}</span>${who}<span class="timer" data-timer></span></div>
    </header>`;
  }

  playersHTML() {
    const v = this.view;
    const order = v.phase === 'draft' ? v.draft.order : v.phase === 'prep' ? v.prepOrder : v.turnOrder ?? v.order;
    const ordered = (order ?? v.order).map((id) => this.playerOf(id));
    const doneTurn = (pid) => {
      const ord = v.phase === 'draft' ? v.draft.order : v.phase === 'prep' ? v.prepOrder : v.turnOrder;
      if (!ord || !['draft', 'prep', 'turns'].includes(v.phase)) return false;
      return ord.indexOf(pid) < ord.indexOf(v.active);
    };
    const rows = ordered.map((p) => {
      const flags = [];
      if (doneTurn(p.id)) flags.push(`<span class="flag flag--done">${v.phase === 'prep' ? 'готов' : v.phase === 'draft' ? `выбрал в круге ${v.draft.cycle}` : `сходил в круге ${v.turn.cycle}`}</span>`);
      if (v.phase === 'draft') flags.push(`<span class="flag">районы: ${v.draft.picks[p.id].map(label).join(', ') || '—'}</span>`);
      const onMap = v.actions.filter((a) => a.player === p.id).length;
      if (onMap) flags.push(`<span class="flag">отрядов на карте: ${onMap}</span>`);
      if (p.operativeUsed) flags.push(`<span class="flag" title="${esc(ALL_CARDS[p.operativeCard]?.name)}">оперативник сыгран</span>`);
      if (p.cardCount) flags.push(`<span class="flag">${p.cardCount} ${plural(p.cardCount, 'карта', 'карты', 'карт')}</span>`);
      if (v.phase === 'summary' && v.summaryAcks?.[p.id]) flags.push('<span class="flag flag--done">прочитал итоги</span>');
      const online = this.data.lobby.seats?.find((s) => s.playerId === p.id)?.online;
      return `<div class="dossier ${p.id === v.active ? 'active' : ''} ${p.id === v.me?.id ? 'me' : ''}">
        ${emblemSVG(p.faction, { size: 38 })}
        <div><div class="dossier__name">${esc(fname(p.faction))}</div>
          <div class="dossier__meta">${esc(p.name)}${p.bot ? ' · <span class="flag">компьютер</span>' : ''}${this.client.local || p.bot ? '' : online === false ? ' · <span style="color:var(--rust-2)">не в сети</span>' : ''} · юнитов: ${p.handCount}</div>
          <div class="dossier__flags">${flags.join('')}</div></div>
        <div class="dossier__score">${v.scores[p.id]}<small>${plural(v.scores[p.id], 'очко', 'очка', 'очков')}</small></div>
      </div>`;
    }).join('');
    const npc = v.npcFactions.map((f) => `<span class="chip">${emblemSVG(f, { size: 18, npc: true })}${esc(fname(f))}</span>`).join('');
    const title = v.phase === 'draft' ? 'Порядок выбора' : v.phase === 'prep' ? 'Порядок подготовки' : 'Порядок ходов';
    return `<div class="panel"><div class="panel__title"><span>${title}</span><span class="row" style="gap:2px">
        <button class="btn btn--quiet btn--small" data-act="calm" title="Отключить анимации">${document.body.classList.contains('calm') ? 'Анимации' : 'Спокойно'}</button>
        ${this.client.local ? '<button class="btn btn--quiet btn--small" data-act="exit">Меню</button>' : ''}</span></div>${rows}
      <div class="npc-list">Не в игре: ${npc} — их районы ничейные</div></div>`;
  }

  rewardsHTML() {
    const v = this.view;
    const claimed = Object.entries(v.claimedRewards);
    return `<div class="panel stash-note"><b>Тайники:</b> ${v.stashLeft ?? 0} нетронутых. В случайных районах спрятаны дополнительные юниты — их получает тот, кто первым возьмёт район.</div>
      <details class="panel"><summary class="panel__title"><span>Награды территорий</span><span>${claimed.length} из ${Object.keys(TERRITORIES).length}</span></summary>
      <div style="font-size:12.5px;display:grid;gap:4px">${Object.values(TERRITORIES).map((t) => {
        const who = v.claimedRewards[t.id];
        return `<div style="display:flex;justify-content:space-between;gap:6px;color:${who ? 'var(--milk)' : 'var(--dust)'}"><span>${esc(t.name)} <span class="muted">${t.regions.map(label).join(' ')}</span></span><span>${who ? playerTag(v, who, 16) : 'свободна'}</span></div>`;
      }).join('')}</div></details>`;
  }

  actionBarHTML() {
    const v = this.view;
    const me = v.me;
    const bar = (text, buttons = '', extra = '') => `<div class="action-bar ${extra}"><div class="action-bar__text">${text}</div><div class="row">${buttons}</div></div>`;
    if (v.phase === 'finished') return bar(`<b>Партия окончена.</b> ${esc(this.resultLine())}`, '<button class="btn btn--go" data-act="final">Итоги партии</button>');
    if (v.phase === 'summary') {
      const acked = v.summaryAcks?.[me?.id];
      const waiting = v.players.filter((p) => !v.summaryAcks?.[p.id]).map((p) => fname(p.faction)).join(', ');
      return bar(acked ? `Ждём, пока итоги прочитают: ${esc(waiting)}.` : `<b>Раунд ${v.round} завершён.</b> На карте — итоговые силы атак и защит.`,
        `<button class="btn" data-act="summary">Сводка</button>${acked ? '' : '<button class="btn btn--go" data-act="ack">К следующему раунду</button>'}`);
    }
    if (v.phase === 'draft') return this.draftBar(bar);
    if (!this.myTurn()) {
      const a = v.active ? this.playerOf(v.active) : null;
      const doing = v.phase === 'prep' ? 'готовится к раунду' : v.phase === 'redirect' ? 'перенаправляет юниты («Авторитет»)' : 'делает ход';
      return bar(a ? `${emblemSVG(a.faction, { size: 22 })} <b>${esc(fname(a.faction))}</b>${a.bot ? ' (компьютер)' : ''} ${doing}. Ваши юниты и карты видны только вам.` : 'Подсчёт…', '', 'waiting');
    }
    if (this.ui.card) return this.cardBar(bar);
    if (v.phase === 'prep') {
      const opReady = me.operative && !me.operativeUsed;
      return bar(`<b>Подготовка раунда ${v.round}.</b> ${opReady ? 'Можно разыграть топ-оперативника — один раз за партию.' : 'Можно сыграть карты подготовки.'} Затем подтвердите готовность.`,
        '<button class="btn btn--go" data-act="ready">Готов к раунду</button>');
    }
    if (v.phase === 'redirect') {
      const r = v.redirect;
      const pick = this.ui.redirectPick;
      return bar(`<b>«Авторитет»:</b> перенаправлено ${r.moved.length} из ${r.maxUnits}. ${pick ? 'Теперь выберите район для этого отряда.' : 'Перетащите отряд противника на другой район или щёлкните отряд, затем район.'}`,
        `${pick ? '<button class="btn btn--quiet" data-act="cancel">Отменить выбор</button>' : ''}<button class="btn btn--go" data-act="redirect-done">Завершить и подсчитать</button>`);
    }
    // ходы
    const u = this.ui.unit ? me.hand.find((x) => x.uid === this.ui.unit) : null;
    if (u && this.ui.region) {
      const kind = v.regions[this.ui.region].owner === me.id ? 'defend' : 'attack';
      const mut = v.turn.mutation ? ' (+2 «Мутация»)' : '';
      return bar(`<b>${esc(UNIT_TYPES[u.type].name)}</b> (сила ${u.strength}${mut}) → <b>${label(this.ui.region)}</b> <span class="kind kind--${kind}">${kind === 'attack' ? 'атака' : 'защита'}</span><br><span class="muted" style="font-size:12.5px">${this.forecast(u, this.ui.region, kind)} После подтверждения действие нельзя отменить.</span>`,
        `<button class="btn btn--quiet" data-act="cancel">Изменить</button><button class="btn btn--go" data-act="confirm-place" ${this.pending ? 'disabled' : ''}>Подтвердить</button>`);
    }
    if (u) {
      return bar(`<b>${esc(UNIT_TYPES[u.type].name)}</b> (сила ${u.strength}) выбран. ${u.legal.length ? 'Выберите подсвеченный район.' : 'Этому юниту сейчас некуда идти — выберите другой.'}`,
        '<button class="btn btn--quiet" data-act="cancel">Снять выбор</button>');
    }
    const used = v.turn.placed >= v.rules.unitsPerTurn;
    return bar(`<b>Ваш ход${v.turn ? ` — круг ${v.turn.cycle} из ${v.turn.cycles}` : ''}.</b> ${me.hand.length ? 'Выберите юнит в руке, затем район. Карту хода играйте до выставления юнита.' : 'Юнитов в руке нет — можно сыграть карту или пропустить ход.'}`,
      `<button class="btn" data-act="skip" ${used ? 'disabled' : ''}>Пропустить ход</button>`);
  }

  draftBar(bar) {
    const v = this.view;
    const a = this.playerOf(v.active);
    const d = v.draft;
    const n = d.picks[a.id].length + 1;
    const head = `${emblemSVG(a.faction, { size: 22 })} <b>${esc(fname(a.faction))}</b>`;
    if (!this.myTurn()) {
      return bar(`${head}${a.bot ? ' (компьютер)' : ''} выбирает ${n}-й район. Стартовый выбор: круг ${d.cycle} из ${d.cycles}. Укрепрайоны уже закреплены за фракциями.`, '', 'waiting');
    }
    const who = this.client.local ? `${head} (${esc(a.name)})` : '<b>Ваш выбор</b>';
    if (this.ui.region) {
      const s = STATIC_REGIONS[this.ui.region];
      const home = s.homeFaction ? `исходно — ${fname(s.homeFaction)}` : `нейтральный: ${TERRITORIES[s.territory].name}`;
      return bar(`${who}: закрепить <b>${label(this.ui.region)}</b> <span class="muted">(${home}${s.coastal ? ', море' : ''}${s.wall ? ', стенка' : ''})</span>. Выбор нельзя отменить.`,
        `<button class="btn btn--quiet" data-act="cancel">Изменить</button><button class="btn btn--go" data-act="confirm-draft" ${this.pending ? 'disabled' : ''}>Закрепить район</button>`);
    }
    return bar(`${who}: выберите на карте ${n}-й район из трёх. Доступны все белые районы. Круг ${d.cycle} из ${d.cycles}.`);
  }

  /** Подсказка: какой станет сила по району и что нужно для захвата. Чужие отряды скрыты, поэтому без их силы. */
  forecast(u, rid, kind) {
    const v = this.view;
    const mine = v.actions.filter((a) => a.region === rid && a.player === v.me.id);
    const sum = mine.reduce((t, a) => t + a.strength + (a.mutation && kind === 'attack' ? 2 : 0), 0) + u.strength + (v.turn.mutation && kind === 'attack' ? 2 : 0);
    const r = v.regions[rid];
    const type = STATIC_REGIONS[rid].type;
    const acid = v.effects.some((e) => e.effect === 'removeBaseDefense' && e.data.regions.includes(rid));
    const base = acid ? 0 : v.rules.baseDefense[type];
    const others = v.actions.filter((a) => a.region === rid && a.player !== v.me.id).length;
    if (kind === 'defend') return `Ваша защита района станет ${base} (встроенная) + ${sum} = ${base + sum}.`;
    const def = r.owner && !r.owner.startsWith('npc:') ? `${base} + защитники владельца` : `${base}`;
    return `Ваша атака по району станет ${sum}; защита района — ${def}. Для захвата нужно больше защиты и больше, чем у любого другого атакующего${others ? ` (здесь уже есть чужих отрядов: ${others})` : ''}.`;
  }

  cardBar(bar) {
    const v = this.view;
    const c = ALL_CARDS[this.ui.card.card];
    const d = this.ui.draft;
    const others = v.players.filter((p) => p.id !== v.me.id);
    const pickBtns = (key, list, exclude = []) => `<div class="picker">${list.filter((p) => !exclude.includes(p.id)).map((p) => `<button data-pick="${key}" data-val="${p.id}" aria-pressed="${d[key] === p.id}">${emblemSVG(p.faction, { size: 18 })}${esc(fname(p.faction))}</button>`).join('')}</div>`;
    let step = '';
    switch (c.target) {
      case 'none': step = 'Цель не нужна.'; break;
      case 'anyPlayer': step = `Выберите игрока:${pickBtns('player', v.players)}`; break;
      case 'opponent': step = `Выберите противника:${pickBtns('player', others)}`; break;
      case 'transfer':
        step = !d.from ? `У кого забрать два района:${pickBtns('from', others)}`
          : !d.to ? `Кому передать:${pickBtns('to', others, [d.from])}`
            : `Выберите на карте два района игрока «${esc(fname(this.playerOf(d.from).faction))}» (${(d.regions ?? []).length} из 2).`;
        break;
      case 'territory': step = d.territory ? `Территория: <b>${esc(TERRITORIES[d.territory].name)}</b>.` : 'Щёлкните любой район нужной территории.'; break;
      case 'bridge': step = d.bridge ? `Мост ${label(v.bridges[d.bridge].a)} — ${label(v.bridges[d.bridge].b)}.` : 'Щёлкните мост на карте.'; break;
      case 'twoAdjacentRegions': step = `Выберите два соседних района (${(d.regions ?? []).length} из 2).`; break;
      case 'twoCapitals': step = `Выберите две столицы (${(d.regions ?? []).length} из 2).`; break;
      case 'swap': step = !d.own ? 'Выберите свой район.' : !d.enemy ? 'Теперь — чужой район.' : `${label(d.own)} ⇄ ${label(d.enemy)}.`; break;
      default: step = d.region ? `Цель: <b>${label(d.region)}</b>.` : 'Выберите подсвеченный район.';
    }
    const done = this.cardTargetComplete();
    return bar(`<b>«${esc(c.name)}»</b>: ${step}${c.consumesTurnUnit ? '<br><span class="muted" style="font-size:12.5px">В этот ход вы не выставите юнит.</span>' : ''}`,
      `<button class="btn btn--quiet" data-act="cancel">Отменить</button><button class="btn btn--go" data-act="confirm-card" ${done && !this.pending ? '' : 'disabled'}>Разыграть</button>`);
  }

  legendHTML() {
    return `<details class="panel map-legend"><summary class="panel__title"><span>Обозначения</span></summary>
      <div class="legend-grid">
        <span><i style="background:#FFFFFF"></i>белый — ничейный район</span>
        <span><i style="background:#000000"></i>чёрный — уничтожен</span>
        <span><svg width="16" height="16" viewBox="-9 -9 18 18"><path d="M-8 8V-3H-5V-7H-2V-3H2V-7H5V-3H8V8Z" fill="#E4DAC4" stroke="#1C1B19" stroke-width="1.4"/></svg>укрепрайон: защита 2, 2 очка</span>
        <span><svg width="16" height="16" viewBox="-9 -9 18 18"><path d="M0 -9L7 1H3L8 8H-8L-3 1H-7Z" fill="#3F7A3A"/></svg>нейтральный район: защита 2, 0 очков</span>
        <span>цвет района — фракция владельца, эмблема рядом с кодом — тоже</span>
      </div></details>`;
  }

  handHTML() {
    const v = this.view;
    const me = v.me;
    if (!me) return this.client.local ? '<div class="hand-bar"><div class="hand-empty">Стартовый выбор открытый: юниты и карты появятся в первом раунде, за шторкой.</div></div>' : '';
    const canPlace = this.myTurn() && v.phase === 'turns' && !this.ui.card && v.turn.placed < v.rules.unitsPerTurn;
    const accent = FACTIONS[this.playerOf(me.id).faction].color;
    const sorted = [...me.hand].sort((a, b) => a.naval - b.naval || a.strength - b.strength);
    const units = sorted.map((u) => {
      const t = UNIT_TYPES[u.type];
      const dis = canPlace ? !u.legal.length : false;
      return `<button class="unit" data-unit="${u.uid}" aria-pressed="${this.ui.unit === u.uid}" ${(!canPlace && this.myTurn() && v.phase === 'turns') || dis ? 'disabled' : ''} title="${esc(t.name)}, сила ${t.strength}${t.naval ? ', морской' : ''}">
        ${unitSVG(t.art, accent, 40)}
        <span class="unit__str">${t.strength}</span>
        ${t.naval ? '<svg class="unit__sea" viewBox="0 0 16 16"><path d="M1 7Q4 4 8 7T15 7M1 12Q4 9 8 12T15 12" stroke="#5E7F7B" stroke-width="2" fill="none"/></svg>' : ''}
        <span class="unit__name">${esc(t.name)}</span>
      </button>`;
    }).join('');
    const placedMine = v.actions.filter((a) => a.player === me.id);
    const empty = v.phase === 'draft' ? 'Юниты раздадут в начале первого раунда.' : 'Рука пуста. Юниты перераздаются в начале каждого раунда.';
    return `<div class="hand-bar"><div class="hand-bar__title"><b>Ваши юниты</b><span>${me.hand.length} в руке${placedMine.length ? `, ${placedMine.length} на карте` : ''}</span>
      ${me.reveals?.length ? '<button class="btn btn--small" data-act="uav">Разведданные БПЛА</button>' : ''}</div>
      ${me.hand.length ? `<div class="hand">${units}</div>` : `<div class="hand-empty">${empty}</div>`}
    </div>`;
  }

  cardsHTML() {
    const v = this.view;
    const me = v.me;
    if (!me) return '';
    const armed = this.ui.card?.uid;
    const items = [];
    if (me.operative) {
      const st = me.operativeUsed ? 'used' : this.cardIsPlayable(me.operative.card, true) ? 'ready' : 'locked';
      items.push(cardHTML(me.operative.card, { state: st, uid: me.operative.uid, compact: true, armed: armed === me.operative.uid }));
    }
    for (const c of me.cards) {
      const st = this.cardIsPlayable(c.card, false) ? 'ready' : 'locked';
      items.push(cardHTML(c.card, { state: st, uid: c.uid, from: c.from, compact: true, armed: armed === c.uid }));
    }
    return `<div class="panel"><div class="panel__title"><span>Ваши карты</span><span>щёлкните, чтобы прочитать</span></div>
      <div class="cards">${items.join('')}</div></div>`;
  }

  logHTML() {
    const v = this.view;
    const items = v.log.slice(-60).map((e) => {
      const cls = ['regionCaptured', 'regionDestroyed', 'roundEnd', 'gameEnd'].includes(e.type) ? 'battle' : e.type === 'cardPlayed' ? 'card' : '';
      return `<div class="log__item ${cls} ${e.mine ? 'mine' : ''}"><small>Р${e.round}</small>${esc(e.text)}</div>`;
    }).reverse().join('');
    return `<div class="panel"><div class="panel__title"><span>Журнал</span></div><div class="log" aria-live="polite">${items}</div></div>`;
  }

  resultLine() {
    const v = this.view;
    if (!v.result) return '';
    const names = v.result.winners.map((id) => fname(this.playerOf(id).faction)).join(', ');
    return v.result.draw ? `Ничья: ${names}.` : `Победа: ${names}.`;
  }

  // ------------------------------------------------ модальные окна
  modalHTML() {
    if (!this.modal) return '';
    const v = this.view;
    const shell = (title, body, foot) => `<div class="overlay" data-overlay><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head"><h2>${title}</h2><button class="btn btn--quiet btn--small" data-act="close-modal" aria-label="Закрыть">Закрыть</button></div>
      <div class="modal__body">${body}</div>${foot ? `<div class="modal__foot">${foot}</div>` : ''}</div></div>`;
    switch (this.modal.kind) {
      case 'summary': {
        const s = v.lastSummary;
        if (!s) return '';
        const acked = v.summaryAcks?.[v.me?.id];
        return shell(`Итоги раунда ${s.round}`, this.summaryBody(s), v.phase === 'summary' && !acked ? '<button class="btn btn--go" data-act="ack">К следующему раунду</button>' : '');
      }
      case 'final': {
        const r = v.result;
        if (!r) return '';
        const ranks = [...v.players].sort((a, b) => r.scores[b.id] - r.scores[a.id]);
        let pos = 0, prev = null;
        const rows = ranks.map((p, i) => {
          if (r.scores[p.id] !== prev) { pos = i + 1; prev = r.scores[p.id]; }
          const win = r.winners.includes(p.id);
          return `<div class="final-rank ${win ? 'win' : ''}"><span class="pos">${pos}</span>${emblemSVG(p.faction, { size: 44 })}<div><b>${esc(fname(p.faction))}</b><div class="muted">${esc(p.name)}</div></div><span class="pts">${r.scores[p.id]}</span></div>`;
        }).join('');
        return shell(r.draw ? 'Ничья' : `Победа: ${esc(fname(this.playerOf(r.winners[0]).faction))}`,
          `<p>${r.draw ? 'Наибольшее число очков набрали несколько фракций — единственного победителя нет.' : 'Партия завершена после пятого раунда.'} Очки: обычный район — 1, столица — 2, нейтральный — 0.</p>${rows}
           <h3 style="margin:18px 0 8px;font-size:15px">Последний раунд</h3>${v.lastSummary ? this.summaryBody(v.lastSummary) : ''}`,
          this.client.local ? '<button class="btn btn--go" data-act="exit">В меню</button>' : '<a class="btn btn--go" href="/">Новая партия</a>');
      }
      case 'card': {
        const c = this.modal.card;
        const playable = this.cardIsPlayable(c.card, c.operative);
        const used = c.operative && v.me.operativeUsed;
        const why = used ? 'Карта уже использована.' : playable ? '' : this.whyLocked(c);
        return shell(esc(ALL_CARDS[c.card].name), `<div class="row" style="align-items:flex-start;gap:24px">${cardHTML(c.card, { state: used ? 'used' : 'ready', from: c.from, big: true })}
          <div style="flex:1;min-width:220px"><p>${esc(ALL_CARDS[c.card].text)}</p>${why ? `<p class="muted">${esc(why)}</p>` : ''}
          ${ALL_CARDS[c.card].public ? '<p class="muted" style="font-size:13px">Все игроки увидят, что карта сыграна.</p>' : ''}</div></div>`,
          playable ? `<button class="btn btn--go" data-act="arm" data-uid="${c.uid}">Выбрать цель и сыграть</button>` : '');
      }
      case 'gotCard': {
        const c = this.modal.card;
        return shell('Получена карта-награда', `<div class="row" style="gap:24px;align-items:flex-start">${cardHTML(c.card, { from: c.from, big: true })}<p style="flex:1">Вы первыми полностью захватили территорию «${esc(TERRITORIES[c.from].name)}». Другие игроки знают, что вы получили карту, но не знают какую.</p></div>`, '<button class="btn btn--go" data-act="close-modal">В руку</button>');
      }
      case 'uav': {
        const rev = v.me?.reveals?.[v.me.reveals.length - 1];
        if (!rev) return '';
        const rows = Object.entries(rev.data).map(([pid, d]) => {
          const p = this.playerOf(pid);
          const mini = (t, extra = '') => `<span class="mini-unit">${unitSVG(UNIT_TYPES[t].art, FACTIONS[p.faction].color, 30)}<b>${UNIT_TYPES[t].strength}</b>${extra}</span>`;
          return `<div class="reveal-row"><div>${playerTag(v, pid, 22)}</div><div class="reveal-units">${d.placed.map((x) => mini(x.type, `<span>${label(x.region)}</span>`)).join('')}${d.hand.map((t) => mini(t)).join('')}</div></div>`;
        }).join('');
        return shell(`Разведданные БПЛА, раунд ${rev.round}`, `<p class="muted">Только вы видите эти данные. Подписанные районом — уже выставлены.</p><div class="reveal-grid">${rows}</div>`, '');
      }
      default: return '';
    }
  }

  summaryBody(s) {
    const v = this.view;
    const rows = s.battles.filter((b) => b.outcome !== 'quiet' || b.defenders).map((b) => {
      const owner = ownerInfo(v, b.owner);
      const atk = Object.entries(b.attacks ?? {}).sort((a, z) => z[1] - a[1]).map(([pid, val]) => `<span class="chip">${emblemSVG(this.playerOf(pid).faction, { size: 18 })}<span class="num">${val}</span></span>`).join(' ');
      const res = b.outcome === 'captured' ? `${OUTCOME.captured}: ${esc(fname(this.playerOf(b.winner).faction))}`
        : b.outcome === 'held' ? `${b.owner ? 'Удержан' : 'Не взят'}: атака ${b.maxAttack} не больше защиты ${b.defenseTotal}`
          : b.outcome === 'tie' ? `Ничья атакующих (${b.maxAttack} = ${b.maxAttack}) — никто не захватил`
            : OUTCOME[b.outcome];
      return `<tr><td><b>${label(b.region)}</b></td><td>${owner.faction ? emblemSVG(owner.faction, { size: 18, npc: owner.npc }) : ''} ${esc(owner.name)}</td>
        <td class="num">${b.defenseTotal ?? '—'}</td><td><div class="chips">${atk || '—'}</div></td><td class="outcome outcome--${b.outcome}">${res}</td></tr>`;
    }).join('');
    const rewards = s.rewards.map((r) => `<li>${playerTag(v, r.player, 18)}: территория «${esc(TERRITORIES[r.territory].name)}» захвачена полностью, получена карта-награда.</li>`).join('');
    const grants = (s.grants ?? []).map((g) => `<li>${playerTag(v, g.player, 18)}: ${g.reason === 'stash' ? `тайник в ${label(g.region)} — ` : 'получен '}юнит «${esc(UNIT_TYPES[g.type].name)}».</li>`).join('');
    const cards = s.cardsPlayed.map((c) => `<li>«${esc(ALL_CARDS[c.card].name)}»: ${playerTag(v, c.player, 18)}</li>`).join('');
    return `${rows ? `<table class="battle-table"><thead><tr><th>Район</th><th>Владелец до боя</th><th>Защита</th><th>Атаки</th><th>Итог</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>В этом раунде никто не сражался.</p>'}
      ${cards ? `<h3 style="margin:14px 0 6px;font-size:14px">Сработавшие карты</h3><ul>${cards}</ul>` : ''}
      ${rewards || grants ? `<h3 style="margin:14px 0 6px;font-size:14px">Награды и юниты</h3><ul>${rewards}${grants}</ul>` : ''}
      <p class="muted" style="font-size:13px">Все юниты с карты вернулись в общий пул и будут перераспределены случайно.</p>`;
  }

  whyLocked(c) {
    const v = this.view;
    const card = ALL_CARDS[c.card];
    if (!this.myTurn()) return 'Сейчас не ваша очередь.';
    if (v.phase === 'turns' && c.operative) return 'Топ-оперативника можно сыграть только в подготовке раунда.';
    if (v.phase === 'prep' && !card.phases.includes('prep')) return 'Эта карта играется в свой ход, не в подготовке.';
    if (v.phase === 'turns' && !card.phases.includes('turn')) return 'Эта карта играется только в подготовке раунда.';
    if (v.phase === 'turns' && v.turn.placed > 0) return 'Карту нужно сыграть до выставления юнита.';
    if (v.phase === 'turns' && v.turn.cardsUsed >= v.rules.maxCardsPerTurn) return `За ход можно сыграть не больше ${v.rules.maxCardsPerTurn} карты.`;
    return 'Сейчас карту сыграть нельзя.';
  }

  curtainHTML() {
    const next = this.data.local.next;
    const p = next ? this.playerOf(next) : null;
    if (!p) return '';
    return `<div class="curtain"><div>${emblemSVG(p.faction, { size: 120 })}
      <h2>Передайте устройство: ${esc(fname(p.faction))}</h2>
      <p>${esc(p.name)}, нажмите, когда останетесь у экрана одни — откроются ваши юниты и карты.</p>
      <button class="btn btn--go" data-act="reveal" style="margin-top:16px">Я — ${esc(p.name)}, открыть</button></div></div>`;
  }

  // ------------------------------------------------ таймер
  tickTimer() {
    const el = this.root.querySelector('[data-timer]');
    if (!el || !this.view) return;
    const dl = this.view.deadline;
    if (!dl) { el.textContent = ''; return; }
    const left = Math.max(0, Math.ceil((dl - (Date.now() + (this.client.clockOffset ?? 0))) / 1000));
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    el.classList.toggle('low', left <= 15);
  }

  // ------------------------------------------------ ввод
  async send(cmd, after) {
    if (this.pending) return;
    this.pending = true;
    this.render();
    const r = await this.client.command(cmd);
    this.pending = false;
    if (!r.ok) {
      this.toast('', esc(r.error ?? 'Действие отклонено.'), 'error');
      this.render();
      return;
    }
    after?.();
    this.render();
  }

  cancel() {
    if (this.modal && this.modal.kind !== 'summary') { this.modal = null; this.render(); return; }
    this.ui.unit = null; this.ui.region = null; this.ui.card = null; this.ui.draft = {}; this.ui.redirectPick = null;
    this.render();
  }

  onClick(e) {
    const t = e.target;
    const act = t.closest('[data-act]')?.dataset.act;
    const v = this.view;
    if (act) return this.onAct(act, t.closest('[data-act]'));
    if (t.matches('[data-overlay]')) { if (this.modal?.kind !== 'final') { this.modal = null; this.render(); } return; }
    const pick = t.closest('[data-pick]');
    if (pick) { this.ui.draft[pick.dataset.pick] = pick.dataset.val; this.render(); return; }
    const cardEl = t.closest('[data-card-uid]');
    if (cardEl && v.me) {
      const uid = cardEl.dataset.cardUid;
      const op = v.me.operative?.uid === uid;
      const c = op ? { uid, card: v.me.operative.card, operative: true } : v.me.cards.find((x) => x.uid === uid);
      if (c) { this.modal = { kind: 'card', card: { ...c, operative: op } }; this.render(); }
      return;
    }
    const unitEl = t.closest('[data-unit]');
    if (unitEl && !unitEl.disabled) {
      const uid = unitEl.dataset.unit;
      this.ui.unit = this.ui.unit === uid ? null : uid;
      this.ui.region = null;
      this.render();
      return;
    }
    const markerEl = t.closest('[data-action]');
    if (markerEl && v.phase === 'redirect' && this.myTurn()) {
      const a = v.actions.find((x) => x.id === markerEl.dataset.action);
      if (a && a.player !== v.me.id) { this.ui.redirectPick = a.id; this.render(); return; }
    }
    const bridgeEl = t.closest('[data-bridge]');
    if (bridgeEl && this.ui.card && ALL_CARDS[this.ui.card.card].target === 'bridge') {
      if (!v.bridges[bridgeEl.dataset.bridge].destroyed) { this.ui.draft.bridge = bridgeEl.dataset.bridge; this.render(); }
      return;
    }
    const regEl = t.closest('[data-region]');
    if (regEl) this.onRegion(regEl.dataset.region);
  }

  onRegion(rid) {
    const v = this.view;
    if (this.ui.card) {
      const cand = this.cardCandidates();
      if (!cand.has(rid)) { this.toast('', 'Этот район не подходит для карты.', 'error'); return; }
      const c = ALL_CARDS[this.ui.card.card];
      const d = this.ui.draft;
      if (c.target === 'territory') d.territory = STATIC_REGIONS[rid].territory;
      else if (c.target === 'swap') { if (!d.own) d.own = rid; else d.enemy = rid; }
      else if (['transfer', 'twoAdjacentRegions', 'twoCapitals'].includes(c.target)) { d.regions = [...(d.regions ?? []), rid].slice(-2); }
      else d.region = rid;
      this.render();
      return;
    }
    if (v.phase === 'draft' && this.myTurn()) {
      if (!v.draft.options.includes(rid)) { this.toast('', `${label(rid)} уже занят — выберите белый район.`, 'error'); return; }
      this.ui.region = rid;
      this.render();
      return;
    }
    if (v.phase === 'redirect' && this.myTurn() && this.ui.redirectPick) {
      const action = this.ui.redirectPick;
      this.ui.redirectPick = null;
      this.send({ type: 'redirectMove', action, region: rid });
      return;
    }
    if (this.ui.unit) {
      const u = v.me.hand.find((x) => x.uid === this.ui.unit);
      if (!u?.legal.includes(rid)) { this.toast('', `Сюда нельзя: ${label(rid)} недоступен для этого юнита.`, 'error'); return; }
      this.ui.region = rid;
      this.render();
    }
  }

  onAct(act, el) {
    const v = this.view;
    switch (act) {
      case 'ready': return this.send({ type: 'ready' });
      case 'skip': return this.send({ type: 'skipTurn' });
      case 'ack': this.modal = null; return this.send({ type: 'ackSummary' });
      case 'summary': this.modal = { kind: 'summary' }; return this.render();
      case 'final': this.modal = { kind: 'final' }; return this.render();
      case 'uav': this.modal = { kind: 'uav' }; return this.render();
      case 'close-modal': this.modal = null; return this.render();
      case 'cancel': return this.cancel();
      case 'reveal': return this.client.reveal();
      case 'exit': return this.onExit?.();
      case 'calm':
        document.body.classList.toggle('calm');
        try { localStorage.setItem('labean:calm', document.body.classList.contains('calm') ? '1' : ''); } catch { /* */ }
        return this.render();
      case 'redirect-done': return this.send({ type: 'redirectDone' });
      case 'arm': {
        const c = this.modal.card;
        this.modal = null;
        this.ui.unit = null; this.ui.region = null;
        this.ui.card = { uid: c.uid, card: c.card };
        this.ui.draft = {};
        return this.render();
      }
      case 'confirm-card': {
        const { uid } = this.ui.card;
        const target = { ...this.ui.draft };
        return this.send({ type: 'playCard', card: uid, target }, () => { this.ui.card = null; this.ui.draft = {}; });
      }
      case 'confirm-draft': {
        const region = this.ui.region;
        return this.send({ type: 'draftPick', region }, () => { this.ui.region = null; });
      }
      case 'confirm-place': {
        const unit = this.ui.unit, region = this.ui.region;
        return this.send({ type: 'placeUnit', unit, region }, () => { this.ui.unit = null; this.ui.region = null; });
      }
      default: void v; void el;
    }
  }

  // перетаскивание отрядов в фазе «Авторитета»
  onPointerDown(e) {
    const v = this.view;
    if (!v || v.phase !== 'redirect' || !this.myTurn()) return;
    const m = e.target.closest('[data-action]');
    if (!m) return;
    const a = v.actions.find((x) => x.id === m.dataset.action);
    if (!a || a.player === v.me.id) return;
    e.preventDefault();
    const ghost = m.cloneNode(true);
    const svg = m.ownerSVGElement;
    ghost.setAttribute('opacity', '.8');
    ghost.style.pointerEvents = 'none';
    svg.appendChild(ghost);
    const pt = svg.createSVGPoint();
    const toSvg = (ev) => { pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    const start = toSvg(e);
    const move = (ev) => { const p = toSvg(ev); ghost.setAttribute('transform', `translate(${p.x - start.x} ${p.y - start.y})`); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      const p = toSvg(ev);
      if (Math.hypot(p.x - start.x, p.y - start.y) < 6) { this.ui.redirectPick = a.id; this.render(); return; }
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('[data-region]')).find(Boolean);
      if (under) this.send({ type: 'redirectMove', action: a.id, region: under.dataset.region });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // подсказка о районе
  onHover(e) {
    const reg = e.target.closest?.('[data-region]');
    const tip = this.root.querySelector('.tooltip');
    if (!tip) return;
    if (!reg) { tip.hidden = true; return; }
    const id = reg.dataset.region;
    if (this.tipFor !== id) {
      this.tipFor = id;
      tip.innerHTML = this.tipHTML(id);
    }
    const wrap = this.root.querySelector('.game').getBoundingClientRect();
    tip.hidden = false;
    const x = Math.min(e.clientX - wrap.left + 16, wrap.width - 260);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY - wrap.top + 16 + window.scrollY * 0}px`;
  }
  hideTip() { const t = this.root.querySelector('.tooltip'); if (t) t.hidden = true; }

  tipHTML(id) {
    const v = this.view;
    const s = STATIC_REGIONS[id];
    const r = v.regions[id];
    const own = ownerInfo(v, r.owner);
    const type = { normal: 'обычный район', capital: 'укрепрайон', neutral: `нейтральный район (${TERRITORIES[s.territory].name})` }[s.type];
    const base = v.rules.baseDefense[s.type];
    const lines = [s.homeFaction ? `${type}, исходно — ${fname(s.homeFaction)}` : type];
    if (r.destroyed) lines.push('уничтожен: связей нет, захватить нельзя');
    else {
      lines.push(`владелец: ${own.name}`);
      lines.push(`встроенная защита: ${base}; очки: ${v.rules.points[s.type]}`);
      lines.push(`${r.coastal ? 'граничит с морем' : 'без выхода к морю'}${s.wall ? ', граничит со стенкой' : ''}`);
      const br = Object.values(v.bridges).filter((b) => b.a === id || b.b === id);
      for (const b of br) lines.push(`мост ${b.id} → ${label(b.a === id ? b.b : b.a)}${b.destroyed ? ' (разрушен)' : ''}`);
      lines.push(`соседи: ${s.neighbors.map(label).join(', ')}`);
      if (r.inviolable) lines.push('неприкосновенен: нельзя атаковать и атаковать с него');
      if (r.shrine) lines.push('святыня: нельзя атаковать');
      if (r.pendingOwner) lines.push('восстанавливается — перейдёт к владельцу карты в конце раунда');
      for (const e of v.effects.filter((x) => x.data?.region === id || x.data?.regions?.includes(id))) lines.push(`эффект: «${ALL_CARDS[e.card].name}»`);
      const n = v.actions.filter((a) => a.region === id).length;
      if (n) lines.push(`отрядов на районе: ${n}`);
    }
    return `<b>${s.label}</b><div class="t-line">${lines.map(esc).join('<br>')}</div>`;
  }
}

export { WIDTH };
