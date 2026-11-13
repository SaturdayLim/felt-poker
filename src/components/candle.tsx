/* The standing chart. The player's candle sits above a faded table candle, on one scale, so the table reads as the
   reference for the player. Body: between two current figures. Wick: a straight line to the low and high of the session.
   Each low and high figure sits at the outer end of its wick, and the 0 line is labelled, so the chart reads with no tip open. */

const W = 340, PAD = 46;

export interface TableCandle { low: number; high: number; from: number; to: number }
export interface MyCandle { low: number; high: number; now: number }

const num = (n: number) => String(Math.round(n));

export function StandingChart({ table, mine }: { table: TableCandle; mine?: MyCandle }) {
  const lo = Math.min(0, table.low, mine?.low ?? 0), hi = Math.max(0, table.high, mine?.high ?? 0);
  const x = (v: number) => (hi > lo ? PAD + ((v - lo) / (hi - lo)) * (W - PAD * 2) : W / 2);
  const yMine = 44, yTable = mine ? 90 : 34, H = yTable + 40;
  const a = x(Math.min(table.from, table.to)), b = x(Math.max(table.from, table.to));
  const m0 = mine ? x(Math.min(0, mine.now)) : 0, m1 = mine ? x(Math.max(0, mine.now)) : 0;
  const label = `Table: low ${num(table.low)}, high ${num(table.high)}.${mine ? ` You: low ${num(mine.low)}, high ${num(mine.high)}, now ${num(mine.now)}.` : ''}`;
  return (
    <svg className="felt-candle" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <g className={mine ? 'felt-candle-ref' : undefined}>
        <line x1={x(table.low)} x2={x(table.high)} y1={yTable} y2={yTable} className="felt-candle-wick" />
        <rect x={a} width={Math.max(2, b - a)} y={yTable - 7} height={14} rx={3} className="felt-candle-body is-blue" />
        <text x={x(table.low) - 6} y={yTable + 4} textAnchor="end" className="felt-candle-low">{num(table.low)}</text>
        <text x={x(table.high) + 6} y={yTable + 4} textAnchor="start" className="felt-candle-high">{num(table.high)}</text>
      </g>
      <line x1={x(0)} x2={x(0)} y1={mine ? yMine - 16 : yTable - 16} y2={yTable + 14} className="felt-candle-start" />
      <text x={x(0)} y={yTable + 32} textAnchor="middle" className="felt-candle-zero">0</text>
      {mine && (
        <>
          <line x1={x(mine.low)} x2={x(mine.high)} y1={yMine} y2={yMine} className="felt-candle-wick is-mine" />
          <rect x={m0} width={Math.max(2, m1 - m0)} y={yMine - 11} height={22} rx={4} className={`felt-candle-body ${mine.now < 0 ? 'is-coral' : 'is-blue'}`} />
          <text x={x(mine.low) - 6} y={yMine + 4} textAnchor="end" className="felt-candle-low">{num(mine.low)}</text>
          <text x={x(mine.high) + 6} y={yMine + 4} textAnchor="start" className="felt-candle-high">{num(mine.high)}</text>
          <polygon points={`${x(mine.now) - 6},${yMine - 26} ${x(mine.now) + 6},${yMine - 26} ${x(mine.now)},${yMine - 18}`} className="felt-candle-mark" />
          <text x={x(mine.now)} y={yMine - 30} textAnchor="middle" className="is-strong">{num(mine.now)}</text>
        </>
      )}
    </svg>
  );
}
