import { useEffect, useRef, useState } from 'react';
import { cardText } from '../lib/cards';
import { normalCode } from '../lib/codes';
import type { Card, ID } from '../types';
import { CardBack, CardPair, CardPickerGrid, Caption, Cards, FlipDown, Icon, PlayingCard, Sheet, SlidePane, toast, WordButton } from './ui';
import { CodeBoxes } from './codeBoxes';

/** The phone owner opened their own hidden cards with their player code. It stays open on this phone until they
    hide them again or the code changes. */
const OPEN_KEY = (p: ID) => `felt-own-open:${p}`;
const ownOpen = (p: ID, code?: string) => { try { return !!code && localStorage.getItem(OPEN_KEY(p)) === code; } catch { return false; } };

/** Cards shown at the table belong to the showdown. Hidden cards cannot replace them, on the host phone or a player's. */
export const SHOWDOWN_LOCK = 'Cards in showdown. Remove from showdown to overwrite.';

/** Write-only entry of a player's hole cards for one hand. The sheet never shows cards that were saved before:
    two face-down cards show that cards are filled, two outlined slots show none. Cards already shown at the table
    are public, so they show face up. Entering again replaces saved cards. No code is asked on this phone. */
export function CardEntrySheet({ players, name, entered, revealed, blocked, onSave, onClose, initial, closeOnSave, edge, known, own }: {
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
  /** Host phone: the phone owner's player, their code and their hidden cards for this hand. With the code entered,
      their own row shows face up, with an open eye (shown at the table) or a shut eye (hidden). */
  own?: { id: ID; code?: string; cards?: Card[] };
}) {
  const [open, setOpen] = useState(() => !!own && ownOpen(own.id, own.code));
  const [unlock, setUnlock] = useState(false);
  /** Cards saved while this sheet is open stay face up until it closes. */
  const [fresh, setFresh] = useState<Record<ID, Card[]>>({});
  /** The player whose cards were just saved: back on the list, their two cards turn face down. */
  const [flipNow, setFlipNow] = useState<ID | null>(null);
  const flipTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(flipTimer.current), []);
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
    setFresh((f) => ({ ...f, [pid]: cards }));
    // hidden at once: the list shows the two cards for a moment as it returns, then they turn face down
    setFlipNow(pid);
    window.clearTimeout(flipTimer.current);
    flipTimer.current = window.setTimeout(() => setFlipNow(null), 1400);
    toast(`Saved for ${name(pid)}. Nobody else can see these cards.`);
    if (closeOnSave) onClose(); else reset();
  };
  const shownNow = pid ? revealed?.[pid] ?? [] : [];
  const step = unlock ? 3 : !pid ? 0 : ask ? 2 : 1;
  const mineOpen = (p: ID) => !!own && own.id === p && open;
  /** Face up in the list: shown at the table, or the owner's own cards once opened. Cards just saved turn face down (FlipDown). */
  const faceUp = (p: ID): Card[] => (locked(p) ? revealed![p] : mineOpen(p) && own!.cards?.length === 2 ? own!.cards : []);

  return (
    <Sheet open onClose={onClose} edge={edge} title={unlock ? 'My cards' : pid ? name(pid) : 'Player cards'} sub={unlock ? 'Enter your player code to show your own cards on this phone.' : !pid ? 'Write only. Saved cards turn face down at once.' : ask ? 'Check the cards before saving.' : undefined}>
      <SlidePane k={String(step)} i={step}>
        {unlock ? (
          <div className="sat-stack">
            <CodeBoxes onSubmit={async (c) => {
              if (!own?.code || normalCode(c) !== normalCode(own.code)) return false;
              try { localStorage.setItem(OPEN_KEY(own.id), own.code); } catch { /* private mode: open for this sheet only */ }
              setOpen(true); setUnlock(false);
              return true;
            }} />
            <button className="sat-btn sat-btn--ghost sat-btn--block" onClick={() => setUnlock(false)}>Cancel</button>
          </div>
        ) : !pid ? (
          <div className="sat-stack">
            <div className="sat-glass-2 felt-list">
              {players.map((p) => (
                <button key={p} className="felt-row" onClick={() => choose(p)}>
                  <span className="felt-row-main"><span className="felt-row-title">{name(p)}</span></span>
                  {flipNow === p && fresh[p] ? <FlipDown cards={fresh[p]} size="sm" /> : faceUp(p).length ? <Cards cards={faceUp(p)} size="sm" /> : <CardPair filled={entered.includes(p) || !!fresh[p]} />}
                  {/* only the owner's own cards carry an eye: open = shown at the table, shut = hidden */}
                  {mineOpen(p) && (locked(p) || entered.includes(p)) && <span className="felt-eye" aria-hidden="true"><Icon name={locked(p) ? 'eye' : 'dark'} size={18} /></span>}
                </button>
              ))}
            </div>
            {own && players.includes(own.id) && own.code && (
              <button className="sat-btn sat-btn--ghost sat-btn--block" onClick={() => {
                if (!open) { setUnlock(true); return; }
                try { localStorage.removeItem(OPEN_KEY(own.id)); } catch { /* private mode */ }
                setOpen(false);
              }}>{open ? 'Hide my cards' : 'Show my cards'}</button>
            )}
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
