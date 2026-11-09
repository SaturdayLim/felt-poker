/* Card test ground for Settings, Cards: the real picker grid under two card slots. Nothing is saved. Empty slots show a
   face-down card; a pick turns it up (rotateY, 420 ms, the same method as FlipDown); a tap on a picked card turns it back down.
   The grid and the faces read the live card look (suit colours, suit order, Ace-to-2 or 2-to-Ace), so a change elsewhere on
   the page shows at once. */
import { useLayoutEffect, useRef, useState } from 'react';
import { CardBack, CardPickerGrid, PlayingCard } from './ui';
import { calm } from '../lib/motion';
import type { Card } from '../types';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

function Slot({ card, onClear, n }: { card: Card | null; onClear: () => void; n: number }) {
  const inner = useRef<HTMLSpanElement>(null);
  const shown = useRef<Card | null>(card);
  const first = useRef(true);
  if (card) shown.current = card;
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const to = card ? 'rotateY(180deg)' : 'rotateY(0deg)';
    if (first.current || calm() || !el.animate) { el.style.transform = to; first.current = false; return; }
    const from = card ? 'rotateY(0deg)' : 'rotateY(180deg)';
    const a = el.animate({ transform: [from, to] }, { duration: 420, easing: EASE, fill: 'forwards' });
    return () => { a.cancel(); el.style.transform = to; };
  }, [card]);
  return (
    <button type="button" className="felt-ptest-slot" disabled={!card} onClick={onClear} data-press="none"
      aria-label={card ? `Slot ${n}: ${card}. Tap to turn it face down` : `Slot ${n}: face down`}>
      <span className="felt-ptest-in" ref={inner}>
        <span className="felt-ptest-b"><CardBack /></span>
        <span className="felt-ptest-f">{shown.current ? <PlayingCard card={shown.current} /> : <CardBack />}</span>
      </span>
    </button>
  );
}

export function CardPlayground() {
  const [slots, setSlots] = useState<(Card | null)[]>([null, null]);
  const picked = slots.filter(Boolean) as Card[];
  const full = picked.length === 2;
  const pick = (c: Card) => setSlots((s) => { const i = s.indexOf(null); if (i < 0) return s; const n = [...s]; n[i] = c; return n; });
  const clear = (i: number) => setSlots((s) => s.map((x, j) => (j === i ? null : x)));
  return (
    <div className="felt-ptest" aria-label="Card test ground">
      <div className="felt-ptest-slots">
        {slots.map((c, i) => <Slot key={i} n={i + 1} card={c} onClear={() => clear(i)} />)}
        <button type="button" className="sat-btn" style={{ minHeight: 44 }} disabled={!picked.length} onClick={() => setSlots([null, null])}>Clear</button>
      </div>
      <CardPickerGrid disabled={(c) => full || picked.includes(c)} onPick={pick} />
    </div>
  );
}
