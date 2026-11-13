/* Table: the table from above, for a TV, a tablet at the end of the table or a second window. It only reads.
   It follows the hand in play (the recorder's draft on this phone) and replays any finished hand of the game: one step per
   action, with a result at the end. Moving the cursor never changes the record: the table is rebuilt from the action log
   (src/lib/replay.ts gives the actions, src/lib/felt.ts the table at a step, src/components/tableFelt.tsx draws it).
   Public information only: board cards, and hole cards shown at the table, from the showdown on. A private card
   (Hand.private, the recorder's own cards) is never read, so it is never in this page. Cards never shown stay face down. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame, usePlayerName, useStore } from '../store';
import { back, go } from '../router';
import { Empty, Header, Icon } from '../components/ui';
import { TablePage } from '../components/tableFelt';
import { wentToShowdown } from '../lib/hand';
import { exactStacks } from '../lib/stacks';
import { handSteps, tableAt, type Step } from '../lib/replay';
import { FELT_HUES, feltSteps, type FeltAction, type FeltHand } from '../lib/felt';
import { WATCH, onStored } from '../lib/watch';
import type { Card, Game, HandLog, ID } from '../types';

/** The hand in play, as the recorder keeps it on this phone. Only public fields are kept: the recorder's own cards are dropped on read. */
interface LiveHand { n: number; log: HandLog; board: (Card | null)[]; ended: boolean; shown: Record<ID, Card[]> }

const draftKey = (gameId: string) => `felt-draft-${gameId}`;
function readLive(g: Game | undefined): LiveHand | null {
  if (!g || g.status !== 'live') return null;
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(g.id)) ?? 'null') as { v?: number; st?: { n: number; log: HandLog; board: (Card | null)[]; ended: boolean; shown?: Record<ID, (Card | null)[]> } } | null;
    const st = d?.v === 1 ? d.st : null;
    const nNew = (g.hands[g.hands.length - 1]?.n ?? 0) + 1;
    if (!st || st.n !== nNew || !st.log) return null;
    // shown cards are public only once the hand is at the showdown; before that nothing is kept
    const shown: Record<ID, Card[]> = {};
    if (st.ended) for (const [p, cs] of Object.entries(st.shown ?? {})) { const c = (cs ?? []).filter(Boolean) as Card[]; if (c.length === 2) shown[p] = c; }
    return { n: st.n, log: st.log, board: st.board ?? [], ended: !!st.ended, shown };
  } catch { return null; }
}

/** Follow the draft: the storage event (another window), a store write (this window or another), and a slow poll as a floor. */
function useLive(g: Game | undefined): LiveHand | null {
  const [live, setLive] = useState(() => readLive(g));
  const ref = useRef(g);
  ref.current = g;
  useEffect(() => {
    const read = () => setLive((was) => { const now = readLive(ref.current); return JSON.stringify(now) === JSON.stringify(was) ? was : now; });
    read();
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === draftKey(ref.current?.id ?? '')) read(); };
    window.addEventListener('storage', onStorage);
    const t = window.setInterval(read, 1000);
    return () => { window.removeEventListener('storage', onStorage); window.clearInterval(t); };
  }, [g?.id, g?.hands.length, g?.status]);
  return live;
}

const acts = (steps: Step[]): FeltAction[] => steps.map((s) => ({ id: s.pid, seg: s.street, k: s.k, to: s.to, add: s.add, allin: s.allin }));

export default function Spectator({ gameId, alone = false }: { gameId: string; alone?: boolean }) {
  const g = useGame(gameId);
  // the spectator window reads the saved data again whenever another window saves it
  useEffect(() => (WATCH ? onStored(() => { void useStore.persist.rehydrate(); }) : undefined), []);
  if (!g) return <div className="felt-page"><Header back={alone ? undefined : () => go('')} title="Table" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  return <SpectatorBody g={g} alone={alone} />;
}

function SpectatorBody({ g, alone }: { g: Game; alone: boolean }) {
  const name = usePlayerName();
  const live = useLive(g);
  const people = useStore((s) => s.players);
  // names and looks: a change in either redraws the hands
  const names = g.playerIds.map((id) => { const p = people.find((x) => x.id === id); return `${p?.name}/${p?.look?.hue}/${p?.look?.photo?.length}`; }).join('|');
  // seats in table order; a player keeps one colour through the game
  const seats = (ids: ID[]) => [...ids].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99)).map((id) => { const look = people.find((p) => p.id === id)?.look; return { id, name: name(id), hue: look?.hue ?? Math.max(0, g.playerIds.indexOf(id)) % FELT_HUES.length, photo: look?.photo }; });

  const hands: FeltHand[] = useMemo(() => g.hands.filter((h) => h.log && !h.missed).map((h) => {
    const log = h.log!, start = exactStacks(g, h.n), board = (h.board ?? []).filter(Boolean) as Card[];
    const shown: Record<ID, Card[]> = {};
    for (const s of h.shown ?? []) if (s.cards?.length === 2) shown[s.playerId] = s.cards;
    // chips paid at the result: each winner's share, and an uncalled bet back to its player
    const won: Record<ID, number> = {};
    for (const w of h.winners) won[w.playerId] = (won[w.playerId] ?? 0) + w.amount;
    for (const [p, v] of Object.entries(h.returned ?? {})) won[p] = (won[p] ?? 0) + v;
    return {
      n: h.n, live: false, players: seats(log.dealt), dealt: log.dealt, button: log.button ?? null,
      steps: feltSteps(acts(handSteps(g, log, start)), { board: board.length, show: Object.keys(shown).length > 0, win: true }),
      start, board, shown, pays: Object.entries(won).filter(([, v]) => v > 0).map(([id, amount]) => ({ id, amount })),
      toActEnd: null, bb: g.bb, showdown: wentToShowdown(log), winners: [...new Set(h.winners.map((w) => name(w.playerId)))],
    };
  }), [g, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const now: FeltHand | null = useMemo(() => {
    if (!live) return null;
    const start = exactStacks(g, live.n), steps = handSteps(g, live.log, start);
    const at = live.board.findIndex((c) => !c), board = (at < 0 ? live.board : live.board.slice(0, at)) as Card[];
    return {
      n: live.n, live: true, players: seats(live.log.dealt), dealt: live.log.dealt, button: live.log.button ?? null,
      steps: feltSteps(acts(steps), { board: board.length, show: live.ended && Object.keys(live.shown).length > 0, win: false }),
      start, board, shown: live.shown, pays: [], toActEnd: live.ended ? null : tableAt({ g, log: live.log, steps, start, board: live.board, live: true }, steps.length).toAct,
      bb: g.bb, showdown: true, winners: [],
    };
  }, [g, live, names]); // eslint-disable-line react-hooks/exhaustive-deps

  // no hand on the table: every seated player with the stack they have
  const idle: FeltHand = useMemo(() => ({
    n: 0, live: false, players: seats(g.playerIds.filter((p) => g.seats[p] !== undefined)), dealt: [], button: null, steps: [],
    start: exactStacks(g, (g.hands[g.hands.length - 1]?.n ?? 0) + 1), board: [], shown: {}, pays: [], toActEnd: null, bb: g.bb, showdown: false, winners: [],
  }), [g, names]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TablePage hands={hands} live={now} idle={idle} canLive={g.status === 'live'} onBack={alone ? undefined : () => back(`game/${g.id}`)}
      corner={alone ? undefined : (
        <button type="button" className="tfp-round" aria-label="Open the table in a new window" onClick={() => window.open(`${location.pathname}#/watch/${g.id}`, `nightcap-watch-${g.id}`)}><Icon name="link" /></button>
      )} />
  );
}
