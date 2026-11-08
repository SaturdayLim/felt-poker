import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { NAV_MS, calm } from '../lib/motion';

/* The main tab bar, made like a chip tray: one straight rail with a pocket cut under it for each tab. The icon of
   each tab rests in its pocket. A poker chip in the Main colour marks the open tab: it rolls along the rail to the
   new pocket (it turns by the distance over its radius, so it really rolls). The rail is a soft surface: it gives
   way under the chip wherever it is, in a smooth trough with no corner, so the line never touches the chip. At rest
   the trough is the pocket itself. The pocket fill follows the same surface. Reduce Motion moves it at once. */

export interface NavTab { path: string; label: string; icon: string }

const CHIP = 44, R = CHIP / 2, RAIL_Y = 24, POCKET = 50, PR = POCKET / 2;
// the soft trough under a rolling chip: a raised cosine, wide and gentle, deeper than the chip, flat where it meets the rail
const TROUGH_W = 78, TROUGH_D = 36;
// the fallback distance (px) from a pocket centre over which the trough takes over from the pocket shape
const SETTLE = 16;
// where two dips meet, the line rounds the join downwards (away from the chip), never up
const BLEND = 24;
// the half-width (px) of that rounding, and how far from the chip centre it applies in full
const SOFTEN = 10, SOFTEN_NEAR = 34;
// the home indicator inset is 34 px on every iPhone: a larger value is the browser's error, not room to leave
const SAFE_MAX = 34;
// the roll: one ease-in-out curve with no overshoot, so the chip never passes its pocket and comes back
const ROLL_MS = NAV_MS;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const round = (dx: number) => (Math.abs(dx) < PR ? Math.sqrt(PR * PR - dx * dx) : 0);
const soft = (dx: number) => (Math.abs(dx) < TROUGH_W ? (TROUGH_D * (1 + Math.cos((Math.PI * dx) / TROUGH_W))) / 2 : 0);

/** The rail surface as [x, depth below the rail] points: a clean pocket per tab, and a trough that carries the chip. */
function railPoints(w: number, pockets: number[], chip: { x: number; y: number } | null): [number, number][] {
  const xs: number[] = [];
  for (let x = 0; x <= w; x += 1) xs.push(x);
  // the pocket rims fall on exact points, so each pocket keeps a crisp edge
  for (const cx of pockets) xs.push(cx - PR, cx + PR);
  xs.sort((a, b) => a - b);
  // at a pocket centre the trough is the pocket shape; away from it, the soft trough
  const near = chip ? Math.min(...pockets.map((cx) => Math.abs(chip.x - cx))) : 0;
  // the blend runs from a pocket centre to the midpoint between two pockets, so it spans the whole roll
  const settle = pockets.length > 1 ? (pockets[1] - pockets[0]) / 2 : SETTLE;
  const m = smooth(near / settle);
  const depth = (x: number) => {
    let d = 0;
    if (chip) { const dx = x - chip.x; d = Math.max(0, chip.y + (1 - m) * round(dx) + m * soft(dx)); }
    for (const cx of pockets) {
      const p = round(x - cx);
      if (p <= 0) continue;
      const hi = Math.max(d, p), lo = Math.min(d, p);
      // a smooth maximum where the trough meets a pocket: it only goes deeper, and only where both are open
      const k = chip ? clamp01(Math.abs(chip.x - cx) / 8) * clamp01(lo / 4) : 0;
      const g = Math.max(0, 1 - (hi - lo) / BLEND);
      d = hi + k * (BLEND / 4) * g * g;
    }
    return d;
  };
  // the rail ends stay fixed on the rail: a chip that swings past the end pocket bends the line, never its ends
  const ends = (x: number) => clamp01(Math.min(x, w - x) / 10);
  return xs.map((x) => {
    const d = depth(x) * ends(x);
    // near a moving chip, a pocket rim and the trough meet in a corner: fill it in from below (blurred surface, never
    // shallower), so the line bends smoothly. A resting chip (m = 0) and pockets away from it keep their clean edges.
    const reach = chip ? m * smooth(1 - (Math.abs(x - chip.x) - SOFTEN_NEAR) / 20) : 0;
    if (reach <= 0) return [x, d];
    let sum = 0, wsum = 0;
    for (let k = -SOFTEN; k <= SOFTEN; k += 2) { const g = Math.exp(-(k * k) / (SOFTEN * SOFTEN / 2)); sum += g * depth(x + k); wsum += g; }
    return [x, d + reach * ends(x) * Math.max(0, sum / wsum - d)];
  });
}

const line = (pts: [number, number][]) => pts.map(([x, d], i) => `${i ? 'L' : 'M'}${+x.toFixed(2)} ${(RAIL_Y + d).toFixed(2)}`).join(' ');
const fill = (pts: [number, number][], w: number) => `${line(pts)} L${w} ${RAIL_Y} L0 ${RAIL_Y} Z`;

/** The bottom inset, measured on a new element each time: iOS can keep a stale env() value on an element styled
    before the toolbar settled. The nav reads the result, capped at the iPhone home indicator. */
function measureSafe(nav: HTMLElement) {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(p);
  const h = p.getBoundingClientRect().height;
  p.remove();
  nav.style.setProperty('--felt-nav-safe', `${Math.min(SAFE_MAX, Math.max(0, Math.round(h)))}px`);
}

export function NavRail({ tabs, active }: { tabs: NavTab[]; active: string }) {
  const nav = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const well = useRef<SVGPathElement>(null);
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

  // the bar height: measure the bottom inset now and again once the phone has settled its toolbar
  useEffect(() => {
    const n = nav.current;
    if (!n) return;
    const again = () => { if (!document.documentElement.classList.contains('felt-typing')) measureSafe(n); };
    again();
    const f = requestAnimationFrame(() => requestAnimationFrame(again));
    const t = [250, 800, 2000].map((ms) => window.setTimeout(again, ms));
    const vv = window.visualViewport;
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', again);
    window.addEventListener('pageshow', again);
    vv?.addEventListener('resize', again);
    return () => {
      cancelAnimationFrame(f); t.forEach((x) => window.clearTimeout(x));
      window.removeEventListener('resize', again); window.removeEventListener('orientationchange', again);
      window.removeEventListener('pageshow', again); vv?.removeEventListener('resize', again);
    };
  }, []);

  const centre = (i: number) => (w / tabs.length) * (i + 0.5);
  const pockets = tabs.map((_, i) => centre(i));
  const paint = (c: { x: number; y: number } | null) => {
    const pts = railPoints(w, pockets, c);
    edge.current?.setAttribute('d', line(pts));
    well.current?.setAttribute('d', fill(pts, w));
  };
  // chip centre x, lift above the rail (negative = up), turn in degrees
  const draw = (x: number, lift: number, turn: number) => {
    if (chip.current) chip.current.style.transform = `translate(${x - R}px, ${lift}px) rotate(${turn}deg)`;
    paint({ x, y: lift });
  };

  useLayoutEffect(() => {
    const c = chip.current;
    if (!c || !w) return;
    cancelAnimationFrame(raf.current);
    if (idx < 0) { c.style.opacity = '0'; paint(null); return; }
    c.style.opacity = '1';
    const x = centre(idx);
    const from = at.current;
    // a full turn of the chip covers 2 x pi x r along the rail
    const turn = (from?.turn ?? 0) + (from ? ((x - from.x) / R) * (180 / Math.PI) : 0);
    at.current = { x, turn };
    const n = nav.current;
    if (!from || calm() || from.x === x) { if (n) delete n.dataset.rolling; draw(x, 0, turn); return; }
    // the icon of the new tab turns to the chip colours only when the chip is there (nav.css)
    if (n) n.dataset.rolling = '';
    // it lifts out of the old pocket onto the rail, rolls, and drops into the new one; the rail gives way under it all the way
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ROLL_MS);
      const q = ease(t);
      draw(from.x + (x - from.x) * q, Math.sin(t * Math.PI) * -6, from.turn + (turn - from.turn) * q);
      // the chip has reached the pocket: the icon takes the chip colours while it settles
      if (n && q > 0.96) delete n.dataset.rolling;
      if (t < 1) raf.current = requestAnimationFrame(step);
      else { draw(x, 0, turn); if (n) delete n.dataset.rolling; }
    };
    raf.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, w]);

  return (
    <nav ref={nav} className="felt-nav" aria-label="Main">
      <div ref={bar} className="felt-rail">
        <svg className="felt-rail-line" width={w} height={RAIL_Y + TROUGH_D + 4} aria-hidden="true">
          {/* the pocket fills from nothing at the rail, so no flat edge crosses the icon in it */}
          <defs>
            <linearGradient id="felt-rail-well" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={RAIL_Y} y2={RAIL_Y + 12}>
              <stop offset="0" className="felt-rail-well-top" />
              <stop offset="1" className="felt-rail-well-base" />
            </linearGradient>
          </defs>
          <path ref={well} className="felt-rail-pocket" />
          <path ref={edge} className="felt-rail-edge" />
        </svg>
        <span ref={chip} className="felt-chip" aria-hidden="true" style={{ top: RAIL_Y - R, opacity: 0 }} />
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
