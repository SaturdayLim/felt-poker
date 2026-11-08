/* Game summary as separate images, one per element (results, awards, pot sizes and so on). Each segment is its own
   render at 2x, so it stays sharp when zoomed on a phone. The host ticks the segments to include (Report.tsx).
   Figures come from the report model (src/report/model.ts), so the images match the HTML report. All amounts are chips. */
import type { TrialModel } from './model';
import {
  C, INNER, PAD, W, awardIcon, caption, cardsRow, feltMark, font, paginate, panel, rrect, sectionTitle, setReportTheme,
  spacer, text, textWidth, wrap, type Block, type Ctx, type ReportTheme,
} from './canvas';

/** Pixels per layout pixel for every segment image. */
export const SEGMENT_SCALE = 2;

export type SegmentKey = 'results' | 'awards' | 'stack' | 'swings' | 'style' | 'progress' | 'pots' | 'biggest' | 'side' | 'rules' | 'settle';
export const SEGMENTS: { k: SegmentKey; label: string; desc: string; on: boolean }[] = [
  { k: 'results', label: 'Results', desc: 'Who won and lost, with the chips in and out.', on: true },
  { k: 'awards', label: 'Awards', desc: 'The table awards and who won them.', on: true },
  { k: 'stack', label: 'Stack size', desc: 'Result against par after each hand.', on: false },
  { k: 'swings', label: 'Swings', desc: 'Highest and lowest point of each player.', on: false },
  { k: 'style', label: 'Style map', desc: 'Hands played against aggression.', on: false },
  { k: 'progress', label: 'Hand progression', desc: 'Hands that reached each stage.', on: false },
  { k: 'pots', label: 'Pot sizes', desc: 'The pot of every hand.', on: false },
  { k: 'biggest', label: 'Biggest pots', desc: 'The three biggest pots, with the cards shown.', on: false },
  { k: 'side', label: 'Side action', desc: '2-7 bounties and chip moves.', on: false },
  { k: 'rules', label: 'House rules', desc: 'The rules this game used.', on: false },
  { k: 'settle', label: 'Settle up', desc: 'Who pays whom.', on: true },
];

const LIGHT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#8a5bd6', '#d6477f', '#19a3b8', '#7a8794'];
const DARK_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9d74e6', '#e0609a', '#2fb6cb', '#93a0ac'];
let colors = DARK_COLORS;
const colorOf = (m: TrialModel, who: string) => colors[Math.max(0, m.players.findIndex((p) => p.id === who || p.name === who)) % 8];
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
const tone = (v: number) => (v > 0 ? C.pos : v < 0 ? C.neg : C.muted);

/** A panel block `h` tall (with 10 px above and below) whose content is drawn by `draw` inside the panel. */
function card(h: number, draw: (ctx: Ctx, x: number, y: number, w: number) => void): Block {
  return {
    h: h + 24,
    draw: (ctx, y) => { panel(ctx, PAD, y + 12, INNER, h, 32); draw(ctx, PAD + 32, y + 12, INNER - 64); },
  };
}

/* ------------------------------- segments ------------------------------- */

function results(m: TrialModel): Block[] {
  const rows = [...m.players].sort((a, b) => b.net - a.net);
  const top = rows[0];
  const out: Block[] = [sectionTitle('Results', `${m.hands} hands, ${m.minutes} min`)];
  out.push({ h: 70, draw: (ctx, y) => text(ctx, `Winner: ${top.name} (${signed(top.net)})`, PAD, y + 44, font(600, 30), C.text, 'left', INNER) });
  rows.forEach((p, i) => out.push({
    h: 112,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 6, INNER, 100, 28);
      if (i === 0 && p.net > 0) rrect(ctx, PAD, y + 6, INNER, 100, 28, undefined, C.accent, 3);
      const mid = y + 56;
      text(ctx, String(i + 1), PAD + 38, mid + 10, font(500, 28, 'mono'), C.muted, 'center');
      ctx.beginPath(); ctx.arc(PAD + 84, mid, 9, 0, Math.PI * 2); ctx.fillStyle = colorOf(m, p.id); ctx.fill();
      text(ctx, p.name, PAD + 112, mid - 4, font(400, 42, 'display'), C.text, 'left', 360);
      text(ctx, `In ${p.bought}, out ${p.count}`, PAD + 112, mid + 30, font(400, 22), C.muted, 'left', 360);
      text(ctx, signed(p.net), W - PAD - 36, mid + 12, font(500, 38, 'mono'), tone(p.net), 'right');
    },
  }));
  return out;
}

function awards(m: TrialModel): Block[] {
  const out: Block[] = [sectionTitle('Awards', `${m.awards.length} awarded`)];
  if (!m.awards.length) out.push({ h: 80, draw: (ctx, y) => text(ctx, 'No award reached its minimum.', PAD, y + 46, font(400, 26), C.muted) });
  for (const a of m.awards) {
    const who = a.to.map((id) => m.players.find((p) => p.id === id)?.name ?? '').join(' and ');
    const body = wrap(a.detail, font(400, 22), INNER - 64 - 100);
    const h = Math.max(120, 78 + body.length * 30 + 22);
    out.push({
      h: h + 12,
      draw: (ctx, y) => {
        panel(ctx, PAD, y + 6, INNER, h, 28);
        ctx.beginPath(); ctx.arc(PAD + 62, y + 6 + 60, 40, 0, Math.PI * 2); ctx.fillStyle = C.well; ctx.fill();
        awardIcon(ctx, a.title, PAD + 62 - 22, y + 6 + 60 - 22, 44, C.text);
        text(ctx, a.title, PAD + 128, y + 6 + 48, font(400, 40, 'display'), C.text, 'left', INNER - 128 - 280);
        text(ctx, who, W - PAD - 32, y + 6 + 46, font(600, 25), C.muted, 'right', 270);
        body.forEach((l, i) => text(ctx, l, PAD + 128, y + 6 + 88 + i * 30, font(400, 22), C.muted));
      },
    });
  }
  return out;
}

function stack(m: TrialModel): Block[] {
  const n = m.players[0].dev.length;
  const all = m.players.flatMap((p) => p.dev);
  const lo = Math.floor(Math.min(0, ...all) / 50) * 50, hi = Math.ceil(Math.max(0, ...all) / 50) * 50;
  return [sectionTitle('Stack size', 'Result against par'), card(560, (ctx, x0, y0, w) => {
    const L = x0 + 70, R = x0 + w - 200, T = y0 + 40, B = y0 + 500;
    const X = (i: number) => L + (i / Math.max(1, n - 1)) * (R - L);
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (B - T);
    for (let t = lo; t <= hi; t += 50) {
      ctx.fillStyle = t === 0 ? C.lineStrong : C.line;
      ctx.fillRect(L, Y(t) - 1, R - L, t === 0 ? 3 : 2);
      text(ctx, t === 0 ? 'Par' : signed(t), L - 14, Y(t) + 8, font(500, 20, 'mono'), C.muted, 'right');
    }
    for (const i of [0, 10, 20, n - 1].filter((v, k, a) => a.indexOf(v) === k && (v === n - 1 || n - 1 - v >= 4))) text(ctx, String(i), X(i), B + 36, font(500, 20, 'mono'), C.muted, 'center');
    for (const p of m.players) {
      ctx.beginPath();
      p.dev.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.strokeStyle = colorOf(m, p.id); ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
    }
    // rebuys: a circle with the extra buy-ins so far (each the size of the first buy-in)
    for (const p of m.players) {
      const first = p.bought - p.rebuys.reduce((a, r) => a + r.amount, 0);
      let count = 0;
      for (const r of p.rebuys) {
        count += Math.max(1, Math.round(r.amount / (first || r.amount)));
        const cx = X(r.after), cy = Y(p.dev[r.after]);
        ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill();
        ctx.strokeStyle = colorOf(m, p.id); ctx.lineWidth = 4; ctx.stroke();
        text(ctx, String(count), cx, cy + 8, font(600, 22, 'mono'), C.text, 'center');
      }
    }
    const ends = m.players.map((p) => ({ p, y: Y(p.dev[n - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 32) ends[i].y = ends[i - 1].y + 32;
    for (const e of ends) text(ctx, `${e.p.name}: ${signed(e.p.dev[n - 1])}`, R + 16, e.y + 8, font(600, 24), C.text, 'left', 190);
  })];
}

function swings(m: TrialModel): Block[] {
  const rows = [...m.players].sort((a, b) => b.net - a.net);
  const lo = Math.min(...rows.map((p) => Math.min(p.low, p.net))), hi = Math.max(...rows.map((p) => Math.max(p.high, p.net)));
  const span = hi - lo || 1;
  return [sectionTitle('Swings', 'Lowest, highest and final'), card(rows.length * 96 + 24, (ctx, x0, y0, w) => {
    const tx = x0 + 200, tw = w - 200 - 130;
    const at = (v: number) => tx + ((v - lo) / span) * tw;
    rows.forEach((p, i) => {
      const my = y0 + 56 + i * 96;
      text(ctx, p.name, x0, my + 8, font(600, 26), C.text, 'left', 190);
      ctx.fillStyle = C.lineStrong; ctx.fillRect(at(0) - 1, my - 28, 3, 56);
      ctx.fillStyle = C.muted; ctx.fillRect(at(p.low), my - 2, Math.max(2, at(p.high) - at(p.low)), 5);
      ctx.fillStyle = p.net >= 0 ? C.pos : C.neg;
      ctx.fillRect(Math.min(at(0), at(p.net)), my - 14, Math.max(3, Math.abs(at(p.net) - at(0))), 28);
      if (p.high > 0) text(ctx, signed(p.high), at(p.high), my - 24, font(500, 18, 'mono'), C.muted, 'center');
      if (p.low < 0) text(ctx, signed(p.low), at(p.low), my + 44, font(500, 18, 'mono'), C.muted, 'center');
      text(ctx, signed(p.net), x0 + w, my + 10, font(500, 28, 'mono'), tone(p.net), 'right');
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

function pots(m: TrialModel): Block[] {
  const max = Math.max(...m.pots.map((p) => p.pot), 1);
  const med = [...m.pots.map((p) => p.pot)].sort((a, b) => a - b)[Math.floor(m.pots.length / 2)] ?? 0;
  const big = m.biggest[0];
  const legendH = 56;
  return [sectionTitle('Pot sizes', big ? `Biggest ${big.pot}, median ${med}` : ''), card(430 + legendH, (ctx, x0, y0, w) => {
    const B = y0 + 380, H = 330, bw = w / m.pots.length;
    m.pots.forEach((p, i) => {
      const h = (p.pot / max) * H;
      ctx.fillStyle = p.winners.length > 1 ? C.lineStrong : colorOf(m, p.winners[0]);
      ctx.fillRect(x0 + i * bw + 1, B - h, Math.max(2, bw - 2), h);
    });
    ctx.fillStyle = C.lineStrong; ctx.fillRect(x0, B, w, 3);
    for (const n of [1, 10, 20, m.pots.length].filter((v, k, a) => a.indexOf(v) === k && v >= 1)) text(ctx, String(n), x0 + (n - 0.5) * bw, B + 36, font(500, 20, 'mono'), C.muted, 'center');
    let lx = x0;
    for (const p of m.players) {
      ctx.beginPath(); ctx.arc(lx + 8, y0 + 440 + 12, 8, 0, Math.PI * 2); ctx.fillStyle = colorOf(m, p.id); ctx.fill();
      text(ctx, p.name, lx + 24, y0 + 440 + 20, font(400, 22), C.muted);
      lx += 40 + textWidth(p.name, font(400, 22)) + 20;
    }
  })];
}

function biggest(m: TrialModel): Block[] {
  const out: Block[] = [sectionTitle('Biggest pots')];
  for (const h of m.biggest) {
    const rows = h.shown.length;
    out.push(card(130 + rows * 70, (ctx, x0, y0, w) => {
      text(ctx, `#${h.n}`, x0, y0 + 52, font(500, 30, 'mono'), C.muted);
      text(ctx, h.winners.join(' and '), x0 + 100, y0 + 52, font(400, 38, 'display'), C.text, 'left', w - 280);
      text(ctx, String(h.pot), x0 + w, y0 + 52, font(400, 46, 'display'), C.text, 'right');
      if (h.board.length) cardsRow(ctx, x0, y0 + 76, h.board, 44, 8);
      h.shown.forEach((s, i) => {
        const ry = y0 + 142 + i * 70;
        text(ctx, s.p, x0, ry + 36, font(600, 24), h.winners.includes(s.p) ? C.pos : C.text, 'left', 190);
        cardsRow(ctx, x0 + 210, ry, s.cards, 40, 6);
        text(ctx, s.rank, x0 + 330, ry + 36, font(400, 22), C.muted, 'left', w - 330);
      });
    }));
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

const side = (m: TrialModel) => listBlocks('Side action', [
  ...m.bounties.map((b) => ({ left: `2-7 bounty: ${b.to}`, sub: `Hand #${b.n}`, right: `+${b.total}`, tone: C.pos })),
  ...m.moves.map((x) => ({ left: `${x.from} to ${x.to}`, sub: `After hand #${x.afterN}${x.note ? `, ${x.note}` : ''}`, right: String(x.amount) })),
], 'No side action.');
const rules = (m: TrialModel) => listBlocks('House rules', m.rules.map((r) => ({ left: r.label, right: r.value })), 'No rules recorded.').map((b, i) => (i ? { ...b, h: 88 } : b));
const settle = (m: TrialModel) => listBlocks('Settle up', m.settle.map((t) => ({ left: `${t.from} pays ${t.to}`, right: String(t.amount) })), 'All square.');

const BUILD: Record<SegmentKey, (m: TrialModel) => Block[]> = { results, awards, stack, swings, style, progress, pots, biggest, side, rules, settle };

/** One segment as its own image (2x). */
export function renderSegment(m: TrialModel, k: SegmentKey, theme: ReportTheme = 'dark'): HTMLCanvasElement {
  setReportTheme(theme);
  colors = theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
  const blocks: Block[] = [...BUILD[k](m), spacer(16)];
  const top = (): Block => ({
    h: 150,
    draw: (ctx, y) => {
      feltMark(ctx, PAD, y + 50, 52);
      text(ctx, 'Felt', PAD + 44, y + 90, font(400, 36, 'display'), C.text);
      text(ctx, m.game, W - PAD, y + 88, font(400, 34, 'display'), C.text, 'right', INNER * 0.6);
      caption(ctx, m.date, W - PAD, y + 124, { align: 'right', size: 18 });
    },
  });
  const [canvas] = paginate([top(), ...blocks], {
    maxH: 100000,
    top,
    footer: () => ({ h: 90, draw: (ctx, y) => { ctx.fillStyle = C.line; ctx.fillRect(PAD, y + 20, INNER, 2); text(ctx, 'Felt. Amounts are chips (1 chip = 1 small blind).', PAD, y + 62, font(400, 21), C.muted, 'left', INNER); } }),
    scale: SEGMENT_SCALE,
  });
  return canvas;
}
