import { useState } from 'react';
import { useStore } from '../store';
import { back, go } from '../router';
import { Caption, Header, Help, Toggle, num, toast } from '../components/ui';
import { NameEntry, PlayerChip } from '../components/players';
import { RulesFields } from '../components/rules';
import { rulesForNew } from '../lib/rules';
import { money } from '../lib/format';
import type { GameType, ID } from '../types';

export default function NewGame({ type }: { type: GameType }) {
  const s = useStore((x) => x.settings);
  const players = useStore((x) => x.players).filter((p) => !p.archived);
  const createGame = useStore((x) => x.createGame);
  const groups = useStore((x) => x.groups);
  const games = useStore((x) => x.games);
  // house rules start from the last game of this type (2-7 bounty: on for cash, off for tournaments)
  const [rules, setRules] = useState(() => rulesForNew(games, type, s));
  const [groupId, setGroupId] = useState<ID | undefined>(undefined);

  const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  const [name, setName] = useState(type === 'cash' ? `${day} cash` : `${day} tournament`);
  const [sel, setSel] = useState<ID[]>([]);
  const [currency, setCurrency] = useState(s.currency);
  const [unitValue, setUnitValue] = useState(String(s.unitValue));
  const [sb, setSb] = useState(String(s.sb));
  const [bb, setBb] = useState(String(s.bb));
  const [buyIn, setBuyIn] = useState(String(s.defaultBuyIn));
  const [autoBuyIn, setAutoBuyIn] = useState(true);
  const [tBuyIn, setTBuyIn] = useState(String(s.tournamentBuyIn));
  const [stack, setStack] = useState(String(s.startingStack));

  const toggle = (id: ID) => setSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const uv = num(unitValue) ?? 0, bi = num(buyIn) ?? 0, bbN = num(bb) ?? 0;
  const valid = type === 'cash' ? uv > 0 && bi >= 0 && bbN > 0 && (num(sb) ?? 0) > 0 : (num(tBuyIn) ?? -1) >= 0;

  // a game needs at least 2 players (heads-up)
  const enough = sel.length >= 2;
  const start = () => {
    if (!enough) { toast(`Pick at least 2 players (${sel.length} picked).`); return; }
    if (!valid) { toast('Use numbers only (e.g. 200).'); return; }
    const g = createGame({
      type, name, playerIds: sel, currency: currency.trim() || 'S$',
      unitValue: uv, sb: num(sb) ?? 1, bb: bbN, defaultBuyIn: bi,
      tournamentBuyIn: num(tBuyIn) ?? 0, startingStack: num(stack) ?? 0, autoBuyIn, groupId, rules,
    });
    go(`game/${g.id}`, true);
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, opts: { decimal?: boolean; hint?: string } = {}) => (
    <div className="sat-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="sat-input sat-num" inputMode={opts.decimal ? 'decimal' : 'numeric'} value={value} onChange={(e) => set(e.target.value)} />
      {opts.hint && <span className="sat-hint">{opts.hint}</span>}
    </div>
  );

  return (
    <div className="felt-page">
      <Header back={() => back()} title={type === 'cash' ? 'New Cash Game' : 'New Tournament'} sub="Texas Hold'em" />
      <div className="sat-stack">
        <div className="sat-field">
          <label htmlFor="g-name">Game name</label>
          <input id="g-name" className="sat-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)', marginBottom: 'var(--sat-space-2)' }}>
          <div className="sat-split">
            <h2 className="sat-h2">Players <Help k="pickPlayers" /></h2>
            <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
              <Caption>{sel.length} picked</Caption>
              {players.length > 0 && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setSel(sel.length === players.length ? [] : players.map((p) => p.id))}>{sel.length === players.length ? 'Clear' : 'Pick all'}</button>}
            </div>
          </div>
          {groups.length > 0 && (
            <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
              <Caption tip="groups">Group</Caption>
              <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
                <button className="sat-chip" aria-pressed={!groupId} onClick={() => setGroupId(undefined)}>None</button>
                {groups.map((grp) => (
                  <button key={grp.id} className="sat-chip" aria-pressed={groupId === grp.id} onClick={() => { setGroupId(grp.id); setSel(grp.playerIds.filter((p) => players.some((x) => x.id === p))); }}>{grp.name}</button>
                ))}
              </div>
            </div>
          )}
          <NameEntry onPick={(p) => setSel((v) => (v.includes(p.id) ? v : [...v, p.id]))} />
          <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            {players.map((p) => <PlayerChip key={p.id} player={p} pressed={sel.includes(p.id)} onTap={() => toggle(p.id)} />)}
          </div>
        </section>

        {type === 'cash' ? (
          <section className="sat-glass sat-card sat-stack">
            <div className="sat-split"><h2 className="sat-h3">Blinds and buy-in</h2><Help k="units" /></div>
            <div className="sat-grid" style={{ ['--sat-min' as string]: '90px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
              {field('g-sb', 'SB (chips)', sb, setSb, { decimal: true })}
              {field('g-bb', 'BB (chips)', bb, setBb, { decimal: true })}
            </div>
            <div className="sat-grid" style={{ ['--sat-min' as string]: '120px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
              <div className="sat-field">
                <label htmlFor="g-cur">Currency <Help k="currency" /></label>
                <input id="g-cur" className="sat-input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div className="sat-field">
                <label htmlFor="g-uv">Multiplier <Help k="unitValue" /></label>
                <div style={{ position: 'relative' }}>
                  <span className="sat-muted" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>{currency || 'S$'}</span>
                  <input id="g-uv" className="sat-input sat-num" style={{ paddingLeft: `${Math.max(2, (currency || 'S$').length) * 10 + 18}px` }} inputMode="decimal" value={unitValue} onChange={(e) => setUnitValue(e.target.value)} />
                </div>
              </div>
            </div>
            {field('g-bi', 'Buy-in (chips)', buyIn, setBuyIn, { hint: `${bbN ? `${(bi / bbN).toFixed(0)} BB` : '-'} = ${money(bi * uv, currency)}` })}
            <div className="sat-switch-row">
              <span>Buy everyone in now <Help k="autoBuyIn" /></span>
              <Toggle on={autoBuyIn} onChange={setAutoBuyIn} label="Buy everyone in now" />
            </div>
          </section>
        ) : (
          <section className="sat-glass sat-card sat-stack">
            <div className="sat-split"><h2 className="sat-h3">Entry and blinds</h2><Help k="payouts" /></div>
            <div className="sat-grid" style={{ ['--sat-min' as string]: '120px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
              {field('t-fee', `Entry fee (${currency})`, tBuyIn, setTBuyIn, { decimal: true })}
              {field('t-stack', 'Starting stack (chips)', stack, setStack)}
              {field('t-sb', 'SB (chips)', sb, setSb, { decimal: true })}
              {field('t-bb', 'BB (chips)', bb, setBb, { decimal: true })}
            </div>
          </section>
        )}

        <section className="sat-glass sat-card sat-stack">
          <div className="sat-split"><h2 className="sat-h3">House rules</h2><Help k="rules" /></div>
          <RulesFields rules={rules} onChange={setRules} players={Math.max(sel.length, 2)} idPrefix="g" />
        </section>

      </div>

      <div className="sat-bottombar sat-glass-2">
        <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={start} aria-disabled={!valid || !enough}>
          {enough ? `Start ${type === 'cash' ? 'game' : 'tournament'} with ${sel.length} players` : `Pick ${2 - sel.length} more player${sel.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
