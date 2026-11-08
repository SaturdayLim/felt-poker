/* The viewer's own card look: Big pips and custom colours, kept on this phone only. It never touches the host's
   card look (settings.cards). With nothing custom, the viewer reads the phone's normal look. Board cards that the
   host selects while the viewer watches flip face up (the same flip as FlipDown in ui.tsx, turned the other way). */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { CardBack, Info, Toggle, useCardLook } from './ui';
import { DEFAULT_FACE, DEFAULT_LOOK, SUIT_NAME, SUIT_SYMBOL, cardText, cleanLook, lookColor, rankLabel } from '../lib/cards';
import { calm } from '../lib/motion';
import type { Card, CardLook, SuitKey } from '../types';

export interface ViewerLook { big: boolean; custom: boolean; colors: Record<SuitKey, string>; bg: string }
const KEY = 'felt-viewer-look';
const HEX = /^#[0-9a-fA-F]{6}$/;
const SUITS: SuitKey[] = ['s', 'h', 'c', 'd'];
export const VIEWER_DEFAULT: ViewerLook = { big: false, custom: false, colors: { s: '#111111', h: '#d62839', c: '#111111', d: '#d62839' }, bg: DEFAULT_FACE };

const clean = (v: Partial<ViewerLook> | null | undefined): ViewerLook => ({
  big: !!v?.big, custom: !!v?.custom,
  colors: Object.fromEntries(SUITS.map((s) => [s, HEX.test(v?.colors?.[s] ?? '') ? v!.colors![s] : VIEWER_DEFAULT.colors[s]])) as Record<SuitKey, string>,
  bg: HEX.test(v?.bg ?? '') ? v!.bg! : DEFAULT_FACE,
});
let memory = '';
const read = (): string => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const listeners = new Set<() => void>();
const write = (v: ViewerLook) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: kept until the page closes */ memory = JSON.stringify(v); } listeners.forEach((l) => l()); };
const snap = () => read() || memory;
const subscribe = (l: () => void) => { listeners.add(l); window.addEventListener('storage', l); return () => { listeners.delete(l); window.removeEventListener('storage', l); }; };

export function useViewerLook(): [ViewerLook, (patch: Partial<ViewerLook>) => void, () => void] {
  const raw = useSyncExternalStore(subscribe, snap, () => '');
  let parsed: Partial<ViewerLook> | null = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* a broken value reads as the default */ }
  const look = clean(parsed);
  return [look, (patch) => write(clean({ ...look, ...patch })), () => write(VIEWER_DEFAULT)];
}

/** The look cards use in the viewer: the phone's own look, until the viewer turns custom colours on. */
function useEffectiveLook(): { look: CardLook; bg?: string; big: boolean } {
  const phone = useCardLook();
  const [v] = useViewerLook();
  if (!v.custom) return { look: phone, big: v.big };
  return { look: cleanLook({ order: DEFAULT_LOOK.order, colors: v.colors, custom: true, bg: v.bg }), bg: v.bg, big: v.big };
}

/** Class for the page: Big pips grows the cards and their rank and pip. */
export const useBigPips = () => (useViewerLook()[0].big ? 'felt-vbig' : '');

/* ------------------------------- cards ------------------------------- */

/** Cards the viewer has already seen in this hand. A card not in the set flips in when it first shows. */
const RevealCtx = createContext<Set<string> | null>(null);
export const RevealProvider = RevealCtx.Provider;
/** Make the set for one hand view: every card already on screen when the hand first shows counts as seen. */
export function useSeenCards(initial: () => string[]): Set<string> {
  const ref = useRef<Set<string> | null>(null);
  if (!ref.current) ref.current = new Set(initial());
  return ref.current;
}

function Face({ card, size }: { card: Card; size?: 'sm' | 'lg' }) {
  const { look, bg } = useEffectiveLook();
  const c = lookColor(look, card[1]);
  return (
    <span className={`felt-card ${size ?? ''}`} aria-label={cardText(card)} style={bg ? { background: bg } : undefined}>
      <span className="r" style={{ color: c }}>{rankLabel(card)}</span>
      <span className="s" style={{ color: c }}>{SUIT_SYMBOL[card[1]]}</span>
    </span>
  );
}

/** One board card turning face up: back first, then a rotateY of 0 to 180 shows the front. 420 ms, `delay` ms late. */
function Reveal({ card, size, delay }: { card: Card; size?: 'sm' | 'lg'; delay: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const a = el.current?.animate?.({ transform: ['rotateY(0deg)', 'rotateY(180deg)'] }, { duration: 420, delay, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' });
    return () => a?.cancel();
  }, []);
  return (
    <span className="felt-vflip" aria-label={cardText(card)}>
      <span className="felt-vflip-in" ref={el}><span className="felt-vflip-b"><CardBack size={size} /></span><span className="felt-vflip-f"><Face card={card} size={size} /></span></span>
    </span>
  );
}

/** A group of cards in the viewer look. With `reveal`, each card that is new to this hand flips up, 70 ms apart;
    a single new card (turn, river) flips alone. Reduced motion shows every card face up at once. */
export function VCards({ cards, size, reveal }: { cards: Card[]; size?: 'sm' | 'lg'; reveal?: boolean }) {
  const seen = useContext(RevealCtx);
  // a card flips only when it first shows in this hand while the viewer watches; the choice is made on mount
  const fresh = useRef<Set<Card> | null>(null);
  if (!fresh.current) fresh.current = new Set(reveal && seen && !calm() ? cards.filter((c) => !seen.has(c)) : []);
  useEffect(() => { cards.forEach((c) => seen?.add(c)); });
  let k = 0;
  return (
    <span className="felt-cards">
      {cards.map((c) => (fresh.current!.has(c) ? <Reveal key={c} card={c} size={size} delay={70 * k++} /> : <Face key={c} card={c} size={size} />))}
    </span>
  );
}

/* ------------------------------- settings ------------------------------- */

/** The viewer's own Settings: Big pips, pip colours and card background. A tip beside each field; no captions. */
export function ViewerLookSettings() {
  const [v, set, reset] = useViewerLook();
  const phone = useCardLook();
  const isDefault = !v.big && !v.custom;
  // the first custom edit starts from what the cards show now
  const pick = (patch: Partial<ViewerLook>) => set(v.custom ? patch : { colors: Object.fromEntries(SUITS.map((s) => [s, lookColor(phone, s)])) as Record<SuitKey, string>, ...patch, custom: true });
  const shownColors = (s: SuitKey) => (v.custom ? v.colors[s] : lookColor(phone, s));
  return (
    <section className="sat-glass-2 felt-list felt-vlook" aria-label="My cards">
      <div className="felt-vlook-preview" aria-hidden="true">
        {(['As', 'Kh', 'Qc', 'Jd'] as Card[]).map((c) => <Face key={c} card={c} size="sm" />)}
      </div>
      <div className="felt-row">
        <span className="felt-row-main sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>Big pips
          <Info title="Big pips">Card ranks and suit marks grow, so clubs and spades are easy to tell apart. This applies on this phone only.</Info></span>
        <Toggle on={v.big} onChange={(big) => set({ big })} label="Big pips" />
      </div>
      <div className="felt-row felt-vlook-colors">
        <span className="felt-row-main sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>Pip colours
          <Info title="Pip colours">Pick one colour for each suit. The colours apply on this phone only. The host keeps its own card look.</Info></span>
        <span className="felt-vlook-swatches">
          {SUITS.map((s) => (
            <label key={s} className="felt-vswatch" style={{ ['--vs' as string]: shownColors(s) }}>
              <input type="color" value={shownColors(s)} aria-label={`${SUIT_NAME[s]} colour`} onChange={(e) => pick({ colors: { ...(v.custom ? v.colors : Object.fromEntries(SUITS.map((x) => [x, lookColor(phone, x)])) as Record<SuitKey, string>), [s]: e.target.value } })} />
              <span aria-hidden="true">{SUIT_SYMBOL[s]}</span>
            </label>
          ))}
        </span>
      </div>
      <div className="felt-row">
        <span className="felt-row-main sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>Card background
          <Info title="Card background">The colour behind the rank and suit mark. It applies on this phone only.</Info></span>
        <label className="felt-vswatch felt-vswatch--bg" style={{ ['--vs' as string]: v.custom ? v.bg : DEFAULT_FACE }}>
          <input type="color" value={v.custom ? v.bg : DEFAULT_FACE} aria-label="Card background colour" onChange={(e) => pick({ bg: e.target.value })} />
        </label>
      </div>
      <div className="felt-row felt-row--end">
        <button type="button" className="sat-btn sat-btn--block" disabled={isDefault} aria-disabled={isDefault} onClick={reset}>Default</button>
      </div>
    </section>
  );
}
