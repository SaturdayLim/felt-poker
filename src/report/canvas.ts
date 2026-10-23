import { rankLabel, SUIT_COLOR, SUIT_SYMBOL } from '../lib/cards';

export const W = 1080;
export const PAD = 56;
export const INNER = W - PAD * 2;

export const C = {
  bg: '#0a0c0b',
  surface: '#141917',
  surface2: '#1a201d',
  border: '#28302c',
  text: '#f2f5f3',
  muted: '#8b958f',
  faint: '#5b645f',
  mint: '#5ee3a1',
  mint2: '#8af5c0',
  mintDark: '#0f3a27',
  gold: '#f5c13d',
  red: '#f0616d',
  blue: '#6aa8ff',
};

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const font = (weight: number, size: number, mono = false) => `${weight} ${size}px ${mono ? MONO : SANS}`;

export type Ctx = CanvasRenderingContext2D;

export interface Block {
  h: number;
  draw: (ctx: Ctx, y: number) => void;
  /** Keep with next block when paginating (e.g. section titles). */
  keepWithNext?: boolean;
}

let measureCtx: Ctx | null = null;
export function measure(): Ctx {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function text(ctx: Ctx, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'left', maxW?: number) {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(maxW ? ellipsize(ctx, s, maxW) : s, x, y);
}

export function ellipsize(ctx: Ctx, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

export function wrap(s: string, f: string, maxW: number): string[] {
  const ctx = measure();
  ctx.font = f;
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

export function textWidth(s: string, f: string): number {
  const ctx = measure();
  ctx.font = f;
  return ctx.measureText(s).width;
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient, stroke?: string, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

export function panel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, C.surface2);
  g.addColorStop(1, C.surface);
  rrect(ctx, x, y, w, h, 28, g, C.border, 2);
}

export function playingCard(ctx: Ctx, x: number, y: number, card: string, w = 52) {
  const h = Math.round(w * 1.36);
  rrect(ctx, x, y, w, h, w * 0.16, '#f7f7f4');
  const col = SUIT_COLOR[card[1]];
  text(ctx, rankLabel(card), x + w / 2, y + h * 0.48, font(800, Math.round(w * 0.46)), col, 'center');
  text(ctx, SUIT_SYMBOL[card[1]], x + w / 2, y + h * 0.86, font(700, Math.round(w * 0.38)), col, 'center');
  return w;
}

export function cardsRow(ctx: Ctx, x: number, y: number, cards: string[], w = 52, gap = 8) {
  cards.forEach((c, i) => playingCard(ctx, x + i * (w + gap), y, c, w));
  return cards.length ? cards.length * (w + gap) - gap : 0;
}

export function avatar(ctx: Ctx, cx: number, cy: number, r: number, name: string, color = C.mint2) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#202722';
  ctx.fill();
  ctx.strokeStyle = '#35403a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = font(800, Math.round(r * 0.95));
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText((name.trim()[0] ?? '?').toUpperCase(), cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
}

export function pill(ctx: Ctx, x: number, y: number, label: string, color: string, size = 20): number {
  const f = font(700, size, true);
  const w = textWidth(label.toUpperCase(), f) + size * 1.1;
  const h = size * 1.7;
  rrect(ctx, x, y, w, h, 10, hexA(color, 0.12), hexA(color, 0.45), 1.5);
  text(ctx, label.toUpperCase(), x + w / 2, y + h * 0.68, f, color, 'center');
  return w;
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function dealerChip(ctx: Ctx, cx: number, cy: number, r = 14) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.textBaseline = 'middle';
  text(ctx, 'D', cx, cy + 1, font(800, r * 1.1), '#111', 'center');
  ctx.textBaseline = 'alphabetic';
}

/** Lay blocks onto one or more canvases no taller than maxH. */
export function paginate(blocks: Block[], opts: { maxH: number; top: (page: number) => Block; footer: (page: number, pages: number) => Block }): HTMLCanvasElement[] {
  const pages: Block[][] = [];
  let cur: Block[] = [];
  let h = 0;
  const topH = opts.top(0).h;
  const footH = opts.footer(0, 1).h;
  const limit = opts.maxH - footH;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let need = b.h;
    if (b.keepWithNext && blocks[i + 1]) need += blocks[i + 1].h;
    const base = cur.length === 0 && pages.length > 0 ? topH : 0;
    if (h + base + need > limit && cur.length) {
      pages.push(cur);
      cur = [];
      h = 0;
    }
    if (cur.length === 0 && pages.length > 0) { cur.push(opts.top(pages.length)); h += topH; }
    cur.push(b);
    h += b.h;
  }
  if (cur.length) pages.push(cur);

  return pages.map((page, pi) => {
    const foot = opts.footer(pi, pages.length);
    const total = page.reduce((a, b) => a + b.h, 0) + foot.h;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = Math.ceil(total);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, canvas.height);
    // soft glow in the top corner
    const glow = ctx.createRadialGradient(W * 0.85, 0, 10, W * 0.85, 0, 700);
    glow.addColorStop(0, 'rgba(94,227,161,0.14)');
    glow.addColorStop(1, 'rgba(94,227,161,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, Math.min(canvas.height, 800));
    let y = 0;
    for (const b of page) { b.draw(ctx, y); y += b.h; }
    foot.draw(ctx, y);
    return canvas;
  });
}

export const spacer = (h: number): Block => ({ h, draw: () => {} });

export function sectionTitle(label: string, right?: string): Block {
  return {
    h: 76,
    keepWithNext: true,
    draw: (ctx, y) => {
      text(ctx, label.toUpperCase(), PAD, y + 50, font(700, 22, true), C.mint);
      if (right) text(ctx, right, W - PAD, y + 50, font(600, 24), C.muted, 'right');
    },
  };
}
