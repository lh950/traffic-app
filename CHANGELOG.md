# Changelog

## v3.18.0 — 2026-07-23

### Added
- **In-app back button** — fixed-position "← Back" button appears whenever navigating away from the home screen. Tracks a history stack (capped at 30 entries) and returns to the previous screen without touching browser navigation. Clears automatically when returning home.
- **Bug report / state export** — "Report a bug / export app state" button at the bottom of the home screen. Clicking it downloads a timestamped JSON snapshot of all localStorage data, current screen, nav history, and app version for easy debugging.
- **"Project info" in area sidebar** — imported projects now show a "Project info" entry at the top of the Study section in the workspace sidebar, allowing users to reach the project metadata editor at any time.

### Fixed
- **TMC/raw count import auto-navigation** — after importing a TMC or pedestrian count XLSX, the app now navigates directly into the intersection counter view instead of landing on the area hub (where the imported data was not visible).

### Changed
- Removed all references to NYC city government data — TMC importer now described as "Standard TMC format"; error messages and code comments genericized accordingly.
- "NYC Zola PDF" label in Trip Gen renamed to "Zoning reference PDF."

---

## v3.17.0 — 2026-07-23

### Added
- **PWA / installable web app** — `manifest.json` + `sw.js` added to the build. When hosted (GitHub Pages), Chrome/Edge shows an "Install" button in the URL bar; one click installs the app to the user's profile without admin rights. Installed app opens as a standalone window from taskbar/Start menu. Service worker caches all assets after first load — fully offline after first visit. Cache named `traffic-app-v3.17` so bumping the cache name on future deploys triggers a transparent update.
- **GitHub Actions deploy workflow** — `.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages on every push to `master`. No manual build step needed after initial setup.

---

## v3.16.0 — 2026-07-23

### Added
- **Cross-device sync** — "Cross-device sync" section on the home screen with two buttons. "Export all projects…" bundles every UUID-keyed project from localStorage into a single `.tcsync` file (JSON with version tag and ISO timestamp). "Import projects…" reads a `.tcsync` file and merges projects by UUID — projects whose UUID already exists in the current device are skipped; new ones are written and added to the project index. Status line below the buttons confirms count imported or exported. Works fully offline with no server or account.

---

## v3.15.0 — 2026-07-23

### Added
- **Project export package** — Study → Export sidebar item on intersection projects now shows a dedicated export panel with four buttons: CSV, XLSX, shareable HTML page, and "Export project package (.zip)". The ZIP contains all three export files plus a `.tcproject.json` for re-import. Built using JSZip; no server needed. The shareable HTML in the package is built from the active period's data at export time.

### Fixed
- **Resume crash on empty-periods autosave** — `loadProject` now handles the case where `proj.periods` is an empty array (which occurs when a project is autosaved during setup before the first count starts). Previously crashed with `Cannot read properties of undefined (reading 'data')`; now falls back gracefully and opens the counter screen.

---

## v3.14.0 — 2026-07-23

### Added
- **Trip Gen distribution tab** — fourth sidebar item on Trip Gen projects. After adding locations and running analysis, the Distribution screen lets you define nearby intersections and enter % inbound / % outbound allocation per peak period. Auto-computes generated trips per intersection from peak hour volumes; shows an "Unallocated" row for any remainder. Allocation state serialized with project and restored on load. Requires at least one location to be present (guard message otherwise). `computePeakVolumes()` extracted as a named export from `tripgenSection.js`.

---

## v3.13.0 — 2026-07-22

### Added
- **Per-period equipment field** — `periodMeta` now includes an `equipment` field (e.g. "manual", "TDC", "Miovision"). Shown in the counter meta bar between Observer and Notes. Flows through to print report and shareable export.
- **Import templates** — after a successful CSV column mapping (auto-detected or AI), a "Save mapping as template" row appears on the preview step. Templates are stored in `tc_import_templates` (localStorage). On next import of the same file format (identical column headers), the saved template is applied instantly, skipping detection and AI entirely. A "Saved templates" panel with per-template delete appears at the top of the import screen when templates exist.
- **Project UUID + per-project storage** — new projects are assigned a `crypto.randomUUID()` identifier on entry to the workspace. Autosave now writes to both the single `LS_KEY` slot (for the resume banner) and a per-project `tc_project_<uuid>` key. A lightweight `tc_projects_index` tracks metadata only (uuid, name, type, savedAt) — no embedded full JSON.
- **Improved home screen portfolio** — "Projects" section on the home screen loads from `tc_projects_index` and per-project keys. Each entry has a real Delete button that removes the project data from localStorage. Legacy `tc_recents` entries (from before UUIDs) continue to show with a remove-from-list button.
- **Autosave state indicator** — sidebar header shows "Saving…" while the 2-second autosave timer is pending and "Saved" briefly after it completes.

### Fixed
- **Period metadata not serialized** — `serializeCurrentProject()` for `intersection` type was silently dropping all period-level metadata (date, weather, observer, notes) on every save/export. `meta: p.data.meta || {}` is now included in each period's serialized object. This was a data-loss bug present since per-period metadata was added.
- **`periodMeta.observer` referenced without import in `shareReport.js`** — the shareable export used `periodMeta` directly without importing it from `state.js`. Now the `exportShareablePage` call in `main.js` merges all `periodMeta` fields into `projectInfo` before passing it to `shareReport.js`, making `shareReport.js` a pure function.

---

## v3.12.0 — 2026-07-21

### Added
- **Standard TMC XLSX import** — the XLSX import button (landing screen and area-study import) now auto-detects standard Turning Movement Count files (identified by "Turning movement" in the count-type metadata row). Detected files are parsed through a new `parseDotTmcXlsx` parser that reads 4 approaches × 3 movements = 12 direction columns, with 6 rows per interval (Car, Truck, Bus, Bike, blank, blank). Motor vehicles (Car + Truck + Bus) are summed into a single Motor type; Bike is kept separate if the file's Bike flag is Y. Multiple time blocks within a sheet become separate periods. The imported intersection loads with `mode: turning`, a standard 4-leg approach layout (N/W/S/E), and TMC data ready for analysis. Existing pedestrian XLSX import is unchanged — if TMC detection fails, the file falls through to the ped parser.

---

## v3.11.1 — 2026-07-21

### Fixed
- **Sidebar layout** — workspace screens no longer overlap with the sidebar. The CSS rule was using `padding-left` which inline `style="padding:..."` on every screen silently overrode; switched to `margin-left` which isn't affected by inline padding. Also added the `workspace-screen` class to `analyze-screen` and `tripgen-qaqc-screen` which were missing it.

---

## v3.11.0 — 2026-07-21

### Added
- **Signal warrant summary in shareable export** — the self-contained HTML export now includes a compact warrant screening section (Warrants 1–4) below the pedestrian counts. Uses the same HCM defaults as the interactive warrant tab (urban area type, 1 lane each approach, N/S as major street). Each warrant shows a MEETS / Does not meet / No data badge. Includes a disclaimer that this is screening only, not a formal engineering study.

---

## v3.10.0 — 2026-07-21

### Added
- **Project recents list** — up to 8 recent projects shown on the home screen above "Open existing." Populated automatically on autosave, explicit save, and project file load. Each card shows name, type, and time-ago. × button removes individual entries. Section hides when empty.
- **TMD in shareable page** — turning movement diagram SVG now included at the top of the self-contained HTML export, before the volume chart. Peak hour computed from the 4 best consecutive 15-min intervals. Works with dark/light themes in standalone page via CSS variable definitions.
- **Intersection drill-down from corridor chart** — intersection name labels in the area study corridor chart are now clickable links that navigate directly to that intersection's Analyze/Charts view (`showIntersectionAnalysis`). Styled with accent color + underline.

---

## v3.9.0 — 2026-07-21

### Added
- **Intersection / site address field** (`data-pi="location"`) in project info tab — single text input for the street address or intersection name; feeds into analyze screen sub-title, comparison label, and print report sub-line. Also fixes two broken references (`projectInfo?.location` at analyze subtitle and compare label) that were silently `undefined` before
- **Count date field** (`data-pi="countDate"`) in project info tab — date picker; formatted as "Jul 21, 2026" in the print report meta row using local-date constructor to avoid timezone off-by-one

### Fixed
- Export tab: TMC filename row was using counter-settings classes (`cfg-field` / `cfg-label`) instead of setup classes (`setup-field` / plain `<label>`) — now consistent with vehicle and pedestrian rows
- Period planner preset buttons no longer add duplicate periods — `addPlannedPeriod()` now guards on name match before pushing

---

## v3.8.0 — 2026-07-21

### Added
- Per-period timing: when periods are defined in the period planner, each period's start/end times are applied to `cfg` via `applyPlannedTiming()` before that period's data snapshot is captured at count start — so each period carries its own time range in its stored `cfg`
- Timing card note: a contextual note appears in the Setup timing card when period planner entries exist, explaining that start time and duration are controlled per-period by the planner
- `plannedPeriods` persisted in autosave: the period planner array is now serialized in `serializeCurrentProject()` and restored in `loadProject()` so planned periods survive reload
- Time range inline on counter period tabs: each period tab in the counter shows the period's time range (e.g. `07:00–09:00`) in the tab title attribute
- Time range inline on analyze period tabs: period picker tabs in both analyze paths now show the time range below the period name
  - Non-workspace path (`renderIntersectionAnalysis` / `buildPeriodBar`): `.apb-tab` flex-column with `.apb-tab-name` + `.apb-tab-time`
  - Workspace path (`renderIxAnalysis`): `.ix-period-tab` flex-column with `.ixt-time` span

---

## v3.7.0 — 2026-07-21

### Fixed
- `startCounting()` now routes through `openWorkspaceTab('count')` when already in workspace mode instead of directly toggling display styles, so the sidebar active state stays in sync
- `goSetup()` now routes through `openWorkspaceTab('setup')` in workspace mode (counter "setup" button and sidebar "Setup" item both go to the same place)
- Setup screen header ("traffic counter setup") no longer appears in workspace mode — hidden via `body.workspace-mode .setup-header`
- Counter header "← Project" and "setup" buttons hidden in workspace mode (sidebar provides equivalent navigation)
- `'landing-screen'` removed from SCREENS array — it was legacy HTML that was never navigated to, causing `showScreen()` to iterate over it needlessly

### Added
- Period planner card in Setup → Study Parameters — define named count periods (AM Peak, Midday, PM Peak, etc.) with time ranges before counting starts; periods are applied automatically when "start counting →" is clicked; custom period entry with name and start/end time fields

---

## v3.6.0 — 2026-07-10

### Added
- Multi-period analyze: workspace Analyze/Charts tabs now work for intersection count projects (previously showed "No period data available")
- Period tabs in the analyze screen show all defined periods; clicking switches the view to that period's data without disturbing the active counting period
- Period Comparison table auto-appears in the analyze Data view when 2+ periods exist
- Inline period naming: clicking `+ period` now shows a keyboard-friendly inline input instead of a browser `prompt()` dialog; double-clicking an existing period tab renames it inline

### Fixed
- `← Summary` and `Open in counter →` buttons hidden correctly when viewing intersection count project in analyze screen; restored when viewing area study intersections

---

## v3.5.0 — 2026-07-10

### Added
- Shareable study page export (Stage 3 Step 4) — "↓ Export page" button in the analyze tab bar generates a self-contained HTML file with all charts and tables

---

## v3.3.0 — 2026-07-09

### Changed
- Applied Palette 1 "Ink & Amber" design theme throughout the app
- Sidebar redesigned to dark ink background (`#131b23`) with amber active-item highlight
- Accent color system replaced: blue (`#185fa5`) → amber (`#ffb400` for buttons, `#A05C10` for text/borders)
- Base palette warmed: off-white background (`#F5F3F0`), warm taupe text stack, warm gray borders
- Primary button now uses bright amber fill with dark ink text for better contrast
- All hardcoded blue rgba values in TMC table column highlights updated to amber

---

## v3.2.0 — 2026-07-08

### Added
- AI-assisted CSV import (Stage 2, item 1) — upload any turning movement count CSV and Claude maps columns to the standard NBL/NBT/.../WBR format automatically
- Import CSV sidebar item in area study (under Study section)
- Import CSV button in "Add intersection" card on area setup screen
- API key stored in localStorage (`traffic-app-claude-api-key`) — entered once, reused across sessions
- Column mapping preview table and count data preview before confirming import
- Spinner and loading state during Claude API call

---

## v3.1.0 — 2026-07-08

### Added
- Persistent sidebar navigation replaces all legacy back/forward buttons in workspace mode
- Scaled TMD toggle on Charts tab — switches line weights between uniform and volume-proportional
- Home screen resume banner shows project name and time since last autosave

### Fixed
- `period.cfg` null guard in `renderIxAnalysis` — no longer throws on snapshots with missing cfg
- `cfg.startMinutes` defaults to 0 when absent (same guard)

---

## v3.0.0 — 2026-07-08

### Breaking changes
- Complete UI redesign: sidebar + workspace model replaces linear screen-stacking wizard
- Project schema version field added; migration layer runs on all project loads
- Source code modularized from single main.js into focused modules

### Added
- Project portfolio home screen — all studies listed as cards, new project from one place
- Persistent sidebar navigation — intersections list, study-level views (Summary, Charts, Import, Export, Warrants), back to all projects
- Intersection detail tabs: Setup | Count | Analyze | Charts — no more screen-to-screen navigation
- Stage 1 — Charts tab on analyze screen:
  - Turning movement diagram (SVG, auto-generated from TMC data)
  - Time-of-day volume chart (vehicles and peds by 15-min interval)
  - Mode split summary (vehicles vs. pedestrians)
- Trip Gen v2: land uses sidebar, Distribution tab (allocate generated trips to nearby intersections), optional link to area study for before/build volume comparison
- Client-side error logging (rolling buffer in localStorage, debug panel)
- Schema migration layer (migrateProject function, schemaVersion field on all projects)
- BUGS.md — structured bug tracker
- DEVLOG.md — decision log

### Inherited from v2.9.2
- Vehicle, pedestrian, and TMC count collection with 15-min intervals
- Peak hour identification and PHF calculation
- Area study with multi-intersection management and corridor grouping
- Trip generation (ITE-based)
- Export builder with summary and GIS-format CSV
- Project save/load with autosave
- Lat/lng fields per intersection
- All Data view in summary (long format)
