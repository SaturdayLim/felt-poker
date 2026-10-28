import { useMemo, useRef, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, PlayingCard, toast } from '../components/ui';
import { RANKS, SUITS, SUIT_COLOR, SUIT_SYMBOL, bestHand } from '../lib/cards';
import { playerStatus, round2 } from '../lib/calc';
import { units } from '../lib/format';
import { uid } from '../lib/ids';
import {
  STREETS, STREET_CARDS, actionClosed, blinds, closeStreet, cycleAct, dropAfter, finalists, inAtEnd, inAtStart, newBoxLog,
  openStreetBoxes, potTotal, replayStreet, resolve, setAct, streetOrder, type Replay,
} from '../lib/hand';
import { estimateStacks } from '../lib/stacks';
import type { Act, Card, Game, Hand, HandLog, ID, StreetName } from '../types';

/* Hand recorder, one tab per stage in the order things happen at the table:
   Setup (who is dealt in, the button, the blinds), Pre-flop, Flop, Turn, River, Showdown.
   Each street is a table of action boxes: one row per player in acting order, one column per pass
   around the table (a new column opens when a raise needs answering). Tap a box to call, tap again
   to fold, type on the keypad to bet or raise. The stage and the running pot stay in the header. */

type Tab = 'setup' | StreetName | 'showdown';
type Target = { kind: 'board'; i: number } | { kind: 'run'; r: number; i: number } | { kind: 'shown'; p: ID; ci: number } | null;
type Sel = { p: ID; r: number } | null;

interface RState {
  id: string;
  n: number;
  log: HandLog | null;
  tab: Tab;
  /** Showdown reached (river closed, everyone all-in, or one player left). */
  ended: boolean;
  /** Card reveal skipped: go straight to the result. */
  skipReveal: boolean;
  note: string;
  board: (Card | null)[];
  runSlots: (Card | null)[][];
  shown: Record<ID, (Card | null)[]>;
  manual: Record<number, ID[]>;
}

const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const LABEL: Record<Tab, string> = { setup: 'Setup', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
const TABS: Tab[] = ['setup', 'preflop', 'flop', 'turn', 'river', 'showdown'];
const BOARD_SLOT = ['Flop card 1', 'Flop card 2', 'Flop card 3', 'Turn card', 'River card'];

function bySeat(g: Game, ids: ID[]) { return [...ids].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99)); }

/** Pre-filled by status: everyone playing (green). Away players can be added with a tap. */
function dealtDefault(g: Game): ID[] {
  return bySeat(g, g.playerIds.filter((p) => playerStatus(g, p) === 'playing'));
}

function nextButton(g: Game, dealt: ID[], prev?: ID): ID | undefined {
  const order = bySeat(g, dealt);
  if (!order.length) return undefined;
  if (!prev) return g.firstDealer && order.includes(g.firstDealer) ? g.firstDealer : order[0];
  const prevSeat = g.seats[prev] ?? 0;
  return order.find((p) => (g.seats[p] ?? 0) > prevSeat) ?? order[0];
}

const fresh = (n: number, id = uid()): RState => ({
  id, n, log: null, tab: 'setup', ended: false, skipReveal: false, note: '',
  board: [null, null, null, null, null], runSlots: [], shown: {}, manual: {},
});

export default function HandRecorder({ gameId, handId }: { gameId: string; handId?: string }) {
  const g = useGame(gameId);
  const saveHand = useStore((s) => s.saveHand);
  const deleteHand = useStore((s) => s.deleteHand);
  const updateGame = useStore((s) => s.updateGame);
  const setStatus = useStore((s) => s.setStatus);
  const name = usePlayerName();
  const existing = g?.hands.find((h) => h.id === handId);

  const [st, setSt] = useState<RState | null>(() => {
    if (!g) return null;
    if (existing?.log) {
      const L = existing.log;
      return {
        id: existing.id, n: existing.n, log: L, tab: 'showdown', ended: true, skipReveal: false, note: existing.note ?? '',
        board: [0, 1, 2, 3, 4].map((i) => existing.board[i] ?? null),
        runSlots: (L.runCards ?? []).map((r) => [...r]),
        shown: Object.fromEntries(Object.entries(L.shown ?? {}).map(([p, c]) => [p, [c[0] ?? null, c[1] ?? null]])),
        manual: {},
      };
    }
    return fresh((g.hands[g.hands.length - 1]?.n ?? 0) + 1);
  });
  const [dealt, setDealt] = useState<ID[]>(() => existing?.log?.dealt ?? (g ? dealtDefault(g) : []));
  const [button, setButton] = useState<ID | undefined>(() => existing?.log?.button ?? existing?.dealerId ?? (g ? nextButton(g, dealtDefault(g), g.hands[g.hands.length - 1]?.dealerId) : undefined));
  const [sb, setSb] = useState(String(g?.sb ?? 1));
  const [bb, setBb] = useState(String(g?.bb ?? 2));
  const [target, setTarget] = useState<Target>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [typed, setTyped] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'restart' | null>(null);
  const stacksRef = useRef<Record<ID, number> | undefined>(undefined);

  // Stacks cap wagers (all-in) only where the estimate is exact
  const est = useMemo(() => (g && st ? estimateStacks(g, st.n) : null), [g, st?.n]);
  if (est && !stacksRef.current)
    stacksRef.current = Object.fromEntries(Object.entries(est.stack).filter(([p, v]) => v !== undefined && !(est.spread[p] > 0))) as Record<ID, number>;
  const stacks = stacksRef.current;

  const used = useMemo(() => {
    const s = new Set<Card>();
    if (!st) return s;
    st.board.forEach((c) => c && s.add(c));
    st.runSlots.forEach((r) => r.forEach((c) => c && s.add(c)));
    Object.values(st.shown).forEach((x) => x.forEach((c) => c && s.add(c)));
    return s;
  }, [st]);

  if (!g || !st) return <div className="felt-page"><Header back={() => go('')} title="Hand" /><Empty title="Game not found">It may have been deleted.</Empty></div>;

  const log = st.log;
  const set = (patch: Partial<RState>) => setSt({ ...st, ...patch });
  const street = (STREETS as Tab[]).includes(st.tab) ? (st.tab as StreetName) : null;
  const replay: Replay | null = log && street && log.streets[street]?.acts ? replayStreet(g, log, street, stacks) : null;
  const live = log ? finalists(log) : [];
  const potNow = log ? potTotal(g, log, log.button) : 0;
  const commonCards = (n: number) => st.board.slice(0, n).filter(Boolean) as Card[];
  const shownCards = (): Record<ID, Card[]> => Object.fromEntries(Object.entries(st.shown).map(([p, c]) => [p, c.filter(Boolean) as Card[]]).filter(([, c]) => (c as Card[]).length === 2));
  const fullLog = (): HandLog | null => (log ? { ...log, runCards: (log.runs ?? 1) > 1 ? st.runSlots.map((r) => r.filter(Boolean) as Card[]) : [], shown: st.skipReveal ? {} : shownCards() } : null);
  const boardForResolve = (): Card[] => {
    const L = fullLog()!;
    if ((L.runs ?? 1) > 1) return [...commonCards(L.runFrom ?? 0), ...(L.runCards[0] ?? [])];
    return st.board.filter(Boolean) as Card[];
  };
  const res = log && st.ended ? resolve(g, fullLog()!, boardForResolve(), log.button, st.manual) : null;
  const sbN = Number(sb), bbN = Number(bb);
  const nextStreet = street ? STREETS[STREETS.indexOf(street) + 1] : undefined;

  /* --------- flow --------- */
  const startHand = () => {
    if (dealt.length < 2) { toast('Deal in at least 2 players.'); return; }
    if (!(sbN > 0) || !(bbN >= sbN)) { toast('Use numbers for the blinds (e.g. 1 and 2).'); return; }
    if (sbN !== g.sb || bbN !== g.bb) updateGame(g.id, (x) => { x.sb = sbN; x.bb = bbN; });
    // dealt in = playing: an away player who is dealt in turns green
    for (const p of dealt) if (playerStatus(g, p) !== 'playing') setStatus(g.id, p, 'playing');
    const g2 = { ...g, sb: sbN, bb: bbN };
    const b = button && dealt.includes(button) ? button : nextButton(g2, dealt);
    const l = newBoxLog(g2, dealt, b, stacks);
    setSt({ ...st, log: l, tab: 'preflop' });
    setSel(replayStreet(g2, l, 'preflop', stacks).next);
  };
  const goTab = (t: Tab) => {
    set({ tab: t });
    setTarget(null);
    setTyped('');
    setSel(log && (STREETS as Tab[]).includes(t) && log.streets[t as StreetName]?.acts ? replayStreet(g, log, t as StreetName, stacks).next : null);
  };

  /** Close the street on screen and move on: next street, run-out, or showdown. */
  const nextFrom = (s: StreetName) => {
    if (!log) return;
    let l = closeStreet(g, log, s, log.streets[s]?.at ?? Date.now(), stacks);
    if (inAtEnd(l, s).length <= 1 || s === 'river') { setSt({ ...st, log: dropAfter(l, s), tab: 'showdown', ended: true }); setTarget(null); setSel(null); return; }
    if (actionClosed(l, s)) {
      l = { ...dropAfter(l, s), runFrom: STREET_CARDS[s], runs: l.runs || 1 };
      setSt({ ...st, log: l, tab: 'showdown', ended: true });
      setTarget(firstEmptyRun(l, st.board, st.runSlots));
      setSel(null);
      return;
    }
    const nx = STREETS[STREETS.indexOf(s) + 1];
    if (!l.streets[nx]) l = openStreetBoxes(g, l, nx, stacks);
    setSt({ ...st, log: { ...l, runFrom: undefined }, tab: nx, ended: false });
    setSel(replayStreet(g, l, nx, stacks).next);
    const slot = st.board.findIndex((c, i) => !c && i < STREET_CARDS[nx]);
    setTarget(slot >= 0 ? { kind: 'board', i: slot } : null);
  };

  /** Change one box. If the street was closed and now ends the hand sooner, later streets are dropped. */
  const act = (p: ID, r: number, a: Act | null, keepSel = false) => {
    if (!log || !street) return;
    let l = setAct(g, log, street, p, r, a, stacks);
    let ended = st.ended;
    if (l.streets[street]?.at && (inAtEnd(l, street).length <= 1 || actionClosed(l, street))) { l = dropAfter(l, street); ended = true; }
    setSt({ ...st, log: l, ended });
    setTyped('');
    setSel(keepSel ? { p, r } : replayStreet(g, l, street, stacks).next);
  };
  // A tap on an empty box calls and moves the keypad on to the next player.
  // A tap on a filled box changes it (fold, then clear) and keeps the keypad on that player,
  // so a typed amount can replace their action.
  const tapCell = (p: ID, r: number) => {
    const cell = replay?.cells[p]?.[r];
    if (!cell?.needed) return;
    setTarget(null);
    act(p, r, cycleAct(cell.act), !!cell.act);
  };

  const save = (next: boolean) => {
    if (!log || !res) return;
    if (res.missing) { toast('A pot has no winner. Pick the winner under Result.'); return; }
    const L = fullLog()!;
    const pots = res.pots.map((p) => ({ amount: p.amount, eligible: p.eligible, winners: p.winners }));
    const total = round2(pots.reduce((a, p) => a + p.amount, 0));
    const hand: Hand = {
      id: st.id, n: st.n, at: L.startedAt, endedAt: existing?.endedAt ?? Date.now(), dealerId: L.button, pot: total,
      winners: res.winners, pots, returned: Object.keys(res.returned).length ? res.returned : undefined,
      board: boardForResolve(), boardNA: false,
      shown: Object.entries(L.shown).map(([playerId, cards]) => ({ playerId, cards })),
      allIn: Object.keys(L.allInAt ?? {}).length > 0, straddle: false, tags: existing?.tags ?? [], note: st.note.trim() || undefined, log: L,
    };
    saveHand(g.id, hand);
    if (next) {
      go(`game/${g.id}/hand/new`, true);
      const fg = useStore.getState().games.find((x) => x.id === g.id)!;
      const d = dealtDefault(fg);
      stacksRef.current = undefined;
      setDealt(d);
      setButton(nextButton(fg, d, hand.dealerId));
      setSb(String(fg.sb)); setBb(String(fg.bb));
      setSt(fresh(hand.n + 1));
      setSel(null); setTarget(null); setTyped(''); setConfirm(null);
      window.scrollTo(0, 0);
      toast(`Hand ${hand.n} saved to the game`);
    } else back(`game/${g.id}`);
  };

  /* --------- cards --------- */
  const pick = (c: Card) => {
    if (!target) return;
    if (target.kind === 'board') {
      const b = [...st.board]; b[target.i] = c;
      set({ board: b });
      const stop = st.tab === 'showdown' ? 5 : street ? STREET_CARDS[street] : 5;
      const nxt = b.findIndex((x, i) => !x && i < stop);
      setTarget(nxt >= 0 ? { kind: 'board', i: nxt } : null);
    } else if (target.kind === 'run') {
      const rs = st.runSlots.map((r) => [...r]); rs[target.r][target.i] = c;
      set({ runSlots: rs });
      setTarget(firstEmptyRun(log!, st.board, rs));
    } else {
      const cur = st.shown[target.p] ?? [null, null];
      const nextCards = [...cur]; nextCards[target.ci] = c;
      set({ shown: { ...st.shown, [target.p]: nextCards } });
      setTarget(target.ci === 0 && !nextCards[1] ? { kind: 'shown', p: target.p, ci: 1 } : null);
    }
  };
  const isTarget = (t: Exclude<Target, null>) => JSON.stringify(t) === JSON.stringify(target);
  const tapSlot = (t: Exclude<Target, null>, filled: boolean) => {
    if (isTarget(t) && filled) {
      if (t.kind === 'board') { const b = [...st.board]; b[t.i] = null; set({ board: b }); }
      else if (t.kind === 'run') { const rs = st.runSlots.map((r) => [...r]); rs[t.r][t.i] = null; set({ runSlots: rs }); }
      else { const cur = [...(st.shown[t.p] ?? [null, null])]; cur[t.ci] = null; set({ shown: { ...st.shown, [t.p]: cur } }); }
    }
    setTarget(t);
  };
  const currentCard = (t: Exclude<Target, null>) => (t.kind === 'board' ? st.board[t.i] : t.kind === 'run' ? st.runSlots[t.r]?.[t.i] : st.shown[t.p]?.[t.ci]);
  const setRuns = (n: number) => {
    if (!log) return;
    const from = log.runFrom ?? 0;
    const rs = Array.from({ length: n }, (_, r) => st.runSlots[r] ?? Array(5 - from).fill(null));
    setSt({ ...st, log: { ...log, runs: n }, runSlots: n > 1 ? rs : [] });
    setTarget(firstEmptyRun({ ...log, runs: n }, st.board, rs));
  };

  /* --------- keypad --------- */
  const selCell = sel && replay?.cells[sel.p]?.[sel.r]?.needed ? replay.cells[sel.p][sel.r] : null;
  const roundTo = (v: number) => { const step = g.sb > 0 ? g.sb : 1; return Math.max(step, Math.round(v / step) * step); };
  // pot-sized raise to = current bet + (pot + chips to call) x fraction
  const sizeTo = (frac: number) => {
    if (!replay || !sel) return 0;
    const toCall = Math.max(0, replay.high - (replay.street.bets[sel.p] ?? 0));
    return roundTo(replay.high + frac * (potNow + toCall));
  };
  const commitBet = (v: number) => {
    if (!sel) return;
    if (!(v > 0)) { toast('Type the bet as a number (e.g. 20).'); return; }
    act(sel.p, sel.r, { k: 'bet', to: v });
  };

  const tabEnabled = (t: Tab) => t === 'setup' || (t === 'showdown' ? st.ended : !!log?.streets[t as StreetName]);
  const lastStreet = log ? STREETS.filter((s) => log.streets[s]).pop() ?? 'preflop' : 'preflop';
  const legacy = street && log?.streets[street] && !log.streets[street]!.acts;

  return (
    <div className="felt-page felt-recorder">
      <Header back={() => back(`game/${g.id}`)} title={`Hand ${st.n}`} sub={g.name}
        right={existing ? (
          <button className="sat-btn sat-btn--ghost sat-iconbtn" style={confirm === 'delete' ? { color: 'var(--sat-neg)' } : undefined} aria-label={confirm === 'delete' ? 'Tap again to delete this hand' : 'Delete hand'}
            onClick={() => { if (confirm !== 'delete') { setConfirm('delete'); toast('Tap the bin again to delete this hand'); return; } deleteHand(g.id, st.id); go(`game/${g.id}`, true); }}>
            <Icon name="trash" />
          </button>
        ) : undefined}>
        <div className="felt-rec-bar sat-glass">
          <div className="felt-tabs" role="tablist" aria-label="Hand stage">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={st.tab === t} disabled={!tabEnabled(t)} onClick={() => goTab(t)}>{LABEL[t]}</button>
            ))}
          </div>
          <div className="felt-rec-status" aria-live="polite">
            <span><b>{log ? LABEL[st.tab === 'setup' ? lastStreet : st.tab] : 'Not dealt yet'}</b>{log && st.tab !== 'setup' && st.tab !== 'showdown' && replay?.next ? `, ${name(replay.next.p)} to act` : ''}</span>
            <span>Pot <b className="sat-num">{units(potNow)}</b></span>
          </div>
        </div>
      </Header>

      <div className="sat-stack" style={gap(3)}>
        {st.tab === 'setup' && (
          log ? (
            <section className="sat-glass sat-card sat-stack" style={gap(3)}>
              <p className="sat-body">{log.dealt.length} dealt in. Button {log.button ? name(log.button) : 'not set'}. Blinds {g.sb}/{g.bb}.</p>
              <p className="sat-small sat-muted">{log.dealt.map(name).join(', ')}</p>
              {!existing && (
                <button className="sat-btn sat-btn--ghost sat-btn--sm" style={{ alignSelf: 'flex-start', color: confirm === 'restart' ? 'var(--sat-neg)' : undefined }}
                  onClick={() => { if (confirm !== 'restart') { setConfirm('restart'); return; } setConfirm(null); setSt(fresh(st.n, st.id)); setSel(null); }}>
                  <Icon name="undo" /> {confirm === 'restart' ? 'Tap again to clear the action' : 'Change players or button'}
                </button>
              )}
            </section>
          ) : (
            <>
              <section className="sat-stack" style={gap(2)}>
                <Caption>Active players ({dealt.length})</Caption>
                <div className="sat-cluster" style={gap(2)}>
                  {bySeat(g, g.playerIds.filter((p) => playerStatus(g, p) !== 'out')).map((p) => (
                    <button key={p} className="sat-chip" aria-pressed={dealt.includes(p)}
                      onClick={() => {
                        const nx = dealt.includes(p) ? dealt.filter((x) => x !== p) : bySeat(g, [...dealt, p]);
                        setDealt(nx);
                        if (!button || !nx.includes(button)) setButton(nextButton(g, nx));
                      }}>
                      {name(p)}{playerStatus(g, p) === 'away' ? ' (away)' : ''}
                    </button>
                  ))}
                </div>
              </section>
              <section className="sat-stack" style={gap(2)}>
                <Caption tip="dealer">Button</Caption>
                <div className="felt-scroll">
                  {bySeat(g, dealt).map((p) => <button key={p} className="sat-chip" aria-pressed={button === p} onClick={() => setButton(p)}>{name(p)}</button>)}
                </div>
                {dealt.length >= 2 && (() => {
                  const [s1, b1] = Object.keys(blinds({ ...g, sb: sbN || g.sb, bb: bbN || g.bb }, dealt, button));
                  return <p className="sat-small sat-muted">Small blind {s1 ? name(s1) : '-'}, big blind {b1 ? name(b1) : '-'}.</p>;
                })()}
              </section>
              <section className="sat-stack" style={gap(2)}>
                <Caption tip="blinds">Blinds</Caption>
                <div className="sat-grid" style={{ ['--sat-min' as string]: '110px', ...gap(3) }}>
                  <div className="sat-field"><label htmlFor="h-sb">Small blind</label><input id="h-sb" className="sat-input sat-num" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></div>
                  <div className="sat-field"><label htmlFor="h-bb">Big blind</label><input id="h-bb" className="sat-input sat-num" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></div>
                </div>
              </section>
            </>
          )
        )}

        {street && log && (
          <>
            {street !== 'preflop' && (
              <BoardRow board={st.board} to={STREET_CARDS[street]} lockedBefore={STREET_CARDS[STREETS[STREETS.indexOf(street) - 1]]}
                isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
            )}
            {legacy ? (
              <p className="sat-small sat-muted">This hand was logged with the earlier recorder. {inAtEnd(log, street).length} players were still in after the {LABEL[street].toLowerCase()}, pot {units(potTotal(g, log, log.button, street))}.</p>
            ) : replay && (
              <ActionTable g={g} log={log} street={street} replay={replay} sel={sel} stacks={stacks} name={name}
                onTap={tapCell} onSelect={(p, r) => { setTarget(null); setSel({ p, r }); setTyped(''); }} />
            )}
          </>
        )}

        {st.tab === 'showdown' && log && (
          <>
            {log.runFrom !== undefined && live.length > 1 && (
              <section className="sat-glass sat-card sat-stack" style={gap(3)}>
                <div className="sat-split"><h2 className="sat-h3">All-in: run it</h2><Help k="runs" /></div>
                <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Times to run the board">
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={(log.runs ?? 1) === n} onClick={() => setRuns(n)}>{n === 1 ? 'Once' : `${n}x`}</button>)}
                </div>
                {(log.runs ?? 1) === 1 ? (
                  <BoardRow board={st.board} to={5} lockedBefore={log.runFrom} isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
                ) : (
                  <div className="sat-stack" style={gap(2)}>
                    {Array.from({ length: log.runs ?? 1 }, (_, r) => (
                      <div key={r} className="sat-cluster" style={{ ...gap(2), flexWrap: 'nowrap' }}>
                        <span className="sat-caption" style={{ width: 44 }}>Run {r + 1}</span>
                        {commonCards(log.runFrom ?? 0).map((c) => <PlayingCard key={c} card={c} size="sm" />)}
                        {Array.from({ length: 5 - (log.runFrom ?? 0) }, (_, i) => (
                          <PlayingCard key={i} card={st.runSlots[r]?.[i] ?? null} target={isTarget({ kind: 'run', r, i })} onClick={() => tapSlot({ kind: 'run', r, i }, !!st.runSlots[r]?.[i])} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {live.length > 1 && (
              <section className="sat-glass sat-card sat-stack" style={gap(3)}>
                <div className="sat-split">
                  <h2 className="sat-h3">Cards shown <Help k="shown" /></h2>
                  <button className="sat-btn sat-btn--sm" onClick={() => { set({ skipReveal: !st.skipReveal }); setTarget(null); }}>{st.skipReveal ? 'Show cards' : 'Skip'}</button>
                </div>
                {st.skipReveal ? <p className="sat-small sat-muted">Cards skipped. Pick the winner under Result.</p> : (
                  <div className="felt-list sat-glass-2">
                    {live.map((p) => {
                      const cards = st.shown[p] ?? [null, null];
                      const mucked = log.mucked.includes(p);
                      const b = boardForResolve();
                      const v = cards.every(Boolean) && b.length === 5 ? bestHand([...(cards as Card[]), ...b]) : null;
                      return (
                        <div key={p} className="felt-row">
                          <div className="felt-row-main">
                            <div className="felt-row-title">{name(p)}{log.allInAt?.[p] ? <span className="sat-badge sat-badge--muted" style={{ marginLeft: 6 }}>All-in</span> : null}</div>
                            <div className="felt-row-sub">{mucked ? 'Mucked' : v ? v.name : 'Not shown'}</div>
                          </div>
                          {!mucked && cards.map((c, ci) => <PlayingCard key={ci} card={c} target={isTarget({ kind: 'shown', p, ci })} onClick={() => tapSlot({ kind: 'shown', p, ci }, !!c)} />)}
                          <button className="sat-chip" aria-pressed={mucked} onClick={() => setSt({ ...st, log: { ...log, mucked: mucked ? log.mucked.filter((x) => x !== p) : [...log.mucked, p] } })}>Muck</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <section className="sat-glass sat-card sat-stack" style={gap(3)}>
              <h2 className="sat-h3">Result</h2>
              {res && <ResultView res={res} live={live} runs={log.runs ?? 1} name={name} manual={st.manual} onManual={(i, ids) => set({ manual: { ...st.manual, [i]: ids } })} />}
              <div className="sat-field">
                <label htmlFor="note">Note</label>
                <textarea id="note" className="sat-input" placeholder="Optional" value={st.note} onChange={(e) => set({ note: e.target.value })} />
              </div>
            </section>
          </>
        )}
      </div>

      <div className="sat-bottombar sat-glass-2 felt-rec-dock">
        {target ? (
          <div className="felt-picker-wrap">
            <div className="sat-split">
              <Caption>{targetLabel(target, name)}</Caption>
              <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setTarget(null)}>Done</button>
            </div>
            <div className="felt-picker">
              {SUITS.flatMap((su) => RANKS.map((r) => {
                const c = r + su;
                return (
                  <button key={c} disabled={used.has(c) && c !== currentCard(target)} onClick={() => pick(c)} aria-label={c}>
                    <span className="r" style={{ color: SUIT_COLOR[su] }}>{r === 'T' ? '10' : r}</span>
                    <span className="s" style={{ color: SUIT_COLOR[su] }}>{SUIT_SYMBOL[su]}</span>
                  </button>
                );
              }))}
            </div>
          </div>
        ) : replay && selCell && sel ? (
          <Keypad who={name(sel.p)} toCall={selCell.toCall} typed={typed} setTyped={setTyped}
            onCall={() => act(sel.p, sel.r, { k: 'call' })} onFold={() => act(sel.p, sel.r, { k: 'fold' })}
            onAllIn={() => act(sel.p, sel.r, { k: 'allin', to: typed ? Number(typed) : undefined })}
            half={sizeTo(0.5)} pot={sizeTo(1)} onSize={commitBet} onOk={() => commitBet(Number(typed))} />
        ) : null}
        <div className="felt-dock-actions">
          {st.tab === 'setup' && !log && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={startHand}>Start hand</button>}
          {st.tab === 'setup' && log && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab(st.ended ? 'showdown' : lastStreet)}>Back to the action</button>}
          {street && log && (nextStreet && log.streets[nextStreet] ? (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab(nextStreet)}>Go to the {LABEL[nextStreet].toLowerCase()}</button>
          ) : st.ended ? (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => goTab('showdown')}>Showdown</button>
          ) : (
            <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => nextFrom(street)}>{nextLabel(log, street)}</button>
          ))}
          {st.tab === 'showdown' && (
            <>
              {!existing && <button className="sat-btn sat-btn--lg" aria-disabled={!!res?.missing} onClick={() => save(true)}>Save, next</button>}
              <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!!res?.missing} onClick={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function targetLabel(t: Exclude<Target, null>, name: (id: ID) => string) {
  if (t.kind === 'board') return BOARD_SLOT[t.i];
  if (t.kind === 'run') return `Run ${t.r + 1}, card ${t.i + 1}`;
  return `${name(t.p)}, card ${t.ci + 1}`;
}

/** Label for closing the street on screen (empty boxes count as calls). */
function nextLabel(log: HandLog, s: StreetName) {
  const l = { ...log, streets: { ...log.streets, [s]: { ...log.streets[s]!, at: 1 } } };
  if (inAtEnd(l, s).length <= 1) return 'Result';
  if (s === 'river') return 'Showdown';
  return `Next: ${LABEL[STREETS[STREETS.indexOf(s) + 1]]}`;
}

function firstEmptyRun(log: HandLog, board: (Card | null)[], runSlots: (Card | null)[][]): Target {
  const runs = log.runs ?? 1;
  const from = log.runFrom ?? 0;
  if (runs <= 1) {
    const i = board.findIndex((x, k) => !x && k >= from);
    return i >= 0 ? { kind: 'board', i } : null;
  }
  for (let r = 0; r < runs; r++) {
    const i = (runSlots[r] ?? []).findIndex((x) => !x);
    if (i >= 0) return { kind: 'run', r, i };
  }
  return null;
}

/* ------------------------------- pieces ------------------------------- */

function BoardRow({ board, to, lockedBefore, isTarget, onTap }: {
  board: (Card | null)[]; to: number; lockedBefore: number; isTarget: (i: number) => boolean; onTap: (i: number, filled: boolean) => void;
}) {
  return (
    <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap', paddingTop: 6 }}>
      {Array.from({ length: to }, (_, i) => {
        const c = board[i];
        if (i < lockedBefore) return <PlayingCard key={i} card={c} size="sm" />;
        return <PlayingCard key={i} card={c} size="lg" target={isTarget(i)} placeholder={i < 3 ? 'FLOP' : i === 3 ? 'TURN' : 'RIVER'} onClick={() => onTap(i, !!c)} />;
      })}
    </div>
  );
}

/** One row per player in acting order, one column per pass around the table.
    Players who folded earlier stay in their seat as a greyed row. */
function ActionTable({ g, log, street, replay, sel, stacks, name, onTap, onSelect }: {
  g: Game; log: HandLog; street: StreetName; replay: Replay; sel: Sel; stacks?: Record<ID, number>;
  name: (id: ID) => string; onTap: (p: ID, r: number) => void; onSelect: (p: ID, r: number) => void;
}) {
  const bl = blinds(g, log.dealt, log.button);
  const [sbSeat] = Object.keys(bl);
  const rows = streetOrder(g, log, street);
  const startIn = inAtStart(log, street);
  const spentBefore = (p: ID) => STREETS.slice(0, STREETS.indexOf(street)).reduce((a, x) => a + (log.streets[x]?.bets[p] ?? 0), 0);
  const tag = (p: ID) => [p === log.button ? 'BTN' : '', street === 'preflop' && bl[p] !== undefined ? `${p === sbSeat ? 'SB' : 'BB'} ${units(bl[p])}` : ''].filter(Boolean).join(', ');
  const s = replay.street;
  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <p className="sat-small sat-muted">Tap a box: call. Tap again: fold. Type an amount: bet or raise. <Help k="betEntry" /></p>
      <div className="felt-acts" style={{ ['--cols' as string]: replay.cols }}>
        {rows.map((p) => {
          const gone = !startIn.includes(p);
          const canAct = replay.order.includes(p);
          const folded = gone || s.folded.includes(p);
          const left = stacks?.[p] !== undefined ? round2(stacks[p] - spentBefore(p) - (s.bets[p] ?? 0)) : undefined;
          const sub = [tag(p), gone ? 'Folded' : !canAct && log.allInAt?.[p] ? 'All-in' : left !== undefined && !folded ? `${units(Math.max(0, left))} left` : ''].filter(Boolean).join(', ');
          return (
            <div key={p} className={`felt-acts-row ${folded ? 'is-folded' : ''}`}>
              <div className="felt-acts-name">
                <span className="felt-ellipsis">{name(p)}</span>
                {sub && <span className="felt-acts-sub felt-ellipsis">{sub}</span>}
              </div>
              {Array.from({ length: replay.cols }, (_, r) => {
                const c = canAct ? replay.cells[p]?.[r] : undefined;
                if (!c?.needed) return <span key={r} className="felt-box is-off" aria-hidden="true" />;
                const isSel = sel?.p === p && sel.r === r;
                const a = c.act;
                const verb = !a ? (c.implied ? (c.toCall ? 'Call' : 'Check') : '') : a.k === 'fold' ? 'Fold' : a.k === 'call' ? (c.toCall ? 'Call' : 'Check') : a.k === 'allin' ? 'All-in' : street === 'preflop' || c.toCall ? 'Raise' : 'Bet';
                const amt = a?.k !== 'fold' && (a || c.implied) && c.amount ? units(c.amount) : '';
                return (
                  <button key={r} type="button" className={`felt-box ${a ? `is-${a.k}` : c.implied ? 'is-implied' : 'is-empty'} ${isSel ? 'is-sel' : ''}`}
                    aria-label={`${name(p)}, pass ${r + 1}: ${verb || 'waiting'}${amt ? ` ${amt}` : ''}. Tap to ${!a ? 'call' : a.k === 'fold' ? 'clear' : 'fold'}`}
                    onClick={() => onTap(p, r)} onContextMenu={(e) => { e.preventDefault(); onSelect(p, r); }}>
                    <span className="v">{verb || (c.toCall ? 'to call' : '')}</span>
                    <span className="n sat-num">{amt || (!a && !c.implied && c.toCall ? units(c.toCall) : '')}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Number pad for bets, so the phone keyboard never covers the table. */
function Keypad({ who, toCall, typed, setTyped, onCall, onFold, onAllIn, half, pot, onSize, onOk }: {
  who: string; toCall: number; typed: string; setTyped: (v: string) => void;
  onCall: () => void; onFold: () => void; onAllIn: () => void; half: number; pot: number; onSize: (v: number) => void; onOk: () => void;
}) {
  const press = (k: string) => setTyped(k === 'del' ? typed.slice(0, -1) : (typed + k).replace(/^0+(?=\d)/, '').slice(0, 6));
  return (
    <div className="felt-keypad" role="group" aria-label={`Action for ${who}`}>
      <div className="felt-keypad-head">
        <span className="felt-ellipsis"><b>{who}</b>{toCall ? `, ${units(toCall)} to call` : ', nothing to call'}</span>
        <span className="felt-keypad-val sat-num">{typed ? `Bet to ${typed}` : 'Type a bet'}</span>
      </div>
      <div className="felt-keypad-quick">
        <button type="button" onClick={onCall}>{toCall ? 'Call' : 'Check'}</button>
        <button type="button" onClick={onFold}>Fold</button>
        <button type="button" onClick={() => onSize(half)}>½ pot<small className="sat-num">{units(half)}</small></button>
        <button type="button" onClick={() => onSize(pot)}>Pot<small className="sat-num">{units(pot)}</small></button>
        <button type="button" onClick={onAllIn}>All-in</button>
      </div>
      <div className="felt-keypad-digits">
        {['1', '2', '3', '4', '5', 'del', '6', '7', '8', '9', '0', 'ok'].map((k) => k === 'ok'
          ? <button key={k} type="button" className="is-ok" aria-disabled={!typed} onClick={onOk}>Bet</button>
          : <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}>{k === 'del' ? <Icon name="back" size={18} /> : k}</button>)}
      </div>
    </div>
  );
}

function ResultView({ res, live, runs, name, manual, onManual }: {
  res: NonNullable<ReturnType<typeof resolve>>; live: ID[]; runs: number; name: (id: ID) => string;
  manual: Record<number, ID[]>; onManual: (i: number, ids: ID[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  if (live.length === 1) {
    const total = res.pots.reduce((a, p) => a + p.amount, 0);
    return (
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <p className="sat-body"><b>{name(live[0])} wins {units(total)} chips.</b> Everyone else folded.</p>
        {Object.entries(res.returned).map(([p, a]) => <p key={p} className="sat-small sat-muted">{units(a)} returned to {name(p)} (nobody called it).</p>)}
      </div>
    );
  }
  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
      {res.pots.map((p, i) => {
        const title = res.pots.length === 1 ? 'Pot' : i === 0 ? 'Main pot' : `Side pot ${i}`;
        const decided = p.runs.every((r) => r.winners.length);
        return (
          <div key={i} className="sat-glass-2 felt-list" style={{ paddingBlock: 'var(--sat-space-2)' }}>
            <div className="sat-split" style={{ minHeight: 40 }}>
              <span><b>{title}</b> <span className="sat-num">{units(p.amount)}</span> <span className="sat-small sat-muted">({p.eligible.map(name).join(', ')})</span></span>
              <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? 'Done' : decided ? 'Change' : 'Pick winner'}</button>
            </div>
            {runs > 1 && p.runs.map((r, k) => <p key={k} className="sat-small">Run {k + 1}: {r.winners.length ? r.winners.map(name).join(' and ') : <span className="felt-down">no winner yet</span>}</p>)}
            {(editing === i || !decided) && (
              <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', paddingBlock: 'var(--sat-space-2)' }}>
                <p className="sat-small sat-muted">{decided ? 'Pick the winner by hand (applies to every run).' : 'No shown hand decides this pot. Pick the winner.'}</p>
                <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
                  {p.eligible.map((q) => <button key={q} className="sat-chip" aria-pressed={!!manual[i]?.includes(q)} onClick={() => onManual(i, manual[i]?.includes(q) ? manual[i].filter((x) => x !== q) : [...(manual[i] ?? []), q])}>{name(q)}</button>)}
                </div>
                {manual[i]?.length ? <button className="sat-btn sat-btn--ghost sat-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => onManual(i, [])}>Use the shown cards</button> : null}
              </div>
            )}
            {p.winners.map((w) => (
              <div key={w.playerId} className="felt-row" style={{ minHeight: 40, padding: '4px 0' }}>
                <span className="felt-row-main">{name(w.playerId)}</span><span className="sat-num" style={{ fontWeight: 600 }}>{units(w.amount)}</span>
              </div>
            ))}
          </div>
        );
      })}
      {Object.entries(res.returned).map(([p, a]) => <p key={p} className="sat-small sat-muted"><span className="sat-num">{units(a)}</span> returned to {name(p)}: nobody could match it.</p>)}
      <div className="sat-well felt-split" style={{ borderRadius: 'var(--sat-radius-md)' }}>
        <Caption q="chips">Won this hand</Caption>
        {res.winners.map((w) => (
          <div key={w.playerId} className="felt-row" style={{ minHeight: 40, padding: '4px 0' }}>
            <span className="felt-row-main felt-row-title">{name(w.playerId)}</span><span className="sat-num" style={{ fontWeight: 600 }}>{units(w.amount)}</span>
          </div>
        ))}
      </div>
      {runs > 1 && <p className="sat-small sat-muted">Each run wins an equal share of each pot; an odd chip goes to run 1. <Help k="runs" /></p>}
      {res.pots.some((p) => p.runs.some((r) => r.winners.length > 1)) && <p className="sat-small sat-muted">Odd chips in a split go to the winner closest to the left of the button. <Help k="split" /></p>}
    </div>
  );
}
