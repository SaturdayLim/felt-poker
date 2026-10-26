import { useMemo, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Empty, Help, Icon, PlayingCard, num, toast } from '../components/ui';
import { RANKS, SUITS, SUIT_COLOR, SUIT_SYMBOL, bestHand } from '../lib/cards';
import { playerStatus } from '../lib/calc';
import { inBB, money, units } from '../lib/format';
import { uid } from '../lib/ids';
import type { Card, Game, Hand, ID } from '../types';

type Target = { kind: 'board'; i: number } | { kind: 'shown'; idx: number; ci: number } | null;

interface Draft {
  id: string;
  n: number;
  at: number;
  dealerId?: ID;
  pot: string;
  winners: ID[];
  split: Record<ID, string>;
  customSplit: boolean;
  board: (Card | null)[];
  boardNA: boolean;
  shown: { playerId: ID; cards: (Card | null)[] }[];
  allIn: boolean;
  straddle: boolean;
  tags: string[];
  note: string;
}

function seatOrder(g: Game, onlyActive: boolean): ID[] {
  return [...g.playerIds]
    .filter((p) => !onlyActive || playerStatus(g, p) !== 'out')
    .sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
}

function nextDealer(g: Game, prev?: ID): ID | undefined {
  const order = seatOrder(g, true);
  if (!order.length) return undefined;
  if (!prev) return g.firstDealer && order.includes(g.firstDealer) ? g.firstDealer : order[0];
  const prevSeat = g.seats[prev] ?? 0;
  return order.find((p) => (g.seats[p] ?? 0) > prevSeat) ?? order[0];
}

function blank(g: Game): Draft {
  const last = g.hands[g.hands.length - 1];
  return {
    id: uid(), n: (last?.n ?? 0) + 1, at: Date.now(), dealerId: nextDealer(g, last?.dealerId),
    pot: '', winners: [], split: {}, customSplit: false, board: [null, null, null, null, null], boardNA: false,
    shown: [], allIn: false, straddle: false, tags: [], note: '',
  };
}

function fromHand(h: Hand): Draft {
  return {
    id: h.id, n: h.n, at: h.at, dealerId: h.dealerId, pot: String(h.pot),
    winners: h.winners.map((w) => w.playerId),
    split: Object.fromEntries(h.winners.map((w) => [w.playerId, String(w.amount)])),
    customSplit: h.winners.length > 1 && new Set(h.winners.map((w) => w.amount)).size > 1,
    board: [0, 1, 2, 3, 4].map((i) => h.board[i] ?? null), boardNA: h.boardNA,
    shown: h.shown.map((s) => ({ playerId: s.playerId, cards: [s.cards[0] ?? null, s.cards[1] ?? null] })),
    allIn: h.allIn, straddle: h.straddle, tags: [...h.tags], note: h.note ?? '',
  };
}

/** Even split; odd chips go to the first winners. */
function evenSplit(pot: number, winners: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  if (!winners.length) return out;
  const base = Math.floor((pot / winners.length) * 100) / 100;
  let rest = Math.round((pot - base * winners.length) * 100) / 100;
  for (const w of winners) {
    const add = rest > 0 ? Math.min(rest, 1) : 0;
    out[w] = Math.round((base + add) * 100) / 100;
    rest = Math.round((rest - add) * 100) / 100;
  }
  return out;
}

export default function HandEditor({ gameId, handId }: { gameId: string; handId?: string }) {
  const g = useGame(gameId);
  const settings = useStore((s) => s.settings);
  const saveHand = useStore((s) => s.saveHand);
  const deleteHand = useStore((s) => s.deleteHand);
  const updateSettings = useStore((s) => s.updateSettings);
  const name = usePlayerName();
  const existing = g?.hands.find((h) => h.id === handId);
  const [d, setD] = useState<Draft | null>(() => (g ? (existing ? fromHand(existing) : blank(g)) : null));
  const [target, setTarget] = useState<Target>(existing ? null : { kind: 'board', i: 0 });
  const [newTag, setNewTag] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const used = useMemo(() => {
    const s = new Set<Card>();
    if (!d) return s;
    d.board.forEach((c) => c && s.add(c));
    d.shown.forEach((x) => x.cards.forEach((c) => c && s.add(c)));
    return s;
  }, [d]);

  if (!g || !d) return <div className="screen plain"><Empty icon="cards">This game doesn't exist any more.</Empty></div>;
  const m = settings.markers;
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const potN = num(d.pot) ?? 0;
  const order = seatOrder(g, false);
  const active = seatOrder(g, true);
  const boardCards = d.board.filter(Boolean) as Card[];
  const boardDone = !d.boardNA && boardCards.length === 5;

  const shownValues = d.shown.map((s) => {
    const cs = s.cards.filter(Boolean) as Card[];
    return boardDone && cs.length === 2 ? bestHand([...cs, ...boardCards]) : null;
  });
  const bestScore = Math.max(-1, ...shownValues.map((v) => v?.score ?? -1));

  /* --------- card targeting --------- */
  const pick = (c: Card) => {
    if (!target) return;
    const nd = structuredClone(d);
    if (target.kind === 'board') nd.board[target.i] = c;
    else nd.shown[target.idx].cards[target.ci] = c;
    setD(nd);
    setTarget(advance(nd, target));
  };
  const clearTarget = (t: Exclude<Target, null>) => {
    const nd = structuredClone(d);
    if (t.kind === 'board') nd.board[t.i] = null;
    else nd.shown[t.idx].cards[t.ci] = null;
    setD(nd);
    setTarget(t);
  };
  const tapSlot = (t: Exclude<Target, null>, filled: boolean) => {
    const same = target && target.kind === t.kind && JSON.stringify(target) === JSON.stringify(t);
    if (same && filled) clearTarget(t);
    else setTarget(t);
  };
  const isTarget = (t: Exclude<Target, null>) => !!target && JSON.stringify(target) === JSON.stringify(t);

  /* --------- winners --------- */
  const toggleWinner = (p: ID) => {
    const w = d.winners.includes(p) ? d.winners.filter((x) => x !== p) : [...d.winners, p];
    set({ winners: w, customSplit: w.length > 1 ? d.customSplit : false });
  };
  const amounts: Record<ID, number> = d.customSplit
    ? Object.fromEntries(d.winners.map((w) => [w, num(d.split[w] ?? '') ?? 0]))
    : evenSplit(potN, d.winners);
  const splitSum = Object.values(amounts).reduce((a, b) => a + b, 0);
  const splitOk = !d.customSplit || Math.abs(splitSum - potN) < 0.005;

  const autoWinner = () => {
    const ws = d.shown.filter((_, i) => shownValues[i] && shownValues[i]!.score === bestScore).map((s) => s.playerId);
    if (ws.length) set({ winners: ws, customSplit: false });
  };

  /* --------- shown hands --------- */
  const addShown = (p: ID) => {
    const nd = structuredClone(d);
    nd.shown.push({ playerId: p, cards: [null, null] });
    setD(nd);
    setTarget({ kind: 'shown', idx: nd.shown.length - 1, ci: 0 });
  };
  const removeShown = (idx: number) => {
    const nd = structuredClone(d);
    nd.shown.splice(idx, 1);
    setD(nd);
    setTarget(null);
  };

  const valid = potN >= 0 && d.winners.length > 0 && splitOk;

  const toHand = (): Hand => ({
    id: d.id, n: d.n, at: d.at, dealerId: m.dealer ? d.dealerId : undefined, pot: potN,
    winners: d.winners.map((w) => ({ playerId: w, amount: amounts[w] ?? 0 })),
    board: d.boardNA ? [] : (d.board.filter(Boolean) as Card[]), boardNA: d.boardNA,
    shown: d.shown.map((s) => ({ playerId: s.playerId, cards: s.cards.filter(Boolean) as Card[] })).filter((s) => s.cards.length),
    allIn: d.allIn, straddle: d.straddle, tags: d.tags, note: d.note.trim() || undefined,
  });

  const save = (next: boolean) => {
    if (!valid) { toast(d.winners.length ? 'The split has to add up to the pot' : 'Pick who won'); return; }
    saveHand(g.id, toHand());
    if (next) {
      const fresh = useStore.getState().games.find((x) => x.id === g.id)!;
      setD(blank(fresh));
      setTarget({ kind: 'board', i: 0 });
      window.scrollTo(0, 0);
      toast(`Hand ${d.n} saved`);
    } else {
      back(`game/${g.id}`);
    }
  };

  const tagPool = [...new Set([...settings.tags, ...d.tags])];

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back(`game/${g.id}`)} aria-label="Back"><Icon name="back" /></button>
        <div className="titles"><h1>Hand {d.n}</h1><div className="sub">{g.name}</div></div>
        {existing ? (
          <button className="icon-btn danger" style={confirmDel ? { background: 'var(--seal)', color: 'var(--on-seal)' } : undefined} aria-label="Delete hand"
            onClick={() => { if (!confirmDel) { setConfirmDel(true); toast('Tap again to delete'); return; } deleteHand(g.id, d.id); go(`game/${g.id}`, true); }}>
            <Icon name="trash" />
          </button>
        ) : <span style={{ width: 44 }} />}
      </div>

      {m.dealer && (
        <div>
          <div className="row" style={{ gap: 4, marginBottom: 8 }}><span className="label">Dealer</span><Help k="dealer" /></div>
          <div className="chips scroll">
            {active.map((p) => (
              <button key={p} className="chip" aria-pressed={d.dealerId === p} onClick={() => set({ dealerId: p })}>
                {d.dealerId === p && <span className="dealer-btn">D</span>}{name(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 4, marginBottom: 8 }}><span className="label">Pot</span><Help k="pot" /></div>
        <div className="input-wrap">
          <input className="input big" inputMode="decimal" placeholder="0" value={d.pot} onChange={(e) => set({ pot: e.target.value })} />
          <span className="suffix">units</span>
        </div>
        {potN > 0 && <div className="small muted" style={{ marginTop: 6 }}>{inBB(g, potN)}{g.type === 'cash' && <>, or {money(potN * g.unitValue, g.currency)}</>}</div>}
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="label">{d.winners.length > 1 ? 'Winners, split pot' : 'Winner'}</span>
          {d.shown.length >= 2 && boardDone && <button className="btn xs" onClick={autoWinner}><Icon name="bolt" /> Best hand wins</button>}
        </div>
        <div className="chips">
          {order.map((p) => (
            <button key={p} className="chip" aria-pressed={d.winners.includes(p)} onClick={() => toggleWinner(p)}>
              {d.winners.includes(p) && <Icon name="trophy" size={14} />}{name(p)}
            </button>
          ))}
        </div>
        {d.winners.length > 1 && (
          <div className="card" style={{ marginTop: 12, padding: '4px 12px' }}>
            {d.winners.map((w) => (
              <div key={w} className="list-row" style={{ padding: '8px 0' }}>
                <span className="grow" style={{ fontWeight: 600 }}>{name(w)}</span>
                {d.customSplit ? (
                  <input className="input num" style={{ width: 110, minHeight: 40, fontSize: 15 }} inputMode="decimal" value={d.split[w] ?? ''}
                    onChange={(e) => set({ split: { ...d.split, [w]: e.target.value } })} />
                ) : <span className="num">{units(amounts[w] ?? 0)}</span>}
              </div>
            ))}
            <div className="row between" style={{ padding: '8px 0' }}>
              <button className="btn xs" onClick={() => set({
                customSplit: !d.customSplit,
                split: Object.fromEntries(d.winners.map((w) => [w, String(amounts[w] ?? 0)])),
              })}>{d.customSplit ? 'Split evenly' : 'Set amounts'}</button>
              {d.customSplit && <span className={`small num ${splitOk ? 'up' : 'down'}`}>{units(splitSum)} of {units(potN)}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="label">Board</span>
          <span className="row" style={{ gap: 4 }}>
            <button className="chip sm amber" aria-pressed={d.boardNA} onClick={() => { set({ boardNA: !d.boardNA }); setTarget(null); }}>
              {d.boardNA ? <Icon name="check" size={13} /> : null} No board
            </button>
            <Help k="boardNA" />
          </span>
        </div>
        {d.boardNA ? (
          <div className="small muted">The board isn't recorded for this hand.</div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            {d.board.map((c, i) => (
              <span key={i} style={{ marginRight: i === 2 || i === 3 ? 6 : 0 }}>
                <PlayingCard card={c} size="lg" target={isTarget({ kind: 'board', i })} placeholder={i < 3 ? 'F' : i === 3 ? 'T' : 'R'}
                  onClick={() => tapSlot({ kind: 'board', i }, !!c)} />
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="row" style={{ gap: 4, marginBottom: 8 }}><span className="label">Shown cards</span><Help k="shown" /></div>
        {d.shown.map((s, idx) => {
          const v = shownValues[idx];
          const top = v && v.score === bestScore;
          return (
            <div key={s.playerId} className="row" style={{ padding: '8px 0' }}>
              <span className="grow" style={{ fontWeight: 700 }}>{name(s.playerId)}
                {v && <div className={`tiny ${top ? 'up' : 'muted'}`}>{v.name}{top ? ', best hand' : ''}</div>}
              </span>
              {s.cards.map((c, ci) => (
                <PlayingCard key={ci} card={c} target={isTarget({ kind: 'shown', idx, ci })} onClick={() => tapSlot({ kind: 'shown', idx, ci }, !!c)} />
              ))}
              <button className="icon-btn" onClick={() => removeShown(idx)} aria-label={`Remove ${name(s.playerId)}'s cards`}><Icon name="close" /></button>
            </div>
          );
        })}
        <div className="chips" style={{ marginTop: 10 }}>
          {order.filter((p) => !d.shown.some((s) => s.playerId === p)).map((p) => (
            <button key={p} className="chip sm" onClick={() => addShown(p)}><Icon name="plus" size={12} />{name(p)}</button>
          ))}
        </div>
      </div>

      {target && (
        <div className="glass picker-shell">
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="small" style={{ fontWeight: 700 }}>
              {target.kind === 'board' ? ['Flop, card 1', 'Flop, card 2', 'Flop, card 3', 'Turn', 'River'][target.i] : `${name(d.shown[target.idx]?.playerId)}, card ${target.ci + 1}`}
            </span>
            <button className="btn xs" onClick={() => setTarget(null)}>Done</button>
          </div>
          <div className="picker">
            {SUITS.flatMap((s) => RANKS.map((r) => {
              const c = r + s;
              const current = target.kind === 'board' ? d.board[target.i] : d.shown[target.idx]?.cards[target.ci];
              return (
                <button key={c} disabled={used.has(c) && c !== current} onClick={() => pick(c)} aria-label={c}>
                  <span className="r" style={{ color: SUIT_COLOR[s] }}>{r === 'T' ? '10' : r}</span>
                  <span className="s" style={{ color: SUIT_COLOR[s] }}>{SUIT_SYMBOL[s]}</span>
                </button>
              );
            }))}
          </div>
        </div>
      )}

      {(m.allIn || m.straddle) && (
        <div className="section" style={{ marginTop: 18 }}>
          <div className="label" style={{ marginBottom: 8 }}>Markers</div>
          <div className="chips">
            {m.allIn && <button className="chip seal" aria-pressed={d.allIn} onClick={() => set({ allIn: !d.allIn })}>All-in</button>}
            {m.straddle && <button className="chip" aria-pressed={d.straddle} onClick={() => set({ straddle: !d.straddle })}>Straddle</button>}
          </div>
        </div>
      )}

      {m.tags && (
        <div className="section" style={{ marginTop: 18 }}>
          <div className="label" style={{ marginBottom: 8 }}>Tags</div>
          <div className="chips">
            {tagPool.map((t) => (
              <button key={t} className="chip amber" aria-pressed={d.tags.includes(t)} onClick={() => set({ tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] })}>{t}</button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input grow" style={{ minHeight: 42, fontSize: 15 }} placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
            <button className="btn sm" style={{ minHeight: 42 }} disabled={!newTag.trim()} onClick={() => {
              const t = newTag.trim();
              if (!settings.tags.includes(t)) updateSettings({ tags: [...settings.tags, t] });
              set({ tags: [...new Set([...d.tags, t])] });
              setNewTag('');
            }}>Add</button>
          </div>
        </div>
      )}

      <label className="field section" style={{ marginTop: 18 }}>
        <span className="label">Note</span>
        <textarea className="input" placeholder="Optional" value={d.note} onChange={(e) => set({ note: e.target.value })} />
      </label>

      <div className="fab-bar"><div className="inner glass">
        {!existing && <button className="btn lg" style={{ flex: '0 0 auto' }} disabled={!valid} onClick={() => save(true)}>Save, next hand</button>}
        <button className="btn primary lg" disabled={!valid} onClick={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</button>
      </div></div>
    </div>
  );
}

/** Move the picker to the next empty slot after filling one. */
function advance(d: Draft, t: Exclude<Target, null>): Target {
  const slots: Exclude<Target, null>[] = [];
  if (!d.boardNA) for (let i = 0; i < 5; i++) slots.push({ kind: 'board', i });
  d.shown.forEach((_, idx) => { slots.push({ kind: 'shown', idx, ci: 0 }, { kind: 'shown', idx, ci: 1 }); });
  const isEmpty = (s: Exclude<Target, null>) => (s.kind === 'board' ? !d.board[s.i] : !d.shown[s.idx].cards[s.ci]);
  const start = slots.findIndex((s) => JSON.stringify(s) === JSON.stringify(t));
  for (let k = start + 1; k < slots.length; k++) {
    // only auto-advance within the same group (board, or the same player's hand)
    const s = slots[k];
    if (s.kind !== t.kind || (s.kind === 'shown' && t.kind === 'shown' && s.idx !== t.idx)) break;
    if (isEmpty(s)) return s;
  }
  return null;
}

