// Числовые параметры и переключатели правил.
// УТВ — утверждено владельцем. ВРЕМ — временное решение, ждёт утверждения (docs/OPEN_QUESTIONS.md).
export const DEFAULT_RULES = {
  players: 5,                    // УТВ
  rounds: 5,                     // УТВ
  unitsPerTurn: 1,               // УТВ: за один ход выставляется один юнит
  turnsPerPlayerPerRound: 5,     // УТВ: в каждом раунде у игрока 5 ходов (по кругу)
  draftPicks: 3,                 // УТВ (ТЗ карты, 11): после укрепрайона каждый выбирает ещё 3 района
  maxCardsPerTurn: 1,            // ВРЕМ (В-1): сколько карт можно сыграть за ход
  maxCardsPerPrep: 99,           // ВРЕМ (В-1): ограничения на подготовку нет

  baseDefense: { normal: 1, neutral: 2, capital: 2 }, // УТВ (ТЗ 4.7)
  points: { normal: 1, capital: 2, neutral: 0, destroyed: 0 }, // УТВ (ответ владельца)

  // Раздача юнитов
  initialDeal: 'standardSet',    // ВРЕМ (В-2): раунд 1 — у каждого стандартная армия из 10; 'shuffled' — сразу случайно
  distribution: 'equal',         // ВРЕМ (В-2): 'equal' — поровну по кругу после перемешивания; 'random' — каждый юнит случайному игроку
  extrasStartInReserve: true,    // ВРЕМ (В-2): доп. юниты лежат в резерве и попадают в раздачу, когда их кто-то получил
  bonusUnitBeforeRound: 4,       // УТВ (ТЗ 3.1): в подготовке к 4-му раунду каждый получает 1 доп. юнит
  captureUnitReward: { enabled: false, chance: 0.25, regionTypes: ['capital'] }, // старая вероятностная механика, заменена тайниками
  stash: { enabled: true, count: 'rest', excludeCapitals: true }, // УТВ 29.10: оставшиеся доп. юниты спрятаны в случайных районах (кроме укрепрайонов игроков); первый захвативший район забирает юнит

  // География
  navalAttackFromSea: true,      // ВРЕМ (В-3): морской юнит атакует любой район с водной границей без сухопутного соседства
  requireAdjacencyForLand: true, // УТВ по смыслу ТЗ 4.3: атака сухопутным юнитом — с соседнего своего района или по мосту

  // Порядок
  prepOrder: 'clockwise',        // ВРЕМ: 'clockwise' | 'random' (ТЗ 3.1 требует настраиваемости)
  turnOrder: 'rotate',           // ВРЕМ: 'fixed' — всегда с первого места; 'rotate' — первый ходящий сдвигается каждый раунд

  // Таймеры (секунды). 0 — без таймера.
  draftSeconds: 45,              // ВРЕМ: время на выбор района; по истечении район назначается случайно
  prepSeconds: 90,
  turnSeconds: 60,
  redirectSeconds: 120,
  reconnectGraceSeconds: 45,
  summarySeconds: 0,             // 0 — сводку закрывает каждый игрок сам (или хост)

  // Карты
  allowOwnTerritoryCarpet: true, // ВРЕМ (В-7)
  hurricaneChooser: 'player',    // ВРЕМ (В-6): районы выбирает сыгравший карту
  seizeAllowed: { neutral: true, protected: true }, // ВРЕМ (В-5)
};
