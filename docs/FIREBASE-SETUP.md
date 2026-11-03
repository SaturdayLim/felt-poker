# Firebase setup for the Felt live link

About 10 minutes. Free (Spark plan, no card). You do this once. Without it, Felt works fully and the Live link button says it is not set up.

## 1. Create the project

1. Open <https://console.firebase.google.com> and sign in with a Google account.
2. Tap **Add project**. Name it `felt-live`. Turn Google Analytics **off**. Tap **Create project**.

## 2. Turn on anonymous sign-in

1. In the left menu, open **Build, Authentication**. Tap **Get started**.
2. Open the **Sign-in method** tab. Tap **Anonymous**. Turn it on. Tap **Save**.

## 3. Create the database

1. Open **Build, Realtime Database**. Tap **Create Database**.
2. Pick the region closest to your players (for Singapore: `asia-southeast1`). The region cannot change later.
3. Choose **Start in locked mode**. Tap **Enable**.

## 4. Publish the rules

1. In Realtime Database, open the **Rules** tab.
2. Delete all text. Paste the full content of `database.rules.json` from this repository.
3. Tap **Publish**.

## 5. Copy the web config

1. Tap the gear next to **Project Overview**, then **Project settings**.
2. Under **Your apps**, tap the web icon `</>`. Name it `felt-web`. Leave Hosting off. Tap **Register app**.
3. Copy the four values: `apiKey`, `authDomain`, `databaseURL`, `projectId`.
4. Open `src/live/config.ts`. Replace `null` with your values:

```ts
export const FIREBASE_CONFIG: FirebaseConfig | null = {
  apiKey: 'AIza...',
  authDomain: 'felt-live-xxxxx.firebaseapp.com',
  databaseURL: 'https://felt-live-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'felt-live-xxxxx',
} as FirebaseConfig | null;
```

These values are public by design. The rules in step 4 are the real protection. Commit the file.

## 6. Allow your site to sign in

1. In **Authentication, Settings, Authorized domains**, add the domain of the live site (for example `saturdaylim.github.io`).

## 7. Check it works

1. Open the app on your phone. Open a game. Tap **Live link**, then **Start sharing**.
2. Open the link on a second phone. You see the game within a few seconds.
3. In the Firebase console, open **Realtime Database, Data**. Under `rooms/` you see one room. Every value except `owner`, `createdAt` and `meta` is unreadable text.
4. Tap **Stop sharing**. The room disappears from the console.

## Test without Firebase

Add `?live=mock` to the app address, or run `localStorage.setItem('felt-live-mock', '1')` in the browser console. The live link then works between two tabs on one device. The mock does not check the owner rules.

## Free plan limits

1 GB stored, 10 GB downloaded each month, 100 connections at once. One game night uses about 100 MB.

## Report links (added in 1.1.6)

Report links need the rules in `database.rules.json` again, because a `reports` block was added.

1. Open the Firebase console, then Realtime Database, then Rules.
2. Replace the rules with the full content of `database.rules.json`.
3. Tap Publish.

Without this step, the Link button says "PERMISSION_DENIED". The HTML download keeps working.
