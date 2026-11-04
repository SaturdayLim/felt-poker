import { useState } from 'react';
import { cardText } from '../lib/cards';
import type { Card, ID } from '../types';
import { CardBack, CardPair, CardPickerGrid, Caption, Cards, Icon, PlayingCard, Sheet, SlidePane, toast, WordButton } from './ui';

/** Cards shown at the table belong to the showdown. Hidden cards cannot replace them, on the host phone or a player's. */
export const SHOWDOWN_LOCK = 'Cards in showdown. Remove from showdown to overwrite.';

/** Write-only entry of a player's hole cards for one hand. The sheet never shows cards that were saved before:
    two face-down cards show that cards are filled, two outlined slots show none. Cards already shown at the table
    are public, so they show face up. Entering again replaces saved cards. No code is asked on this phone. */
export function CardEntrySheet({ players, name, entered, revealed, blocked, onSave, onClose, initial, closeOnSave, edge, known }: {
  players: ID[]; name: (id: ID) => string; entered: ID[]; blocked: Card[];
  /** Cards already shown at the table, by player. */
  revealed?: Record<ID, Card[]>;
  onSave: (p: ID, cards: Card[]) => void; onClose: () => void;
  /** Start on this player's cards, without the player list. */
  initial?: ID;
  /** Close the sheet after saving. */
  closeOnSave?: boolean;
  /** Opened from the coral card button: the sheet keeps its coral edge. */
  edge?: boolean;
  /** The player's own hidden cards, shown face up on the player's phone. The host phone never passes them. */
  known?: Card[];
}) {
  const locked = (p: ID) => !!revealed?.[p]?.length;
  const [pid, setPid] = useState<ID | null>(initial && !locked(initial) ? initial : null);
  const choose = (p: ID) => { if (locked(p)) toast(SHOWDOWN_LOCK); else setPid(p); };
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
    toast(`Saved for ${name(pid)}. Nobody else can see these cards.`);
    if (closeOnSave) onClose(); else reset();
  };
  const shownNow = pid ? revealed?.[pid] ?? [] : [];
  const step = !pid ? 0 : ask ? 2 : 1;

  return (
    <Sheet open onClose={onClose} edge={edge} title={pid ? name(pid) : 'Player cards'} sub={!pid ? 'Write only. Saved cards cannot be seen again by anyone.' : ask ? 'Check the cards before saving.' : undefined}>
      <SlidePane k={String(step)} i={step}>
        {!pid ? (
          <div className="sat-stack">
            <div className="sat-glass-2 felt-list">
              {players.map((p) => (
                <button key={p} className="felt-row" onClick={() => choose(p)}>
                  <span className="felt-row-main"><span className="felt-row-title">{name(p)}</span></span>
                  {locked(p) ? <Cards cards={revealed![p]} size="sm" /> : <CardPair filled={entered.includes(p)} />}
                  {(locked(p) || entered.includes(p)) && <span className="felt-eye" aria-hidden="true"><Icon name={locked(p) ? 'eye' : 'dark'} size={18} /></span>}
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
              {[0, 1].map((i) => (!cards[i] && known?.[i] ? <span key={i} className="felt-card-known"><PlayingCard card={known[i]} size="lg" /></span>
                : !cards[i] && entered.includes(pid) ? <CardBack key={i} size="lg" /> : <PlayingCard key={i} card={cards[i] ?? null} size="lg" placeholder={`Card ${i + 1}`} />))}
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
