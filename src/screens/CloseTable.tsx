import { useState } from 'react';
import { useGame, useStore, usePlayerName, suggestPayouts } from '../store';
import { back, go } from '../router';
import { Avatar, Caption, Delta, Empty, Header, Help, Icon, Sheet, num, toast, SourceTip } from '../components/ui';
import { gameResults, payoutDiscrepancy, playerStatus, round2, tournamentPlace, totalPotMoney } from '../lib/calc';
import { dateLabel, duration, money, units } from '../lib/format';
import { uid } from '../lib/ids';
import type { Expense, Game, ID } from '../types';
import { gameSubtitle } from './GameLive';

const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

export default function CloseTable({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [expOpen, setExpOpen] = useState(false);
  const [editExp, setEditExp] = useState<Expense | 'new' | null>(null);

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Settle Up" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const closed = g.status === 'closed';
  const results = gameResults(g);
  const paid = g.transfers.filter((t) => t.resolved);
  const open = g.transfers.filter((t) => !t.resolved);
  const paidSum = paid.reduce((a, t) => a + t.amount, 0);
  const openSum = open.reduce((a, t) => a + t.amount, 0);
  const expTotal = g.expenses.reduce((a, e) => a + e.amount, 0);
  const payers = [...new Set(g.transfers.map((t) => t.from))];
  const fmt = (a: number) => money(a, g.currency);

  const mutateExpenses = (fn: (x: Game) => void) => {
    st.updateGame(g.id, fn);
    if (closed) st.refreshTransfers(g.id);
  };

  return (
    <div className="felt-page">
      <Header back={() => back(closed ? 'games' : `game/${g.id}`)} title={closed ? 'Settle Up' : g.type === 'cash' ? 'End Game' : 'End Tournament'}
        sub={`${g.name}, ${gameSubtitle(g)}`}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => go(`game/${g.id}`)} aria-label="Open the game"><Icon name="cards" /></button>} />

      <div className="sat-stack" style={gap(5)}>
        {!closed && g.type === 'cash' && (
          <section className="sat-glass sat-card sat-stack" style={gap(3)}>
            <h2 className="sat-h3">Count chips first</h2>
            <p className="sat-small sat-muted">Enter each player's final count, then settle up here.</p>
            <button className="sat-btn sat-btn--primary" onClick={() => go(`game/${g.id}/count`, true)}>Count chips</button>
          </section>
        )}

        {g.type === 'tournament' && <TournamentFinish g={g} />}

        {closed && (
          <>
            <section className="sat-grid" style={{ ['--sat-min' as string]: '140px', ...gap(3) }} aria-label="Payments">
              <div className="sat-glass sat-stat">
                <Caption q={g.currency}>Paid</Caption>
                <span className="sat-kpi">{money(paidSum, '')}</span>
                <span className="sat-note">{paid.length} of {g.transfers.length} payments</span>
              </div>
              <div className="sat-glass sat-stat">
                <Caption q={g.currency} tip="payments">Still owed</Caption>
                <span className="sat-kpi">{money(openSum, '')}</span>
                <span className="sat-note">{open.length ? `${open.length} to go` : 'All paid'}</span>
              </div>
            </section>
            <div className="felt-track" aria-hidden="true"><span style={{ width: `${g.transfers.length ? (paid.length / g.transfers.length) * 100 : 100}%` }} /></div>

            <section className="sat-stack" style={gap(3)}>
              <div className="sat-split"><h2 className="sat-h2">Results</h2><span className="sat-small sat-muted">{duration((g.endedAt ?? Date.now()) - g.startedAt)}</span></div>
              <div className="sat-glass-2 felt-list">
                {results.map((r, i) => (
                  <div key={r.playerId} className="felt-row">
                    <span className="sat-mono sat-muted" style={{ width: 16 }}>{i + 1}</span>
                    <Avatar name={name(r.playerId)} size="sm" />
                    <div className="felt-row-main">
                      <div className="felt-row-title">{name(r.playerId)} {r.place ? <span className="sat-badge">{r.place === 1 ? 'Winner' : `Place ${r.place}`}</span> : null}</div>
                      <div className="felt-row-sub">
                        {g.type === 'cash' ? `${units(r.inUnits)} in, ${units(r.outUnits)} out, ${r.buyIns} buy-in${r.buyIns === 1 ? '' : 's'}` : `${r.buyIns} entr${r.buyIns === 1 ? 'y' : 'ies'}, won ${fmt(r.out)}`}
                        {r.expenses !== 0 && `, expenses ${money(r.expenses, g.currency, { sign: true })}`}
                      </div>
                    </div>
                    <Delta value={r.net} format={fmt} />
                  </div>
                ))}
              </div>
              <div className="felt-source"><SourceTip>Felt game log ({dateLabel(g.startedAt)}). Result = cash-out - buy-ins, in {g.currency}.</SourceTip></div>
            </section>
          </>
        )}

        <section className="sat-glass sat-card sat-stack" style={gap(3)}>
          <div className="sat-split">
            <button className="sat-cluster" style={{ ...gap(2), minHeight: 44, textAlign: 'left' }} onClick={() => setExpOpen(!expOpen)} aria-expanded={expOpen}>
              <span style={{ transform: expOpen ? 'none' : 'rotate(-90deg)', transition: 'transform var(--sat-dur-fast)', display: 'inline-flex' }}><Icon name="chevron" size={16} /></span>
              <h2 className="sat-h3">Expenses</h2>
            </button>
            <span className="sat-cluster" style={gap(2)}><span className="sat-num">{fmt(expTotal)}</span><Help k="expenses" /></span>
          </div>
          {expOpen && (
            <>
              {g.expenses.map((e) => (
                <button key={e.id} className="felt-row" onClick={() => setEditExp(e)}>
                  <div className="felt-row-main">
                    <div className="felt-row-title">{e.label}</div>
                    <div className="felt-row-sub">{e.paidBy ? `${name(e.paidBy)} paid` : 'Not paid yet'}, split {e.splitAmong.length} ways</div>
                  </div>
                  <span className="sat-num">{fmt(e.amount)}</span>
                </button>
              ))}
              <button className="sat-btn" onClick={() => setEditExp('new')}><Icon name="plus" /> Add expense</button>
            </>
          )}
        </section>

        {closed && (
          <section className="sat-stack" style={gap(3)}>
            <div className="sat-split">
              <h2 className="sat-h2">Payments</h2>
              {open.length > 1 && <button className="sat-btn sat-btn--sm" onClick={() => open.forEach((t) => st.setTransferResolved(g.id, t.id, true))}><Icon name="check" /> Mark all paid</button>}
            </div>
            {g.transfers.length === 0 && <Empty title="Nobody owes anything" />}
            {payers.map((p) => {
              const ts = g.transfers.filter((t) => t.from === p);
              return (
                <div key={p} className="sat-glass-2 felt-list">
                  <div className="felt-row">
                    <Avatar name={name(p)} size="sm" />
                    <span className="felt-row-main felt-row-title">{name(p)}</span>
                    {ts.every((t) => t.resolved) && <span className="sat-badge">Paid</span>}
                  </div>
                  {ts.map((t) => (
                    <div key={t.id} className="felt-row" style={{ paddingLeft: 40 }}>
                      <span className="felt-row-main">Pays <b>{name(t.to)}</b></span>
                      <span className="sat-num" style={{ fontWeight: 600 }}>{fmt(t.amount)}</span>
                      {t.resolved ? (
                        <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => st.setTransferResolved(g.id, t.id, false)} aria-label={`Undo: ${name(p)} paid ${name(t.to)}`}><Icon name="undo" /> Undo</button>
                      ) : (
                        <button className="sat-btn sat-btn--sm" onClick={() => { st.setTransferResolved(g.id, t.id, true); toast(`${name(p)} paid ${name(t.to)} ${fmt(t.amount)}`); }}>Mark paid</button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            <button className="sat-btn sat-btn--ghost" onClick={() => { st.reopenGame(g.id); go(`game/${g.id}`, true); toast('Game reopened for changes'); }}>
              <Icon name="undo" /> Reopen game
            </button>
          </section>
        )}
      </div>

      {closed && (
        <div className="sat-bottombar sat-glass-2">
          <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => go(`game/${g.id}/report`)}><Icon name="share" /> Share report</button>
        </div>
      )}

      {editExp && (
        <ExpenseSheet g={g} expense={editExp === 'new' ? null : editExp} onClose={() => setEditExp(null)}
          onSave={(e) => mutateExpenses((x) => { const i = x.expenses.findIndex((y) => y.id === e.id); if (i >= 0) x.expenses[i] = e; else x.expenses.push(e); })}
          onDelete={(id) => mutateExpenses((x) => { x.expenses = x.expenses.filter((y) => y.id !== id); })} />
      )}
    </div>
  );
}

function ExpenseSheet({ g, expense, onClose, onSave, onDelete }: {
  g: Game; expense: Expense | null; onClose: () => void; onSave: (e: Expense) => void; onDelete: (id: ID) => void;
}) {
  const name = usePlayerName();
  const [label, setLabel] = useState(expense?.label ?? 'Food and drinks');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [paidBy, setPaidBy] = useState<ID | undefined>(expense?.paidBy);
  const [split, setSplit] = useState<ID[]>(expense?.splitAmong ?? [...g.playerIds]);
  const [confirm, setConfirm] = useState(false);
  const a = num(amount);
  const bad = a === null || a <= 0 || !split.length;
  return (
    <Sheet open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'}>
      <div className="sat-grid" style={{ ['--sat-min' as string]: '130px', ...gap(3) }}>
        <div className="sat-field"><label htmlFor="ex-l">For</label><input id="ex-l" className="sat-input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <div className="sat-field"><label htmlFor="ex-a">Amount ({g.currency})</label><input id="ex-a" className="sat-input sat-num" inputMode="decimal" placeholder="e.g. 54" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <div className="sat-stack" style={gap(2)}>
        <Caption>Paid by</Caption>
        <div className="sat-cluster" style={gap(2)}>
          {g.playerIds.map((p) => <button key={p} className="sat-chip" aria-pressed={paidBy === p} onClick={() => setPaidBy(paidBy === p ? undefined : p)}>{name(p)}</button>)}
        </div>
      </div>
      <div className="sat-stack" style={gap(2)}>
        <div className="sat-split">
          <Caption q={`${split.length} players`}>Split between</Caption>
          <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setSplit(split.length === g.playerIds.length ? [] : [...g.playerIds])}>{split.length === g.playerIds.length ? 'Clear' : 'Pick all'}</button>
        </div>
        <div className="sat-cluster" style={gap(2)}>
          {g.playerIds.map((p) => <button key={p} className="sat-chip" aria-pressed={split.includes(p)} onClick={() => setSplit(split.includes(p) ? split.filter((x) => x !== p) : [...split, p])}>{name(p)}</button>)}
        </div>
        {a !== null && split.length > 0 && <p className="sat-small sat-muted">Each share = <span className="sat-num">{money(round2(a / split.length), g.currency)}</span></p>}
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={bad}
        onClick={() => { if (bad) { toast('Enter an amount and pick who shares it.'); return; } onSave({ id: expense?.id ?? uid(), label: label.trim() || 'Expense', amount: a!, paidBy, splitAmong: split }); onClose(); }}>Save expense</button>
      {expense && (
        <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }} onClick={() => { if (!confirm) { setConfirm(true); return; } onDelete(expense.id); onClose(); }}>
          <Icon name="trash" /> {confirm ? 'Tap again to remove' : 'Remove expense'}
        </button>
      )}
    </Sheet>
  );
}

function TournamentFinish({ g }: { g: Game }) {
  const st = useStore();
  const name = usePlayerName();
  const t = g.tournament!;
  const closed = g.status === 'closed';
  const places = g.playerIds.map((p) => ({ p, place: tournamentPlace(g, p) })).sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  const alive = g.playerIds.filter((p) => !t.bustOrder.includes(p));
  const disc = payoutDiscrepancy(g);
  const paidPlaces = Math.min(t.payouts.length, g.playerIds.length);

  const commit = (fn: (x: Game) => void) => { st.updateGame(g.id, fn); if (closed) st.refreshTransfers(g.id); };
  const setPayout = (i: number, v: string) => commit((x) => {
    const arr = [...x.tournament!.payouts];
    arr[i] = num(v) ?? 0;
    x.tournament!.payouts = arr;
    x.tournament!.customPayouts = true;
  });
  const setPaidPlaces = (n: number) => commit((x) => {
    const arr = [...x.tournament!.payouts];
    while (arr.length < n) arr.push(0);
    arr.length = n;
    x.tournament!.payouts = arr;
    x.tournament!.customPayouts = true;
  });

  return (
    <section className="sat-glass sat-card sat-stack" style={gap(3)}>
      <div className="sat-stack" style={gap(1)}>
        <Caption q={g.currency}>Prize pool</Caption>
        <span className="sat-kpi">{money(totalPotMoney(g), '')}</span>
      </div>
      {!closed && alive.length > 1 && <p className="sat-small" style={{ color: 'var(--sat-warn)' }}>{alive.length} players are still in. Finish now and they take the top places in seat order.</p>}
      <div className="sat-split"><h2 className="sat-h3">Payouts</h2><Help k="payouts" /></div>
      <div className="sat-glass-2 felt-list">
        {Array.from({ length: paidPlaces }).map((_, i) => {
          const who = places.find((x) => x.place === i + 1)?.p;
          return (
            <div key={i} className="felt-row">
              <span className="sat-mono sat-muted" style={{ width: 20 }}>{i + 1}</span>
              <span className="felt-row-main felt-row-title">{who ? name(who) : <span className="sat-muted">-</span>}</span>
              <input key={`${i}-${t.payouts[i]}`} className="sat-input sat-num" style={{ width: 120 }} inputMode="decimal" aria-label={`Payout for place ${i + 1} (${g.currency})`}
                defaultValue={t.payouts[i] ?? 0} onBlur={(e) => setPayout(i, e.target.value)} />
            </div>
          );
        })}
      </div>
      <div className="sat-split">
        <div className="sat-cluster" style={gap(2)}>
          <button className="sat-btn sat-iconbtn" aria-disabled={paidPlaces <= 1} onClick={() => paidPlaces > 1 && setPaidPlaces(paidPlaces - 1)} aria-label="Pay one place fewer">−</button>
          <span className="sat-small sat-num">{paidPlaces} paid</span>
          <button className="sat-btn sat-iconbtn" aria-disabled={paidPlaces >= g.playerIds.length} onClick={() => paidPlaces < g.playerIds.length && setPaidPlaces(paidPlaces + 1)} aria-label="Pay one more place">+</button>
          <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => commit((x) => { x.tournament!.payouts = suggestPayouts(x); x.tournament!.customPayouts = false; })}>Reset</button>
        </div>
        <span className={`sat-small ${disc === 0 ? 'felt-up' : ''}`} style={disc === 0 ? undefined : { color: 'var(--sat-warn)' }}>{disc === 0 ? 'Total = prize pool' : `Total is ${money(disc, g.currency, { sign: true })} v pool`}</span>
      </div>
      {!closed && (
        <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={() => {
          st.updateGame(g.id, (x) => {
            const rest = x.playerIds.filter((p) => !x.tournament!.bustOrder.includes(p)).sort((a, b) => (x.seats[b] ?? 0) - (x.seats[a] ?? 0));
            // remaining players are busted in reverse seat order, so the lowest seat finishes highest
            rest.slice(0, -1).forEach((p) => { x.tournament!.bustOrder.push(p); });
            for (const p of x.playerIds) if (playerStatus(x, p) !== 'out') x.statusEvents.push({ playerId: p, status: 'out', at: Date.now() });
          });
          st.finishGame(g.id);
        }}>Finish and settle up</button>
      )}
    </section>
  );
}
