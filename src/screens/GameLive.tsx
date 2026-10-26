import { useMemo, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Avatar, Caption, Cards, Empty, Header, Help, Icon, Sheet, num, toast, useTick } from '../components/ui';
import { StepChart } from '../components/charts';
import {
  buyInCount, buyInTimeline, buyInUnits, cashOutUnits, handStats, hasCashedOut, playerStatus,
  timePlayed, totalBuyInUnits, totalPotMoney, tournamentPlace,
} from '../lib/calc';
import { ago, dateLabel, duration, inBB, money, timeLabel, units } from '../lib/format';
import type { Game, ID } from '../types';

type SheetKind =
  | { k: 'rebuy'; pid: ID }
  | { k: 'clockout'; pid: ID }
  | { k: 'menu'; pid: ID }
  | { k: 'add' }
  | { k: 'seats' }
  | { k: 'edit' }
  | null;

export function gameSubtitle(g: Game) {
  return `${dateLabel(g.startedAt)}, ${g.type === 'cash' ? `${g.sb}/${g.bb} Cash` : 'Tournament'}`;
}

export default function GameLive({ gameId }: { gameId: string }) {
  useTick(20000);
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [tab, setTab] = useState<'players' | 'hands'>('players');
  const [sub, setSub] = useState<'in' | 'out'>('in');
  const [sheet, setSheet] = useState<SheetKind>(null);

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Game" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const isCash = g.type === 'cash';
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const isIn = (p: ID) => playerStatus(g, p) !== 'out';
  const inPlayers = ordered.filter(isIn);
  const outPlayers = ordered.filter((p) => !isIn(p));
  const lastBuy = g.buyIns.length ? Math.max(...g.buyIns.map((b) => b.at)) : null;
  const hs = handStats(g);
  const closed = g.status === 'closed';
  const shown = sub === 'in' ? inPlayers : outPlayers;
  const now = g.endedAt ?? Date.now();

  return (
    <div className="felt-page">
      <Header back={() => go('')} title={g.name} sub={gameSubtitle(g)}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setSheet({ k: 'edit' })} aria-label="Game settings"><Icon name="more" /></button>} />

      <div className="sat-stack">
        {closed && (
          <button className="sat-flat sat-card sat-split" style={{ textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
            <span>This game is closed.</span><span className="sat-small" style={{ color: 'var(--sat-accent-text)', fontWeight: 600 }}>Show results</span>
          </button>
        )}

        <section className="sat-glass sat-card sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <div className="sat-split">
            <Caption q={g.currency} tip="inPlay">{closed ? 'Final total' : isCash ? 'In play' : 'Prize pool'}</Caption>
            {!closed && <span className="sat-small sat-muted"><span className="felt-dot" />{duration(Date.now() - g.startedAt)}</span>}
          </div>
          <span className="sat-kpi">{money(totalPotMoney(g), '')}</span>
          <p className="sat-small sat-muted">
            {isCash ? `${units(totalBuyInUnits(g))} units (${inBB(g, totalBuyInUnits(g))}), ${g.buyIns.length} buy-ins` : `${g.buyIns.length} entries`}
            {lastBuy ? `, last ${ago(lastBuy)}` : ''}
          </p>
          <figure style={{ marginTop: 'var(--sat-space-2)' }}>
            <StepChart points={buyInTimeline(g)} endTime={now} />
            <figcaption className="sat-figcaption"><b>{isCash ? 'In play' : 'Pool'} = {money(totalPotMoney(g), g.currency)}</b> after {duration(now - g.startedAt)}, {inPlayers.length} still playing.</figcaption>
            <p className="sat-source" style={{ marginTop: 'var(--sat-space-1)' }}>Source: Felt buy-in log ({timeLabel(g.startedAt)} to {timeLabel(now)}).</p>
          </figure>
          <hr className="sat-rule" />
          <div className="felt-kpis">
            <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><Caption>Hands</Caption><span className="sat-kpi">{g.hands.length}</span></div>
            <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><Caption q="units">Top pot</Caption><span className="sat-kpi">{hs.biggest ? units(hs.biggest.pot) : '-'}</span></div>
            <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><Caption q="units" tip="pots">Avg pot</Caption><span className="sat-kpi">{hs.hands ? units(Math.round(hs.avgPot)) : '-'}</span></div>
          </div>
        </section>

        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <button className="sat-btn felt-grow" onClick={() => setSheet({ k: 'seats' })}><Icon name="shuffle" /> Draw seats</button>
          <button className="sat-btn felt-grow" onClick={() => setSheet({ k: 'add' })}><Icon name="plus" /> Add player</button>
        </div>

        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={tab === 'players'} onClick={() => setTab('players')}>Players ({g.playerIds.length})</button>
          <button role="radio" aria-checked={tab === 'hands'} onClick={() => setTab('hands')}>Hands ({g.hands.length})</button>
        </div>

        {tab === 'players' && (
          <>
            <div className="sat-seg" role="radiogroup" aria-label="Player status">
              <button role="radio" aria-checked={sub === 'in'} onClick={() => setSub('in')}>{isCash ? 'Playing' : 'Still in'} ({inPlayers.length})</button>
              <button role="radio" aria-checked={sub === 'out'} onClick={() => setSub('out')}>{isCash ? 'Clocked out' : 'Busted'} ({outPlayers.length})</button>
            </div>
            {shown.map((pid) => (
              <PlayerTile key={pid} g={g} pid={pid} name={name(pid)} wins={hs.handsWon[pid] ?? 0}
                onRebuy={() => st.addBuyIn(g.id, pid, isCash ? g.defaultBuyIn : g.tournament!.buyIn)}
                onOut={() => isCash ? setSheet({ k: 'clockout', pid }) : st.bust(g.id, pid)}
                onMenu={() => setSheet({ k: 'menu', pid })} />
            ))}
            {shown.length === 0 && (sub === 'in'
              ? <Empty title="No players seated" action={<button className="sat-btn" onClick={() => setSheet({ k: 'add' })}>Add player</button>}>Add players to start the game.</Empty>
              : <Empty title={isCash ? 'Nobody has clocked out' : 'Nobody has busted'} />)}
          </>
        )}

        {tab === 'hands' && <HandList g={g} name={name} />}
      </div>

      {!closed && (
        <div className="sat-bottombar sat-glass-2">
          <button className="sat-btn sat-btn--lg" onClick={() => go(isCash ? `game/${g.id}/count` : `game/${g.id}/close`)}>{isCash ? 'Count chips' : 'Finish'}</button>
          <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => go(`game/${g.id}/hand/new`)}>Log hand {(g.hands[g.hands.length - 1]?.n ?? 0) + 1}</button>
        </div>
      )}

      {sheet?.k === 'rebuy' && <AmountSheet g={g} title={`${isCash ? 'Buy-in' : 'Entry'} for ${name(sheet.pid)}`} initial={isCash ? g.defaultBuyIn : g.tournament!.buyIn}
        isMoney={!isCash} onClose={() => setSheet(null)} onSave={(v) => { st.addBuyIn(g.id, sheet.pid, v); setSheet(null); }} />}
      {sheet?.k === 'clockout' && <AmountSheet g={g} title={`Clock out ${name(sheet.pid)}`} sub="Chips they leave with, in units." initial={null}
        cta="Clock out" onClose={() => setSheet(null)} onSave={(v) => { st.clockOut(g.id, sheet.pid, v); setSheet(null); toast(`${name(sheet.pid)} clocked out with ${units(v)} units`); }} />}
      {sheet?.k === 'menu' && <PlayerMenu g={g} pid={sheet.pid} name={name(sheet.pid)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'add' && <AddPlayerSheet g={g} onClose={() => setSheet(null)} />}
      {sheet?.k === 'seats' && <SeatDrawSheet g={g} onClose={() => setSheet(null)} />}
      {sheet?.k === 'edit' && <EditGameSheet g={g} onClose={() => setSheet(null)} />}
    </div>
  );
}

function PlayerTile({ g, pid, name, wins, onRebuy, onOut, onMenu }: {
  g: Game; pid: ID; name: string; wins: number;
  onRebuy: () => void; onOut: () => void; onMenu: () => void;
}) {
  const isCash = g.type === 'cash';
  const status = playerStatus(g, pid);
  const bi = buyInUnits(g, pid);
  const n = buyInCount(g, pid);
  const place = tournamentPlace(g, pid);
  const closed = g.status === 'closed';
  return (
    <div className="sat-glass sat-card felt-tile">
      <div className="sat-cluster" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <Avatar name={name} />
        <div className="felt-grow sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
          <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <span className="felt-tile-name">{name}</span>
            <Caption>Seat {g.seats[pid] ?? '-'}</Caption>
            {status === 'away' && <span className="sat-badge sat-badge--muted">Sitting out</span>}
            {!isCash && place && <span className="sat-badge">{place === 1 ? 'Winner' : `Place ${place}`}</span>}
          </div>
          <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <span className="sat-well felt-amount"><span className="sat-num" style={{ fontSize: '1.125rem', fontWeight: 600 }}>{isCash ? money(bi * g.unitValue, g.currency) : money(bi, g.currency)}</span></span>
            <span className="sat-small sat-muted">{isCash ? `${units(bi)} units, ${n} buy-in${n === 1 ? '' : 's'}` : `${n} entr${n === 1 ? 'y' : 'ies'}`}</span>
          </div>
          <p className="sat-small sat-muted">
            {duration(timePlayed(g, pid))} played, {wins} hand{wins === 1 ? '' : 's'} won{isCash && hasCashedOut(g, pid) ? `, left with ${units(cashOutUnits(g, pid))} units` : ''}
          </p>
        </div>
      </div>
      {!closed && (
        <div className="felt-tile-actions">
          {status !== 'out' ? (
            <>
              <button className="sat-btn felt-grow" onClick={onRebuy}>{isCash ? `Rebuy ${units(g.defaultBuyIn)}` : 'Re-enter'}</button>
              <button className="sat-btn felt-grow" onClick={onOut}><Icon name={isCash ? 'logout' : 'skull'} /> {isCash ? 'Clock out' : 'Bust'}</button>
            </>
          ) : (
            <button className="sat-btn felt-grow" onClick={onRebuy}>{isCash ? `Buy back in for ${units(g.defaultBuyIn)}` : 'Re-enter'}</button>
          )}
          <button className="sat-btn sat-iconbtn" onClick={onMenu} aria-label={`More for ${name}`}><Icon name="settings" /></button>
        </div>
      )}
    </div>
  );
}

function HandList({ g, name }: { g: Game; name: (id: ID) => string }) {
  const hands = [...g.hands].reverse();
  if (!hands.length) return <Empty title="No hands yet">Tap Log hand after each pot.</Empty>;
  return (
    <div className="sat-glass-2 felt-list">
      {hands.map((h) => (
        <button key={h.id} className="felt-hand" onClick={() => go(`game/${g.id}/hand/${h.id}`)}>
          <div className="sat-split" style={{ flexWrap: 'nowrap' }}>
            <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap', minWidth: 0 }}>
              <span className="sat-mono sat-small sat-muted">{h.n}</span>
              <span className="felt-ellipsis" style={{ fontWeight: 600 }}>{h.winners.map((w) => name(w.playerId)).join(' and ') || 'No winner'}</span>
              {h.winners.length > 1 && <span className="sat-badge sat-badge--muted">Split</span>}
            </div>
            <span className="sat-num" style={{ fontWeight: 600 }}>{units(h.pot)}</span>
          </div>
          <div className="sat-split" style={{ marginTop: 'var(--sat-space-2)' }}>
            {h.boardNA ? <span className="sat-badge sat-badge--muted">No board</span> : h.board.length ? <Cards cards={h.board} size="sm" /> : <span className="sat-small sat-muted">Won before the flop</span>}
            <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
              {h.allIn && <span className="sat-badge sat-badge--muted">All-in</span>}
              {h.straddle && <span className="sat-badge sat-badge--muted">Straddle</span>}
              {h.shown.length > 0 && <span className="sat-badge">{h.shown.length} shown</span>}
            </div>
          </div>
          {(h.tags.length > 0 || h.dealerId) && (
            <div className="sat-cluster sat-small sat-muted" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', marginTop: 'var(--sat-space-2)' }}>
              {h.dealerId && <span className="sat-cluster" style={{ ['--sat-gap' as string]: '4px' }}><span className="felt-dealer" style={{ width: 15, height: 15, fontSize: 8 }}>D</span>{name(h.dealerId)}</span>}
              {h.tags.map((t) => <span key={t} className="sat-badge sat-badge--muted">{t}</span>)}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function AmountSheet({ g, title, sub, initial, isMoney, cta = 'Add', onClose, onSave }: {
  g: Game; title: string; sub?: string; initial: number | null; isMoney?: boolean; cta?: string;
  onClose: () => void; onSave: (v: number) => void;
}) {
  const [v, setV] = useState(initial === null ? '' : String(initial));
  const n = num(v);
  const bad = n === null || n < 0;
  return (
    <Sheet open onClose={onClose} title={title} sub={sub}>
      <div className="sat-field">
        <label htmlFor="amt">{isMoney ? `Amount (${g.currency})` : 'Amount (units)'}</label>
        <input id="amt" className="sat-input sat-num" style={{ fontSize: '1.5rem', minHeight: 56 }} autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0" aria-invalid={v !== '' && bad} />
        {!isMoney && n !== null && <span className="sat-hint">{inBB(g, n)} = {money(n * g.unitValue, g.currency)}</span>}
        {v !== '' && bad && <span className="sat-error">Use numbers only (e.g. 200).</span>}
      </div>
      {!isMoney && g.type === 'cash' && (
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {[0.5, 1, 1.5, 2].map((m) => {
            const amt = Math.round(g.defaultBuyIn * m);
            return <button key={m} className="sat-chip" aria-pressed={n === amt} onClick={() => setV(String(amt))}>{units(amt)}</button>;
          })}
        </div>
      )}
      <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={bad} onClick={() => !bad && onSave(n!)}>{cta}</button>
    </Sheet>
  );
}

function PlayerMenu({ g, pid, name, onClose }: { g: Game; pid: ID; name: string; onClose: () => void }) {
  const st = useStore();
  const status = playerStatus(g, pid);
  const [seat, setSeat] = useState(String(g.seats[pid] ?? ''));
  const [custom, setCustom] = useState(false);
  const buyIns = g.buyIns.filter((b) => b.playerId === pid);
  const isCash = g.type === 'cash';
  if (custom)
    return <AmountSheet g={g} title={`${isCash ? 'Buy-in' : 'Entry'} for ${name}`} initial={isCash ? g.defaultBuyIn : g.tournament!.buyIn} isMoney={!isCash}
      onClose={onClose} onSave={(v) => { st.addBuyIn(g.id, pid, v); onClose(); }} />;
  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <button className="sat-btn sat-btn--block" onClick={() => setCustom(true)}><Icon name="plus" /> {isCash ? 'Buy in for another amount' : 'Add an entry'}</button>
        {status !== 'out' && (
          <button className="sat-btn sat-btn--block" onClick={() => { st.setStatus(g.id, pid, status === 'away' ? 'playing' : 'away'); onClose(); }}>
            <Icon name={status === 'away' ? 'play' : 'pause'} /> {status === 'away' ? 'Back at the table' : 'Sit out'}
          </button>
        )}
        {!isCash && status === 'out' && <button className="sat-btn sat-btn--block" onClick={() => { st.unbust(g.id, pid); onClose(); }}><Icon name="undo" /> Undo bust</button>}
        {isCash && hasCashedOut(g, pid) && status === 'out' && (
          <button className="sat-btn sat-btn--block" onClick={() => { st.setCashOut(g.id, pid, null); st.setStatus(g.id, pid, 'playing'); onClose(); }}><Icon name="undo" /> Undo clock out</button>
        )}
      </div>
      <div className="sat-cluster" style={{ alignItems: 'flex-end', flexWrap: 'nowrap', ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <div className="sat-field felt-grow">
          <label htmlFor="seat">Seat</label>
          <input id="seat" className="sat-input sat-num" inputMode="numeric" value={seat} onChange={(e) => setSeat(e.target.value)} />
        </div>
        <button className="sat-btn" onClick={() => {
          const s = num(seat);
          if (s === null) { toast('Use numbers only (e.g. 3).'); return; }
          st.updateGame(g.id, (x) => {
            const other = Object.entries(x.seats).find(([p, v]) => v === s && p !== pid);
            if (other) x.seats[other[0]] = x.seats[pid];
            x.seats[pid] = s;
          });
          toast(`${name} moved to seat ${s}`);
        }}>Change seat</button>
      </div>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
        <Caption q={isCash ? 'units' : g.currency}>{isCash ? 'Buy-ins' : 'Entries'}</Caption>
        {buyIns.length === 0 && <p className="sat-small sat-muted">None yet.</p>}
        {buyIns.map((b) => (
          <div key={b.id} className="felt-row" style={{ minHeight: 48, padding: '4px 0' }}>
            <span className="felt-grow sat-num">{isCash ? `${units(b.amount)} = ${money(b.amount * g.unitValue, g.currency)}` : money(b.amount, g.currency)}</span>
            <span className="sat-small sat-muted sat-mono">{timeLabel(b.at)}</span>
            <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => st.removeBuyIn(g.id, b.id)} aria-label={`Remove buy-in at ${timeLabel(b.at)}`}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function AddPlayerSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const st = useStore();
  const roster = useStore((s) => s.players).filter((p) => !p.archived && !g.playerIds.includes(p.id));
  const [sel, setSel] = useState<ID[]>([]);
  const [nm, setNm] = useState('');
  const isCash = g.type === 'cash';
  const [amt, setAmt] = useState(String(isCash ? g.defaultBuyIn : g.tournament!.buyIn));
  const add = () => {
    const ids = [...sel];
    if (nm.trim()) {
      const ex = useStore.getState().players.find((p) => p.name.toLowerCase() === nm.trim().toLowerCase());
      ids.push((ex ?? st.addPlayer(nm)).id);
    }
    if (!ids.length) return;
    const a = num(amt) ?? 0;
    for (const id of ids) st.addPlayerToGame(g.id, id, a);
    toast(ids.length === 1 ? 'Player added to the game' : `${ids.length} players added to the game`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add players">
      {roster.length > 0 && (
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {roster.map((p) => (
            <button key={p.id} className="sat-chip" aria-pressed={sel.includes(p.id)} onClick={() => setSel((v) => v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v, p.id])}>{p.name}</button>
          ))}
        </div>
      )}
      <div className="sat-field">
        <label htmlFor="np">New player</label>
        <input id="np" className="sat-input" placeholder="Name (e.g. Priya)" value={nm} onChange={(e) => setNm(e.target.value)} />
      </div>
      <div className="sat-field">
        <label htmlFor="na">{isCash ? 'Buy-in (units)' : `Entry (${g.currency})`}</label>
        <input id="na" className="sat-input sat-num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!sel.length && !nm.trim()} onClick={add}>Add to game</button>
    </Sheet>
  );
}

function SeatDrawSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const st = useStore();
  const name = usePlayerName();
  const active = g.playerIds.filter((p) => playerStatus(g, p) !== 'out');
  const [order, setOrder] = useState<ID[]>(() => [...active].sort((a, b) => (g.seats[a] ?? 0) - (g.seats[b] ?? 0)));
  const [button, setButton] = useState<ID | null>(null);
  const shuffle = () => {
    const a = [...active];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    setOrder(a);
    setButton(a[Math.floor(Math.random() * a.length)] ?? null);
  };
  const pos = useMemo(() => order.map((_, i) => {
    const ang = (i / Math.max(1, order.length)) * Math.PI * 2 + Math.PI / 2;
    return { left: 50 + Math.cos(ang) * 44, top: 50 + Math.sin(ang) * 42 };
  }), [order]);
  return (
    <Sheet open onClose={onClose} title="Draw seats">
      <p className="sat-small sat-muted">Seats run clockwise from seat 1. <Help k="seatDraw" /></p>
      <div className="felt-seats">
        <div className="felt-table" />
        {order.map((p, i) => (
          <div key={p} className="felt-seat" style={{ left: `${pos[i].left}%`, top: `${pos[i].top}%` }}>
            <span className="felt-avatar sm sat-num">{i + 1}</span>
            {button === p && <span className="felt-dealer">D</span>}
            <span>{name(p)}</span>
          </div>
        ))}
      </div>
      <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <button className="sat-btn felt-grow" onClick={shuffle}><Icon name="shuffle" /> Shuffle</button>
        <button className="sat-btn sat-btn--primary felt-grow" onClick={() => {
          st.updateGame(g.id, (x) => {
            const next: Record<ID, number> = {};
            order.forEach((p, i) => { next[p] = i + 1; });
            let s = order.length + 1;
            for (const p of x.playerIds) if (!(p in next)) next[p] = s++;
            x.seats = next;
            if (button) x.firstDealer = button;
          });
          toast('Seats saved to the game');
          onClose();
        }}>Use these seats</button>
      </div>
    </Sheet>
  );
}

function EditGameSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const st = useStore();
  const [nm, setNm] = useState(g.name);
  const [uv, setUv] = useState(String(g.unitValue));
  const [bi, setBi] = useState(String(g.defaultBuyIn));
  const [notes, setNotes] = useState(g.notes ?? '');
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Game settings">
      <div className="sat-field"><label htmlFor="eg-n">Game name</label><input id="eg-n" className="sat-input" value={nm} onChange={(e) => setNm(e.target.value)} /></div>
      {g.type === 'cash' && (
        <div className="sat-grid" style={{ ['--sat-min' as string]: '120px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
          <div className="sat-field"><label htmlFor="eg-u">1 unit ({g.currency})</label><input id="eg-u" className="sat-input sat-num" inputMode="decimal" value={uv} onChange={(e) => setUv(e.target.value)} /></div>
          <div className="sat-field"><label htmlFor="eg-b">Rebuy (units)</label><input id="eg-b" className="sat-input sat-num" inputMode="numeric" value={bi} onChange={(e) => setBi(e.target.value)} /></div>
        </div>
      )}
      <div className="sat-field"><label htmlFor="eg-x">Notes</label><textarea id="eg-x" className="sat-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button className="sat-btn sat-btn--primary sat-btn--block" onClick={() => {
        st.updateGame(g.id, (x) => {
          x.name = nm.trim() || x.name;
          x.notes = notes;
          if (x.type === 'cash') { x.unitValue = num(uv) ?? x.unitValue; x.defaultBuyIn = num(bi) ?? x.defaultBuyIn; }
        });
        toast('Game settings saved');
        onClose();
      }}>Save settings</button>
      <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }} onClick={() => {
        if (!confirm) { setConfirm(true); return; }
        st.deleteGame(g.id);
        onClose();
        go('games', true);
      }}><Icon name="trash" /> {confirm ? 'Tap again to delete for good' : 'Delete game'}</button>
    </Sheet>
  );
}
