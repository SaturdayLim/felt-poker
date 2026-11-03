/* The standing candle. Body: between two current figures. Wicks: taper to a point at the record low and high.
   Every candle on a screen shares one scale, so the table's record low and high fill the width. */

const W = 340, PAD = 38, CY = 44, H = 84, BODY = 22;

export interface CandleScale { lo: number; hi: number }

export function candleScale(values: number[]): CandleScale {
  return { lo: Math.min(0, ...values), hi: Math.max(0, ...values) };
}

const num = (n: number) => String(Math.round(n));

/** `mark` shows a coral triangle over that end of the body: the player's own position. */
export function Candle({ scale, low, high, from, to, mark, tone = 'blue', label }: {
  scale: CandleScale; low: number; high: number; from: number; to: number; mark?: number; tone?: 'blue' | 'coral'; label: string;
}) {
  const flat = low === 0 && high === 0 && from === 0 && to === 0;
  const span = scale.hi - scale.lo;
  const x = (v: number) => (span ? PAD + ((v - scale.lo) / span) * (W - PAD * 2) : W / 2);
  const x0 = x(0);
  if (flat) {
    return (
      <svg className="felt-candle" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: 0`}>
        <line x1={W / 2} x2={W / 2} y1={CY - 16} y2={CY + 16} className="felt-candle-start" />
        <polygon points={`${W / 2 - 6},${CY - 26} ${W / 2 + 6},${CY - 26} ${W / 2},${CY - 18}`} className="felt-candle-mark" />
        <text x={W / 2} y={CY - 30} textAnchor="middle" className="is-strong">0</text>
        <text x={W / 2} y={CY + 30} textAnchor="middle">0</text>
        <text x={W / 2 - 10} y={CY + 4} textAnchor="end">0</text>
        <text x={W / 2 + 10} y={CY + 4} textAnchor="start">0</text>
      </svg>
    );
  }
  const a = x(Math.min(from, to)), b = x(Math.max(from, to));
  const half = BODY / 2 - 3;
  return (
    <svg className="felt-candle" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: low ${num(low)}, high ${num(high)}, now ${num(to)}`}>
      {x(low) < a && <polygon points={`${a},${CY - half} ${x(low)},${CY} ${a},${CY + half}`} className="felt-candle-wick" />}
      {x(high) > b && <polygon points={`${b},${CY - half} ${x(high)},${CY} ${b},${CY + half}`} className="felt-candle-wick" />}
      <rect x={a} width={Math.max(2, b - a)} y={CY - BODY / 2} height={BODY} rx={4} className={`felt-candle-body is-${tone}`} />
      <line x1={x0} x2={x0} y1={CY - 16} y2={CY + 16} className="felt-candle-start" />
      <text x={x0} y={CY + 30} textAnchor="middle">0</text>
      <text x={x(low) - 5} y={CY + 4} textAnchor="end">{num(low)}</text>
      <text x={x(high) + 5} y={CY + 4} textAnchor="start">{num(high)}</text>
      {mark !== undefined && (
        <>
          <polygon points={`${x(mark) - 6},${CY - 26} ${x(mark) + 6},${CY - 26} ${x(mark)},${CY - 18}`} className="felt-candle-mark" />
          <text x={x(mark)} y={CY - 30} textAnchor="middle" className="is-strong">{num(mark)}</text>
        </>
      )}
      {mark === undefined && (
        <>
          {from !== 0 && <text x={x(from)} y={CY - 18} textAnchor="middle" className="is-strong">{num(from)}</text>}
          {to !== 0 && to !== from && <text x={x(to)} y={CY - 18} textAnchor="middle" className="is-strong">{num(to)}</text>}
        </>
      )}
    </svg>
  );
}
