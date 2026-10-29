// Типы юнитов. naval = морской (атакует/защищает только районы с водной границей).
export const UNIT_TYPES = {
  infantry1:  { id: 'infantry1',  name: 'Пехота',               strength: 1, naval: false, category: 'classic', art: 'infantry' },
  infantry3:  { id: 'infantry3',  name: 'Пехота',               strength: 3, naval: false, category: 'classic', art: 'infantry_heavy' },
  apc2:       { id: 'apc2',       name: 'Броневик',             strength: 2, naval: false, category: 'classic', art: 'apc' },
  apc4:       { id: 'apc4',       name: 'Броневик',             strength: 4, naval: false, category: 'classic', art: 'apc_heavy' },
  tank:       { id: 'tank',       name: 'Танк',                 strength: 5, naval: false, category: 'classic', art: 'tank' },
  boat:       { id: 'boat',       name: 'Лодка',                strength: 1, naval: true,  category: 'classic', art: 'boat' },
  gunboat:    { id: 'gunboat',    name: 'Лодка с пулемётом',    strength: 2, naval: true,  category: 'classic', art: 'gunboat' },
  seals:      { id: 'seals',      name: 'Морские котики',       strength: 3, naval: true,  category: 'classic', art: 'seals' },
  rearAgent:  { id: 'rearAgent',  name: 'Агент тыла',           strength: 2, naval: false, category: 'extra',   art: 'rear_agent' },
  decoy:      { id: 'decoy',      name: 'Разбитый отряд',       strength: 0, naval: false, category: 'extra',   art: 'decoy' },
  gunner:     { id: 'gunner',     name: 'Пулемётчик',           strength: 5, naval: false, category: 'extra',   art: 'gunner' },
  purple:     { id: 'purple',     name: 'Отряд Пурпурных Берет', strength: 4, naval: false, category: 'extra',  art: 'purple_berets' },
  submarine:  { id: 'submarine',  name: 'Подводная лодка',      strength: 5, naval: true,  category: 'extra',   art: 'submarine' },
  commando:   { id: 'commando',   name: 'Командос',             strength: 6, naval: false, category: 'extra',   art: 'commando' },
};

// Стартовая армия каждого игрока (ТЗ 6.1) — 10 юнитов.
export const STARTING_ARMY = [
  ['infantry1', 2], ['infantry3', 1], ['apc2', 2], ['apc4', 1], ['tank', 1],
  ['boat', 1], ['gunboat', 1], ['seals', 1],
];

// Общий пул дополнительных юнитов (ТЗ 6.2) — 18 юнитов.
export const EXTRA_POOL = [
  ['rearAgent', 3], ['decoy', 5], ['gunner', 3], ['purple', 2], ['submarine', 2], ['commando', 3],
];

// Подводная лодка — морской юнит: в ТЗ особых способностей нет, морской признак следует из природы юнита.
// Если это неверно — поменяйте naval: false (docs/OPEN_QUESTIONS.md, В-12).
