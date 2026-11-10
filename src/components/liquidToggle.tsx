import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { calm } from '../lib/motion';
import { resolveTheme, useResolvedTheme } from '../theme';
import { useStore } from '../store';

/* A toggle whose knob moves like a drop of liquid. Drawn in a 236 x 118 space and scaled to the real size (60 x 30).
   The knob and two droplets that follow it are blurred and then thresholded by an SVG filter, so they merge like liquid.
   A damped spring (omega0 16 rad/s, zeta 0.5, about 0.6 s, small overshoot) drives it from requestAnimationFrame. */

const W = 236, H = 118, KNOB = 45, DROP_A = 27, DROP_B = 18;
const OMEGA = 16, ZETA = 0.5;
const LAG_A = 0.045, LAG_B = 0.095;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function LiquidToggle({ on, onChange, label, width = 60 }: { on: boolean; onChange: (v: boolean) => void; label: string; width?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `lq-${n}-${uid}`;
  const glow = useRef<SVGRectElement>(null);
  const lit = useRef<SVGRectElement>(null);
  const sun = useRef<SVGGElement>(null);
  const moon = useRef<SVGGElement>(null);
  const kSun = useRef<SVGGElement>(null);
  const kMoon = useRef<SVGGElement>(null);
  const shadow = useRef<SVGCircleElement>(null);
  const knob = useRef<SVGCircleElement>(null);
  const dropA = useRef<SVGCircleElement>(null);
  const dropB = useRef<SVGCircleElement>(null);
  const grad = useRef<SVGRadialGradientElement>(null);
  // spring state: position p (0 off, 1 on, with overshoot), velocity, target, and the recent positions for the droplets
  const st = useRef({ p: on ? 1 : 0, v: 0, target: on ? 1 : 0, last: 0, raf: 0, hist: [] as { t: number; p: number }[] });

  const draw = (now: number) => {
    const { p, v, hist } = st.current;
    const at = (lag: number) => {
      const t = now - lag * 1000;
      let q = hist.length ? hist[0].p : p;
      for (const h of hist) { if (h.t <= t) q = h.p; else break; }
      return clamp(q, 0, 1);
    };
    const over = p > 1 ? p - 1 : p < 0 ? -p : 0;
    const s = Math.min(Math.abs(v) * 0.055, 0.55);
    const sx = (1 + s) * (1 - 1.6 * over);
    const sy = (1 / Math.sqrt(1 + s)) * (1 + 1.1 * over);
    const half = KNOB * sx;
    const cx = clamp(H / 2 + (W - H) * p, 14 + half, W - 14 - half);
    const cy = H / 2;
    const tf = `translate(${cx.toFixed(2)} ${cy}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`;
    knob.current?.setAttribute('transform', tf);
    shadow.current?.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy + 6}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`);
    dropA.current?.setAttribute('cx', (H / 2 + (W - H) * at(LAG_A)).toFixed(2));
    dropB.current?.setAttribute('cx', (H / 2 + (W - H) * at(LAG_B)).toFixed(2));
    const g = grad.current;
    if (g) { g.setAttribute('cx', cx.toFixed(2)); g.setAttribute('fx', (cx - 14).toFixed(2)); }
    const k = clamp(p, 0, 1);
    lit.current?.setAttribute('opacity', k.toFixed(3));
    glow.current?.setAttribute('opacity', (0.75 * k).toFixed(3));
    // the chosen state is the mark on the knob; the other mark rests faint on the track, so one reads as selected
    sun.current?.setAttribute('opacity', (0.38 * k).toFixed(3));
    moon.current?.setAttribute('opacity', (0.38 * (1 - k)).toFixed(3));
    kSun.current?.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy})`);
    kMoon.current?.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy})`);
    kSun.current?.setAttribute('opacity', (1 - k).toFixed(3));
    kMoon.current?.setAttribute('opacity', k.toFixed(3));
  };

  const step = (now: number) => {
    const s = st.current;
    let dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    // a semi-implicit step of the damped spring, in small slices
    const n = Math.max(1, Math.ceil(dt / 0.004));
    dt /= n;
    for (let i = 0; i < n; i++) {
      s.v += (-2 * ZETA * OMEGA * s.v - OMEGA * OMEGA * (s.p - s.target)) * dt;
      s.p += s.v * dt;
    }
    s.hist.push({ t: now, p: s.p });
    while (s.hist.length > 2 && s.hist[1].t < now - 300) s.hist.shift();
    if (Math.abs(s.p - s.target) < 0.0005 && Math.abs(s.v) < 0.002) { s.p = s.target; s.v = 0; s.hist = [{ t: now, p: s.p }]; draw(now); s.raf = 0; return; }
    draw(now);
    s.raf = requestAnimationFrame(step);
  };

  useLayoutEffect(() => { draw(performance.now()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const s = st.current;
    const target = on ? 1 : 0;
    if (s.target === target && !s.raf) return;
    s.target = target;
    cancelAnimationFrame(s.raf);
    if (calm()) { s.p = target; s.v = 0; s.raf = 0; s.hist = []; draw(performance.now()); return; }
    s.last = performance.now();
    s.raf = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="felt-liquid" style={{ width }} onClick={() => onChange(!on)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={width} height={width / 2} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={id('on')} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#0052CC" /><stop offset="1" stopColor="#3B82F6" /></linearGradient>
          <radialGradient ref={grad} id={id('knob')} gradientUnits="userSpaceOnUse" cx="59" cy="59" r={KNOB} fx="45" fy="43"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DCDCF0" /></radialGradient>
          <filter id={id('glow')} filterUnits="userSpaceOnUse" x="-40" y="-40" width={W + 80} height={H + 80}><feGaussianBlur stdDeviation={H * 0.09} /></filter>
          <filter id={id('soft')} filterUnits="userSpaceOnUse" x="-40" y="-40" width={W + 80} height={H + 80}><feGaussianBlur stdDeviation="6" /></filter>
          <filter id={id('goo')} filterUnits="userSpaceOnUse" x="-40" y="-40" width={W + 80} height={H + 80} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={(7.7 / 118) * H} />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" />
          </filter>
          <mask id={id('mask')} maskUnits="userSpaceOnUse" x="-40" y="-40" width={W + 80} height={H + 80}>
            <g filter={`url(#${id('goo')})`} fill="#fff">
              <circle ref={dropB} cx="59" cy="59" r={DROP_B} />
              <circle ref={dropA} cx="59" cy="59" r={DROP_A} />
              <circle ref={knob} cx="0" cy="0" r={KNOB} />
            </g>
          </mask>
        </defs>
        <rect ref={glow} x="0" y="0" width={W} height={H} rx={H / 2} fill={`url(#${id('on')})`} filter={`url(#${id('glow')})`} opacity="0" />
        <rect x="0" y="0" width={W} height={H} rx={H / 2} fill="#3A3D44" />
        <rect ref={lit} x="0" y="0" width={W} height={H} rx={H / 2} fill={`url(#${id('on')})`} opacity="0" />
        <g ref={sun} transform="translate(59 59)" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none">
          <circle r="13" fill="#fff" stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M0 -21V-27" transform={`rotate(${a})`} />)}
        </g>
        <g ref={moon} transform="translate(177 59)"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" transform="translate(-27.6 -27.6) scale(2.3)" fill="#fff" /></g>
        <circle ref={shadow} cx="0" cy="0" r={KNOB} fill="#000" opacity="0.32" filter={`url(#${id('soft')})`} />
        <rect x="-40" y="-40" width={W + 80} height={H + 80} fill={`url(#${id('knob')})`} mask={`url(#${id('mask')})`} />
        <g ref={kSun} stroke="#1C1E21" strokeWidth="3.6" strokeLinecap="round" fill="none" pointerEvents="none">
          <circle r="12" fill="#1C1E21" stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M0 -19V-25" transform={`rotate(${a})`} />)}
        </g>
        <g ref={kMoon} pointerEvents="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" transform="translate(-27.6 -27.6) scale(2.3)" fill="#1C1E21" /></g>
      </svg>
    </button>
  );
}

/** Light or dark, two states only. It starts as the phone setting (the stored value 'auto'); the first touch stores an explicit value. */
export function ThemeToggle() {
  const pref = useStore((s) => s.settings.theme);
  const update = useStore((s) => s.updateSettings);
  const shown = useResolvedTheme(pref);
  const dark = (pref === 'auto' ? shown : resolveTheme(pref)) === 'dark';
  return <LiquidToggle on={dark} onChange={(v) => update({ theme: v ? 'dark' : 'light' })} label="Dark theme" />;
}
