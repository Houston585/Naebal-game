// Заставка и лобби.
import { FACTIONS, FACTION_IDS } from '../../../shared/config/factions.js';
import { renderPreviewMap } from './map.js';
import { emblemSVG } from '../art/emblems.js';
import { esc } from './util.js';

function previewMap() {
  return renderPreviewMap();
}

export function homeHTML({ localOnly, savedLocal, error }) {
  const factions = FACTION_IDS.map((f) => `<span title="${FACTIONS[f].name}">${emblemSVG(f, { size: 30 })}</span>`).join('');
  const seatRow = (i) => `<div class="seat-row">
      <input name="p${i}" placeholder="${i === 1 ? 'Ваше имя' : `Игрок ${i}`}" maxlength="24" aria-label="Имя игрока ${i}">
      ${i === 1 ? '<span class="seat-row__you">вы</span>' : `<label class="seat-row__bot"><input type="checkbox" name="bot${i}" checked> компьютер</label>`}
    </div>`;
  const localBlock = `
    <form class="field" data-form="local" style="gap:10px">
      <h2>Игра на этом устройстве</h2>
      <p class="muted" style="margin:0">Играйте против компьютера или с друзьями за одним экраном. Снимите галочку «компьютер», и место займёт человек — между ходами людей экран закрывается шторкой.</p>
      ${[1, 2, 3, 4, 5].map(seatRow).join('')}
      <div class="row"><button class="btn btn--go" type="submit">Начать партию</button>${savedLocal ? '<button class="btn" type="button" data-act="resume-local">Продолжить сохранённую</button>' : ''}</div>
    </form>`;
  return `<div class="screen-home">
    <section class="home-hero">
      <h1 class="home-title"><span>пошаговая стратегия на пятерых</span>Острова Лабеан</h1>
      <div class="home-hero__map" aria-hidden="true">${previewMap()}</div>
      <div>
        <p class="home-lede">Два архипелага, тридцать шесть районов, семь фракций и пять раундов. Сначала каждый закрепляет укрепрайон и выбирает ещё три района, потом армии скрыто воюют, а бои считаются одновременно в конце раунда.</p>
        <div class="row" style="position:relative;gap:6px">${factions}</div>
      </div>
    </section>
    <section class="home-panel">
      ${error ? `<p style="color:#B4442A;font-weight:600;margin:0">${esc(error)}</p>` : ''}
      ${localOnly ? localBlock : `
      <form class="field" data-form="create" style="gap:10px">
        <h2>Новая партия по сети</h2>
        <label for="cname">Ваше имя</label>
        <input id="cname" name="name" maxlength="24" placeholder="Например, Ден" required>
        <div><button class="btn btn--go" type="submit">Создать комнату</button></div>
      </form>
      <div class="divider"></div>
      <form class="field" data-form="join" style="gap:10px">
        <h2>Войти в комнату</h2>
        <div class="row"><input name="code" maxlength="4" placeholder="Код" aria-label="Код комнаты" required style="width:110px;text-transform:uppercase;height:44px;padding:0 10px;border:2px solid #1C1B19;border-radius:3px;background:#F6F1E6;color:#1C1B19">
        <input name="name" maxlength="24" placeholder="Ваше имя" aria-label="Ваше имя" required style="flex:1;height:44px;padding:0 10px;border:2px solid #1C1B19;border-radius:3px;background:#F6F1E6;color:#1C1B19"></div>
        <div><button class="btn" type="submit">Войти</button></div>
      </form>
      <div class="divider"></div>
      ${localBlock}`}
    </section>
  </div>`;
}

export function lobbyHTML(data, extra = {}) {
  const { lobby } = data;
  const me = lobby.seats.find((s) => s.playerId === lobby.me.playerId);
  const taken = new Set(lobby.seats.map((s) => s.faction).filter(Boolean));
  const seats = Array.from({ length: 5 }, (_, i) => {
    const s = lobby.seats[i];
    if (!s) return `<div class="seat"><span></span><span class="muted">Свободное место</span><span></span></div>`;
    return `<div class="seat">${s.faction ? emblemSVG(s.faction, { size: 36 }) : '<span style="width:36px;height:36px;border-radius:50%;border:2px dashed #8E8A80;display:inline-block"></span>'}
      <div><b>${esc(s.name)}</b>${s.host ? ' <span class="muted">(создатель)</span>' : ''}${s.bot ? ' <span class="muted">(компьютер — уступит место, если войдёт человек)</span>' : ''}<div class="muted" style="font-size:13px"><span class="seat__dot ${s.online ? 'on' : ''}"></span>${s.faction ? esc(FACTIONS[s.faction].name) : 'фракция будет выбрана случайно'}</div></div>
      <span>${s.playerId === lobby.me.playerId ? 'вы' : ''}</span></div>`;
  }).join('');
  const picker = FACTION_IDS.map((f) => `<button class="faction-opt" data-faction="${f}" aria-pressed="${me.faction === f}" ${taken.has(f) && me.faction !== f ? 'disabled' : ''}>${emblemSVG(f, { size: 30 })}<span>${FACTIONS[f].name}</span></button>`).join('');
  const r = lobby.settings.rules;
  const host = lobby.me.host;
  const settings = `
    <div class="field"><label>Таймер хода, секунд (0 — без таймера)</label><input type="number" min="0" max="600" data-setting="turnSeconds" value="${r.turnSeconds}" ${host ? '' : 'disabled'}></div>
    <div class="field"><label>Таймер подготовки, секунд</label><input type="number" min="0" max="600" data-setting="prepSeconds" value="${r.prepSeconds}" ${host ? '' : 'disabled'}></div>
    <div class="field"><label>Пауза на переподключение, секунд</label><input type="number" min="5" max="600" data-setting="reconnectGraceSeconds" value="${r.reconnectGraceSeconds}" ${host ? '' : 'disabled'}></div>
    <div class="field"><label>Порядок подготовки</label><select data-setting="prepOrder" ${host ? '' : 'disabled'}><option value="clockwise" ${r.prepOrder === 'clockwise' ? 'selected' : ''}>по часовой стрелке</option><option value="random" ${r.prepOrder === 'random' ? 'selected' : ''}>случайный каждый раунд</option></select></div>
    <div class="field"><label>Раздача юнитов</label><select data-setting="distribution" ${host ? '' : 'disabled'}><option value="equal" ${r.distribution === 'equal' ? 'selected' : ''}>поровну, случайно</option><option value="random" ${r.distribution === 'random' ? 'selected' : ''}>полностью случайно (может быть неравно)</option></select></div>`;
  const links = extra.testLinks?.length ? `<div class="links"><b>Ссылки тестовых игроков — откройте каждую в отдельной вкладке:</b>${extra.testLinks.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${esc(l.name)}: ${esc(l.url)}</a>`).join('')}</div>` : '';
  return `<div class="screen-lobby">
    <div class="lobby-head">
      <div><p class="muted" style="margin:0 0 4px">Код комнаты — продиктуйте его остальным</p><div class="room-code">${esc(lobby.code)}</div></div>
      <div class="row">
        ${host && lobby.seats.length < 5 ? '<button class="btn" data-act="bots">Добавить компьютеров</button><button class="btn btn--quiet" data-act="test-seats">Тестовые игроки</button>' : ''}
        ${host && lobby.seats.some((x) => x.bot) ? '<button class="btn btn--quiet" data-act="bots-remove">Убрать компьютеров</button>' : ''}
        ${host ? `<button class="btn btn--go" data-act="start" ${lobby.seats.length === 5 ? '' : 'disabled'}>Начать партию (${lobby.seats.length}/5)</button>` : '<span class="muted">Партию начнёт создатель комнаты.</span>'}
      </div>
    </div>
    <div class="lobby-grid">
      <div class="sheet"><h3>Игроки</h3>${seats}${links ? `<div class="divider" style="margin:12px 0"></div>${links}` : ''}</div>
      <div class="sheet"><h3>Ваша фракция</h3><div class="faction-pick">${picker}</div>
        <p class="muted" style="font-size:13px">Две фракции, которые никто не выберет, в партии не участвуют: их районы, включая укрепрайоны, с начала ничейные.</p>
        <div class="divider" style="margin:14px 0"></div><h3>Настройки${host ? '' : ' (меняет создатель)'}</h3><div style="display:grid;gap:10px">${settings}</div>
      </div>
    </div>
  </div>`;
}
