import { tone } from '../lib/format';
import { useId, useLayoutEffect, useRef, useState } from 'react';

/** Series colours: the accent first, then neutrals and the status colours (all kit tokens). */
export const SERIES_COLORS = ['var(--sat-accent)', 'var(--sat-mark)', 'var(--sat-pos)', 'var(--sat-neg)', 'var(--sat-warn)', 'var(--sat-muted)', 'var(--sat-text)', 'var(--sat-line-strong)'];

/** Stepped area chart of a cumulative value over time. */
export function StepChart({ points, height = 90, endTime }: { points: { t: number; v: number }[]; height?: number; endTime: number }) {
  const id = useId().replace(/:/g, '');
  const W = 400, H = height;
  if (points.length < 1) return null;
  const t0 = points[0].t;
  const t1 = Math.max(endTime, t0 + 60000);
  const vmax = Math.max(1, ...points.map((p) => p.v));
  const x = (t: number) => ((t - t0) / (t1 - t0)) * (W - 6) + 2;
  const y = (v: number) => H - 4 - (v / vmax) * (H - 14);
  let d = `M ${x(points[0].t)} ${y(points[0].v)}`;
  for (let i = 1; i < points.length; i++) d += ` H ${x(points[i].t)} V ${y(points[i].v)}`;
  d += ` H ${x(t1)}`;
  const area = `${d} V ${H} H ${x(points[0].t)} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--sat-accent)', stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: 'var(--sat-accent)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} />
      <path d={d} fill="none" style={{ stroke: 'var(--sat-accent)' }} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={x(t1)} cy={y(last.v)} r="3.5" style={{ fill: 'var(--sat-accent)' }} />
    </svg>
  );
}

/** Round tick values for an axis: a step of 1, 2, 2.5 or 5 times a power of ten, from at or below min to at or
    above max. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Short tick text: 1200 = 1.2k. */
function tickText(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${Number((a / 1000).toFixed(a >= 10000 ? 0 : 1))}k` : `${Number(a.toFixed(2))}`;
  return `${v < 0 ? '-' : ''}${s}`;
}

/** Game numbers to label along x: every game up to 6, else round steps. */
function indexTicks(n: number): number[] {
  if (n <= 6) return Array.from({ length: n }, (_, i) => i + 1);
  const step = [2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => n / s <= 5) ?? Math.ceil(n / 5);
  const out = step >= 5 ? [1] : [];
  for (let v = step; v <= n; v += step) out.push(v);
  return out;
}

/** The drawn width of a box, so chart text keeps its real size at every width. */
function useWidth(fallback = 340) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (v: number) => { if (v > 0) setW(Math.max(200, Math.round(v))); };
    read(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => read(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const TICK = { fontSize: 11, fill: 'var(--sat-muted)', fontVariantNumeric: 'tabular-nums' } as const;
const TITLE = { fontSize: 11, fontWeight: 600, fill: 'var(--sat-text)' } as const;

/** Multi-series line chart, x = game number (1 to n). Tick values on both axes, with an axis title on each:
    `xTitle` along the bottom and `yTitle` up the left side. */
export function LineChart({ series, height = 200, xTitle = 'Games', yTitle }: {
  series: { name: string; color: string; values: number[] }[]; height?: number; xTitle?: string; yTitle?: string;
}) {
  const [ref, W] = useWidth();
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (n === 0) return null;
  const H = height;
  const all = series.flatMap((s) => s.values);
  const yt = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const vmin = yt[0], vmax = yt[yt.length - 1];
  const span = vmax - vmin || 1;
  const longest = Math.max(...yt.map((v) => tickText(v).length));
  const padL = (yTitle ? 18 : 2) + longest * 6.6 + 6, padR = 10, padT = 8, padB = xTitle ? 36 : 20;
  const x = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - vmin) / span) * (H - padT - padB);
  const xt = indexTicks(n);
  return (
    <div ref={ref} className="felt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }} role="img"
        aria-label={`Line chart. ${xTitle} along the bottom, 1 to ${n}.${yTitle ? ` ${yTitle} up the side, ${tickText(vmin)} to ${tickText(vmax)}.` : ''}`}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} style={{ stroke: v === 0 ? 'var(--sat-line-strong)' : 'var(--sat-line)' }} strokeDasharray={v === 0 ? '4 4' : undefined} />
            <text x={padL - 6} y={y(v)} dy="0.35em" textAnchor="end" style={TICK}>{tickText(v)}</text>
          </g>
        ))}
        {xt.map((i) => (
          <text key={i} x={x(i - 1)} y={H - padB + 15} textAnchor={n > 1 && i === n ? 'end' : 'middle'} style={TICK}>{i}</text>
        ))}
        {xTitle && <text x={padL + (W - padL - padR) / 2} y={H - 4} textAnchor="middle" style={TITLE}>{xTitle}</text>}
        {yTitle && <text transform={`translate(11 ${padT + (H - padT - padB) / 2}) rotate(-90)`} textAnchor="middle" style={TITLE}>{yTitle}</text>}
        {series.map((s) => (
          <g key={s.name}>
            {n > 1 && <polyline fill="none" style={{ stroke: s.color }} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />}
            {s.values.length > 0 && <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r="3" style={{ fill: s.color }} />}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Horizontal diverging bars for net results. */
export function NetBars({ rows, format }: { rows: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="sat-split sat-small"><span>{r.label}</span><span className={`sat-num felt-${tone(r.value) || 'flat'}`} style={{ fontWeight: 700 }}>{format(r.value)}</span></div>
          <div style={{ display: 'flex', height: 8, marginTop: 5 }}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              {r.value < 0 && <div style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: 'var(--sat-neg)', borderRadius: '4px 0 0 4px' }} />}
            </div>
            <div style={{ width: 2, background: 'var(--sat-line-strong)' }} />
            <div style={{ flex: 1 }}>
              {r.value > 0 && <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: 'var(--sat-pos)', borderRadius: '0 4px 4px 0' }} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars for counts in a fixed order (one hue: the accent). Each row prints its own value, and a
    hover title repeats it. */
export function CountBars({ rows, unit, title }: { rows: { label: string; value: number }[]; unit: string; title?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="felt-bars" role="table" aria-label="Counts">
      <div className="felt-bars-row felt-bars-head" role="row">
        <span role="columnheader">{title}</span><span aria-hidden="true" /><span role="columnheader">{unit.charAt(0).toUpperCase() + unit.slice(1)}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="felt-bars-row" role="row" title={`${r.label}: ${r.value} ${unit}`}>
          <span className="felt-bars-label" role="rowheader">{r.label}</span>
          <span className="felt-bars-track" role="cell" aria-label={`${r.value} ${unit}`}>
            {r.value > 0 && <span className="felt-bars-bar" style={{ width: `${(r.value / max) * 100}%` }} />}
          </span>
          <span className="felt-bars-val sat-num" role="cell">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Back-to-back bars: losses to the left of the centre line, wins to the right, one row per source.
    Both sides share one scale. Values print beside the bars. */
export function BackToBack({ rows, format, unit }: { rows: { label: string; win: number; loss: number }[]; format: (v: number) => string; unit?: string }) {
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.win, r.loss]));
  const q = unit ? ` (${unit})` : '';
  return (
    <div className="felt-b2b" role="table" aria-label="Chips won and lost">
      <div className="felt-b2b-head" role="row"><span role="columnheader">Lost{q}</span><span /><span role="columnheader">Won{q}</span></div>
      {rows.map((r) => (
        <div key={r.label} className="felt-b2b-row" role="row">
          <span className="felt-b2b-side is-loss" role="cell" title={`${r.label}: lost ${format(r.loss)}`}>
            <span className="felt-b2b-val sat-num">{r.loss ? format(r.loss) : '-'}</span>
            {r.loss > 0 && <span className="felt-b2b-bar" style={{ width: `calc((100% - 52px) * ${r.loss / max})` }} />}
          </span>
          <span className="felt-b2b-label" role="rowheader">{r.label}</span>
          <span className="felt-b2b-side is-win" role="cell" title={`${r.label}: won ${format(r.win)}`}>
            {r.win > 0 && <span className="felt-b2b-bar" style={{ width: `calc((100% - 52px) * ${r.win / max})` }} />}
            <span className="felt-b2b-val sat-num">{r.win ? format(r.win) : '-'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
