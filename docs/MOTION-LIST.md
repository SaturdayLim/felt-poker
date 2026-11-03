# Motion List

What Claude needs from the owner to tune motion in Felt. For each row, send one example: a screen recording, a link, or an app name and where to look. Say what you like about it, for example the speed or the bounce.

Every row states what Felt does now. Numbers are in milliseconds.

## A. Elements

| # | Element | Felt now | Example needed |
|---|---|---|---|
| A1 | Tab highlight (bottom bar, stage tabs) | Slides, 280, iOS drawer curve | A tab highlight that feels smooth |
| A2 | Screen change between tabs | Old and new slide together, 280 | A tab change with screens sliding |
| A3 | Log hand into the hand page | Button grows into the page, 300 | A button that grows into a page |
| A4 | Sheet opening and closing | Up 320, down 240, backdrop fades | A bottom sheet, including the drag |
| A5 | Keypad and card picker | Pushes up 240, slides down 240 | A custom keypad or picker |
| A6 | Pop-up over the page (QR code) | Grows 280, slides down 240 | A pop-up with a tap outside |
| A7 | Info tip | Appears at once | A small tip or tooltip |
| A8 | Toast with Undo | Kit default | A toast that leaves well |
| A9 | Drag to reorder | Lift, rows slide aside, slot, settle 200 | A list you like to reorder |
| A10 | Action box filling in | Colour change, fast | A form or grid that fills in well |
| A11 | Cards dealt onto the board | Size change only | A card game with good dealing |
| A12 | Live switch | Colour and glow, 240 | A glowing or physical switch |

## B. Button presses, by what the press does

| # | Class | Output | Buttons in Felt | Feedback now | Example needed |
|---|---|---|---|---|---|
| B1 | Log | Records one action and moves on | C, F, All-in, digits, Bet, card in the picker | Scale 0.97, next box selected | A very fast repeat press |
| B2 | Commit | Saves something and ends a step | Save hand, Save and next, Confirm, Save count | Scale 0.97, toast | A satisfying save or confirm |
| B3 | Go forward | Opens the next stage or page | Flop, Turn, Showdown, Log hand, Full stats | Scale 0.97, page change | A press that leads into a new page |
| B4 | Go back or dismiss | Closes or returns | Back, Close, Done, Cancel | Scale 0.97, panel leaves | A close press |
| B5 | Select | Picks one option and stays on the page | Tabs, segments, Dealt in chips, Button chips | Highlight slides, or colour | A chip or segment press |
| B6 | Toggle | Turns a state on or off | Switches, Live switch, Dark, Muck, Pay bounty, eye icons | Colour change | A toggle with weight |
| B7 | Open a pop-up | Shows a layer, nothing changes | Info tip, QR, card button, player row | Scale 0.94 on the card button | A press that opens a layer |
| B8 | Hold to confirm | Cannot be undone | Replace code, hold a name | Ring fills 1200, vibration | A hold-to-confirm you trust |
| B9 | Remove | Deletes, with Undo | Delete hand, Clear the action | Scale 0.97, toast with Undo | A delete with Undo |
| B10 | Copy or send | Puts data outside Felt | Copy link, Copy hand, Send to host, Download | Toast only | A copy press with a good tick |

## How to send

1. Pick the rows you care about most. Start with 3.
2. Send the example and the row number, for example "A4: Apple Maps sheet".
3. Rows with no example keep the current motion.
