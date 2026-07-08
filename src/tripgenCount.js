// Live keyboard-driven counting for trip-generation locations — parallel to the
// intersection counter's vehicle-counting engine (same data shape: per-classification
// in/out counts per interval), but deliberately standalone rather than reusing
// state.js/vData/vPairs directly, since a trip-gen project and an intersection project can
// coexist and shouldn't share mutable globals. One "begin counting" run = one location;
// finishing converts the result into the same {types, intervals} shape parseTripGen.js
// produces, so it drops straight into the existing trip-gen analysis pipeline.

let classifications = []; // [{label, inKey, outKey}]
let cfg = { startMinutes: 0, intervalMin: 15, durationMin: 1440, get slots() { return Math.max(1, Math.round(this.durationMin / this.intervalMin)); } };
let tgData = { in: [], out: [] };
let slot = 0;
let undoStack = [], redoStack = [];
let onFinish = null; // callback(parsed) supplied by main.js

function isActiveScreen() {
  const el = document.getElementById('tripgen-counter-screen');
  return el && el.style.display !== 'none';
}

function slotLabel(i) {
  const s = cfg.startMinutes + i * cfg.intervalMin, e = s + cfg.intervalMin;
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${fmt(s)} – ${fmt(e)}`;
}
function slotStartEnd(i) {
  const s = cfg.startMinutes + i * cfg.intervalMin, e = s + cfg.intervalMin;
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { start: fmt(s), end: fmt(e) };
}

// ── Setup: classification list editor ──
export function renderClassificationsList() {
  const wrap = document.getElementById('tg-classifications-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  classifications.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'pair-row';
    row.innerHTML = `
      <span class="pair-num">${i + 1}</span>
      <input type="text" value="${c.label}" placeholder="label" data-tg-field="label" data-tg-idx="${i}">
      <input type="text" class="key-input" maxlength="1" value="${c.inKey.toUpperCase()}" placeholder="in" data-tg-field="inKey" data-tg-idx="${i}">
      <input type="text" class="key-input" maxlength="1" value="${c.outKey.toUpperCase()}" placeholder="out" data-tg-field="outKey" data-tg-idx="${i}">
      <button data-tg-remove="${i}" style="font-size:11px">×</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('[data-tg-field]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.tgIdx), field = el.dataset.tgField;
      classifications[i][field] = field === 'label' ? el.value : el.value.toLowerCase();
      checkKeyConflicts();
    });
  });
  wrap.querySelectorAll('[data-tg-remove]').forEach((el) => {
    el.addEventListener('click', () => {
      classifications.splice(Number(el.dataset.tgRemove), 1);
      renderClassificationsList();
    });
  });
  checkKeyConflicts();
}

// Default keys split left-hand (Entry) / right-hand (Exit) — same convention as the
// intersection counter's vehicle types (A/J, S/K, D/L, F/;, ...), so the muscle memory
// carries over between count types.
const IN_KEY_POOL = ['a', 's', 'd', 'f', 'q', 'w', 'e', 'r', 'z', 'x', 'c', 'v'];
const OUT_KEY_POOL = ['j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'm', ',', '.', '/'];

export function addClassification() {
  const used = new Set(classifications.flatMap((c) => [c.inKey, c.outKey]));
  const inKey = IN_KEY_POOL.find((k) => !used.has(k)) || '?';
  const outKey = OUT_KEY_POOL.find((k) => !used.has(k)) || '?';
  classifications.push({ label: `classification ${classifications.length + 1}`, inKey, outKey });
  renderClassificationsList();
}

function checkKeyConflicts() {
  const keys = classifications.flatMap((c) => [c.inKey, c.outKey]);
  const dupes = keys.filter((k, i) => k && keys.indexOf(k) !== i);
  document.querySelectorAll('#tg-classifications-list input.key-input').forEach((inp) => {
    inp.classList.toggle('key-conflict', dupes.includes(inp.value.toLowerCase()));
  });
  const warn = document.getElementById('tg-key-conflict');
  if (warn) warn.classList.toggle('visible', dupes.length > 0);
  return dupes.length === 0;
}

export function beginCounting(finishCallback) {
  if (classifications.length === 0) { alert('Add at least one classification before counting.'); return false; }
  if (!checkKeyConflicts()) { alert('Resolve duplicate keys before counting.'); return false; }
  const startEl = document.getElementById('tg-set-start');
  const [sh, sm] = (startEl.value || '00:00').split(':').map(Number);
  cfg.startMinutes = sh * 60 + (sm || 0);
  cfg.intervalMin = Number(document.getElementById('tg-set-interval').value) || 15;
  const dh = Number(document.getElementById('tg-set-dur-h').value) || 0;
  const dm = Number(document.getElementById('tg-set-dur-m').value) || 0;
  cfg.durationMin = Math.max(cfg.intervalMin, dh * 60 + dm);

  const n = classifications.length, s = cfg.slots;
  tgData = { in: Array.from({ length: s }, () => Array(n).fill(0)), out: Array.from({ length: s }, () => Array(n).fill(0)) };
  slot = 0; undoStack = []; redoStack = [];
  onFinish = finishCallback;

  buildKbd();
  buildTable();
  updateUndoUI();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
  return true;
}

// Re-opens a previously-finished live count for editing. Needs the classification
// list + timing snapshot saved at finish time (finishLocation's second return value) since
// the {types, intervals} shape handed to analysis doesn't carry entry keys or raw cfg —
// regenerating those from scratch would risk a different key layout each time.
export function beginEditing(snapshot, parsed, finishCallback) {
  classifications = snapshot.classifications.map((c) => ({ ...c }));
  cfg.startMinutes = snapshot.cfg.startMinutes;
  cfg.intervalMin = snapshot.cfg.intervalMin;
  cfg.durationMin = snapshot.cfg.durationMin;

  const n = classifications.length;
  tgData = {
    in: parsed.intervals.map((iv) => iv.inbound.slice()),
    out: parsed.intervals.map((iv) => iv.outbound.slice()),
  };
  slot = 0; undoStack = []; redoStack = [];
  onFinish = finishCallback;

  buildKbd();
  buildTable();
  updateUndoUI();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
  return true;
}

// Snapshot of the live-edit-only state (classification keys + raw cfg) to carry alongside
// a finished location's {types, intervals} so it can be reopened later via beginEditing().
export function snapshotForEdit() {
  return {
    classifications: classifications.map((c) => ({ ...c })),
    cfg: { startMinutes: cfg.startMinutes, intervalMin: cfg.intervalMin, durationMin: cfg.durationMin },
  };
}

// Builds an entry-key-bound classification list from plain labels (e.g. a location's
// `parsed.types`, which carry no keys of their own — xlsx/paste imports never assign any).
// Used for QA/QC recounts, which must count by the SAME classifications as the original
// count (not a single aggregate number) so a recount can't accidentally be transcribed
// against the wrong category.
export function defaultClassificationsFor(types) {
  const inPool = ['a', 's', 'd', 'f', 'q', 'w', 'e', 'r', 'z', 'x', 'c', 'v'];
  const outPool = ['j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'm', ',', '.', '/'];
  return types.map((label, i) => ({ label, inKey: inPool[i] || '?', outKey: outPool[i] || '?' }));
}

// Starts a fresh (zeroed) count using a GIVEN classification list and timing — used for
// QA/QC recounts, where both must match what's being verified (same classifications as the
// original count) rather than whatever happens to be sitting in the setup screen's editor.
export function beginRecount(classificationList, cfgIn, finishCallback) {
  classifications = classificationList.map((c) => ({ ...c }));
  cfg.startMinutes = cfgIn.startMinutes;
  cfg.intervalMin = cfgIn.intervalMin;
  cfg.durationMin = cfgIn.durationMin;

  const n = classifications.length, s = cfg.slots;
  tgData = { in: Array.from({ length: s }, () => Array(n).fill(0)), out: Array.from({ length: s }, () => Array(n).fill(0)) };
  slot = 0; undoStack = []; redoStack = [];
  onFinish = finishCallback;

  buildKbd();
  buildTable();
  updateUndoUI();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
  return true;
}

function buildKbd() {
  const grid = document.getElementById('tg-kbd-grid');
  if (!grid) return;
  grid.innerHTML = classifications.map((c, i) => `
    <span class="kbd-chip"><span class="ck">in</span><kbd id="tgk-in-${i}">${c.inKey.toUpperCase()}</kbd><span class="key-label">${c.label}</span></span>
    <span class="kbd-chip"><span class="ck">out</span><kbd id="tgk-out-${i}">${c.outKey.toUpperCase()}</kbd><span class="key-label">${c.label}</span></span>
  `).join('') + `
    <span class="kbd-group-sep"></span>
    <span class="kbd-group-label label-nav">nav</span>
    <span class="kbd-chip"><kbd>↑</kbd><span class="key-label">prev</span></span>
    <span class="kbd-chip"><kbd>↓</kbd><span class="key-label">next</span></span>
    <span class="kbd-chip"><kbd>Z</kbd><span class="key-label">undo</span></span>
    <span class="kbd-chip"><kbd>Y</kbd><span class="key-label">redo</span></span>
  `;
}

function buildTable() {
  const tbl = document.getElementById('tg-tbl-count');
  if (!tbl) return;
  const head = `<thead><tr><th>time</th>${classifications.map((c) => `<th>${c.label} In</th><th>${c.label} Out</th>`).join('')}<th>total</th></tr></thead>`;
  const body = Array.from({ length: cfg.slots }, (_, i) => {
    const cur = i === slot ? ' class="current"' : '';
    let rowTotal = 0;
    const cells = classifications.map((_, ci) => {
      const inV = tgData.in[i][ci], outV = tgData.out[i][ci];
      rowTotal += inV + outV;
      return `<td class="${inV > 0 ? 'nonzero' : ''}">${inV}</td><td class="${outV > 0 ? 'nonzero' : ''}">${outV}</td>`;
    }).join('');
    return `<tr${cur} id="tg-r-${i}"><td>${slotLabel(i)}</td>${cells}<td class="${rowTotal > 0 ? 'nonzero' : ''}">${rowTotal}</td></tr>`;
  }).join('');
  const totals = classifications.map((_, ci) => {
    const inT = tgData.in.reduce((s, r) => s + r[ci], 0);
    const outT = tgData.out.reduce((s, r) => s + r[ci], 0);
    return `<td>${inT}</td><td>${outT}</td>`;
  }).join('');
  const grand = tgData.in.flat().reduce((a, b) => a + b, 0) + tgData.out.flat().reduce((a, b) => a + b, 0);
  tbl.innerHTML = `${head}<tbody>${body}</tbody><tfoot><tr><td>total</td>${totals}<td>${grand}</td></tr></tfoot>`;
  document.getElementById(`tg-r-${slot}`)?.scrollIntoView({ block: 'nearest' });
}

function render() {
  buildTable();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
}

function pushUndo(action) { undoStack.push(action); redoStack = []; updateUndoUI(); }
function updateUndoUI() {
  const u = document.getElementById('tg-btn-undo'), r = document.getElementById('tg-btn-redo');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
  const c = document.getElementById('tg-undo-count');
  if (c) c.textContent = undoStack.length;
}
function applyAction(a, reverse) {
  const delta = reverse ? -1 : 1;
  tgData[a.dir][a.slot][a.col] += delta;
  tgData[a.dir][a.slot][a.col] = Math.max(0, tgData[a.dir][a.slot][a.col]);
}
export function undo() {
  if (!undoStack.length) return;
  const a = undoStack.pop();
  applyAction(a, true);
  redoStack.push(a);
  updateUndoUI(); render();
}
export function redo() {
  if (!redoStack.length) return;
  const a = redoStack.pop();
  applyAction(a, false);
  undoStack.push(a);
  updateUndoUI(); render();
}

function record(dir, idx) {
  pushUndo({ dir, slot, col: idx });
  tgData[dir][slot][idx]++;
  render();
  // Flash the whole kbd-chip (which contains both the <kbd> key and the .key-label type name)
  const kbd = document.getElementById(`tgk-${dir === 'in' ? 'in' : 'out'}-${idx}`);
  const chip = kbd?.closest('.kbd-chip');
  const flashCls = dir === 'in' ? 'flash-in' : 'flash-out';
  const chipFlash = dir === 'in' ? 'tg-flash-in' : 'tg-flash-out';
  if (kbd) { kbd.classList.add(flashCls); setTimeout(() => kbd.classList.remove(flashCls), 200); }
  if (chip) { chip.classList.add(chipFlash); setTimeout(() => chip.classList.remove(chipFlash), 200); }
}

function buildKeyMap() {
  const m = {};
  classifications.forEach((c, i) => {
    if (c.inKey) m[c.inKey] = () => record('in', i);
    if (c.outKey) m[c.outKey] = () => record('out', i);
  });
  return m;
}

export function wireKeydown() {
  document.addEventListener('keydown', (e) => {
    if (!isActiveScreen()) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown') { e.preventDefault(); if (slot < cfg.slots - 1) { slot++; render(); } return; }
    if (k === 'arrowup') { e.preventDefault(); if (slot > 0) { slot--; render(); } return; }
    if (k === 'z') { e.preventDefault(); undo(); return; }
    if (k === 'y') { e.preventDefault(); redo(); return; }
    const action = buildKeyMap()[k];
    if (action) { e.preventDefault(); action(); }
  });
  document.getElementById('tg-btn-undo')?.addEventListener('click', undo);
  document.getElementById('tg-btn-redo')?.addEventListener('click', redo);
}

export function finishLocation() {
  const intervals = Array.from({ length: cfg.slots }, (_, i) => {
    const { start, end } = slotStartEnd(i);
    return { label: slotLabel(i), start, end, inbound: tgData.in[i].slice(), outbound: tgData.out[i].slice() };
  });
  const parsed = { types: classifications.map((c) => c.label), intervals };
  if (onFinish) onFinish(parsed, snapshotForEdit());
}

export function resetClassifications() {
  classifications = [];
  renderClassificationsList();
}
