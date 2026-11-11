# Plan: owner list of 11 Nov 2026 (v1.7.3 to v1.7.6)

Status: **waiting for owner approval. Nothing is built.**
Written after a review of v1.7.2 (`a3416b1`). Reader: the owner first, then an Opus session that runs the plan with Sonnet and Haiku agents.

Read first: `CLAUDE.md`, `docs/CHECKLIST.md`, `.claude/skills/felt-ui/SKILL.md`.

## 1. What this review covered

- Read: every commit since v1.6.2 (1.6.3 to 1.7.2), `PROGRESS.md`, `docs/CHECKLIST.md`, and the code behind each item below.
- Seen in the browser (`felt-test`, 390 x 844, dark, test data "Potato Day", 33 hands, 4 players): Start, Games, Players, Settings (Game Defaults, Cards), Export with a hand preview.
- Probed for cuts with a script on 14 routes: every element that mounts without a running animation or view transition. Then the same probe while the script pressed each tab, switch, radio, tip and accordion on those routes.
- Not walked in this round: the recorder with a live hand, the viewer, sheets, New Game, light theme. The code was read instead. `docs/CHECKLIST.md`, "Not reached in any review", still stands.

"Seen" below = watched in the browser. "Read" = found in the code only.

## 2. Items

### I1. One search bar for Players and Games, ghost text "Player Name"

- **Now (seen).** Two different boxes. Games: `GameSearch`, an icon that cycles player, game, date, with ghost text "Search players", "Search games", "Search dates". Players: `PlayerFinder`, "Search or add player", which also adds a player.
- **Files.** `src/App.tsx`, `src/components/navRail.tsx` (or a new `src/components/searchHost.tsx`), `src/screens/Games.tsx:150-180`, `src/screens/Players.tsx:55-136`, `src/css/nav.css`, `src/css/players.css`.
- **Fix.** Draw one search bar once in `App.tsx`, outside `SlidePane`, the same way as `NewGameFab` and `ThemeHost`. It shows on Games (list view) and Players (list view), stays still while the two pages swap, and grows in or shrinks away on other tabs. Ghost text "Player Name". Games filters its list by that player. Players lists and adds as today.
- **Risks.** The two boxes do different jobs (Players adds a name; Games has three search modes). The typed text must have one clear rule when the tab changes (Q1). A focused field during a tab drag can leave the keyboard up. The Games mode icon needs a home (Q2).

### I2. One New Game button for Home and Games

- **Now (read).** Built in v1.7.1: `NewGameFab` in `src/components/navRail.tsx:261`, drawn once in `src/App.tsx:188`, shown on Home and Games. The label is "New Game".
- **Files.** `src/components/navRail.tsx`, `src/css/nav.css` (only if a fault shows).
- **Fix.** No build. Check on a phone: it holds still between Home and Games, and it stays clear of bottom messages after I7. The label stays "New Game" (the copy rules ban all caps) unless the owner wants capitals (Q3).
- **Risks.** None. If the owner sees a fault on the phone, it needs a description first.

### I3. Settings, Cards: back logo missing on the sample cards

- **Now (seen).** In desktop Chromium the sample backs show the thin blue S at 29 px on a 76 px card (38%). The code did not lose the logo.
- **Likely cause (read).** v1.7.0 changed the logo to `height: 40%; width: auto` (`src/styles.css:723`). The SVG has no width or height attribute. Safari can give such an SVG a width of 0 inside a grid cell, so the logo is in the page and not on the screen. Not confirmed: needs WebKit or the owner's phone.
- **Files.** `src/components/ui.tsx:1034` (`CardBack`), `src/styles.css:719-723`, `.claude/skills/card-design/SKILL.md:13` (still says 20%).
- **Fix.** Give the logo a real size: `aspect-ratio: 68 / 104` plus a height from the card height (40%), or a pixel height per card size. Check in WebKit at all three sizes, in Settings, the card sheet and the viewer. Set the skill file to 40%.
- **Risks.** If the cause is different (Q4: the owner may mean a different design, for example the full mark with the two chips), this fix changes nothing visible.

### I4. Settings, Game Defaults: 7-2 preset missing

- **Now (seen).** Game Defaults shows SB, BB, Currency, Multiplier, Buy-in, Track the button, Check hidden cards. No 7-2 bounty, no minimum raise. `Settings.bounty27` and `Settings.minRaise` exist in the data (`src/types.ts:334`) with no screen.
- **Files.** `src/screens/Settings.tsx:216-258` (`GameDefaults`), `src/components/rules.tsx` (`RulesEditor`), `src/css/settings.css`, `src/lib/rules.ts:5-16`, `src/lib/help.ts`, `CLAUDE.md` (the line "Not in app Settings" must change).
- **Fix.** Add a "House rules" block under New games that edits `settings.bounty27` (switch, Win condition, Hand, Bounty in chips) with the same rows and fields as the other presets: the switch in a `sat-switch-row`, the amount in the same grid as Buy-in, one tip per field. The block opens and closes by growing, not by a cut (see I12, C1).
- **Risks.** Today a new game copies the rules of the last game of the same type, so a preset only reaches the first game (Q5). The owner rule "House rules belong to each game, not in app Settings" must be rewritten (owner text needed). Minimum raise has the same gap (Q6).

### I5. Join a game caption

- **Now (read).** `src/screens/JoinScan.tsx:86`: "Point the camera at the QR on the host phone". With the camera off: "Camera is off. Turn on the camera, or paste the link."
- **Files.** `src/screens/JoinScan.tsx`.
- **Fix.** Camera on: "Scan the host QR to connect". The camera-off line stays, because it tells the next step.
- **Risks.** None. The Start view caption for Player is a different line and stays (Q7).

### I6. Keypad: All-in merges into Raise

- **Now (read).** Quick row: Call or Check, Fold, All-in. Raise or Bet sits under the amount. All-in with a typed amount logs that amount; with none it logs the whole stack; with a stack range it asks for the amount (`src/screens/HandRecorder.tsx:836-842`, `:1145-1183`).
- **Files.** `src/screens/HandRecorder.tsx` (`Keypad` and its caller), `src/css/recorder.css`, `src/lib/help.ts` (`raiseBox`), `src/lib/hand.ts` and `src/lib/hand.test.ts` (only if the cap needs a rule), `CLAUDE.md` (three keypad lines).
- **Fix.**
  1. The quick row has two keys: Call or Check, Fold.
  2. The Raise or Bet key says "All-in" when the typed number is at or above the player's chips left (Q8: "bigger than" or "at or above"). A press then logs an all-in for the chips left, not the typed number.
  3. The word changes with a cross-fade, not a cut.
  4. Call for less: when the bet to call is at or above the chips left, the Call key logs an all-in call (it already caps in the replay; the box shows the capped amount).
- **Risks.**
  - A stack that is a range (after a missed hand) has no known balance, so the key cannot tell an all-in from a raise (Q9).
  - A shove with no typing is one tap today. After the merge the host types a number above the stack (for example 999). This is slower.
  - A straddle or dark all-in keeps the dark mark: test it.
  - The classic editor (`HandEditorClassic.tsx`) has its own controls and stays as it is.

### I7. Messages at the bottom, above the End game and Log hand bar

- **Now (read).** Top of the screen since 11 Nov (`src/styles.css:108`), so that they never cover a bottom bar. Inside a sheet they sit at the sheet bottom.
- **Files.** `src/styles.css:108-110`, `:629`, `src/components/ui.tsx:1114-1170` (`ToastHost`, entry direction at `:1160`), `src/css/nav.css`, `CLAUDE.md` (the "Messages sit at the top" line).
- **Fix.** Bottom, with a measured gap: above the bottom bar when a page has one, above the tab bar and the New Game button on main tabs, above the keypad or card picker when it is open, above the keyboard when it is up. One CSS variable (`--felt-bottom-stack`) that each bottom element sets, so the message never guesses. Entry slides up.
- **Risks.** This reverses the 11 Nov rule, whose reason was covered buttons: the measured gap is the whole fix, so it must be seen on each page with a bottom element (game page, recorder, End Game, Results, Export, viewer with the card button). An Undo message near the thumb is easier to hit by accident.

### I8. Export pictures: Share, not Copy, as a set of images

- **Now (seen and read).** "Copy images" and "Copy ticked hands" put the first image on the clipboard and send the rest to the share sheet (`src/screens/Report.tsx:264-284`). Each set is one long image made of parts (`src/report/pngSets.ts`: Summary = results, biggest pots, settle up).
- **Files.** `src/screens/Report.tsx:264-360`, `src/report/pngSets.ts`, `src/report/segments.ts`, `src/report/share.ts`, `src/css/report.css`, `src/lib/help.ts`, `CLAUDE.md` (the Export line).
- **Fix.** The two buttons become "Share" (share icon). One press opens the phone's share sheet with every image as its own file. Summary, Details and Playstyle each give one image per part (3 each). Full Action Log gives one image per ticked hand. The dashboard link keeps Copy (it is a link, not a picture). A tap on a preview image still copies that one image.
- **Risks.**
  - The share sheet only opens inside a press. Drawing many images first can take too long on iOS and the sheet is refused. Fix: draw when a part is ticked or previewed, keep the files ready.
  - 33 hands = 33 files in one share. Memory and the target app may choke (Q10).
  - A browser with no file sharing (desktop) downloads the files, as today.
  - The eye previews must show the same split, or the preview lies.

### I9. Full action log text

- **Now (seen).** One comma chain per street: "Bel posts 1, Nat posts 2, Mike raises to 4 (dark), Everett calls 4, Bel calls 3, Nat calls 2, Mike checks". Names only. The Full Action Log row needs 3 recorded hands (`MIN_REPORT_HANDS`, `src/report/htmlReport.ts:11`, `src/screens/Report.tsx:209`, `:297`).
- **Files.** `src/report/model.ts:163-203` (`handView`), a new pure module `src/report/logText.ts` with `src/report/logText.test.ts`, `src/report/segments.ts:308-335` (`logBlocks` joins with ", "), `src/report/htmlReport.ts`, `src/screens/Report.tsx`, `scripts/trial-report.tsx` (the dashboard Game Log reads the same lines).
- **Fix.**
  1. Each actor is position and name: "BB (Clar)". Positions come from one function (today `positions` in `src/live/snapshot.ts:94` and `positionNames` in `model.ts` both exist: keep one).
  2. One sentence per line, with a full stop.
  3. Like actions in a row merge: "Calls from HJ (Eve), CO (Mike) and Btn (Nat)." The same for checks.
  4. Folds stay out until the action closes. If a bet or raise takes the pot, the line ends "for a takedown." and no fold line follows. Otherwise one closing line per street lists the folds (Q11).
  5. Blind posts (Q12).
  6. The image draws one line per sentence.
  7. The Full Action Log row and its images work from 1 recorded hand. The dashboard and the snapshot keep their minimum of 3.
- **Risks.** The dashboard Game Log changes too, because it shares `handView` (wanted, by default). Old hands with a pot count and no action order keep the old lines. The viewer's Copy hand has its own format ("BB (Cat, 0) folds") and stays unless the owner wants one format (Q13). "Btn" in the owner's example against "BTN" in the app (Q14).

### I10. A tap outside a tooltip closes it

- **Now (read).** The tip closes on a `click` outside (`src/components/ui.tsx:838`). It does not close on a swipe, a route change, or when a handler stops the click. On a touch screen the hover state can stay on, which keeps the tip open.
- **Files.** `src/components/ui.tsx:787-860` (`Info`).
- **Fix.** Close on `pointerdown` anywhere outside (capture phase, so nothing can stop it), on a route change, and when a sheet or pop-up opens. Hover opens a tip only for a mouse. The tip leaves with its fade.
- **Risks.** A tap on a second tip button must open that tip in the same tap. The tap that closes the tip still presses what is under it (as today); say if it should not.

### I11. Renaming games

**a. Swipe while typing.**
- **Now (read).** The sideways sheet swipe starts on any `input` (`useSwipeSide`, `src/components/ui.tsx:640-641` exempts only range, colour and textarea). So a drag across the title moves the sheet and widens the selection. The swipe down already leaves fields alone.
- **Files.** `src/components/ui.tsx:335-360`, `:626-676`.
- **Fix.** Both sheet swipes do nothing when the touch starts in a field, and when any field in the sheet has focus (the keyboard is open).
- **Risks.** With a field in focus the sheet closes only by a tap outside or by Save. This is what the item asks for.

**b. Tap the game name to rename.**
- **Now (read).** The name sits in the header tab (`src/screens/GameLive.tsx:99`, `Header banner`). Rename is in the game settings sheet only.
- **Files.** `src/components/ui.tsx` (`Header`), `src/components/players.tsx` (`NameField`, the in-place name edit of the player card), `src/screens/GameLive.tsx`, `src/css/chrome.css`.
- **Fix (default, see Q15).** A tap on the name in the header tab turns it into a field in place, as on the player card. Enter or leaving the field saves. A swipe up on the tab, or Escape, leaves without saving. An empty name is refused.
- **Risks.** The name is a shared element that glides from the list to the record (`data-game-title`): the field must not break that. A long name must scroll inside the tab. The live room must send the new name to viewers (the host republishes on any game change: check).

### I12. Snap cuts

- **Measured (seen).** No element mounted without motion on 14 routes, or when the probe pressed every tab, switch, radio, tip and accordion on them. The only hits were the outgoing page copy during a tab slide, which is the slide itself.
- **Not measured.** Elements that leave, words that swap in place, and the screens not walked (recorder, sheets, New Game, viewer).
- **Candidates (read, each to confirm before a fix):**

| ID | Where | What cuts |
|---|---|---|
| C1 | `src/components/rules.tsx:47` | The 7-2 settings block mounts and unmounts with the switch (New Game, game settings, and Settings after I4). |
| C2 | `src/screens/HandRecorder.tsx:1162` | The Clear row at the top of the keypad appears and moves the keys down. |
| C3 | `src/screens/HandRecorder.tsx:1158-1181` | Key words swap in place: Call and Check, Bet and Raise, and All-in after I6. |
| C4 | `src/screens/Games.tsx:175` | The ghost text swaps when the search mode changes (the icons cross-fade, the words do not). Goes away with I1. |
| C5 | `src/screens/JoinScan.tsx:86-90` | Camera off and camera on swap the caption and the Turn on camera button. |
| C6 | `src/screens/HandRecorder.tsx` (dock) | Keypad and card picker swap inside the dock. |
| C7 | `src/components/ui.tsx:838` | A tip that closes on a tap outside (part of I10: it must fade). |

- **Files.** As listed, plus `src/lib/motion.ts` and `src/css/motion.css` for a shared "words swap" helper.
- **Fix.** First an audit task: extend the probe to watch elements that leave and text that changes, run it on the recorder, sheets, New Game and the viewer, and confirm or drop C1 to C7. Then fix each with the type's own time band: a block grows or shrinks (`Disclose`), words cross-fade, a panel swap slides.
- **Risks.** Animation speed Off must still cut everything (owner rule). Reduced motion must fade in 150 ms with no travel.

## 3. Other findings from this review

| ID | Sev | Finding | Where |
|---|---|---|---|
| N1 | P2 | Export: the first row title is cut at 390 px: "Interactive Game Dashboa...". | `src/screens/Report.tsx`, `src/css/report.css` (seen) |
| N2 | P3 | Export: the four row radios have no accessible name. | `src/screens/Report.tsx` (seen in the tree) |
| N3 | P3 | `.claude/skills/card-design/SKILL.md` says the back logo is 20%. CLAUDE.md says 40%. | fixed with I3 |
| N4 | P3 | Three position-name functions (snapshot, model, viewer). | fixed with I9 |

## 4. Revisions and agents

One commit and one push per revision, with a version bump and a changelog entry. No two tasks in one revision share a file. An Opus agent reviews each revision's diff (CLAUDE.md, "Motion and structure review").

### v1.7.3: small and safe (needs Q4, Q7)

| Task | Items | Agent | Files owned |
|---|---|---|---|
| A1 | I10, I11a, C7 | Sonnet | `src/components/ui.tsx` (`Info`, `useSwipeSide`, `useSwipeDown`) |
| A2 | I5, C5 | Haiku | `src/screens/JoinScan.tsx`, `src/css/viewer.css` |
| A3 | I3, N3 | Haiku | `src/styles.css` (card back lines only), `.claude/skills/card-design/SKILL.md` |
| A4 | I12 audit (no edits) | Sonnet, read-only | none: reports confirmed cuts with file and line |

A3 must not touch `CardBack` in `ui.tsx` while A1 holds that file. If it needs a change there, A1 makes it.

### v1.7.4: recorder and messages (needs Q8, Q9)

| Task | Items | Agent | Files owned |
|---|---|---|---|
| B1 | I6, C2, C3, C6 | Sonnet | `src/screens/HandRecorder.tsx`, `src/css/recorder.css`, `src/lib/hand.ts`, `src/lib/hand.test.ts`, `src/lib/help.ts` |
| B2 | I7 | Sonnet | `src/components/ui.tsx` (`ToastHost`), `src/styles.css` (toast lines), `src/css/nav.css` |

### v1.7.5: export (needs Q10 to Q14)

| Task | Items | Agent | Files owned |
|---|---|---|---|
| C1 | I9 text | Sonnet | `src/report/logText.ts` (new), `src/report/logText.test.ts` (new), `src/report/model.ts`, `src/report/model.test.ts`, `src/live/snapshot.ts` (positions only) |
| C2 | I8, I9 images and minimum, N1, N2 | Sonnet | `src/screens/Report.tsx`, `src/report/pngSets.ts`, `src/report/segments.ts`, `src/report/share.ts`, `src/report/htmlReport.ts`, `src/css/report.css` |

C2 starts after C1 is reviewed: it draws the lines that C1 writes.

### v1.7.6: structure (needs Q1, Q2, Q5, Q6, Q15)

| Task | Items | Agent | Files owned |
|---|---|---|---|
| D1 | I1, C4 | Sonnet | `src/App.tsx`, `src/components/searchHost.tsx` (new), `src/screens/Games.tsx`, `src/screens/Players.tsx`, `src/css/nav.css`, `src/css/players.css` |
| D2 | I4, C1 | Sonnet | `src/screens/Settings.tsx`, `src/components/rules.tsx`, `src/css/settings.css`, `src/lib/rules.ts` |
| D3 | I11b | Sonnet | `src/components/ui.tsx` (`Header`), `src/components/players.tsx` (`NameField`), `src/screens/GameLive.tsx`, `src/css/chrome.css` |

After each revision the orchestrator updates the changed owner rules in `CLAUDE.md` (the agents never edit it) and ticks `docs/CHECKLIST.md`.

Test setup: `docs/CHECKLIST.md`, "Test setup" (one `felt-agent-N` server per agent, test data from `trial/potato-test-backup.json`, own `tabId`).

## 5. Owner questions

Each has a default. The plan uses the default when the owner approves without an answer.

| Q | Item | Question | Default |
|---|---|---|---|
| Q1 | I1 | Does the typed text stay when the tab changes from Players to Games? | Yes: type "Nat" on Players, swipe to Games, and the list shows Nat's games. |
| Q2 | I1 | Games search has three modes (player, game name, date). Keep the mode icon in the shared bar on Games? What ghost text for game name and date? | Keep the icon on Games only. "Player Name", "Game Name", "Date". |
| Q3 | I2 | The shared New Game button exists since v1.7.1. Is something wrong with it, or is this a check only? Capitals or "New Game"? | Check only. "New Game". |
| Q4 | I3 | Is the back blank on your phone, or is the thin blue S there and you want a different design (for example the full mark with the two chips)? A photo settles it. | Blank on the phone: fix the size rule. |
| Q5 | I4 | A new game copies the rules of the last game. Should the Settings preset win over the last game, or only fill the first game? | The preset fills a game only when no earlier game exists. |
| Q6 | I4 | Add the Minimum raise preset beside the 7-2 preset? | Yes, both, in one House rules block. |
| Q7 | I5 | The new caption is for the camera screen. Does the Player button on the Start view keep "Scan the QR code to follow the action and log your hands."? | Keep. |
| Q8 | I6 | "All-in" when the number is bigger than the chips left. Also when it is equal? | Yes, at or above. |
| Q9 | I6 | When the stack is a range (a hand was missed), Felt cannot compare. How does the host log an all-in then? | A quiet All-in key shows in the quick row only while the stack is a range. |
| Q10 | I8 | Full Action Log: one image per hand (33 hands = 33 files), or pages of several hands? | One image per hand. Felt warns above 20 files. |
| Q11 | I9 | Folds: one closing line per street ("Folds from UTG (Al) and HJ (Eve)."), or only at the end of the hand? | One closing line per street. No fold line when a bet takes the pot ("for a takedown."). |
| Q12 | I9 | Are the blind posts written? Your example starts at the first raise. | Left out. A straddle is written. |
| Q13 | I9 | Should the viewer's Copy hand use the new format too? | No. It keeps "BB (Cat, 0) folds". |
| Q14 | I9 | "Btn" (your example) or "BTN" (the app today)? | "BTN", to match the app. |
| Q15 | I11b | "Rename tab, swipe up to clear": the name becomes a field inside the header tab (as on the player card), or a small panel that drops from the top? Does swipe up cancel the rename, or empty the field? | A field inside the header tab. Swipe up cancels. |

Still open from before: the six lines under "Waiting for the owner" in `docs/CHECKLIST.md`.
