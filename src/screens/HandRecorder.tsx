import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, PlayingCard, toast } from '../components/ui';
import { RANKS, SUITS, SUIT_COLOR, SUIT_SYMBOL, bestHand } from '../lib/cards';
import { playerStatus, round2 } from '../lib/calc';
import { units } from '../lib/format';
import { uid } from '../lib/ids';
import {
  STREETS, STREET_CARDS, actionClosed, actors, blinds, finalists, highBet, inAtEnd, inAtStart, newLog,
  openStreet, potTotal, resolve, setStreetPot, streetOrder, tapPlayer, toggleAllIn, toggleRaiser, typeBet,
} from '../lib/hand';
import { estimateStacks } from '../lib/stacks';
import type { Card, Game, Hand, HandLog, ID, StreetName } from '../types';

type Step = 'setup' | StreetName | 'runout' | 'showdown' | 'result';
type Target = { kind: 'board'; i: number } | { kind: 'run'; r: number; i: number } | { kind: 'shown'; p: ID; ci: number } | null;

interface RState {
  id: string;
  n: number;
  log: HandLog | null;
  step: Step;
  note: string;
  board: (Card | null)[];
  runSlots: (Card | null)[][];
  shown: Record<ID, (Card | null)[]>;
  manual: Record<number, ID[]>;
  dealt?: ID[];
  button?: ID;
}

const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const STREET_LABEL: Record<StreetName, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

function dealtDefault(g: Game): ID[] {
  return [...g.playerIds].filter((p) => playerStatus(g, p) === 'playing').sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
}

function nextButton(g: Game, dealt: ID[], prev?: ID): ID | undefined {
  const order = [...dealt].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  if (!order.length) return undefined;
  if (!prev) return g.firstDealer && order.includes(g.firstDealer) ? g.firstDealer : order[0];
  const prevSeat = g.seats[prev] ?? 0;
  return order.find((p) => (g.seats[p] ?? 0) > prevSeat) ?? order[0];
}

export default function HandRecorder({ gameId, handId }: { gameId: string; handId?: string }) {
  const g = useGame(gameId);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const saveHand = useStore((s) => s.saveHand);
  const deleteHand = useStore((s) => s.deleteHand);
  const name = usePlayerName();
  const existing = g?.hands.find((h) => h.id === handId);

  const init = (): RState | null => {
    if (!g) return null;
    if (existing?.log) {
      const L = existing.log;
      const runSlots = (L.runCards ?? []).map((r) => [...r] as (Card | null)[]);
      return {
        id: existing.id, n: existing.n, log: L, step: 'result' as Step, note: existing.note ?? '',
        board: [0, 1, 2, 3, 4].map((i) => existing.board[i] ?? null) as (Card | null)[],
        runSlots, shown: Object.fromEntries(Object.entries(L.shown ?? {}).map(([p, c]) => [p, [c[0] ?? null, c[1] ?? null]])) as Record<ID, (Card | null)[]>,
        manual: {} as Record<number, ID[]>,
      };
    }
    const last = g.hands[g.hands.length - 1];
    const dealt = dealtDefault(g);
    const button = nextButton(g, dealt, last?.dealerId);
    return {
      id: uid(), n: (last?.n ?? 0) + 1, log: null as HandLog | null, step: 'setup' as Step, note: '',
      board: [null, null, null, null, null] as (Card | null)[], runSlots: [] as (Card | null)[][], shown: {} as Record<ID, (Card | null)[]>,
      manual: {} as Record<number, ID[]>, dealt, button,
    };
  };
  const [st, setSt] = useState(init);
  const [dealt, setDealt] = useState<ID[]>(() => st?.dealt ?? existing?.log?.dealt ?? []);
  const [button, setButton] = useState<ID | undefined>(() => st?.button ?? existing?.log?.button ?? existing?.dealerId);
  const [target, setTarget] = useState<Target>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const stacksRef = useRef<Record<ID, number> | undefined>(undefined);

  const est = useMemo(() => (g && st ? estimateStacks(g, st.n) : null), [g, st?.n]);
  if (est && est.complete && !stacksRef.current) stacksRef.current = Object.fromEntries(Object.entries(est.stack).filter(([, v]) => v !== undefined)) as Record<ID, number>;
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

  const mode = st.log?.mode ?? settings.entryMode;
  const log = st.log;
  const set = (patch: Partial<RState>) => setSt({ ...st, ...patch });
  const setLog = (l: HandLog) => set({ log: l });

  /* --------- derived --------- */
  const reached: StreetName[] = log ? STREETS.filter((s) => log.streets[s]) : [];
  const runFrom = log?.runFrom;
  const commonCards = (n: number) => st.board.slice(0, n).filter(Boolean) as Card[];
  const live = log ? finalists(log) : [];
  const potNow = log ? potTotal(g, log, log.button) : 0;
  const shownCards = (): Record<ID, Card[]> => Object.fromEntries(Object.entries(st.shown).map(([p, c]) => [p, c.filter(Boolean) as Card[]]).filter(([, c]) => (c as Card[]).length === 2));
  const fullLog = (): HandLog | null => (log ? {
    ...log,
    runCards: (log.runs ?? 1) > 1 ? st.runSlots.map((r) => r.filter(Boolean) as Card[]) : [],
    shown: shownCards(),
  } : null);
  const boardForResolve = (): Card[] => {
    const L = fullLog()!;
    if ((L.runs ?? 1) > 1) return [...commonCards(L.runFrom ?? 0), ...(L.runCards[0] ?? [])];
    return st.board.filter(Boolean) as Card[];
  };
  const res = log && (st.step === 'result' || st.step === 'showdown') ? resolve(g, fullLog()!, boardForResolve(), log.button, st.manual) : null;

  /* --------- flow --------- */
  const startHand = () => {
    if (dealt.length < 2) { toast('Deal in at least 2 players.'); return; }
    const b = button && dealt.includes(button) ? button : nextButton(g, dealt, undefined);
    setSt({ ...st, log: newLog(g, dealt, mode, b, stacks), step: 'preflop' });
  };
  const stampStreet = (l: HandLog, s: StreetName): HandLog => ({ ...l, streets: { ...l.streets, [s]: { ...l.streets[s]!, at: Date.now() } } });
  const nextFrom = (s: StreetName) => {
    if (!log) return;
    if (mode === 'count' && log.streets[s]?.pot === undefined) { toast(`Enter the pot at the end of the ${s} (e.g. 60).`); return; }
    const need = STREET_CARDS[s];
    if (s !== 'preflop' && commonCards(need).length < need) { toast(`Pick the ${s} card${need - STREET_CARDS[STREETS[STREETS.indexOf(s) - 1]] > 1 ? 's' : ''} first.`); return; }
    let l = stampStreet(log, s);
    const liveNow = inAtEnd(l, s);
    if (liveNow.length <= 1) { setSt({ ...st, log: l, step: 'result' }); setTarget(null); return; }
    if (s === 'river') { setSt({ ...st, log: l, step: 'showdown' }); setTarget(null); return; }
    if (actionClosed(l, s)) {
      l = { ...l, runFrom: STREET_CARDS[s], runs: l.runs || 1 };
      setSt({ ...st, log: l, step: 'runout' });
      setTarget(firstEmptyRun(l, st.board, st.runSlots));
      return;
    }
    const nx = STREETS[STREETS.indexOf(s) + 1];
    if (!l.streets[nx]) l = openStreet(g, l, nx, stacks);
    setSt({ ...st, log: l, step: nx });
    setTarget({ kind: 'board', i: STREET_CARDS[s] });
  };
  const runoutDone = () => {
    if (!log) return;
    const runs = log.runs ?? 1;
    const from = log.runFrom ?? 0;
    if (runs === 1 ? commonCards(5).length < 5 : st.runSlots.slice(0, runs).some((r) => r.filter(Boolean).length < 5 - from)) { toast('Pick the rest of the board for every run.'); return; }
    set({ step: 'showdown' });
    setTarget(null);
  };
  const save = (next: boolean) => {
    if (!log || !res) return;
    if (res.missing) { toast('A pot has no winner. Show the cards or pick the winner under Result.'); return; }
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
      const fresh = useStore.getState().games.find((x) => x.id === g.id)!;
      const d = dealtDefault(fresh);
      const b = nextButton(fresh, d, hand.dealerId);
      stacksRef.current = undefined;
      setDealt(d); setButton(b);
      setSt({ id: uid(), n: hand.n + 1, log: null, step: 'setup', note: '', board: [null, null, null, null, null], runSlots: [], shown: {}, manual: {} });
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
      const stop = st.step === 'runout' ? 5 : st.step === 'flop' ? 3 : st.step === 'turn' ? 4 : 5;
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
    setTarget(n > 1 ? firstEmptyRun({ ...log, runs: n }, st.board, rs) : (st.board.findIndex((x, i) => !x && i >= from) >= 0 ? { kind: 'board', i: st.board.findIndex((x, i) => !x && i >= from) } : null));
  };

  /* --------- summaries --------- */
  const streetSummary = (s: StreetName) => {
    if (!log?.streets[s]) return '';
    const L = log.streets[s]!;
    const ins = inAtEnd(log, s).length;
    const pot = potTotal(g, log, log.button, s);
    const raise = L.raisers.length ? `, raise ${L.raisers.map(name).join(' and ')}` : '';
    const cards = s === 'preflop' ? '' : `${commonCards(STREET_CARDS[s]).slice(STREET_CARDS[STREETS[STREETS.indexOf(s) - 1]]).map(cardLabel).join(' ')}, `;
    return `${cards}${ins} in, pot ${units(pot)}${raise}`;
  };

  const steps: Step[] = ['setup', ...reached, ...(runFrom !== undefined ? ['runout' as Step] : []), ...(['showdown', 'result'] as Step[]).filter((x) => x === st.step || (x === 'showdown' && (st.step === 'result') && live.length > 1))];
  const stepOpen = (s: Step) => st.step === s;
  const openStep = (s: Step) => { set({ step: s }); setTarget(null); };

  /* --------- render --------- */
  const potLabel = log ? <span className="sat-small sat-muted">Pot <span className="sat-num">{units(potNow)}</span></span> : null;

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}`)} title={`Hand ${st.n}`} sub={`${g.name}${log ? `, ${mode === 'bets' ? 'Bet Entry' : 'Pot Count'}` : ''}`}
        right={existing ? (
          <button className="sat-btn sat-btn--ghost sat-iconbtn" style={confirmDel ? { color: 'var(--sat-neg)' } : undefined} aria-label={confirmDel ? 'Tap again to delete this hand' : 'Delete hand'}
            onClick={() => { if (!confirmDel) { setConfirmDel(true); toast('Tap the bin again to delete this hand'); return; } deleteHand(g.id, st.id); go(`game/${g.id}`, true); }}>
            <Icon name="trash" />
          </button>
        ) : undefined} />

      <div className="sat-stack" style={gap(3)}>
        {steps.map((s) => {
          if (s === 'setup') {
            return (
              <StepCard key={s} title="Button and players" open={stepOpen(s)} onOpen={() => !existing && openStep(s)}
                summary={`${button ? `Button ${name(button)}` : 'No button'}, ${dealt.length} dealt in, ${mode === 'bets' ? 'bet entry' : 'pot count'}`}>
                <div className="sat-stack" style={gap(2)}>
                  <Caption tip="dealer">Button</Caption>
                  <div className="felt-scroll">
                    {dealt.map((p) => <button key={p} className="sat-chip" aria-pressed={button === p} onClick={() => setButton(p)}>{name(p)}</button>)}
                  </div>
                </div>
                <div className="sat-stack" style={gap(2)}>
                  <Caption>Dealt in</Caption>
                  <div className="sat-cluster" style={gap(2)}>
                    {[...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99)).filter((p) => playerStatus(g, p) !== 'out').map((p) => (
                      <button key={p} className="sat-chip" aria-pressed={dealt.includes(p)} onClick={() => setDealt((d) => d.includes(p) ? d.filter((x) => x !== p) : [...d, p])}>{name(p)}</button>
                    ))}
                  </div>
                </div>
                <div className="sat-stack" style={gap(2)}>
                  <Caption tip="entryMode">Wagers</Caption>
                  <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="How to enter wagers">
                    <button role="radio" aria-checked={mode === 'bets'} onClick={() => updateSettings({ entryMode: 'bets' })}>Bet entry</button>
                    <button role="radio" aria-checked={mode === 'count'} onClick={() => updateSettings({ entryMode: 'count' })}>Pot count</button>
                  </div>
                </div>
                <button className="sat-btn sat-btn--ghost sat-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => go(`game/${g.id}/hand/quick`, true)}>Quick entry (pot and winner only)</button>
              </StepCard>
            );
          }
          if (s === 'runout') {
            const runs = log!.runs ?? 1;
            const from = log!.runFrom ?? 0;
            return (
              <StepCard key={s} title="All-in: run it" open={stepOpen(s)} onOpen={() => openStep(s)} right={potLabel}
                summary={`${runs === 1 ? 'Ran once' : `Ran ${runs} times`}, ${live.length} players at risk`}>
                <p className="sat-small sat-muted">Betting is over. {live.filter((p) => log!.allInAt?.[p]).map(name).join(', ')} {live.filter((p) => log!.allInAt?.[p]).length === 1 ? 'is' : 'are'} all-in.</p>
                <div className="sat-stack" style={gap(2)}>
                  <Caption tip="runs">Times to run the board</Caption>
                  <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Times to run">
                    {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={runs === n} onClick={() => setRuns(n)}>{n}</button>)}
                  </div>
                </div>
                {runs === 1 ? (
                  <BoardRow board={st.board} from={0} to={5} lockedBefore={from} isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
                ) : (
                  <div className="sat-stack" style={gap(2)}>
                    {Array.from({ length: runs }, (_, r) => (
                      <div key={r} className="sat-cluster" style={{ ...gap(2), flexWrap: 'nowrap' }}>
                        <span className="sat-caption" style={{ width: 44 }}>Run {r + 1}</span>
                        {commonCards(from).map((c) => <PlayingCard key={c} card={c} size="sm" />)}
                        {Array.from({ length: 5 - from }, (_, i) => (
                          <PlayingCard key={i} card={st.runSlots[r]?.[i] ?? null} target={isTarget({ kind: 'run', r, i })} onClick={() => tapSlot({ kind: 'run', r, i }, !!st.runSlots[r]?.[i])} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </StepCard>
            );
          }
          if (s === 'showdown') {
            return (
              <StepCard key={s} title="Showdown" open={stepOpen(s)} onOpen={() => openStep(s)} right={potLabel}
                summary={live.map((p) => `${name(p)} ${log!.mucked.includes(p) ? 'mucked' : st.shown[p]?.filter(Boolean).length === 2 ? st.shown[p].map((c) => cardLabel(c!)).join('') : 'hidden'}`).join(', ')}>
                <p className="sat-small sat-muted">Tap a player's cards to show them, or Muck. Both are optional. <Help k="shown" /></p>
                <div className="sat-glass-2 felt-list">
                  {live.map((p) => {
                    const cards = st.shown[p] ?? [null, null];
                    const mucked = log!.mucked.includes(p);
                    const b = boardForResolve();
                    const v = cards.every(Boolean) && b.length === 5 ? bestHand([...(cards as Card[]), ...b]) : null;
                    return (
                      <div key={p} className="felt-row" style={{ paddingTop: 14 }}>
                        <div className="felt-row-main">
                          <div className="felt-row-title">{name(p)}{log!.allInAt?.[p] ? <span className="sat-badge sat-badge--muted" style={{ marginLeft: 6 }}>All-in</span> : null}</div>
                          <div className="felt-row-sub">{mucked ? 'Mucked' : v ? v.name : 'Not shown'}</div>
                        </div>
                        {!mucked && cards.map((c, ci) => <PlayingCard key={ci} card={c} target={isTarget({ kind: 'shown', p, ci })} onClick={() => tapSlot({ kind: 'shown', p, ci }, !!c)} />)}
                        <button className="sat-chip" aria-pressed={mucked} onClick={() => setLog({ ...log!, mucked: mucked ? log!.mucked.filter((x) => x !== p) : [...log!.mucked, p] })}>Muck</button>
                      </div>
                    );
                  })}
                </div>
              </StepCard>
            );
          }
          if (s === 'result') {
            return (
              <StepCard key={s} title="Result" open summary="">
                {res && <ResultView res={res} live={live} runs={log!.runs ?? 1} name={name} manual={st.manual}
                  onManual={(i, ids) => set({ manual: { ...st.manual, [i]: ids } })} />}
                <div className="sat-field">
                  <label htmlFor="note">Note</label>
                  <textarea id="note" className="sat-input" placeholder="Optional" value={st.note} onChange={(e) => set({ note: e.target.value })} />
                </div>
              </StepCard>
            );
          }
          const street = s as StreetName;
          const prevCards = street === 'preflop' ? 0 : STREET_CARDS[STREETS[STREETS.indexOf(street) - 1]];
          return (
            <StepCard key={s} title={STREET_LABEL[street]} open={stepOpen(s)} onOpen={() => openStep(s)} right={stepOpen(s) ? potLabel : null} summary={streetSummary(street)}>
              {street !== 'preflop' && (
                <BoardRow board={st.board} from={0} to={STREET_CARDS[street]} lockedBefore={prevCards} isTarget={(i) => isTarget({ kind: 'board', i })} onTap={(i, f) => tapSlot({ kind: 'board', i }, f)} />
              )}
              <ActionGrid g={g} log={log!} street={street} stacks={stacks} name={name} onChange={setLog} />
              {mode === 'count' && (
                <div className="sat-field">
                  <label htmlFor={`pot-${street}`}>Pot at the end of the {street} (units) <Help k="potCount" /></label>
                  <input id={`pot-${street}`} className="sat-input sat-num" style={{ fontSize: '1.375rem', minHeight: 52 }} inputMode="decimal" placeholder="Count the middle"
                    value={log!.streets[street]?.pot ?? ''} onChange={(e) => setLog(setStreetPot(log!, street, e.target.value === '' ? undefined : Number(e.target.value)))} />
                </div>
              )}
            </StepCard>
          );
        })}

        {target && (
          <div className="sat-glass-2 felt-picker-shell">
            <div className="sat-split" style={{ marginBottom: 'var(--sat-space-2)' }}>
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
        )}
      </div>

      <div className="sat-bottombar sat-glass-2">
        {st.step === 'setup' && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={startHand}>Deal: preflop</button>}
        {(STREETS as Step[]).includes(st.step) && (
          <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => nextFrom(st.step as StreetName)}>{nextLabel(log!, st.step as StreetName)}</button>
        )}
        {st.step === 'runout' && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={runoutDone}>Showdown</button>}
        {st.step === 'showdown' && <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => { set({ step: 'result' }); setTarget(null); }}>Result</button>}
        {st.step === 'result' && (
          <>
            {!existing && <button className="sat-btn sat-btn--lg" aria-disabled={!!res?.missing} onClick={() => save(true)}>Save, next hand</button>}
            <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!!res?.missing} onClick={() => save(false)}>{existing ? 'Save changes' : 'Save hand'}</button>
          </>
        )}
      </div>
    </div>
  );
}

function cardLabel(c: Card) { return (c[0] === 'T' ? '10' : c[0]) + SUIT_SYMBOL[c[1]]; }

function targetLabel(t: Exclude<Target, null>, name: (id: ID) => string) {
  if (t.kind === 'board') return ['Flop card 1', 'Flop card 2', 'Flop card 3', 'Turn', 'River'][t.i];
  if (t.kind === 'run') return `Run ${t.r + 1}, card ${t.i + 1}`;
  return `${name(t.p)}, card ${t.ci + 1}`;
}

function nextLabel(log: HandLog, s: StreetName) {
  const live = inAtEnd(log, s);
  if (live.length <= 1) return 'Result';
  if (s === 'river') return 'Showdown';
  if (actionClosed(log, s)) return 'Run it out';
  return `Next: ${STREET_LABEL[STREETS[STREETS.indexOf(s) + 1]]}`;
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

function StepCard({ title, summary, open, onOpen, right, children }: {
  title: string; summary: string; open: boolean; onOpen?: () => void; right?: ReactNode; children: ReactNode;
}) {
  if (!open) {
    return (
      <button className="sat-flat felt-step-closed" onClick={onOpen} aria-label={`${title}: ${summary}. Tap to edit`}>
        <span className="sat-caption">{title}</span>
        <span className="sat-small felt-ellipsis">{summary}</span>
      </button>
    );
  }
  return (
    <section className="sat-glass sat-card sat-stack felt-step" style={gap(4)}>
      <div className="sat-split"><h2 className="sat-h3">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

function BoardRow({ board, from, to, lockedBefore, isTarget, onTap }: {
  board: (Card | null)[]; from: number; to: number; lockedBefore: number; isTarget: (i: number) => boolean; onTap: (i: number, filled: boolean) => void;
}) {
  return (
    <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap', paddingTop: 6 }}>
      {Array.from({ length: to - from }, (_, k) => {
        const i = from + k;
        const c = board[i];
        if (i < lockedBefore) return <PlayingCard key={i} card={c} size="sm" />;
        return <span key={i}><PlayingCard card={c} size="lg" target={isTarget(i)} placeholder={i < 3 ? 'FLOP' : i === 3 ? 'TURN' : 'RIVER'} onClick={() => onTap(i, !!c)} /></span>;
      })}
    </div>
  );
}

function ActionGrid({ g, log, street, stacks, name, onChange }: {
  g: Game; log: HandLog; street: StreetName; stacks?: Record<ID, number>; name: (id: ID) => string; onChange: (l: HandLog) => void;
}) {
  const s = log.streets[street];
  const order = streetOrder(g, log, street).filter((p) => inAtStart(log, street).includes(p));
  const canAct = new Set(actors(log, street));
  const bl = street === 'preflop' ? blinds(g, log.dealt, log.button) : {};
  const high = highBet(s);
  const spentBefore = (p: ID) => STREETS.slice(0, STREETS.indexOf(street)).reduce((a, x) => a + (log.streets[x]?.bets[p] ?? 0), 0);
  const tag = (p: ID) => (p === log.button ? 'BTN' : bl[p] === g.sb ? 'SB' : bl[p] === g.bb ? 'BB' : '');
  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <p className="sat-small sat-muted">
        {log.mode === 'bets'
          ? <>Everyone starts in{street === 'preflop' ? ', calling the big blind' : ', checking'}. Tap a player who folds. Type a number to raise. <Help k="betEntry" /></>
          : <>Everyone starts in. Tap a player who folds{street === 'preflop' ? ', and mark who raised' : ''}. <Help k="countEntry" /></>}
      </p>
      <div className="felt-actions">
        {order.map((p) => {
          const folded = !!s?.folded.includes(p);
          const allIn = log.allInAt?.[p];
          const locked = !canAct.has(p);
          const left = stacks?.[p] !== undefined ? round2(stacks[p] - spentBefore(p) - (s?.bets[p] ?? 0)) : undefined;
          return (
            <div key={p} role="button" tabIndex={0} aria-pressed={!folded} className={`felt-act ${folded ? 'is-folded' : 'is-in'} ${locked ? 'is-locked' : ''}`}
              aria-label={`${name(p)}, ${folded ? 'folded' : 'in'}. Tap to ${folded ? 'bring back in' : 'fold'}`}
              onClick={() => !locked && onChange(tapPlayer(log, street, p, stacks))}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !locked && e.target === e.currentTarget) { e.preventDefault(); onChange(tapPlayer(log, street, p, stacks)); } }}>
              <div className="sat-split" style={{ flexWrap: 'nowrap', gap: 4 }}>
                <span className="felt-act-name felt-ellipsis">{name(p)}</span>
                {tag(p) && <span className="sat-badge sat-badge--muted">{tag(p)}</span>}
              </div>
              <div className="felt-act-meta">
                {folded ? 'Folded' : allIn ? 'All-in' : log.mode === 'bets' && (s?.bets[p] ?? 0) === high && high > 0 ? (s?.raisers.includes(p) ? (street !== 'preflop' && s.raisers[0] === p ? 'Bets' : 'Raised') : 'Calls') : log.mode === 'bets' ? (high ? 'Calls' : 'Checks') : 'In'}
                {left !== undefined && !folded && <span>, {units(Math.max(0, left))} left</span>}
              </div>
              {log.mode === 'bets' ? (
                <div className="felt-act-row" onClick={(e) => e.stopPropagation()}>
                  <BetInput value={s?.bets[p] ?? 0} label={`${name(p)} wager on the ${street} (units)`} disabled={locked}
                    onCommit={(v) => onChange(typeBet(g, log, street, p, v, stacks))} />
                  {!locked && !folded && (
                    <button className="sat-chip felt-mini" aria-pressed={!!allIn} onClick={() => {
                      if (!allIn && left !== undefined) onChange(typeBet(g, log, street, p, round2((s?.bets[p] ?? 0) + Math.max(0, left)), stacks));
                      else onChange(toggleAllIn(log, street, p));
                    }}>All-in</button>
                  )}
                </div>
              ) : street === 'preflop' && !folded ? (
                <div className="felt-act-row" onClick={(e) => e.stopPropagation()}>
                  <button className="sat-chip felt-mini" aria-pressed={!!s?.raisers.includes(p)} onClick={() => onChange(toggleRaiser(log, street, p))}>Raised</button>
                  <button className="sat-chip felt-mini" aria-pressed={!!allIn} onClick={() => onChange(toggleAllIn(log, street, p))}>All-in</button>
                </div>
              ) : !folded ? (
                <div className="felt-act-row" onClick={(e) => e.stopPropagation()}>
                  <button className="sat-chip felt-mini" aria-pressed={!!allIn} onClick={() => onChange(toggleAllIn(log, street, p))}>All-in</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Number box that commits on Enter or when it loses focus, so a raise is applied once, not per keystroke. */
function BetInput({ value, label, disabled, onCommit }: { value: number; label: string; disabled?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(/,/g, ''));
    setText(null);
    if (text.trim() === '' || !Number.isFinite(v) || v < 0) { toast('Use numbers only (e.g. 20).'); return; }
    if (v !== value) onCommit(v);
  };
  return (
    <input className="sat-input sat-num felt-bet" inputMode="decimal" aria-label={label} disabled={disabled}
      value={text ?? String(value)} onFocus={(e) => { setText(String(value)); e.target.select(); }}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
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
        <p className="sat-body"><b>{name(live[0])} wins {units(total)} units.</b> Everyone else folded.</p>
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
        <Caption q="units">Won this hand</Caption>
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

