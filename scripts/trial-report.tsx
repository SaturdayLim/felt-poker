/* Trial report pages (Night, Players, Compare), built from a Felt backup with the app's own logic,
   CSS and chart parts, for a layout review before they go into the app. Data stays in trial/. */
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/saturday/css/tokens.css';
import '../src/saturday/css/saturday.css';
import '../src/styles.css';
import './trial-report.css';
import { Caption, Cards, Info, SourceTip } from '../src/components/ui';
import { BackToBack, CountBars, NetBars } from '../src/components/charts';
import { money, units } from '../src/lib/format';
import { buildModel, type Pos, type TrialModel, type TrialPlayer } from './trial-model';

type View = 'night' | 'players' | 'compare';
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const signed = (v: number) => `${v > 0 ? '+' : ''}${units(v)}`;
const SOURCE = 'Felt backup of the game. Every hand logged street by street, 4 players.';

function App() {
  const [m, setM] = useState<TrialModel | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<View>('night');
  const [pid, setPid] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => {
    const src = new URLSearchParams(location.search).get('src') ?? '/trial/potato-backup.json';
    fetch(src).then((r) => r.json()).then((b) => setM(buildModel(b))).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="sat-small">Backup unable to load: {err}</p>;
  if (!m) return <p className="sat-small sat-muted" style={{ padding: 16 }}>Loading the backup.</p>;
  const sel = m.players.find((p) => p.id === pid) ?? [...m.players].sort((a, b) => b.net - a.net)[0];
  return (
    <div className="felt-app">
      <div className="felt-page trial">
        <header className="trial-head">
          <div>
            <div className="felt-header-title">{m.game}</div>
            <small className="sat-muted">{m.date}, {m.hands} hands in {m.minutes} min</small>
          </div>
          <div className="sat-seg" role="radiogroup" aria-label="Theme">
            <button role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
            <button role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          </div>
        </header>
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Report">
          {(['night', 'players', 'compare'] as View[]).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}>{v === 'night' ? 'The night' : v === 'players' ? 'Players' : 'Compare'}</button>
          ))}
        </div>
        {view === 'night' && <Night m={m} onPlayer={(id) => { setPid(id); setView('players'); }} />}
        {view === 'players' && <PlayerView m={m} p={sel} setPid={setPid} />}
        {view === 'compare' && <Compare m={m} />}
      </div>
    </div>
  );
}

/* ------------------------------- colours ------------------------------- */

/** Fixed player colour by seat (categorical slots 1 to 4), so a player keeps one colour on every chart. */
const colorOf = (m: TrialModel, name: string) => `var(--trial-s${(m.players.findIndex((p) => p.name === name) % 4) + 1})`;

function Legend({ m }: { m: TrialModel }) {
  return (
    <div className="trial-legend">
      {m.players.map((p) => <span key={p.id}><i style={{ background: colorOf(m, p.name) }} />{p.name}</span>)}
    </div>
  );
}

function Section({ title, tip, children, source = true }: { title: ReactNode; tip?: ReactNode; children: ReactNode; source?: boolean }) {
  return (
    <section className="sat-glass sat-card sat-stack" style={gap(3)}>
      <div className="sat-split"><h2 className="sat-h3">{title}</h2>{tip && <Info title="About this">{tip}</Info>}</div>
      {children}
      {source && <div className="felt-source"><SourceTip>{SOURCE}</SourceTip></div>}
    </section>
  );
}

/* ------------------------------- the night ------------------------------- */

function Night({ m, onPlayer }: { m: TrialModel; onPlayer: (id: string) => void }) {
  const ranked = [...m.players].sort((a, b) => b.net - a.net);
  const top = ranked[0];
  const big = m.biggest[0];
  // the largest drop from a peak to a later low, or rise from a low to a later peak
  const swing = m.players.map((p) => {
    const ln = p.line.slice(0, -1);
    let best = { size: 0, hi: 0, hiAt: 0 };
    ln.forEach((v, i) => { const after = Math.min(...ln.slice(i)); if (v - after > best.size) best = { size: v - after, hi: v, hiAt: i }; });
    return { p, ...best };
  }).sort((a, b) => b.size - a.size)[0];
  return (
    <div className="sat-stack" style={gap(4)}>
      <section className="sat-glass sat-card sat-stack" style={gap(3)}>
        <Caption>Result</Caption>
        <p className="trial-lead"><b>{top.name} won the night: {signed(top.net)} chips</b> ({money(top.money, m.currency, { sign: true })}).</p>
        <div className="sat-glass-2 felt-list">
          {ranked.map((p) => (
            <button key={p.id} className="felt-row" onClick={() => onPlayer(p.id)}>
              <i className="trial-dot" style={{ background: colorOf(m, p.name) }} />
              <span className="felt-row-main"><span className="felt-row-title">{p.name}</span><span className="felt-row-sub">{p.style}</span></span>
              <span className="trial-num"><b className={p.net >= 0 ? 'felt-up' : 'felt-down'}>{signed(p.net)}</b><small>{money(p.money, m.currency, { sign: true })}</small></span>
            </button>
          ))}
        </div>
      </section>

      <Section title="Stacks over the night" tip="Each player's stack after each hand, from the logged wagers, pots, the 2-7 bounty and chip moves. The last point is the final count. Hover or touch the chart for the values.">
        <p className="sat-small"><b>{swing.p.name} had the biggest swing:</b> {swing.hi} chips after hand {swing.hiAt}, {swing.p.line[swing.p.line.length - 1]} at the end.</p>
        <StackChart m={m} />
        <Legend m={m} />
      </Section>

      <Section title="How far hands went" tip="Hands that reached each street, out of all hands. Showdown: 2 or more players at the end.">
        <p className="sat-small"><b>Every hand saw a flop.</b> {m.multiway} of {m.hands} had 3 or more players, and {m.raisedPre} had a raise before the flop.</p>
        <CountBars unit="hands" rows={[
          { label: 'Flop', value: m.reach.flop }, { label: 'Turn', value: m.reach.turn },
          { label: 'River', value: m.reach.river }, { label: 'Showdown', value: m.reach.showdown },
        ]} />
      </Section>

      <Section title="Pots, hand by hand" tip="1 bar per hand, coloured by the winner. Grey: a split pot.">
        <p className="sat-small"><b>Biggest pot: hand {big.n}, {big.pot} chips</b> to {big.winners.join(' and ')}. Median pot {median(m.pots.map((p) => p.pot))} chips.</p>
        <PotBars m={m} />
        <Legend m={m} />
      </Section>

      <Section title="Biggest pots">
        <div className="sat-stack" style={gap(3)}>
          {m.biggest.map((h) => (
            <div key={h.n} className="trial-hand">
              <div className="sat-split"><b>Hand {h.n}</b><span className="sat-num"><b>{h.pot}</b> chips</span></div>
              <div className="sat-small sat-muted">{h.winners.join(' and ')} won</div>
              <div className="trial-board"><Cards cards={h.board} size="sm" /></div>
              {h.shown.map((s) => <div key={s.p} className="trial-shown"><span>{s.p}</span><Cards cards={s.cards} size="sm" /><span className="sat-small sat-muted">{s.rank}</span></div>)}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Side action" tip="Chips that moved outside the pots: 2-7 bounties and chip moves.">
        <div className="sat-stack" style={gap(2)}>
          {m.bounties.map((b) => <p key={b.n} className="sat-small"><b>2-7 bounty:</b> {b.to} collected {b.total} chips on hand {b.n}.</p>)}
          {m.moves.map((x, i) => <p key={i} className="sat-small"><b>Chip move:</b> {x.from} paid {x.to} {x.amount} chips after hand {x.afterN}{x.note ? ` (${x.note})` : ''}.</p>)}
        </div>
      </Section>

      <Section title="Pace" source={false}>
        <div className="sat-grid" style={{ ['--sat-min' as string]: '140px', ...gap(3) }}>
          <div className="sat-stat"><Caption>Per hand</Caption><span className="sat-kpi">{Math.floor(m.medianSec / 60)}m {m.medianSec % 60}s</span><span className="sat-note">Median</span></div>
          <div className="sat-stat"><Caption>Hands per hour</Caption><span className="sat-kpi">{Math.round(m.hands / (m.minutes / 60))}</span><span className="sat-note">{m.hands} hands, {m.minutes} min</span></div>
        </div>
      </Section>
    </div>
  );
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

/* ------------------------------- players ------------------------------- */

function PlayerView({ m, p, setPid }: { m: TrialModel; p: TrialPlayer; setPid: (id: string) => void }) {
  const s = p.s, st = s.style;
  const af = st.calls ? (st.betsRaises / st.calls).toFixed(1) : '-';
  const ch = (k: number) => `${k} ${k === 1 ? 'chance' : 'chances'}`;
  const tiles: { label: string; value: string; note: string; tip: string; n?: [number, number] }[] = [
    { label: 'VPIP', value: pct(s.vpip, s.logged), note: `${s.vpip} of ${s.logged} hands`, tip: 'Hands where the player put chips in before the flop by choice.' },
    { label: 'PFR', value: pct(s.pfr, s.logged), note: `${s.pfr} of ${s.logged} hands`, tip: 'Hands where the player raised before the flop.' },
    { label: 'Aggression', value: af, note: `${st.betsRaises} bets and raises, ${st.calls} calls`, tip: '(Bets + raises) / calls, after the flop. Above 1: bets more than calls.' },
    { label: '3-bet', value: pct(st.threeBet, st.threeBetOpp), note: `${st.threeBet} of ${ch(st.threeBetOpp)}`, tip: 'Re-raises before the flop against 1 raise.', n: [st.threeBet, st.threeBetOpp] },
    { label: 'C-bet', value: pct(st.cbet, st.cbetOpp), note: `${st.cbet} of ${ch(st.cbetOpp)}`, tip: 'Flop bets after making the last raise before the flop.', n: [st.cbet, st.cbetOpp] },
    { label: 'Fold to c-bet', value: pct(st.foldCbet, st.foldCbetOpp), note: `${st.foldCbet} of ${st.foldCbetOpp} faced`, tip: 'Folds to a continuation bet on the flop.', n: [st.foldCbet, st.foldCbetOpp] },
    { label: 'BB defend', value: pct(st.bbDefend, st.bbDefendOpp), note: `${st.bbDefend} of ${st.bbDefendOpp} raises`, tip: 'Calls or raises from the BB against a raise.', n: [st.bbDefend, st.bbDefendOpp] },
    { label: 'Steal', value: pct(st.steal, st.stealOpp), note: `${st.steal} of ${ch(st.stealOpp)}`, n: [st.steal, st.stealOpp], tip: 'Raises when all players before folded, from the button, the seat before it or the SB.' },
  ];
  const f = s.flow;
  return (
    <div className="sat-stack" style={gap(4)}>
      <div className="felt-scroll" role="radiogroup" aria-label="Player">
        {m.players.map((x) => <button key={x.id} className="sat-chip" role="radio" aria-checked={x.id === p.id} aria-pressed={x.id === p.id} onClick={() => setPid(x.id)}><i className="trial-dot" style={{ background: colorOf(m, x.name) }} /> {x.name}</button>)}
      </div>

      <section className="sat-glass sat-card sat-stack" style={gap(3)}>
        <div className="trial-who">
          <h2 className="sat-h2">{p.name}</h2>
          <span className="trial-net"><b className={p.net >= 0 ? 'felt-up' : 'felt-down'}>{signed(p.net)}</b> chips <span className="sat-muted">({money(p.money, m.currency, { sign: true })})</span></span>
          <span className="sat-small sat-muted">{p.style}</span>
        </div>
        <Caption>What stood out</Caption>
        <ol className="trial-insights">{p.insights.map((t) => <li key={t}>{t}</li>)}</ol>
        <div className="felt-source"><SourceTip>{SOURCE} Each finding needs at least 5 chances behind it.</SourceTip></div>
      </section>

      <Section title="Playing style" tip={`${s.logged} hands is a small sample. Treat the rates as a first read, not a verdict.`}>
        <div className="trial-tiles">
          {tiles.map((t) => {
            // under 5 chances a percentage misleads (1 of 1 = 100%): show the count and say so
            const few = t.n && t.n[1] < 5;
            return (
              <div key={t.label} className={`sat-stat trial-tile ${few ? 'is-few' : ''}`}>
                <span className="sat-caption">{t.label} <Info title={t.label}>{t.tip}</Info></span>
                <span className="sat-kpi">{few ? `${t.n![0]} of ${t.n![1]}` : t.value}</span>
                <span className="sat-note">{few ? 'Too few to rate' : t.note}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Style map" tip="Across: how many hands the player plays (VPIP). Up: how often the player bets or raises after the flop instead of calling (aggression). The dashed lines are the table averages.">
        <StyleMap m={m} focus={p} />
      </Section>

      <Section title="Stack over the night" tip="Stack after each hand. The other players are in grey.">
        <StackChart m={m} focus={p} />
      </Section>

      <Section title="Where hands were won" tip="Pre-flop to River: all others folded on that street. Showdown: 2 or more players at the end.">
        <p className="sat-small"><b>Showdown = {s.wonAt.showdown} of {Object.values(s.wonAt).reduce((a, b) => a + b, 0)} hands won.</b> All others folded in the rest.</p>
        <CountBars unit="hands" rows={[
          { label: 'Pre-flop', value: s.wonAt.preflop }, { label: 'Flop', value: s.wonAt.flop }, { label: 'Turn', value: s.wonAt.turn },
          { label: 'River', value: s.wonAt.river }, { label: 'Showdown', value: s.wonAt.showdown },
        ]} />
      </Section>

      <Section title="Chips won and lost" tip="Folds: won when all others folded, or lost in hands folded after putting chips in. Showdown: hands that went to showdown. Others: 2-7 bounties and chip moves. Net per hand.">
        <BackToBack format={(v) => units(v)} rows={[
          { label: 'Folds', win: f.winFold, loss: f.lossFold },
          { label: 'Showdown', win: f.winShowdown, loss: f.lossShowdown },
          { label: 'Others', win: f.winOther, loss: f.lossOther },
        ]} />
      </Section>

      <Section title="Result by seat" tip="Net chips by position at the table. With 4 players, UTG is also the seat before the button.">
        <NetBars format={(v) => signed(v)} rows={(['BTN', 'SB', 'BB', 'UTG'] as Pos[]).map((k) => ({ label: `${k}, ${p.byPosN[k]} hands`, value: p.byPos[k] }))} />
      </Section>

      <Section title={`Cards shown (${p.shown.length})`} tip="Hands where the player's cards were entered at showdown.">
        <div className="sat-glass-2 felt-list">
          {p.shown.map((h) => (
            <div key={h.n} className="felt-row">
              <span className="sat-mono sat-small sat-muted" style={{ width: 22 }}>{h.n}</span>
              <Cards cards={h.cards} size="sm" />
              <span className="felt-row-main"><span className="felt-row-sub">{h.rank || 'No full board'}</span></span>
              <span className={`sat-small ${h.won ? 'felt-up' : 'sat-muted'}`}>{h.won ? 'Won' : 'Lost'} {h.pot}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Count check" tip="Final chip count against the stack estimate from the log. A gap means a wager was logged differently from play, or a chip move is missing.">
        <p className="sat-small"><b>Count {p.count}, estimate {p.estimate}</b>{p.off ? `: ${Math.abs(p.off)} chips ${p.off > 0 ? 'above' : 'below'}.` : ': a match.'}</p>
      </Section>
    </div>
  );
}

/* ------------------------------- compare ------------------------------- */

function Compare({ m }: { m: TrialModel }) {
  // a rate with fewer than 5 chances shows its count instead, muted
  const rate = (a: number, b: number) => (!b ? "-" : b < 5 ? `${a}/${b}` : pct(a, b));
  const fewOf = (_a: number, b: number) => b < 5 && b > 0;
  const rows: { label: string; v: (p: TrialPlayer) => number; fmt: (p: TrialPlayer) => string; few?: (p: TrialPlayer) => boolean; high?: 'max' | 'min' }[] = [
    { label: 'Net chips', v: (p) => p.net, fmt: (p) => signed(p.net), high: 'max' },
    { label: 'VPIP', v: (p) => p.s.vpip / (p.s.logged || 1), fmt: (p) => pct(p.s.vpip, p.s.logged) },
    { label: 'PFR', v: (p) => p.s.pfr / (p.s.logged || 1), fmt: (p) => pct(p.s.pfr, p.s.logged) },
    { label: 'Aggression', v: (p) => (p.s.style.calls ? p.s.style.betsRaises / p.s.style.calls : 0), fmt: (p) => (p.s.style.calls ? (p.s.style.betsRaises / p.s.style.calls).toFixed(1) : '-'), high: 'max' },
    { label: 'C-bet', v: (p) => p.s.style.cbet / (p.s.style.cbetOpp || 1), fmt: (p) => rate(p.s.style.cbet, p.s.style.cbetOpp), few: (p) => fewOf(p.s.style.cbet, p.s.style.cbetOpp) },
    { label: 'Fold to c-bet', v: (p) => p.s.style.foldCbet / (p.s.style.foldCbetOpp || 1), fmt: (p) => rate(p.s.style.foldCbet, p.s.style.foldCbetOpp), few: (p) => fewOf(p.s.style.foldCbet, p.s.style.foldCbetOpp) },
    { label: 'Went to showdown', v: (p) => p.s.wtsd / (p.s.sawFlop || 1), fmt: (p) => pct(p.s.wtsd, p.s.sawFlop) },
    { label: 'Won at showdown', v: (p) => p.s.wsd / (p.s.wtsd || 1), fmt: (p) => pct(p.s.wsd, p.s.wtsd), high: 'max' },
    { label: 'Hands won', v: (p) => p.s.handsWon, fmt: (p) => String(p.s.handsWon), high: 'max' },
  ];
  return (
    <Section title="Side by side" tip="Each column is a player. Bold: the best value in rows where higher is better. A count such as 1/1 means fewer than 5 chances, too few to rate.">
      <div className="trial-table-wrap">
        <table className="trial-table">
          <thead><tr><th />{m.players.map((p) => <th key={p.id}><i className="trial-dot" style={{ background: colorOf(m, p.name) }} />{p.name}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const top = r.high ? Math.max(...m.players.map(r.v)) : null;
              return <tr key={r.label}><th>{r.label}</th>{m.players.map((p) => <td key={p.id} className={`${top !== null && r.v(p) === top ? 'is-best' : ''} ${r.few?.(p) ? 'is-few' : ''}`}>{r.fmt(p)}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ------------------------------- charts ------------------------------- */

/** Stacks after each hand, 1 line per player. With `focus`, that player is in colour and the rest in grey.
    Hover or touch shows each stack at that hand. */
function StackChart({ m, focus }: { m: TrialModel; focus?: TrialPlayer }) {
  const W = 360, H = 200, L = 34, R = 56, T = 10, B = 22;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = m.players[0].line.length;
  const all = m.players.flatMap((p) => p.line);
  const lo = Math.floor(Math.min(...all) / 50) * 50, hi = Math.ceil(Math.max(...all) / 50) * 50;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = Array.from({ length: (hi - lo) / 50 + 1 }, (_, i) => lo + i * 50);
  const order = focus ? [...m.players.filter((p) => p !== focus), focus] : m.players;
  // end labels: nudge apart so they never overlap
  const ends = order.map((p) => ({ p, y: y(p.line[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const i = Math.round((((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div className="trial-chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Stacks after each hand" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === 200 ? 'trial-grid is-base' : 'trial-grid'} />
            <text x={L - 6} y={y(t) + 4} className="trial-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {[0, 10, 20].filter((i) => i < n - 1).map((i) => <text key={i} x={x(i)} y={H - 6} className="trial-axis" textAnchor="middle">{i === 0 ? 'Start' : `Hand ${i}`}</text>)}
        <text x={x(n - 1)} y={H - 6} className="trial-axis" textAnchor="middle">Count</text>
        <line x1={x(n - 2)} x2={x(n - 2)} y1={T} y2={H - B} className="trial-grid" />
        {order.map((p) => (
          <polyline key={p.id} fill="none" strokeWidth={focus && p !== focus ? 1.5 : 2} strokeLinejoin="round"
            style={{ stroke: focus && p !== focus ? 'var(--sat-line-strong)' : colorOf(m, p.name) }}
            points={p.line.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
        {ends.map(({ p, y: ly }) => (
          <text key={p.id} x={W - R + 6} y={ly + 4} className="trial-endlabel" style={{ fill: focus && p !== focus ? 'var(--sat-muted)' : 'var(--sat-text)' }}>{p.name} {p.line[n - 1]}</text>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="trial-cross" />
            {order.map((p) => <circle key={p.id} cx={x(hover)} cy={y(p.line[hover])} r={4} style={{ fill: focus && p !== focus ? 'var(--sat-muted)' : colorOf(m, p.name), stroke: 'var(--sat-solid-1)' }} strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="trial-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{hover === 0 ? 'Start' : hover === n - 1 ? 'Final count' : `After hand ${hover}`}</b>
          {[...m.players].sort((a, b) => b.line[hover] - a.line[hover]).map((p) => <span key={p.id}><i className="trial-dot" style={{ background: colorOf(m, p.name) }} />{p.name} {p.line[hover]}</span>)}
        </div>
      )}
    </div>
  );
}

/** 1 bar per hand, height = pot, colour = winner (grey for a split). */
function PotBars({ m }: { m: TrialModel }) {
  const W = 360, H = 120, B = 18, max = Math.max(...m.pots.map((p) => p.pot));
  const bw = W / m.pots.length;
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? m.pots[hover] : null;
  return (
    <div className="trial-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Pot size of each hand" onPointerLeave={() => setHover(null)}>
        {m.pots.map((p, i) => {
          const bh = (p.pot / max) * (H - B - 4);
          return (
            <g key={p.n} onPointerEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H - B} fill="transparent" />
              <rect x={i * bw + 1} y={H - B - bh} width={bw - 2} height={bh} rx={2}
                style={{ fill: p.winners.length > 1 ? 'var(--sat-line-strong)' : colorOf(m, p.winners[0]), opacity: hover === null || hover === i ? 1 : 0.45 }} />
            </g>
          );
        })}
        {[1, 10, 20, 30].map((n) => <text key={n} x={(n - 0.5) * bw} y={H - 4} className="trial-axis" textAnchor="middle">{n}</text>)}
      </svg>
      {h && <div className="trial-tip" style={{ left: `${((hover! + 0.5) / m.pots.length) * 100}%` }}><b>Hand {h.n}: {h.pot} chips</b><span>{h.winners.join(' and ')}</span></div>}
    </div>
  );
}

/** VPIP across, aggression up; dashed lines at the table averages. */
function StyleMap({ m, focus }: { m: TrialModel; focus: TrialPlayer }) {
  const W = 360, H = 220, L = 34, R = 14, T = 14, B = 30;
  const pts = m.players.map((p) => ({ p, vx: (p.s.vpip / (p.s.logged || 1)) * 100, vy: p.s.style.calls ? p.s.style.betsRaises / p.s.style.calls : 0 }));
  const x0 = Math.floor(Math.min(...pts.map((q) => q.vx)) / 10) * 10 - 5, x1 = 100;
  const y1 = Math.ceil(Math.max(2, ...pts.map((q) => q.vy)) * 1.1 * 2) / 2;
  const xt = Array.from({ length: 10 }, (_, i) => i * 10).filter((v) => v > x0 && v <= x1);
  const yt = Array.from({ length: Math.floor(y1) + 1 }, (_, i) => i);
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / y1) * (H - T - B);
  const ax = pts.reduce((a, q) => a + q.vx, 0) / pts.length, ay = pts.reduce((a, q) => a + q.vy, 0) / pts.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Style map: VPIP against aggression">
      {xt.map((v) => <text key={v} x={x(v)} y={H - B + 12} textAnchor="middle" className="trial-axis">{v}%</text>)}
      {yt.map((v) => <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end" className="trial-axis">{v}</text>)}
      <line x1={x(ax)} x2={x(ax)} y1={T} y2={H - B} className="trial-cross" />
      <line x1={L} x2={W - R} y1={y(ay)} y2={y(ay)} className="trial-cross" />
      <text x={W - R} y={T + 10} textAnchor="end" className="trial-axis">Looser, more aggressive</text>
      <text x={L + 4} y={H - B - 6} className="trial-axis">Tighter, more passive</text>
      <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" className="trial-axis">VPIP (% of hands played)</text>
      <text x={10} y={(T + H - B) / 2} textAnchor="middle" className="trial-axis" transform={`rotate(-90 10 ${(T + H - B) / 2})`}>Aggression</text>
      {pts.map(({ p, vx, vy }) => (
        <g key={p.id}>
          <circle cx={x(vx)} cy={y(vy)} r={p === focus ? 8 : 6} style={{ fill: p === focus ? colorOf(m, p.name) : 'var(--sat-line-strong)', stroke: 'var(--sat-solid-1)' }} strokeWidth={2}>
            <title>{`${p.name}: VPIP ${Math.round(vx)}%, aggression ${vy.toFixed(1)}`}</title>
          </circle>
          <text x={x(vx)} y={y(vy) - 12} textAnchor="middle" className="trial-endlabel" style={{ fill: p === focus ? 'var(--sat-text)' : 'var(--sat-muted)' }}>{p.name}</text>
        </g>
      ))}
    </svg>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
