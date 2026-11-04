import { useState } from 'react';
import { cardText } from '../lib/cards';
import type { Card, ID } from '../types';
import { CardBack, CardPair, CardPickerGrid, Caption, Cards, PlayingCard, Sheet, SlidePane, toast, WordButton } from './ui';

/** Write-only entry of a player's hole cards for one hand. The sheet never shows cards that were saved before:
    two face-down cards show that cards are filled, two outlined slots show none. Cards already shown at the table
    are public, so they show face up. Entering again replaces saved cards. No code is asked on this phone. */
export function CardEntrySheet({ players, name, entered, revealed, blocked, onSave, onClose, initial, closeOnSave }: {
  players: ID[]; name: (id: ID) => string; entered: ID[]; blocked: Card[];
  /** Cards already shown at the table, by player. */
  revealed?: Record<ID, Card[]>;
  onSave: (p: ID, cards: Card[]) => void; onClose: () => void;
  /** Start on this player's cards, without the player list. */
  initial?: ID;
  /** Close the sheet after saving. */
  closeOnSave?: boolean;
}) {
  const [pid, setPid] = useState<ID | null>(initial ?? null);
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
    if (closeOnSave) onClose(); else reset();
  };
  const shownNow = pid ? revealed?.[pid] ?? [] : [];
  const step = !pid ? 0 : ask ? 2 : 1;

  return (
    <Sheet open onClose={onClose} title={pid ? name(pid) : 'Player cards'} sub={!pid ? 'Write only. Saved cards cannot be seen again by anyone.' : ask ? 'Check the cards before saving.' : undefined}>
      <SlidePane k={String(step)} i={step}>
        {!pid ? (
          <div className="sat-stack">
            <div className="sat-glass-2 felt-list">
              {players.map((p) => (
                <button key={p} className="felt-row" onClick={() => setPid(p)}>
                  <span className="felt-row-main"><span className="felt-row-title">{name(p)}</span></span>
                  {revealed?.[p]?.length ? <Cards cards={revealed[p]} size="sm" /> : <CardPair filled={entered.includes(p)} />}
                </button>
              ))}
            </div>
            <button className="sat-btn sat-btn--block felt-btn-raised" onClick={onClose}>Done</button>
          </div>
        ) : ask ? (
          <div className="sat-stack">
            <div className="felt-cards" style={{ justifyContent: 'center' }}>{cards.map((c) => <PlayingCard key={c} card={c} size="lg" />)}</div>
            <p style={{ textAlign: 'center' }}>You selected {cardText(cards[0])} and {cardText(cards[1])}. Confirm submission?</p>
            <WordButton word="Saved" className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" run={confirm}>Confirm</WordButton>
            <button className="sat-btn sat-btn--block" onClick={() => { setCards([]); setAsk(false); }}>Change</button>
          </div>
        ) : (
          <div className="sat-stack">
            <Caption>Card {cards.length + 1} of 2</Caption>
            <div className="felt-cards" style={{ justifyContent: 'center' }}>
              {[0, 1].map((i) => (!cards[i] && entered.includes(pid) ? <CardBack key={i} size="lg" /> : <PlayingCard key={i} card={cards[i] ?? null} size="lg" placeholder={`Card ${i + 1}`} />))}
            </div>
            {/* a player's own shown cards stay open: they are the same two cards */}
            <CardPickerGrid disabled={(c) => (blocked.includes(c) && !shownNow.includes(c)) || cards.includes(c)} onPick={pick} />
            <button className="sat-btn sat-btn--ghost sat-btn--block" onClick={initial ? onClose : reset}>{initial ? 'Cancel' : 'Back to players'}</button>
          </div>
        )}
      </SlidePane>
    </Sheet>
  );
}
