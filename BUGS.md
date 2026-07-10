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

## BUG-002
**Status:** Fixed (v2.9.2)
**Severity:** Major
**Found in:** v2.9.0
**Description:** Back button on analyze screen returned to landing page instead of summary when in area study flow.
**Root cause:** `btn-analyze-to-landing` always called `showScreen('landing-screen')` without checking `projectType`.
**Fix:** Added `if (projectType === 'area') showSummaryScreen(); else showScreen('landing-screen')`.

---
