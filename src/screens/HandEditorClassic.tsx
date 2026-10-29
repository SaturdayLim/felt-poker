import { useMemo, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, PlayingCard, Sheet, num, toast } from '../components/ui';
import { RANKS, SUITS, SUIT_COLOR, SUIT_SYMBOL, bestHand, type HandValue } from '../lib/cards';
import { buildPots, fromSmallBlind, playerStatus, positionSplit, round2 } from '../lib/calc';
import { inBB, units } from '../lib/format';
import { uid } from '../lib/ids';
import type { Card, Game, Hand, ID } from '../types';

type Target = { kind: 'board'; i: number } | { kind: 'shown'; idx: number; ci: number } | null;

interface PotDraft {
  amount: string;
  eligible: ID[];
  winners: ID[];
  split: Record<ID, string>;
  custom: boolean;
}

interface Draft {
  id: string;
  n: number;
  at: number;
  buttonId?: ID;
  pots: PotDraft[];
  board: (Card | null)[];
  boardNA: boolean;
  shown: { playerId: ID; cards: (Card | null)[] }[];
  note: string;
  // kept from older hands so editing does not drop them; no longer edited here
  allIn: boolean;
  straddle: boolean;
  tags: string[];
}

const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

function seatOrder(g: Game, onlyActive: boolean): ID[] {
  return [...g.playerIds]
    .filter((p) => !onlyActive || playerStatus(g, p) !== 'out')
    .sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
}

function nextButton(g: Game, prev?: ID): ID | undefined {
  const order = seatOrder(g, true);
  if (!order.length) return undefined;
  if (!prev) return g.firstDealer && order.includes(g.firstDealer) ? g.firstDealer : order[0];
  const prevSeat = g.seats[prev] ?? 0;
  return order.find((p) => (g.seats[p] ?? 0) > prevSeat) ?? order[0];
}

const emptyPot = (eligible: ID[]): PotDraft => ({ amount: '', eligible, winners: [], split: {}, custom: false });

function blank(g: Game): Draft {
  const last = g.hands[g.hands.length - 1];
  return {
    id: uid(), n: (last?.n ?? 0) + 1, at: Date.now(), buttonId: nextButton(g, last?.dealerId),
    pots: [emptyPot(seatOrder(g, true))], board: [null, null, null, null, null], boardNA: false,
    shown: [], note: '', allIn: false, straddle: false, tags: [],
  };
}

function fromHand(g: Game, h: Hand): Draft {
  const pots = h.pots?.length ? h.pots : [{ amount: h.pot, eligible: seatOrder(g, false), winners: h.winners }];
  return {
    id: h.id, n: h.n, at: h.at, buttonId: h.dealerId,
    pots: pots.map((p) => {
      const even = positionSplit(g, p.amount, p.winners.map((w) => w.playerId), h.dealerId);
      return {
        amount: String(p.amount), eligible: p.eligible, winners: p.winners.map((w) => w.playerId),
        split: Object.fromEntries(p.winners.map((w) => [w.playerId, String(w.amount)])),
        custom: p.winners.some((w) => Math.abs((even[w.playerId] ?? 0) - w.amount) > 0.004),
      };
    }),
    board: [0, 1, 2, 3, 4].map((i) => h.board[i] ?? null), boardNA: h.boardNA,
    shown: h.shown.map((s) => ({ playerId: s.playerId, cards: [s.cards[0] ?? null, s.cards[1] ?? null] })),
    note: h.note ?? '', allIn: h.allIn, straddle: h.straddle, tags: [...h.tags],
  };
}

export default function HandEditorClassic({ gameId, handId }: { gameId: string; handId?: string }) {
  const g = useGame(gameId);
  const settings = useStore((s) => s.settings);
  const saveHand = useStore((s) => s.saveHand);
  const deleteHand = useStore((s) => s.deleteHand);
  const name = usePlayerName();
  const existing = g?.hands.find((h) => h.id === handId);
  const [d, setD] = useState<Draft | null>(() => (g ? (existing ? fromHand(g, existing) : blank(g)) : null));
  const [target, setTarget] = useState<Target>(existing ? null : { kind: 'board', i: 0 });
  const [confirmDel, setConfirmDel] = useState(false);
  const [allInSheet, setAllInSheet] = useState(false);

  const used = useMemo(() => {
    const s = new Set<Card>();
    if (!d) return s;
    d.board.forEach((c) => c && s.add(c));
    d.shown.forEach((x) => x.cards.forEach((c) => c && s.add(c)));
    return s;
  }, [d]);

  if (!g || !d) return <div className="felt-page"><Header back={() => go('')} title="Hand" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const trackButton = settings.markers.dealer;
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const setPot = (i: number, patch: Partial<PotDraft>) => setD({ ...d, pots: d.pots.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const order = seatOrder(g, false);
  const active = seatOrder(g, true);
  const boardCards = d.board.filter(Boolean) as Card[];
  const boardDone = !d.boardNA && boardCards.length === 5;
  const button = trackButton ? d.buttonId : undefined;

  const shownValues: (HandValue | null)[] = d.shown.map((s) => {
    const cs = s.cards.filter(Boolean) as Card[];
    return boardDone && cs.length === 2 ? bestHand([...cs, ...boardCards]) : null;
  });
  const valueOf = (pid: ID) => {
    const i = d.shown.findIndex((s) => s.playerId === pid);
    return i >= 0 ? shownValues[i] : null;
  };
  const bestScore = Math.max(-1, ...shownValues.map((v) => v?.score ?? -1));

  /* --------- pots --------- */
  const potAmount = (p: PotDraft) => num(p.amount) ?? 0;
  const allocation = (p: PotDraft): Record<ID, number> => (p.custom
    ? Object.fromEntries(p.winners.map((w) => [w, num(p.split[w] ?? '') ?? 0]))
    : positionSplit(g, potAmount(p), p.winners, button));
  const potOk = (p: PotDraft) => {
    if (potAmount(p) > 0 && !p.winners.length) return false;
    if (!p.custom) return true;
    const sum = Object.values(allocation(p)).reduce((a, b) => a + b, 0);
    return Math.abs(sum - potAmount(p)) < 0.005;
  };
  const total = round2(d.pots.reduce((a, p) => a + potAmount(p), 0));
  const multi = d.pots.length > 1;

  const toggleWinner = (i: number, pid: ID) => {
    const p = d.pots[i];
    const w = p.winners.includes(pid) ? p.winners.filter((x) => x !== pid) : [...p.winners, pid];
    setPot(i, { winners: w, custom: w.length > 1 ? p.custom : false });
  };
  const toggleEligible = (i: number, pid: ID) => {
    const p = d.pots[i];
    const e = p.eligible.includes(pid) ? p.eligible.filter((x) => x !== pid) : [...p.eligible, pid];
    setPot(i, { eligible: e, winners: p.winners.filter((w) => e.includes(w)) });
  };
  const addSidePot = () => {
    const last = d.pots[d.pots.length - 1];
    setD({ ...d, pots: [...d.pots, emptyPot([...last.eligible])] });
  };
  const removePot = (i: number) => setD({ ...d, pots: d.pots.filter((_, j) => j !== i) });

  /** For each pot, the best shown hand among its contenders wins; ties split. */
  const pickWinners = () => {
    let changed = 0;
    const pots = d.pots.map((p) => {
      const scored = p.eligible.map((pid) => ({ pid, v: valueOf(pid) })).filter((x) => x.v);
      if (!scored.length) return p;
      const top = Math.max(...scored.map((x) => x.v!.score));
      changed++;
      return { ...p, winners: scored.filter((x) => x.v!.score === top).map((x) => x.pid), custom: false };
    });
    if (!changed) { toast('No shown hands in these pots. Add shown cards first.'); return; }
    setD({ ...d, pots });
    toast(changed > 1 ? `Winners picked for ${changed} pots` : 'Winner picked from the shown cards');
  };

  /* --------- card targeting --------- */
  const advance = (nd: Draft, t: Exclude<Target, null>): Target => {
    const slots: Exclude<Target, null>[] = [];
    if (!nd.boardNA) for (let i = 0; i < 5; i++) slots.push({ kind: 'board', i });
    nd.shown.forEach((_, idx) => { slots.push({ kind: 'shown', idx, ci: 0 }, { kind: 'shown', idx, ci: 1 }); });
    const isEmpty = (s: Exclude<Target, null>) => (s.kind === 'board' ? !nd.board[s.i] : !nd.shown[s.idx].cards[s.ci]);
    const start = slots.findIndex((s) => JSON.stringify(s) === JSON.stringify(t));
    for (let k = start + 1; k < slots.length; k++) {
      const s = slots[k];
      if (s.kind !== t.kind || (s.kind === 'shown' && t.kind === 'shown' && s.idx !== t.idx)) break;
      if (isEmpty(s)) return s;
    }
    return null;
  };
  const pick = (c: Card) => {
    if (!target) return;
    const nd = structuredClone(d);
    if (target.kind === 'board') nd.board[target.i] = c;
    else nd.shown[target.idx].cards[target.ci] = c;
    setD(nd);
    setTarget(advance(nd, target));
  };
  const isTarget = (t: Exclude<Target, null>) => !!target && JSON.stringify(target) === JSON.stringify(t);
  const tapSlot = (t: Exclude<Target, null>, filled: boolean) => {
    if (isTarget(t) && filled) {
      const nd = structuredClone(d);
      if (t.kind === 'board') nd.board[t.i] = null; else nd.shown[t.idx].cards[t.ci] = null;
      setD(nd);
    }
    setTarget(t);
  };
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

  /* --------- save --------- */
  const valid = d.pots.every(potOk) && d.pots.some((p) => p.winners.length > 0);
  const toHand = (): Hand => {
    const pots = d.pots.filter((p) => potAmount(p) > 0 || p.winners.length).map((p) => {
      const a = allocation(p);
      return { amount: potAmount(p), eligible: p.eligible, winners: p.winners.map((w) => ({ playerId: w, amount: a[w] ?? 0 })) };
    });
    const sums: Record<ID, number> = {};
    for (const p of pots) for (const w of p.winners) sums[w.playerId] = round2((sums[w.playerId] ?? 0) + w.amount);
    return {
      id: d.id, n: d.n, at: d.at, dealerId: button, pot: total,
      winners: fromSmallBlind(g, button, Object.keys(sums)).map((pid) => ({ playerId: pid, amount: sums[pid] })),
      pots,
      board: d.boardNA ? [] : (d.board.filter(Boolean) as Card[]), boardNA: d.boardNA,
      shown: d.shown.map((s) => ({ playerId: s.playerId, cards: s.cards.filter(Boolean) as Card[] })).filter((s) => s.cards.length),
      allIn: d.allIn || multi, straddle: d.straddle, tags: d.tags, note: d.note.trim() || undefined,
    };
  };
  const save = (next: boolean) => {
    if (!valid) {
      const bad = d.pots.findIndex((p) => !potOk(p));
      const which = multi ? `${bad <= 0 ? 'Main pot' : `Side pot ${bad}`}: ` : '';
      const p = d.pots[Math.max(0, bad)];
      toast(p && p.winners.length && p.custom ? `${which}custom split does not add up to the pot. Check each share.` : `${which}no winner picked. Tap a name under Winner.`);
      return;
    }
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

  const potTitle = (i: number) => (i === 0 ? 'Main pot' : `Side pot ${i}`);

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
        {trackButton && (
          <section className="sat-stack" style={gap(2)}>
            <Caption tip="dealer">Button</Caption>
            <div className="felt-scroll">
              {active.map((p) => (
                <button key={p} className="sat-chip" aria-pressed={d.buttonId === p} onClick={() => set({ buttonId: p })}>{name(p)}</button>
              ))}
            </div>
          </section>
        )}

        <section className="sat-stack" style={gap(3)}>
          <div className="sat-split">
            <Caption q="chips" tip={multi ? 'sidePots' : 'pot'}>{multi ? `Pots (${d.pots.length})` : 'Pot'}</Caption>
            {multi && <span className="sat-small sat-muted">Total <span className="sat-num" style={{ color: 'var(--sat-text)', fontWeight: 600 }}>{units(total)}</span></span>}
          </div>

          {d.pots.map((p, i) => (
            <PotEditor key={i} g={g} title={multi ? potTitle(i) : undefined} pot={p} order={order} name={name}
              allocation={allocation(p)} button={button} showEligible={multi}
              onAmount={(v) => setPot(i, { amount: v })}
              onWinner={(pid) => toggleWinner(i, pid)}
              onEligible={(pid) => toggleEligible(i, pid)}
              onCustom={() => setPot(i, { custom: !p.custom, split: Object.fromEntries(p.winners.map((w) => [w, String(allocation(p)[w] ?? 0)])) })}
              onShare={(pid, v) => setPot(i, { split: { ...p.split, [pid]: v } })}
              onRemove={i > 0 ? () => removePot(i) : undefined} />
          ))}

          <div className="sat-cluster" style={gap(2)}>
            <button className="sat-btn sat-btn--sm" onClick={addSidePot}><Icon name="plus" /> Side pot</button>
            <button className="sat-btn sat-btn--sm" onClick={() => setAllInSheet(true)}>Work out from all-ins</button>
            {boardDone && d.shown.length > 0 && <button className="sat-btn sat-btn--sm" onClick={pickWinners}><Icon name="bolt" /> Pick winners</button>}
            <Help k={boardDone && d.shown.length ? 'bestHands' : 'sidePots'} />
          </div>
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
            <div className="sat-cluster" style={{ ...gap(2), flexWrap: 'nowrap', paddingTop: 6 }}>
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
                  <div key={s.playerId} className="felt-row" style={{ paddingTop: 14 }}>
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

        <section className="sat-field">
          <label htmlFor="note">Note</label>
          <textarea id="note" className="sat-input" placeholder="Optional" value={d.note} onChange={(e) => set({ note: e.target.value })} />
        </section>
      </div>

      <div className="sat-bottombar sat-glass-2">
        {!existing && <button className="sat-btn sat-btn--lg" aria-disabled={!valid} onClick={() => save(true)}>Save, next hand</button>}
        <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!valid} onClick={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</button>
      </div>

      {allInSheet && (
        <AllInSheet g={g} players={active} name={name} onClose={() => setAllInSheet(false)}
          onBuild={(pots) => {
            setD({ ...d, pots: pots.map((p) => ({ ...emptyPot(p.eligible), amount: String(p.amount) })) });
            setAllInSheet(false);
            toast(pots.length > 1 ? `${pots.length} pots built: main pot and ${pots.length - 1} side pot${pots.length > 2 ? 's' : ''}` : 'One pot built');
          }} />
      )}
    </div>
  );
}

/* ------------------------------- one pot ------------------------------- */

function PotEditor({ g, title, pot, order, name, allocation, button, showEligible, onAmount, onWinner, onEligible, onCustom, onShare, onRemove }: {
  g: Game; title?: string; pot: PotDraft; order: ID[]; name: (id: ID) => string; allocation: Record<ID, number>; button?: ID;
  showEligible: boolean;
  onAmount: (v: string) => void; onWinner: (pid: ID) => void; onEligible: (pid: ID) => void;
  onCustom: () => void; onShare: (pid: ID, v: string) => void; onRemove?: () => void;
}) {
  const amount = num(pot.amount) ?? 0;
  const contenders = showEligible ? order.filter((p) => pot.eligible.includes(p)) : order;
  const sum = Object.values(allocation).reduce((a, b) => a + b, 0);
  const split = pot.winners.length > 1;
  const fieldId = `pot-${(title ?? 'main').replace(/\s+/g, '-').toLowerCase()}`;
  const body = (
    <div className="sat-stack" style={gap(3)}>
      <div className="sat-field">
        {title && <label htmlFor={fieldId}>{title} (chips)</label>}
        <input id={fieldId} aria-label={title ? undefined : 'Pot (chips)'} className="sat-input sat-num" style={{ fontSize: '1.5rem', minHeight: 56 }}
          inputMode="decimal" placeholder="0" value={pot.amount} onChange={(e) => onAmount(e.target.value)} />
        {amount > 0 && <span className="sat-hint">{inBB(g, amount)}</span>}
      </div>

      {showEligible && (
        <div className="sat-stack" style={gap(2)}>
          <Caption>In this pot</Caption>
          <div className="sat-cluster" style={gap(2)}>
            {order.map((p) => <button key={p} className="sat-chip" aria-pressed={pot.eligible.includes(p)} onClick={() => onEligible(p)}>{name(p)}</button>)}
          </div>
        </div>
      )}

      <div className="sat-stack" style={gap(2)}>
        <Caption>{split ? 'Winners (split pot)' : 'Winner'}</Caption>
        <div className="sat-cluster" style={gap(2)}>
          {contenders.map((p) => (
            <button key={p} className="sat-chip" aria-pressed={pot.winners.includes(p)} onClick={() => onWinner(p)}>{name(p)}</button>
          ))}
        </div>
        {!split && <p className="sat-small sat-muted">Tap 2 or more names to split the pot.</p>}
      </div>

      {split && (
        <div className="sat-well felt-split" style={{ borderRadius: 'var(--sat-radius-md)' }}>
          <div className="sat-split" style={{ minHeight: 40 }}>
            <span className="sat-cluster" style={gap(1)}><Caption>Split pot</Caption><Help k="split" /></span>
            <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={onCustom}>{pot.custom ? 'Split evenly' : 'Custom split'}</button>
          </div>
          {fromSmallBlind(g, button, pot.winners).map((w) => (
            <div key={w} className="felt-row" style={{ minHeight: 44, padding: '4px 0' }}>
              <span className="felt-row-main felt-row-title">{name(w)}{w === button ? <span className="felt-dealer" style={{ marginLeft: 6 }}>D</span> : null}</span>
              {pot.custom ? (
                <input className="sat-input sat-num" style={{ width: 104 }} inputMode="decimal" aria-label={`${name(w)} share (chips)`} value={pot.split[w] ?? ''} onChange={(e) => onShare(w, e.target.value)} />
              ) : <span className="sat-num" style={{ fontWeight: 600 }}>{units(allocation[w] ?? 0)}</span>}
            </div>
          ))}
          {pot.custom && (
            <p className={`sat-small ${Math.abs(sum - amount) < 0.005 ? 'felt-up' : 'felt-down'}`} style={{ paddingBottom: 6 }}>
              Shares = {units(sum)} of {units(amount)}{Math.abs(sum - amount) < 0.005 ? '' : ` (${units(round2(amount - sum))} left)`}
            </p>
          )}
        </div>
      )}
    </div>
  );
  if (!title) return body;
  return (
    <div className="sat-glass sat-card felt-pot">
      {onRemove && (
        <div className="sat-split" style={{ marginBottom: 'var(--sat-space-2)', marginTop: -8 }}>
          <span />
          <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={onRemove}><Icon name="close" /> Remove</button>
        </div>
      )}
      {body}
    </div>
  );
}

/* ------------------------------- all-ins ------------------------------- */

function AllInSheet({ g, players, name, onClose, onBuild }: {
  g: Game; players: ID[]; name: (id: ID) => string; onClose: () => void;
  onBuild: (pots: { amount: number; eligible: ID[] }[]) => void;
}) {
  const [putIn, setPutIn] = useState<Record<ID, string>>({});
  const [folded, setFolded] = useState<ID[]>([]);
  const entries = players.map((p) => ({ playerId: p, putIn: num(putIn[p] ?? '') ?? 0, folded: folded.includes(p) }));
  const pots = buildPots(entries);
  return (
    <Sheet open onClose={onClose} title="Work out from all-ins">
      <p className="sat-small sat-muted">Enter the chips each player put in this hand. Leave blank if they put in nothing. Mark players who folded.</p>
      <div className="sat-glass-2 felt-list">
        {players.map((p) => (
          <div key={p} className="felt-row" style={{ minHeight: 52 }}>
            <span className="felt-row-main felt-row-title">{name(p)}</span>
            <button className="sat-chip" aria-pressed={folded.includes(p)} onClick={() => setFolded((f) => f.includes(p) ? f.filter((x) => x !== p) : [...f, p])}>Folded</button>
            <input className="sat-input sat-num" style={{ width: 96 }} inputMode="decimal" placeholder="0" aria-label={`${name(p)} put in (chips)`}
              value={putIn[p] ?? ''} onChange={(e) => setPutIn({ ...putIn, [p]: e.target.value })} />
          </div>
        ))}
      </div>
      {pots.length > 0 && (
        <div className="sat-stack" style={gap(1)}>
          <Caption q="chips">Pots</Caption>
          {pots.map((pt, i) => (
            <p key={i} className="sat-small"><b>{i === 0 ? 'Main pot' : `Side pot ${i}`} = <span className="sat-num">{units(pt.amount)}</span></b>, {pt.eligible.map(name).join(', ')}</p>
          ))}
        </div>
      )}
      <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!pots.length} onClick={() => pots.length && onBuild(pots)}>
        {pots.length > 1 ? `Use ${pots.length} pots` : 'Use this pot'}
      </button>
      {g.sb > 1 && <p className="sat-small sat-muted">Shares round to the SB ({g.sb}).</p>}
    </Sheet>
  );
}
