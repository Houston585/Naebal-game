// Все карты игры. Логика каждой карты — обработчик в shared/engine/effects.js с тем же `effect`.
// phases: когда карту можно сыграть: 'prep' — подготовка раунда, 'turn' — свой ход.
// target: схема цели (проверяется движком). public: факт розыгрыша виден всем.
// provisional: перечень временных трактовок, не утверждённых владельцем (см. docs/OPEN_QUESTIONS.md).

export const OPERATIVES = {
  den_olches: {
    id: 'den_olches', category: 'operative', name: 'Душнила и Решала', who: 'Ден и Ольчес',
    phases: ['prep'], target: 'ownRegion', effect: 'defenseBonus', params: { bonus: 10 },
    text: 'Выбранный собственный район получает +10 к защите на этот раунд.', public: true,
  },
  lysy: {
    id: 'lysy', category: 'operative', name: 'Озеро в лесу', who: 'Лысый',
    phases: ['prep'], target: 'anyPlayer', effect: 'navalOnly',
    text: 'Выбранный игрок в этом раунде воюет только морскими юнитами.', public: true,
  },
  sery: {
    id: 'sery', category: 'operative', name: 'ЗаМир', who: 'Серый',
    phases: ['prep'], target: 'notOwnRegion', effect: 'freezeRegion',
    text: 'Чужой район нельзя атаковать или защищать до конца раунда.', public: true,
  },
  shlots: {
    id: 'shlots', category: 'operative', name: 'Авторитет', who: 'Шльоц',
    phases: ['prep'], target: 'none', effect: 'redirect', params: { maxUnits: 6 },
    text: 'В конце раунда перенаправьте до 6 юнитов противников, перетаскивая их по карте.', public: true,
    provisional: ['В-4'],
  },
  fedos_dron: {
    id: 'fedos_dron', category: 'operative', name: 'В лес и в лес', who: 'Федос и Дрон',
    phases: ['prep'], target: 'region', effect: 'secretAttackBonus', params: { options: [5, 10] },
    text: 'Ваша атака на выбранный район получает тайный бонус +5 или +10.', public: true,
  },
  sencha_vovan: {
    id: 'sencha_vovan', category: 'operative', name: 'Амбициозы', who: 'Сенча и Вован',
    phases: ['prep'], target: 'notOwnRegion', effect: 'seizeRegion',
    text: 'Получите контроль над выбранным районом немедленно.', public: true,
    provisional: ['В-5'],
  },
  platon_nazar: {
    id: 'platon_nazar', category: 'operative', name: 'Восстановление', who: 'Платон и Назар',
    phases: ['prep'], target: 'destroyedRegion', effect: 'restoreRegion',
    text: 'Восстановите уничтоженный район. В конце раунда он станет вашим.', public: true,
  },
  natalya: {
    id: 'natalya', category: 'operative', name: 'Морская Пехота', who: 'Наталья и Илюша',
    phases: ['prep'], target: 'coastalRegion', effect: 'attackBonus', params: { bonus: 7 },
    text: 'Ваша атака на выбранный район с водной границей получает +7.', public: true,
  },
  ulya: {
    id: 'ulya', category: 'operative', name: 'Креативная', who: 'Уля',
    phases: ['prep'], target: 'opponent', effect: 'unitLimit', params: { limit: 3 },
    text: 'Выбранный противник в этом раунде может задействовать не более 3 юнитов.', public: true,
  },
  sanya: {
    id: 'sanya', category: 'operative', name: 'Госушница', who: 'Саня',
    phases: ['prep'], target: 'transfer', effect: 'transferRegions', params: { count: 2 },
    text: 'Заберите два района у одного игрока и передайте другому. Себе — нельзя.', public: true,
  },
};

export const REWARD_CARDS = {
  uav: {
    id: 'uav', category: 'reward', name: 'БПЛА',
    phases: ['turn'], target: 'none', effect: 'revealArmies',
    text: 'Посмотрите полный состав сил всех соперников. Видите только вы.', public: true,
  },
  nuke: {
    id: 'nuke', category: 'reward', name: 'Атомная бомбардировка',
    phases: ['turn'], target: 'liveRegion', effect: 'destroyRegion',
    text: 'Уничтожьте район вместе с юнитами на нём. Район становится чёрным и теряет все связи.', public: true,
  },
  air_support: {
    id: 'air_support', category: 'reward', name: 'Поддержка с воздуха',
    phases: ['prep', 'turn'], target: 'none', effect: 'defendersBonus', params: { bonus: 1 },
    text: 'Все юниты, выставленные на защиту в этом раунде, получают +1.', public: true,
    provisional: ['В-9'],
  },
  inviolable: {
    id: 'inviolable', category: 'reward', name: 'Неприкосновенность',
    phases: ['prep', 'turn'], target: 'ownRegion', effect: 'inviolable',
    text: 'Собственный район навсегда нельзя атаковать. С него нельзя атаковать.', public: true,
  },
  shrine: {
    id: 'shrine', category: 'reward', name: 'Святыня',
    phases: ['prep', 'turn'], target: 'ownRegion', effect: 'shrine',
    text: 'Район навсегда нельзя атаковать, но с него можно атаковать.', public: true,
    provisional: ['В-10'],
  },
  water_defense: {
    id: 'water_defense', category: 'reward', name: 'Водная защита',
    phases: ['prep', 'turn'], target: 'liveRegion', effect: 'makeCoastal',
    text: 'Район навсегда получает водные границы: морские юниты могут атаковать и защищать его.', public: true,
  },
  hurricane: {
    id: 'hurricane', category: 'reward', name: 'Ураган',
    phases: ['turn'], target: 'twoAdjacentRegions', effect: 'sweep',
    text: 'Сметите все выставленные юниты с двух соседних районов в общий сброс.', public: true,
    provisional: ['В-6'],
  },
};

export const NEUTRAL_CARDS = {
  carpet: {
    id: 'carpet', category: 'neutral', site: 'military_base', name: 'Ковровка',
    phases: ['turn'], target: 'territory', effect: 'neutralizeTerritory', consumesTurnUnit: true,
    text: 'Вся выбранная территория становится ничейной. В этот ход вы не выставляете юнит.', public: true,
    provisional: ['В-7'],
  },
  bridge_blast: {
    id: 'bridge_blast', category: 'neutral', site: 'military_base', name: 'Подрыв моста',
    phases: ['turn'], target: 'bridge', effect: 'destroyBridge',
    text: 'Уничтожьте один мост. Связь между районами исчезает.', public: true,
  },
  secret_forces: {
    id: 'secret_forces', category: 'neutral', site: 'forest', name: 'Тайные силы',
    phases: ['turn'], target: 'liveRegion', effect: 'secretForces',
    text: 'Выбранный район уничтожается, как при атомной бомбардировке. Один другой случайный ваш район становится ничейным.', public: true,
  },
  oblivion: {
    id: 'oblivion', category: 'neutral', site: 'forest', name: 'Забвение',
    phases: ['turn'], target: 'swap', effect: 'swapRegions',
    text: 'Поменяйте местами владельцев своего и чужого района.', public: true,
  },
  mutation: {
    id: 'mutation', category: 'neutral', site: 'power_station', name: 'Мутация',
    phases: ['turn'], target: 'none', effect: 'mutation', params: { bonus: 2 },
    text: 'Юниты, выставленные вами в этот ход, получают +2 к атаке.', public: true,
  },
  acid_rain: {
    id: 'acid_rain', category: 'neutral', site: 'power_station', name: 'Кислотный дождь',
    phases: ['prep', 'turn'], target: 'twoCapitals', effect: 'removeBaseDefense',
    text: 'Две выбранные столицы теряют встроенную защиту на этот раунд. Защитники остаются.', public: true,
  },
};

export const ALL_CARDS = { ...OPERATIVES, ...REWARD_CARDS, ...NEUTRAL_CARDS };

// Наборы наград по территориям (ТЗ 8.1–8.7, 9). Карта выбирается случайно из набора.
export const TERRITORY_REWARDS = {
  syndicate: ['uav', 'nuke', 'air_support'],
  matriarchy: ['inviolable', 'shrine'],
  anarchists: ['uav', 'nuke', 'hurricane'],
  merchants: ['uav', 'air_support', 'hurricane'],
  enforcers: ['inviolable', 'nuke', 'air_support'],
  aristocrats: ['inviolable', 'shrine', 'hurricane'],
  pirates: ['water_defense', 'shrine'],
  N1: ['carpet', 'bridge_blast'],
  N2: ['secret_forces', 'oblivion'],
  N3: ['mutation', 'acid_rain'],
};
