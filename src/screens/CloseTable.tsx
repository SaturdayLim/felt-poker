import { useState } from 'react';
import { useGame, useStore, usePlayerName, suggestPayouts } from '../store';
import { back, go } from '../router';
import { Avatar, Empty, Icon, Sheet, num, toast } from '../components/ui';
import { gameResults, payoutDiscrepancy, playerStatus, round2, tournamentPlace, totalPotMoney } from '../lib/calc';
import { duration, money, shortDate, units } from '../lib/format';
import { uid } from '../lib/ids';
import type { Expense, Game, ID } from '../types';

export default function CloseTable({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const st = useStore();
  const [expOpen, setExpOpen] = useState(false);
  const [editExp, setEditExp] = useState<Expense | 'new' | null>(null);
  const [collapsed, setCollapsed] = useState<Record<ID, boolean>>({});

  if (!g) return <div className="screen"><Empty icon="games">Game not found.</Empty></div>;
  const closed = g.status === 'closed';
  const results = gameResults(g);
  const resolved = g.transfers.filter((t) => t.resolved);
  const open = g.transfers.filter((t) => !t.resolved);
  const resolvedSum = resolved.reduce((a, t) => a + t.amount, 0);
  const openSum = open.reduce((a, t) => a + t.amount, 0);
  const expTotal = g.expenses.reduce((a, e) => a + e.amount, 0);
  const payers = [...new Set(g.transfers.map((t) => t.from))];

  const mutateExpenses = (fn: (x: Game) => void) => {
    st.updateGame(g.id, fn);
    if (closed) st.refreshTransfers(g.id);
  };

  return (
    <div className="screen no-nav">
      <div className="topbar left">
        <button className="icon-btn" onClick={() => back(closed ? 'games' : `game/${g.id}`)} aria-label="Back"><Icon name="back" /></button>
        <div className="titles">
          <h1>{closed ? 'Close the table' : g.type === 'cash' ? 'Finish game' : 'Finish tournament'}</h1>
          <div className="sub">{g.name} · {shortDate(g.startedAt)}{g.endedAt ? ` · ${duration(g.endedAt - g.startedAt)}` : ''}</div>
        </div>
        <button className="icon-btn" onClick={() => go(`game/${g.id}`)} aria-label="Open game"><Icon name="cards" /></button>
      </div>

      {!closed && g.type === 'cash' && (
        <div className="card">
          <div style={{ fontWeight: 650 }}>Count chips first</div>
          <div className="small muted" style={{ marginTop: 4 }}>Enter every player's final chip count, then settle up.</div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => go(`game/${g.id}/count`, true)}>Count chips</button>
        </div>
      )}

      {g.type === 'tournament' && <TournamentFinish g={g} />}

      {closed && (
        <>
          <div className="card">
            <div className="row between">
              <div><div className="label">Balances resolved</div><div className="big-num pos" style={{ marginTop: 4 }}>{money(resolvedSum, g.currency)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="label">Still open</div><div className="big-num" style={{ marginTop: 4 }}>{money(openSum, g.currency)}</div></div>
            </div>
            <div className="bar-track" style={{ marginTop: 12 }}><div className="bar-fill" style={{ width: `${g.transfers.length ? (resolved.length / g.transfers.length) * 100 : 100}%` }} /></div>
            <div className="tiny muted" style={{ marginTop: 8 }}>Mark each settle-up when it's squared up to keep your all-time standings accurate.</div>
            <button className="btn gold block lg" style={{ marginTop: 12 }} onClick={() => go(`game/${g.id}/report`)}><Icon name="share" /> Share report</button>
          </div>

          <div className="section">
            <div className="section-head"><h2>Results</h2><span className="small muted">{money(totalPotMoney(g), g.currency)} {g.type === 'cash' ? 'in play' : 'pool'}</span></div>
            <div className="card flat" style={{ padding: '4px 14px' }}>
              {results.map((r, i) => (
                <div key={r.playerId} className="list-row">
                  <span className="mono muted" style={{ width: 16 }}>{i + 1}</span>
                  <Avatar name={name(r.playerId)} size="sm" />
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>{name(r.playerId)}{r.place ? <span className="pill mint" style={{ marginLeft: 6 }}>#{r.place}</span> : null}</div>
                    <div className="tiny muted">
                      {g.type === 'cash' ? `${units(r.inUnits)} in → ${units(r.outUnits)} out · ${r.buyIns} buy-in${r.buyIns === 1 ? '' : 's'}` : `${r.buyIns} entr${r.buyIns === 1 ? 'y' : 'ies'} · paid ${money(r.out, g.currency)}`}
                      {r.expenses !== 0 && ` · exp ${money(r.expenses, g.currency, { sign: true })}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={r.net >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 800 }}>{money(r.net, g.currency, { sign: true })}</div>
                    {g.type === 'cash' && <div className="tiny muted">{units(r.outUnits - r.inUnits, { sign: true })} u</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="section">
        <button className="card flat tap row" style={{ display: 'flex' }} onClick={() => setExpOpen(!expOpen)}>
          <span style={{ transform: expOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s', display: 'inline-flex' }}><Icon name="chevron" size={16} /></span>
          <span className="grow" style={{ fontWeight: 650 }}>Game expenses · {money(expTotal, g.currency)}</span>
          <Icon name="receipt" size={18} />
        </button>
        {expOpen && (
          <div className="card flat" style={{ marginTop: 8, padding: '4px 14px 12px' }}>
            {g.expenses.map((e) => (
              <button key={e.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditExp(e)}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{e.label}</div>
                  <div className="tiny muted">Paid by {e.paidBy ? name(e.paidBy) : 'nobody (pot)'} · split {e.splitAmong.length} ways</div>
                </div>
                <span style={{ fontWeight: 700 }}>{money(e.amount, g.currency)}</span>
              </button>
            ))}
            <button className="btn sm block" style={{ marginTop: 10 }} onClick={() => setEditExp('new')}><Icon name="plus" /> Add expense</button>
          </div>
        )}
      </div>

      {closed && (
        <div className="section">
          <div className="section-head">
            <span className="label">Suggested reconciliation</span>
            <span className="label">{open.length} remaining</span>
          </div>
          {g.transfers.length === 0 && <div className="card flat center muted small">Everyone is square — nothing to settle.</div>}
          {open.length > 0 && (
            <button className="btn block" style={{ marginBottom: 10, color: 'var(--mint)' }} onClick={() => open.forEach((t) => st.setTransferResolved(g.id, t.id, true))}>
              <Icon name="check" /> Resolve all
            </button>
          )}
          {payers.map((p) => {
            const ts = g.transfers.filter((t) => t.from === p);
            const total = ts.reduce((a, t) => a + t.amount, 0);
            const done = ts.every((t) => t.resolved);
            return (
              <div key={p} className="card flat" style={{ marginTop: 8 }}>
                <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCollapsed({ ...collapsed, [p]: !collapsed[p] })}>
                  <Avatar name={name(p)} size="sm" />
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>{name(p)}</div>
                    <div className="tiny muted">{ts.length} settle-up{ts.length === 1 ? '' : 's'} · {money(total, g.currency)} total</div>
                  </div>
                  <span className={`label ${done ? 'pos' : 'gold'}`}>{done ? 'Paid' : 'To pay'}</span>
                </button>
                {!collapsed[p] && ts.map((t) => (
                  <div key={t.id} style={{ padding: '12px 0 0 38px' }}>
                    <div className="row between"><span>Pay <b>{name(t.to)}</b></span><span style={{ fontWeight: 800, fontSize: 17 }}>{money(t.amount, g.currency)}</span></div>
                    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                      {t.resolved ? (
                        <button className="btn xs" onClick={() => st.setTransferResolved(g.id, t.id, false)}><span className="pos"><Icon name="check" size={13} /></span> Resolved · undo</button>
                      ) : (
                        <button className="btn xs" style={{ color: 'var(--mint)', borderColor: 'rgba(94,227,161,.4)', background: 'var(--mint-dark)' }} onClick={() => st.setTransferResolved(g.id, t.id, true)}><Icon name="check" size={13} /> Confirm resolved</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <button className="btn block ghost" style={{ marginTop: 18, color: 'var(--muted)' }} onClick={() => { st.reopenGame(g.id); go(`game/${g.id}`, true); toast('Game reopened'); }}>
            <Icon name="undo" /> Reopen game to make changes
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
  const [label, setLabel] = useState(expense?.label ?? 'Food & drinks');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [paidBy, setPaidBy] = useState<ID | undefined>(expense?.paidBy);
  const [split, setSplit] = useState<ID[]>(expense?.splitAmong ?? [...g.playerIds]);
  const a = num(amount);
  return (
    <Sheet open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'} sub="Shared costs are split and folded into the settle-up.">
      <div className="grid2">
        <label className="field"><span className="label">What</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="field" style={{ marginTop: 0 }}><span className="label">Amount</span>
          <div className="input-wrap"><span className="prefix">{g.currency}</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </label>
      </div>
      <div className="label" style={{ margin: '14px 0 8px' }}>Paid by</div>
      <div className="chips">
        {g.playerIds.map((p) => <button key={p} className={`chip ${paidBy === p ? 'on' : ''}`} onClick={() => setPaidBy(paidBy === p ? undefined : p)}>{name(p)}</button>)}
      </div>
      <div className="row between" style={{ margin: '14px 0 8px' }}>
        <span className="label">Split among · {split.length}</span>
        <button className="btn xs" onClick={() => setSplit(split.length === g.playerIds.length ? [] : [...g.playerIds])}>{split.length === g.playerIds.length ? 'None' : 'All'}</button>
      </div>
      <div className="chips">
        {g.playerIds.map((p) => <button key={p} className={`chip ${split.includes(p) ? 'on' : ''}`} onClick={() => setSplit(split.includes(p) ? split.filter((x) => x !== p) : [...split, p])}>{name(p)}</button>)}
      </div>
      {a !== null && split.length > 0 && <div className="small muted" style={{ marginTop: 10 }}>{money(round2(a / split.length), g.currency)} each</div>}
      <button className="btn primary block lg" style={{ marginTop: 16 }} disabled={a === null || a <= 0 || !split.length}
        onClick={() => { onSave({ id: expense?.id ?? uid(), label: label.trim() || 'Expense', amount: a!, paidBy, splitAmong: split }); onClose(); }}>Save expense</button>
      {expense && <button className="btn danger block" style={{ marginTop: 10 }} onClick={() => { onDelete(expense.id); onClose(); }}><Icon name="trash" /> Remove</button>}
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
  const paid = Math.min(t.payouts.length, g.playerIds.length);

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
    <div className="card">
      <div className="row between">
        <span className="label">Prize pool</span>
        <span className="big-num">{money(totalPotMoney(g), g.currency)}</span>
      </div>
      {!closed && alive.length > 1 && (
        <div className="small gold" style={{ marginTop: 8 }}>{alive.length} players still alive — bust players out on the game screen, or finish now and the remaining players share the top places in seat order.</div>
      )}
      <div className="label" style={{ marginTop: 14, marginBottom: 4 }}>Payouts</div>
      {Array.from({ length: paid }).map((_, i) => {
        const who = places.find((x) => x.place === i + 1)?.p;
        return (
          <div key={i} className="list-row" style={{ padding: '8px 0' }}>
            <span className="pill mint">#{i + 1}</span>
            <span className="grow" style={{ fontWeight: 600 }}>{who ? name(who) : <span className="muted">—</span>}</span>
            <div className="input-wrap" style={{ width: 130 }}>
              <span className="prefix">{g.currency}</span>
              <input key={`${i}-${t.payouts[i]}`} className="input" style={{ height: 40, fontSize: 15 }} inputMode="decimal" defaultValue={t.payouts[i] ?? 0} onBlur={(e) => setPayout(i, e.target.value)} />
            </div>
          </div>
        );
      })}
      <div className="row between" style={{ marginTop: 10 }}>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn xs" disabled={paid <= 1} onClick={() => setPaidPlaces(paid - 1)}>−</button>
          <span className="small">{paid} paid</span>
          <button className="btn xs" disabled={paid >= g.playerIds.length} onClick={() => setPaidPlaces(paid + 1)}>+</button>
          <button className="btn xs" onClick={() => { st.updateGame(g.id, (x) => { x.tournament!.payouts = suggestPayouts(x); x.tournament!.customPayouts = false; }); if (closed) st.refreshTransfers(g.id); }}>Auto</button>
        </div>
        <span className={`small ${disc === 0 ? 'pos' : 'gold'}`}>{disc === 0 ? 'Balanced' : `${money(disc, g.currency, { sign: true })} vs pool`}</span>
      </div>
      {!closed && (
        <button className="btn primary block lg" style={{ marginTop: 14 }} onClick={() => {
          st.updateGame(g.id, (x) => {
            const rest = x.playerIds.filter((p) => !x.tournament!.bustOrder.includes(p))
              .sort((a, b) => (x.seats[b] ?? 0) - (x.seats[a] ?? 0));
            // remaining players are busted in reverse seat order, so the lowest seat finishes highest
            rest.slice(0, -1).forEach((p) => {
              x.tournament!.bustOrder.push(p);
            });
            for (const p of x.playerIds) if (playerStatus(x, p) !== 'out') x.statusEvents.push({ playerId: p, status: 'out', at: Date.now() });
          });
          st.finishGame(g.id);
        }}>Finish &amp; settle</button>
      )}
    </div>
  );
}
