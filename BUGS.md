# Bug tracker

Severity levels:
- **Critical** — data loss, broken save/load, app crash
- **Major** — a workflow is broken but has a workaround
- **Minor** — wrong behavior, doesn't block use
- **Cosmetic** — visual only

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
