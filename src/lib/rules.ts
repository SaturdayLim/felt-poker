import type { Game, GameRules, GameType, Settings } from '../types';

/** The house rules a game is played under. Games from before per-game rules follow the old app Settings. */
export function gameRules(g: Game, s: Settings): GameRules {
  return g.rules ?? { minRaise: s.minRaise, bounty27: s.bounty27 };
}

/** Rules a new game starts with: the last game of the same type, else the last game of any type.
    The 2-7 bounty starts on for a cash game and off for a tournament until one is played with it. */
export function rulesForNew(games: Game[], type: GameType, s: Settings): GameRules {
  const latest = (t?: GameType) => [...games].filter((g) => g.rules && (!t || g.type === t)).sort((a, b) => b.createdAt - a.createdAt)[0]?.rules;
  const same = latest(type);
  const any = latest();
  return {
    minRaise: (same ?? any)?.minRaise ?? s.minRaise,
    bounty27: same?.bounty27 ?? { ...(any?.bounty27 ?? s.bounty27), on: type === 'cash' },
  };
}
