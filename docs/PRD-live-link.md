# Felt PRD: Player Codes, Card Entry and Live Link

Status: draft for review. Not built. Covers release 1.0.1 (no server) and release 1.1.0 (Firebase live link).
Source of the flow: the host's nine-step description of 2 Nov 2026. Source of the Firebase notes: the Stack trivia app (`Stack App v6 260611`: `FIREBASE-SETUP.md`, `DECISIONS-V2.md`, `js/sync/adapter.js`, `driver-firebase.js`, `driver-mock.js`).

## 1. Goal

The host records a game on one phone. After the game, every player can open a report on their own phone and see their own page, locked by a code only they know. During the night, players can follow the game live (read only). Nobody can read another player's private cards at any point.

## 2. The flow, step by step

| Step | What happens | Release |
|---|---|---|
| 1 | Host creates a game with players. | Exists |
| 2 | Host records hands through the night. | Exists |
| 2a | After each hand the host can add a player's hole cards: pick the player, enter the two cards. The cards are stored and never shown again. Entering again replaces them. At showdown the host still enters shown cards into the game log by hand. | 1.0.1 |
| 3 | At the end, host opens Players, then a player. | Exists |
| 4 | Top right of the player summary card: an eye icon. Tap it to make a new code and show it once. The old code stops working. If a code was already issued, the app asks first. | 1.0.1 |
| 5 | Player notes the code. | n/a |
| 6 | Host asks who wants to add or fix cards. Same entry screen as step 2a, any time, without a code. | 1.0.1 |
| 7 | Host shares the HTML report in the group chat. | Exists (1.0.0) |
| 8 | Player opens the report, taps their name, enters the code. | Exists |
| 9 | A forgotten code: host resets it with "Copy new code" (copies, never shows). Old reports keep working with the old code. A new code works only in a report built after the reset. | 1.0.1 |
| 10 | Live link: host shares one link. Players follow the game and open their own page with the code. Pages update after each hand. | 1.1.0 |

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

### 3.4 Acceptance for 1.0.1

1. Eye shows a new code once. A second tap asks first. The old code fails on a report built after the change.
2. Reset copies a message and shows no code.
3. Download or Share has no Player codes card.
4. Stored private cards are never visible in the app after saving, and are not in any backup export shown to players, CSV or image.
5. Clashing entries disappear from the report and no error shows at entry.
6. Existing 46 tests pass. New tests: clash filter, code issue and reset, write-only entry.

## 4. Release 1.1.0: Firebase live link

### 4.1 What the live link is

The host taps "Share live link" on a game. The app makes a link. Players open it in any browser. They see the same pages as the HTML report, and the pages update after each recorded hand. The host's phone stays the only place where the game is recorded. Firebase holds a copy, and Felt works fully without it.

Scope in 1.1.0: read only for players.
Out of scope: players sending cards from their own phones (decided: the host enters all cards). A later release can add a write-only inbox using the same data layout (section 4.7).

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
3. **Viewer key in the link fragment**: the link is `https://<site>/live/#r=<roomId>&k=<key>`. The part after `#` never goes to any server. The public part of the report (Game Summary, Compare, house rules) is encrypted with `k` (AES-GCM) before upload. Firebase sees ciphertext only.
4. **Player pages**: encrypted with the player's code exactly as in the HTML report (PBKDF2 150 000 rounds, AES-GCM). Firebase sees ciphertext only. A viewer needs the link and the code.
5. **Private cards** are inside the locked player page, as today.
6. **Residual risk**: someone who holds the link can download the locked boxes and guess codes offline. A 6-character code is guessable at roughly one GPU day. This is the same risk as the HTML file in a group chat. The link alone also needs `k`. Accepted. Option: 8-character codes later.
7. **Host phone lost or reset**: restoring a backup on a new phone loses the Firebase owner. The host taps "Share live link" again. This makes a new room and a new link. The old room expires.

Rules to publish:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$room": {
        ".read": true,
        ".write": "auth != null && (!data.exists() || data.child('owner').val() === auth.uid)",
        ".validate": "newData.hasChildren(['owner', 'updatedAt', 'pub'])",
        "pub": { ".validate": "newData.isString() && newData.val().length < 700000" },
        "pages": { "$pid": { ".validate": "newData.hasChildren(['salt', 'iv', 'data']) && newData.child('data').val().length < 400000" } }
      }
    }
  }
}
```

### 4.4 Data layout

```
rooms/<roomId>
  owner       Firebase uid of the host (string)
  updatedAt   server time of the last publish
  createdAt   server time
  handCount   number of hands in this copy (number, plain: lets the viewer show "updated after hand 12")
  pub         ciphertext of the public part (string)
  pages/<pid> lock box of one player: { salt, iv, data, iter }
```

Plain text in Firebase: owner uid, timestamps, hand count. Everything else is ciphertext.

### 4.5 Host behavior

- Toggle on the game: "Share live link" (off by default). Info tip explains: what goes online (encrypted copy), what does not (codes, private cards in readable form), how to stop.
- On: sign in, create room, publish, show the link with Copy and Show QR (QR makes it easy to open on other phones, a Stack feature R7/R20).
- After each saved hand: publish again (debounced 3 seconds). Offline: queue the last snapshot and publish when the network returns. A badge shows "Live, updated after hand 12" or "Offline, will update".
- Publishing needs each player's code to lock pages. A player without a code shows as "No code yet" in the viewer and has no page until the host issues one.
- Stop sharing: deletes the room. Closing the game does not delete it. The 7-day expiry deletes rooms the host forgot.
- The room id and the viewer key are stored in `Game.live`, so backups keep them. The host's Firebase owner is not in a backup. Open question Q3.

### 4.6 Viewer behavior

- Page at `/live/` in the same site. Same code as the HTML report template, with a data source that reads Firebase instead of inline JSON.
- Opens `pub` with `k` and shows Game Summary and Compare. Players tab shows locked pages. A code opens the player's box.
- Subscribes with `on('value')` on `rooms/<id>`. The page updates in place and keeps the open tab and the unlocked player.
- Cached copy: the last snapshot is kept in the browser, so a viewer with no signal still sees the last update.
- A deleted room shows "The host stopped sharing."

### 4.7 Later: write-only card inbox (not in 1.1.0)

`rooms/<id>/inbox/<pid>/<handN>` where a player writes cards encrypted with the host's public key. The player's page must not read them back. Rules allow create but not read for the inbox. Not planned now because the host enters all cards.

### 4.8 Limits on the free plan

| Limit (Spark) | Felt use |
|---|---|
| 1 GB stored | One room is under 1 MB. |
| 10 GB per month downloaded | 4 viewers, 40 hands, 1 MB per update: about 160 MB for a night. Pages download only when the room changes. |
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
5. A player unlocks only their own page with their own code. A wrong code fails.
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
| 1.1.0 a | Create `felt-live` project, rules, config file. Adapter with mock driver and tests. | Medium |
| 1.1.0 b | Host toggle, publish queue, link, QR. | Medium |
| 1.1.0 c | Viewer page from the report template with a Firebase data source. | Medium |
| 1.1.0 d | Rules test, size limits, expiry, Stop sharing, copy updates. | Small |

Each release is committed and pushed when done, and gets a Version history entry.

## 6. Open questions (each with a recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Use a new Firebase project `felt-live` or the Stack project `stack-ep5`? | New project. Stack rules are open. A new one costs 10 minutes and no money. |
| Q2 | Should the public part (Game Summary, Compare) also be encrypted with the link key? | Yes. It costs nothing and Firebase then holds no readable game data. |
| Q3 | Keep the room id and key in backups, so a restored phone keeps the same link? | Keep the key and id, not the owner. After a restore the host reclaims by making a new room. |
| Q4 | Auto-delete a room after how long? | 7 days after the last publish. |
| Q5 | Should codes grow to 8 characters to harden offline guessing? | Not now. Revisit if the live link is used with people outside the home game. |
| Q6 | Is the host allowed to turn on sharing during the game, or only after it closes? | During the game, off by default, as players asked to follow live. |
