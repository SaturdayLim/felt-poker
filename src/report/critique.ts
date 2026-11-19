/* Gameplay critique (owner, 16 Nov 2026; rewritten 19 Nov 2026). Two layers on one player's report:
   - Basic analysis (`lines`): a commentator with no cards. It says what each action at the table can mean: the
     ranges an open, a limp, a re-raise, a c-bet, a barrel or a check-raise show, and what each board card changes.
   - Advanced insights (`deep`, `close`): first person. From the player's own entered cards (never another player's
     hidden cards), the action so far and the action faced, the options open at each decision, then a graded closing
     comment on each of the player's own actions. The grade and the quiz answer come from one decision (`decide`), so
     they always agree.
   A hand whose entry has a red clash is skipped as an invalid hand. A blue clash counts as recorded. A hand with no
   entry gets the basic analysis and ungraded insights.
   The input is the written action log (HandView): its lines follow one fixed grammar (src/report/logText.ts), so the
   actions, amounts and positions can be read back from it. The same code runs in the report builder and in old reports. */
import type { Card } from '../types';
import { RANKS, bestHand, DECK } from '../lib/cards';
import type { HandView } from './model';

export type CritTone = 'good' | 'warn' | 'info' | 'ask';
/** `a`: the answer to a question (tone 'ask'), a recommended action and its reason. The report hides it until a tap. */
export interface CritNote { tone: CritTone; text: string; a?: string; g?: CritGrade }
/** The grade of one of the player's own actions: green = good or reasonable, blue = give it more thought, red = do not do this. */
export type CritGrade = 'green' | 'blue' | 'red';
/** The closing comment on one of the player's own actions: a grade and its label (none when no cards were entered), then
    the takeaway: how the action compares with the recommended action, what it shows the table and what to represent next. */
export interface CritClose { g?: CritGrade; v?: string; text: string }
type Notes = Record<number, Record<number, CritNote[]>>;
/** Comments for one hand, by street and line. Line -1 = notes on the street's cards. */
export interface HandCrit {
  n: number;
  status: 'cards' | 'nocards' | 'invalid';
  /** The hand's verdict for the hand list: the worst grade of the player's own actions, with its label. */
  verdict?: { tone: CritTone; label: string; g?: CritGrade };
  /** Basic analysis: what each action can mean, for any player, without cards. */
  lines: Notes;
  /** Advanced insights: the first-person thought process at each of the player's decisions. */
  deep?: Notes;
  /** The closing comment under each of the player's own actions, by street and line. */
  close?: Record<number, Record<number, CritClose>>;
}
const RANK_G: Record<CritGrade, number> = { red: 2, blue: 1, green: 0 };
export interface PlayerCrit { hands: HandCrit[]; bluffs: number; bluffsWon: number; bluffSize: number; semis: number; valueBets: number }

type Kind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'straddle';
interface Act { who: string; pos: string; k: Kind; to: number; allin: boolean; line: number }
interface Street { i: number; key: 'preflop' | 'flop' | 'turn' | 'river'; board: Card[]; acts: Act[] }
interface Parsed { n: number; streets: Street[]; posOf: Record<string, string>; winners: string[] }

const KEYS = ['preflop', 'flop', 'turn', 'river'] as const;
const ORDER = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'];
const PRE_ORDER = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const LATE = new Set(['CO', 'BTN']);
const EARLY = new Set(['UTG', 'UTG+1']);
const r2 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/* ------------------------------- reading the log ------------------------------- */

/** Reads a hand's action back from its written lines. */
export function parseView(v: HandView): Parsed {
  const posOf: Record<string, string> = {}, nameAt: Record<string, string> = {};
  // first pass: every "POS (Name)" in the hand
  for (const st of v.streets) for (const l of st.segs) for (const s of l) {
    const m = s.c !== undefined ? /^([A-Z+0-9]+) \((.+)\)$/.exec(s.t) : null;
    if (m) { posOf[m[2]] = m[1]; nameAt[m[1]] = m[2]; }
  }
  const streets: Street[] = [];
  v.streets.forEach((st, i) => {
    const key = KEYS[i] ?? 'river';
    const acts: Act[] = [];
    st.segs.forEach((l, line) => {
      const who = l.filter((s) => s.c !== undefined).map((s) => {
        const m = /^([A-Z+0-9]+) \((.+)\)$/.exec(s.t);
        if (m) return { pos: m[1], name: m[2] };
        return { pos: nameAt[s.t] ? s.t : posOf[s.t] ?? '', name: nameAt[s.t] ?? s.t };
      });
      const tail = l[l.length - 1]?.t ?? '';
      const num = Number((/(\d+(?:\.\d+)?)/.exec(tail) ?? [])[1] ?? 0);
      let k: Kind = 'check', allin = false;
      if (/calls all-in/.test(tail)) { k = 'call'; allin = true; }
      else if (/ is all-in/.test(tail)) { k = 'allin'; allin = true; }
      else if (/ raises/.test(tail)) k = 'raise';
      else if (/ bets/.test(tail)) k = 'bet';
      else if (/ straddles/.test(tail)) k = 'straddle';
      else if (/ (calls|call)( in the dark)?\./.test(tail)) k = 'call';
      else if (/ (folds|fold)\./.test(tail)) k = 'fold';
      else if (/ (checks|check)( in the dark)?\./.test(tail)) k = 'check';
      for (const w of who) acts.push({ who: w.name, pos: w.pos, k, to: num, allin, line });
    });
    streets.push({ i, key, board: st.cards, acts });
  });
  const winners = /^(.+?) wins/.exec(v.result)?.[1]?.split(/, | and /).map((x) => x.replace(/ wins.*$/, '')) ?? [];
  return { n: v.n, streets, posOf, winners };
}

/* ------------------------------- hand strength ------------------------------- */

const rv = (c: Card) => 14 - RANKS.indexOf(c[0]);
const RANK_WORD = (r: string) => (r === 'T' ? '10' : r);
const PLURAL = (r: string) => ({ A: 'aces', K: 'kings', Q: 'queens', J: 'jacks', T: '10s' } as Record<string, string>)[r] ?? `${r}s`;
const ONE: Record<string, string> = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack', T: 'a 10', 8: 'an 8' };
const oneOf = (r: string) => ONE[r] ?? `a ${r}`;
const boardText = (b: Card[]) => b.map((c) => RANK_WORD(c[0])).join('-');
const rankCount = (b: Card[], r: string) => b.filter((c) => c[0] === r).length;

function boardCat(board: Card[]): number {
  if (board.length >= 5) return bestHand(board)?.category ?? 0;
  const n = Object.values(board.reduce<Record<string, number>>((a, c) => ({ ...a, [c[0]]: (a[c[0]] ?? 0) + 1 }), {})).sort((a, b) => b - a);
  return n[0] === 4 ? 7 : n[0] === 3 ? 3 : n[0] === 2 && n[1] === 2 ? 2 : n[0] === 2 ? 1 : 0;
}
type Made = 'monster' | 'strong' | 'overpair' | 'top' | 'weak' | 'none';
function made(hole: Card[], board: Card[]): Made {
  const all = bestHand([...hole, ...board]);
  const cat = all?.category ?? 0;
  const bc = boardCat(board);
  if (!all || cat <= bc) return 'none';
  if (cat >= 4) return 'monster';
  // two pair on a paired board is one pair of your own: judge it as a pair
  const onePair = cat === 2 && bc === 1;
  if (cat >= 2 && !onePair) return 'strong';
  const top = Math.max(...board.map(rv));
  if (hole[0][0] === hole[1][0]) return rv(hole[0]) > top ? 'overpair' : 'weak';
  return hole.some((c) => rv(c) === top) ? 'top' : 'weak';
}
const CAT_WORD = ['high card', 'a pair', 'two pair', 'trips', 'a straight', 'a flush', 'a full house', 'quads', 'a straight flush'];
/** The player's hand in words: the real hand name for strong hands, "nothing beyond the board" when the board plays. */
function handWord(s: Made, hole: Card[], board: Card[]): string {
  const cat = bestHand([...hole, ...board])?.category ?? 0;
  if (s === 'monster') return CAT_WORD[cat];
  if (s === 'strong') return cat === 3 && hole[0][0] === hole[1][0] ? 'a set' : CAT_WORD[cat];
  if (s === 'overpair') return 'an overpair';
  if (s === 'top') return 'top pair';
  if (s === 'weak') return 'a weak pair';
  return boardCat(board) >= 1 ? 'nothing beyond the board' : 'no pair';
}
/** Cards still to come that give a straight or better the board alone does not make. */
function outs(hole: Card[], board: Card[]): number {
  if (board.length < 3 || board.length >= 5) return 0;
  const seen = new Set<Card>([...hole, ...board]);
  let n = 0;
  for (const c of DECK) {
    if (seen.has(c)) continue;
    const h = bestHand([...hole, ...board, c]);
    if (h && h.category >= 4 && h.category > boardCat([...board, c])) n++;
  }
  return n;
}
/** Starting hand tier: 0 premium, 1 strong, 2 playable, 3 marginal, 4 weak. */
function tier(hole: Card[]): { t: number; cls: string; pair: boolean; suited: boolean; hi: number; lo: number } {
  const [a, b] = [...hole].sort((x, y) => rv(y) - rv(x));
  const pair = a[0] === b[0], suited = a[1] === b[1], hi = rv(a), lo = rv(b);
  const cls = pair ? `${a[0]}${b[0]}` : `${a[0]}${b[0]}${suited ? 's' : 'o'}`;
  const out = (t: number) => ({ t, cls, pair, suited, hi, lo });
  if (pair) return out(hi >= 12 ? 0 : hi >= 10 ? 1 : 2);
  if (hi === 14 && lo === 13) return out(0);
  if (hi === 14 && lo === 12 || (suited && (hi === 14 && lo === 11 || hi === 13 && lo === 12))) return out(1);
  if (suited && (hi === 14 || (lo >= 10) || hi - lo === 1 && lo >= 5)) return out(2);
  if (lo >= 10) return out(2);
  if (suited || (lo >= 9 && hi - lo <= 2) || hi === 14) return out(3);
  return out(4);
}
const TIER_WORD = ['a premium hand', 'a strong hand', 'a playable hand', 'a marginal hand', 'a weak hand'];
const NEXT: Record<string, string> = { preflop: 'the flop', flop: 'the turn', turn: 'the river', river: 'the showdown' };

/* ------------------------------- habits of the table ------------------------------- */

interface Habit { hands: number; vpip: number; pfr: number; aggr: number; calls: number; faced: number; foldsFaced: number; seen: Record<string, boolean> }
const habitWord = (h: Habit | undefined): string | null => {
  if (!h || h.hands < 6) return null;
  const vp = h.vpip / h.hands, af = h.calls ? h.aggr / h.calls : h.aggr, ff = h.faced >= 4 ? h.foldsFaced / h.faced : null;
  if (vp >= 0.5 && af < 1) return `a calling station so far (plays ${pct(vp)} of hands, calls more than bets)`;
  if (vp >= 0.45 && af >= 1.5) return `loose and aggressive so far (plays ${pct(vp)} of hands, aggression ${r2(af)})`;
  if (af >= 2.5) return `aggressive so far (aggression ${r2(af)})`;
  if (ff !== null && ff >= 0.7) return `folding to bets so far (${pct(ff)} of bets faced)`;
  if (vp <= 0.22) return `tight so far (plays ${pct(vp)} of hands)`;
  return null;
};
function learn(habits: Record<string, Habit>, p: Parsed) {
  const met = new Set<string>();
  for (const st of p.streets) {
    let high = st.key === 'preflop' ? 2 : 0;
    for (const a of st.acts) {
      const h = (habits[a.who] ??= { hands: 0, vpip: 0, pfr: 0, aggr: 0, calls: 0, faced: 0, foldsFaced: 0, seen: {} });
      if (!met.has(a.who)) { met.add(a.who); h.hands++; }
      if (st.key === 'preflop') {
        if ((a.k === 'call' || a.k === 'raise' || a.k === 'allin' || a.k === 'bet') && !h.seen[`v${p.n}`]) { h.vpip++; h.seen[`v${p.n}`] = true; }
        if ((a.k === 'raise' || a.k === 'allin') && !h.seen[`r${p.n}`]) { h.pfr++; h.seen[`r${p.n}`] = true; }
      } else {
        if (a.k === 'bet' || a.k === 'raise' || a.k === 'allin') h.aggr++;
        if (a.k === 'call') h.calls++;
        if (high > 0 && (a.k === 'call' || a.k === 'fold' || a.k === 'raise')) { h.faced++; if (a.k === 'fold') h.foldsFaced++; }
      }
      if (a.to > high) high = a.to;
    }
  }
}

/* ------------------------------- the board ------------------------------- */

const SUIT_WORD: Record<string, string> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
interface Texture { wet: boolean; flush: 'none' | 'draw' | 'made'; flushSuit: string; straight: 'none' | 'draw' | 'made'; words: string[] }
function texture(board: Card[]): Texture {
  const bySuit: Record<string, number> = {}, byRank: Record<string, number> = {};
  for (const c of board) { bySuit[c[1]] = (bySuit[c[1]] ?? 0) + 1; byRank[c[0]] = (byRank[c[0]] ?? 0) + 1; }
  const [fs, fn] = Object.entries(bySuit).sort((a, b) => b[1] - a[1])[0] ?? ['s', 0];
  const counts = Object.values(byRank);
  const vals = [...new Set(board.map(rv))];
  if (vals.includes(14)) vals.push(1);
  // the most board ranks inside one 5-rank window: 3 = a straight is possible, 2 = a straight draw is possible
  let span = 0;
  for (let lo = 1; lo <= 10; lo++) span = Math.max(span, vals.filter((v) => v >= lo && v < lo + 5).length);
  const flush = fn >= 3 ? 'made' : fn === 2 && board.length < 5 ? 'draw' : 'none';
  const straight = span >= 3 ? 'made' : span === 2 && board.length < 5 ? 'draw' : 'none';
  const words: string[] = [];
  if (Math.max(...counts) >= 3) words.push('trips on the board');
  else if (counts.filter((x) => x >= 2).length >= 2) words.push('two pairs on the board');
  else if (Math.max(...counts) === 2) words.push('a paired board');
  if (flush === 'made') words.push(`${fn} ${SUIT_WORD[fs]}, so a flush is possible`);
  else if (flush === 'draw') words.push(`two ${SUIT_WORD[fs]}, so a flush draw is possible`);
  else if (board.length === 3) words.push('three suits');
  if (straight === 'made') words.push('connected cards, so a straight is possible');
  else if (straight === 'draw') words.push('straight draws are possible');
  else words.push('few straight draws');
  return { wet: flush !== 'none' || straight !== 'none', flush, flushSuit: fs, straight, words };
}

/** What the newest board card changes. `helps` names the hands it improves, by how many of its rank are now on the
    board: 1 = a pair, 2 = trips, 3 = everyone has trips (the last one is quads), 4 = everyone has quads. */
function newCard(board: Card[], prevBoard: Card[]) {
  const c = board[board.length - 1], r = RANK_WORD(c[0]), n = rankCount(board, c[0]);
  const before = texture(prevBoard), tx = texture(board);
  const parts: string[] = [];
  const over = n === 1 && rv(c) > Math.max(...prevBoard.map(rv));
  let helps: string;
  if (n === 1) helps = `Any ${r}x now has ${over ? 'top pair' : `a pair of ${PLURAL(c[0])}`}.`;
  else if (n === 2) { parts.push('it pairs the board'); helps = `Any ${r}x now has trips, and two pair can now be a full house.`; }
  else if (n === 3) {
    parts.push(`three ${PLURAL(c[0])} are on the board`);
    helps = `Every player now has at least trips. The last ${r} makes quads. Any pocket pair, or a card that pairs the board, makes a full house. Without one of these, the higher kicker wins.`;
  } else { parts.push(`all four ${PLURAL(c[0])} are on the board`); helps = 'Every player now has quads. The highest other card wins.'; }
  if (tx.flush === 'made' && before.flush !== 'made') parts.push(`a flush is now possible in ${SUIT_WORD[tx.flushSuit]}`);
  if (tx.straight === 'made' && before.straight !== 'made') parts.push('a straight is now possible');
  if (over) parts.push('it is an overcard to the board');
  return { c, r, n, helps, parts, scary: parts.length > 0, before, tx };
}

/** The street's cards, read by a commentator: texture, who the board fits, what the new card changes. */
function boardNotes(st: Street, prevBoard: Card[], raiserPre: string | null, label: (x: string) => string): string[] {
  const tx = texture(st.board);
  if (st.key === 'flop') {
    const out = [`Flop ${boardText(st.board)}: ${tx.words.join(', ')}. ${tx.wet ? 'Wet: many hands can still improve, so made hands bet to charge them.' : 'Dry: few hands can improve, so a bet works as a bluff more often.'}`];
    const high = st.board.some((c) => rv(c) >= 12);
    out.push(raiserPre
      ? (high ? `High cards fit the pre-flop raiser, ${label(raiserPre)}: big pairs, AK, AQ, KQ. Expect a continuation bet.` : `Low and middle cards fit the callers more than the raiser, ${label(raiserPre)}.`)
      : 'Nobody raised before the flop, so every range is wide and capped: strong hands are rare.');
    const pair = Object.entries(st.board.reduce<Record<string, number>>((a, c) => ({ ...a, [c[0]]: (a[c[0]] ?? 0) + 1 }), {})).find(([, k]) => k >= 2);
    if (pair) out.push(`${pair[1] === 2 ? 'Two' : 'Three'} ${PLURAL(pair[0])} show. Only ${4 - pair[1]} ${4 - pair[1] === 1 ? 'is' : 'are'} left, so most players hold no ${RANK_WORD(pair[0])}.`);
    return out;
  }
  const nc = newCard(st.board, prevBoard);
  const out = [`${st.key === 'turn' ? 'Turn' : 'River'} ${nc.r}: the board is ${boardText(st.board)}. ${nc.parts.length ? `The ${nc.r} matters: ${nc.parts.join('; ')}.` : `The ${nc.r} changes little.`} ${nc.helps}`];
  if (st.key === 'river') {
    const missed = missedDraws(st.board);
    out.push(missed ? `${missed} missed. A missed draw cannot win at showdown, so it bluffs or gives up.` : 'No common draw missed, so a river bet is more often value.');
  }
  return out;
}
function missedDraws(board: Card[]): string {
  const tx = texture(board), turn = texture(board.slice(0, 4)), flop = texture(board.slice(0, 3));
  const missed: string[] = [];
  const fl = turn.flush === 'draw' ? turn.flushSuit : flop.flush === 'draw' ? flop.flushSuit : null;
  if (fl && tx.flush !== 'made') missed.push(`The ${SUIT_WORD[fl].slice(0, -1)} flush draw`);
  if ((turn.straight === 'draw' || flop.straight === 'draw') && tx.straight !== 'made') missed.push(missed.length ? 'the straight draws' : 'The straight draws');
  return missed.join(' and ');
}

/* ------------------------------- walking the hand ------------------------------- */

/** The state of the hand just before one action. */
interface Ctx {
  st: Street; a: Act; ai: number; first: boolean;
  prev: number; toCall: number; potBefore: number; need: number; add: number;
  isRaise: boolean; raises: number; limpers: number; high: number; level: number;
  firstBet: string | null; raiserPre: string | null; highBy: string | null;
  /** Live players in acting order, and those after this player. */
  live: string[]; behind: string[];
  checked: Set<string>; prevAgg: string | null; prevChecked: boolean;
  allin: Set<string>; facingAllin: boolean;
  /** Chips each player has in on this street, before this action. */
  put: Record<string, number>;
}
interface StreetStart { raiserPre: string | null; prevAgg: string | null; prevChecked: boolean; live: string[]; prevBoard: Card[] }

function walk(p: Parsed, blinds: { sb: number; bb: number }, onStreet: (st: Street, s: StreetStart) => void, onAct: (c: Ctx) => void, onEnd?: (st: Street, live: string[]) => void) {
  const { sb, bb } = blinds;
  const players = Object.keys(p.posOf);
  const folded = new Set<string>(), allin = new Set<string>();
  let pot = 0, raiserPre: string | null = null, prevAgg: string | null = null, prevChecked = false, prevBoard: Card[] = [];
  for (const st of p.streets) {
    const SEQ = st.key === 'preflop' ? PRE_ORDER : ORDER;
    const order = (xs: string[]) => [...xs].sort((x, y) => SEQ.indexOf(p.posOf[x]) - SEQ.indexOf(p.posOf[y]));
    const put: Record<string, number> = {};
    let high = 0, level = 0, raises = 0, limpers = 0, firstBet: string | null = null, highBy: string | null = null, agg: string | null = null;
    if (st.key === 'preflop') {
      const sbN = players.find((x) => p.posOf[x] === 'SB'), bbN = players.find((x) => p.posOf[x] === 'BB');
      if (sbN) put[sbN] = sb;
      if (bbN) put[bbN] = bb;
      high = level = bb; pot = sb + bb; highBy = bbN ?? null;
    }
    onStreet(st, { raiserPre, prevAgg, prevChecked, live: order(players.filter((x) => !folded.has(x))), prevBoard });
    const checked = new Set<string>();
    st.acts.forEach((a, ai) => {
      const prev = put[a.who] ?? 0;
      const toCall = Math.max(0, high - prev);
      const isRaise = a.k !== 'straddle' && a.to > high && (a.k === 'raise' || a.k === 'allin' || a.k === 'bet');
      let add = 0;
      if (a.k === 'call') add = (a.allin && a.to ? a.to : high) - prev;
      else if (a.k === 'bet' || a.k === 'raise' || a.k === 'allin' || a.k === 'straddle') add = a.to - prev;
      add = Math.max(0, add);
      const live = order(players.filter((x) => !folded.has(x)));
      onAct({
        st, a, ai, first: ai === 0 || st.acts[ai - 1].line !== a.line,
        prev, toCall, potBefore: pot, need: toCall / Math.max(1, pot + toCall), add,
        isRaise, raises, limpers, high, level, firstBet, raiserPre, highBy,
        live, behind: live.slice(live.indexOf(a.who) + 1),
        checked, prevAgg, prevChecked, allin, facingAllin: toCall > 0 && !!highBy && allin.has(highBy), put,
      });
      // the record moves on
      if (a.k === 'fold') folded.add(a.who);
      if (a.k === 'check') checked.add(a.who);
      if (a.allin) allin.add(a.who);
      if (st.key === 'preflop' && a.k === 'call' && raises === 0) limpers++;
      if (a.k === 'straddle') { high = level = a.to; highBy = a.who; }
      if (isRaise) {
        if (st.key !== 'preflop' ? high > 0 : a.to > level) raises++;
        if (!firstBet) firstBet = a.who;
        high = a.to; highBy = a.who; agg = a.who;
        if (st.key === 'preflop') raiserPre = a.who;
      }
      put[a.who] = prev + add;
      pot += add;
    });
    onEnd?.(st, order(players.filter((x) => !folded.has(x))));
    if (st.key !== 'preflop') { prevAgg = agg; prevChecked = st.acts.length > 1 && st.acts.every((x) => x.k === 'check'); }
    prevBoard = st.board;
  }
}

/* ------------------------------- basic analysis: the commentator ------------------------------- */
/* What an action can mean, for any player, with no cards: the range it shows and the story it tells. */

function commentate(p: Parsed, blinds: { sb: number; bb: number }, habits: Record<string, Habit>): Notes {
  const out: Notes = {};
  const say = (st: number, line: number, text: string) => { ((out[st] ??= {})[line] ??= []).push({ tone: 'info', text }); };
  const { bb } = blinds;
  const label = (x: string) => (p.posOf[x] ? `${p.posOf[x]} (${x})` : x);
  const habitOf = (x: string) => { const w = habitWord(habits[x]); return w ? ` ${x} is ${w}.` : ''; };
  walk(p, blinds, (st, s) => {
    if (st.board.length >= 3 && s.live.length >= 2) for (const t of boardNotes(st, s.prevBoard, s.raiserPre, label)) say(st.i, -1, t);
  }, (c) => {
    if (!c.first) return;
    const { a, st } = c;
    const who = label(a.who), many = st.acts.filter((x) => x.line === a.line).length > 1;
    const pos = p.posOf[a.who] ?? '';
    let t: string | null = null;
    if (st.key === 'preflop') {
      if (a.k === 'straddle') t = `${who} straddles to ${a.to}: a blind raise before the cards are seen, so it shows nothing about the hand. Every call now costs ${a.to}, and the straddle acts last before the flop.`;
      else if (a.k === 'check') t = 'The BB checks the option. The flop is free, so the BB can hold any hand that did not want to raise.';
      else if (a.k === 'call' && c.raises === 0 && !a.allin) {
        t = pos === 'SB' && !many ? `The SB completes: half a blind more for a flop${c.limpers ? ` with ${c.limpers} ${c.limpers === 1 ? 'limper' : 'limpers'}` : ''}. The price is good, so the SB can hold almost any hand.`
          : c.limpers === 0 ? `${many ? `${NUM[st.acts.filter((y) => y.line === a.line).length] ?? 'Several'} limps` : `${who} limps`} (a call of ${c.level} with no raise). A limp shows a hand that wants a cheap flop: small pairs, suited cards, weak aces. Most strong hands raise.${many ? '' : habitOf(a.who)}`
          : `${many ? 'More limps' : 'Another limp'}. Each limp makes the pot bigger, so the players behind get a better price to join.`;
      } else if (a.k === 'call' || (a.k === 'allin' && !c.isRaise)) {
        t = c.facingAllin || a.allin ? `A call of an all-in needs a strong hand: big pairs, AK, AQ. The caller needs ${pct(c.need)} to break even.`
          : pos === 'BB' && !many ? `The BB defends. It already has ${bb} in, so it needs only ${pct(c.need)} to call, and it defends a wide range.`
          : c.raises >= 2 ? 'A call of a re-raise shows a strong hand that does not want to raise again: big pairs, AK, AQ.'
          : `A call of a raise (a flat call) shows a medium-strong hand: pairs, suited broadways, suited connectors. It is capped: most players re-raise their best hands.`;
      } else if (c.isRaise) {
        const size = a.to / bb;
        if (a.k === 'allin') t = `${who} is all-in for ${a.to} (${r2(size)} BB). ${size <= 20 ? 'A short stack goes all-in with a wide range: any pair, any good ace.' : 'A big all-in before the flop is most often a big pair or AK.'}${habitOf(a.who)}`;
        else if (c.raises === 0 && c.limpers === 0) {
          const range = EARLY.has(pos) ? 'From early position this shows a tight range: pairs 77 and up, AQ and up, suited broadways.' : LATE.has(pos) || pos === 'SB' ? 'From late position this can be a steal, so the range is wide: any pair, any ace, suited connectors, broadways.' : 'From the middle this shows a medium range: most pairs, AT and up, suited broadways.';
          const sz = a.to / c.level < 2.2 ? ` ${r2(size)} BB is small: it invites calls with any two cards.` : a.to / c.level > 4.5 ? ` ${r2(size)} BB is large: it risks a lot to win the blinds.` : '';
          t = `${who} opens with a raise to ${r2(size)} BB. ${range}${sz}${habitOf(a.who)}`;
        } else if (c.raises === 0) {
          const iso = 3 * c.level + c.limpers * c.level;
          t = `${who} raises over ${c.limpers} ${c.limpers === 1 ? 'limper' : 'limpers'}: an isolation raise. It charges the limpers and aims to play the pot against one player. A standard size is about ${iso} (3 BB plus 1 BB for each limper).${a.to < iso * 0.7 ? ` ${a.to} is small: limpers call it with most hands.` : ''}${habitOf(a.who)}`;
        } else if (c.raises === 1) t = `${who} re-raises to ${a.to} (a 3-bet). From most players this is a very strong hand: QQ or better, AK. From a loose player it can be a bluff.${habitOf(a.who)}`;
        else t = `${who} raises again to ${a.to} (a ${c.raises + 2}-bet). At this level it is almost always AA, KK, QQ or AK.`;
      }
    } else {
      const amount = a.to - c.prev, size = amount / Math.max(1, c.potBefore);
      if (a.k === 'check') {
        if (st.acts.filter((x) => x.line === a.line).length === c.live.length && st.acts.every((x) => x.k === 'check')) t = null;
        else if (st.key === 'flop' && c.raiserPre && st.acts.some((x) => x.line === a.line && x.who === c.raiserPre) && !c.firstBet) t = `The pre-flop raiser${many ? ', ' + label(c.raiserPre) + ',' : ''} checks: the c-bet is skipped. It shows a miss, or a strong hand that sets a trap.`;
        else if (c.prevAgg && st.acts.some((x) => x.line === a.line && x.who === c.prevAgg) && !c.firstBet) t = `${label(c.prevAgg)} bet the last street and now checks. The card may have hurt, or the hand is medium and wants a small pot.`;
      } else if (a.k === 'fold') {
        if (c.firstBet && c.toCall / Math.max(1, c.potBefore) < 0.4) t = `${many ? 'Folds' : 'A fold'} to a small bet: ${many ? 'those hands' : 'the hand'} missed the board.`;
      } else if (a.k === 'call' || (a.k === 'allin' && !c.isRaise)) {
        t = c.facingAllin || a.allin ? `A call of an all-in ends the betting. The caller needs ${pct(c.need)} to break even, so the call says the hand is ahead often enough.`
          : st.key === 'river' ? `A river call: the caller beats some bluffs, or reads the bet as a bluff. It shows a medium hand, often one pair.`
          : `A call shows a medium hand or a draw: good enough to go on, not strong enough to raise. A call here needs ${pct(c.need)} equity.`;
      } else if (c.isRaise) {
        const allinTxt = a.k === 'allin' ? `${who} is all-in for ${a.to}. ` : '';
        if (!c.firstBet) {
          const raiserIn = !!c.raiserPre && c.live.includes(c.raiserPre);
          const tag = st.key === 'flop' && a.who === c.raiserPre ? 'A continuation bet (c-bet): the pre-flop raiser keeps the lead. Raisers c-bet most hands, strong or not, so it shows less than it seems.'
            : st.key === 'flop' && raiserIn && c.behind.includes(c.raiserPre!) ? `A lead into the pre-flop raiser (a donk bet). It often shows a hand that fits the board: a pair or a draw.`
            : a.who === c.prevAgg ? (st.key === 'turn' ? 'A second bet (a barrel): the flop bettor bets again. Two bets tell a story of a strong hand. As a bluff, it needs the turn to scare the callers.' : 'A third bet in a row. Three bets are mostly strong hands; the bluffs among them are missed draws.')
            : c.prevChecked ? 'A bet after a round of checks (a stab). Nobody showed strength, so a stab can take the pot with any two cards.'
            : c.prevAgg ? `A lead after ${label(c.prevAgg)} bet the last street. It shows the new card helped, or a draw that hit.`
            : 'A bet takes the lead.';
          const sz = size > 1 ? ' An overbet (more than the pot) is polarising: a very strong hand or a bluff.'
            : size < 0.35 ? (st.key === 'river' ? ' A small river bet (a block bet) is often a medium hand that sets its own price.' : ' A small bet is cheap to call: it wants calls from weaker hands, or it is a cheap bluff.') : '';
          t = `${allinTxt}${tag} Size: ${pct(size)} of the pot.${sz}${habitOf(a.who)}`;
        } else {
          const cr = c.checked.has(a.who);
          t = a.k === 'allin' ? `${allinTxt}${st.key === 'river' ? 'An all-in raise on the river is very strong: the best hands on this board, rarely a bluff.' : 'An all-in raise ends the betting: a very strong hand or a big draw.'}${habitOf(a.who)}`
            : cr ? `A check-raise: ${who} checked, then raised. It shows a very strong hand, or a semi-bluff with a big draw.${habitOf(a.who)}`
            : `${c.raises >= 1 ? 'A re-raise after the flop is very strong: two pair or better.' : 'A raise after the flop shows strength: most often two pair or better, or a big draw.'}${habitOf(a.who)}`;
        }
      }
    }
    if (t) say(st.i, a.line, t);
  }, (st, live) => {
    if (st.key !== 'preflop' && st.acts.length > 1 && st.acts.every((x) => x.k === 'check') && live.length >= 2) say(st.i, st.acts[st.acts.length - 1].line, 'Everyone checks: nobody claims the pot. A bet on the next street often takes it.');
  });
  return out;
}

/* ------------------------------- advanced insights: the decision ------------------------------- */

type Move = 'raise' | 'call' | 'check' | 'fold';
/** The recommended action at one decision. `ok` = other actions that are also fine (graded green). `why` = the reason. */
interface Rec { k: Move; to?: number; ok?: Move[]; why: string; /** The size to aim for when the player takes the raise in `ok`. */ altTo?: number }
const moveOf = (a: Act, isRaise: boolean): Move => (isRaise || a.k === 'straddle' ? 'raise' : a.k === 'call' || a.k === 'allin' ? 'call' : a.k === 'check' ? 'check' : 'fold');

/** What one decision looks like from the player's seat. */
interface Spot {
  c: Ctx; me: string; pos: string; hole: Card[]; s: Made | null; o: number; word: string;
  others: string[]; station: boolean; folder: boolean; aggBehind: boolean; inPos: boolean;
  noRaise: boolean; story: boolean; cbet: boolean; stab: boolean; wet: boolean; multi: boolean; raiserPos: string;
}
function decidePre(x: Spot): Rec {
  const { c, pos } = x, t = tier(x.hole), L = c.level;
  const iso = 3 * L + c.limpers * L;
  if (c.high > c.level) {
    // facing a raise
    if (x.noRaise) return t.t === 0 || (t.t <= 1 && c.need <= 0.4) || (t.pair && t.hi >= 10 && c.need <= 0.35)
      ? { k: 'call', why: `${t.cls} is ${TIER_WORD[t.t]}, and the all-in leaves only call or fold. You need ${pct(c.need)}.` }
      : { k: 'fold', why: `${t.cls} is behind most all-in ranges, and you need ${pct(c.need)}.` };
    if (t.t === 0) return { k: 'raise', to: Math.round((c.raises >= 2 ? 2.5 : 3) * c.high), ok: ['call'], why: `${t.cls} is ahead of almost every raising range. A re-raise builds the pot while you are ahead.` };
    if (t.t === 1) return EARLY.has(x.raiserPos)
      ? { k: 'call', ok: ['raise'], why: `${t.cls} plays well against a strong early range, but a re-raise only gets called by better.` }
      : { k: 'raise', to: 3 * c.high, ok: ['call'], why: `Against a wider raising range ${t.cls} is ahead.` };
    if (pos === 'BB' && c.toCall <= 2 * L && t.t <= 3) return { k: 'call', why: `${t.cls} in the BB gets a good price: you need only ${pct(c.need)}.` };
    if (t.t === 2 && (t.pair || c.need <= 0.3)) return { k: 'call', why: `The price is ${pct(c.need)}, and ${t.pair ? 'a set' : 'a straight or flush'} can win a big pot.` };
    if (t.t === 3 && t.suited && (LATE.has(pos) || pos === 'BB') && c.raises === 1 && c.need <= 0.3) return { k: 'fold', ok: ['call'], why: `${t.cls} is behind a raising range, but in position a suited hand can call a single raise and hope for a flush or a straight.` };
    return { k: 'fold', why: `${t.cls} is behind most raising ranges, and you need ${pct(c.need)} to call.` };
  }
  if (c.limpers === 0 && c.toCall > 0) {
    // nobody has entered: open or fold
    const opens = EARLY.has(pos) ? t.t <= 1 : LATE.has(pos) || pos === 'SB' ? t.t <= 3 : t.t <= 2;
    return opens ? { k: 'raise', to: 3 * L, why: `${t.cls} is good enough to open from ${pos}. Raise; do not limp.` } : { k: 'fold', why: `${t.cls} is too weak to open from ${pos}.` };
  }
  if (c.toCall === 0) return t.t <= 1 || (t.pair && t.hi >= 10)
    ? { k: 'raise', to: iso, ok: ['check'], why: `With ${t.cls} you are likely ahead of every limper, so build the pot now.` }
    : { k: 'check', ok: t.t <= 2 ? ['raise'] : [], altTo: iso, why: `${t.cls} is not strong enough to raise into ${c.limpers} ${c.limpers === 1 ? 'limper' : 'limpers'}, and the flop is free.` };
  if (pos === 'SB' && c.toCall <= L / 2 + 0.01) return t.t <= 1
    ? { k: 'raise', to: iso, ok: ['call'], why: `${t.cls} is ahead of the limpers. Raise to build the pot.` }
    : t.t <= 3 ? { k: 'call', ok: t.t <= 2 ? ['raise'] : [], altTo: iso, why: `Half a blind more for a flop with ${c.limpers} ${c.limpers === 1 ? 'limper' : 'limpers'} is a good price for ${t.cls}.` }
    : { k: 'fold', ok: ['call'], why: `${t.cls} is weak, even for half a blind.` };
  // limpers before me
  if (t.t <= 1) return { k: 'raise', to: iso, why: `Limpers call with worse hands, so the pot grows while you are ahead.` };
  if (t.pair && t.hi <= 9) return { k: 'raise', to: iso, ok: ['call'], why: `The raise isolates, represents a stronger hand and charges hands with equity. A set comes on about 1 flop in 8.5, but an overcard to ${t.cls} comes on most flops, and higher cards connect more often. Taking the pot or the lead now pays off later.` };
  if (t.t === 2) return !t.suited && !t.pair
    ? { k: 'raise', to: iso, ok: ['call'], why: `${t.cls} plays best against one player: high cards win more heads-up than in a crowd.` }
    : c.limpers >= 2 ? { k: 'call', ok: ['raise'], altTo: iso, why: `With ${c.limpers} limpers the pot pays well when ${t.cls} makes a straight, a flush or a set.` }
    : { k: 'raise', to: iso, ok: ['call'], why: 'Raise to isolate the limper. You take the lead and often win the pot on the flop.' };
  if (t.t === 3 && LATE.has(pos) && c.limpers >= 2 && (t.suited || t.pair)) return { k: 'call', ok: ['fold'], why: `In position with ${c.limpers} limpers, ${t.cls} can see a cheap flop.` };
  return { k: 'fold', why: `${t.cls} is ${TIER_WORD[t.t]}. Weak hands lose more chips after the flop than they win, even for a small price.` };
}
function decidePost(x: Spot): Rec {
  const { c, s, o } = x, river = c.st.key === 'river';
  const pot = c.potBefore, sz = (f: number) => Math.max(1, Math.round(pot * f));
  const value = s === 'monster' || s === 'strong';
  if (c.toCall === 0) {
    if (value) return x.aggBehind && !x.inPos
      ? { k: 'raise', to: sz(x.wet ? 0.66 : 0.5), ok: ['check'], why: `${cap(x.word)} beats most hands. Bet for value, or check to let the aggressive player bet for you.` }
      : { k: 'raise', to: sz(x.wet ? 0.66 : 0.5), why: `${cap(x.word)} beats most hands. Bet for value: worse hands call.${x.station ? ' A calling station calls a bigger bet.' : ''}` };
    if (s === 'overpair' || s === 'top') return river
      ? { k: 'raise', to: sz(0.5), ok: ['check'], why: 'Worse pairs call a medium bet. Check if the board turned scary.' }
      : { k: 'raise', to: sz(x.wet ? 0.6 : 0.4), ok: x.multi ? ['check'] : [], why: x.wet ? 'The board is wet: charge the draws.' : 'The board is dry: a small bet gets calls from worse hands.' };
    if (s === 'weak') return river
      ? { k: 'check', ok: x.station ? ['raise'] : [], why: 'A weak pair wins some showdowns, but a bet gets called only by better hands.' }
      : (x.wet && c.st.key === 'flop') || x.station ? { k: 'raise', to: sz(0.33), ok: ['check'], why: 'Bet small: it charges the draws, and weaker pairs call.' }
      : { k: 'check', ok: ['raise'], why: 'A weak pair wants a small pot. Take the free card.' };
    if (o >= 8 && !river) return { k: 'raise', to: sz(0.5), ok: ['check'], why: `A semi-bluff: it can win now, and your ${o} outs can win later. A check for a free card is fine too.` };
    // no pair and no strong draw: a bet is a bluff
    if (x.story) return { k: 'raise', to: sz(0.5), ok: ['check'], why: river
      ? `You bet the last street. A river bet keeps the story, but it is a pure bluff: it wins only when the caller folds.${x.station ? ' A calling station rarely folds, so giving up is fine too.' : ''}`
      : `You bet the last street. A second bet keeps the story of a strong hand. Give up if the card helps the callers${x.station ? ', and against a calling station' : ''}.` };
    if (x.cbet && x.others.length === 1 && !x.station) return { k: 'raise', to: sz(0.33), ok: ['check'], why: 'You raised before the flop and face one player. A small c-bet takes the pot often, because most flops miss most hands.' };
    if (x.stab && x.others.length <= 2 && !x.station) return { k: 'raise', to: sz(0.5), ok: ['check'], why: 'Everyone checked the last street, so nobody showed strength. A stab of about half the pot takes it often.' };
    if (river && x.folder) return { k: 'raise', to: sz(0.5), ok: ['check'], why: 'A player left folds to bets often. A bluff of about half the pot can take it.' };
    return { k: 'check', why: river ? 'You cannot win at showdown, and a bluff rarely works here.' : `A bluff into ${x.others.length > 1 ? 'several players' : x.station ? 'a calling station' : 'this spot'} rarely works. Take the free card.` };
  }
  // facing a bet
  const eq = o / Math.max(1, 50 - c.st.board.length);
  if (value) return x.noRaise
    ? { k: 'call', why: `${cap(x.word)} beats most all-in ranges. A raise is not possible: call.` }
    : { k: 'raise', to: 3 * c.high, ok: ['call'], why: `${cap(x.word)} beats most betting ranges. Raise to build the pot; a call to trap is fine too.` };
  if (s === 'overpair' || s === 'top') return { k: 'call', ok: !river && !x.noRaise ? ['raise'] : [], why: `${cap(x.word)} beats the bluffs and some value bets${c.need > 0.4 ? ', but fold to a second big bet' : ''}.` };
  if (s === 'weak') return c.need <= 0.25 ? { k: 'call', why: 'The price is small, and a weak pair beats a bluff.' } : { k: 'fold', why: `A weak pair beats only bluffs, and you need ${pct(c.need)}.` };
  if (o >= 4 && !river) return eq >= c.need * 0.8
    ? { k: 'call', ok: o >= 8 && !x.noRaise ? ['raise'] : [], why: `Your ${o} outs give about ${pct(eq)} on the next card. You need ${pct(c.need)}, and a hit can win more later.` }
    : { k: 'fold', why: `Your ${o} outs give about ${pct(eq)} on the next card, less than the ${pct(c.need)} you need.` };
  return { k: 'fold', ok: c.need <= 0.12 ? ['call'] : [], why: `With ${x.word} you beat only bluffs, and the price (${pct(c.need)}) is too high.` };
}
const NUM = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
/** The first letter in lower case, unless the text starts with a hand ("A7s") or a position. */
const low = (t: string) => (/^([2-9TJQKA]{2}|[A-Z]{2})/.test(t) ? t : t[0].toLowerCase() + t.slice(1));

/** The options at a price: a call, a re-raise (to about 3 times the bet) and a fold. No re-raise against an all-in. */
function choices(c: Ctx, noRaise: boolean): string {
  return `Call ${c.toCall}: you see ${NEXT[c.st.key] ?? 'the next card'} at this price.`
    + (noRaise ? '' : ` Re-raise to about ${3 * c.high}: you take the lead and fold out weaker hands, but you risk more when behind.`)
    + ` Fold: you save ${c.toCall} and give up the pot of ${c.potBefore}.`;
}

/** The recommended action as the first words of an answer. */
function verbOf(r: Rec, c: Ctx, pos: string): string {
  const pre = c.st.key === 'preflop';
  if (r.k === 'raise') return `${pre ? (c.raises > 0 ? 'Re-raise' : 'Raise') : c.toCall > 0 ? 'Raise' : 'Bet'}${r.to ? ` ${pre || c.toCall > 0 ? 'to ' : ''}about ${r.to}` : ''}`;
  if (r.k === 'call') return pre && c.raises === 0 ? (pos === 'SB' ? 'Complete the SB' : 'Limp behind') : 'Call';
  return r.k === 'check' ? 'Check' : 'Fold';
}

/** The closing comment on one action: the grade, then how it compares with the recommendation, what it shows and what
    the player can represent next. */
function closingFor(o: { did: Move; to: number; c: Ctx; x: Spot | null; rec: Rec | null; bb: number; repr: string; bluff: boolean; pos: string }): CritClose {
  const { did, rec, c, x } = o;
  const pre = c.st.key === 'preflop', river = c.st.key === 'river';
  const word = did === 'raise' ? (pre || c.toCall > 0 ? 'raise' : 'bet') : did;
  const risky = !!x && (x.station || x.others.length > 1);
  let g: CritGrade | undefined, v: string | undefined, why = '';
  const often: Record<Move, string> = {
    fold: 'A fold with a hand that is behind keeps your chips for better spots.',
    call: pre ? 'The price is small, and the hand plays well after the flop.' : 'The price fits your hand.',
    raise: pre ? 'A raise with a good hand builds a pot you are likely to win.' : 'A bet with a made hand is how a night is won.',
    check: pre ? 'Take the free flop with a hand that does not want to raise.' : 'Your hand does not want a bigger pot: a small pot loses less.',
  };
  if (rec) {
    const next = verbOf(rec, c, o.pos);
    if (rec.k === did) {
      if (did === 'raise' && !o.bluff && rec.to && o.to && o.to / rec.to < 0.7 && rec.to - o.to >= o.bb) { g = 'blue'; v = `${word === 'bet' ? 'Bet' : 'Raise'} a bit more`; why = `Aim for about ${rec.to}: a bigger ${word} charges worse hands more and folds out more draws.`; }
      else if (did === 'raise' && rec.to && o.to && o.to / rec.to > 1.8 && o.to - rec.to >= o.bb && !o.bluff) { g = 'blue'; v = 'A smaller size does the job'; why = `About ${rec.to} gets the same calls from worse hands and risks less.`; }
      else if (o.bluff && x?.story) { g = 'green'; v = 'Consistent story'; why = `${rec.why}`; }
      else { g = 'green'; v = `Good ${word}`; why = o.bluff ? rec.why : did === 'raise' && rec.to ? `Good size too. ${often.raise}` : often[did]; }
    } else if (rec.ok?.includes(did) && did === 'raise' && rec.altTo && o.to && o.to / rec.altTo < 0.7 && rec.altTo - o.to >= o.bb) {
      g = 'blue'; v = 'Raise a bit more'; why = `A raise is fine, but aim for about ${rec.altTo}: a small raise gets called by every limper. ${next} is the main line: ${low(rec.why)}`;
    } else if (rec.ok?.includes(did)) {
      g = 'green'; v = o.bluff && x?.story ? 'Consistent story' : 'Reasonable'; why = `${next} is the main line: ${low(rec.why)} Your ${word} works too.`;
    } else if (did === 'fold' && rec.k === 'check') {
      g = 'blue'; v = 'Free check'; why = 'Check next time: a fold when a check is free gives the pot away.';
    } else if (rec.k === 'raise' && (did === 'call' || did === 'check')) {
      g = 'blue'; v = 'Could go more aggressive'; why = `${next} next time. ${rec.why}`;
    } else if (did === 'raise' && o.bluff) {
      g = risky ? 'red' : 'blue'; v = 'Risky bluff'; why = `${next} next time. ${risky ? `A bluff into ${x!.station ? 'a calling station' : 'several players'} rarely works. ` : ''}${rec.why}`;
    } else if (did === 'raise' && x?.s === 'weak') {
      g = 'blue'; v = `${rec.k === 'call' ? 'Call' : rec.k === 'check' ? 'Check' : 'Fold'} instead`; why = `${next} next time. A raise with a weak pair gets called only by better hands, and it folds out the bluffs you beat.`;
    } else if (did === 'raise' && (rec.k === 'call' || rec.k === 'check')) {
      g = 'green'; v = 'Reasonable'; why = `A ${rec.k} risks less here, but the ${word} keeps the lead.`;
    } else if (rec.k === 'fold') {
      if (pre && did === 'call' && c.raises === 0) { g = 'blue'; v = 'Fold more often'; why = `A limp costs little, but ${low(rec.why)}`; }
      else if (did === 'raise') { g = 'red'; v = 'Fold here next time'; why = rec.why; }
      else { g = c.need <= 0.2 ? 'blue' : 'red'; v = 'Loose call'; why = `Fold next time. ${rec.why}`; }
    } else if (did === 'fold') {
      g = 'blue'; v = 'Too tight'; why = `${next} next time. ${rec.why}`;
    } else { g = 'green'; v = 'Reasonable'; why = rec.why; }
  }
  const allinCall = did === 'call' && (c.facingAllin || o.x?.noRaise);
  const shows = pre
    ? (did === 'raise' ? (c.raises > 0 ? 'A re-raise shows a very strong hand: few players continue without one.' : c.limpers > 0 ? 'An isolation raise shows a hand better than the limpers.' : 'A raise shows strength and takes the lead.')
      : did === 'call' ? (allinCall ? 'A call of an all-in ends the betting: the cards decide.' : c.raises > 0 ? 'A call shows a medium hand that wants a flop: pairs, suited cards, broadways.' : 'The table reads a limp as a capped hand: expect raises from players behind.')
      : did === 'check' ? 'A check keeps your range wide: nobody knows what you hold.' : 'A fold shows nothing about your hand.')
    : (did === 'raise' ? (c.toCall > 0 ? 'A raise is polarising: the table puts you on a very strong hand or a bluff.' : x?.story ? `A second bet in a row tells a story of a strong hand: you represent ${o.repr} or better.` : `A bet claims the pot: you now represent ${o.repr}.`)
      : did === 'call' ? (allinCall ? 'A call of an all-in ends the betting: the cards decide.' : 'A call shows a medium hand or a draw.')
      : did === 'check' ? 'A check shows a weak or medium hand, or a trap.' : 'A fold shows nothing about your hand.');
  const next = did === 'fold' || river || allinCall ? ''
    : pre ? (did === 'raise' ? 'On the flop: bet most boards, a third to half the pot. You represent the high cards.' : 'On the flop: you represent middle cards and draws. Bet the boards that fit them.')
    : did === 'raise' ? 'Next street: keep the story. Bet again on a safe card; slow down when the card helps the callers.'
    : did === 'call' ? 'Next street: if a draw card comes, a bet from you represents the draw that hit.'
    : 'Next street: a bet after a check can represent a slowplay or the card that came.';
  return { g, v, text: [why, shows, next].filter(Boolean).join(' ') };
}

interface Tally { valueBets: number; semis: number; bluffs: number; bluffSum: number; bluffed: boolean }
function thinkHand(p: Parsed, me: string, hole: Card[] | null, habits: Record<string, Habit>, blinds: { sb: number; bb: number }, tally: Tally) {
  const out: Notes = {};
  const close: Record<number, Record<number, CritClose>> = {};
  const add = (st: number, line: number, note: CritNote) => { ((out[st] ??= {})[line] ??= []).push(note); };
  const tell = (st: number, line: number, text: string) => add(st, line, { tone: 'info', text });
  /** A quiz question and its answer: the recommended action first, then the reason. */
  const ask = (st: number, line: number, q: string, a: string) => add(st, line, { tone: 'ask', text: q, a });
  const { bb } = blinds;
  const label = (x: string) => (p.posOf[x] ? `${p.posOf[x]} (${x})` : x);
  const hw = (x: string) => habitWord(habits[x]);
  const habitLine = (x: string) => { const w = hw(x); return w ? ` ${x} is ${w}.` : ''; };
  const is = (x: string, re: RegExp) => re.test(hw(x) ?? '');
  const myPos = p.posOf[me] ?? '';
  const t = hole ? tier(hole) : null;
  const yours = t ? t.cls : 'your hand';
  let imIn = Object.keys(p.posOf).includes(me);
  walk(p, blinds, (st, s) => {
    imIn = s.live.includes(me);
    if (!imIn || st.board.length < 3) return;
    const tx = texture(st.board);
    const sNow = hole ? made(hole, st.board) : null;
    const o = hole && st.board.length < 5 ? outs(hole, st.board) : 0;
    const valueHand = sNow === 'monster' || sNow === 'strong' || sNow === 'overpair' || sNow === 'top';
    const opp = s.live.filter((x) => x !== me);
    const stabOk = s.prevChecked && opp.length <= 2 && !opp.some((x) => is(x, /calling station/));
    if (st.key === 'flop') {
      const topC = [...st.board].sort((x, y) => rv(y) - rv(x))[0];
      tell(st.i, -1, `Flop ${boardText(st.board)}: ${tx.words.join(', ')}.`);
      const repr = `${oneOf(topC[0])}${rankCount(st.board, topC[0]) >= 2 ? ' (trips)' : ' (top pair)'}`;
      ask(st.i, -1, 'Is this board wet or dry?', tx.wet
        ? `Wet. A player representing ${repr} bets now, about half to two thirds of the pot, to deny the draws their equity.`
        : `Dry. Few draws can catch up, so a player representing ${repr} can bet small (a third of the pot) or check once to slowplay.`);
      const pair = Object.entries(st.board.reduce<Record<string, number>>((a, c) => ({ ...a, [c[0]]: (a[c[0]] ?? 0) + 1 }), {})).find(([, k]) => k >= 2);
      if (pair) { const left = 4 - pair[1] - (hole?.filter((c) => c[0] === pair[0]).length ?? 0); tell(st.i, -1, `${pair[1] === 2 ? 'Two' : 'Three'} ${PLURAL(pair[0])} show. Only ${left} ${left === 1 ? 'is' : 'are'} left${hole ? ' that you cannot see' : ''}.`); }
      const highBoard = st.board.some((c) => rv(c) >= 12);
      if (s.raiserPre) ask(st.i, -1, `${s.raiserPre === me ? 'You' : label(s.raiserPre)} raised before the flop. Does this board hit the raiser?`, highBoard
        ? 'Yes, often. High cards fit a raising range (big pairs, AK, AQ, KQ). Expect a continuation bet, and give it credit.'
        : 'Not often. Low and middle cards fit the callers. A bet from a caller is more believable than a bet from the raiser.');
      else ask(st.i, -1, 'Nobody raised before the flop. Which hands fit this board?',
        `Every range is wide and capped. ${st.board.some((c) => c[0] === 'A') ? 'Weak Ax' : 'Middle pairs'} and suited cards fit${tx.flush === 'draw' ? `, and ${SUIT_WORD[tx.flushSuit]} make a flush draw` : ''}.${pair ? ` Strong ${RANK_WORD(pair[0])}x is less likely.` : ''} A bet from you represents the hand that fits.`);
    } else {
      const nc = newCard(st.board, s.prevBoard);
      tell(st.i, -1, `${st.key === 'turn' ? 'Turn' : 'River'} ${nc.r}: the board is ${boardText(st.board)}. ${nc.parts.length ? `The ${nc.r} matters: ${nc.parts.join('; ')}.` : `The ${nc.r} changes little.`}`);
      const mine = !!hole && hole.some((c) => c[0] === nc.c[0]);
      ask(st.i, -1, `Which hands does the ${nc.r} help, and what do you do about it?`, `${nc.helps} ${
        !hole ? (nc.scary ? 'Slow down if a player bets: the card may have helped them.' : 'Little changed, so the plan from the last street holds.')
        : mine && nc.n <= 2 ? `The ${nc.r} helps you too: you now hold ${handWord(sNow!, hole, st.board)}.${valueHand ? ' Bet for value.' : ''}`
        : sNow === 'monster' || sNow === 'strong' ? 'You are still ahead of most of these hands. Keep betting for value.'
        : nc.n >= 3 ? `You play the board${sNow === 'none' ? '' : ` with ${handWord(sNow!, hole, st.board)}`}: your kicker decides most showdowns. Keep the pot small.`
        : valueHand ? (nc.scary ? 'Bet again if checked to you, but fold to a raise: a raise now often means the card hit.' : 'Bet again to charge draws. Slow down only if raised.')
        : sNow === 'weak' ? (nc.n === 1 ? `Your weak pair is behind any ${nc.r}x. Check, and fold to a big bet.` : 'Your weak pair now loses to trips. Check, and fold to a big bet.')
        : o >= 8 && st.key !== 'river' ? `You have no pair, but ${o} outs. Take a cheap card if you can.`
        : s.prevAgg === me ? 'You have no pair, but you bet the last street: a second bet keeps the story. Give up if you are raised.'
        : stabOk ? 'You have no pair, but everyone checked the last street: a stab of about half the pot can take it. Fold to a bet.'
        : 'You have no pair. Check, and fold to a bet.'}`);
      if (st.key === 'turn' && nc.before.flush === 'draw' && nc.tx.flush !== 'made') ask(st.i, -1, `The ${SUIT_WORD[nc.before.flushSuit]} did not come. If it is left to you, do you bet?`,
        hole && valueHand ? 'Yes. Bet about half the pot to deny the flush draw its equity: it must pay to see the river.' : hole && sNow === 'weak' ? 'Check. Your pair is weak: a bet gets called by better hands and folds out the worse ones.' : hole && s.prevAgg === me ? 'Yes, if the story fits: you bet the flop, and a second bet tells the same story.' : hole && stabOk ? 'Yes, a stab of about half the pot: everyone checked the flop, so nobody showed strength.' : hole ? 'Check. Without a pair, a bluff into players who called the flop rarely works.' : 'A made hand bets about half the pot here, so a flush draw pays to see the river.');
      if (st.key === 'river') {
        const missed = missedDraws(st.board);
        ask(st.i, -1, 'Which draws missed, and what does that mean for a river bet?', missed
          ? `${missed} missed. A missed draw cannot win at showdown, so it bluffs or gives up. A big river bet can be a missed draw: call it with a pair that beats bluffs.`
          : 'No common draw missed. A river bet is more likely value. Fold weak pairs to a big bet.');
      }
    }
    if (hole && sNow) tell(st.i, -1, `You hold ${handWord(sNow, hole, st.board)}${o >= 4 ? `, with ${o} cards that make a straight or better` : ''}.`);
  }, (c) => {
    const { a, st } = c;
    if (!imIn) return;
    const tx = st.board.length >= 3 ? texture(st.board) : null;
    const others = c.live.filter((x) => x !== me);
    if (a.who === me) {
      const s: Made | null = hole && st.board.length >= 3 ? made(hole, st.board) : null;
      const o = hole && st.board.length >= 3 && st.board.length < 5 ? outs(hole, st.board) : 0;
      const valueHand = s === 'monster' || s === 'strong' || s === 'overpair' || s === 'top';
      const noRaise = c.facingAllin || !others.some((x) => !c.allin.has(x));
      const x: Spot | null = hole ? {
        c, me, pos: myPos, hole, s, o, word: s ? handWord(s, hole, st.board) : '', others,
        station: others.some((y) => is(y, /calling station/)), folder: others.some((y) => is(y, /folding to bets|tight/)) && !others.some((y) => is(y, /calling station/)),
        aggBehind: c.behind.some((y) => is(y, /aggressive/)), inPos: c.behind.length === 0, noRaise,
        story: st.key !== 'flop' && st.key !== 'preflop' && c.prevAgg === me, cbet: st.key === 'flop' && c.raiserPre === me && !c.firstBet,
        stab: c.prevChecked && c.toCall === 0, wet: !!tx?.wet, multi: others.length > 1, raiserPos: c.highBy ? p.posOf[c.highBy] ?? '' : '',
      } : null;
      const rec: Rec | null = x ? (st.key === 'preflop' ? decidePre(x) : decidePost(x)) : null;
      const answer = (generic: string) => (rec ? `${verbOf(rec, c, myPos)}. ${rec.why}` : generic) + (c.toCall > 0 && st.key !== 'preflop' || c.high > c.level ? ` ${choices(c, noRaise)}` : '');
      const did = moveOf(a, c.isRaise);
      if (st.key === 'preflop') {
        if (a.k === 'straddle') return;
        if (c.high > c.level) {
          const r = [...st.acts.slice(0, c.ai)].reverse().find((y) => y.to === c.high && y.who !== me);
          const rp = r ? p.posOf[r.who] ?? '' : '';
          if (r) tell(st.i, a.line, `${label(r.who)} ${r.k === 'allin' ? 'is all-in for' : 'raised to'} ${c.high} (${r2(c.high / bb)} BB).${EARLY.has(rp) ? ' From early position this shows a strong range.' : LATE.has(rp) ? ' From late position this can be a steal, so the range is wide.' : ''}${habitLine(r.who)}`);
          ask(st.i, a.line, noRaise ? `${t ? t.cls : 'Your hand'} faces an all-in. Call or fold?` : `Is ${yours} ahead of that range? Call, re-raise or fold?`,
            answer('Re-raise premium hands, call with pairs and suited connectors when the price is small, and fold the rest.'));
        } else if (c.limpers === 0 && c.toCall > 0) {
          const range = EARLY.has(myPos) ? 'a tight range: pairs 77 and up, AQ and up, suited broadways' : LATE.has(myPos) || myPos === 'SB' ? 'a wide range: any pair, any ace, suited connectors, broadways' : 'a medium range: most pairs, AT and up, suited broadways and connectors';
          ask(st.i, a.line, `Nobody has entered and ${c.behind.length} ${c.behind.length === 1 ? 'player acts' : 'players act'} after you. Which hands open from ${myPos}, and to what size?`,
            `${rec ? `${verbOf(rec, c, myPos)}. ${rec.why} ` : ''}Open ${range}. Raise to 2.5 to 3 BB (${2.5 * bb} to ${3 * bb}); do not limp.`);
        } else {
          if (c.limpers > 0) tell(st.i, a.line, `${c.limpers} ${c.limpers === 1 ? 'player limps' : 'players limp'} before you. A limp shows a capped range: premium hands usually raise.`);
          ask(st.i, a.line, c.toCall === 0 ? 'Nobody raised. Do you check the option or raise?' : myPos === 'SB' ? `With ${yours}, do you complete, raise or fold?` : `With ${yours}, do you limp behind, raise or fold?`,
            answer('Raise a strong hand to isolate the limpers; fold a weak one. Small pairs and suited cards can limp behind with several limpers.'));
        }
      } else if (c.toCall === 0) {
        const checkedTo = c.ai > 0 && st.acts.slice(0, c.ai).every((y) => y.k === 'check');
        if (checkedTo) tell(st.i, a.line, `The players before you check${c.behind.length === 0 ? ': you are last to act' : ''}.${others.length === 1 ? habitLine(others[0]) : ''}`);
        const agg = c.behind.find((y) => is(y, /aggressive/));
        if (agg) tell(st.i, a.line, `${label(agg)} acts after you and is ${hw(agg)}. Plan your answer to a bet before you check.`);
        ask(st.i, a.line, x?.story ? 'You bet the last street. Bet again, or give up?' : x?.cbet ? 'You raised before the flop. C-bet, or check?' : c.behind.length === 0 ? 'Bet or check?' : 'You act first. Check, or lead out?',
          answer('Bet a made hand to charge draws. Check a weak hand to control the pot.'));
        if (c.isRaise) tell(st.i, a.line, `You bet ${a.to} into ${c.potBefore} (${pct(a.to / Math.max(1, c.potBefore))} of the pot).`);
      } else {
        if (c.isRaise) tell(st.i, a.line, `You raise to ${a.to} into ${c.potBefore} (${pct((a.to - c.prev) / Math.max(1, c.potBefore))} of the pot).`);
        ask(st.i, a.line, noRaise ? `Call the all-in or fold? You need ${pct(c.need)} to call.` : `Which hands bet like this, and do you beat enough of them? You need ${pct(c.need)} to call.`,
          answer('Call with a hand that beats the bettor\'s bluffs, or a draw with enough outs. Fold the rest.'));
      }
      if (c.isRaise && st.key !== 'preflop') {
        for (const y of others) {
          if (is(y, /calling station/)) tell(st.i, a.line, `${y} is ${hw(y)}. Bet bigger for value against ${y}, and do not bluff ${y}.`);
          else if (is(y, /folding to bets/)) tell(st.i, a.line, `${y} is ${hw(y)}. Bluffs work better against ${y}; a value bet may get no call.`);
        }
      }
      // tally the bets after the flop
      const bluff = !!hole && st.board.length >= 3 && c.isRaise && !valueHand && s !== 'weak' && o < 8;
      if (hole && st.board.length >= 3 && c.isRaise) {
        if (valueHand) tally.valueBets++;
        else if (o >= 8 && st.key !== 'river') tally.semis++;
        else if (bluff) { tally.bluffs++; tally.bluffSum += (a.to - c.prev) / Math.max(1, c.potBefore); tally.bluffed = true; }
      }
      const top = [...st.board].sort((y, z) => rv(z) - rv(y))[0];
      const repr = top ? (rankCount(st.board, top[0]) >= 3 ? `trip ${PLURAL(top[0])} with a high kicker` : rankCount(st.board, top[0]) === 2 ? `trip ${PLURAL(top[0])}` : `top pair (${RANK_WORD(top[0])})`) : 'a strong hand';
      (close[st.i] ??= {})[a.line] = closingFor({ did, to: a.to, c, x, rec, bb, repr, bluff, pos: myPos });
    } else {
      // another player's action, read from my seat
      if (st.key === 'preflop' && a.k === 'check') {
        ask(st.i, a.line, `What does a check from ${a.who} tell you?`, `${a.who} has a wide, weak range: the BB checks most hands that do not want to raise.${habitLine(a.who)} Bet a made hand for value on the flop, and do not fear the BB.`);
      } else if (c.isRaise) {
        const size = (a.to - c.prev) / Math.max(1, c.potBefore);
        const verb = a.k === 'allin' ? 'is all-in for' : c.firstBet || st.key === 'preflop' ? 'raises to' : 'bets';
        tell(st.i, a.line, `${label(a.who)} ${verb} ${a.to}${st.key === 'preflop' ? ` (${r2(a.to / bb)} BB)` : ` (${pct(size)} of the pot)`}.${habitLine(a.who)}`);
        const pos = p.posOf[a.who] ?? '';
        if (st.key === 'preflop') ask(st.i, a.line, `Which hands raise from ${pos || 'this seat'}?`,
          `${EARLY.has(pos) ? 'Strong hands: big pairs, AK, AQ, suited broadways.' : LATE.has(pos) ? 'A wide range: any pair, any ace, suited connectors, broadways.' : 'A medium range: most pairs, good aces, suited broadways.'}${is(a.who, /loose|aggressive/) ? ` ${a.who} raises wider than that: re-raise your strong hands for value.` : is(a.who, /tight/) ? ` ${a.who} is tight: give the raise credit and fold medium hands.` : ''}`);
        else {
          const toMe = Math.max(0, a.to - (c.put[me] ?? 0));
          const needMe = toMe / Math.max(1, c.potBefore + c.add + toMe);
          ask(st.i, a.line, `Which hands ${a.k === 'allin' ? 'go all-in' : 'bet this size'} on ${boardText(st.board)}?`,
            `${a.k === 'allin' && c.firstBet ? 'An all-in over a raise is very strong: the best hands on this board, rarely a bluff.' : size > 1 ? 'An overbet is polarising: very strong hands or bluffs. Call with a hand that beats bluffs; fold weak pairs.' : size < 0.35 ? 'A small bet often wants a call: a strong hand, or a cheap bluff. Call with any pair; raise a strong hand.' : 'Value hands and draws.'} You need about ${pct(needMe)} to call.${is(a.who, /aggressive/) ? ` ${a.who} bets often, so call wider.` : is(a.who, /tight|calling station/) ? ` ${a.who} rarely bets without a hand: fold weak pairs.` : ''}`);
        }
      }
    }
  }, (st, live) => {
    if (st.key !== 'preflop' && st.acts.length > 1 && st.acts.every((x) => x.k === 'check') && live.includes(me)) {
      const last = st.acts[st.acts.length - 1].line;
      const aggs = live.filter((x) => x !== me && is(x, /aggressive/));
      ask(st.i, last, 'Who is slowplaying, and who gave up?', `Most often nobody has much.${aggs.length ? ` A check from ${aggs.join(' or ')} (aggressive so far) is weak more often than a trap.` : ''} On the next street, a bet of about half the pot takes it often, most of all in position.`);
    }
  });
  return { deep: out, close };
}

/* ------------------------------- the critique ------------------------------- */

/** One player's critique for the night. `cards` holds the player's own entries by hand number, with the clash mark. */
export function critiqueFor(views: HandView[], me: string, cards: Record<number, { cards: Card[]; lvl: 'red' | 'blue' | null }>, blinds: { sb: number; bb: number }): PlayerCrit {
  const habits: Record<string, Habit> = {};
  const out: HandCrit[] = [];
  let bluffsWon = 0;
  const tally: Tally = { valueBets: 0, semis: 0, bluffs: 0, bluffSum: 0, bluffed: false };
  for (const v of [...views].sort((a, b) => a.n - b.n)) {
    const p = parseView(v);
    const mineIn = Object.keys(p.posOf).includes(me) || p.streets.some((s) => s.acts.some((a) => a.who === me));
    const entry = cards[v.n];
    if (mineIn) {
      const lines = commentate(p, blinds, habits);
      if (entry?.lvl === 'red') out.push({ n: v.n, status: 'invalid', verdict: { tone: 'info', label: 'Invalid hand' }, lines });
      else {
        tally.bluffed = false;
        const hole = entry?.cards?.length === 2 ? entry.cards : null;
        const th = thinkHand(p, me, hole, habits, blinds, tally);
        if (tally.bluffed && p.winners.includes(me)) bluffsWon++;
        // the hand's verdict: the worst grade of my actions (red, then blue, then green)
        const graded = Object.values(th.close).flatMap((x) => Object.values(x)).filter((x) => x.g && x.v);
        const worst = graded.sort((x, y) => RANK_G[y.g!] - RANK_G[x.g!])[0];
        out.push({ n: v.n, status: hole ? 'cards' : 'nocards', lines, deep: th.deep, close: th.close,
          verdict: worst ? { tone: worst.g === 'green' ? 'good' : 'warn', label: worst.v!, g: worst.g } : undefined });
      }
    }
    learn(habits, p);
  }
  return { hands: out, bluffs: tally.bluffs, bluffsWon, bluffSize: tally.bluffs ? tally.bluffSum / tally.bluffs : 0, semis: tally.semis, valueBets: tally.valueBets };
}
