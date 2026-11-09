/* Bird's-eye view of the table for the player view. It shows only what the viewer snapshot already carries:
   who acts next, the chips each player has in front, folded players greyed out, the pot and the board.
   Seat 1 (the button) sits at the bottom centre of the long bottom side; the others follow clockwise. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calm, spring, SPRING } from '../lib/motion';
import { VCards } from './viewerLook';
import type { NowSnapshot, PubSnapshot, StackLine } from '../live/snapshot';

/* The table is drawn in a fixed 343 by 330 box. Seats are placed in that box and shown as percentages. */
const W = 343, H = 330;
const X0 = 40, X1 = W - 40, Y0 = 28, Y1 = H - 28;

/** A point on the seat path: a rectangle round the table, from the bottom centre, left along the bottom
    (clockwise seen from above), then up, across the top and down. `t` runs from 0 to 1 round the path. */
export function seatPoint(t: number): { x: number; y: number; side: 'bottom' | 'left' | 'top' | 'right' } {
  const w = X1 - X0, h = Y1 - Y0, per = 2 * (w + h);
  let d = (((t % 1) + 1) % 1) * per;
  if (d <= w / 2) return { x: (X0 + X1) / 2 - d, y: Y1, side: 'bottom' };
  d -= w / 2;
  if (d <= h) return { x: X0, y: Y1 - d, side: 'left' };
  d -= h;
  if (d <= w) return { x: X0 + d, y: Y0, side: 'top' };
  d -= w;
  if (d <= h) return { x: X1, y: Y0 + d, side: 'right' };
  d -= h;
  return { x: X1 - d, y: Y1, side: 'bottom' };
}

const num = (t: string) => { const n = Number(t.replace(/,/g, '')); return Number.isFinite(n) && t.trim() !== '' ? n : null; };

/** The chips each player has put in this hand, and who has folded. Amounts in the boxes are street totals,
    so a player's chips in a street are their latest amount, and a call matches the highest bet so far. */
export function inFront(view: NowSnapshot['view']): { put: Record<string, number>; folded: Set<string> } {
  const put: Record<string, number> = {};
  for (const s of view.streets) {
    if (!s.rows.length) continue;
    const here: Record<string, number> = {};
    let high = 0;
    for (let col = 0; col < s.cols; col++) {
      for (const r of s.rows) {
        const c = r.cells[col];
        if (!c || c.kind === 'off' || c.kind === 'fold') continue;
        const n = num(c.t);
        if (c.kind === 'call' && n === null) here[r.name] = high;
        else if (n !== null) { here[r.name] = n; high = Math.max(high, n); }
      }
    }
    for (const [name, v] of Object.entries(here)) put[name] = (put[name] ?? 0) + v;
  }
  const last = [...view.streets].reverse().find((s) => s.rows.length);
  return { put, folded: new Set((last?.rows ?? []).filter((r) => r.folded).map((r) => r.name)) };
}

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const stackText = (s?: StackLine) => (!s || s.stack === null ? '-' : `${s.spread ? '~' : ''}${money(s.stack)}`);

/** A number that counts up (or down) to its new value. Reduced motion jumps. */
function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (a === value) return;
    if (calm()) { from.current = value; setShown(value); return; }
    const t0 = performance.now(), ms = 300;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - (1 - p) * (1 - p);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="sat-num">{money(shown)}</span>;
}

export function BirdsEye({ pub, now: sent, stacks }: { pub: PubSnapshot; now: NowSnapshot | null; stacks: StackLine[] }) {
  // a new hand shows only after real action: blinds and card entry alone do not count
  const now = sent && sent.acted !== false ? sent : null;
  const dealt = now?.view.dealt ?? [];
  const button = now?.view.button ?? pub.button;
  // everyone seated in the game sits at the table; players not dealt into this hand are greyed out
  const all = [...pub.players].sort((a, b) => a.seat - b.seat);
  const inHand = (name: string) => !dealt.length || dealt.includes(name);
  // an older snapshot has no status: dealt players count as playing, the others as out
  const lamp = (p: PubSnapshot['players'][number]): 'playing' | 'away' | 'out' => p.status ?? (dealt.length && !dealt.includes(p.name) ? 'out' : 'playing');
  // the button player is seat 1, at the bottom centre
  const at = Math.max(0, all.findIndex((p) => p.name === button));
  const ring = all.map((_, i) => all[(at + i) % all.length]);
  const { put, folded } = now ? inFront(now.view) : { put: {} as Record<string, number>, folded: new Set<string>() };
  const spots = ring.map((_, i) => seatPoint(i / ring.length));
  const turn = now && !now.ended ? ring.findIndex((p) => p.name === now.toAct) : -1;

  // the highlight springs from the seat that acted to the seat that acts next
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const prev = useRef<{ x: number; y: number } | null>(null);
  const spot = turn >= 0 ? spots[turn] : null;
  useLayoutEffect(() => {
    const el = mark.current, b = box.current;
    if (spot && el && b && prev.current && !calm() && (prev.current.x !== spot.x || prev.current.y !== spot.y)) {
      const k = b.clientWidth / W, dx = (prev.current.x - spot.x) * k, dy = (prev.current.y - spot.y) * k;
      spring(el, (p) => ({ transform: `translate(calc(-50% + ${dx * (1 - p)}px), calc(-50% + ${dy * (1 - p)}px))` }), SPRING.settle, { fill: 'none' });
    }
    prev.current = spot ? { x: spot.x, y: spot.y } : prev.current;
  }, [spot?.x, spot?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  return (
    <div ref={box} className="felt-bird" role="group" aria-label="Table from above" style={{ aspectRatio: `${W} / ${H}` }}>
      <div className="felt-bird-rail"><div className="felt-bird-felt" /></div>
      <div className="felt-bird-mid">
        {now && <span className="felt-bird-pot">Pot <b><Count value={now.pot} /></b></span>}
        {now && now.board.length > 0 && <span className="felt-bird-board"><VCards cards={now.board} size="sm" /></span>}
      </div>
      {spot && <span ref={mark} className="felt-bird-turn" style={pct(spot.x, spot.y)} aria-hidden="true" />}
      {ring.map((p, i) => {
        const s = spots[i], idle = !inHand(p.name), fold = !idle && folded.has(p.name), chips = idle ? 0 : put[p.name] ?? 0, light = lamp(p);
        const inward = s.side === 'bottom' ? { x: 0, y: -44 } : s.side === 'top' ? { x: 0, y: 44 } : s.side === 'left' ? { x: 52, y: 0 } : { x: -52, y: 0 };
        const word = light === 'playing' ? 'playing' : light === 'away' ? 'away' : 'out of the game';
        return (
          <div key={p.id}>
            <div className={`felt-bird-seat ${fold ? 'is-folded' : ''} ${idle ? 'is-idle' : ''} ${i === turn ? 'is-turn' : ''}`} style={pct(s.x, s.y)}
              aria-label={`Seat ${i + 1}, ${p.name}, ${word}${idle ? ', not in this hand' : ''}${fold ? ', folded' : ''}${i === turn ? ', to act' : ''}`}>
              <b className="felt-ellipsis">{p.name}</b>
              <span className="felt-bird-stack sat-num">{stackText(stacks.find((x) => x.name === p.name))}</span>
              {button === p.name && <span className="felt-bird-btn" aria-label="Button">D</span>}
            </div>
            <span className={`felt-bird-lamp felt-lamp--${light}`} style={pct(s.x, s.y - 24)} aria-hidden="true" />
            {chips > 0 && <span className={`felt-bird-bet ${fold ? 'is-folded' : ''}`} style={pct(s.x + inward.x, s.y + inward.y)}><Count value={chips} /></span>}
          </div>
        );
      })}
    </div>
  );
}
