// Live keyboard-driven counting for trip-generation locations — parallel to the
// intersection counter's vehicle-counting engine (same data shape: per-classification
// in/out counts per interval), but deliberately standalone rather than reusing
// state.js/vData/vPairs directly, since a trip-gen project and an intersection project can
// coexist and shouldn't share mutable globals. One "begin counting" run = one location;
// finishing converts the result into the same {types, intervals} shape parseTripGen.js
// produces, so it drops straight into the existing trip-gen analysis pipeline.

import { buildNumpadDiagramHTML } from './numpadDiagram.js';
// Pop-out vehicle reference window (build brief item 1) — modeled on diagram.js's TMC turning
// popup. One-directional-in-practice import: tripgenDiagram.js also imports back from this
// file (tgLiveState/slotLabel/distinctTgGroups) to read live counting state, the same
// established circular-import pattern this codebase already uses for counter.js<->focus.js.
import { toggleTgDiagram, updateTgDiagram, flashTgCell } from './tripgenDiagram.js';

let classifications = []; // [{label, inKey, outKey, def, group}]
// Whether the classification list is locked against reordering — set by main.js (which owns
// tripgenEntries, not visible from this module per this file's own header comment) via
// setClassificationsLocked() before each render, mirroring vPairs' hasCountData() lock in
// setup.js: reordering after a location already has real day data would silently scramble
// which historical column means what.
let classificationsLocked = false;
export function setClassificationsLocked(v) { classificationsLocked = !!v; }
// Which classification rows have their description textarea expanded — pure UI state, same
// spirit as vPairs' vDescExpanded in setup.js.
const descExpanded = new Set();
let cfg = { startMinutes: 0, intervalMin: 15, durationMin: 1440, get slots() { return Math.max(1, Math.round(this.durationMin / this.intervalMin)); } };
let tgData = { in: [], out: [] };
// Cells the user directly typed a value into (click-to-edit, see wireCellEdit()/startCellEdit()
// below), as `${slot}-${col}` keys — tracked separately from tgData so buildTable() can mark
// them visually, mirroring the intersection counter's vManual/pedManual/tmManual (record.js).
// Reset alongside tgData at the start of every begin*() below.
let tgManual = { in: new Set(), out: new Set() };
let slot = 0;
let undoStack = [], redoStack = [];
let onFinish = null; // callback(parsed) supplied by main.js

// ── Session identity (BUG-047/BUG-048 follow-up: "read-only outside the counter") ──
// tgData/classifications/cfg are shared module state — every beginCounting/beginEditing/
// beginRecount call resets and reuses the SAME variables rather than each session getting its
// own isolated object. BUG-047 and BUG-048 were both, at root, a write site trusting that
// whatever is currently sitting in this shared state still belongs to the session it thinks
// is active, with no way to actually verify that. sessionSeq is a monotonically increasing id
// minted fresh by every beginCounting/beginEditing call (NOT beginRecount — recounts write to
// a separate qaqc structure in main.js, never to a location's own day.parsed, so they don't
// need to participate in this check). main.js's commitLocationCounts() is the only place
// permitted to write day.parsed/editSnapshot, and it refuses any write whose seq doesn't match
// the seq recorded when that location/day's session began — so a write produced by a session
// that has since been superseded (a recount reset tgData, a different location's edit began,
// etc.) is rejected instead of silently landing in the wrong place.
let sessionSeq = 0;
export function getSessionSeq() { return sessionSeq; }

// ── Focus mode ──
// Locks keyboard input to a single classification at a time — same interaction model and
// keybindings as the intersection counter's focus.js (toggle with \, cycle with [/]), but
// with its own local state rather than reusing focus.js's module-level globals, since this
// file's own header comment establishes tripgenCount.js as deliberately standalone from
// state.js. Reset at the start of every begin*() below (same as slot/undoStack/redoStack)
// since focusTarget indexes into whatever classifications list that session just loaded,
// which can be a different length than whatever was focused in a previous location/session.
let focusMode = false;
let focusTarget = 0;

// ── Keybinding groups ──
// Group membership is now each classification's own explicit `group` field (build brief item
// 1 — "same idea" as vPairs' group field in state.js), not an implicit floor(index/4) slice.
// tgGroup itself stays an INDEX into the sorted list of distinct group ids present (mirrors
// counter.js's vGroup semantics), local to this module per this file's own
// standalone-from-state.js header comment. Reset alongside focusTarget at the start of every
// begin*() below.
let tgGroup = 0;
// Exported for tripgenDiagram.js's popup — the popup filters its rows to the currently
// active group the same way this file's own buildKbd() does, since a physical key is
// only meaningful within its group (two different-group classifications may share a key).
export function distinctTgGroups(){ return [...new Set(classifications.map(c=>c.group??0))].sort((a,b)=>a-b); }

// Read-only snapshot of everything the popup reference window (tripgenDiagram.js) needs to
// render itself — the module-local vars above (classifications, tgData, slot, cfg, tgGroup)
// aren't exported directly since nothing outside this file should mutate them, but the popup
// only ever reads them to build a display payload. Mirrors diagram.js's tmcPopupPayload()
// pulling straight from state.js's exported live bindings; this file just doesn't have a
// shared state module to pull from (see file header — deliberately standalone), so this
// getter is the equivalent seam.
export function tgLiveState() { return { classifications, tgData, slot, cfg, tgGroup, focusMode, focusTarget, undoStack, redoStack }; }

// ── Keybinding preset (build brief item 4) — Numpad one-handed default (changed from QWERTY:
// Trip Gen counting is field work, often one-handed alongside a video scrub or clicker, which
// is exactly what the numpad layout is for). Local to this module, same standalone rationale
// as everything else here. Only affects NEW rows (addClassification) — see keybind.js's
// getKeyPools() header comment for the same "position-based, not a one-time stamp" rationale,
// mirrored here for Trip Gen. The intersection counter's own equivalent (state.js's
// keybindCfg) is untouched — still defaults to QWERTY; this default change is scoped to Trip
// Gen only, not a change to the shared keybinding-preset concept generally.
let tgKeybindCfg = { preset: 'numpad' };
export function getTgKeybindCfg(){ return { ...tgKeybindCfg }; }
export function setTgKeybindCfg(v){ Object.assign(tgKeybindCfg, v); renderClassificationsList(); }
export function resetTgKeybindCfg(){ tgKeybindCfg.preset='numpad'; }
function tgKeyPools(){
  return tgKeybindCfg.preset==='numpad'
    ? { inPool:['7','4','1','0'], outPool:['9','6','3','.'] }
    : { inPool:['a','s','d','f'], outPool:['j','k','l',';'] };
}

// Which group is "active"/highlighted in the setup list — pure UI state (same spirit as
// descExpanded above), not persisted. Defaults to the first group present.
let activeTgSetupGroup = null;
export function setActiveTgSetupGroup(g){ activeTgSetupGroup = g; renderClassificationsList(); }

function isActiveScreen() {
  const el = document.getElementById('tripgen-counter-screen');
  return el && el.style.display !== 'none';
}

// Exported (not just local) so tripgenDiagram.js's popup builder can render the same
// interval label the on-screen counter shows, without duplicating the format logic.
export function slotLabel(i) {
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
// Escapes text for safe interpolation into innerHTML (matches setup.js's own local `esc`
// used for the parallel vPairs editor).
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function renderTgKeybindCfgControls(wrap) {
  const row = document.createElement('div'); row.className = 'keybind-cfg-row';
  row.innerHTML = `
    <span class="keybind-cfg-label">key preset:</span>
    <button type="button" class="preset-btn${tgKeybindCfg.preset==='qwerty'?' active':''}" data-tg-preset="qwerty" title="A/S/D/F entry · J/K/L/; exit — default">QWERTY</button>
    <button type="button" class="preset-btn${tgKeybindCfg.preset==='numpad'?' active':''}" data-tg-preset="numpad" title="7/9, 4/6, 1/3, 0/. — one-handed numpad layout">Numpad one-handed</button>
  `;
  wrap.appendChild(row);
  row.querySelectorAll('[data-tg-preset]').forEach((btn) => {
    btn.addEventListener('click', () => setTgKeybindCfg({ preset: btn.dataset.tgPreset }));
  });
  if (tgKeybindCfg.preset === 'numpad') {
    const diagWrap = document.createElement('div'); diagWrap.style.marginBottom = '10px';
    const ids = distinctTgGroups();
    const grp0Labels = classifications.filter(c => (c.group ?? 0) === (ids[0] ?? 0)).map(c => c.label);
    diagWrap.innerHTML = buildNumpadDiagramHTML(grp0Labels);
    wrap.appendChild(diagWrap);
  }
}

export function renderClassificationsList() {
  const wrap = document.getElementById('tg-classifications-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  renderTgKeybindCfgControls(wrap);
  const locked = classificationsLocked;
  const groupIds = distinctTgGroups();
  const multiGroup = groupIds.length > 1;
  if (activeTgSetupGroup == null || !groupIds.includes(activeTgSetupGroup)) activeTgSetupGroup = groupIds[0] ?? 0;
  if (multiGroup) {
    const notice = document.createElement('div'); notice.className = 'group-notice';
    notice.innerHTML = `<strong>Keybinding groups</strong> — each group shares one set of keys; classifications in a different group may reuse the same keys. Use ‹ › during counting to switch groups. Edit the # field on a row to move it to a different group. Click a group heading to highlight its rows.`;
    wrap.appendChild(notice);
  }
  let dragSrc = -1;
  let lastGroup = null;
  classifications.forEach((c, i) => {
    if (c.group == null) c.group = 0;
    if (multiGroup && c.group !== lastGroup) {
      lastGroup = c.group;
      const sep = document.createElement('div');
      const gi = groupIds.indexOf(c.group);
      sep.className = 'group-sep' + (c.group === activeTgSetupGroup ? ' group-sep-active' : '');
      sep.textContent = `Group ${gi >= 0 ? gi + 1 : '?'}`;
      sep.title = 'Click to highlight this group’s rows';
      sep.style.cursor = 'pointer';
      sep.addEventListener('click', () => setActiveTgSetupGroup(c.group));
      wrap.appendChild(sep);
    }
    const inActiveGroup = multiGroup && c.group === activeTgSetupGroup;
    const row = document.createElement('div');
    row.className = 'pair-row tg-pair-row' + (inActiveGroup ? ' group-row-active' : '');
    row.dataset.tgIdx = i;
    const expanded = descExpanded.has(i);
    const descBtnLabel = expanded ? '▾ desc' : (c.def ? '✎ desc' : '+ desc');
    row.innerHTML = `
      <span class="drag-handle${locked ? ' drag-locked' : ''}" title="${locked ? 'locked — count data exists' : 'drag to reorder'}">⣿</span>
      <input type="number" class="group-field" min="0" value="${c.group ?? 0}" title="Keybinding group — rows sharing a group share one set of keys" data-tg-field="group" data-tg-idx="${i}">
      <input type="text" value="${esc(c.label)}" placeholder="label" data-tg-field="label" data-tg-idx="${i}">
      <button type="button" class="desc-toggle-btn" data-tg-desc-toggle="${i}" title="${expanded ? 'Hide description' : (c.def ? 'Edit description' : 'Add description')}">${descBtnLabel}</button>
      <input type="text" class="key-input" maxlength="1" value="${(c.inKey || '').toUpperCase()}" placeholder="in" data-tg-field="inKey" data-tg-idx="${i}">
      <input type="text" class="key-input" maxlength="1" value="${(c.outKey || '').toUpperCase()}" placeholder="out" data-tg-field="outKey" data-tg-idx="${i}">
      <button data-tg-remove="${i}" style="font-size:11px">×</button>
    `;
    wrap.appendChild(row);
    if (expanded) {
      const descRow = document.createElement('div');
      descRow.className = 'desc-row';
      descRow.innerHTML = `<textarea class="desc-textarea" placeholder="e.g. AKA visitor parking, includes rideshare drop-off" data-tg-desc-idx="${i}">${esc(c.def || '')}</textarea>`;
      wrap.appendChild(descRow);
    }
    if (!locked) {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { dragSrc = i; e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('drag-over');
        if (dragSrc < 0 || dragSrc === i) return;
        const moved = classifications.splice(dragSrc, 1)[0];
        classifications.splice(i, 0, moved);
        renderClassificationsList();
        window.scheduleAutosave?.();
      });
    }
  });
  wrap.querySelectorAll('[data-tg-field]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.tgIdx), field = el.dataset.tgField;
      if (field === 'group') { classifications[i].group = parseInt(el.value) || 0; renderClassificationsList(); window.scheduleAutosave?.(); return; }
      classifications[i][field] = field === 'label' ? el.value : el.value.toLowerCase();
      checkKeyConflicts();
      window.scheduleAutosave?.();
    });
  });
  wrap.querySelectorAll('[data-tg-desc-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.tgDescToggle);
      if (descExpanded.has(i)) descExpanded.delete(i); else descExpanded.add(i);
      renderClassificationsList();
    });
  });
  wrap.querySelectorAll('[data-tg-desc-idx]').forEach((el) => {
    el.addEventListener('input', () => {
      classifications[Number(el.dataset.tgDescIdx)].def = el.value;
      window.scheduleAutosave?.();
    });
  });
  wrap.querySelectorAll('[data-tg-remove]').forEach((el) => {
    el.addEventListener('click', () => {
      classifications.splice(Number(el.dataset.tgRemove), 1);
      renderClassificationsList();
      window.scheduleAutosave?.();
    });
  });
  checkKeyConflicts();
}

// Default keys split left-hand (Entry) / right-hand (Exit) — same convention as the
// intersection counter's vehicle types (A/J, S/K, D/L, F/;, ...), so the muscle memory
// carries over between count types. Pool + group size now come from tgKeyPools() (build
// brief item 4 — Numpad one-handed preset), not a hardcoded QWERTY-only pool; a new row's
// `group` is assigned by POSITION within a 4-per-group block, same as vPairs.
export function addClassification() {
  const { inPool, outPool } = tgKeyPools();
  const idx = classifications.length;
  const gi = idx % 4;
  const used = new Set(classifications.flatMap((c) => [c.inKey, c.outKey]));
  let inKey = inPool[gi] || '?', outKey = outPool[gi] || '?';
  if (used.has(inKey)) inKey = inPool.find((k) => !used.has(k)) || '?';
  if (used.has(outKey)) outKey = outPool.find((k) => !used.has(k)) || '?';
  classifications.push({ label: `classification ${idx + 1}`, inKey, outKey, def: '', group: Math.floor(idx / 4) });
  renderClassificationsList();
  window.scheduleAutosave?.();
}

// Scoped PER GROUP (same shape as setup.js's checkVKeys byGroup Map) — two classifications in
// DIFFERENT groups are allowed to share a key (that's the point of grouping); only same-group
// conflicts are flagged. Grouped by the row's explicit `group` field (build brief item 1),
// not a hardcoded floor(index/4) slice.
function checkKeyConflicts() {
  const dupeSet = new Set();
  const byGroup = new Map();
  classifications.forEach((c) => {
    const g = c.group ?? 0;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(c);
  });
  byGroup.forEach((grp, g) => {
    const gk = grp.flatMap((c) => [c.inKey, c.outKey]);
    gk.forEach((k, i) => { if (k && k !== '?' && gk.indexOf(k) !== i) dupeSet.add(g + '_' + k); });
  });
  document.querySelectorAll('#tg-classifications-list .tg-pair-row input.key-input').forEach((inp) => {
    const row = inp.closest('[data-tg-idx]');
    const idx = row ? parseInt(row.dataset.tgIdx) : -1;
    const g = idx >= 0 ? (classifications[idx]?.group ?? 0) : 0;
    inp.classList.toggle('key-conflict', idx >= 0 && dupeSet.has(g + '_' + inp.value.toLowerCase()));
  });
  const warn = document.getElementById('tg-key-conflict');
  if (warn) warn.classList.toggle('visible', dupeSet.size > 0);
  return dupeSet.size === 0;
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
  tgData = { in: Array.from({ length: s }, () => Array(n).fill(0)), out: Array.from({ length: s }, () => Array(n).fill(0)), notes: Array(s).fill('') };
  slot = 0; undoStack = []; redoStack = []; tgManual = { in: new Set(), out: new Set() };
  focusMode = false; focusTarget = 0; tgGroup = 0;
  onFinish = finishCallback;
  sessionSeq++;

  buildKbd();
  buildTable();
  updateUndoUI();
  updateFocusUI();
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
    notes: parsed.intervals.map((iv) => iv.note || ''),
  };
  slot = 0; undoStack = []; redoStack = []; tgManual = { in: new Set(), out: new Set() };
  focusMode = false; focusTarget = 0; tgGroup = 0;
  onFinish = finishCallback;
  sessionSeq++;

  buildKbd();
  buildTable();
  updateUndoUI();
  updateFocusUI();
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
  return types.map((label, i) => ({ label, inKey: inPool[i] || '?', outKey: outPool[i] || '?', def: '', group: Math.floor(i / 4) }));
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
  tgData = { in: Array.from({ length: s }, () => Array(n).fill(0)), out: Array.from({ length: s }, () => Array(n).fill(0)), notes: Array(s).fill('') };
  slot = 0; undoStack = []; redoStack = []; tgManual = { in: new Set(), out: new Set() };
  focusMode = false; focusTarget = 0; tgGroup = 0;
  onFinish = finishCallback;
  // A recount never writes to a location's day.parsed itself (main.js routes recount results
  // into the separate tripgenQaqc structure), so it doesn't need its own seq identity — but
  // bumping sessionSeq here still matters defensively: it invalidates whatever seq a
  // just-displaced edit session's tgPendingLocation was carrying, so if some future write site
  // ever mistakenly called captureLiveSnapshot() during a recount, main.js's
  // commitLocationCounts() would see a seq mismatch and reject it rather than silently writing
  // the recount's own data into the wrong location (BUG-047/BUG-048's exact failure shape).
  sessionSeq++;

  buildKbd();
  buildTable();
  updateUndoUI();
  updateFocusUI();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
  return true;
}

// Starts a fresh (zeroed) count for a location's day that already has real data, using that
// day's OWN classifications/timing (given explicitly, like beginRecount) rather than whatever
// happens to be in the setup screen's editor — used when QA/QC finds the original count is bad
// enough that it needs to be fully redone, not just spot-checked. Unlike beginRecount, this
// DOES eventually write through main.js's commitLocationCounts() (like beginCounting/
// beginEditing, so it mints a fresh sessionSeq for that write to be checked against) — but per
// main.js's startTripgenRecount(), that write lands in a BRAND NEW day pushed onto the same
// entry, never overwriting the source day's own day.parsed. The name is a holdover from an
// earlier, destructive design (see BUGS.md/DEVLOG.md) — kept because the function's own
// behavior (a zeroed count from given classifications/cfg, minting a new session) is unchanged;
// only the caller's use of the result changed from replace to additive.
export function beginFullRecount(classificationList, cfgIn, finishCallback) {
  classifications = classificationList.map((c) => ({ ...c }));
  cfg.startMinutes = cfgIn.startMinutes;
  cfg.intervalMin = cfgIn.intervalMin;
  cfg.durationMin = cfgIn.durationMin;

  const n = classifications.length, s = cfg.slots;
  tgData = { in: Array.from({ length: s }, () => Array(n).fill(0)), out: Array.from({ length: s }, () => Array(n).fill(0)), notes: Array(s).fill('') };
  slot = 0; undoStack = []; redoStack = []; tgManual = { in: new Set(), out: new Set() };
  focusMode = false; focusTarget = 0; tgGroup = 0;
  onFinish = finishCallback;
  sessionSeq++;

  buildKbd();
  buildTable();
  updateUndoUI();
  updateFocusUI();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
  return true;
}

// Group nav — mirrors counter.js's buildKbd() vehicle-mode group ‹ › + "group N/M" label,
// but built as real DOM elements with addEventListener rather than inline onclick= (BUG-024:
// inline handlers need explicit window exposure; this file already uses addEventListener
// throughout for focus mode, so stay consistent).
function buildKbdGroupNav(nG) {
  const navWrap = document.createElement('span');
  navWrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:6px';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'vgrp-btn'; prevBtn.textContent = '‹';
  prevBtn.title = 'previous group'; prevBtn.disabled = tgGroup === 0;
  prevBtn.addEventListener('click', tgGroupPrev);
  const label = document.createElement('span');
  label.style.cssText = 'font-size:10px;font-weight:600;color:var(--text2);white-space:nowrap';
  label.textContent = `group ${tgGroup + 1}/${nG}`;
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'vgrp-btn'; nextBtn.textContent = '›';
  nextBtn.title = 'next group'; nextBtn.disabled = tgGroup === nG - 1;
  nextBtn.addEventListener('click', tgGroupNext);
  navWrap.appendChild(prevBtn); navWrap.appendChild(label); navWrap.appendChild(nextBtn);
  return navWrap;
}

function buildKbd() {
  const grid = document.getElementById('tg-kbd-grid');
  if (!grid) return;
  const groupIds = distinctTgGroups();
  const nG = groupIds.length;
  const gid = groupIds[Math.min(tgGroup, nG - 1)] ?? 0;
  const idxOf = (c) => classifications.indexOf(c);
  grid.innerHTML = classifications.filter((c) => (c.group ?? 0) === gid).map((c) => {
    const i = idxOf(c);
    const dim = (focusMode && i !== focusTarget) ? ' dimmed' : '';
    return `
    <span class="kbd-chip${dim}"><span class="ck">in</span><kbd id="tgk-in-${i}">${(c.inKey || '?').toUpperCase()}</kbd><span class="key-label">${c.label}</span></span>
    <span class="kbd-chip${dim}"><span class="ck">out</span><kbd id="tgk-out-${i}">${(c.outKey || '?').toUpperCase()}</kbd><span class="key-label">${c.label}</span></span>
  `;
  }).join('') + `
    <span class="kbd-group-sep"></span>
    <span class="kbd-group-label label-nav">nav</span>
    <span class="kbd-chip"><kbd>↑</kbd><span class="key-label">prev</span></span>
    <span class="kbd-chip"><kbd>↓</kbd><span class="key-label">next</span></span>
    <span class="kbd-chip"><kbd>Z</kbd><span class="key-label">undo</span></span>
    <span class="kbd-chip"><kbd>Y</kbd><span class="key-label">redo</span></span>
  ` + (nG > 1 ? `
    <span class="kbd-chip"><kbd>Num ÷</kbd><kbd>-</kbd><span class="key-label">group ‹ prev</span></span>
    <span class="kbd-chip"><kbd>Num -</kbd><kbd>Num +</kbd><kbd>=</kbd><span class="key-label">group next ›</span></span>
  ` : '');
  if (nG > 1) grid.insertBefore(buildKbdGroupNav(nG), grid.firstChild);
  const numpadRef = document.getElementById('tg-kbd-numpad-ref');
  if (numpadRef) {
    if (tgKeybindCfg.preset === 'numpad') {
      const labels = classifications.filter((c) => (c.group ?? 0) === gid).map((c) => c.label);
      numpadRef.innerHTML = buildNumpadDiagramHTML(labels);
      numpadRef.style.display = '';
    } else {
      numpadRef.style.display = 'none'; numpadRef.innerHTML = '';
    }
  }
  // buildKbd() (not render()) is what runs on group switch (tgGroupPrev/Next) and on
  // beginCounting/beginEditing/beginRecount — covering the popup-sync cases render()'s own
  // updateTgDiagram() call above doesn't reach.
  updateTgDiagram();
}

// Only shown/reachable when there's more than one group (nG>1) — mirrors vPairs' own
// vGroupPrev/Next gate. Switching groups also moves focusTarget to the new group's first
// member so focus mode — if later toggled on — never points at a classification that's no
// longer in the visible group. tgGroup is an INDEX into distinctTgGroups(), not a raw group
// id (build brief item 1 — group ids are now arbitrary user-editable integers).
function tgGroupPrev() {
  if (tgGroup > 0) {
    tgGroup--;
    const ids = distinctTgGroups();
    const gid = ids[tgGroup] ?? 0;
    const first = classifications.findIndex((c) => (c.group ?? 0) === gid);
    focusTarget = first < 0 ? 0 : first;
    buildKbd();
  }
}
function tgGroupNext() {
  const nG = distinctTgGroups().length;
  if (tgGroup < nG - 1) {
    tgGroup++;
    const ids = distinctTgGroups();
    const gid = ids[tgGroup] ?? 0;
    const first = classifications.findIndex((c) => (c.group ?? 0) === gid);
    focusTarget = first < 0 ? 0 : first;
    buildKbd();
  }
}

// ── Focus mode: toggle/cycle/UI, mirroring focus.js's interaction model ──
function focusCount() { return classifications.length; }
function isKeyAllowed(k) {
  const c = classifications[focusTarget]; if (!c) return false;
  return k === c.inKey || k === c.outKey;
}
function toggleFocusMode() {
  focusMode = !focusMode;
  if (focusMode && focusTarget >= focusCount()) focusTarget = 0;
  updateFocusUI();
}
function cycleFocus(dir) {
  const n = focusCount(); if (!n) return;
  focusTarget = (focusTarget + dir + n) % n;
  // Keep the visible group in sync with whichever group the newly-focused classification
  // actually belongs to (its own `group` field) — same as focus.js's cycleFocus, updated for
  // build brief item 1 (group ids are no longer implicitly floor(index/4)).
  const ids = distinctTgGroups();
  const g = classifications[focusTarget]?.group ?? 0;
  const gi = ids.indexOf(g);
  tgGroup = gi >= 0 ? gi : 0;
  updateFocusUI();
}
function setFocusTarget(i) {
  focusTarget = i;
  if (!focusMode) focusMode = true;
  updateFocusUI();
}
function updateFocusUI() {
  const btn = document.getElementById('tg-btn-focus');
  const bar = document.getElementById('tg-focus-bar');
  if (!btn) return;
  btn.classList.toggle('active', focusMode);
  btn.textContent = focusMode ? '◎ focus on' : '○ focus';
  if (bar) bar.style.display = focusMode ? 'flex' : 'none';
  if (focusMode) buildFocusChips();
  buildKbd();
  buildTable();
}
function buildFocusChips() {
  const wrap = document.getElementById('tg-focus-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  classifications.forEach((c, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'focus-chip' + (i === focusTarget ? ' active' : '');
    chip.textContent = c.label;
    chip.addEventListener('click', () => setFocusTarget(i));
    wrap.appendChild(chip);
  });
}

// Column-dimming classes/opacity below (ped-focus-col / ped-focus-col-hd / ped-dimmed) are
// reused verbatim from the intersection counter's ped-table focus treatment (counter.js's
// renderPed()) rather than invented fresh — same visual language ("focused column highlighted,
// every other column dimmed to opacity .28") so the two counters feel consistent, per this
// session's build brief. focusMode/focusTarget here are this file's own local state (this
// module deliberately doesn't share focus.js's globals — see file header), so fcxi is computed
// fresh each render rather than reusing focus.js's renderPed() fcxi pattern directly.
function buildTable() {
  const tbl = document.getElementById('tg-tbl-count');
  if (!tbl) return;
  const fcxi = focusMode ? focusTarget : -1;
  const colCls = (ci) => {
    const focused = ci === fcxi, anyFocus = fcxi >= 0;
    return focused ? ' ped-focus-col' : anyFocus ? ' ped-dimmed' : '';
  };
  const head = `<thead><tr><th>time</th>${classifications.map((c, ci) => {
    const focused = ci === fcxi, anyFocus = fcxi >= 0;
    const hd = focused ? ' ped-focus-col-hd' : anyFocus ? ' ped-dimmed' : '';
    return `<th class="${hd.trim()}">${c.label} In</th><th class="${hd.trim()}">${c.label} Out</th>`;
  }).join('')}<th>total</th><th class="tg-note-col">note</th></tr></thead>`;
  const body = Array.from({ length: cfg.slots }, (_, i) => {
    const cur = i === slot ? ' class="current"' : '';
    let rowTotal = 0;
    const cells = classifications.map((_, ci) => {
      const inV = tgData.in[i][ci], outV = tgData.out[i][ci];
      rowTotal += inV + outV;
      const fc = colCls(ci);
      const inEd = tgManual.in.has(`${i}-${ci}`) ? ' manually-edited' : '';
      const outEd = tgManual.out.has(`${i}-${ci}`) ? ' manually-edited' : '';
      return `<td class="${((inV > 0 ? 'nonzero' : '') + fc + inEd).trim()}" data-editable data-slot="${i}" data-col="${ci}" data-dir="in">${inV}</td>` +
             `<td class="${((outV > 0 ? 'nonzero' : '') + fc + outEd).trim()}" data-editable data-slot="${i}" data-col="${ci}" data-dir="out">${outV}</td>`;
    }).join('');
    const note = tgData.notes?.[i] || '';
    // Note button is deliberately minimal (build brief item 11: "rarely have notes, doesn't
    // need to take up a lot of space") — an unobtrusive "+" when empty, a filled "note*"
    // indicator when set, with the full text as a hover tooltip right on the button itself
    // (not just in analysis views) so a counter can sanity-check what they wrote without
    // opening the editor again.
    const noteBtn = note
      ? `<button type="button" class="tg-note-btn tg-note-set" data-slot="${i}" title="${escapeAttr(note)}">note*</button>`
      : `<button type="button" class="tg-note-btn" data-slot="${i}" title="add a note for this interval">+</button>`;
    return `<tr${cur} id="tg-r-${i}"><td class="tg-time-cell" data-slot="${i}" title="Right-click to clear this row">${slotLabel(i)}</td>${cells}<td class="${rowTotal > 0 ? 'nonzero' : ''}">${rowTotal}</td><td class="tg-note-col">${noteBtn}</td></tr>`;
  }).join('');
  const totals = classifications.map((_, ci) => {
    const inT = tgData.in.reduce((s, r) => s + r[ci], 0);
    const outT = tgData.out.reduce((s, r) => s + r[ci], 0);
    const fc = colCls(ci);
    return `<td class="${fc.trim()}">${inT}</td><td class="${fc.trim()}">${outT}</td>`;
  }).join('');
  const grand = tgData.in.flat().reduce((a, b) => a + b, 0) + tgData.out.flat().reduce((a, b) => a + b, 0);
  tbl.innerHTML = `${head}<tbody>${body}</tbody><tfoot><tr><td>total</td>${totals}<td>${grand}</td><td class="tg-note-col"></td></tr></tfoot>`;
  document.getElementById(`tg-r-${slot}`)?.scrollIntoView({ block: 'nearest' });
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Per-interval notes (build brief item 11) ──
// A single small modal, reused for whichever row's note button was clicked — mirrors the
// bug-report modal's own modal-backdrop/textarea pattern rather than a native prompt(), so
// the note text stays visible while editing and Cancel is unambiguous about discarding.
let noteModalSlot = null;
function openNoteModal(i) {
  noteModalSlot = i;
  const ta = document.getElementById('tg-note-textarea');
  const label = document.getElementById('tg-note-modal-label');
  if (label) label.textContent = slotLabel(i);
  if (ta) { ta.value = tgData.notes?.[i] || ''; ta.focus(); }
  document.getElementById('tg-note-modal')?.classList.add('open');
}
function closeNoteModal() {
  noteModalSlot = null;
  document.getElementById('tg-note-modal')?.classList.remove('open');
}
function saveNoteModal() {
  if (noteModalSlot == null) return;
  const ta = document.getElementById('tg-note-textarea');
  if (!tgData.notes) tgData.notes = Array(cfg.slots).fill('');
  tgData.notes[noteModalSlot] = (ta?.value || '').trim();
  closeNoteModal();
  buildTable();
  window.scheduleAutosave?.();
}
function wireNoteModal() {
  document.getElementById('tg-tbl-count')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tg-note-btn');
    if (btn) { openNoteModal(Number(btn.dataset.slot)); return; }
    const td = e.target.closest('td[data-editable]');
    if (td) startCellEdit(td);
  });
  document.getElementById('tg-note-modal-close')?.addEventListener('click', closeNoteModal);
  document.getElementById('tg-note-cancel')?.addEventListener('click', closeNoteModal);
  document.getElementById('tg-note-save')?.addEventListener('click', saveNoteModal);
}

// Right-click a time cell to clear that whole row — record.js's own #ctx-menu is per-direction
// (vehicle/ped/tmc each have their own table), which doesn't fit Trip Gen's single table with
// one row per interval spanning every classification, so this uses its own #tg-ctx-menu element
// rather than teaching record.js about tgData. Delegated the same way startCellEdit/notes are
// above — one listener, attached once, survives every buildTable() re-render.
let tgCtxSlot = null;
function wireTgContextMenu() {
  const menu = document.getElementById('tg-ctx-menu');
  const tbl = document.getElementById('tg-tbl-count');
  if (!menu || !tbl) return;
  tbl.addEventListener('contextmenu', (e) => {
    const td = e.target.closest('.tg-time-cell');
    if (!td) return;
    e.preventDefault();
    tgCtxSlot = Number(td.dataset.slot);
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.classList.add('open');
  });
  document.getElementById('tg-ctx-reset-interval')?.addEventListener('click', () => {
    if (tgCtxSlot != null) resetTgInterval(tgCtxSlot);
    menu.classList.remove('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));
}

// ── Direct cell editing (click a count to type an exact value) — the same mechanism the
// intersection counter already has (record.js's attachEditors/startCellEdit); Trip Gen never
// got it. Delegated from the single click listener on #tg-tbl-count above (the same container
// wireNoteModal already delegates from) rather than re-attached per cell on every buildTable()
// re-render, since the container element itself persists across renders even though its
// innerHTML is replaced each time.
function startCellEdit(td) {
  if (td.querySelector('input')) return; // already editing this cell
  const dir = td.dataset.dir, slotIdx = Number(td.dataset.slot), col = Number(td.dataset.col);
  const before = tgData[dir][slotIdx][col];
  td.classList.add('editing');
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '0'; inp.value = before;
  td.textContent = ''; td.appendChild(inp);
  inp.focus(); inp.select();
  function commit() {
    const raw = parseInt(inp.value, 10);
    const after = isNaN(raw) || raw < 0 ? before : raw;
    if (after !== before) {
      pushUndo({ type: 'cell', dir, slot: slotIdx, col, before, after });
      tgData[dir][slotIdx][col] = after;
      tgManual[dir].add(`${slotIdx}-${col}`);
      window.scheduleAutosave?.();
    }
    render();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
    if (ev.key === 'Escape') { inp.value = before; inp.blur(); }
    ev.stopPropagation(); // don't let digit keys also register as a counting keystroke
  });
}

function render() {
  buildTable();
  document.getElementById('tg-cur-interval').textContent = slotLabel(slot);
  // Keeps the popup in sync on every slot navigation, undo, and redo (all three call
  // render()) — matches the TMC popup's own update cadence (record.js/focus.js post a fresh
  // tmcPopupPayload after every state-changing action).
  updateTgDiagram();
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
  // 'cell' actions (a direct click-to-edit override, see startCellEdit() below) set an
  // ABSOLUTE value rather than incrementing/decrementing by one keystroke's worth — undo
  // restores the value it had before the edit, redo restores what was typed.
  if (a.type === 'cell') {
    tgData[a.dir][a.slot][a.col] = reverse ? a.before : a.after;
    return;
  }
  // 'reset' (clear this row — see resetTgInterval() below) — same absolute-value shape as
  // 'cell', just covering every classification's in/out at once instead of a single cell.
  if (a.type === 'reset') {
    tgData.in[a.slot] = (reverse ? a.inBefore : a.inAfter).slice();
    tgData.out[a.slot] = (reverse ? a.outBefore : a.outAfter).slice();
    return;
  }
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
  window.scheduleAutosave?.();
}
export function redo() {
  if (!redoStack.length) return;
  const a = redoStack.pop();
  applyAction(a, false);
  undoStack.push(a);
  updateUndoUI(); render();
  window.scheduleAutosave?.();
}

// Clear row (build brief: matches the intersection counter's own right-click "reset interval"
// — record.js's wireContextMenu()/ctx-reset-interval — which Trip Gen never had). Clears every
// classification's in AND out at this one interval back to 0, in a single undoable action, same
// "clear it and recount that period live" workflow a QA finding calls for.
function resetTgInterval(slotIdx) {
  if (slotIdx < 0 || slotIdx >= tgData.in.length) return;
  const inBefore = tgData.in[slotIdx].slice(), outBefore = tgData.out[slotIdx].slice();
  tgData.in[slotIdx] = classifications.map(() => 0);
  tgData.out[slotIdx] = classifications.map(() => 0);
  pushUndo({ type: 'reset', slot: slotIdx, inBefore, outBefore, inAfter: tgData.in[slotIdx].slice(), outAfter: tgData.out[slotIdx].slice() });
  render();
  window.scheduleAutosave?.();
}

function record(dir, idx) {
  pushUndo({ dir, slot, col: idx });
  tgData[dir][slot][idx]++;
  render();
  // BUG-034: unlike the main intersection counter (counter.js), nothing here previously
  // triggered autosave — a live Trip Gen count had zero persistence until "finish location"
  // was clicked, so navigating away (back button, refresh, crash) before finishing silently
  // discarded the whole count with no trace, in both autosave AND an explicit "save project".
  window.scheduleAutosave?.();
  // Flash the whole kbd-chip (which contains both the <kbd> key and the .key-label type name)
  const kbd = document.getElementById(`tgk-${dir === 'in' ? 'in' : 'out'}-${idx}`);
  const chip = kbd?.closest('.kbd-chip');
  const flashCls = dir === 'in' ? 'flash-in' : 'flash-out';
  const chipFlash = dir === 'in' ? 'tg-flash-in' : 'tg-flash-out';
  if (kbd) { kbd.classList.add(flashCls); setTimeout(() => kbd.classList.remove(flashCls), 200); }
  if (chip) { chip.classList.add(chipFlash); setTimeout(() => chip.classList.remove(chipFlash), 200); }
  // Popup gets its own flash on the exact In/Out cell just incremented — mirrors the
  // crosswalk popup's buildDiagramHTML 'flash' message (diagram.js), not the TMC popup (which
  // has no per-keystroke flash, only a persistent active-column highlight); a per-keystroke
  // flash reads better here since Trip Gen has no single "focused movement" the way TMC does.
  flashTgCell(idx, dir);
}

// Only register the ACTIVE group's keys — same principle as focus.js's buildVKeyMap, so a
// key press only counts for a classification if it's in the currently-visible/active group.
// Without this, two different-group classifications sharing a physical key (the whole point
// of grouping) would double-count or misattribute whichever key was pressed. Grouped by each
// classification's own `group` field (build brief item 1), not floor(index/4).
function buildKeyMap() {
  const m = {};
  const ids = distinctTgGroups();
  const gid = ids[Math.min(tgGroup, ids.length - 1)] ?? 0;
  classifications.forEach((c, i) => {
    if ((c.group ?? 0) !== gid) return;
    if (c.inKey) m[c.inKey] = () => record('in', i);
    if (c.outKey) m[c.outKey] = () => record('out', i);
  });
  return m;
}

// Shared by the real document keydown listener below AND the popup's keyboard-passthrough
// message forwarder, mirroring focus.js's processKey(k) split (called from both
// wireKeydown's own listener and its 'kbd-passthrough' message handler). Deliberately does
// NOT include the Numpad-code-based group-switch shortcut (e.code isn't available from a
// forwarded e.key string) — the TMC/ped popups have this exact same gap already (see
// focus.js's wireKeydown message handler), so this isn't a new limitation.
// `code` (event.code) is optional at call sites that don't have it — only the focus-mode
// Numpad 7/9 override below depends on it, so its absence just means that one shortcut is
// unavailable there, not a crash (matches the group-switch code's own optional-parameter shape).
function processTgKey(k, code) {
  if (k === 'arrowdown') { if (slot < cfg.slots - 1) { slot++; render(); } return; }
  if (k === 'arrowup') { if (slot > 0) { slot--; render(); } return; }
  if (k === 'z') { undo(); return; }
  if (k === 'y') { redo(); return; }
  if (k === '\\') { toggleFocusMode(); return; }
  if (focusMode) {
    if (k === '[') { cycleFocus(-1); return; }
    if (k === ']') { cycleFocus(1); return; }
    // Fixed focus-mode shortcut, independent of the focused classification's own assigned
    // keys or the active keybinding preset — always Numpad 7 = in / Numpad 9 = out for
    // whichever classification is currently focused. Checked via e.code (not e.key) for the
    // same reason groupSwitchCodes() is: e.key for the numpad "7"/"9" keys is just "7"/"9",
    // identical to the top-row digits, so only the physical code tells them apart. This is
    // additive — the classification's real key (if different) still works via isKeyAllowed
    // below; Numpad 7/9 is a second, always-available path to the same two actions.
    if (code === 'Numpad7') { record('in', focusTarget); return; }
    if (code === 'Numpad9') { record('out', focusTarget); return; }
    if (!isKeyAllowed(k)) return;
  } else {
    if (k === '[') { tgGroupPrev(); return; }
    if (k === ']') { tgGroupNext(); return; }
  }
  const action = buildKeyMap()[k];
  if (action) action();
}

// Shared by the real keydown listener and the popup's passthrough handler below, so the two
// can't drift out of sync on which physical keys mean "switch group". The numpad pair
// (NumpadDivide/NumpadSubtract) and the main-keyboard pair (Minus/Equal) are always active,
// regardless of the active counting-key preset (build brief follow-up: group-switch shouldn't
// be tied to whichever preset the in/out counting keys happen to use — someone counting with
// QWERTY keys may still prefer the numpad for group nav, and vice versa). NumpadAdd is also
// accepted as an extra "next" key (user report: reached for Numpad + expecting it to pair
// naturally with Numpad - for prev/next, found it did nothing) — additive, doesn't replace
// NumpadSubtract as "next".
function groupSwitchCodes() {
  return { prevCodes: ['NumpadDivide', 'Minus'], nextCodes: ['NumpadSubtract', 'Equal', 'NumpadAdd'] };
}

export function wireKeydown() {
  document.addEventListener('keydown', (e) => {
    if (!isActiveScreen()) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    // Group-switch shortcuts (build brief item 5) — dedicated keys, separate from the existing
    // [ / ] (unchanged below: group nav outside focus mode, focus-cycle inside it). Checked via
    // event.CODE so the numpad pair (Numpad/ / Numpad-) can't collide with the main-keyboard
    // pair (Minus/Equal) — both are always active now, matching the intersection counter's
    // focus.js implementation for the code-based check itself.
    const { prevCodes, nextCodes } = groupSwitchCodes();
    if (prevCodes.includes(e.code)) { e.preventDefault(); tgGroupPrev(); return; }
    if (nextCodes.includes(e.code)) { e.preventDefault(); tgGroupNext(); return; }
    const k = e.key.toLowerCase();
    const nav = ['arrowdown', 'arrowup', 'z', 'y', '\\', '[', ']'];
    if (nav.includes(k) || buildKeyMap()[k] || (focusMode && (e.code === 'Numpad7' || e.code === 'Numpad9'))) e.preventDefault();
    processTgKey(k, e.code);
  });
  document.getElementById('tg-btn-undo')?.addEventListener('click', undo);
  document.getElementById('tg-btn-redo')?.addEventListener('click', redo);
  document.getElementById('tg-btn-focus')?.addEventListener('click', toggleFocusMode);
  document.getElementById('tg-btn-diag')?.addEventListener('click', toggleTgDiagram);
  wireNoteModal();
  wireTgContextMenu();
  // Forward counting keys typed directly into the popup reference window back to this
  // window — same mechanism as focus.js's wireKeydown message handler (diagram.js's popup
  // keydown listener posts {type:'kbd-passthrough', key, code}).
  window.addEventListener('message', (e) => {
    if (!isActiveScreen()) return;
    const d = e.data;
    if (d?.type === 'kbd-passthrough') {
      // Group-switch shortcuts are matched by e.code (see groupSwitchCodes() above), not
      // e.key — the popup now forwards code too (previously only key), so this reproduces the
      // exact same check the real listener does instead of silently falling through to
      // processTgKey's key-based fallback, which only recognizes [ / ] and would never fire for
      // the Numpad/Minus-Equal shortcuts at all. This was a real, reported gap: typing the
      // group-switch key directly into the popup did nothing.
      const { prevCodes, nextCodes } = groupSwitchCodes();
      if (prevCodes.includes(d.code)) { tgGroupPrev(); return; }
      if (nextCodes.includes(d.code)) { tgGroupNext(); return; }
      const k = d.key === ';' ? ';' : d.key.toLowerCase();
      processTgKey(k, d.code);
    } else if (d?.type === 'tg-group-nav') {
      // Dedicated message type rather than simulating the group-switch key — that key is now
      // configurable per-preset (Minus/Equal or NumpadDivide/NumpadSubtract, matched by e.code,
      // which a forwarded e.key string can't reconstruct) and the popup shouldn't have to know
      // which preset is active. Calls the exact same functions the live counter's own ‹ ›
      // buttons call (buildKbdGroupNav), so behavior (including the focusTarget reset) matches.
      if (d.dir < 0) tgGroupPrev(); else tgGroupNext();
    } else if (d?.type === 'tg-focus-toggle') {
      toggleFocusMode();
    }
  });
}

// Builds the same {types, defs, intervals} shape finishLocation() commits, without calling
// onFinish or requiring the count to actually be finished — used by BUG-034's live-autosave
// path (main.js) to capture whatever's currently on the board, mid-count, for persistence.
function buildParsedFromLiveData() {
  const intervals = Array.from({ length: cfg.slots }, (_, i) => {
    const { start, end } = slotStartEnd(i);
    return { label: slotLabel(i), start, end, inbound: tgData.in[i].slice(), outbound: tgData.out[i].slice(), note: tgData.notes?.[i] || '' };
  });
  // defs is a parallel array (index-matched to types) rather than folding def into types
  // itself — types stays a plain string array so every existing consumer (groupTotals,
  // categoryMap, by-label aggregation) that keys off it is untouched.
  return { types: classifications.map((c) => c.label), defs: classifications.map((c) => c.def || ''), intervals };
}

export function finishLocation() {
  const parsed = buildParsedFromLiveData();
  const cb = onFinish;
  const seq = sessionSeq;
  onFinish = null; // clear BEFORE invoking cb — cb's own work (pushing the entry, etc.) is
  // already the source of truth once finish runs, so captureLiveSnapshot() must stop
  // reporting this session as "still in progress" from this point on, not after cb returns.
  if (cb) cb(parsed, snapshotForEdit(), seq);
}

// Read-only capture of the live in-progress count (BUG-034) — returns null if no count is
// currently active (nothing to capture), otherwise the same {parsed, editSnapshot} shape a
// finished location carries, plus the current interval index (so a reload restores the exact
// spot the user was at, not just interval 0) and this session's seq (see the "Session
// identity" comment above beginCounting/beginEditing) — callers pass seq into
// main.js's commitLocationCounts() so a write can be verified against the session it actually
// came from before it's applied.
export function captureLiveSnapshot() {
  if (!onFinish) return null; // no active count session
  return { parsed: buildParsedFromLiveData(), editSnapshot: snapshotForEdit(), slot, seq: sessionSeq };
}

export function resetClassifications() {
  classifications = [];
  renderClassificationsList();
}

// BUG-035: restores a saved classification list on project load. Previously nothing in
// serializeCurrentProject()'s tripgen branch persisted `classifications` at all — every
// classification the user configured (labels, keys, descriptions) was silently dropped from
// both autosave AND an explicit "save project" export, project-wide config, not count data.
export function restoreClassifications(list) {
  // Older saved projects predate the `group` field (configurable keybinding groups) —
  // backfill the same floor(index/4) grouping that was previously implicit (mirrors
  // main.js's loadProject() vPairs backfill for the intersection counter).
  classifications = (list || []).map((c, i) => ({ group: Math.floor(i / 4), ...c }));
  renderClassificationsList();
}

// Read-only snapshot of the current classification list — used by main.js to build a
// short summary on the locations tab ("3 classifications: Autos, Trucks, Bikes") now that
// the editor itself lives on its own dedicated tab rather than inline in the "start a new
// count" panel.
export function getClassifications() {
  return classifications.map((c) => ({ ...c }));
}
