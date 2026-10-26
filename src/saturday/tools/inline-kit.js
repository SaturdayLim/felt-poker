#!/usr/bin/env node
// Makes a single-file HTML: inlines the kit's CSS and JS, and embeds the fonts as base64.
// For deliverables that must be one file (an emailed report, Apps Script App.html, Worldmap-style builds).
//   node tools/inline-kit.js page.html page.single.html
// Only touches <link> and <script> tags that point at this kit (tokens.css, saturday.css, skin-*.css, saturday.js).
// Fonts the page does not use are still embedded; delete @font-face lines you do not need to save about 30KB each.
const fs = require('fs');
const path = require('path');

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Usage: node tools/inline-kit.js <input.html> <output.html>');
  process.exit(1);
}
const baseDir = path.dirname(path.resolve(input));
let html = fs.readFileSync(input, 'utf8');
const KIT_CSS = /(?:^|\/)(tokens|saturday|skin-[a-z0-9-]+)\.css$/;
const KIT_JS = /(?:^|\/)saturday\.js$/;

const embedFonts = (css, cssFile) => css.replace(/url\(['"]?([^'")]+\.woff2)['"]?\)/g, (m, rel) => {
  const fontPath = path.resolve(path.dirname(cssFile), rel);
  if (!fs.existsSync(fontPath)) { console.warn('Font not found, left as link:', fontPath); return m; }
  return `url(data:font/woff2;base64,${fs.readFileSync(fontPath).toString('base64')})`;
});

let count = 0;
html = html.replace(/<link\b[^>]*\brel=["']preload["'][^>]*\.woff2[^>]*>\s*/g, () => { count++; return ''; });
html = html.replace(/<link\b[^>]*\bhref=["']([^"']+\.css)["'][^>]*>/g, (tag, href) => {
  if (!/rel=["']stylesheet["']/.test(tag) || !KIT_CSS.test(href)) return tag;
  const file = path.resolve(baseDir, href);
  count++;
  return `<style data-sat-inline="${path.basename(href)}">\n${embedFonts(fs.readFileSync(file, 'utf8'), file)}\n</style>`;
});
html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/g, (tag, src) => {
  if (!KIT_JS.test(src)) return tag;
  count++;
  // Inline scripts ignore defer, so wait for the DOM the same way the deferred file did.
  // "</script" inside the code (even in a comment) would end the tag early, so escape it.
  const js = fs.readFileSync(path.resolve(baseDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script data-sat-inline="saturday.js">\ndocument.addEventListener('DOMContentLoaded', function () {\n${js}\n});\n</script>`;
});

// Logo files and favicon from the kit's assets/ folder become data URIs.
const MIME = { svg: 'image/svg+xml', png: 'image/png' };
html = html.replace(/\b(href|src)=["']([^"']*assets\/[^"']+\.(svg|png))["']/g, (m, attr, rel, ext) => {
  const file = path.resolve(baseDir, rel);
  if (!fs.existsSync(file)) { console.warn('Asset not found, left as link:', file); return m; }
  count++;
  return `${attr}="data:${MIME[ext]};base64,${fs.readFileSync(file).toString('base64')}"`;
});

fs.writeFileSync(output, html);
console.log(`Inlined ${count} kit tag(s). Wrote ${output} (${Math.round(fs.statSync(output).size / 1024)} KB).`);
