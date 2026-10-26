import { useState } from 'react';
import { useGame, useStore, usePlayerName, suggestPayouts } from '../store';
import { back, go } from '../router';
import { Avatar, Empty, Help, Icon, Sheet, num, toast } from '../components/ui';
import { gameResults, payoutDiscrepancy, playerStatus, round2, tournamentPlace, totalPotMoney } from '../lib/calc';
import { duration, money, shortDate, units, tone } from '../lib/format';
import { uid } from '../lib/ids';
import type { Expense, Game, ID } from '../types';

export default function CloseTable({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [expOpen, setExpOpen] = useState(false);
  const [editExp, setEditExp] = useState<Expense | 'new' | null>(null);

  if (!g) return <div className="screen plain"><Empty icon="games">This game doesn't exist any more.</Empty></div>;
  const closed = g.status === 'closed';
  const results = gameResults(g);
  const paid = g.transfers.filter((t) => t.resolved);
  const open = g.transfers.filter((t) => !t.resolved);
  const paidSum = paid.reduce((a, t) => a + t.amount, 0);
  const openSum = open.reduce((a, t) => a + t.amount, 0);
  const expTotal = g.expenses.reduce((a, e) => a + e.amount, 0);
  const payers = [...new Set(g.transfers.map((t) => t.from))];

  const mutateExpenses = (fn: (x: Game) => void) => {
    st.updateGame(g.id, fn);
    if (closed) st.refreshTransfers(g.id);
  };

  return (
    <div className="screen">
      <div className="topbar left">
        <button className="icon-btn" onClick={() => back(closed ? 'games' : `game/${g.id}`)} aria-label="Back"><Icon name="back" /></button>
        <div className="titles">
          <h1>{closed ? 'Settle up' : g.type === 'cash' ? 'Finish game' : 'Finish tournament'}</h1>
          <div className="sub">{g.name} · {shortDate(g.startedAt)}{g.endedAt ? ` · ${duration(g.endedAt - g.startedAt)}` : ''}</div>
        </div>
        <button className="icon-btn" onClick={() => go(`game/${g.id}`)} aria-label="Open game"><Icon name="cards" /></button>
      </div>

      {!closed && g.type === 'cash' && (
        <div className="card">
          <div style={{ fontWeight: 700 }}>Count chips first</div>
          <div className="small muted" style={{ marginTop: 4 }}>Enter each player's final count, then settle up here.</div>
          <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => go(`game/${g.id}/count`, true)}>Count chips</button>
        </div>
      )}

      {g.type === 'tournament' && <TournamentFinish g={g} />}

      {closed && (
        <>
          <div className="card" style={{ marginTop: g.type === 'tournament' ? 14 : 0 }}>
            <div className="row between">
              <div><div className="label">Paid</div><div className="big-num up" style={{ marginTop: 4 }}>{money(paidSum, g.currency)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="label">Still owed</div><div className={`big-num ${openSum > 0 ? 'amber' : ''}`} style={{ marginTop: 4 }}>{money(openSum, g.currency)}</div></div>
            </div>
            <div className="track" style={{ marginTop: 12 }}><span style={{ width: `${g.transfers.length ? (paid.length / g.transfers.length) * 100 : 100}%` }} /></div>
            <button className="btn primary amber block lg" style={{ marginTop: 16 }} onClick={() => go(`game/${g.id}/report`)}><Icon name="share" /> Share report</button>
          </div>

          <div className="section">
            <div className="section-head"><h2>Results</h2><span className="small muted num">{money(totalPotMoney(g), g.currency)}</span></div>
            <div className="card list">
              {results.map((r, i) => (
                <div key={r.playerId} className="list-row">
                  <span className="num faint" style={{ width: 16 }}>{i + 1}</span>
                  <Avatar name={name(r.playerId)} size="sm" />
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{name(r.playerId)}{r.place ? <span className="tag up" style={{ marginLeft: 6 }}>{r.place === 1 ? 'Winner' : `Place ${r.place}`}</span> : null}</div>
                    <div className="tiny faint">
                      {g.type === 'cash' ? `${units(r.inUnits)} in, ${units(r.outUnits)} out · ${r.buyIns} buy-in${r.buyIns === 1 ? '' : 's'}` : `${r.buyIns} entr${r.buyIns === 1 ? 'y' : 'ies'} · won ${money(r.out, g.currency)}`}
                      {r.expenses !== 0 && ` · expenses ${money(r.expenses, g.currency, { sign: true })}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`num ${tone(r.net)}`}>{money(r.net, g.currency, { sign: true })}</div>
                    {g.type === 'cash' && <div className="tiny faint num">{units(r.outUnits - r.inUnits, { sign: true })}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="section">
        <div className="card" style={{ padding: '4px 14px' }}>
          <div className="row" style={{ minHeight: 48 }}>
            <button className="row grow" style={{ textAlign: 'left', minHeight: 44 }} onClick={() => setExpOpen(!expOpen)} aria-expanded={expOpen}>
              <span style={{ transform: expOpen ? 'none' : 'rotate(-90deg)', transition: 'transform var(--dur-press)', display: 'inline-flex' }}><Icon name="chevron" size={16} /></span>
              <span style={{ fontWeight: 700 }}>Expenses</span>
              <span className="num muted small">{money(expTotal, g.currency)}</span>
            </button>
            <Help k="expenses" />
          </div>
          {expOpen && (
            <div style={{ paddingBottom: 8 }}>
              {g.expenses.map((e) => (
                <button key={e.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditExp(e)}>
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{e.label}</div>
                    <div className="tiny faint">{e.paidBy ? `${name(e.paidBy)} paid` : 'Nobody paid yet'} · split {e.splitAmong.length} ways</div>
                  </div>
                  <span className="num">{money(e.amount, g.currency)}</span>
                </button>
              ))}
              <button className="btn sm" onClick={() => setEditExp('new')}><Icon name="plus" /> Add an expense</button>
            </div>
          )}
        </div>
      </div>

      {closed && (
        <div className="section">
          <div className="section-head">
            <h2>Payments <Help k="payments" /></h2>
            <span className="small muted">{open.length ? `${open.length} to go` : 'All paid'}</span>
          </div>
          {g.transfers.length === 0 && <div className="card center muted small">Nobody owes anything.</div>}
          {open.length > 1 && (
            <button className="btn block" style={{ marginBottom: 12 }} onClick={() => open.forEach((t) => st.setTransferResolved(g.id, t.id, true))}>
              <Icon name="check" /> Mark all paid
            </button>
          )}
          {payers.map((p) => {
            const ts = g.transfers.filter((t) => t.from === p);
            return (
              <div key={p} className="card" style={{ marginTop: 10, padding: '10px 14px 4px' }}>
                <div className="row">
                  <Avatar name={name(p)} size="sm" />
                  <span className="grow" style={{ fontWeight: 700 }}>{name(p)}</span>
                  {ts.every((t) => t.resolved) && <span className="tag up">Paid</span>}
                </div>
                {ts.map((t) => (
                  <div key={t.id} className="list-row" style={{ paddingLeft: 42 }}>
                    <span className="grow">Pays <b>{name(t.to)}</b></span>
                    <span className="num" style={{ fontSize: 17 }}>{money(t.amount, g.currency)}</span>
                    {t.resolved ? (
                      <button className="btn xs" onClick={() => st.setTransferResolved(g.id, t.id, false)} aria-label={`Undo ${name(p)} paid ${name(t.to)}`}><span className="up" style={{ display: 'inline-flex' }}><Icon name="check" size={14} /></span> Undo</button>
                    ) : (
                      <button className="btn xs" onClick={() => st.setTransferResolved(g.id, t.id, true)}>Mark paid</button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          <button className="btn ghost block" style={{ marginTop: 20 }} onClick={() => { st.reopenGame(g.id); go(`game/${g.id}`, true); toast('Game reopened'); }}>
            <Icon name="undo" /> Reopen the game
          </button>
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
  return (
    <Sheet open onClose={onClose} title={expense ? 'Edit expense' : 'Add an expense'}>
      <div className="grid2">
        <label className="field"><span className="label">For</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="field" style={{ marginTop: 0 }}><span className="label">Amount</span>
          <div className="input-wrap"><span className="prefix">{g.currency}</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </label>
      </div>
      <div className="label" style={{ margin: '16px 0 8px' }}>Who paid</div>
      <div className="chips">
        {g.playerIds.map((p) => <button key={p} className="chip sm" aria-pressed={paidBy === p} onClick={() => setPaidBy(paidBy === p ? undefined : p)}>{name(p)}</button>)}
      </div>
      <div className="row between" style={{ margin: '16px 0 8px' }}>
        <span className="label">Split between {split.length}</span>
        <button className="btn xs" onClick={() => setSplit(split.length === g.playerIds.length ? [] : [...g.playerIds])}>{split.length === g.playerIds.length ? 'Clear' : 'Everyone'}</button>
      </div>
      <div className="chips">
        {g.playerIds.map((p) => <button key={p} className="chip sm" aria-pressed={split.includes(p)} onClick={() => setSplit(split.includes(p) ? split.filter((x) => x !== p) : [...split, p])}>{name(p)}</button>)}
      </div>
      {a !== null && split.length > 0 && <div className="small muted" style={{ marginTop: 12 }}><span className="num">{money(round2(a / split.length), g.currency)}</span> each</div>}
      <button className="btn primary block lg" style={{ marginTop: 18 }} disabled={a === null || a <= 0 || !split.length}
        onClick={() => { onSave({ id: expense?.id ?? uid(), label: label.trim() || 'Expense', amount: a!, paidBy, splitAmong: split }); onClose(); }}>Save expense</button>
      {expense && (
        <button className="btn danger block" style={{ marginTop: 12 }} onClick={() => { if (!confirm) { setConfirm(true); return; } onDelete(expense.id); onClose(); }}>
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
  const places = g.playerIds
    .map((p) => ({ p, place: tournamentPlace(g, p) }))
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  const alive = g.playerIds.filter((p) => !t.bustOrder.includes(p));
  const disc = payoutDiscrepancy(g);
  const paidPlaces = Math.min(t.payouts.length, g.playerIds.length);

  const setPayout = (i: number, v: string) => {
    st.updateGame(g.id, (x) => {
      const arr = [...x.tournament!.payouts];
      arr[i] = num(v) ?? 0;
      x.tournament!.payouts = arr;
      x.tournament!.customPayouts = true;
    });
    if (closed) st.refreshTransfers(g.id);
  };
  const setPaidPlaces = (n: number) => {
    st.updateGame(g.id, (x) => {
      const arr = [...x.tournament!.payouts];
      while (arr.length < n) arr.push(0);
      arr.length = n;
      x.tournament!.payouts = arr;
      x.tournament!.customPayouts = true;
    });
    if (closed) st.refreshTransfers(g.id);
  };

  return (
    <div className="panel">
      <div className="row between">
        <span className="label">Prize pool</span>
        <span className="big-num">{money(totalPotMoney(g), g.currency)}</span>
      </div>
      {!closed && alive.length > 1 && (
        <div className="small amber" style={{ marginTop: 8 }}>{alive.length} players are still in. If you finish now, they take the top places in seat order.</div>
      )}
      <div className="row" style={{ gap: 4, marginTop: 16, marginBottom: 4 }}><span className="label">Payouts</span><Help k="payouts" /></div>
      {Array.from({ length: paidPlaces }).map((_, i) => {
        const who = places.find((x) => x.place === i + 1)?.p;
        return (
          <div key={i} className="list-row" style={{ padding: '8px 0' }}>
            <span className="num faint" style={{ width: 22 }}>{i + 1}</span>
            <span className="grow" style={{ fontWeight: 700 }}>{who ? name(who) : <span className="faint">—</span>}</span>
            <div className="input-wrap" style={{ width: 132 }}>
              <span className="prefix">{g.currency}</span>
              <input key={`${i}-${t.payouts[i]}`} className="input num" style={{ minHeight: 42, fontSize: 15 }} inputMode="decimal" defaultValue={t.payouts[i] ?? 0} onBlur={(e) => setPayout(i, e.target.value)} />
            </div>
          </div>
        );
      })}
      <div className="row between" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn xs" disabled={paidPlaces <= 1} onClick={() => setPaidPlaces(paidPlaces - 1)} aria-label="Pay one place fewer">−</button>
          <span className="small num">{paidPlaces} paid</span>
          <button className="btn xs" disabled={paidPlaces >= g.playerIds.length} onClick={() => setPaidPlaces(paidPlaces + 1)} aria-label="Pay one more place">+</button>
          <button className="btn xs" onClick={() => { st.updateGame(g.id, (x) => { x.tournament!.payouts = suggestPayouts(x); x.tournament!.customPayouts = false; }); if (closed) st.refreshTransfers(g.id); }}>Reset</button>
        </div>
        <span className={`small ${disc === 0 ? 'up' : 'amber'}`}>{disc === 0 ? 'Matches the pool' : `${money(disc, g.currency, { sign: true })} against the pool`}</span>
      </div>
      {!closed && (
        <button className="btn primary block lg" style={{ marginTop: 16 }} onClick={() => {
          st.updateGame(g.id, (x) => {
            const rest = x.playerIds.filter((p) => !x.tournament!.bustOrder.includes(p))
              .sort((a, b) => (x.seats[b] ?? 0) - (x.seats[a] ?? 0));
            // remaining players are busted in reverse seat order, so the lowest seat finishes highest
            rest.slice(0, -1).forEach((p) => { x.tournament!.bustOrder.push(p); });
            for (const p of x.playerIds) if (playerStatus(x, p) !== 'out') x.statusEvents.push({ playerId: p, status: 'out', at: Date.now() });
          });
          st.finishGame(g.id);
        }}>Finish and settle up</button>
      )}
    </div>
  );
}
