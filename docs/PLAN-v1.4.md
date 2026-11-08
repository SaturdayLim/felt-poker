# Plan v1.4 (9 Nov 2026)

Source: the owner's notes after the 7-player live test and the Opus review of v1.3.4. Read CLAUDE.md first. Copy rules apply (ASD-STE100, chips, tips not captions, no contractions).
Work is split into packages. Each package owns its files. Agents do not commit; the lead commits. Re-read a file before each edit.

## Package A: game logic and data (owner: src/lib/*, src/store.ts, src/screens/GameLive.tsx, src/screens/CountChips.tsx, src/screens/Settings.tsx, src/lib/help.ts, src/live/*)
1. **Clash flags (reverses 1.3.4).** Revealed (shown) cards always override a player's own submission. No flag, no message when a player shows other cards than they logged. Where a hidden pair differs from the shown pair, drop the hidden entry from analysis and use the shown cards. Remove the `own` reason added in `src/lib/clash.ts` and `Join.tsx` (Package C owns Join.tsx: A edits clash.ts only; C removes the WHY line). Keep red and blue flags for board and other-entry clashes.
2. **Running time.** `playMs` counts from the END of the first hand to the END of the last hand (`endedAt ?? at`). Update tests in `src/lib/format.test.ts`.
3. **Player rows** count closed games only (already so). Add a SourceTip or tip explaining it; no caption on the page.
4. **Muck and not shown.** Same thing in the UI: the label is "Not shown". A not-shown hand can still win (optional reveal in a takedown). A mucked hand cannot win. Mucks happen in positional order: the last player to muck, with nobody left to answer, is a not-shown takedown and wins the pot. Check `resolve` in `src/lib/hand.ts` and `src/live/snapshot.ts` for this; rename "Mucked" to "Not shown" in viewer copy (Package C edits the viewer line; A supplies the logic and the label constant).
5. **Rebuy at bust.** When a player's exact stack reaches 0 in a hand, offer a rebuy before Log next hand: a sheet "Rebuy for N?" with chips defaulting to the largest whole multiple of the game buy-in up to the biggest stack at the table (rounded down), a stepper for fewer buy-ins, and Skip. The player stays active and is dealt into the next hand. Store the rebuy as a buy-in with `at` after the hand ended. Spec the data so reports can show "extra buy-ins at this point". Files: GameLive.tsx and a new `src/components/rebuy.tsx`; the hand-save flow in HandRecorder.tsx belongs to Package B, so A exposes `bustedPlayers(g, hand)` in `src/lib/stacks.ts` and B calls it and opens the sheet.
6. **Stacks drop to zero** after adding or removing players before the game starts. Reproduce in a test (add players, remove one, add another, buy-ins, then `estimateStacks`). Likely causes: `addPlayerToGame` / remove paths leaving a `cashOut`, a `statusEvents` 'out', or buy-ins removed with the player. Fix and add a regression test.
7. **Player code Copy.** Beneath the replace-code result a Copy button puts "Michael: XXX XXX" on the clipboard (name, colon, code in two groups of three). Edit `src/components/players.tsx` (ReplaceCodeSheet and CodeControl copy).
8. **Tips, not captions.** Move Settings page captions ("Nothing is sent online unless you turn on a live link.", "Reduce Motion is off for this phone.") into field tips. Add tips: CYTD = Calendar Year to date; L30D = the last 30 days (Players and Games stats chips, `src/screens/Insights.tsx` is Package D's neighbour: A edits help.ts only, and tells the lead which `Help k=` keys to add).
9. **Password during a live link.** When the live link is on, the password is not shown or written. Closing the room flushes viewers; reopening asks for a password. Check `src/components/live.tsx` (owner: A).

## Package B: hand recorder (owner: src/screens/HandRecorder.tsx, src/screens/HandEditorClassic.tsx, src/css/recorder.css)
1. **Keep the selected field in view.** A long action table (more players than fit): selecting a box, or finishing one, scrolls the next open box into view, above the keypad or the keyboard. Use the visual viewport height and `--felt-kb`.
2. **Double pot caption.** In the preflop action log the current pot shows twice. Find and remove the duplicate (see "who acts left, pot right" rule in CLAUDE.md).
3. **Two open columns when blinds are posted.** With SB and BB posted, the action table starts with two open columns (SB and BB must act again to close the street), not one.
4. **Keypad hitboxes.** The Help tip button overlaps Backspace in the amount box. Move the tip to the field label or shrink it to a 24 px visible circle with a clear 44 px target that does not overlap the backspace key. Check every pair of adjacent controls in the keypad, the picker and the dock for a minimum 8 px gap between targets and 44 px targets (coarse pointers). Add a dev-time check script `scripts/tap-check.mjs` (Playwright) that lists overlaps on the recorder keypad.
5. **Bust rebuy hook.** After a hand that busts players, before Log next hand, open the rebuy sheet from Package A.
6. **Flop reveal order** is for the viewer (Package C). B keeps `board` order in the snapshot so C can flip cards as the host selects them.

## Package C: player view (owner: src/screens/Join.tsx, src/screens/JoinScan.tsx, src/css/viewer.css)
1. **Big pips.** Player view is too small to tell clubs from spades. Add a Big pips option (Settings or the viewer's own Settings tab) that enlarges pips, and custom colours for card pips and the card background, local to the viewer's phone. Reuse `src/lib/cards.ts` looks (`useCardLook`, `lookColor`); keep the host's card look separate.
2. **Flop reveal.** Cards the host selects flip from face-down to face-up in the viewer (rotateY, 420 ms, 70 ms apart, same as FlipDown in ui.tsx).
3. **Remove the `own` clash line** from `WHY` in Join.tsx.
4. **"Not shown"** replaces "Mucked" in the viewer showdown. A player whose cards were never entered shows no face-down pair.
5. **Password row** when the live link is on: no "No password" text (see A9).
6. **Viewer action lines** stay as they are (owner approved).

## Package D: reports and awards (owner: src/report/*, scripts/trial-*.ts*, src/screens/Report.tsx, src/screens/Insights.tsx)
1. **Comeback**: the player must have fallen at least 20 BB from the start (low point at least 20 BB under the start) before the climb; then the climb counts. Keep the 50 BB climb minimum unless the owner says otherwise (open question).
2. **King Of The Hill caption**: "Won 11 pots, including 4 takedowns" (takedown = a pot won without a showdown). Ties: list each name.
3. **Award logos**: one distinct mark each (SVG, stroke style of the Felt mark, 24 px grid): Diamond Hands: armoured glove; King Of The Hill: crown; Leprechaun: pot of gold; Apollo: sun or laurel; Ice Cold: snowflake; Comeback: reverse arrow; Unrelenting: bull; The Rock: rock; Bounty Hunter: target or coin; Iron Defender: shield. Put them in `src/report/awardIcons.ts` and use them in the HTML report and the canvas image.
4. **Settings in the report** get their own page, not under Game Summary.
5. **Game summary segments.** Break the PNG into small segments (one per element: results, awards, pot sizes, and so on). The host ticks the segments to include. Each segment renders at 2x for a phone and stays sharp when zoomed.
6. **Result by seat** shows every seat that was available in the match (maximum seats), not 4.
7. **Player: Your cards** lists each hand with what was won or lost and the street ("Won 90 (Showdown)", "Lost 3 (Pre-flop)", "Won 69 (River)"), and a red or blue exclamation mark where a card conflicts (red: board or shown card; blue: another player's entry).
8. **Stack graph**: do not highlight other players' rebuys in orange. Show the player's own rebuy circles with the count of extra buy-ins at that point (a circle with 2 = resuming stack of 2 buy-ins, 400 in a 200 game).
9. **Hand record analysis**: a heatmap grid of starting hands (13x13: pairs on the diagonal, suited above, offsuit below) showing the percent of hands played, summed across games, with a short list of how a hand could have been played differently (conservative rules based on the logged action and position; no invented numbers).
10. **Full action log** dropdown per hand in the player report.
11. **Full game log tab** (HTML) in the report. The host ticks whether to include it.
12. **File names** say what is inside: `<game name> - results.png`, `<game name> - results and stats.png`, `<game name> - game record.html`, `<game name> - data (3 csv)`, plus date. No two outputs share a name. Update `src/screens/Report.tsx`, `src/report/share.ts`, `csv.ts`.

## Package E: polish (owner: src/styles.css only for these rules, plus src/css/chrome.css)
1. Subnav style stays the same across pages: the game page pill control becomes the folder tabs used on Players and Games (or the other way round; pick the notebook tabs, per CLAUDE.md).
2. Status light "playing" in the light theme: the owner asks which light is too dark; the review saw the green read as off. Keep a clear mid-green; verify contrast in light and dark. Ask the owner to point at it if unsure.
3. Placeholder names: one name everywhere ("Dani").
4. Casing: "1/2 cash" vs "1/2 Cash": use "Cash" everywhere game types are named in titles, lowercase in running text.

## Checks (all packages)
- `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build` pass. New logic has tests.
- No two tap targets closer than 8 px; targets 44 px on coarse pointers.
- Reduced motion: nothing moves.
- Light and dark theme at 375 px.

## Open questions for the owner
1. Comeback: keep the 50 BB climb minimum next to the new 20 BB fall minimum?
2. Rebuy default: "multiple of buy-ins up to the big stack, rounded down": confirm the big stack is the largest current stack at the table.
3. Playing light: which screen shows the dark green?
4. Heatmap: percent of hands played means "dealt in and put chips in voluntarily", correct?

## Amendments after the Opus review (9 Nov 2026)

**Ownership (replaces the package headers where they differ)**
- **A-logic** owns `src/lib/*` (hand.ts, stacks.ts, clash.ts, format.ts, stats.ts, style.ts), `src/store.ts`, `src/live/*` (snapshot.ts, host.ts) and CLAUDE.md edits.
- **A-ui** owns `src/screens/GameLive.tsx`, `Home.tsx`, `Games.tsx`, `Players.tsx`, `Settings.tsx`, `src/components/players.tsx`, `live.tsx`, new `src/components/rebuy.tsx`, `src/lib/help.ts`.
- **B** owns `HandRecorder.tsx`, `HandEditorClassic.tsx`, `src/css/recorder.css`.
- **C** owns `Join.tsx`, `JoinScan.tsx`, `src/css/viewer.css`.
- **D** owns `src/report/*`, `scripts/*`, `public/report-template.html`, `Report.tsx`, `Insights.tsx`, `src/css/report.css`.
- **E** owns CSS-only polish in `src/styles.css`, `src/css/chrome.css`.
- Phase order: Phase 1 = A-logic and C in parallel. Phase 2 = A-ui, B and D in parallel (after A-logic). Phase 3 = E, then review.

**Corrections**
- A2 (running time): `playMs` already measures close of first hand to close of last hand (format.ts). Only check the "Running" display in GameLive (freezes between hands, 0m after one hand): the running figure for a live game counts to now. Tests are in `logic.test.ts`.
- A1: removing the `own` reason is not enough. `differsFromShown` also feeds `clashingPlayers`. Define the effective pair: the shown cards, else the entry. Entries that differ from shown cards are dropped (no flag, no message). A blue clash compares against the shown cards. Readers to update: `clashingPlayers`, `clashHands`, `clashWhy`, `clashLevel`, `countedPairs`, host.ts `logged`/`why`, model.ts, style.ts `myHands`, help.ts. Update CLAUDE.md: the "each entry counts as entered" rule now says shown cards override.
- A4 (muck): `resolve` in hand.ts returns no winner when everyone else mucked and one player is not shown. Fix it: the last player to muck in showdown order (use `showdownOrder`, per pot, every run) leaves the remaining not-shown player as the winner (a takedown). `log.mucked` is in tap order, so do not rely on it. Add one helper `wentToShowdown(log)` and use it in stats.ts, style.ts, model.ts, snapshot.ts so a takedown is not counted as a showdown. Label: "Not shown" everywhere (also HandRecorder labels, owned by B, and snapshot text `mucks`).
- A5 (rebuy): only exact stacks qualify. Default = the largest whole multiple of the buy-in up to the biggest other stack (leave the busted player out), at least 1 buy-in. Skippable. Do not offer again when a buy-in after `endedAt` exists. Cash games only for now.
- A6 (zero stacks): there is no remove-from-game path; "remove" means Clock out or deleting a buy-in. Suspects: the count written on Back in (GameLive.tsx:63); the + on an out player (GameLive.tsx:125) keeps the old cash-out; `deleteBuyIn`. Write a reproducing test first.
- B2: the double pot caption is in the viewer, not the recorder (Join.tsx:271 live frame and :337 play-by-play). C fixes it. B drops it.
- B3 (two open columns): the rule lives in hand.ts:568-571 (keeps one column while column 1 is open). A-logic changes that rule; B only renders it.
- B4: a tip button stays a circle at the top-right of its element (CLAUDE.md). Shrink the visible circle and keep a 44 px target that does not overlap Backspace; do not move the tip to the label.
- A9 and C5 are the same line (live.tsx:93). A-ui owns it. Reopening a room asks for the password on the game page, not in a pop-up.
- D1: `p.low <= -20 * bb` next to the existing 50 BB climb (open question 1).
- D6: the `Pos` type has 4 positions (model.ts:15, :82-86; trial-report.tsx:347 has 4 colour slots). Widen to every seat.
- D7: model.ts:101 uses `countedPairs`, which drops red entries. Use `fullPairs` plus `clashLevel` for the Your cards list.
- D11: also edit `scripts/report-template.ts` and `public/report-template.html`.
- E1: the notebook tabs are in Players, Games and the header (see CLAUDE.md "Tab bar" and "Design"). Use that style on the game page.
- E3/E4: Players.tsx, Games.tsx, Home.tsx belong to A-ui. E edits CSS only; A-ui writes "Cash" in GameLive.tsx:31 and Games.tsx:58.
- New CLAUDE.md rule from the owner: Mucked and Not shown are one thing. Revealed cards override entries.
