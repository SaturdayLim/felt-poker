/* Rebuy offer for busted players (cash games only).

   API for the hand recorder (agent B), after a hand is saved:

     const rebuy = useRebuyOffer(gameId);
     ...
     rebuy.offer(savedHand);   // the hand must already be in the store (st.saveHand ran first)
     ...
     return <>{...}{rebuy.sheet}</>;   // render once, anywhere in the screen

   `offer(hand)` uses `bustedAfterSave(g, hand)` from lib/stacks: players who busted in `hand`, `rebuyOffered` still
   allows (no buy-in after the hand closed) and NO LATER HAND exists (re-editing hand 5 after hands 6 to 9 offers
   nothing). Players skipped in this session are dropped; the sheet opens when any are left.
   The recorder can call `bustedAfterSave(g, hand).length` to decide whether to wait for the sheet before the next hand.
   Tournaments, games with nobody busted and games whose `defaultBuyIn` is not above 0 do nothing (the sheet renders null). The sheet never blocks: Skip, a swipe down or a tap outside
   leaves it, and a skipped player is not offered again for that hand until the page reloads.

   `RebuySheet({ g, pids, onClose })` is the sheet itself. Per player: "Rebuy for N chips?", a stepper in whole buy-ins
   (starts at one buy-in; the amount can be typed freely, but never empty or 0)
   and Skip. A rebuy calls `addBuyIn(g.id, pid, chips)`; the player stays active. */
import { useState, type ReactNode } from 'react';
import { useStore, usePlayerName } from '../store';
import { Help, Icon, Sheet, num, toast } from './ui';
import { bustedAfterSave, rebuyDefault, rebuyOffered } from '../lib/stacks';
import { units } from '../lib/format';
import type { Game, Hand, ID } from '../types';

function RebuyRow({ g, pid, name, onDone }: { g: Game; pid: ID; name: string; onDone: () => void }) {
  const st = useStore();
  const buyIn = g.defaultBuyIn;
  // the amount starts at one buy-in and can be typed freely; it cannot be empty or 0
  const [v, setV] = useState(() => String(rebuyDefault(g, pid)));
  const chips = Math.max(0, Math.round((num(v) ?? 0) * 100) / 100);
  const ok = chips > 0;
  const step = (d: number) => setV(String(Math.max(buyIn, (ok ? chips : buyIn) + d * buyIn)));
  return (
    <div className="felt-rebuy-row sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="felt-rebuy-q"><b>{name}</b> <span>Rebuy for {ok ? units(chips) : 0} chips?</span><Help k="rebuy" /></div>
      <div className="felt-rebuy-ctl">
        <div className="felt-rebuy-step" role="group" aria-label={`Rebuy amount for ${name}`}>
          <button type="button" className="sat-btn sat-iconbtn" aria-label="One buy-in less" onClick={() => step(-1)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
          <input className="sat-input sat-num felt-rebuy-n" inputMode="numeric" aria-label="Rebuy chips" aria-invalid={!ok} value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} />
          <button type="button" className="sat-btn sat-iconbtn" aria-label="One buy-in more" onClick={() => step(1)}><Icon name="plus" /></button>
        </div>
        <button type="button" className="sat-btn sat-btn--primary" aria-disabled={!ok} onClick={() => { if (!ok) return; st.addBuyIn(g.id, pid, chips); toast(`${name} rebuys ${units(chips)} chips.`); onDone(); }}>Rebuy</button>
        <button type="button" className="sat-btn sat-btn--ghost" onClick={onDone}>Skip</button>
      </div>
    </div>
  );
}

export function RebuySheet({ g, pids, onClose }: { g: Game; pids: ID[]; onClose: () => void }) {
  const name = usePlayerName();
  const [done, setDone] = useState<ID[]>([]);
  const left = pids.filter((p) => !done.includes(p));
  // no buy-in size: nothing to step by, nothing to default to
  if (!(g.defaultBuyIn > 0)) return null;
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
    if (!g || g.type !== 'cash' || !(g.defaultBuyIn > 0)) return;
    const list = bustedAfterSave(g, h).filter((p) => !skipped.has(`${h.id}:${p}`));
    if (!list.length) return;
    setHand(h);
    setPids(list);
  };
  const close = () => { if (hand) pids.forEach((p) => { if (rebuyOffered(useStore.getState().games.find((x) => x.id === gameId)!, hand, p)) skipped.add(`${hand.id}:${p}`); }); setPids([]); setHand(null); };
  const sheet = game && pids.length > 0 ? <RebuySheet g={game} pids={pids} onClose={close} /> : null;
  return { offer, sheet };
}
