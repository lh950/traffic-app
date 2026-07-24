# Bug tracker

Severity levels:
- **Critical** — data loss, broken save/load, app crash
- **Major** — a workflow is broken but has a workaround
- **Minor** — wrong behavior, doesn't block use
- **Cosmetic** — visual only

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
