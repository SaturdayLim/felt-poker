# Felt PRD: Player Codes, Card Entry and Live Link

Status: 1.0.1 built and pushed. 1.1.0 built (code complete, tested with the mock driver); the Firebase project `felt-live` still needs to be created (docs/FIREBASE-SETUP.md).
Source of the flow: the host's nine-step description of 2 Nov 2026. Source of the Firebase notes: the Stack trivia app (`Stack App v6 260611`: `FIREBASE-SETUP.md`, `DECISIONS-V2.md`, `js/sync/adapter.js`, `driver-firebase.js`, `driver-mock.js`).

## 1. Goal

The host records a game on one phone. After the game, every player can open a report on their own phone and see their own page, locked by a code only they know. During the night, players can follow the game live (read only). Nobody can read another player's private cards at any point.

## 2. The flow, step by step

| Step | What happens | Release |
|---|---|---|
| 1 | Host creates a game with players. | Exists |
| 2 | Host records hands through the night. | Exists |
| 2a | After each hand the host can add a player's hole cards: pick the player, enter the two cards. The cards are stored and never shown again. Entering again replaces them. At showdown the host still enters shown cards into the game log by hand. | 1.0.1 |
| 3 | At game start (new), host opens Players, then a player, and issues each code with the eye. Players who need one later get it the same way. | Exists |
| 4 | Top right of the player summary card: an eye icon. Tap it to make a new code and show it once. The old code stops working. If a code was already issued, the app asks first. | 1.0.1 |
| 5 | Player notes the code. | n/a |
| 6 | Host asks who wants to add or fix cards. Same entry screen as step 2a, any time, without a code. | 1.0.1 |
| 7 | Host shares the HTML report in the group chat. | Exists (1.0.0) |
| 8 | Player opens the report, taps their name, enters the code. | Exists |
| 9 | A forgotten code: host resets it with "Copy new code" (copies, never shows). Old reports keep working with the old code. A new code works only in a report built after the reset. | 1.0.1 |
| 10 | Live link: host shares one link or QR. Players follow each action live, read settings and match history, and add their own cards with their code. Reports stay in the HTML file. | 1.1.0 |

The "Player codes" card on Download or Share goes away in 1.0.1. Codes belong to the player's screen only.

## 3. Release 1.0.1: codes and card entry (no server)

### 3.1 Code rules

- One code per player, 6 characters, no 0, O, 1, I or L.
- The app keeps every code in its own data (the report needs it to lock the page). No screen shows a stored code again. Backups contain the codes.
- Eye icon: makes a new code, shows it once in a sheet with Done. Closing the sheet hides it for good.
- A player with an issued code: tapping the eye first asks "This cancels the current code. Continue?"
- Reset without showing: "Copy new code" makes a new code and copies the message "Name, your code for the Game report is XXXXXX." to the clipboard. The host pastes it to the player.
- A player whose code was never issued shows "No code yet" on the card. The report build warns once: "2 players have no code. Open each player to give them a code." The report still builds.
- The old Show and New code row in player settings is removed.

### 3.2 Card entry (write only)

- Entry point: a "Cards" button on the hand result screen and on the closed-game hand review.
- Screen: pick the player (all players of the game), then enter two cards with the existing card picker. Save.
- After saving, the app shows only "Saved for Name". It never shows the stored cards. It shows whether cards exist for that hand ("Entered") so a player knows an entry is there. This text is the only retrieval.
- Entering again for the same player and hand replaces the old entry.
- The host's own My cards screen follows the same rule: stored, not shown again.
- No code is asked. The screen shows no data about other players.
- Cards at showdown: the host enters them in the game log as today. Nothing changes there.

### 3.3 Clash rule

- Entry always saves. The app never says "clash".
- At report build, a hand where the private cards of two players share a card, or a private card matches a card on the board or a shown card, is left out for the players involved.
- The player page shows "N hands left out (cards clash)" with no detail.

### 3.4 Suit preferences

- Settings, Cards: four rows, one per suit. Each row has a colour choice (Red, Black, Blue, Green, Orange, Purple) and move up and move down buttons. The order is the order of the rows in the card picker, top to bottom.
- Defaults: Spades black, Hearts red, Clubs black, Diamonds red, in the order Spades, Hearts, Clubs, Diamonds (top to bottom).
- A preview card for each suit shows the choice at once.
- The preference belongs to the phone, like the theme: a backup restore never changes it. The player view keeps its own copy in the browser.
- It changes the card picker and card faces on that phone only. Image reports, CSV files and the HTML report keep the default colours so every reader sees the same cards.

### 3.5 Acceptance for 1.0.1

1. Eye shows a new code once. A second tap asks first. The old code fails on a report built after the change.
2. Reset copies a message and shows no code.
3. Download or Share has no Player codes card.
4. Stored private cards are never visible in the app after saving, and are not in any backup export shown to players, CSV or image.
5. Clashing entries disappear from the report and no error shows at entry.
6. Existing 46 tests pass. New tests: clash filter, code issue and reset, write-only entry.

## 4. Release 1.1.0: Firebase live link

### 4.1 What the live link is

The host taps "Share live link" on a game. The app makes a link. Players open it in any browser. They see the same pages as the HTML report, and the pages update after each recorded hand. The host's phone stays the only place where the game is recorded. Firebase holds a copy, and Felt works fully without it.

Scope in 1.1.0 (decided in workshop 1, 2 Nov):
- Players join by link or QR only. There is no public list of games.
- A player opens the link, enters their player code, and sees their name. The code is kept until the player closes the page.
- Players can read all public information of the game, including the game settings, as the host logs it.
- Players can enter their own hole cards for each hand (section 4.7). The entry is write only.
- A host can run several live games at once. A player belongs to one live game at a time.

### 4.2 What we reuse from Stack, and what we change

| Stack practice | Decision for Felt | Why |
|---|---|---|
| Firebase Realtime Database on the free Spark plan | Reuse | Worked in play. Free. No card needed. |
| Swappable sync adapter with a mock driver (`adapter.js`, `driver-mock.js`, `driver-firebase.js`) | Reuse the idea, smaller contract: `publish(room, blobs)`, `subscribe(room, cb)`, `remove(room)` | Lets tests and offline development run without a network. |
| Project config file committed, rules are the real boundary | Reuse | The web config is public by design. |
| Region close to the players (`asia-southeast1`) | Reuse | Same players, same country. |
| Room code is the shared secret, rules open for reads and writes (`.read: true, .write: true`) | Change | Stack held trivia nicknames. Felt holds results, hand logs and codes. Writes must belong to the host. |
| Presence heartbeat and `onDisconnect` | Skip | No roster needed. Fewer writes. |
| Transactions for first click wins | Skip | One writer only. |
| Dynamic SDK import from gstatic | Reuse, modular SDK | Loaded only when sharing is on, so the offline app does not grow. |
| Rooms never deleted, manual cleanup | Change | The host's "Stop sharing" deletes the room. A 7-day expiry check runs on each publish. Players' data should not sit online for months. |
| New Firebase project `stack-ep5` shared with other apps | Recommend a new project `felt-live` | Own rules, own quota, no risk to Stack. Open question Q1. |
| Vercel hosting | Not used | Felt deploys to GitHub Pages. The viewer page is part of the same site. |

### 4.3 Security design

Stack's open rules do not fit. The design below keeps Firebase as a store of data it cannot read.

1. **Room id**: 128 random bits, base32. Nobody can guess it or list rooms (the `rooms` node has no read rule).
2. **Writes**: the host signs in with Firebase Anonymous Auth (free). The room stores `owner = uid`. Only that uid can write or delete the room.
3. **Viewer key in the link fragment**: for an open game the link is `https://<site>/live/#r=<roomId>&k=<key>`. The part after `#` never goes to any server. The public part of the report (Game Summary, Compare, house rules, hand log) is encrypted with `k` (AES-GCM) before upload. Firebase sees ciphertext only.
   For a locked game the link holds only `r`. The key comes from a join passphrase that the host sets and that players type (PBKDF2, same as player codes). The host can change the passphrase. The old one then stops working after the next publish.
   Room ids are random and unique. There is no list of rooms.
4. **Player pages**: encrypted with the player's code exactly as in the HTML report (PBKDF2 150 000 rounds, AES-GCM). Firebase sees ciphertext only. A viewer needs the link and the code.
5. **Private cards** are inside the locked player page, as today.
6. **Residual risk**: someone who holds the link can download the locked boxes and guess codes offline. A 6-character code is guessable at roughly one GPU day. This is the same risk as the HTML file in a group chat. The link alone also needs `k`. Accepted. Option: 8-character codes later.
7. **Host phone lost or reset**: restoring a backup on a new phone loses the Firebase owner. The host taps "Share live link" again. This makes a new room and a new link. The old room expires.

Rules to publish: see `database.rules.json` in the repository. Viewers can read `meta`, `pub`, `now` and `ident`. Only the owner can read the whole room, which includes `inbox` and `flags`. Any signed-in visitor can create an inbox entry or a flag. Only the owner can write everything else.

### 4.4 Data layout

```
rooms/<roomId>
  owner       Firebase uid of the host (string)
  updatedAt   server time of the last publish
  createdAt   server time
  handCount   number of closed hands (number, plain: lets the viewer show "after hand 12")
  pub         ciphertext of the slow part: game settings, house rules, players, closed hands with showdown cards, stats tables. Written when a hand closes or a setting changes.
  now         ciphertext of the hand in progress: board, actions, pot, who acts. Written after each action (small).
  ident/<pid> small lock box per player: { salt, iv, data, iter }. It holds the player name and proves the code.
  inbox/<pid>/<handN>  card entry from the player, encrypted with the code (section 4.7). The host app reads and deletes it.
```

Plain text in Firebase: owner uid, timestamps, hand count. Everything else is ciphertext. There are no player report pages in Firebase: the viewer shows no awards, advice or reports (section 4.6).

### 4.5 Host behavior

- Toggle on the game: "Share live link" (off by default). Info tip explains: what goes online (encrypted copy), what does not (codes, private cards in readable form), how to stop.
- On: sign in, create room, publish, show the link with Copy and Show QR (QR makes it easy to open on other phones, a Stack feature R7/R20).
- After each recorded action: write `now` (debounced 1 second). When a hand closes or a setting changes: write `pub`. Offline: keep the latest of each and send when the network returns. A badge shows "Live, hand 12" or "Offline, will update".
- Publishing needs each player's code to lock pages. A player without a code shows as "No code yet" in the viewer and has no page until the host issues one.
- The host can turn sharing on and off at any time, per game, and lock it with a join passphrase. Turning sharing off deletes the room. Turning it on again makes a new room, a new id and a new link.
- Firebase is used only while a session is live. Closing the game does not end the session, so players can still add cards after the game (step 6 of the flow). The host ends the session with Stop sharing.
- A room that nobody updated for 7 days is deleted by the next host publish or by the host app on start. Open question Q4.
- The room id and viewer key live in memory and in `Game.live` on this phone only. Backups leave them out, so a restored phone starts a new session.

### 4.6 Viewer behavior

- Page at `/live/` in the same site: the Felt app in a small player mode. It is a separate screen set from the report.
- A viewer can do three things, and nothing else:
  1. See the action: the hand in progress (board, actions, pot) and the game settings (blinds, house rules, 2-7 bounty).
  2. See unprocessed stats: match history (closed hands with results) and showdown hands, as plain tables. No awards, no advice, no charts of style, no report download.
  3. Add their own cards (section 4.7).
  4. Flag an update that looks wrong (for example a wrong amount or action). The flag goes to the host as a short note with the hand and action, and the host decides. A flag never changes the game.
- A viewer cannot change a setting, record an action, or see private cards of anyone, including their own after saving.
- Without a code, a viewer sees 1 and 2. A code is needed only for 3 and shows the player's name for reference. The code is kept in the browser tab until it closes (session storage). The browser keeps the key made from the code, not the code.
- Subscribes with `on('value')` on `pub` and `now`. The page updates in place.
- Cached copy: the last snapshot is kept in the browser, so a viewer with no signal still sees the last update.
- A deleted room shows "The host stopped sharing."

### 4.7 Player card entry (write only)

- The player scans the link or QR, enters their code, and sees their name. All entries on this screen are for that player only.
- The screen says: "Your cards are saved but nobody can see them, not even you. Enter them again to replace them."
- The player picks a hand (a list of the recorded hands, newest first) and two cards with the card picker.
- Before saving the app asks: "You selected 7 of Hearts and K of Spades. Confirm submission?" with Confirm and Change.
- The entry is encrypted with the key made from the player's code and stored at `rooms/<id>/inbox/<pid>/<handN>`. Only the host app can decrypt it, because only the host app knows every code.
- The host app reads new entries, decrypts them, and stores them as the private cards of that hand. It then removes the entry from Firebase. If the host is offline, entries wait in Firebase and are applied when the host is online again.
- The entry replaces any earlier entry of the same player and hand.
- Clash rule is the same as in 3.3: the hands of both players are left out of the report until one player enters again. No player is told about a clash. The confirmation prompt above is the only check.
- Firebase cannot check a code. Another person in the same game could overwrite or erase an entry. The host app ignores entries that do not decrypt. The player can enter again. Open question Q7.

Rules: the inbox allows create and update for any signed-in visitor, and allows read and delete for the owner only.

### 4.8 Limits on the free plan

| Limit (Spark) | Felt use |
|---|---|
| 1 GB stored | One room is under 1 MB. |
| 10 GB per month downloaded | 6 viewers, 40 hands, about 400 actions. `now` is under 5 KB per action, `pub` under 300 KB per hand: about 100 MB for a night. |
| 100 simultaneous connections | A home game has under 20. |
| No Cloud Functions | Cleanup runs from the host app. |

If a room grows past the size rules, the app refuses to publish and says so.

### 4.9 Privacy copy changes

- Settings Data card says "Nothing is sent online." After 1.1.0: "Nothing is sent online unless you share a live link."
- Each game with sharing on shows a clear "Live" tag.

### 4.10 Acceptance for 1.1.0

1. With the network off, every 1.0.1 feature still works.
2. Share live link makes a link. A second phone opens it and sees Game Summary within 2 seconds.
3. A recorded hand reaches the viewer within 5 seconds.
4. Reading `rooms/<id>` in the Firebase console shows only ciphertext, a uid, timestamps and the hand count.
5. A viewer with no code sees the action, settings, match history and showdown hands, and sees no report, no awards, no settings controls. A correct code shows the player name and opens card entry. A wrong code fails.
5a. A saved card entry cannot be read back anywhere in the viewer. A second entry replaces it. The confirmation prompt names the two cards before saving.
5b. Both hands of a clash are left out of the HTML report until one player enters again.
6. Another Firebase user cannot write to the room (rules test with a second anonymous user).
7. Stop sharing removes the room. The viewer shows the stopped message.
8. The mock driver passes the same adapter tests with no network.
9. A game with no hands refuses to share with a clear message.

## 5. Build plan

| Step | Work | Size |
|---|---|---|
| 1.0.1 a | Code model: issue, reveal once, reset and copy, no stored display. Eye on the player card. Remove Player codes card. | Small |
| 1.0.1 b | Write-only card entry screen and replace rule. Hide stored cards. | Medium |
| 1.0.1 c | Clash filter at report build, "N hands left out" line, tests. | Small |
| 1.0.1 d | Card suit preferences (colour and row order per suit) in Settings, used by every card picker and card face on the phone. | Small |
| 1.1.0 a | Create `felt-live` project, rules, config file. Adapter with mock driver and tests. | Medium |
| 1.1.0 b | Host toggle, publish queue, link, QR. | Medium |
| 1.1.0 c | Player view page: live action, settings, match history, showdown hands, code entry, card entry. | Large |
| 1.1.0 d | Rules test, size limits, expiry, Stop sharing, copy updates. | Small |

Each release is committed and pushed when done, and gets a Version history entry.

## 6. Open questions (each with a recommendation)

| # | Question | Recommendation |
|---|---|---|
Answered in workshop 1:

| # | Answer |
|---|---|
| Q1 | New Firebase project `felt-live`. |
| Q2 | Yes, encrypt the public pages. |
| Q3 | Room ids are random and unique. Because a stopped room is deleted and a new session makes a new room, a backup does not need to keep a live link. Decision: do not store the room id in backups. |
| Q6 | The host can turn sharing on and off at any time. |
| List | No list. Link or QR only. A locked game also needs the join passphrase. |

Still open:

| # | Question | Recommendation |
|---|---|---|
| Q4 | Is a safety expiry needed for rooms the host forgot to stop? | Yes: 7 days after the last publish. |
| Q5 | Should codes grow to 8 characters? | Not now. |
| Q7 | Should a card entry carry a signature, so an outsider cannot overwrite it? | No for 1.1.0. Entries are cheap to redo. |
