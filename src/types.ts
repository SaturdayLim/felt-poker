export type ID = string;

/** Card code: rank + suit, e.g. "As", "Td", "9h". */
export type Card = string;

export interface Player {
  id: ID;
  name: string;
  createdAt: number;
  archived?: boolean;
}

export type GameType = 'cash' | 'tournament';
export type GameStatus = 'live' | 'closed';
export type PlayerStatus = 'playing' | 'away' | 'out';

/**
 * Cash: amount is in units (1 = SB). Tournament: amount is the entry fee in money.
 */
export interface BuyIn {
  id: ID;
  playerId: ID;
  amount: number;
  at: number;
}

/** Cash only, in units. */
export interface CashOut {
  id: ID;
  playerId: ID;
  amount: number;
  at: number;
}

export interface StatusEvent {
  playerId: ID;
  status: PlayerStatus;
  at: number;
}

export interface Winner {
  playerId: ID;
  /** Units won from the pot. */
  amount: number;
}

export interface ShownHand {
  playerId: ID;
  cards: Card[];
}

/** One pot in a hand: the main pot or a side pot. */
export interface Pot {
  /** Units. */
  amount: number;
  /** Players who can win this pot (they matched its level). */
  eligible: ID[];
  winners: Winner[];
}

export interface Hand {
  id: ID;
  n: number;
  at: number;
  dealerId?: ID;
  /** Total of all pots, in units. */
  pot: number;
  /** Total won per player across all pots. */
  winners: Winner[];
  /** Main pot first, then side pots. Older hands have none (one pot = pot/winners). */
  pots?: Pot[];
  /** Up to 5 cards. Ignored when boardNA. */
  board: Card[];
  /** Board not tracked (bomb pot, side game, etc.). */
  boardNA: boolean;
  shown: ShownHand[];
  allIn: boolean;
  straddle: boolean;
  tags: string[];
  note?: string;
}

export interface Expense {
  id: ID;
  label: string;
  /** Money. */
  amount: number;
  paidBy?: ID;
  splitAmong: ID[];
}

export interface Transfer {
  id: ID;
  from: ID;
  to: ID;
  /** Money. */
  amount: number;
  resolved: boolean;
  resolvedAt?: number;
}

export interface TournamentInfo {
  /** Entry fee in money. */
  buyIn: number;
  startingStack: number;
  /** Player ids in the order they busted (first out first). */
  bustOrder: ID[];
  /** Money paid by finishing place; index 0 = 1st place. */
  payouts: number[];
  /** True once the host edits payouts by hand; stops auto-recalculation. */
  customPayouts?: boolean;
}

export interface Game {
  id: ID;
  name: string;
  type: GameType;
  status: GameStatus;
  createdAt: number;
  startedAt: number;
  endedAt?: number;
  currency: string;
  /** Money value of one unit (1 unit = 1 SB by default). */
  unitValue: number;
  sb: number;
  bb: number;
  /** Default cash buy-in in units. */
  defaultBuyIn: number;
  playerIds: ID[];
  seats: Record<ID, number>;
  buyIns: BuyIn[];
  cashOuts: CashOut[];
  statusEvents: StatusEvent[];
  hands: Hand[];
  expenses: Expense[];
  transfers: Transfer[];
  /** Dealer for the first hand (from the seat draw). */
  firstDealer?: ID;
  tournament?: TournamentInfo;
  notes?: string;
}

export interface Markers {
  dealer: boolean;
  allIn: boolean;
  straddle: boolean;
  tags: boolean;
}

export type ThemePref = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  currency: string;
  unitValue: number;
  sb: number;
  bb: number;
  defaultBuyIn: number;
  tournamentBuyIn: number;
  startingStack: number;
  tags: string[];
  markers: Markers;
}
