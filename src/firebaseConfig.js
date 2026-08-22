// Firebase project config for the read-only shareable-link feature (Item 5).
// This is the app's first external runtime dependency — see DEVLOG.md for why.
//
// A Firebase web API key is meant to be public (access control lives in the Firestore
// security rules, not key secrecy), so this file is safe to commit.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);
