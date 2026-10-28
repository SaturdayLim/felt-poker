import { useMemo, useRef, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Caption, Cards, Empty, Header, Help, Icon, Sheet, StatusLight, num, toast, useTick, type Light } from '../components/ui';
import { NameEntry, titleCase } from '../components/players';
import {
  buyInCount, buyInUnits, cashOutUnits, hasCashedOut, playerStatus, timePlayed, totalBuyInUnits, totalPotMoney, tournamentPlace,
} from '../lib/calc';
import { buyInsEquivalent, dateLabel, duration, inBB, money, timeLabel, units } from '../lib/format';
import { estimateStacks, stackLabel } from '../lib/stacks';
import type { Game, ID } from '../types';

type SheetKind =
  | { k: 'clockout'; pid: ID }
  | { k: 'buyins'; pid: ID }
  | { k: 'back'; pid: ID }
  | { k: 'seats' }
  | { k: 'edit' }
  | null;

export function gameSubtitle(g: Game) {
  return `${dateLabel(g.startedAt)}, ${g.type === 'cash' ? `${g.sb}/${g.bb} Cash` : 'Tournament'}`;
}

/* Live game: two sub-pages.
   Players: one slim card per player, every part adjustable in place (name, seat by dragging, status light,
   buy-ins, stack estimate). A blank card at the bottom adds a player.
   Hands: newest first, with the button to log the next hand on top. */
export default function GameLive({ gameId }: { gameId: string }) {
  useTick(20000);
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [tab, setTab] = useState<'players' | 'hands'>('players');
  const [sheet, setSheet] = useState<SheetKind>(null);

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Game" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const isCash = g.type === 'cash';
  const closed = g.status === 'closed';
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const inPlayers = ordered.filter((p) => playerStatus(g, p) !== 'out');
  const outPlayers = ordered.filter((p) => playerStatus(g, p) === 'out');
  const est = estimateStacks(g);
  const nextN = (g.hands[g.hands.length - 1]?.n ?? 0) + 1;

  const onLight = (pid: ID, v: Light) => {
    const cur = playerStatus(g, pid);
    if (v === cur) return;
    if (v === 'out') { if (isCash) setSheet({ k: 'clockout', pid }); else { st.bust(g.id, pid); toast(`${name(pid)} busted`); } return; }
    if (cur === 'out') { setSheet({ k: 'back', pid }); return; }
    st.setStatus(g.id, pid, v);
    toast(v === 'away' ? `${name(pid)} is away. Clock paused.` : `${name(pid)} is back. Clock running.`);
  };
  const rebuy = (pid: ID) => {
    const amt = isCash ? g.defaultBuyIn : g.tournament!.buyIn;
    st.addBuyIn(g.id, pid, amt);
    toast(`${name(pid)}: ${isCash ? `rebuy of ${units(amt)} chips` : 're-entry'} added`);
  };

  return (
    <div className="felt-page">
      <Header back={() => go('')} title={g.name} sub={gameSubtitle(g)}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setSheet({ k: 'edit' })} aria-label="Game settings"><Icon name="more" /></button>}>
        <div className="felt-subnav sat-glass" role="tablist" aria-label="Game sections">
          <button role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}><Icon name="users" size={18} /> Players <span className="sat-num">{inPlayers.length}</span></button>
          <button role="tab" aria-selected={tab === 'hands'} onClick={() => setTab('hands')}><Icon name="cards" size={18} /> Hands <span className="sat-num">{g.hands.length}</span></button>
        </div>
      </Header>

      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
        {closed && (
          <button className="sat-flat sat-card sat-split" style={{ textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
            <span>This game is closed.</span><span className="sat-small" style={{ color: 'var(--sat-accent-text)', fontWeight: 600 }}>Show results</span>
          </button>
        )}

        <div className="felt-summary">
          <span><Caption tip="inPlay">{isCash ? (closed ? 'Bought in' : 'In play') : 'Pool'}</Caption><b className="sat-num">{isCash ? `${buyInsEquivalent(g, totalBuyInUnits(g))} buy-ins` : money(totalPotMoney(g), g.currency)}</b></span>
          <span><Caption>Chips</Caption><b className="sat-num">{units(totalBuyInUnits(g))}</b></span>
          <span><Caption>{closed ? 'Length' : 'Running'}</Caption><b className="sat-num">{duration((g.endedAt ?? Date.now()) - g.startedAt)}</b></span>
        </div>

        {tab === 'players' && (
          <>
            <div className="sat-split">
              <Caption>{isCash ? 'Playing' : 'Still in'} ({inPlayers.length})</Caption>
              {!closed && inPlayers.length > 1 && (
                <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setSheet({ k: 'seats' })} aria-label="Shuffle seats" title="Shuffle seats"><Icon name="shuffle" /></button>
              )}
            </div>
            <SeatList g={g} ids={inPlayers} disabled={closed} render={(pid, handle) => (
              <PlayerCard key={pid} g={g} pid={pid} name={name(pid)} handle={handle} stack={stackLabel(g, est, pid)}
                onLight={(v) => onLight(pid, v)} onRebuy={() => rebuy(pid)} onBuyIns={() => setSheet({ k: 'buyins', pid })} />
            )} />
            {!closed && <AddPlayerCard g={g} />}
            {outPlayers.length > 0 && (
              <>
                <Caption className="felt-out-cap">{isCash ? 'Clocked out' : 'Busted'} ({outPlayers.length})</Caption>
                {outPlayers.map((pid) => (
                  <PlayerCard key={pid} g={g} pid={pid} name={name(pid)} stack={null}
                    onLight={(v) => onLight(pid, v)} onRebuy={() => rebuy(pid)} onBuyIns={() => setSheet({ k: 'buyins', pid })} />
                ))}
              </>
            )}
          </>
        )}

        {tab === 'hands' && (
          <>
            {!closed && (
              <button className="felt-addbar" onClick={() => go(`game/${g.id}/hand/new`)}><Icon name="plus" /> Log hand {nextN}</button>
            )}
            <HandList g={g} name={name} />
          </>
        )}
      </div>

      {!closed && (
        <div className="sat-bottombar sat-glass-2">
          <button className="sat-btn sat-btn--lg" onClick={() => go(isCash ? `game/${g.id}/count` : `game/${g.id}/close`)}>{isCash ? 'Count chips' : 'Finish'}</button>
          <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => go(`game/${g.id}/hand/new`)}>Log hand {nextN}</button>
        </div>
      )}

      {sheet?.k === 'clockout' && (() => {
        const v = est.stack[sheet.pid];
        const exact = !(est.spread[sheet.pid] > 0);
        return <AmountSheet g={g} title={`Clock out ${name(sheet.pid)}`} label="Chips at clock-out" tip="clockOut" initial={v !== undefined ? Math.max(0, Math.round(v)) : null}
          hint={v !== undefined ? (exact ? 'Filled from the stack estimate. Change it to the real count.' : `Estimate ${stackLabel(g, est, sheet.pid)}. Enter the real count.`) : undefined}
          cta="Clock out" onClose={() => setSheet(null)} onSave={(n) => { st.clockOut(g.id, sheet.pid, n); setSheet(null); toast(`${name(sheet.pid)} clocked out with ${units(n)} chips`); }} />;
      })()}
      {sheet?.k === 'buyins' && <BuyInsSheet g={g} pid={sheet.pid} name={name(sheet.pid)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'back' && <BackInSheet g={g} pid={sheet.pid} name={name(sheet.pid)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'seats' && <SeatDrawSheet g={g} onClose={() => setSheet(null)} />}
      {sheet?.k === 'edit' && <EditGameSheet g={g} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ------------------------------- seats: drag to reorder ------------------------------- */

type Handle = { onPointerDown: (e: React.PointerEvent) => void; seat: number; dragging: boolean };

/** List whose rows can be dragged by their handle. Dropping saves the new order as seats 1, 2, 3...
    (players who are out keep seats after everyone still in). */
function SeatList({ g, ids, disabled, render }: { g: Game; ids: ID[]; disabled?: boolean; render: (pid: ID, handle?: Handle) => JSX.Element }) {
  const updateGame = useStore((s) => s.updateGame);
  const [order, setOrder] = useState<ID[] | null>(null);
  const [drag, setDrag] = useState<ID | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const shown = order ?? ids;
  const start = (pid: ID) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(pid);
    setOrder(ids);
    navigator.vibrate?.(8);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !order || !wrap.current) return;
    // new index = how many other cards have their middle above the finger
    const kids = [...wrap.current.children] as HTMLElement[];
    const to = kids.filter((k, i) => order[i] !== drag && e.clientY > k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2).length;
    if (to === order.indexOf(drag)) return;
    const nx = order.filter((p) => p !== drag);
    nx.splice(to, 0, drag);
    setOrder(nx);
  };
  const end = () => {
    if (drag && order && order.join() !== ids.join()) {
      updateGame(g.id, (x) => {
        const seats: Record<ID, number> = {};
        order.forEach((p, i) => { seats[p] = i + 1; });
        let s = order.length + 1;
        for (const p of [...x.playerIds].sort((a, b) => (x.seats[a] ?? 99) - (x.seats[b] ?? 99))) if (!(p in seats)) seats[p] = s++;
        x.seats = seats;
      });
      toast('Seat order saved');
    }
    setDrag(null);
    setOrder(null);
  };
  return (
    <div ref={wrap} className="felt-seatlist" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {shown.map((pid, i) => render(pid, disabled ? undefined : { onPointerDown: start(pid), seat: i + 1, dragging: drag === pid }))}
    </div>
  );
}

/* ------------------------------- player card ------------------------------- */

function PlayerCard({ g, pid, name, handle, stack, onLight, onRebuy, onBuyIns }: {
  g: Game; pid: ID; name: string; handle?: Handle; stack: string | null;
  onLight: (v: Light) => void; onRebuy: () => void; onBuyIns: () => void;
}) {
  const st = useStore();
  const isCash = g.type === 'cash';
  const status = playerStatus(g, pid);
  const n = buyInCount(g, pid);
  const place = tournamentPlace(g, pid);
  const closed = g.status === 'closed';
  const [editing, setEditing] = useState(false);
  const [nm, setNm] = useState(name);
  const saveName = () => {
    setEditing(false);
    const v = titleCase(nm);
    if (!v || v === name) { setNm(name); return; }
    if (st.players.some((x) => x.id !== pid && x.name.toLowerCase() === v.toLowerCase())) { toast(`${v} is already saved. Use a different name.`); setNm(name); return; }
    st.renamePlayer(pid, v);
    toast('Name saved');
  };
  return (
    <div className={`sat-glass felt-pcard ${status === 'out' ? 'is-out' : ''} ${status === 'away' ? 'is-away' : ''} ${handle?.dragging ? 'is-dragging' : ''}`}>
      {handle ? (
        <button type="button" className="felt-grip" onPointerDown={handle.onPointerDown} aria-label={`Seat ${handle.seat}. Drag to change ${name}'s seat`}>
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span className="sat-num">{handle.seat}</span>
        </button>
      ) : <span className="felt-grip is-static"><span className="sat-num">{g.seats[pid] ?? '-'}</span></span>}
      <div className="felt-pcard-main">
        <div className="felt-pcard-top">
          {editing ? (
            <input className="sat-input felt-pcard-input" autoFocus value={nm} aria-label="Player name" autoCapitalize="words"
              onChange={(e) => setNm(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setNm(name); setEditing(false); } }} />
          ) : (
            <button type="button" className="felt-pcard-name felt-ellipsis" onClick={() => { setNm(name); setEditing(true); }} aria-label={`${name}. Tap to rename`}>{name}</button>
          )}
          {!isCash && place && <span className="sat-badge">{place === 1 ? 'Winner' : `Place ${place}`}</span>}
          {!closed && <StatusLight value={status} onChange={onLight} name={name} outLabel={isCash ? 'Clock out' : 'Bust'} />}
        </div>
        <div className="felt-pcard-stats">
          <span className="felt-pill">
            <button type="button" onClick={onBuyIns} aria-label={`${n} ${isCash ? 'buy-ins' : 'entries'}. Show or change`}>
              <b className="sat-num">{n}</b> {isCash ? (n === 1 ? 'buy-in' : 'buy-ins') : n === 1 ? 'entry' : 'entries'}
            </button>
            {!closed && <button type="button" className="felt-pill-plus" onClick={onRebuy} aria-label={isCash ? `Rebuy ${units(g.defaultBuyIn)} chips for ${name}` : `Re-enter ${name}`}><Icon name="plus" size={14} stroke={2.4} /></button>}
          </span>
          {stack !== null && status !== 'out' && <span className="felt-stat">Stack <b className="sat-num">{stack}</b> <Help k="stack" /></span>}
          {isCash && hasCashedOut(g, pid) && status === 'out' && <span className="felt-stat">Left with <b className="sat-num">{units(cashOutUnits(g, pid))}</b></span>}
          <span className="felt-stat sat-num">{duration(timePlayed(g, pid))}{status === 'away' ? ', paused' : ''}</span>
        </div>
      </div>
    </div>
  );
}

/** Blank card at the end of the list: type a name to seat a new player with the default buy-in. */
function AddPlayerCard({ g }: { g: Game }) {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const isCash = g.type === 'cash';
  if (!open)
    return <button className="felt-addbar" onClick={() => setOpen(true)}><Icon name="plus" /> Add player</button>;
  return (
    <div className="sat-flat sat-card sat-stack felt-addcard" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="sat-split">
        <Caption>Add player</Caption>
        <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setOpen(false)}>Done</button>
      </div>
      <NameEntry exclude={g.playerIds} onPick={(p) => {
        st.addPlayerToGame(g.id, p.id);
        toast(`${p.name} seated${isCash ? ` with ${units(g.defaultBuyIn)} chips` : ''}`);
      }} />
      <p className="sat-small sat-muted">Each player starts with {isCash ? `one buy-in of ${units(g.defaultBuyIn)} chips` : `one entry of ${money(g.tournament!.buyIn, g.currency)}`}. Change it with the buy-in count.</p>
    </div>
  );
}

/** Red lamp tapped on a clocked-out or busted player: undo, or buy back in. */
function BackInSheet({ g, pid, name, onClose }: { g: Game; pid: ID; name: string; onClose: () => void }) {
  const st = useStore();
  const isCash = g.type === 'cash';
  return (
    <Sheet open onClose={onClose} title={`${name} back in`}>
      <p className="sat-small sat-muted">{isCash ? `Left with ${units(cashOutUnits(g, pid))} chips.` : 'Busted.'} Choose how they rejoin.</p>
      <button className="sat-btn sat-btn--primary sat-btn--block" onClick={() => { st.addBuyIn(g.id, pid, isCash ? g.defaultBuyIn : g.tournament!.buyIn); toast(`${name} bought back in`); onClose(); }}>
        {isCash ? `Buy back in for ${units(g.defaultBuyIn)}` : 'Re-enter'}
      </button>
      <button className="sat-btn sat-btn--block" onClick={() => {
        if (isCash) { st.setCashOut(g.id, pid, null); st.setStatus(g.id, pid, 'playing'); } else st.unbust(g.id, pid);
        toast(isCash ? 'Clock-out undone' : 'Bust undone');
        onClose();
      }}><Icon name="undo" /> {isCash ? 'Undo clock-out (wrong tap)' : 'Undo bust (wrong tap)'}</button>
    </Sheet>
  );
}

function HandList({ g, name }: { g: Game; name: (id: ID) => string }) {
  const hands = [...g.hands].reverse();
  if (!hands.length) return <Empty title="No hands yet">Log hand adds the first one. The newest stays on top.</Empty>;
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
              {h.dealerId && <span className="sat-small sat-muted"><span className="felt-dealer" style={{ width: 15, height: 15, fontSize: 8 }} aria-label="Button">D</span> {name(h.dealerId)}</span>}
              {(h.pots?.length ?? 1) > 1 && <span className="sat-badge sat-badge--muted">{h.pots!.length} pots</span>}
              {h.shown.length > 0 && <span className="sat-badge">{h.shown.length} shown</span>}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function AmountSheet({ g, title, label, tip, hint, initial, isMoney, cta = 'Add', onClose, onSave }: {
  g: Game; title: string; label?: string; tip?: 'clockOut'; hint?: string; initial: number | null; isMoney?: boolean; cta?: string;
  onClose: () => void; onSave: (v: number) => void;
}) {
  const [v, setV] = useState(initial === null ? '' : String(initial));
  const n = num(v);
  const bad = n === null || n < 0;
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="sat-field">
        <label htmlFor="amt">{label ?? (isMoney ? `Amount (${g.currency})` : 'Amount (chips)')}{tip && <> <Help k={tip} /></>}</label>
        <input id="amt" className="sat-input sat-num" style={{ fontSize: '1.5rem', minHeight: 56 }} autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0" aria-invalid={v !== '' && bad} />
        {!isMoney && n !== null && <span className="sat-hint">{inBB(g, n)}{hint ? `. ${hint}` : ''}</span>}
        {v !== '' && bad && <span className="sat-error">Use numbers only (e.g. 200).</span>}
      </div>
      {!isMoney && g.type === 'cash' && !hint && (
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

/** Tapped buy-in count: every buy-in with its time, remove a wrong one, or add a different amount. */
function BuyInsSheet({ g, pid, name, onClose }: { g: Game; pid: ID; name: string; onClose: () => void }) {
  const st = useStore();
  const [custom, setCustom] = useState(false);
  const buyIns = g.buyIns.filter((b) => b.playerId === pid);
  const isCash = g.type === 'cash';
  if (custom)
    return <AmountSheet g={g} title={`${isCash ? 'Buy-in' : 'Entry'} for ${name}`} initial={isCash ? g.defaultBuyIn : g.tournament!.buyIn} isMoney={!isCash}
      onClose={onClose} onSave={(v) => { st.addBuyIn(g.id, pid, v); onClose(); }} />;
  return (
    <Sheet open onClose={onClose} title={`${name}: ${isCash ? 'buy-ins' : 'entries'}`} sub={isCash ? `${units(buyInUnits(g, pid))} chips in total.` : undefined}>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
        {buyIns.length === 0 && <p className="sat-small sat-muted">None yet.</p>}
        {buyIns.map((b) => (
          <div key={b.id} className="felt-row" style={{ minHeight: 48, padding: '4px 0' }}>
            <span className="felt-grow sat-num">{isCash ? `${units(b.amount)} chips` : money(b.amount, g.currency)}</span>
            <span className="sat-small sat-muted sat-mono">{timeLabel(b.at)}</span>
            {g.status === 'live' && <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => st.removeBuyIn(g.id, b.id)} aria-label={`Remove buy-in at ${timeLabel(b.at)}`}><Icon name="trash" /></button>}
          </div>
        ))}
      </div>
      {g.status === 'live' && <button className="sat-btn sat-btn--block" onClick={() => setCustom(true)}><Icon name="plus" /> {isCash ? 'Buy in for another amount' : 'Add an entry'}</button>}
    </Sheet>
  );
}

function SeatDrawSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const st = useStore();
  const name = usePlayerName();
  const active = g.playerIds.filter((p) => playerStatus(g, p) !== 'out');
  const draw = () => {
    const a = [...active];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return { order: a, button: a[Math.floor(Math.random() * a.length)] ?? null };
  };
  const [d, setD] = useState(draw);
  const pos = useMemo(() => d.order.map((_, i) => {
    const ang = (i / Math.max(1, d.order.length)) * Math.PI * 2 + Math.PI / 2;
    return { left: 50 + Math.cos(ang) * 44, top: 50 + Math.sin(ang) * 42 };
  }), [d]);
  return (
    <Sheet open onClose={onClose} title="Shuffle seats">
      <p className="sat-small sat-muted">Seats run clockwise from seat 1. <Help k="seatDraw" /></p>
      <div className="felt-seats">
        <div className="felt-table" />
        {d.order.map((p, i) => (
          <div key={p} className="felt-seat" style={{ left: `${pos[i].left}%`, top: `${pos[i].top}%` }}>
            <span className="felt-avatar sm sat-num">{i + 1}</span>
            {d.button === p && <span className="felt-dealer">D</span>}
            <span>{name(p)}</span>
          </div>
        ))}
      </div>
      <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <button className="sat-btn felt-grow" onClick={() => setD(draw())}><Icon name="shuffle" /> Again</button>
        <button className="sat-btn sat-btn--primary felt-grow" onClick={() => {
          st.updateGame(g.id, (x) => {
            const next: Record<ID, number> = {};
            d.order.forEach((p, i) => { next[p] = i + 1; });
            let s = d.order.length + 1;
            for (const p of x.playerIds) if (!(p in next)) next[p] = s++;
            x.seats = next;
            if (d.button) x.firstDealer = d.button;
          });
          toast('Seats and button saved to the game');
          onClose();
        }}>Use these seats</button>
      </div>
    </Sheet>
  );
}

function EditGameSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const st = useStore();
  const groups = useStore((s) => s.groups);
  const [nm, setNm] = useState(g.name);
  const [uv, setUv] = useState(String(g.unitValue));
  const [bi, setBi] = useState(String(g.defaultBuyIn));
  const [sb, setSb] = useState(String(g.sb));
  const [bb, setBb] = useState(String(g.bb));
  const [grp, setGrp] = useState<string | undefined>(g.groupId);
  const [notes, setNotes] = useState(g.notes ?? '');
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Game settings">
      <div className="sat-field"><label htmlFor="eg-n">Game name</label><input id="eg-n" className="sat-input" value={nm} onChange={(e) => setNm(e.target.value)} /></div>
      <div className="sat-grid" style={{ ['--sat-min' as string]: '110px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
        <div className="sat-field"><label htmlFor="eg-sb">Small blind</label><input id="eg-sb" className="sat-input sat-num" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></div>
        <div className="sat-field"><label htmlFor="eg-bb">Big blind</label><input id="eg-bb" className="sat-input sat-num" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></div>
        {g.type === 'cash' && <div className="sat-field"><label htmlFor="eg-u">Multiplier ({g.currency}) <Help k="unitValue" /></label><input id="eg-u" className="sat-input sat-num" inputMode="decimal" value={uv} onChange={(e) => setUv(e.target.value)} /></div>}
        {g.type === 'cash' && <div className="sat-field"><label htmlFor="eg-b">Rebuy (chips)</label><input id="eg-b" className="sat-input sat-num" inputMode="numeric" value={bi} onChange={(e) => setBi(e.target.value)} /></div>}
      </div>
      {groups.length > 0 && (
        <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <Caption tip="groups">Group</Caption>
          <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <button className="sat-chip" aria-pressed={!grp} onClick={() => setGrp(undefined)}>None</button>
            {groups.map((x) => <button key={x.id} className="sat-chip" aria-pressed={grp === x.id} onClick={() => setGrp(x.id)}>{x.name}</button>)}
          </div>
        </div>
      )}
      <div className="sat-field"><label htmlFor="eg-x">Notes</label><textarea id="eg-x" className="sat-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button className="sat-btn sat-btn--primary sat-btn--block" onClick={() => {
        st.updateGame(g.id, (x) => {
          x.name = nm.trim() || x.name;
          x.notes = notes;
          x.groupId = grp;
          const s = num(sb), b = num(bb);
          if (s && b && b >= s) { x.sb = s; x.bb = b; }
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
