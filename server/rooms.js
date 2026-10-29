// Комнаты, игроки, применение команд, таймеры и отключения.
// Сервер — доверенная сторона: игрок определяется по секретному токену, а не по полю в запросе.
import crypto from 'node:crypto';
import { createGame, applyCommand, activePlayer, GameError, MAP_VERSION } from '../shared/engine/game.js';
import { botStep, botToAct } from '../shared/engine/bot.js';

const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 900);
import { viewFor } from '../shared/engine/views.js';
import { FACTION_IDS, FACTIONS } from '../shared/config/factions.js';
import { DEFAULT_RULES } from '../shared/config/rules.js';

const SEATS = 5;
const CODE_ALPHABET = 'АБВГДЕЖИКЛМНПРСТУФХЦШЭЮЯ';

export class RoomError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export class RoomManager {
  constructor({ store, now = () => Date.now(), onChange = () => {} }) {
    this.store = store;
    this.now = now;
    this.onChange = onChange;
    this.rooms = new Map();
    this.presence = new Map(); // token -> { connections, lastSeen, disconnectedAt }
    for (const r of store?.loadAll() ?? []) {
      if (r.game && r.game.mapVersion !== MAP_VERSION) continue; // партии со старой карты не продолжаются
      this.rooms.set(r.code, r);
      // после перезапуска сервера считаем всех отключёнными с текущего момента
      for (const s of r.seats) this.presence.set(s.token, { connections: 0, disconnectedAt: this.now() });
    }
  }

  // ---------------- лобби
  createRoom({ name, settings = {} }) {
    let code;
    do code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    while (this.rooms.has(code));
    const room = {
      code, createdAt: this.now(), status: 'lobby',
      settings: sanitizeSettings(settings),
      seats: [], game: null,
    };
    this.rooms.set(code, room);
    const seat = this._addSeat(room, name, true);
    this._persist(room);
    return { code, token: seat.token, playerId: seat.playerId };
  }

  join(code, { name }) {
    const room = this._room(code);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Партия уже началась.');
    if (room.seats.length >= SEATS && !room.seats.some((x) => x.bot)) throw new RoomError('FULL', 'Все пять мест заняты.');
    if (room.seats.length >= SEATS) {
      // человек вытесняет последнего компьютера
      const i = room.seats.map((x) => !!x.bot).lastIndexOf(true);
      room.seats.splice(i, 1);
      room.seats.forEach((x, k) => { x.playerId = `p${k + 1}`; });
    }
    const seat = this._addSeat(room, name, false);
    this._persist(room);
    return { code, token: seat.token, playerId: seat.playerId };
  }

  fillTestSeats(code, token) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (!me.host) throw new RoomError('NOT_HOST', 'Только создатель комнаты может это сделать.', 403);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Партия уже началась.');
    const out = [];
    while (room.seats.length < SEATS) {
      const s = this._addSeat(room, `Тестовый игрок ${room.seats.length + 1}`, false);
      out.push({ playerId: s.playerId, name: s.name, token: s.token });
    }
    this._persist(room);
    return out;
  }

  /** Создатель комнаты занимает свободные места компьютерами. */
  fillBots(code, token) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (!me.host) throw new RoomError('NOT_HOST', 'Только создатель комнаты может добавить компьютер.', 403);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Партия уже началась.');
    let n = room.seats.filter((x) => x.bot).length;
    while (room.seats.length < SEATS) {
      const seat = this._addSeat(room, `Компьютер ${++n}`, false);
      seat.bot = true;
    }
    this._persist(room);
  }

  removeBots(code, token) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (!me.host) throw new RoomError('NOT_HOST', 'Только создатель комнаты может убрать компьютер.', 403);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Партия уже началась.');
    room.seats = room.seats.filter((x) => !x.bot);
    room.seats.forEach((x, i) => { x.playerId = `p${i + 1}`; });
    this._persist(room);
  }

  chooseFaction(code, token, faction) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Фракцию можно выбрать только до начала партии.');
    if (faction !== null && !FACTIONS[faction]) throw new RoomError('BAD_FACTION', 'Неизвестная фракция.');
    if (faction && room.seats.some((s) => s !== me && s.faction === faction)) throw new RoomError('TAKEN', 'Эту фракцию уже выбрали.');
    me.faction = faction;
    this._persist(room);
  }

  updateSettings(code, token, settings) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (!me.host) throw new RoomError('NOT_HOST', 'Только создатель комнаты меняет настройки.', 403);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Партия уже началась.');
    room.settings = sanitizeSettings({ ...room.settings, ...settings });
    this._persist(room);
  }

  start(code, token) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (!me.host) throw new RoomError('NOT_HOST', 'Начать партию может только создатель комнаты.', 403);
    if (room.status !== 'lobby') throw new RoomError('STARTED', 'Партия уже началась.');
    if (room.seats.length !== SEATS) throw new RoomError('NOT_FULL', `Нужно ${SEATS} игроков, сейчас ${room.seats.length}.`);
    // Свободные фракции раздаются случайно тем, кто не выбрал.
    const free = FACTION_IDS.filter((f) => !room.seats.some((s) => s.faction === f));
    for (const s of room.seats) if (!s.faction) s.faction = free.splice(crypto.randomInt(free.length), 1)[0];
    room.game = createGame({
      id: room.code,
      seed: `${room.code}:${crypto.randomBytes(8).toString('hex')}`,
      players: room.seats.map((s) => ({ id: s.playerId, name: s.name, faction: s.faction, bot: !!s.bot })),
      rules: room.settings.rules,
      now: this.now(),
    });
    room.status = 'playing';
    this._persist(room);
  }

  // ---------------- партия
  command(code, token, command) {
    const room = this._room(code);
    const me = this._seat(room, token);
    if (room.status !== 'playing' && room.status !== 'finished') throw new RoomError('NOT_STARTED', 'Партия ещё не началась.');
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') throw new RoomError('BAD_COMMAND', 'Некорректная команда.');
    if (command.type === 'timeout') throw new RoomError('FORBIDDEN', 'Эта команда доступна только серверу.', 403);
    const cmd = { ...command, player: me.playerId, now: this.now(), id: command.id ? `${me.playerId}:${String(command.id).slice(0, 64)}` : undefined };
    this._touch(token);
    try {
      const { state, duplicate } = applyCommand(room.game, cmd);
      if (!duplicate) {
        room.game = state;
        if (state.phase === 'finished') room.status = 'finished';
        this._persist(room);
      }
      return { ok: true, duplicate: !!duplicate };
    } catch (e) {
      if (e instanceof GameError) throw new RoomError(e.code, e.message);
      throw e;
    }
  }

  /** Проверка таймеров и отключений. Вызывается сервером периодически. */
  tick() {
    const now = this.now();
    const grace = (r) => (r.game.rules.reconnectGraceSeconds ?? DEFAULT_RULES.reconnectGraceSeconds) * 1000;
    for (const room of this.rooms.values()) {
      if (room.status !== 'playing' || !room.game) continue;
      const g = room.game;
      let reason = null;
      if (g.deadline && now >= g.deadline) reason = 'timeout';
      // ходы компьютера — с небольшой паузой, чтобы люди видели, что происходит
      const botPid = botToAct(g);
      if (botPid) {
        const since = g.phase === 'summary' ? 0 : (g._activeSince ?? 0);
        if (now - since >= BOT_DELAY_MS) {
          const next = botStep(g, botPid, { now });
          if (next !== g) {
            room.game = next;
            if (next.phase === 'finished') room.status = 'finished';
            this._persist(room);
          }
        }
        continue;
      }
      const active = activePlayer(g);
      if (!reason && active && ['draft', 'prep', 'turns', 'redirect'].includes(g.phase)) {
        const seat = room.seats.find((s) => s.playerId === active);
        const pr = this.presence.get(seat.token);
        if (pr && pr.connections === 0 && pr.disconnectedAt && now - pr.disconnectedAt >= grace(room)) {
          // ход отключившегося пропускается, но только после того как он стал активным и прошла пауза
          const since = Math.max(pr.disconnectedAt, g._activeSince ?? 0);
          if (now - since >= grace(room)) reason = 'disconnect';
        }
      }
      if (!reason && g.phase === 'summary') {
        // Отключившиеся дольше паузы автоматически подтверждают сводку.
        for (const s of room.seats) {
          if (g.summaryAcks[s.playerId]) continue;
          const pr = this.presence.get(s.token);
          if (pr && pr.connections === 0 && pr.disconnectedAt && now - pr.disconnectedAt >= grace(room)) {
            this._apply(room, { type: 'ackSummary', player: s.playerId, now });
            if (room.game.phase !== 'summary') break;
          }
        }
        continue;
      }
      if (reason) this._apply(room, { type: 'timeout', reason, expectVersion: g.version, now });
    }
  }

  _apply(room, cmd) {
    try {
      const { state } = applyCommand(room.game, cmd);
      room.game = state;
      if (state.phase === 'finished') room.status = 'finished';
      this._persist(room);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  }

  // ---------------- представления
  view(code, token) {
    const room = this._room(code);
    const me = this._seat(room, token);
    const lobby = {
      code: room.code, status: room.status, settings: room.settings,
      me: { playerId: me.playerId, host: !!me.host, name: me.name },
      seats: room.seats.map((s) => ({
        playerId: s.playerId, name: s.name, faction: s.faction, host: !!s.host,
        online: s.bot ? true : (this.presence.get(s.token)?.connections ?? 0) > 0, bot: !!s.bot,
      })),
      serverNow: this.now(),
    };
    if (!room.game) return { lobby, game: null };
    return { lobby, game: viewFor(room.game, me.playerId) };
  }

  version(code) {
    const r = this.rooms.get(code);
    return r ? `${r.status}:${r.game?.version ?? 0}:${r.seats.length}:${r._rev ?? 0}` : null;
  }

  // ---------------- присутствие (SSE-подключения)
  connect(code, token) {
    const room = this._room(code);
    this._seat(room, token);
    const pr = this.presence.get(token) ?? { connections: 0 };
    pr.connections += 1;
    pr.disconnectedAt = null;
    this.presence.set(token, pr);
    room._rev = (room._rev ?? 0) + 1;
    this.onChange(room.code);
  }

  disconnect(code, token) {
    const pr = this.presence.get(token);
    if (!pr) return;
    pr.connections = Math.max(0, pr.connections - 1);
    if (pr.connections === 0) pr.disconnectedAt = this.now();
    const room = this.rooms.get(code);
    if (room) { room._rev = (room._rev ?? 0) + 1; this.onChange(room.code); }
  }

  _touch(token) {
    const pr = this.presence.get(token);
    if (pr && pr.connections === 0) pr.disconnectedAt = this.now();
  }

  // ---------------- служебное
  _room(code) {
    const room = this.rooms.get(String(code ?? '').toUpperCase());
    if (!room) throw new RoomError('NO_ROOM', 'Комната не найдена.', 404);
    return room;
  }
  _seat(room, token) {
    const s = room.seats.find((x) => x.token === token);
    if (!s) throw new RoomError('BAD_TOKEN', 'Вы не участник этой комнаты.', 403);
    return s;
  }
  _addSeat(room, name, host) {
    const clean = String(name ?? '').trim().slice(0, 24) || `Игрок ${room.seats.length + 1}`;
    const seat = { playerId: `p${room.seats.length + 1}`, name: clean, faction: null, token: crypto.randomBytes(18).toString('hex'), host };
    room.seats.push(seat);
    this.presence.set(seat.token, { connections: 0, disconnectedAt: this.now() });
    return seat;
  }
  _persist(room) {
    if (room.game) {
      // запоминаем момент, когда текущий игрок стал активным (для паузы на переподключение)
      const key = `${room.game.phase}:${activePlayer(room.game)}:${room.game.round}`;
      if (room.game._activeKey !== key) { room.game._activeKey = key; room.game._activeSince = this.now(); }
    }
    this.store?.save(stripTransient(room));
    this.onChange(room.code);
  }
}

function stripTransient(room) {
  const { _rev, ...rest } = room;
  return rest;
}

function sanitizeSettings(s) {
  const num = (v, d, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : d;
  };
  const rules = s.rules ?? {};
  return {
    rules: {
      prepOrder: rules.prepOrder === 'random' ? 'random' : 'clockwise',
      turnSeconds: num(rules.turnSeconds, DEFAULT_RULES.turnSeconds, 0, 600),
      prepSeconds: num(rules.prepSeconds, DEFAULT_RULES.prepSeconds, 0, 600),
      draftSeconds: num(rules.draftSeconds, DEFAULT_RULES.draftSeconds, 0, 600),
      redirectSeconds: num(rules.redirectSeconds, DEFAULT_RULES.redirectSeconds, 0, 600),
      reconnectGraceSeconds: num(rules.reconnectGraceSeconds, DEFAULT_RULES.reconnectGraceSeconds, 5, 600),
      distribution: rules.distribution === 'random' ? 'random' : 'equal',
      captureUnitReward: {
        ...DEFAULT_RULES.captureUnitReward,
        enabled: !!rules.captureUnitReward?.enabled,
      },
    },
  };
}
