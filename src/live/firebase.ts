/* The real driver: Firebase Realtime Database with anonymous sign-in (free Spark plan). The SDK is loaded from
   Google only when a live link is used, so the offline app does not grow. Setup steps: docs/FIREBASE-SETUP.md. */
import type { LiveDriver } from './driver';
import { FIREBASE_CONFIG } from './config';

const SDK_VERSION = '10.12.2';
const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sdk = { app: any; auth: any; db: any };
let loading: Promise<{ sdk: Sdk; app: any; auth: any; db: any }> | null = null;

function load() {
  if (!FIREBASE_CONFIG) throw new Error('The live link is not set up yet.');
  loading ??= (async () => {
    const [app, auth, db] = await Promise.all([
      import(/* @vite-ignore */ `${base}/firebase-app.js`),
      import(/* @vite-ignore */ `${base}/firebase-auth.js`),
      import(/* @vite-ignore */ `${base}/firebase-database.js`),
    ]);
    const a = app.initializeApp(FIREBASE_CONFIG);
    return { sdk: { app, auth, db }, app: a, auth: auth.getAuth(a), db: db.getDatabase(a) };
  })();
  return loading;
}

export const isLiveConfigured = () => FIREBASE_CONFIG !== null;

export function firebaseDriver(): LiveDriver {
  const ref = async (room: string, path = '') => {
    const f = await load();
    return { f, r: f.sdk.db.ref(f.db, `rooms/${room}${path ? `/${path}` : ''}`) };
  };
  return {
    async signIn() {
      const f = await load();
      await f.auth.authStateReady();
      if (!f.auth.currentUser) await f.sdk.auth.signInAnonymously(f.auth);
      return f.auth.currentUser.uid as string;
    },
    async create(room, tree) {
      const { f, r } = await ref(room);
      await f.sdk.db.set(r, tree);
    },
    async set(room, path, value) {
      const { f, r } = await ref(room, path);
      await f.sdk.db.set(r, value ?? null);
    },
    async remove(room) {
      const { f, r } = await ref(room);
      await f.sdk.db.remove(r);
    },
    async putReport(id, tree) {
      const f = await load();
      await f.sdk.db.set(f.sdk.db.ref(f.db, `reports/${id}`), tree);
    },
    async getReport(id) {
      const f = await load();
      const snap = await f.sdk.db.get(f.sdk.db.ref(f.db, `reports/${id}`));
      return snap.exists() ? snap.val() : null;
    },
    async removeReport(id) {
      const f = await load();
      await f.sdk.db.remove(f.sdk.db.ref(f.db, `reports/${id}`));
    },
    connected(cb) {
      let off: (() => void) | null = null;
      let stopped = false;
      load().then((f) => {
        if (stopped) return;
        off = f.sdk.db.onValue(f.sdk.db.ref(f.db, '.info/connected'), (snap: any) => cb(snap.val() === true));
      }, () => cb(false));
      return () => { stopped = true; off?.(); };
    },
    watch(room, path, cb) {
      let off: (() => void) | null = null;
      let stopped = false;
      ref(room, path).then(({ f, r }) => {
        if (stopped) return;
        off = f.sdk.db.onValue(r, (snap: any) => cb(snap.val()), () => cb(null));
      }, () => cb(null));
      return () => { stopped = true; off?.(); };
    },
  };
}
