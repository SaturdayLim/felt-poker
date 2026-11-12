import type { Game, GameRules, GameType, Settings } from '../types';

/** The house rules a game is played under. Games from before per-game rules follow the Settings preset. */
export function gameRules(g: Game, s: Settings): GameRules {
  return g.rules ?? { minRaise: s.minRaise, bounty27: s.bounty27 };
}

/** Rules a new game starts with: the Settings preset (Game Defaults, House rules), never the last game.
    The host can change them in New Game for that game only. A tournament starts with the 7-2 bounty off
    (tournaments are parked, src/lib/features.ts); a cash game takes the preset as it is. */
export function rulesForNew(type: GameType, s: Settings): GameRules {
  return {
    minRaise: s.minRaise,
    bounty27: type === 'cash' ? { ...s.bounty27 } : { ...s.bounty27, on: false },
  };
}
