# UI Review, 1.2.8

Checked on 4 Nov 2026 against the Unslop list (global CLAUDE.md), the Impeccable craft floor and its detector, and stop-slop for copy.
Method: WebKit at 393 px, light theme, made-up players. Screens seen: Home, New Game, game page (Players and Hands), player card, player games, recorder (Pre-flop, Flop, picker, keypad, Showdown), player cards sheet, End Game count, Games, Players, Stats (empty period), Settings, Join.
Not seen: dark theme, Close Table with results, Stats with data, Report, Group, viewer screens.

## Removed or changed

| Hit | Where | Change |
|---|---|---|
| All-caps subtitles | Every caption, table head, live tag | Sentence case |
| Instrument Serif | Headings, player names, figures | One sans face. The serif stays on the Felt wordmark |
| Eyebrow | Live game cards, result card | Moved into the line under the name, or removed |
| Side stripe | Live game cards, rule groups | Removed |
| Verbose text | Theme, Opening screen, Groups, Track the button, field hints | Moved to the info tip |
| Containers showing through | Sheets | Solid background |
| Passive copy | 4 tips | Active voice |

## Kept, with the job each one does

| Hit | Where | Job |
|---|---|---|
| Tags and pills | Player chips, Pressed states, Muck | Tap targets with an on and off state |
| Tags and pills | Split, n shown, No board on hand rows | Facts the row needs at a glance |
| Italics | Default action boxes | Marks a box that took the default |
| Opacity shades | Earlier boxes, folded rows, greyed page | CLAUDE.md asks for these states |
| Dividers | Rows in a list | Separate rows that now reach the frame edge |
| Numbering | Seats, hand numbers, show order | Real order, read at the table |
| Squircles | Frames and buttons | The chosen shape. The press reacts to it |
| Negative kerning | Card ranks, -0.03em | Fits 10 inside a small card |
| Monospace | Hand numbers, version | Data, used only there |
| Bounce easing (detector) | Drag settle, A9 | The owner picked it |

## Open: needs the owner

| Hit | Where | Why it is open |
|---|---|---|
| Gradient background | Mesh behind every screen | The glass look depends on it |
| Containers with borders | Glass cards carry a border and a shadow, and the craft floor asks for one of these | Removing it changes the look of every screen |
| Over-detailed UI | Game page: password, figures, seats, status light, stack and time on each player | Each one has a job today, so removal needs a choice |
| Redundant header lines | "4 Players", "1 Game Recorded", "Home Game Tracker" | Small. Can go with one word from the owner |

## Clean

Dithering, ASCII images, code breadcrumbs, section numbers as decoration, overly detailed diagrams, periods at the end of titles, gradient text, hard offset shadows. No em dashes in help text or screens.
