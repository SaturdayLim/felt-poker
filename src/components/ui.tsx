import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cardText, rankLabel, SUIT_COLOR, SUIT_SYMBOL } from '../lib/cards';
import { initials } from '../lib/format';
import { HELP } from '../lib/help';
import type { Card } from '../types';
import { useStore } from '../store';
import { NEXT_THEME } from '../theme';

/* ------------------------------- icons ------------------------------- */

const paths: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  games: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.6c2.6.1 4.5 1.8 5 4.9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  share: <><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.3 10.8 7.4-4.3" /><path d="m8.3 13.2 7.4 4.3" /></>,
  shuffle: <><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></>,
  cards: <><rect x="3" y="5" width="11" height="15" rx="2" /><path d="M14 7.5l4.5 1.2a2 2 0 0 1 1.4 2.4l-2.6 9.7a2 2 0 0 1-2.4 1.4L11 21" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 13a2 2 0 0 0 2 1.8h8a2 2 0 0 0 2-1.8L19 7" /><path d="M9 7V4h6v3" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  upload: <><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M4 21h16" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  flame: <path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4 2.5-5 .3 2 1.2 3 2.5 3-1-3 0-5.8 0-8z" />,
  up: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  down: <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  play: <path d="M7 4v16l13-8L7 4z" />,
  skull: <><path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V20h10v-3.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8z" /><circle cx="9" cy="11.5" r="1.6" /><circle cx="15" cy="11.5" r="1.6" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.9 19.1 1.4-1.4" /><path d="m17.7 6.3 1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
};

export function Icon({ name, size, stroke = 2 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/* ------------------------------- brand ------------------------------- */

/** Felt mark: two stacked poker chips, each a double ring, forming a vertical figure-eight
    (a companion to the Saturday double-layered vertical infinity). Source: src/brand/felt-mark.svg. */
export function FeltMark({ height = 32 }: { height?: number }) {
  return (
    <svg className="sat-mark" style={{ ['--sat-mark-h' as string]: `${height}px` }} viewBox="-2 -2 68 104" aria-hidden="true">
      <path d="M8 26 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0" />
      <path d="M17 26 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0" />
      <path d="M45.15 39.15 L47.84 41.84 M18.85 39.15 L16.16 41.84 M18.85 12.85 L16.16 10.16 M45.15 12.85 L47.84 10.16" />
      <path d="M8 74 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0" />
      <path d="M17 74 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0" />
      <path d="M45.15 87.15 L47.84 89.84 M18.85 87.15 L16.16 89.84 M18.85 60.85 L16.16 58.16 M45.15 60.85 L47.84 58.16" />
    </svg>
  );
}

/* ------------------------------- header ------------------------------- */

/** Sticky glass header (kit: .sat-header > .sat-header-bar.sat-glass). */
export function Header({ title, sub, back, right, brand }: {
  title?: string; sub?: string; back?: () => void; right?: ReactNode; brand?: boolean;
}) {
  return (
    <header className="sat-header felt-header">
      <div className="sat-header-bar sat-glass">
        {back && <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={back} aria-label="Back"><Icon name="back" /></button>}
        <div className="sat-brand">
          {brand && <FeltMark />}
          <div style={{ minWidth: 0 }}>
            {brand ? <span className="sat-wordmark">Felt</span> : <div className="felt-header-title">{title}</div>}
            {sub && <small style={{ display: 'block' }}>{sub}</small>}
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}

/** Phone theme toggle: one icon button that cycles Auto, Light, Dark. */
export function ThemeCycle() {
  const pref = useStore((s) => s.settings.theme);
  const update = useStore((s) => s.updateSettings);
  const icon = pref === 'auto' ? 'phone' : pref === 'light' ? 'sun' : 'moon';
  return (
    <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => update({ theme: NEXT_THEME[pref] })}
      aria-label={`Theme: ${pref}. Change theme`} title={`Theme: ${pref}`}>
      <Icon name={icon} />
    </button>
  );
}

/* ------------------------------- sheet ------------------------------- */

/** Kit sheet: a modal <dialog>, bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ open, onClose, title, sub, children }: {
  open: boolean; onClose: () => void; title?: string; sub?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); closing.current(); };
    const onClick = (e: MouseEvent) => {
      const r = d.getBoundingClientRect();
      if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) closing.current();
    };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('click', onClick);
    return () => { d.removeEventListener('cancel', onCancel); d.removeEventListener('click', onClick); if (d.open) d.close(); };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className="sat-sheet sat-glass-2" aria-label={title}>
      <div className="sat-stack">
        <div className="sat-split">
          <h2 className="sat-h3">{title}</h2>
          <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={onClose}>Close</button>
        </div>
        {sub && <p className="sat-small sat-muted" style={{ marginTop: -8 }}>{sub}</p>}
        {children}
      </div>
    </dialog>
  );
}

/* ------------------------------- info tip ------------------------------- */

/** Kit info tip (.sat-tip). Opens on tap, focus or hover; Escape or a tap elsewhere closes it.
    Placement copies saturday.js: centre under the button, then pull inside the screen edge. */
export function Info({ title, children }: { title?: string; children: ReactNode }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const place = () => {
    const tip = wrap.current;
    const body = tip?.querySelector<HTMLElement>('.sat-tip-body');
    if (!tip || !body) return;
    body.style.left = '0px';
    body.style.transform = 'none';
    const w = body.getBoundingClientRect().width;
    if (!w) return;
    const t = tip.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const left = Math.max(8, Math.min(t.left + t.width / 2 - w / 2, vw - 8 - w));
    body.style.left = `${left - t.left}px`;
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span ref={wrap} className={`sat-tip ${open ? 'is-open' : ''}`} onMouseEnter={place}>
      <button type="button" className="sat-tip-btn" aria-expanded={open} aria-label={title ? `About ${title.toLowerCase()}` : 'More information'}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>i</button>
      <span className="sat-tip-body" role="tooltip">{children}</span>
    </span>
  );
}

/** Info tip with the shared help copy. */
export function Help({ k }: { k: keyof typeof HELP }) {
  return <Info title={HELP[k].title}>{HELP[k].text}</Info>;
}

/* ------------------------------- captions and deltas ------------------------------- */

/** Uppercase caption with the qualifier in brackets keeping its case: POT (units). */
export function Caption({ children, q, tip, className }: { children: ReactNode; q?: string; tip?: keyof typeof HELP; className?: string }) {
  return (
    <span className={`sat-caption ${className ?? ''}`}>
      {children}{q && <> <span className="sat-qual">({q})</span></>}{tip && <> <Help k={tip} /></>}
    </span>
  );
}

/** Kit delta: arrow, value and colour, never colour alone. Flat is grey 0. */
export function Delta({ value, format, vs, className }: { value: number; format: (abs: number) => string; vs?: string; className?: string }) {
  const dir = value > 0.004 ? 'up' : value < -0.004 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '';
  return (
    <span className={`sat-delta sat-delta--${dir} ${className ?? ''}`}>
      {arrow}{format(dir === 'flat' ? 0 : Math.abs(value))}{vs && <small>{vs}</small>}
    </span>
  );
}

/* ------------------------------- cards ------------------------------- */

export function PlayingCard({ card, size, target, onClick, placeholder }: {
  card?: Card | null; size?: 'sm' | 'lg'; target?: boolean; onClick?: () => void; placeholder?: string;
}) {
  const cls = `felt-card ${size ?? ''} ${card ? '' : 'empty'} ${target ? 'target' : ''}`;
  const inner = card ? (
    <>
      <span className="r" style={{ color: SUIT_COLOR[card[1]] }}>{rankLabel(card)}</span>
      <span className="s" style={{ color: SUIT_COLOR[card[1]] }}>{SUIT_SYMBOL[card[1]]}</span>
    </>
  ) : <span className="s">{placeholder ?? ''}</span>;
  if (onClick)
    return <button type="button" className={cls} onClick={onClick} aria-label={card ? cardText(card) : `Empty ${placeholder ?? ''} slot`}>{inner}</button>;
  return <span className={cls} aria-label={card ? cardText(card) : undefined}>{inner}</span>;
}

export function Cards({ cards, size }: { cards: Card[]; size?: 'sm' | 'lg' }) {
  return <span className="felt-cards">{cards.map((c) => <PlayingCard key={c} card={c} size={size} />)}</span>;
}

export function Avatar({ name, size }: { name: string; size?: 'sm' }) {
  return <span className={`felt-avatar ${size ?? ''}`} aria-hidden="true">{initials(name)}</span>;
}

/** Kit switch: an on/off setting that applies at once. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="sat-switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

/** Empty state: heading, one line of body, optional button. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sat-flat felt-empty">
      <h3 className="sat-h3">{title}</h3>
      {children && <p className="sat-small sat-muted">{children}</p>}
      {action}
    </div>
  );
}

/* ------------------------------- toast ------------------------------- */

let toastListener: ((msg: string) => void) | null = null;
export function toast(msg: string) { toastListener?.(msg); }

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    toastListener = (m) => {
      setMsg(m);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2600);
    };
    return () => { toastListener = null; };
  }, []);
  return msg ? <div className="felt-toast sat-glass-2 sat-small" role="status">{msg}</div> : null;
}

/** Re-render every `ms` milliseconds (for live clocks). */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => set((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}

/** Parse a numeric text field; empty or invalid returns null. */
export function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
