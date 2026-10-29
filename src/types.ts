export type ID = string;

/** Card code: rank + suit, e.g. "As", "Td", "9h". */
export type Card = string;

export interface Player {
  id: ID;
  name: string;
  createdAt: number;
  archived?: boolean;
}

/** Players who play together. Games tagged with a group settle together (netted payments). */
export interface Group {
  id: ID;
  name: string;
  playerIds: ID[];
  createdAt: number;
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

export type StreetName = 'preflop' | 'flop' | 'turn' | 'river';

/** One action box in the recorder: call (or check), fold, bet or raise to a street total, or all-in. */
export interface Act {
  k: 'call' | 'fold' | 'bet' | 'allin';
  /** Bet: the player's total wager on this street after the bet. */
  to?: number;
  /** Filled in by Felt (a box skipped over): check, or fold when facing a bet. */
  d?: boolean;
  /** The bet this action answered. If an earlier change moves it, the action is dropped. */
  at?: number;
  /** Acted in the dark (before seeing the cards). Preflop, a dark raise is a straddle. */
  dark?: boolean;
}

/** One betting round as logged in the street-by-street recorder. */
export interface StreetLog {
  /** Action boxes per player, one per pass around the table (current recorder).
      When present, bets, folded and raisers are worked out from these. */
  acts?: Record<ID, (Act | null)[]>;
  /** Bet mode: each player's total wager on this street, in units. */
  bets: Record<ID, number>;
  /** Wager before the last automatic call; a fold falls back to this. */
  prev: Record<ID, number>;
  /** Wagers typed by hand (not auto-calls). */
  typed: Record<ID, boolean>;
  /** Players who folded on this street (their wager stays in the pot). */
  folded: ID[];
  /** Players who raised on this street (preflop raisers give PFR). */
  raisers: ID[];
  /** Count mode: pot total counted at the end of this street. */
  pot?: number;
  /** When the street was closed. */
  at?: number;
  /** Closed by skipping ahead: boxes left empty keep the player in (call) instead of the usual default. */
  partial?: boolean;
}

/** Everything the street-by-street recorder captured for a hand. */
export interface HandLog {
  v: 1;
  mode: 'bets' | 'count';
  /** Players dealt in, any order. */
  dealt: ID[];
  /** Button for this hand (sets blinds and action order). */
  button?: ID;
  streets: Partial<Record<StreetName, StreetLog>>;
  /** Players with no chips left, and the street they went all-in on. */
  allInAt?: Record<ID, StreetName>;
  /** Times the board was run (1 to 5). */
  runs: number;
  /** Board cards dealt before the runs started. */
  runFrom?: number;
  /** Remaining board cards for each run (run 1 first). */
  runCards: Card[][];
  shown: Record<ID, Card[]>;
  mucked: ID[];
  startedAt: number;
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
  /** Wagers nobody matched, given back (not won). */
  returned?: Record<ID, number>;
  /** Street-by-street record (hands logged with the recorder). */
  log?: HandLog;
  /** Some action was skipped, so wagers are incomplete. */
  partial?: boolean;
  /** Left out of hand stats and trends (hands won, VPIP, pace). */
  excluded?: boolean;
  /** When the hand was saved; with `at` gives the hand's duration. */
  endedAt?: number;
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
  /** Group this game belongs to, for netted settle-up and the group leaderboard. */
  groupId?: ID;
  /** Seats were reshuffled before this hand number: seat 1 (firstDealer) takes the button. */
  reseatN?: number;
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
  /** How long the opening screen shows, in ms. 0 = skip it. */
  splashMs: number;
  /** House rule for the smallest raise: last raise (standard), small-blind steps, or double the bet. */
  minRaise: 'last' | 'sb' | 'double';
  /** How the recorder takes wagers: per-player bets, or the pot counted each street. */
  entryMode: 'bets' | 'count';
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
