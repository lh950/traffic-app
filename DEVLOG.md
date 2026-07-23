# Development log

Key decisions, scope constraints, and architectural choices.

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
