// Firebase project config for the read-only shareable-link feature (Item 5).
// This is the app's first external runtime dependency — see DEVLOG.md for why.
//
// A Firebase web API key is meant to be public (access control lives in the Firestore
// security rules, not key secrecy), so this file is safe to commit.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCumGwvHd4KsckP5DAmlaKqhmn6LKK_b4w',
  authDomain: 'traffic-counter-f3eaa.firebaseapp.com',
  projectId: 'traffic-counter-f3eaa',
  storageBucket: 'traffic-counter-f3eaa.firebasestorage.app',
  messagingSenderId: '60416846755',
  appId: '1:60416846755:web:c43c20ac112e4b804c8816',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// User-reported: Firefox hung indefinitely opening a share link; Chrome worked fine.
// getFirestore()'s default transport tries a persistent WebChannel/streaming connection even
// for a one-shot read, which is known to hang in Firefox under some network/privacy-extension
// conditions. autoDetectLongPolling falls back to plain HTTP long-polling when streaming isn't
// viable -- slightly higher latency, much more broadly compatible, irrelevant for an on-demand
// read like this feature's.
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
