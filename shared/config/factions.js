// Фракции. Основные цвета — из ТЗ «География карты», раздел 7.
// Владелец района дополнительно маркируется эмблемой, поэтому цвет не единственный признак.
export const FACTIONS = {
  syndicate: {
    id: 'syndicate', name: 'Синдикат', short: 'СНД',
    color: '#9B5CFF', color2: '#4A2391', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'grid', capital: 'L1',
    motto: 'Всё учтено. Всё опечатано.',
  },
  matriarchy: {
    id: 'matriarchy', name: 'Матриархат', short: 'МТР',
    color: '#FF5DA8', color2: '#8E1F55', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'dots', capital: 'P1',
    motto: 'Порядок начинается с мамы.',
  },
  anarchists: {
    id: 'anarchists', name: 'Анархисты', short: 'АНР',
    color: '#36D96D', color2: '#0F6A2E', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'scratch', capital: 'P12',
    motto: 'Правила — это предложение.',
  },
  merchants: {
    id: 'merchants', name: 'Коммерсанты', short: 'КМР',
    color: '#FFD52A', color2: '#7A6200', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'diag', capital: 'L9',
    motto: 'Всё имеет цену. Даже эта.',
  },
  enforcers: {
    id: 'enforcers', name: 'Силовики', short: 'СЛВ',
    color: '#F02D36', color2: '#7A0D12', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'hazard', capital: 'P17',
    motto: 'Пройдёмте.',
  },
  aristocrats: {
    id: 'aristocrats', name: 'Аристократы', short: 'АРС',
    color: '#20C9F8', color2: '#05607A', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'chevron', capital: 'L15',
    motto: 'Мы были здесь до вас. И после.',
  },
  pirates: {
    id: 'pirates', name: 'Пираты', short: 'ПРТ',
    color: '#FF7A24', color2: '#8A3300', emblemColor: '#1C1B19', textOnColor: '#1C1B19',
    pattern: 'waves', capital: 'P5',
    motto: 'Карта — это предложение маршрута.',
  },
};

export const FACTION_IDS = Object.keys(FACTIONS);
