# Felt — home game tracker

Offline Texas Hold'em tracker for a single phone. It runs as an installable web app, and all data stays in the phone's local storage.

- **Cash games:** amounts are in chips (1 chip = 1 SB, so 2 = BB). Each game sets the money value of a chip, the multiplier (default S$0.10).
- **Tournaments:** entries, re-entries, bust order and payouts.
- **Live game:** two sub-pages. Players: slim cards with the seat (drag the grip to reorder), name (tap to rename), traffic light (green playing, tap for orange away, red cross to clock out), buy-ins (tap for the list, + to rebuy) and the stack estimate, shown as a range (~180-220) when some hands were logged without every wager. Hands: newest first, with Log hand on top.
- **Hand recorder:** tabs Setup, Pre-flop, Flop, Turn, River, Showdown; the stage and running pot stay in the header. Each street is a table of action boxes, one row per player in acting order and one column per pass around the table. Tap = call, tap again = fold, the keypad types a bet or raise. Empty boxes count as calls when the street closes. Cards at showdown can be skipped in one tap.
- **Groups:** players who play together. Group games settle together: every unpaid amount across them is netted into the fewest payments. Each group has its own leaderboard.
- **Settle-up:** shared expenses, fewest-transfer "who pays whom", and a resolved toggle for each payment.
- **Insights:** all-time standings and a comparison chart.
- **Reports:** Summary, Detailed and Full as PNG, plus Data as CSV, sent through the phone's share sheet.

## Design

Felt uses the **Saturday Signature** kit (v1.0.3), copied into `src/saturday/`. Its rules are in `src/saturday/SIGNATURE.md` and `src/saturday/WRITING.md`.

- **Kit parts:** `.sat-glass` and `.sat-glass-2` surfaces, `.sat-btn`, `.sat-seg`, `.sat-chip`, `.sat-switch`, `.sat-tip`, `.sat-sheet` and `.sat-bottombar`. The fonts are Instrument Serif, Geist and Geist Mono.
- **Felt's own additions:** `src/styles.css` adds only what the kit lacks (tab bar, playing cards, card picker, seat table, list rows), using `--sat-*` tokens.
- **Theme:** `src/theme.ts` drives the theme from React state and uses the kit's `sat-theme` key, so `saturday.js` is not loaded.
- **Report images:** these are drawn on canvas in `src/report/canvas.ts`, with colours copied from `src/saturday/tokens/tokens.json`. If the tokens change, update both.
- **Brand mark:** two stacked poker chips forming a vertical figure-eight, a companion to the Saturday double-layered vertical infinity. The outer rings are one S-shaped stroke, with a 26° notch beside the waist (lower right of the top chip, upper left of the bottom chip). It is in `src/brand/felt-mark.svg` and uses the kit's mark colour. The app icon and favicon are in `public/`.

Do not edit the generated kit files (`css/tokens.css`, `tokens/tailwind*`). Change `tokens/tokens.json`, then run `node src/saturday/tools/build-tokens.js` and `node src/saturday/tools/check-contrast.js`.

## Develop

```
npm install
npm run dev      # splash at http://localhost:5173, then the app at /app/
npm test
npm run build    # static site in dist/
```

The site has two pages. `index.html` at the root is the splash screen: the S of the Felt mark draws in one stroke, the inner rings and ticks complete the chips, the name and version appear, and after 3 seconds by default (or a tap) it fades and replaces itself with the app. Settings, Opening screen sets the length (Off, Short 1.8s, Standard 3s, Long 4.5s); the app stores it in localStorage (`felt-splash-ms`) and the splash reads it before it paints, so Off goes straight to the app. It is static HTML styled by `src/landing.ts` and `src/landing.css`; the version comes from `package.json` at build time. `app/index.html` is the app (`src/main.tsx`), which fades in on arrival. The service worker and manifest sit at the root and cover both, and the manifest's start URL is the root, so home-screen launches show the splash first.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and publishes it to GitHub Pages.
In the repo, set **Settings → Pages → Source** to **GitHub Actions**.

## Install on iPhone

Open the Pages URL in Safari, wait for the app to load, then tap **Share** and **Add to Home Screen**. After that first load the app works offline.
Deleting the home-screen app deletes its data, so use **Settings → Backup** now and then. Restore replaces games, players and groups; the theme and opening screen stay as set on the phone.
