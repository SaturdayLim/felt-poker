/* Gameplay critique (owner, 16 Nov 2026). Rule-based comments on how one player played each hand, from that player's
   own point of view: their own entered cards (never another player's hidden cards) and the public record of the hand
   (the action they faced, the board, the positions, the pot and the habits the other players showed earlier in the night).
   - A hand whose entry has a red clash is skipped as an invalid hand. A blue clash counts as recorded.
   - A hand with no entry gets comments on the action and the position only.
   The input is the written action log (HandView): its lines follow one fixed grammar (src/report/logText.ts), so the
   actions, amounts and positions can be read back from it. The same code runs in the report builder and in old reports. */
import type { Card } from '../types';
import { RANKS, bestHand, DECK } from '../lib/cards';
import type { HandView } from './model';

export type CritTone = 'good' | 'warn' | 'info' | 'ask';
/** `a`: the answer to a question (tone 'ask'), a recommended action and its reason. The report hides it until a tap. */
export interface CritNote { tone: CritTone; text: string; a?: string }
/** Comments for one hand: `lines[street][line]` holds the notes under that line of the action log. */
export interface HandCrit {
  n: number;
  status: 'cards' | 'nocards' | 'invalid';
  /** A short verdict for the hand list ("Good fold", "Possible bluff"). */
  verdict?: { tone: CritTone; label: string };
  lines: Record<number, Record<number, CritNote[]>>;
  /** Advanced insights: the thought process, street by street. Line -1 = notes on the street's cards (texture). */
  deep?: Record<number, Record<number, CritNote[]>>;
}
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
      else if (/ (calls|call)\./.test(tail)) k = 'call';
      else if (/ (folds|fold)\./.test(tail)) k = 'fold';
      else if (/ (checks|check)\./.test(tail)) k = 'check';
      for (const w of who) acts.push({ who: w.name, pos: w.pos, k, to: num, allin, line });
    });
    streets.push({ i, key, board: st.cards, acts });
  });
  const winners = /^(.+?) wins/.exec(v.result)?.[1]?.split(/, | and /).map((x) => x.replace(/ wins.*$/, '')) ?? [];
  return { n: v.n, streets, posOf, winners };
}

/* ------------------------------- hand strength ------------------------------- */

const rv = (c: Card) => 14 - RANKS.indexOf(c[0]);
function boardCat(board: Card[]): number {
  if (board.length >= 5) return bestHand(board)?.category ?? 0;
  const n = Object.values(board.reduce<Record<string, number>>((a, c) => ({ ...a, [c[0]]: (a[c[0]] ?? 0) + 1 }), {})).sort((a, b) => b - a);
  return n[0] === 4 ? 7 : n[0] === 3 ? 3 : n[0] === 2 && n[1] === 2 ? 2 : n[0] === 2 ? 1 : 0;
}
type Made = 'monster' | 'strong' | 'overpair' | 'top' | 'weak' | 'none';
const MADE_WORD: Record<Made, string> = { monster: 'a straight or better', strong: 'two pair or trips', overpair: 'an overpair', top: 'top pair', weak: 'a weak pair', none: 'no pair' };
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
function tier(hole: Card[]): { t: number; cls: string } {
  const [a, b] = [...hole].sort((x, y) => rv(y) - rv(x));
  const pair = a[0] === b[0], suited = a[1] === b[1], hi = rv(a), lo = rv(b);
  const cls = pair ? `${a[0]}${b[0]}` : `${a[0]}${b[0]}${suited ? 's' : 'o'}`;
  if (pair) return { t: hi >= 12 ? 0 : hi >= 10 ? 1 : 2, cls };
  if (hi === 14 && lo === 13) return { t: 0, cls };
  if (hi === 14 && lo === 12 || (suited && (hi === 14 && lo === 11 || hi === 13 && lo === 12))) return { t: 1, cls };
  if (suited && (hi === 14 || (lo >= 10) || hi - lo === 1 && lo >= 5)) return { t: 2, cls };
  if (lo >= 10 || (hi === 14 && lo >= 10)) return { t: 2, cls };
  if (suited || (lo >= 9 && hi - lo <= 2) || hi === 14) return { t: 3, cls };
  return { t: 4, cls };
}
const NEXT: Record<string, string> = { preflop: 'the flop', flop: 'the turn', turn: 'the river', river: 'the showdown' };
/** What each answer to a bet serves: a call, a re-raise (to about 3 times the bet) and a fold. */
function choices(toCall: number, high: number, pot: number, street: string): string {
  return `Call ${toCall}: you see ${NEXT[street] ?? 'the next card'} at this price, and weaker hands stay in with you. `
    + `Re-raise to about ${3 * high}: you take the lead, fold out weaker hands and deny draws their equity, but you risk more when behind. `
    + `Fold: you save ${toCall} and give up the pot of ${pot}.`;
}
const TIER_WORD = ['a premium hand', 'a strong hand', 'a playable hand', 'a marginal hand', 'a weak hand'];

/* ------------------------------- habits of the table ------------------------------- */

interface Habit { hands: number; vpip: number; pfr: number; aggr: number; calls: number; faced: number; foldsFaced: number }
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
  const seen = new Set<string>();
  for (const st of p.streets) {
    let high = st.key === 'preflop' ? 2 : 0;
    for (const a of st.acts) {
      const h = (habits[a.who] ??= { hands: 0, vpip: 0, pfr: 0, aggr: 0, calls: 0, faced: 0, foldsFaced: 0 });
      if (!seen.has(a.who)) { seen.add(a.who); h.hands++; }
      if (st.key === 'preflop') {
        if ((a.k === 'call' || a.k === 'raise' || a.k === 'allin' || a.k === 'bet') && !h[`v${p.n}` as never]) { h.vpip++; (h as never as Record<string, boolean>)[`v${p.n}`] = true; }
        if ((a.k === 'raise' || a.k === 'allin') && !(h as never as Record<string, boolean>)[`r${p.n}`]) { h.pfr++; (h as never as Record<string, boolean>)[`r${p.n}`] = true; }
      } else {
        if (a.k === 'bet' || a.k === 'raise' || a.k === 'allin') h.aggr++;
        if (a.k === 'call') h.calls++;
        if (high > 0 && (a.k === 'call' || a.k === 'fold' || a.k === 'raise')) { h.faced++; if (a.k === 'fold') h.foldsFaced++; }
      }
      if (a.to > high) high = a.to;
    }
  }
}

/* ------------------------------- the critique ------------------------------- */

/** One player's critique for the night. `cards` holds the player's own entries by hand number, with the clash mark. */
export function critiqueFor(views: HandView[], me: string, cards: Record<number, { cards: Card[]; lvl: 'red' | 'blue' | null }>, blinds: { sb: number; bb: number }): PlayerCrit {
  const { sb, bb } = blinds;
  const habits: Record<string, Habit> = {};
  const out: HandCrit[] = [];
  let bluffs = 0, bluffsWon = 0, bluffSum = 0, semis = 0, valueBets = 0;
  for (const v of [...views].sort((a, b) => a.n - b.n)) {
    const p = parseView(v);
    const mineIn = Object.keys(p.posOf).includes(me) || p.streets.some((s) => s.acts.some((a) => a.who === me));
    const entry = cards[v.n];
    if (mineIn) {
      if (entry?.lvl === 'red') out.push({ n: v.n, status: 'invalid', verdict: { tone: 'info', label: 'Invalid hand' }, lines: {} });
      else { const hc = one(p, me, entry?.cards ?? null); hc.deep = thinkHand(p, me, entry?.cards ?? null, habits, blinds); out.push(hc); }
    }
    learn(habits, p);
  }
  function one(p: Parsed, me: string, hole: Card[] | null): HandCrit {
    const hc: HandCrit = { n: p.n, status: hole ? 'cards' : 'nocards', lines: {} };
    const say = (st: number, line: number, tone: CritTone, text: string) => { ((hc.lines[st] ??= {})[line] ??= []).push({ tone, text }); };
    const verdicts: { tone: CritTone; label: string }[] = [];
    const myPos = p.posOf[me] ?? '';
    const folded = new Set<string>();
    let pot = 0, raiserPre: string | null = null, story: string[] = [], bluffedHere = false;
    const players = Object.keys(p.posOf);
    for (const st of p.streets) {
      const put: Record<string, number> = {};
      let high = 0, last = 0, raises = 0, firstBet: string | null = null;
      if (st.key === 'preflop') {
        const sbN = players.find((x) => p.posOf[x] === 'SB'), bbN = players.find((x) => p.posOf[x] === 'BB');
        if (sbN) put[sbN] = sb;
        if (bbN) put[bbN] = bb;
        high = bb; last = bb; pot = (sbN ? sb : 0) + (bbN ? bb : 0);
        if (!sbN) pot += sb; // a small blind that folded with no line still posted
      }
      const active = () => players.filter((x) => !folded.has(x));
      const inPos = () => { const a = active().sort((x, y) => ORDER.indexOf(p.posOf[x]) - ORDER.indexOf(p.posOf[y])); return a[a.length - 1] === me; };
      const strength = hole && st.board.length >= 3 ? made(hole, st.board) : null;
      const o = hole && st.board.length >= 3 && st.board.length < 5 ? outs(hole, st.board) : 0;
      const unseen = 52 - 2 - st.board.length;
      const checkedBefore = new Set<string>();
      for (const a of st.acts) {
        const prev = put[a.who] ?? 0;
        const toCall = Math.max(0, high - prev);
        const potBefore = pot;
        let add = 0;
        if (a.k === 'call') add = (a.allin && a.to ? a.to : high) - prev;
        else if (a.k === 'bet' || a.k === 'raise' || a.k === 'allin' || a.k === 'straddle') add = a.to - prev;
        add = Math.max(0, add);
        const isRaise = a.to > high && (a.k === 'raise' || a.k === 'allin' || a.k === 'bet' || a.k === 'straddle');
        const facing = high > 0 && st.key !== 'preflop' ? high : st.key === 'preflop' ? high : 0;
        if (a.who === me) {
          const habitOf = (x: string) => habitWord(habits[x]);
          const left = active().filter((x) => x !== me && ORDER.indexOf(p.posOf[x]) > ORDER.indexOf(myPos));
          // ---------- what the action I face says ----------
          if (toCall > 0 && st.key !== 'preflop' && firstBet && firstBet !== me) {
            const need = toCall / (potBefore + toCall);
            const hw = habitOf(firstBet);
            say(st.i, a.line, 'info', `You must put in ${toCall} to win a pot of ${potBefore}. A call needs to win ${pct(need)} of the time.${hw ? ` ${firstBet} is ${hw}.` : ''}`);
            say(st.i, a.line, 'info', choices(toCall, high, potBefore, st.key));
          } else if (toCall > bb && st.key === 'preflop' && raises > 0) {
            const need = toCall / (potBefore + toCall);
            const r = [...st.acts].reverse().find((x) => x.to === high && x.who !== me);
            const hw = r ? habitOf(r.who) : null;
            say(st.i, a.line, 'info', `You face a raise to ${high} (${r2(high / bb)} BB)${r ? ` from ${p.posOf[r.who] || r.who}` : ''}. A call needs ${pct(need)} equity.${r && EARLY.has(p.posOf[r.who]) ? ' A raise from early position shows a strong range.' : ''}${hw ? ` ${r!.who} is ${hw}.` : ''}`);
            say(st.i, a.line, 'info', choices(toCall, high, potBefore, st.key));
          }
          // ---------- what my action says ----------
          if (st.key === 'preflop') {
            const t = hole ? tier(hole) : null;
            const late = LATE.has(myPos), early = EARLY.has(myPos);
            if (a.k === 'fold') {
              if (!t) say(st.i, a.line, 'info', toCall > bb ? `A fold to a raise from ${myPos} keeps your chips for a better spot.` : `A fold from ${myPos} before anyone raised. With no entry, the fold cannot be checked.`);
              else if (t.t === 0) { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[0]}. Folding it before the flop gives up a big edge. Raise or call.`); verdicts.push({ tone: 'warn', label: 'Too tight' }); }
              else if (t.t === 1 && raises <= 1) { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[1]}. Against ${raises ? 'one raise' : 'no raise'} it is usually worth a call or a raise.`); verdicts.push({ tone: 'warn', label: 'Too tight' }); }
              else if (t.t >= 3) { say(st.i, a.line, 'good', `${t.cls} is ${TIER_WORD[t.t]}. Folding it${toCall > bb ? ' to a raise' : ''} is right.`); verdicts.push({ tone: 'good', label: 'Good fold' }); }
              else if (myPos === 'BB' && toCall <= bb * 1.5) { say(st.i, a.line, 'warn', `${t.cls} in the BB faces a small raise. You need only ${pct(toCall / (potBefore + toCall))} equity, so a call is usually right.`); verdicts.push({ tone: 'warn', label: 'Could defend' }); }
              else { say(st.i, a.line, 'good', `${t.cls} is ${TIER_WORD[t.t]}. A fold to ${raises > 1 ? 'a re-raise' : 'a raise'} out of position is reasonable.`); verdicts.push({ tone: 'good', label: 'Reasonable fold' }); }
            } else if (a.k === 'check') {
              say(st.i, a.line, 'info', `A check in the BB sees the flop for free.${t && t.t <= 1 ? ` With ${t.cls} a raise builds the pot for your strong hand.` : ''}`);
              if (t && t.t <= 1) verdicts.push({ tone: 'warn', label: 'Could go more aggressive' });
            } else if (a.k === 'call' && raises === 0) {
              // a limp
              say(st.i, a.line, 'info', `A limp (a call of the BB) shows a capped range: the table reads it as a hand that did not want to raise.`);
              if (t && t.t <= 1) { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[t.t]}. Raise to about 3 BB (${3 * bb}) plus 1 BB for each limper, so weaker hands pay to see the flop.`); verdicts.push({ tone: 'warn', label: 'Could go more aggressive' }); }
              else if (t && t.t === 4 && myPos !== 'SB') { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[4]}. It loses money in most pots. A fold is cheaper.`); verdicts.push({ tone: 'warn', label: 'Loose call' }); }
            } else if (a.k === 'call') {
              if (t && t.t === 0) { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[0]}. A re-raise to about 3 times the raise wins more from weaker hands and thins the field.`); verdicts.push({ tone: 'warn', label: 'Could go more aggressive' }); }
              else if (t && t.t >= 4) { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[4]}. Calling a raise with it pays to play a hand that rarely wins.`); verdicts.push({ tone: 'warn', label: 'Loose call' }); }
              else if (t && t.t === 3 && !late && myPos !== 'BB') { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[3]} and you play it out of position after the flop. A fold is usually better.`); verdicts.push({ tone: 'warn', label: 'Loose call' }); }
              else if (t) say(st.i, a.line, 'good', `${t.cls} is ${TIER_WORD[t.t]}. A call is reasonable here${late || myPos === 'BB' ? '' : ', but you act first after the flop'}.`);
            } else if (isRaise) {
              const size = a.to / bb;
              if (raises === 0) {
                say(st.i, a.line, 'info', early ? `An open raise from ${myPos} reads as a strong range: many players still act after you.` : late ? `An open raise from ${myPos} can be a steal: only the blinds are left to act.` : `An open raise to ${r2(size)} BB.`);
                if (size < 2.2) { say(st.i, a.line, 'warn', `${r2(size)} BB is a small raise. Most players call it with any two cards. Aim for 2.5 to 3 BB (${2.5 * bb} to ${3 * bb}).`); verdicts.push({ tone: 'warn', label: 'Aim for a different sizing' }); }
                else if (size > 5) { say(st.i, a.line, 'warn', `${r2(size)} BB is a large open. Strong hands win the same with 3 BB, and weak hands risk more. Aim for 2.5 to 3 BB.`); verdicts.push({ tone: 'warn', label: 'Aim for a different sizing' }); }
              } else {
                say(st.i, a.line, 'info', `A re-raise (a ${raises === 1 ? '3-bet' : `${raises + 2}-bet`}) is a polarising move: it shows a very strong hand or a bluff.`);
              }
              if (t && t.t <= 1) { say(st.i, a.line, 'good', `${t.cls} is ${TIER_WORD[t.t]}. Raising builds the pot when you are ahead.`); verdicts.push({ tone: 'good', label: 'Good raise' }); }
              else if (t && t.t === 4 && !late) { say(st.i, a.line, 'warn', `${t.cls} is ${TIER_WORD[4]}. A raise with it from ${myPos} is a bluff that the players behind can punish.`); verdicts.push({ tone: 'warn', label: 'Possible bluff' }); }
              raiserPre = me;
            }
            story.push(a.k === 'fold' ? 'fold' : isRaise ? 'raise' : a.k === 'check' ? 'check' : 'call');
          } else {
            const potPct = (amt: number) => amt / Math.max(1, potBefore);
            if (isRaise) {
              const amount = a.to - prev, size = potPct(amount);
              const cbet = raiserPre === me && st.key === 'flop' && !firstBet;
              const donk = !firstBet && raiserPre && raiserPre !== me && st.key === 'flop';
              const checkRaise = checkedBefore.has(me) && firstBet && firstBet !== me;
              const tag = cbet ? 'A continuation bet (c-bet): you raised before the flop and keep the lead.' : donk ? `A lead into the pre-flop raiser (a donk bet). It often shows a made hand or a draw.` : checkRaise ? 'A check-raise is a polarising move: it shows a very strong hand or a bluff.' : size > 1 ? 'An overbet (more than the pot) is polarising: very strong or a bluff.' : '';
              say(st.i, a.line, 'info', `${tag ? `${tag} ` : ''}Size: ${pct(size)} of the pot.${inPos() ? ' You are in position.' : ''}`);
              if (strength) {
                const draw = o >= 8;
                if (strength === 'monster' || strength === 'strong' || strength === 'overpair' || strength === 'top') {
                  valueBets++;
                  if (size < 0.33 && st.board.length < 5) { say(st.i, a.line, 'warn', `You hold ${MADE_WORD[strength]}. A bet under a third of the pot gives draws a cheap card. Aim for half to two thirds of the pot.`); verdicts.push({ tone: 'warn', label: 'Aim for a different sizing' }); }
                  else { say(st.i, a.line, 'good', `You hold ${MADE_WORD[strength]}. A value bet: worse hands can call.`); verdicts.push({ tone: 'good', label: 'Good value bet' }); }
                } else if (strength === 'weak' && !draw) {
                  say(st.i, a.line, 'info', `You hold ${MADE_WORD.weak}. A bet here is thin value or protection: better hands call, and many worse hands fold.${size > 0.75 ? ' A smaller bet risks less for the same result.' : ''}`);
                } else if (draw) {
                  semis++;
                  say(st.i, a.line, 'good', `A semi-bluff: no pair yet, but ${o} outs (about ${pct(o / unseen)} on the next card). The bet can win now, and the draw can win later.`); verdicts.push({ tone: 'good', label: 'Semi-bluff' });
                } else {
                  bluffs++; bluffSum += size; bluffedHere = true;
                  const need = amount / (potBefore + amount);
                  const station = left.concat(active().filter((x) => x !== me)).map((x) => [x, habitWord(habits[x])] as const).find(([, w]) => w?.startsWith('a calling station'));
                  say(st.i, a.line, station ? 'warn' : 'info', `You hold ${MADE_WORD[strength]} and no strong draw: this is a bluff. It needs folds ${pct(need)} of the time to pay.${station ? ` ${station[0]} is ${station[1]}: bluffs rarely work against that.` : ''}`);
                  verdicts.push({ tone: station ? 'warn' : 'info', label: 'Possible bluff' });
                }
              }
              story.push('bet');
            } else if (a.k === 'check') {
              checkedBefore.add(me);
              if (strength === 'monster' || strength === 'strong') {
                const st2 = active().filter((x) => x !== me).map((x) => [x, habitWord(habits[x])] as const).find(([, w]) => w?.startsWith('a calling station'));
                say(st.i, a.line, 'warn', `You hold ${MADE_WORD[strength]} and check (a slowplay).${st2 ? ` ${st2[0]} is ${st2[1]}: bet for value instead.` : ' A bet usually wins more.'}`);
                verdicts.push({ tone: 'warn', label: 'Could go more aggressive' });
              } else if (strength && o >= 8 && inPos()) say(st.i, a.line, 'good', `A check in position with a draw (${o} outs) takes a free card.`);
              else if (raiserPre === me && st.key === 'flop' && !firstBet) say(st.i, a.line, 'info', 'You raised before the flop and now check: the c-bet is skipped. The table reads it as weakness.');
              const agg = left.map((x) => [x, habitWord(habits[x])] as const).find(([, w]) => w && /aggressive/.test(w));
              if (agg && !firstBet) say(st.i, a.line, 'info', `${agg[0]} acts after you and is ${agg[1]}. Expect a bet after your check: plan your answer before you check.`);
              story.push('check');
            } else if (a.k === 'call') {
              const need = toCall / (potBefore + toCall);
              if (strength) {
                if (strength === 'none' && o < 8 && need < 0.2) say(st.i, a.line, 'info', `You call with ${MADE_WORD.none} at a small price (${pct(need)}). High cards or a bettor who bluffs often can make this call pay.`);
                else if (strength === 'none' && o < 8) { say(st.i, a.line, 'warn', `You call with ${MADE_WORD.none} and no strong draw. The call needs ${pct(need)} equity. Fold, or raise as a bluff.`); verdicts.push({ tone: 'warn', label: 'Loose call' }); }
                else if (strength === 'none' || (strength === 'weak' && o >= 8)) {
                  const eq = o / unseen;
                  say(st.i, a.line, eq >= need ? 'good' : 'warn', `${o} outs give about ${pct(eq)} on the next card. The call needs ${pct(need)}.${eq >= need ? ' The price is right.' : ' The price is too high unless more chips come later.'}`);
                  verdicts.push({ tone: eq >= need ? 'good' : 'warn', label: eq >= need ? 'Good call' : 'Loose call' });
                } else if (strength === 'weak' && need > 0.33 && st.key === 'river') { say(st.i, a.line, 'warn', `A weak pair calls a big river bet. A large river bet is rarely a bluff at most tables.`); verdicts.push({ tone: 'warn', label: 'Loose call' }); }
                else if (strength === 'monster') { say(st.i, a.line, 'warn', `You hold ${MADE_WORD.monster}. A raise wins more than a call.`); verdicts.push({ tone: 'warn', label: 'Could go more aggressive' }); }
                else say(st.i, a.line, 'good', `You hold ${MADE_WORD[strength]}. The call needs ${pct(need)} equity, a fair price for this hand.`);
              }
              story.push('call');
            } else if (a.k === 'fold') {
              const need = toCall / (potBefore + toCall);
              if (strength) {
                if (strength === 'monster' || strength === 'strong' || strength === 'overpair') { say(st.i, a.line, 'warn', `You fold ${MADE_WORD[strength]}. That is usually too tight against one bet.`); verdicts.push({ tone: 'warn', label: 'Too tight' }); }
                else if (o >= 8 && o / unseen >= need) { say(st.i, a.line, 'warn', `You fold a draw with ${o} outs (about ${pct(o / unseen)}). The call needed only ${pct(need)}.`); verdicts.push({ tone: 'warn', label: 'Price was right to call' }); }
                else { say(st.i, a.line, 'good', `You hold ${MADE_WORD[strength]}${o ? ` and ${o} outs` : ''}. The call needed ${pct(need)}. A fold is right.`); verdicts.push({ tone: 'good', label: 'Good fold' }); }
              } else say(st.i, a.line, 'info', `A fold facing ${pct(toCall / Math.max(1, potBefore - toCall))} of the pot. With no entry, the fold cannot be checked against your cards.`);
              story.push('fold');
            }
          }
        } else if (st.key !== 'preflop' && isRaise && !folded.has(me) && players.includes(me)) {
          // another player's bet, seen from my seat
          const size = (a.to - prev) / Math.max(1, potBefore);
          if (size > 1) say(st.i, a.line, 'info', `${p.posOf[a.who] || a.who} overbets (${pct(size)} of the pot). An overbet is polarising: very strong or a bluff.`);
        }
        // the record moves on
        if (a.k === 'fold') folded.add(a.who);
        if (a.k === 'check' && a.who !== me) checkedBefore.add(a.who);
        if (isRaise) { if (high > 0 && st.key !== 'preflop' || st.key === 'preflop' && a.to > bb) raises++; if (!firstBet) firstBet = a.who; last = a.to; high = a.to; if (st.key === 'preflop') raiserPre = a.who; }
        put[a.who] = prev + add;
        pot += add;
        void last; void facing;
      }
    }
    // the story across the streets
    const line = story.join(' ');
    if (/^raise (check )+(bet)/.test(line)) { const last = Object.keys(hc.lines).map(Number).sort((a, b) => b - a)[0]; if (last !== undefined) { const ln = Math.max(...Object.keys(hc.lines[last]).map(Number)); say(last, ln, 'info', 'Your story: raise, then check, then bet. A delayed bet tells a mixed story; strong hands usually bet earlier.'); } }
    if (/(bet ){2,}bet/.test(line) && hole) { const last = Object.keys(hc.lines).map(Number).sort((a, b) => b - a)[0]; const ln = Math.max(...Object.keys(hc.lines[last] ?? { 0: [] }).map(Number)); say(last, ln, 'good', 'Your story: a bet on every street. That is a consistent story of strength.'); }
    if (bluffedHere && p.winners.includes(me)) bluffsWon++;
    hc.verdict = verdicts.find((x) => x.tone === 'warn') ?? verdicts.find((x) => x.tone === 'good') ?? verdicts[0];
    return hc;
  }
  return { hands: out, bluffs, bluffsWon, bluffSize: bluffs ? bluffSum / bluffs : 0, semis, valueBets };
}

/* ------------------------------- advanced insights: the thought process ------------------------------- */
/* Questions and considerations for each street, the way a strong player thinks through a hand: what the action
   before says, what the board texture allows, what changed with the new card and what each player's habits suggest.
   Same inputs as the critique: the player's own cards and the public record. */

const SUIT_WORD: Record<string, string> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const RANK_WORD = (r: string) => (r === 'T' ? '10' : r);
const boardText = (b: Card[]) => b.map((c) => RANK_WORD(c[0])).join('-');

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

function thinkHand(p: Parsed, me: string, hole: Card[] | null, habits: Record<string, Habit>, blinds: { sb: number; bb: number }) {
  const out: Record<number, Record<number, CritNote[]>> = {};
  const add = (st: number, line: number, note: CritNote) => { ((out[st] ??= {})[line] ??= []).push(note); };
  const tell = (st: number, line: number, text: string) => add(st, line, { tone: 'info', text });
  /** A quiz question and its answer: the recommended action first, then the reason. */
  const ask = (st: number, line: number, q: string, a: string) => add(st, line, { tone: 'ask', text: q, a });
  const { sb, bb } = blinds;
  const players = Object.keys(p.posOf);
  const label = (x: string) => (p.posOf[x] ? `${p.posOf[x]} (${x})` : x);
  const hw = (x: string) => habitWord(habits[x]);
  const habitLine = (x: string) => { const w = hw(x); return w ? ` ${x} is ${w}.` : ''; };
  const is = (x: string, re: RegExp) => re.test(hw(x) ?? '');
  const myPos = p.posOf[me] ?? '';
  const t = hole ? tier(hole) : null;
  const yours = t ? t.cls : 'your hand';
  const folded = new Set<string>();
  let pot = 0, raiserPre: string | null = null, prevBoard: Card[] = [];
  for (const st of p.streets) {
    const put: Record<string, number> = {};
    let high = 0, raises = 0, limpers = 0, firstBet: string | null = null;
    if (st.key === 'preflop') {
      const sbN = players.find((x) => p.posOf[x] === 'SB'), bbN = players.find((x) => p.posOf[x] === 'BB');
      if (sbN) put[sbN] = sb;
      if (bbN) put[bbN] = bb;
      high = bb; pot = sb + bb;
    }
    const imIn = () => players.includes(me) && !folded.has(me);
    const SEQ = st.key === 'preflop' ? PRE_ORDER : ORDER;
    const order = (xs: string[]) => [...xs].sort((a, b) => SEQ.indexOf(p.posOf[a]) - SEQ.indexOf(p.posOf[b]));
    const tx = st.board.length >= 3 ? texture(st.board) : null;
    const s: Made | null = hole && st.board.length >= 3 ? made(hole, st.board) : null;
    const o = hole && st.board.length >= 3 && st.board.length < 5 ? outs(hole, st.board) : 0;
    const unseen = 50 - st.board.length;
    const valueHand = s === 'monster' || s === 'strong' || s === 'overpair' || s === 'top';
    // the cards of the street: texture, what changed, what the action before represents
    if (tx && imIn()) {
      const fresh = st.board.slice(prevBoard.length);
      if (st.key === 'flop') {
        tell(st.i, -1, `Flop ${boardText(st.board)}: ${tx.words.join(', ')}.`);
        const topC = [...st.board].sort((x, y) => rv(y) - rv(x))[0];
        const ONE: Record<string, string> = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack', T: 'a 10', 8: 'an 8' };
        const repr = `${ONE[topC[0]] ?? `a ${topC[0]}`}${st.board.filter((c) => c[0] === topC[0]).length >= 2 ? ' (trips)' : ' (top pair)'}`;
        ask(st.i, -1, 'Is this board wet or dry?', tx.wet
          ? `Wet. A player representing ${repr} bets now, about half to two thirds of the pot, to deny the draws their equity.`
          : `Dry. Few draws can catch up, so a player representing ${repr} can bet small (a third of the pot) or check once to slowplay.`);
        const byRank: Record<string, number> = {};
        for (const c of st.board) byRank[c[0]] = (byRank[c[0]] ?? 0) + 1;
        const plural: Record<string, string> = { A: 'aces', K: 'kings', Q: 'queens', J: 'jacks', T: 'tens' };
        const pairedHigh = Object.entries(byRank).find(([r, n]) => n >= 2 && plural[r]);
        const left = pairedHigh ? 4 - pairedHigh[1] - (hole?.filter((c) => c[0] === pairedHigh[0]).length ?? 0) : 0;
        const highBoard = st.board.some((c) => rv(c) >= 12);
        if (pairedHigh) tell(st.i, -1, `Two ${plural[pairedHigh[0]]} show. Only ${left} ${left === 1 ? 'is' : 'are'} left.`);
        if (raiserPre) ask(st.i, -1, `${label(raiserPre)} raised before the flop. Does this board hit the raiser?`, highBoard
          ? 'Yes, often. High cards fit a raising range (big pairs, AK, AQ, KQ). Expect a continuation bet, and give it credit.'
          : 'Not often. Low and middle cards fit the callers. A bet from a caller is more believable than a bet from the raiser.');
        else ask(st.i, -1, 'Nobody raised before the flop. Which hands fit this board?',
          `Every range is wide and capped. ${st.board.some((c) => c[0] === 'A') ? 'Weak Ax' : 'Middle pairs'} and suited cards fit${tx.flush === 'draw' ? `, and ${SUIT_WORD[tx.flushSuit]} make a flush draw` : ''}.${pairedHigh ? ` Strong ${RANK_WORD(pairedHigh[0])}x is less likely.` : ''} A bet from you represents the hand that fits.`);
      } else {
        const c = fresh[0], before = texture(prevBoard), r = RANK_WORD(c[0]);
        const changes: string[] = [];
        if (st.board.filter((x) => x[0] === c[0]).length >= 2) changes.push('it pairs the board, so trips and full houses are possible');
        if (tx.flush === 'made' && before.flush !== 'made') changes.push(`a flush is now possible in ${SUIT_WORD[tx.flushSuit]}`);
        if (tx.straight === 'made' && before.straight !== 'made') changes.push('a straight is now possible');
        if (rv(c) > Math.max(...prevBoard.map(rv))) changes.push('it is an overcard to the board');
        tell(st.i, -1, `${st.key === 'turn' ? 'Turn' : 'River'} ${r}: the board is ${boardText(st.board)}. ${changes.length ? `The ${r} matters: ${changes.join('; ')}.` : `The ${r} changes little.`}`);
        const scary = changes.length > 0;
        ask(st.i, -1, `Which hands does the ${r} help, and what do you do about it?`,
          `Any ${r}x now has a pair${changes.length ? `, and ${changes.join('; ')}` : ''}. ${
            !hole ? (scary ? 'Slow down if a player bets: the card may have helped them.' : 'Little changed, so the plan from the last street holds.')
            : s === 'monster' || s === 'strong' ? 'You are still ahead of most of these hands. Keep betting for value.'
            : valueHand ? (scary ? 'Bet again if checked to you, but fold to a raise: a raise now often means the card hit.' : 'Bet again to charge draws. Slow down only if raised.')
            : s === 'weak' ? `Your pair loses to any ${r}x. Check, and fold to a big bet.`
            : 'You have no pair. Check, and fold to a bet.'}`);
        if (st.key === 'turn' && before.flush === 'draw' && tx.flush !== 'made') ask(st.i, -1, `The ${SUIT_WORD[before.flushSuit]} did not come. If it is left to you, do you bet?`,
          hole && valueHand ? 'Yes. Bet about half the pot to deny the flush draw its equity: it must pay to see the river.' : hole && s === 'weak' ? 'Check. Your pair is weak: a bet gets called by better hands and folds out the worse ones.' : hole ? 'Check. Without a pair, a bluff into players who called the flop rarely works.' : 'A made hand bets about half the pot here, so a flush draw pays to see the river.');
        if (st.key === 'river') {
          const missed: string[] = [];
          if (before.flush === 'draw' && tx.flush !== 'made') missed.push(`the ${SUIT_WORD[before.flushSuit].slice(0, -1)} flush draw`);
          if (texture(st.board.slice(0, 3)).flush === 'draw' && tx.flush !== 'made' && !missed.length) missed.push(`the ${SUIT_WORD[texture(st.board.slice(0, 3)).flushSuit].slice(0, -1)} flush draw`);
          if (before.straight === 'draw' && tx.straight !== 'made') missed.push('the straight draws');
          ask(st.i, -1, 'Which draws missed, and what does that mean for a river bet?', missed.length
            ? `${missed.join(' and ')[0].toUpperCase()}${missed.join(' and ').slice(1)} missed. A missed draw cannot win at showdown, so it bluffs or gives up. A big river bet can be a missed draw: call it with a pair that beats bluffs.`
            : 'No common draw missed. A river bet is more likely value. Fold weak pairs to a big bet.');
        }
      }
      if (hole && s) tell(st.i, -1, `You hold ${MADE_WORD[s]}${o >= 4 ? `, with ${o} cards that make a straight or better` : ''}.`);
    }
    st.acts.forEach((a, ai) => {
      const prev = put[a.who] ?? 0;
      const toCall = Math.max(0, high - prev);
      const potBefore = pot;
      const need = toCall / Math.max(1, potBefore + toCall);
      let addC = 0;
      if (a.k === 'call') addC = (a.allin && a.to ? a.to : high) - prev;
      else if (a.k === 'bet' || a.k === 'raise' || a.k === 'allin' || a.k === 'straddle') addC = a.to - prev;
      addC = Math.max(0, addC);
      const isRaise = a.to > high && (a.k === 'raise' || a.k === 'allin' || a.k === 'bet' || a.k === 'straddle');
      const checkedTo = st.key !== 'preflop' && ai > 0 && st.acts.slice(0, ai).every((x) => x.k === 'check');
      const live = order(players.filter((x) => !folded.has(x)));
      const behind = live.slice(live.indexOf(a.who) + 1);
      const others = live.filter((x) => x !== me);
      if (a.who === me) {
        if (st.key === 'preflop') {
          const iso = 3 * bb + limpers * bb;
          const late = LATE.has(myPos), early = EARLY.has(myPos);
          if (raises === 0 && a.k === 'check') {
            ask(st.i, a.line, 'Nobody raised. Do you check the option or raise?', t && t.t <= 1
              ? `Raise to about ${iso}. With ${yours} you are likely ahead of every limper, so build the pot now.`
              : `Check. ${t ? `${yours} is not strong enough to raise into ${limpers} ${limpers === 1 ? 'limper' : 'limpers'}, and the flop is free.` : 'Raise only a strong hand; the flop is free.'}`);
          } else if (raises === 0 && limpers > 0) {
            tell(st.i, a.line, `${limpers} ${limpers === 1 ? 'player limps' : 'players limp'} before you. A limp shows a capped range: premium hands usually raise.`);
            const pair = !!hole && hole[0][0] === hole[1][0];
            if (t && pair && rv(hole![0]) <= 9) ask(st.i, a.line, `With ${yours}, do you limp behind or raise?`,
              `Raise to about ${iso} (3 BB plus 1 BB for each limper). The raise isolates, represents a stronger hand and charges hands with equity. A set comes on about 1 flop in 8.5, but an overcard to ${yours} comes on most flops, and higher cards (connectors, 9 to K, Ax) connect more often. Taking the pot or the lead now pays off later.`);
            else if (t && t.t <= 1) ask(st.i, a.line, `With ${yours}, what is the best play after the limps?`, `Raise to about ${iso}. Limpers call with worse hands, so the pot grows while you are ahead.`);
            else if (t && t.t === 2) ask(st.i, a.line, `With ${yours}, do you limp behind or raise?`, limpers >= 2
              ? `Limp behind. With ${limpers} limpers the pot pays well when ${yours} makes a straight, a flush or a set.`
              : `Raise to about ${iso} to isolate the limper. You take the lead and often win the pot on the flop.`);
            else if (t) ask(st.i, a.line, `With ${yours}, is the call worth the price?`, 'No. Fold. Weak hands lose more chips after the flop than they win, even for a small price.');
            else ask(st.i, a.line, 'Which hands do the limpers hold?', 'Medium and weak hands: small pairs, suited cards, weak aces. Most premium hands raise. Raise a strong hand to isolate; fold a weak one.');
          } else if (raises === 0) {
            const range = early ? 'a tight range: pairs 77 and up, AQ and up, suited broadways' : late ? 'a wide range: any pair, any ace, suited connectors, broadways' : 'a medium range: most pairs, AT and up, suited broadways and connectors';
            const play = t ? ((early ? t.t <= 1 : late ? t.t <= 3 : t.t <= 2) ? `With ${yours}: raise.` : `With ${yours}: fold.`) : '';
            ask(st.i, a.line, `Nobody has entered and ${behind.length} ${behind.length === 1 ? 'player acts' : 'players act'} after you. Which hands open from ${myPos}, and to what size?`,
              `Open ${range}. Raise to 2.5 to 3 BB (${2.5 * bb} to ${3 * bb}); do not limp. ${play}`.trim());
          } else {
            const r = [...st.acts.slice(0, ai)].reverse().find((x) => x.to === high && x.who !== me);
            const pos = r ? p.posOf[r.who] ?? '' : '';
            if (r) tell(st.i, a.line, `${label(r.who)} raised to ${high} (${r2(high / bb)} BB).${EARLY.has(pos) ? ' From early position this shows a strong range.' : LATE.has(pos) ? ' From late position this can be a steal, so the range is wide.' : ''}${habitLine(r.who)}`);
            const loose = r ? is(r.who, /loose|aggressive/) : false;
            const pair = !!hole && hole[0][0] === hole[1][0];
            ask(st.i, a.line, `Is ${yours} ahead of that range? Call, re-raise or fold?`, (!t
              ? `Re-raise premium hands, call with pairs and suited connectors when the price is small (here ${pct(need)}), and fold the rest.`
              : t.t === 0 ? `Re-raise to about 3 times the raise (${3 * high}). ${yours} is ahead of almost every raising range.`
              : t.t === 1 ? (EARLY.has(pos) && !loose ? `Call. ${yours} plays well against a strong early range, but a re-raise only gets called by better.` : `Re-raise to about ${3 * high}. Against a wide${loose ? ', loose' : ''} raiser ${yours} is ahead.`)
              : t.t === 2 && (pair || need <= 0.3) ? `Call. The price is ${pct(need)}, and ${pair ? 'a set' : 'a straight or flush draw'} can win a big pot.`
              : `Fold. ${yours} is behind most raising ranges, and you need ${pct(need)} to call.`) + ` ${choices(toCall, high, potBefore, st.key)}`);
          }
        } else if (checkedTo && (a.k === 'bet' || a.k === 'check')) {
          tell(st.i, a.line, `Everyone checks to you${behind.length === 0 ? ' in position' : ''}.${others.length === 1 ? habitLine(others[0]) : ''}`);
          const station = others.some((x) => is(x, /calling station/));
          const folder = others.some((x) => is(x, /folding to bets|tight/));
          if (st.key === 'river') {
            ask(st.i, a.line, 'How do you get the most value?', !hole
              ? 'With a strong hand, bet 60 to 75% of the pot. With a medium hand, bet small or check. Without a pair, bluff only against a player who folds often.'
              : s === 'monster' || s === 'strong' ? `Bet 60 to 75% of the pot (${Math.round(potBefore * 0.6)} to ${Math.round(potBefore * 0.75)}). Worse hands that called before call again${station ? ', and a calling station calls even bigger' : ''}.`
              : s === 'overpair' || s === 'top' ? `Bet about half the pot (${Math.round(potBefore / 2)}). Worse pairs call a medium bet.`
              : s === 'weak' ? `Bet small, about a third of the pot (${Math.round(potBefore / 3)}). Only worse pairs call, and a small bet is the size they call${station ? ': a calling station calls it every time' : ''}.`
              : folder && !station ? 'Bluff about half the pot: the player left folds to bets often.' : 'Check. You cannot win at showdown, and a bluff rarely works here.');
            ask(st.i, a.line, 'Is the check a trap?', station
              ? 'Rarely. A calling station calls instead of trapping. Bet for value, and do not bluff.'
              : others.some((x) => is(x, /aggressive/)) ? 'It can be. An aggressive player who checks the river may want to check-raise. Bet small for value, and fold a medium hand to a raise.'
              : 'Usually not. A river check most often shows a medium or weak hand. Bet for value.');
          } else {
            ask(st.i, a.line, 'Bet or check?', !hole
              ? 'Bet a made hand to charge draws. Check a weak hand to control the pot.'
              : valueHand ? (tx?.wet ? `Bet about 60% of the pot (${Math.round(potBefore * 0.6)}). The board is wet, so charge the draws.` : `Bet small, about a third of the pot (${Math.round(potBefore / 3)}). The board is dry, so worse hands can still call.`)
              : s === 'weak' ? ((tx?.wet && st.key === 'flop') || station ? `Bet small, about a third of the pot (${Math.round(potBefore / 3)}), to deny the draws their equity${station ? '; a calling station also calls with worse' : ''}.` : 'Check. A weak pair wants a small pot, and a bet gets called mostly by better hands.')
              : o >= 8 ? `Bet as a semi-bluff, about half the pot. It can win now, and your ${o} outs can win later.`
              : others.length === 1 && !station ? 'Check, or one small bluff against a single player who folds often.' : 'Check. Take the free card.');
          }
          if (a.k === 'bet') tell(st.i, a.line, `You bet ${a.to} into ${potBefore} (${pct(a.to / Math.max(1, potBefore))} of the pot).`);
          if (a.k === 'check' && behind.length === 0) ask(st.i, a.line, 'You check behind. Was a bet better?', valueHand
            ? 'Yes. A bet charges draws, and a free card can beat you.'
            : 'No. A check is fine: you take a free card and keep the pot small.');
        } else if (a.k === 'check') {
          const agg = behind.find((x) => is(x, /aggressive/));
          const plan = !hole ? 'Plan your answer before you check: call with a good hand, fold a weak one.'
            : s === 'monster' || s === 'strong' ? 'Check-raise for value: the aggressive player bets for you.'
            : valueHand ? 'Call one bet, and think again on the next street.' : o >= 8 ? 'Call if the price is right for your draw.' : 'Fold to a big bet.';
          if (agg) ask(st.i, a.line, `${label(agg)} acts after you and is ${hw(agg)}. What do you do when ${agg} bets?`, plan);
          else ask(st.i, a.line, 'You act first. Check, or lead out?', s === 'monster' || s === 'strong'
            ? 'Lead out, about half the pot. Nobody behind bets often enough to trust a check-raise.'
            : 'Check. Out of position, keep the pot small and see what the others do.');
        } else if (isRaise) {
          const amount = a.to - prev;
          tell(st.i, a.line, `You ${firstBet ? 'raise to' : 'bet'} ${a.to} into ${potBefore} (${pct(amount / Math.max(1, potBefore))} of the pot).`);
          ask(st.i, a.line, 'Which worse hands call this size? What do you do if raised?', !hole
            ? 'Worse pairs and draws call a medium bet. If raised, continue only with two pair or better.'
            : s === 'monster' || s === 'strong' ? 'Worse pairs and draws call. If raised, re-raise: you are ahead of most raising hands.'
            : valueHand ? 'Worse pairs and draws call. If raised, fold unless the raiser bluffs often: a raise usually shows two pair or better.'
            : s === 'weak' ? 'Few worse hands call: only weaker pairs. If raised, fold.'
            : o >= 8 ? `Few worse hands call, but your ${o} outs win later. If raised, call only if the price fits your draw.`
            : 'Almost no worse hand calls: this is a bluff. If raised, fold.');
          for (const x of others) {
            if (is(x, /calling station/)) tell(st.i, a.line, `${x} is ${hw(x)}. Bet bigger for value against ${x}, and do not bluff ${x}.`);
            else if (is(x, /folding to bets/)) tell(st.i, a.line, `${x} is ${hw(x)}. Bluffs work better against ${x}; a value bet may get no call.`);
          }
        } else if (a.k === 'call' || a.k === 'fold') {
          const eq = o / Math.max(1, unseen);
          ask(st.i, a.line, `Which hands bet like this, and do you beat enough of them? You need ${pct(need)} to call.`, (!hole
            ? `Call with a hand that beats the bettor's bluffs, or a draw with enough outs. Fold the rest.`
            : s === 'monster' || s === 'strong' ? 'Raise. Your hand beats most betting ranges, so build the pot.'
            : valueHand ? `Call. ${MADE_WORD[s!]} beats the bluffs and some value bets${need > 0.4 ? ', but fold to a second big bet' : ''}.`
            : o >= 4 && st.board.length < 5 ? (eq >= need ? `Call. Your ${o} outs give about ${pct(eq)} on the next card, more than the ${pct(need)} you need.` : `Fold. Your ${o} outs give about ${pct(eq)} on the next card, less than the ${pct(need)} you need.`)
            : s === 'weak' && need <= 0.25 ? 'Call once. The price is small, and a weak pair beats a bluff.'
            : 'Fold. You beat only bluffs, and the price is too high.') + ` ${choices(toCall, high, potBefore, st.key)}`);
        }
      } else if (imIn()) {
        if (st.key === 'preflop' && a.k === 'check') {
          tell(st.i, a.line, `${label(a.who)} checks the option. Nobody raised, so no player has shown strength.`);
          ask(st.i, a.line, `What does a check from ${a.who} tell you?`, `${a.who} has a wide, weak range: the BB checks most hands that do not want to raise.${habitLine(a.who)} Bet a made hand for value on the flop, and do not fear the BB.`);
        } else if (isRaise && a.k !== 'straddle') {
          const size = (a.to - prev) / Math.max(1, potBefore);
          tell(st.i, a.line, `${label(a.who)} ${firstBet || st.key === 'preflop' ? 'raises to' : 'bets'} ${a.to}${st.key === 'preflop' ? ` (${r2(a.to / bb)} BB)` : ` (${pct(size)} of the pot)`}.${habitLine(a.who)}`);
          const pos = p.posOf[a.who] ?? '';
          if (st.key === 'preflop') ask(st.i, a.line, `Which hands raise from ${pos || 'this seat'}?`,
            `${EARLY.has(pos) ? 'Strong hands: big pairs, AK, AQ, suited broadways.' : LATE.has(pos) ? 'A wide range: any pair, any ace, suited connectors, broadways.' : 'A medium range: most pairs, good aces, suited broadways.'}${is(a.who, /loose|aggressive/) ? ` ${a.who} raises wider than that: re-raise your strong hands for value.` : is(a.who, /tight/) ? ` ${a.who} is tight: give the raise credit and fold medium hands.` : ''}`);
          else {
            const toMe = Math.max(0, a.to - (put[me] ?? 0));
            const needMe = toMe / Math.max(1, potBefore + addC + toMe);
            ask(st.i, a.line, `Which hands bet this size on ${boardText(st.board)}?`,
              `${size > 1 ? 'An overbet is polarising: very strong hands or bluffs. Call with a hand that beats bluffs; fold weak pairs.' : size < 0.35 ? 'A small bet often wants a call: a strong hand, or a cheap bluff. Call with any pair; raise a strong hand.' : 'Value hands and draws.'} You need ${pct(needMe)} to call.${is(a.who, /aggressive/) ? ` ${a.who} bets often, so call wider.` : is(a.who, /tight|calling station/) ? ` ${a.who} rarely bets without a hand: fold weak pairs.` : ''}`);
          }
        }
      }
      // the record moves on
      if (a.k === 'fold') folded.add(a.who);
      if (st.key === 'preflop' && a.k === 'call' && raises === 0) limpers++;
      if (isRaise) {
        if (st.key !== 'preflop' || a.to > bb) raises++;
        if (!firstBet) firstBet = a.who;
        high = a.to;
        if (st.key === 'preflop' && a.k !== 'straddle') raiserPre = a.who;
      }
      put[a.who] = prev + addC;
      pot += addC;
    });
    // a street everyone checked
    if (st.key !== 'preflop' && st.acts.length > 1 && st.acts.every((x) => x.k === 'check') && imIn()) {
      const last = st.acts[st.acts.length - 1].line;
      const aggs = players.filter((x) => x !== me && !folded.has(x) && is(x, /aggressive/));
      tell(st.i, last, 'Everyone checks: nobody claims the pot.');
      ask(st.i, last, 'Who is slowplaying, and who gave up?', `Most often nobody has much.${aggs.length ? ` A check from ${aggs.join(' or ')} (aggressive so far) is weak more often than a trap.` : ''} On the next street, a bet of about half the pot takes it often, most of all in position.`);
    }
    prevBoard = st.board;
  }
  return out;
}
