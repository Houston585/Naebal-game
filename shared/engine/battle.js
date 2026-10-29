// Разрешение боя за один район (ТЗ 3.3). Чистая функция — легко тестировать.
//
// input:
//   owner       — владелец района (id игрока или null — ничейный)
//   baseDefense — встроенная защита (с учётом эффектов)
//   defense     — суммарная сила защитников (уже с бонусами)
//   attacks     — { [playerId]: суммарная сила атаки }
// output: { outcome, winner, defenseTotal, maxAttack, leaders }
//   outcome: 'captured' | 'held' | 'tie' | 'quiet'
export function resolveBattle({ owner, baseDefense, defense = 0, attacks = {} }) {
  const defenseTotal = baseDefense + defense;
  const entries = Object.entries(attacks);
  if (!entries.length) {
    return { outcome: 'quiet', winner: null, defenseTotal, maxAttack: 0, leaders: [], newOwner: owner };
  }
  const maxAttack = Math.max(...entries.map(([, v]) => v));
  const leaders = entries.filter(([, v]) => v === maxAttack).map(([p]) => p);
  if (leaders.length > 1) {
    // Ничья атакующих: никто не захватывает, район остаётся у текущего владельца (или ничейным).
    return { outcome: 'tie', winner: null, defenseTotal, maxAttack, leaders, newOwner: owner };
  }
  if (maxAttack > defenseTotal) {
    return { outcome: 'captured', winner: leaders[0], defenseTotal, maxAttack, leaders, newOwner: leaders[0] };
  }
  return { outcome: 'held', winner: null, defenseTotal, maxAttack, leaders, newOwner: owner };
}
