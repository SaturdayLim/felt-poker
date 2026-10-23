import { useState } from 'react';
import { useStore } from '../store';
import { back, go } from '../router';
import { Icon, Toggle, num, toast } from '../components/ui';
import { money } from '../lib/format';
import type { GameType, ID } from '../types';

export default function NewGame({ type }: { type: GameType }) {
  const s = useStore((x) => x.settings);
  const players = useStore((x) => x.players).filter((p) => !p.archived);
  const addPlayer = useStore((x) => x.addPlayer);
  const createGame = useStore((x) => x.createGame);

  const day = new Date().toLocaleDateString('en-SG', { weekday: 'long' });
  const [name, setName] = useState(type === 'cash' ? `${day} Night Cash` : `${day} Tournament`);
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
    if (!valid) { toast('Check the stakes'); return; }
    const g = createGame({
      type, name, playerIds: sel, currency: currency.trim() || 'S$',
      unitValue: uv, sb: num(sb) ?? 1, bb: bbN, defaultBuyIn: bi,
      tournamentBuyIn: num(tBuyIn) ?? 0, startingStack: num(stack) ?? 0, autoBuyIn,
    });
    go(`game/${g.id}`, true);
  };

  return (
    <div className="screen no-nav">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back()} aria-label="Back"><Icon name="back" /></button>
        <div className="titles"><h1>{type === 'cash' ? 'New cash game' : 'New tournament'}</h1><div className="sub">Texas Hold'em</div></div>
        <span style={{ width: 40 }} />
      </div>

      <div className="eyebrow" style={{ marginTop: 8 }}>01 / Set the table</div>
      <label className="field" style={{ marginTop: 12 }}>
        <span className="label">Game name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {type === 'cash' ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="label" style={{ marginBottom: 10 }}>Stakes (units: 1 = SB)</div>
          <div className="grid3">
            <label className="field"><span className="tiny muted">Small blind</span><input className="input" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></label>
            <label className="field" style={{ marginTop: 0 }}><span className="tiny muted">Big blind</span><input className="input" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></label>
            <label className="field" style={{ marginTop: 0 }}><span className="tiny muted">Currency</span><input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field"><span className="tiny muted">1 unit is worth</span>
              <div className="input-wrap"><span className="prefix">{currency}</span><input className="input" inputMode="decimal" value={unitValue} onChange={(e) => setUnitValue(e.target.value)} /></div>
            </label>
            <label className="field" style={{ marginTop: 0 }}><span className="tiny muted">Default buy-in (units)</span>
              <input className="input" inputMode="numeric" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} />
            </label>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            Buy-in = {bbN ? `${(bi / bbN).toFixed(0)} BB` : '—'} = <b className="pos">{money(bi * uv, currency)}</b> · blinds {money((num(sb) ?? 0) * uv, currency)}/{money(bbN * uv, currency)}
          </div>
          <div className="row between" style={{ marginTop: 14 }}>
            <div><div style={{ fontWeight: 600 }}>Buy everyone in at start</div><div className="tiny muted">Adds one default buy-in per selected player</div></div>
            <Toggle on={autoBuyIn} onChange={setAutoBuyIn} label="Auto buy-in" />
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="grid2">
            <label className="field"><span className="tiny muted">Entry fee</span>
              <div className="input-wrap"><span className="prefix">{currency}</span><input className="input" inputMode="decimal" value={tBuyIn} onChange={(e) => setTBuyIn(e.target.value)} /></div>
            </label>
            <label className="field" style={{ marginTop: 0 }}><span className="tiny muted">Starting stack</span>
              <input className="input" inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} />
            </label>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field"><span className="tiny muted">Small blind</span><input className="input" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></label>
            <label className="field" style={{ marginTop: 0 }}><span className="tiny muted">Big blind</span><input className="input" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></label>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>Payouts are suggested from the field size; you can edit them before closing.</div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Players<span className="count">{sel.length} selected</span></h2>
          {players.length > 0 && <button className="btn xs" onClick={() => setSel(sel.length === players.length ? [] : players.map((p) => p.id))}>{sel.length === players.length ? 'None' : 'All'}</button>}
        </div>
        <div className="row">
          <input className="input grow" placeholder="Add new player" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quickAdd()} enterKeyHint="done" />
          <button className="btn" style={{ height: 48 }} onClick={quickAdd} disabled={!newName.trim()}><Icon name="plus" /></button>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {players.map((p) => (
            <button key={p.id} className={`chip ${sel.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
              {sel.includes(p.id) && <Icon name="check" size={14} />}{p.name}
            </button>
          ))}
        </div>
        {players.length === 0 && <div className="small muted" style={{ marginTop: 8 }}>Add your regulars here — they're saved for future games.</div>}
      </div>

      <div className="fab-bar"><div className="inner">
        <button className="btn primary lg" onClick={start} disabled={!valid}>
          <Icon name="play" /> Start {type === 'cash' ? 'game' : 'tournament'}{sel.length ? ` · ${sel.length} players` : ''}
        </button>
      </div></div>
    </div>
  );
}
