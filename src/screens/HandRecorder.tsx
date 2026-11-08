import { PlayerName, openPlayer } from '../components/players';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, backPlain, backTo, go } from '../router';
import { installSwipeBack } from '../lib/swipeBack';
import { CardEntrySheet } from '../components/cardEntry';
import { useRebuyOffer } from '../components/rebuy';
import { dropInbox, inboxFor, liveStatus, publishNow } from '../live/host';
import { buildNow } from '../live/snapshot';
import { CardPickerGrid, Caption, Empty, Header, Help, Icon, PlayingCard, Toggle, num, toast, withUndo, TabPill, useDockPush, useSwipeDown, SlidePane, DockPanel, WordButton } from '../components/ui';
import { SPRING, calm, spring } from '../lib/motion';
import { bestHand, cardText } from '../lib/cards';
import { playerStatus, round2 } from '../lib/calc';
import { units } from '../lib/format';
import { uid } from '../lib/ids';
import { haptic } from '../lib/haptics';
import {
  NOT_SHOWN, STREETS, STREET_CARDS, actionClosed, blinds, bountyWinner, closeStreet, contributions, is27, minRaiseTo, dropAfter, fillBefore, finalists, hasActs, inAtEnd, inAtStart,
  isTakedown, newBoxLog, openStreetBoxes, partlyRecorded, potTotal, replayStreet, resolve, rowOrder, setAct, showdownOrder, unknownBoxes, type Replay,
} from '../lib/hand';
import { estimateStacks, exactStacks } from '../lib/stacks';
import { gameRules } from '../lib/rules';
import type { Act, Card, Game, Hand, HandLog, ID, StreetName } from '../types';

/* Hand recorder, one tab per stage in the order things happen at the table:
   Setup (who is dealt in, the button, the blinds), Pre-flop, Flop, Turn, River, Showdown.
   A new hand opens straight on Pre-flop with everyone playing dealt in and the button moved on.
   Each street is a table: one row per player from the button down, one column per pass around the
   table. Tap a box and choose Check, Call, Fold or an amount. Tapping a box further down fills the
   empty boxes before it with their default (check, or fold facing a bet), so only bets, raises and
   calls need a tap. Any tab can be opened at any time; skipping ahead marks the hand partly recorded. */

type Tab = 'setup' | StreetName | 'showdown';
type Target = { kind: 'board'; i: number } | { kind: 'run'; r: number; i: number } | { kind: 'shown'; p: ID; ci: number } | { kind: 'mine'; ci: number } | null;
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
  /** 2-7 bounty paid to this player; undefined = follow the shown cards, null = none. */
  bounty?: ID | null;
  /** Players dealt in who did not pay the bounty. */
  bountyOff?: ID[];
  /** The phone owner's own hole cards (private). */
  mine?: (Card | null)[];
}

const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const LABEL: Record<Tab, string> = { setup: 'Setup', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
const TABS: Tab[] = ['setup', 'preflop', 'flop', 'turn', 'river', 'showdown'];
const BOARD_SLOT = ['Flop card 1', 'Flop card 2', 'Flop card 3', 'Turn card', 'River card'];
const isStreet = (t: Tab): t is StreetName => (STREETS as Tab[]).includes(t);

function bySeat(g: Game, ids: ID[]) { return [...ids].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99)); }

/** A bought-in player whose exact stack is 0 has nothing to play with until a rebuy. */
function noChips(g: Game, p: ID): boolean {
  const est = estimateStacks(g);
  return g.buyIns.some((b) => b.playerId === p) && !(est.spread[p] > 0) && (est.stack[p] ?? 0) <= 0;
}

/** Pre-filled by status: everyone playing (green) who has chips. Away players can be added with a tap. */
function dealtDefault(g: Game): ID[] {
  return bySeat(g, g.playerIds.filter((p) => playerStatus(g, p) === 'playing' && !noChips(g, p)));
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
/** Where a hand picked up again opens: the newest street, or the showdown once the hand has ended. */
function resumeTab(st: RState): Tab {
  if (st.ended) return 'showdown';
  return STREETS.filter((s) => st.log.streets[s]).pop() ?? 'preflop';
}
/** The cards still to enter at that point: the street's board cards, the run cards, or the next player to show. */
function resumeTarget(g: Game, st: RState): Target {
  if (isStreet(st.tab)) {
    const i = st.board.findIndex((c, k) => !c && k < STREET_CARDS[st.tab as StreetName]);
    return i >= 0 && st.tab !== 'preflop' ? { kind: 'board', i } : null;
  }
  const lv = finalists(st.log);
  if (st.log.runFrom !== undefined && lv.length > 1) {
    const run = firstEmptyRun(st.log, st.board, st.runSlots);
    if (run) return run;
  }
  const first = showdownOrder(g, st.log, lv).find((p) => !(st.shown[p]?.filter(Boolean).length === 2) && !st.log.mucked.includes(p));
  return lv.length > 1 && st.board.filter(Boolean).length === 5 && !st.skipReveal && first ? { kind: 'shown', p: first, ci: st.shown[first]?.[0] ? 1 : 0 } : null;
}
const draftKey = (gameId: string) => `felt-draft-${gameId}`;
function readDraft(gameId: string, n: number): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(gameId)) ?? 'null') as Draft | null;
    return d && d.v === 1 && d.st?.n === n ? d : null;
  } catch { return null; }
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
  // busted players are offered a rebuy once their hand is saved. It never blocks: Skip always works.
  const { offer: offerRebuy, sheet: rebuySheet } = useRebuyOffer(gameId);
  // Save hand leaves the page; it waits while the rebuy sheet is open, then leaves
  const leaveAfterRebuy = useRef(false);
  const [, setSaved] = useState(0);
  useEffect(() => {
    if (leaveAfterRebuy.current && !rebuySheet) { leaveAfterRebuy.current = false; back(`game/${gameId}`); }
  });
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
    if (draft) return { ...draft.st, tab: resumeTab(draft.st) };
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
        mine: [null, null],
        // a saved hand keeps the bounty it was saved with; it never adds one by itself
        bounty: existing.bounty?.playerId ?? null,
        bountyOff: existing.bounty ? L.dealt.filter((p) => p !== existing.bounty!.playerId && !existing.bounty!.payers.includes(p)) : [],
      };
    }
    return freshState(g, nNew, dealtDefault(g), buttonFor(g, dealtDefault(g), nNew), stacksRef.current ?? {});
  });
  // a hand picked up again opens where it stopped: the street's cards if they are missing, else the player to act
  const [target, setTarget] = useState<Target>(() => (st && draft ? resumeTarget(g!, st) : null));
  const [sel, setSel] = useState<Sel>(() => {
    if (!st || existing || !isStreet(st.tab) || !st.log.streets[st.tab]?.acts) return null;
    return replayStreet(g!, st.log, st.tab, stacks).next;
  });
  const [typed, setTyped] = useState('');
  // keypad: dark (blind) mark for the next action, and a raise under the house minimum
  const settings = useStore((s) => s.settings);
  const allPlayers = useStore((s) => s.players);
  // a closed game opens its hands for review only: browse every stage, change nothing
  const readOnly = g?.status === 'closed' && !!existing;
  const reviewable = (g?.hands ?? []).filter((h) => !h.missed && h.log);
  const prevHand = existing ? [...reviewable].reverse().find((h) => h.n < existing.n) : undefined;
  const nextReview = existing ? reviewable.find((h) => h.n > existing.n) : undefined;
  const me = settings.me;
  const cardsFor: ID | null = readOnly ? null : me ?? null;
  const [askCards, setAskCards] = useState(false);
  // swipe back from the left edge: recording closes the page into the Log hand button; review slides back to the hand list
  const pageRef = useRef<HTMLDivElement>(null);
  const leaveTo = useRef('');
  leaveTo.current = readOnly ? `game/${g?.id ?? ''}/hands` : `game/${g?.id ?? ''}`;
  const ready = !!g && !!st;
  // installed once per page, so a render during the swipe never drops a swipe that is finishing
  useEffect(() => {
    const el = pageRef.current;
    if (!el || !ready) return;
    return installSwipeBack(el, () => backPlain(leaveTo.current), readOnly ? 'slide' : 'morph');
  }, [ready, readOnly]);
  /** Cards entered through Player cards before the hand is saved. They join the hand when it saves. */
  const [extraPriv, setExtraPriv] = useState<Record<ID, Card[]>>({});
  // load the private cards already saved for that player in this hand
  useEffect(() => {
    if (!existing || !cardsFor) return;
    const c = existing.private?.[cardsFor] ?? [];
    setSt((x) => (x ? { ...x, mine: [c[0] ?? null, c[1] ?? null] } : x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsFor, existing?.id]);
  const { minRaise: minRule, bounty27: bountyRule } = g ? gameRules(g, settings) : settings;
  const [dark, setDark] = useState(false);
  const [raiseErr, setRaiseErr] = useState<number | null>(null);
  // All-in with the stack only a range: the keypad asks for the amount (it was the whole stack)
  const [allInAsk, setAllInAsk] = useState(false);
  const dock = useDockPush();
  const panelOpen = !!target || !!sel;
  useSwipeDown(dock, () => { setTarget(null); setSel(null); setTyped(''); setDark(false); setRaiseErr(null); setAllInAsk(false); }, panelOpen);
  // a card picker that opens under the finger must not take the second tap of a double tap
  const pickerAt = useRef(0);
  useEffect(() => { if (target) pickerAt.current = Date.now(); }, [!!target]); // eslint-disable-line react-hooks/exhaustive-deps
  // the keypad or card picker never covers the field being filled: it scrolls clear, between the header and the dock
  const fieldKey = target ? JSON.stringify(target) : sel ? `${sel.p}/${sel.r}` : '';
  // This runs whenever the selected box changes: a tap on a box, or a finished box that moves the selection on to
  // the next open box. With many players the table is taller than the screen, so the box scrolls into the band
  // between the sticky header and whatever is at the bottom (the dock with the keypad, or the keyboard).
  useEffect(() => {
    if (!fieldKey) return;
    const clear = () => {
      const all = [...document.querySelectorAll<HTMLElement>(target ? '.felt-recorder .felt-card.target, .felt-recorder .felt-acts-name.is-target' : '.felt-recorder .felt-box.is-sel')];
      const el = all.find((x) => !x.closest('.felt-header, .felt-slide-out'));
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const root = document.documentElement;
      const cssPx = (name: string) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
      // the bottom edge of what the person can see: the visual viewport (it shrinks under a keyboard, see --felt-kb)
      const seen = vv ? vv.offsetTop + vv.height : window.innerHeight - cssPx('--felt-kb');
      const dockEl = document.querySelector<HTMLElement>('.felt-rec-dock');
      const dockH = dockEl?.offsetHeight || cssPx('--felt-dock-h');
      const dockTop = dockEl ? dockEl.getBoundingClientRect().top : window.innerHeight - dockH;
      const bottom = Math.min(seen, dockTop) - 16;
      const top = Math.max(document.querySelector('.felt-header')?.getBoundingClientRect().bottom ?? 0, vv?.offsetTop ?? 0) + 8;
      const dy = r.bottom > bottom ? r.bottom - bottom : r.top < top ? r.top - top : 0;
      if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: calm() ? 'auto' : 'smooth' });
    };
    const f = requestAnimationFrame(clear);
    // the dock grows as the keypad opens and the header shrinks with the board: check again once they have settled
    const t1 = window.setTimeout(clear, 160);
    const t2 = window.setTimeout(clear, 380);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', clear);
    return () => { cancelAnimationFrame(f); window.clearTimeout(t1); window.clearTimeout(t2); vv?.removeEventListener('resize', clear); };
  }, [fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (existing || !st) return;
    try { localStorage.setItem(draftKey(gameId), JSON.stringify({ v: 1, st, dealt, button, sb, bb } satisfies Draft)); } catch { /* storage full or private mode */ }
  }, [st, dealt, button, sb, bb, existing, gameId]);

  // Live link: send the hand in progress to viewers after each change (public information only)
  useEffect(() => {
    if (!g || !st || readOnly || !liveStatus(g.id).on) return;
    const t = window.setTimeout(() => {
      publishNow(g.id, buildNow(g, useStore.getState().players, { n: st.n, tab: st.tab, log: st.log, board: st.board, ended: st.ended, shown: st.shown, runSlots: st.runSlots })).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(t);
  }, [g, st, readOnly]);

  // While the keypad is open the rest of the screen is greyed out: a tap anywhere outside the keypad and
  // the action boxes only puts the keypad away (that tap does nothing else). Scrolling leaves it open.
  const keypadOpen = useRef(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!keypadOpen.current || !t || t.closest('.felt-keypad, .felt-box, .felt-acts-bar, .sat-tip, .sat-tip-body, .felt-mine, .felt-rec-board')) return;
      e.preventDefault();
      e.stopPropagation();
      setSel(null); setTyped(''); setDark(false); setRaiseErr(null); setAllInAsk(false);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const used = useMemo(() => {
    const s = new Set<Card>();
    if (!st) return s;
    st.board.forEach((c) => c && s.add(c));
    // run cards count only while the hand is on a run: going back to a street frees them
    if (st.log.runFrom !== undefined) st.runSlots.forEach((r) => r.forEach((c) => c && s.add(c)));
    // a hand never blocks anything: only the board and the runs take a card out of the picker
    return s;
  }, [st]);

  if (!g || !st) return <div className="felt-page"><Header back={() => go('')} title="Hand" /><Empty title="Game not found">It may have been deleted.</Empty></div>;

  const log = st.log;
  const set = (patch: Partial<RState>) => setSt({ ...st, ...patch });
  const mineCards = (st.mine ?? []).filter(Boolean) as Card[];
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
  // Partly recorded follows the log: filling in every skipped box makes the hand whole again.
  // Hands from the earlier recorder (no action boxes) keep the flag they were saved with.
  const boxLog = Object.values(log.streets).some((s) => s?.acts);
  const partial = boxLog ? (st.ended ? partlyRecorded(g, log, stacks) : unknownBoxes(g, log, stacks) > 0) : st.partial;
  const finalPotN = num(st.finalPot);
  const extra = partial && finalPotN !== null && finalPotN > recordedPot ? round2(finalPotN - recordedPot) : 0;
  const res = st.ended ? resolve(g, fullLog(), boardForResolve(), log.button, st.manual, extra) : null;
  const exclude = st.exclude ?? partial;
  // 2-7 bounty: filled in from the shown cards under the house rule, or picked by hand
  const bountyOn = bountyRule.on || !!existing?.bounty;
  const bountyAmt = existing?.bounty?.amount ?? bountyRule.amount;
  const bountyAuto = res && bountyOn ? bountyWinner(res, live, fullLog().shown, bountyRule) : null;
  const bountyPick = st.bounty === undefined ? bountyAuto : st.bounty;
  const bountyTo = bountyPick && live.includes(bountyPick) ? bountyPick : null;
  // Chips left after the pot, where the stack is known. A player who busts in the hand is exempt; a short
  // stack pays what it has. With the stack only a range, a player all-in who won nothing counts as busted.
  const contrib = res ? contributions(g, log, log.button) : {};
  const leftAfter = (p: ID) => (!res || stacks?.[p] === undefined ? undefined
    : round2(stacks[p] - (contrib[p] ?? 0) + (res.winners.find((w) => w.playerId === p)?.amount ?? 0) + (res.returned[p] ?? 0)));
  const busted = res ? log.dealt.filter((p) => {
    const l = leftAfter(p);
    if (l !== undefined) return l <= 0;
    return !!log.allInAt?.[p] && !res.winners.some((w) => w.playerId === p) && !res.returned[p];
  }) : [];
  const bountyPayers = bountyTo ? log.dealt.filter((p) => p !== bountyTo && !busted.includes(p) && !(st.bountyOff ?? []).includes(p)) : [];
  const bountyShort: Record<ID, number> = Object.fromEntries(bountyPayers.map((p) => [p, leftAfter(p)]).filter(([, l]) => l !== undefined && (l as number) < bountyAmt));
  const payOf = (p: ID) => bountyShort[p] ?? bountyAmt;
  // A shown 2-7 gets a Pay bounty tag: pressed when the bounty is paid to it. Felt presses it when the
  // game's rule is met; the table can press it anyway, or clear it.
  const shown27 = (p: ID) => bountyOn && is27((st.shown[p] ?? []).filter(Boolean) as Card[], bountyRule.suited);
  const payTag = (p: ID) => (
    <>
      {/* my own cards entered earlier: one tap shows them, when I show at the table */}
      {shown27(p) && live.includes(p) && (
        <span className="felt-paytag-wrap">
          <button type="button" className="sat-chip felt-mini felt-paytag" aria-pressed={bountyTo === p} onClick={() => set({ bounty: bountyTo === p ? null : p })}>Pay bounty</button>
          <Help k="payBounty" />
        </span>
      )}
    </>
  );
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
    if (!dealt.includes(p) && noChips(g, p)) { toast(`${name(p)} has 0 chips. Add a buy-in first.`); return; }
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
    l2 = { ...l2, runFrom: undefined, runs: 1, runCards: [] };
    setSt({ ...st, ...patch, log: l2, runSlots: [], tab: s, ended: false });
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
    if (r.ended) {
      const before = st, beforeSel = sel;
      const filled = replayStreet(g, log, s, stacks).waiting.length;
      enterShowdown(r.l, { partial: r.partial });
      if (filled) toast('Empty boxes took the default.', { label: 'Undo', run: () => { setSt(before); setSel(beforeSel); setTarget(null); } });
      return;
    }
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
    setAllInAsk(false);
    let l = setAct(g, log, street, p, r, a, stacks);
    let ended = st.ended;
    if (l.streets[street]?.at && (inAtEnd(l, street).length <= 1 || actionClosed(l, street))) { l = dropAfter(l, street); ended = true; }
    setSt({ ...st, log: l, ended });
    setTyped('');
    setSel(keepSel ? { p, r } : replayStreet(g, l, street, stacks).next);
  };
  const pickBox = (p: ID, r: number) => {
    if (!replay || !street || readOnly) return;
    const c = replay.cells[p]?.[r];
    if (!c?.needed) return;
    setTarget(null);
    setTyped('');
    setDark(false);
    setRaiseErr(null);
    setAllInAsk(false);
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
      partial: partial || undefined, excluded: exclude || undefined,
      bounty: bountyTo && bountyPayers.length ? { playerId: bountyTo, amount: bountyAmt, payers: bountyPayers, short: Object.keys(bountyShort).length ? bountyShort : undefined } : undefined,
      private: { ...(privateWith(existing?.private, me && log.dealt.includes(me) ? me : null, mineCards) ?? {}), ...extraPriv },
      mine: undefined,
    };
    saveHand(g.id, hand);
    try { localStorage.removeItem(draftKey(g.id)); } catch { /* ignore */ }
    offerRebuy(hand);
    if (next) nextHand(hand.n + 1, `Hand ${hand.n} saved. Hand ${hand.n + 1} dealt.`);
    else { leaveAfterRebuy.current = true; setSaved((n) => n + 1); }
  };
  const nextHand = (n: number, msg: string) => {
    try { localStorage.removeItem(draftKey(g.id)); } catch { /* ignore */ }
    go(`game/${g.id}/hand/new`, true);
    const fg = useStore.getState().games.find((x) => x.id === g.id)!;
    const d = dealtDefault(fg);
    const b = buttonFor(fg, d, n);
    stacksRef.current = exactStacks(fg, n);
    setDealt(d); setButton(b); setSb(String(fg.sb)); setBb(String(fg.bb));
    const fresh = freshState(fg, n, d, b, stacksRef.current);
    setSt(fresh);
    setSel(replayStreet(fg, fresh.log, 'preflop', stacksRef.current).next);
    setTarget(null); setTyped('');
    window.scrollTo(0, 0);
    toast(msg);
  };

  /** A hand played but not logged: it keeps the hand count and the button right, and widens the stacks. */
  const saveMissed = () => {
    const t = Date.now();
    saveHand(g.id, {
      id: st.id, n: st.n, at: log.startedAt, endedAt: t, dealerId: button, pot: 0, winners: [], board: [], boardNA: true,
      shown: [], allIn: false, straddle: false, tags: [], missed: true, excluded: true,
    });
    nextHand(st.n + 1, `Hand ${st.n} marked missed. Hand ${st.n + 1} dealt.`);
  };

  /** Player cards (write only): in review they save into the closed game at once, while recording they join the hand when it saves. */
  const savePlayerCards = (p: ID, cards: Card[]) => {
    if (readOnly) {
      updateGame(g.id, (x) => {
        const h = x.hands.find((y) => y.id === st.id);
        if (h) h.private = privateWith(h.private, p, cards);
      });
    } else {
      setExtraPriv((x) => ({ ...x, [p]: cards }));
      // the host overrides what the player sent for this hand
      dropInbox(g.id, p, st.n).catch(() => undefined);
    }
  };

  /** Private cards: kept in the hand state while recording; in review they save at once (the game is closed). */
  const setMine = (m: (Card | null)[]) => {
    set({ mine: m });
    if (readOnly && cardsFor) {
      updateGame(g.id, (x) => {
        const h = x.hands.find((y) => y.id === st.id);
        if (h) h.private = privateWith(h.private, cardsFor, m.filter(Boolean) as Card[]);
      });
    }
  };

  /* --------- cards --------- */
  const pick = (c: Card) => {
    if (!target || Date.now() - pickerAt.current < 300) return;
    if (target.kind === 'mine') {
      const m = [...(st.mine ?? [null, null])]; m[target.ci] = c;
      setMine(m);
      setTarget(target.ci === 0 && !m[1] ? { kind: 'mine', ci: 1 } : null);
      return;
    }
    if (readOnly) return;
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
      if (st.tab !== 'showdown') {
        const before = st.shown;
        setTarget(null);
        toast(`${name(target.p)} shows ${nextCards.map((x) => cardText(x!)).join(' ')}.`, { label: 'Undo', run: () => setSt((x) => (x ? { ...x, shown: before } : x)) });
        return;
      }
      // on to the next player still to show
      const order = showdownOrder(g, log, live);
      const after = [...order.slice(order.indexOf(target.p) + 1), ...order.slice(0, order.indexOf(target.p))];
      const nx = after.find((p) => !(shown[p]?.filter(Boolean).length === 2) && !log.mucked.includes(p));
      setTarget(nx ? { kind: 'shown', p: nx, ci: shown[nx]?.[0] ? 1 : 0 } : null);
    }
  };
  /** Done on the card picker. Half a pair shown mid-hand is dropped, so it does not take a card out of play. */
  const closePicker = () => {
    if (target?.kind === 'shown' && st.tab !== 'showdown' && (st.shown[target.p] ?? []).filter(Boolean).length === 1) {
      const { [target.p]: _drop, ...rest } = st.shown;
      set({ shown: rest });
    }
    setTarget(null);
  };
  const isTarget = (t: Exclude<Target, null>) => JSON.stringify(t) === JSON.stringify(target);
  const tapSlot = (t: Exclude<Target, null>, filled: boolean) => {
    if (readOnly) return;
    if (isTarget(t) && filled) {
      if (t.kind === 'board') { const b = [...st.board]; b[t.i] = null; set({ board: b }); }
      else if (t.kind === 'run') { const rs = st.runSlots.map((r) => [...r]); rs[t.r][t.i] = null; set({ runSlots: rs }); }
      else if (t.kind === 'shown') { const cur = [...(st.shown[t.p] ?? [null, null])]; cur[t.ci] = null; set({ shown: { ...st.shown, [t.p]: cur } }); }
    }
    setSel(null);
    setTarget(t);
  };
  const currentCard = (t: Exclude<Target, null>) => (t.kind === 'board' ? st.board[t.i] : t.kind === 'run' ? st.runSlots[t.r]?.[t.i] : t.kind === 'mine' ? st.mine?.[t.ci] : st.shown[t.p]?.[t.ci]);
  // a hand cannot hold the same card twice. The board and the runs cannot either, and they stop a hand taking their cards.
  const pickable = (c: Card) => {
    if (c === currentCard(target!)) return true;
    if (target?.kind === 'shown' && (st.shown[target.p] ?? []).includes(c)) return false;
    if (target?.kind === 'mine' && mineCards.includes(c)) return false;
    return !used.has(c);
  };
  const setRuns = (n: number) => {
    const from = log.runFrom ?? 0;
    const rs = Array.from({ length: n }, (_, r) => st.runSlots[r] ?? Array(5 - from).fill(null));
    setSt({ ...st, log: { ...log, runs: n }, runSlots: n > 1 ? rs : [] });
    setTarget(firstEmptyRun({ ...log, runs: n }, st.board, rs));
  };

  /* --------- keypad --------- */
  const selCell = sel && replay?.cells[sel.p]?.[sel.r]?.needed ? replay.cells[sel.p][sel.r] : null;
  keypadOpen.current = !target && !!selCell;
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
    <div ref={pageRef} className={`felt-page felt-recorder ${!target && selCell ? 'has-keypad' : ''}`}>
      <Header back={() => back(readOnly ? `game/${g.id}/hands` : `game/${g.id}`)} title={`Hand ${st.n}`} sub={readOnly ? `${g.name}, review` : g.name}
        right={existing && !readOnly ? (
          <button className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Delete hand"
            onClick={() => { withUndo(`Hand ${st.n} deleted.`, () => deleteHand(g.id, st.id)); backTo(`game/${g.id}`); }}>
            <Icon name="trash" />
          </button>
        ) : undefined}>
        <div className="felt-rec-bar sat-glass">
          <div className="felt-tabs" role="tablist" aria-label="Hand stage">
            <TabPill />
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={st.tab === t} className={tabDone(log, t, st.ended) ? 'is-done' : ''} onClick={() => goTab(t)}>{LABEL[t]}</button>
            ))}
          </div>
        </div>
        <div className="felt-rec-status" aria-live="polite">
          <span>{street && toAct && !readOnly ? <><b>{toAct}</b> to act</> : ''}</span>
          <span>Pot <b className="sat-num">{units(extra ? recordedPot + extra : street ? potTotal(g, log, log.button, street) : potNow)}</b></span>
        </div>
        {street && street !== 'preflop' && (
          <div className="felt-rec-board sat-glass">
            <BoardRow board={st.board} to={STREET_CARDS[street]} lockedBefore={STREET_CARDS[STREETS[STREETS.indexOf(street) - 1]]} compact={!target && !!selCell}
              isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
          </div>
        )}
      </Header>

      <SlidePane k={st.tab} i={TABS.indexOf(st.tab)}>
      <div className="sat-stack" style={gap(3)}>
        {st.tab === 'setup' && (
          <>
            {started && (
              <div className="sat-flat sat-card sat-stack" style={gap(2)}>
                <p className="sat-small">Action is already recorded. Changing who is dealt in, the button or the blinds starts the hand again.</p>
                <button className="sat-btn sat-btn--sm" style={{ alignSelf: 'flex-start' }}
                  onClick={() => { const before = st; rebuild(dealt, button, sbN, bbN); toast('Action cleared.', { label: 'Undo', run: () => set(before) }); }}>
                  <Icon name="undo" /> Clear the action
                </button>
              </div>
            )}
            {!existing && !started && (
              <div className="sat-flat sat-card sat-stack" style={gap(2)}>
                <div className="sat-split"><span className="sat-small"><b>Missed this hand?</b></span><Help k="missed" /></div>
                <button className="sat-btn sat-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={saveMissed}>Mark hand {st.n} missed</button>
              </div>
            )}
            <fieldset className="felt-setup" disabled={started}>
              <section className="sat-stack" style={gap(2)}>
                <Caption>Dealt in ({dealt.length})</Caption>
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
                <div className="sat-cluster" style={gap(2)}>
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
                  <div className="sat-field"><label htmlFor="h-sb">SB (chips)</label><input id="h-sb" className="sat-input sat-num" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} onBlur={() => rebuild(dealt, button, sbN, bbN)} /></div>
                  <div className="sat-field"><label htmlFor="h-bb">BB (chips)</label><input id="h-bb" className="sat-input sat-num" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} onBlur={() => rebuild(dealt, button, sbN, bbN)} /></div>
                </div>
              </section>
            </fieldset>
          </>
        )}

        {street && (
          <>
            {legacy ? (
              <p className="sat-small sat-muted">This hand was logged with the earlier recorder. {inAtEnd(log, street).length} players were still in after the {LABEL[street].toLowerCase()}, pot {units(potTotal(g, log, log.button, street))}.</p>
            ) : replay && (
              <ActionTable g={g} log={log} street={street} replay={replay} sel={sel} stacks={stacks} name={name} onPick={readOnly ? () => {} : pickBox}
                shown={st.shown} namingFor={target?.kind === 'shown' ? target.p : null} onName={(p) => { if (readOnly) return; setSel(null); setTyped(''); setTarget({ kind: 'shown', p, ci: st.shown[p]?.[0] ? 1 : 0 }); }} />
            )}
          </>
        )}

        {st.tab === 'showdown' && (
          <fieldset className="felt-review sat-stack" style={gap(3)} disabled={readOnly}>
          <Showdown g={g} st={st} log={log} live={live} res={res} partial={partial} extra={extra} recordedPot={recordedPot} exclude={exclude} name={name}
            boardForResolve={boardForResolve} commonCards={commonCards} isTarget={isTarget} tapSlot={tapSlot} setRuns={setRuns}
            set={set} setTarget={setTarget} bountyOn={bountyOn} payTag={payTag}>
            {bountyOn && res && (
              <BountyBlock live={live} dealt={log.dealt} to={bountyTo} auto={bountyTo !== null && bountyTo === bountyAuto} amount={bountyAmt} off={st.bountyOff ?? []} name={name}
                busted={busted} payOf={payOf}
                onPick={(p) => set({ bounty: p })} onOff={(p) => set({ bountyOff: (st.bountyOff ?? []).includes(p) ? st.bountyOff!.filter((x) => x !== p) : [...(st.bountyOff ?? []), p] })} />
            )}
          </Showdown>
          </fieldset>
        )}
      </div>
      </SlidePane>

      {rebuySheet}
      {askCards && (
        <CardEntrySheet players={log.dealt} name={name} edge onClose={() => setAskCards(false)} onSave={savePlayerCards}
          entered={[...new Set([...Object.keys({ ...(existing?.private ?? {}), ...extraPriv }), ...inboxFor(g.id, st.n), ...(me && mineCards.length === 2 ? [me] : [])])]}
          revealed={shownCards()}
          own={me ? { id: me, code: allPlayers.find((x) => x.id === me)?.code, cards: extraPriv[me] ?? (mineCards.length === 2 ? mineCards : existing?.private?.[me]) } : undefined}
          blocked={[...used]} />
      )}
      <div ref={dock} className="sat-bottombar sat-glass-2 felt-rec-dock">
        {!target && !(replay && selCell && sel) && (
          <button type="button" className="felt-fab" aria-label="Add player cards" onClick={() => setAskCards(true)}>
            {/* the icon morphs as the sheet opens: the cards turn and fade into a cross, and back when it closes */}
            <span className="felt-fab-icon" data-open={askCards}><span className="a"><Icon name="cardsadd" size={30} stroke={1.8} /></span><span className="b"><Icon name="close" size={26} stroke={2.2} /></span></span>
          </button>
        )}
        <DockPanel k={target ? 'picker' : replay && selCell && sel ? 'keypad' : ''}>
        {target ? (
          <div className="felt-picker-wrap">
            <div className="sat-split">
              <Caption>{targetLabel(target, name)}</Caption>
              <span className="sat-cluster" style={gap(1)}>
                {target.kind === 'mine' && mineCards.length > 0 && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => { setMine([null, null]); setTarget({ kind: 'mine', ci: 0 }); }}>Clear</button>}
                {target.kind === 'shown' && (st.shown[target.p] ?? []).some(Boolean) && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => { const { [target.p]: _drop, ...rest } = st.shown; set({ shown: rest }); setTarget({ kind: 'shown', p: target.p, ci: 0 }); }}>Clear</button>}
                <button className="sat-btn sat-btn--sm felt-btn-raised" onClick={closePicker}>Done</button>
              </span>
            </div>
            <CardPickerGrid disabled={(c) => !pickable(c)} onPick={pick} />
          </div>
        ) : replay && selCell && sel ? (
          <Keypad who={name(sel.p)} toCall={selCell.toCall} filled={!!selCell.act} typed={typed} setTyped={(v) => { setTyped(v); setRaiseErr(null); }} isRaise={selCell.high > 0}
            dark={darkOn} darkLabel={isPre ? 'Straddle' : 'Dark'} darkEnabled={isPre ? selCell.canStraddle && selCell.canRaise : true} canRaise={selCell.canRaise}
            onDark={toggleDark} minErr={raiseErr} minTo={minTo} allInAsk={allInAsk}
            onCall={() => act(sel.p, sel.r, mark({ k: 'call' }))} onFold={() => act(sel.p, sel.r, mark({ k: 'fold' }))}
            onAllIn={() => {
              if (!typed && roomFor(sel.p) === undefined) { setAllInAsk(true); return; }
              act(sel.p, sel.r, mark({ k: 'allin', to: typed ? Number(typed) : undefined }));
            }}
            onClear={() => act(sel.p, sel.r, null)} onOk={() => (allInAsk ? Number(typed) > 0 && act(sel.p, sel.r, mark({ k: 'allin', to: Number(typed) })) : commitBet(typed ? Number(typed) : minTo))} onMin={() => commitBet(minTo)} />
        ) : null}
        </DockPanel>
        {readOnly ? (
          <div className="felt-dock-actions">
            <button className="sat-btn sat-btn--lg" aria-disabled={!prevHand} onClick={() => prevHand && go(`game/${g.id}/hand/${prevHand.id}`, true)}>Previous hand</button>
            <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!nextReview} onClick={() => nextReview && go(`game/${g.id}/hand/${nextReview.id}`, true)}>Next hand</button>
          </div>
        ) : (
        <div className="felt-dock-actions">
          {st.tab === 'setup' && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab(st.ended ? 'showdown' : lastStreet)}>Next</button>}
          {street && (nextStreet && log.streets[nextStreet] ? (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab(nextStreet)}>{LABEL[nextStreet]}</button>
          ) : st.ended ? (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab('showdown')}>Showdown</button>
          ) : (
            <button className={`sat-btn sat-btn--lg ${replay?.next ? '' : 'sat-btn--primary'}`} onClick={() => nextFrom(street)}>{nextLabel(g, log, street, name, stacks)}</button>
          ))}
          {st.tab === 'showdown' && !target && (
            <>
              <WordButton word="Saved" ready={!res?.missing} className={`sat-btn sat-btn--lg ${existing ? 'sat-btn--primary' : ''}`} aria-disabled={!!res?.missing} run={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</WordButton>
              {!existing && <WordButton word="Saved" ready={!res?.missing} className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!!res?.missing} run={() => save(true)}>Save, next hand</WordButton>}
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- tap audit (dev only) ------------------------------- */

/** Dev only: `window.__tapCheck()` lists the pairs of visible buttons in the dock (keypad, card picker, actions) whose
    tap targets overlap or sit closer than 8 px, and every target under 44 px. The hit area of a tip button is its
    ::after box, so the check measures that. Pass a selector to audit other parts of the page. */
function tapCheck(root = '.felt-rec-dock') {
  type R = { l: number; t: number; r: number; b: number };
  const boxes = [...document.querySelectorAll<HTMLElement>(`${root} button, ${root} [role="button"], ${root} input`)].flatMap((el) => {
    const cs = getComputedStyle(el);
    const er = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || er.width === 0 || er.height === 0 || el.closest('[inert], [aria-hidden="true"]')) return [];
    let rect: R = { l: er.left, t: er.top, r: er.right, b: er.bottom };
    const after = getComputedStyle(el, '::after');
    if (after.content !== 'none' && after.position === 'absolute' && el.classList.contains('sat-tip-btn')) {
      let cb: HTMLElement | null = el.parentElement;
      while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
      const c = cb?.getBoundingClientRect();
      if (c) { const l = c.left + parseFloat(after.left), t = c.top + parseFloat(after.top); rect = { l, t, r: l + parseFloat(after.width), b: t + parseFloat(after.height) }; }
    }
    const label = (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 24);
    return [{ label, rect, w: Math.round(rect.r - rect.l), h: Math.round(rect.b - rect.t) }];
  });
  const gapOf = (a: R, b: R) => Math.max(b.l - a.r, a.l - b.r, b.t - a.b, a.t - b.b);
  const overlaps: string[] = [], close: string[] = [];
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
    const gap = gapOf(a.rect, b.rect);
    if (gap < 0) overlaps.push(`${a.label} x ${b.label}`);
    else if (gap < 8) close.push(`${a.label} | ${b.label}: ${Math.round(gap * 10) / 10} px`);
  }));
  const small = boxes.filter((x) => x.w < 44 || x.h < 44).map((x) => `${x.label}: ${x.w}x${x.h}`);
  // a long list (the 52 picker keys) is cut to its first entries; the counts stay whole
  const cut = (l: string[]) => (l.length > 10 ? [...l.slice(0, 10), `... ${l.length - 10} more`] : l);
  return { checked: boxes.length, overlaps: cut(overlaps), overlapCount: overlaps.length, closerThan8px: cut(close), closeCount: close.length, smallerThan44px: cut(small), smallCount: small.length };
}
if (import.meta.env.DEV) (window as unknown as { __tapCheck: typeof tapCheck }).__tapCheck = tapCheck;

function tabDone(log: HandLog, t: Tab, ended: boolean) {
  if (t === 'setup') return true;
  if (t === 'showdown') return ended;
  return !!log.streets[t]?.at;
}

/** The hand's private cards with one player's cards set (or removed when empty). */
function privateWith(cur: Record<ID, Card[]> | undefined, p: ID | null, cards: Card[]): Record<ID, Card[]> | undefined {
  const out = { ...(cur ?? {}) };
  if (p) { if (cards.length) out[p] = cards; else delete out[p]; }
  return Object.keys(out).length ? out : undefined;
}

function targetLabel(t: Exclude<Target, null>, name: (id: ID) => string) {
  if (t.kind === 'mine') return `Private cards, card ${t.ci + 1}`;
  if (t.kind === 'board') return BOARD_SLOT[t.i];
  if (t.kind === 'run') return `Run ${t.r + 1}, card ${t.i + 1}`;
  return `${name(t.p)} shows, card ${t.ci + 1}`;
}

/** Label for closing the street on screen (empty boxes take their defaults). When that ends the hand,
    it names the outcome ("Eve wins 9"), so a stray tap is easy to catch. */
function nextLabel(g: Game, log: HandLog, s: StreetName, name: (id: ID) => string, stacks?: Record<ID, number>) {
  const l = closeStreet(g, log, s, 1, stacks);
  const left = inAtEnd(l, s);
  if (left.length === 1) return `${name(left[0])} wins ${units(potTotal(g, l, l.button))}`;
  if (left.length < 1) return 'Result';
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

/** A card that lands on the board is dealt in from the left with a small turn. Cards that land together come 70 ms apart. */
function useDeal(cards: (Card | null)[]) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef(cards);
  useLayoutEffect(() => {
    const kids = ref.current?.children;
    let nth = 0;
    if (kids && !calm()) cards.forEach((c, i) => {
      const el = kids[i];
      if (!c || was.current[i] === c || !el) return;
      const x = -110 - 50 * Math.min(i, 2);
      spring(el, (p) => ({ translate: `${x * (1 - p)}px ${-40 * (1 - p)}px`, rotate: `${-10 * (1 - p)}deg`, opacity: String(Math.min(1, p * 3)) }), SPRING.deal, { delay: 70 * nth++ });
    });
    was.current = cards;
  });
  return ref;
}

function RunCards({ cards, isTarget, onTap }: { cards: (Card | null)[]; isTarget: (i: number) => boolean; onTap: (i: number, filled: boolean) => void }) {
  const ref = useDeal(cards);
  return <div ref={ref} className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>{cards.map((c, i) => <PlayingCard key={i} card={c} target={isTarget(i)} onClick={() => onTap(i, !!c)} />)}</div>;
}

function BoardRow({ board, to, lockedBefore, compact, isTarget, onTap }: {
  board: (Card | null)[]; to: number; lockedBefore: number; compact?: boolean; isTarget: (i: number) => boolean; onTap: (i: number, filled: boolean) => void;
}) {
  const ref = useDeal(board.slice(0, to));
  return (
    <div ref={ref} className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>
      {Array.from({ length: to }, (_, i) => {
        const c = board[i];
        if (i < lockedBefore) return <PlayingCard key={i} card={c} size="sm" />;
        return <PlayingCard key={i} card={c} size={compact ? undefined : 'lg'} target={isTarget(i)} placeholder={compact ? '' : i < 3 ? 'FLOP' : i === 3 ? 'TURN' : 'RIVER'} onClick={() => onTap(i, !!c)} />;
      })}
    </div>
  );
}

/** Rows from the small blind down to the button; columns are passes around the table, newest on the right.
    Grey boxes have nothing to decide. Players out of the hand stay as greyed rows. Amounts are street
    totals, so only a player's latest box stands; earlier boxes fade. C = call or check, F = fold. */
function ActionTable({ g, log, street, replay, sel, stacks, name, onPick, shown, namingFor, onName }: {
  g: Game; log: HandLog; street: StreetName; replay: Replay; sel: Sel; stacks?: Record<ID, number>;
  name: (id: ID) => string; onPick: (p: ID, r: number) => void; shown: Record<ID, (Card | null)[]>; namingFor: ID | null; onName: (p: ID) => void;
}) {
  // a closed game is not being logged: a name opens the player card
  const review = g.status === 'closed';
  // a name opens the card picker only on a press and hold: a stray tap must not take cards out of play
  const hold = useRef<number | undefined>(undefined);
  const release = () => window.clearTimeout(hold.current);
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLElement>(null);
  /** The slide bar: it shows only when some columns are out of view, and its thumb marks the part in view. */
  const placeBar = () => {
    const el = scroller.current;
    if (!el || !bar.current || !thumb.current) return;
    bar.current.style.visibility = el.scrollWidth > el.clientWidth + 1 ? '' : 'hidden';
    thumb.current.style.width = `${(el.clientWidth / el.scrollWidth) * 100}%`;
    thumb.current.style.left = `${(el.scrollLeft / el.scrollWidth) * 100}%`;
  };
  const dragBar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || (e.type === 'pointermove' && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    el.scrollLeft = ((e.clientX - r.left) / r.width) * el.scrollWidth - el.clientWidth / 2;
  };
  const bl = blinds(g, log.dealt, log.button);
  const [sbSeat] = Object.keys(bl);
  const rows = rowOrder(g, log);
  const startIn = inAtStart(log, street);
  const spentBefore = (p: ID) => STREETS.slice(0, STREETS.indexOf(street)).reduce((a, x) => a + (log.streets[x]?.bets[p] ?? 0), 0);
  const tag = (p: ID) => (p === log.button && bl[p] !== undefined ? 'BTN, SB' : p === log.button ? 'BTN' : bl[p] !== undefined ? (p === sbSeat ? 'SB' : 'BB') : '');
  const s = replay.street;
  // a box that takes a real action pops. Opening a street pops nothing.
  const table = useRef<HTMLDivElement>(null);
  const marks = useRef<{ street: string; box: Record<string, string> }>({ street: '', box: {} });
  useLayoutEffect(() => {
    const boxes = table.current?.querySelectorAll<HTMLElement>('button.felt-box');
    if (!boxes) return;
    const next: Record<string, string> = {};
    const same = marks.current.street === street;
    boxes.forEach((b) => {
      const id = b.getAttribute('aria-label')?.split(':')[0] ?? '';
      const v = b.classList.contains('is-empty') || b.classList.contains('is-default') ? '' : b.getAttribute('aria-label') ?? '';
      next[id] = v;
      if (same && v && marks.current.box[id] !== v && !calm()) spring(b, (p) => ({ scale: String(0.88 + 0.12 * p) }), SPRING.fill);
    });
    marks.current = { street, box: next };
  });
  // keep the newest column in view
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
    placeBar();
  }, [replay.cols, street]);
  // a selected box further left comes into view
  useLayoutEffect(() => {
    const el = scroller.current;
    const b = el?.querySelector<HTMLElement>('.felt-box.is-sel');
    if (!el || !b) return;
    const box = b.getBoundingClientRect(), view = el.getBoundingClientRect();
    if (box.left < view.left) el.scrollLeft -= view.left - box.left;
    else if (box.right > view.right) el.scrollLeft += box.right - view.right;
  }, [sel?.p, sel?.r]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !scroller.current) return;
    const ro = new ResizeObserver(placeBar);
    ro.observe(scroller.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={table} className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="felt-acts-wrap">
        {/* the titles stay still; the column numbers scroll with their boxes and cut off at the names */}
        <div className="felt-acts-titles">
          <Caption tip="handPlayers">Players</Caption>
          <Caption tip="betEntry">Action</Caption>
        </div>
        <div className="felt-acts-grid">
          <div className="felt-acts-names">
            <span className="felt-acts-names-head" />
            {rows.map((p) => {
              const gone = !startIn.includes(p);
              const canAct = replay.order.includes(p);
              const folded = gone || s.folded.includes(p);
              const left = stacks?.[p] !== undefined ? round2(stacks[p] - spentBefore(p) - (s.bets[p] ?? 0)) : undefined;
              const cards = (shown[p] ?? []).filter(Boolean) as Card[];
              const sub = [tag(p), gone ? 'Folded' : !canAct && log.allInAt?.[p] ? 'All-in' : left !== undefined && !folded ? `${units(Math.max(0, left))}` : '', street === 'preflop' && replay.straddles.includes(p) ? 'Straddle' : '', cards.map(cardText).join(' ')].filter(Boolean).join(', ');
              return (
                /* press and hold a name to enter the cards that player shows, on any street, before they are mucked */
                <button key={p} type="button" className={`felt-acts-name ${folded ? 'is-folded' : ''} ${namingFor === p ? 'is-target' : ''}`} aria-label={`${name(p)}: press and hold to enter the cards they show`}
                  onPointerDown={() => { release(); hold.current = window.setTimeout(() => { haptic(); onName(p); }, 450); }}
                  onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}
                  onClick={(e) => { if (review) openPlayer(p); else if (e.detail === 0) onName(p); }}>
                  <span className="felt-ellipsis">{name(p)}</span>
                  {sub && <span className="felt-acts-sub felt-ellipsis">{sub}</span>}
                </button>
              );
            })}
          </div>
        <div ref={scroller} className="felt-acts" style={{ ['--cols' as string]: replay.cols }} onScroll={placeBar}>
          <div className="felt-acts-row felt-acts-head">
            <span />
            {Array.from({ length: replay.cols }, (_, r) => <span key={r} className="felt-acts-col">{r + 1}</span>)}
          </div>
          {rows.map((p) => {
            const canAct = replay.order.includes(p);
            const folded = !startIn.includes(p) || s.folded.includes(p);
            return (
              <div key={p} className={`felt-acts-row ${folded ? 'is-folded' : ''}`}>
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
        <div ref={bar} className="felt-acts-bar" aria-hidden="true" style={{ visibility: 'hidden' }} onPointerDown={dragBar} onPointerMove={dragBar}><i ref={thumb} /></div>
      </div>
    </div>
  );
}

/** Choices for the selected box: Call (Check when nothing is owed), Fold, All-in, or an amount (the street
    total they bet or raised to). The boxes show these as C, F and the number. The amount has its own field
    with a backspace key inside it. Straddle (preflop, first to act only) or Dark (after the flop) marks a
    blind action. Raising is greyed out when nobody else is left to answer it. A raise under the house
    minimum shows the minimum, with the call and the minimum raise as one-tap fixes. */
function Keypad({ who, toCall, filled, typed, setTyped, isRaise, dark, darkLabel, darkEnabled, canRaise: canRaiseIn, onDark, minErr, minTo, allInAsk, onCall, onFold, onAllIn, onClear, onOk, onMin }: {
  who: string; toCall: number; filled: boolean; typed: string; setTyped: (v: string) => void; isRaise: boolean;
  dark: boolean; darkLabel: string; darkEnabled: boolean; canRaise: boolean; onDark: () => void; minErr: number | null; minTo: number; allInAsk: boolean;
  onCall: () => void; onFold: () => void; onAllIn: () => void; onClear: () => void; onOk: () => void; onMin: () => void;
}) {
  const press = (k: string) => setTyped((typed + k).replace(/^0+(?=\d)/, '').slice(0, 6));
  // a tap on the amount box brings no keyboard: the number pad lights up, an orange trail runs round it, so the eye goes there
  const [nudge, setNudge] = useState(0);
  const nudged = useRef<number>();
  const pointAtPad = () => { window.clearTimeout(nudged.current); setNudge((n) => n + 1); nudged.current = window.setTimeout(() => setNudge(0), 1100); };
  useEffect(() => () => window.clearTimeout(nudged.current), []);
  // asking for an all-in amount: the digits stay on even when nobody is left to raise
  const canRaise = canRaiseIn || allInAsk;
  const verb = allInAsk ? 'All-in' : isRaise ? 'Raise' : 'Bet';
  const callLabel = toCall ? 'Call' : 'Check';
  return (
    <div className="felt-keypad" role="group" aria-label={`Action for ${who}`}>
      {filled && <div className="felt-keypad-head"><button type="button" className="felt-keypad-clear" onClick={onClear}>Clear</button></div>}
      <div className="felt-keypad-quick">
        <button type="button" className={!typed && !filled ? 'is-default' : undefined} onClick={onCall}>{callLabel}</button>
        <button type="button" onClick={onFold}>Fold</button>
        <button type="button" onClick={onAllIn} disabled={!canRaise && !toCall}>All-in</button>
      </div>
      {/* amount first: it stays in view with its error under it, so the number being fixed never disappears.
          Each tip sits in its own 44 px lane beside the element it explains, so no tip target covers a key. */}
      <div className={`felt-keypad-amount ${canRaise ? '' : 'is-off'}`}>
        <div className="felt-keypad-line felt-tipped">
          <div className={`felt-keypad-field ${typed ? 'has-value' : ''} ${minErr !== null ? 'is-invalid' : ''}`} aria-live="polite" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) pointAtPad(); }}>
            <span className="felt-keypad-val sat-num">{!canRaise ? <span className="felt-keypad-min">Nobody left to raise</span> : typed || (allInAsk ? <span className="felt-keypad-min">Type the all-in amount</span> : <span className="felt-keypad-ghost">{units(minTo)}</span>)}</span>
            <button type="button" className="felt-keypad-bs" aria-label="Delete last digit" disabled={!typed || !canRaise} onClick={() => setTyped(typed.slice(0, -1))}><Icon name="backspace" size={22} stroke={1.8} /></button>
          </div>
          <span className="felt-keypad-tip"><Help k="raiseBox" /></span>
        </div>
        <div className="felt-keypad-line felt-keypad-line--act felt-tipped">
          <button type="button" className="felt-keypad-dark" aria-pressed={dark} disabled={!darkEnabled} onClick={onDark}><Icon name="dark" size={16} stroke={2} /> {darkLabel}</button>
          <span className="felt-keypad-tip"><Help k={darkLabel === 'Straddle' ? 'straddle' : 'dark'} /></span>
          <button type="button" className={`felt-keypad-ok ${typed ? 'is-ready' : ''}`} aria-disabled={!canRaise || (allInAsk && !typed)} disabled={!canRaise} onClick={onOk}>{verb}</button>
        </div>
      </div>
      {minErr !== null && (
        <div className="felt-keypad-err is-in" role="alert">
          <span>{verb} minimum = {units(minErr)}</span>
          <span className="felt-keypad-err-acts">
            <button type="button" onClick={onCall}>{toCall ? `Call ${units(toCall)}` : 'Check'}</button>
            <button type="button" className="is-primary" onClick={onMin}>{verb} to {units(minErr)}</button>
          </span>
        </div>
      )}
      <div className="felt-keypad-digits" data-nudge={nudge || undefined} key={nudge ? `n${nudge}` : 'pad'}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k) => <button key={k} type="button" disabled={!canRaise} onClick={() => press(k)}>{k}</button>)}
        {nudge > 0 && <svg className="felt-trail" aria-hidden="true"><rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="10" pathLength="1" /></svg>}
      </div>
    </div>
  );
}

/* ------------------------------- showdown ------------------------------- */

/** Showdown, in three visually different parts: run-out (if all-in), cards shown (a list of hands),
    and the result (one accent card saying who wins what). Partly recorded hands add the final pot. */
function Showdown({ g, st, log, live, res, partial, extra, recordedPot, exclude, name, boardForResolve, commonCards, isTarget, tapSlot, setRuns, set, setTarget, bountyOn, payTag, children }: {
  g: Game; st: RState; log: HandLog; live: ID[]; res: ReturnType<typeof resolve> | null; partial: boolean; extra: number; recordedPot: number; exclude: boolean;
  name: (id: ID) => string; boardForResolve: () => Card[]; commonCards: (n: number) => Card[];
  isTarget: (t: Exclude<Target, null>) => boolean; tapSlot: (t: Exclude<Target, null>, filled: boolean) => void; setRuns: (n: number) => void;
  set: (p: Partial<RState>) => void; setTarget: (t: Target) => void; bountyOn: boolean; payTag: (p: ID) => ReactNode; children?: ReactNode;
}) {
  const order = showdownOrder(g, log, live);
  const b = boardForResolve();
  const winnersOf = new Set(res?.winners.map((w) => w.playerId) ?? []);
  return (
    <>
      {log.runFrom !== undefined && live.length > 1 && (
        <section className="sat-glass sat-card sat-stack" style={gap(3)}>
          <div className="sat-split"><h2 className="sat-h3">No more action: run it</h2><Help k="runs" /></div>
          <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Times to run the board">
            <TabPill />
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
                  <RunCards cards={Array.from({ length: 5 - (log.runFrom ?? 0) }, (_, i) => st.runSlots[r]?.[i] ?? null)} isTarget={(i) => isTarget({ kind: 'run', r, i })} onTap={(i, f) => tapSlot({ kind: 'run', r, i }, f)} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Not shown (the old Muck) is one rule for every screen: a Not shown player is out of the card comparison, but can still
          win when every other player is Not shown too (a takedown). `takedownWinner` in hand.ts picks that winner and
          `resolve` puts it in `res.winners`, so the Result card below names it. */}
      {/* with the 2-7 bounty on, a player who wins uncontested can still show their cards */}
      {(live.length > 1 || (bountyOn && live.length === 1)) && (
        <section className="felt-section">
          {/* one bar: open it says Cards shown, closed it says No cards */}
          <div className="felt-showbar">
            <button type="button" className="felt-showbar-btn sat-glass" aria-expanded={!st.skipReveal} onClick={() => { set({ skipReveal: !st.skipReveal }); setTarget(null); }}>
              <span className="sat-caption">{st.skipReveal ? 'No cards' : 'Cards shown'}</span>
              <span className="felt-showbar-chev"><Icon name="chevron" size={18} /></span>
            </button>
            <Help k="shown" />
          </div>
          {!st.skipReveal && b.length > 0 && <div className="felt-board-mini"><span className="sat-caption">Board</span>{b.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>}
          {!st.skipReveal && (
            <div className="felt-showlist">
              {order.map((p, i) => {
                const cards = st.shown[p] ?? [null, null];
                const mucked = log.mucked.includes(p);
                const v = cards.every(Boolean) && b.length === 5 ? bestHand([...(cards as Card[]), ...b]) : null;
                // felt never blocks a hand, so it flags a card entered twice
                const twice = !mucked && cards.some((c) => c && (b.includes(c) || order.some((q) => q !== p && (st.shown[q] ?? []).includes(c))));
                return (
                  <div key={p} className={`felt-show ${winnersOf.has(p) && !res?.missing ? 'is-winner' : ''} ${mucked ? 'is-mucked' : ''}`}>
                    <span className="felt-show-n sat-num">{i + 1}</span>
                    <div className="felt-row-main">
                      <div className="felt-row-title">{g.status === 'closed' ? <PlayerName id={p} /> : name(p)}{log.allInAt?.[p] ? <span className="sat-badge sat-badge--muted" style={{ marginLeft: 6 }}>All-in</span> : null}</div>
                      <div className="felt-row-sub">{mucked ? NOT_SHOWN : v ? v.name : cards.every(Boolean) ? 'Shown' : 'No cards entered'}</div>
                      {twice && <div className="sat-small" style={{ color: 'var(--sat-neg)' }}>Same card entered twice</div>}
                      {!mucked && payTag(p)}
                    </div>
                    {!mucked && cards.map((c, ci) => <PlayingCard key={ci} card={c} target={isTarget({ kind: 'shown', p, ci })} onClick={() => tapSlot({ kind: 'shown', p, ci }, !!c)} />)}
                    {live.length > 1 && <button className="sat-chip felt-mini" aria-pressed={mucked} onClick={() => set({ log: { ...log, mucked: mucked ? log.mucked.filter((x) => x !== p) : [...log.mucked, p] } })}>{NOT_SHOWN}</button>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {partial && (
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

      {res && <Result res={res} log={log} live={live} runs={log.runs ?? 1} name={name} manual={st.manual} onManual={(i, ids) => set({ manual: { ...st.manual, [i]: ids } })} />}
      {children}

      <div className="sat-field">
        <label htmlFor="note">Note</label>
        <textarea id="note" className="sat-input" placeholder="Optional" value={st.note} onChange={(e) => set({ note: e.target.value })} />
      </div>
    </>
  );
}

/** Who wins: one accent card. Undecided pots ask "Who won?" with big name buttons. */
function Result({ res, log, live, runs, name, manual, onManual }: {
  res: ReturnType<typeof resolve>; log: HandLog; live: ID[]; runs: number; name: (id: ID) => string;
  manual: Record<number, ID[]>; onManual: (i: number, ids: ID[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const total = res.pots.reduce((a, p) => a + p.amount, 0);
  const names = (ids: ID[]) => ids.map(name).join(' and ');
  const winners = res.winners.map((w) => w.playerId);
  const headline = live.length === 1 ? `${name(live[0])} wins` : res.missing ? 'Who won?' : winners.length === 1 ? `${name(winners[0])} wins` : `${names(winners)} split`;
  return (
    <section className={`felt-result ${res.missing ? 'is-open' : ''}`} aria-live="polite">
      {live.length === 1 && <span className="sat-caption">Everyone else folded</span>}
      {live.length > 1 && !res.missing && isTakedown(log) && <span className="sat-caption">Everyone else was {NOT_SHOWN}</span>}
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
    </section>
  );
}

/** 2-7 bounty at the result: who collects, and who paid. Filled in when shown cards qualify under the
    house rule; otherwise tap the player who was paid. Every other player dealt in pays; tap a name to
    leave them out. */
function BountyBlock({ live, dealt, to, auto, amount, off, name, busted, payOf, onPick, onOff }: {
  live: ID[]; dealt: ID[]; to: ID | null; auto: boolean; amount: number; off: ID[]; name: (id: ID) => string;
  busted: ID[]; payOf: (p: ID) => number; onPick: (p: ID | null) => void; onOff: (p: ID) => void;
}) {
  const others = to ? dealt.filter((p) => p !== to) : [];
  const payers = others.filter((p) => !off.includes(p) && !busted.includes(p));
  const total = round2(payers.reduce((a, p) => a + payOf(p), 0));
  const short = payers.some((p) => payOf(p) < amount);
  return (
    <section className={`felt-section felt-bounty ${to ? 'is-paid' : ''}`} aria-live="polite">
      <div className="sat-split">
        <h2 className="sat-caption felt-section-cap">2-7 bounty <Help k="bounty27" /></h2>
        {to && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => onPick(null)}>Clear</button>}
      </div>
      {to ? (
        <>
          <p className="felt-bounty-head"><b>{name(to)}</b> collects <b className="sat-num">{units(total)}</b> chips{auto ? ' for the shown 2-7' : ''}.</p>
          <span className="sat-small sat-muted">{short ? `${payers.length} players pay ${units(amount)} chips each, or the chips they have left.` : `${payers.length} players pay ${units(amount)} chips each.`} Tap a name to leave that player out.</span>
          <div className="sat-cluster" style={gap(2)}>
            {others.map((p) => (busted.includes(p)
              ? <button key={p} className="sat-chip felt-mini" aria-pressed={false} disabled>{name(p)}, busted</button>
              : <button key={p} className="sat-chip felt-mini" aria-pressed={!off.includes(p)} onClick={() => onOff(p)}>{name(p)}{!off.includes(p) && payOf(p) < amount ? ` ${units(payOf(p))}` : ''}</button>))}
          </div>
        </>
      ) : (
        <>
          <div className="sat-cluster" style={gap(2)}>
            {live.map((p) => <button key={p} className="sat-chip felt-mini" onClick={() => onPick(p)}>{name(p)}</button>)}
          </div>
        </>
      )}
    </section>
  );
}
