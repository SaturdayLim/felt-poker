import { useState } from 'react';
import { cardText } from '../lib/cards';
import type { Card, ID } from '../types';
import { CardPickerGrid, Caption, PlayingCard, Sheet, toast } from './ui';

/** Write-only entry of a player's hole cards for one hand. The sheet never shows cards that were saved before:
    it only says whether an entry exists. Entering again replaces the old entry. No code is asked on this phone. */
export function CardEntrySheet({ players, name, entered, blocked, onSave, onClose }: {
  players: ID[]; name: (id: ID) => string; entered: ID[]; blocked: Card[];
  onSave: (p: ID, cards: Card[]) => void; onClose: () => void;
}) {
  const [pid, setPid] = useState<ID | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [ask, setAsk] = useState(false);

  const reset = () => { setPid(null); setCards([]); setAsk(false); };
  const pick = (c: Card) => {
    const next = [...cards, c];
    setCards(next);
    if (next.length === 2) setAsk(true);
  };
  const confirm = () => {
    if (!pid || cards.length !== 2) return;
    onSave(pid, cards);
    toast(`Saved for ${name(pid)}. Nobody can see these cards.`);
    reset();
  };

  if (!pid) {
    return (
      <Sheet open onClose={onClose} title="Player cards" sub="Write only. Saved cards cannot be seen again by anyone.">
        <p className="sat-small sat-muted">Pick a player to enter or replace their cards for this hand.</p>
        <div className="sat-glass-2 felt-list">
          {players.map((p) => (
            <button key={p} className="felt-row" onClick={() => setPid(p)}>
              <span className="felt-row-main"><span className="felt-row-title">{name(p)}</span></span>
              <span className="sat-small sat-muted">{entered.includes(p) ? 'Entered' : 'Not entered'}</span>
            </button>
          ))}
        </div>
        <button className="sat-btn sat-btn--block" onClick={onClose}>Done</button>
      </Sheet>
    );
  }

  if (ask) {
    return (
      <Sheet open onClose={onClose} title={name(pid)} sub="Check the cards before saving.">
        <div className="felt-cards" style={{ justifyContent: 'center' }}>{cards.map((c) => <PlayingCard key={c} card={c} size="lg" />)}</div>
        <p style={{ textAlign: 'center' }}>You selected {cardText(cards[0])} and {cardText(cards[1])}. Confirm submission?</p>
        <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" onClick={confirm}>Confirm</button>
        <button className="sat-btn sat-btn--block" onClick={() => { setCards([]); setAsk(false); }}>Change</button>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={name(pid)} sub={entered.includes(pid) ? 'An entry exists. New cards replace it.' : 'No entry yet.'}>
      <Caption>Card {cards.length + 1} of 2</Caption>
      <div className="felt-cards" style={{ justifyContent: 'center' }}>
        {[0, 1].map((i) => <PlayingCard key={i} card={cards[i] ?? null} size="lg" placeholder={`Card ${i + 1}`} />)}
      </div>
      <CardPickerGrid disabled={(c) => blocked.includes(c) || cards.includes(c)} onPick={pick} />
      <button className="sat-btn sat-btn--ghost sat-btn--block" onClick={reset}>Back to players</button>
    </Sheet>
  );
}
