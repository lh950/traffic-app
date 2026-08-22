// Read-only shareable-link logic (Item 5). Writes go to Firestore under
// sharedProjects/{shareId}; security rules gate create/update/delete on anonymous auth
// plus a per-share ownerToken (see DEVLOG.md for the full rules text and rationale).
//
// Safety: `_viewerMode` (set once via setViewerMode()) is a second, independent guard
// against a viewer's browser pushing back to Firestore — main.js already refuses to call
// any of these write functions while in viewer mode, but every write function here also
// checks _viewerMode itself, so a bug in main.js's call sites can't turn into a stray
// Firestore write.
import { auth, db } from './firebaseConfig.js';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

let _viewerMode = false;
export function setViewerMode(v) { _viewerMode = !!v; }

async function ensureAnonAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// Writes the current project to a new sharedProjects doc and returns the info the caller
// must store locally (shareId, ownerToken) plus the ready-to-copy URL.
export async function enableSharing(serializedProject) {
  if (_viewerMode) return null;
  await ensureAnonAuth();
  const shareId = crypto.randomUUID();
  const ownerToken = crypto.randomUUID();
  const payload = { ...serializedProject, ownerToken, sharedAt: Date.now() };
  await setDoc(doc(db, 'sharedProjects', shareId), payload);
  const url = `${location.origin}${location.pathname}?share=${shareId}`;
  return { shareId, ownerToken, url };
}

// Deletes the shared doc outright — the link stops working entirely (decision #5).
export async function disableSharing(shareId) {
  if (_viewerMode || !shareId) return;
  await ensureAnonAuth();
  await deleteDoc(doc(db, 'sharedProjects', shareId));
}

// Overwrites the existing shared doc with fresh data. The security rules only allow this
// when the incoming ownerToken matches what's already stored, so a stranger holding the
// read link (but not the ownerToken, which never appears in the URL) can't overwrite it.
export async function pushSharedUpdate(shareId, ownerToken, serializedProject) {
  if (_viewerMode || !shareId || !ownerToken) return;
  await ensureAnonAuth();
  const payload = { ...serializedProject, ownerToken, sharedAt: Date.now() };
  await setDoc(doc(db, 'sharedProjects', shareId), payload);
}

// Plain public read — no auth needed per the security rules. Returns null if the link
// has been disabled (doc deleted) or never existed.
export async function fetchSharedProject(shareId) {
  const snap = await getDoc(doc(db, 'sharedProjects', shareId));
  return snap.exists() ? snap.data() : null;
}
