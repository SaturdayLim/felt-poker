import { useState } from 'react';
import { useStore } from '../store';
import { back, go } from '../router';
import { Help, Icon, Toggle, num, toast } from '../components/ui';
import { money } from '../lib/format';
import type { GameType, ID } from '../types';

export default function NewGame({ type }: { type: GameType }) {
  const s = useStore((x) => x.settings);
  const players = useStore((x) => x.players).filter((p) => !p.archived);
  const addPlayer = useStore((x) => x.addPlayer);
  const createGame = useStore((x) => x.createGame);

  const day = new Date().toLocaleDateString('en-SG', { weekday: 'long' });
  const [name, setName] = useState(type === 'cash' ? `${day} cash` : `${day} tournament`);
  const [sel, setSel] = useState<ID[]>([]);
  const [newName, setNewName] = useState('');
  const [currency, setCurrency] = useState(s.currency);
  const [unitValue, setUnitValue] = useState(String(s.unitValue));
  const [sb, setSb] = useState(String(s.sb));
  const [bb, setBb] = useState(String(s.bb));
  const [buyIn, setBuyIn] = useState(String(s.defaultBuyIn));
  const [autoBuyIn, setAutoBuyIn] = useState(true);
  const [tBuyIn, setTBuyIn] = useState(String(s.tournamentBuyIn));
  const [stack, setStack] = useState(String(s.startingStack));

  const toggle = (id: ID) => setSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const quickAdd = () => {
    const n = newName.trim();
    if (!n) return;
    const existing = players.find((p) => p.name.toLowerCase() === n.toLowerCase());
    const p = existing ?? addPlayer(n);
    setSel((v) => (v.includes(p.id) ? v : [...v, p.id]));
    setNewName('');
  };

  const uv = num(unitValue) ?? 0, bi = num(buyIn) ?? 0, bbN = num(bb) ?? 0;
  const valid = type === 'cash' ? uv > 0 && bi >= 0 && bbN > 0 && (num(sb) ?? 0) > 0 : (num(tBuyIn) ?? -1) >= 0;

  const start = () => {
    if (!valid) { toast('Check the blinds and buy-in'); return; }
    const g = createGame({
      type, name, playerIds: sel, currency: currency.trim() || 'S$',
      unitValue: uv, sb: num(sb) ?? 1, bb: bbN, defaultBuyIn: bi,
      tournamentBuyIn: num(tBuyIn) ?? 0, startingStack: num(stack) ?? 0, autoBuyIn,
    });
    go(`game/${g.id}`, true);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back()} aria-label="Back"><Icon name="back" /></button>
        <div className="titles"><h1>{type === 'cash' ? 'New cash game' : 'New tournament'}</h1></div>
        <span style={{ width: 44 }} />
      </div>

      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {type === 'cash' ? (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="row between" style={{ marginBottom: 12 }}><span className="label">Blinds, in units</span><Help k="units" /></div>
          <div className="grid3">
            <label className="field"><span className="label tiny">Small</span><input className="input" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></label>
            <label className="field" style={{ marginTop: 0 }}><span className="label tiny">Big</span><input className="input" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></label>
            <label className="field" style={{ marginTop: 0 }}><span className="label tiny">Currency</span><input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>
          </div>
          <div className="grid2" style={{ marginTop: 14 }}>
            <label className="field"><span className="label tiny row" style={{ gap: 4 }}>1 unit is worth <Help k="unitValue" /></span>
              <div className="input-wrap"><span className="prefix">{currency}</span><input className="input" inputMode="decimal" value={unitValue} onChange={(e) => setUnitValue(e.target.value)} /></div>
            </label>
            <label className="field" style={{ marginTop: 0 }}><span className="label tiny" style={{ display: 'block', minHeight: 23 }}>Buy-in, units</span>
              <input className="input" inputMode="numeric" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} />
            </label>
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>
            Buy-in is {bbN ? `${(bi / bbN).toFixed(0)} big blinds` : '—'}, or <b className="num">{money(bi * uv, currency)}</b>. Blinds are {money((num(sb) ?? 0) * uv, currency)}/{money(bbN * uv, currency)}.
          </div>
          <div className="row between" style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 4 }}><span style={{ fontWeight: 700 }}>Buy everyone in</span><Help k="autoBuyIn" /></div>
            <Toggle on={autoBuyIn} onChange={setAutoBuyIn} label="Buy everyone in" />
          </div>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="grid2">
            <label className="field"><span className="label tiny">Entry fee</span>
              <div className="input-wrap"><span className="prefix">{currency}</span><input className="input" inputMode="decimal" value={tBuyIn} onChange={(e) => setTBuyIn(e.target.value)} /></div>
            </label>
            <label className="field" style={{ marginTop: 0 }}><span className="label tiny">Starting stack</span>
              <input className="input" inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} />
            </label>
          </div>
          <div className="grid2" style={{ marginTop: 14 }}>
            <label className="field"><span className="label tiny">Small blind</span><input className="input" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></label>
            <label className="field" style={{ marginTop: 0 }}><span className="label tiny">Big blind</span><input className="input" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></label>
          </div>
          <div className="row" style={{ gap: 4, marginTop: 12 }}><span className="small muted">Payouts are set when the tournament ends.</span><Help k="payouts" /></div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Players<span className="count">{sel.length} picked</span></h2>
          {players.length > 0 && <button className="btn xs" onClick={() => setSel(sel.length === players.length ? [] : players.map((p) => p.id))}>{sel.length === players.length ? 'Clear' : 'Everyone'}</button>}
        </div>
        <div className="row">
          <input className="input grow" placeholder="Add a new player" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quickAdd()} enterKeyHint="done" />
          <button className="btn" style={{ minHeight: 48 }} onClick={quickAdd} disabled={!newName.trim()} aria-label="Add player"><Icon name="plus" /></button>
        </div>
        <div className="chips" style={{ marginTop: 14 }}>
          {players.map((p) => (
            <button key={p.id} className="chip" aria-pressed={sel.includes(p.id)} onClick={() => toggle(p.id)}>
              {sel.includes(p.id) && <Icon name="check" size={14} />}{p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="fab-bar"><div className="inner glass">
        <button className="btn primary lg" onClick={start} disabled={!valid}>
          Start {type === 'cash' ? 'game' : 'tournament'}{sel.length ? ` with ${sel.length}` : ''}
        </button>
      </div></div>
    </div>
  );
}
