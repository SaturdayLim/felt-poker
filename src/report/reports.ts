import type { Game, Hand, ID } from '../types';
import {
  buyInTimeline, gameResults, handStats, playerResult, round2, timePlayed, totalBuyInUnits, totalPotMoney,
} from '../lib/calc';
import { bestHand } from '../lib/cards';
import { dateLabel, duration, money, timeLabel, units } from '../lib/format';
import {
  C, INNER, PAD, W, avatar, badge, caption, cardsRow, dealerChip, deltaText, feltMark, font, paginate, panel, rrect,
  sectionTitle, setReportTheme, spacer, text, textWidth, wrap, type Block, type ReportTheme,
} from './canvas';

export type Tier = 'summary' | 'detailed' | 'full';
export const TIER_LABEL: Record<Tier, string> = { summary: 'Summary', detailed: 'Detailed', full: 'Full' };

type NameFn = (id: ID) => string;

/** Page subtitle, Title Case: 23 Oct 2026, 1/2 Cash Game (1 Unit = S$0.10). */
function subtitle(g: Game) {
  const when = `${dateLabel(g.startedAt)}, ${duration((g.endedAt ?? Date.now()) - g.startedAt)}`;
  if (g.type === 'tournament') return `${when}, Tournament (${money(g.tournament?.buyIn ?? 0, g.currency)} Entry)`;
  return `${when}, ${g.sb}/${g.bb} Cash Game (Multiplier ${money(g.unitValue, g.currency)})`;
}

/* ------------------------------- blocks ------------------------------- */

function header(g: Game, tier: Tier): Block {
  const titleLines = wrap(g.name, font(400, 84, 'display'), INNER - 90).slice(0, 2);
  const h = 170 + titleLines.length * 86 + 40;
  return {
    h,
    draw: (ctx, y) => {
      feltMark(ctx, PAD, y + 64, 58);
      text(ctx, 'Felt', PAD + 46, y + 108, font(400, 40, 'display'), C.text);
      caption(ctx, `${TIER_LABEL[tier]} report`, W - PAD, y + 104, { align: 'right' });
      titleLines.forEach((l, i) => text(ctx, l, PAD, y + 214 + i * 86, font(400, 84, 'display'), C.text));
      text(ctx, subtitle(g), PAD, y + 214 + titleLines.length * 86 - 34, font(400, 26), C.muted, 'left', INNER);
    },
  };
}

function contHeader(g: Game, tier: Tier): (page: number) => Block {
  return (page) => ({
    h: 130,
    draw: (ctx, y) => {
      feltMark(ctx, PAD, y + 48, 44);
      caption(ctx, `${TIER_LABEL[tier]} report, page ${page + 1}`, PAD + 40, y + 82);
      text(ctx, g.name, W - PAD, y + 84, font(400, 34, 'display'), C.text, 'right', INNER * 0.5);
    },
  });
}

function footer(g: Game, note: string): (page: number, pages: number) => Block {
  return (page, pages) => ({
    h: 120,
    draw: (ctx, y) => {
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, y + 30, INNER, 2);
      text(ctx, `Source: Felt game log (${dateLabel(g.startedAt)}). ${note}`, PAD, y + 76, font(400, 22), C.muted, 'left', INNER - 120);
      if (pages > 1) text(ctx, `${page + 1} of ${pages}`, W - PAD, y + 76, font(500, 22, 'mono'), C.muted, 'right');
    },
  });
}

function hero(g: Game): Block {
  return {
    h: 250,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 10, INNER, 220);
      caption(ctx, g.type === 'cash' ? 'In play' : 'Prize pool', PAD + 40, y + 70, { q: g.currency });
      text(ctx, money(totalPotMoney(g), ''), PAD + 40, y + 178, font(400, 110, 'display'), C.text);
      const right = g.type === 'cash'
        ? [`${units(totalBuyInUnits(g))} units`, `${g.buyIns.length} buy-ins`, `${g.hands.length} hands`]
        : [`${g.buyIns.length} entries`, `${g.playerIds.length} players`, `${g.hands.length} hands`];
      right.forEach((s, i) => text(ctx, s, W - PAD - 40, y + 86 + i * 44, font(400, 26), i === 0 ? C.text : C.muted, 'right'));
    },
  };
}

function resultRows(g: Game, name: NameFn, compact: boolean): Block[] {
  const res = gameResults(g);
  const rowH = compact ? 96 : 116;
  const out: Block[] = [sectionTitle('Results', g.type === 'cash' ? `In, out and net (${g.currency})` : `Place and net (${g.currency})`)];
  const fmt = (a: number) => money(a, '');
  res.forEach((r, i) => {
    out.push({
      h: rowH,
      draw: (ctx, y) => {
        const lead = i === 0 && r.net > 0;
        panel(ctx, PAD, y + 6, INNER, rowH - 12, 28);
        if (lead) rrect(ctx, PAD, y + 6, INNER, rowH - 12, 28, undefined, C.accent, 3);
        const mid = y + rowH / 2;
        text(ctx, String(i + 1), PAD + 38, mid + 10, font(500, 28, 'mono'), C.muted, 'center');
        avatar(ctx, PAD + 100, mid, compact ? 26 : 30, name(r.playerId));
        text(ctx, name(r.playerId), PAD + 148, mid - (compact ? 2 : 6), font(400, compact ? 38 : 42, 'display'), C.text, 'left', 360);
        const sub = g.type === 'cash'
          ? `${money(r.in, g.currency)} in, ${money(r.out, g.currency)} out, ${r.buyIns} buy-in${r.buyIns === 1 ? '' : 's'}`
          : `${r.place ? `Place ${r.place}, ` : ''}${r.buyIns} entr${r.buyIns === 1 ? 'y' : 'ies'}, won ${money(r.out, g.currency)}`;
        text(ctx, sub, PAD + 148, mid + (compact ? 30 : 34), font(400, 22), C.muted, 'left', 470);
        const d = deltaText(r.net, fmt);
        text(ctx, d.s, W - PAD - 36, mid + (g.type === 'cash' ? 2 : 12), font(500, 34, 'mono'), d.color, 'right');
        if (g.type === 'cash') {
          const du = deltaText(r.outUnits - r.inUnits, (a) => `${units(a)} units`);
          text(ctx, du.s, W - PAD - 36, mid + 36, font(500, 21, 'mono'), C.muted, 'right');
        }
      },
    });
  });
  return out;
}

function callouts(g: Game, name: NameFn): Block {
  const res = gameResults(g);
  const best = res[0], worst = res[res.length - 1];
  return {
    h: 220,
    draw: (ctx, y) => {
      const w = (INNER - 24) / 2;
      const card = (x: number, label: string, pid: ID | undefined, v: number) => {
        panel(ctx, x, y + 10, w, 190);
        caption(ctx, label, x + 32, y + 64, { q: g.currency });
        text(ctx, pid ? name(pid) : '-', x + 32, y + 126, font(400, 50, 'display'), C.text, 'left', w - 64);
        const d = deltaText(v, (a) => money(a, ''));
        text(ctx, d.s, x + 32, y + 172, font(500, 30, 'mono'), d.color);
      };
      card(PAD, 'Up the most', best?.playerId, best?.net ?? 0);
      card(PAD + w + 24, 'Down the most', worst?.playerId, worst?.net ?? 0);
    },
  };
}

function payments(g: Game, name: NameFn): Block[] {
  if (!g.transfers.length) {
    return [sectionTitle('Payments'), {
      h: 90, draw: (ctx, y) => text(ctx, g.status === 'closed' ? 'Nobody owes anything.' : 'Payments are worked out when the game closes.', PAD, y + 50, font(400, 26), C.muted),
    }];
  }
  const open = g.transfers.filter((t) => !t.resolved).length;
  const out: Block[] = [sectionTitle('Payments', open ? `${open} of ${g.transfers.length} to pay (${g.currency})` : `All paid (${g.currency})`)];
  g.transfers.forEach((t) => {
    out.push({
      h: 92,
      draw: (ctx, y) => {
        panel(ctx, PAD, y + 6, INNER, 80, 28);
        const f = font(600, 28);
        text(ctx, name(t.from), PAD + 32, y + 56, f, C.text, 'left', 280);
        const fw = Math.min(280, textWidth(name(t.from), f));
        text(ctx, 'pays', PAD + 46 + fw, y + 56, font(400, 26), C.muted);
        text(ctx, name(t.to), PAD + 46 + fw + textWidth('pays', font(400, 26)) + 14, y + 56, f, C.text, 'left', 280);
        const bw = t.resolved ? badge(ctx, W - PAD - 32 - textWidth('Paid', font(600, 20)) - 24, y + 30, 'Paid') + 16 : 0;
        text(ctx, money(t.amount, ''), W - PAD - 32 - bw, y + 56, font(500, 30, 'mono'), C.text, 'right');
      },
    });
  });
  return out;
}

function statTiles(g: Game, name: NameFn): Block {
  const hs = handStats(g);
  const ended = g.endedAt ?? Date.now();
  const mostWins = Object.entries(hs.handsWon).sort((a, b) => b[1] - a[1])[0];
  const rebuys = Math.max(0, g.buyIns.length - g.playerIds.length);
  const perHour = hs.hands ? Math.round(hs.hands / Math.max(1, (ended - g.startedAt) / 3600000)) : 0;
  const tiles: { cap: string; q?: string; v: string; note: string; name?: boolean }[] = [
    { cap: 'Hands', v: String(hs.hands), note: `${perHour} per hour over ${duration(ended - g.startedAt)}` },
    { cap: 'Avg pot', q: 'units', v: hs.hands ? units(Math.round(hs.avgPot)) : '-', note: g.type === 'cash' && hs.hands ? `= ${money(hs.avgPot * g.unitValue, g.currency)}` : 'Across all hands' },
    { cap: 'Top pot', q: 'units', v: hs.biggest ? units(hs.biggest.pot) : '-', note: hs.biggest ? `Hand ${hs.biggest.n}, ${hs.biggest.winners.map(name).join(' and ')}` : '' },
    { cap: 'Most hands won', v: mostWins ? name(mostWins[0]) : '-', note: mostWins ? `${mostWins[1]} hands` : '', name: true },
    { cap: 'All-ins', v: String(hs.allIns), note: `${hs.showdowns} showdowns` },
    { cap: g.type === 'cash' ? 'Rebuys' : 'Re-entries', v: String(rebuys), note: `${g.buyIns.length} ${g.type === 'cash' ? 'buy-ins' : 'entries'} in total` },
  ];
  const th = 190;
  return {
    h: Math.ceil(tiles.length / 2) * (th + 24) + 10,
    draw: (ctx, y) => {
      const w = (INNER - 24) / 2;
      tiles.forEach((t, i) => {
        const x = PAD + (i % 2) * (w + 24);
        const ty = y + 10 + Math.floor(i / 2) * (th + 24);
        panel(ctx, x, ty, w, th);
        caption(ctx, t.cap, x + 32, ty + 52, { q: t.q });
        text(ctx, t.v, x + 32, ty + 122, font(400, t.name ? 52 : 64, 'display'), C.text, 'left', w - 64);
        text(ctx, t.note, x + 32, ty + 162, font(400, 21), C.muted, 'left', w - 64);
      });
    },
  };
}

function buyInChart(g: Game): Block {
  const pts = buyInTimeline(g);
  const t0 = g.startedAt, t1 = Math.max(g.endedAt ?? Date.now(), t0 + 60000);
  const last = pts[pts.length - 1].v;
  const total = g.type === 'cash' ? money(last * g.unitValue, g.currency) : money(last, g.currency);
  return {
    h: 420,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 10, INNER, 390);
      caption(ctx, g.type === 'cash' ? 'Money on the table' : 'Prize pool', PAD + 32, y + 62, { q: g.currency });
      const x0 = PAD + 32, x1 = W - PAD - 32, y0 = y + 96, y1 = y + 286;
      const vmax = Math.max(1, ...pts.map((p) => p.v));
      const X = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
      const Y = (v: number) => y1 - (v / vmax) * (y1 - y0);
      ctx.fillStyle = C.line;
      ctx.fillRect(x0, y1, x1 - x0, 2);
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0].t), Y(pts[0].v));
        for (let i = 1; i < pts.length; i++) { ctx.lineTo(X(pts[i].t), Y(pts[i - 1].v)); ctx.lineTo(X(pts[i].t), Y(pts[i].v)); }
        ctx.lineTo(x1, Y(last));
      };
      trace();
      ctx.lineTo(x1, y1); ctx.lineTo(X(pts[0].t), y1); ctx.closePath();
      ctx.fillStyle = C.accentSoft; ctx.fill();
      trace();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
      text(ctx, timeLabel(t0), x0, y + 316, font(500, 19, 'mono'), C.muted);
      text(ctx, timeLabel(t1), x1, y + 316, font(500, 19, 'mono'), C.muted, 'right');
      // finding-first caption
      const lead = `${g.type === 'cash' ? 'In play' : 'Pool'} = ${total}`;
      const lf = font(600, 23);
      text(ctx, lead, x0, y + 366, lf, C.text);
      text(ctx, ` after ${duration(t1 - t0)}, ${g.buyIns.length} ${g.type === 'cash' ? 'buy-ins' : 'entries'}.`, x0 + textWidth(lead, lf), y + 366, font(400, 23), C.muted);
    },
  };
}

function playerStats(g: Game, name: NameFn): Block[] {
  const hs = handStats(g);
  const rows = gameResults(g);
  const out: Block[] = [sectionTitle('Players', 'Hands won, units won, time')];
  const maxWon = Math.max(1, ...rows.map((r) => hs.handsWon[r.playerId] ?? 0));
  out.push({
    h: 24 + rows.length * 78 + 24,
    draw: (ctx, y) => {
      panel(ctx, PAD, y, INNER, 24 + rows.length * 78 + 12);
      rows.forEach((r, i) => {
        const ry = y + 24 + i * 78;
        const won = hs.handsWon[r.playerId] ?? 0;
        text(ctx, name(r.playerId), PAD + 32, ry + 46, font(600, 27), C.text, 'left', 220);
        const bx = PAD + 270, bw = 270;
        rrect(ctx, bx, ry + 30, bw, 14, 7, C.line);
        rrect(ctx, bx, ry + 30, Math.max(8, (won / maxWon) * bw), 14, 7, C.accent);
        text(ctx, `${won}`, bx + bw + 20, ry + 47, font(500, 26, 'mono'), C.text);
        text(ctx, `${units(hs.potsWon[r.playerId] ?? 0)}`, W - PAD - 170, ry + 47, font(500, 23, 'mono'), C.muted, 'right');
        text(ctx, duration(timePlayed(g, r.playerId)), W - PAD - 32, ry + 47, font(500, 23, 'mono'), C.muted, 'right');
        if (i < rows.length - 1) { ctx.fillStyle = C.line; ctx.fillRect(PAD + 32, ry + 74, INNER - 64, 2); }
      });
    },
  });
  return out;
}

function highlightHand(h: Hand, label: string, lead: string, name: NameFn, cards?: string[]): Block {
  return {
    h: 270,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 10, INNER, 250);
      caption(ctx, label, PAD + 32, y + 62);
      text(ctx, lead, PAD + 32, y + 124, font(400, 48, 'display'), C.text, 'left', INNER - 64);
      text(ctx, `Hand ${h.n}, won by ${h.winners.map((w) => name(w.playerId)).join(' and ')}, ${units(h.pot)} units`, PAD + 32, y + 164, font(400, 23), C.muted, 'left', INNER - 64);
      let x = PAD + 32;
      if (cards?.length) { x += cardsRow(ctx, x, y + 184, cards, 44, 6) + 24; }
      if (!h.boardNA && h.board.length) cardsRow(ctx, x, y + 184, h.board, 44, 6);
      else if (h.boardNA) badge(ctx, x, y + 196, 'No board', true, 18);
    },
  };
}

function highlights(g: Game, name: NameFn): Block[] {
  const hs = handStats(g);
  const out: Block[] = [];
  if (!hs.biggest && !hs.bestShown) return out;
  out.push(sectionTitle('Highlights'));
  if (hs.biggest) {
    const h = g.hands.find((x) => x.id === hs.biggest!.handId)!;
    out.push(highlightHand(h, 'Top pot', g.type === 'cash' ? `${units(h.pot)} units = ${money(h.pot * g.unitValue, g.currency)}` : `${units(h.pot)} chips`, name));
  }
  if (hs.bestShown) {
    const h = g.hands.find((x) => x.id === hs.bestShown!.handId)!;
    out.push(highlightHand(h, 'Best hand shown', `${name(hs.bestShown.playerId)}, ${hs.bestShown.name.toLowerCase()}`, name, hs.bestShown.cards));
  }
  const tags = Object.entries(hs.tagCounts).sort((a, b) => b[1] - a[1]);
  if (tags.length) {
    out.push({
      h: 80,
      draw: (ctx, y) => {
        let x = PAD;
        for (const [t, n] of tags) {
          const label = `${t} (${n})`;
          if (x + textWidth(label, font(600, 20)) + 40 > W - PAD) break;
          x += badge(ctx, x, y + 22, label, true) + 12;
        }
      },
    });
  }
  return out;
}

function buyInLog(g: Game, name: NameFn): Block[] {
  const out: Block[] = [sectionTitle(g.type === 'cash' ? 'Buy-in log' : 'Entry log', g.type === 'cash' ? 'Time and units' : `Time and ${g.currency}`)];
  for (const pid of [...g.playerIds].sort((a, b) => (g.seats[a] ?? 0) - (g.seats[b] ?? 0))) {
    const ev = [
      ...g.buyIns.filter((b) => b.playerId === pid).map((b) => `${timeLabel(b.at)} +${g.type === 'cash' ? units(b.amount) : money(b.amount, '')}`),
      ...g.cashOuts.filter((c) => c.playerId === pid).map((c) => `out ${units(c.amount)}`),
    ];
    const lines = wrap(ev.join(', ') || '-', font(500, 21, 'mono'), INNER - 420);
    const r = playerResult(g, pid);
    out.push({
      h: 40 + lines.length * 32 + 20,
      draw: (ctx, y) => {
        text(ctx, name(pid), PAD, y + 50, font(400, 34, 'display'), C.text, 'left', 220);
        caption(ctx, `Seat ${g.seats[pid] ?? '-'}`, PAD, y + 82, { size: 18 });
        lines.forEach((l, i) => text(ctx, l, PAD + 240, y + 48 + i * 32, font(500, 21, 'mono'), C.muted));
        const d = deltaText(r.net, (a) => money(a, g.currency));
        text(ctx, d.s, W - PAD, y + 48, font(500, 24, 'mono'), d.color, 'right');
      },
    });
  }
  if (g.expenses.length) {
    out.push(sectionTitle('Expenses', `${money(g.expenses.reduce((a, e) => a + e.amount, 0), g.currency)} in total`));
    for (const e of g.expenses) {
      out.push({
        h: 64,
        draw: (ctx, y) => {
          text(ctx, e.label, PAD, y + 40, font(600, 25), C.text, 'left', 340);
          text(ctx, `${e.paidBy ? `${name(e.paidBy)} paid` : 'Not paid yet'}, split ${e.splitAmong.length} ways`, PAD + 360, y + 40, font(400, 21), C.muted, 'left', 400);
          text(ctx, money(e.amount, g.currency), W - PAD, y + 40, font(500, 25, 'mono'), C.text, 'right');
        },
      });
    }
  }
  return out;
}

function handRow(h: Hand, name: NameFn): Block {
  const shown = h.shown.filter((s) => s.cards.length);
  const noteLines = h.note ? wrap(h.note, font(400, 21), INNER - 160) : [];
  const flags = [h.allIn && 'All-in', h.straddle && 'Straddle', ...h.tags].filter(Boolean) as string[];
  const height = 156 + shown.length * 70 + (flags.length ? 52 : 0) + noteLines.length * 30 + 16;
  return {
    h: height,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 8, INNER, height - 16, 28);
      const x = PAD + 28;
      text(ctx, `${h.n}`, x, y + 58, font(500, 26, 'mono'), C.muted);
      text(ctx, timeLabel(h.at), x, y + 88, font(500, 17, 'mono'), C.muted);
      const winners = h.winners.map((w) => (h.winners.length > 1 ? `${name(w.playerId)} ${units(w.amount)}` : name(w.playerId))).join(' and ');
      text(ctx, winners || 'No winner', x + 100, y + 58, font(400, 38, 'display'), C.text, 'left', 480);
      const meta = [h.dealerId ? `${name(h.dealerId)} on the button` : '', (h.pots?.length ?? 1) > 1 ? h.pots!.map((p, i) => `${i ? `side ${i}` : 'main'} ${units(p.amount)} ${p.winners.map((w) => name(w.playerId)).join('/')}`).join(', ') : h.winners.length > 1 ? 'split pot' : ''].filter(Boolean).join(', ');
      if (h.dealerId) dealerChip(ctx, x + 112, y + 82, 11);
      text(ctx, meta, x + (h.dealerId ? 130 : 100), y + 89, font(400, 20), C.muted, 'left', 420);
      caption(ctx, 'Pot', W - PAD - 28, y + 40, { q: 'units', size: 17, align: 'right' });
      text(ctx, `${units(h.pot)}`, W - PAD - 28, y + 84, font(400, 46, 'display'), C.text, 'right');
      let cy = y + 110;
      if (h.boardNA) badge(ctx, x + 100, cy + 6, 'No board', true, 18);
      else if (h.board.length) cardsRow(ctx, x + 100, cy - 2, h.board, 32, 5);
      else text(ctx, 'Won before the flop', x + 100, cy + 28, font(400, 20), C.muted);
      cy += 50;
      for (const s of shown) {
        const v = !h.boardNA && h.board.length === 5 && s.cards.length === 2 ? bestHand([...s.cards, ...h.board]) : null;
        const won = h.winners.some((w) => w.playerId === s.playerId);
        text(ctx, name(s.playerId), x + 100, cy + 40, font(600, 24), C.text, 'left', 200);
        cardsRow(ctx, x + 310, cy + 10, s.cards, 36, 5);
        if (v) text(ctx, `${v.name}${won ? ' (won)' : ''}`, x + 410, cy + 40, font(400, 22), won ? C.pos : C.muted, 'left', 360);
        cy += 70;
      }
      if (flags.length) {
        let px = x + 100;
        for (const f of flags) {
          px += badge(ctx, px, cy + 6, f, f !== 'All-in', 17) + 10;
          if (px > W - PAD - 140) break;
        }
        cy += 52;
      }
      noteLines.forEach((l, i) => text(ctx, l, x + 100, cy + 26 + i * 30, font(400, 21), C.muted));
    },
  };
}

/* ------------------------------- tiers ------------------------------- */

export function renderReport(g: Game, tier: Tier, name: NameFn, theme: ReportTheme = 'dark'): HTMLCanvasElement[] {
  setReportTheme(theme);
  const blocks: Block[] = [header(g, tier), hero(g)];
  if (tier === 'summary') {
    blocks.push(spacer(10), callouts(g, name), ...resultRows(g, name, false), spacer(10), ...payments(g, name));
  } else {
    blocks.push(...resultRows(g, name, true), sectionTitle('Game stats'), statTiles(g, name), buyInChart(g),
      ...highlights(g, name), ...playerStats(g, name), spacer(10), ...payments(g, name));
    if (tier === 'full') {
      blocks.push(...buyInLog(g, name));
      blocks.push(sectionTitle('Hands', `${g.hands.length} logged, pots in units`));
      if (!g.hands.length) blocks.push({ h: 80, draw: (ctx, y) => text(ctx, 'No hands were logged.', PAD, y + 46, font(400, 26), C.muted) });
      for (const h of g.hands) blocks.push(handRow(h, name));
    }
  }
  blocks.push(spacer(20));
  const note = g.type === 'cash' ? `Money in ${g.currency}, chips in units (multiplier ${money(g.unitValue, g.currency)}).` : `Money in ${g.currency}.`;
  return paginate(blocks, { maxH: 7200, top: contHeader(g, tier), footer: footer(g, note) });
}

export function totalNet(g: Game) {
  return round2(gameResults(g).reduce((a, r) => a + r.net, 0));
}

/* ---------------------------- leaderboard image ---------------------------- */

export function renderStandings(
  games: Game[], board: { playerId: ID; games: number; net: number; wins: number; winRate: number }[],
  name: NameFn, currency: string, scope: string, theme: ReportTheme = 'dark',
): HTMLCanvasElement[] {
  setReportTheme(theme);
  const latest = games[games.length - 1];
  const blocks: Block[] = [{
    h: 300,
    draw: (ctx, y) => {
      feltMark(ctx, PAD, y + 64, 58);
      text(ctx, 'Felt', PAD + 46, y + 108, font(400, 40, 'display'), C.text);
      caption(ctx, 'Leaderboard', W - PAD, y + 104, { align: 'right' });
      text(ctx, 'Standings', PAD, y + 214, font(400, 88, 'display'), C.text);
      text(ctx, `${scope}, ${games.length} Games, ${board.length} Players`, PAD, y + 260, font(400, 26), C.muted, 'left', INNER);
    },
  }, {
    h: 70,
    draw: (ctx, y) => {
      caption(ctx, 'Player', PAD + 32, y + 50);
      caption(ctx, 'Games', W - PAD - 440, y + 50, { align: 'right' });
      caption(ctx, 'Win rate', W - PAD - 270, y + 50, { align: 'right' });
      caption(ctx, 'Net', W - PAD - 32, y + 50, { q: currency, align: 'right' });
    },
  }];
  board.forEach((b, i) => {
    blocks.push({
      h: 108,
      draw: (ctx, y) => {
        panel(ctx, PAD, y + 6, INNER, 96, 28);
        if (i === 0 && b.net > 0) rrect(ctx, PAD, y + 6, INNER, 96, 28, undefined, C.accent, 3);
        const mid = y + 54;
        text(ctx, String(i + 1), PAD + 40, mid + 10, font(500, 28, 'mono'), C.muted, 'center');
        avatar(ctx, PAD + 104, mid, 28, name(b.playerId));
        text(ctx, name(b.playerId), PAD + 150, mid + 13, font(400, 40, 'display'), C.text, 'left', 300);
        text(ctx, String(b.games), W - PAD - 440, mid + 10, font(500, 28, 'mono'), C.muted, 'right');
        text(ctx, `${Math.round(b.winRate * 100)}%`, W - PAD - 270, mid + 10, font(500, 28, 'mono'), C.muted, 'right');
        const d = deltaText(b.net, (a) => money(a, ''));
        text(ctx, d.s, W - PAD - 32, mid + 12, font(500, 32, 'mono'), d.color, 'right');
      },
    });
  });
  blocks.push(spacer(20));
  return paginate(blocks, {
    maxH: 7200,
    top: () => ({ h: 110, draw: (ctx, y) => { feltMark(ctx, PAD, y + 40, 44); caption(ctx, 'Standings, continued', PAD + 40, y + 74); } }),
    footer: (p, n) => ({
      h: 120,
      draw: (ctx, y) => {
        ctx.fillStyle = C.line;
        ctx.fillRect(PAD, y + 30, INNER, 2);
        text(ctx, `Source: Felt game log (${games.length} closed games${latest ? `, latest ${dateLabel(latest.startedAt)}` : ''}). Net in ${currency}.`, PAD, y + 76, font(400, 22), C.muted, 'left', INNER - 120);
        if (n > 1) text(ctx, `${p + 1} of ${n}`, W - PAD, y + 76, font(500, 22, 'mono'), C.muted, 'right');
      },
    }),
  });
}
