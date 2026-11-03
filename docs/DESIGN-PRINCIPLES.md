# Felt: Design Principles

Rules for future builds. `CLAUDE.md` links here.

## Colour: 60 / 30 / 10

- 60%: ink `#02070A` in dark, `#EEF2F1` in light. Backgrounds and surfaces.
- 30%: blue `#0297DE` in dark, `#026FA6` in light. Tinted surfaces, active tabs, the background mesh, standard primary buttons.
- 10%: coral `#FC734D` in dark, `#B8441F` in light. One main action per screen, the next box to fill, the signed-in player, marks.
- Text on a blue or coral fill: ink in dark, white in light. White on the dark-theme fills fails contrast.
- Losses are not coral. Dark uses `#F7A8B8`, and light uses `#A3342A`.
- Black suit marks always sit on a white card or chip, never on a dark surface.

## Phone details

- Numbers use tabular figures (`.sat-num`), so counters do not jiggle.
- Headlines stay balanced, with no single word on the last line.
- Respect safe areas at the top and bottom of every full-screen view.
- Tap targets are at least 44px, even when the icon is smaller.
- The screen changes before the server answers. A failure shows a toast.
- Show the last copy on the phone, then refresh in the background.
- Skeletons, not spinners or "Loading" text.
- Undo toasts, not "are you sure". Keep a prompt only when no Undo can work: erase all data, replace a player code.
- Sheets dismiss with a swipe down.
- Use continuous corners where the browser supports them.
- Tips and toasts sit in the top layer, above open sheets.

## Desktop details, for any future desktop build

- A command menu on cmd+K.
- Keyboard shortcut hints beside actions.
- Safe triangle: a submenu stays open while the pointer crosses towards it.
- Blurred placeholders while images load.

## Oldest phones

Felt needs iOS 16.2 or Chrome 111. Below that, `app/index.html` shows a warning. Do not add workarounds for older phones.
