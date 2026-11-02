/* Builds the report page into one self-contained template: public/report-template.html (git-ignored).
   The app fills it with a game's figures on the phone (src/report/htmlReport.ts).
   Run: npm run report:template   (add --if-missing to skip when the file exists) */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '<!--FELT_REPORT_DATA-->';
const out = 'public/report-template.html';
if (process.argv.includes('--if-missing') && existsSync(out)) process.exit(0);

execSync('npx vite build -c vite.trial.config.ts --logLevel warn', { stdio: 'inherit' });
const dist = 'trial/dist';
let html = readFileSync(join(dist, 'trial-report.html'), 'utf-8');
const assets = readdirSync(join(dist, 'assets'));
for (const f of assets.filter((x) => x.endsWith('.css'))) {
  html = html.replace(new RegExp(`<link[^>]+href="[^"]*${f}"[^>]*>`), () => `<style>${readFileSync(join(dist, 'assets', f), 'utf-8')}</style>`);
}
for (const f of assets.filter((x) => x.endsWith('.js'))) {
  const js = readFileSync(join(dist, 'assets', f), 'utf-8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(new RegExp(`<script[^>]+src="[^"]*${f}"[^>]*></script>`), () => `<script type="module">${js}</script>`);
}
if (!html.includes(MARKER)) throw new Error(`scripts/trial-report.html lost the ${MARKER} marker`);
writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
