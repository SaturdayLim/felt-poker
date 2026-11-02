/* Trial report pages (Game Summary, Players, Compare), built from a Felt backup with the app's own logic,
   CSS and chart parts, for a layout review before they go into the app. Data stays in trial/.
   Review rules: chips only (no money, no unit word); graphics before words; a number never runs straight
   into a word ("Flop (33)", "Bel: +78"); every tip line on its own line; legends where a colour is not
   named in the chart; sections in game order.
   Two modes:
   - Host view: opened from the dev server with a backup (?src=...). Every player is open.
   - Shared report: one HTML file with the data inside (#felt-report). Game Summary and Compare are open to
     everyone; each player page opens only with that player's code (see trial-lock.ts). */
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/saturday/css/tokens.css';
import '../src/saturday/css/saturday.css';
import '../src/styles.css';
import './trial-report.css';
import { Cards, Icon, Info } from '../src/components/ui';
import { BackToBack, CountBars } from '../src/components/charts';
import { units } from '../src/lib/format';
import { AWARD_LIST, buildModel, type Award, type Pos, type TrialModel, type TrialPlayer } from '../src/report/model';
import { unlock, type LockBox } from '../src/report/lock';

type View = 'summary' | 'players' | 'compare';
interface ReportFile { model: TrialModel; locks: Record<string, LockBox> }
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const signed = (v: number) => `${v > 0 ? '+' : ''}${units(Math.round(v))}`;
const tone = (v: number) => (v > 0 ? 'felt-up' : v < 0 ? 'felt-down' : '');

/** Info tip with one line per entry (standing rule: separate lines, never one run-on paragraph). */
function Tip({ title, lines }: { title: string; lines: string[] }) {
  return <Info title={title}>{lines.map((l) => <span key={l} className="felt-tip-line">{l}</span>)}</Info>;
}

function App() {
  const [m, setM] = useState<TrialModel | null>(null);
  const [locks, setLocks] = useState<Record<string, LockBox> | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<View>('summary');
  const [pid, setPid] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => {
    const inline = document.getElementById('felt-report')?.textContent;
    if (inline) { const r = JSON.parse(inline) as ReportFile; setM(r.model); setLocks(r.locks); return; }
    const src = new URLSearchParams(location.search).get('src') ?? '/trial/potato-backup.json';
    fetch(src).then((r) => r.json()).then((b) => (b.model ? (setM(b.model), setLocks(b.locks)) : setM(buildModel(b)))).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="sat-small">Report unable to load: {err}</p>;
  if (!m) return <p className="sat-small sat-muted" style={{ padding: 16 }}>Loading the report.</p>;
  const sel = m.players.find((p) => p.id === pid) ?? [...m.players].sort((a, b) => b.net - a.net)[0];
  const open = (id: string) => { setPid(id); setView('players'); window.scrollTo(0, 0); };
  const unlocked = (p: TrialPlayer) => setM({ ...m, players: m.players.map((x) => (x.id === p.id ? { ...p, locked: false } : x)) });
  return (
    <div className="felt-app">
      <div className="felt-page trial">
        <header className="trial-head">
          <div>
            <div className="felt-header-title">{m.game}</div>
            <small className="sat-muted">{m.date}, {m.hands} {m.hands === 1 ? 'hand' : 'hands'}, {m.minutes} min</small>
          </div>
          <div className="sat-seg" role="radiogroup" aria-label="Theme">
            <button role="radio" aria-checked={theme === 'dark'} aria-label="Dark" onClick={() => setTheme('dark')}><Icon name="moon" size={16} /></button>
            <button role="radio" aria-checked={theme === 'light'} aria-label="Light" onClick={() => setTheme('light')}><Icon name="sun" size={16} /></button>
          </div>
        </header>
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Report">
          {(['summary', 'players', 'compare'] as View[]).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}>{v === 'summary' ? 'Game Summary' : v === 'players' ? 'Players' : 'Compare'}</button>
          ))}
        </div>
        {view === 'summary' && <Summary m={m} onPlayer={open} />}
        {view === 'players' && (
          <>
            <PlayerChips m={m} p={sel} setPid={setPid} />
            {sel.locked && locks?.[sel.id] ? <PlayerLock p={sel} box={locks[sel.id]} onOpen={unlocked} /> : <PlayerView m={m} p={sel} />}
          </>
        )}
        {view === 'compare' && <Compare m={m} onPlayer={open} />}
      </div>
    </div>
  );
}

/* ------------------------------- shared parts ------------------------------- */

/** Fixed player colour by seat order (categorical slots 1 to 4): one colour per player on every chart. */
const colorOf = (m: TrialModel, id: string) => `var(--trial-s${(m.players.findIndex((p) => p.id === id || p.name === id) % 4) + 1})`;
const Dot = ({ m, id }: { m: TrialModel; id: string }) => <i className="trial-dot" style={{ background: colorOf(m, id) }} />;

function Section({ title, tip, children }: { title: ReactNode; tip?: string[]; children: ReactNode }) {
  return (
    <section className="sat-glass sat-card sat-stack" style={gap(3)}>
      <div className="sat-split"><h2 className="sat-h3">{title}</h2>{tip && <Tip title={String(title)} lines={tip} />}</div>
      {children}
    </section>
  );
}

function Legend({ m }: { m: TrialModel }) {
  return <div className="trial-legend">{m.players.map((p) => <span key={p.id}><Dot m={m} id={p.id} />{p.name}</span>)}</div>;
}

/** A table award: trophy, title and winner. Expanding it shows one sentence with the figures behind it. */
function AwardCard({ m, a, showWho = true }: { m: TrialModel; a: Award; showWho?: boolean }) {
  const [open, setOpen] = useState(false);
  const who = a.to.map((id) => m.players.find((p) => p.id === id)?.name).join(' and ');
  return (
    <div className={`trial-award ${open ? 'is-open' : ''}`}>
      <button type="button" className="trial-award-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="trial-award-icon"><Icon name="trophy" size={18} /></span>
        <span className="trial-award-title"><b>{a.title}</b>{showWho && <span className="sat-muted">{who}</span>}</span>
        <span className="trial-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
      </button>
      {open && <p className="trial-award-body">{a.detail}</p>}
    </div>
  );
}

/** The virtual felt: a pill-shaped table with a cushioned rail, a soft drop shadow and textured cloth.
    Seats sit around it, the first at 12 o'clock and the rest clockwise. A seat shows its name, an optional
    small line under it, and its +/- result at the top right. */
function FeltTable({ m, seats, center }: { m: TrialModel; seats: { id: string; label: string; value: number; sub?: string; onClick?: () => void }[]; center?: ReactNode }) {
  const n = seats.length;
  return (
    <div className="trial-felt-wrap" role="list">
      <div className="trial-felt"><div className="trial-felt-cloth">{center}</div></div>
      {seats.map((s, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const color = m.players.some((p) => p.id === s.id) ? colorOf(m, s.id) : undefined;
        return (
          <button type="button" key={s.id} role="listitem" className="trial-seat" onClick={s.onClick} disabled={!s.onClick}
            style={{ left: `${50 + Math.cos(a) * 44}%`, top: `${50 + Math.sin(a) * 40}%`, ...(color ? { ['--seat' as string]: color } : {}) }}>
            <span className="trial-seat-name">{s.label}</span>
            {s.sub && <small className="trial-seat-sub">{s.sub}</small>}
            <sup className={`trial-seat-val ${tone(s.value)}`}>{signed(s.value)}</sup>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- game summary ------------------------------- */

function Summary({ m, onPlayer }: { m: TrialModel; onPlayer: (id: string) => void }) {
  const top = [...m.players].sort((a, b) => b.net - a.net)[0];
  const big = m.biggest[0];
  return (
    <div className="sat-stack" style={gap(4)}>
      <section className="sat-glass sat-card sat-stack" style={gap(3)}>
        <p className="trial-lead">Winner: <b>{top.name}</b> <b className="felt-up">({signed(top.net)})</b></p>
        <FeltTable m={m} center={<span className="trial-felt-mark">Hands ({m.hands})</span>}
          seats={[...m.players].sort((a, b) => a.seat - b.seat).map((p) => ({ id: p.id, label: p.name, value: p.net, onClick: () => onPlayer(p.id) }))} />
      </section>

      <Section title="Awards" tip={['The best player in each category wins, once past the minimum. A tie shares it. Tap an award for the figures.', ...AWARD_LIST.map((a) => `${a.title}: ${a.best}. Minimum: ${a.min}.`)]}>
        <div className="trial-awards">{m.awards.map((a) => <AwardCard key={a.title} m={m} a={a} />)}</div>
      </Section>

      <Section title="Stack Size" tip={['Result against par after each hand.', 'Par (0) = the chips a player bought so far.', 'Circle on a line = a rebuy. The number counts rebuys so far, each the size of the first buy-in. Par rises, so the line stays level.', 'The last point uses the final count.']}>
        <StackChart m={m} />
      </Section>

      <Section title="Swings" tip={['Every player starts at 0 (par).', 'Thin line = lowest to highest point of the game.', 'Thick bar = the final result.']}>
        <Swings m={m} />
      </Section>

      <Section title="Style Map" tip={['Across = VPIP: share of hands played.', 'Up = aggression: bets and raises against calls after the flop.', 'Dashed lines = table averages.', `Grey dot = target for ${m.players4} players. A guide, not an exact answer.`]}>
        <StyleMap m={m} />
      </Section>

      <Section title="Hand Progression" tip={['Hands that reached each stage.', 'Each stage includes the stages after it: a hand that saw the river also saw the turn.']}>
        <Funnel m={m} />
      </Section>

      <Section title="Pots by Hand" tip={['Sizes of each pot won throughout the session', 'Taller bars = bigger pots', 'Colour = player (grey = split pot)']}>
        <p className="sat-small"><b>Biggest: {big.pot}</b> (hand #{big.n}, {big.winners.join(' and ')}). Median: {median(m.pots.map((p) => p.pot))}.</p>
        <PotBars m={m} />
        <Legend m={m} />
      </Section>

      <Section title="Biggest Pots">
        <div className="sat-stack" style={gap(3)}>
          {m.biggest.map((h) => (
            <div key={h.n} className="trial-hand">
              <div className="sat-split"><span><b>#{h.n}</b> <span className="sat-muted">{h.winners.join(' and ')}</span></span><b className="sat-num">{h.pot}</b></div>
              <Cards cards={h.board} size="sm" />
              {h.shown.map((s) => (
                <div key={s.p} className={`trial-shown ${h.winners.includes(s.p) ? 'is-won' : ''}`}>
                  <span><Dot m={m} id={s.p} />{s.p}</span><Cards cards={s.cards} size="sm" /><span className="sat-small sat-muted">{s.rank}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Side Action" tip={['Chips that moved outside the pots.', '2-7 = 2-7 bounty.', 'Move = chip move (side bet, tip).']}>
        <div className="sat-glass-2 felt-list">
          {m.bounties.map((b) => <div key={`b${b.n}`} className="felt-row"><span className="trial-tag">2-7</span><span className="felt-row-main">{b.to}, hand #{b.n}</span><b className="felt-up">+{b.total}</b></div>)}
          {m.moves.map((x, i) => <div key={`m${i}`} className="felt-row"><span className="trial-tag">Move</span><span className="felt-row-main">{x.from} to {x.to}, after hand #{x.afterN}{x.note ? <span className="felt-row-sub">{x.note}</span> : null}</span><b>{x.amount}</b></div>)}
        </div>
      </Section>
      <Section title="House Rules" tip={['The rules this game used.', 'Set in New Game or the game settings.']}>
        <div className="sat-glass-2 felt-list">
          {m.rules.map((r) => <div key={r.label} className="felt-row"><span className="felt-row-main" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{r.label}</span><span className="sat-small" style={{ textAlign: 'right', flex: '1 1 auto', minWidth: 0 }}>{r.value}</span></div>)}
        </div>
      </Section>

      <Section title="Settle Up" tip={['Smallest set of payments that closes every account.', 'Chips, before any money rate.', 'Copy puts the list on your clipboard.']}>
        <div className="sat-glass-2 felt-list">
          {m.settle.length === 0 && <div className="felt-row"><span className="felt-row-main">All square.</span></div>}
          {m.settle.map((t, i) => <div key={i} className="felt-row"><span className="felt-row-main">{t.from} pays {t.to}</span><b className="sat-num">{t.amount}</b></div>)}
        </div>
        {m.settle.length > 0 && <CopyButton text={[`${m.game}, ${m.date}`, ...m.settle.map((t) => `${t.from} pays ${t.to} ${t.amount} chips`)].join(String.fromCharCode(10))} />}
      </Section>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    setDone(true); setTimeout(() => setDone(false), 1800);
  };
  return <button type="button" className="sat-btn" onClick={copy}><Icon name="file" /> {done ? 'Copied' : 'Copy payments'}</button>;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

/* ------------------------------- players ------------------------------- */

function PlayerChips({ m, p, setPid }: { m: TrialModel; p: TrialPlayer; setPid: (id: string) => void }) {
  return (
    <div className="trial-chips" role="radiogroup" aria-label="Player">
      {m.players.map((x) => (
        <button key={x.id} className="sat-chip" role="radio" aria-checked={x.id === p.id} aria-pressed={x.id === p.id} onClick={() => setPid(x.id)}>
          <Dot m={m} id={x.id} />{x.name}{x.locked && <LockMark />}
        </button>
      ))}
    </div>
  );
}

/** Small padlock beside a locked player's name. */
const LockMark = () => (
  <svg className="trial-lock-mark" viewBox="0 0 16 16" width="12" height="12" aria-label="Locked" role="img">
    <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/** A locked player page: the player types the code the host sent them. A wrong code opens nothing. */
function PlayerLock({ p, box, onOpen }: { p: TrialPlayer; box: LockBox; onOpen: (p: TrialPlayer) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const go = async () => {
    setBusy(true); setBad(false);
    try { onOpen(await unlock<TrialPlayer>(box, code)); } catch { setBad(true); } finally { setBusy(false); }
  };
  return (
    <section className="sat-glass sat-card sat-stack trial-lock" style={gap(3)}>
      <h2 className="sat-h2">{p.name}</h2>
      <p className="sat-small sat-muted">Enter player code to access player stats.</p>
      <div className="sat-field">
        <label htmlFor="code">Player code <Tip title="Player code" lines={['Each player has a 6-character code, in their player settings in Felt.', 'Only that code opens the page.', 'Lost code: ask the host for a new one.']} /></label>
        <input id="code" className="sat-input sat-mono trial-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9} value={code} placeholder="K7M2QX"
          aria-invalid={bad} onChange={(e) => { setCode(e.target.value); setBad(false); }} onKeyDown={(e) => { if (e.key === 'Enter' && code) go(); }} />
        {bad && <span className="sat-error">Code does not match. Check it with the host.</span>}
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!code || busy} onClick={() => code && !busy && go()}>{busy ? 'Opening' : 'Open'}</button>
    </section>
  );
}

function PlayerView({ m, p }: { m: TrialModel; p: TrialPlayer }) {
  const s = p.s, st = s.style;
  const mine = m.awards.filter((a) => a.to.includes(p.id));
  const rate = (a: number, b: number) => (b < 5 ? 'NA' : `${Math.round((a / b) * 100)}%`);
  const lines: [string, string, string, string[]][] = [
    ['VPIP', rate(s.vpip, s.logged), `${s.vpip}/${s.logged}`, ['Voluntary Put-in-Pot', 'Frequency of pre-flop call/raise (not including blinds)']],
    ['PFR', rate(s.pfr, s.logged), `${s.pfr}/${s.logged}`, ['Pre-Flop-Raise', 'Frequency of raising pre-flop']],
    ['3-Bet', rate(st.threeBet, st.threeBetOpp), `${st.threeBet}/${st.threeBetOpp}`, ['Frequency of pre-flop re-raising']],
    ['BB Defense', rate(st.bbDefend, st.bbDefendOpp), `${st.bbDefend}/${st.bbDefendOpp}`, ['Big Blind Defense', 'Frequency of raising or calling from the Big Blind position']],
    ['Aggression', p.af.toFixed(1), `${st.betsRaises} bet/raise, ${st.calls} calls`, ['Post-flop (Bets + Raises) / Calls', '>1 = Bets > Calls']],
  ];
  return (
    <div className="sat-stack" style={gap(4)}>
      <section className="sat-glass sat-card sat-stack" style={gap(4)}>
        <div className="trial-who">
          <h2 className="sat-h2">{p.name}</h2>
          <b className={`trial-net ${tone(p.net)}`}>{signed(p.net)}</b>
        </div>
        <Scale m={m} p={p} label="Range" lo="Tight" hi="Loose" min={0} max={100} unit="%" you={p.vpip} avg={m.avgVpip} target={m.target.vpip}
          tip={['How many hands you play (VPIP).', 'Left = tight: few hands. Right = loose: many hands.', 'Coloured dot = you.', 'Tick = table average.', `Grey dot = target for ${m.players4} players.`]} />
        <Scale m={m} p={p} label="Aggression" lo="Passive" hi="Aggressive" min={0} max={Math.max(3.5, ...m.players.map((x) => x.af)) * 1.05} you={p.af} avg={m.avgAf} target={m.target.af}
          tip={['How often you bet or raise after the flop instead of calling.', 'Left = passive: mostly calls. Right = aggressive: mostly bets and raises.', 'Coloured dot = you.', 'Tick = table average.', `Grey dot = target for ${m.players4} players.`]} />
        {mine.length > 0 && <div className="trial-awards">{mine.map((a) => <AwardCard key={a.title} m={m} a={a} showWho={false} />)}</div>}
      </section>

      {p.notes.length > 0 && (
        <Section title="How to Improve" tip={['Strengths and weaknesses from the hands logged, with what to try next game.', 'Each needs at least 5 chances, or 30 chips, behind it.']}>
          <ul className="trial-notes">
            {p.notes.map((n) => (
              <li key={n.title} className={`is-${n.kind}`}>
                <Icon name={n.kind === 'strength' ? 'up' : 'down'} size={16} />
                <span>
                  <b>{n.kind === 'strength' ? 'Strength' : 'Weakness'}: {n.title}</b> <span className="sat-muted">- {n.stat}</span>
                  <span className="trial-advice">{n.advice}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Playing Style" tip={['NA: fewer than 5 chances.']}>
        <dl className="trial-lines">
          {lines.map(([k, v, n, tip]) => (
            <div key={k}><dt>{k} <Tip title={k} lines={tip} /></dt><dd><b className={v === 'NA' ? 'sat-muted' : ''}>{v}</b> <span className="sat-muted">({n})</span></dd></div>
          ))}
        </dl>
        <div className="trial-duel">
          <Pips label="C-bet" hint="Bets the flop after raising" hit={st.cbet} total={st.cbetOpp} />
          <Pips label="Fold to C-bet" hint="Folds to a flop bet" hit={st.foldCbet} total={st.foldCbetOpp} bad />
        </div>
      </Section>

      <Section title="Stack Size" tip={['Result against par after each hand.', 'Par (0) = the chips bought so far.', 'Circle on the line = a rebuy, numbered.', 'Other players in grey.']}>
        <StackChart m={m} focus={p} />
      </Section>

      <Section title="Where Hands Were Won" tip={['Pre-flop to River = all others folded on that street.', 'Showdown = 2 or more players at the end.']}>
        <CountBars unit="hands" rows={[
          { label: 'Pre-flop', value: s.wonAt.preflop }, { label: 'Flop', value: s.wonAt.flop }, { label: 'Turn', value: s.wonAt.turn },
          { label: 'River', value: s.wonAt.river }, { label: 'Showdown', value: s.wonAt.showdown },
        ]} />
      </Section>

      <Section title="Chips Won and Lost" tip={['Folds = won when all others folded, or lost before folding.', 'Showdown = hands that went to showdown.', 'Others = 2-7 bounties and chip moves.']}>
        <BackToBack format={(v) => units(v)} rows={[
          { label: 'Folds', win: s.flow.winFold, loss: s.flow.lossFold },
          { label: 'Showdown', win: s.flow.winShowdown, loss: s.flow.lossShowdown },
          { label: 'Others', win: s.flow.winOther, loss: s.flow.lossOther },
        ]} />
      </Section>

      <Section title="Result by Seat" tip={['Net result in each position.', 'Button at the top, then clockwise.', 'Small number = hands played in that seat.']}>
        <FeltTable m={m} seats={(['BTN', 'SB', 'BB', 'UTG'] as Pos[]).map((k) => ({ id: k, label: k, value: p.byPos[k], sub: `${p.byPosN[k]}` }))} />
      </Section>

      {p.leftOut > 0 && <p className="sat-small sat-muted">{p.leftOut} {p.leftOut === 1 ? 'hand' : 'hands'} left out (cards clash).</p>}
      {p.mine.length > 0 && (
        <Section title={`Your Cards (${p.mine.length})`} tip={['Your own record of your cards, apart from the cards shown at the table.', 'Only you see these, with your player code.', 'Shown = also shown at the table.']}>
          <div className="sat-glass-2 felt-list">
            {p.mine.map((h) => (
              <div key={h.n} className={`felt-row trial-shown-row ${h.won ? 'is-won' : ''}`}>
                <span className="sat-mono sat-small sat-muted" style={{ width: 28 }}>#{h.n}</span>
                <Cards cards={h.cards} size="sm" />
                <span className="felt-row-main"><span className="felt-row-sub">{[h.rank, h.shownAtTable ? 'Shown' : ''].filter(Boolean).join(', ') || '-'}</span></span>
                <b className={`sat-small ${h.won ? 'felt-up' : 'sat-muted'}`}>{h.won ? `Won: ${h.got}` : '-'}</b>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Cards Shown (${p.shown.length})`} tip={["Hands where the player's cards were entered at showdown.", 'In hand order.']}>
        <div className="sat-glass-2 felt-list">
          {p.shown.map((h) => (
            <div key={h.n} className={`felt-row trial-shown-row ${h.won ? 'is-won' : ''}`}>
              <span className="sat-mono sat-small sat-muted" style={{ width: 28 }}>#{h.n}</span>
              <Cards cards={h.cards} size="sm" />
              <span className="felt-row-main"><span className="felt-row-sub">{h.rank || '-'}</span></span>
              <b className={`sat-small ${h.won ? 'felt-up' : 'sat-muted'}`}>{h.won ? `${h.split ? 'Split' : 'Won'}: ${h.got}` : `Lost: ${h.pot}`}</b>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------- compare ------------------------------- */

function Compare({ m, onPlayer }: { m: TrialModel; onPlayer: (id: string) => void }) {
  const rate = (a: number, b: number) => (!b ? '-' : b < 5 ? 'NA' : `${Math.round((a / b) * 100)}%`);
  const rows: { label: string; v: (p: TrialPlayer) => number; fmt: (p: TrialPlayer) => string; high?: boolean }[] = [
    { label: 'Result', v: (p) => p.net, fmt: (p) => signed(p.net), high: true },
    { label: 'VPIP', v: (p) => p.vpip, fmt: (p) => rate(p.s.vpip, p.s.logged) },
    { label: 'PFR', v: (p) => p.pfr, fmt: (p) => rate(p.s.pfr, p.s.logged) },
    { label: 'Aggression', v: (p) => p.af, fmt: (p) => p.af.toFixed(1), high: true },
    { label: '3-Bet', v: (p) => p.s.style.threeBet, fmt: (p) => rate(p.s.style.threeBet, p.s.style.threeBetOpp) },
    { label: 'C-bet', v: (p) => p.s.style.cbet, fmt: (p) => rate(p.s.style.cbet, p.s.style.cbetOpp) },
    { label: 'Fold to C-bet', v: (p) => p.s.style.foldCbet, fmt: (p) => rate(p.s.style.foldCbet, p.s.style.foldCbetOpp) },
    { label: 'Showdowns', v: (p) => p.s.wtsd, fmt: (p) => rate(p.s.wtsd, p.s.sawFlop) },
    { label: 'Won at SD', v: (p) => (p.s.wtsd ? p.s.wsd / p.s.wtsd : 0), fmt: (p) => rate(p.s.wsd, p.s.wtsd), high: true },
    { label: 'Pots won', v: (p) => p.s.handsWon, fmt: (p) => String(p.s.handsWon), high: true },
  ];
  return (
    <Section title="Side by Side" tip={['Bold = best value where higher is better.', 'NA = <5 chances', 'Tap a name to open that player.']}>
      <div className="trial-table-wrap">
        <table className="trial-table">
          <thead><tr><th />{m.players.map((p) => <th key={p.id}><button type="button" className="trial-th-btn" onClick={() => onPlayer(p.id)}><Dot m={m} id={p.id} />{p.name}</button></th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const top = r.high ? Math.max(...m.players.map(r.v)) : null;
              return <tr key={r.label}><th>{r.label}</th>{m.players.map((p) => { const t = r.fmt(p); return <td key={p.id} className={`${top !== null && r.v(p) === top ? 'is-best' : ''} ${t === 'NA' ? 'is-few' : ''}`}>{t}</td>; })}</tr>;
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ------------------------------- graphics ------------------------------- */

/** One line from one end to the other, with 3 marks named under the line: you (coloured dot), the table
    average (tick) and the target (grey dot). The tip next to the label says what each mark is. */
function Scale({ m, p, label, lo, hi, min, max, unit = '', you, avg, target, tip }: {
  m: TrialModel; p: TrialPlayer; label: string; lo: string; hi: string; min: number; max: number; unit?: string;
  you: number; avg: number; target: number; tip: string[];
}) {
  const pos = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const fmt = (v: number) => (unit ? `${Math.round(v)}${unit}` : v.toFixed(1));
  // Avg sits right under its tick. You goes above the line and Target on a second row below, so no tag
  // needs to move off its mark.
  const at = (v: number) => ({ left: `${pos(v)}%` });
  return (
    <div className="trial-scale">
      <div className="trial-scale-head"><span className="sat-caption">{label} <Tip title={label} lines={tip} /></span><b>{fmt(you)}</b></div>
      <div className="trial-scale-tags is-top"><span className="is-you" style={at(you)}>You</span></div>
      <div className="trial-scale-track">
        <span className="trial-scale-avg" style={at(avg)} />
        <span className="trial-scale-dot is-target" style={at(target)} />
        <span className="trial-scale-dot is-you" style={{ ...at(you), background: colorOf(m, p.id) }} />
      </div>
      <div className="trial-scale-tags is-low">
        <span className="is-avg" style={at(avg)}>Avg</span>
        <span className="is-target" style={at(target)}>Target</span>
      </div>
      <div className="sat-split trial-scale-ends"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

/** Result against par after each hand, 1 line per player, named at the end with the result.
    A rebuy is a yellow dot on the x-axis; it raises par, so the line stays level. With `focus`, the others
    are grey. Hover or touch shows each result. */
function StackChart({ m, focus }: { m: TrialModel; focus?: TrialPlayer }) {
  const W = 360, H = 210, L = 34, R = 74, T = 10, B = 24;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = m.players[0].dev.length;
  const all = m.players.flatMap((p) => p.dev);
  const lo = Math.floor(Math.min(0, ...all) / 50) * 50, hi = Math.ceil(Math.max(0, ...all) / 50) * 50;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = Array.from({ length: (hi - lo) / 50 + 1 }, (_, i) => lo + i * 50);
  const xt = [0, 10, 20, n - 1].filter((v, i, a) => a.indexOf(v) === i && (v === n - 1 || n - 1 - v >= 4));
  const order = focus ? [...m.players.filter((p) => p !== focus), focus] : m.players;
  const ends = order.map((p) => ({ p, y: y(p.dev[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const i = Math.round(((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const dim = (p: TrialPlayer) => !!focus && p !== focus;
  // a rebuy is a circle on the player's line with the number of rebuys so far (each = the first buy-in);
  // circles at the same spot are pushed apart sideways so every one stays visible
  const rebuyMarks: { p: TrialPlayer; after: number; amount: number; count: number; cx: number; cy: number }[] = [];
  for (const p of m.players) {
    const first = p.bought - p.rebuys.reduce((a, r) => a + r.amount, 0);
    let count = 0;
    for (const r of p.rebuys) {
      count += Math.max(1, Math.round(r.amount / (first || r.amount)));
      let cx = x(r.after);
      const cy = y(p.dev[r.after]);
      while (rebuyMarks.some((o) => Math.abs(o.cx - cx) < 16 && Math.abs(o.cy - cy) < 16)) cx += 17;
      rebuyMarks.push({ p, after: r.after, amount: r.amount, count, cx, cy });
    }
  }
  return (
    <div className="trial-chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Result against par after each hand" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === 0 ? 'trial-grid is-base' : 'trial-grid'} />
            <text x={L - 6} y={y(t) + 4} className="trial-axis" textAnchor="end">{t === 0 ? 'Par' : signed(t)}</text>
          </g>
        ))}
        {xt.map((i) => <text key={i} x={x(i)} y={H - 4} className="trial-axis" textAnchor="middle">{i}</text>)}
        {order.map((p) => (
          <polyline key={p.id} fill="none" strokeWidth={dim(p) ? 1.5 : 2} strokeLinejoin="round"
            style={{ stroke: dim(p) ? 'var(--sat-line-strong)' : colorOf(m, p.id) }} points={p.dev.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
        {rebuyMarks.map((r, i) => (
          <g key={i}>
            <circle cx={r.cx} cy={r.cy} r={8} className="trial-rebuy" style={{ stroke: dim(r.p) ? 'var(--sat-line-strong)' : colorOf(m, r.p.id) }} />
            <text x={r.cx} y={r.cy + 3.5} textAnchor="middle" className="trial-rebuy-n">{r.count}</text>
            <title>{`${r.p.name}: rebuy ${r.count} (${r.amount}) after hand #${r.after}`}</title>
          </g>
        ))}
        {ends.map(({ p, y: ly }) => (
          <text key={p.id} x={W - R + 6} y={ly + 4} className="trial-endlabel" style={{ fill: dim(p) ? 'var(--sat-muted)' : 'var(--sat-text)' }}>{p.name}: {signed(p.dev[n - 1])}</text>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="trial-cross" />
            {order.map((p) => <circle key={p.id} cx={x(hover)} cy={y(p.dev[hover])} r={4} style={{ fill: dim(p) ? 'var(--sat-muted)' : colorOf(m, p.id), stroke: 'var(--sat-solid-1)' }} strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="trial-tip" style={{ left: `${Math.min(80, Math.max(20, (x(hover) / W) * 100))}%` }}>
          <b>{hover === 0 ? 'Start' : `Hand #${hover}`}</b>
          {[...m.players].sort((a, b) => b.dev[hover] - a.dev[hover]).map((p) => <span key={p.id}><Dot m={m} id={p.id} />{p.name}: {signed(p.dev[hover])}</span>)}
        </div>
      )}
    </div>
  );
}

/** Horizontal candlesticks against par: wick from the lowest to the highest point, body from 0 to the final
    result. Every player opens at 0. */
function Swings({ m }: { m: TrialModel }) {
  const rows = [...m.players].sort((a, b) => b.net - a.net);
  const lo = Math.min(...rows.map((p) => Math.min(p.low, p.net))), hi = Math.max(...rows.map((p) => Math.max(p.high, p.net)));
  const span = hi - lo || 1;
  const at = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="trial-swings">
      {rows.map((p) => (
        <div key={p.id} className="trial-swing" title={`${p.name}: high ${signed(p.high)} after hand #${p.highAt}, low ${signed(p.low)} after hand #${p.lowAt}, end ${signed(p.net)}`}>
          <span className="trial-swing-name"><Dot m={m} id={p.id} />{p.name}</span>
          <span className="trial-swing-track">
            <span className="trial-swing-zero" style={{ left: at(0) }} />
            <span className="trial-swing-wick" style={{ left: at(p.low), width: `calc(${at(p.high)} - ${at(p.low)})` }} />
            <span className={`trial-swing-body ${p.net >= 0 ? 'is-up' : 'is-down'}`} style={{ left: at(Math.min(0, p.net)), width: `calc(${at(Math.max(0, p.net))} - ${at(Math.min(0, p.net))})` }} />
            {p.high > 0 && <small className="trial-swing-hi" style={{ left: at(p.high) }}>{signed(p.high)}</small>}
            {p.low < 0 && <small className="trial-swing-lo" style={{ left: at(p.low) }}>{signed(p.low)}</small>}
          </span>
          <b className={`trial-net-s ${tone(p.net)}`}>{signed(p.net)}</b>
        </div>
      ))}
    </div>
  );
}

/** Hand progression: one step per stage, width = hands that reached it, centred so it narrows like a funnel. */
function Funnel({ m }: { m: TrialModel }) {
  const steps: [string, number][] = [['Pre-flop', m.reach.preflop], ['Flop', m.reach.flop], ['Turn', m.reach.turn], ['River', m.reach.river], ['Showdown', m.reach.showdown]];
  const W = 360, rowH = 30, gapH = 12, mid = W / 2, maxW = 340;
  const H = steps.length * rowH + (steps.length - 1) * gapH;
  const w = (v: number) => Math.max(112, (v / m.hands) * maxW);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Hands that reached each stage">
      {steps.map(([label, v], i) => {
        const yTop = i * (rowH + gapH);
        const next = steps[i + 1];
        return (
          <g key={label}>
            <rect x={mid - w(v) / 2} y={yTop} width={w(v)} height={rowH} rx={6} className="trial-funnel-step" style={{ opacity: 1 - i * 0.12 }} />
            <text x={mid} y={yTop + rowH / 2 + 4} textAnchor="middle" className="trial-funnel-label">{label} ({v})</text>
            {next && <path d={`M${mid - w(v) / 2},${yTop + rowH} L${mid + w(v) / 2},${yTop + rowH} L${mid + w(next[1]) / 2},${yTop + rowH + gapH} L${mid - w(next[1]) / 2},${yTop + rowH + gapH} Z`} className="trial-funnel-neck" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Small counts as dots: filled = times it happened, empty = the other chances. The sample size shows itself. */
function Pips({ label, hint, hit, total, bad }: { label: string; hint: string; hit: number; total: number; bad?: boolean }) {
  return (
    <div className="trial-pips">
      <span className="sat-small"><b>{label}</b> <Tip title={label} lines={[`${hint}.`]} /></span>
      <span className="trial-pips-row" aria-label={`${hit} of ${total}`}>
        {total === 0 ? <span className="sat-small sat-muted">No chances</span> : Array.from({ length: total }, (_, i) => <i key={i} className={i < hit ? (bad ? 'is-bad' : 'is-hit') : ''} />)}
        {total > 0 && <b className="sat-small">{hit}/{total}</b>}
      </span>
    </div>
  );
}

/** 1 bar per hand, height = pot, colour = winner (grey for a split). A legend names the colours. */
function PotBars({ m }: { m: TrialModel }) {
  const W = 360, H = 120, B = 16, max = Math.max(...m.pots.map((p) => p.pot));
  const bw = W / m.pots.length;
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? m.pots[hover] : null;
  return (
    <div className="trial-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Pot of each hand" onPointerLeave={() => setHover(null)}>
        {m.pots.map((p, i) => {
          const bh = (p.pot / max) * (H - B - 6);
          return (
            <g key={p.n} onPointerEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H - B} fill="transparent" />
              <rect x={i * bw + 1} y={H - B - bh} width={bw - 2} height={bh} rx={2}
                style={{ fill: p.winners.length > 1 ? 'var(--sat-line-strong)' : colorOf(m, p.winners[0]), opacity: hover === null || hover === i ? 1 : 0.45 }} />
            </g>
          );
        })}
        {[1, 10, 20, m.pots.length].map((n) => <text key={n} x={(n - 0.5) * bw} y={H - 3} className="trial-axis" textAnchor="middle">{n}</text>)}
      </svg>
      {h && <div className="trial-tip" style={{ left: `${Math.min(80, Math.max(20, ((hover! + 0.5) / m.pots.length) * 100))}%` }}><b>Hand #{h.n}: {h.pot}</b><span>{h.winners.join(' and ')}</span></div>}
    </div>
  );
}

/** VPIP across, aggression up. Dashed lines: table averages. The target is a grey dot, like a player. */
function StyleMap({ m, focus }: { m: TrialModel; focus?: TrialPlayer }) {
  const W = 360, H = 230, L = 22, R = 10, T = 10, B = 22;
  const y1 = Math.max(3.5, ...m.players.map((p) => p.af)) * 1.1;
  const x = (v: number) => L + (v / 100) * (W - L - R);
  const y = (v: number) => T + (1 - v / y1) * (H - T - B);
  const pts = [
    ...m.players.map((p) => ({ id: p.id, name: p.name, vx: p.vpip, vy: p.af, on: !focus || p === focus, target: false })),
    { id: 'target', name: 'Target', vx: m.target.vpip, vy: m.target.af, on: true, target: true },
  ].sort((a, b) => a.vx - b.vx);
  const placed: { x: number; y: number }[] = [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Style map: VPIP against aggression">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="trial-grid" />
      <line x1={L} x2={L} y1={T} y2={H - B} className="trial-grid" />
      <line x1={x(m.avgVpip)} x2={x(m.avgVpip)} y1={T} y2={H - B} className="trial-cross" />
      <line x1={L} x2={W - R} y1={y(m.avgAf)} y2={y(m.avgAf)} className="trial-cross" />
      <text x={W - R} y={H - 6} textAnchor="end" className="trial-axis">VPIP</text>
      <text x={8} y={T + 4} className="trial-axis" transform={`rotate(-90 8 ${T + 4})`} textAnchor="end">Aggression</text>
      {pts.map((q) => {
        const cx = x(q.vx), cy = y(q.vy);
        // labels sit left of the dot; one that would overlap a label already placed goes right and lower
        const right = placed.some((o) => Math.abs(o.y - cy) < 14 && Math.abs(o.x - cx) < 60);
        placed.push({ x: cx, y: cy });
        const fill = q.target ? 'var(--sat-muted)' : q.on ? colorOf(m, q.id) : 'var(--sat-line-strong)';
        return (
          <g key={q.id}>
            <circle cx={cx} cy={cy} r={q.on ? 7 : 5} style={{ fill, stroke: 'var(--sat-solid-1)' }} strokeWidth={2}>
              <title>{`${q.name}: VPIP ${Math.round(q.vx)}%, aggression ${q.vy.toFixed(1)}`}</title>
            </circle>
            <text x={right ? cx + 10 : cx - 10} y={right ? cy + 16 : cy + 4} textAnchor={right ? 'start' : 'end'} className="trial-endlabel"
              style={{ fill: q.target || !q.on ? 'var(--sat-muted)' : 'var(--sat-text)' }}>{q.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
