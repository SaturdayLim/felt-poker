import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { SPRING, calm, spring } from '../lib/motion';

/* The main tab bar, made like a chip tray: one straight rail with a pocket cut under it for each tab. The icon of
   each tab rests in its pocket. A poker chip marks the open tab: it rolls along the rail to the new pocket (it turns
   by the distance over its radius, so it really rolls) and settles there. Reduce Motion moves it at once. */

export interface NavTab { path: string; label: string; icon: string }

const CHIP = 44, R = CHIP / 2, RAIL_Y = 24, POCKET = 50;

export function NavRail({ tabs, active }: { tabs: NavTab[]; active: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  const at = useRef<{ x: number; turn: number } | null>(null);
  const idx = tabs.findIndex((t) => t.path === active);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fit = () => setW(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const centre = (i: number) => (w / tabs.length) * (i + 0.5);
  useLayoutEffect(() => {
    const c = chip.current;
    if (!c || !w) return;
    if (idx < 0) { c.style.opacity = '0'; return; }
    c.style.opacity = '1';
    const x = centre(idx) - R;
    const from = at.current;
    // a full turn of the chip covers 2 x pi x r along the rail
    const turn = (from?.turn ?? 0) + (from ? ((x - from.x) / R) * (180 / Math.PI) : 0);
    at.current = { x, turn };
    c.style.transform = `translate(${x}px, 0) rotate(${turn}deg)`;
    if (!from || calm() || from.x === x || !c.animate) return;
    const dx = x - from.x;
    // it lifts out of the old pocket onto the rail, rolls, and drops into the new one
    spring(c, (p) => {
      const q = Math.min(p, 1.04);
      const lift = Math.sin(Math.min(p, 1) * Math.PI) * -6;
      return { transform: `translate(${from.x + dx * q}px, ${lift}px) rotate(${from.turn + (turn - from.turn) * q}deg)` };
    }, SPRING.pill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, w]);

  // the rail, broken by one pocket per tab: a half circle cut under the line
  const path = w ? (() => {
    const r = POCKET / 2;
    let d = `M0 ${RAIL_Y}`;
    tabs.forEach((_, i) => { const cx = centre(i); d += ` H${cx - r} A${r} ${r} 0 0 0 ${cx + r} ${RAIL_Y}`; });
    return `${d} H${w}`;
  })() : '';

  return (
    <nav className="felt-nav" aria-label="Main">
      <div ref={bar} className="felt-rail">
        <svg className="felt-rail-line" width={w} height={RAIL_Y + POCKET / 2 + 4} aria-hidden="true">
          {w > 0 && tabs.map((_, i) => <path key={i} className="felt-rail-pocket" d={`M${centre(i) - POCKET / 2} ${RAIL_Y} A${POCKET / 2} ${POCKET / 2} 0 0 0 ${centre(i) + POCKET / 2} ${RAIL_Y} Z`} />)}
          <path className="felt-rail-edge" d={path} />
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
