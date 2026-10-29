import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, PlayingCard, Toggle, num, toast } from '../components/ui';
import { RANKS, SUITS, SUIT_COLOR, SUIT_SYMBOL, bestHand } from '../lib/cards';
import { playerStatus, round2 } from '../lib/calc';
import { units } from '../lib/format';
import { uid } from '../lib/ids';
import {
  STREETS, STREET_CARDS, actionClosed, blinds, closeStreet, minRaiseTo, dropAfter, fillBefore, finalists, hasActs, inAtEnd, inAtStart,
  newBoxLog, openStreetBoxes, potTotal, replayStreet, resolve, rowOrder, setAct, showdownOrder, type Replay,
} from '../lib/hand';
import { estimateStacks } from '../lib/stacks';
import type { Act, Card, Game, Hand, HandLog, ID, StreetName } from '../types';

/* Hand recorder, one tab per stage in the order things happen at the table:
   Setup (who is dealt in, the button, the blinds), Pre-flop, Flop, Turn, River, Showdown.
   A new hand opens straight on Pre-flop with everyone playing dealt in and the button moved on.
   Each street is a table: one row per player from the button down, one column per pass around the
   table. Tap a box and choose Check, Call, Fold or an amount. Tapping a box further down fills the
   empty boxes before it with their default (check, or fold facing a bet), so only bets, raises and
   calls need a tap. Any tab can be opened at any time; skipping ahead marks the hand partly recorded. */

type Tab = 'setup' | StreetName | 'showdown';
type Target = { kind: 'board'; i: number } | { kind: 'run'; r: number; i: number } | { kind: 'shown'; p: ID; ci: number } | null;
type Sel = { p: ID; r: number } | null;

interface RState {
  id: string;
  n: number;
  log: HandLog;
  tab: Tab;
  /** Showdown reached (river closed, everyone all-in, one player left, or skipped to). */
  ended: boolean;
  /** Card reveal skipped: go straight to the result. */
  skipReveal: boolean;
  note: string;
  board: (Card | null)[];
  runSlots: (Card | null)[][];
  shown: Record<ID, (Card | null)[]>;
  manual: Record<number, ID[]>;
  /** Some action was skipped. */
  partial: boolean;
  /** Final pot typed for a partly recorded hand. */
  finalPot: string;
  /** Leave the hand out of stats; undefined = follow `partial`. */
  exclude?: boolean;
}

const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const LABEL: Record<Tab, string> = { setup: 'Setup', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
const TABS: Tab[] = ['setup', 'preflop', 'flop', 'turn', 'river', 'showdown'];
const BOARD_SLOT = ['Flop card 1', 'Flop card 2', 'Flop card 3', 'Turn card', 'River card'];
const isStreet = (t: Tab): t is StreetName => (STREETS as Tab[]).includes(t);

function bySeat(g: Game, ids: ID[]) { return [...ids].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99)); }

/** Pre-filled by status: everyone playing (green). Away players can be added with a tap. */
function dealtDefault(g: Game): ID[] {
  return bySeat(g, g.playerIds.filter((p) => playerStatus(g, p) === 'playing'));
}

/** The button moves one seat clockwise each hand. After a seat shuffle, seat 1 has it. */
function buttonFor(g: Game, dealt: ID[], n: number): ID | undefined {
  const order = bySeat(g, dealt);
  if (!order.length) return undefined;
  if (g.reseatN === n && g.firstDealer && order.includes(g.firstDealer)) return g.firstDealer;
  const prev = [...g.hands].filter((h) => h.n < n).pop()?.dealerId;
  if (!prev) return g.firstDealer && order.includes(g.firstDealer) ? g.firstDealer : order[0];
  const prevSeat = g.seats[prev] ?? 0;
  return order.find((p) => (g.seats[p] ?? 0) > prevSeat) ?? order[0];
}

/** A hand in progress is saved on the phone as it is logged, so a reload, a locked screen or a trip
    back to the game page picks it up again. Saving the hand clears it. */
interface Draft { v: 1; st: RState; dealt: ID[]; button?: ID; sb: string; bb: string }
const draftKey = (gameId: string) => `felt-draft-${gameId}`;
function readDraft(gameId: string, n: number): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(gameId)) ?? 'null') as Draft | null;
    return d && d.v === 1 && d.st?.n === n ? d : null;
  } catch { return null; }
}

function exactStacks(g: Game, n: number): Record<ID, number> {
  const est = estimateStacks(g, n);
  return Object.fromEntries(Object.entries(est.stack).filter(([p, v]) => v !== undefined && !(est.spread[p] > 0))) as Record<ID, number>;
}

function freshState(g: Game, n: number, dealt: ID[], button: ID | undefined, stacks: Record<ID, number>): RState {
  return {
    id: uid(), n, log: newBoxLog(g, dealt, button, stacks), tab: 'preflop', ended: false, skipReveal: false, note: '',
    board: [null, null, null, null, null], runSlots: [], shown: {}, manual: {}, partial: false, finalPot: '',
  };
}

export default function HandRecorder({ gameId, handId }: { gameId: string; handId?: string }) {
  const g = useGame(gameId);
  const saveHand = useStore((s) => s.saveHand);
  const deleteHand = useStore((s) => s.deleteHand);
  const updateGame = useStore((s) => s.updateGame);
  const setStatus = useStore((s) => s.setStatus);
  const name = usePlayerName();
  const existing = g?.hands.find((h) => h.id === handId);
  const nNew = (g?.hands[g.hands.length - 1]?.n ?? 0) + 1;

  // Stacks cap wagers (all-in) only where the estimate is exact
  const stacksRef = useRef<Record<ID, number> | null>(null);
  if (g && !stacksRef.current) stacksRef.current = exactStacks(g, existing?.n ?? nNew);
  const stacks = stacksRef.current ?? undefined;

  const [draft] = useState(() => (existing || !g ? null : readDraft(gameId, nNew)));
  const [dealt, setDealt] = useState<ID[]>(() => draft?.dealt ?? existing?.log?.dealt ?? (g ? dealtDefault(g) : []));
  const [button, setButton] = useState<ID | undefined>(() => (draft ? draft.button : existing?.log?.button ?? existing?.dealerId ?? (g ? buttonFor(g, dealtDefault(g), nNew) : undefined)));
  const [sb, setSb] = useState(draft?.sb ?? String(g?.sb ?? 1));
  const [bb, setBb] = useState(draft?.bb ?? String(g?.bb ?? 2));
  const [st, setSt] = useState<RState | null>(() => {
    if (!g) return null;
    if (draft) return draft.st;
    if (existing?.log) {
      const L = existing.log;
      const pots = existing.pots ?? [];
      const recorded = potTotal(g, L, L.button);
      const board = existing.board;
      // keep a hand-picked winner only where the shown cards do not decide the pot
      const auto = resolve(g, L, board, L.button, {}, existing.partial ? Math.max(0, existing.pot - recorded) : 0);
      return {
        id: existing.id, n: existing.n, log: L, tab: 'showdown', ended: true, skipReveal: false, note: existing.note ?? '',
        board: [0, 1, 2, 3, 4].map((i) => existing.board[i] ?? null),
        runSlots: (L.runCards ?? []).map((r) => [...r]),
        shown: Object.fromEntries(Object.entries(L.shown ?? {}).map(([p, c]) => [p, [c[0] ?? null, c[1] ?? null]])),
        manual: Object.fromEntries(pots.map((p, i) => [i, p.winners.map((w) => w.playerId)]).filter((_, i) => !auto.pots[i]?.runs.every((r) => r.winners.length))),
        partial: !!existing.partial, finalPot: existing.partial && existing.pot > recorded ? String(existing.pot) : '', exclude: existing.excluded,
      };
    }
    return freshState(g, nNew, dealtDefault(g), buttonFor(g, dealtDefault(g), nNew), stacksRef.current ?? {});
  });
  const [target, setTarget] = useState<Target>(null);
  const [sel, setSel] = useState<Sel>(() => (st && !existing ? replayStreet(g!, st.log, 'preflop', stacks).next : null));
  const [typed, setTyped] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null);
  // keypad: dark (blind) mark for the next action, and a raise under the house minimum
  const minRule = useStore((s) => s.settings.minRaise);
  const [dark, setDark] = useState(false);
  const [raiseErr, setRaiseErr] = useState<number | null>(null);

  useEffect(() => {
    if (existing || !st) return;
    try { localStorage.setItem(draftKey(gameId), JSON.stringify({ v: 1, st, dealt, button, sb, bb } satisfies Draft)); } catch { /* storage full or private mode */ }
  }, [st, dealt, button, sb, bb, existing, gameId]);

  // Tapping anywhere outside the keypad and the action boxes puts the keypad away
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest('.felt-rec-dock, .felt-box, .sat-tip')) { setSel(null); setTyped(''); setDark(false); setRaiseErr(null); }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const used = useMemo(() => {
    const s = new Set<Card>();
    if (!st) return s;
    st.board.forEach((c) => c && s.add(c));
    st.runSlots.forEach((r) => r.forEach((c) => c && s.add(c)));
    Object.values(st.shown).forEach((x) => x.forEach((c) => c && s.add(c)));
    return s;
  }, [st]);

  if (!g || !st) return <div className="felt-page"><Header back={() => go('')} title="Hand" /><Empty title="Game not found">It may have been deleted.</Empty></div>;

  const log = st.log;
  const set = (patch: Partial<RState>) => setSt({ ...st, ...patch });
  const street = isStreet(st.tab) ? st.tab : null;
  const replay: Replay | null = street && log.streets[street]?.acts ? replayStreet(g, log, street, stacks) : null;
  const live = finalists(log);
  const potNow = potTotal(g, log, log.button);
  const commonCards = (n: number) => st.board.slice(0, n).filter(Boolean) as Card[];
  const shownCards = (): Record<ID, Card[]> => Object.fromEntries(Object.entries(st.shown).map(([p, c]) => [p, c.filter(Boolean) as Card[]]).filter(([, c]) => (c as Card[]).length === 2));
  const fullLog = (): HandLog => ({ ...log, runCards: (log.runs ?? 1) > 1 ? st.runSlots.map((r) => r.filter(Boolean) as Card[]) : [], shown: st.skipReveal ? {} : shownCards() });
  const boardForResolve = (): Card[] => {
    const L = fullLog();
    if ((L.runs ?? 1) > 1) return [...commonCards(L.runFrom ?? 0), ...(L.runCards[0] ?? [])];
    return st.board.filter(Boolean) as Card[];
  };
  const recordedPot = potNow;
  const finalPotN = num(st.finalPot);
  const extra = st.partial && finalPotN !== null && finalPotN > recordedPot ? round2(finalPotN - recordedPot) : 0;
  const res = st.ended ? resolve(g, fullLog(), boardForResolve(), log.button, st.manual, extra) : null;
  const exclude = st.exclude ?? st.partial;
  const sbN = Number(sb), bbN = Number(bb);
  const nextStreet = street ? STREETS[STREETS.indexOf(street) + 1] : undefined;
  const started = hasActs(log);

  /* --------- setup --------- */
  // While no action is in, setup changes rebuild the hand at once (blinds carry on to later hands)
  const rebuild = (d: ID[], b: ID | undefined, s: number, bigB: number) => {
    if (d.length < 2 || !(s > 0) || !(bigB >= s)) return;
    if (s !== g.sb || bigB !== g.bb) updateGame(g.id, (x) => { x.sb = s; x.bb = bigB; });
    const g2 = { ...g, sb: s, bb: bigB };
    const btn = b && d.includes(b) ? b : buttonFor(g2, d, st.n);
    const l = newBoxLog(g2, d, btn, stacks);
    setSt({ ...st, log: { ...l, startedAt: log.startedAt }, ended: false, partial: false });
    setSel(replayStreet(g2, l, 'preflop', stacks).next);
  };
  const toggleDealt = (p: ID) => {
    const nx = dealt.includes(p) ? dealt.filter((x) => x !== p) : bySeat(g, [...dealt, p]);
    if (nx.length < 2) { toast('Deal in at least 2 players.'); return; }
    // dealt in = playing: an away player who is dealt in turns green
    if (!dealt.includes(p) && playerStatus(g, p) !== 'playing') setStatus(g.id, p, 'playing');
    const b = button && nx.includes(button) ? button : buttonFor(g, nx, st.n);
    setDealt(nx); setButton(b);
    rebuild(nx, b, sbN, bbN);
  };

  /* --------- moving between stages --------- */
  const enterShowdown = (l: HandLog, patch: Partial<RState> = {}) => {
    const lv = finalists(l);
    setSt({ ...st, ...patch, log: l, tab: 'showdown', ended: true });
    setSel(null);
    setTyped('');
    if (l.runFrom !== undefined && lv.length > 1) { setTarget(firstEmptyRun(l, st.board, st.runSlots)); return; }
    // cards to reveal: start with the first player to show (last aggressor first)
    const full = st.board.filter(Boolean).length === 5;
    const first = showdownOrder(g, l, lv).find((p) => !(st.shown[p]?.filter(Boolean).length === 2) && !l.mucked.includes(p));
    setTarget(lv.length > 1 && full && !st.skipReveal && first ? { kind: 'shown', p: first, ci: 0 } : null);
  };
  const openStreet = (l: HandLog, s: StreetName, patch: Partial<RState> = {}) => {
    let l2 = l.streets[s] ? l : openStreetBoxes(g, l, s, stacks);
    l2 = { ...l2, runFrom: undefined };
    setSt({ ...st, ...patch, log: l2, tab: s, ended: false });
    setSel(replayStreet(g, l2, s, stacks).next);
    setTyped('');
    const slot = st.board.findIndex((c, i) => !c && i < STREET_CARDS[s]);
    setTarget(slot >= 0 && s !== 'preflop' ? { kind: 'board', i: slot } : null);
  };
  /** Close streets up to `upTo`. Skipping (`skip`) keeps players in where boxes are empty. Returns the log
      and whether the hand ended on the way. */
  const closeThrough = (upTo: StreetName, skip: boolean) => {
    let l = log;
    let partial = st.partial;
    for (const s of STREETS.slice(0, STREETS.indexOf(upTo) + 1)) {
      if (!l.streets[s]) l = openStreetBoxes(g, l, s, stacks);
      if (!l.streets[s]!.at) {
        const waiting = replayStreet(g, l, s, stacks).waiting.length > 0;
        l = closeStreet(g, l, s, Date.now(), stacks, skip && waiting);
        if (skip && waiting) partial = true;
      }
      if (inAtEnd(l, s).length <= 1) return { l: dropAfter(l, s), ended: true, partial };
      if (actionClosed(l, s) && s !== 'river') return { l: { ...dropAfter(l, s), runFrom: STREET_CARDS[s], runs: l.runs || 1 }, ended: true, partial };
    }
    return { l, ended: upTo === 'river', partial };
  };
  /** Next button: close the street on screen with the defaults and move on. */
  const nextFrom = (s: StreetName) => {
    const r = closeThrough(s, false);
    if (r.ended) { enterShowdown(r.l, { partial: r.partial }); return; }
    openStreet(r.l, STREETS[STREETS.indexOf(s) + 1], { partial: r.partial });
  };
  /** Tabs: any stage can be opened. Jumping ahead closes the streets in between, keeping players in. */
  const goTab = (t: Tab) => {
    setTarget(null);
    setTyped('');
    if (t === 'setup') { set({ tab: t }); setSel(null); return; }
    if (t === 'showdown') {
      if (st.ended) { enterShowdown(log); return; }
      const last = STREETS.filter((s) => log.streets[s]).pop() ?? 'preflop';
      const r = closeThrough(last, true);
      enterShowdown(r.l, { partial: r.partial || (!r.ended && last !== 'river') });
      if (!r.ended && last !== 'river') toast('Skipped to showdown. Pick the winner and enter the final pot.');
      return;
    }
    if (log.streets[t]) { set({ tab: t }); setSel(log.streets[t]?.acts ? replayStreet(g, log, t, stacks).next : null); return; }
    const prev = STREETS[STREETS.indexOf(t) - 1];
    const r = closeThrough(prev, true);
    if (r.ended) { enterShowdown(r.l, { partial: r.partial }); toast('The hand was already over before that street.'); return; }
    openStreet(r.l, t, { partial: r.partial });
    if (r.partial) toast('Skipped ahead: empty boxes keep players in. Fill them in any time.');
  };

  /* --------- action boxes --------- */
  /** Change one box. A street already closed that now ends the hand sooner drops the streets after it. */
  const act = (p: ID, r: number, a: Act | null, keepSel = false) => {
    if (!street) return;
    setDark(false);
    setRaiseErr(null);
    let l = setAct(g, log, street, p, r, a, stacks);
    let ended = st.ended;
    if (l.streets[street]?.at && (inAtEnd(l, street).length <= 1 || actionClosed(l, street))) { l = dropAfter(l, street); ended = true; }
    setSt({ ...st, log: l, ended });
    setTyped('');
    setSel(keepSel ? { p, r } : replayStreet(g, l, street, stacks).next);
  };
  const pickBox = (p: ID, r: number) => {
    if (!replay || !street) return;
    const c = replay.cells[p]?.[r];
    if (!c?.needed) return;
    setTarget(null);
    setTyped('');
    setDark(false);
    setRaiseErr(null);
    // a box further on than the next one: the boxes before it take their defaults
    if (!c.act && !c.implied && replay.next && (replay.next.p !== p || replay.next.r !== r)) {
      const l = fillBefore(g, log, street, p, r, stacks);
      if (l !== log) setSt({ ...st, log: l });
    }
    setSel({ p, r });
  };

  const save = (next: boolean) => {
    if (!res) return;
    if (res.missing) { toast('Pick who won the pot under Result.'); return; }
    const L = fullLog();
    const pots = res.pots.map((p) => ({ amount: p.amount, eligible: p.eligible, winners: p.winners }));
    const total = round2(pots.reduce((a, p) => a + p.amount, 0));
    const hand: Hand = {
      id: st.id, n: st.n, at: L.startedAt, endedAt: existing?.endedAt ?? Date.now(), dealerId: L.button, pot: total,
      winners: res.winners, pots, returned: Object.keys(res.returned).length ? res.returned : undefined,
      board: boardForResolve(), boardNA: false,
      shown: Object.entries(L.shown).map(([playerId, cards]) => ({ playerId, cards })),
      allIn: Object.keys(L.allInAt ?? {}).length > 0, straddle: false, tags: existing?.tags ?? [], note: st.note.trim() || undefined, log: L,
      partial: st.partial || undefined, excluded: exclude || undefined,
    };
    saveHand(g.id, hand);
    try { localStorage.removeItem(draftKey(g.id)); } catch { /* ignore */ }
    if (next) {
      go(`game/${g.id}/hand/new`, true);
      const fg = useStore.getState().games.find((x) => x.id === g.id)!;
      const n = hand.n + 1;
      const d = dealtDefault(fg);
      const b = buttonFor(fg, d, n);
      stacksRef.current = exactStacks(fg, n);
      setDealt(d); setButton(b); setSb(String(fg.sb)); setBb(String(fg.bb));
      const fresh = freshState(fg, n, d, b, stacksRef.current);
      setSt(fresh);
      setSel(replayStreet(fg, fresh.log, 'preflop', stacksRef.current).next);
      setTarget(null); setTyped(''); setConfirm(null);
      window.scrollTo(0, 0);
      toast(`Hand ${hand.n} saved. Hand ${n} dealt.`);
    } else back(`game/${g.id}`);
  };

  /* --------- cards --------- */
  const pick = (c: Card) => {
    if (!target) return;
    if (target.kind === 'board') {
      const b = [...st.board]; b[target.i] = c;
      set({ board: b });
      const stop = st.tab === 'showdown' ? 5 : street ? STREET_CARDS[street] : 5;
      const nxt = b.findIndex((x, i) => !x && i < stop);
      setTarget(nxt >= 0 ? { kind: 'board', i: nxt } : null);
    } else if (target.kind === 'run') {
      const rs = st.runSlots.map((r) => [...r]); rs[target.r][target.i] = c;
      set({ runSlots: rs });
      setTarget(firstEmptyRun(log, st.board, rs));
    } else {
      const cur = st.shown[target.p] ?? [null, null];
      const nextCards = [...cur]; nextCards[target.ci] = c;
      const shown = { ...st.shown, [target.p]: nextCards };
      set({ shown });
      if (target.ci === 0 && !nextCards[1]) { setTarget({ kind: 'shown', p: target.p, ci: 1 }); return; }
      // on to the next player still to show
      const order = showdownOrder(g, log, live);
      const after = [...order.slice(order.indexOf(target.p) + 1), ...order.slice(0, order.indexOf(target.p))];
      const nx = after.find((p) => !(shown[p]?.filter(Boolean).length === 2) && !log.mucked.includes(p));
      setTarget(nx ? { kind: 'shown', p: nx, ci: shown[nx]?.[0] ? 1 : 0 } : null);
    }
  };
  const isTarget = (t: Exclude<Target, null>) => JSON.stringify(t) === JSON.stringify(target);
  const tapSlot = (t: Exclude<Target, null>, filled: boolean) => {
    if (isTarget(t) && filled) {
      if (t.kind === 'board') { const b = [...st.board]; b[t.i] = null; set({ board: b }); }
      else if (t.kind === 'run') { const rs = st.runSlots.map((r) => [...r]); rs[t.r][t.i] = null; set({ runSlots: rs }); }
      else { const cur = [...(st.shown[t.p] ?? [null, null])]; cur[t.ci] = null; set({ shown: { ...st.shown, [t.p]: cur } }); }
    }
    setSel(null);
    setTarget(t);
  };
  const currentCard = (t: Exclude<Target, null>) => (t.kind === 'board' ? st.board[t.i] : t.kind === 'run' ? st.runSlots[t.r]?.[t.i] : st.shown[t.p]?.[t.ci]);
  const setRuns = (n: number) => {
    const from = log.runFrom ?? 0;
    const rs = Array.from({ length: n }, (_, r) => st.runSlots[r] ?? Array(5 - from).fill(null));
    setSt({ ...st, log: { ...log, runs: n }, runSlots: n > 1 ? rs : [] });
    setTarget(firstEmptyRun({ ...log, runs: n }, st.board, rs));
  };

  /* --------- keypad --------- */
  const selCell = sel && replay?.cells[sel.p]?.[sel.r]?.needed ? replay.cells[sel.p][sel.r] : null;
  const darkOn = selCell?.act ? !!selCell.act.dark : dark;
  const mark = (a: Act): Act => (darkOn && street !== 'preflop' ? { ...a, dark: true } : a);
  // chips the player can still put in on this street (when the stack is known exactly)
  const roomFor = (p: ID) => (stacks?.[p] === undefined || !street ? undefined
    : round2(stacks[p] - STREETS.slice(0, STREETS.indexOf(street)).reduce((a, x) => a + (log.streets[x]?.bets[p] ?? 0), 0)));
  const minTo = selCell ? minRaiseTo(g, minRule, selCell.high, selCell.inc) : 0;
  /** An amount no higher than the bet is a call (C). A raise under the house minimum is refused,
      unless it puts the player all-in; the keypad then offers the call or the minimum raise. */
  const commitBet = (v = Number(typed)) => {
    if (!sel || !selCell || !(v > 0)) return;
    if (v <= selCell.high || !selCell.canRaise) { act(sel.p, sel.r, mark({ k: 'call' })); return; }
    const rm = roomFor(sel.p);
    if (v < minTo && !(rm !== undefined && v >= rm)) { setRaiseErr(minTo); return; }
    act(sel.p, sel.r, mark({ k: 'bet', to: v }));
  };
  // Preflop the toggle is Straddle: first to act only (or next after straddles), at the minimum raise.
  // After the flop it is Dark: a mark only.
  const isPre = street === 'preflop';
  const toggleDark = () => {
    if (!sel || !selCell) return;
    if (isPre) {
      if (!selCell.canStraddle || !selCell.canRaise) return;
      if (selCell.act?.dark) act(sel.p, sel.r, null, true);
      else act(sel.p, sel.r, { k: 'bet', to: typed && Number(typed) >= minTo ? Number(typed) : minTo, dark: true });
      return;
    }
    if (selCell.act) act(sel.p, sel.r, { ...selCell.act, dark: !selCell.act.dark || undefined }, true);
    else setDark(!dark);
  };

  const lastStreet = STREETS.filter((s) => log.streets[s]).pop() ?? 'preflop';
  const legacy = street && log.streets[street] && !log.streets[street]!.acts;
  const toAct = replay?.next ? name(replay.next.p) : null;

  return (
    <div className="felt-page felt-recorder">
      <Header back={() => back(`game/${g.id}`)} title={`Hand ${st.n}`} sub={g.name}
        right={existing ? (
          <button className="sat-btn sat-btn--ghost sat-iconbtn" style={confirm === 'delete' ? { color: 'var(--sat-neg)' } : undefined} aria-label={confirm === 'delete' ? 'Tap again to delete this hand' : 'Delete hand'}
            onClick={() => { if (confirm !== 'delete') { setConfirm('delete'); toast('Tap the bin again to delete this hand'); return; } deleteHand(g.id, st.id); go(`game/${g.id}`, true); }}>
            <Icon name="trash" />
          </button>
        ) : undefined}>
        <div className="felt-rec-bar sat-glass">
          <div className="felt-tabs" role="tablist" aria-label="Hand stage">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={st.tab === t} className={tabDone(log, t, st.ended) ? 'is-done' : ''} onClick={() => goTab(t)}>{LABEL[t]}</button>
            ))}
          </div>
          <div className="felt-rec-status" aria-live="polite">
            <span><b>{LABEL[st.tab === 'setup' ? lastStreet : st.tab]}</b>{street && toAct ? `, ${toAct} to act` : ''}{st.partial ? ', partly recorded' : ''}</span>
            <span>Pot <b className="sat-num">{units(extra ? recordedPot + extra : potNow)}</b></span>
          </div>
        </div>
      </Header>

      <div className="sat-stack" style={gap(3)}>
        {st.tab === 'setup' && (
          <>
            {started && (
              <div className="sat-flat sat-card sat-stack" style={gap(2)}>
                <p className="sat-small">Action is already recorded. Changing who is dealt in, the button or the blinds starts the hand again.</p>
                <button className="sat-btn sat-btn--sm" style={{ alignSelf: 'flex-start', color: confirm === 'reset' ? 'var(--sat-neg)' : undefined }}
                  onClick={() => { if (confirm !== 'reset') { setConfirm('reset'); return; } setConfirm(null); rebuild(dealt, button, sbN, bbN); }}>
                  <Icon name="undo" /> {confirm === 'reset' ? 'Tap again to clear the action' : 'Clear the action'}
                </button>
              </div>
            )}
            <fieldset className="felt-setup" disabled={started}>
              <section className="sat-stack" style={gap(2)}>
                <Caption>Active players ({dealt.length})</Caption>
                <div className="sat-cluster" style={gap(2)}>
                  {bySeat(g, g.playerIds.filter((p) => playerStatus(g, p) !== 'out')).map((p) => (
                    <button key={p} className="sat-chip" aria-pressed={dealt.includes(p)} onClick={() => toggleDealt(p)}>
                      {name(p)}{playerStatus(g, p) === 'away' ? ' (away)' : ''}
                    </button>
                  ))}
                </div>
              </section>
              <section className="sat-stack" style={gap(2)}>
                <Caption tip="dealer">Button</Caption>
                <div className="felt-scroll">
                  {bySeat(g, dealt).map((p) => <button key={p} className="sat-chip" aria-pressed={button === p} onClick={() => { setButton(p); rebuild(dealt, p, sbN, bbN); }}>{name(p)}</button>)}
                </div>
                {dealt.length >= 2 && (() => {
                  const [s1, b1] = Object.keys(blinds({ ...g, sb: sbN || g.sb, bb: bbN || g.bb }, dealt, button));
                  return <p className="sat-small sat-muted">SB {s1 ? name(s1) : '-'}, BB {b1 ? name(b1) : '-'}.</p>;
                })()}
              </section>
              <section className="sat-stack" style={gap(2)}>
                <Caption tip="blinds">Blinds</Caption>
                <div className="sat-grid" style={{ ['--sat-min' as string]: '110px', ...gap(3) }}>
                  <div className="sat-field"><label htmlFor="h-sb">SB</label><input id="h-sb" className="sat-input sat-num" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} onBlur={() => rebuild(dealt, button, sbN, bbN)} /></div>
                  <div className="sat-field"><label htmlFor="h-bb">BB</label><input id="h-bb" className="sat-input sat-num" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} onBlur={() => rebuild(dealt, button, sbN, bbN)} /></div>
                </div>
              </section>
            </fieldset>
          </>
        )}

        {street && (
          <>
            {street !== 'preflop' && (
              <BoardRow board={st.board} to={STREET_CARDS[street]} lockedBefore={STREET_CARDS[STREETS[STREETS.indexOf(street) - 1]]}
                isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
            )}
            {legacy ? (
              <p className="sat-small sat-muted">This hand was logged with the earlier recorder. {inAtEnd(log, street).length} players were still in after the {LABEL[street].toLowerCase()}, pot {units(potTotal(g, log, log.button, street))}.</p>
            ) : replay && (
              <ActionTable g={g} log={log} street={street} replay={replay} sel={sel} stacks={stacks} name={name} onPick={pickBox} />
            )}
          </>
        )}

        {st.tab === 'showdown' && (
          <Showdown g={g} st={st} log={log} live={live} res={res} extra={extra} recordedPot={recordedPot} exclude={exclude} name={name}
            boardForResolve={boardForResolve} commonCards={commonCards} isTarget={isTarget} tapSlot={tapSlot} setRuns={setRuns}
            set={set} setTarget={setTarget} />
        )}
      </div>

      <div className="sat-bottombar sat-glass-2 felt-rec-dock">
        {target ? (
          <div className="felt-picker-wrap">
            <div className="sat-split">
              <Caption>{targetLabel(target, name)}</Caption>
              <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setTarget(null)}>{target.kind === 'shown' ? 'Done' : 'Skip cards'}</button>
            </div>
            <div className="felt-picker">
              {SUITS.flatMap((su) => RANKS.map((r) => {
                const c = r + su;
                return (
                  <button key={c} disabled={used.has(c) && c !== currentCard(target)} onClick={() => pick(c)} aria-label={c}>
                    <span className="r" style={{ color: SUIT_COLOR[su] }}>{r === 'T' ? '10' : r}</span>
                    <span className="s" style={{ color: SUIT_COLOR[su] }}>{SUIT_SYMBOL[su]}</span>
                  </button>
                );
              }))}
            </div>
          </div>
        ) : replay && selCell && sel ? (
          <Keypad who={name(sel.p)} toCall={selCell.toCall} filled={!!selCell.act} typed={typed} setTyped={(v) => { setTyped(v); setRaiseErr(null); }} isRaise={selCell.high > 0}
            dark={darkOn} darkLabel={isPre ? 'Straddle' : 'Dark'} darkEnabled={isPre ? selCell.canStraddle && selCell.canRaise : true} canRaise={selCell.canRaise}
            onDark={toggleDark} minErr={raiseErr} minTo={minTo}
            onCall={() => act(sel.p, sel.r, mark({ k: 'call' }))} onFold={() => act(sel.p, sel.r, mark({ k: 'fold' }))}
            onAllIn={() => act(sel.p, sel.r, mark({ k: 'allin', to: typed ? Number(typed) : undefined }))}
            onClear={() => act(sel.p, sel.r, null)} onOk={() => commitBet()} onMin={() => commitBet(minTo)} />
        ) : null}
        <div className="felt-dock-actions">
          {st.tab === 'setup' && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab(st.ended ? 'showdown' : lastStreet)}>Next</button>}
          {street && (nextStreet && log.streets[nextStreet] ? (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab(nextStreet)}>{LABEL[nextStreet]}</button>
          ) : st.ended ? (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab('showdown')}>Showdown</button>
          ) : (
            <button className={`sat-btn sat-btn--lg ${replay?.next ? '' : 'sat-btn--primary'}`} onClick={() => nextFrom(street)}>{nextLabel(g, log, street, stacks)}</button>
          ))}
          {st.tab === 'showdown' && (
            <>
              {!existing && <button className="sat-btn sat-btn--lg" aria-disabled={!!res?.missing} onClick={() => save(true)}>Save, next</button>}
              <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!!res?.missing} onClick={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function tabDone(log: HandLog, t: Tab, ended: boolean) {
  if (t === 'setup') return true;
  if (t === 'showdown') return ended;
  return !!log.streets[t]?.at;
}

function targetLabel(t: Exclude<Target, null>, name: (id: ID) => string) {
  if (t.kind === 'board') return BOARD_SLOT[t.i];
  if (t.kind === 'run') return `Run ${t.r + 1}, card ${t.i + 1}`;
  return `${name(t.p)}, card ${t.ci + 1}`;
}

/** Label for closing the street on screen (empty boxes take their defaults). */
function nextLabel(g: Game, log: HandLog, s: StreetName, stacks?: Record<ID, number>) {
  const l = closeStreet(g, log, s, 1, stacks);
  if (inAtEnd(l, s).length <= 1) return 'Result';
  if (s === 'river') return 'Showdown';
  if (actionClosed(l, s)) return 'Run it out';
  return `${LABEL[STREETS[STREETS.indexOf(s) + 1]]}`;
}

function firstEmptyRun(log: HandLog, board: (Card | null)[], runSlots: (Card | null)[][]): Target {
  const runs = log.runs ?? 1;
  const from = log.runFrom ?? 0;
  if (runs <= 1) {
    const i = board.findIndex((x, k) => !x && k >= from);
    return i >= 0 ? { kind: 'board', i } : null;
  }
  for (let r = 0; r < runs; r++) {
    const i = (runSlots[r] ?? []).findIndex((x) => !x);
    if (i >= 0) return { kind: 'run', r, i };
  }
  return null;
}

/* ------------------------------- pieces ------------------------------- */

function BoardRow({ board, to, lockedBefore, isTarget, onTap }: {
  board: (Card | null)[]; to: number; lockedBefore: number; isTarget: (i: number) => boolean; onTap: (i: number, filled: boolean) => void;
}) {
  return (
    <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap', paddingTop: 6 }}>
      {Array.from({ length: to }, (_, i) => {
        const c = board[i];
        if (i < lockedBefore) return <PlayingCard key={i} card={c} size="sm" />;
        return <PlayingCard key={i} card={c} size="lg" target={isTarget(i)} placeholder={i < 3 ? 'FLOP' : i === 3 ? 'TURN' : 'RIVER'} onClick={() => onTap(i, !!c)} />;
      })}
    </div>
  );
}

/** Rows from the small blind down to the button; columns are passes around the table, newest on the right.
    Grey boxes have nothing to decide. Players out of the hand stay as greyed rows. Amounts are street
    totals, so only a player's latest box stands; earlier boxes fade. C = call or check, F = fold. */
function ActionTable({ g, log, street, replay, sel, stacks, name, onPick }: {
  g: Game; log: HandLog; street: StreetName; replay: Replay; sel: Sel; stacks?: Record<ID, number>;
  name: (id: ID) => string; onPick: (p: ID, r: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const bl = blinds(g, log.dealt, log.button);
  const [sbSeat] = Object.keys(bl);
  const rows = rowOrder(g, log);
  const startIn = inAtStart(log, street);
  const spentBefore = (p: ID) => STREETS.slice(0, STREETS.indexOf(street)).reduce((a, x) => a + (log.streets[x]?.bets[p] ?? 0), 0);
  const tag = (p: ID) => (p === log.button && bl[p] !== undefined ? 'BTN, SB' : p === log.button ? 'BTN' : bl[p] !== undefined ? (p === sbSeat ? 'SB' : 'BB') : '');
  const s = replay.street;
  // keep the box being filled in view above the keypad
  useEffect(() => {
    document.querySelector('.felt-box.is-sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sel?.p, sel?.r]);
  // keep the newest column in view
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) { el.scrollLeft = el.scrollWidth; setScrolled(el.scrollLeft > 4); }
  }, [replay.cols, street]);
  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="felt-acts-wrap">
        {scrolled && <span className="felt-acts-more" aria-hidden="true">Earlier</span>}
        <div ref={scroller} className={`felt-acts ${scrolled ? 'is-scrolled' : ''}`} style={{ ['--cols' as string]: replay.cols }} onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 4)}>
          <div className="felt-acts-row felt-acts-head">
            <span className="felt-acts-name"><Caption tip="betEntry">Action</Caption></span>
            <span />
            {Array.from({ length: replay.cols }, (_, r) => <span key={r} className="felt-acts-col">{r + 1}</span>)}
          </div>
          {rows.map((p) => {
            const gone = !startIn.includes(p);
            const canAct = replay.order.includes(p);
            const folded = gone || s.folded.includes(p);
            const left = stacks?.[p] !== undefined ? round2(stacks[p] - spentBefore(p) - (s.bets[p] ?? 0)) : undefined;
            const sub = [tag(p), street === 'preflop' && replay.straddles.includes(p) ? 'Straddle' : '', gone ? 'Folded' : !canAct && log.allInAt?.[p] ? 'All-in' : left !== undefined && !folded ? `${units(Math.max(0, left))}` : ''].filter(Boolean).join(', ');
            return (
              <div key={p} className={`felt-acts-row ${folded ? 'is-folded' : ''}`}>
                <div className="felt-acts-name">
                  <span className="felt-ellipsis">{name(p)}</span>
                  {sub && <span className="felt-acts-sub felt-ellipsis">{sub}</span>}
                </div>
                <span />
                {Array.from({ length: replay.cols }, (_, r) => {
                  const c = canAct ? replay.cells[p]?.[r] : undefined;
                  if (c?.post) return <span key={r} className={`felt-box is-post ${c.past ? 'is-past' : ''}`} aria-label={`${name(p)} posted ${units(c.amount)} in the dark`}><span className="n sat-num">{units(c.amount)}</span><span className="felt-box-dark" aria-hidden="true"><Icon name="dark" size={12} stroke={2} /></span></span>;
                  if (!c?.needed) return <span key={r} className="felt-box is-off" aria-hidden="true" />;
                  const isSel = sel?.p === p && sel.r === r;
                  const isNext = replay.next?.p === p && replay.next.r === r;
                  const a = c.act ?? (c.implied ? { k: (c.toCall ? 'fold' : 'call') as Act['k'], d: true } : null);
                  const label = !a ? '' : a.k === 'fold' ? 'F' : a.k === 'call' ? 'C' : a.k === 'allin' ? 'All-in' : '';
                  const amt = a && (a.k === 'bet' || a.k === 'allin') ? units(c.amount) : '';
                  const spoken = !a ? 'empty' : a.k === 'fold' ? 'fold' : a.k === 'call' ? (c.toCall ? 'call' : 'check') : `${a.k === 'allin' ? 'all-in' : 'to'} ${amt}`;
                  return (
                    <button key={r} type="button" className={`felt-box ${a ? `is-${a.k}` : 'is-empty'} ${a?.d ? 'is-default' : ''} ${c.past ? 'is-past' : ''} ${isSel ? 'is-sel' : ''} ${isNext && !isSel ? 'is-next' : ''}`}
                      aria-label={`${name(p)}, action ${r + 1}: ${spoken}${a?.dark ? ', in the dark' : ''}`} onClick={() => onPick(p, r)}>
                      {label && <span className={a?.k === 'allin' ? 'v' : 'l'}>{label}</span>}
                      {amt && <span className="n sat-num">{amt}</span>}
                      {a?.dark && <span className="felt-box-dark" aria-hidden="true"><Icon name="dark" size={12} stroke={2} /></span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Choices for the selected box: Call (Check when nothing is owed), Fold, All-in, or an amount (the street
    total they bet or raised to). The boxes show these as C, F and the number. The amount has its own field
    with a backspace key inside it. Straddle (preflop, first to act only) or Dark (after the flop) marks a
    blind action. Raising is greyed out when nobody else is left to answer it. A raise under the house
    minimum shows the minimum, with the call and the minimum raise as one-tap fixes. */
function Keypad({ who, toCall, filled, typed, setTyped, isRaise, dark, darkLabel, darkEnabled, canRaise, onDark, minErr, minTo, onCall, onFold, onAllIn, onClear, onOk, onMin }: {
  who: string; toCall: number; filled: boolean; typed: string; setTyped: (v: string) => void; isRaise: boolean;
  dark: boolean; darkLabel: string; darkEnabled: boolean; canRaise: boolean; onDark: () => void; minErr: number | null; minTo: number;
  onCall: () => void; onFold: () => void; onAllIn: () => void; onClear: () => void; onOk: () => void; onMin: () => void;
}) {
  const press = (k: string) => setTyped((typed + k).replace(/^0+(?=\d)/, '').slice(0, 6));
  const verb = isRaise ? 'Raise' : 'Bet';
  const callLabel = toCall ? 'Call' : 'Check';
  return (
    <div className="felt-keypad" role="group" aria-label={`Action for ${who}`}>
      <div className="felt-keypad-head">
        <span className="felt-ellipsis"><b>{who}</b>{toCall ? `, ${units(toCall)} to call` : ''}</span>
        <span className="felt-keypad-tools">
          {filled && <button type="button" className="felt-keypad-clear" onClick={onClear}>Clear</button>}
          <button type="button" className="felt-keypad-dark" aria-pressed={dark} disabled={!darkEnabled} onClick={onDark}><Icon name="dark" size={16} stroke={2} /> {darkLabel}</button>
        </span>
      </div>
      <div className="felt-keypad-quick">
        <button type="button" onClick={onCall}>{callLabel}</button>
        <button type="button" onClick={onFold}>Fold</button>
        <button type="button" onClick={onAllIn} disabled={!canRaise && !toCall}>All-in</button>
      </div>
      {minErr !== null ? (
        <div className="felt-keypad-err" role="alert">
          <span>{verb} minimum = {units(minErr)}</span>
          <span className="felt-keypad-err-acts">
            <button type="button" onClick={onCall}>{toCall ? `Call ${units(toCall)}` : 'Check'}</button>
            <button type="button" className="is-primary" onClick={onMin}>{verb} to {units(minErr)}</button>
          </span>
        </div>
      ) : (
        <div className={`felt-keypad-amount ${canRaise ? '' : 'is-off'}`}>
          <div className={`felt-keypad-field ${typed ? 'has-value' : ''}`} aria-live="polite">
            <span className="felt-keypad-label">{verb} to</span>
            <span className="felt-keypad-val sat-num">{!canRaise ? <span className="felt-keypad-min">nobody left to raise</span> : typed || <span className="felt-keypad-min">min {units(minTo)}</span>}</span>
            <button type="button" className="felt-keypad-bs" aria-label="Delete last digit" disabled={!typed || !canRaise} onClick={() => setTyped(typed.slice(0, -1))}><Icon name="backspace" size={22} stroke={1.8} /></button>
          </div>
          <button type="button" className="felt-keypad-ok" aria-disabled={!typed || !canRaise} disabled={!canRaise} onClick={onOk}>{verb}</button>
        </div>
      )}
      <div className="felt-keypad-digits">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k) => <button key={k} type="button" disabled={!canRaise} onClick={() => press(k)}>{k}</button>)}
      </div>
    </div>
  );
}

/* ------------------------------- showdown ------------------------------- */

/** Showdown, in three visually different parts: run-out (if all-in), cards shown (a list of hands),
    and the result (one accent card saying who wins what). Partly recorded hands add the final pot. */
function Showdown({ g, st, log, live, res, extra, recordedPot, exclude, name, boardForResolve, commonCards, isTarget, tapSlot, setRuns, set, setTarget }: {
  g: Game; st: RState; log: HandLog; live: ID[]; res: ReturnType<typeof resolve> | null; extra: number; recordedPot: number; exclude: boolean;
  name: (id: ID) => string; boardForResolve: () => Card[]; commonCards: (n: number) => Card[];
  isTarget: (t: Exclude<Target, null>) => boolean; tapSlot: (t: Exclude<Target, null>, filled: boolean) => void; setRuns: (n: number) => void;
  set: (p: Partial<RState>) => void; setTarget: (t: Target) => void;
}) {
  const order = showdownOrder(g, log, live);
  const b = boardForResolve();
  const winnersOf = new Set(res?.winners.map((w) => w.playerId) ?? []);
  return (
    <>
      {log.runFrom !== undefined && live.length > 1 && (
        <section className="sat-glass sat-card sat-stack" style={gap(3)}>
          <div className="sat-split"><h2 className="sat-h3">All-in: run it</h2><Help k="runs" /></div>
          <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Times to run the board">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={(log.runs ?? 1) === n} onClick={() => setRuns(n)}>{n === 1 ? 'Once' : `${n}x`}</button>)}
          </div>
          {(log.runs ?? 1) === 1 ? (
            <BoardRow board={st.board} to={5} lockedBefore={log.runFrom} isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
          ) : (
            <div className="sat-stack" style={gap(2)}>
              {Array.from({ length: log.runs ?? 1 }, (_, r) => (
                <div key={r} className="sat-cluster" style={{ ...gap(2), flexWrap: 'nowrap' }}>
                  <span className="sat-caption" style={{ width: 44 }}>Run {r + 1}</span>
                  {commonCards(log.runFrom ?? 0).map((c) => <PlayingCard key={c} card={c} size="sm" />)}
                  {Array.from({ length: 5 - (log.runFrom ?? 0) }, (_, i) => (
                    <PlayingCard key={i} card={st.runSlots[r]?.[i] ?? null} target={isTarget({ kind: 'run', r, i })} onClick={() => tapSlot({ kind: 'run', r, i }, !!st.runSlots[r]?.[i])} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {live.length > 1 && (
        <section className="felt-section">
          <div className="sat-split">
            <h2 className="sat-caption felt-section-cap">Cards shown <Help k="shown" /></h2>
            <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => { set({ skipReveal: !st.skipReveal }); setTarget(null); }}>{st.skipReveal ? 'Show cards' : 'Skip'}</button>
          </div>
          {!st.skipReveal && b.length > 0 && <div className="felt-board-mini"><span className="sat-caption">Board</span>{b.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>}
          {st.skipReveal ? <p className="sat-small sat-muted">Cards skipped. Pick who won below.</p> : (
            <div className="felt-showlist">
              {order.map((p, i) => {
                const cards = st.shown[p] ?? [null, null];
                const mucked = log.mucked.includes(p);
                const v = cards.every(Boolean) && b.length === 5 ? bestHand([...(cards as Card[]), ...b]) : null;
                return (
                  <div key={p} className={`felt-show ${winnersOf.has(p) && !res?.missing ? 'is-winner' : ''} ${mucked ? 'is-mucked' : ''}`}>
                    <span className="felt-show-n sat-num">{i + 1}</span>
                    <div className="felt-row-main">
                      <div className="felt-row-title">{name(p)}{log.allInAt?.[p] ? <span className="sat-badge sat-badge--muted" style={{ marginLeft: 6 }}>All-in</span> : null}</div>
                      <div className="felt-row-sub">{mucked ? 'Mucked' : v ? v.name : 'Not shown'}</div>
                    </div>
                    {!mucked && cards.map((c, ci) => <PlayingCard key={ci} card={c} target={isTarget({ kind: 'shown', p, ci })} onClick={() => tapSlot({ kind: 'shown', p, ci }, !!c)} />)}
                    <button className="sat-chip felt-mini" aria-pressed={mucked} onClick={() => set({ log: { ...log, mucked: mucked ? log.mucked.filter((x) => x !== p) : [...log.mucked, p] } })}>Muck</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {st.partial && (
        <section className="felt-partial sat-stack" style={gap(3)}>
          <div className="sat-split"><h2 className="sat-h3">Partly recorded</h2><Help k="partial" /></div>
          <div className="sat-field">
            <label htmlFor="fp">Final pot (chips)</label>
            <input id="fp" className="sat-input sat-num" inputMode="decimal" placeholder={String(recordedPot)} value={st.finalPot} onChange={(e) => set({ finalPot: e.target.value })} />
            <span className="sat-hint">Recorded so far: {units(recordedPot)}.{extra ? ` ${units(extra)} added to the main pot.` : ''}</span>
          </div>
          <div className="sat-switch-row">
            <span>Leave out of stats</span>
            <Toggle on={exclude} onChange={(v) => set({ exclude: v })} label="Leave out of stats" />
          </div>
        </section>
      )}

      {res && <Result res={res} live={live} runs={log.runs ?? 1} name={name} manual={st.manual} onManual={(i, ids) => set({ manual: { ...st.manual, [i]: ids } })} />}

      <div className="sat-field">
        <label htmlFor="note">Note</label>
        <textarea id="note" className="sat-input" placeholder="Optional" value={st.note} onChange={(e) => set({ note: e.target.value })} />
      </div>
    </>
  );
}

/** Who wins: one accent card. Undecided pots ask "Who won?" with big name buttons. */
function Result({ res, live, runs, name, manual, onManual }: {
  res: ReturnType<typeof resolve>; live: ID[]; runs: number; name: (id: ID) => string;
  manual: Record<number, ID[]>; onManual: (i: number, ids: ID[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const total = res.pots.reduce((a, p) => a + p.amount, 0);
  const names = (ids: ID[]) => ids.map(name).join(' and ');
  const winners = res.winners.map((w) => w.playerId);
  const headline = live.length === 1 ? `${name(live[0])} wins` : res.missing ? 'Who won?' : winners.length === 1 ? `${name(winners[0])} wins` : `${names(winners)} split`;
  return (
    <section className={`felt-result ${res.missing ? 'is-open' : ''}`} aria-live="polite">
      <span className="sat-caption">{live.length === 1 ? 'Everyone else folded' : res.missing ? 'Result' : 'Winner'}</span>
      <div className="felt-result-head">
        <span className="felt-result-name">{headline}</span>
        <span className="felt-result-pot sat-num">{units(total)}<small> chips</small></span>
      </div>
      {live.length > 1 && res.pots.map((p, i) => {
        const decided = p.runs.every((r) => r.winners.length);
        const open = !decided || editing === i;
        const title = res.pots.length === 1 ? 'Pot' : i === 0 ? 'Main pot' : `Side pot ${i}`;
        return (
          <div key={i} className="felt-result-pot-row">
            <div className="sat-split" style={{ flexWrap: 'nowrap' }}>
              <span className="sat-small"><b>{title} <span className="sat-num">{units(p.amount)}</span></b>{decided ? `: ${names(p.winners.map((w) => w.playerId))}` : ''}</span>
              {decided && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? 'Done' : 'Change'}</button>}
            </div>
            {runs > 1 && decided && <p className="sat-small sat-muted">{p.runs.map((r, k) => `Run ${k + 1}: ${names(r.winners)}`).join('. ')}</p>}
            {open && (
              <div className="felt-pickwin">
                {p.eligible.map((q) => (
                  <button key={q} className="felt-pickwin-btn" aria-pressed={!!manual[i]?.includes(q)}
                    onClick={() => onManual(i, manual[i]?.includes(q) ? manual[i].filter((x) => x !== q) : [...(manual[i] ?? []), q])}>{name(q)}</button>
                ))}
                <span className="sat-small sat-muted">Tap 2 or more names to split the pot.</span>
              </div>
            )}
          </div>
        );
      })}
      {!res.missing && res.winners.length > 1 && (
        <div className="felt-result-split">
          {res.winners.map((w) => <span key={w.playerId}>{name(w.playerId)} <b className="sat-num">{units(w.amount)}</b></span>)}
        </div>
      )}
      {Object.entries(res.returned).map(([p, a]) => <p key={p} className="sat-small sat-muted"><span className="sat-num">{units(a)}</span> returned to {name(p)}: nobody matched it.</p>)}
      {runs > 1 && <p className="sat-small sat-muted">Each run wins an equal share of each pot; an odd chip goes to run 1. <Help k="runs" /></p>}
    </section>
  );
}
