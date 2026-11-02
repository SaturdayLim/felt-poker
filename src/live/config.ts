/* Firebase web config for the Felt live link. These values are public by design: the database rules are the
   real boundary (docs/FIREBASE-SETUP.md has the rules). Replace null with the config of your felt-live project,
   for example:
   export const FIREBASE_CONFIG: FirebaseConfig | null = {
     apiKey: 'AIza...', authDomain: 'felt-live-xxxxx.firebaseapp.com',
     databaseURL: 'https://felt-live-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app', projectId: 'felt-live-xxxxx',
   }; */
export interface FirebaseConfig { apiKey: string; authDomain: string; databaseURL: string; projectId: string }

export const FIREBASE_CONFIG: FirebaseConfig | null = null as FirebaseConfig | null;
