/* The table from above, for the host's Table and the player view's Table. It only reads: it draws a hand (src/lib/felt.ts) at a step.
   TableFelt draws the pill table: each seat's photo on the rail, the name and stack under it, the last action under that, the
   stack along the rail, hole cards face down across the pass line, committed chips past the cards, the pots in one row under
   the board. The player to act is lit and the others dim; a folded player fades far back and the cards go to the muck.
   TablePage is the whole screen around it, always in landscape: Back, Live, the hand list, the timeline and one corner button.
   Public cards only: a hole card turns face up only when the hand carries it as shown at the table. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CardBack, PlayingCard } from './ui';
import { calm, motionOff } from '../lib/motion';
import { haptic } from '../lib/haptics';
import { FELT_HUES, chipCols, chipSvg, feltAt, feltFig, seatSpots, type FeltHand, type FeltSeg, type Pt } from '../lib/felt';
import type { Card } from '../types';

const BOARD = { x: 50, y: 42 }, POTS = { x: 50, y: 60 }, MUCK = { x: 27.5, y: 42 };
const FACE = <svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="38" r="17" /><path d="M14 96c2-22 16-32 34-32s32 10 34 32z" /></svg>;

/** Chips drawn from an amount. */
function Chips({ amount, bb, max, col }: { amount: number; bb: number; max?: number; col?: [number, number] }) {
  const pic = useMemo(() => chipSvg(col ? [col] : chipCols(amount, bb, max)), [amount, bb, max, col?.[0], col?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pic.html) return null;
  return <span className="tf-chips" style={{ width: `calc(var(--m) * ${(pic.wide * 3.3).toFixed(2)})` }} dangerouslySetInnerHTML={{ __html: pic.html }} />;
}

/** Committed chips in front of a seat. New chips slide out from the stack; chips swept in slide to the pots and fade.
    The figure keeps its last amount while it slides away. Reduced motion fades. */
function Bet({ amount, bb, from, at, pot, animate }: { amount: number; bb: number; from: Pt; at: Pt; pot: Pt; animate: boolean }) {
  const el = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(amount);
  const prev = useRef(amount);
  useLayoutEffect(() => {
    const e = el.current, was = prev.current;
    prev.current = amount;
    if (amount > 0) setShown(amount);
    if (!e || was === amount) return;
    e.getAnimations().forEach((a) => a.cancel());
    if (!animate || motionOff()) { if (amount <= 0) setShown(0); return; }
    const soft = calm();
    if (amount > 0 && was <= 0) {
      e.animate(soft ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translate(calc(-50% + ${from.x - at.x}px), calc(-50% + ${from.y - at.y}px)) scale(.6)`, opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }],
        { duration: soft ? 150 : 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    } else if (amount <= 0 && was > 0) {
      const a = e.animate(soft ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${pot.x - at.x}px), calc(-50% + ${pot.y - at.y}px)) scale(.7)`, opacity: 0 }],
        { duration: soft ? 150 : 420, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
      a.onfinish = () => { a.cancel(); if (prev.current <= 0) setShown(0); };
    }
  }, [amount]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={el} className="tf-at tf-bet" data-on={shown > 0} style={{ left: at.x, top: at.y }} aria-hidden={shown <= 0}>
      <Chips amount={shown} bb={bb} max={3} />
      <span className="tf-amt">{feltFig(shown)}</span>
    </span>
  );
}

/** A pot on its way to the winner: it leaves the middle, lands on the winner's stack and fades. It plays once, when the win
    step is reached one step at a time. */
function Fly({ amount, bb, from, to, wait, animate }: { amount: number; bb: number; from: Pt; to: Pt; wait: number; animate: boolean }) {
  const el = useRef<HTMLSpanElement>(null);
  const play = useRef(animate && !motionOff());
  useLayoutEffect(() => {
    const e = el.current;
    if (!e || !play.current) return;
    const dx = from.x - to.x, dy = from.y - to.y, home = 'translate(-50%, -50%)';
    e.animate(calm() ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 1 }, { transform: home, opacity: 1, offset: 0.8 }, { transform: home, opacity: 0 }],
      { duration: calm() ? 300 : 1050, delay: wait, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'backwards' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!play.current) return null;
  return <span ref={el} className="tf-at tf-fly" style={{ left: to.x, top: to.y }} aria-hidden="true"><Chips amount={amount} bb={bb} max={3} /><span className="tf-amt">{feltFig(amount)}</span></span>;
}

/** `me` is the viewer's own seat: a tap on that photo opens `me.panel` beside it (photo and colour). */
export interface FeltMe { id: string; panel: (close: () => void) => ReactNode }

export function TableFelt({ hand, k, animate, me }: { hand: FeltHand; k: number; animate: boolean; me?: FeltMe }) {
  const [mine, setMine] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, left: 0, top: 0 });
  // the table takes the height or the width left, whichever is less: photos reach above it, names and actions below it
  useLayoutEffect(() => {
    const e = area.current;
    if (!e) return;
    const fit = () => { const aw = e.clientWidth, ah = e.clientHeight, h = Math.max(100, Math.min(ah / 1.3, aw / 2.24)); setBox({ w: h * 2, h, left: (aw - h * 2) / 2, top: (ah - h * 1.3) / 2 + h * 0.085 }); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  const s = useMemo(() => feltAt(hand, k), [hand, k]);
  const n = hand.players.length;
  const spots = useMemo(() => seatSpots(box.w, box.h, n), [box.w, box.h, n]);
  const M = box.h / 100;
  const mid = (p: { x: number; y: number }): Pt => ({ x: (p.x / 100) * box.w, y: (p.y / 100) * box.h });
  const pots = mid(POTS), muck = mid(MUCK);
  const none = !hand.dealt.length;
  const hue = Object.fromEntries(hand.players.map((p) => [p.id, FELT_HUES[p.hue % FELT_HUES.length]]));
  const nameOf = Object.fromEntries(hand.players.map((p) => [p.id, p.name]));
  const btn = hand.players.findIndex((p) => p.id === hand.button);
  const lit = hand.players.findIndex((p) => p.id === s.toAct);

  return (
    <div ref={area} className="tf-area">
      {box.h > 0 && (
        <section className={`tf ${animate ? '' : 'tf-noanim'}`} style={{ width: box.w, height: box.h, left: box.left, top: box.top, ['--m' as string]: `${M}px` }} aria-label={hand.n ? `Hand ${hand.n} from above` : 'Table from above'}>
          <div className="tf-wood" /><div className="tf-pad" />
          <div className="tf-cloth">
            <svg className="tf-etch" viewBox="-2 -2 68 104" aria-hidden="true">
              {['lo', 'hi'].map((c) => (
                <g key={c} className={c}><circle cx="32" cy="26" r="18" /><circle cx="32" cy="26" r="12" /><circle cx="32" cy="74" r="18" /><circle cx="32" cy="74" r="12" /><path className="s" d="M53.38 36.90 A24 24 0 1 0 32 50 A24 24 0 1 1 10.62 63.10" /></g>
              ))}
            </svg>
          </div>
          <div className="tf-passline" />
          {/* the light on the player to act */}
          <span className="tf-at tf-light" data-on={lit >= 0} style={lit >= 0 ? { left: (spots[lit].seat.x + spots[lit].hole.x) / 2, top: (spots[lit].seat.y + spots[lit].hole.y) / 2 } : undefined} aria-hidden="true" />

          <div className="tf-at tf-board" style={{ left: mid(BOARD).x, top: mid(BOARD).y }} aria-label="Board">
            {[0, 1, 2, 3, 4].map((i) => {
              const c: Card | null = i < s.boardCount ? hand.board[i] ?? null : null;
              return <span key={`${i}${c ?? ''}`} className={c ? 'tf-flip' : ''}>{c ? <PlayingCard card={c} size="lg" /> : <span className="felt-card lg tf-slot" aria-hidden="true" />}</span>;
            })}
          </div>

          {/* the pot that still grows sits under the board; each side pot joins the row to its left */}
          <div className="tf-pots" style={{ top: pots.y }} aria-live="polite">
            {s.pots.map((p, i) => (
              <span key={i} className="tf-pot">
                <Chips amount={p.amount} bb={hand.bb} max={3} />
                <span className="tf-amt"><em>{i ? 'Side pot' : 'Pot'}</em>{feltFig(p.amount)}
                  {s.pots.length > 1 && p.who.map((id) => <i key={id} style={{ ['--hue' as string]: hue[id] }} aria-label={nameOf[id]}>{(nameOf[id] ?? '?')[0]}</i>)}
                </span>
              </span>
            ))}
          </div>
          {s.paid && hand.pays.map((p, j) => {
            const i = hand.players.findIndex((x) => x.id === p.id);
            return i < 0 ? null : <Fly key={`${hand.n}-${p.id}`} amount={p.amount} bb={hand.bb} from={{ x: pots.x - j * M * 16, y: pots.y }} to={spots[i].stack(0)} wait={j * 450} animate={animate} />;
          })}

          {btn >= 0 && !none && <span className="tf-at tf-dealer" style={{ left: spots[btn].dealer.x, top: spots[btn].dealer.y }} aria-label={`Button: ${nameOf[hand.button ?? ''] ?? ''}`}>D</span>}

          {hand.players.map((p, i) => {
            const sp = spots[i], inHand = hand.dealt.includes(p.id), out = s.folded.includes(p.id), idle = !none && !inHand;
            const stack = s.stacks[p.id], won = s.won[p.id] ?? 0, text = inHand ? s.act[p.id] ?? '' : '', all = s.allin.includes(p.id) && !out;
            const up = s.shown && !out ? hand.shown[p.id] : undefined;
            const state = out ? 'is-out' : idle ? 'is-idle' : lit === i ? 'is-lit' : lit >= 0 ? 'is-dim' : won > 0 ? 'is-win' : '';
            const cols = stack !== undefined && stack > 0 ? chipCols(stack, hand.bb, 4) : [];
            const order = s.folded.indexOf(p.id);
            const hole = out ? { x: muck.x + (((i * 37) % 9) - 4) * M * 0.7, y: muck.y + (((i * 53) % 7) - 3) * M * 0.7, rot: ((i * 67) % 140) - 70 } : up ? { ...sp.hole, rot: 0 } : sp.hole;
            const own = me?.id === p.id;
            return (
              <div key={p.id} className={`tf-player ${state}`} style={{ ['--hue' as string]: hue[p.id] }}>
                <span className="tf-stack">
                  {cols.map((c, j) => { const q = sp.stack(j); return <span key={j} className="tf-col" style={{ left: q.x, top: q.y + M * 1.4 }}><Chips amount={0} bb={hand.bb} col={c} /></span>; })}
                </span>
                {inHand && (
                  <span className={`tf-at tf-hole ${up ? 'is-up' : ''} ${out ? 'is-muck' : ''}`} style={{ left: hole.x, top: hole.y, ['--rot' as string]: `${hole.rot}deg`, zIndex: out ? 1 + order : undefined }} aria-hidden={!up}>
                    {up
                      ? up.map((c) => <span key={c} className="tf-flip"><PlayingCard card={c} size="sm" /></span>)
                      : <><span><CardBack size="sm" /></span><span><CardBack size="sm" /></span></>}
                  </span>
                )}
                {inHand && <Bet amount={s.bets[p.id] ?? 0} bb={hand.bb} from={sp.stack(0)} at={sp.bet} pot={pots} animate={animate} />}
                <div className="tf-at tf-seat" style={{ left: sp.seat.x, top: sp.seat.y }}
                  aria-label={`${p.name}${stack !== undefined ? `, ${feltFig(stack)} chips` : ''}${out ? ', folded' : ''}${idle ? ', not in this hand' : ''}${all ? ', all-in' : ''}${lit === i ? ', to act' : ''}`}>
                  {own
                    ? <button type="button" className="tf-av tf-av--me" aria-label="Change your photo and colour" aria-expanded={mine} onClick={() => setMine((v) => !v)} style={p.photo ? { backgroundImage: `url("${p.photo}")` } : undefined}>{!p.photo && FACE}</button>
                    : <span className="tf-av" style={p.photo ? { backgroundImage: `url("${p.photo}")` } : undefined}>{!p.photo && FACE}</span>}
                  <span className="tf-tag">
                    <b>{p.name}</b>
                    <small>{stack === undefined ? '' : feltFig(stack)}{won > 0 && <span className="tf-gain"> +{feltFig(won)}</span>}</small>
                  </span>
                  <span className={`tf-act ${text.startsWith('All-in') ? 'is-allin' : ''}`}>{text}</span>
                </div>
              </div>
            );
          })}
          {/* your own look: it opens out of your photo, above it for a lower seat and under it for an upper seat */}
          {me && mine && (() => {
            const i = hand.players.findIndex((p) => p.id === me.id);
            if (i < 0) return null;
            const q = spots[i].seat, under = q.y < box.h / 2, half = 118;
            const x = Math.max(half + 8 - box.left, Math.min(box.w + box.left - half - 8, q.x));
            return (
              <>
                <button type="button" className="tf-veil" aria-label="Close" onClick={() => setMine(false)} />
                <div className="tf-mine" data-under={under} style={{ left: x, top: under ? q.y + M * 7 : q.y - M * 7, ['--ox' as string]: `${q.x - x + half}px` }}>{me.panel(() => setMine(false))}</div>
              </>
            );
          })()}
        </section>
      )}
    </div>
  );
}

/* ------------------------------- the screen ------------------------------- */

const SEG: Record<FeltSeg, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', end: 'Showdown' };
const Arrow = ({ flip }: { flip?: boolean }) => <svg viewBox="0 0 24 24" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}><path d="M15 18l-6-6 6-6" /></svg>;

/** The table screen. `hands` are the finished hands, oldest first; `live` is the hand in play; `idle` is the table with no hand.
    Live follows the hand in play and each new hand. The timeline and the arrows move a cursor over the hand on show: that never
    changes the record. `corner` is the one button at the bottom right (log on, add own hand). */
export function TablePage({ hands, live, idle, canLive, onBack, corner, me }: { hands: FeltHand[]; live: FeltHand | null; idle: FeltHand; canLive: boolean; onBack?: () => void; corner?: ReactNode | ((hand: FeltHand) => ReactNode); me?: FeltMe }) {
  const lastDone = hands[hands.length - 1];
  const [pick, setPick] = useState<'live' | number>(() => (canLive || !lastDone ? 'live' : lastDone.n));
  // the step on show; null follows the end of the hand
  const [at, setAt] = useState<number | null>(() => (canLive || !lastDone ? null : 0));
  const hand = (pick === 'live' ? null : hands.find((h) => h.n === pick) ?? (live?.n === pick ? live : null)) ?? live ?? lastDone ?? idle;
  const last = hand.steps.length;
  const k = at === null ? last : Math.min(at, last);
  const follow = pick === 'live' && at === null;
  const behind = pick === 'live' && at !== null ? last - k : 0;

  // a viewer behind the live hand stays on that hand when the next one starts
  const liveN = useRef(live?.n);
  useEffect(() => {
    const was = liveN.current;
    liveN.current = live?.n;
    if (pick === 'live' && at !== null && was !== undefined && was !== live?.n) setPick(was);
  }, [live?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // motion plays for one step forward in the same hand; a jump shows the end state at once
  const seen = useRef({ n: hand.n, k });
  const animate = seen.current.n === hand.n && k === seen.current.k + 1;
  useEffect(() => { seen.current = { n: hand.n, k }; });

  const moveTo = (to: number) => { const v = Math.max(0, Math.min(last, to)); setAt(pick === 'live' && v === last ? null : v); };
  const goLive = () => { setPick('live'); setAt(null); };
  const choose = (v: string) => { if (v === 'live') goLive(); else { setPick(Number(v)); setAt(0); } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [role="dialog"]')) return;
      if (e.key === 'ArrowLeft') moveTo(k - 1); else if (e.key === 'ArrowRight') moveTo(k + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // timeline: one block per street, one stop per action
  const groups: { seg: FeltSeg; ks: number[] }[] = [];
  hand.steps.forEach((st, i) => { const g = groups[groups.length - 1]; if (g && g.seg === st.seg) g.ks.push(i + 1); else groups.push({ seg: st.seg, ks: [i + 1] }); });
  const track = useRef<HTMLDivElement>(null);
  /* The timeline (owner, 13 Nov 2026): a tap on a stop shows that step; a quick swipe scrolls the timeline; a press held for
     250 ms picks the stop under the finger, and a drag while still holding scrubs through the hand. */
  const drag = useRef(false);
  const hold = useRef<{ x: number; y: number; t: number; moved: boolean; id: number } | null>(null);
  const seek = (x: number, y: number) => { const b = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-k]'); if (b && track.current?.contains(b)) moveTo(Number(b.dataset.k)); };
  const endHold = () => { if (hold.current) window.clearTimeout(hold.current.t); hold.current = null; drag.current = false; track.current?.classList.remove('is-scrub'); };
  const onDown = (e: React.PointerEvent) => {
    endHold();
    const x = e.clientX, y = e.clientY;
    hold.current = { x, y, moved: false, id: e.pointerId, t: window.setTimeout(() => {
      if (!hold.current || hold.current.moved) return;
      drag.current = true; track.current?.classList.add('is-scrub'); haptic(); seek(x, y);
      try { track.current?.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
    }, 250) };
  };
  const onMove = (e: React.PointerEvent) => {
    const h = hold.current;
    if (!h) return;
    if (drag.current) { e.preventDefault(); seek(e.clientX, e.clientY); return; }
    if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) { h.moved = true; window.clearTimeout(h.t); }
  };
  const onUp = (e: React.PointerEvent) => { const h = hold.current; if (h && !h.moved && !drag.current) seek(e.clientX, e.clientY); endHold(); };
  useEffect(() => {
    const t = track.current, c = t?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!t || !c || drag.current) return;
    const left = c.offsetLeft + (c.parentElement?.offsetLeft ?? 0) - t.offsetLeft;
    if (left < t.scrollLeft || left + 24 > t.scrollLeft + t.clientWidth) t.scrollLeft = left - t.clientWidth / 2;
  }, [k, hand.n, last]);

  const label = (h: FeltHand) => (h.winners.length ? `Hand ${h.n} (${h.winners.join(' and ')})` : `Hand ${h.n}`);
  const value = pick === 'live' ? 'live' : String(hand.n);
  return createPortal(
    <div className="tfp">
      <div className="tfp-area">
        {onBack && <button type="button" className="tfp-round tfp-back" aria-label="Back" onClick={onBack}><Arrow /></button>}
        {canLive && (
          <button type="button" className={`tfp-live ${follow ? 'is-on' : ''}`} aria-label={follow ? 'Live' : behind > 0 ? `Go to live, ${behind} behind` : 'Go to live'} onClick={goLive}>
            <i aria-hidden="true" />Live{behind > 0 && <span className="tfp-behind">{behind}</span>}
          </button>
        )}
        <TableFelt hand={hand} k={k} animate={animate} me={me} />
      </div>
      <div className="tfp-bar">
        {(canLive || hands.length > 0) && (
          <select className="tfp-pick" aria-label="Hand" value={value} onChange={(e) => choose(e.target.value)}>
            {canLive && <option value="live">{live ? `Hand ${live.n} (live)` : 'Live'}</option>}
            {[...hands].reverse().map((h) => <option key={h.n} value={h.n}>{label(h)}</option>)}
          </select>
        )}
        <div ref={track} className="tfp-track" role="group" aria-label="Actions"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={endHold} onContextMenu={(e) => e.preventDefault()}>
          {last > 0 && <div className="tfp-seg"><em>Start</em><button type="button" data-k={0} className="tfp-stop" aria-current={k === 0 ? 'step' : undefined} aria-label="Before the first action" /></div>}
          {groups.map((g, gi) => (
            <div key={gi} className="tfp-seg">
              <em>{g.seg === 'end' && !hand.showdown ? 'Result' : SEG[g.seg]}</em>
              {g.ks.map((v) => <button key={v} type="button" data-k={v} className={`tfp-stop ${v < k ? 'is-past' : ''}`} aria-current={v === k ? 'step' : undefined} aria-label={`Step ${v}`} />)}
            </div>
          ))}
        </div>
        {last > 0 && <>
          <button type="button" className="tfp-round" aria-label="Back one action" disabled={k <= 0} onClick={() => moveTo(k - 1)}><Arrow /></button>
          <button type="button" className="tfp-round" aria-label="Forward one action" disabled={k >= last} onClick={() => moveTo(k + 1)}><Arrow flip /></button>
        </>}
        {typeof corner === 'function' ? corner(hand) : corner}
      </div>
    </div>,
    document.body,
  );
}
