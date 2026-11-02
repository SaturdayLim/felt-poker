/* Prints the trial report model for a Felt backup, for a quick check in the terminal.
   Run: npx vite-node scripts/trial-data.ts trial/potato-backup.json */
import { readFileSync } from 'node:fs';
import { buildModel } from './trial-model';

const [, , src = 'trial/potato-backup.json'] = process.argv;
const m = buildModel(JSON.parse(readFileSync(src, 'utf-8')));
console.log(m.game, m.date, `${m.hands} hands, ${m.minutes} min, median ${m.medianSec}s`, JSON.stringify(m.reach));
for (const p of m.players) {
  const st = p.s.style;
  console.log(`\n${p.name}: net ${p.net}, count ${p.count}, estimate ${p.estimate} (${p.off >= 0 ? '+' : ''}${p.off}). ${p.style}.`);
  console.log(`  AF ${(st.calls ? st.betsRaises / st.calls : 0).toFixed(2)}, 3-bet ${st.threeBet}/${st.threeBetOpp}, c-bet ${st.cbet}/${st.cbetOpp}, fold to c-bet ${st.foldCbet}/${st.foldCbetOpp}`);
  for (const t of p.insights) console.log('  -', t);
}
