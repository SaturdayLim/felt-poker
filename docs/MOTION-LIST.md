# Motion List

The motion in Felt, as the owner picked it on 4 Nov 2026 from live samples. `src/lib/motion.ts` plays it. Numbers are in milliseconds.

## Bands

Each kind of animation takes its own time (owner's rule, 7 Nov 2026). The difference must show, but nothing must feel slow. A spring's length is its visual duration.

| Band | Kind | Time |
|---|---|---|
| Press | A button press and its spring back | 100 to 200 |
| Standard | A pop-up, a panel, a menu, a card that grows, a row that moves | 200 to 300 |
| Screen | A sheet, a page or screen that opens or closes | 300 to 400 |
| Loader | A complex loader (the load screen) | 500 and more |

## A. Elements

| # | Element | Band | Pick | Values |
|---|---|---|---|---|
| A1 | Tab highlight | Standard | Springy | spring 280, bounce 0.3. The main tab bar: a chip rolls along the rail with the same spring, lifting 6 px out of the pocket mid-roll |
| A2 | Screen change | Screen | iOS push | new slides in, old drifts 28% and fades out in 130, 320. The screens are see-through, so the old one must go first |
| A3 | Log hand into the hand page | Screen | Clip morph, overlapped | Close: the page clips into the button (spring 350, bounce 0.08, no stretch) and fades over 300; the button with its text fades up at once (180). Open: text goes (120), blue goes (160), the page opens from 60. Swipe back: the page clips towards the button with the finger (70% of the way at full width); past a third it finishes (spring 350) with a blue stand-in at 140 and its text at 220; earlier it springs back (spring 300, bounce 0.3) |
| A4 | Sheet | Screen | Up to open, down to leave | Opens by sliding up from the bottom, always: spring 360, bounce 0. Leaves by sliding down, always: spring 300, bounce 0. The backdrop fades in step. Wide screens: fade and scale, 320 in, 240 out |
| A5 | Keypad and card picker | Standard | Spring | spring 280, bounce 0.1 |
| A6 | QR pop-up | Standard | From the icon | clip from the icon, spring 280, bounce 0.15; back into the icon on close 220 |
| A7 | Info tip | Standard | Quick fade | 95% to full, 150, from the i. Close 120 |
| A8 | Toast with Undo | Standard | Rises, falls | spring 260, bounce 0.15. Falls 220 |
| A9 | Drag to reorder | Standard | Bouncy settle | lift 1.05, spring 280, bounce 0.3 |
| A10 | Action box filling in | Press | Small pop | 88% to full, spring 180, bounce 0.45 |
| A11 | Cards on the board | Standard | Dealt from the left | spring 300, bounce 0.14, 70 apart, small turn |
| A12 | Live button | Press | Pressed in | down 100, spring 180, bounce 0.35 |

## Presses

The frame reacts: the button, or the list around it when the button is its only row. Rows reach the frame edge.
Every press is in the Press band. Every pressable control sinks on pointer down and springs back on release. A hold control (.felt-hold, toast Undo, the drag grip, a recorder name) and `data-press="none"` do not sink. A player name glows around its letters instead.
A press has one look, however long the finger stays down: the frame sinks to its depth in 100 and the light spreads in 200. It clears in 160 when the finger lifts. The frame springs back in 160 (Select and Toggle: 180, with a small overshoot).
Every action runs at once on release. A long press only does something on controls that say so (hold to replace code, a recorder name).

## B. Button presses, by what the press does

| # | Class | Buttons | Pick | Values |
|---|---|---|---|---|
| B1 | Log | C, F, All-in, digits, Bet, card in the picker | Firm | scale 0.93, spring back 160 |
| B2 | Commit | Save hand, Save and next, Confirm, Save count | Word changes | Saved, scale 0.96, spring back 160 |
| B3 | Go forward | Flop, Turn, Showdown, Log hand, Full stats | Ripple | scale 0.97, ripple, spring back 160. See Presses |
| B4 | Go back or dismiss | Back, Close, Done, Cancel | Ripple | scale 0.98, ripple, spring back 160 |
| B5 | Select | Tabs, segments, chips | Clear pop | scale 0.96, spring back 180, bounce 0.4 |
| B6 | Toggle | Switches, Live button, Dark, Muck, eye icons | With weight | scale 0.97 and down 3 px, spring back 180, bounce 0.35 |
| B7 | Open a pop-up | QR, card button, player row, hand row | Ripple | scale 0.96, ripple, spring back 160 |
| B8 | Hold to confirm | Replace code | Speeds up | pulses at 0, 500, 850, 1050, strong pulse at 1200 |
| B9 | Remove | Chip move, missed hand, buy-in | Fades away | Standard band: fade, spring 260, bounce 0.12, its space closes in 220 after 40, rows close up |
| B10 | Copy or send | Copy link, Send to host | Word changes | Copied, Sent. Icon-only copy keeps its toast |
| B11 | Plain | Any other button or link | Small sink | scale 0.97, spring back 160 |

## C. Interior.dev behaviours, picked 8 Nov 2026

Springs are stiffness, damping and mass. `physCurve` in `src/lib/motion.ts` plays them; CSS reads them through `--felt-cross`, `--felt-cell` and `--felt-pill`.

| # | Element | Pick | Values |
|---|---|---|---|
| L2 | Load screen | Grey chips, glowing S | two chips drop (bottom 0, top 260), fade to 22% from 800, gold S draws 1000 to 1900 with a blurred glow |
| A2 | Tab change | Content swipes, bars stay | NAV_MS 600, ease-in-out, shared with the chip roll |
| A1 | Chip roll | Rolls, wide dip | turn = distance over radius, dip 78 wide and 36 deep |
| A1b | Highlight | Tabs spring | 620, 42, 0.35 (over-damped: never leaves the frame) |
| B1, B2 | Commit | Loading button | faces cross-fade on 260, 34, 0.8; Saving 520 ms, then the word |
| B2b | Saved cards | Flip face down | 420 ms, 70 apart, starts 160 after the list returns |
| P1 | Replace player code | Hold to confirm | 1800 ms fill, drain 720 ms, new code loads one box per sixth |
| O1 | Player code entry | OTP input | blur-in 220 ms, shake 320 ms |
| S1 | Player search | Expanding search | width spring 380, 38, 0.7; field fades in 60 ms late |
| N2 | New hands | New items pill | 540, 34, 0.5 in; 160 ms out |
| G1 | Player card Games | Accordion | height 480, 40, 0.6; text fades 180 in, 140 out |
| Z1 | Animation speed | Slider detents | cell spring 520, 34, 0.45; thumb grows to 108% while held |
| A9 | Reorder | Reorder list | lift 102%, cell spring |
| I1 | Player cards button | Icon morph | cards turn into a cross on the cell spring |
| V1 | Raise amount | Inline validation | box turns red, message rises in on the cross-fade spring |
