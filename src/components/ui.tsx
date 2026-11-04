import { Component, createRef, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cardText, cleanLook, lookColor, rankLabel, RANKS, SUIT_SYMBOL } from '../lib/cards';
import { initials } from '../lib/format';
import { haptic } from '../lib/haptics';
import { DRAWER, SPRING, calm, recentPress, spring, springCurve } from '../lib/motion';
import { HELP, type HelpKey } from '../lib/help';
import type { Card, CardLook } from '../types';
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
  link: <><path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" /><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" /></>,
  power: <><path d="M12 3v9" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4c4-2 7 2 14 0v9c-7 2-10-2-14 0" /></>,
  cardsadd: <><rect x="4" y="6.5" width="9" height="13" rx="1.6" transform="rotate(-14 8.5 13)" /><rect x="10" y="5.5" width="9" height="13" rx="1.6" transform="rotate(10 14.5 12)" fill="var(--felt-fab-bg, none)" /><path d="M14.5 9.5v5M12 12h5" transform="rotate(10 14.5 12)" /></>,
  eyedrop: <><path d="m14.5 6.5 3 3" /><path d="M16 5l1.6-1.6a2 2 0 0 1 2.9 2.9L19 8l.8.8-1.6 1.6L13.6 5.8 15.2 4.2z" /><path d="M14.5 7.5 5.6 16.4 5 19l2.6-.6 8.9-8.9" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
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
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.9 19.1 1.4-1.4" /><path d="m17.7 6.3 1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
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
export function FeltMark({ height = 32 }: { height?: number }) {
  return (
    <svg className="sat-mark" style={{ ['--sat-mark-h' as string]: `${height}px` }} viewBox="-2 -2 68 104" aria-hidden="true">
      <path d="M53.75 36.14 A24 24 0 1 0 32 50 A24 24 0 1 1 10.25 63.86" />
      <path d="M45.59 32.34 A15 15 0 1 0 32 41" />
      <path d="M32 59 A15 15 0 1 1 18.41 67.66" />
    </svg>
  );
}

/* ------------------------------- header ------------------------------- */

/** Sticky glass header (kit: .sat-header > .sat-header-bar.sat-glass). */
export function Header({ title, sub, back, right, brand, children }: {
  title?: string; sub?: string; back?: () => void; right?: ReactNode; brand?: boolean; children?: ReactNode;
}) {
  return (
    <header className={back ? 'sat-header felt-header' : 'sat-header felt-header felt-header--tab'}>
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
      {children}
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

const SLIDE_MS = 320;

/** An iOS push when `k` changes: the new screen slides in while a copy of the old one drifts 28% the other way and fades out. `i` gives the direction; a negative `i` means no slide.
    This needs no browser feature, so it runs the same on every phone Felt supports. */
export class SlidePane extends Component<{ k: string; i: number; children: ReactNode }> {
  el = createRef<HTMLDivElement>();
  getSnapshotBeforeUpdate(prev: { k: string; i: number }) {
    const el = this.el.current;
    if (!el || prev.k === this.props.k || prev.i < 0 || this.props.i < 0 || calm()) return null;
    return { copy: el.cloneNode(true) as HTMLElement, r: el.getBoundingClientRect() };
  }
  componentDidUpdate(prev: { k: string; i: number }, _s: unknown, snap: { copy: HTMLElement; r: DOMRect } | null) {
    const el = this.el.current;
    if (!snap || !el) return;
    const { copy, r } = snap;
    const by = (this.props.i > prev.i ? 1 : -1) * r.width;
    copy.classList.add('felt-slide-out');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:5;pointer-events:none`;
    // a sticky header in the copy stays where it was on screen
    copy.querySelectorAll<HTMLElement>('.felt-header').forEach((h) => { if (r.top < 0) h.style.transform = `translateY(${-r.top}px)`; });
    (el.closest('dialog') ?? document.body).append(copy);
    const t = { duration: SLIDE_MS, easing: DRAWER };
    // the screens are see-through, so the old one fades out before the new one reaches it
    copy.animate({ opacity: [1, 0] }, { duration: SLIDE_MS * 0.4, easing: 'ease-out', fill: 'forwards' });
    const out = copy.animate({ translate: ['0 0', `${-by * 0.28}px 0`] }, t);
    out.onfinish = out.oncancel = () => copy.remove();
    // a hidden tab holds back the finish event
    window.setTimeout(() => copy.remove(), SLIDE_MS + 100);
    el.classList.add('felt-slide-in');
    const over = () => el.classList.remove('felt-slide-in');
    window.setTimeout(over, SLIDE_MS);
    el.animate({ transform: [`translateX(${by}px)`, 'translateX(0)'] }, t);
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
      const free = (e.target as HTMLElement).closest?.('input[type="range"], input[type="color"], textarea, [data-drag-row]');
      s = e.touches.length === 1 && !free ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), drag: false } : null;
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

/** A button whose word changes for a moment to confirm the press: Saved, Copied, Sent. A commit runs just after the
    word shows, so it can be read before the page moves on. With `instant` it runs first. If not `ready`, it runs at
    once with no word: `run` then says what is missing. */
export function WordButton({ word, run, ready = true, instant, children, ...rest }: { word: string; run: () => void; ready?: boolean; instant?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const [said, setSaid] = useState(false);
  const busy = useRef(false);
  const ref = useRef<HTMLButtonElement>(null);
  const click = () => {
    if (!ready || calm()) { run(); return; }
    if (busy.current) return;
    busy.current = true;
    if (instant) run();
    setSaid(true);
    if (ref.current) spring(ref.current, (p) => ({ opacity: String(0.2 + 0.8 * Math.min(p, 1)), scale: String(0.94 + 0.06 * p) }), SPRING.log);
    if (!instant) window.setTimeout(run, 360);
    window.setTimeout(() => { busy.current = false; setSaid(false); }, 900);
  };
  return <button type="button" data-press="commit" {...rest} ref={ref} onClick={click}>{said ? word : children}</button>;
}

/** When the pulses come during a hold: closer and closer, so the finish can be felt coming. */
const HOLD_PULSES = [0, 500, 850, 1050];

/** A button for an action that cannot be undone. The thumb covers the button, so the feedback is felt, not seen:
    the phone pulses faster while the press lasts, then gives a strong pulse when the action runs. A short tap only says so. */
export function HoldButton({ ms = 1200, label, hint, onDone, children }: { ms?: number; label: string; hint: string; onDone: () => void; children: ReactNode }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pulses = useRef<number[]>([]);
  const at = useRef(0);
  // iOS may refuse a pulse from a timer during the press, so the finger coming up after the action gives the sure one
  const finished = useRef(false);
  const release = (tap: boolean) => {
    window.clearTimeout(timer.current);
    pulses.current.forEach(window.clearTimeout);
    if (finished.current) { finished.current = false; if (tap) haptic(40); return; }
    if (!at.current) return;
    if (tap && Date.now() - at.current < 350) toast(hint);
    at.current = 0;
    setHolding(false);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); pulses.current.forEach(window.clearTimeout); }, []);
  return (
    <button type="button" className={`sat-btn sat-btn--ghost sat-iconbtn felt-hold ${holding ? 'is-holding' : ''}`} aria-label={label}
      onPointerDown={() => {
        at.current = Date.now();
        setHolding(true);
        pulses.current = HOLD_PULSES.map((t) => window.setTimeout(() => haptic(8), t));
        timer.current = window.setTimeout(() => { at.current = 0; finished.current = true; setHolding(false); haptic(40); onDone(); }, ms);
      }}
      onPointerUp={() => release(true)} onPointerLeave={() => release(false)} onPointerCancel={() => release(false)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0) onDone(); }}>
      {children}
    </button>
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
function mixClip(a: string, b: string, q: number): string {
  const na = a.match(/-?[\d.]+/g)!.map(Number), nb = b.match(/-?[\d.]+/g)!.map(Number);
  const v = na.map((x, i) => x + (nb[i] - x) * q);
  return `inset(${v[0]}px ${v[1]}px ${v[2]}px ${v[3]}px round ${v[4]}px)`;
}
/** A layer in the colour of the button over the sheet, fading in or out. Buttons with no fill leave nothing. */
function morphFill(d: HTMLElement, b: HTMLElement, opacity: [number, number], delay: number) {
  const bg = getComputedStyle(b).backgroundColor;
  if (!bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg)) return;
  const f = document.createElement('span');
  f.className = 'felt-sheet-fill';
  f.style.background = bg;
  d.append(f);
  f.animate({ opacity }, { duration: 200, delay, easing: 'ease-out', fill: 'both' }).onfinish = () => { if (opacity[1] === 0) f.remove(); };
}

/** Where a sheet sits against the button that opened it: the clip that shows only the button, and the shift up
    when the button sits above the sheet. */
function clipFrom(d: HTMLElement, b: DOMRect, radius: number) {
  const r = d.getBoundingClientRect();
  const dy = Math.min(0, b.top - r.top);
  const ins = [b.top - r.top - dy, r.right - b.right, r.bottom + dy - b.bottom, b.left - r.left].map((v) => Math.max(0, v));
  return { dy, clip: `inset(${ins[0]}px ${ins[1]}px ${ins[2]}px ${ins[3]}px round ${radius}px)` };
}
const FULL_CLIP = 'inset(0px 0px 0px 0px round 24px)';

/** A sheet from the bottom. Opened by a press, it pulls out of the button that opened it, in that button's colour,
    and goes back into it on Close. A swipe down slides it away. `edge` keeps the coral edge of the card button. */
export function Sheet({ open, onClose, title, sub, children, edge, head }: {
  open: boolean; onClose: () => void; title?: string; sub?: string; children: ReactNode; edge?: boolean;
  /** Takes the place of the title, for example a name that can be edited in place. */
  head?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /** The button that opened the sheet, while it is on the page. */
  const origin = useRef<HTMLElement | null>(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  /** Leaves the way it came in: down off the screen, then closes. */
  const leaving = useRef(false);
  const phone = () => window.innerWidth < 640;
  const fadeBackdrop = (d: HTMLDialogElement, from: number, to: number, ms: number) => {
    try { d.animate({ opacity: [from, to] }, { duration: ms, easing: 'linear', fill: 'forwards', pseudoElement: '::backdrop' }); } catch { /* an older phone: the backdrop does not fade */ }
  };
  const dismiss = () => {
    const d = ref.current;
    if (leaving.current) return;
    if (!d?.animate || calm()) { closing.current(); return; }
    leaving.current = true;
    fadeBackdrop(d, 1, 0, 300);
    const done = () => { leaving.current = false; closing.current(); };
    const back = origin.current, swiped = !!d.style.translate;
    const br = back?.isConnected ? back.getBoundingClientRect() : null;
    if (phone() && !swiped && back && br && br.width > 0 && br.bottom > 0 && br.top < window.innerHeight) {
      // back into the button: the content goes, the button colour comes back, the sheet closes around the button
      const { dy, clip } = clipFrom(d, br, parseFloat(getComputedStyle(back).borderTopLeftRadius) || 12);
      d.firstElementChild?.animate({ opacity: [1, 0] }, { duration: 120, easing: 'ease-out', fill: 'forwards' });
      morphFill(d, back, [0, 1], 60);
      spring(d, (p) => { const q = Math.min(p, 1); return { clipPath: q < 1 ? mixClip(FULL_CLIP, clip, q) : clip, translate: `0 ${dy * q}px` }; }, SPRING.grow, { fill: 'forwards', near: 0.02 })!.onfinish = done;
      return;
    }
    if (phone()) {
      const from = parseFloat(d.style.translate.split(' ')[1] ?? '') || 0, by = d.offsetHeight + 24 - from;
      d.style.translate = '';
      spring(d, (p) => ({ translate: `0 ${from + by * Math.min(p, 1)}px` }), SPRING.sheetDown, { fill: 'forwards', near: 0.02 })!.onfinish = done;
    } else d.animate({ opacity: [1, 0], transform: ['scale(1)', 'scale(.97)'] }, { duration: 240, easing: DRAWER, fill: 'forwards' }).onfinish = done;
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useSwipeDown(ref, () => dismissRef.current(), open);
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    if (!d.open) {
      d.showModal();
      // a name edited in place must not take the focus on open: the keyboard would rise every time
      const act = document.activeElement as HTMLElement | null;
      if (act?.matches('.felt-name-edit')) act.blur();
      // the page behind stays still while the sheet is open
      document.documentElement.classList.add('felt-sheet-open');
      const from = recentPress();
      origin.current = from?.el ?? null;
      if (d.animate && !calm()) {
        fadeBackdrop(d, 0, 1, springCurve(SPRING.sheetUp).ms);
        if (phone() && from) {
          // out of the button: the sheet opens around it in the button colour, then its content shows
          const { dy, clip } = clipFrom(d, from.rect, parseFloat(getComputedStyle(from.el).borderTopLeftRadius) || 12);
          spring(d, (p) => { const q = Math.min(p, 1); return { clipPath: q < 1 ? mixClip(clip, FULL_CLIP, q) : 'none', translate: `0 ${dy * (1 - q)}px` }; }, SPRING.grow, { fill: 'backwards', near: 0.02 });
          morphFill(d, from.el, [1, 0], 90);
          d.firstElementChild?.animate({ opacity: [0, 1] }, { duration: 200, delay: 110, easing: 'ease-out', fill: 'backwards' });
        } else if (phone()) { const h = d.offsetHeight + 24; spring(d, (p) => ({ translate: `0 ${h * (1 - p)}px` }), SPRING.sheetUp); }
        else d.animate({ opacity: [0, 1], transform: ['scale(.97)', 'scale(1)'] }, { duration: 320, easing: DRAWER });
      }
    }
    const onCancel = (e: Event) => { e.preventDefault(); dismissRef.current(); };
    const onClick = (e: MouseEvent) => {
      const r = d.getBoundingClientRect();
      if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dismissRef.current();
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
        <div className="sat-split">
          {head ?? <h2 className="sat-h3">{title}</h2>}
          <button className="sat-btn sat-btn--sm felt-btn-raised" onClick={dismiss}>Close</button>
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
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
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
      if (!el?.animate || calm()) { setMounted(false); setPos(null); return; }
      el.animate({ opacity: [1, 0], scale: [1, 0.97] }, { duration: 120, easing: 'ease-out', fill: 'forwards' });
      const t = window.setTimeout(() => { setMounted(false); setPos(null); }, 120);
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
    el.animate({ opacity: [0, 1], scale: [0.95, 1] }, { duration: 150, easing: 'ease-out' });
  }, [show, mounted]);
  useEffect(() => {
    if (!show) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setHover(false); } };
    const onScroll = () => place();
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); };
  }, [show]);
  return (
    <span ref={wrap} className={`sat-tip ${open ? 'is-open' : ''}`} onMouseEnter={() => fine && setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" className="sat-tip-btn" aria-expanded={open} aria-label={title ? `About ${title.toLowerCase()}` : 'More information'}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>i</button>
      {mounted && createPortal(
        <span ref={(e) => { body.current = e; if (e && hasPopover && !e.matches(':popover-open')) e.showPopover(); }} {...(hasPopover ? { popover: 'manual' } : {})} className="sat-tip-body felt-tip-float" role="tooltip" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>{children}</span>,
        (hasPopover ? null : wrap.current?.closest('dialog')) ?? document.body,
      )}
    </span>
  );
}

/** Info tip with the shared help copy. Each array entry is its own line. */
export function Help({ k }: { k: HelpKey }) {
  const t = HELP[k].text;
  return <Info title={HELP[k].title}>{typeof t === 'string' ? t : t.map((x, i) => <span key={i} className="felt-tip-line">{x}</span>)}</Info>;
}

/** Standing rule: a figure's source is shown only as a tip, never as text on the page. */
export function SourceTip({ children }: { children: ReactNode }) {
  return <Info title="Source">{children}</Info>;
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
export function CardPickerGrid({ disabled, onPick }: { disabled: (c: Card) => boolean; onPick: (c: Card) => void }) {
  const look = useCardLook();
  return (
    <div className="felt-picker">
      {look.order.flatMap((su) => RANKS.map((r) => {
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
        aria-label={card ? `${cardText(card)}${removable ? ', tap again to remove' : ''}` : `Empty ${placeholder ?? ''} slot`}>{inner}</button>
    );
  return <span className={cls} aria-label={card ? cardText(card) : undefined}>{inner}</span>;
}

/** A face-down card: the blue S on ink, with one ice border. The S is 20% of the card height (70, 40, 31 px). */
export function CardBack({ size }: { size?: 'sm' | 'lg' }) {
  return <span className={`felt-card felt-cardback ${size ?? ''}`} aria-hidden="true"><FeltMark height={size === 'lg' ? 14 : size === 'sm' ? 6.2 : 8} /></span>;
}

/** One etched box split down the middle (Nil), or two face-down cards (Filled). */
export function CardPair({ filled, size = 'sm' }: { filled: boolean; size?: 'sm' | 'lg' }) {
  if (!filled) return <span className={`felt-cardsnil ${size}`} role="img" aria-label="Nil" />;
  return <span className="felt-cards" role="img" aria-label="Filled"><CardBack size={size} /><CardBack size={size} /></span>;
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

/** `countdown`: the toast stays that many seconds and the button counts them down ("Undo 5", "Undo 4"). */
type ToastAction = { label: string; run: () => void; countdown?: number };
let toastListener: ((msg: string, action?: ToastAction) => void) | null = null;
/** Short message at the bottom. With an action (for example Undo) it stays 5 seconds instead of 2.6. */
export function toast(msg: string, action?: ToastAction) { toastListener?.(msg, action); }

/** Runs a change at once and offers Undo for 5 seconds. Undo puts the games and groups back as they were. */
export function withUndo(msg: string, run: () => void) {
  const { games, groups } = useStore.getState();
  run();
  toast(msg, { label: 'Undo', run: () => useStore.setState({ games, groups }) });
}

export function ToastHost() {
  const [t, setT] = useState<{ msg: string; action?: ToastAction; until?: number } | null>(null);
  const el2 = useRef<HTMLDivElement | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!t?.until) return;
    const i = window.setInterval(() => tick((x) => x + 1), 250);
    return () => window.clearInterval(i);
  }, [t]);
  // rises with a spring, falls the same way out
  const leave = () => {
    const e = el2.current;
    if (!e?.animate || calm()) { setT(null); return; }
    e.animate({ translate: ['0 0', '0 60px'], opacity: [1, 0] }, { duration: 220, easing: DRAWER, fill: 'forwards' }).onfinish = () => setT(null);
  };
  useEffect(() => {
    let timer: number | undefined;
    toastListener = (msg, action) => {
      const ms = action?.countdown ? action.countdown * 1000 : action ? 5000 : 2600;
      setT({ msg, action, until: action?.countdown ? Date.now() + ms : undefined });
      window.clearTimeout(timer);
      timer = window.setTimeout(leave, ms);
    };
    return () => { toastListener = null; };
  }, []);
  useLayoutEffect(() => {
    if (t && el2.current && !calm()) spring(el2.current, (p) => ({ translate: `0 ${40 * (1 - p)}px`, opacity: String(Math.min(1, p * 2)) }), SPRING.toast);
  }, [t]);
  if (!t) return null;
  // An open sheet sits in the top layer and covers everything else. A popover goes in the top layer after it.
  const sheet = hasPopover ? null : [...document.querySelectorAll('dialog[open]')].pop();
  const el = (
    <div className={`felt-toast sat-glass-2 sat-small${sheet ? ' felt-toast--sheet' : ''}`} role="status" {...(hasPopover ? { popover: 'manual' } : {})}
      ref={(e) => { el2.current = e; if (e && hasPopover && !e.matches(':popover-open')) e.showPopover(); }}>
      {t.msg}
      {t.action && <button type="button" className="felt-toast-act" onClick={() => { t.action!.run(); leave(); }}>{t.action.label}{t.until ? <span className="sat-num"> {Math.max(1, Math.ceil((t.until - Date.now()) / 1000))}</span> : null}</button>}
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
