import { useMemo, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Avatar, Cards, Empty, Help, Icon, Sheet, num, toast, useTick } from '../components/ui';
import { StepChart } from '../components/charts';
import {
  buyInCount, buyInTimeline, buyInUnits, cashOutUnits, handStats, hasCashedOut, playerStatus,
  timePlayed, totalBuyInUnits, totalPotMoney, tournamentPlace,
} from '../lib/calc';
import { ago, dateLabel, duration, inBB, money, stakesLabel, units } from '../lib/format';
import type { Game, ID } from '../types';

type SheetKind =
  | { k: 'rebuy'; pid: ID }
  | { k: 'clockout'; pid: ID }
  | { k: 'menu'; pid: ID }
  | { k: 'add' }
  | { k: 'seats' }
  | { k: 'edit' }
  | null;

export default function GameLive({ gameId }: { gameId: string }) {
  useTick(20000);
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [tab, setTab] = useState<'players' | 'hands'>('players');
  const [sub, setSub] = useState<'in' | 'out'>('in');
  const [sheet, setSheet] = useState<SheetKind>(null);

  if (!g) return <div className="screen plain"><Empty icon="games">This game doesn't exist any more.</Empty></div>;
  const isCash = g.type === 'cash';
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const isIn = (p: ID) => playerStatus(g, p) !== 'out';
  const inPlayers = ordered.filter(isIn);
  const outPlayers = ordered.filter((p) => !isIn(p));
  const lastBuy = g.buyIns.length ? Math.max(...g.buyIns.map((b) => b.at)) : null;
  const hs = handStats(g);
  const closed = g.status === 'closed';
  const shown = sub === 'in' ? inPlayers : outPlayers;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => go('', false)} aria-label="Home"><Icon name="back" /></button>
        <div className="titles">
          <h1>{g.name}</h1>
          <div className="sub">{stakesLabel(g)} · {dateLabel(g.startedAt)}</div>
        </div>
        <button className="icon-btn" onClick={() => setSheet({ k: 'edit' })} aria-label="Game settings"><Icon name="more" /></button>
      </div>

      {closed && (
        <button className="card tap" style={{ marginBottom: 12 }} onClick={() => go(`game/${g.id}/close`)}>
          <div className="row between"><span style={{ fontWeight: 700 }}>This game is closed</span><span className="small accent">Results</span></div>
        </button>
      )}

      <div className="card">
        <div className="row between">
          <span className="label row" style={{ gap: 4 }}>
            {closed ? 'Final total' : <><span className="live-dot" />{isCash ? 'In play' : 'Prize pool'} · {duration(Date.now() - g.startedAt)}</>}
            <Help k="inPlay" />
          </span>
          <span className="tiny faint">{inPlayers.length} playing · {g.buyIns.length} {isCash ? 'buy-ins' : 'entries'}</span>
        </div>
        <div className="hero-num">{money(totalPotMoney(g), g.currency)}</div>
        <div className="tiny muted">
          {isCash ? <>{units(totalBuyInUnits(g))} units, {inBB(g, totalBuyInUnits(g))}</> : <>{g.buyIns.length} entries</>}
          {lastBuy && <> · last {isCash ? 'buy-in' : 'entry'} {ago(lastBuy)}</>}
        </div>
        <div style={{ marginTop: 12, marginInline: -4 }}>
          <StepChart points={buyInTimeline(g)} endTime={g.endedAt ?? Date.now()} />
        </div>
        <div className="divider" />
        <div className="kpis">
          <div><div className="v">{g.hands.length}</div><div className="tiny faint">Hands</div></div>
          <div><div className="v">{hs.biggest ? units(hs.biggest.pot) : '—'}</div><div className="tiny faint">Biggest pot</div></div>
          <div><div className="v">{hs.hands ? units(Math.round(hs.avgPot)) : '—'}</div><div className="tiny faint row" style={{ justifyContent: 'center', gap: 2 }}>Average pot <Help k="pots" /></div></div>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setSheet({ k: 'seats' })}><Icon name="shuffle" /> Seat draw</button>
        <button className="btn" onClick={() => setSheet({ k: 'add' })}><Icon name="plus" /> Add player</button>
      </div>

      <div className="section">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>Players · {g.playerIds.length}</button>
          <button role="tab" aria-selected={tab === 'hands'} onClick={() => setTab('hands')}>Hands · {g.hands.length}</button>
        </div>

        {tab === 'players' && (
          <>
            <div className="chips" style={{ marginTop: 14 }}>
              <button className="chip sm" aria-pressed={sub === 'in'} onClick={() => setSub('in')}>{isCash ? 'Playing' : 'Still in'} · {inPlayers.length}</button>
              <button className="chip sm" aria-pressed={sub === 'out'} onClick={() => setSub('out')}>{isCash ? 'Clocked out' : 'Busted'} · {outPlayers.length}</button>
            </div>
            {shown.map((pid) => (
              <PlayerTile key={pid} g={g} pid={pid} name={name(pid)} wins={hs.handsWon[pid] ?? 0}
                onRebuy={() => st.addBuyIn(g.id, pid, isCash ? g.defaultBuyIn : g.tournament!.buyIn)}
                onOut={() => isCash ? setSheet({ k: 'clockout', pid }) : st.bust(g.id, pid)}
                onMenu={() => setSheet({ k: 'menu', pid })} />
            ))}
            {shown.length === 0 && (
              <Empty icon="users">{sub === 'in' ? 'Nobody is seated yet.' : isCash ? 'Nobody has clocked out.' : 'Nobody has busted.'}</Empty>
            )}
          </>
        )}

        {tab === 'hands' && <HandList g={g} name={name} />}
      </div>

      {!closed && (
        <div className="fab-bar"><div className="inner glass">
          <button className="btn lg" style={{ flex: '0 0 auto' }} onClick={() => go(isCash ? `game/${g.id}/count` : `game/${g.id}/close`)}>
            {isCash ? 'Count chips' : 'Finish'}
          </button>
          <button className="btn primary lg" onClick={() => go(`game/${g.id}/hand/new`)}>Log hand {(g.hands[g.hands.length - 1]?.n ?? 0) + 1}</button>
        </div></div>
      )}

      {sheet?.k === 'rebuy' && <AmountSheet g={g} title={`${isCash ? 'Buy-in' : 'Entry'} for ${name(sheet.pid)}`} initial={isCash ? g.defaultBuyIn : g.tournament!.buyIn}
        isMoney={!isCash} onClose={() => setSheet(null)} onSave={(v) => { st.addBuyIn(g.id, sheet.pid, v); setSheet(null); }} />}
      {sheet?.k === 'clockout' && <AmountSheet g={g} title={`Clock out ${name(sheet.pid)}`} sub="How many chips are they leaving with?" initial={null}
        cta="Clock out" onClose={() => setSheet(null)} onSave={(v) => { st.clockOut(g.id, sheet.pid, v); setSheet(null); toast(`${name(sheet.pid)} clocked out`); }} />}
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
    <div className="panel ptile">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Avatar name={name} />
        <div className="grow">
          <div className="row" style={{ gap: 6 }}>
            <span className="name">{name}</span>
            <span className="tiny faint">Seat {g.seats[pid] ?? '–'}</span>
            {status === 'away' && <span className="tag amber">Away</span>}
            {!isCash && place && <span className="tag up">{place === 1 ? 'Winner' : `Place ${place}`}</span>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <span className="well"><span className="num" style={{ fontSize: 18 }}>{isCash ? money(bi * g.unitValue, g.currency) : money(bi, g.currency)}</span></span>
            <span className="tiny muted">{isCash ? `${units(bi)} units · ${n} buy-in${n === 1 ? '' : 's'}` : `${n} entr${n === 1 ? 'y' : 'ies'}`}</span>
          </div>
          <div className="tiny faint row" style={{ gap: 10, marginTop: 8 }}>
            <span className="row" style={{ gap: 4 }}><Icon name="clock" size={12} />{duration(timePlayed(g, pid))}</span>
            <span>{wins} hand{wins === 1 ? '' : 's'} won</span>
            {isCash && hasCashedOut(g, pid) && <span>left with {units(cashOutUnits(g, pid))}</span>}
          </div>
        </div>
      </div>
      {!closed && (
        <div className="actions">
          {status !== 'out' ? (
            <>
              <button className="btn grow" onClick={onRebuy}>{isCash ? `Rebuy ${units(g.defaultBuyIn)}` : 'Re-enter'}</button>
              <button className="btn" onClick={onOut}><Icon name={isCash ? 'logout' : 'skull'} /> {isCash ? 'Clock out' : 'Bust'}</button>
            </>
          ) : (
            <button className="btn grow" onClick={onRebuy}>{isCash ? `Buy back in for ${units(g.defaultBuyIn)}` : 'Re-enter'}</button>
          )}
          <button className="btn" style={{ width: 46, padding: 0, flex: 'none' }} onClick={onMenu} aria-label={`More for ${name}`}><Icon name="settings" /></button>
        </div>
      )}
    </div>
  );
}

function HandList({ g, name }: { g: Game; name: (id: ID) => string }) {
  const hands = [...g.hands].reverse();
  if (!hands.length) return <Empty icon="cards">No hands yet.</Empty>;
  return (
    <div className="card list" style={{ marginTop: 14 }}>
      {hands.map((h) => (
        <button key={h.id} className="hand-row" onClick={() => go(`game/${g.id}/hand/${h.id}`)}>
          <div className="row between">
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <span className="num faint small">{h.n}</span>
              <span className="ellipsis" style={{ fontWeight: 700 }}>{h.winners.map((w) => name(w.playerId)).join(' and ') || 'No winner'}</span>
              {h.winners.length > 1 && <span className="tag">Split</span>}
            </div>
            <span className="num">{units(h.pot)}</span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            {h.boardNA ? <span className="tag">No board</span> : h.board.length ? <Cards cards={h.board} size="sm" /> : <span className="tiny faint">Won before the flop</span>}
            <div className="row" style={{ gap: 4 }}>
              {h.allIn && <span className="tag down">All-in</span>}
              {h.straddle && <span className="tag accent">Straddle</span>}
              {h.shown.length > 0 && <span className="tag up">{h.shown.length} shown</span>}
            </div>
          </div>
          {(h.tags.length > 0 || h.dealerId) && (
            <div className="row wrap tiny faint" style={{ gap: 6, marginTop: 6 }}>
              {h.dealerId && <span className="row" style={{ gap: 4 }}><span className="dealer-btn" style={{ width: 15, height: 15, fontSize: 8 }}>D</span>{name(h.dealerId)}</span>}
              {h.tags.map((t) => <span key={t} className="tag amber">{t}</span>)}
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
  return (
    <Sheet open onClose={onClose} title={title} sub={sub}>
      <div className="input-wrap">
        {isMoney && <span className="prefix">{g.currency}</span>}
        <input className="input big" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0" />
        {!isMoney && <span className="suffix">units</span>}
      </div>
      {!isMoney && n !== null && <div className="small muted" style={{ marginTop: 8 }}>{inBB(g, n)}, or {money(n * g.unitValue, g.currency)}</div>}
      {!isMoney && g.type === 'cash' && (
        <div className="chips" style={{ marginTop: 14 }}>
          {[0.5, 1, 1.5, 2].map((m) => {
            const amt = Math.round(g.defaultBuyIn * m);
            return <button key={m} className="chip sm" aria-pressed={n === amt} onClick={() => setV(String(amt))}>{units(amt)}</button>;
          })}
        </div>
      )}
      <button className="btn primary block lg" style={{ marginTop: 18 }} disabled={n === null || n < 0} onClick={() => n !== null && onSave(n)}>{cta}</button>
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
      <div className="stack">
        <button className="btn block" onClick={() => setCustom(true)}><Icon name="plus" /> {isCash ? 'Buy in for another amount' : 'Add an entry'}</button>
        {status !== 'out' && (
          <button className="btn block" onClick={() => { st.setStatus(g.id, pid, status === 'away' ? 'playing' : 'away'); onClose(); }}>
            <Icon name={status === 'away' ? 'play' : 'pause'} /> {status === 'away' ? 'Back at the table' : 'Sitting out'}
          </button>
        )}
        {!isCash && status === 'out' && (
          <button className="btn block" onClick={() => { st.unbust(g.id, pid); onClose(); }}><Icon name="undo" /> Undo bust</button>
        )}
        {isCash && hasCashedOut(g, pid) && status === 'out' && (
          <button className="btn block" onClick={() => { st.setCashOut(g.id, pid, null); st.setStatus(g.id, pid, 'playing'); onClose(); }}><Icon name="undo" /> Undo clock out</button>
        )}
      </div>
      <div className="row" style={{ marginTop: 18, alignItems: 'flex-end' }}>
        <label className="field grow"><span className="label">Seat</span><input className="input" inputMode="numeric" value={seat} onChange={(e) => setSeat(e.target.value)} /></label>
        <button className="btn" style={{ minHeight: 48 }} onClick={() => {
          const s = num(seat);
          if (s === null) return;
          st.updateGame(g.id, (x) => {
            const other = Object.entries(x.seats).find(([p, v]) => v === s && p !== pid);
            if (other) x.seats[other[0]] = x.seats[pid];
            x.seats[pid] = s;
          });
          toast('Seat changed');
        }}>Change seat</button>
      </div>
      <div className="label" style={{ marginTop: 20, marginBottom: 4 }}>{isCash ? 'Buy-ins' : 'Entries'}</div>
      {buyIns.length === 0 && <div className="small muted">None yet.</div>}
      {buyIns.map((b) => (
        <div key={b.id} className="list-row">
          <span className="grow num">{isCash ? `${units(b.amount)} · ${money(b.amount * g.unitValue, g.currency)}` : money(b.amount, g.currency)}</span>
          <span className="tiny faint">{new Date(b.at).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })}</span>
          <button className="icon-btn danger" onClick={() => st.removeBuyIn(g.id, b.id)} aria-label="Remove buy-in"><Icon name="trash" /></button>
        </div>
      ))}
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
    const a = num(amt) ?? 0;
    for (const id of ids) st.addPlayerToGame(g.id, id, a);
    toast(ids.length === 1 ? 'Player added' : `${ids.length} players added`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add players">
      {roster.length > 0 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          {roster.map((p) => (
            <button key={p.id} className="chip" aria-pressed={sel.includes(p.id)} onClick={() => setSel((v) => v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v, p.id])}>{p.name}</button>
          ))}
        </div>
      )}
      <input className="input" placeholder="New player's name" value={nm} onChange={(e) => setNm(e.target.value)} />
      <label className="field" style={{ marginTop: 14 }}>
        <span className="label">{isCash ? 'Buy-in, units' : `Entry, ${g.currency}`}</span>
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </label>
      <button className="btn primary block lg" style={{ marginTop: 18 }} disabled={!sel.length && !nm.trim()} onClick={add}>Add to game</button>
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
    <Sheet open onClose={onClose} title="Seat draw">
      <div className="row" style={{ gap: 4, marginBottom: 4 }}><span className="small muted">Seats are numbered clockwise.</span><Help k="seatDraw" /></div>
      <div className="seat-table">
        <div className="felt" />
        {order.map((p, i) => (
          <div key={p} className="seat" style={{ left: `${pos[i].left}%`, top: `${pos[i].top}%` }}>
            <span className="avatar sm num">{i + 1}</span>
            <span className="nm">{name(p)}</span>
            {button === p && <span className="dealer-btn">D</span>}
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn" onClick={shuffle}><Icon name="shuffle" /> Shuffle</button>
        <button className="btn primary" onClick={() => {
          st.updateGame(g.id, (x) => {
            const next: Record<ID, number> = {};
            order.forEach((p, i) => { next[p] = i + 1; });
            let s = order.length + 1;
            for (const p of x.playerIds) if (!(p in next)) next[p] = s++;
            x.seats = next;
            if (button) x.firstDealer = button;
          });
          toast('Seats saved');
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
      <label className="field"><span className="label">Name</span><input className="input" value={nm} onChange={(e) => setNm(e.target.value)} /></label>
      {g.type === 'cash' && (
        <div className="grid2" style={{ marginTop: 14 }}>
          <label className="field"><span className="label">1 unit, {g.currency}</span><input className="input" inputMode="decimal" value={uv} onChange={(e) => setUv(e.target.value)} /></label>
          <label className="field" style={{ marginTop: 0 }}><span className="label">Rebuy, units</span><input className="input" inputMode="numeric" value={bi} onChange={(e) => setBi(e.target.value)} /></label>
        </div>
      )}
      <label className="field" style={{ marginTop: 14 }}><span className="label">Notes</span><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button className="btn primary block" style={{ marginTop: 18 }} onClick={() => {
        st.updateGame(g.id, (x) => {
          x.name = nm.trim() || x.name;
          x.notes = notes;
          if (x.type === 'cash') { x.unitValue = num(uv) ?? x.unitValue; x.defaultBuyIn = num(bi) ?? x.defaultBuyIn; }
        });
        onClose();
      }}>Save</button>
      <button className="btn danger block" style={{ marginTop: 12 }} onClick={() => {
        if (!confirm) { setConfirm(true); return; }
        st.deleteGame(g.id);
        onClose();
        go('games', true);
      }}><Icon name="trash" /> {confirm ? 'Tap again to delete for good' : 'Delete game'}</button>
    </Sheet>
  );
}
