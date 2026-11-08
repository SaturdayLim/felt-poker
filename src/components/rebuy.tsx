/* Rebuy offer for busted players (cash games only).

   API for the hand recorder (agent B), after a hand is saved:

     const rebuy = useRebuyOffer(gameId);
     ...
     rebuy.offer(savedHand);   // the hand must already be in the store (st.saveHand ran first)
     ...
     return <>{...}{rebuy.sheet}</>;   // render once, anywhere in the screen

   `offer(hand)` finds the players who busted in `hand` (bustedPlayers), keeps those that `rebuyOffered` still allows
   (no buy-in after the hand closed) and that were not skipped in this session, and opens the sheet when any are left.
   Tournaments and games with nobody busted do nothing. The sheet never blocks: Skip, a swipe down or a tap outside
   leaves it, and a skipped player is not offered again for that hand until the page reloads.

   `RebuySheet({ g, pids, onClose })` is the sheet itself. Per player: "Rebuy for N chips?", a stepper in whole buy-ins
   (starts at rebuyDefault, minimum 1 buy-in, maximum the biggest other stack rounded down to whole buy-ins, at least 1)
   and Skip. A rebuy calls `addBuyIn(g.id, pid, chips)`; the player stays active. */
import { useState, type ReactNode } from 'react';
import { useStore, usePlayerName } from '../store';
import { Icon, Sheet, num, toast } from './ui';
import { bustedPlayers, estimateStacks, rebuyDefault, rebuyOffered } from '../lib/stacks';
import { playerStatus } from '../lib/calc';
import { units } from '../lib/format';
import type { Game, Hand, ID } from '../types';

/** Whole buy-ins in the biggest stack of the other players still in (at least 1). */
function maxBuyIns(g: Game, pid: ID): number {
  const est = estimateStacks(g);
  const biggest = Math.max(0, ...g.playerIds.filter((p) => p !== pid && playerStatus(g, p) !== 'out').map((p) => est.stack[p] ?? 0));
  return Math.max(1, Math.floor(biggest / g.defaultBuyIn + 1e-9));
}

function RebuyRow({ g, pid, name, onDone }: { g: Game; pid: ID; name: string; onDone: () => void }) {
  const st = useStore();
  const buyIn = g.defaultBuyIn;
  const max = maxBuyIns(g, pid);
  // the amount starts at the default (whole buy-ins up to the biggest stack) and can be typed freely: nothing blocks it
  const [v, setV] = useState(() => String(Math.min(max, Math.max(1, Math.round(rebuyDefault(g, pid) / buyIn))) * buyIn));
  const chips = Math.max(0, Math.round((num(v) ?? 0) * 100) / 100);
  const ok = chips > 0;
  const step = (d: number) => setV(String(Math.max(buyIn, (ok ? chips : buyIn) + d * buyIn)));
  return (
    <div className="felt-rebuy-row sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="felt-rebuy-q"><b>{name}</b> <span>Rebuy for how many chips?</span></div>
      <div className="felt-rebuy-ctl">
        <div className="felt-rebuy-step" role="group" aria-label={`Rebuy amount for ${name}`}>
          <button type="button" className="sat-btn sat-iconbtn" aria-label="One buy-in less" onClick={() => step(-1)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
          <input className="sat-input sat-num felt-rebuy-n" inputMode="numeric" aria-label="Rebuy chips" aria-invalid={!ok} value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} />
          <button type="button" className="sat-btn sat-iconbtn" aria-label="One buy-in more" onClick={() => step(1)}><Icon name="plus" /></button>
        </div>
        <button type="button" className="sat-btn sat-btn--primary" aria-disabled={!ok} onClick={() => { if (!ok) return; st.addBuyIn(g.id, pid, chips); toast(`${name} rebuys ${units(chips)} chips.`); onDone(); }}>Rebuy</button>
        <button type="button" className="sat-btn sat-btn--ghost" onClick={onDone}>Skip</button>
      </div>
      <span className="sat-small sat-muted">{units(buyIn)} chips is one buy-in. The biggest stack allows {max} {max === 1 ? 'buy-in' : 'buy-ins'}. Any amount works.</span>
    </div>
  );
}

export function RebuySheet({ g, pids, onClose }: { g: Game; pids: ID[]; onClose: () => void }) {
  const name = usePlayerName();
  const [done, setDone] = useState<ID[]>([]);
  const left = pids.filter((p) => !done.includes(p));
  const finish = (p: ID) => { const next = [...done, p]; setDone(next); if (pids.every((x) => next.includes(x))) onClose(); };
  return (
    <Sheet open onClose={onClose} title="Rebuy" sub={left.length > 1 ? 'These players have no chips.' : 'This player has no chips.'}>
      {left.map((p) => <RebuyRow key={p} g={g} pid={p} name={name(p)} onDone={() => finish(p)} />)}
    </Sheet>
  );
}

/** Players skipped in this session, as `handId:playerId`. */
const skipped = new Set<string>();

export function useRebuyOffer(gameId: ID): { offer: (hand: Hand) => void; sheet: ReactNode } {
  const [pids, setPids] = useState<ID[]>([]);
  const [hand, setHand] = useState<Hand | null>(null);
  const game = useStore((s) => s.games.find((x) => x.id === gameId));
  const offer = (h: Hand) => {
    const g = useStore.getState().games.find((x) => x.id === gameId);
    if (!g || g.type !== 'cash') return;
    const list = bustedPlayers(g, h).filter((p) => rebuyOffered(g, h, p) && !skipped.has(`${h.id}:${p}`));
    if (!list.length) return;
    setHand(h);
    setPids(list);
  };
  const close = () => { if (hand) pids.forEach((p) => { if (rebuyOffered(useStore.getState().games.find((x) => x.id === gameId)!, hand, p)) skipped.add(`${hand.id}:${p}`); }); setPids([]); setHand(null); };
  const sheet = game && pids.length > 0 ? <RebuySheet g={game} pids={pids} onClose={close} /> : null;
  return { offer, sheet };
}
