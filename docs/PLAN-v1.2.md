# Felt: Plan for 1.1.1 to 1.4.0

Status: waiting on the answers in section 1. Nothing here is built yet.

To answer: reply "defaults", and list only the ones you change (for example "Q4: the card picker. Q11: and board cards").

## 1. Clarifications

### Luxury

| # | Question | Default if you do not change it |
|---|---|---|
| Q1 | Accent palette. Your example has a typo: `0207OA` has a letter O. I read it as `02070A`. Is your example the palette, or do you want a different one built around the current teal? | Your example: 60% ink `02070A`, 30% blue `0297DE`, 10% coral `FC734D`. Teal goes. The felt table stays green. Figures in section 3. |
| Q2 | You wrote 20 details. The list has 19. What is the 20th? | Build the 19. |
| Q3 | Which "tap again" prompts become Undo toasts? There are about 10. | Undo: remove expense, delete hand, reset actions, delete game, delete group, mark all paid, stop sharing (the delete waits 5 seconds). Keep the prompt: erase all data, cancel a player code. |

### Hosting app

| # | Question | Default |
|---|---|---|
| Q4 | "Contrast for cards segment": which screen? | Settings, Cards, in dark theme. The black spade, club and swatch sit on a dark card. I only checked that screen in light theme. |
| Q5 | "Player card as a pop up instead of under stats": what opens it, and what is in it? | Tap a player on the Players tab or in Stats. A sheet shows name, net, win rate, games and the eye. A Full stats button opens the charts. |
| Q6 | "Unable to open report on mobile": which phone, opened from where (Telegram, WhatsApp, Files, Safari), and what do you see? | My guess: chat apps and iOS Files preview the file without running scripts, and the report is all script, so the page is blank. Fix: a plain message in the file ("Open this in Safari or Chrome"), plus the in-app view. |
| Q7 | Sharing toggle off, then on: same link or new link? Your earlier answer deletes the room when off. | Off deletes the room data. On again rebuilds it with the same id and key, so nobody rescans. Lamp: green live, amber waiting for a connection, red off. |
| Q8 | The new floating icon replaces "Player cards". Three parts. (a) "Our icons skill": no skill with that name is installed. Which one? (b) When does it show? (c) The host's "My cards" pill sits in the row you are removing, and it shows the cards. Does it go? | (a) Draw it to match the line icons in `ui.tsx`. (b) All stages of a hand, bottom right, hidden while the keypad or picker is open. (c) It goes. The host uses the same write-only entry as everyone. "Show my cards" at showdown goes too. |
| Q9 | That row also holds "Nat to act" and "partly recorded". Where do they go, and where does Pot go? | One plain line under the tabs, outside the box: Pot on the left, "Nat to act" on the right. "Partly recorded" stays on the Showdown tab. |
| Q10 | `">23"` means above 23, but 23 is a legal raise. Literal, or "≥23"? And does the "Raise to" label go? | "≥23", label kept. |

### Player view

| # | Question | Default |
|---|---|---|
| Q11 | Your note stops mid-sentence: "Include cards shown and". And what? | "...and board cards." |
| Q12 | In "SB (Chuggy, 4) calls to 8", is 4 the chips in on this street before the action, or in the whole hand? | This street. All three of your examples fit. It resets to 0 on each new street. |
| Q13 | The mirrored hand view shows hands "exactly as the host sees it". Does that include the host's hand notes and tags? | Tags yes, notes no. Notes may hold private comments. |
| Q14 | Candlestick: is 0 "no chips" or "break-even"? A rebuy makes the first reading jump. | Break-even. Body from 0 to current result, wick from lowest to highest result so far. Rebuys do not move it. |
| Q15 | Joining from the installed app: should a player's phone keep the same five tabs, with a "Join a game" button on Home? | Yes: Join on Home with camera scan and paste link. The code stays until the app closes, as you decided. iPhones open links in Safari, not the installed app, so the scanner is the way in. |

## 2. Assumed (tell me only if wrong)

- Player sheet in a game: an eye on each player card opens the same code sheet.
- Wording becomes "This code cannot be retrieved once this screen closes."
- Duration runs from the close of hand 1 to the close of the last hand, on every screen and in the report. It shows "-" until hand 1 closes. Old games recalculate. Potato Day changes from 12h 4m to 82 min. Time played per player does not change.
- Pot by tab: each closed street shows its closing pot. The open street shows the live pot.
- Tapping Raise or Bet with no amount logs the minimum. This is not a pot-helper key, so the keypad rule still holds.
- Position labels: BTN, SB, BB, UTG, UTG+1, MP, HJ, CO, by table size. Blinds show as "SB (Chuggy, 0) posts 1".
- Action log: newest on top. It scrolls back through all hands with a divider per hand. It stays when the host leaves the recorder.
- Copy icon sits in both host and player views. Sample:
  ```
  Hand 3, blinds 1/2
  - Pre-flop
  - UTG (Jacod, 0) folds
  - SB (Chuggy, 1) calls to 2
  - Flop: As Td 4c
  - SB (Chuggy, 0) bets 6
  - Result: Chuggy wins 14, shows Ah Kd
  ```
- Mirrored view covers closed hands. The hand in progress stays on the Action tab.
- Login: 6 boxes also in the HTML report lock. Paste fills all 6. After a wrong code, the error shows for 1 second and fades, then the boxes clear.
- A player whose code is replaced is signed out with a message. Without this, their later entries would be lost without notice.
- 2-7 rows also split in the HTML report's House Rules.
- Visual table: the same felt pill as the report. Seats run clockwise. The moving button shows as a D. Logged-in player: coral circle (Q1). The Dealt column goes with Won and Shown.
- Desktop details go in `docs/DESIGN-PRINCIPLES.md`, linked from `CLAUDE.md`.

## 3. Accent figures

| Pair | Contrast | Result |
|---|---|---|
| Coral on ink | 7.42 | Pass |
| Blue on ink | 6.25 | Pass |
| Ink on coral | 7.42 | Pass: use ink text on coral buttons |
| Ink on blue | 6.25 | Pass: use ink text on blue fills |
| White on coral | 2.73 | Fail |
| White on blue | 3.24 | Fail |
| Coral on light background `EEF2F1` | 2.42 | Fail |
| Blue on light background | 2.87 | Fail |
| Dark coral `B8441F` on light background | 4.79 | Pass |
| Dark blue `0276B0` on light background | 4.41 | Just short: darken slightly |

- Coral sits 186 degrees from the blue on the colour wheel, so it works as a complement. The exact complement is `DE4902`, which is harsher.
- Light theme needs the darker pair above.
- 30% means tinted surfaces, active tabs and the background mesh, not solid blue panels. 10% means one main action per screen, next to act, and the logged-in player.
- Coral sits close to the loss colour `FF8F80`. Losses need to move or carry an arrow so they do not read as the accent.
- Build it as a new `felt` skin in `src/saturday/tokens/tokens.json`, then run `check-contrast.js`.

## 4. The 19 details

| Detail | Now | Plan | Sprint |
|---|---|---|---|
| Tabular numbers | Have (`.sat-num`) | Sweep for gaps | 3 |
| Balanced headlines | Have | None | - |
| Safe area insets | Have | Check the player view bottom | 3 |
| Optimistic updates | Mostly: host data is local and instant | Flags and Start sharing still wait | 3 |
| Stale-while-revalidate | Host yes. Player view no, and PRD 4.6 asked for it | Keep the last copy on the phone | 2 |
| Pre-rendering | Covered by the service worker cache | Stop sending the 730 KB report template to players | 2 |
| Tap targets larger than icon | Mostly: tip icons have 44px areas. The swatches are 36px tall | Measure all, fix the short ones | 3 |
| Undo toasts | One only (default fill) | See Q3 | 3 |
| Animations you can interrupt | Partly: sheets and page entry use keyframes | Move to transitions | 3 |
| Skeleton loaders | Missing: text only ("Connecting.", "Building the report.") | Player view, report, app start | 3 |
| View transitions | Missing: the CSS rule has no effect with hash routes | `startViewTransition` on route change, iOS 18 and up | 3 |
| Swipe-to-dismiss sheets | Missing: the handle shows, but no gesture | Add it | 3 |
| Predictive back | Untested. Back uses real history | Sheets close on back. Skip our animation when the phone animates. Needs an Android test | 3 |
| One-time code autofill | Missing, and limited: the attribute fills SMS codes, and Felt sends none | Add the attribute, rely on paste | 2 |
| Continuous corners | Missing | `corner-shape: squircle`. Android Chrome only, iPhone keeps normal corners | 3 |
| Blurred image placeholders | Not needed: the only images are made on the phone | Use a skeleton there. Add to principles | 3 |
| Command menu (cmd+K) | Desktop | Principles only | 3 |
| Keyboard shortcut hints | Desktop | Principles only | 3 |
| Safe triangle | Desktop, and no submenus | Principles only | 3 |

## 5. Sprints

Times are rough, in agent working time.

### Sprint 0: 1.1.1, bugs from your testing (about 1 hour)

Causes below come from reading the code. I have not reproduced them yet.

- Code made after sharing starts fails. Cause: `watchGames` in `src/live/host.ts` watches games only, so a new player code never reaches Firebase.
- No error on a failed code. Cause: toasts render under the open sheet (`showModal` top layer). This hides every toast fired from a sheet, across the app.
- Action log clears when the host leaves. Cause: the recorder publishes `now = null` when it closes.
- Cards screen contrast (Q4), mobile report message (Q6), duration, code wording.

### Sprint 1: 1.2.0, host app (about half a day)

- Recorder row (Q9), pot by street, minimum raise on tap, amount label (Q10).
- Floating card icon, My cards change (Q8).
- Sharing toggle and lamp (Q7), eye on the game's player cards, player pop-up (Q5).
- View report in the app. Split the 2-7 rows.

### Sprint 2: 1.3.0, player view (about a day)

- 6-box login with auto-submit, in the app and the report.
- Action log format (Q11, Q12), newest first, across all hands.
- Copy hand. Mirrored hand view (Q13). This is the largest item: the host's hand screen must work without the host's data.
- "Table" becomes "Players": visual table, stacks on bubbles, candlestick (Q14).
- Join from the app with camera scan (Q15), using a QR library because iPhones have no built-in QR reader for web apps.
- Last copy kept on the phone, no report template for players.

### Sprint 3: 1.4.0, luxury pass (about half a day)

- `felt` skin and 60/30/10 (Q1). The other sprints use tokens, so this needs no rework.
- Skeletons, Undo toasts (Q3), view transitions, swipe sheets, back behaviour, tap targets, corners.
- `docs/DESIGN-PRINCIPLES.md`.
