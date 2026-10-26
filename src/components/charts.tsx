import { tone } from '../lib/format';
import { useId } from 'react';

export const SERIES_COLORS = ['var(--arcaen)', 'var(--aelum)', 'var(--vitalen)', 'var(--seal)', 'var(--somalen)', 'var(--ink-soft)', 'var(--edge-strong)', 'var(--ink)'];

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
          <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} />
      <path d={d} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={x(t1)} cy={y(last.v)} r="3.5" style={{ fill: 'var(--accent)' }} />
    </svg>
  );
}

/** Multi-series line chart, x = index. */
export function LineChart({ series, height = 180 }: {
  series: { name: string; color: string; values: number[] }[]; height?: number;
}) {
  const W = 400, H = height, padL = 4, padR = 4, padT = 10, padB = 10;
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (n === 0) return null;
  const all = series.flatMap((s) => s.values);
  const vmin = Math.min(0, ...all), vmax = Math.max(0, ...all);
  const span = vmax - vmin || 1;
  const x = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - vmin) / span) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} style={{ stroke: 'var(--edge-strong)' }} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {series.map((s) => (
        <polyline key={s.name} fill="none" style={{ stroke: s.color }} strokeWidth="2.2" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      ))}
    </svg>
  );
}

/** Horizontal diverging bars for net results. */
export function NetBars({ rows, format }: { rows: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="stack">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="row between small"><span>{r.label}</span><span className={`num ${tone(r.value)}`} style={{ fontWeight: 700 }}>{format(r.value)}</span></div>
          <div style={{ display: 'flex', height: 8, marginTop: 5 }}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              {r.value < 0 && <div style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: 'var(--down)', borderRadius: '4px 0 0 4px' }} />}
            </div>
            <div style={{ width: 2, background: 'var(--edge-strong)' }} />
            <div style={{ flex: 1 }}>
              {r.value > 0 && <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: 'var(--up)', borderRadius: '0 4px 4px 0' }} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
