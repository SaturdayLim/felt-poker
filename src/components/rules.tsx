import { Caption, Disclose, Help, Info, Toggle, num, toast, TabPill } from './ui';
import type { BountyRule, GameRules } from '../types';

const MIN_RAISE: { k: GameRules['minRaise']; label: string }[] = [
  { k: 'last', label: 'Last raise' },
  { k: 'sb', label: 'SB steps' },
  { k: 'double', label: 'Double' },
];
const BOUNTY_WIN: { k: BountyRule['win']; label: string }[] = [
  { k: 'shown', label: 'Revealed' },
  { k: 'won', label: 'Winning' },
  { k: 'sole', label: 'Best hand' },
];
/* Each tip explains only the option that is selected now, in one line (owner, 13 Nov 2026). */
const MIN_RAISE_TIP: Record<GameRules['minRaise'], string> = {
  last: 'Last raise: raise by at least the last raise on this street.',
  sb: 'SB steps: raise by at least 1 SB.',
  double: 'Double: raise to at least double the bet.',
};
const BOUNTY_WIN_TIP: Record<BountyRule['win'], string> = {
  shown: 'Revealed: the player shows 7-2, win or lose.',
  won: 'Winning: the player wins chips from a pot with 7-2.',
  sole: 'Best hand: the 7-2 is the best hand, or the last hand left.',
};
const BOUNTY_HAND_TIP = {
  off: 'Offsuit only: the 7 and the 2 have different suits.',
  suited: 'Suited allowed: a 7 and a 2 of the same suit also count.',
};
/** Info tip for the minimum raise: it explains only the setting this game uses. `value` is the key or the label text. */
export function MinRaiseTip({ value }: { value: GameRules['minRaise'] | string }) {
  const k = (MIN_RAISE.find((o) => o.k === value || o.label === value)?.k ?? 'last');
  return <Info title="Minimum raise">{MIN_RAISE_TIP[k]}</Info>;
}
/** Info tip for the 7-2 win condition: the selected option only. `value` is the key or the text of the rules list
    (Revealed at showdown, Winning the pot, Best hand). */
export function BountyWinTip({ value }: { value: BountyRule['win'] | string }) {
  const k = BOUNTY_WIN.find((o) => o.k === value || value.startsWith(o.label))?.k ?? 'shown';
  return <Info title="Win condition">{BOUNTY_WIN_TIP[k]}</Info>;
}
/** Info tip for the 7-2 hand: the selected option only. `value` is the switch or the text of the rules list. */
export function BountyHandTip({ value }: { value: boolean | string }) {
  const suited = value === true || value === 'Suited allowed';
  return <Info title="7-2 hand">{suited ? BOUNTY_HAND_TIP.suited : BOUNTY_HAND_TIP.off}</Info>;
}
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

/** House rules of one game: minimum raise and the 7-2 bounty. Used when creating a game and in its settings.
    Explanations live in the info tips, one tip per field; the page shows only live figures. */
export function RulesFields({ rules, onChange, players, idPrefix }: {
  rules: GameRules; onChange: (r: GameRules) => void; players?: number; idPrefix: string;
}) {
  const bounty = rules.bounty27;
  const setBounty = (patch: Partial<BountyRule>) => onChange({ ...rules, bounty27: { ...bounty, ...patch } });
  const others = players === undefined ? 0 : Math.max(1, players - 1);
  return (
    <div className="sat-stack" style={gap(4)}>
      <div className="sat-stack" style={gap(2)}>
        <Caption>Minimum raise <MinRaiseTip value={rules.minRaise} /></Caption>
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Minimum raise">
          <TabPill />
          {MIN_RAISE.map((o) => <button key={o.k} type="button" role="radio" aria-checked={rules.minRaise === o.k} onClick={() => onChange({ ...rules, minRaise: o.k })}>{o.label}</button>)}
        </div>
      </div>
      <div>
        <div className="sat-switch-row">
          <span>7-2 bounty <Help k="bounty27" /></span>
          <Toggle on={bounty.on} onChange={(v) => setBounty({ on: v })} label="7-2 bounty" />
        </div>
        <Disclose open={bounty.on}>
          <div className="sat-stack felt-bounty-set" style={{ ...gap(3), paddingTop: 'var(--sat-space-3)' }}>
            <div className="sat-stack" style={gap(2)}>
              <Caption>Win condition <BountyWinTip value={bounty.win} /></Caption>
              <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="7-2 win condition">
                <TabPill />
                {BOUNTY_WIN.map((o) => <button key={o.k} type="button" role="radio" aria-checked={bounty.win === o.k} onClick={() => setBounty({ win: o.k })}>{o.label}</button>)}
              </div>
            </div>
            <div className="sat-stack" style={gap(2)}>
              <Caption>Hand <BountyHandTip value={bounty.suited} /></Caption>
              <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="7-2 hand">
                <TabPill />
                <button type="button" role="radio" aria-checked={!bounty.suited} onClick={() => setBounty({ suited: false })}>Offsuit only</button>
                <button type="button" role="radio" aria-checked={bounty.suited} onClick={() => setBounty({ suited: true })}>Suited allowed</button>
              </div>
            </div>
            <div className="sat-grid felt-bounty-amt" style={{ ['--sat-min' as string]: '120px', ...gap(3) }}>
              <div className="sat-field">
                <label htmlFor={`${idPrefix}-bounty`}>Bounty (chips) <Help k="bountyAmount" /></label>
                <input id={`${idPrefix}-bounty`} className="sat-input sat-num" inputMode="decimal" key={bounty.amount} defaultValue={String(bounty.amount)}
                  onBlur={(e) => { const v = num(e.target.value); if (v !== null && v > 0) setBounty({ amount: v }); else { e.target.value = String(bounty.amount); toast('Type a number above 0, for example 10.'); } }} />
                {players !== undefined && <span className="sat-hint">{others + 1} players: {bounty.amount * others} chips to the 7-2.</span>}
              </div>
            </div>
          </div>
        </Disclose>
      </div>
    </div>
  );
}
