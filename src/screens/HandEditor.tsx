import { useMemo, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, PlayingCard, num, toast } from '../components/ui';
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

  if (!g || !d) return <div className="felt-page"><Header back={() => go('')} title="Hand" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
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
    if (!valid) { toast(d.winners.length ? 'Split amounts do not add up to the pot. Check each share.' : 'No winner picked. Tap a name under Winner.'); return; }
    saveHand(g.id, toHand());
    if (next) {
      const fresh = useStore.getState().games.find((x) => x.id === g.id)!;
      setD(blank(fresh));
      setTarget({ kind: 'board', i: 0 });
      window.scrollTo(0, 0);
      toast(`Hand ${d.n} saved to the game`);
    } else {
      back(`game/${g.id}`);
    }
  };

  const tagPool = [...new Set([...settings.tags, ...d.tags])];

  const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}`)} title={`Hand ${d.n}`} sub={g.name}
        right={existing ? (
          <button className="sat-btn sat-btn--ghost sat-iconbtn" style={confirmDel ? { color: 'var(--sat-neg)' } : undefined} aria-label={confirmDel ? 'Tap again to delete this hand' : 'Delete hand'}
            onClick={() => { if (!confirmDel) { setConfirmDel(true); toast('Tap the bin again to delete this hand'); return; } deleteHand(g.id, d.id); go(`game/${g.id}`, true); }}>
            <Icon name="trash" />
          </button>
        ) : undefined} />

      <div className="sat-stack" style={gap(5)}>
        {m.dealer && (
          <section className="sat-stack" style={gap(2)}>
            <Caption tip="dealer">Dealer</Caption>
            <div className="felt-scroll">
              {active.map((p) => (
                <button key={p} className="sat-chip" aria-pressed={d.dealerId === p} onClick={() => set({ dealerId: p })}>{name(p)}</button>
              ))}
            </div>
          </section>
        )}

        <section className="sat-field">
          <label htmlFor="pot">Pot (units) <Help k="pot" /></label>
          <input id="pot" className="sat-input sat-num" style={{ fontSize: '1.5rem', minHeight: 56 }} inputMode="decimal" placeholder="0" value={d.pot} onChange={(e) => set({ pot: e.target.value })} />
          {potN > 0 && <span className="sat-hint">{inBB(g, potN)}{g.type === 'cash' && <> = {money(potN * g.unitValue, g.currency)}</>}</span>}
        </section>

        <section className="sat-stack" style={gap(2)}>
          <div className="sat-split">
            <Caption>{d.winners.length > 1 ? 'Winners (split pot)' : 'Winner'}</Caption>
            {d.shown.length >= 2 && boardDone && <button className="sat-btn sat-btn--sm" onClick={autoWinner}><Icon name="bolt" /> Pick best hand</button>}
          </div>
          <div className="sat-cluster" style={gap(2)}>
            {order.map((p) => (
              <button key={p} className="sat-chip" aria-pressed={d.winners.includes(p)} onClick={() => toggleWinner(p)}>{name(p)}</button>
            ))}
          </div>
          {d.winners.length > 1 && (
            <div className="sat-glass-2 felt-list">
              {d.winners.map((w) => (
                <div key={w} className="felt-row" style={{ minHeight: 48, padding: '4px 0' }}>
                  <span className="felt-grow" style={{ fontWeight: 600 }}>{name(w)}</span>
                  {d.customSplit ? (
                    <input className="sat-input sat-num" style={{ width: 110 }} inputMode="decimal" aria-label={`${name(w)} share (units)`} value={d.split[w] ?? ''}
                      onChange={(e) => set({ split: { ...d.split, [w]: e.target.value } })} />
                  ) : <span className="sat-num">{units(amounts[w] ?? 0)}</span>}
                </div>
              ))}
              <div className="felt-row" style={{ minHeight: 48 }}>
                <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => set({
                  customSplit: !d.customSplit,
                  split: Object.fromEntries(d.winners.map((w) => [w, String(amounts[w] ?? 0)])),
                })}>{d.customSplit ? 'Split evenly' : 'Set amounts'}</button>
                <span className="felt-grow" />
                {d.customSplit && <span className={`sat-small sat-num ${splitOk ? 'felt-up' : 'felt-down'}`}>{units(splitSum)} of {units(potN)}</span>}
              </div>
            </div>
          )}
        </section>

        <section className="sat-stack" style={gap(2)}>
          <div className="sat-split">
            <Caption>Board</Caption>
            <span className="sat-cluster" style={gap(2)}>
              <button className="sat-chip" aria-pressed={d.boardNA} onClick={() => { set({ boardNA: !d.boardNA }); setTarget(null); }}>No board</button>
              <Help k="boardNA" />
            </span>
          </div>
          {d.boardNA ? (
            <p className="sat-small sat-muted">The board is not recorded for this hand.</p>
          ) : (
            <div className="sat-cluster" style={{ ...gap(2), flexWrap: 'nowrap' }}>
              {d.board.map((c, i) => (
                <span key={i} style={{ marginRight: i === 2 || i === 3 ? 6 : 0 }}>
                  <PlayingCard card={c} size="lg" target={isTarget({ kind: 'board', i })} placeholder={i < 3 ? 'FLOP' : i === 3 ? 'TURN' : 'RIVER'}
                    onClick={() => tapSlot({ kind: 'board', i }, !!c)} />
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="sat-stack" style={gap(2)}>
          <Caption tip="shown">Shown cards</Caption>
          {d.shown.length > 0 && (
            <div className="sat-glass-2 felt-list">
              {d.shown.map((s, idx) => {
                const v = shownValues[idx];
                const top = v && v.score === bestScore;
                return (
                  <div key={s.playerId} className="felt-row">
                    <div className="felt-row-main">
                      <div className="felt-row-title">{name(s.playerId)}</div>
                      {v && <div className={`felt-row-sub ${top ? 'felt-up' : ''}`}>{v.name}{top ? ' (best hand)' : ''}</div>}
                    </div>
                    {s.cards.map((c, ci) => (
                      <PlayingCard key={ci} card={c} target={isTarget({ kind: 'shown', idx, ci })} onClick={() => tapSlot({ kind: 'shown', idx, ci }, !!c)} />
                    ))}
                    <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => removeShown(idx)} aria-label={`Remove cards for ${name(s.playerId)}`}><Icon name="close" /></button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="sat-cluster" style={gap(2)}>
            {order.filter((p) => !d.shown.some((s) => s.playerId === p)).map((p) => (
              <button key={p} className="sat-btn sat-btn--sm" onClick={() => addShown(p)}><Icon name="plus" />{name(p)}</button>
            ))}
          </div>
        </section>

        {target && (
          <div className="sat-glass-2 felt-picker-shell">
            <div className="sat-split" style={{ marginBottom: 'var(--sat-space-2)' }}>
              <Caption>
                {target.kind === 'board' ? ['Flop card 1', 'Flop card 2', 'Flop card 3', 'Turn', 'River'][target.i] : `${name(d.shown[target.idx]?.playerId)}, card ${target.ci + 1}`}
              </Caption>
              <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setTarget(null)}>Done</button>
            </div>
            <div className="felt-picker">
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
          <section className="sat-stack" style={gap(2)}>
            <Caption>Markers</Caption>
            <div className="sat-cluster" style={gap(2)}>
              {m.allIn && <button className="sat-chip" aria-pressed={d.allIn} onClick={() => set({ allIn: !d.allIn })}>All-in</button>}
              {m.straddle && <button className="sat-chip" aria-pressed={d.straddle} onClick={() => set({ straddle: !d.straddle })}>Straddle</button>}
            </div>
          </section>
        )}

        {m.tags && (
          <section className="sat-stack" style={gap(2)}>
            <Caption>Tags</Caption>
            <div className="sat-cluster" style={gap(2)}>
              {tagPool.map((t) => (
                <button key={t} className="sat-chip" aria-pressed={d.tags.includes(t)} onClick={() => set({ tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] })}>{t}</button>
              ))}
            </div>
            <div className="sat-cluster" style={{ ...gap(2), flexWrap: 'nowrap' }}>
              <input className="sat-input" aria-label="New tag" placeholder="New tag (e.g. Cooler)" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
              <button className="sat-btn" aria-disabled={!newTag.trim()} onClick={() => {
                const t = newTag.trim();
                if (!t) return;
                if (!settings.tags.includes(t)) updateSettings({ tags: [...settings.tags, t] });
                set({ tags: [...new Set([...d.tags, t])] });
                setNewTag('');
              }}>Add tag</button>
            </div>
          </section>
        )}

        <section className="sat-field">
          <label htmlFor="note">Note</label>
          <textarea id="note" className="sat-input" placeholder="Optional" value={d.note} onChange={(e) => set({ note: e.target.value })} />
        </section>
      </div>

      <div className="sat-bottombar sat-glass-2">
        {!existing && <button className="sat-btn sat-btn--lg" aria-disabled={!valid} onClick={() => save(true)}>Save, next hand</button>}
        <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!valid} onClick={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</button>
      </div>
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

