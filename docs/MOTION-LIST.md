# Motion List

The motion in Felt, as the owner picked it on 4 Nov 2026 from live samples. `src/lib/motion.ts` plays it. Numbers are in milliseconds.

## A. Elements

| # | Element | Pick | Values |
|---|---|---|---|
| A1 | Tab highlight | Springy | spring 320, bounce 0.3 |
| A2 | Screen change | iOS push | new slides in, old drifts 28% and fades out in 130, 320. The screens are see-through, so the old one must go first |
| A3 | Log hand into the hand page | Steps | Close: the page shrinks into the button (spring 350, bounce 0.08), the button turns blue at 320 (120), the text shows at 500 (140). Open: the text goes (90), the blue goes at 60 (120), the page grows from 160 |
| A4 | Sheet | Out of its button | opened by a press: clip from the button, spring 350, bounce 0.08, button colour fades in 200 after 90, content at 110. Close goes back into the button. Swipe down: spring 360, bounce 0. With no press: up spring 500 |
| A5 | Keypad and card picker | Spring | spring 280, bounce 0.1 |
| A6 | QR pop-up | From the icon | spring 300, bounce 0.15, fades on close 220 |
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
| B9 | Remove | Chip move, missed hand, buy-in | Shrinks away | 90% and fade, spring 300, bounce 0.12, rows close up |
| B10 | Copy or send | Copy link, Send to host | Word changes | Copied, Sent. Icon-only copy keeps its toast |
