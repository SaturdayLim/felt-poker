import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { haptic } from '../lib/haptics';

/* Drag to reorder. A touch must hold still on the grip (or press hard) before the row lifts, so a swipe that
   starts on a grip scrolls the page. While dragging, the row follows the finger, the others slide aside, and a
   slot marks where the row will land. The new order saves after the row settles into the slot. */

const HOLD_MS = 280, SETTLE_MS = 450, SLOP = 8;

interface Drag<T> { id: T; from: number; to: number; dy: number; settling: boolean }

export function useDragList<T>(ids: T[], onDrop: (order: T[]) => void) {
  const [d, setD] = useState<Drag<T> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const rows = useRef<{ top: number; h: number }[]>([]);
  const armed = useRef<{ x: number; y: number; timer?: number; id: T; pid: number; el: Element } | null>(null);
  const startY = useRef(0);
  const live = useRef(false);

  // once a row is lifted the finger drags it: the page must not scroll (touch-action stays pan-y so that a swipe can)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (live.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const disarm = () => { if (armed.current) window.clearTimeout(armed.current.timer); armed.current = null; };
  const lift = () => {
    const a = armed.current;
    if (!a || !wrap.current) return;
    const kids = [...wrap.current.querySelectorAll<HTMLElement>(':scope > [data-drag-row]')];
    rows.current = kids.map((k) => ({ top: k.offsetTop, h: k.offsetHeight }));
    const from = ids.indexOf(a.id);
    try { a.el.setPointerCapture(a.pid); } catch { /* the pointer has gone */ }
    startY.current = a.y;
    live.current = true;
    haptic();
    window.clearTimeout(a.timer);
    armed.current = null;
    setD({ id: a.id, from, to: from, dy: 0, settling: false });
  };
  const slotTop = (from: number, to: number) => (to > from ? rows.current[to].top + rows.current[to].h - rows.current[from].h : rows.current[to].top);
  const finish = (cancel: boolean) => {
    disarm();
    if (!d || d.settling) return;
    const to = cancel ? d.from : d.to;
    live.current = false;
    setD({ ...d, to, dy: slotTop(d.from, to) - rows.current[d.from].top, settling: true });
    window.setTimeout(() => {
      if (to !== d.from) { const o = ids.filter((x) => x !== d.id); o.splice(to, 0, d.id); onDrop(o); }
      setD(null);
    }, SETTLE_MS);
  };

  const grip = (id: T) => ({
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (d) return;
      armed.current = { x: e.clientX, y: e.clientY, id, pid: e.pointerId, el: e.currentTarget };
      if (e.pointerType === 'mouse') lift();
      else armed.current.timer = window.setTimeout(lift, HOLD_MS);
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const a = armed.current;
      if (a) {
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > SLOP) disarm();
        else if (e.pressure >= 0.7) lift();
        return;
      }
      if (!d || d.settling || d.id !== id) return;
      const dy = e.clientY - startY.current;
      const me = rows.current[d.from];
      const mid = me.top + me.h / 2 + dy;
      const to = rows.current.filter((r, i) => i !== d.from && r.top + r.h / 2 < mid).length;
      setD({ ...d, dy, to });
    },
    onPointerUp: () => finish(false),
    onPointerCancel: () => finish(true),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  /** Style and class for one row. */
  const row = (id: T): { style?: CSSProperties; className: string; 'data-drag-row': true } => {
    if (!d) return { className: '', 'data-drag-row': true };
    if (id === d.id) return { className: `is-dragging ${d.settling ? 'is-settling' : ''}`, style: { transform: `translateY(${d.dy}px)${d.settling ? '' : ' scale(1.05)'}` }, 'data-drag-row': true };
    const i = ids.indexOf(id);
    const gap = rows.current.length > 1 ? rows.current[1].top - rows.current[0].top - rows.current[0].h : 0;
    const step = rows.current[d.from].h + gap;
    const shift = d.from < d.to && i > d.from && i <= d.to ? -step : d.to < d.from && i >= d.to && i < d.from ? step : 0;
    return { className: '', style: shift ? { transform: `translateY(${shift}px)` } : undefined, 'data-drag-row': true };
  };

  /** The order as it will be if the row drops now. */
  const projected = d ? (() => { const o = ids.filter((x) => x !== d.id); o.splice(d.to, 0, d.id); return o; })() : ids;
  const slot = d && !d.settling
    ? <span className="felt-drop-slot" aria-hidden="true" style={{ height: rows.current[d.from].h, transform: `translateY(${slotTop(d.from, d.to)}px)` }} />
    : null;

  return { wrap, grip, row, slot, projected, listClass: d ? 'felt-drag-active' : '', dragging: d?.id ?? null };
}
