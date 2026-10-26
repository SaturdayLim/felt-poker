import type { Game, Hand, ID } from '../types';
import {
  buyInTimeline, gameResults, handStats, playerResult, round2, timePlayed, totalBuyInUnits, totalPotMoney,
} from '../lib/calc';
import { bestHand } from '../lib/cards';
import { dateLabel, duration, money, stakesLabel, timeLabel, units } from '../lib/format';
import {
  C, INNER, PAD, W, avatar, cardsRow, dealerChip, font, hexA, paginate, panel, pill, rrect, sectionTitle,
  setReportTheme, spacer, text, textWidth, wrap, type Block, type ReportTheme,
} from './canvas';

export type Tier = 'summary' | 'detailed' | 'full';
export const TIER_LABEL: Record<Tier, string> = { summary: 'Summary', detailed: 'Detailed', full: 'Full' };

type NameFn = (id: ID) => string;

const toneC = (n: number) => (n > 0.004 ? C.up : n < -0.004 ? C.down : C.inkSoft);

/* ------------------------------- blocks ------------------------------- */

function header(g: Game, tier: Tier): Block {
  const titleLines = wrap(g.name, font(600, 66, 'display'), INNER).slice(0, 2);
  const h = 150 + titleLines.length * 72 + 40;
  return {
    h,
    draw: (ctx, y) => {
      text(ctx, `${TIER_LABEL[tier]} report`, PAD, y + 96, font(700, 25), C.accent);
      titleLines.forEach((l, i) => text(ctx, l, PAD, y + 172 + i * 72, font(600, 66, 'display'), C.ink));
      const ended = g.endedAt ?? Date.now();
      const sub = `${dateLabel(g.startedAt)} · ${duration(ended - g.startedAt)} · ${stakesLabel(g)}`;
      text(ctx, sub, PAD, y + 172 + titleLines.length * 72 - 20, font(400, 26), C.inkSoft, 'left', INNER);
    },
  };
}

function contHeader(g: Game, tier: Tier): (page: number) => Block {
  return (page) => ({
    h: 120,
    draw: (ctx, y) => {
      text(ctx, `${TIER_LABEL[tier]} report, page ${page + 1}`, PAD, y + 70, font(700, 23), C.accent);
      text(ctx, g.name, W - PAD, y + 70, font(600, 28, 'display'), C.inkSoft, 'right', INNER * 0.55);
    },
  });
}

function footer(g: Game): (page: number, pages: number) => Block {
  return (page, pages) => ({
    h: 110,
    draw: (ctx, y) => {
      ctx.fillStyle = C.edge;
      ctx.fillRect(PAD, y + 30, INNER, 2);
      text(ctx, `Felt · ${g.playerIds.length} players · ${g.hands.length} hands`, PAD, y + 78, font(400, 22), C.inkFaint);
      text(ctx, pages > 1 ? `${page + 1} / ${pages}` : new Date().toLocaleDateString('en-SG'), W - PAD, y + 78, font(600, 21, true), C.inkFaint, 'right');
    },
  });
}

function hero(g: Game): Block {
  return {
    h: 230,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 10, INNER, 200);
      text(ctx, g.type === 'cash' ? 'In play' : 'Prize pool', PAD + 36, y + 66, font(700, 24), C.inkSoft);
      text(ctx, money(totalPotMoney(g), g.currency), PAD + 36, y + 160, font(600, 84, true), C.ink);
      const right = g.type === 'cash'
        ? [`${units(totalBuyInUnits(g))} units`, `${g.buyIns.length} buy-ins`, `${g.hands.length} hands`]
        : [`${g.buyIns.length} entries`, `${g.playerIds.length} players`, `${g.hands.length} hands`];
      right.forEach((s, i) => text(ctx, s, W - PAD - 36, y + 80 + i * 44, font(400, 26), i === 0 ? C.ink : C.inkSoft, 'right'));
    },
  };
}

function rankingRows(g: Game, name: NameFn, compact: boolean): Block[] {
  const res = gameResults(g);
  const rowH = compact ? 92 : 112;
  const out: Block[] = [sectionTitle('Results', g.type === 'cash' ? 'in, out, net' : 'place, net')];
  const maxAbs = Math.max(0.01, ...res.map((r) => Math.abs(r.net)));
  res.forEach((r, i) => {
    out.push({
      h: rowH,
      draw: (ctx, y) => {
        const top = i === 0 && r.net > 0;
        rrect(ctx, PAD, y + 6, INNER, rowH - 12, 12, C.paper, top ? C.up : C.edge, top ? 3 : 2);
        const mid = y + rowH / 2;
        text(ctx, String(i + 1), PAD + 34, mid + 10, font(600, 28, true), i < 3 ? C.amber : C.inkFaint, 'center');
        avatar(ctx, PAD + 94, mid, compact ? 26 : 30, name(r.playerId));
        text(ctx, name(r.playerId), PAD + 140, mid - (compact ? 2 : 6), font(600, compact ? 31 : 35, 'display'), C.ink, 'left', 340);
        const sub = g.type === 'cash'
          ? `${money(r.in, g.currency)} in, ${money(r.out, g.currency)} out · ${r.buyIns} buy-in${r.buyIns === 1 ? '' : 's'}`
          : `${r.place ? `Place ${r.place} · ` : ''}${r.buyIns} entr${r.buyIns === 1 ? 'y' : 'ies'} · won ${money(r.out, g.currency)}`;
        text(ctx, sub, PAD + 140, mid + (compact ? 30 : 34), font(400, 22), C.inkSoft, 'left', 420);
        // net bar
        const barW = 150, bx = W - PAD - 250 - barW;
        rrect(ctx, bx, mid - 5, barW, 10, 5, C.edge);
        const fw = Math.max(6, (Math.abs(r.net) / maxAbs) * barW);
        rrect(ctx, r.net >= 0 ? bx : bx + barW - fw, mid - 5, fw, 10, 5, toneC(r.net));
        text(ctx, money(r.net, g.currency, { sign: true }), W - PAD - 30, mid + (g.type === 'cash' ? 0 : 12), font(600, 36, true), toneC(r.net), 'right');
        if (g.type === 'cash')
          text(ctx, `${units(r.outUnits - r.inUnits, { sign: true })} units`, W - PAD - 30, mid + 34, font(400, 21), C.inkFaint, 'right');
      },
    });
  });
  return out;
}

function callouts(g: Game, name: NameFn): Block {
  const res = gameResults(g);
  const best = res[0], worst = res[res.length - 1];
  return {
    h: 210,
    draw: (ctx, y) => {
      const w = (INNER - 20) / 2;
      const card = (x: number, label: string, color: string, pid: ID | undefined, v: number) => {
        panel(ctx, x, y + 10, w, 180);
        text(ctx, label, x + 30, y + 60, font(700, 23), color);
        text(ctx, pid ? name(pid) : '—', x + 30, y + 114, font(600, 40, 'display'), C.ink, 'left', w - 60);
        text(ctx, money(v, g.currency, { sign: true }), x + 30, y + 160, font(600, 32, true), color);
      };
      card(PAD, 'Up the most', C.up, best?.playerId, best?.net ?? 0);
      card(PAD + w + 20, 'Down the most', C.down, worst?.playerId, worst?.net ?? 0);
    },
  };
}

function settlements(g: Game, name: NameFn): Block[] {
  if (!g.transfers.length) {
    return [sectionTitle('Payments'), {
      h: 90, draw: (ctx, y) => text(ctx, g.status === 'closed' ? 'Nobody owes anything.' : 'Payments are worked out when the game closes.', PAD, y + 50, font(400, 26), C.inkSoft),
    }];
  }
  const open = g.transfers.filter((t) => !t.resolved).length;
  const out: Block[] = [sectionTitle('Payments', open ? `${open} to go` : 'all paid')];
  g.transfers.forEach((t) => {
    out.push({
      h: 84,
      draw: (ctx, y) => {
        rrect(ctx, PAD, y + 6, INNER, 72, 12, C.paper, C.edge, 2);
        text(ctx, name(t.from), PAD + 30, y + 52, font(700, 28), C.ink, 'left', 280);
        const fw = Math.min(280, textWidth(name(t.from), font(700, 28)));
        text(ctx, 'pays', PAD + 44 + fw, y + 52, font(400, 26), C.inkFaint);
        text(ctx, name(t.to), PAD + 44 + fw + textWidth('pays', font(400, 26)) + 14, y + 52, font(700, 28), C.ink, 'left', 280);
        text(ctx, money(t.amount, g.currency), W - PAD - 30 - (t.resolved ? 130 : 0), y + 52, font(600, 30, true), C.ink, 'right');
        if (t.resolved) pill(ctx, W - PAD - 140, y + 25, 'Paid', C.up, 18);
      },
    });
  });
  return out;
}

function statTiles(g: Game, name: NameFn): Block {
  const hs = handStats(g);
  const ended = g.endedAt ?? Date.now();
  const mostWins = Object.entries(hs.handsWon).sort((a, b) => b[1] - a[1])[0];
  const rebuys = g.type === 'cash' ? Math.max(0, g.buyIns.length - g.playerIds.length) : Math.max(0, g.buyIns.length - g.playerIds.length);
  const tiles: [string, string, string, string?][] = [
    ['Hands', String(hs.hands), `${duration(ended - g.startedAt)} · ${hs.hands ? Math.round(hs.hands / Math.max(1, (ended - g.startedAt) / 3600000)) : 0}/hr`],
    ['Average pot', hs.hands ? `${units(Math.round(hs.avgPot))}` : '—', g.type === 'cash' && hs.hands ? `units, ${money(hs.avgPot * g.unitValue, g.currency)}` : 'units'],
    ['Biggest pot', hs.biggest ? `${units(hs.biggest.pot)}` : '—', hs.biggest ? `Hand ${hs.biggest.n}, ${hs.biggest.winners.map(name).join(' and ')}` : ''],
    ['Most hands won', mostWins ? name(mostWins[0]) : '—', mostWins ? `${mostWins[1]} hands` : ''],
    ['All-ins', String(hs.allIns), `${hs.showdowns} showdowns`],
    [g.type === 'cash' ? 'Rebuys' : 'Re-entries', String(rebuys), `${g.buyIns.length} ${g.type === 'cash' ? 'buy-ins' : 'entries'} in all`],
  ];
  const rows = Math.ceil(tiles.length / 2);
  const th = 170;
  return {
    h: rows * (th + 20) + 10,
    draw: (ctx, y) => {
      const w = (INNER - 20) / 2;
      tiles.forEach(([l, v, d], i) => {
        const x = PAD + (i % 2) * (w + 20);
        const ty = y + 10 + Math.floor(i / 2) * (th + 20);
        panel(ctx, x, ty, w, th);
        text(ctx, l, x + 28, ty + 46, font(700, 22), C.inkSoft);
        text(ctx, v, x + 28, ty + 106, /^[\d,.—-]+$/.test(v) ? font(600, 42, true) : font(600, 40, 'display'), C.ink, 'left', w - 56);
        text(ctx, d, x + 28, ty + 144, font(400, 21), C.inkFaint, 'left', w - 56);
      });
    },
  };
}

function buyInChart(g: Game): Block {
  const pts = buyInTimeline(g);
  return {
    h: 330,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 10, INNER, 300);
      text(ctx, g.type === 'cash' ? 'Money on the table' : 'Prize pool', PAD + 30, y + 58, font(700, 23), C.inkSoft);
      const x0 = PAD + 30, x1 = W - PAD - 30, y0 = y + 90, y1 = y + 280;
      const t0 = g.startedAt, t1 = Math.max(g.endedAt ?? Date.now(), t0 + 60000);
      const vmax = Math.max(1, ...pts.map((p) => p.v));
      const X = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
      const Y = (v: number) => y1 - (v / vmax) * (y1 - y0);
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0].t), Y(pts[0].v));
        for (let i = 1; i < pts.length; i++) { ctx.lineTo(X(pts[i].t), Y(pts[i - 1].v)); ctx.lineTo(X(pts[i].t), Y(pts[i].v)); }
        ctx.lineTo(x1, Y(pts[pts.length - 1].v));
      };
      trace();
      ctx.lineTo(x1, y1); ctx.lineTo(X(pts[0].t), y1); ctx.closePath();
      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, hexA(C.accent, 0.3)); grad.addColorStop(1, hexA(C.accent, 0));
      ctx.fillStyle = grad; ctx.fill();
      trace();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
      const last = pts[pts.length - 1].v;
      const label = g.type === 'cash' ? money(last * g.unitValue, g.currency) : money(last, g.currency);
      text(ctx, label, x1, y + 58, font(600, 30, true), C.ink, 'right');
      text(ctx, timeLabel(t0), x0, y + 302, font(400, 19), C.inkFaint);
      text(ctx, timeLabel(t1), x1, y + 302, font(400, 19), C.inkFaint, 'right');
    },
  };
}

function playerStatsTable(g: Game, name: NameFn): Block[] {
  const hs = handStats(g);
  const rows = gameResults(g);
  const out: Block[] = [sectionTitle('Players', 'hands won, units won, time')];
  const maxWon = Math.max(1, ...rows.map((r) => hs.handsWon[r.playerId] ?? 0));
  rows.forEach((r) => {
    const won = hs.handsWon[r.playerId] ?? 0;
    out.push({
      h: 76,
      draw: (ctx, y) => {
        text(ctx, name(r.playerId), PAD, y + 46, font(700, 27), C.ink, 'left', 230);
        const bx = PAD + 250, bw = 300;
        rrect(ctx, bx, y + 30, bw, 14, 7, C.edge);
        rrect(ctx, bx, y + 30, Math.max(8, (won / maxWon) * bw), 14, 7, C.accent);
        text(ctx, `${won}`, bx + bw + 20, y + 47, font(600, 26, true), C.ink);
        text(ctx, `${units(hs.potsWon[r.playerId] ?? 0)}`, W - PAD - 150, y + 47, font(500, 23, true), C.inkSoft, 'right');
        text(ctx, duration(timePlayed(g, r.playerId)), W - PAD, y + 47, font(500, 23, true), C.inkSoft, 'right');
      },
    });
  });
  return out;
}

function highlightHand(h: Hand, label: string, sub: string, name: NameFn, cards?: string[]): Block {
  return {
    h: 250,
    draw: (ctx, y) => {
      panel(ctx, PAD, y + 10, INNER, 230);
      text(ctx, label, PAD + 30, y + 58, font(700, 23), C.amber);
      text(ctx, sub, PAD + 30, y + 110, font(600, 38, 'display'), C.ink, 'left', INNER - 60);
      text(ctx, `Hand ${h.n} · won by ${h.winners.map((w) => name(w.playerId)).join(' and ')} · ${units(h.pot)} units`, PAD + 30, y + 150, font(400, 23), C.inkSoft, 'left', INNER - 60);
      let x = PAD + 30;
      if (cards?.length) { x += cardsRow(ctx, x, y + 168, cards, 44, 6) + 24; }
      if (!h.boardNA && h.board.length) cardsRow(ctx, x, y + 168, h.board, 44, 6);
      else if (h.boardNA) pill(ctx, x, y + 178, 'No board', C.inkSoft, 18);
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
    out.push(highlightHand(h, 'Biggest pot', g.type === 'cash' ? `${units(h.pot)} units, ${money(h.pot * g.unitValue, g.currency)}` : `${units(h.pot)} chips`, name));
  }
  if (hs.bestShown) {
    const h = g.hands.find((x) => x.id === hs.bestShown!.handId)!;
    out.push(highlightHand(h, 'Best hand shown', `${name(hs.bestShown.playerId)}, ${hs.bestShown.name.toLowerCase()}`, name, hs.bestShown.cards));
  }
  const tags = Object.entries(hs.tagCounts).sort((a, b) => b[1] - a[1]);
  if (tags.length) {
    out.push({
      h: 90,
      draw: (ctx, y) => {
        let x = PAD;
        for (const [t, n] of tags) {
          const label = `${t} ×${n}`;
          if (x + textWidth(label.toUpperCase(), font(700, 20)) + 40 > W - PAD) break;
          x += pill(ctx, x, y + 26, label, C.amber, 20) + 12;
        }
      },
    });
  }
  return out;
}

function ledger(g: Game, name: NameFn): Block[] {
  const out: Block[] = [sectionTitle(g.type === 'cash' ? 'Buy-ins' : 'Entries', 'time and amount')];
  for (const pid of [...g.playerIds].sort((a, b) => (g.seats[a] ?? 0) - (g.seats[b] ?? 0))) {
    const ev = [
      ...g.buyIns.filter((b) => b.playerId === pid).map((b) => `${timeLabel(b.at)} +${g.type === 'cash' ? units(b.amount) : money(b.amount, g.currency)}`),
      ...g.cashOuts.filter((c) => c.playerId === pid).map((c) => `left with ${units(c.amount)}`),
    ];
    const lines = wrap(ev.join(' · ') || '—', font(400, 22), INNER - 260);
    const r = playerResult(g, pid);
    out.push({
      h: 30 + lines.length * 32 + 20,
      draw: (ctx, y) => {
        text(ctx, `${name(pid)}`, PAD, y + 50, font(600, 27, 'display'), C.ink, 'left', 200);
        text(ctx, `Seat ${g.seats[pid] ?? '–'}`, PAD, y + 80, font(400, 19), C.inkFaint);
        lines.forEach((l, i) => text(ctx, l, PAD + 230, y + 50 + i * 32, font(400, 22), C.inkSoft));
        text(ctx, money(r.net, g.currency, { sign: true }), W - PAD, y + 50, font(600, 24, true), toneC(r.net), 'right');
      },
    });
  }
  if (g.expenses.length) {
    out.push(sectionTitle('Expenses', money(g.expenses.reduce((a, e) => a + e.amount, 0), g.currency)));
    for (const e of g.expenses) {
      out.push({
        h: 64,
        draw: (ctx, y) => {
          text(ctx, e.label, PAD, y + 40, font(700, 25), C.ink, 'left', 360);
          text(ctx, `${e.paidBy ? `${name(e.paidBy)} paid` : 'not paid yet'} · split ${e.splitAmong.length} ways`, PAD + 380, y + 40, font(400, 21), C.inkSoft, 'left', 380);
          text(ctx, money(e.amount, g.currency), W - PAD, y + 40, font(600, 25, true), C.ink, 'right');
        },
      });
    }
  }
  return out;
}

function handRow(g: Game, h: Hand, name: NameFn): Block {
  const shown = h.shown.filter((s) => s.cards.length);
  const noteLines = h.note ? wrap(h.note, font(400, 21), INNER - 60) : [];
  const flags = [h.allIn && 'All-in', h.straddle && 'Straddle', ...h.tags].filter(Boolean) as string[];
  const height = 150 + shown.length * 70 + (flags.length ? 50 : 0) + noteLines.length * 30 + 16;
  return {
    h: height,
    draw: (ctx, y) => {
      rrect(ctx, PAD, y + 8, INNER, height - 16, 12, C.paper, C.edge, 2);
      const x = PAD + 28;
      text(ctx, `${h.n}`, x, y + 56, font(600, 26, true), C.inkFaint);
      text(ctx, timeLabel(h.at), x, y + 86, font(400, 18), C.inkFaint);
      const winners = h.winners.map((w) => (h.winners.length > 1 ? `${name(w.playerId)} ${units(w.amount)}` : name(w.playerId))).join(' · ');
      text(ctx, winners || 'No winner', x + 96, y + 56, font(600, 31, 'display'), C.ink, 'left', 480);
      const meta = [h.dealerId ? `${name(h.dealerId)} dealt` : '', h.winners.length > 1 ? 'split pot' : ''].filter(Boolean).join(' · ');
      if (h.dealerId) dealerChip(ctx, x + 108, y + 80, 11);
      text(ctx, meta, x + (h.dealerId ? 126 : 96), y + 87, font(400, 20), C.inkSoft, 'left', 420);
      text(ctx, `${units(h.pot)}`, W - PAD - 28, y + 56, font(600, 32, true), C.ink, 'right');
      text(ctx, g.type === 'cash' ? `units, ${money(h.pot * g.unitValue, g.currency)}` : 'chips', W - PAD - 28, y + 87, font(400, 20), C.inkFaint, 'right');
      let cy = y + 108;
      if (h.boardNA) pill(ctx, x + 96, cy + 4, 'No board', C.inkSoft, 18);
      else if (h.board.length) cardsRow(ctx, x + 96, cy - 4, h.board, 32, 5);
      else text(ctx, 'Won before the flop', x + 96, cy + 26, font(400, 20), C.inkFaint);
      cy += 46;
      for (const s of shown) {
        const v = !h.boardNA && h.board.length === 5 && s.cards.length === 2 ? bestHand([...s.cards, ...h.board]) : null;
        const won = h.winners.some((w) => w.playerId === s.playerId);
        text(ctx, name(s.playerId), x + 96, cy + 40, font(700, 24), won ? C.up : C.ink, 'left', 200);
        cardsRow(ctx, x + 310, cy + 10, s.cards, 36, 5);
        if (v) text(ctx, v.name, x + 410, cy + 40, font(400, 22), won ? C.up : C.inkSoft, 'left', 360);
        cy += 70;
      }
      if (flags.length) {
        let px = x + 96;
        for (const f of flags) {
          const col = f === 'All-in' ? C.down : f === 'Straddle' ? C.accent : C.amber;
          px += pill(ctx, px, cy + 6, f, col, 17) + 10;
          if (px > W - PAD - 120) break;
        }
        cy += 50;
      }
      noteLines.forEach((l, i) => text(ctx, l, x + 96, cy + 26 + i * 30, font(400, 21), C.inkSoft));
    },
  };
}

/* ------------------------------- tiers ------------------------------- */

export function renderReport(g: Game, tier: Tier, name: NameFn, theme: ReportTheme = 'dark'): HTMLCanvasElement[] {
  setReportTheme(theme);
  const blocks: Block[] = [header(g, tier), hero(g)];
  if (tier === 'summary') {
    blocks.push(spacer(10), callouts(g, name), ...rankingRows(g, name, false), spacer(10), ...settlements(g, name));
  } else {
    blocks.push(...rankingRows(g, name, true), sectionTitle('Game statistics'), statTiles(g, name), buyInChart(g),
      ...highlights(g, name), ...playerStatsTable(g, name), spacer(10), ...settlements(g, name));
    if (tier === 'full') {
      blocks.push(...ledger(g, name));
      blocks.push(sectionTitle('Hands', `${g.hands.length} logged`));
      if (!g.hands.length) blocks.push({ h: 80, draw: (ctx, y) => text(ctx, 'No hands were logged.', PAD, y + 46, font(400, 26), C.inkSoft) });
      for (const h of g.hands) blocks.push(handRow(g, h, name));
    }
  }
  blocks.push(spacer(20));
  return paginate(blocks, { maxH: 7200, top: contHeader(g, tier), footer: footer(g) });
}

export function totalNet(g: Game) {
  return round2(gameResults(g).reduce((a, r) => a + r.net, 0));
}

/* ---------------------------- standings image ---------------------------- */

export function renderStandings(
  games: Game[], board: { playerId: ID; games: number; net: number; wins: number; winRate: number }[],
  name: NameFn, currency: string, scope: string, theme: ReportTheme = 'dark',
): HTMLCanvasElement[] {
  setReportTheme(theme);
  const blocks: Block[] = [{
    h: 260,
    draw: (ctx, y) => {
      text(ctx, `Leaderboard · ${scope}`, PAD, y + 96, font(700, 25), C.accent);
      text(ctx, 'Standings', PAD, y + 176, font(600, 68, 'display'), C.ink);
      text(ctx, `${games.length} games · ${board.length} players · ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`, PAD, y + 226, font(400, 26), C.inkSoft);
    },
  }, {
    h: 70,
    draw: (ctx, y) => {
      text(ctx, 'Player', PAD + 30, y + 50, font(700, 22), C.inkFaint);
      text(ctx, 'Games', W - PAD - 420, y + 50, font(700, 22), C.inkFaint, 'right');
      text(ctx, 'Won', W - PAD - 270, y + 50, font(700, 22), C.inkFaint, 'right');
      text(ctx, 'Net', W - PAD - 30, y + 50, font(700, 22), C.inkFaint, 'right');
    },
  }];
  board.forEach((b, i) => {
    blocks.push({
      h: 104,
      draw: (ctx, y) => {
        const lead = i === 0 && b.net > 0;
        rrect(ctx, PAD, y + 6, INNER, 92, 12, C.paper, lead ? C.up : C.edge, lead ? 3 : 2);
        const mid = y + 52;
        text(ctx, String(i + 1), PAD + 40, mid + 10, font(600, 28, true), i < 3 ? C.amber : C.inkFaint, 'center');
        avatar(ctx, PAD + 104, mid, 28, name(b.playerId));
        text(ctx, name(b.playerId), PAD + 150, mid + 11, font(600, 33, 'display'), C.ink, 'left', 300);
        text(ctx, String(b.games), W - PAD - 420, mid + 10, font(500, 28, true), C.inkSoft, 'right');
        text(ctx, `${Math.round(b.winRate * 100)}%`, W - PAD - 270, mid + 10, font(500, 28, true), C.inkSoft, 'right');
        text(ctx, money(b.net, currency, { sign: true }), W - PAD - 30, mid + 12, font(600, 36, true), toneC(b.net), 'right');
      },
    });
  });
  blocks.push(spacer(20));
  const fakeGame = { name: 'Standings', playerIds: board.map((b) => b.playerId), hands: games.flatMap((g) => g.hands) } as unknown as Game;
  return paginate(blocks, {
    maxH: 7200,
    top: () => ({ h: 100, draw: (ctx, y) => text(ctx, 'Standings, continued', PAD, y + 64, font(700, 23), C.accent) }),
    footer: (p, n) => ({
      h: 110,
      draw: (ctx, y) => {
        ctx.fillStyle = C.edge;
        ctx.fillRect(PAD, y + 30, INNER, 2);
        text(ctx, `Felt · ${fakeGame.playerIds.length} players · ${fakeGame.hands.length} hands`, PAD, y + 78, font(400, 22), C.inkFaint);
        if (n > 1) text(ctx, `${p + 1} / ${n}`, W - PAD, y + 78, font(600, 21, true), C.inkFaint, 'right');
      },
    }),
  });
}
