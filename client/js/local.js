// Режим «за одним экраном»: движок работает прямо в браузере, игроки передают устройство.
// Скрытая информация защищается шторкой между ходами — это режим для живой встречи и для проверки правил.
// Для честной игры по сети используется сервер (ServerClient).
import { createGame, applyCommand, activePlayer, MAP_VERSION } from '../../shared/engine/game.js';
import { viewFor } from '../../shared/engine/views.js';
import { botStep, botToAct } from '../../shared/engine/bot.js';

const KEY = 'labean:local-game';

export class LocalClient {
  constructor() {
    this.listeners = new Set();
    this.state = null;
    this.viewer = null;
    this.clockOffset = 0;
    try { const raw = localStorage.getItem(KEY); if (raw) this.state = JSON.parse(raw); } catch { this.state = null; }
    if (this.state && this.state.mapVersion !== MAP_VERSION) this.state = null; // партия со старой карты
  }
  get local() { return true; }
  onUpdate(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus() {}
  hasSaved() { return !!this.state && this.state.phase !== 'finished'; }

  newGame(players, rules = {}) {
    this.state = createGame({
      id: 'local', seed: `local-${Date.now()}-${Math.random()}`, players,
      rules: { prepSeconds: 0, turnSeconds: 0, redirectSeconds: 0, draftSeconds: 0, ...rules },
    });
    this.viewer = null;
    this.save();
    this.push();
  }
  reset() { clearTimeout(this.botTimer); this.state = null; try { localStorage.removeItem(KEY); } catch { /* */ } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* квота */ } }

  connect() { this.push(); }
  close() { clearTimeout(this.botTimer); }

  humans() { return this.state ? this.state.order.filter((p) => !this.state.players[p].bot) : []; }

  /** Игрок за экраном подтвердил, что он — тот, чей ход. */
  reveal() { this.viewer = this.wantViewer(); this.push(); }
  wantViewer() {
    if (!this.state) return null;
    if (this.state.phase === 'summary' || this.state.phase === 'finished') return null;
    const a = activePlayer(this.state);
    return a && !this.state.players[a].bot ? a : null;
  }

  push() {
    if (!this.state) return;
    const humans = this.humans();
    let curtain = false, viewAs = null;
    const want = this.wantViewer();
    if (humans.length === 1) {
      // один человек против компьютера: шторка не нужна, он всегда смотрит своими глазами
      viewAs = humans[0];
    } else if (this.state.phase !== 'draft') {
      // несколько людей: шторка перед ходом каждого человека; во время ходов компьютера — общий вид
      curtain = want !== null && want !== this.viewer;
      viewAs = curtain ? null : want;
    }
    const game = viewFor(this.state, viewAs ?? '__public__');
    const lobby = {
      code: 'ЭКРАН', status: this.state.phase === 'finished' ? 'finished' : 'playing',
      me: { playerId: viewAs, host: true },
      seats: this.state.order.map((p) => ({ playerId: p, name: this.state.players[p].name, faction: this.state.players[p].faction, online: true, bot: !!this.state.players[p].bot })),
      serverNow: Date.now(),
    };
    const data = { lobby, game, local: { curtain, next: want, humans: humans.length } };
    for (const fn of this.listeners) fn(data);
    this.scheduleBot();
  }

  /** Если ходит компьютер — делаем его ход с небольшой паузой. */
  scheduleBot() {
    clearTimeout(this.botTimer);
    if (!this.state || this.state.phase === 'finished') return;
    if (this.state.phase === 'summary') return; // сводку закрывает человек — за всех
    const pid = botToAct(this.state);
    if (!pid) return;
    const delay = this.state.phase === 'draft' ? 450 : this.state.phase === 'prep' ? 350 : 650;
    this.botTimer = setTimeout(() => {
      this.state = botStep(this.state, pid);
      this.save();
      this.push();
    }, delay);
  }

  async command(cmd) {
    try {
      if (cmd.type === 'ackSummary') {
        for (const p of this.state.order) {
          if (this.state.phase !== 'summary') break;
          this.state = applyCommand(this.state, { type: 'ackSummary', player: p }).state;
        }
      } else {
        const player = activePlayer(this.state);
        if (this.state.players[player]?.bot) return { ok: false, error: 'Сейчас ходит компьютер.' };
        this.state = applyCommand(this.state, { ...cmd, player, id: undefined }).state;
      }
      this.save();
      this.push();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    }
  }
}
