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
import { doc, setDoc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';

let _viewerMode = false;
export function setViewerMode(v) { _viewerMode = !!v; }

async function ensureAnonAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// BUG-045: Firestore rejects arrays-of-arrays ("Nested arrays are not supported"). This app's
// own save/export format (localStorage, .tcproject files) has no such restriction and never
// needed one — intersection projects' vData ({in:[[...]],out:[[...]]}), pedData ([[[...]]]),
// and tmcData ({leg:{dest:[[...]]}}) all nest arrays directly. Rather than hand-list every
// field that happens to nest today (tmcData was missed once already — found by inspecting the
// data shape, not by the live test that shipped BUG-045, since that test's project had no TMC
// data), this walks the WHOLE payload and Firestore-safely encodes any array that directly
// contains another array, wherever it occurs. decodeFirestoreArrays() is the exact inverse,
// applied right after every read — encode/decode never touch serializeCurrentProject()'s own
// canonical shape, so localStorage/file export stay completely unaffected; this only exists at
// the Firestore write/read boundary.
const ARR_MARKER = '__fsArr';
function encodeFirestoreArrays(val) {
  if (Array.isArray(val)) {
    const encoded = val.map(encodeFirestoreArrays);
    if (encoded.some(Array.isArray)) {
      const obj = {};
      encoded.forEach((v, i) => { obj[i] = v; });
      return { [ARR_MARKER]: true, n: encoded.length, v: obj };
    }
    return encoded;
  }
  if (val && typeof val === 'object') {
    const out = {};
    for (const k in val) out[k] = encodeFirestoreArrays(val[k]);
    return out;
  }
  return val;
}
function decodeFirestoreArrays(val) {
  if (val && typeof val === 'object' && val[ARR_MARKER]) {
    const arr = new Array(val.n);
    for (const k in val.v) arr[Number(k)] = decodeFirestoreArrays(val.v[k]);
    return arr;
  }
  if (Array.isArray(val)) return val.map(decodeFirestoreArrays);
  if (val && typeof val === 'object') {
    const out = {};
    for (const k in val) out[k] = decodeFirestoreArrays(val[k]);
    return out;
  }
  return val;
}

// Writes the current project to a new sharedProjects doc and returns the info the caller
// must store locally (shareId, ownerToken) plus the ready-to-copy URL.
export async function enableSharing(serializedProject) {
  if (_viewerMode) return null;
  await ensureAnonAuth();
  const shareId = crypto.randomUUID();
  const ownerToken = crypto.randomUUID();
  const payload = encodeFirestoreArrays({ ...serializedProject, ownerToken, sharedAt: Date.now() });
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
  const payload = encodeFirestoreArrays({ ...serializedProject, ownerToken, sharedAt: Date.now() });
  await setDoc(doc(db, 'sharedProjects', shareId), payload);
}

// Plain public read — no auth needed per the security rules. Returns null if the link
// has been disabled (doc deleted) or never existed.
export async function fetchSharedProject(shareId) {
  const snap = await getDoc(doc(db, 'sharedProjects', shareId));
  return snap.exists() ? decodeFirestoreArrays(snap.data()) : null;
}

// ── QA-input link (separate from the read-only viewer above) ──────────────────────────────
// A second-counter reviewer needs to submit QA/QC recount data WITHOUT ever being able to
// touch a location's real count data (entry.days[].parsed/editSnapshot) — not just hidden in
// the UI, structurally incapable of it. Rather than widen the main sharedProjects/{shareId}
// document's write rules (one mistake there and a reviewer could touch anything), submissions
// go into their own append-only sub-collection that has NO relationship to the parent
// document's own fields at all — there is no code path from here into entry.days.
//
// Deliberately NOT gated on _viewerMode (unlike every write function above) — a QA reviewer's
// browser IS allowed to make this one specific call; the safety boundary here is which
// Firestore PATH this function touches (only ever sharedProjects/{shareId}/qaSubmissions/*),
// not an app-wide mode flag. The owner's own full-project writes stay gated on ownerToken as
// before; this needs only anonymous auth, matching the same "possession of the link is the
// credential" trust model the read-only viewer already uses — anyone with a QA link can
// submit ONE more append-only doc, they can never modify or delete an existing one (security
// rules: allow update, delete: if false) or reach the parent project document at all.
export async function submitQaRecount(shareId, submission) {
  if (!shareId) return null;
  await ensureAnonAuth();
  const submissionId = crypto.randomUUID();
  const payload = encodeFirestoreArrays({ ...submission, submittedAt: Date.now() });
  await setDoc(doc(db, 'sharedProjects', shareId, 'qaSubmissions', submissionId), payload);
  return submissionId;
}

// Public read (no auth needed, same posture as fetchSharedProject) — the project owner's own
// client calls this to pull in new QA submissions and merge them into local tripgenQaqc.
export async function fetchQaSubmissions(shareId) {
  if (!shareId) return [];
  const snap = await getDocs(collection(db, 'sharedProjects', shareId, 'qaSubmissions'));
  return snap.docs.map((d) => decodeFirestoreArrays({ id: d.id, ...d.data() }));
}
