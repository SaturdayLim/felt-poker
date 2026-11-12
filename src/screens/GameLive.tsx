import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame, useStore, usePlayerName, undoCountOpen } from '../store';
import { back, backTo, go, setPath } from '../router';
import { useDragList } from '../components/dragList';
import { Caption, Cards, Empty, Header, Help, Icon, Sheet, StatusLight, num, toast, useTick, type Light, withUndo, TabPill, SlidePane, WordButton, NumericText } from '../components/ui';
import { shrinkAway } from '../lib/motion';
import { SwipeDelete } from './Games';
import { rememberLogButton } from '../lib/swipeBack';
import { SeatPicker, CodeControl, PlayerName, openPlayer } from '../components/players';
import {
  buyInCount, buyInUnits, cashOutUnits, hasCashedOut, playerStatus, timePlayed, totalBuyInUnits, totalPotMoney, tournamentPlace,
} from '../lib/calc';
import { buyInsEquivalent, duration, gameCaptionNarrow, inBB, runningLabel, money, timeLabel, units } from '../lib/format';
import { estimateStacks, needsCount, stackLabel } from '../lib/stacks';
import { gameRules } from '../lib/rules';
import { RulesFields } from '../components/rules';
import { LiveRow } from '../components/live';
import { uid } from '../lib/ids';
import type { ChipMove, Game, Hand, ID } from '../types';

type SheetKind =
  | { k: 'clockout'; pid: ID }
  | { k: 'buyins'; pid: ID }
  | { k: 'seats' }
  | { k: 'edit' }
  | { k: 'count'; pid: ID }
  | { k: 'move' }
  | null;

/* Live game: two sub-pages.
   Players: one slim card per player, every part adjustable in place (name, seat by dragging, status light,
   buy-ins, stack estimate). A blank card at the bottom adds a player.
   Hands: newest first, with the button to log the next hand on top. */
export default function GameLive({ gameId, initialTab = 'players' }: { gameId: string; initialTab?: 'players' | 'hands' }) {
  useTick(20000);
  // an End game count left without Close game (also when the app was closed on it) gives back the cash-outs it filled
  useEffect(() => { undoCountOpen(gameId); }, [gameId]);
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [tab, setTabState] = useState<'players' | 'hands'>(initialTab);
  // the open view is part of the address (game/<id> or game/<id>/hands): Back from a hand comes back to the Hands view
  const setTab = (t: 'players' | 'hands') => { setTabState(t); setPath(`game/${gameId}${t === 'hands' ? '/hands' : ''}`); };
  const [sheet, setSheet] = useState<SheetKind>(null);
  // a closed game cannot share: the live row only exists while the game runs, and it closes away when the game closes
  const isClosed = g?.status === 'closed';
  const [liveShown, setLiveShown] = useState(!isClosed);
  const liveRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isClosed && liveShown) shrinkAway(liveRef.current, () => setLiveShown(false));
    else if (!isClosed && !liveShown) setLiveShown(true);
  }, [isClosed, liveShown]);

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Game" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const isCash = g.type === 'cash';
  const closed = g.status === 'closed';
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const inPlayers = ordered.filter((p) => playerStatus(g, p) !== 'out');
  const outPlayers = ordered.filter((p) => playerStatus(g, p) === 'out');
  const est = estimateStacks(g);
  // an all-in logged against a stack that was only a range: Nightcap asks for a count of that player
  const toCount = needsCount(g);
  const nextN = (g.hands[g.hands.length - 1]?.n ?? 0) + 1;
  // Log hand needs somebody dealt in: playing, and not an exact stack of 0
  const dealtIn = ordered.some((p) => playerStatus(g, p) === 'playing' && !(est.stack[p] === 0 && !(est.spread[p] > 0)));

  const onLight = (pid: ID, v: Light) => {
    const cur = playerStatus(g, pid);
    if (v === cur) return;
    if (v === 'out') { if (isCash) setSheet({ k: 'clockout', pid }); else { st.bust(g.id, pid); toast(`${name(pid)} is out.`); } return; }
    // back in: the store resumes the balance they left with, or buys them in again. Stacks can be adjusted after
    if (cur === 'out') {
      const r = st.backIn(g.id, pid);
      if (r.kind === 'resumed') toast(`${name(pid)} is back with ${units(r.chips)} chips.`);
      else if (r.kind === 'rebuy') toast(`${name(pid)} rebuys ${units(r.chips)} chips.`);
      else if (r.kind === 'reentry') toast(`${name(pid)} re-enters.`);
      return;
    }
    st.setStatus(g.id, pid, v);
    toast(v === 'away' ? `${name(pid)} is away. Clock paused.` : `${name(pid)} is back. Clock running.`);
  };
  const rebuy = (pid: ID) => {
    const amt = isCash ? g.defaultBuyIn : g.tournament!.buyIn;
    // the store adds the buy-in without returning its id, so find the new one by diffing the ids
    const before = new Set(g.buyIns.map((b) => b.id));
    st.addBuyIn(g.id, pid, amt);
    const added = useStore.getState().games.find((x) => x.id === g.id)?.buyIns.find((b) => !before.has(b.id));
    // Undo removes this one buy-in (withUndo would restore the whole game list, which would also undo other edits)
    toast(isCash ? `${name(pid)} rebuys ${units(amt)} chips.` : `${name(pid)} re-enters.`, {
      label: 'Undo',
      run: () => { if (added) st.removeBuyIn(g.id, added.id); },
    });
  };

  return (
    <div className="felt-page">
      <Header back={() => back(closed ? 'games' : '')} share="game" banner={g.name} onRename={(n) => st.updateGame(g.id, (x) => { x.name = n; })} sub={`${gameCaptionNarrow(g)}, ${g.type === 'cash' ? `${g.sb}/${g.bb} Cash` : 'Tournament'}`}
        tabs={[{ label: `Players ${closed ? ordered.length : inPlayers.length}`, on: tab === 'players', go: () => setTab('players') }, { label: `Hands ${g.hands.length}`, on: tab === 'hands', go: () => setTab('hands') }, { label: 'Table', on: false, go: () => go(`game/${g.id}/table`) }]}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setSheet({ k: 'edit' })} aria-label="Game settings"><Icon name="more" /></button>} />

      <SlidePane k={tab} i={tab === 'players' ? 0 : 1}>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
        {closed && (
          <button className="sat-flat sat-card sat-split" style={{ textAlign: 'left' }} onClick={() => backTo(`game/${g.id}/close`)}>
            <span>Game record. This game is closed.</span><span className="sat-small" style={{ color: 'var(--sat-accent-text)', fontWeight: 600 }}>Results and settle up</span>
          </button>
        )}

        {liveShown && <div ref={liveRef}><LiveRow g={g} /></div>}

        <div className="felt-summary">
          <span><Caption tip="inPlay">{isCash ? (closed ? 'Bought in' : 'In play') : 'Pool'}</Caption><b className="sat-num">{isCash ? `${buyInsEquivalent(g, totalBuyInUnits(g))} ${buyInsEquivalent(g, totalBuyInUnits(g)) === '1' ? 'buy-in' : 'buy-ins'}` : money(totalPotMoney(g), g.currency)}</b></span>
          <span><Caption>Chips</Caption><b className="sat-num">{units(totalBuyInUnits(g))}</b></span>
          <span><Caption>{closed ? 'Length' : 'Running'}</Caption><b className="sat-num">{runningLabel(g)}</b></span>
        </div>

        {tab === 'players' && (
          <>
            <div className="sat-split">
              <Caption tip="stack">{closed ? 'Players' : isCash ? 'Playing' : 'Still in'} ({closed ? ordered.length : inPlayers.length})</Caption>
              {!closed && inPlayers.length > 1 && (
                <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
                  <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setSheet({ k: 'move' })}><Icon name="plus" /> Chip move</button>
                  <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setSheet({ k: 'seats' })} aria-label="Shuffle seats" title="Shuffle seats"><Icon name="shuffle" /></button>
                </span>
              )}
            </div>
            {closed ? ordered.map((pid) => (
              <PlayerCard key={pid} g={g} pid={pid} name={name(pid)} stack={null}
                onLight={(v) => onLight(pid, v)} onRebuy={() => rebuy(pid)} onBuyIns={() => setSheet({ k: 'buyins', pid })} />
            )) : <SeatList g={g} ids={inPlayers} render={(pid, handle) => (
              <PlayerCard key={pid} g={g} pid={pid} name={name(pid)} handle={handle} stack={stackLabel(g, est, pid)} countAsk={toCount.includes(pid)}
                onLight={(v) => onLight(pid, v)} onRebuy={() => rebuy(pid)} onBuyIns={() => setSheet({ k: 'buyins', pid })} onCount={() => setSheet({ k: 'count', pid })} />
            )} />}
            {!closed && <AddPlayerCard g={g} />}
            {!closed && outPlayers.length > 0 && (
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
              <button className="felt-addbar" onClick={() => setSheet({ k: 'move' })}><Icon name="plus" /> Chip move</button>
            )}
            <HandList g={g} closed={closed} />
          </>
        )}
      </div>
      </SlidePane>

      {!closed && (
        <div className="sat-bottombar sat-glass-2">
          <button className="sat-btn sat-btn--ghost sat-btn--lg" style={{ flex: '0 0 auto' }} onClick={() => go(isCash ? `game/${g.id}/count` : `game/${g.id}/close`)}>End game</button>
          <button ref={rememberLogButton} className="sat-btn sat-btn--primary sat-btn--lg felt-logbtn" aria-disabled={!dealtIn} title={dealtIn ? undefined : 'Nobody is dealt in. Turn a player green first.'} onClick={(e) => { if (!dealtIn) { toast('Nobody is dealt in. Turn a player green first.'); return; } rememberLogButton(e.currentTarget); go(`game/${g.id}/hand/new`); }}>Log hand {nextN}</button>
        </div>
      )}

      {sheet?.k === 'clockout' && (() => {
        const v = est.stack[sheet.pid];
        const exact = !(est.spread[sheet.pid] > 0);
        return <AmountSheet g={g} title={`Clock out ${name(sheet.pid)}`} label="Chips at clock-out" tip="clockOut" initial={v !== undefined ? Math.max(0, Math.round(v)) : null}
          hint={v !== undefined ? (exact ? 'Filled from the stack estimate. Change it to the real count.' : `Estimate ${stackLabel(g, est, sheet.pid)}. Enter the real count.`) : undefined}
          cta="Clock out" onClose={() => setSheet(null)} onSave={(n) => { st.clockOut(g.id, sheet.pid, n); setSheet(null); toast(`${name(sheet.pid)} clocked out with ${units(n)} chips.`); }} />;
      })()}
      {sheet?.k === 'count' && (() => {
        const v = est.stack[sheet.pid];
        const exact = !(est.spread[sheet.pid] > 0);
        return <AmountSheet g={g} title={`Count ${name(sheet.pid)}`} label="Chips counted" tip="stackCount" initial={exact && v !== undefined ? Math.max(0, Math.round(v)) : null}
          hint={exact ? 'The estimate is exact. A count still overrides it.' : `Estimate ${stackLabel(g, est, sheet.pid)}. The count makes it exact again.`}
          cta="Save count" onClose={() => setSheet(null)}
          onSave={(n) => { st.updateGame(g.id, (x) => { (x.counts ??= []).push({ id: uid(), playerId: sheet.pid, chips: n, at: Date.now() }); }); setSheet(null); toast(`${name(sheet.pid)} counted at ${units(n)} chips.`); }}>
          {isCash && <AddChips g={g} onAdd={(amt) => { st.addBuyIn(g.id, sheet.pid, amt); setSheet(null); toast(`${name(sheet.pid)} rebuys ${units(amt)} chips.`); }} />}
        </AmountSheet>;
      })()}
      {sheet?.k === 'move' && <MoveSheet g={g} name={name} onClose={() => setSheet(null)} />}
      {sheet?.k === 'buyins' && <BuyInsSheet g={g} pid={sheet.pid} name={name(sheet.pid)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'seats' && <SeatDrawSheet g={g} onClose={() => setSheet(null)} />}
      {sheet?.k === 'edit' && <EditGameSheet g={g} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ------------------------------- seats: drag to reorder ------------------------------- */

type Handle = { hold: ReturnType<ReturnType<typeof useDragList<ID>>['grip']>; row: ReturnType<ReturnType<typeof useDragList<ID>>['row']>; seat: number };

/** List whose rows can be dragged by their handle. Dropping saves the new order as seats 1, 2, 3...
    (players who are out keep seats after everyone still in). */
function SeatList({ g, ids, disabled, render }: { g: Game; ids: ID[]; disabled?: boolean; render: (pid: ID, handle?: Handle) => JSX.Element }) {
  const updateGame = useStore((s) => s.updateGame);
  const list = useDragList<ID>(ids, (order) => {
    updateGame(g.id, (x) => {
      const seats: Record<ID, number> = {};
      order.forEach((p, i) => { seats[p] = i + 1; });
      let s = order.length + 1;
      for (const p of [...x.playerIds].sort((a, b) => (x.seats[a] ?? 99) - (x.seats[b] ?? 99))) if (!(p in seats)) seats[p] = s++;
      x.seats = seats;
    });
    toast('Seat order saved.');
  });
  return (
    <div ref={list.wrap} className={`felt-seatlist ${list.listClass}`}>
      {list.slot}
      {ids.map((pid) => render(pid, disabled ? undefined : { hold: list.grip(pid, true), row: list.row(pid), seat: list.projected.indexOf(pid) + 1 }))}
    </div>
  );
}

/* ------------------------------- player card ------------------------------- */

function PlayerCard({ g, pid, name, handle, stack, countAsk, onLight, onRebuy, onBuyIns, onCount }: {
  g: Game; pid: ID; name: string; handle?: Handle; stack: string | null;
  countAsk?: boolean; onLight: (v: Light) => void; onRebuy: () => void; onBuyIns: () => void; onCount?: () => void;
}) {
  const isCash = g.type === 'cash';
  const status = playerStatus(g, pid);
  const n = buyInCount(g, pid);
  const place = tournamentPlace(g, pid);
  const closed = g.status === 'closed';
  return (
    // a press and hold on the grip or on any blank part of the card lifts it for a drag
    <div data-drag-row={handle ? true : undefined} {...handle?.hold} style={handle?.row.style} className={`sat-glass felt-pcard ${status === 'out' ? 'is-out' : ''} ${status === 'away' ? 'is-away' : ''} ${handle?.row.className ?? ''}`}>
      {handle ? (
        <button type="button" className="felt-grip" aria-label={`Seat ${handle.seat}. Press and hold, then drag to change ${name}'s seat`}>
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span className="sat-num">{handle.seat}</span>
        </button>
      ) : <span className="felt-grip is-static"><span className="sat-num">{g.seats[pid] ?? '-'}</span></span>}
      <div className="felt-pcard-main">
        <div className="felt-pcard-top">
          <button type="button" className="felt-pcard-name felt-ellipsis" onClick={() => openPlayer(pid)} aria-label={`Open the player card of ${name}`}>{name}</button>
          {!isCash && place && <span className="sat-badge">{place === 1 ? 'Winner' : `Place ${place}`}</span>}
          <CodeControl pid={pid} />
          {!closed && <StatusLight value={status} onChange={onLight} name={name} outLabel={isCash ? 'Clock out' : 'Bust'} />}
        </div>
        <div className="felt-pcard-stats">
          <span className="felt-buyins">
            <button type="button" onClick={onBuyIns} aria-label={`${n} ${isCash ? (n === 1 ? 'buy-in' : 'buy-ins') : n === 1 ? 'entry' : 'entries'}. Show or change`}>
              <b className="sat-num">{n}</b> {isCash ? (n === 1 ? 'buy-in' : 'buy-ins') : n === 1 ? 'entry' : 'entries'}
            </button>
            {!closed && <button type="button" className="felt-buyins-plus" onClick={onRebuy} aria-label={isCash ? `Rebuy ${units(g.defaultBuyIn)} chips for ${name}` : `Re-enter ${name}`}><Icon name="plus" size={14} stroke={2.4} /></button>}
          </span>
          {stack !== null && status !== 'out' && (
            <span className="felt-stat">
              {onCount && !closed
                ? <button type="button" className={`felt-stat-btn ${countAsk ? 'is-ask' : ''}`} onClick={onCount} aria-label={`Stack ${stack}. ${countAsk ? 'Count needed. ' : ''}Tap to count ${name}'s chips`}>{countAsk ? 'Count' : 'Stack'} <b className="sat-num"><NumericText value={stack} /></b></button>
                : <>Stack <b className="sat-num"><NumericText value={stack} /></b></>}
            </span>
          )}
          {isCash && hasCashedOut(g, pid) && status === 'out' && <span className="felt-stat">Left with <b className="sat-num">{units(cashOutUnits(g, pid))}</b></span>}
          <span className="felt-stat sat-num">{duration(timePlayed(g, pid))}{status === 'away' ? ', paused' : ''}</span>
        </div>
      </div>
    </div>
  );
}

/** Blank card at the end of the list: pick a saved player, or type a new name, to seat them with the default buy-in. */
function AddPlayerCard({ g }: { g: Game }) {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const isCash = g.type === 'cash';
  if (!open)
    return <button className="felt-addbar" onClick={() => setOpen(true)}><Icon name="plus" /> Add player</button>;
  return (
    <div className="sat-flat sat-card sat-stack felt-addcard" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="sat-split">
        <Caption tip="addPlayer">Add player</Caption>
        <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setOpen(false)}>Done</button>
      </div>
      <SeatPicker inGame={g.playerIds} onPick={(p) => {
        st.addPlayerToGame(g.id, p.id);
        toast(`${p.name} seated${isCash ? ` with ${units(g.defaultBuyIn)} chips` : ''}.`);
      }} />
    </div>
  );
}

function HandList({ g, closed }: { g: Game; closed: boolean }) {
  const st = useStore();
  const hands = [...g.hands].reverse();
  const moves = [...(g.moves ?? [])].sort((a, b) => b.afterN - a.afterN || b.at - a.at);
  if (!hands.length && !moves.length) return <Empty title="No hands yet">Log hand adds the first one. The newest stays on top.</Empty>;
  // newest first: each hand is followed (below it) by nothing newer, so moves logged after hand n sit above it
  const rows: ({ k: 'hand'; h: Hand } | { k: 'move'; m: ChipMove })[] = [];
  let mi = 0;
  for (const h of hands) {
    while (mi < moves.length && moves[mi].afterN >= h.n) rows.push({ k: 'move', m: moves[mi++] });
    rows.push({ k: 'hand', h });
  }
  while (mi < moves.length) rows.push({ k: 'move', m: moves[mi++] });
  return (
    <div className="sat-glass-2 felt-list">
      {rows.map((row) => row.k === 'move' ? (
        <MoveRow key={row.m.id} m={row.m} onRemove={closed ? undefined : (e) => shrinkAway(e.currentTarget.closest('.felt-move'), () => { withUndo('Chip move deleted.', () => st.updateGame(g.id, (x) => { x.moves = (x.moves ?? []).filter((y) => y.id !== row.m.id); })); })} />
      ) : (() => { const h = row.h; return h.missed ? (
        <div key={h.id} className="felt-hand felt-hand--missed">
          <div className="sat-split" style={{ flexWrap: 'nowrap' }}>
            <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}><span className="sat-mono sat-small sat-muted">{h.n}</span><span className="sat-muted">Missed hand</span></span>
            {!closed && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={(e) => shrinkAway(e.currentTarget.closest('.felt-hand'), () => withUndo(`Hand ${h.n} deleted.`, () => st.deleteHand(g.id, h.id)))}>Delete</button>}
          </div>
        </div>
      ) : (() => { const card = (
        <button key={h.id} className="felt-hand" onClick={() => go(`game/${g.id}/hand/${h.id}`)}>
          <div className="sat-split" style={{ flexWrap: 'nowrap' }}>
            <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap', minWidth: 0 }}>
              <span className="sat-mono sat-small sat-muted">{h.n}</span>
              <span className="felt-ellipsis" style={{ fontWeight: 600 }}>{h.winners.length ? h.winners.map((w, i) => <Fragment key={w.playerId}>{i ? ' and ' : ''}<PlayerName id={w.playerId} /></Fragment>) : 'No winner'}</span>
              {h.winners.length > 1 && <span className="sat-badge sat-badge--muted">Split</span>}
            </div>
            <span className="sat-num" style={{ fontWeight: 600 }}>{units(h.pot)}</span>
          </div>
          <div className="sat-split" style={{ marginTop: 'var(--sat-space-2)' }}>
            {h.boardNA ? <span className="sat-badge sat-badge--muted">No board</span> : h.board.length ? <Cards cards={h.board} size="sm" /> : <span className="sat-small sat-muted">Won before the flop</span>}
            <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
              {h.dealerId && <span className="sat-small sat-muted"><span className="felt-dealer" style={{ width: 15, height: 15, fontSize: 8 }} aria-label="Button">D</span> <PlayerName id={h.dealerId} /></span>}
              {(h.pots?.length ?? 1) > 1 && <span className="sat-badge sat-badge--muted">{h.pots!.length} pots</span>}
              {h.shown.length > 0 && <span className="sat-badge">{h.shown.length} shown</span>}
              {h.bounty && <span className="sat-badge">7-2 <PlayerName id={h.bounty.playerId} /></span>}
            </div>
          </div>
        </button>
      ); return closed ? card : (
        // a swipe left shows Delete; a long swipe deletes at once. Undo puts the hand back
        <SwipeDelete key={h.id} label={`Delete hand ${h.n}`} onDelete={(r) => shrinkAway(r, () => withUndo(`Hand ${h.n} deleted.`, () => st.deleteHand(g.id, h.id)))}>{card}</SwipeDelete>
      ); })(); })())}
    </div>
  );
}

const MOVE_KIND: { k: ChipMove['kind']; label: string }[] = [
  { k: 'side', label: 'Side game' },
  { k: 'tip', label: 'Tip' },
  { k: 'other', label: 'Other' },
];

/** A chip move in the hand list: a dashed row between hands, so it never reads as a hand. */
function MoveRow({ m, onRemove }: { m: ChipMove; onRemove?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const kind = MOVE_KIND.find((k) => k.k === m.kind)?.label ?? 'Other';
  return (
    <div className="felt-move">
      <div className="sat-split" style={{ flexWrap: 'nowrap' }}>
        <span className="felt-ellipsis"><span className="sat-badge sat-badge--muted">{kind}</span> <b><PlayerName id={m.from} /></b> paid <b>{m.to ? <PlayerName id={m.to} /> : 'off the table'}</b></span>
        <span className="sat-num" style={{ fontWeight: 600 }}>{units(m.amount)}</span>
      </div>
      <div className="sat-split">
        <span className="sat-small sat-muted felt-ellipsis">{m.note || `After hand ${m.afterN}`}</span>
        {onRemove && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
}

/** Log chips that changed hands outside a pot. They change the stacks, not the pots or hand stats. */
function MoveSheet({ g, name, onClose }: { g: Game; name: (id: ID) => string; onClose: () => void }) {
  const st = useStore();
  const ids = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99)).filter((p) => playerStatus(g, p) !== 'out');
  const [kind, setKind] = useState<ChipMove['kind']>('side');
  const [from, setFrom] = useState<ID | null>(null);
  const [to, setTo] = useState<ID | null | undefined>(undefined); // null = off the table
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const n = num(amt);
  const ok = !!from && to !== undefined && to !== from && n !== null && n > 0;
  const afterN = g.hands[g.hands.length - 1]?.n ?? 0;
  const save = () => {
    if (!ok) { toast(!from ? 'Pick who paid.' : to === undefined ? 'Pick who got the chips.' : 'Type the chips moved (for example 20).'); return; }
    st.updateGame(g.id, (x) => {
      (x.moves ??= []).push({ id: uid(), from: from!, to: to ?? undefined, amount: n!, kind, note: note.trim() || undefined, at: Date.now(), afterN });
    });
    toast(`${name(from!)} paid ${to ? name(to) : 'off the table'} ${units(n!)} chips.`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Chip move">
      <Caption tip="moves">Kind</Caption>
      <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Kind of move">
        <TabPill />
        {MOVE_KIND.map((o) => <button key={o.k} type="button" role="radio" aria-checked={kind === o.k} onClick={() => setKind(o.k)}>{o.label}</button>)}
      </div>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <Caption>Paid by</Caption>
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {ids.map((p) => <button key={p} type="button" className="sat-chip" aria-pressed={from === p} onClick={() => { setFrom(p); if (to === p) setTo(undefined); }}>{name(p)}</button>)}
        </div>
      </div>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <Caption>Paid to</Caption>
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {ids.filter((p) => p !== from).map((p) => <button key={p} type="button" className="sat-chip" aria-pressed={to === p} onClick={() => setTo(p)}>{name(p)}</button>)}
          <button type="button" className="sat-chip" aria-pressed={to === null} onClick={() => setTo(null)}>Off the table</button>
        </div>
      </div>
      <div className="sat-field">
        <label htmlFor="mv-amt">Chips</label>
        <input id="mv-amt" className="sat-input sat-num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" />
      </div>
      <div className="sat-field">
        <label htmlFor="mv-note">Note</label>
        <input id="mv-note" className="sat-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, for example High card side bet" />
      </div>
      <WordButton word="Saved" ready={ok} className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!ok} run={save}>Save move</WordButton>
    </Sheet>
  );
}

function AmountSheet({ g, title, label, tip, hint, initial, isMoney, cta = 'Add', onClose, onSave, children }: {
  g: Game; title: string; label?: string; tip?: 'clockOut' | 'stackCount'; hint?: string; initial: number | null; isMoney?: boolean; cta?: string;
  onClose: () => void; onSave: (v: number) => void; children?: ReactNode;
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
        {v !== '' && bad && <span className="sat-error">Use numbers only (for example 200).</span>}
      </div>
      {!isMoney && g.type === 'cash' && !hint && (
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {[0.5, 1, 1.5, 2].map((m) => {
            const amt = Math.round(g.defaultBuyIn * m);
            return <button key={m} className="sat-chip" aria-pressed={n === amt} onClick={() => setV(String(amt))}>{units(amt)}</button>;
          })}
        </div>
      )}
      <WordButton word="Saved" ready={!bad} className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={bad} run={() => { if (!bad) onSave(n!); }}>{cta}</WordButton>
      {children}
    </Sheet>
  );
}

/** Rebuy from the stack: how many chips, then Add chips. Starts at the game's buy-in. */
function AddChips({ g, onAdd }: { g: Game; onAdd: (chips: number) => void }) {
  const [v, setV] = useState(String(g.defaultBuyIn));
  const n = num(v);
  const ok = n !== null && n > 0;
  return (
    <div className="felt-addchips">
      <div className="sat-field">
        <label htmlFor="rebuy">Rebuy (chips) <Help k="addChips" /></label>
        <input id="rebuy" className="sat-input sat-num" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} aria-invalid={v !== '' && !ok} />
      </div>
      <button type="button" className="sat-btn sat-btn--lg" aria-disabled={!ok} onClick={() => { if (ok) onAdd(n!); }}><Icon name="plus" size={16} stroke={2.4} /> Add chips</button>
    </div>
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
            {g.status === 'live' && <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={(e) => shrinkAway(e.currentTarget.closest('.felt-row'), () => st.removeBuyIn(g.id, b.id))} aria-label={`Remove buy-in at ${timeLabel(b.at)}`}><Icon name="trash" /></button>}
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
    return { order: a };
  };
  const [d, setD] = useState(draw);
  const pos = useMemo(() => d.order.map((_, i) => {
    const ang = (i / Math.max(1, d.order.length)) * Math.PI * 2 + Math.PI / 2;
    return { left: 50 + Math.cos(ang) * 44, top: 50 + Math.sin(ang) * 42 };
  }), [d]);
  return (
    <Sheet open onClose={onClose} title="Shuffle seats">
      <div className="sat-split"><Caption>Seats, clockwise</Caption><Help k="seatDraw" /></div>
      <div className="felt-seats">
        <div className="felt-table" />
        {d.order.map((p, i) => (
          <div key={p} className="felt-seat" style={{ left: `${pos[i].left}%`, top: `${pos[i].top}%` }}>
            <span className="felt-avatar sm sat-num">{i + 1}</span>
            {i === 0 && <span className="felt-dealer">D</span>}
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
            // seat 1 takes the button for the next hand, seat 2 the small blind, seat 3 the big blind
            x.firstDealer = d.order[0];
            x.reseatN = (x.hands[x.hands.length - 1]?.n ?? 0) + 1;
          });
          toast('Seats saved. Seat 1 has the button for the next hand.');
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
  const [rules, setRules] = useState(() => gameRules(g, st.settings));
  const save = () => {
    st.updateGame(g.id, (x) => {
      x.name = nm.trim() || x.name;
      x.notes = notes;
      x.groupId = grp;
      x.rules = rules;
      const s = num(sb), b = num(bb);
      if (s && b && b >= s) { x.sb = s; x.bb = b; }
      if (x.type === 'cash') { x.unitValue = num(uv) ?? x.unitValue; x.defaultBuyIn = num(bi) ?? x.defaultBuyIn; }
    });
    onClose();
  };
  // Save sits top right and stays in view; a swipe down or a tap outside leaves without saving
  return (
    <Sheet open onClose={onClose} title="Game settings"
      action={<WordButton word="Saved" className="sat-btn sat-btn--primary sat-btn--sm" run={save}>Save</WordButton>}>
      <div className="sat-field"><label htmlFor="eg-n">Game name</label><input id="eg-n" className="sat-input" value={nm} onChange={(e) => setNm(e.target.value)} /></div>
      <div className="sat-grid" style={{ ['--sat-min' as string]: '110px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
        <div className="sat-field"><label htmlFor="eg-sb">SB (chips)</label><input id="eg-sb" className="sat-input sat-num" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></div>
        <div className="sat-field"><label htmlFor="eg-bb">BB (chips)</label><input id="eg-bb" className="sat-input sat-num" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></div>
        {g.type === 'cash' && <div className="sat-field"><label htmlFor="eg-u">Multiplier ({g.currency}) <Help k="unitValue" /></label><input id="eg-u" className="sat-input sat-num" inputMode="decimal" value={uv} onChange={(e) => setUv(e.target.value)} /></div>}
        {g.type === 'cash' && <div className="sat-field"><label htmlFor="eg-b">Buy-in (chips)</label><input id="eg-b" className="sat-input sat-num" inputMode="numeric" value={bi} onChange={(e) => setBi(e.target.value)} /></div>}
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
      <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
        <div className="sat-split"><h3 className="sat-h3">House rules</h3><Help k="rules" /></div>
        <RulesFields rules={rules} onChange={setRules} players={g.playerIds.length} idPrefix="eg" />
      </section>
      <div className="sat-field"><label htmlFor="eg-x">Notes</label><textarea id="eg-x" className="sat-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }} onClick={() => {
        withUndo(`${g.name} deleted.`, () => st.deleteGame(g.id));
        onClose();
        go('games', true);
      }}><Icon name="trash" /> Delete game</button>
    </Sheet>
  );
}
