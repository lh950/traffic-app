# Development log

Key decisions, scope constraints, and architectural choices.

---

## 2026-07-25 — v3.26.0-alpha.1

**Stage 5 closes: help/instruction system.** Five sub-tasks, in order: fix the mojibake, make help contextual, add missing captions, rewrite stale help-modal content, ship a first-run walkthrough.

**Mojibake root cause, actually investigated rather than guessed at.** Reading `index.html` as raw UTF-8 bytes (Python) showed 109 occurrences of the *3-byte* UTF-8 encoding of U+FFFD (`EF BF BD`), spread across the whole file — not confined to the two blocks a prior session's memory note called out, which turned out to be an undercount, not a wrong location. `git log -S` on the FFFD byte sequence pinned the corruption's introduction to commit `01a1812` (the commit right before v3.23.0's single-master-list rewrite); diffing against the commit before that showed 72 clean em dashes and zero FFFD, confirming the file was intact until then. Since U+FFFD is a lossy, one-way replacement — the original byte was already gone by the time it hit the git history, not just mis-decoded — there was nothing to "recover," only to reconstruct from context. Cross-referenced every instance against surrounding text and against uncorrupted siblings elsewhere in the codebase (e.g. `counter.js`'s `‹`/`›` group-nav button glyphs confirmed what the mangled help-row `‹ › buttons` line should read; the QA/QC counter's intact `counter-bottom` bar confirmed the em-dash pattern for the two corrupted sibling bars). Fixed via a Python read/replace/write pass (not the `Edit` tool) per the existing memory note about this file's history of encoding trouble, then re-verified zero `�` bytes remained and none were newly introduced. Likely cause of the original corruption itself: a PowerShell `Get-Content`/`Set-Content`-style round-trip in an earlier session that didn't force UTF-8 on both ends of the pipe, silently downgrading multi-byte punctuation to the replacement character on write.

**Contextual help — chose dispatch-by-current-screen over unifying the two help UIs.** The app has two separate help surfaces: a static full-page `#help-screen` (reached only from the home screen's help button) and a tabbed `#help-modal` (reached from two header "?" buttons and, before this change, nowhere else useful). Rather than merging them or rebuilding either, `openHelp()` gained an optional `tab` argument and a shared `activateHelpTab()` helper (used by both `openHelp(tab)` and the existing `switchHelpTab(name, btn)`), and `main.js` gained `contextualHelpTab()`, a small lookup from `_currentScreen`/`mode`/`projectType` to a modal tab name. The sidebar "Help" link — present on every workspace screen, previously always routing to the static full-page guide regardless of context — now calls `openHelp(contextualHelpTab())` instead. The home screen's help button is untouched: there's no workspace context to be contextual about there, so the static full guide remains the right destination for it.

**Captions — placed at the natural top of each screen's own render path, not forced into a single shared component.** Some screens are static markup in `index.html` (setup tabs, area-setup-screen), others are built as template strings in JS render functions (`renderIxAnalysis`, `renderExportBuilder`, `renderTripGenSection`, `renderDistributionScreen`). Each caption was placed at that screen's actual top-of-content insertion point rather than trying to force one generic mechanism — e.g. the intersection Analyze/Charts caption lives inside `renderIxAnalysis()` and is therefore shared automatically with the area-study per-intersection drill-down, since `showIntersectionAnalysis()` calls the same function.

**Help-modal content rewrite — the "vehicle types" section was describing an architecture that's been gone since v3.23.0.** It still read like vehicle types and TMC types were two separate lists with independent presets and key pools. Rewrote it to describe the actual single master `vPairs` list (TMC-inclusion checkbox per row, drag-to-reorder, fixed `tmcKey`, labels/keys lock once count data exists). While rewriting, found and fixed a handful of unrelated but genuinely broken fragments in the same tabs — an empty `<strong></strong>` in the export tab's "exporting" paragraph (content had been lost, not just mis-encoded), several bare `?` characters standing in for keys or icons that no longer resolved to anything meaningful once read in context, and one stray straight-quote in the Excel-compatibility example. Added coverage for four things with zero mentions anywhere in help content before: the bug report tool, `.tcsync` cross-device sync, area studies, and QA/QC recounts — folded into the existing general/export tabs rather than adding new ones, since none of the four needed a tab of their own. Confirmed (by grep) there are no leftover warrant/LOS mentions anywhere in help content — already clean from the earlier scope-correction commits.

**First-run walkthrough — judgment call, flagged for review.** Went with the simplest variant that still satisfies the ask: a 4-step modal (`src/walkthrough.js`) reusing the existing `.modal-backdrop`/`.modal` CSS, gated by a single `tc_seen_walkthrough` localStorage flag, triggered from the real app-boot path. Note this took a second pass to find: `showHome()` looked like the obvious hook, but the actual cold-boot code path never calls `showHome()` — it calls `showScreen('home-screen')` directly at module top level and only reaches `showHome()` on subsequent back-navigation. Wired the trigger into both places so first-run and every later "back to home" are both covered by the same one-time gate. A "Take the tour" text link sits next to the home screen's existing help button for replaying it on purpose; replay doesn't touch the seen-flag gate (it's a direct `openWalkthrough()` call), so a curious repeat visitor doesn't get stuck. Verified end-to-end in a live browser: fresh load shows the walkthrough, "Get started" sets the flag and a reload doesn't reshow it, and "Take the tour" replays regardless of the flag.

---

## 2026-07-24 — v3.25.0-alpha.1

**Intersection QA/QC screen — the piece flagged as missing back in v3.24.0-alpha.2's devlog entry is now built.** Extended Trip Gen's already-shipped QA/QC pattern (`renderQaqcScreen`, `tripgenQaqc`, the shared scoring functions in `analyze.js`) to intersection-type projects, based on a traced legacy Excel workbook (`QA_QC_Lindenwood_FedEx_flatlands.xlsx`) rather than guessing: a secondary reviewer picks one of up to 4 one-hour windows (AM/Midday/PM peak + an optional Additional hour) and, within that single hour, recounts ALL active count types together — vehicle, pedestrian, TMC — never as separate per-type sessions. Per-quarter and overall pass/fail scoring reuses `qaqcThresholdPct`/`qaqcPeakHourScore`/`threePeakHourRating` completely unchanged, called per vPairs row (not grouped into 3 categories, regardless of whether the study uses FHWA precise/combined/custom vehicle types), per crosswalk, and per TMC approach.

**Deliberate deviation from the source file, reaffirmed:** the workbook's formula bands the tolerance threshold using the RECOUNT's own quarter volume; this build uses the PRIMARY count's volume instead (matches Trip Gen's already-shipped code, and is more defensible — a miscounted recount shouldn't get a looser or tighter tolerance band than the presumed-correct primary data).

**TMC scoring — a genuine v1 assumption, not a confirmed methodology.** The source file had no TMC QA/QC precedent to trace. Implemented per-approach-total scoring: every movement's every vehicle type FROM one approach leg sums into a single quarter-hour total, scored per approach (not per individual movement). Flagged both in the report UI copy and in a code comment in `main.js` (`ixRowQuarters`) as a reasonable default that may need revisiting if a documented per-movement methodology surfaces later.

**Recount engine — built standalone, not a reuse of the live counter.** The task brief's default assumption was "reuse `buildCounterUI`/`render` from `src/counter.js` in a bounded mode," matching how Trip Gen's `tgBeginRecount` reuses its own live counter. Reading `counter.js` first showed two concrete reasons that pattern doesn't transfer: (1) `render()` unconditionally calls `window.scheduleAutosave()` on every keystroke, which would re-serialize whatever scratch state is swapped into `vData`/`pedData`/`tmcData`/`vPairs`/`intersection` for the recount's duration, risking silently overwriting the real project's autosave; (2) `counter.js`'s rendering is never row-scoped — `buildVehicleTable`/`renderPed`/`renderTMC` always render the FULL matrix, not one row/crosswalk/approach at a time, so a bounded one-hour, all-modes-together recount doesn't fit its rendering functions either. Built `src/intersectionQaqcCount.js` instead, mirroring `tripgenCount.js`'s architecture (own local buffers, own tiny table + keyboard grid, never touching `state.js` globals or calling `render()`/autosave) but generalized to run vehicle + ped + tmc row-groups simultaneously in one session, since real QA/QC recounts all active types together rather than one type at a time.

**Key-conflict design decision, caught in manual testing before it shipped:** vehicle/ped/tmc keyboard keys can safely reuse the same physical keys in the LIVE counter (only one mode is ever on screen at a time), but a combined one-session recount needs every row across all three modes on a genuinely disjoint keymap. `assignRecountKeys()` in `intersectionQaqcCount.js` assigns fresh keys from shared in/out/tmc pools each time a recount begins (not the row's original vPairs/crosswalk key) — row identity for scoring purposes is the `key` field handed back in the result, not which physical key was pressed. First draft of the key pools included `z`, which collided with the hardcoded Undo binding (`wireKeydown` checks `z`/`y` for undo/redo before consulting the row keymap) — caught via a live browser smoke test (pressed every assigned key, watched the interval table increment) before commit, not just by reading the code. Fixed by excluding `z`/`y` from both pools and re-verified end-to-end (recount → fan-out → per-row score → report table) with a real key-press simulation.

**Data model:** `intersectionQaqc` keyed `${periodIdx}__${windowLabel}__${modeKey}__${rowKey}` → `{ recounts: [{id, cfg, quarters}] }`, where `quarters` is already the per-row, per-interval total (in+out combined for vehicle/ped, approach-total for tmc) — the fan-out from one combined recount session into per-row entries happens once, at finish time, so the report table never needs to re-derive per-row totals from a raw multi-row recount blob. Row identity: vPairs array index (vehicle — no `id` field exists, matches how `vData` itself is addressed), crosswalk `assign` leg letter (ped — more stable than index across reordering), approach `leg` (tmc). Persisted through save/load/autosave the same way `tripgenQaqc` already is.

**Entry/reporting kept together on one screen** (not split like Trip Gen's setup/qaqc/analyze screens) — simpler for this task's scope and didn't conflict with the existing `ix-analysis-screen` code.

---

## 2026-07-24 — v3.24.0-alpha.2

**Scope correction continued: LOS section removed, and a standing process rule.** Following the warrant-screening removal, the analyze tab's "Level of service" section (a simplified v/c-ratio LOS letter grade) was also cut — it's the same category of problem, an engineering-analysis output this app shouldn't be producing, just a softer case since it disclaimed itself as non-authoritative. Removed `losSection.js`, `levelOfService()`/`fallbackLevelOfService()` from the data layer (`analyze.js`, `dataAdapter.js`, `index.js`), its selftest coverage, and LOS-specific CSS. The generic table styling `.los-table` shared with the turning-movement breakdown table was kept and renamed `.data-table` to remove the now-stale name.

**Also identified during this pass:** the analyze tab's "Data quality" panel (gap/spike/outlier heuristics, `qa.js`) is unrelated to the QA/QC recount-verification workflow the user described as missing (a second reviewer independently re-counting a one-hour snapshot per period/intersection/count-type against the primary count, to verify data before it moves downstream). The on-screen label is already "Data quality," not "QA," so no rename was needed there — just a documentation distinction going forward: "Data quality flags" (existing, automated) vs. "QA/QC" (new, human verification, its own screen — not a section bolted onto Analyze).

**Reusable groundwork for QA/QC:** Trip Gen already implements the recount-comparison pattern (`tripgen-qaqc-screen`, `renderQaqcScreen`, a `recounts` array per peak window) and the underlying scoring functions already exist in the shared data layer: `qaqcThresholdPct`, `qaqcPeakHourScore`, `threePeakHourRating` (`src/analysis/data/analyze.js` + `index.js`). Extending an equivalent QA/QC screen to intersection counts (vehicle/ped/TMC) should reuse these rather than reinvent them.

**Standing process rule (going forward):** when a new feature or scope expansion is proposed, name where it sits in the stage order and check it against the app's purpose (data collection / top-level analysis / organizing for GIS-Excel export — not replacing engineering analysis tools) before building. At the end of each stage, do a brief re-read against the Project Brief: what shipped, where we are, and whether scope has drifted.

---

## 2026-07-24 — v3.24.0-alpha.1

**Scope correction: signal warrant screening removed.** During a project-brief review, the positioning was sharpened: this app is for data collection, top-level data analysis (peak hour, mode split, volume charts), and organizing data for export to GIS/Excel — not for building or replacing engineering analysis tools (Synchro/HCS/SIDRA) or specialized calculations like MUTCD signal warrant screening. Warrant screening had already been hidden from the analyze-tab UI since v3.22.1 ("scope TBD") but the code, its shareable-export wiring, and its CSS were all still live. Removed entirely: `src/warrant.js`, the `analyze-warrant-root` section and `renderWarrantSection` call in `main.js`, `computeShareableWarrants`/`warrantsSection` in `shareReport.js`, and the `.warrant-*` CSS blocks in both `style.css` and `shareReport.js`.

**Why this matters for future scope decisions:** the core value proposition is replacing broken, formula-corruptible Excel workflows with a UI that can't be broken the same way — not becoming a second analysis engine. Anything that duplicates a capability already served by dedicated engineering software (Synchro, HCS, SIDRA, or similar) is out of scope by default, even if it's technically easy to add. The "Before/after comparison" feature (`compare.js`) remains a similar borderline case — kept in code but explicitly unsupported since no real use case has appeared.

---

## 2026-07-24 — v3.23.0 / v3.23.1-alpha.1

**Single master vehicle/TMC list.** Replaced the two-list system (`vPairs` for directional vehicle counting, `tmcPairs` for turning movement counting) with one `vPairs` list that both modes read from. Each row now carries `tmcKey` (fixed per row, survives reordering), `includeTmc` (checkbox), and `isBike`. Drag-to-reorder is cosmetic only — keys travel with the row object, not the row's screen position. Labels lock (read-only) once `hasCountData()` is true for that project, to prevent silent data corruption from relabeling a type mid-count. `migrateVPairsFromLegacyTmc()` in `main.js` converts old project files' `tmcPairs` into the new `vPairs` shape on load.

**Analyze-mode back button fix.** Previously, clicking "Analysis" from the counter screen's secondary sidebar navigated to a separate `analyze-screen`, which hid the counting sidebar entirely — so there was no way back except browser/app back-button gymnastics. Now `window.goToAnalyzeMode()` toggles an `analyze-mode` class on `#counter-screen` (CSS: `.analyze-mode #counter-analyze-pane{display:block}` / `.analyze-mode .counter-main{display:none}`), so the same sidebar with Setup/Count/Analyze/Charts/Export stays visible and the user can click back to Count directly.

**Post-push crash (BUG-014) — process gap.** The refactor above removed `state.js`'s `tmcPairs` export, but 5 files elsewhere in the codebase still imported it by name (`diagram.js`, `help.js`, `printReport.js`, `export.js`, `exportXlsx.js`), and `main.js` called a `renderTmcPairsList()` that was never imported. Both are the kind of error `npm run build` (rolldown/vite) catches instantly via `MISSING_EXPORT` / `ReferenceError` — but the fix was verified only against the Vite dev server via the browser preview tool, whose console-message capture did not surface the failure (the import error only appeared when manually probed via a dynamic `import()` in the page). The GitHub Actions deploy failed on the first push, which is what actually surfaced the bug.

**Process change going forward:** run `npm run build` locally as a gate before pushing any commit — especially ones that remove/rename exports across multiple files. Dev-server-only verification is not sufficient for confirming the module graph is intact.

**Versioning scheme (reaffirmed):** `MAJOR.MINOR.PATCH[-alpha.BUILD]`. MINOR bumps for features (3.23.0 = master list + analyze-mode fix), PATCH bumps for bug fixes (3.23.1 = crash fix), `-alpha.N` suffix while a version is still being verified/stabilized post-push — dropped once confirmed working in the deployed app.

---

## 2026-07-24 — v3.22.1

**Full audit results (two-cycle):** Performed a complete two-cycle feature audit focusing on TMC area-wide study workflows.

**Cycle 1 fixes (alpha.1 → alpha.2):**

1. **Mode highlight** (BUG-010) — `buildCounterSidebar()` ran with the old mode before `setMode()` updated it; adding a second `buildCounterSidebar()` call after `setMode()` in the click handler is the minimal fix.

2. **ix-analysis TMC data view** (BUG-011) — the data view was 100% ped-focused. For TMC intersections, added: (a) TMC approach totals card (leg, movements per destination, total entering, peak stats); (b) 15-min distribution table switches to TMC volume column when `hasTmcData`; (c) slot count derivation now falls back to tmcData array length when pedData and vData lengths are zero; (d) charts view `vTotalPerSlot` falls back to TMC motor counts when vData sums to zero. `hasModeData` now includes `tmcInfo.hasTmc` so the mode split section shows for TMC-only intersections.

3. **Print summary ped-only** (BUG-012) — `printSummaryReport` rewritten to detect which count types (ped/tmc/vehicle) exist across the study and render only the relevant columns. Ped-only studies see an identical output; mixed or TMC-only studies get the correct columns.

4. **Counter sidebar section header** — added `<div class="sidebar-nav-header">Count mode</div>` before the mode buttons. Added `.sidebar-nav-header` CSS rule.

5. **Back navigation from ix-analysis** — for standalone intersection projects, `btn-ix-analysis-back` now shows "← Count" and calls `goToCountMode()`. For area studies it shows "← Summary" and calls `showSummaryScreen()`. Previously both buttons were hidden for standalone intersection type.

6. **Period comparison in ix-analysis (data view)** — rewrote `compHtml` to detect TMC vs ped per period and compute `compMax` before the row map so bar scaling is correct across all rows.

7. **Volume profile hidden for TMC-only** — `volumeProfileHtml` is now an empty string when `hasTmcData && grandTotal === 0`, preventing a flat zero-line chart from rendering.

**Cycle 2 fix (alpha.2 → alpha.3):**

8. **Print summary period breakdown blank for TMC** (BUG-013) — `byPeriod` and `periodTotals` used `pedTotalForPeriod` which always returns 0 for TMC intersections. Added `countTotalForPeriod` that falls back to tmcData motor counts when pedData is zero.

**Deferred (next feature pass):** summary view filter (ped/vehicle/TMC/all), customizable print headers, area study sidebar restructure, intersection ID field, period breakdown label per data type in print summary.

---

## 2026-07-23 — v3.22.0

**TMC / vehicle types coupling:** Previously the directional vehicle types (vPairs) and the TMC types (tmcPairs) were two independent lists — users had to configure classification labels twice, once for each mode, which was redundant and error-prone. The redesign makes tmcPairs labels derived from vPairs: the add dropdown is populated from the current vPairs list and syncs whenever a vPairs label changes (`_syncTmcAddSelect` called from the vPairs oninput handler). TMC rows show label and definition as read-only spans, pulled from the matching vPairs entry, so they stay in sync without user action.

**Bicycle row as a first-class action:** The old per-row "isBike" checkbox was confusing because it implied any TMC entry could be "the bicycle row" — you had to check the box on an existing row rather than adding a distinct row. The replacement is a `+ include bicycle` button that appends a dedicated bicycle row with a locked label ("Bicycle") and definition ("Cyclists"). The label lock is enforced in `renderTmcPairsList` at render time (if `p.isBike`, label is forced to "Bicycle"). The button hides after use and reappears if the bicycle row is removed.

**`_syncTmcAddSelect` window exposure bug:** The inline oninput handler on vPairs label inputs called `_syncTmcAddSelect()` which was not in the `Object.assign(window, {...})` block. In native ESM the function isn't globally accessible without that explicit assignment, so the handler would throw silently and the dropdown would show stale labels after a rename. Fixed by adding to both the import and the window assignment.

---

## 2026-07-23 — v3.21.0

**Back button strategy:** The fixed `#app-back-btn` was covering the setup tab bar in workspace mode (`left:240px; top:10px` landed right on top of the tab bar). The sidebar already has "← All Projects" which is the canonical navigation for workspace mode, so hiding `#app-back-btn` there entirely is the right call. For non-workspace screens, moved it to `bottom:24px; left:16px` — out of the way of all screen headers. The help screen has its own inline back button and doesn't need the fixed one.

**Trip gen setup tabs:** Restructured the single-scroll tripgen-setup-screen into two panels (project info / locations) using `.tg-tabs` / `.tg-tab` / `.tg-panel` classes with a scoped `switchTgTab()` function. Couldn't reuse `switchSetupTab()` from setup.js because it queries all `.setup-tab` / `.setup-panel` globally — that would conflict with the intersection setup tabs. The scoped approach keeps them independent.

**`parkingZones` TDZ:** `let parkingZones` was declared at line 269 of main.js but referenced in `Object.assign(window, {...})` at line 144. In native ESM (Vite dev server), this is a temporal dead zone error that kills the entire module. In the production bundle, Vite transforms `let`→`var` which is hoisted and avoids TDZ, so the deployed app was fine. Fixed by assigning `window.parkingZones = parkingZones` immediately after the declaration instead of including it in the early Object.assign block.

**Parking study hidden:** The parking study feature (setup screen, counter, summary, export) is fully implemented but the UX isn't fully thought through. Hidden from the home screen via HTML comment while the design is revisited. Code stays in place.

**Next design task (v3.22.0):** Vehicle types and TMC types should share the same type list. Currently they're two independently configured lists in the merged "counting types" tab. The planned change: TMC type labels become dropdowns populated from the vehicle types (vPairs) list, so the user selects which vehicle types to include in TMC rather than re-typing labels. The per-row "mark as bicycle" checkbox is replaced by a single "+ include bicycle" button that appends a dedicated bicycle row. This eliminates the confusion of configuring the same classification list twice in different modes.

---

## 2026-07-23 — v3.19.0

**Parking study architecture:** Chose an occupancy-sweep model (enter total occupancy per zone per time slot) rather than a turnover key-press model. Rationale: field workers conducting parking surveys walk through lots and record totals per zone per interval — they don't press a key per vehicle. Data structure is a sparse grid `{slotIdx: {zoneId: count}}`. One-slot-at-a-time UI is deliberate — reduces screen complexity and works well on tablets in the field. Undo is per-action on the grid (not undo-all), giving field workers a safety net against fat-finger entries.

**Parking inline handler exposure:** ES module scope doesn't auto-expose functions to `window`, but the parking setup HTML uses inline `oninput` handlers that reference `parkingZones[i]`, `renderParkingSetupZones()`, `pkSetOcc()`, and `renderParkingOccBadge()`. These are added to the `Object.assign(window, {...})` block alongside other function exports.

**Data privacy / security explanation:** localStorage is scoped per-origin per-browser per-device — no cross-user contamination without explicit data transfer. Added this as a note on the home screen and as a full section in the help page, including guidance that the `.tcproject` / `.tcsync` export format is the correct mechanism for moving data between users or devices.

**Help screen placement:** Added as a dedicated screen in the SCREENS array rather than a modal/overlay, so the back button handles dismissal naturally and it participates in the nav history stack like any other screen. Accessible from the home "?" button and sidebar Help items in every workspace type.

**Keybinding groups UX:** The counter already handled >4 vehicle types correctly (via ‹ › group switching), but the setup UI gave no indication that adding a 5th type would reuse keys from a second group. Added a notice banner and Group 1/2 separators in `renderVPairsList()` triggered by `vPairs.length > 4`. The separators are cosmetic — the actual grouping logic (`gi = index % 4`) lives in `counter.js` and is unchanged.

**Bicycle label lock:** Enforced at render time in `renderTmcPairsList()` — when `p.isBike`, the label is set to "Bicycle" (overwriting whatever was there) and the input gets `readonly` + `.bike-label-locked` styling. The checkbox `onchange` also calls `renderTmcPairsList()` to immediately apply the lock when the box is checked. This prevents TMC bicycle data being filed under arbitrary labels, which would break any downstream per-class export logic.

---

## 2026-07-23 — v3.18.0

**In-app back navigation:** Implemented a `_navHistory` stack in `main.js` rather than wiring the browser History API (`pushState`/`popstate`). Reason: pushState in a single-page app without a router creates a confusing loop where the browser back button can undermine workspace state. The in-app button is predictable, visible, and doesn't interfere with the browser's own back/forward for page-level navigation. History is capped at 30 and clears on home.

**XLSX import auto-navigation:** Root cause of "no data visible" bug was UX, not parsing — `loadTmcSheet` and `loadRawCountSheet` were calling `showAreaSetup()` (the hub list), leaving users on a screen with no obvious next step. Fixed by calling `loadIntersectionIntoView(snapshot)` directly after setting up workspace, matching the flow for area-study intersections.

**NYC branding removed:** All user-facing and code-level references to "NYC DOT" and "NYC Zola" genericized. The XLSX parsers work with any standard TMC/pedestrian template; the branding was an artifact of the initial template source.

---

## 2026-07-08 — v3 strategic scope

**Positioning:** Browser-based platform for collecting, organizing, validating, and communicating traffic count data. Covers the workflow before and around technical analysis engines (Synchro, HCS), not inside them.

**Explicitly out of scope:**
- LOS / HCM analysis (Synchro, HCS, SIDRA own this)
- Signal timing optimization
- Traffic simulation
- Crash data analysis
- Speed measurement from automated equipment
- AI/automated counting (Miovision, Streetlight)
- Travel demand modeling

**Core market gap:** Replacing broken Excel-based workflows for count data organization, QA, warrant screening, and public communication. Not competing with validated engineering analysis tools.

---

## 2026-07-08 — UI architecture

**Decision:** Replace linear screen-stacking wizard with persistent sidebar + workspace model.

- Home screen = project portfolio (cards)
- Inside a project: left sidebar always visible with intersection list and study-level nav
- Intersection detail = tabs (Setup | Count | Analyze | Charts) in the right panel
- No more back buttons for navigation — sidebar handles all routing
- Desktop-first; mobile deliberately deferred

**Single intersection projects:** Same sidebar structure, one intersection in the list. Consistent UX across project types.

**Trip Gen:** Different sidebar (land uses, not intersections). Tabs: Setup | ITE rates | Distribution | Summary | Export. Distribution tab is new — allocates generated trips as percentages to nearby intersections. Optional link to an area study for before/build volume overlay.

---

## 2026-07-08 — Stage 1 scope

First deliverable milestone — makes the tool produce something a firm can hand to a client:

1. Turning movement diagram (SVG, auto-generated from TMC data)
2. Time-of-day volume chart (vehicles + peds by interval)
3. Mode split summary (vehicles vs. pedestrians %)
4. Print-ready count summary sheet

All built on existing data — no new collection types needed for Stage 1.

---

## 2026-07-08 — Stage 2 scope (planned)

1. AI-assisted CSV/XLSX import (Claude API for column mapping, confirmed by user before import runs)
2. Saved import templates (vendor format library)
3. Count QA/validation layer
4. Bicycle count type
5. Study metadata capture (weather, observer, equipment)

---

## 2026-07-23 — v3.17.0 PWA + GitHub Pages

**Distribution model:** hosted at `https://lh950.github.io/traffic-app/`. Users visit the URL in Chrome/Edge; after first load the service worker caches all assets and the app works offline permanently. The "Install" button in the URL bar installs to the user's profile (no admin needed) — shows up in Start/taskbar as a standalone window.

**Service worker strategy:** stale-while-revalidate — return cache immediately (fast + offline), refresh in background when network is available. External origins (Claude API at `api.anthropic.com`) are excluded from the SW fetch handler so they always go straight to the network. Cache keyed by version string (`traffic-app-v3.17`) — increment on major deploys to force a cache refresh.

**GitHub Actions:** single job — checkout → `npm ci` → `npm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`. Triggers on push to `master` and `workflow_dispatch`. Source must be set to "GitHub Actions" in repo Settings > Pages before first deploy.

**`base: './'` preserved:** relative asset paths work on GitHub Pages (`./assets/...` resolves to the subdirectory), and still work for local file:// or localhost serving. No env-specific build config needed.

---

## 2026-07-23 — v3.16.0 Cross-device sync

**`.tcsync` format:** `{version: 1, exportedAt: ISO, projects: [...full project JSONs]}`. Export walks `tc_projects_index`, loads each `tc_project_${uuid}` key, bundles all into one JSON blob. Import reads the array, skips UUIDs already in localStorage (merge-by-UUID, no overwrites), writes new ones with `upsertProjectIndex`. No conflict UI needed in practice — field offices export before going to the field, office imports after. Same pattern as `.tcproject` but multi-project. Works in any browser without a server.

---

## 2026-07-23 — v3.15.0 Project export package

**Export panel architecture:** `renderExportBuilder()` branches on `projectType === 'intersection'` to render a simple 4-button panel instead of the area-study CSV builder. The panel wires to `exportCSV()`, `exportXLSX()`, `exportShareablePage()` (existing), and the new `exportProjectPackage()`.

**Blob extraction pattern:** Three parallel refactors — `getCSVText()` in `export.js` returns `[{text, filename}]` (array to handle motor+bike split), `getXLSXBlob()` in `exportXlsx.js` returns `{blob, filename}`, `buildShareableHTML()` in `shareReport.js` returns `{html, filename}`. All existing download-trigger functions are thin wrappers over these. `exportProjectPackage()` uses JSZip to bundle all outputs with the project JSON into a single `.zip` download; no server required.

**Empty-periods bug:** Autosave during setup (before first count) produces `periods: []`. `loadProject` now guards with `periods.length > 0` before indexing, falling through to `setActivePeriodIdx(0)` as a safe no-op.

---

## 2026-07-23 — v3.14.0 Trip Gen distribution tab

**Distribution screen architecture:** New sidebar item "tg-distribution" → `tripgen-distribution-screen`. State lives in `tripgenDistribution[]` ({id, name, allocs: {[dayType__peakLabel]: {pctIn, pctOut}}}). `computePeakVolumes(entries, peakWindows)` was extracted as a named export from `tripgenSection.js` — it reuses the existing private `resolvePeak` / `inferIntervalMinutes` functions and sums across all entries for each day type × peak window combo. The distribution screen is fully re-rendered on every change (same pattern as QA/QC). Serialized under `distribution` key in the tripgen project payload; restored in `loadProject()`; cleared in the `btn-new-tripgen` handler.

---

## 2026-07-22 — v3.13.0 implementation decisions

**Per-period metadata architecture (equipment field):**
`periodMeta` in `state.js` is the live per-period object; `captureActivePeriod()` snapshots it into `{meta:{...periodMeta}}`. Added `equipment` field alongside date/weather/observer/notes. Print report and shareable export receive all periodMeta fields via the `openPrintReport({...projectInfo, equipment: periodMeta.equipment, ...})` merge pattern in `main.js` — shareReport.js is now a pure function (no direct state imports).

**Import templates:**
Stored in `tc_import_templates` (localStorage). Template key = sorted array of all CSV headers (column signature). Exact-match detection runs before local regex detection and Claude AI, so repeat imports of the same vendor format skip the detection step entirely. Template management UI lives in the import screen — no separate settings page needed.

**UUID + per-project storage:**
UUID assigned in `enterWorkspace()` (new projects) or restored from `proj.uuid` in `loadProject()`. Cleared in `exitWorkspace()` so returning to home always gives the next project a fresh UUID. Autosave dual-writes: `LS_KEY` (single slot for resume banner) + `tc_project_${uuid}` (per-project key). `tc_projects_index` stores metadata only — full JSON lives in the per-project key. Legacy `tc_recents` entries (no UUID) still display on the home screen; they're filtered out if an index entry with the same UUID exists.

**Before/after comparison:**
`compare.js` is fully implemented. Not being promoted in the UI per user direction — the section remains in the analyze tab but is not surfaced in navigation or documentation.

---

## 2026-07-08 — Stage 3 scope (planned)

1. Signal warrant analysis (MUTCD Warrants 1, 2, 3)
2. Before/after comparison mode
3. Corridor volume chart
4. Project portfolio persistence (IndexedDB or cloud)
5. Shareable public study page (view-only link)
