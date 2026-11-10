/* Game summary as images. A segment is one element (results, awards, pot sizes and so on); a PNG set (pngSets.ts)
   puts several segments into ONE image. Every image has the same header (game title with date, blinds and money per
   chip) and renders at 2x, so it stays sharp when zoomed on a phone.
   Figures come from the report model (src/report/model.ts), so the images match the HTML report. All amounts are chips. */
import type { HandView, TrialModel } from './model';
import {
  C, INNER, PAD, W, awardIcon, cardsRow, dealerChip, feltMark, font, paginate, panel, rrect, sectionTitle, setReportTheme,
  spacer, text, textWidth, wrap, type Block, type Ctx, type ReportTheme,
} from './canvas';

/** Pixels per layout pixel for every image. */
export const SEGMENT_SCALE = 2;

export type SegmentKey = 'results' | 'awards' | 'stack' | 'swings' | 'style' | 'progress' | 'pots' | 'potsWinner' | 'biggest' | 'settle';
export const SEGMENTS: { k: SegmentKey; label: string; desc: string; on: boolean }[] = [
  { k: 'results', label: 'Results', desc: 'Ranked results with swing and awards.', on: true },
  { k: 'awards', label: 'Awards', desc: 'The table awards and who won them.', on: true },
  { k: 'stack', label: 'Stack size', desc: 'Result against par after each hand.', on: false },
  { k: 'swings', label: 'Swings', desc: 'Highest and lowest point of each player.', on: false },
  { k: 'style', label: 'Style map', desc: 'Hands played against aggression.', on: false },
  { k: 'progress', label: 'Hand progression', desc: 'Hands that reached each stage.', on: false },
  { k: 'pots', label: 'Pot sizes by street', desc: 'The pot of every hand, by the street it ended on.', on: false },
  { k: 'potsWinner', label: 'Pot sizes by winner', desc: 'The pot of every hand, by who won it.', on: false },
  { k: 'biggest', label: 'Biggest pots', desc: 'The three biggest pots, with the cards shown.', on: false },
  { k: 'settle', label: 'Settle up', desc: 'Who pays whom.', on: true },
];

const LIGHT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#8a5bd6', '#d6477f', '#19a3b8', '#7a8794'];
const DARK_COLORS = ['#3987e5', '#d95926', '#199e70', '#e0a21a', '#9d74e6', '#e0609a', '#2fb6cb', '#93a0ac'];
let colors = DARK_COLORS;
const colorOf = (m: TrialModel, who: string) => colors[Math.max(0, m.players.findIndex((p) => p.id === who || p.name === who)) % 8];
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
const tone = (v: number) => (v > 0 ? C.pos : v < 0 ? C.neg : C.muted);
const STREET_NAMES = ['Pre-flop', 'Flop', 'Turn', 'River', 'Showdown'];
const streetColor = (s: string) => [C.muted, colors[0], colors[3], colors[1], colors[4]][Math.max(0, STREET_NAMES.indexOf(s))];

/** A panel block `h` tall (with `gap` above and below) whose content is drawn by `draw` inside the panel. */
function card(h: number, draw: (ctx: Ctx, x: number, y: number, w: number) => void, gap = 12): Block {
  return {
    h: h + gap * 2,
    draw: (ctx, y) => { panel(ctx, PAD, y + gap, INNER, h, 32); draw(ctx, PAD + 32, y + gap, INNER - 64); },
  };
}

/** A chart drawn straight on the image background (no panel). */
const chart = (h: number, draw: (ctx: Ctx, y: number) => void): Block => ({ h, draw });

const niceStep = (span: number) => {
  const raw = span / 5, pow = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
};

/** Shared x-axis of the stack chart and the pot charts: index 0 is the start, index i is after hand i. */
const CL = PAD + 70, CR = PAD + INNER - 200;
const xAt = (i: number, n: number) => CL + (i / Math.max(1, n)) * (CR - CL);
function xTicks(ctx: Ctx, n: number, y: number) {
  const step = n > 40 ? 10 : n > 16 ? 5 : 2;
  for (let i = step; i <= n; i += step) {
    if (n - i < step / 2 && i !== n) continue;
    text(ctx, String(i), xAt(i, n), y + 34, font(500, 20, 'mono'), C.muted, 'center');
  }
  text(ctx, 'Hand', CL, y + 34, font(500, 20), C.muted, 'center');
}

/* ------------------------------- segments ------------------------------- */

function results(m: TrialModel): Block[] {
  const rows = [...m.players].sort((a, b) => b.net - a.net);
  const lo = Math.min(0, ...rows.map((p) => Math.min(p.low, p.net))), hi = Math.max(0, ...rows.map((p) => Math.max(p.high, p.net)));
  const zl = PAD + 450, zr = W - PAD - 170;
  const at = (v: number) => zl + ((v - lo) / (hi - lo || 1)) * (zr - zl);
  const out: Block[] = [sectionTitle('Results', `${m.hands} hands, ${m.minutes} min`)];
  out.push({
    h: 56,
    draw: (ctx, y) => {
      text(ctx, 'Line: low to high. Bar: 0 to final.', PAD, y + 34, font(400, 21), C.muted, 'left', 400);
      text(ctx, '0', at(0), y + 40, font(500, 20, 'mono'), C.muted, 'center');
    },
  });
  rows.forEach((p, i) => out.push({
    h: 104,
    draw: (ctx, y) => {
      const top = y + 6, ph = 92, mid = top + ph / 2;
      panel(ctx, PAD, top, INNER, ph, 28);
      if (i === 0 && p.net > 0) rrect(ctx, PAD, top, INNER, ph, 28, undefined, C.accent, 3);
      ctx.fillStyle = C.lineStrong; ctx.fillRect(at(0) - 1, top + 10, 2, ph - 20);
      text(ctx, String(i + 1), PAD + 38, mid + 10, font(500, 28, 'mono'), C.muted, 'center');
      const nf = font(500, 32);
      text(ctx, p.name, PAD + 76, mid + 11, nf, C.text, 'left', 170);
      const icons = m.awards.filter((a) => a.to.includes(p.id));
      const sz = Math.max(22, Math.min(36, 168 / Math.max(1, icons.length) - 6));
      let ix = PAD + 76 + Math.min(170, textWidth(p.name, nf)) + 16;
      for (const a of icons) { awardIcon(ctx, a.title, ix, mid - sz / 2, sz, C.text); ix += sz + 6; }
      ctx.fillStyle = C.muted; ctx.fillRect(at(p.low), mid - 2, Math.max(2, at(p.high) - at(p.low)), 4);
      const bx = Math.min(at(0), at(p.net)), bw = Math.max(3, Math.abs(at(p.net) - at(0)));
      ctx.fillStyle = p.net >= 0 ? C.pos : C.neg; ctx.beginPath(); ctx.roundRect(bx, mid - 13, bw, 26, 4); ctx.fill();
      if (p.low < Math.min(0, p.net) - 1) text(ctx, signed(p.low), at(p.low), mid + 40, font(500, 17, 'mono'), C.muted, 'center');
      if (p.high > Math.max(0, p.net) + 1) text(ctx, signed(p.high), at(p.high), mid + 40, font(500, 17, 'mono'), C.muted, 'center');
      text(ctx, signed(p.net), W - PAD - 30, mid + 12, font(500, 36, 'mono'), tone(p.net), 'right');
    },
  }));
  return out;
}

function awards(m: TrialModel): Block[] {
  const out: Block[] = [sectionTitle('Awards', `${m.awards.length} awarded`)];
  if (!m.awards.length) out.push({ h: 80, draw: (ctx, y) => text(ctx, 'No award reached its minimum.', PAD, y + 46, font(400, 26), C.muted) });
  const IN = 32, R = 36;
  for (const a of m.awards) {
    const names = a.to.map((id) => m.players.find((p) => p.id === id)?.name ?? '');
    const who = names.join(' and ');
    // a tie repeats the sentence once per name ("Eve: 10 pots won. Mike: 10 pots won"): show the figure once when equal
    const strip = (s: string) => { const n = names.find((x) => x && s.startsWith(`${x}: `)); return n ? s.slice(n.length + 2) : s; };
    const parts = a.detail.split('. ').map(strip);
    const detail = parts.every((x) => x === parts[0]) ? parts[0] : parts.join('. ');
    const body = wrap(detail, font(400, 22), INNER - IN - 2 * R - 24 - IN);
    const h = IN + 2 * R + 14 + body.length * 30 + IN - 6;
    out.push({
      h: h + 12,
      draw: (ctx, y) => {
        const top = y + 6, cy = top + IN + R;
        panel(ctx, PAD, top, INNER, h, 28);
        ctx.beginPath(); ctx.arc(PAD + IN + R, cy, R, 0, Math.PI * 2); ctx.fillStyle = C.well; ctx.fill();
        awardIcon(ctx, a.title, PAD + IN + R - 20, cy - 20, 40, C.text);
        const nw = Math.min(270, textWidth(who, font(600, 25)));
        text(ctx, a.title, PAD + IN + 2 * R + 24, cy + 14, font(400, 40, 'display'), C.text, 'left', INNER - IN - 2 * R - 24 - IN - nw - 20);
        text(ctx, who, W - PAD - IN, cy + 9, font(600, 25), C.muted, 'right', 270);
        body.forEach((l, i) => text(ctx, l, PAD + IN + 2 * R + 24, cy + R + 28 + i * 30, font(400, 22), C.muted));
      },
    });
  }
  return out;
}

function stack(m: TrialModel): Block[] {
  const n = m.players[0].dev.length - 1;
  const all = m.players.flatMap((p) => p.dev);
  const mn = Math.min(0, ...all), mx = Math.max(0, ...all);
  const step = niceStep(mx - mn || 1);
  const lo = Math.floor(mn / step) * step, hi = Math.ceil(mx / step) * step;
  return [sectionTitle('Stack size', 'Result against par'), chart(560, (ctx, y0) => {
    const T = y0 + 30, B = y0 + 490;
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (B - T);
    for (let t = lo; t <= hi + 1e-6; t += step) {
      ctx.fillStyle = t === 0 ? C.lineStrong : C.line;
      ctx.fillRect(CL, Y(t) - 1, CR - CL, t === 0 ? 3 : 2);
      text(ctx, t === 0 ? 'Par' : signed(t), CL - 14, Y(t) + 7, font(500, 20, 'mono'), C.muted, 'right');
    }
    xTicks(ctx, n, B);
    for (const p of m.players) {
      ctx.beginPath();
      p.dev.forEach((v, i) => (i ? ctx.lineTo(xAt(i, n), Y(v)) : ctx.moveTo(xAt(i, n), Y(v))));
      ctx.strokeStyle = colorOf(m, p.id); ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(xAt(n, n), Y(p.dev[n]), 8, 0, Math.PI * 2); ctx.fillStyle = colorOf(m, p.id); ctx.fill();
    }
    // rebuy sets: one circle per set, the total in buy-ins
    for (const p of m.players) {
      for (const r of p.rebuys) {
        const cx = xAt(r.after, n), cy = Y(p.dev[r.after]);
        ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill();
        ctx.strokeStyle = colorOf(m, p.id); ctx.lineWidth = 4; ctx.stroke();
        text(ctx, String(r.buyins), cx, cy + 8, font(600, 22, 'mono'), C.text, 'center');
      }
    }
    const ends = m.players.map((p) => ({ p, y: Y(p.dev[n]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 32) ends[i].y = ends[i - 1].y + 32;
    for (const e of ends) text(ctx, `${e.p.name} ${signed(e.p.dev[n])}`, CR + 18, e.y + 8, font(600, 24), colorOf(m, e.p.id), 'left', 190);
  })];
}

function swings(m: TrialModel): Block[] {
  const rows = [...m.players].sort((a, b) => b.net - a.net);
  const lo = Math.min(...rows.map((p) => Math.min(p.low, p.net))), hi = Math.max(...rows.map((p) => Math.max(p.high, p.net)));
  const span = hi - lo || 1;
  return [sectionTitle('Swings', 'Lowest, highest and final'), chart(rows.length * 96 + 24, (ctx, y0) => {
    const tx = PAD + 200, tw = INNER - 200 - 130;
    const at = (v: number) => tx + ((v - lo) / span) * tw;
    rows.forEach((p, i) => {
      const my = y0 + 56 + i * 96;
      text(ctx, p.name, PAD, my + 8, font(600, 26), colorOf(m, p.id), 'left', 190);
      ctx.fillStyle = C.lineStrong; ctx.fillRect(at(0) - 1, my - 28, 3, 56);
      ctx.fillStyle = C.muted; ctx.fillRect(at(p.low), my - 2, Math.max(2, at(p.high) - at(p.low)), 5);
      ctx.fillStyle = p.net >= 0 ? C.pos : C.neg;
      ctx.fillRect(Math.min(at(0), at(p.net)), my - 14, Math.max(3, Math.abs(at(p.net) - at(0))), 28);
      if (p.high > 0) text(ctx, signed(p.high), at(p.high), my - 24, font(500, 18, 'mono'), C.muted, 'center');
      if (p.low < 0) text(ctx, signed(p.low), at(p.low), my + 44, font(500, 18, 'mono'), C.muted, 'center');
      text(ctx, signed(p.net), PAD + INNER, my + 10, font(500, 28, 'mono'), tone(p.net), 'right');
    });
  })];
}

function style(m: TrialModel): Block[] {
  const y1 = Math.max(3.5, ...m.players.map((p) => p.af)) * 1.1;
  const pts = [
    ...m.players.map((p) => ({ id: p.id, name: p.name, vx: p.vpip, vy: p.af, target: false })),
    { id: 'target', name: 'Target', vx: m.target.vpip, vy: m.target.af, target: true },
  ].sort((a, b) => a.vx - b.vx);
  return [sectionTitle('Style map', 'Hands played, aggression'), card(600, (ctx, x0, y0, w) => {
    const L = x0 + 50, R = x0 + w, T = y0 + 30, B = y0 + 520;
    const X = (v: number) => L + (v / 100) * (R - L);
    const Y = (v: number) => T + (1 - v / y1) * (B - T);
    ctx.fillStyle = C.lineStrong; ctx.fillRect(L, B, R - L, 3); ctx.fillRect(L, T, 3, B - T);
    ctx.setLineDash([10, 10]); ctx.strokeStyle = C.lineStrong; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(m.avgVpip), T); ctx.lineTo(X(m.avgVpip), B); ctx.moveTo(L, Y(m.avgAf)); ctx.lineTo(R, Y(m.avgAf)); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, 'Hands played (VPIP)', R, B + 44, font(500, 20), C.muted, 'right');
    text(ctx, 'Aggression', L + 12, T + 20, font(500, 20), C.muted, 'left');
    const placed: { x: number; y: number }[] = [];
    for (const q of pts) {
      const cx = X(q.vx), cy = Y(q.vy);
      const right = placed.some((o) => Math.abs(o.y - cy) < 34 && Math.abs(o.x - cx) < 150);
      placed.push({ x: cx, y: cy });
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fillStyle = q.target ? C.muted : colorOf(m, q.id); ctx.fill();
      ctx.strokeStyle = C.bg; ctx.lineWidth = 4; ctx.stroke();
      text(ctx, q.name, right ? cx + 24 : cx - 24, right ? cy + 38 : cy + 8, font(600, 24), q.target ? C.muted : C.text, right ? 'left' : 'right');
    }
  })];
}

function progress(m: TrialModel): Block[] {
  const steps: [string, number][] = [['Pre-flop', m.reach.preflop], ['Flop', m.reach.flop], ['Turn', m.reach.turn], ['River', m.reach.river], ['Showdown', m.reach.showdown]];
  return [sectionTitle('Hand progression', 'Hands that reached each stage'), card(steps.length * 86 + 20, (ctx, x0, y0, w) => {
    steps.forEach(([label, v], i) => {
      const bw = Math.max(260, (v / (m.hands || 1)) * w), top = y0 + 24 + i * 86;
      rrect(ctx, x0 + (w - bw) / 2, top, bw, 64, 14, C.accentSoft, C.accent, 2);
      text(ctx, `${label} (${v})`, x0 + w / 2, top + 42, font(600, 28), C.text, 'center');
    });
  })];
}

/** Pot of every hand as bars on the shared hand axis. By 'street': colour is the street the pot ended on. By 'winner': the winner. */
function pots(by: 'street' | 'winner') {
  return (m: TrialModel): Block[] => {
    const n = m.pots.length;
    const max = Math.max(...m.pots.map((p) => p.pot), 1);
    const med = [...m.pots.map((p) => p.pot)].sort((a, b) => a - b)[Math.floor(n / 2)] ?? 0;
    const big = m.biggest[0];
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const title = by === 'street' ? 'Pot sizes by street' : 'Pot sizes by winner';
    return [sectionTitle(title, big ? `Biggest ${big.pot}, median ${med}` : ''), chart(440, (ctx, y0) => {
      const T = y0 + 20, B = y0 + 360;
      const Y = (v: number) => B - (v / top) * (B - T);
      for (let t = 0; t <= top + 1e-6; t += step) {
        ctx.fillStyle = t === 0 ? C.lineStrong : C.line;
        ctx.fillRect(CL, Y(t) - 1, CR - CL, t === 0 ? 3 : 2);
        if (t > 0) text(ctx, String(t), CL - 14, Y(t) + 7, font(500, 20, 'mono'), C.muted, 'right');
      }
      const bw = Math.max(3, Math.min(30, ((CR - CL) / Math.max(1, n)) * 0.72));
      m.pots.forEach((p, k) => {
        const h = (p.pot / top) * (B - T);
        ctx.fillStyle = by === 'street' ? streetColor(p.street) : p.winners.length > 1 ? C.lineStrong : colorOf(m, p.winners[0]);
        ctx.fillRect(xAt(k + 1, n) - bw / 2, B - h, bw, h);
      });
      xTicks(ctx, n, B);
      const items = by === 'street' ? STREET_NAMES.filter((s) => m.pots.some((p) => p.street === s)).map((s) => ({ l: s, c: streetColor(s) }))
        : [...m.players.map((p) => ({ l: p.name, c: colorOf(m, p.id) })), ...(m.pots.some((p) => p.winners.length > 1) ? [{ l: 'Split', c: C.lineStrong }] : [])];
      items.forEach((it, i) => {
        const ly = T + 14 + i * 40;
        ctx.fillStyle = it.c; ctx.beginPath(); ctx.roundRect(CR + 20, ly - 12, 22, 22, 5); ctx.fill();
        text(ctx, it.l, CR + 54, ly + 6, font(600, 22), C.text, 'left', 130);
      });
    })];
  };
}

function biggest(m: TrialModel): Block[] {
  const out: Block[] = [sectionTitle('Biggest pots')];
  for (const h of m.biggest) {
    const rows = h.shown.length;
    const boardH = h.board.length ? 70 : 0;
    const ph = 36 + 52 + boardH + (rows ? 14 + rows * 70 - 16 : 0) + 40;
    out.push(card(ph, (ctx, x0, y0, w) => {
      text(ctx, `#${h.n}`, x0, y0 + 36 + 34, font(500, 30, 'mono'), C.muted);
      text(ctx, h.winners.join(' and '), x0 + 100, y0 + 36 + 34, font(400, 38, 'display'), C.text, 'left', w - 280);
      text(ctx, String(h.pot), x0 + w, y0 + 36 + 38, font(400, 46, 'display'), C.text, 'right');
      if (h.board.length) cardsRow(ctx, x0, y0 + 36 + 52, h.board, 44, 8);
      h.shown.forEach((s, i) => {
        const ry = y0 + 36 + 52 + boardH + 14 + i * 70;
        text(ctx, s.p, x0, ry + 36, font(600, 24), h.winners.includes(s.p) ? C.pos : C.text, 'left', 190);
        cardsRow(ctx, x0 + 210, ry, s.cards, 40, 6);
        text(ctx, s.rank, x0 + 330, ry + 36, font(400, 22), C.muted, 'left', w - 330);
      });
    }, 18));
  }
  return out;
}

function listBlocks(title: string, rows: { left: string; sub?: string; right: string; tone?: string }[], empty: string): Block[] {
  const out: Block[] = [sectionTitle(title)];
  if (!rows.length) out.push({ h: 80, draw: (ctx, y) => text(ctx, empty, PAD, y + 46, font(400, 26), C.muted) });
  for (const r of rows) {
    out.push({
      h: 100,
      draw: (ctx, y) => {
        panel(ctx, PAD, y + 6, INNER, 88, 26);
        text(ctx, r.left, PAD + 32, y + (r.sub ? 46 : 62), font(600, 28), C.text, 'left', INNER - 280);
        if (r.sub) text(ctx, r.sub, PAD + 32, y + 78, font(400, 21), C.muted, 'left', INNER - 280);
        text(ctx, r.right, W - PAD - 32, y + 62, font(500, 30, 'mono'), r.tone ?? C.text, 'right', 240);
      },
    });
  }
  return out;
}

const settle = (m: TrialModel) => listBlocks('Settle up', m.settle.map((t) => ({ left: `${t.from} pays ${t.to}`, right: String(t.amount) })), 'All square.');

/** The action log of the picked hands (every hand when `ns` is omitted), as text with the cards. */
export function logBlocks(m: TrialModel, ns?: number[]): Block[] {
  const hands: HandView[] = (m.log ?? []).filter((v) => !ns || ns.includes(v.n));
  const out: Block[] = [sectionTitle('Full action log', `${hands.length} ${hands.length === 1 ? 'hand' : 'hands'}`)];
  if (!hands.length) out.push({ h: 80, draw: (ctx, y) => text(ctx, 'No hands picked.', PAD, y + 46, font(400, 26), C.muted) });
  const tf = font(400, 23), W2 = INNER - 64;
  for (const v of hands) {
    const sts = v.streets.map((st) => ({ st, lines: wrap(st.lines.join(', ') || 'No action', tf, W2) }));
    const res = wrap(v.result, font(600, 24), W2);
    const note = v.note ? wrap(v.note, tf, W2) : [];
    const shown = v.shown;
    const ph = 36 + 56 + sts.reduce((a, s) => a + 62 + s.lines.length * 32 + 8, 0) + shown.length * 62 + 12 + res.length * 32 + note.length * 30 + 30;
    out.push(card(ph, (ctx, x0, y0, w) => {
      let y = y0 + 36;
      text(ctx, `#${v.n}`, x0, y + 34, font(500, 30, 'mono'), C.muted);
      if (v.button) { dealerChip(ctx, x0 + 100, y + 24, 14); text(ctx, v.button, x0 + 126, y + 34, font(400, 36, 'display'), C.text, 'left', w - 330); }
      text(ctx, `Pot ${v.pot}`, x0 + w, y + 34, font(500, 28, 'mono'), C.text, 'right');
      y += 56;
      for (const s of sts) {
        text(ctx, s.st.street, x0, y + 38, font(600, 22), C.accentText);
        if (s.st.cards.length) cardsRow(ctx, x0 + 140, y + 8, s.st.cards, 30, 5);
        y += 62;
        s.lines.forEach((l, i) => text(ctx, l, x0, y + 22 + i * 32, tf, C.text));
        y += s.lines.length * 32 + 8;
      }
      for (const sh of shown) {
        text(ctx, sh.p, x0, y + 40, font(600, 24), C.text, 'left', 190);
        cardsRow(ctx, x0 + 210, y + 8, sh.cards, 34, 5);
        text(ctx, sh.rank, x0 + 330, y + 40, font(400, 22), C.muted, 'left', w - 330);
        y += 62;
      }
      y += 12;
      res.forEach((l, i) => text(ctx, l, x0, y + 22 + i * 32, font(600, 24), C.pos));
      y += res.length * 32;
      note.forEach((l, i) => text(ctx, l, x0, y + 24 + i * 30, tf, C.muted));
    }, 12));
  }
  return out;
}

const BUILD: Record<SegmentKey, (m: TrialModel) => Block[]> = { results, awards, stack, swings, style, progress, pots: pots('street'), potsWinner: pots('winner'), biggest, settle };

/** The blocks of one segment, to compose into an image. Call `setImageTheme` first so the colours follow the theme. */
export function segmentBlocks(m: TrialModel, k: SegmentKey): Block[] { return BUILD[k](m); }

/** Set the colours (canvas theme and the chart palette) for the blocks built after this call. */
export function setImageTheme(theme: ReportTheme) {
  setReportTheme(theme);
  colors = theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
}

/** Image header: Felt mark, then the game title "Potato Day (1 Nov 2026)" and the subtitle "(1/2 * S$0.10 Cash)". */
function imageHeader(m: TrialModel): Block {
  const lines = wrap(m.title, font(400, 62, 'display'), INNER).slice(0, 2);
  return {
    h: 190 + lines.length * 66,
    draw: (ctx, y) => {
      feltMark(ctx, PAD, y + 40, 48);
      text(ctx, 'Felt', PAD + 42, y + 80, font(400, 34, 'display'), C.mark);
      lines.forEach((l, i) => text(ctx, l, PAD, y + 168 + i * 66, font(400, 62, 'display'), C.text));
      text(ctx, m.sub, PAD, y + 168 + lines.length * 66 - 22, font(400, 28), C.muted, 'left', INNER);
    },
  };
}

/** Compose blocks into ONE image: header, blocks, footer. Scale is 2 unless the image would be too big for a phone. */
export function composeImage(m: TrialModel, blocks: Block[], theme: ReportTheme): HTMLCanvasElement {
  setImageTheme(theme);
  const all = [imageHeader(m), ...blocks, spacer(16)];
  const total = all.reduce((a, b) => a + b.h, 0) + 90;
  const scale = Math.max(0.5, Math.min(SEGMENT_SCALE, Math.floor(Math.sqrt(16e6 / (W * total)) * 100) / 100));
  const [canvas] = paginate(all, {
    maxH: 1e7,
    top: () => ({ h: 0, draw: () => {} }),
    footer: () => ({ h: 90, draw: (ctx, y) => { ctx.fillStyle = C.line; ctx.fillRect(PAD, y + 20, INNER, 2); text(ctx, 'Felt. Amounts are chips (1 chip = 1 small blind).', PAD, y + 62, font(400, 21), C.muted, 'left', INNER); } }),
    scale,
  });
  return canvas;
}

/** One segment as its own image (2x). */
export function renderSegment(m: TrialModel, k: SegmentKey, theme: ReportTheme = 'dark'): HTMLCanvasElement {
  setImageTheme(theme);
  return composeImage(m, BUILD[k](m), theme);
}
