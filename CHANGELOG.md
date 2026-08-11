# Changelog

## v3.31.0-alpha.1 — 2026-08-11

### Added
- **Stacked bar chart — vehicle volume by class, switchable between four groupings** — new, additive alongside the existing "volume by interval" chart (`analysis/ui/summary.js`, in/out totals only, unchanged). Lives in a new "Volume by vehicle class" section on the single-intersection Analyze screen (`renderVehicleClassStackedSection()` in `main.js`), with a toolbar to switch the x-axis grouping: 15-min interval, hourly rollup, day (for multi-day studies, grouped by each period's `meta.date`), and study period (one bar per AM Peak / Midday Peak / PM Peak / etc). Every grouping matches vehicle classes BY LABEL, not array position, same discipline as `aggregateVehicleClassTotals()` — periods/files with different `vPairs` sets combine correctly instead of silently misaligning (BUG-019/BUG-020 territory). New `renderStackedBarChart()` added to `analysis/ui/charts.js` alongside the existing bar/grouped-bar/multi-series-bar chart helpers, sharing their color palette and CSS classes.
- **Study-wide Aggregate view gets a matching stacked-by-intersection chart** — "Vehicle volume by intersection" card, one bar per intersection stacked by vehicle class, using a new `aggregateVehicleClassTotalsByIntersection()` (same by-label aggregation as `aggregateVehicleClassTotals()`, just kept per-intersection instead of collapsed into study-wide totals).

## v3.30.0-alpha.1 — 2026-07-27

### Added
- **Study-wide Aggregate view for area studies** — a new "Aggregate" sidebar item alongside Summary, combining every intersection's data into one read-only screen: stat cards (intersections, total vehicle/pedestrian/TMC volume, data completeness, QA/QC coverage), a vehicle-class breakdown table aggregated by class LABEL across intersections (not array position — different intersections/imported files can carry different `vPairs` sets), and a per-intersection data-quality table (periods, total volume, QA/QC pass/fail/incomplete status) with "review →" / "QA/QC →" buttons reusing the existing `showIntersectionAnalysis()` / `showIntersectionQaqc()` drill-down entry points. Mirrors the single-intersection Analyze screen's `.stat-card` / `.card-grid` visual language (already defined in `analysis/style.css`, not a new class system). Async render path (QA/QC coverage scoring awaits per existing recount) is generation-counter-guarded the same way `renderIntersectionQaqcScreen()` is (BUG-022's fix), verified live with an adversarial rapid-re-trigger test.

## v3.29.0-alpha.2 — 2026-07-27

### Fixed
- **Rapidly switching an area-study intersection's QA/QC screen (or finishing a recount, which re-renders it) could show the WRONG intersection's data (BUG-022)** — found during an independent audit of the QA/QC area-study feature, beyond the adversarial sequence already tested for BUG-020/021. `renderIntersectionQaqcScreen()` is async and had no guard against two overlapping calls racing on the same DOM container; a slower-resolving stale render could overwrite a faster, newer one. Added a generation counter so a superseded render silently no-ops instead of writing.

## v3.29.0-alpha.1 — 2026-07-27

### Added
- **QA/QC recounts reach area-study intersections, not just standalone intersection projects** — closes the feature-parity gap flagged after the Analyze screen consolidation. Every area-study intersection now has its own `intersectionQaqc` store on its snapshot (independent of the standalone-project-only live `intersectionQaqc` global), reachable via a new `showIntersectionQaqc(idx)` entry point (a "QA/QC →" button next to "Open in counter" on the intersection-detail Analyze screen, and a "QA/QC →" button per row on the area-study Summary table). `ixQaqcSource(snapshotCtx)` mirrors `analysisSource()`'s shape but adds a `qaqcStore` + `persist()`, since QA/QC — unlike Analyze — has to write new recount data back, not just read it.

### Fixed
- **QA/QC recounts against a non-active area-study intersection could silently corrupt a DIFFERENT intersection's snapshot (BUG-020)** — see BUGS.md. Two compounding causes: `showIntersectionAnalysis`/`showIntersectionQaqc` reassign `activeIntersectionIdx` without reloading that intersection's data into the live counter, and a leftover debounced `window.scheduleAutosave()` timer (or a stray keystroke — see BUG-021) could later re-serialize a mismatched live state into the wrong `areaIntersections[idx].snapshot`.
- **Any keydown, anywhere in the app, also fed into the live intersection counter in the background (BUG-021)** — `focus.js`'s `wireKeydown()` had no active-screen guard at all, unlike every other keyboard-driven module (QA/QC recount, trip-gen recount). Keystrokes meant for a QA/QC recount session (or any other keyboard-driven modal) were silently also recorded as live counts. Found while verifying QA/QC's area-study write path; fixes the same latent risk for the standalone QA/QC flow.

## v3.28.0-alpha.2 — 2026-07-27

### Fixed
- **Merging multiple DOT TMC sheets into one area-study intersection could silently misalign vehicle classes (BUG-019)** — if two sheets for the same intersection (e.g. AM and PM) ever reported vehicle classes in a different set or order, the merged period's data would display under the wrong class label with no error. Added `reconcileTmcClasses()` to align a newly-merged sheet's classes against the project's existing `vPairs` (extending it and zero-padding prior periods as needed) before merging, instead of assuming positional consistency.

## v3.28.0-alpha.1 — 2026-07-27

### Added
- **DOT raw-count TMC import now preserves the source file's exact vehicle classes** — previously `parseDotTmcXlsx.js` collapsed every non-bike class (Car/Truck/Bus/etc.) into a single "Motor" bucket, discarding the class-level breakdown that's already sitting in the raw file's `Class` column. The parser now accumulates a dynamic per-class map per interval (`byClass`), tracks the sheet's distinct class names in first-seen order (`classNames`), and sizes `tmcData` slots to match. `tmcSheetToSnapshot()` in `main.js` builds one `vPairs` row per class the file actually contains (e.g. Car/Truck/Bus/Bike), with sequential `tmcKey` letter assignment, instead of hardcoding "Motor"/"Bicycle" labels. Each imported file's own class set drives its own project — no reconciliation across files in a batch.
- **Interval Detail rows for turning-movement data are now click-to-expand** — each interval row in the TMC "Interval detail" table can be expanded to reveal a per-vehicle-class x per-approach breakdown table (with row and column totals), instead of showing only a single collapsed "Total entering" figure. Works identically for live-counted and imported DOT TMC data since both share the same `tmcParsed` shape.

## v3.27.0-alpha.2 — 2026-07-25

### Fixed
- **Workspace Analyze screen rendered empty section bodies (BUG-017)** — after visiting the Count screen's inline Analysis pane, the workspace sidebar's Analyze screen for the same project would show section headers with nothing inside them. Both panes built markup with the same element ids, and global `document.getElementById()` always resolved to the first (hidden, stale) copy. Every lookup in `renderAnalyzePeriodContent()` now scopes to its own pane's container instead.
- **Read-only snapshot with zero periods could show live-session data (BUG-018)** — an edge case, not reachable via any real project today, but a lossy failure mode if it were. Now shows "No period data available" instead of falling back to live state.
- Removed ~285 lines of dead code left behind by the v3.27.0-alpha.1 consolidation (`snapshotTmcPeakHour`, `renderTMDiagram`, `renderTimeOfDayChart`, `renderModeSplit` — zero call sites, confirmed before removal).

## v3.27.0-alpha.1 — 2026-07-25

### Changed
- **Unified the two "view analysis for an intersection" screens** — `renderIntersectionAnalysis()` (live-state, stat-cards-first design) and the workspace sidebar's `renderIxAnalysis()` (snapshot-based, table-first design) had drifted into visually inconsistent screens reached from different places. Consolidated onto one rendering path, reused across all four contexts: the standalone `#analyze-screen`, the inline Count-screen "Analyze" pane, the workspace sidebar Analyze/Charts screen for a standalone intersection project, and the same screen for an area-study child intersection.
  - `renderIntersectionAnalysis(containerEl, snapshotCtx)` now takes an optional read-only snapshot context (`{ periods, intersection, vPairs }`); a new `analysisSource()` resolves either that snapshot or the live global counting state into one common shape, so `parsedFromPeriod()`, `renderAnalyzePeriodContent()`, and `renderAllPeriodsView()` no longer duplicate logic per source.
  - `showIntersectionAnalysis()` (the area-study corridor-chart drill-down entry point) now routes through the same renderer with a snapshot context built from `areaIntersections[idx].snapshot`; a standalone intersection project's workspace-sidebar Analyze screen renders live state directly instead of round-tripping through `serializeIntersectionSnapshot()`, giving it full parity with the Count-screen's inline pane (Export page, Before/After comparison, the "currently counting" period marker).
  - The "All periods" comparison view — previously only available from the Count-screen's inline pane — now also works from the workspace sidebar Analyze screen, for both standalone and area-study-child intersections.
  - Added a new "Interval detail" section shared by every context: a `<details>`-collapsed, scroll-bounded table of the full per-interval numbers (vehicle in/out, per-crosswalk pedestrian counts, or TMC entering totals depending on the active dataset tab), demoted out of the primary visual hierarchy (stat cards → chart → data quality → detail tables) but still fully available via its expand toggle — replaces the old `renderIxAnalysis`'s 96-row table that used to dominate the screen by default.
  - The workspace sidebar's separate "Analyze" and "Charts" nav items were collapsed into a single "Analyze" item — the consolidated screen already interleaves summary stats, chart, and tables together per dataset tab (Vehicle/Pedestrian/Turning movements), so a separate chart-only sub-screen no longer added anything distinct. `openWorkspaceTab('charts')` is kept as an alias of `'analyze'` for safety.
  - Retired (left defined, no longer called) the bespoke peak-hour turning-movement diagram / time-of-day chart / mode-split donut functions (`renderTMDiagram`, `renderTimeOfDayChart`, `renderModeSplit`, `snapshotTmcPeakHour`) that only backed the old Charts sub-tab — their functionality is superseded by the existing `renderSummary()` volume chart and `renderTmcSection()`'s per-approach diagram, both already proven across two contexts before this change.

### Fixed
- **Count-screen instruction caption overlapped the workspace sidebar (BUG-016)** — see BUGS.md. The caption's base margin moved from an inline `style` attribute into `src/style.css` so the existing workspace-mode margin-left override rule can actually apply to it.

## v3.26.0-alpha.1 — 2026-07-25

### Added
- **Stage 5 help/instruction system** — the last item blocking Stage 5's close:
  - Fixed 109 instances of `�` (U+FFFD) mojibake corruption across `index.html`, introduced by a prior session's PowerShell text round-trip that mangled UTF-8 punctuation (em/en dashes, ellipsis, arrows, division sign, close-button glyph). Reconstructed each from context since FFFD is a lossy, one-way replacement.
  - `openHelp()` now takes an optional tab argument and opens the help modal directly on the relevant tab; the sidebar "Help" link (present on every workspace screen) now dispatches to a contextual tab based on the current screen/mode instead of always showing the same static full-page guide.
  - Added `stat-detail` instruction captions to every screen/tab that was missing one: intersection setup (project info, study parameters, intersection, export tabs), Count/Analyze/Charts/Export screens, area study (project info, summary, import CSV, export, per-intersection drill-down), and Trip Gen (analysis screen, distribution tab).
  - Rewrote the help modal's stale "setup" tab content, which still described vehicle types and TMC types as separate configuration areas — that architecture was replaced by the single master `vPairs` list back in v3.20–3.23. Added missing coverage for the bug report tool, `.tcsync` cross-device sync, area studies, Trip Gen's distribution tab, and the QA/QC screens, none of which were mentioned in help content before. Confirmed no leftover warrant/LOS mentions anywhere in help content.
  - Added a first-run walkthrough (`src/walkthrough.js`) — a short 4-step modal shown once per browser (`tc_seen_walkthrough` in localStorage) covering what the app does, the three project types, where to find help, and QA/QC + export. Replayable anytime via a "Take the tour" link next to the home screen's help button.

## v3.25.0-alpha.1 — 2026-07-24

### Added
- **Intersection QA/QC screen** — a new "QA/QC" tab in the intersection-project sidebar (between Count and Analyze), completing the QA/QC rebuild started with Trip Gen. A secondary reviewer picks one of up to four one-hour windows per period (AM Peak / Midday Peak / PM Peak / an optional Additional hour) and recounts every active count type together (vehicle, pedestrian, turning movement) in one bounded session, using a new standalone recount engine (`src/intersectionQaqcCount.js`) rather than the live intersection counter — the live counter autosaves on every keystroke and always renders the full data matrix, neither of which fits a scratch one-hour recount. Scoring reuses Trip Gen's existing `qaqcThresholdPct`/`qaqcPeakHourScore`/`threePeakHourRating` functions unchanged (`src/analysis/data/analyze.js`), scored per vPairs row, per crosswalk, and per TMC approach (a per-approach-total, not movement-by-movement — flagged in the UI and code as a v1 assumption with no confirmed source-methodology precedent). Raw counts, differences, and thresholds are always shown next to the pass/fail badge, never hidden behind it. New `intersectionQaqc` state object persists through project save/load/autosave alongside the existing `qaqc`/`tripgenQaqc` entry.

## v3.24.0-alpha.2 — 2026-07-24

### Removed
- **Level of service (LOS) section** — removed the v/c-ratio LOS letter-grade panel from the analyze tab (`losSection.js`, `levelOfService()` in the data layer, related CSS). Same reasoning as warrant screening: even a simplified planning-level LOS estimate is engineering-analysis territory this app shouldn't be replicating. The generic table styling it shared with the turning-movement breakdown table was kept and renamed `.data-table`.

---

## v3.24.0-alpha.1 — 2026-07-24

### Removed
- **Signal warrant screening** — removed `warrant.js` and all wiring (analyze-tab section, shareable HTML export badges, related CSS). This app's scope is data collection, top-level data analysis, and data organizing for export to GIS/Excel — not a replacement for engineering analysis tools. MUTCD warrant screening duplicated functionality that belongs in dedicated engineering software, not this platform. See the Project Brief for the corrected scope guardrails.

---

## v3.23.1-alpha.1 — 2026-07-24

### Fixed
- **App failed to load at all (BUG-014)** — `state.js` dropped its `tmcPairs` export when v3.23.0 switched to a single master `vPairs` list, but five files (`diagram.js`, `help.js`, `printReport.js`, `export.js`, `exportXlsx.js`) still imported it, and `main.js` called an unimported `renderTmcPairsList()` at module top-level. Either failure alone breaks the whole ES module graph, so `showScreen()` never ran and every screen rendered stacked on top of each other. Converted all `tmcPairs` usages to `vPairs.filter(p => p.includeTmc)` and removed the dangling `renderTmcPairsList()` calls.

---

## v3.23.0 — 2026-07-24

### Changed
- **Single master vehicle/TMC list** — replaced the two-list system (`vPairs` for vehicle counting + `tmcPairs` for TMC) with one master `vPairs` list. Each row carries a fixed `tmcKey`, a TMC-inclusion checkbox, and drag-to-reorder (keys travel with the row); labels lock once count data exists to prevent data corruption. A migration helper (`migrateVPairsFromLegacyTmc`) converts legacy `tmcPairs` project files on load.
- **Analyze-mode back button fix** — the counter screen's "Analysis" sidebar button now toggles an `analyze-mode` class on `#counter-screen` instead of navigating to a separate screen, so the counting secondary sidebar (and its back button) stays visible and usable while viewing analysis.

---

## v3.22.1 — 2026-07-24

### Fixed
- **Mode highlight first-click bug** (BUG-010) — counter sidebar mode buttons (pedestrian / vehicle / TMC) now correctly highlight on the first click. Previously a `buildCounterSidebar()` rebuild ran before `setMode()`, leaving the highlight stale until the next interaction.
- **TMC intersection analysis showing no data** (BUG-011) — the individual intersection analysis screen now shows a "Turning Movement Summary" card with approach totals, peak 15-min, and peak hour when TMC data exists. The 15-min distribution table switches to TMC vehicle volumes for TMC intersections. Charts view volume bars now correctly reflect TMC motor counts when `vData` is zero.
- **Print summary report ped-only** (BUG-012) — the area-wide summary print report now auto-detects which data types are present (Peds / TMC / Vehicle) and renders the relevant columns. Title changed from "Pedestrian Count Summary" to "Count Summary".
- **Print summary period breakdown blank for TMC** (BUG-013) — per-period breakdown columns showed "—" for all TMC intersections because `pedTotalForPeriod` only read `pedData`. Added `countTotalForPeriod` that falls back to `tmcData` motor count totals when ped data is zero.

---

## v3.22.0 — 2026-07-23

### Changed
- **TMC types now selected from vehicle list** — the turning movement types section no longer has its own independent label inputs. Instead, types are added via a dropdown populated from the directional vehicle types (vPairs), so the same classification list is shared between both modes. The dropdown disables types already in the TMC list to prevent duplicates.
- **"+ include bicycle" button replaces per-row checkbox** — the previous per-row "bicycle" checkbox on each TMC entry is replaced by a single "+ include bicycle" button at the top of the TMC section. Clicking it appends a dedicated Bicycle / Cyclists row with a locked label. The button hides itself once bicycle is added.
- **"add all vehicle types" shortcut** — a button that adds all vPairs types to the TMC list in one click, skipping any already present. Hides once all types are covered.
- **TMC label and definition are read-only display** — since TMC type labels come from the vehicle list, they are shown as plain text (not editable inputs) to avoid divergence. The definition is pulled automatically from the vehicle type definition.
- **`_syncTmcAddSelect` exposed to window** — the function that syncs the TMC add-dropdown with current vPairs was not on `window`, so the inline `oninput` handler on vPairs label fields would silently fail to update the dropdown when a label changed. Fixed.

---

## v3.21.0 — 2026-07-23

### Changed
- **Back button repositioned** — the fixed "← Back" button is now hidden in workspace mode (the sidebar's "← All Projects" already handles navigation) and repositioned to the bottom-left corner in non-workspace mode so it no longer overlaps screen headers or the setup tab bar.
- **Trip generation setup reorganized into tabs** — the single scrolling setup screen is now split into two tabs: "project info" (company details and site information) and "locations" (adding locations, classification setup, xlsx upload, and paste input). Reduces visual clutter and matches the tab pattern used elsewhere.
- **Parking study hidden from home screen** — the parking study card is commented out pending a fuller design pass. The underlying screens and logic remain in the codebase.

### Fixed
- **`parkingZones` temporal dead zone in dev server** — `parkingZones` was referenced in the early `Object.assign(window, {...})` block before its `let` declaration, causing a TDZ error that prevented the entire JS module from initializing in the Vite dev server (native ESM). The production build was unaffected because Vite transforms `let`→`var` during bundling. Fixed by moving `window.parkingZones = parkingZones` to after the declaration.

---

## v3.20.0 — 2026-07-23

### Changed
- **Merged vehicle types and turning movement setup tabs** — the two separate "vehicle types" and "turning movement" setup tabs are now a single "counting types" tab. Both configuration sections (directional in/out types and TMC types) appear in one scrollable panel, eliminating the redundancy of navigating between two tabs that configure the same concept for different counting modes.

---

## v3.19.0 — 2026-07-23

### Added
- **Parking occupancy study** — new project type on the home screen. Setup screen lets you define named zones with capacities and configure a sweep schedule (start time, interval, duration). Counter screen works through one time slot at a time with per-zone occupancy inputs and live % badges color-coded by occupancy level. Summary tab shows a full occupancy matrix (zones × time slots) with the same color coding. Export CSV downloads the complete grid with count and % columns. Projects save/load via the standard `.tcproject` format.
- **Help / instructions page** — accessible via the "?" button on the home screen and a "Help" item in every workspace sidebar. Covers counting modes, setup tab explanations, keyboard reference, XLSX import, sync, and a new data privacy section.
- **Data privacy / multi-user safety explanation** — home screen info blurb and help page section explaining that all data is stored in the local browser's localStorage (per-device, per-browser isolation). Includes guidance on multi-user workflows: export `.tcproject` / `.tcsync` files to move data between devices rather than sharing a login.
- **Keybinding group indicators** — when more than 4 vehicle types are configured, `renderVPairsList()` inserts a notice explaining the grouping and shows "Group 1 / Group 2" separators between rows in the vehicle types list.
- **Vehicle types tab description** — setup panel now shows a subtitle explaining this tab is for directional in/out counting and how key groups work.
- **Bicycle label lock** — checking "mark as bicycle type" in the TMC types list now forces the label to "Bicycle" and makes the input read-only to prevent data inconsistency.

---

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
