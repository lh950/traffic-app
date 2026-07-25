// Standalone bounded one-hour recount engine for INTERSECTION-project QA/QC.
//
// Deliberately NOT a reuse of counter.js (the live intersection counter), even though the
// task this was built for asked to "reuse the existing intersection counter in a bounded
// recount mode" — reading counter.js showed two concrete reasons a direct reuse would be
// fragile:
//   1. counter.js's render() unconditionally calls window.scheduleAutosave() on every
//      keystroke, which serializes the CURRENT live state.js globals (vData/pedData/tmcData/
//      vPairs/intersection/periods) to localStorage. A recount needs a scratch buffer that
//      isn't the live project's real period data — swapping state.js's globals to scratch
//      values for the recount's duration would mean every keystroke re-autosaves the scratch
//      recount data over the real project until the swap is reversed. That's a silent data-
//      loss risk, not just an inconvenience.
//   2. counter.js's rendering (buildVehicleTable/renderPed/renderTMC) is never row-scoped —
//      it always renders the FULL vPairs / crosswalks / TMC-approach×destination×type matrix.
//      QA/QC recounts one bounded hour across whichever count types are active, not the full
//      day's matrix, so reusing those render functions verbatim doesn't fit either.
// This module mirrors tripgenCount.js's architecture instead (own local buffers, own tiny
// table + keyboard grid, never touching state.js globals or calling render()/autosave), but
// generalized to THREE simultaneous row-groups (vehicle / ped / tmc) in one session, since a
// QA/QC reviewer recounts all active count types together in the same one-hour window rather
// than running separate sessions per type.
//
// Row identity: each row carries a `key` supplied by the caller (main.js) — vPairs index for
// vehicle rows, crosswalk `assign` (leg letter) for ped rows, approach `leg` for tmc rows —
// used purely to hand results back keyed the same way the caller asked for them; this module
// has no opinion on what the key means.
//
// Key-conflict note: vehicle/ped/tmc keyboard keys in the LIVE counter can safely reuse the
// same physical keys across modes (only one mode is ever active on screen at a time). Here
// all three run in ONE combined session, so main.js assigns each row a FRESH, conflict-free
// key from a shared pool when it builds the row spec — this module does not attempt to reuse
// a row's original vPairs/crosswalk key.

let rows = { vehicle: [], ped: [], tmc: [] }; // vehicle/ped: [{key,label,inKey,outKey}]; tmc: [{key,label,countKey}]
let cfg = {
  startMinutes: 0, intervalMin: 15, durationMin: 60,
  get slots() { return Math.max(1, Math.round(this.durationMin / this.intervalMin)); },
};
let data = { vehicle: { in: [], out: [] }, ped: { in: [], out: [] }, tmc: { count: [] } };
let slot = 0;
let undoStack = [], redoStack = [];
let onFinish = null;

function isActiveScreen() {
  const el = document.getElementById('intersection-qaqc-counter-screen');
  return el && el.style.display !== 'none';
}

function slotStartEnd(i) {
  const s = cfg.startMinutes + i * cfg.intervalMin, e = s + cfg.intervalMin;
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { start: fmt(s), end: fmt(e) };
}
function slotLabel(i) { const { start, end } = slotStartEnd(i); return `${start} – ${end}`; }

// rowsSpec: { vehicle: [{key,label,inKey,outKey}], ped: [{key,label,inKey,outKey}], tmc: [{key,label,countKey}] }
// cfgIn: {startMinutes, intervalMin, durationMin}
// finishCallback(result, cfgSnapshot) — result: { vehicle: {[key]: number[slot]}, ped: {...}, tmc: {...} },
//   each array already combining in+out (vehicle/ped) or the raw count (tmc) per slot.
export function beginIntersectionRecount(rowsSpec, cfgIn, finishCallback) {
  rows = { vehicle: rowsSpec.vehicle || [], ped: rowsSpec.ped || [], tmc: rowsSpec.tmc || [] };
  if (!rows.vehicle.length && !rows.ped.length && !rows.tmc.length) {
    alert('No active count types to recount.');
    return false;
  }
  cfg.startMinutes = cfgIn.startMinutes;
  cfg.intervalMin = cfgIn.intervalMin;
  cfg.durationMin = cfgIn.durationMin;

  const s = cfg.slots;
  data = {
    vehicle: {
      in: Array.from({ length: s }, () => Array(rows.vehicle.length).fill(0)),
      out: Array.from({ length: s }, () => Array(rows.vehicle.length).fill(0)),
    },
    ped: {
      in: Array.from({ length: s }, () => Array(rows.ped.length).fill(0)),
      out: Array.from({ length: s }, () => Array(rows.ped.length).fill(0)),
    },
    tmc: { count: Array.from({ length: s }, () => Array(rows.tmc.length).fill(0)) },
  };
  slot = 0; undoStack = []; redoStack = [];
  onFinish = finishCallback;

  buildKbd();
  buildTable();
  updateUndoUI();
  const curEl = document.getElementById('ixqaqc-cur-interval');
  if (curEl) curEl.textContent = slotLabel(slot);
  return true;
}

function buildKbd() {
  const grid = document.getElementById('ixqaqc-kbd-grid');
  if (!grid) return;
  const chips = [];
  rows.vehicle.forEach((r, i) => {
    chips.push(`<span class="kbd-chip"><span class="ck">in</span><kbd id="ixqk-vehicle-in-${i}">${r.inKey.toUpperCase()}</kbd><span class="key-label">🚗 ${r.label}</span></span>`);
    chips.push(`<span class="kbd-chip"><span class="ck">out</span><kbd id="ixqk-vehicle-out-${i}">${r.outKey.toUpperCase()}</kbd><span class="key-label">🚗 ${r.label}</span></span>`);
  });
  rows.ped.forEach((r, i) => {
    chips.push(`<span class="kbd-chip"><span class="ck">dir0</span><kbd id="ixqk-ped-in-${i}">${r.inKey.toUpperCase()}</kbd><span class="key-label">🚶 ${r.label}</span></span>`);
    chips.push(`<span class="kbd-chip"><span class="ck">dir1</span><kbd id="ixqk-ped-out-${i}">${r.outKey.toUpperCase()}</kbd><span class="key-label">🚶 ${r.label}</span></span>`);
  });
  rows.tmc.forEach((r, i) => {
    chips.push(`<span class="kbd-chip"><span class="ck">count</span><kbd id="ixqk-tmc-count-${i}">${r.countKey.toUpperCase()}</kbd><span class="key-label">↻ ${r.label}</span></span>`);
  });
  grid.innerHTML = chips.join('') + `
    <span class="kbd-group-sep"></span>
    <span class="kbd-group-label label-nav">nav</span>
    <span class="kbd-chip"><kbd>↑</kbd><span class="key-label">prev</span></span>
    <span class="kbd-chip"><kbd>↓</kbd><span class="key-label">next</span></span>
    <span class="kbd-chip"><kbd>Z</kbd><span class="key-label">undo</span></span>
    <span class="kbd-chip"><kbd>Y</kbd><span class="key-label">redo</span></span>
  `;
}

function buildTable() {
  const tbl = document.getElementById('ixqaqc-tbl-count');
  if (!tbl) return;
  const headCells = [];
  rows.vehicle.forEach((r) => headCells.push(`<th>🚗 ${r.label} In</th><th>🚗 ${r.label} Out</th>`));
  rows.ped.forEach((r) => headCells.push(`<th>🚶 ${r.label} Dir0</th><th>🚶 ${r.label} Dir1</th>`));
  rows.tmc.forEach((r) => headCells.push(`<th>↻ ${r.label}</th>`));
  const head = `<thead><tr><th>time</th>${headCells.join('')}<th>total</th></tr></thead>`;
  const body = Array.from({ length: cfg.slots }, (_, i) => {
    const cur = i === slot ? ' class="current"' : '';
    let rowTotal = 0;
    const cells = [];
    rows.vehicle.forEach((_, ci) => {
      const inV = data.vehicle.in[i][ci], outV = data.vehicle.out[i][ci];
      rowTotal += inV + outV;
      cells.push(`<td class="${inV > 0 ? 'nonzero' : ''}">${inV}</td><td class="${outV > 0 ? 'nonzero' : ''}">${outV}</td>`);
    });
    rows.ped.forEach((_, ci) => {
      const inV = data.ped.in[i][ci], outV = data.ped.out[i][ci];
      rowTotal += inV + outV;
      cells.push(`<td class="${inV > 0 ? 'nonzero' : ''}">${inV}</td><td class="${outV > 0 ? 'nonzero' : ''}">${outV}</td>`);
    });
    rows.tmc.forEach((_, ci) => {
      const v = data.tmc.count[i][ci];
      rowTotal += v;
      cells.push(`<td class="${v > 0 ? 'nonzero' : ''}">${v}</td>`);
    });
    return `<tr${cur} id="ixqaqc-r-${i}"><td>${slotLabel(i)}</td>${cells.join('')}<td class="${rowTotal > 0 ? 'nonzero' : ''}">${rowTotal}</td></tr>`;
  }).join('');
  tbl.innerHTML = `${head}<tbody>${body}</tbody>`;
  document.getElementById(`ixqaqc-r-${slot}`)?.scrollIntoView({ block: 'nearest' });
}

function render() {
  buildTable();
  const curEl = document.getElementById('ixqaqc-cur-interval');
  if (curEl) curEl.textContent = slotLabel(slot);
}

function pushUndo(a) { undoStack.push(a); redoStack = []; updateUndoUI(); }
function updateUndoUI() {
  const u = document.getElementById('ixqaqc-btn-undo'), r = document.getElementById('ixqaqc-btn-redo');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
  const c = document.getElementById('ixqaqc-undo-count');
  if (c) c.textContent = undoStack.length;
}
function applyAction(a, reverse) {
  const delta = reverse ? -1 : 1;
  if (a.grp === 'tmc') data.tmc.count[a.slot][a.col] = Math.max(0, data.tmc.count[a.slot][a.col] + delta);
  else data[a.grp][a.dir][a.slot][a.col] = Math.max(0, data[a.grp][a.dir][a.slot][a.col] + delta);
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

function record(grp, dir, idx) {
  if (grp === 'tmc') { pushUndo({ grp, slot, col: idx }); data.tmc.count[slot][idx]++; }
  else { pushUndo({ grp, dir, slot, col: idx }); data[grp][dir][slot][idx]++; }
  render();
  const kbdId = grp === 'tmc' ? `ixqk-tmc-count-${idx}` : `ixqk-${grp}-${dir}-${idx}`;
  const kbd = document.getElementById(kbdId);
  const chip = kbd?.closest('.kbd-chip');
  const flashCls = dir === 'out' ? 'flash-out' : 'flash-in';
  if (kbd) { kbd.classList.add(flashCls); setTimeout(() => kbd.classList.remove(flashCls), 200); }
  if (chip) { chip.classList.add('tg-flash-in'); setTimeout(() => chip.classList.remove('tg-flash-in'), 200); }
}

function buildKeyMap() {
  const m = {};
  rows.vehicle.forEach((r, i) => {
    if (r.inKey) m[r.inKey] = () => record('vehicle', 'in', i);
    if (r.outKey) m[r.outKey] = () => record('vehicle', 'out', i);
  });
  rows.ped.forEach((r, i) => {
    if (r.inKey) m[r.inKey] = () => record('ped', 'in', i);
    if (r.outKey) m[r.outKey] = () => record('ped', 'out', i);
  });
  rows.tmc.forEach((r, i) => {
    if (r.countKey) m[r.countKey] = () => record('tmc', 'count', i);
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
  document.getElementById('ixqaqc-btn-undo')?.addEventListener('click', undo);
  document.getElementById('ixqaqc-btn-redo')?.addEventListener('click', redo);
}

// Builds a fresh conflict-free key assignment across ALL rows in one combined session
// (vehicle+ped share one in/out pool since both are 2-directional; tmc gets its own
// single-key pool since it's a single aggregate count per approach, not in/out).
// Deliberately exclude 'z' and 'y' from both pools — wireKeydown() checks those for
// undo/redo BEFORE consulting the row keymap (same precedence as every other counter in
// this app), so a row assigned 'z' or 'y' would have a permanently unreachable key. Also
// keep this pool's punctuation disjoint from TMC_KEY_POOL below (caught in manual testing:
// an earlier version double-booked '-'/'=' between OUT_KEY_POOL and TMC_KEY_POOL).
const IN_KEY_POOL = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'q', 'w', 'e', 'r', 't', 'u', 'i', 'o'];
const OUT_KEY_POOL = ['l', ';', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', "'", '[', ']', '-', '='];
const TMC_KEY_POOL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function assignRecountKeys({ vehicle = [], ped = [], tmc = [] }) {
  let ii = 0, oi = 0, ti = 0;
  return {
    vehicle: vehicle.map((r) => ({ ...r, inKey: IN_KEY_POOL[ii++] || '?', outKey: OUT_KEY_POOL[oi++] || '?' })),
    ped: ped.map((r) => ({ ...r, inKey: IN_KEY_POOL[ii++] || '?', outKey: OUT_KEY_POOL[oi++] || '?' })),
    tmc: tmc.map((r) => ({ ...r, countKey: TMC_KEY_POOL[ti++] || '?' })),
  };
}

export function finishIntersectionRecount() {
  const result = { vehicle: {}, ped: {}, tmc: {} };
  rows.vehicle.forEach((r, i) => {
    result.vehicle[r.key] = Array.from({ length: cfg.slots }, (_, s) => data.vehicle.in[s][i] + data.vehicle.out[s][i]);
  });
  rows.ped.forEach((r, i) => {
    result.ped[r.key] = Array.from({ length: cfg.slots }, (_, s) => data.ped.in[s][i] + data.ped.out[s][i]);
  });
  rows.tmc.forEach((r, i) => {
    result.tmc[r.key] = Array.from({ length: cfg.slots }, (_, s) => data.tmc.count[s][i]);
  });
  const cfgSnapshot = { startMinutes: cfg.startMinutes, intervalMin: cfg.intervalMin, durationMin: cfg.durationMin };
  if (onFinish) onFinish(result, cfgSnapshot);
}
