# Plan: usability revisions 1.6.3 to 1.7.0

Written 10 Nov 2026 after an end-to-end review of v1.6.2 (host flow and viewer flow).
Reader: an Opus session that runs this plan with Sonnet and Haiku agents. It has no memory of the review.

Read first: `CLAUDE.md` (owner rules), `.claude/skills/felt-ui/SKILL.md`, `docs/MOTION-LIST.md`.

## 1. How the review ran

- Browser at 390 x 844 on the `felt-test` server (port 5174), dark theme, light theme on two screens.
- Data: one cash game, 4 players, 1 hand that ended on the flop with everyone folded. This is thin data.
- Host flow seen: Start, Home, New Game, game page, recorder (Pre-flop, Flop, result), End Game count, Results, Settle Up, Download or Share, Games, Players, Leaderboard, Stats, Settings (General only).
- Viewer flow seen on the mock live driver: Action (List and Table), Hands, Players, Settings, closed room, Join with the camera off.
- One Opus agent reviewed the v1.6.2 diff. Its open items are F22.
- The Impeccable detector found nothing in the two files changed in v1.6.2. A full detector run on `src/` is not done.

Section 6 lists what was not seen. Do not treat those screens as clean.

## 2. Findings

Severity: P1 = wrong data or a blocked task. P2 = confusion or a broken owner rule. P3 = polish.
"Seen" = watched in the browser. "Read" = found in the code only.

| ID | Sev | Finding | Evidence | Where |
|---|---|---|---|---|
| F1 | P1 | End game opens the count and writes a cash-out for every player at once. Back to game leaves the game live with those cash-outs, so every stack shows 0. | Seen: `cashOuts: 4`, `status: live`, "Stack 0" on all four cards after Back to game. | `src/screens/CountChips.tsx:28-43` (fill on open), `:155` (Back to game) |
| F21 | P1 | The rebuy "+" on a player card adds a full buy-in on one tap. The toast has no Undo. v1.6.2 made this button visible again. The owner data has two buy-ins 2 s apart for one player. | Read: `rebuy()` calls `addBuyIn` then a plain toast. | `src/screens/GameLive.tsx:72-76`, `:229` |
| F2 | P2 | A closed game record still shows the live link row (red switch, Add password, "Live link off"). A closed game cannot share. Rule: a control exists only when it works. | Seen in light theme. | `src/screens/GameLive.tsx:92` |
| F3 | P2 | A closed game record says "Players 0" on its tab and "Playing (0)" over an empty list. All players sit under "Clocked out (4)". | Seen. | `src/screens/GameLive.tsx:81`, `:103`, `:118` |
| F4 | P2 | The game time counts from the first hand to the last hand. Player time counts from the buy-in. The page showed Running 0m beside players at 1m, and Length 0m beside players at 3h 45m. Results shows a bare "0m" with no label. | Seen on the game page, the closed record and Results. | `src/lib/format.ts:76-84` (`runningLabel`, `gameLength`), `src/screens/GameLive.tsx:97`, `src/screens/CloseTable.tsx` |
| F5 | P2 | Results shows each net in money (S$1.30) with Show money off. Rule: chips first. Settle Up may stay in money. | Seen. | `src/screens/CloseTable.tsx:32` |
| F6 | P2 | The viewer shows "Dev wins 29" under the label Showdown when everyone else folded. Rule: a takedown is not a showdown. Copy hand uses the same label. | Seen. | `src/live/snapshot.ts:91`, `:163`, `:175`; test at `src/live/live.test.ts:144` |
| F7 | P2 | A viewer of a closed room sees only "Room has been closed" and Home. The night ends with no result and no next step. | Seen. | `src/screens/Join.tsx:158` |
| F9 | P2 | The viewer sign-in is an orange card icon with no words. A first-time player cannot tell that it signs in. | Seen. | `src/screens/Join.tsx` (floating button), `src/css/viewer.css` |
| F11 | P2 | Viewer, Players: the bar under the table reads "-6 ... 13" with the word Table and a tip. The meaning sits only in the tip. Rule: a screen works with no tip open. | Seen. | `src/components/candle.tsx`, `src/screens/Join.tsx` |
| F12 | P2 | Settings, Animation speed: the slider has four stops (Off, Quick, Standard, Relaxed). CLAUDE.md says three (Quick, Standard, Relaxed) plus a Reduced motion switch. The switch shows an icon only. | Seen. | `src/screens/Settings.tsx:36`, `:72` |
| F14 | P2 | Download or Share lists six choices. Four are image sets that differ by a little. The radios and the Game Log checkbox show no accessible name. | Seen. | `src/screens/Report.tsx:162`, `:172` |
| F8 | P3 | Viewer, Settings: the orange card button covers the Card picker order control until the page scrolls. | Seen. | `src/css/viewer.css` |
| F10 | P3 | Viewer action lines read "BB (Cat, 0) folds". The 0 is chips in on this street. It reads as a stack of 0. The owner set this format (docs/PLAN-v1.2.md Q12). | Seen. | `src/live/snapshot.ts:134-140` |
| F13 | P3 | Settings, General shows the Dark theme switch twice: in the banner and in the first row. | Seen. | `src/screens/Settings.tsx` |
| F15 | P3 | The accessibility tree showed no name for: the Host and Player buttons, the four tab bar links, Save hand, Save next hand, the Cards shown bar, the End Game player buttons, the Settle up row, the game row, the group heads. The tool may be wrong: confirm each in the browser accessibility pane first. | Seen in `read_page` output only. | `src/screens/Start.tsx`, `src/components/navRail.tsx`, `src/components/ui.tsx:387` (`WordButton`), `src/screens/CountChips.tsx`, `src/screens/Players.tsx` |
| F16 | P3 | Players list: the period radios (All, CYTD, L30D) are in the accessibility tree while the filter is closed. | Seen in `read_page` output. | `src/screens/Players.tsx` |
| F17 | P3 | New Game: each typed name fires "X saved to players". Three toasts stood over the Buy-in field with Messages set to Replace. | Seen. | `src/components/players.tsx:65`, `:110`; `ToastHost` in `src/components/ui.tsx:1077` |
| F22 | P3 | Left from the v1.6.2 diff review: (a) the buy-in count and "+" touch with 0 px between them; (b) the live row texts fade in but cut out; (c) `.felt-period-tips` in `src/css/report.css:7` has no user; (d) `felt-theme3` CSS in `src/styles.css` has no user. | Read. | as listed |
| F24 | P3 | Leaving Join for Home inside one session showed the Start view again. Confirm whether Home on the closed-room page and "Host a game instead" do this by design. | Seen once, after URL navigation. | `src/screens/Join.tsx:158`, `src/screens/Start.tsx`, `src/router.ts` |
| F26 | P3 | `package-lock.json` says version 1.3.3. `package.json` says 1.6.2. | Read. | `package-lock.json:3`, `:9` |
| F27 | P3 | The test server uses the real Firebase project unless the mock flag is set. The review opened a real room for 1 minute by accident. | Seen. | `src/live/host.ts:50-58`, `.claude/launch.json` |

Fixed in v1.6.2 (for context, not to redo): the buy-in pill class clash (`.felt-pill`), the live link row words.

## 3. Owner questions

Ask these before the revision that needs them. Each has a default so the work can go on if the owner does not answer.

| Q | Blocks | Question | Default |
|---|---|---|---|
| Q1 | F4 | Which time is the game time: first hand to last hand, or first buy-in to close? | First buy-in to close, the same clock as the players. |
| Q2 | F5 | Does Results follow Show money (chips by default), or does it stay in money? | Follow Show money. Settle Up stays in money. |
| Q3 | F6 | On a takedown, is the viewer label "Result"? Does the host tab stay "Showdown"? | Viewer label "Result". Host tab unchanged. |
| Q4 | F7 | What does a viewer see when the room closes? | "The game has ended. Ask the host for the report link." above Home. |
| Q5 | F9 | May the card button carry the words "Sign in" until the first sign-in on that phone? | Yes, words until first sign-in, icon only after. |
| Q6 | F12 | Is Off a stop on the Animation speed slider, or is it only the Reduced motion switch? | Three stops. Off goes. The switch gets a visible label. |
| Q7 | F21 | Rebuy "+": Undo on the toast, or a 2 s guard against a second tap, or both? | Undo on the toast (`withUndo`). |
| Q8 | F10 | Keep "BB (Cat, 0) folds"? | Keep. No change. |
| Q9 | F14 | May the four image choices become one choice with tick boxes for its parts? | No change until the owner says so. |
| Q10 | F22a | Is the buy-in count with "+" one control (0 px between its halves is correct)? | Yes. Add the exception to CLAUDE.md. |

Owner answers, 10 Nov 2026: Q1, Q3, Q5, Q7, Q8 take the default. Q2: Results show chips (they follow Show money); Settle Up is the only screen that stays in money. Q4: the closed room says "Room closed. Please ask Host to share new link or report." Q6: Off stays a stop (4 stops); Off turns all animation into instant cuts; the Reduced motion switch takes out the extra motion, such as bounce, and gets a visible label. Q9 and Q10: the owner asked for an explanation; still open.

Six questions from the last handover are still open (`.handover/2026-11-10-09-59.md`, "Open owner questions"). F21 answers its question 2.

## 4. Revisions

Each revision is one commit and one push to `main`, with a version bump in `package.json` and an entry in `src/lib/changelog.ts`.
Run the revisions in this order. Tasks inside one revision can run at the same time: no two tasks share a file.

### 1.6.3: data safety (start here, no owner answer needed for F1)

| Task | Finding | Agent | Files owned | Done when |
|---|---|---|---|---|
| A1 | F1 | Sonnet | `src/screens/CountChips.tsx`, `src/store.ts`, `src/store.test.ts` | The count keeps its figures off the game until Close game, or Back to game removes the cash-outs that the page filled in itself. A cash-out that existed before the page opened stays. A new test covers: open the count, go back, stacks are as before. In the browser: End game, Back to game, every stack keeps its value. |
| A2 | F21 (Q7) | Haiku | `src/screens/GameLive.tsx` | A tap on "+" still rebuys at once. The toast has Undo, and Undo removes that buy-in only. |
| A3 | F26, F27 | Haiku | `package-lock.json`, `.claude/launch.json`, `src/live/host.ts` (`pickDriver` only) | The lock file version matches. `felt-test` starts on the mock driver with no flag set by hand (for example a Vite env value that `pickDriver` reads). The owner's port 5173 and the built app still use Firebase. |

Review: Opus reads the diff of A1 for the case where a player sent a count from the player view (`g.claimed`), and for a game that is reopened.

### 1.6.4: closed game and host clarity (needs Q1, Q2, Q6)

| Task | Finding | Agent | Files owned | Done when |
|---|---|---|---|---|
| B1 | F2, F3 | Sonnet | `src/screens/GameLive.tsx` | A closed record has no live link row. Its tab says "Players 4". Its list has one caption that fits a closed game. A live game is unchanged. The row leaves with a fade or a close, not a cut. |
| B2 | F4 (Q1), F5 (Q2) | Sonnet | `src/lib/format.ts`, `src/lib/format.test.ts`, `src/screens/CloseTable.tsx` | Game time and player time use one clock. The time on Results has a label. Results follows Show money through the figure helpers in `format.ts`. Tests cover the time with 0 hands, 1 hand and a closed game. |
| B3 | F12 (Q6), F13 | Haiku | `src/screens/Settings.tsx`, `src/css/settings.css` | The slider keeps 4 stops (Off, Quick, Standard, Relaxed). Off makes every animation an instant cut. The Reduced motion switch has a visible label. Dark theme shows once on Settings. |
| B4 | F17 | Haiku | `src/components/ui.tsx` (`ToastHost` only) | With Messages on Replace, one toast shows at a time when names are typed fast. Stack mode still shows up to 3. |
| B5 | F22 b, c, d | Haiku | `src/styles.css`, `src/css/report.css`, `src/components/live.tsx` | The live row words fade out as well as in. The two dead CSS blocks are gone, after a search proves no user. |

B1 and A2 both edit `GameLive.tsx`: finish and commit 1.6.3 before B1 starts.

### 1.6.5: viewer (needs Q3, Q4, Q5)

| Task | Finding | Agent | Files owned | Done when |
|---|---|---|---|---|
| C1 | F6 (Q3) | Sonnet | `src/live/snapshot.ts`, `src/live/live.test.ts` | A takedown shows under the agreed label in the viewer list and in Copy hand. A real showdown is unchanged. Tests cover both. |
| C2 | F7 (Q4), F9 (Q5), F24 | Sonnet | `src/screens/Join.tsx` | The closed room page says what happened and what to do next. The sign-in button says what it does until the first sign-in. Home from that page lands where the owner rule says. |
| C3 | F8, F11 | Haiku | `src/css/viewer.css`, `src/components/candle.tsx` | No control on viewer Settings sits under the card button at rest. The bar on viewer Players carries its labels on the page (lowest, highest, 0 line), with the tip kept for the rule. |

C2 and C3 touch the same screen from different files. C3 must not edit `Join.tsx`: if it needs a change there, it reports it and C2 makes it.

### 1.7.0: second review, then accessibility and structure

Step 1, review (read-only agents, section 6). Step 2, the orchestrator adds the new findings to section 2 and splits them into tasks. Step 3, build:

| Task | Finding | Agent | Files owned | Done when |
|---|---|---|---|---|
| D1 | F15, F16 | Sonnet | `src/screens/Start.tsx`, `src/components/navRail.tsx`, `src/components/ui.tsx`, `src/screens/CountChips.tsx`, `src/screens/Players.tsx`, `src/screens/Report.tsx` | Each control in F15 that truly lacks a name has one. Each false alarm is listed in the report with the proof. A closed filter is out of the accessibility tree. |
| D2 | F14 (Q9) | Sonnet | `src/screens/Report.tsx`, `src/css/report.css` | Only if the owner says yes to Q9. Runs after D1 (same file). |
| D3 | new findings from step 1 | as sized | set by the orchestrator | set by the orchestrator |

## 5. Rules for the orchestrator

1. **Roles.** Opus: reads this plan, checks each task brief against CLAUDE.md, starts the agents, reviews every diff, commits and pushes. Sonnet: logic with tests, and any change across more than one file. Haiku: one or two files, copy and CSS. Agents never commit, never push, never edit CLAUDE.md.
2. **File ownership.** Each brief names the files the agent owns. An agent edits no other file. It reads a file again before each edit. Two agents never hold the same file.
3. **Test server.** Use `felt-test` only (port 5174). Port 5173 holds the owner's real data. Before any live link test, run `localStorage.setItem('felt-live-mock','1')` and reload: without it the switch opens a real room on the owner's Firebase project. Set `sessionStorage.setItem('felt-role','host')` to skip the Start view. `window.__store` reads and seeds data in dev.
4. **One browser tab per agent.** Open a new tab (`tabs_create`), set 390 x 844 after the first navigation. A background tab plays animations late: bring the tab to the front before a screenshot, or read the page text.
5. **Proof.** A task is done when the agent watched it in the browser and says what it saw. Then `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`, `git checkout tsconfig.tsbuildinfo`.
6. **Review.** CLAUDE.md asks for an Opus review when a set of work touches screens. Give the reviewer the diff, CLAUDE.md "Motion and structure review", and the Unslop list. It reports `path:line: problem. fix.` and edits nothing.
7. **Copy.** ASD-STE100, chips first, "7-2", "SB" and "BB", no contractions, no dashes in UI text. New explanation text goes in `src/lib/help.ts`, one line per field.
8. **Motion.** Nothing cuts. A new element that appears or goes fades, slides or grows, in the time band of its type (`src/lib/motion.ts`).
9. **Commit.** One commit per revision on `main`, then `git push origin main`. Never commit `trial/`. If an owner question is open and has no default in section 3, stop and ask.
10. **Recurring agents.** The global rule puts recurring agents in `.claude/agents/` with a `model:` field. Three are enough: a Sonnet builder, a Haiku builder, an Opus reviewer. Create them only if the owner agrees.

## 6. Not reviewed: second review tasks

Read-only Sonnet agents with the browser. Each gets its own port so the data does not mix: add `felt-test-2` (5175) and `felt-test-3` (5176) to `.claude/launch.json`, or run them one after the other on 5174. Each agent seeds its own data, reports findings in the format of section 2, and edits nothing.

| Task | Scope | Data to seed |
|---|---|---|
| R1 | Recorder past the flop: Turn, River, all-in run-out, more than one run, showdown with shown cards, Not shown, 7-2 bounty tag, minimum-raise error, straddle, dark, a hand opened again, swipe back, card picker with a card entered twice. | 6 players, 3 hands |
| R2 | Game page tools: Chip move (both tabs), Shuffle seats, drag to reorder, Add player mid-game with a saved name, player card sheet and its three accordions, player code states, pause and clock out and back in, rebuy after a bust, game settings sheet, Hands tab with swipe delete, missed hand. | 9 players with long names, 5 hands, 1 chip move |
| R3 | Viewer with a hand in progress on the mock driver, two tabs: play-by-play steps, Table view mid-hand, new-hands pill, sign-in with a player code, card entry and the eye states, the ! flags, My final chip count, Flag a wrong update, a locked room with a password, the host pop-up on join, room closed with Undo. | 6 players, host logging in tab 1, viewer in tab 2 |
| R4 | After the game: Results with 9 players and uneven counts, the count that differs from the estimate, Reopen, Settle Up with expenses and Mark paid, Report View, Link and Download for each choice, Games Stats, Leaderboard chart with 5 games, Stats with data, groups and Others, Settings tabs Game Defaults, Cards, Data, Info, backup and restore. | 3 closed games, 2 groups |
| R5 | Both themes and Reduced motion on every screen of R1 to R4 at 320, 390 and 430 px. A full `impeccable detect --json src` run. Check each hit against the Kept list in `docs/UI-REVIEW.md`. | data of R4 |

Cannot be checked here: a real iPhone (Safari back swipe, haptics, keyboard and sheets, camera scan, the nav bar height at launch). Ask the owner, as in the last handover.

## 7. State at handover

Update 10 Nov 2026 (evening): 1.6.3, 1.6.4 and 1.6.5 are built and committed on `main`, not pushed (Q9 and Q10 open). 151 tests pass. Section 4 tasks A1 to C3 are done; see PROGRESS.md for gaps. 1.7.0 is next.

Owner answers, 10 Nov 2026 (later): Q9 yes, in a new form (Export screen with HTML, PNG, CSV; PNG sets Summary, Detailed, Playstyle, Full Action Log). Q10 yes (split control exception in CLAUDE.md). Push 1.6.3 to 1.6.5 together with 1.7.0. Results candles are horizontal rows, ranked highest to lowest by the ending result from par. Rebuys between two hands form one set.

Earlier state:

- `main` at v1.6.2 (`1d8736c`) plus this plan. 144 tests pass. `tsc` clean.
- The test server data (port 5174) holds one closed game, "Tuesday cash", made by the review. Erase it or keep it: it is not owner data.
- The review left the test server theme as it found it (dark).
