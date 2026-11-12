/* Firebase web config for the Nightcap live link (project felt-live). These values are public by design: the
   database rules in database.rules.json are the real boundary. Setup steps: docs/FIREBASE-SETUP.md. */
export interface FirebaseConfig { apiKey: string; authDomain: string; databaseURL: string; projectId: string }

export const FIREBASE_CONFIG: FirebaseConfig | null = {
  apiKey: 'AIzaSyA2dqhTvtJVJN5PK74J72kxwj59Cu43fkM',
  authDomain: 'felt-live.firebaseapp.com',
  databaseURL: 'https://felt-live-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'felt-live',
} as FirebaseConfig | null;
