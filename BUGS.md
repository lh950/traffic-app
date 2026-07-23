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

## BUG-002
**Status:** Fixed (v2.9.2)
**Severity:** Major
**Found in:** v2.9.0
**Description:** Back button on analyze screen returned to landing page instead of summary when in area study flow.
**Root cause:** `btn-analyze-to-landing` always called `showScreen('landing-screen')` without checking `projectType`.
**Fix:** Added `if (projectType === 'area') showSummaryScreen(); else showScreen('landing-screen')`.

---
