# Felt — home game tracker

Offline Texas Hold'em tracker for a single phone. It runs as an installable web app, and all data stays in the phone's local storage.

- **Cash games:** amounts are in units (1 = SB, 2 = BB). Each game sets the unit's money value (default 1 = S$0.10).
- **Tournaments:** entries, re-entries, bust order and payouts.
- **Hand log:** pot, winner(s) including split pots, board (or n/a), shown hole cards, dealer, all-in or straddle, tags and notes.
- **Settle-up:** shared expenses, fewest-transfer "who pays whom", and a resolved toggle for each payment.
- **Insights:** all-time standings and a comparison chart.
- **Reports:** Summary, Detailed and Full as PNG, plus Data as CSV, sent through the phone's share sheet.

## Design

Felt uses the **Saturday Signature** kit (v1.0.3), copied into `src/saturday/`. Its rules are in `src/saturday/SIGNATURE.md` and `src/saturday/WRITING.md`.

- **Kit parts:** `.sat-glass` and `.sat-glass-2` surfaces, `.sat-btn`, `.sat-seg`, `.sat-chip`, `.sat-switch`, `.sat-tip`, `.sat-sheet` and `.sat-bottombar`. The fonts are Instrument Serif, Geist and Geist Mono.
- **Felt's own additions:** `src/styles.css` adds only what the kit lacks (tab bar, playing cards, card picker, seat table, list rows), using `--sat-*` tokens.
- **Theme:** `src/theme.ts` drives the theme from React state and uses the kit's `sat-theme` key, so `saturday.js` is not loaded.
- **Report images:** these are drawn on canvas in `src/report/canvas.ts`, with colours copied from `src/saturday/tokens/tokens.json`. If the tokens change, update both.
- **Brand mark:** two stacked poker chips forming a vertical figure-eight, a companion to the Saturday double-layered vertical infinity. It is in `src/brand/felt-mark.svg` and uses the kit's mark colour. The app icon and favicon are in `public/`.

Do not edit the generated kit files (`css/tokens.css`, `tokens/tailwind*`). Change `tokens/tokens.json`, then run `node src/saturday/tools/build-tokens.js` and `node src/saturday/tools/check-contrast.js`.

## Develop

```
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and publishes it to GitHub Pages.
In the repo, set **Settings → Pages → Source** to **GitHub Actions**.

## Install on iPhone

Open the Pages URL in Safari, tap **Share**, then **Add to Home Screen**. After that first load the app works offline.
Deleting the home-screen app deletes its data, so use **Settings → Backup** now and then.
