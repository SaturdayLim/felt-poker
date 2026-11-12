/* Spectator: the table from above, for a TV, a tablet at the end of the table or a second window. It only reads.
   It follows the hand in play (the recorder's draft on this phone) and replays any finished hand of the game with one
   scrubber: one stop per action, grouped by street, and a result stop for a finished hand. Moving the cursor never
   changes the record: the table is rebuilt from the action log (src/lib/replay.ts).
   Public information only: board cards, and hole cards shown at the table, from the showdown step on. A private card
   (Hand.private, the recorder's own cards) is never read, so it is never in this page. Cards never shown stay face down.
   Motion: chips slide from the seat to the bet spot and from the bet spots to the pot, the button glides, board cards
   flip in, folded seats fade and figures roll. A jump of several steps moves once to the end state. Reduced motion fades. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGame, usePlayerName, useStore } from '../store';
import { back, go } from '../router';
import { CardBack, Empty, Header, Icon, NumericText, PlayingCard } from '../components/ui';
import { calm, motionOff } from '../lib/motion';
import { STREETS } from '../lib/hand';
import { exactStacks } from '../lib/stacks';
import { handSteps, resultAt, tableAt, type ReplayInput, type Step, type StepKind } from '../lib/replay';
import { WATCH, onStored } from '../lib/watch';
import type { Card, Game, Hand, HandLog, ID, StreetName } from '../types';

/** The hand in play, as the recorder keeps it on this phone. Only public fields are kept: the recorder's own cards are dropped on read. */
interface LiveHand { n: number; log: HandLog; board: (Card | null)[]; ended: boolean; shown: Record<ID, Card[]> }

const draftKey = (gameId: string) => `felt-draft-${gameId}`;
function readLive(g: Game | undefined): LiveHand | null {
  if (!g || g.status !== 'live') return null;
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(g.id)) ?? 'null') as { v?: number; st?: { n: number; log: HandLog; board: (Card | null)[]; ended: boolean; shown?: Record<ID, (Card | null)[]> } } | null;
    const st = d?.v === 1 ? d.st : null;
    const nNew = (g.hands[g.hands.length - 1]?.n ?? 0) + 1;
    if (!st || st.n !== nNew || !st.log) return null;
    // shown cards are public only once the hand is at the showdown; before that nothing is kept
    const shown: Record<ID, Card[]> = {};
    if (st.ended) for (const [p, cs] of Object.entries(st.shown ?? {})) { const c = (cs ?? []).filter(Boolean) as Card[]; if (c.length === 2) shown[p] = c; }
    return { n: st.n, log: st.log, board: st.board ?? [], ended: !!st.ended, shown };
  } catch { return null; }
}

/** Follow the draft: the storage event (another window), a store write (this window or another), and a slow poll as a floor. */
function useLive(g: Game | undefined): LiveHand | null {
  const [live, setLive] = useState(() => readLive(g));
  const ref = useRef(g);
  ref.current = g;
  useEffect(() => {
    const read = () => setLive((was) => { const now = readLive(ref.current); return JSON.stringify(now) === JSON.stringify(was) ? was : now; });
    read();
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === draftKey(ref.current?.id ?? '')) read(); };
    window.addEventListener('storage', onStorage);
    const t = window.setInterval(read, 1000);
    return () => { window.removeEventListener('storage', onStorage); window.clearInterval(t); };
  }, [g?.id, g?.hands.length, g?.status]);
  return live;
}

const STREET_LABEL: Record<StreetName, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };
const VERB: Record<StepKind, string> = { sb: 'posts SB', bb: 'posts BB', fold: 'folds', check: 'checks', call: 'calls', bet: 'bets', raise: 'raises to', allin: 'is all-in for', straddle: 'straddles' };
const fig = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US');
function stepText(s: Step, name: (id: ID) => string): string {
  const who = name(s.pid);
  if (s.k === 'fold' || s.k === 'check') return `${who} ${VERB[s.k]}.`;
  if (s.k === 'call') return `${who} calls ${fig(s.to)}${s.allin ? ', all-in' : ''}.`;
  if (s.k === 'bet') return `${who} bets ${fig(s.to)}${s.allin ? ', all-in' : ''}.`;
  if (s.k === 'raise') return `${who} raises to ${fig(s.to)}${s.allin ? ', all-in' : ''}.`;
  return `${who} ${VERB[s.k]} ${fig(s.to)}.`;
}

/** A point on the oval, in percent of the table box. Seat 1 sits at the bottom centre; the rest follow clockwise seen from above. */
function oval(i: number, n: number, rx: number, ry: number) {
  const a = Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

export default function Spectator({ gameId, alone = false }: { gameId: string; alone?: boolean }) {
  const g = useGame(gameId);
  // the spectator window reads the saved data again whenever another window saves it
  useEffect(() => (WATCH ? onStored(() => { void useStore.persist.rehydrate(); }) : undefined), []);
  if (!g) return <div className="felt-page"><Header back={alone ? undefined : () => go('')} title="Table" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  return <SpectatorBody g={g} alone={alone} />;
}

type Pick = { k: 'live' } | { k: 'hand'; id: ID };

function SpectatorBody({ g, alone }: { g: Game; alone: boolean }) {
  const name = usePlayerName();
  const live = useLive(g);
  const done = g.hands.filter((h) => h.log && !h.missed);
  const [pick, setPick] = useState<Pick>(() => (live || g.status === 'live' || !done.length ? { k: 'live' } : { k: 'hand', id: done[done.length - 1].id }));
  // live mode with no hand in play shows the last finished hand at its result, until the next hand starts
  const hand: Hand | null = pick.k === 'hand' ? done.find((h) => h.id === pick.id) ?? null : live ? null : done[done.length - 1] ?? null;
  const isLive = pick.k === 'live' && !!live;

  const inp: ReplayInput | null = useMemo(() => {
    if (isLive && live) {
      const start = exactStacks(g, live.n);
      return { g, log: live.log, steps: handSteps(g, live.log, start), start, board: live.board, live: true };
    }
    if (!hand?.log) return null;
    const start = exactStacks(g, hand.n);
    return { g, log: hand.log, steps: handSteps(g, hand.log, start), start, board: hand.board ?? [] };
  }, [g, isLive, live, hand]);

  const last = inp ? inp.steps.length + (isLive ? 0 : 1) : 0;
  const handKey = isLive ? `live-${live?.n}` : hand?.id ?? 'none';
  const [cursor, setCursor] = useState<{ key: string; k: number | null }>({ key: handKey, k: null });
  // a new hand opens at its end (live) or at its first action (picked); k null follows the end
  const followEnd = cursor.key !== handKey || cursor.k === null;
  const k = followEnd ? (pick.k === 'hand' ? 0 : last) : Math.min(cursor.k!, last);
  useEffect(() => { if (cursor.key !== handKey) setCursor({ key: handKey, k: pick.k === 'hand' ? 0 : null }); }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveTo = (to: number) => { const v = Math.max(0, Math.min(last, to)); setCursor({ key: handKey, k: pick.k === 'live' && v === last ? null : v }); };
  const behind = isLive && !followEnd ? last - k : 0;

  const n = isLive ? live!.n : hand?.n;
  const title = alone ? g.name : undefined;
  const label = (h: Hand) => { const w = [...new Set(h.winners.map((x) => name(x.playerId)))]; return w.length ? `Hand ${h.n} (${w.join(' and ')})` : `Hand ${h.n}`; };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveTo(k - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveTo(k + 1); }
  };

  return (
    <div className={`felt-page spx ${alone ? 'spx--alone' : ''}`} onKeyDown={onKey}>
      {alone
        ? <div className="spx-top"><b className="sat-h2 felt-ellipsis">{title}</b></div>
        : <Header back={() => back(`game/${g.id}`)} banner={g.name}
            tabs={[{ label: 'Players', on: false, go: () => go(`game/${g.id}`, true) }, { label: 'Hands', on: false, go: () => go(`game/${g.id}/hands`, true) }, { label: 'Table', on: true, go: () => undefined }]}
            right={<button className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Open the table in a new window" onClick={() => window.open(`${location.pathname}#/watch/${g.id}`, `nightcap-watch-${g.id}`)}><Icon name="link" /></button>} />}

      <div className="spx-bar">
        <label className="spx-pick">
          <span className="sat-small sat-muted">Hand</span>
          <select className="sat-input" value={pick.k === 'live' ? 'live' : pick.id} onChange={(e) => setPick(e.target.value === 'live' ? { k: 'live' } : { k: 'hand', id: e.target.value })}>
            {g.status === 'live' && <option value="live">{live ? `Hand ${live.n} (live)` : 'Live'}</option>}
            {[...done].reverse().map((h) => <option key={h.id} value={h.id}>{label(h)}</option>)}
          </select>
        </label>
        {pick.k === 'hand' && g.status === 'live' && <button className="sat-btn sat-btn--sm" onClick={() => setPick({ k: 'live' })}>Live</button>}
      </div>

      {inp ? (
        <>
          <Table inp={inp} k={k} hand={isLive ? null : hand} live={isLive ? live : null} name={name} n={n} />
          <Scrubber inp={inp} k={k} result={!isLive} moveTo={moveTo} behind={behind} live={isLive} name={name} />
        </>
      ) : <Empty title="No hand to show">The table shows a hand once it has an action.</Empty>}
    </div>
  );
}

/* ------------------------------- table ------------------------------- */

function Table({ inp, k, hand, live, name, n }: { inp: ReplayInput; k: number; hand: Hand | null; live: LiveHand | null; name: (id: ID) => string; n?: number }) {
  const { g, log, steps } = inp;
  const atResult = !!hand && k > steps.length;
  const t = tableAt(inp, Math.min(k, steps.length));
  const res = atResult ? resultAt(inp, hand!) : null;
  const seats = [...log.dealt].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const count = seats.length;
  const atShowdown = atResult || (!!live?.ended && k >= steps.length);
  const shown: Record<ID, Card[]> = {};
  if (atShowdown) {
    if (res) for (const s of res.shown) shown[s.pid] = s.cards;
    else if (live) Object.assign(shown, live.shown);
  }
  const boardCount = atShowdown ? inp.board.filter(Boolean).length : t.boardCount;
  const board = inp.board.slice(0, 5);
  const stacks = res ? res.stacks : t.stacks;
  const pot = res ? 0 : t.pot;
  const bets = res ? {} : t.bets;
  const folded = new Set(t.folded);
  const allin = new Set(t.allin);
  const winners = new Set(res ? Object.keys(res.won).filter((p) => (res.won[p] ?? 0) > 0 && hand!.winners.some((w) => w.playerId === p)) : []);
  const btnAt = Math.max(0, seats.indexOf(log.button ?? ''));
  // the button sits beside its seat, a little round the oval, clear of the bet spot
  const btn = oval(btnAt + 0.3, count, 33, 30);
  const caption = res
    ? hand!.winners.map((w) => `${name(w.playerId)} wins ${fig(w.amount)}`).join('. ') + '.'
    : t.last ? stepText(t.last, name) : live ? 'Waiting for the first action.' : '';

  return (
    <section className="spx-table" aria-label={`Hand ${n ?? ''} from above`}>
      <div className="spx-felt" aria-hidden="true" />
      <div className="spx-mid">
        <div className="spx-board" aria-label="Board">
          {[0, 1, 2, 3, 4].map((i) => <BoardSlot key={i} card={i < boardCount ? board[i] ?? null : null} />)}
        </div>
        <div className="spx-pot" aria-live="polite">
          {res ? (
            res.pots.length > 1
              ? res.pots.map((p, i) => <span key={i} className="spx-potchip">{i ? `Side ${i}` : 'Main'} <b><NumericText value={fig(p.amount)} /></b></span>)
              : <span className="spx-potchip">Pot <b><NumericText value={fig(res.pots[0]?.amount ?? 0)} /></b></span>
          ) : t.pots.length > 1
            ? t.pots.map((p, i) => <span key={i} className="spx-potchip">{i ? `Side ${i}` : 'Main'} <b><NumericText value={fig(p.amount)} /></b></span>)
            : <span className="spx-potchip">Pot <b><NumericText value={fig(pot)} /></b></span>}
        </div>
        <p className="spx-caption" aria-live="polite">{caption}</p>
      </div>

      {seats.map((p, i) => {
        const s = oval(i, count, 41, 38), spot = oval(i, count, 26, 22);
        const out = folded.has(p);
        const cards = shown[p];
        const stack = stacks[p];
        return (
          <div key={p}>
            <div className={`spx-seat ${out ? 'is-folded' : ''} ${allin.has(p) && !out ? 'is-allin' : ''} ${t.toAct === p && !atShowdown ? 'is-turn' : ''} ${winners.has(p) ? 'is-win' : ''}`}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              aria-label={`${name(p)}${stack !== undefined ? `, ${fig(stack)} chips` : ''}${out ? ', folded' : ''}${allin.has(p) && !out ? ', all-in' : ''}${t.toAct === p && !atShowdown ? ', to act' : ''}`}>
              <span className={`spx-hole ${cards ? 'is-up' : ''}`} aria-hidden={!cards}>
                <HoleCard card={cards?.[0]} /><HoleCard card={cards?.[1]} />
              </span>
              <b className="spx-name felt-ellipsis">{name(p)}</b>
              <span className="spx-stack sat-num">{stack === undefined ? '' : <NumericText value={fig(stack)} />}</span>
              {allin.has(p) && !out && !res && <span className="spx-tag">All-in</span>}
              {res && (res.won[p] ?? 0) > 0 && <span className="spx-won sat-num">+{fig(res.won[p])}</span>}
            </div>
            <BetSpot amount={bets[p] ?? 0} from={s} at={spot} />
          </div>
        );
      })}
      <span className="spx-btn" style={{ left: `${btn.x}%`, top: `${btn.y}%` }} aria-label={`Button: ${name(log.button ?? '')}`}>D</span>
    </section>
  );
}

/** A board slot: an etched space until its card is logged and its street is reached, then the card flips in. */
function BoardSlot({ card }: { card: Card | null }) {
  const el = useRef<HTMLSpanElement>(null);
  const had = useRef(card);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e || had.current === card) return;
    had.current = card;
    if (!card || motionOff()) return;
    if (calm()) e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear' });
    else e.animate([{ transform: 'perspective(400px) rotateY(90deg)', opacity: 0.4 }, { transform: 'perspective(400px) rotateY(0deg)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [card]);
  return <span ref={el} className="spx-slot">{card ? <PlayingCard card={card} size="lg" /> : <span className="felt-card lg empty" aria-hidden="true" />}</span>;
}

/** A hole card: face down, or face up once shown at the table. Only a shown card ever reaches this component. */
function HoleCard({ card }: { card?: Card }) {
  const el = useRef<HTMLSpanElement>(null);
  const had = useRef(card);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e || had.current === card) return;
    had.current = card;
    if (motionOff()) return;
    if (calm()) e.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 150 });
    else e.animate([{ transform: 'perspective(300px) rotateY(90deg)' }, { transform: 'perspective(300px) rotateY(0deg)' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [card]);
  return <span ref={el} className="spx-holecard">{card ? <PlayingCard card={card} size="sm" /> : <CardBack size="sm" />}</span>;
}

/** The chips in front of a seat. New chips slide out from the seat; chips swept into the pot slide to the middle and fade.
    The figure keeps its last amount while it slides away. Reduced motion fades instead. */
function BetSpot({ amount, from, at }: { amount: number; from: { x: number; y: number }; at: { x: number; y: number } }) {
  const el = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(amount);
  const prev = useRef(amount);
  useLayoutEffect(() => {
    const e = el.current, was = prev.current;
    prev.current = amount;
    if (amount > 0) setShown(amount);
    if (!e || was === amount) return;
    const box = e.offsetParent as HTMLElement | null;
    const w = box?.clientWidth ?? 0, h = box?.clientHeight ?? 0;
    if (motionOff()) { if (amount <= 0) setShown(0); return; }
    e.getAnimations().forEach((a) => a.cancel());
    if (amount > 0 && was <= 0) {
      // out from the seat
      const dx = ((from.x - at.x) / 100) * w, dy = ((from.y - at.y) / 100) * h;
      e.animate(calm() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }],
        { duration: calm() ? 150 : 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    } else if (amount <= 0 && was > 0) {
      // into the pot in the middle
      const dx = ((50 - at.x) / 100) * w, dy = ((50 - at.y) / 100) * h;
      const a = e.animate(calm() ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0 }],
        { duration: calm() ? 150 : 420, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
      a.onfinish = () => { a.cancel(); if (prev.current <= 0) setShown(0); };
    }
  }, [amount]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={el} className="spx-bet sat-num" data-on={shown > 0} style={{ left: `${at.x}%`, top: `${at.y}%` }} aria-hidden={shown <= 0}>
      <span className="spx-chipdot" aria-hidden="true" /><NumericText value={fig(shown)} />
    </span>
  );
}

/* ------------------------------- scrubber ------------------------------- */

function Scrubber({ inp, k, result, moveTo, behind, live, name }: { inp: ReplayInput; k: number; result: boolean; moveTo: (k: number) => void; behind: number; live: boolean; name: (id: ID) => string }) {
  const { steps } = inp;
  const groups = STREETS.map((st) => ({ st, idx: steps.map((s, i) => (s.street === st ? i : -1)).filter((i) => i >= 0) })).filter((x) => x.idx.length);
  const last = steps.length + (result ? 1 : 0);
  // street start: the first action of the street the cursor is on (or the one before, when already there)
  const streetStart = () => {
    const cur = steps[k - 1]?.street;
    const first = steps.findIndex((s) => s.street === cur);
    if (first < 0) return 0;
    if (k - 1 > first) return first + 1;
    const prevSt = STREETS[STREETS.indexOf(cur!) - 1];
    const pf = steps.findIndex((s) => s.street === prevSt);
    return pf < 0 ? 0 : pf + 1;
  };
  const track = useRef<HTMLDivElement>(null);
  // the current stop stays in view on a narrow screen
  useEffect(() => { track.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: calm() || motionOff() ? 'auto' : 'smooth' }); }, [k]);
  return (
    <div className="spx-scrub">
      <div ref={track} className="spx-track" role="group" aria-label="Actions">
        <button type="button" className="spx-stop spx-stop--start" aria-current={k === 0 ? 'step' : undefined} aria-label="Before the first action" onClick={() => moveTo(0)} />
        {groups.map((gr) => (
          <div key={gr.st} className="spx-group">
            <span className="spx-glabel">{STREET_LABEL[gr.st]}</span>
            <div className="spx-stops">
              {gr.idx.map((i) => (
                <button key={i} type="button" className={`spx-stop ${i < k ? 'is-past' : ''}`} aria-current={k === i + 1 ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${stepText(steps[i], name)}`} onClick={() => moveTo(i + 1)} />
              ))}
            </div>
          </div>
        ))}
        {result && (
          <div className="spx-group">
            <span className="spx-glabel">Result</span>
            <div className="spx-stops"><button type="button" className="spx-stop spx-stop--result" aria-current={k === last ? 'step' : undefined} aria-label="Result" onClick={() => moveTo(last)} /></div>
          </div>
        )}
      </div>
      <div className="spx-ctrl">
        <button type="button" className="sat-btn sat-iconbtn" aria-label="Back to the start of the street" disabled={k === 0} onClick={() => moveTo(streetStart())}><Icon name="undo" /></button>
        <button type="button" className="sat-btn sat-iconbtn" aria-label="Back one action" disabled={k === 0} onClick={() => moveTo(k - 1)}><Icon name="back" /></button>
        <span className="spx-count sat-num sat-small sat-muted">{k} of {last}</span>
        <button type="button" className="sat-btn sat-iconbtn spx-fwd" aria-label="Forward one action" disabled={k >= last} onClick={() => moveTo(k + 1)}><Icon name="back" /></button>
        <button type="button" className={`sat-btn spx-live ${live && !behind ? 'is-on' : ''}`} data-show={live} aria-label={behind ? `Live, ${behind} behind` : 'Live'} disabled={!live || !behind} onClick={() => moveTo(last)}>
          <span className="spx-livedot" aria-hidden="true" />Live{behind > 0 && <span className="spx-behind sat-num">{behind}</span>}
        </button>
      </div>
    </div>
  );
}
