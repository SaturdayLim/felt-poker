import { Component, createRef, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cardText, cleanLook, lookColor, orderedRanks, rankLabel, rankOrder, setRankOrder, SUIT_SYMBOL, type RankOrder } from '../lib/cards';
import { initials } from '../lib/format';
import { haptic } from '../lib/haptics';
import { ACCORDION, ARRIVE, DISCLOSE, DRAWER, SPRING, navMs, calm, physSpring, spring, springCurve } from '../lib/motion';
import { HELP, type HelpKey, type TipLine } from '../lib/help';
import type { Card, CardLook } from '../types';
import { LiquidToggle, ThemeToggle } from './liquidToggle';
import { useStore } from '../store';
import { takeCarry } from '../lib/tabSwipe';

/* ------------------------------- icons ------------------------------- */

export const paths: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  games: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.6c2.6.1 4.5 1.8 5 4.9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  link: <><path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" /><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" /></>,
  power: <><path d="M12 3v9" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4c4-2 7 2 14 0v9c-7 2-10-2-14 0" /></>,
  cardsadd: <><rect x="4" y="6.5" width="9" height="13" rx="1.6" transform="rotate(-14 8.5 13)" /><rect x="10" y="5.5" width="9" height="13" rx="1.6" transform="rotate(10 14.5 12)" fill="var(--felt-fab-bg, none)" /><path d="M14.5 9.5v5M12 12h5" transform="rotate(10 14.5 12)" /></>,
  eyedrop: <><path d="m14.5 6.5 3 3" /><path d="M16 5l1.6-1.6a2 2 0 0 1 2.9 2.9L19 8l.8.8-1.6 1.6L13.6 5.8 15.2 4.2z" /><path d="M14.5 7.5 5.6 16.4 5 19l2.6-.6 8.9-8.9" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  share: <><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.3 10.8 7.4-4.3" /><path d="m8.3 13.2 7.4 4.3" /></>,
  shuffle: <><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></>,
  cards: <><rect x="3" y="5" width="11" height="15" rx="2" /><path d="M14 7.5l4.5 1.2a2 2 0 0 1 1.4 2.4l-2.6 9.7a2 2 0 0 1-2.4 1.4L11 21" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 13a2 2 0 0 0 2 1.8h8a2 2 0 0 0 2-1.8L19 7" /><path d="M9 7V4h6v3" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4.5L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14 4.5L20 15" /><path d="M20 20v-5h-5" /></>,
  upload: <><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M4 21h16" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  flame: <path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4 2.5-5 .3 2 1.2 3 2.5 3-1-3 0-5.8 0-8z" />,
  up: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  down: <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  play: <path d="M7 4v16l13-8L7 4z" />,
  skull: <><path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V20h10v-3.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8z" /><circle cx="9" cy="11.5" r="1.6" /><circle cx="15" cy="11.5" r="1.6" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  dark: <><path d="M3 10.5c2.4 3.1 5.4 4.6 9 4.6s6.6-1.5 9-4.6" /><path d="m5.6 13.4-1.7 2.2" /><path d="m9.6 14.8-.8 2.6" /><path d="m14.4 14.8.8 2.6" /><path d="m18.4 13.4 1.7 2.2" /></>,
  backspace: <><path d="M21 5H9.5L3 12l6.5 7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" /><path d="m12.5 9.5 5 5" /><path d="m17.5 9.5-5 5" /></>,
  lines: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  sigma: <path d="M18 5H6.5l6 7-6 7H18" />,
  chip: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.2" /><path d="M12 3v3.6" /><path d="M12 17.4V21" /><path d="M3 12h3.6" /><path d="M17.4 12H21" /><path d="m5.6 5.6 2.5 2.5" /><path d="m15.9 15.9 2.5 2.5" /><path d="m18.4 5.6-2.5 2.5" /><path d="m8.1 15.9-2.5 2.5" /></>,
  spade: <path d="M12 3c3 3.6 7 6 7 10a3.7 3.7 0 0 1-6.4 2.5c.1 1.8.7 3.2 1.9 4.5h-5c1.2-1.3 1.8-2.7 1.9-4.5A3.7 3.7 0 0 1 5 13c0-4 4-6.4 7-10z" />,
  floppy: <><path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M8 3v5h7V3" /><rect x="7" y="13" width="10" height="8" rx="1" /></>,
  /* an info desk: a solid disc with the i cut out of it, unlike the thin outline of a tip */
  desk: <><mask id="felt-desk-m"><rect width="24" height="24" fill="#fff" stroke="none" /><path d="M12 11v5.6" stroke="#000" strokeWidth="2.3" /><circle cx="12" cy="7.6" r="1.25" fill="#000" stroke="none" /></mask><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" mask="url(#felt-desk-m)" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.9 19.1 1.4-1.4" /><path d="m17.7 6.3 1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>,
  dollar: <><path d="M12 2.5v19" /><path d="M16.5 6.5c-.8-1.3-2.5-2-4.5-2-2.6 0-4.5 1.3-4.5 3.4 0 4.6 9.5 2.4 9.5 7.5 0 2-1.9 3.6-5 3.6-2.2 0-4-.8-4.8-2.4" /></>,
  /* Messages, Replace: a circle with a dotted circle behind it (the message it takes the place of) */
  replace: <><circle cx="14.5" cy="9.5" r="6" strokeDasharray="1.6 2.4" /><circle cx="9.5" cy="14.5" r="6" /></>,
  /* Messages, Stack: three lines, one message above the other */
  stack: <><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3z" /><path d="M21 14v.01" /><path d="M21 21h-4v-4" /><path d="M14 21v-.01" /></>,
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

/** Felt mark, small version: two stacked poker chips drawn as one S. Both rings of each chip open 65° beside the waist,
    lower right on the top chip and upper left on the bottom, and the ticks go, so the S stays clear at 16 px.
    The opening screen draws the full mark: src/brand/felt-mark.svg. */
export function FeltMark({ height = 32, full = false }: { height?: number; full?: boolean }) {
  if (full) {
    // The full mark, the same as the load screen (index.html): two grey chips with six bands each, faded back, and the gold S
    // over them, so the load screen hands over to it with no change of shape
    const chip = (cy: number, d: string) => (
      <g opacity={0.22}>
        <circle cx={32} cy={cy} r={22.5} fill="var(--sat-muted)" stroke="none" />
        <circle cx={32} cy={cy} r={15} stroke="var(--sat-bg)" strokeWidth={1.4} opacity={0.85} vectorEffect="none" />
        <path d={d} style={{ stroke: 'var(--sat-bg)', strokeWidth: 5, strokeLinecap: 'butt', vectorEffect: 'none' }} />
      </g>
    );
    return (
      <svg className="sat-mark" style={{ ['--sat-mark-h' as string]: `${height}px` }} viewBox="-2 -2 68 104" aria-hidden="true">
        {chip(26, 'M46.72 34.50 L51.49 37.25 M32.00 43.00 L32.00 48.50 M17.28 34.50 L12.51 37.25 M17.28 17.50 L12.51 14.75 M32.00 9.00 L32.00 3.50 M46.72 17.50 L51.49 14.75')}
        {chip(74, 'M46.72 82.50 L51.49 85.25 M32.00 91.00 L32.00 96.50 M17.28 82.50 L12.51 85.25 M17.28 65.50 L12.51 62.75 M32.00 57.00 L32.00 51.50 M46.72 65.50 L51.49 62.75')}
        <path d="M42.52 47.57 A24 24 0 1 0 32 50 A24 24 0 1 1 21.48 52.43" />
      </svg>
    );
  }
  return (
    <svg className="sat-mark" style={{ ['--sat-mark-h' as string]: `${height}px` }} viewBox="-2 -2 68 104" aria-hidden="true">
      <path d="M53.75 36.14 A24 24 0 1 0 32 50 A24 24 0 1 1 10.25 63.86" />
      <path d="M45.59 32.34 A15 15 0 1 0 32 41" />
      <path d="M32 59 A15 15 0 1 1 18.41 67.66" />
    </svg>
  );
}

/* ------------------------------- header ------------------------------- */

/** The banner name. With `onRename` a tap turns it into a text field in the tab, in place. Enter or leaving the field saves;
    Escape or a swipe up on the tab keeps the old name. The h1 stays, so the shared-element glide of the name still works. */
function BannerTitle({ banner, share, onRename }: { banner: string; share?: 'game'; onRename?: (name: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(banner);
  const input = useRef<HTMLInputElement>(null);
  const skip = useRef(false);
  const startY = useRef<number | null>(null);
  useEffect(() => { if (!edit) setText(banner); }, [banner, edit]);
  useEffect(() => { if (edit) { input.current?.focus(); input.current?.select(); } }, [edit]);
  // the page can leave while the field has focus (a route change): the typed name is saved then, not lost
  const latest = useRef({ edit, text, banner, onRename });
  latest.current = { edit, text, banner, onRename };
  useEffect(() => () => {
    const l = latest.current, n = l.text.trim();
    if (l.edit && !skip.current && l.onRename && n && n !== l.banner) l.onRename(n);
  }, []);
  if (!onRename) return <h1 className="felt-banner-title" data-share={share}>{banner}</h1>;
  const finish = (save: boolean) => {
    if (!edit) return;
    setEdit(false);
    const n = text.trim();
    if (!save || n === banner) { setText(banner); return; }
    if (!n) { toast('Enter a name for the game.'); setText(banner); return; }
    onRename(n);
  };
  const cancel = () => { skip.current = true; setText(banner); input.current?.blur(); };
  return (
    <h1 className={`felt-banner-title is-renamable${edit ? ' is-editing' : ''}`} data-share={share} role={edit ? undefined : 'button'} tabIndex={edit ? undefined : 0}
      aria-label={edit ? undefined : `${banner}. Tap to rename`}
      onClick={() => { if (!edit) { skip.current = false; setEdit(true); } }}
      onKeyDown={(e) => { if (!edit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); skip.current = false; setEdit(true); } }}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => { if (edit && startY.current !== null && startY.current - e.touches[0].clientY > 24) { startY.current = null; cancel(); } }}>
      {edit ? (
        <input ref={input} className="felt-banner-edit" aria-label="Game name" value={text} maxLength={60} autoComplete="off" spellCheck={false} enterKeyHint="done"
          onChange={(e) => setText(e.target.value.replace(/[\r\n\t]/g, ' '))}
          onBlur={() => { if (skip.current) { skip.current = false; setEdit(false); return; } finish(true); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') input.current?.blur(); if (e.key === 'Escape') cancel(); }} />
      ) : banner}
    </h1>
  );
}

/** Sticky header, drawn as the tab of a notebook page: the title (and Back) sit in a tab that stands up from the
    page edge, a line across the screen. Actions sit on the edge to the right of the tab. */
export function Header({ title, sub, back, right, brand, banner, children, tabs, share, onRename }: {
  title?: string; sub?: string; back?: () => void; right?: ReactNode; brand?: boolean; children?: ReactNode;
  /** Views of the page as a row of notebook tabs (for example Players, Leaderboard, Stats). They take the place of the title tab. */
  tabs?: { label: string; on: boolean; go: () => void; icon?: string }[];
  /** A main tab: a banner row above the page. It holds the page name (or the brand with `brand`) left and the theme toggle right. */
  banner?: string;
  /** The title is shared with the page it came from (a game's name in a list): the two morph on a page change. */
  share?: 'game';
  /** The banner name turns into a text field on a tap (a game's name). Enter or leaving the field saves the trimmed name; an empty name is refused. */
  onRename?: (name: string) => void;
}) {
  const tabRow = tabs && (
    <div className="sat-header-bar felt-notebook" role="tablist" aria-label={banner ?? title}>
      {tabs.map((t) => (
        <button key={t.label} type="button" role="tab" aria-selected={t.on} aria-label={t.label} className={`felt-ntab felt-ntab--view ${t.icon ? 'felt-ntab--icon' : ''} ${t.on ? 'is-on' : ''}`} onClick={t.go}>
          {t.icon && <span className="felt-ntab-ic"><Icon name={t.icon} size={20} /></span>}
          {t.icon
            ? <span className="felt-ntab-lab" aria-hidden={!t.on}><span className="felt-header-title">{t.label}</span></span>
            : <span className="felt-header-title">{t.label}</span>}
        </button>
      ))}
      {right && !banner && <div className="felt-ntab-right">{right}</div>}
    </div>
  );
  if (banner !== undefined) {
    return (
      <header className="sat-header felt-header felt-header--banner">
        <div className="felt-banner">
          {back && !brand && <button className="sat-btn sat-btn--ghost sat-iconbtn felt-banner-back" onClick={back} aria-label="Back"><Icon name="back" /></button>}
          {brand
            ? <div className="sat-brand felt-banner-brand"><FeltMark full height={34} /><span className="sat-wordmark">{banner}</span></div>
            : sub
              ? <div className="felt-banner-stack"><BannerTitle banner={banner} share={share} onRename={onRename} /><small className="felt-banner-sub">{sub}</small></div>
              : <BannerTitle banner={banner} share={share} onRename={onRename} />}
          {/* a main tab: the theme toggle is one shared control in App (ThemeHost), so this banner keeps only a slot for it */}
          <div className="felt-banner-right">{back ? right ?? <ThemeToggle /> : <>{right}<span className="felt-toggle-slot" aria-hidden="true" /></>}</div>
        </div>
        {tabRow}
        {children}
      </header>
    );
  }
  if (tabs) {
    return (
      <header className="sat-header felt-header felt-header--tab">
        {tabRow}
        {children}
      </header>
    );
  }
  // Home: Felt is not a tab. The mark and the wordmark sit plain on the page, with no tab and no page edge.
  if (brand) {
    return (
      <header className="sat-header felt-header felt-header--brand">
        <div className="sat-header-bar felt-brandbar">
          <div className="sat-brand">
            <FeltMark />
            <span className="sat-wordmark">Felt</span>
          </div>
          {right && <div className="felt-brandbar-right">{right}</div>}
        </div>
        {children}
      </header>
    );
  }
  return (
    <header className={back ? 'sat-header felt-header' : 'sat-header felt-header felt-header--tab'}>
      <div className="sat-header-bar felt-notebook">
        <div className="felt-ntab is-on">
          {back && <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={back} aria-label="Back"><Icon name="back" /></button>}
          <div className="sat-brand">
            <div style={{ minWidth: 0 }}>
              <div className="felt-header-title">{title}</div>
              {sub && <small style={{ display: 'block' }}>{sub}</small>}
            </div>
          </div>
        </div>
        {right && <div className="felt-ntab-right">{right}</div>}
      </div>
      {children}
    </header>
  );
}

/* ------------------------------- sheet ------------------------------- */

/** The highlight of a tab bar or segmented control: a real rounded box behind the buttons. It moves with a CSS
    transition, which retargets if a second tap comes mid-way. Put it first inside the bar. */
export function TabPill() {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const place = () => {
    const el = ref.current, box = el?.parentElement;
    if (!el || !box) return;
    const sel = box.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-checked="true"], :scope > [aria-current="page"]');
    el.style.opacity = sel ? '1' : '0';
    if (!sel) return;
    // the first placement must not slide in from the corner
    if (!placed.current) el.style.transition = 'none';
    el.style.width = `${sel.offsetWidth}px`;
    el.style.height = `${sel.offsetHeight}px`;
    el.style.transform = `translate(${sel.offsetLeft}px, ${sel.offsetTop}px)`;
    el.style.borderRadius = getComputedStyle(sel).borderTopLeftRadius;
    if (!placed.current) { void el.offsetWidth; el.style.transition = ''; placed.current = true; }
  };
  useLayoutEffect(place);
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} className="felt-pill" aria-hidden="true" />;
}


/** An iOS push when `k` changes: the new screen slides in while a copy of the old one drifts 28% the other way and fades out. `i` gives the direction; a negative `i` means no slide.
    This needs no browser feature, so it runs the same on every phone Felt supports. */
export class SlidePane extends Component<{ k: string; i: number; children: ReactNode }> {
  el = createRef<HTMLDivElement>();
  getSnapshotBeforeUpdate(prev: { k: string; i: number }) {
    const el = this.el.current;
    if (!el || prev.k === this.props.k || prev.i < 0 || this.props.i < 0 || navMs() === 0) return null;
    return { copy: el.cloneNode(true) as HTMLElement, r: el.getBoundingClientRect(), c: takeCarry() };
  }
  componentDidUpdate(prev: { k: string; i: number }, _s: unknown, snap: { copy: HTMLElement; r: DOMRect; c: { x: number; p: number } | null } | null) {
    const el = this.el.current;
    if (!snap || !el) return;
    const { copy, r, c } = snap;
    // Reduced motion reduces the motion: the old screen fades out and the new one fades in, with no slide
    if (calm()) {
      copy.setAttribute('aria-hidden', 'true');
      copy.inert = true;
      copy.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:5;pointer-events:none`;
      copy.classList.add('felt-slide-out');
      (el.closest('dialog') ?? document.body).append(copy);
      copy.animate({ opacity: [1, 0] }, { duration: 150, easing: 'linear', fill: 'forwards' }).onfinish = () => copy.remove();
      window.setTimeout(() => copy.remove(), 300);
      el.animate({ opacity: [0, 1] }, { duration: 150, easing: 'linear' });
      return;
    }
    const by = (this.props.i > prev.i ? 1 : -1) * r.width;
    copy.classList.add('felt-slide-out');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:5;pointer-events:none`;
    // a sticky header in the copy stays where it was on screen
    copy.querySelectorAll<HTMLElement>('.felt-header').forEach((h) => { if (r.top < 0) h.style.transform = `translateY(${-r.top}px)`; });
    (el.closest('dialog') ?? document.body).append(copy);
    // the same ease-in-out as the chip roll, so the swipe and the roll move as one
    // after a swipe the slide carries on from where the finger let go (c): the old page leaves the way it was going, the new one follows it in
    const dur = c ? navMs() * Math.max(0.4, 1 - c.p) : navMs();
    const t = { duration: dur, easing: c ? 'cubic-bezier(0.33, 1, 0.68, 1)' : 'cubic-bezier(0.65, 0, 0.35, 1)' };
    const inFrom = c ? c.x + by : by;
    // the bars stay: only the content under the header swipes, and the header text cross-fades
    const body = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(':scope > .felt-page > :not(.felt-header)')];
    const outItems = body(copy), inItems = body(el);
    const whole = !outItems.length || !inItems.length;
    // the screens are see-through, so the old one fades out before the new one reaches it
    // the header band stays solid (it is the same band on both pages); only its content (title, view tabs) and the body fade
    const fades = (whole ? [copy] : [...outItems, ...copy.querySelectorAll<HTMLElement>('.felt-header > *')]);
    const fadeOut = fades.map((n) => {
      const cur = parseFloat(getComputedStyle(n).opacity) || 1;
      return n.animate({ opacity: [cur, 0] }, { duration: whole ? dur * 0.4 : dur * 0.5, easing: 'ease-out', fill: 'forwards' });
    });
    const outs = (whole ? [copy] : outItems).map((n) => n.animate({ translate: c ? [`${c.x}px 0`, `${Math.sign(c.x) * r.width}px 0`] : ['0 0', `${-by * 0.28}px 0`] }, t));
    outs[0].onfinish = outs[0].oncancel = () => copy.remove();
    void fadeOut;
    // a hidden tab holds back the finish event
    window.setTimeout(() => copy.remove(), dur + 100);
    el.classList.add('felt-slide-in');
    const over = () => el.classList.remove('felt-slide-in');
    window.setTimeout(over, dur);
    if (whole) el.animate({ transform: [`translateX(${inFrom}px)`, 'translateX(0)'] }, t);
    else {
      inItems.forEach((n) => n.animate({ transform: [`translateX(${inFrom}px)`, 'translateX(0)'] }, t));
      el.querySelectorAll<HTMLElement>('.felt-header > *').forEach((h) => h.animate({ opacity: [0, 1] }, { duration: navMs() * 0.5, easing: 'ease-out', delay: navMs() * 0.2, fill: 'backwards' }));
    }
  }
  render() { return <div ref={this.el} className="felt-slide">{this.props.children}</div>; }
}

/** The keypad or card picker inside the bottom dock. However it closes, a copy of it slides down behind the dock. */
export class DockPanel extends Component<{ k: string; children: ReactNode }> {
  el = createRef<HTMLDivElement>();
  getSnapshotBeforeUpdate(prev: { k: string }) {
    const el = this.el.current;
    if (!el || !prev.k || this.props.k || calm()) return null;
    return { copy: el.cloneNode(true) as HTMLElement, r: el.getBoundingClientRect(), host: el.parentElement?.parentElement ?? document.body };
  }
  componentDidUpdate(_p: unknown, _s: unknown, snap: { copy: HTMLElement; r: DOMRect; host: HTMLElement } | null) {
    if (!snap) return;
    const { copy, r, host } = snap;
    copy.classList.add('felt-dock-ghost');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:44;pointer-events:none`;
    host.append(copy);
    const by = window.innerHeight - r.top;
    const a = spring(copy, (p) => ({ translate: `0 ${by * p}px` }), SPRING.dock, { fill: 'forwards', near: 0.02 });
    if (a) a.onfinish = a.oncancel = () => copy.remove();
    window.setTimeout(() => copy.remove(), springCurve(SPRING.dock, 16, 0.02).ms + 100);
  }
  render() { return this.props.k ? <div ref={this.el} className="felt-dock-panel">{this.props.children}</div> : null; }
}

const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable]:not([contenteditable="false"])';
/** True while a text field inside the panel has focus (the keyboard is open): a swipe must not move the sheet then. */
const fieldFocused = (el: HTMLElement) => { const a = document.activeElement; return !!a && a !== el && el.contains(a) && a.matches(FIELD); };

/** Swipe down on a panel that opens from the bottom closes it, and the page behind does not scroll.
    Inside a scrolling panel the swipe scrolls first and closes only from the top. */
export function useSwipeDown(ref: RefObject<HTMLElement>, onClose: () => void, on = true) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let s: { x: number; y: number; t: number; drag: boolean } | null = null;
    const scroller = (from: EventTarget | null) => {
      for (let n = from as HTMLElement | null; n; n = n === el ? null : n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n;
      }
      return null;
    };
    const start = (e: TouchEvent) => {
      const free = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable], [data-drag-row], .felt-keypad, .felt-picker, .felt-hold, [data-noswipe]');
      s = e.touches.length === 1 && !free && !fieldFocused(el) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), drag: false } : null;
    };
    const move = (e: TouchEvent) => {
      if (!s) return;
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
      if (!s.drag) {
        const sc = scroller(e.target);
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { s = null; return; }
        if (dy > 8 && (!sc || sc.scrollTop <= 0)) { s.drag = true; s.y = e.touches[0].clientY; s.t = Date.now(); }
        else if (sc) { if (Math.abs(dy) > 8) s = null; return; }
        else { e.preventDefault(); return; }
      }
      e.preventDefault();
      el.style.translate = `0 ${Math.max(0, e.touches[0].clientY - s.y)}px`;
    };
    const end = (e: TouchEvent) => {
      if (!s?.drag) { s = null; return; }
      const dy = Math.max(0, e.changedTouches[0].clientY - s.y), speed = dy / Math.max(1, Date.now() - s.t);
      s = null;
      // the tap that ends a swipe must not press a button
      const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', stop, true), 350);
      if (dy > 90 || (dy > 24 && speed > 0.6)) { close.current(); if (el.tagName !== 'DIALOG') el.style.translate = ''; return; }
      spring(el, (p) => ({ translate: `0 ${dy * (1 - p)}px` }), SPRING.sheetDown);
      el.style.translate = '';
    };
    const cancel = () => { s = null; el.style.translate = ''; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
      el.style.translate = '';
    };
  }, [ref, on]);
}

/** A button for a commit, built like the Loading Button of interior.dev: three faces share one cell, so the width never
    changes. Press: the face turns to a spinner ("Saving") for a short wait, then a check and the word (Saved, Copied,
    Sent), then the label returns. The faces cross-fade on a spring with a 3 px lift and a little blur. `run` fires as the
    check shows, so the word is read before the page moves on. With `instant` it runs first and the spinner is skipped
    (copy, share and download need the press itself). If not `ready`, it runs at once with no faces: `run` then says what
    is missing. */
const PENDING_MS = 520, WORD_MS = 700, RUN_AFTER = 240;
export function WordButton({ word, run, ready = true, instant, pending = 'Saving', children, className, ...rest }: { word: string; run: () => void; ready?: boolean; instant?: boolean; pending?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'done'>('idle');
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const click = () => {
    if (!ready || calm()) { run(); return; }
    if (busy.current) return;
    busy.current = true;
    if (instant) { run(); setPhase('done'); later(() => { busy.current = false; setPhase('idle'); }, 900); return; }
    setPhase('pending');
    later(() => setPhase('done'), PENDING_MS);
    later(run, PENDING_MS + RUN_AFTER);
    later(() => { busy.current = false; setPhase('idle'); }, PENDING_MS + WORD_MS + RUN_AFTER);
  };
  return (
    <button type="button" data-press="commit" {...rest} className={`felt-lb ${className ?? ''}`} aria-busy={phase === 'pending'} aria-live="polite" onClick={click}>
      <span className="felt-lb-face" data-on={phase === 'idle'} aria-hidden={phase !== 'idle'}>{children}</span>
      <span className="felt-lb-face" data-on={phase === 'pending'} aria-hidden={phase !== 'pending'}><svg className="felt-lb-spin" width="12" height="12" viewBox="0 0 12 12"><path d="M6 1.5A4.5 4.5 0 1 1 1.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>{pending}</span>
      <span className="felt-lb-face" data-on={phase === 'done'} aria-hidden={phase !== 'done'}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{word}</span>
    </button>
  );
}

/** When the pulses come during a hold: closer and closer, so the finish can be felt coming. */
const HOLD_PULSES = [0, 500, 850, 1050];

/** Hold to confirm, built like the Hold to Confirm of interior.dev: one button fills left to right while it is held
    (`ms`, 1800 by default). Letting go early drains the fill in about 720 ms. At full, `onDone` runs once, the label
    changes to `doneLabel` and the fill stays. `onProgress` reports 0 to 1 so something else can follow the fill (a code
    loading in). Space and Enter hold too. A click with no press (a screen reader) confirms at once. */
export function HoldFill({ ms = 1800, label, doneLabel, onProgress, onDone }: { ms?: number; label: string; doneLabel: string; onProgress?: (v: number) => void; onDone: () => void }) {
  const fill = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const prog = useRef(0);
  const down = useRef(false);
  const done = useRef(false);
  const [finished, setFinished] = useState(false);
  const pulses = useRef<number[]>([]);
  const set = (v: number) => {
    prog.current = v;
    if (fill.current) fill.current.style.clipPath = `inset(0 ${(1 - v) * 100}% 0 0)`;
    onProgress?.(v);
  };
  const finish = () => {
    if (done.current) return;
    done.current = true; down.current = false; cancelAnimationFrame(raf.current);
    pulses.current.forEach(window.clearTimeout);
    set(1); setFinished(true); haptic(40); onDone();
  };
  const start = () => {
    if (done.current || down.current) return;
    down.current = true;
    if (fill.current) fill.current.style.transition = 'none';
    pulses.current = HOLD_PULSES.map((t) => window.setTimeout(() => haptic(8), t));
    const t0 = performance.now() - prog.current * ms;
    const step = (now: number) => {
      if (!down.current) return;
      const v = Math.min(1, (now - t0) / ms);
      set(v);
      if (v >= 1) finish(); else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  const stop = () => {
    if (!down.current || done.current) return;
    down.current = false; cancelAnimationFrame(raf.current);
    pulses.current.forEach(window.clearTimeout);
    // the fill drains faster than it filled
    if (fill.current) fill.current.style.transition = `clip-path ${Math.round(prog.current * 720)}ms cubic-bezier(0.23, 1, 0.32, 1)`;
    set(0);
  };
  useEffect(() => () => { cancelAnimationFrame(raf.current); pulses.current.forEach(window.clearTimeout); }, []);
  return (
    <button type="button" className="felt-holdfill" data-press="none" aria-disabled={finished}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }} onBlur={stop}
      onClick={(e) => { if (e.detail === 0 && !down.current) finish(); }}>
      <span className="felt-holdfill-face" data-on={!finished}>{label}</span>
      <span ref={fill} className="felt-holdfill-over" aria-hidden="true">
        <span className="felt-holdfill-face" data-on={!finished}>{label}</span>
        <span className="felt-holdfill-face" data-on={finished}><Icon name="check" size={14} stroke={2.4} /> {doneLabel}</span>
      </span>
    </button>
  );
}

/** A search that opens out of its icon, built like the Expanding Search of interior.dev. At rest it is one 40 px icon button
    on the right. A tap grows it into a field across the row on the disclose spring (stiffness 380, damping 38, mass 0.7);
    the field fades in 60 ms late. With text in it, a count and a clear button show. It folds back when it loses focus
    while empty. `count` is the number of matches. */
export function ExpandingSearch({ value, onChange, count, label }: { value: string; onChange: (v: string) => void; count?: number; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const wide = useRef(40);
  const width = useRef(40);
  const grow = (to: number) => {
    const el = shell.current;
    if (!el) return;
    const from = width.current;
    width.current = to;
    if (calm() || !el.animate) { el.style.width = `${to}px`; return; }
    physSpring(el, (p) => ({ width: `${from + (to - from) * p}px` }), DISCLOSE, { fill: 'forwards' });
    el.style.width = `${to}px`;
  };
  const expand = () => {
    if (open) return;
    wide.current = Math.max(40, root.current?.clientWidth ?? 240);
    setOpen(true);
    grow(wide.current);
    window.setTimeout(() => input.current?.focus(), 60);
  };
  const fold = () => { if (!open) return; setOpen(false); grow(40); };
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (open && shell.current) { wide.current = el.clientWidth; width.current = wide.current; shell.current.style.width = `${wide.current}px`; } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div ref={root} className="felt-search" role="search">
      <div ref={shell} className="felt-search-shell" data-open={open}>
        <button type="button" className="felt-search-trigger" aria-label={label} aria-expanded={open} data-press="none" onClick={expand} tabIndex={open ? -1 : 0}><Icon name="search" size={20} /></button>
        <input ref={input} className="felt-search-input" aria-label={label} placeholder="Search" value={value} onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (!value) fold(); }} onKeyDown={(e) => { if (e.key === 'Escape') { onChange(''); fold(); input.current?.blur(); } }} tabIndex={open ? 0 : -1}
          autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" />
        {open && value && count !== undefined && <span className="felt-search-count sat-mono" aria-live="polite">{count}</span>}
        <button type="button" className="felt-search-clear" aria-label="Clear search" data-press="none" data-on={!!value}
          onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(''); input.current?.focus(); }}><Icon name="close" size={12} stroke={2.6} /></button>
      </div>
    </div>
  );
}

/** A pill that says new items arrived out of view, built like the New Items Pill of interior.dev. It rises in from 10 px
    below (top anchor: above) at 94% size on a spring (stiffness 540, damping 34, mass 0.5) while it fades in over 160 ms,
    and it leaves in 160 ms. It shows only while `count` is above 0. A tap runs `onJump`. */
export function NewItemsPill({ count, noun, onJump, anchor = 'top' }: { count: number; noun: string; onJump: () => void; anchor?: 'top' | 'bottom' }) {
  const [mounted, setMounted] = useState(count > 0);
  const el = useRef<HTMLButtonElement>(null);
  const seen = useRef(false);
  const off = anchor === 'bottom' ? 10 : -10;
  useEffect(() => {
    if (count > 0 && !mounted) setMounted(true);
    if (count > 0 && mounted && !seen.current && el.current && !calm()) {
      seen.current = true;
      physSpring(el.current, (p) => ({ transform: `translateY(${off * (1 - p)}px) scale(${0.94 + 0.06 * p})` }), ARRIVE, { fill: 'backwards' });
      el.current.animate({ opacity: [0, 1] }, { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
    }
    if (count === 0 && mounted) {
      seen.current = false;
      const a = el.current?.animate?.({ opacity: [1, 0], transform: ['none', `translateY(${off * 0.5}px) scale(0.96)`] }, { duration: calm() ? 0 : 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
      const done = () => setMounted(false);
      if (a) { a.onfinish = done; window.setTimeout(done, 220); } else done();
    }
  }, [count, mounted, off]);
  if (!mounted) return null;
  return (
    <div className={`felt-newpill felt-newpill--${anchor}`}>
      <button ref={el} type="button" data-press="none" onClick={onJump}>
        <Icon name="back" size={14} stroke={2.2} />
        <span className="sat-num">{count || ''} new {noun}</span>
      </button>
      <span className="sat-sr-only" role="status">{count > 0 ? `${count} new ${noun}` : ''}</span>
    </div>
  );
}

/** The body of an accordion row, built like the Accordion of interior.dev: the height springs between 0 and the measured
    height (stiffness 480, damping 40, mass 0.6) while the text fades in over 180 ms (out over 140 ms). A closed body is
    inert, so nothing in it takes focus. With Reduced motion it jumps. */
export function Disclose({ open, children }: { open: boolean; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const w = wrap.current, i = inner.current;
    if (!w || !i) return;
    if (first.current) { first.current = false; w.style.height = open ? 'auto' : '0px'; i.style.opacity = open ? '1' : '0'; return; }
    const from = w.getBoundingClientRect().height, to = open ? i.scrollHeight : 0;
    w.getAnimations().forEach((a) => a.cancel());
    if (calm() || !w.animate) { w.style.height = open ? 'auto' : '0px'; i.style.opacity = open ? '1' : '0'; return; }
    w.style.height = `${to}px`;
    const a = physSpring(w, (p) => ({ height: `${from + (to - from) * p}px` }), ACCORDION, { fill: 'none' });
    if (a) a.onfinish = () => { if (open) w.style.height = 'auto'; };
    i.animate({ opacity: open ? [0, 1] : [1, 0] }, { duration: open ? 180 : 140, easing: open ? 'cubic-bezier(0.23, 1, 0.32, 1)' : 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  }, [open]);
  return (
    <div ref={wrap} className="felt-disclose" aria-hidden={!open} {...(open ? {} : { inert: '' })}>
      <div ref={inner} className="felt-disclose-in">{children}</div>
    </div>
  );
}

/** A bottom dock whose height changes rises and falls with the new content, so it pushes up instead of appearing.
    Uses `translate` because wide screens centre the dock with `transform`. */
export function useDockPush() {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const now = el.offsetHeight, d = now - last.current;
    if (last.current && d && !calm()) {
      spring(el, (p) => ({ translate: `0 ${d * (1 - p)}px` }), SPRING.dock);
    }
    last.current = now;
    // the page keeps room for the dock, so the last row can scroll clear of it
    el.parentElement?.style.setProperty('--felt-dock-h', `${now}px`);
  });
  return ref;
}

/** Kit sheet: a modal <dialog>, bottom sheet on phones, centred dialog on wider screens. */
/** A clip part way between two inset() clips with the same shape. */
export function mixClip(a: string, b: string, q: number): string {
  const na = a.match(/-?[\d.]+/g)!.map(Number), nb = b.match(/-?[\d.]+/g)!.map(Number);
  const v = na.map((x, i) => x + (nb[i] - x) * q);
  return `inset(${v[0]}px ${v[1]}px ${v[2]}px ${v[3]}px round ${v[4]}px)`;
}
/** A sideways swipe on a sheet: the sheet follows the finger, then leaves to that side past a third of its width or on
    a fast flick, else it springs back. A vertical swipe, a range, a drag row or a sideways scroller is left alone. */
function useSwipeSide(ref: RefObject<HTMLElement>, onSide: (side: -1 | 1) => void, on = true) {
  const out = useRef(onSide);
  out.current = onSide;
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let s: { x: number; y: number; t: number; mode: 'x' | 'y' | null } | null = null;
    const sideScroller = (from: EventTarget | null) => {
      for (let n = from as HTMLElement | null; n; n = n === el ? null : n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    const start = (e: TouchEvent) => {
      const free = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable], [data-drag-row]');
      s = e.touches.length === 1 && !free && !fieldFocused(el) && !sideScroller(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), mode: null } : null;
    };
    const move = (e: TouchEvent) => {
      if (!s || s.mode === 'y') return;
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
      if (!s.mode) {
        if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { s.mode = 'y'; return; }
        if (Math.abs(dx) > 8) { s.mode = 'x'; s.x = e.touches[0].clientX; s.t = Date.now(); } else return;
      }
      e.preventDefault();
      el.style.translate = `${e.touches[0].clientX - s.x}px 0px`;
    };
    const end = (e: TouchEvent) => {
      if (s?.mode !== 'x') { s = null; return; }
      const dx = e.changedTouches[0].clientX - s.x, speed = Math.abs(dx) / Math.max(1, Date.now() - s.t);
      s = null;
      // the tap that ends a swipe must not press a button
      const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', stop, true), 350);
      if (Math.abs(dx) > el.offsetWidth / 3 || (Math.abs(dx) > 24 && speed > 0.6)) { out.current(dx < 0 ? -1 : 1); return; }
      spring(el, (p) => ({ translate: `${dx * (1 - p)}px 0px` }), SPRING.sheetDown);
      el.style.translate = '';
    };
    const cancel = () => { s = null; el.style.translate = ''; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [ref, on]);
}

/** A sheet from the bottom. On a phone it always opens by sliding up. It leaves by sliding down (a swipe down, a tap
    outside or a button) or to the side it was swiped. `edge` keeps the coral edge of the card button. */
export function Sheet({ open, onClose, title, sub, children, edge, head, action, dismissRef }: {
  open: boolean; onClose: () => void; title?: string; sub?: string; children: ReactNode; edge?: boolean;
  /** The main button of the sheet (for example Save), top right and always in view. Leaving any other way does not save. */
  action?: ReactNode;
  /** Takes the place of the title, for example a name that can be edited in place. */
  head?: ReactNode;
  /** Gives the caller a way to close the sheet with its usual slide down, then run something once it has gone. */
  dismissRef?: { current: ((after?: () => void) => void) | null };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  /** Leaves the way it came in: down off the screen, then closes. */
  const leaving = useRef(false);
  const phone = () => window.innerWidth < 640;
  const fadeBackdrop = (d: HTMLDialogElement, from: number, to: number, ms: number) => {
    try { d.animate({ opacity: [from, to] }, { duration: ms, easing: 'linear', fill: 'forwards', pseudoElement: '::backdrop' }); } catch { /* an older phone: the backdrop does not fade */ }
  };
  const dismiss = (after?: () => void, side?: -1 | 1) => {
    const d = ref.current;
    if (leaving.current) return;
    if (!d?.animate) { closing.current(); after?.(); return; }
    if (calm()) {
      leaving.current = true;
      d.animate({ opacity: [1, 0] }, { duration: 150, easing: 'linear', fill: 'forwards' }).onfinish = () => { leaving.current = false; closing.current(); after?.(); };
      return;
    }
    leaving.current = true;
    fadeBackdrop(d, 1, 0, SPRING.sheetDown[0] * 1000);
    const done = () => { leaving.current = false; closing.current(); after?.(); };
    if (side) {
      // swiped sideways: it leaves to that side, from where the finger let go
      const fx = parseFloat(d.style.translate.split(' ')[0] ?? '') || 0, by = side * (window.innerWidth + d.offsetWidth) / 2 + 24 * side - fx;
      d.style.translate = '';
      spring(d, (p) => ({ translate: `${fx + by * Math.min(p, 1)}px 0px` }), SPRING.sheetDown, { fill: 'forwards', near: 0.02 })!.onfinish = done;
    } else if (phone()) {
      // a sheet with a swipe bar leaves down unless it was swiped sideways, however it was closed
      const from = parseFloat(d.style.translate.split(' ')[1] ?? '') || 0, by = d.offsetHeight + 24 - from;
      d.style.translate = '';
      spring(d, (p) => ({ translate: `0 ${from + by * Math.min(p, 1)}px` }), SPRING.sheetDown, { fill: 'forwards', near: 0.02 })!.onfinish = done;
    } else d.animate({ opacity: [1, 0], transform: ['scale(1)', 'scale(.97)'] }, { duration: 240, easing: DRAWER, fill: 'forwards' }).onfinish = done;
  };
  const dismissNow = useRef(dismiss);
  dismissNow.current = dismiss;
  if (dismissRef) dismissRef.current = dismiss;
  useSwipeDown(ref, () => dismissNow.current(), open);
  useSwipeSide(ref, (side) => dismissNow.current(undefined, side), open);
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    if (!d.open) {
      d.showModal();
      // every open info tip closes when a sheet opens, also a second sheet over a first
      window.dispatchEvent(new Event('felt-sheet-open'));
      // a name edited in place must not take the focus on open: the keyboard would rise every time
      const act = document.activeElement as HTMLElement | null;
      if (act?.matches('.felt-name-edit')) act.blur();
      // the page behind stays still while the sheet is open
      document.documentElement.classList.add('felt-sheet-open');
      if (d.animate && calm()) d.animate({ opacity: [0, 1] }, { duration: 150, easing: 'linear' });
      if (d.animate && !calm()) {
        fadeBackdrop(d, 0, 1, SPRING.sheetUp[0] * 1000);
        // on a phone a sheet always slides up from the bottom, the way it leaves, whatever opened it
        if (phone()) { const h = d.offsetHeight + 24; spring(d, (p) => ({ translate: `0 ${h * (1 - p)}px` }), SPRING.sheetUp); }
        else d.animate({ opacity: [0, 1], transform: ['scale(.97)', 'scale(1)'] }, { duration: 320, easing: DRAWER });
      }
    }
    const onCancel = (e: Event) => { e.preventDefault(); dismissNow.current(); };
    const onClick = (e: MouseEvent) => {
      const r = d.getBoundingClientRect();
      if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dismissNow.current();
    };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('click', onClick);
    return () => {
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('click', onClick);
      if (d.open) d.close();
      if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('felt-sheet-open');
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className={`sat-sheet sat-glass-2${edge ? ' felt-sheet--edge' : ''}`} aria-label={title}>
      <div className="sat-stack">
        <div className={`sat-split${action ? ' felt-sheet-head' : ''}`}>
          {head ?? <h2 className="sat-h3">{title}</h2>}
          {/* no Close button: the swipe bar, a swipe down, a sideways swipe and a tap outside close every sheet (owner, 11 Nov 2026) */}
          {action}
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
/** Info tip. The open body renders at page level (a portal on <body>, fixed position), so a glass card
    further down the page can never cover it: each card's blur starts its own layer. It opens below the
    button, or above when there is no room, inside the screen edges. It follows the button on scroll and
    closes once the button leaves the screen. */
let closeOpenTip: (() => void) | null = null;
const hasPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

export function Info({ title, children }: { title?: string; children: ReactNode }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = open || hover;
  // the tip stays mounted a moment after closing, so it can fade
  const [mounted, setMounted] = useState(false);
  const place = () => {
    const btn = wrap.current?.getBoundingClientRect();
    const b = body.current?.getBoundingClientRect();
    if (!btn || !b) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (btn.bottom < 0 || btn.top > vh) { setOpen(false); setHover(false); return; }
    const left = Math.max(8, Math.min(btn.left + btn.width / 2 - b.width / 2, vw - 8 - b.width));
    const below = btn.bottom + 8;
    const top = below + b.height > vh - 8 && btn.top - 8 - b.height > 8 ? btn.top - 8 - b.height : below;
    // an open sheet covers the page. A popover goes above it; without popover the tip sits inside the sheet.
    const host = hasPopover ? null : wrap.current?.closest('dialog')?.getBoundingClientRect();
    setPos(host ? { top: top - host.top, left: left - host.left } : { top, left });
  };
  useLayoutEffect(() => {
    if (!show) {
      if (!mounted) return;
      const el = body.current;
      if (!el?.animate || document.documentElement.hasAttribute('data-motion-off')) { setMounted(false); setPos(null); return; }
      // Reduced motion: a plain 150 ms fade, no travel
      const ms = calm() ? 150 : 120;
      el.animate(calm() ? { opacity: [1, 0] } : { opacity: [1, 0], scale: [1, 0.97] }, { duration: ms, easing: calm() ? 'linear' : 'ease-out', fill: 'forwards' });
      const t = window.setTimeout(() => { setMounted(false); setPos(null); }, ms);
      return () => window.clearTimeout(t);
    }
    setMounted(true);
    // one tip open at a time
    const close = () => { setOpen(false); setHover(false); };
    if (closeOpenTip && closeOpenTip !== close) closeOpenTip();
    closeOpenTip = close;
    return () => { if (closeOpenTip === close) closeOpenTip = null; };
  }, [show]);
  // once mounted: place it, then fade it in from the i
  useLayoutEffect(() => {
    if (!show || !mounted) return;
    place();
    const el = body.current, btn = wrap.current?.getBoundingClientRect();
    if (!el?.animate || !btn || calm()) return;
    const b = el.getBoundingClientRect();
    el.style.transformOrigin = `${btn.left + btn.width / 2 - b.left}px ${btn.top < b.top ? 0 : b.height}px`;
    el.animate({ opacity: [0, 1], scale: [0.95, 1] }, { duration: 200, easing: 'ease-out' });
  }, [show, mounted]);
  useEffect(() => {
    if (!show) return;
    const shut = () => { setOpen(false); setHover(false); };
    // capture-phase pointerdown on window: no handler can stop it. The tap goes on and presses what is under it.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || body.current?.contains(t)) return;
      shut();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
    const onScroll = () => place();
    // a sheet that opens (the page gets felt-sheet-open) and a route change take the tip away
    window.addEventListener('felt-sheet-open', shut);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('hashchange', shut);
    window.addEventListener('popstate', shut);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('felt-sheet-open', shut);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('hashchange', shut);
      window.removeEventListener('popstate', shut);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [show]);
  return (
    <span ref={wrap} className={`sat-tip ${open ? 'is-open' : ''}`} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(false); }}>
      <button type="button" className="sat-tip-btn" aria-expanded={open} aria-label={title ? `About ${title.toLowerCase()}` : 'More information'}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        {/* drawn, not typed: a letter i leans and sits right of centre in its circle */}
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><circle cx="5" cy="2.3" r="0.95" fill="currentColor" /><path d="M5 4.5v3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" /></svg>
      </button>
      {mounted && createPortal(
        <span ref={(e) => { body.current = e; if (e && hasPopover && !e.matches(':popover-open')) e.showPopover(); }} {...(hasPopover ? { popover: 'manual' } : {})} className="sat-tip-body felt-tip-float" role="tooltip" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>{children}</span>,
        (hasPopover ? null : wrap.current?.closest('dialog')) ?? document.body,
      )}
    </span>
  );
}

/** Info tip with the shared help copy. Each array entry is its own line. A `{ sub }` entry belongs to the line
    above it: it shows indented under that line, with a small marker. */
export function Help({ k }: { k: HelpKey }) {
  const t: string | readonly TipLine[] = HELP[k].text;
  return (
    <Info title={HELP[k].title}>
      {typeof t === 'string' ? t : t.map((x, i) => typeof x === 'string'
        ? <span key={i} className="felt-tip-line">{x}</span>
        : <span key={i} className="felt-tip-line felt-tip-sub">{x.sub}</span>)}
    </Info>
  );
}

/** Standing rule: a figure's source is shown only as a tip, never as text on the page. */
export function SourceTip({ children }: { children: ReactNode }) {
  return <Info title="Source">{children}</Info>;
}

/* ------------------------------- numeric text ------------------------------- */

/** A figure that changes by rolling, like SwiftUI numericText: only the digits that changed move. The old digit rolls out and
    the new one rolls in, upward when the number grows and downward when it falls (it counts down). Digits line up from the right,
    so 99 to 100 rolls three places. Reduce Motion changes it at once. */
export function NumericText({ value, className }: { value: string | number; className?: string }) {
  const text = String(value);
  const prev = useRef(text);
  const box = useRef<HTMLSpanElement>(null);
  const chars = [...text];
  useLayoutEffect(() => {
    const old = prev.current;
    prev.current = text;
    const el = box.current;
    if (old === text || !el || calm() || !el.animate) return;
    const n = (t: string) => parseFloat(t.replace(/[^0-9.\-]/g, ''));
    const a = n(old), b = n(text);
    // 1: the figure grew, so digits roll up; -1: it fell, so they roll down
    const dir = Number.isNaN(a) || Number.isNaN(b) || b >= a ? 1 : -1;
    const was = [...old];
    const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
    // digits that are gone (100 to 99): each rolls out where it stood, left of the first digit
    const gone = was.length - chars.length;
    const first = el.querySelector<HTMLElement>('.felt-num-c');
    if (gone > 0 && first) {
      const w = first.getBoundingClientRect().width;
      for (let k = 0; k < gone; k++) {
        const ghost = document.createElement('span');
        ghost.className = 'felt-num-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.textContent = was[k];
        ghost.style.left = `${(k - gone) * w}px`;
        el.appendChild(ghost);
        const out = ghost.animate({ transform: ['translateY(0)', `translateY(${-dir * 75}%)`], opacity: [1, 0], filter: ['blur(0)', 'blur(3px)'] }, { duration: 300, easing: ease, fill: 'both' });
        out.onfinish = out.oncancel = () => ghost.remove();
      }
    }
    el.querySelectorAll<HTMLElement>('.felt-num-c').forEach((cell, i) => {
      const right = chars.length - 1 - i;
      const o = was[was.length - 1 - right];
      if (o === chars[i]) return;
      // the last digit moves first, the rest follow
      const delay = right * 30;
      cell.animate({ transform: [`translateY(${dir * 75}%)`, 'translateY(0)'], opacity: [0, 1], filter: ['blur(3px)', 'blur(0)'] }, { duration: 380, delay, easing: ease, fill: 'backwards' });
      if (o === undefined) return;
      const ghost = document.createElement('span');
      ghost.className = 'felt-num-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = o;
      cell.appendChild(ghost);
      const out = ghost.animate({ transform: ['translateY(0)', `translateY(${-dir * 75}%)`], opacity: [1, 0], filter: ['blur(0)', 'blur(3px)'] }, { duration: 300, delay, easing: ease, fill: 'both' });
      out.onfinish = out.oncancel = () => ghost.remove();
    });
  }, [text]);
  return (
    <span ref={box} className={`felt-num ${className ?? ''}`}>
      <span className="felt-num-sr">{text}</span>
      {chars.map((c, i) => <span key={chars.length - 1 - i} className="felt-num-c" aria-hidden="true">{c}</span>)}
    </span>
  );
}

/* ------------------------------- captions and deltas ------------------------------- */

/** Uppercase caption with the qualifier in brackets keeping its case: POT (units). */
export function Caption({ children, q, tip, className }: { children: ReactNode; q?: string; tip?: HelpKey; className?: string }) {
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

/** The card look chosen on this phone (suit colours and picker row order). */
export function useCardLook(): CardLook {
  const saved = useStore((s) => s.settings.cards);
  return cleanLook(saved);
}

/** The card picker: 13 ranks by 4 suits, rows in the order this phone chose. */
/** The preferred rank order of the card picker, kept on this phone and read live. */
export function useRankOrder(): [RankOrder, (o: RankOrder) => void] {
  const o = useSyncExternalStore((cb) => { window.addEventListener('felt-rank-order', cb); return () => window.removeEventListener('felt-rank-order', cb); }, rankOrder);
  return [o, setRankOrder];
}

/** Caption "A > 2" or "2 > A" and a swap button that flips the order. Same control on the host's Settings and the player's. */
export function RankOrderSeg() {
  const [o, set] = useRankOrder();
  const text = o === 'high' ? 'A > 2' : '2 > A';
  return (
    <span className="felt-rankflip">
      <span className="felt-rankflip-cap sat-num" aria-live="polite">{text}</span>
      <button type="button" className="felt-rankflip-btn" aria-label={`Card picker order ${text}. Flip the order`} onClick={() => set(o === 'high' ? 'low' : 'high')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
      </button>
    </span>
  );
}

export function CardPickerGrid({ disabled, onPick }: { disabled: (c: Card) => boolean; onPick: (c: Card) => void }) {
  const look = useCardLook();
  const [order] = useRankOrder();
  return (
    <div className="felt-picker">
      {look.order.flatMap((su) => orderedRanks(order).map((r) => {
        const c = r + su;
        return (
          <button key={c} disabled={disabled(c)} onClick={() => onPick(c)} aria-label={c}>
            <span className="r" style={{ color: lookColor(look, su) }}>{r === 'T' ? '10' : r}</span>
            <span className="s" style={{ color: lookColor(look, su) }}>{SUIT_SYMBOL[su]}</span>
          </button>
        );
      }))}
    </div>
  );
}

export function PlayingCard({ card, size, target, onClick, placeholder }: {
  card?: Card | null; size?: 'sm' | 'lg'; target?: boolean; onClick?: () => void; placeholder?: string;
}) {
  const look = useCardLook();
  const removable = !!(onClick && card && target);
  const cls = `felt-card ${size ?? ''} ${card ? '' : 'empty'} ${target ? 'target' : ''}`;
  const inner = card ? (
    <>
      <span className="r" style={{ color: lookColor(look, card[1]) }}>{rankLabel(card)}</span>
      <span className="s" style={{ color: lookColor(look, card[1]) }}>{SUIT_SYMBOL[card[1]]}</span>
      {removable && <span className="felt-card-x" aria-hidden="true" />}
    </>
  ) : <span className="s">{placeholder ?? ''}</span>;
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick}
        aria-label={card ? `${cardText(card)}${removable ? ', tap again to remove' : ''}` : (placeholder ? `Empty ${placeholder} slot` : 'Empty slot')}>{inner}</button>
    );
  return <span className={cls} aria-label={card ? cardText(card) : undefined}>{inner}</span>;
}

/** A face-down card: the full Felt mark (two chips and the S) on ink, with one ice border. The mark is 40% of the card height
    (owner, 10 Nov 2026), sized in CSS from the card (.felt-cardback in styles.css), so it follows any card size. */
export function CardBack({ size }: { size?: 'sm' | 'lg' }) {
  return <span className={`felt-card felt-cardback ${size ?? ''}`} aria-hidden="true"><FeltMark full height={size === 'lg' ? 28 : size === 'sm' ? 12.4 : 16} /></span>;
}

/** One etched box split down the middle (Nil), or two face-down cards (Filled). */
export function CardPair({ filled, size = 'sm' }: { filled: boolean; size?: 'sm' | 'lg' }) {
  if (!filled) return <span className={`felt-cardsnil ${size}`} role="img" aria-label="Nil" />;
  return <span className="felt-cards" role="img" aria-label="Filled"><CardBack size={size} /><CardBack size={size} /></span>;
}

/** Cards just saved: they show face up as the page returns to the list, then each turns face down, one after the other. */
export function FlipDown({ cards, size = 'sm' }: { cards: Card[]; size?: 'sm' | 'lg' }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (calm()) return;
    ref.current?.querySelectorAll<HTMLElement>('.felt-flip-in').forEach((el, i) => {
      el.animate({ transform: ['rotateY(0deg)', 'rotateY(180deg)'] }, { duration: 420, delay: 160 + i * 70, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
    });
  }, []);
  if (calm()) return <CardPair filled size={size} />;
  return (
    <span className="felt-cards" ref={ref} role="img" aria-label="Filled">
      {cards.map((c) => (
        <span key={c} className="felt-flip"><span className="felt-flip-in"><span className="felt-flip-f"><PlayingCard card={c} size={size} /></span><span className="felt-flip-b"><CardBack size={size} /></span></span></span>
      ))}
    </span>
  );
}

export function Cards({ cards, size }: { cards: Card[]; size?: 'sm' | 'lg' }) {
  return <span className="felt-cards">{cards.map((c) => <PlayingCard key={c} card={c} size={size} />)}</span>;
}

export function Avatar({ name, size }: { name: string; size?: 'sm' }) {
  return <span className={`felt-avatar ${size ?? ''}`} aria-hidden="true">{initials(name)}</span>;
}

/** Kit switch: an on/off setting that applies at once. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <LiquidToggle plain on={on} onChange={onChange} label={label} width={52} />;
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

/** `countdown`: the toast stays that many seconds and the button counts them down ("Undo 5", "Undo 4"). */
type ToastAction = { label: string; run: () => void; countdown?: number };
let toastListener: ((msg: string, action?: ToastAction) => void) | null = null;
/** Short message at the bottom. With an action (for example Undo) it stays 5 seconds instead of 2.6. */
export function toast(msg: string, action?: ToastAction) { toastListener?.(msg, action); }

/** A closed game opens live again: Undo closes it again. Used where a closed game is picked from a list. */
export function reopenGame(g: { id: string; name: string }) {
  withUndo(`${g.name} reopened.`, () => useStore.getState().reopenGame(g.id));
  // a hash change, not a function call, so the page change keeps its slide
  window.location.hash = `#/game/${g.id}`;
}

/** Runs a change at once and offers Undo for 5 seconds. Undo puts the games and groups back as they were. */
export function withUndo(msg: string, run: () => void) {
  const { games, groups } = useStore.getState();
  run();
  toast(msg, { label: 'Undo', run: () => useStore.setState({ games, groups }) });
}

/** Bottom elements a message must stay clear of. Each one counts only while it shows. The recorder dock (keypad, picker) and the
    floating card button are in it. */
const BOTTOM_ITEMS = '.sat-bottombar, .felt-nav, .felt-ng[data-open="true"], .felt-rec-dock, .felt-fab, .felt-logbtn';
/** Measures the top edge of what sits at the bottom of the screen (or the keyboard, whichever is higher) and sets one CSS
    variable, --felt-bottom-stack, in px from the bottom of the screen. While a sheet is open only the keyboard counts: the
    messages sit at the sheet bottom. Measured on each message, on resize, on keyboard changes and every 250 ms while one shows. */
function useBottomStack(active: boolean, listKey: unknown) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!active) return;
    const measure = () => {
      const vh = window.innerHeight;
      const kb = parseFloat(root.style.getPropertyValue('--felt-kb')) || 0;
      let stack = kb;
      if (!document.querySelector('dialog[open]')) {
        document.querySelectorAll<HTMLElement>(BOTTOM_ITEMS).forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width < 1 || r.height < 1 || r.top < vh * 0.3 || r.top >= vh) return;
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
          stack = Math.max(stack, vh - r.top);
        });
      }
      root.style.setProperty('--felt-bottom-stack', `${Math.round(stack)}px`);
    };
    measure();
    const i = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { window.clearInterval(i); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [active, listKey]);
}

let toastSeq = 0;
interface ToastItem { id: number; msg: string; action?: ToastAction; until?: number }

/** Messages at the bottom. Settings, Messages: a new message replaces the one showing (the old one slides away as the new one
    rises), or stacks above it (up to 3). Each message keeps its own timer and its own way out. */
export function ToastHost() {
  const mode = useStore((s) => s.settings.toastMode ?? 'replace');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [list, setList] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  /** Toasts already fading out. A new message in Replace mode drops these at once, so no more than one fades beside the new one. */
  const leavingIds = useRef(new Set<number>());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!list.some((t) => t.until)) return;
    const i = window.setInterval(() => tick((x) => x + 1), 250);
    return () => window.clearInterval(i);
  }, [list]);
  const drop = (id: number) => { window.clearTimeout(timers.current.get(id)); timers.current.delete(id); leavingIds.current.delete(id); setList((l) => l.filter((t) => t.id !== id)); };
  /** Slides down and fades; only this message is removed when it has gone. */
  const leave = (id: number) => {
    window.clearTimeout(timers.current.get(id));
    leavingIds.current.add(id);
    const e = document.querySelector<HTMLElement>(`[data-toast="${id}"]`);
    if (!e?.animate || calm()) { drop(id); return; }
    e.getAnimations().forEach((a) => a.cancel());
    e.animate({ translate: ['0 0', '0 60px'], opacity: [1, 0] }, { duration: 220, easing: DRAWER, fill: 'forwards' }).onfinish = () => drop(id);
    // a hidden page holds back the finish event
    timers.current.set(id, window.setTimeout(() => drop(id), 320));
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    toastListener = (msg, action) => {
      const id = ++toastSeq;
      const ms = action?.countdown ? action.countdown * 1000 : action ? 5000 : 2600;
      // Replace: older messages fade out; one already fading is removed at once, so the stack never holds more than two
      if (modeRef.current === 'replace') timers.current.forEach((_, old) => (leavingIds.current.has(old) ? drop(old) : leaveRef.current(old)));
      setList((l) => [...(modeRef.current === 'stack' ? l.slice(-2) : l), { id, msg, action, until: action?.countdown ? Date.now() + ms : undefined }]);
      timers.current.set(id, window.setTimeout(() => leaveRef.current(id), ms));
    };
    return () => { toastListener = null; };
  }, []);
  // the space the messages leave at the bottom, measured from the real elements (--felt-bottom-stack)
  useBottomStack(list.length > 0, list);
  // each new message arrives with a spring: up from below the screen edge (inside a sheet, up from the sheet edge)
  const seen = useRef(new Set<number>());
  useLayoutEffect(() => {
    for (const t of list) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      const e = document.querySelector<HTMLElement>(`[data-toast="${t.id}"]`);
      if (e && !calm()) spring(e, (p) => ({ translate: `0 ${48 * (1 - p)}px`, opacity: String(Math.min(1, p * 2)) }), SPRING.toast);
    }
  }, [list]);
  if (!list.length) return null;
  // An open sheet sits in the top layer and covers everything else. A popover goes in the top layer after it.
  const sheet = hasPopover ? null : [...document.querySelectorAll('dialog[open]')].pop();
  const el = (
    <div className={`felt-toasts${sheet ? ' felt-toasts--sheet' : ''}`} {...(hasPopover ? { popover: 'manual' } : {})}
      ref={(e) => { if (e && hasPopover && !e.matches(':popover-open')) e.showPopover(); }}>
      {list.map((t) => (
        <div key={t.id} data-toast={t.id} className="felt-toast sat-glass-2 sat-small" role="status">
          {t.msg}
          {t.action && <button type="button" className="felt-toast-act" onClick={() => { t.action!.run(); leave(t.id); }}>{t.action.label}{t.until ? <span className="sat-num"> {Math.max(1, Math.ceil((t.until - Date.now()) / 1000))}</span> : null}</button>}
        </div>
      ))}
    </div>
  );
  return sheet ? createPortal(el, sheet) : el;
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

/* ------------------------------- status light ------------------------------- */

export type Light = 'playing' | 'away' | 'out';

/** Small traffic light for the top right of a player card.
    The lamp: green = playing (clock runs), tap for faded orange = away (clock paused), tap again for green.
    The red cross clocks the player out. When out, the lamp shows red and a tap brings them back. */
export function StatusLight({ value, onChange, name, outLabel = 'Clock out' }: {
  value: Light; onChange: (v: Light) => void; name: string; outLabel?: string;
}) {
  const label = value === 'playing' ? 'Playing. Tap to pause' : value === 'away' ? 'Away, clock paused. Tap to resume' : 'Out. Tap to bring back';
  return (
    <span className="felt-light">
      <button type="button" className={`felt-lamp felt-lamp--${value}`} aria-label={`${name}: ${label}`} title={label}
        onClick={() => onChange(value === 'playing' ? 'away' : 'playing')} />
      {value !== 'out' && (
        <button type="button" className="felt-lamp-out" aria-label={`${outLabel} ${name}`} title={outLabel} onClick={() => onChange('out')}>
          <Icon name="close" size={12} stroke={2.6} />
        </button>
      )}
    </span>
  );
}
