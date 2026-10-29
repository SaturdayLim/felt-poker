import { Caption, Help, Toggle, num, toast } from './ui';
import type { BountyRule, GameRules } from '../types';

const MIN_RAISE: { k: GameRules['minRaise']; label: string; hint: string }[] = [
  { k: 'last', label: 'Last raise', hint: 'Raise by at least the last raise: 2, 4, 6, 8. The usual rule.' },
  { k: 'sb', label: 'SB steps', hint: 'Raise by at least the SB: 2, 3, 4, 5.' },
  { k: 'double', label: 'Double', hint: 'Raise to at least double the bet: 2, 4, 8, 16.' },
];
const BOUNTY_WIN: { k: BountyRule['win']; label: string; hint: string }[] = [
  { k: 'shown', label: 'Revealed', hint: 'Revealed cards: shows 2-7 at showdown, win or lose.' },
  { k: 'won', label: 'Winning', hint: 'Winning hand: takes chips from a pot with 2-7. A chopped pot counts.' },
  { k: 'sole', label: 'Best hand', hint: 'Best hand: the best hand on the table, or the last hand standing. Side pots are fine, a chopped pot is not.' },
];
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

/** House rules of one game: minimum raise and the 2-7 bounty. Used when creating a game and in its settings. */
export function RulesFields({ rules, onChange, players, idPrefix }: {
  rules: GameRules; onChange: (r: GameRules) => void; players: number; idPrefix: string;
}) {
  const bounty = rules.bounty27;
  const setBounty = (patch: Partial<BountyRule>) => onChange({ ...rules, bounty27: { ...bounty, ...patch } });
  const others = Math.max(1, players - 1);
  return (
    <div className="sat-stack" style={gap(4)}>
      <div className="sat-stack" style={gap(2)}>
        <Caption tip="minRaise">Minimum raise</Caption>
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Minimum raise">
          {MIN_RAISE.map((o) => <button key={o.k} type="button" role="radio" aria-checked={rules.minRaise === o.k} onClick={() => onChange({ ...rules, minRaise: o.k })}>{o.label}</button>)}
        </div>
        <p className="sat-small sat-muted">{MIN_RAISE.find((o) => o.k === rules.minRaise)?.hint}</p>
      </div>
      <div className="sat-switch-row">
        <span><span style={{ display: 'block' }}>2-7 bounty <Help k="bounty27" /></span><span className="sat-small sat-muted">Each other player dealt in pays a bounty to the 2-7.</span></span>
        <Toggle on={bounty.on} onChange={(v) => setBounty({ on: v })} label="2-7 bounty" />
      </div>
      {bounty.on && (
        <div className="sat-stack felt-bounty-set" style={gap(3)}>
          <div className="sat-stack" style={gap(2)}>
            <Caption>Win condition</Caption>
            <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="2-7 win condition">
              {BOUNTY_WIN.map((o) => <button key={o.k} type="button" role="radio" aria-checked={bounty.win === o.k} onClick={() => setBounty({ win: o.k })}>{o.label}</button>)}
            </div>
            <p className="sat-small sat-muted">{BOUNTY_WIN.find((o) => o.k === bounty.win)?.hint}</p>
          </div>
          <div className="sat-stack" style={gap(2)}>
            <Caption>Hand</Caption>
            <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="2-7 hand">
              <button type="button" role="radio" aria-checked={!bounty.suited} onClick={() => setBounty({ suited: false })}>Offsuit only</button>
              <button type="button" role="radio" aria-checked={bounty.suited} onClick={() => setBounty({ suited: true })}>Suited allowed</button>
            </div>
          </div>
          <div className="sat-field">
            <label htmlFor={`${idPrefix}-bounty`}>Bounty (chips)</label>
            <input id={`${idPrefix}-bounty`} className="sat-input sat-num" inputMode="decimal" defaultValue={String(bounty.amount)}
              onBlur={(e) => { const v = num(e.target.value); if (v !== null && v > 0) setBounty({ amount: v }); else { e.target.value = String(bounty.amount); toast('Use a number above 0 (e.g. 10).'); } }} />
            <span className="sat-hint">From each other player dealt in. With {others + 1} players, the 2-7 collects {bounty.amount * others} chips.</span>
          </div>
        </div>
      )}
    </div>
  );
}
