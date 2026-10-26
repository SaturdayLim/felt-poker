# Felt — home game tracker

Offline Texas Hold'em tracker for a single phone. It runs as an installable web app, and all data stays in the phone's local storage.

- **Cash games:** amounts are in units (1 = SB, 2 = BB). Each game sets the unit's money value (default 1 = S$0.10).
- **Tournaments:** entries, re-entries, bust order and payouts.
- **Hand log:** pot, winner(s) including split pots, board (or n/a), shown hole cards, dealer, all-in or straddle, tags and notes.
- **Settle-up:** shared expenses, fewest-transfer "who pays whom", and a resolved toggle for each payment.
- **Insights:** all-time standings and a comparison chart.
- **Reports:** Summary, Detailed and Full as PNG, plus Data as CSV, sent through the phone's share sheet.

## Design

Felt uses the Vaela Material System. The tokens are mirrored in `src/design/tokens.css`, and the full spec is `Vaela v2/design/DESIGN.md`.
- **Paper:** lists and stats.
- **Stone:** controls and player tiles.
- **Clay:** the one main action per screen.
- **Glass:** the top bar, tab bar, action bar, sheets, toasts and info popovers.

The fonts (Fraunces, Atkinson Hyperlegible, IBM Plex Mono) are self-hosted in `src/assets/fonts`. Light, dark and auto themes are in **Settings → Appearance**.

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
