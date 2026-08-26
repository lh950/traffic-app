// Rolling local backup snapshots for count data — layer 1 of the count-data failsafe (see
// DEVLOG "count-data failsafe" entry). Independent of the single live `traffic-app-autosave`
// localStorage slot every other write path overwrites in place: this keeps a short rolling
// history of past good saves, so a bad write (from any cause, known bug or not) can be undone
// by restoring an earlier snapshot instead of being unrecoverable.
//
// Storage choice — IndexedDB, not localStorage: a real Trip Gen project can embed base64
// PDFs/images (a per-location zoning PDF, a per-day camera photo, a project logo, a ZOLA
// screenshot — see main.js's zolaPdfData/cameraImageUrl/logoUrl/zolaScreenshotUrl), which can
// push a single project's serialized size into the multiple-MB range on its own.
// localStorage's per-origin quota is a hard ~5-10MB already shared with the live autosave
// slot and every `tc_project_<uuid>` entry — keeping N rolling copies on top of that risks
// blowing the quota outright. IndexedDB's quota is browser-managed and far larger, and is
// where this kind of bulk history belongs.

const DB_NAME = 'traffic-app-backups';
const DB_VERSION = 1;
const STORE = 'snapshots';

// Throttle: don't store more than one snapshot per project within this window, so a user
// making rapid edits doesn't fill the history with near-identical copies seconds apart.
const MIN_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
// Cap: keep at most this many snapshots per project. At the throttle above, 20 snapshots
// span at least an hour of active work — "if bad data got saved 2 minutes ago, a snapshot
// from 10 minutes ago should still be recoverable," not "keep every autosave tick forever."
const MAX_PER_PROJECT = 20;
// Cap on distinct projects tracked at all — bounds total storage across many different
// projects worked on over time in the same browser, not just repeats of one project.
const MAX_PROJECTS_TRACKED = 6;

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('uuid', 'uuid', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

// In-memory throttle cache — avoids a full IDB read on every autosave tick just to check
// "was the last snapshot for this project recent." Reset on page reload, which just means the
// first autosave tick of a fresh session may snapshot slightly earlier than MIN_INTERVAL_MS
// would strictly require — harmless, errs toward more history not less.
const _lastSnapshotAt = {};

// Light per-project summary, computed once at push time and stored inline on the record so
// the restore UI can list snapshots without re-parsing every project's full data.
function summarizeProject(proj) {
  if (proj.projectType === 'tripgen') {
    const entries = proj.entries || [];
    let intervals = 0, volume = 0;
    for (const e of entries) {
      for (const d of (e.days || [])) {
        const ivs = d.parsed?.intervals || [];
        intervals += ivs.length;
        for (const iv of ivs) {
          volume += (iv.inbound || []).reduce((a, b) => a + b, 0) + (iv.outbound || []).reduce((a, b) => a + b, 0);
        }
      }
    }
    return `${entries.length} location${entries.length === 1 ? '' : 's'} · ${intervals} interval${intervals === 1 ? '' : 's'} · ${volume.toLocaleString()} vehicles`;
  }
  if (proj.projectType === 'intersection') {
    const periods = proj.periods || [];
    const intervals = periods.reduce((s, p) => s + (p.vData?.length || p.tmcData ? (p.vData?.[Object.keys(p.vData)[0]]?.length || 0) : 0), 0);
    return `${periods.length} period${periods.length === 1 ? '' : 's'}`;
  }
  if (proj.projectType === 'area') {
    return `${(proj.intersections || []).length} intersection${(proj.intersections || []).length === 1 ? '' : 's'}`;
  }
  if (proj.projectType === 'parking') {
    return `${(proj.zones || []).length} zone${(proj.zones || []).length === 1 ? '' : 's'}`;
  }
  return '';
}

// Trims a single project's own history down to MAX_PER_PROJECT (oldest first), then trims
// whole projects beyond MAX_PROJECTS_TRACKED (least-recently-active first). Runs inside the
// same transaction chain as the insert that triggered it.
async function trim(db, uuid) {
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const idx = store.index('uuid');
    const rows = [];
    idx.openCursor(IDBKeyRange.only(uuid)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { rows.push({ id: cursor.primaryKey, savedAt: cursor.value.savedAt }); cursor.continue(); }
      else {
        rows.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
        const excess = rows.length - MAX_PER_PROJECT;
        for (let i = 0; i < excess; i++) store.delete(rows[i].id);
        resolve();
      }
    };
    tx.onerror = () => resolve();
  });

  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const latestByUuid = new Map(); // uuid -> most recent savedAt
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const r = cursor.value;
        const cur = latestByUuid.get(r.uuid);
        if (!cur || new Date(r.savedAt) > new Date(cur)) latestByUuid.set(r.uuid, r.savedAt);
        cursor.continue();
      } else {
        const uuids = [...latestByUuid.entries()].sort((a, b) => new Date(b[1]) - new Date(a[1])).map(x => x[0]);
        const staleUuids = new Set(uuids.slice(MAX_PROJECTS_TRACKED));
        if (!staleUuids.size) { resolve(); return; }
        const tx2 = db.transaction(STORE, 'readwrite');
        const store2 = tx2.objectStore(STORE);
        store2.openCursor().onsuccess = (ev) => {
          const c = ev.target.result;
          if (c) { if (staleUuids.has(c.value.uuid)) store2.delete(c.primaryKey); c.continue(); }
          else resolve();
        };
        tx2.onerror = () => resolve();
      }
    };
    tx.onerror = () => resolve();
  });
}

// Pushes a new backup snapshot if the per-project throttle allows it. Fire-and-forget from
// the caller's perspective — never throws, never blocks the actual autosave write it piggy-
// backs on. `label` is the caller's already-computed project display name (main.js's
// getProjectName) so this module doesn't need its own copy of that per-projectType logic.
export async function pushBackupSnapshot(proj, label) {
  if (!proj?.uuid || !proj?.projectType) return;
  const now = Date.now();
  const last = _lastSnapshotAt[proj.uuid];
  if (last && now - last < MIN_INTERVAL_MS) return;
  try {
    const db = await openDb();
    const record = {
      uuid: proj.uuid,
      projectType: proj.projectType,
      label,
      savedAt: proj.savedAt || new Date().toISOString(),
      summary: summarizeProject(proj),
      sizeBytes: JSON.stringify(proj).length,
      proj,
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    _lastSnapshotAt[proj.uuid] = now;
    await trim(db, proj.uuid);
  } catch (_) {
    // Quota exceeded, IndexedDB unavailable (private browsing in some browsers), etc. — this
    // is a best-effort safety net on top of the real autosave, not the primary save path, so
    // a failure here must never surface as a save error to the user.
  }
}

// Returns every stored snapshot's summary metadata (not the full `proj` payload — this list
// can include many projects' worth of snapshots and the UI only needs enough to pick one),
// newest first.
export async function listBackups() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const rows = [];
      tx.objectStore(STORE).openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const { proj, ...meta } = cursor.value;
          rows.push({ id: cursor.primaryKey, ...meta });
          cursor.continue();
        } else {
          rows.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
          resolve(rows);
        }
      };
      tx.onerror = () => resolve([]);
    });
  } catch (_) { return []; }
}

// Returns one full snapshot record (including its `proj` payload) for restoring.
export async function getBackup(id) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}
