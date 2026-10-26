#!/usr/bin/env node
// Worst-case contrast check for every skin and theme in tokens/tokens.json.
//   node tools/check-contrast.js
// Text sits on glass, and glass sits on the mesh. The check takes the brightest
// (or darkest) point of the mesh behind each glass level, so a pass here holds
// anywhere on the page. Exit code 1 if anything fails.
const fs = require('fs');
const path = require('path');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tokens', 'tokens.json'), 'utf8'));

const parse = s => {
  s = s.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    return { c: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)), a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  const p = m[1].split(',').map(Number);
  return { c: p.slice(0, 3), a: p[3] ?? 1 };
};
const over = (top, a, bottom) => top.map((v, i) => v * a + bottom[i] * (1 - a));
const lum = c => {
  const l = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// What must pass where. Text needs 4.5:1; the logo mark (a graphic) needs 3:1.
const TEXT = { text: 4.5, muted: 4.5, 'accent-text': 4.5, pos: 4.5, neg: 4.5, warn: 4.5, mark: 3 };
const FILLS = [['accent-fill', 'on-accent'], ['accent-fill-hover', 'on-accent']];

let fails = 0;
const rows = [];
for (const [skin, s] of Object.entries(T.skins)) {
  for (const mode of ['light', 'dark']) {
    const c = s[mode];
    const bg = parse(c.bg).c;
    const behind = [bg, ...['mesh-1', 'mesh-2', 'mesh-3'].map(k => over(parse(c[k]).c, c['mesh-opacity'], bg))];
    for (const level of ['glass-1', 'glass-2', 'solid-1', 'well-on-glass-1']) {
      let surfaces;
      if (level === 'well-on-glass-1') {
        const g = parse(c['glass-1']), w = parse(c.well);
        surfaces = behind.map(b => over(w.c, w.a, over(g.c, g.a, b)));
      } else {
        const g = parse(c[level]);
        surfaces = behind.map(b => over(g.c, g.a, b));
      }
      for (const [k, need] of Object.entries(TEXT)) {
        const worst = Math.min(...surfaces.map(sf => ratio(parse(c[k]).c, sf)));
        const ok = worst >= need;
        if (!ok) fails++;
        rows.push(`${ok ? 'PASS' : 'FAIL'}  ${skin}/${mode}  ${k.padEnd(11)} on ${level.padEnd(15)} ${worst.toFixed(2)}:1`);
      }
    }
    for (const [fill, on] of FILLS) {
      const r = ratio(parse(c[fill]).c, parse(c[on]).c);
      const ok = r >= 4.5;
      if (!ok) fails++;
      rows.push(`${ok ? 'PASS' : 'FAIL'}  ${skin}/${mode}  ${on} on ${fill}  ${r.toFixed(2)}:1`);
    }
  }
}
console.log(rows.join('\n'));
console.log(fails ? `\n${fails} check(s) failed.` : `\nAll ${rows.length} checks pass.`);
process.exit(fails ? 1 : 0);
