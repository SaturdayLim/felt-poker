import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { SPRING, calm, springCurve } from '../lib/motion';

/* The main tab bar, made like a chip tray: one straight rail with a pocket cut under it for each tab. The icon of
   each tab rests in its pocket. A poker chip in the Main colour marks the open tab: it rolls along the rail to the
   new pocket (it turns by the distance over its radius, so it really rolls). The rail dips under the chip wherever
   it is, so the chip never cuts through the line. Reduce Motion moves it at once. */

export interface NavTab { path: string; label: string; icon: string }

const CHIP = 44, R = CHIP / 2, RAIL_Y = 24, POCKET = 50, DIP = R + 3;

/** The rail as one line: straight, with a round dip under each pocket and under the chip. Sampled every 2 px. */
function railPath(w: number, pockets: number[], chip: { x: number; y: number } | null): string {
  const r = POCKET / 2;
  const depth = (x: number) => {
    let d = 0;
    for (const cx of pockets) { const dx = x - cx; if (Math.abs(dx) < r) d = Math.max(d, Math.sqrt(r * r - dx * dx)); }
    if (chip) { const dx = x - chip.x; if (Math.abs(dx) < DIP) d = Math.max(d, chip.y + Math.sqrt(DIP * DIP - dx * dx)); }
    return d;
  };
  let d = `M0 ${RAIL_Y}`;
  for (let x = 2; x <= w; x += 2) d += ` L${x} ${(RAIL_Y + depth(x)).toFixed(1)}`;
  return d;
}

export function NavRail({ tabs, active }: { tabs: NavTab[]; active: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const [w, setW] = useState(0);
  const at = useRef<{ x: number; turn: number } | null>(null);
  const raf = useRef(0);
  const idx = tabs.findIndex((t) => t.path === active);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fit = () => setW(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);

  const centre = (i: number) => (w / tabs.length) * (i + 0.5);
  const pockets = tabs.map((_, i) => centre(i));
  // chip centre x, lift above the rail (negative = up), turn in degrees
  const draw = (x: number, lift: number, turn: number) => {
    if (chip.current) chip.current.style.transform = `translate(${x - R}px, ${lift}px) rotate(${turn}deg)`;
    edge.current?.setAttribute('d', railPath(w, pockets, { x, y: lift }));
  };

  useLayoutEffect(() => {
    const c = chip.current;
    if (!c || !w) return;
    cancelAnimationFrame(raf.current);
    if (idx < 0) { c.style.opacity = '0'; edge.current?.setAttribute('d', railPath(w, pockets, null)); return; }
    c.style.opacity = '1';
    const x = centre(idx);
    const from = at.current;
    // a full turn of the chip covers 2 x pi x r along the rail
    const turn = (from?.turn ?? 0) + (from ? ((x - from.x) / R) * (180 / Math.PI) : 0);
    at.current = { x, turn };
    if (!from || calm() || from.x === x) { draw(x, 0, turn); return; }
    // it lifts out of the old pocket onto the rail, rolls, and drops into the new one; the rail dips under it all the way
    const { p, ms } = springCurve(SPRING.pill);
    const t0 = performance.now();
    const step = (now: number) => {
      const i = Math.min(p.length - 1, Math.floor((now - t0) / 16));
      const q = p[i], s = Math.min(q, 1);
      draw(from.x + (x - from.x) * q, Math.sin(s * Math.PI) * -6, from.turn + (turn - from.turn) * q);
      if (now - t0 < ms) raf.current = requestAnimationFrame(step);
      else draw(x, 0, turn);
    };
    raf.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, w]);

  return (
    <nav className="felt-nav" aria-label="Main">
      <div ref={bar} className="felt-rail">
        <svg className="felt-rail-line" width={w} height={RAIL_Y + POCKET / 2 + 4} aria-hidden="true">
          {w > 0 && pockets.map((cx, i) => <path key={i} className="felt-rail-pocket" d={`M${cx - POCKET / 2} ${RAIL_Y} A${POCKET / 2} ${POCKET / 2} 0 0 0 ${cx + POCKET / 2} ${RAIL_Y} Z`} />)}
          <path ref={edge} className="felt-rail-edge" />
        </svg>
        <span ref={chip} className="felt-chip" aria-hidden="true" style={{ top: RAIL_Y - R }} />
        {tabs.map((t) => (
          <a key={t.path} href={`#/${t.path}`} aria-current={active === t.path ? 'page' : undefined}>
            <span className="felt-rail-icon"><Icon name={t.icon} /></span>
            <span className="felt-rail-label">{t.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
