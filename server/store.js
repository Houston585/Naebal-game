// Хранилище комнат: один JSON-файл на комнату, атомарная запись (временный файл + rename).
// Сбой посреди записи не оставляет повреждённого файла: остаётся предыдущая версия.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }
  file(code) { return path.join(this.dir, `${code}.json`); }
  save(room) {
    const f = this.file(room.code);
    const tmp = `${f}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(room));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, f);
  }
  loadAll() {
    const rooms = [];
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try { rooms.push(JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'))); }
      catch (e) { console.error(`Не удалось прочитать ${name}:`, e.message); }
    }
    return rooms;
  }
}
