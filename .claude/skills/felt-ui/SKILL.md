---
name: felt-ui
description: Felt UI principles. Use when adding or changing any screen, button, name, figure or control in the app.
---

# Felt UI Principles

## Everything named is a way in

- A player name opens the player card, on every screen. Use `PlayerName` from `src/components/players.tsx`.
- The exception is logging: names in the live action table, chip pickers and the chip count keep their logging job.
- A figure opens what is behind it. On the player card, Net and Win rate open Full stats, and Games opens the list of games.
- A row in a list is one button across its full width.
- A name inside a row still opens the player card. The rest of the row keeps the job of the row.

## A control exists only when it works

- Do not grey out a control that needs something else first. Leave it off the page, and show it with the thing it needs.
- Copy and QR of the live link show only when the room is open.
- Copy of a player code shows only with the code on screen.
- Keep a greyed control only when the reader must learn that the option exists, for example Bet with nobody left to answer.

## The frame reacts to the press

- If text sits in a frame, the frame reacts. Rows reach the edge of their list, so the light reaches the corners.
- The action runs at once on release. A press never waits for its light.
- A press has one look, however long it lasts. `docs/MOTION-LIST.md` has the values.
- Each press gives a haptic tick, fired inside the click.

## Words on the page

- An explanation goes in the info tip of its field. The page shows labels and live figures.
- Check every element against the Unslop list in the global CLAUDE.md. Mark each hit as value-adding, with its job, or remove it.
- Sentence case labels, with no eyebrow above a heading.
- A status line under a row title (for example Check these cards) sits on its own line, 2 px below the title. Never run it on beside the title.
- Instrument Serif is for the Felt wordmark only.

## Elevation

- Use three shadow depths only, in the whole app. Do not write a new drop shadow.
- `--felt-elev-1`: resting. Glass panels and live cards.
- `--felt-elev-2`: raised. Buttons that stand up from a panel, a dragged row, the floating card button.
- `--felt-elev-3`: overlay. Sheets, info tips, toasts, the QR pop-up.
- Each depth is stacked soft layers. Each layer doubles the offset and the blur, so the blur is 2 x the y-offset, and each layer has a lower opacity.
- A live card stands on the table (depth 1). A place for a card is etched into it: a groove and a light lip, no fill, no shadow.
- Give a frame one border only. Never put an outline with a gap around a border: draw the focus line over the border.
- State glows (lamps, the live switch) and inset lines (etched slots, wells) are not elevation.

## Panels come out of their button

- A sheet opened by a press pulls out of that button, in its colour, and goes back into it on Close.
- A swipe down slides the sheet away.
- A long press exists only where it does something different. Everywhere else a press acts at once.

## Morphs clip, never stretch

- When an element grows into another or shrinks into one (a page into a button, a sheet out of a button, the QR out of its icon), change the frame with a clip. The content keeps its own size inside it.
- Never scale a picture of the old content to fit the new shape.
- Bring in the new colour and text while the move ends. Do not leave a visible pause and then flip to the new look.
- Uniform press depth (0.93 to 0.98) and the drag lift are not morphs.

## Made for a poker table

- Draw from the table, not from generic app parts: chips, the chip tray, felt, paper notebook tabs.
- The tab bar is a chip tray: one straight rail, a pocket per tab, a chip that rolls (it turns by distance over radius).
- The header is a notebook tab on the page edge. Do not bring back a glass top bar.
- A new control that marks a choice should feel like a chip or a card before it feels like a pill.

## Colours come from five

- Use tokens only. With Custom colours, every token derives from Base, Main, Accent, Up and Down (styles.css, html[data-palette="custom"]).
- A new colour must derive from one of the five with color-mix. Do not add a literal colour.
