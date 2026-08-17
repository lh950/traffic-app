# Bug tracker

Severity levels:
- **Critical** — data loss, broken save/load, app crash
- **Major** — a workflow is broken but has a workaround
- **Minor** — wrong behavior, doesn't block use
- **Cosmetic** — visual only

---

## BUG-028
**Status:** Fixed (v3.36.0-alpha.3, reported live by the user while field counting on the then-deployed v3.35.0-alpha.2 — pre-existing, not caused by this session's earlier work)
**Severity:** Major (a real, currently-deployed workflow was unusable at normal viewport sizes — the leftmost ~224px of the screen, including the header title, the keyboard reference bar, and the first table column, rendered underneath the opaque workspace sidebar)
**Found in:** pre-existing (`#tripgen-counter-screen`, live since Trip Gen's original counting-engine ship; also reproduced in `#intersection-qaqc-counter-screen`, live since the QA/QC recount feature)
**Description:** User reported "the actual count screen does not properly fit in the window" on the Trip Gen live counter. Reproduced live at both 1366×768 and 1280×800: the fixed 224px-wide workspace sidebar (`.app-sidebar`, `position:fixed;z-index:100`) rendered directly on top of the counter screen's left edge — the "trip generation" header title, the first ~1.5 classifications' worth of keyboard-reference chips, and the table's `time` column plus part of the first classification's columns were all hidden underneath it and inaccessible. Independently confirmed the same root cause reproduces in `#intersection-qaqc-counter-screen` (the QA/QC recount counter), which shares the identical structural gap.
**Root cause:** Every other workspace screen gets pushed right of the fixed sidebar via one of three existing CSS rules: the generic `body.workspace-mode .workspace-screen{margin-left:224px}` (applies to any screen carrying the `.workspace-screen` class, e.g. `#tripgen-setup-screen`, `#parking-counter-screen`), a `#setup-screen`-specific rule, or the intersection-counter-specific rule chain (`.counter-header`, `#period-tabs-bar`, `.counter-body`, etc., added for BUG-016). `#tripgen-counter-screen` and `#intersection-qaqc-counter-screen` are bare `<div>`s with no class attribute at all — matched by none of the three — so neither one ever received the offset, despite the fixed sidebar always being visible while either is shown (both only ever render inside an open project workspace).
**Fix:** Added `body.workspace-mode #tripgen-counter-screen, body.workspace-mode #intersection-qaqc-counter-screen{margin-left:224px}` to `src/style.css`, alongside the existing workspace-mode offset rules (same block that already carries the BUG-016 fix for `#counter-instructions`).
**Verified live:** at 1366×768 and 1280×800, the Trip Gen counter's header title, full keyboard-reference bar (3 classifications, all 6 chips), and the table's time column all render fully to the right of the sidebar with nothing obscured, at both sizes. No console errors introduced.

---

## BUG-027
**Status:** Fixed (v3.35.0-alpha.2, caught during my own end-of-batch independent audit — pre-existing, exposed by comparing against the new streetlightComparison code added in the same batch)
**Severity:** Major
**Found in:** pre-existing (`loadProject()`'s `intersectionQaqc` restore, shipped with area-study QA/QC in v3.29.0-alpha.1)
**Description:** `loadProject()` restored the standalone-project QA/QC store via `Object.assign(intersectionQaqc, proj.intersectionQaqc || {})` with no reset first. `Object.assign` only overwrites keys present in the source object — loading a project with fewer (or zero) QA/QC recount keys than whatever was already in memory from a *previously* loaded project left the old project's recount entries stranded in the live `intersectionQaqc` global. Reproduced live: loaded Project A (one vehicle-class recount, quarters summing to 20), opened its QA/QC screen (correctly showed the recount), then loaded Project B (a different, unrelated project with no QA/QC data of its own) and opened ITS QA/QC screen — it showed Project A's stale recount total (20) as if it were Project B's own, instead of "no recount."
**Root cause:** No reset-before-restore on a live global object that a later `Object.assign` only partially overwrites — the same shape of bug the streetlightComparison code (added in this same batch of work) explicitly avoided by resetting first, but the pre-existing `intersectionQaqc` line right next to it wasn't touched at the time and kept the old behavior.
**Fix:** Clear every key from `intersectionQaqc` (`for (const k in intersectionQaqc) delete intersectionQaqc[k]`) immediately before `Object.assign`-ing in the new project's data, mirroring `streetlightComparison`'s reset-then-restore pattern directly above it in the same function.
**Verified live:** re-ran the same two-project sequence (Project A with a recount → Project B without) after the fix — Project B's QA/QC screen correctly shows "no recount" instead of Project A's leaked total.

---

## BUG-026
**Status:** Fixed (v3.34.0-alpha.1, caught during required live verification of the new StreetLight comparison feature, before push)
**Severity:** Minor (wrong-but-plausible-looking output, not a crash — the app never signaled anything was off)
**Found in:** new (`renderStreetlightCompareScreen()`'s leg card, `src/main.js`)
**Description:** The StreetLight peak-hour-table PHF row is one value PER MOVEMENT COLUMN (Left/Thru/Right each get their own PHF), not one value per leg — confirmed against the real sample file (`..._tmc_peak_hour_table.xlsx`), e.g. the south leg's row read `[0.95, 0, 0]` for [Left, Thru, Right], not a single number. The first version of the comparison table's "PHF" column tried to call `.toFixed(2)` directly on `block.phf.byLeg[leg.key]`, which is the `{L,T,R}` object, not a number — threw `TypeError: slPhf.toFixed is not a function` on every render once a file was imported, caught immediately by the live-verification pass (real-file import test) rather than shipping silently.
**Root cause:** Assumed the PHF row had the same one-value-per-leg shape as the Total/Total % row, without checking the parsed data's actual shape before using it.
**Fix:** Replaced the single "PHF" table column with a caption line below each leg's table listing all three movement PHFs by name ("PHF (StreetLight, per movement) — Left: 0.95 · Thru: — · Right: —"), matching the data's real per-movement granularity instead of forcing it into a per-leg cell.
**Verified live:** re-imported the real sample file after the fix — all four legs render their correct per-movement PHF values with no console error.

---

## BUG-025
**Status:** Worked around locally (v3.34.0-alpha.1, caught during required live verification of the new StreetLight comparison feature); the underlying shared function (`ixDetectPeakStart()`) was deliberately left unchanged — see below
**Severity:** Major (wrong data shown with confidence: a plausible-looking but incorrect "peak hour" match, not a crash)
**Found in:** pre-existing (`ixDetectPeakStart()`, added for the standalone/area-study QA/QC feature), exposed by the new StreetLight comparison feature
**Description:** `ixDetectPeakStart()` only searches VEHICLE in/out volume (`vData`) for the busiest hour in a window; when vehicle mode isn't active (`enabledModes.vehicle` false — i.e. a turning-movement-only project, which is a completely normal configuration and exactly the kind of project someone would run a StreetLight TMC comparison against) it silently returns `searchStartMin` verbatim — the search window's literal floor, not an actual detected peak. Reproduced live: a TMC-only test project's "AM Peak" window (7:00–11:00 search range) always matched 7:00–8:00 (the window's start) instead of the intersection's actual busiest hour (9:00–10:00, where the test data was deliberately concentrated), with the StreetLight comparison screen confidently showing the wrong manual-count numbers (all zeros) with no error or warning.
**Root cause:** `ixDetectPeakStart()` has no fallback for when vehicle data isn't the count type in play — reasonable for its original QA/QC use (QA/QC's per-mode recount already knows which row group it's scoring), but a silent trap for any new caller that needs "the peak hour" for a TMC-only project.
**Fix:** New local `slDetectPeakStart()` in the StreetLight comparison section of `main.js`: uses `ixDetectPeakStart()` unchanged when vehicle mode/data is usable, otherwise searches `tmcData` volume directly for the busiest hour in the window. Deliberately NOT folded into `ixDetectPeakStart()` itself/QA/QC's own peak search — that would be an unreviewed behavior change to an already-shipped feature outside this task's scope. QA/QC's own TMC-only peak-window search likely has the same gap and should be looked at separately.
**Verified live:** re-ran the StreetLight comparison against the same TMC-only test project after the fix — "AM Peak" now correctly matches 9:00–10:00 (the intended peak), with StreetLight vs. manual diffs computing to the expected hand-checked values (+20 on one movement, 0 on the rest).

---

## BUG-024
**Status:** Fixed (v3.33.0-alpha.1, found while adding the new lat/lng setup fields)
**Severity:** Minor (data was never lost — only the setup screen's display of it — but two compounding issues, one of which threw on every keystroke)
**Found in:** pre-existing (`street1-inp`/`street2-inp`/`street3-inp`), exposed while adding the analogous `ix-lat-inp`/`ix-lng-inp` fields for standalone intersection projects
**Description:** Two separate bugs in the same corner of setup.js/index.html:
1. `renderLegConfig()` — which runs on every setup-screen (re)entry and after every project load/resume — never set `street1-inp`/`street2-inp`/`street3-inp`'s `.value` from `intersection.street1/street2/street3`. The underlying state was always saved and restored correctly (`intersection` is serialized/restored wholesale), but re-opening Setup after a resume or project load showed blank street-name fields even though the data was intact. Reproduced live: typed "Main St"/"Oak Ave", started counting (triggers autosave), reloaded the page, resumed, opened Setup → both fields showed empty while `window.intersection.street1` still held `"Main St"`.
2. Independently, every one of those three inputs' `oninput` handler calls `updateDefaultFilenames()` (`intersection.street1=this.value;updateDefaultFilenames();renderLegConfig()`), but `updateDefaultFilenames` was never added to the `Object.assign(window, {...})` block in `main.js` that exposes module-scoped functions to these inline HTML handlers. Every keystroke in any of the three street-name fields threw `ReferenceError: updateDefaultFilenames is not defined` — and because the handler is one sequential statement list, the error also aborted the `renderLegConfig()` call right after it, so the leg diagram/labels silently stopped live-updating on every keystroke too.
**Root cause:** (1) no re-sync path existed from state back to these specific DOM inputs; (2) a function used by an inline `oninput=` handler was imported into `main.js`'s module scope but never re-exported onto `window`, where inline handlers actually run.
**Fix:** Added `syncIntersectionLocationFields()` in `setup.js`, called at the top of `renderLegConfig()`, which sets `street1-inp`/`street2-inp`/`street3-inp` and the new `ix-lat-inp`/`ix-lng-inp` `.value` from `intersection`'s current state — covers every load/resume/re-entry path for free since `renderLegConfig()` already runs on all of them. Added `updateDefaultFilenames` to the `Object.assign(window, {...})` exposure list in `main.js`.
**Verified live:** typed into `street1-inp` in a fresh tab — no console error, leg diagram updates immediately. Set street1/street2/lat/lng, started counting (autosave), reloaded, resumed, opened Setup → all four fields showed the correct restored values.

---

## BUG-023
**Status:** Fixed (v3.32.0-alpha.2, caught during my own independent audit of the new UTDF export feature, before it was pushed)
**Severity:** Critical
**Found in:** new (`exportUtdf.js`, added for Synchro UTDF export)
**Description:** UTDF/Synchro labels turning-movement columns (NBL/NBT/NBR, SBL/SBT/SBR, EBL/EBT/EBR, WBL/WBT/WBR) by the direction a vehicle is TRAVELING, not by which physical leg it entered from — this app's own `parseDotTmcXlsx.js` (traced from real NYC DOT files) already documents the correct convention: "SB = vehicle entered from North; EB = from West; NB = from South; WB = from East". The original `exportUtdf.js` mapped this app's leg N straight to the UTDF NB column (and S→SB, E→EB, W→WB) — i.e. by physical leg position, which is backwards. Confirmed independently via `classifyTurn()`'s own bearing math (approach leg N's direction-of-travel heading computes to 180°, due south). Every UTDF file the feature produced before this fix had north/south and east/west turning-movement volumes silently swapped — exactly the kind of "garbled Synchro import" the feature's own build brief warned against, and not something the implementing agent's own verification could have caught since it hand-computed its "expected" values using the same (incorrect) directional assumption as the code, rather than against the app's own already-established DOT-TMC convention.
**Root cause:** `UTDF_LEG_ORDER` (and the unused `CARDINAL_TO_UTDF` constant) assumed leg-name-matches-UTDF-label, without cross-checking against the direction-of-travel convention this app had already established elsewhere for the same NB/SB/EB/WB labels.
**Fix:** `UTDF_LEG_ORDER` changed from `['N','S','E','W']` to `['S','N','W','E']` so each leg's L/T/R triplet lands under the correct direction-of-travel column; `CARDINAL_TO_UTDF` corrected to `{ S:'NB', N:'SB', W:'EB', E:'WB' }` for documentation accuracy (this constant isn't otherwise used in the export logic).
**Verified live:** seeded single-movement fixtures via `window.__loadProject()` and captured the exported UTDF text (intercepting `URL.createObjectURL`) — confirmed a leg-N right turn lands in SBR (not NBR), and a 4-direction fixture (N→S=3, S→N=5, E→W=9, W→E=11, all through movements) produced exactly `NBT=5, SBT=3, EBT=11, WBT=9` — matching the hand-derived expectation for every direction, not just one.

---

## BUG-022
**Status:** Fixed (v3.29.0-alpha.2, caught during my own independent audit of the area-study QA/QC feature, after BUG-020/021 had already been fixed)
**Severity:** Major
**Found in:** new (`renderIntersectionQaqcScreen()`, added for area-study QA/QC)
**Description:** `renderIntersectionQaqcScreen(snapshotCtx)` is `async` (it `await`s `ixDetectPeakStart()` per QA/QC window) and unconditionally writes its result to the shared `#intersection-qaqc-list` container at the end (`root.innerHTML = ...`) with no check that it's still the most recently requested render. The screen can be re-entered in quick succession multiple ways — switching straight from one area-study intersection's QA/QC to another (`showIntersectionQaqc`), or finishing a recount (which calls `renderIntersectionQaqcScreen(ixQaqcActiveCtx)` itself). Two overlapping calls race on the same DOM container; whichever resolves *last* wins, regardless of which one was requested last. Reproduced live: finish a recount on intersection A, then immediately (no wait) call `showIntersectionQaqc(1)` for B — B's screen displayed A's primary/recount totals instead of B's own, with no visual indication anything was wrong.
**Root cause:** No staleness/generation guard on an async render function writing to a shared DOM container — the same failure family as BUG-017 (stale writes to a shared element), but via an async race instead of a duplicate-id collision.
**Fix:** Added a module-level `_ixQaqcRenderGen` counter, incremented at the top of every `renderIntersectionQaqcScreen()` call; each call captures its own generation number and checks it's still current immediately before every `root.innerHTML` write (the two early-return messages and the final card render). A superseded render silently no-ops instead of overwriting a newer render's DOM.
**Verified live:** re-ran the same tight-race sequence (recount finish → immediate switch to another intersection's QA/QC, ~10-50ms gap) after the fix — the newer intersection's data always wins regardless of resolve order.

---

## BUG-021
**Status:** Fixed (v3.29.0-alpha.1, caught during live verification of the QA/QC area-study feature)
**Severity:** Critical
**Found in:** pre-existing (`focus.js`'s `wireKeydown()`), exposed while adding area-study QA/QC
**Description:** `wireKeydown()` — the document-level keydown listener that drives the LIVE intersection counter (vehicle/ped/turning-movement key-to-count mapping) — had no guard checking whether the live counter screen was actually the visible screen. Every other keyboard-driven module in the app (`intersectionQaqcCount.js`'s own `wireKeydown`, `tripgenCount.js`'s) explicitly checks its own screen's visibility before acting; this one didn't. Result: keystrokes intended for a QA/QC recount session (or any other keyboard-driven modal) were ALSO silently recorded as live counts against whatever project/period happened to be loaded in the live counter at the time — a real, currently-loaded project's count data getting corrupted in the background while the user believed they were only doing a bounded recount.
**Root cause:** Missing active-screen guard on `document.addEventListener('keydown', ...)` in `focus.js`.
**Fix:** Added `isLiveCounterScreenActive()` (checks `#counter-screen`'s `style.display`) and an early return at the top of the keydown handler.
**Found via:** live-testing the new area-study QA/QC recount flow — typed recount keystrokes were showing up as extra live counts on whichever area-study intersection was actually loaded in the counter, corrupting its data. Root-caused by adding a temporary debug hook to inspect live vs. snapshot state side by side after each step.
**Verified live:** confirmed live counter data is untouched by recount keystrokes in both the area-study and standalone QA/QC flows, after the fix.

---

## BUG-020
**Status:** Fixed (v3.29.0-alpha.1, caught during live verification of the QA/QC area-study feature)
**Severity:** Critical
**Found in:** pre-existing (`showIntersectionAnalysis`/`serializeCurrentProject`), exposed while adding area-study QA/QC's write path
**Description:** `showIntersectionAnalysis(idx)` (and the new `showIntersectionQaqc(idx)`) reassign the shared `activeIntersectionIdx` global purely for sidebar-highlight bookkeeping when a user drills into a specific area-study intersection — neither one reloads that intersection's data into the live counter globals (`periods`/`vPairs`/`intersection` stay whatever was last loaded live, which can easily be a *different* intersection). `window.scheduleAutosave()`'s area branch (`serializeCurrentProject()`) unconditionally does `areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot()` — re-deriving from the live globals regardless of whether they actually match `activeIntersectionIdx`. Any autosave that fires after the mismatch (a leftover debounced timer from prior live counting, or a keystroke leak — see BUG-021) silently overwrites the WRONG intersection's snapshot with a different intersection's live data. Analyze never wrote anything, so this was harmless there; QA/QC does write, making it reachable and destructive.
**Root cause:** `activeIntersectionIdx` is overloaded to mean both "which intersection is loaded live in the counter" (its original meaning, e.g. in `switchIntersection()`) and "which intersection the user is currently viewing in a read-only drill-down" (the new meaning `showIntersectionAnalysis`/`showIntersectionQaqc` added) — `serializeCurrentProject()` only knows the first meaning.
**Fix:** Two-part, both scoped to the QA/QC entry points (not a broader `activeIntersectionIdx` refactor): (1) `flushPendingAutosave()` — synchronously flushes and clears any pending debounced autosave timer, called at the top of `showIntersectionAnalysis`/`showIntersectionQaqc` *before* `activeIntersectionIdx` changes, so any leftover timer fires against the still-correct index/live-state pairing instead of a stale one. (2) QA/QC's own persistence never touches `window.scheduleAutosave()`'s blind re-derivation at all — `persistAreaStudySnapshotsOnly()` flushes the `areaIntersections` array exactly as it stands (the recount already wrote directly into the correct `areaIntersections[idx].snapshot.intersectionQaqc` in place).
**Verified live:** the task's required adversarial-ordering sequence (QA/QC intersection A → recount → switch to B → confirm independent → switch back to A → confirm A's recount persisted) — reproduced the corruption before the fix (in combination with BUG-021), confirmed clean after both fixes.

---

## BUG-019
**Status:** Fixed (v3.28.0-alpha.2, caught in post-implementation audit before push)
**Severity:** Major
**Found in:** v3.28.0-alpha.1 (DOT TMC vehicle-class import), never released
**Description:** When importing a multi-sheet DOT raw-count file (e.g. separate AM and PM sheets for the same intersection) into an area-wide study, `loadTmcSheet()`'s merge path pushed the second sheet's periods directly into the already-imported intersection's snapshot with no reconciliation against the first sheet's `vPairs`. If two sheets in the same file ever reported a different vehicle-class set or order (not guaranteed by the file format, even though the one sample file checked happened to be consistent), the merged period's `tmcData` columns would silently misalign against the existing `vPairs` labels — e.g. a period's "Truck" counts could end up displayed under the "Bus" label. Wrong data shown with confidence, no error, no crash.
**Root cause:** `existing.snapshot.periods.push(...newPeriods)` assumed every sheet for the same intersection produces `tmcData` arrays in the same class order as whichever sheet was imported first — an assumption the source file format doesn't guarantee.
**Fix:** Added `reconcileTmcClasses(existingSnapshot, newSnapshot)` — before merging, extends the existing project's `vPairs` with any class the new sheet has that it doesn't yet (zero-padding every already-merged period's `tmcData` for the new column), then remaps the new sheet's periods into the existing `vPairs`' column order by label match.
**Verified live:** re-imported the real 2-sheet sample file (PM then AM); AM period showed correct, distinct per-class numbers (Car 116 + Truck 8 + Bus 6 + Bike 1 = 131, matching that interval's total exactly) under the same `vPairs` as the PM period.

---

## BUG-017
**Status:** Fixed (v3.27.0-alpha.2, caught in post-implementation audit before push)
**Severity:** Major
**Found in:** v3.27.0-alpha.1 (the analyze/charts consolidation), never released
**Description:** The workspace sidebar's "Analyze" screen (`ix-analysis-content`) rendered its section headers (Summary, Data Quality, Turning Movements, Interval Detail) but every section body was empty — no stat cards, no chart, no tables — whenever the Count screen's inline "Analysis" pane (`counter-analyze-pane`) for the same project had been visited earlier in the same session.
**Root cause:** `renderAnalyzePeriodContent()` looked up its section containers via global `document.getElementById('analyze-summary-root')` (and five sibling IDs: `analyze-qa-root`, `analyze-tmc-root`, `analyze-bike-root`, `analyze-interval-root`, `analyze-compare-root`, plus `btn-share-report`). Both `#counter-analyze-pane` and `#ix-analysis-content` build their own copy of this markup with the same ids, and both can exist in the DOM simultaneously (one hidden via `display:none` at the screen level, not removed). `getElementById` always returns the *first* matching element in document order — `#counter-analyze-pane` sits earlier in the DOM than `#ix-analysis-screen`, so once the inline pane had rendered once, every subsequent paint call for the outer Analyze screen silently wrote into the inline pane's hidden, stale copy instead of the visible one.
**Fix:** Changed every one of those lookups from `document.getElementById(...)` to `root.querySelector('#...')`, where `root` is the pane-specific container already passed into the function — scopes each lookup to the pane actually being rendered, regardless of how many copies of the markup exist elsewhere in the DOM.
**Lesson:** This is exactly the class of bug that live-testing can miss without an adversarial ordering — the implementing agent verified each of the four analyze contexts worked when tested individually, but visiting the live pane and then the workspace screen *in the same session* is what actually reproduces it. Any future reused-markup-with-fixed-ids pattern across multiple simultaneously-mounted containers should scope lookups to the container, not the document.

---

## BUG-018
**Status:** Fixed (v3.27.0-alpha.2, caught in post-implementation audit before push)
**Severity:** Minor
**Found in:** v3.27.0-alpha.1 (the analyze/charts consolidation), never released
**Description:** A read-only snapshot with zero periods would silently fall back to rendering the live counting session's data instead of an empty state. Not reproduced against any real project today (every known snapshot-creation path produces at least one period), but a malformed or hand-edited project file could trigger it, and the failure mode is the worst kind — wrong data displayed with confidence, not a visible error.
**Root cause:** `repaintContent()`'s fallback branch (`else { vehParsed = liveVehicleParsed(); ... }`) didn't check whether the current source was a read-only snapshot before falling back to live state.
**Fix:** Added an explicit `else if (src.ctx.readOnly)` branch that renders "No period data available" instead of falling through to the live-state parsers.

---

## BUG-016
**Status:** Fixed (v3.27.0-alpha.1)
**Severity:** Cosmetic
**Found in:** v3.26.0-alpha.1 (introduced by the previous session's help-caption work)
**Description:** On the Count screen, the instruction caption ("Counts are stored only in this browser tab while you work…") visually overlapped the fixed workspace sidebar in workspace mode — the sidebar rendered on top of the left ~200px of the caption's text, clipping it (e.g. "...the keyboard reference and si[obscured]update to match" in a screenshot, with "debar" hidden under the sidebar between the visible "si" and "update").
**Root cause:** The caption `<div>` sits outside `.counter-body` (the flex row that gets `margin-left:224px` in workspace mode alongside `.counter-header`/`#period-tabs-bar`/etc.), so it never got that offset and rendered full-width from x=0 underneath the fixed 224px-wide `.app-sidebar`. The caption also set its base margin via an inline `style="margin:10px 24px 0"` attribute, which no external stylesheet rule — however specific — can override; a first fix attempt that added `body.workspace-mode #counter-instructions{margin-left:224px}` to the shared selector list had no effect because of this.
**Fix:** Gave the caption an id (`#counter-instructions`), moved its base margin out of the inline `style` attribute into `src/style.css` (`#counter-instructions{margin:10px 24px 0}`), and added `body.workspace-mode #counter-instructions{margin-left:calc(224px + 24px)}` alongside the other workspace-mode offset rules. Verified live in-browser: caption text now reads in full with no overlap in workspace mode.

---

## BUG-015
**Status:** Fixed (v3.25.0-alpha.1, before ship — caught during manual testing, not by a user)
**Severity:** Minor
**Found in:** development of the intersection QA/QC recount engine (v3.25.0-alpha.1), never released
**Description:** In the new combined vehicle+ped+tmc QA/QC recount session (`src/intersectionQaqcCount.js`), a row could be assigned the physical key `z` for its in/out or count key. Pressing `z` always triggered Undo instead of recording that row's count — `wireKeydown()` checks `z`/`y` for undo/redo before consulting the row keymap, same precedence as every other counter in this app, so a row bound to `z` had a permanently unreachable key.
**Root cause:** `assignRecountKeys()`'s key pools (`IN_KEY_POOL`/`OUT_KEY_POOL`) included `z` and `y`, which are fine in per-mode pools elsewhere in the app (each mode's own key list is checked in isolation) but not in a combined-session pool that must stay clear of the two keys `wireKeydown` intercepts globally.
**Fix:** Removed `z`/`y` from both pools; also de-duplicated `-`/`=` which had been double-booked between `OUT_KEY_POOL` and `TMC_KEY_POOL`.
**Lesson:** Caught only by actually pressing every assigned key in a live browser session (via `preview_start` + simulated `keydown` events) and watching the interval table increment — reading the code alone didn't surface it, since the key assignment and the undo/redo interception live in different functions with no static check tying them together.

---

## BUG-014
**Status:** Fixed (v3.23.1-alpha.1)
**Severity:** Critical
**Found in:** v3.23.0
**Description:** App failed to load entirely — home screen and setup screen (and presumably every other screen) rendered stacked on top of each other, no navigation worked, version number appeared stuck on the previous release.
**Root cause:** The v3.23.0 single-master-list refactor removed `state.js`'s `tmcPairs` export, but `diagram.js`, `help.js`, `printReport.js`, `export.js`, and `exportXlsx.js` still had `import { tmcPairs } from './state.js'`. A missing named export fails the entire ES module graph at parse time — `main.js` never executed a single line, including `showScreen('home-screen')`, so every screen's default (non-`display:none`) CSS just stacked in document flow. A second, independent crash on the same load path: `main.js` called `renderTmcPairsList()` at module top level without importing it from `setup.js`.
**Fix:** Converted all `tmcPairs` usages in the five affected files to `vPairs.filter(p => p.includeTmc)`. Removed the four dangling `renderTmcPairsList()` calls in `main.js` (it's now a no-op alias for `renderVPairsList()` in `setup.js`).
**Lesson:** `npm run build` (or the GitHub Actions deploy) catches missing-export errors immediately — the dev server's HMR did not surface this because `read_console_messages` / the browser tool were checked before running a real build, and the error only threw inside a dynamic `import()` probe. Run `npm run build` locally before pushing any commit that removes or renames an export.

---

## BUG-001
**Status:** Fixed (v2.9.1)
**Severity:** Major
**Found in:** v2.9.0
**Description:** Export screen did not display after clicking Export button.
**Root cause:** `export-screen` was missing from the `SCREENS` array so `showScreen()` was a no-op.
**Fix:** Added `'export-screen'` to the SCREENS constant.

---

## BUG-004
**Status:** Fixed (v3.13.0)
**Severity:** Critical
**Found in:** v3.x (since per-period metadata was introduced)
**Description:** All per-period metadata (date, weather, observer, notes) was silently dropped every time an intersection count project was saved or exported as `.tcproject`.
**Root cause:** `serializeCurrentProject()` for `projectType === 'intersection'` serialized each period's `vData`, `pedData`, `tmcData` etc. but omitted `meta: p.data.meta`. The `serializeIntersectionSnapshot()` function (used for area study intersections) correctly included `meta` — only the standalone intersection path was broken.
**Fix:** Added `meta: p.data.meta || {}` to the periods map in `serializeCurrentProject()`.

---

## BUG-003
**Status:** Fixed (v3.13.0)
**Severity:** Major
**Found in:** v3.5.0 (since shareable export was added)
**Description:** `shareReport.js` referenced `periodMeta` directly at line 339 without importing it from `state.js`, causing a `ReferenceError` whenever the shareable export was generated for a session where `periodMeta.observer` was set but `projectInfo.counterName` was empty.
**Root cause:** The variable was used without being imported. In Vite's dev mode (unbundled ES modules), this throws; in production builds it may coincidentally be in scope depending on bundler behavior — not reliable.
**Fix:** The `exportShareablePage` call in `main.js` now merges all `periodMeta` fields into the `projectInfo` argument (same pattern as `openPrintReport`). `shareReport.js` now reads only from `projectInfo` and no longer references `periodMeta` directly.

---

## BUG-010
**Status:** Fixed (v3.22.1-alpha.1)
**Severity:** Major
**Found in:** v3.22.0-alpha.4
**Description:** Mode highlight (pedestrian / vehicle / TMC) in counter sidebar did not update on first click — it required clicking a second time to show the correct active state.
**Root cause:** `buildCounterSidebar()` re-renders the nav with the OLD mode active, then `setMode(m)` updates the `mode` variable but does not trigger a sidebar rebuild. The nav stays stale until the next event that calls `buildCounterSidebar()`.
**Fix:** Added `buildCounterSidebar()` call immediately after `setMode(m)` in the click handler inside `buildCounterSidebar`.

---

## BUG-011
**Status:** Fixed (v3.22.1-alpha.1)
**Severity:** Major
**Found in:** v3.22.0-alpha.4
**Description:** Individual intersection analysis (data view) showed all-zero pedestrian crosswalk tables for TMC-mode intersections. No count data was visible even though TMC data existed. Charts view also showed zero vehicle volume bars for TMC imports.
**Root cause:** `renderIxAnalysis` data view was built entirely around `pedData`. For TMC-imported intersections `pedData` is all zeros. `vTotalPerSlot` in the charts view read only `vData.in[s]` which is also zeros in TMC mode (vData is never populated for TMC imports).
**Fix:** (1) Added TMC approach totals computation and a "Turning Movement Summary" card in the data view when `tmcGrandTotal > 0`. (2) 15-min distribution table now shows TMC slot totals instead of crosswalk columns when hasTmcData. (3) `vTotalPerSlot` in charts view falls back to `tmcSlotTotals` when vData is all zero. (4) `hasModeData` now includes `tmcInfo.hasTmc`.

---

## BUG-012
**Status:** Fixed (v3.22.1-alpha.1)
**Severity:** Major
**Found in:** v3.22.0-alpha.4
**Description:** Print summary report showed only pedestrian crosswalk totals. For TMC area studies it printed useless all-zero counts.
**Root cause:** `printSummaryReport` in `printPedReport.js` only had `pedTotalForPeriod` and `pedTotal` helpers; the table always showed a single "Total Peds" column.
**Fix:** Added `vehTotal` and `tmcTotal` helpers. Report now detects which data types exist across all intersections and renders only the relevant columns (Peds, TMC Total, Vehicle Total). Title changed from "Pedestrian Count Summary" to "Count Summary".

---

## BUG-013
**Status:** Fixed (v3.22.1-alpha.3)
**Severity:** Minor
**Found in:** v3.22.1-alpha.2
**Description:** Period breakdown columns in print summary report always showed "—" for TMC intersections. Only the grand total column was correct.
**Root cause:** `byPeriod` and `periodTotals` in `printSummaryReport` used `pedTotalForPeriod` which only reads `pedData`. For TMC-imported intersections `pedData` is all zeros.
**Fix:** Added `countTotalForPeriod` helper that reads `pedData` first and falls back to `tmcData` motor counts. `byPeriod` and `periodTotals` now use this helper.

---

## BUG-002
**Status:** Fixed (v2.9.2)
**Severity:** Major
**Found in:** v2.9.0
**Description:** Back button on analyze screen returned to landing page instead of summary when in area study flow.
**Root cause:** `btn-analyze-to-landing` always called `showScreen('landing-screen')` without checking `projectType`.
**Fix:** Added `if (projectType === 'area') showSummaryScreen(); else showScreen('landing-screen')`.

---
