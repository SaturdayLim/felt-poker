# Motion List

The motion in Felt, as the owner picked it on 4 Nov 2026 from live samples. `src/lib/motion.ts` plays it. Numbers are in milliseconds.

## A. Elements

| # | Element | Pick | Values |
|---|---|---|---|
| A1 | Tab highlight | Springy | spring 320, bounce 0.3. The main tab bar: a chip rolls along the rail with the same spring, lifting 6 px out of the pocket mid-roll |
| A2 | Screen change | iOS push | new slides in, old drifts 28% and fades out in 130, 320. The screens are see-through, so the old one must go first |
| A3 | Log hand into the hand page | Clip morph, overlapped | Close: the page clips into the button (spring 350, bounce 0.08, no stretch) and fades over 300; the button with its text fades up at once (180). Open: text goes (120), blue goes (160), the page opens from 60. Swipe back: the page clips towards the button with the finger (70% of the way at full width); past a third it finishes (spring 350) with a blue stand-in at 140 and its text at 220; earlier it springs back (spring 300, bounce 0.3) |
| A4 | Sheet | Out of its button, down to leave | opened by a press: clip from the button, spring 350, bounce 0.08, button colour fades in 200 after 90, content at 110. With no press: up spring 500. Leaving, always: slides down, spring 360, bounce 0 |
| A5 | Keypad and card picker | Spring | spring 280, bounce 0.1 |
| A6 | QR pop-up | From the icon | clip from the icon, spring 300, bounce 0.15; back into the icon on close 220 |
| A7 | Info tip | Quick fade | 95% to full, 150, from the i. Close 120 |
| A8 | Toast with Undo | Rises, falls | spring 300, bounce 0.15. Falls 220 |
| A9 | Drag to reorder | Bouncy settle | lift 1.05, spring 300, bounce 0.3 |
| A10 | Action box filling in | Small pop | 88% to full, spring 220, bounce 0.45 |
| A11 | Cards on the board | Dealt from the left | spring 420, bounce 0.14, 70 apart, small turn |
| A12 | Live button | Pressed in | down 70, spring 240, bounce 0.35 |

## Presses

The frame reacts: the button, or the list around it when the button is its only row. Rows reach the frame edge.
A press has one look, however long the finger stays down: the frame sinks to its depth in 70 and the light spreads in 260. It clears in 200 when the finger lifts.
Every action runs at once on release. A long press only does something on controls that say so (hold to replace code, a recorder name).

## B. Button presses, by what the press does

| # | Class | Buttons | Pick | Values |
|---|---|---|---|---|
| B1 | Log | C, F, All-in, digits, Bet, card in the picker | Firm | scale 0.93, spring back 160 |
| B2 | Commit | Save hand, Save and next, Confirm, Save count | Word changes | Saved, scale 0.96 |
| B3 | Go forward | Flop, Turn, Showdown, Log hand, Full stats | Ripple | scale 0.97, ripple. See Presses |
| B4 | Go back or dismiss | Back, Close, Done, Cancel | Ripple | scale 0.98, ripple |
| B5 | Select | Tabs, segments, chips | Clear pop | 86% to full, spring 240, bounce 0.4 |
| B6 | Toggle | Switches, Live button, Dark, Muck, eye icons | With weight | down 3 px, spring 240, bounce 0.35 |
| B7 | Open a pop-up | QR, card button, player row, hand row | Ripple | scale 0.96, ripple |
| B8 | Hold to confirm | Replace code | Speeds up | pulses at 0, 500, 850, 1050, strong pulse at 1200 |
| B9 | Remove | Chip move, missed hand, buy-in | Fades away | fade, spring 300, bounce 0.12, its space closes, rows close up |
| B10 | Copy or send | Copy link, Send to host | Word changes | Copied, Sent. Icon-only copy keeps its toast |
