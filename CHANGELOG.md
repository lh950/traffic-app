# Changelog

## v3 · v1.2.9 — 2026-08-28

### Changed
- QA Page: the date header is bigger/bolder, and "+ add time period" now sits in its own bordered card instead of being crammed directly against the date and the counted-period cards above it.

## v3 · v1.2.8 — 2026-08-28

### Added
- QA Page: the "Copy QA-input link" button now also lives right on the QA Page header, not just Setup/Analysis.
- QA Input: a "Recommended time periods for QA validation" card at the top, listing the study's own detected peak windows.
- QA Input: the reviewer can now add their own custom time periods, not just use windows the owner already set up. New windows a reviewer adds are local to their own link session; when the owner checks for QA submissions, a matching time period is created automatically on their side too, so the submission has somewhere to land.

## v3 · v1.2.7 — 2026-08-28

### Changed
- Chart series colors switched to a ROYGBIV progression (Red/Orange/Yellow/Green/Blue/Violet) across every chart in the app — classifications and groups are now much easier to tell apart at a glance than the previous muted warm palette.

## v3 · v1.2.6 — 2026-08-28

### Changed
- Trip Gen QA/QC screen: the "Score detail" interval-by-interval table (primary vs. QA count, per interval) is now collapsed behind a ▸ caret by default instead of always expanded — makes it easy to open exactly the table for a period that failed, without cluttering the screen for the rest.

## v3 · v1.2.5 — 2026-08-28

### Added
- Trip Gen live counter: right-click a time row to clear it (every classification's in/out back to 0 in one undoable action) — matches the intersection counter's existing "reset interval," which Trip Gen never had.

## v3 · v1.2.4 — 2026-08-28

### Changed
- Relabeled "recount"/"recounts" to "QA count"/"QA counts" everywhere the second-counter QA/QC spot-check is shown (Trip Gen and intersection) — the separate, distinct "↻ recount" full-day redo feature keeps its own name unchanged, since it's a genuinely different action.

## v3 · v1.2.3 — 2026-08-28

### Changed
- StreetLight comparison hidden from Trip Gen (owner Analysis screen and shared viewer) — StreetLight's own confidence intervals turned out too wide to be a meaningful cross-check at typical Trip Gen site volumes (a single driveway/access point). Not removed: the import/parsing/persistence code is untouched and a single flag brings it back if that changes for a higher-volume site. See `DEVLOG.md`.

## v3 · v1.2.2 — 2026-08-28

### Added
- StreetLight comparison: optional third import (Estimated AADT CSV) shows StreetLight's seasonally-adjusted, full-year Average Annual Daily Traffic estimate with its own 95% confidence range — distinct from the period-specific averages already shown.

## v3 · v1.2.1 — 2026-08-28

### Added
- StreetLight comparison: optional second import (Zone Prediction Interval CSV) adds a 95% confidence range to the all-day estimate — e.g. "92 (95% CI: 0–200)" — showing how uncertain StreetLight's own number actually is.

## v3 · v1.2.0 — 2026-08-28

### Added
- StreetLight comparison for Trip Gen: import a StreetLight Insight "Zone Activity" export, map each location to its StreetLight zone, and see a read-only side-by-side against your count's own peak-hour figures. Same "cross-check only, never a substitute" framing as the existing intersection TMC comparison. New "StreetLight" tab in the shared-viewer layout when data's been imported. See `DEVLOG.md` for the constraints this export has (no classification breakdown, coarse 4-hour time buckets) and how they're surfaced in the UI.

## v3 · v1.1.6 — 2026-08-28

### Fixed
- BUG-056: existing projects saved before v1.1.5 still showed the old auto-assigned trip-rate groupings even after that fix — now those stale entries are migrated away on load, so only what you've actually set survives.

## v3 · v1.1.5 — 2026-08-28

### Fixed
- BUG-055: trip-rate/totals-by-day-type groupings no longer silently default to the source-workbook's fixed heuristic categories — they now use only what you've actually set in the classifications editor, showing each unassigned classification on its own instead of lumping it into an unrequested bucket.

## v3 · v1.1.4 — 2026-08-28

### Fixed
- BUG-054 (Major): a shared-link visitor could see a "? Back" button that navigated them into the real app's home screen — a phantom nav-history entry left over from `_currentScreen`'s default value, not anything they actually visited.

## v3 · v1.1.3 — 2026-08-28

### Fixed
- BUG-053: the shared viewer's new "Reports" tab showed the fixed-window picker's description but not the picker itself, and even once visible it wouldn't have done anything — now a viewer can actually pick a window and see the report recompute.

## v3 · v1.1.2 — 2026-08-28

### Added
- Trip Gen shared viewer: top tab bar (Overview / QA/QC / Locations / Reports) instead of one long scroll, matching the Setup screen's tab look.
- Trip Gen shared viewer: a "Print report" button with its own print-formatted header.
- Trip Gen: "Site-wide summary" now leads the page (owner Analysis screen and shared viewer both); "Your own peak periods" (custom windows) moved to the end.
- Shared viewer's explanatory header rewritten to actually orient a stranger clicking the link cold — what Traffic App is, that this is read-only, how to navigate, how to print.

### Fixed
- BUG-052: `Numpad +` didn't shift groups on the intersection vehicle/TMC counter (only fixed for Trip Gen previously — a cross-count-type parity gap).
- Print CSS: printing while the shared viewer is open no longer also force-shows the empty owner Analysis screen.

## v3 · v1.1.1 — 2026-08-28

### Added
- Explanatory header on the read-only shared viewer screen — what the page is, that it's read-only, and how to navigate it (scroll for the full study, ▸ marks a collapsed section, reload to see updates).

## v3 · v1.1.0 — 2026-08-28

### Added
- QA-input shareable link (Trip Gen only): a second link (`?share=<id>&qa=1`) that lets a second-counter reviewer submit QA/QC recounts remotely, structurally unable to touch a location's real count data (separate append-only Firestore sub-collection, not just a UI restriction). Owner side gets a "Copy QA-input link" button and a "check for QA submissions" button to pull in and merge remote submissions. See `DEVLOG.md` for the full design.
- **Note:** the Firestore security rules this feature needs are not yet published — the QA-input link will not accept real submissions until that manual step is done (same as the original sharing feature).

### Fixed
- BUG-051: the QA-input recount-submit path had no error handling — a failed Firestore write left the reviewer stuck on "submitting…" forever. Now resets and shows a retry message on failure.

## v3 · v1.0.1 — 2026-08-27

### Changed
- Reverted the trip-rate display headline back to the ITE-standard per-1000-GSF rate (v1.0.0 briefly switched it to the raw count for the actual facility square footage — switched back per user follow-up). Raw day/combined total stays as the secondary reference line.

## v3 · v1.0.0 — 2026-08-27

**First stable release.** The app is now considered safe to share beyond solo use — see `DEVLOG.md` for what that milestone means and the pre-launch stress test that preceded it.

### Fixed
- **Critical:** abandoning a Trip Gen "↻ recount" before finishing it, then resuming it via the generic "resume count →" path, silently left both the original day and the recount counted independently — double-counting that location's data with no error or indicator. Found by a dedicated pre-launch stress test. See BUG-050.
- Trip Gen counter no longer crashes on a classification missing its key bindings (only reachable via a malformed/hand-edited save file, not normal use).

### Added
- **Trip Gen: "+ add another day"** — for a location legitimately counted on more than one calendar day (e.g. a weekday and a weekend), a genuinely independent day, separate from "↻ recount" (which is specifically a QA redo that supersedes the day it replaces).

### Changed
- **Trip rate display** now headlines the actual trip count for the facility's real square footage (e.g. "40 / 10,000 GSF") instead of a rate normalized to a fixed 1000 GSF baseline; the ITE-standard per-1000 rate is kept as a secondary reference line.

## v3 · v0.49.10 — 2026-08-27

### Fixed
- **QA/QC pass/fail was checking the wrong thing.** Re-verified against the actual source workbook's live formulas: it scores each vehicle classification completely independently (four separate Good/Failed checks) — there is no combined-total rating anywhere in it. The app had been summing every classification into one hour total first, which can hide a badly-off classification behind others that balance it out (confirmed live: one classification off by 50% still produced a perfect 5/5 combined "Pass"). "By classification" is now the primary signal shown everywhere (QA/QC screen, Analysis summary table, score-detail screen); the old combined-total number is kept as a secondary, clearly-labeled informational extra rather than removed.

## v3 · v0.49.9 — 2026-08-27

### Added
- **QA/QC screen: read-only classification reference** — every classification's label and description shown right on the QA/QC screen, so the reviewer doing a recount doesn't have to go find it on Setup's classifications tab.

## v3 · v0.49.8 — 2026-08-27

### Added
- **Trip Gen Analysis: Site-wide summary now shows trip rate** — every location's day-type totals combined, same trip-rate formula the per-location cards use, shown above the site-wide chart.

## v3 · v0.49.7 — 2026-08-27

### Added
- **Trip Gen: "⭳ CSV" button on the live counter** — downloads exactly what's on screen (every interval, every classification's in/out) as a CSV, mid-count or after finishing.
- **Trip Gen QA/QC: a second, independent quality signal — "Shape" check.** The existing Pass/Fail only ever compares whole-hour totals, which can hide compensating errors (two quarters over-counted, two under-counted, netting to zero). The new chi-square-based Shape check compares the quarter-by-quarter pattern instead. Shown as its own badge alongside Pass/Fail; does not change what Pass/Fail means.
- **"explain this score →"** — a new detail screen (QA/QC screen, Analysis summary table, and the shared read-only viewer) showing the full worked arithmetic behind both checks for one window, not just the collapsed badges.

## v3 · v0.49.6 — 2026-08-27

### Fixed
- Trip Gen group-switch: `Numpad +` now also advances to the next group (previously only `Numpad -`/`=`/main-keyboard `=` did — user reached for the more natural minus/plus pairing and found plus did nothing).

## v3 · v0.49.5 — 2026-08-27

### Changed
- **Trip Gen "↻ recount" is now non-destructive.** The original day's count is never overwritten — a recount is added as its own new day on the same location, and the original stays fully visible and saved.
- Once a recount finishes, the original day it replaces is automatically excluded from QA/QC and Analysis (so they use the recount's data going forward), but nothing is deleted — a new "✓ include in analysis / ✕ exclude from analysis" toggle per day (Setup screen's Locations list) lets you flip this either way at any time.

## v3 · v0.49.4 — 2026-08-27

### Added
- **Trip Gen: "↻ full recount"** — discard a location's entire day count and start over, for when QA/QC finds the original count needs a full redo (not just a spot-check). Keeps the day's classifications/timing, camera image, reference PDF, and location label; routes through the same gated write path as every other count write. Available from both the Setup screen and the Location Counts screen.
- **Trip Gen: direct cell editing** — click any interval cell to type an exact value, same mechanism the intersection counter already had. Manually-edited cells are marked distinctly and fully integrated with undo/redo.
- **Trip Gen: group-switch keys now work on both the numpad and the main keyboard** at the same time, regardless of which counting-key preset is active (previously tied to the preset, mutually exclusive).

### Fixed
- Finishing a Trip Gen full recount no longer triggers a redundant second confirmation from the shrink-detection failsafe — the explicit confirm already shown by "full recount" now covers that save too.

## v3 · v0.49.3 — 2026-08-27

### Changed
- **Versioning scheme revised.** Retired the `-alpha.N` suffix (it hadn't been confirmed-and-dropped in 7+ weeks, so it had stopped signaling anything). MAJOR now tracks whether the app is safe to share beyond solo use — stays `0` until the user declares the BUG-047/048 class of data-loss risk resolved, then becomes `1.0.0`. `v3` is split out as a separate, permanent generation label (this is still the third rewrite of this app) rather than folded into a resettable MAJOR digit — shown as `v3 · v0.49.3`. See `DEVLOG.md` for the full reasoning, including a correction made mid-decision.

## v3.49.0-alpha.2 — 2026-08-27

### Added
- **Count-data diagnostics log now covers every project type**, not just Trip Gen — every project save (intersection, area, parking, Trip Gen) logs a generic entry to the same downloadable trail (folded into "Report a bug"). Trip Gen keeps its extra, more detailed write-level entries on top.

### Checked, no change needed
- Scoped the BUG-047/048 write-gate fix against the intersection/area counter and the parking counter. Intersection/area already has an equivalent fix (BUG-020/021); parking's single-grid architecture isn't exposed to this bug class at all. See `DEVLOG.md`.

## v3.49.0-alpha.1 — 2026-08-27

### Added
- **"Read-only outside the counter" write gate for Trip Gen count data.** BUG-047 and BUG-048 were two different bugs with the same root shape — a write site trusting that the shared live-counting module state still belonged to the session it thought was active. `commitLocationCounts()` is now the ONLY function allowed to write a location's real count data; every write site (six in total) funnels through it, and it refuses any write whose session identity doesn't match what was recorded when that location's counting session began, instead of silently applying it. See `DEVLOG.md` for the full design.
- **Downloadable count-data diagnostics.** Every count-data write (accepted or rejected) and every shrink-detection warning is now logged to a rolling, reload-surviving trail, included automatically in the existing "Report a bug" download. Added directly in response to BUG-048 having gone unnoticed for a full day of continued fieldwork before it was caught.

## v3.48.0-alpha.2 — 2026-08-26

### Fixed
- **BUG-048 (Critical): a QA/QC recount could silently discard the last few seconds of an in-progress location's real count.** A location's live keystrokes only reach its saved data via a 2-second debounced autosave; starting any QA/QC recount within that 2-second window reset the shared counting state before that flush happened, losing whatever was just typed with no error. Fixed by flushing the pending edit synchronously before a recount starts. Also closed a gap in the BUG-047 shrink-detection failsafe, which only checked interval COUNT and could not see this bug's shape (same interval count, zeroed values) — it now also compares total counted volume. See `BUGS.md` BUG-048.

## v3.48.0-alpha.1 — 2026-08-26

### Added
- **Count-data failsafe** — three independent layers of protection against the class of bug BUG-034/035/036/047 all belonged to (real field-count data silently lost, discovered too late, unrecoverable from inside the app). See `DEVLOG.md` for the full design writeup.
  1. **Rolling local backups.** Every autosave now also pushes a snapshot into a separate IndexedDB history (not just the single live `localStorage` slot that's always been overwritten in place) — up to 20 snapshots per project, throttled to at most one every 3 minutes, across up to 6 recently-active projects. New "Restore from backup…" link on the home screen opens a picker (project, type, time, quick data-volume summary) and restores any snapshot with one click plus a confirmation.
  2. **Automatic "data just got smaller" detection.** Every Trip Gen autosave now compares the incoming save against the last-known-good save, location by location. If a location that wasn't being actively edited suddenly loses most of its counted intervals — exactly what BUG-047 did to Flatlands Ave — a hard-to-miss confirmation dialog blocks the save unless you explicitly confirm it was intentional.
  3. **Export reminder.** A small dismissible banner nudges you to export a real file during a long live count, since `localStorage`/IndexedDB are themselves device-local and can be cleared independently of any app bug.

## v3.47.0-alpha.6 — 2026-08-25

### Fixed
- **BUG-047 (Critical): a QA/QC recount could silently overwrite a location's real count data.** If a location's edit session was left unfinished (not resumed and re-finished) and a QA/QC recount was then started for any location, the recount's own narrow time window could get autosaved into the abandoned location's data, replacing its full-day counts. Confirmed against real user save files. Fixed at the source — a recount is never mistaken for a location edit now. See `BUGS.md` BUG-047.

## v3.47.0-alpha.5 — 2026-08-25

### Fixed
- **BUG-046: QA/QC and Analysis screens could load up permanently blank** for projects saved before the custom-time-periods redesign, if you navigated there before the one-time background migration finished — a real race, not a fixed delay. The migration itself was always correct and never lost data; nothing re-rendered the screen once it completed. Fixed, plus a "Loading…" state so a slow render never just sits blank. See `BUGS.md` BUG-046.

## v3.47.0-alpha.4 — 2026-08-25

### Changed
- **QA/QC time periods are now fully custom** — "+ add time period" replaces the fixed AM/Midday/PM (or weekend peak) listing. Decoupled from the "Peak periods" chart, which is unchanged. Fixes the Midday period not displaying (it no longer relies on a built-in search range that might not overlap your actual counted time).
- **QA/QC screen groups collapse by location.**
- **Score detail now includes a per-classification breakdown** ("By classification") showing which specific vehicle type(s) are driving a pass or fail — recounts still require the full classification list, this only changes what's shown.
- Existing projects migrate automatically on next load — already-entered recount data is preserved under the new window model.
- Dropped the "Three Peak Hour QC Rating" rollup (it required exactly 3 fixed peaks, which no longer applies once windows are custom). Each window keeps its own score/pass-fail.

### Fixed
- Analysis page's QA/QC summary table now scrolls instead of clipping when there are many rows.
- Added a missing section header ("Per-location detail") after the QA/QC section on the Analysis page.
- A 2nd+ recount now shows a note explaining it's averaged with the others for scoring, plus an "Entered" timestamp and "In score?" indicator per recount row.

## v3.47.0-alpha.3 — 2026-08-25

### Added
- **Intersection Analysis: "Your own peak periods"** — name and save any clock-time window for this period's vehicle data, same idea as Trip Gen's version. Standalone intersection projects only (not area-study children, which are read-only snapshots).
- **Intersection Analysis: "Classification breakdown over time" combo chart** — stacked bars per vehicle class plus a total-volume line, with per-class checkboxes. Available everywhere the Analysis screen renders, including area-study children.
- **Shared pass/fail badge** — the intersection QA/QC screen's per-row result now uses the same ✓ Pass / ✗ Fail badge styling Trip Gen's QA/QC already uses, instead of separately hand-rolled colored text.

### Scoped, not built
- **Area-wide combo chart** (site-wide summary equivalent for multi-intersection studies) — write-up of the design questions that need answering first (shared axis: calendar date vs. period label; data source: read-only snapshots, not live state) is in `DEVLOG.md`.
- Classification grouping for intersection — held per direct instruction.
- Parking — confirmed nothing in this batch applies (no classification axis, no QA/QC, no keyboard counting).

## v3.47.0-alpha.2 — 2026-08-25

### Added
- **Classification grouping moved to Setup's classifications tab**, out of the Analysis screen — Analysis now shows an "Edit classification groups →" link instead of an inline form. Fixed a real bug found while testing this with real classification names: the built-in grouping suggestions never matched "single unit trucks" (only the hyphenated "single-unit") and never recognized "tandem trailer" at all — both now correctly default to "Trucks".
- **Peak periods bar chart** — the existing auto-detected AM/Midday/PM peak table now has a chart above it, with a legend (peak volume vs. the day's busiest peak).
- **Your own peak periods** — name and save any additional clock-time window (e.g. "School dismissal"); measured the same way as the existing fixed-window report, persisted with the project.
- **Site-wide summary** — one combo chart per calendar date, combining every location: bars = combined classification totals, one line per location. Classification checkboxes (all on by default) and a by-classification/by-group toggle.
- **Per-location classification breakdown chart** — same combo-chart idea, one per location per day: bars = that location's own classification breakdown, line = its total.
- All three new chart sections apply to the shared read-only viewer too, not just the owner's Analysis screen.

## v3.47.0-alpha.1 — 2026-08-24

### Added
- **Counter header now shows the location name once a site has more than one location.** Single-location sites are unchanged (no ambiguity to resolve). Applies to starting a new count, resuming/editing an existing one, and reload-resume.
- **QA/QC summary on the Analysis page is now score + pass/fail per peak, with a link to that count.** The full interval-by-interval primary-vs-recount comparison moved to the QA/QC screen itself, right on the card where the recount was entered — click any Analysis-page row to jump straight there.

## v3.46.0-alpha.5 — 2026-08-22

### Changed
- **Analysis screens redesign, items 1-4 of a research-backed priority list** (comparing this app's owner-facing Analysis screens against Miovision/StreetLight/Synchro and dashboard SaaS like Mixpanel/Stripe, grounded in the actual render code) — direct follow-up to user feedback that "the analysis page is a mess" and graphs weren't "displaying data." The area-aggregate screen (stat cards → chart → drillable table) was already good and served as the template; these changes bring the other screens toward that same pattern, not a new design direction.
  - **Item 1 — intersection "All periods" comparison view had zero charts.** `renderAllPeriodsView` (main.js) was a bare transposed table with no visualization despite having all the data (vehicle in/out, TMC total, pedestrian total per period). Now shows a stacked bar chart (vehicle in/out by period), plus separate TMC and pedestrian bar charts — kept as two charts rather than one combined multi-series chart because TMC volumes (thousands) and pedestrian volumes (hundreds) on a shared axis flattened the pedestrian bars to nearly invisible. The table stays below the charts for full detail. Reuses the existing `renderStackedBarChart`/`renderMultiSeriesBarChart` primitives already used elsewhere on the same screen — no new chart type.
  - **Item 2 — Trip Gen locations now tabbed instead of concatenated.** `renderTripGenSection` (`src/analysis/ui/tripgenSection.js`) used to render every location's full day-block card stack on one page — a real multi-location study could produce 40-70 same-weight cards with no navigation. Added a location tab bar (same `.day-tabs` pattern already used for the Raw/Balanced toggle on the same screen), one tab per location, only the active location's blocks visible; the cross-location sections (totals, fixed-window report, QA/QC summary) are unaffected since they already span every location. A print-only CSS override (`analysis/style.css`) forces every location visible when printing, so the printed report still includes all locations regardless of which tab was last selected on screen.
  - **Item 3 — secondary Trip Gen day-block cards collapsed by default.** Camera image, "Volume by classification — stacked, by grouping" chart, and "In/out over time" chart are now behind the same `<details>`/`.interval-detail` toggle already used for Interval Detail on the same screen, collapsed by default.
  - **Item 4 — Trip Gen trip-rate figures promoted to stat cards.** The "Trip rate" card was a plain table; now uses the same `.stat-card`/`.card-grid` pattern the intersection screen already uses for peak-hour/peak-15-min figures — one stat card per classification group, rate as the headline value, day total as the detail line.
  - **Items 5-6 (Parking Summary KPI+chart, Data Quality section collapse) not done this batch** — stopped after 1-2 per the task's own scope guidance rather than doing all 6 shallowly. Left for a follow-up session.

### Verified
- Item 1: loaded `test-fixtures/4way-full-vehicle-ped-tmc.tcproject` (2 periods, full vehicle/ped/TMC data) live, switched to "All periods," confirmed all three charts' values match the table exactly (e.g. vehicle total 579/569, TMC total 5,310/6,336, pedestrian total 299/315) and the single-period view still renders its own charts/stat cards with no regression. No console errors.
- Items 2-4: on a real Trip Gen project's existing location plus one added live, confirmed the location tab bar renders, switches the visible block, defaults to the first location, hides on a single-location project; confirmed the three secondary cards render collapsed and expand correctly (chart SVG renders inside once opened); confirmed trip-rate stat cards render with the correct group/day-total values. No console errors.
- `npm run build` passes.

## v3.46.0-alpha.4 — 2026-08-22

### Fixed
- **BUG-045 (Critical): "Enable sharing" failed outright for intersection and area-study projects.** Firestore rejects the nested-array shape those project types' `vData`/`pedData`/`tmcData` use — every attempt to enable sharing on a real intersection failed with a misleading "check your connection" error. Fixed with a generic encode/decode step at the Firestore write/read boundary only; the app's own save/export format is untouched. See `BUGS.md` BUG-045.

## v3.46.0-alpha.3 — 2026-08-22

### Changed
- **Redesigned the shared read-only viewer** — direct user feedback on Item 5: "theres far more data than is useful or necessary for a client or project manager to view." The shared page (`?share=<id>`) is no longer a full dump of the internal Analysis screen. Now, for all 4 project types (intersection, area study, Trip Gen, parking): charts and stat cards are the default, prominent content; detailed/interval-level tables (per-intersection tables, interval-detail tables, peak-period/classification/QA-QC-recount tables) are collapsed behind a click-to-expand toggle (the same `<details>` pattern already used for Interval Detail); QA status shows as a compact badge (pass/clean, or an error/warning count) with the full finding-by-finding list one click away instead of always expanded; and owner-only edit controls (site info form, classification grouping, peak-window pin controls) are hidden entirely rather than shown inert. Parking's shared view also gained a chart (the internal screen has never had one) — reuses the existing chart-rendering primitive, visualizing the same occupancy-% figures the table already showed. The internal, owner-facing Analysis screens are unchanged.

### Fixed
- **BUG-044: a viewer's own local project data could be silently overwritten with the shared project's data** on closing the tab or navigating away — the `beforeunload` autosave-flush handler was the one write path that didn't check the viewer-mode write guard. See `BUGS.md` BUG-044.

### Found, not fixed (documented for a future session)
- **BUG-045: "Enable sharing" fails outright for any intersection or area-study project** — Firestore rejects the nested-array shape of `vData`/`pedData`. Deliberately out of scope for this task (it's the Firestore push mechanism/data model, not the viewer). See `BUGS.md` BUG-045.

## v3.46.0-alpha.2 — 2026-08-22

### Fixed
- **BUG-043: shared links hung indefinitely in Firefox** (worked fine in Chrome). Firestore's default connection transport is known to hang in Firefox under some conditions — switched to auto-detected long-polling. See `BUGS.md` BUG-043.

## v3.46.0-alpha.1 — 2026-08-22

### Added
- **Item 5: read-only shareable link.** Any project (intersection, area study, Trip Gen, parking) can now generate a `?share=<id>` link from an "Enable sharing" button on its Analysis/Summary screen. Opening the link — in any browser, no account — shows a live, read-only view of that project's analysis using the same rendering code the app already uses, with nothing on the page editable and no local storage or save state touched just by viewing. Sharing pushes data to a Firebase Firestore project (the app's first external service dependency; everything else stays fully local/no-accounts), throttled to at most once every 45 seconds, piggybacked on the existing autosave path. "Disable sharing" deletes the shared document outright — the link stops working immediately. See `DEVLOG.md` for the read-only-safety design and the Firestore security rules.

## v3.45.0-alpha.5 — 2026-08-21

### Added
- **Item 11: per-interval notes in the Trip Gen counter.** Each row in the live counting table now has a small note button — unobtrusive "+" when empty, "note*" once set, full text as a hover tooltip. Notes persist through save/load and stay visible in Analysis's "Show all intervals" raw table.
- **Item 12: "In/out over time" line chart in Trip Gen Analysis.** Per day-block, select any combination of vehicle classifications and any combination of that day's peak-window periods (or "Full day") to plot in (solid) / out (dashed) counts per interval. Same class-to-color mapping as the existing stacked chart on the same page.
- **Item 13: locations can now be added directly from the Location Counts screen**, not just Setup. The whole "add a location" form (start new count / upload .xlsx / paste table) moved there; Setup's "locations" tab is now a compact read-only summary with a "Go to Location Counts →" link.

## v3.45.0-alpha.4 — 2026-08-21

### Fixed
- **BUG-042 (critical): QA/QC recount data leaked between two different Trip Gen locations.** Two locations could end up sharing the same internal id after a project load, causing them to share the exact same QA/QC storage — recounts entered for one location appeared under, and could be deleted from, the other. Root cause: the location-id counter was never resynced when a project was loaded. See `BUGS.md` BUG-042.

## v3.45.0-alpha.3 — 2026-08-19

### Fixed
- **BUG-041: the sidebar "QA/QC" link opened the screen with nothing in it.** It showed the screen but never rendered its content — only the setup screen's own QA/QC button did both. Same gap existed on the "Analysis" sidebar link (noted but not fixed back in v3.36.0-alpha.4); fixed both.

### Removed
- **Setup screen's redundant "QA / QC →" button** — the sidebar is now a fully correct entry point, so the duplicate is gone.

## v3.45.0-alpha.2 — 2026-08-19

### Added
- **Numpad 7/9 fixed shortcut in focus mode.** While a classification is focused, `Numpad7`/`Numpad9` now always record in/out for it — regardless of that classification's own assigned key or the active preset. Additive: its real key still works too.
- **Numpad is now Trip Gen's default keybinding preset** (was QWERTY), since Trip Gen counting is often one-handed field work. Scoped to Trip Gen only — the intersection counter's own preset default is unchanged.
- **Two new Help tabs: "number pad" and "key bindings"** — what the numpad layout is for and how it works, and how to switch/override key presets. Opening Help from the Trip Gen counter now lands on "number pad" directly instead of the generic tab.

### Changed
- **Vehicle reference popup: taller, clearer rows.** Row padding, label text, key chips, and count digits all enlarged for legibility.
- **Focus-warn banner no longer covers the popup's top bar** — its height is now permanently reserved in the layout instead of overlapping the group-nav/focus-toggle/interval row when it appears.

## v3.45.0-alpha.1 — 2026-08-19

### Added
- **Trip Gen vehicle reference popup: group-switch button and focus-mode toggle.** The pop-out reference window (shipped earlier today) could show a read-only "group N/M" badge but had no way to actually switch groups, and no way to toggle focus mode, without going back to the main counter window — working against the popup's own purpose as a standalone window for limited screen space. Added a ‹ › button pair and a focus toggle button, both fully two-way synced with the live counter.
- **Interval badge enlarged** (14px → 22px, with an accent border) so the currently-counting time period reads as the popup's dominant element, not a secondary label.

### Fixed
- **BUG-040: the dedicated group-switch keystroke didn't work when typed directly into the reference popup.** The shortcut is matched by the physical key (`e.code`, so the Numpad preset can't collide with QWERTY), but the popup's passthrough channel only forwarded the key value — now forwards the code too, so the same shortcut that works in the main counter works identically inside the popup.

## v3.44.0-alpha.4 — 2026-08-19

### Added
- **Trip Gen: a pop-out vehicle reference window**, modeled directly on the intersection counter's TMC turning-diagram popup (`diagram.js`'s `toggleTurningDiagram`) — same `window.open()`+Blob-URL mechanism, keyboard-passthrough back to the opener, and open-window reuse/focus behavior. New `src/tripgenDiagram.js` builds the popup (a simple 3-column table: classification / In key+count / Out key+count), scoped to the currently active keybinding group so a physical key column is never ambiguous across groups. Shows the live interval label and the active group badge, flashes the exact In/Out cell just incremented (mirroring the crosswalk popup's per-keystroke flash, not the TMC popup's persistent-highlight style — Trip Gen has no single "focused movement" the way TMC does), and stays in sync on every record/undo/redo/interval-nav/group-switch. New "⊞ reference" button in the Trip Gen counter header (`tg-btn-diag`). Along the way, fixed a real cross-module bug the new popup's keyboard-passthrough exposed: `focus.js`'s global `message` listener (forwarding popup keystrokes to the intersection counter) had no active-screen guard, so it also fired — and threw — while the Trip Gen popup's passthrough was posting to the same `window`; now gated by the same `isLiveCounterScreenActive()` check its own keydown listener already used.

### Changed
- **Trip Gen's per-location "Zoning reference PDF" upload relabeled to "Access-point reference document"**, with an explicit note that it's not the project-wide ZOLA screenshot in Project Info. User-reported perceived duplication ("in project info there is an upload for zola information... it looks like theres a separate space for this upload in locations"). The two fields are genuinely different data (one project-wide zoning-lookup screenshot vs. one PDF per access-point/location) and the field name/data (`entry.zolaPdfData`/`zolaPdfName`) is unchanged — only the label, since the old wording ("Zoning reference PDF... site zoning reference") read as the same thing as the ZOLA screenshot. See `DEVLOG.md` for the full reasoning, including why consolidation was considered and rejected.

### Fixed
- **BUG-039: home screen kept the last project's accent color (e.g. Trip Gen's purple) after leaving it, instead of the neutral default.** `exitWorkspace()` removed `workspace-mode` but never removed the `project-type-*` class `enterWorkspace()` had added. See `BUGS.md` BUG-039.

## v3.44.0-alpha.3 — 2026-08-19

### Added
- **Trip Gen: a real "Location Counts" screen.** The sidebar's "Location counts" button used to just jump onto Setup's compact "locations" tab (the same page as clicking "Setup" then "locations") — the user correctly rejected this as not a meaningfully different page. It now opens a dedicated `tripgen-locations-screen`: a larger card-grid browse view showing every location in the project with per-day detail (date, day type, classification count, total recorded volume in+out, an "in progress" badge for unfinished counts) and a "+ add a location" shortcut back to Setup's entry-point tab. Clicking any day with live-count data reopens it for editing via the existing `editTripgenDay()` flow — its "save location and exit" button now returns to whichever screen you edited from (Setup or this new screen) instead of always assuming Setup. Setup's own compact "locations" tab is unchanged — it stays focused on adding a new location (upload/paste/begin-counting).

### Fixed
- **BUG-038: Trip Gen's explicit "save project" button silently dropped classifications (including group assignments) on every save.** See `BUGS.md` BUG-038.

## v3.44.0-alpha.2 — 2026-08-19

### Fixed
- **BUG-037: count tables blew out past the screen width, and every keystroke scrolled the page to the far right.** A CSS grid-blowout bug (`grid-template-columns:1fr` instead of `minmax(0,1fr)`) let the table's container grow to its full unconstrained content width instead of respecting the screen, pushing the whole page wider than the viewport — so the per-keystroke "scroll current row into view" call ended up scrolling the entire page horizontally instead of a contained scrollbox. See `BUGS.md` BUG-037.

## v3.44.0-alpha.1 — 2026-08-19

### Added
- **Configurable keybinding groups (intersection counter + Trip Gen).** Group membership is now an explicit, user-editable `group` field on each vehicle type / classification (a `#` column in the setup list, drag-to-reorder + click-to-edit), instead of a fixed `floor(index/4)` block — e.g. 3 vehicles in group 1, all freight vehicles in group 2. Custom group membership is respected identically in setup and live counting.
- **TMC mode now pages through keybinding groups.** Turning-movement counting used to render every included vehicle type flat in one row, requiring every TMC key to be unique project-wide. It now pages through groups the same way vehicle mode already does (‹ › group nav, both mouse and keyboard), so TMC keys only need to be unique WITHIN a group.
- **One-handed group layouts (intersection counter, per-project).** New "group layout" setting on the vehicle-types tab: standard (4 types/group, in+out — the existing default), one-handed 2-types-in/out (fits one hand's 4 keys), or one-handed all-in/all-out (up to 4 types/group, one key each, single direction only — for counting when only one direction matters).
- **Numpad one-handed keybinding preset (intersection counter + Trip Gen), selectable at setup.** Class 1: `7`/`9`, Class 2: `4`/`6`, Class 3: `1`/`3`, Class 4: `0`/`.`. QWERTY (A/S/D/F in, J/K/L/; out) stays the default for new projects. Implemented as a position-based key-pool algorithm (mirroring the existing QWERTY default-key logic), not a one-time stamp — reordering types/classifications or changing group membership re-applies cleanly.
- **Keyboard shortcuts for switching keybinding groups**, tied to the active preset — previously mouse-only. Numpad preset: Numpad `/` (previous) / Numpad `-` (next). QWERTY preset: `-` (previous) / `=` (next). Distinguished via `event.code` (`NumpadDivide`/`NumpadSubtract` vs `Minus`/`Equal`) so the two presets' shortcuts never collide with each other or with existing keys (undo/redo, focus toggle, focus-cycle `[`/`]`, arrow nav). Works in both vehicle and TMC modes for the intersection counter, and in Trip Gen's counter.
- **Numpad reference diagram.** A small labeled grid showing the numpad's physical layout with each key's assigned class/classification and in/out at a glance — shown in setup when the Numpad preset is selected, and as a compact live-counting reference (updates with the active group) in both the intersection counter and Trip Gen.
- **Active-group highlight in setup lists.** When a vehicle-types or classifications list spans more than one keybinding group, clicking a group heading highlights that group's rows (subtle background tint + accent border), so it's clear at a glance which group you're looking at while editing — mirrors the same visual language used for other "active" states in the app.
- **Trip Gen: an in-progress location now appears in the Locations list immediately.** "Begin counting" creates the location's entry right away (zeroed data, marked "in progress"), instead of waiting until "finish location." Autosave keeps that entry's data current while counting continues. See BUG-036.

### Changed
- **Live keyboard reference bar is significantly more compact.** Smaller `<kbd>` key badges (22px→17px), tighter chip/gap spacing, and smaller type across the board — applies to the intersection counter, Trip Gen, and the intersection QA/QC recount screen (all share the same `.kbd-grid`/`.kbd-chip` classes). Addresses standing feedback that the bar took up more visual space than its information density justified.
- **Trip Gen's "finish location" button is now "save location and exit."** Since the location's entry is created the moment counting starts (see Added, above), clicking this button no longer means "this count is complete" — it just saves current progress and returns to setup, which is safe regardless of whether counting is actually finished.

### Fixed
- **Export filenames didn't default to include the project name.** `updateDefaultFilenames()` only derived vehicle/ped/TMC filenames from street names, unlike the UTDF and xlsx exports (which already prefer the project name first, falling back to street names). Brought in line with that precedence.
- **BUG-036 (Critical): a second "begin counting" click on a Trip Gen location could silently discard the first, unfinished count.** Because an in-progress count was invisible in the Locations list until "finish location" ran, a user who stepped back to setup mid-count (e.g. to fix a classification) without finishing saw no evidence anything had started, and re-clicking "begin counting" reset the live count state out from under the first session. Fixed by creating the location's entry immediately when counting begins (see Added, above) — resuming it now reuses the same "edit counts" path a finished location already uses, so a second start can no longer silently clobber the first. See `BUGS.md` BUG-036.

## v3.43.0-alpha.6 — 2026-08-19

### Fixed
- **BUG-035 (Critical): Trip Gen classifications were never included in any save.** Project-wide config (labels, keys, descriptions on the Classifications tab) — not count data — was silently excluded from both autosave and an explicit "save project" export, and unconditionally wiped back to empty on every project load. Now persists correctly and restores on reload. See `BUGS.md` BUG-035.

## v3.43.0-alpha.5 — 2026-08-19

### Fixed
- **BUG-034 (Critical): Trip Gen live counts had zero persistence until "finish location" was clicked.** Caused real field data loss — leaving the counter before finishing (back button, refresh, crash) silently discarded the whole in-progress count, in both autosave and an explicit "save project" export. Now autosaves continuously while counting and, on reload, resumes straight back into the counter with the in-progress data intact instead of landing on a bare setup screen with the count gone. See `BUGS.md` BUG-034 for full root cause and live-verification detail.

## v3.43.0-alpha.4 — 2026-08-19

### Fixed
- **BUG-033: Trip Gen counter and intersection QA/QC recount counter rendered broken/cramped on every visit.** Reported as "reopening a finished Trip Gen location for edit shows a smaller page that doesn't fit screen" — investigation found it wasn't edit-path-specific: both `#tripgen-counter-screen` and `#intersection-qaqc-counter-screen` lost their flex-column layout the moment the screen router touched them (an inline-style-only `display:flex` that `showScreen()` silently clears on every navigation, with no stylesheet `.active{display:flex}` fallback like the main intersection counter has), and each screen's header was independently getting shifted 224px twice (448px total) past the workspace sidebar, squeezing it into ~65% of the screen width. Also fixes the related "focus mode doesn't fit the page" report, which shared the same root cause. See `BUGS.md` BUG-033.

## v3.43.0-alpha.2 — 2026-08-19

### Fixed
- **BUG-032: starting a brand-new intersection project inherited the previous project's template/diagLeg/enabled modes.** The home screen's "Intersection count" card never reset the `intersection` singleton, the 5-way/T-intersection template slots, or the pedestrian/vehicle/turning enabled-modes flags — a genuinely new project silently opened pre-configured as whatever the last-open project in the same tab had set. Same leak class as BUG-027/BUG-031, different trigger. See `BUGS.md` BUG-032.

## v3.43.0-alpha.1 — 2026-08-19

### Fixed
- **BUG-031: 5-way TMC destination ordering, TMC-only default mode, project-load diagLeg desync.** Four related fixes from a real 5-way field count: (1) an approach's destination list now sorts by turn classification (Left/Thru/Right/U-turn) at every mutation point, so two Left-turn destinations on a 5-way approach group together instead of splitting across Thru/Right; (2) a TMC-only project (vehicle and pedestrian both disabled) now opens directly into turning-movement mode instead of an empty, disabled vehicle screen; (3) loading a saved project no longer leaves the 5-way/T-intersection template's diagonal/missing-leg slot pointing at a stale value left over from an earlier project in the same browser session — found during an audit of whether `setDiagLeg()`'s leg letter actually propagates to `classifyTurn()` (it does, live — the gap was project *load* skipping that resync). See `BUGS.md` BUG-031 for full root cause and live verification detail.

### Added
- **Data Quality flag: turning movements enabled but empty while vehicle volume exists.** A new Analyze-screen Data Quality check fires when turning-movement counting is enabled, the study's total recorded TMC volume across every period is essentially zero, and real vehicle in/out volume was recorded — the fingerprint of a field session counted entirely in the wrong mode. Scoped narrowly (an absolute near-zero TMC threshold, not a percentage of vehicle volume) so a genuinely low but real turning-movement study doesn't false-positive, and gated on turning actually being enabled with approaches configured so it doesn't fire on projects that never used turning-movement mode.

### Changed
- **Approach/movement active-selection visual clarity.** The approach selector's active state now gets a focus ring + bold weight (matching the movement chip row's existing treatment) instead of a flat background swap, and the live counter's "N → Left (E)"-style active-selection summary line is now a filled pill instead of plain text — user feedback that the current selection "wasn't super clear."

### Testing
- **Added `test-fixtures/` — reference `.tcproject` files for manual regression testing.** 8 fixtures covering every project type (intersection, parking, area-wide) and counting mode (vehicle in/out, pedestrian, TMC), including the 5-way multi-Left-turn destination-ordering shape (BUG-031) and the empty-tmcData/populated-vData wrong-mode corruption signature the new Data Quality flag targets. See `test-fixtures/README.md`.

## v3.42.1-alpha.1 — 2026-08-19

### Fixed
- **BUG-030: no way to add more than 4 vehicle types in intersection setup.** The "counting types" panel's help text documents support for "up to 12 types across keybinding groups of 4," and the growing logic (`updateVCount(n)`) already existed and worked correctly, but no button or input in the UI ever called it — the two presets each set exactly 4 rows, "+ bicycle" adds one capped special row, and "copy from project…" only helps with an existing file that already has more types. Added a `+ vehicle type` button that adds one row per click (correctly starting new keybinding groups of 4), hiding once the documented 12-type cap is reached.

## v3.42.0-alpha.1 — 2026-08-17

### Added
- **Distinct accent color per project type, in logical families.** Each project type now re-colors the app's shared accent tokens (`--accent`/`--on-accent`/`--blue-bg`/`--blue-text`/`--blue-border` — the tokens already used throughout for active buttons/tabs, badges, links, and focus states) via a `body.project-type-X` class, toggled in `enterWorkspace()` alongside the pre-existing `project-type-area` toggle. Base surface/text/border colors are untouched, so only accents shift — the app still reads as one product. Works correctly in both light and OS dark mode.
  - **Intersection** (single TMC/turning-movement count) — light blue.
  - **Area / corridor study** (a collection of intersections) — dark blue, same family as intersection, one shade darker (a corridor study is a collection of intersections — related domains).
  - **Trip Gen** (site trip generation) — violet/purple, a deliberately different hue, since it's a conceptually distinct study type from the other three.
  - **Parking** — a teal-shifted third shade of the blue family (judgment call: folded in with intersection/area since it's also a physical-location field count, not given its own hue; shifted toward teal rather than sitting exactly between the other two shades so it doesn't read as an ambiguous in-between blue). Parking's home-screen entry is currently hidden pending design, so this isn't reachable through normal navigation yet, but the styling and body-class toggle are wired and verified.
  - Exact color values and the full reasoning are recorded in `DEVLOG.md`'s v3.42.0-alpha.1 entry.

### Verification
Live in the browser (dev server): navigated the real home-screen cards for Intersection, Area-wide study, and Trip generation count, confirming via `document.body.className` and `getComputedStyle` that each applied the correct class and computed accent token values, in both light mode and OS-forced dark mode. Confirmed base tokens (background, text, border) stayed identical across all four project types in both modes. Confirmed the intersection/area "family" relationship and parking's third-shade distinctness read correctly side by side, and that Trip Gen's violet is clearly a different hue, not a blue variant. Every accent/on-accent and blue-text/blue-bg color pair passed a WCAG 4.5:1 contrast check (two initial candidates failed and were adjusted before landing on the final values). No console errors beyond the pre-existing, unrelated Vite HMR websocket noise. `npm run build` passes.

## v3.41.0-alpha.1 — 2026-08-17

### Changed
- **Trip Gen: classifications moved out of the "locations" tab into their own dedicated setup tab.** The classification-list editor (`renderClassificationsList()`) previously lived only inside the "start a new count" panel, nested under the "locations" tab — resetting to a single blank row every time that panel was opened, discarding whatever had been configured for the previous location. It's now a third top-level tab ("project info" / "locations" / "classifications", `#tgp-classifications` in `index.html`, same generic `switchTgTab()` mechanism used by the other two — no new tab machinery invented), reachable independently of "start a new count," so classifications can be defined/edited/reordered before ever adding a location. **This is a real behavior change, not just a UI relocation**: classifications are no longer wiped per location — clicking "start a new count" now only seeds one starter row the first time a project has none at all; anything already configured (here, or carried over from an earlier location in the same project) persists and pre-fills the next count. The locations tab's "start a new count" panel shows a live read-only summary ("2 classifications defined: Autos, Trucks") plus an "Edit classifications →" button that jumps straight to the new tab. To prevent this newly-persistent list leaking between projects (the same failure shape as BUG-027), `resetClassifications()` is now called explicitly whenever a genuinely new Trip Gen project starts (both home-screen entry points) and inside `loadProject()`'s Trip Gen branch, since classifications were never a saved project field to begin with (only per-location snapshots via `snapshotForEdit()` were).
- **Trip Gen sidebar: added "Location counts," reordered Analysis after QA/QC.** Sidebar now reads Setup → **Location counts** → QA/QC → Analysis → Distribution (previously Setup → Analysis → QA/QC → Distribution). "Location counts" is a direct entry point onto the per-location data/management UI that already lives on Setup's "locations" tab (`openWorkspaceTab('tg-locations')` → `showScreen('tripgen-setup-screen')` + `switchTgTab('locations')`) rather than a new duplicate screen — judgment call: that tab is already a complete, self-contained location list/add/upload/paste/edit UI inside a screen that already carries the `.workspace-screen` sidebar-offset class (BUG-028 precedent), so a second copy under a new id would only add BUG-017 risk for no new capability.

### Verification
Live in the browser (dev server), using a resumed real Trip Gen project plus a fresh one: confirmed the sidebar order (Setup, Location counts, QA/QC, Analysis, Distribution) via DOM inspection. Clicked "Location counts" — landed on Setup's locations tab showing the project's real existing location (not a dead end, not a duplicate screen). Opened the new "classifications" tab directly (no location ever added first) — added 2 rows (Autos/Trucks) with their own keys, confirmed the "locations" tab's "start a new count" panel showed the live summary and the "Edit classifications →" button navigated back correctly. Clicked "start a new count," confirmed classifications were NOT reset (still Autos/Trucks, no wipe), began counting, recorded a real count via keyboard, finished the location — classification labels/keys carried through into the finished location's data correctly. Returned to the classifications tab — reorder lock (`classificationsLocked`) correctly engaged now that the project has real count data (drag handles showed `drag-locked`). Started a brand-new Trip Gen project from the home screen — classifications tab correctly showed empty/reset, confirming no leakage from the previous project. No console errors throughout (aside from pre-existing, unrelated dev-server/HMR websocket noise). `npm run build` passes.

## v3.40.0-alpha.1 — 2026-08-17

### Added
- **Project-wide ZOLA (NYC zoning-lookup tool) screenshot field for Trip Gen** — a new `tripgenSiteInfo.zolaScreenshotUrl` (a `data:` URL via `FileReader.readAsDataURL()`, same technique as the existing camera-image and per-location zoning-PDF uploads), distinct from the existing per-location "Zoning reference PDF" upload (`entry.zolaPdfName`/`entry.zolaPdfData`, untouched). Upload/preview/remove control added to both the setup screen's static site-info card (`index.html`/`main.js`'s `renderTgSiteZolaWrap()`) and the Analysis screen's dynamic `renderSiteInfoForm()` (`tripgenSection.js`) — same dual-location pattern as the recent Lot SF/Available GSF fields (`a8aad13`), with separate ids on the setup side vs. `data-site-zola-*` attributes on the Analysis side to avoid a BUG-017-class id collision. Shown at the top of `renderTripGenSection()`'s output, inside the "Site information" card (first thing rendered after the summary's intro line) — not buried per-day/per-location, and not a tiny thumbnail (`max-height:400px`).

### Verification
Live in the browser (dev server): uploaded a real image via the setup screen's control (dispatched an actual `File`/`change` event at the hidden input, exercising the real `FileReader.readAsDataURL()` path, not a shortcut) — preview and "× remove" appeared correctly. Loaded a synthetic Trip Gen project (via the pre-existing `window.__loadProject()` test hook) with a location and count data, then reached the Analysis screen through the real "View analysis" button flow — confirmed the ZOLA screenshot renders inside the Site information card near the very top of the output (roughly 6% into the rendered HTML, well above the per-day breakdowns). Verified the Analysis screen's own upload/remove control independently (separate `data-site-zola-upload`/`data-site-zola-clear` elements, same `zolaScreenshotUrl` field via `ctx.onSiteInfoChange`). Confirmed persistence: `scheduleAutosave()` wrote `zolaScreenshotUrl` into `localStorage`, and a full page reload + "Resume →" correctly restored the image on the setup screen. Confirmed the no-screenshot state renders cleanly on both screens (just the "upload screenshot…" label, no broken `<img>`, no gap). No console errors from any of the above actions (aside from pre-existing, unrelated dev-server/HMR noise).

## v3.39.0-alpha.1 — 2026-08-17

### Changed
- **Trip Gen focus mode now dims the live count table's columns, not just the keyboard-reference chips** — the intersection counter's own focus mode (ped-counting table) dims every non-focused column to `opacity:.28` and highlights the focused pair's header, and Trip Gen's focus mode (shipped earlier this session) was missing that stronger signal, only dimming the keyboard chips. `buildTable()` in `tripgenCount.js` now computes `fcxi` (the focused classification index, or -1 when focus mode is off) each render and applies the intersection counter's own `ped-focus-col`/`ped-focus-col-hd`/`ped-dimmed` CSS classes (reused verbatim from `counter.js`'s `renderPed()`, not reinvented) to the focused classification's In/Out header cells, body cells, and footer total cells — every other classification's columns dim, matching the intersection counter's look exactly. `updateFocusUI()` now also calls `buildTable()` (previously only `buildKbd()`) so toggling/cycling focus refreshes the table immediately. Table columns are never grouped-of-4 like the keyboard chips are — Trip Gen's table already shows every classification's columns at once — so dimming works the same whether the focused classification is in the currently visible keybinding group or not; `cycleFocus()`'s existing `tgGroup = Math.floor(focusTarget/4)` sync keeps the two views in visual agreement regardless.

### Verification
Live in the browser (dev server): built a 6-classification Trip Gen location (2 keybinding groups) and began counting. Toggled focus mode on — classification 1's In/Out table columns (header, all body rows, footer totals) rendered with the highlighted `ped-focus-col`/`ped-focus-col-hd` treatment, all 5 other classifications' columns dimmed. Cycled focus with `]` four times to classification 5 (group 2) — dimming correctly moved to classification 5's columns only, confirmed via both a DOM class inspection and a visual screenshot; the keyboard reference bar's group nav followed along to group 2 as before. Toggled focus mode off — all `ped-focus-col`/`ped-focus-col-hd`/`ped-dimmed` classes cleared from every header/body/footer cell, no stuck dimming. No console errors beyond the pre-existing, unrelated Vite HMR websocket failure in this dev harness.

## v3.38.0-alpha.1 — 2026-08-17

### Added
- **"Groups of 4 with key reuse" keybinding mechanic, brought over from vPairs to Trip Gen's classification list** — a follow-up correction: an earlier session gave Trip Gen's classification list drag-to-reorder matching vPairs, but deliberately left out vPairs' separate keybinding-groups mechanic, reasoning that Trip Gen's 12-key pool made it unnecessary. That reasoning was wrong for lists with more than 12 classifications — actually, the user explicitly wants it for any list past 4, matching vPairs' own UX exactly. Built to mirror vPairs/`counter.js`/`focus.js` piece for piece, but as fully local state in `tripgenCount.js` (a new `tgGroup` module variable), consistent with this file's standalone-from-`state.js` design:
  1. **Editor** (`renderClassificationsList()`) — shows the same "Keybinding groups" notice and "Group N" separators as `renderVPairsList()` in `setup.js` when `classifications.length > 4`.
  2. **Per-group conflict checking** — `checkKeyConflicts()` now scopes duplicate-key detection to each group of 4 independently (`for(let g=0;g<classifications.length;g+=4)`, same shape as `checkVKeys()`), so two classifications in different groups can share a key without a false conflict warning, while same-group conflicts are still caught. (Also found and fixed a real pre-existing bug in vPairs' own `checkVKeys()` while building this — see BUGS.md BUG-029.)
  3. **Live counting screen group nav** — `buildKbd()` now slices the keyboard reference bar to the active group of 4 and, when there's more than one group, prepends `‹`/`›` buttons with a "group N/M" label (built as real DOM elements with `addEventListener`, not inline `onclick=`, per BUG-024 discipline). New `tgGroupPrev()`/`tgGroupNext()` bump `tgGroup` and move `focusTarget` to the new group's first slot, mirroring `vGroupPrev()`/`vGroupNext()`'s `setFocusTargetState(vGroup*4)`.
  4. **Keydown resolution scoped to the active group** — `buildKeyMap()` only registers the active group's in/out keys (mirrors `focus.js`'s `buildVKeyMap()`), so a key press only ever counts for a classification in the currently visible group; the same physical key bound to a hidden group's classification does nothing until that group is switched to. `[`/`]` switch groups outside focus mode (mirrors `focus.js`'s `processKey` precedence: group-switch keys only apply when not in focus mode).
  5. **Focus mode ↔ grouping coexistence** — `cycleFocus()` now also sets `tgGroup = Math.floor(focusTarget/4)` when cycling focus targets with `[`/`]` (mirrors `focus.js`'s `cycleFocus`), so cycling focus across a group boundary automatically brings the newly-focused classification's group into view rather than leaving focus pointing at a hidden chip.
  All group state (`tgGroup`) resets to 0 alongside `focusMode`/`focusTarget` at the start of every counting session (`beginCounting`/`beginEditing`/`beginRecount`).

### Verification
Live in the browser (dev server, desktop viewport): built a 6-classification Trip Gen location — editor showed the "Keybinding groups" notice and "Group 1"/"Group 2" separators; confirmed classification 5's in-key set to the same key as classification 1's ("A", different groups) showed no conflict, while classification 2's in-key set to match classification 1's ("A", same group) correctly showed the red conflict highlight and no false positive lingered after reverting. Began counting with the 6-classification list: keyboard reference bar showed only 4 chips at a time with a working "group 1/2" label and `‹`/`›` buttons (disabled at each end). Pressed "d" (classification 3's key, group 1) while group 2 was active — did not register; pressed "a" (classification 5's key, group 2, deliberately also classification 1's key) — registered correctly for classification 5 only, without double-counting classification 1. Toggled focus mode on while group 2 was active — focus correctly landed on classification 5 (the group's first slot); cycling focus with `]` past classification 6 wrapped to classification 1 and correctly auto-switched the visible group back to group 1; pressed a non-focused group-1 key ("s") — blocked; pressed the focused key ("a") — registered. Removed 2 classifications to drop back to 4 total — confirmed the editor showed no group notice/separators and the counting screen showed no group nav at all, matching vPairs' own `>4` gate. No console errors throughout (aside from the pre-existing, unrelated Vite HMR websocket failure in this dev harness).

## v3.37.0-alpha.1 — 2026-08-17

### Added
- **Lot square footage, alongside the existing facility floor-area field, with a computed FAR** — Trip Gen's site info (`tripgenSiteInfo`) previously had one square-footage field (`gsf`), used only to compute trip rate (trips per 1000 GSF). Relabeled it "Available GSF (facility)" for clarity and added a new `lotSf` field ("Lot square footage") next to it, on both the setup screen's static site-information card (`index.html`) and the Analysis screen's `renderSiteInfoForm()` (`tripgenSection.js`) — same `data-site-field`/`onSiteInfoChange` persistence pattern as every other site-info field, no new wiring mechanism. New `computeFar()` in `tripgenSection.js` divides `gsf` by `lotSf` (Floor Area Ratio) and displays it (2 decimals, e.g. "0.42") on both the no-print site-info card and the print-only summary table, only when both values are present and `lotSf` is nonzero — otherwise no FAR row at all (no NaN/Infinity from a partially-filled form). `exportXlsx.js`'s Trip Gen summary sheet gained matching "Lot SF:" and "FAR:" rows alongside the existing "Available GSF:" row (renamed from "GSF:").
- **Trip rate calculation is unchanged** — `data.tripRate(groupTotal, siteInfo.gsf)` still divides by the facility's own `gsf` exactly as before; `lotSf` is additive context for FAR only, never fed into the rate calculation.

### Judgment call
The task ("lot square footage... calculations should be done with these values") named lot SF and the existing GSF field but didn't spell out what "calculations" meant. Read as: FAR (facility GSF ÷ lot SF) is the standard, unambiguous real-estate/traffic-engineering combination of exactly these two values — a natural derived stat, not just two static display fields — while trip rate (which already exists and already uses `gsf`) was left untouched since the task was explicit that lot SF is additive, not a replacement input.

### Verification
Live in the browser (dev server): set Available GSF = 20000, Lot SF = 47600 on a real Trip Gen project's site info (via the Analysis screen's site-info card) — FAR displayed as "0.42" (20000/47600 = 0.42017, hand-checked). Confirmed FAR disappears entirely (no NaN/Infinity) with Lot SF = "0" and again with Lot SF blank. Confirmed trip rate (10.8, 2.2, 15.2, 4.55 trips/1000 GSF across two day-sheets) was unaffected by any Lot SF change — hand-checked one value (216 day-total ÷ 20 = 10.8). Reloaded the page and resumed the autosaved project — both "Available GSF (facility)" (20000) and "Lot square footage" (47600) persisted correctly. No console errors beyond the pre-existing, unrelated Vite HMR websocket failure.

## v3.36.0-alpha.4 — 2026-08-17

### Added
- **Closed 5 confirmed analysis-feature gaps between the TMC/intersection Analyze screen and Trip Gen's Analyze screen** — a full one-directional (TMC → Trip Gen) feature-parity pass, per an existing feature comparison. All five reuse the intersection side's existing logic/thresholds rather than reimplementing them:
  1. **Stacked-by-classification volume chart with switchable groupings**, added to each day-sheet's block in `renderDayBlock()` (`tripgenSection.js`). Same five-grouping idea as the intersection side's `renderVehicleClassStackedSection()` (`main.js`) — 15-min interval, hourly, day, day-of-week — but with Trip Gen's own peak-window concept (AM/Midday/PM weekday, or Weekend peak 1/2/3) in place of the intersection side's generic "study period," and stacked by raw CLASSIFICATION rather than the pre-existing `categoryMap` group rollup shown elsewhere on the same screen (not conflated with it — a separate card). Reuses `renderStackedBarChart()` from `charts.js` directly. New `classSeriesFromTgParsed()`/`classSeriesAcrossTgDays()`/`renderTgClassStackedSection()`/`TG_CLASS_CHART_GROUPINGS` in `tripgenSection.js`; "day"/"dow"/"peak" groupings combine a location's OTHER day-sheets (`entry.days`), matching classes BY LABEL not array position (BUG-019/BUG-020 discipline).
  2. **Interval Detail table with a "% of peak hour" column** — Trip Gen previously had no interval-by-interval table at all (only day totals and peak-window summaries). New `buildTgIntervalDetailMarkup()` in `tripgenSection.js`, one row per interval, matching the intersection side's `buildIntervalDetailMarkup()`/`pctOfPeakCell()` shape but checked against whichever of the day's 3 named peak windows actually contains that interval (Trip Gen resolves 3 windows per day type, not one generic peak hour) — reuses `resolvePeak()`, the same peak detection already driving the existing "Peak periods" card, rather than re-detecting peaks with new logic.
  3. **Automated Data Quality flags** — a new "Data quality" card per day-sheet, calling the intersection side's existing `runVehicleQA()`/`renderQASection()` (`qa.js`) directly against that day's primary-count interval data (`day.parsed`, which carries the identical `{types, intervals:[{inbound,outbound}]}` shape as `vehParsed`). Gap detection, spike flags, IQR outliers, and the low-total advisory all come along unchanged — no threshold drift between the two systems. Distinct from Trip Gen's pre-existing QA/QC section, which is a human second-counter recount comparison, not automated statistical flagging.
  4. **Fixed-window report across all locations** — new "Fixed-window report" card in the combined "Totals by day type" view (`renderTripGenSection()`), matching the intersection/area-study side's `fixedWindowForIntersection()`/`fixedWindowSectionHtml()` (pick one clock-time window, see every location's volume for exactly that window) but adapted to Trip Gen's `entries`/`days`/classification shape. New `fixedWindowForEntry()` picks whichever of a location's day-sheets actually covers the requested window and sums by classification LABEL (not position); shows an explicit "No data for this window" state rather than a silent zero when nothing covers it. New `tripgenFixedWindowStartMin`/`tripgenFixedWindowEndMin` module state in `main.js` (not persisted across save/load, matching the intersection side's own fixed-window state).
  5. **Day-of-week labeling** — Trip Gen already captured a real date per count day but never displayed the weekday. `renderDayBlock()`'s day header now shows it alongside the date (e.g. "Day 1 (Tue 8/4) — Tue 8/4 (weekday)"), reusing `dateLabelWithWeekday()` — never re-deriving weekday math, sidestepping the documented `new Date(dateStr)` UTC-shift pitfall.
- **Extracted `weekdayShort()`/`dateLabelWithWeekday()` into `src/analysis/ui/dateUtils.js`, and `intervalBar()`/`pctOfPeakCell()` into `src/analysis/ui/intervalDetail.js`** — both were previously private to `main.js`; Trip Gen's new features (items 1, 2, 5 above) needed the exact same logic, and `tripgenSection.js` can't import from `main.js` (main.js is the app entry point and already imports `tripgenSection.js` — importing back would be circular). Both modules are now imported by both `main.js` and `tripgenSection.js`, so the weekday-derivation and %-of-peak-hour formulas can't drift between the intersection and Trip Gen sides.

### Verification
Hand-checked against a synthetic 2-location, multi-week Trip Gen fixture built via `window.__loadProject()` (2 day-sheets on one location, a week apart, both Tuesdays — deliberately so "day" and "day of week" groupings produce visibly different bar counts): stacked-chart totals matched hand-summed input data for the bin/day/day-of-week/peak-window groupings (e.g. peak-window grouping combined two days' AM peaks into a single 406-volume bar, matching 290+116 by hand); interval-detail %-of-peak-hour column summed to exactly 100.0% across a 4-interval peak window and showed "—" for every interval outside it; Data Quality correctly flagged a deliberate zero-interval gap and a 7.4× neighbor-average spike (both trip the same thresholds as `qa.js`) on one day, while a clean day showed "No data quality issues found"; the fixed-window report re-summed correctly on window change and showed the explicit no-data state for a window no counted day covered; weekday labels (Tue 8/4 and Tue 8/11, 2026) were independently verified against a real calendar (day-of-year offset from Jan 1, 2026 being a Thursday), not just "code runs without erroring." Also verified with a second location added (different `entry.id`/day index) that the new per-day placeholder-div ids stay unique and don't cross-contaminate (BUG-017 discipline). No console errors throughout.

## v3.36.0-alpha.3 — 2026-08-17

### Fixed
- **Trip Gen live counter screen didn't fit the browser window — the workspace sidebar covered its left ~224px (BUG-028)** — reported live by the user while field counting on the then-deployed v3.35.0-alpha.2. Root cause: `#tripgen-counter-screen` (and, found by the same pattern, `#intersection-qaqc-counter-screen`) is a bare `<div>` with no class attribute, so none of the three existing workspace-sidebar-offset CSS rules (the generic `.workspace-screen` rule, the `#setup-screen` rule, or the intersection-counter-specific rule chain) ever applied to it — the fixed, always-visible 224px sidebar rendered on top of the header title, the keyboard reference bar, and the table's time column. Fixed with a one-line CSS addition giving both screens the same `margin-left:224px` offset in workspace mode. See `BUGS.md`.

### Added
- **Focus mode for the Trip Gen live counter, matching the intersection counter's existing focus mode** — Trip Gen's counting engine (`tripgenCount.js`) previously had no focus mode at all. Added the same interaction model and keybindings as the intersection counter's `focus.js` (toggle with `\`, cycle targets with `[`/`]`, click a chip to jump directly to a target) but with entirely local module state (`focusMode`/`focusTarget` inside `tripgenCount.js`, not a reuse of `focus.js`'s globals — consistent with this file's own deliberate no-shared-globals design). Locks keyboard input to one classification's in/out keys at a time; the keyboard reference bar dims every non-focused classification's chips (reusing the same `.kbd-chip.dimmed` CSS the intersection counter already uses). New `tg-btn-focus`/`tg-focus-bar`/`tg-focus-chips` header button and bar (distinct ids from the intersection counter's `btn-focus`/`focus-bar`/`focus-chips`, avoiding any BUG-017-class id collision), wired via `addEventListener` in `wireKeydown()` — no inline `onclick=`/`oninput=` handlers added, so no `window` exposure was needed (sidesteps BUG-024's whole failure class). Focus state resets to off at the start of every counting session (`beginCounting`/`beginEditing`/`beginRecount`), same as `slot`/`undoStack`/`redoStack`, since `focusTarget` indexes into whatever classifications list that session just loaded.

## v3.36.0-alpha.2 — 2026-08-17

### Added
- **Description field for vehicle/count types, with an expand-to-edit UI, surfaced downstream** — vPairs already had a `def` field (used since v3's inception for the default class set, e.g. "Class 2 — passenger cars & light vehicles") but it was only ever captured via a cramped 11px inline text input in `renderVPairsList()` (`setup.js`) and never read anywhere else in the app. Replaced the inline input with a collapsed-by-default "+ desc" toggle button per row (`toggleVDescExpand()`, new `vDescExpanded` Set — pure UI state, not persisted) that reveals a full-width `<textarea>` for a real sentence or two, matching the description this field was always meant to hold. Same lock behavior as the label/key columns (`hasCountData()`-gated) — locked rows still show the toggle so a description can be read, but the textarea becomes a read-only view instead of an editable field. Surfaced downstream in two places: the TMC "Interval Detail" per-class breakdown table (`buildIntervalDetailMarkup()` in `main.js`) and the area-study Aggregate view's "Vehicle class breakdown" table (`aggregateVehicleClassTotals()`) — both show a ⓘ icon with a `title` tooltip next to any class that has a description, silent (no icon) for classes without one. Chart-only displays (the "Volume by vehicle class" stacked bar chart) were left alone — no natural per-segment tooltip mechanism without a deeper chart-library change, judged not worth forcing in.
- **Same description field added to Trip Gen's classifications, plus drag-to-reorder matching vPairs** — Trip Gen's own `classifications` array (`tripgenCount.js`, deliberately separate from vPairs/state.js per that file's own no-shared-globals design) gained a `def` field (same name as vPairs' — no rename, see judgment call below), the same collapsed-by-default "+ desc" toggle widget, and vPairs' drag-handle/dragstart/dragover/drop reordering pattern, none of which existed before (classifications could only be appended, never reordered). New `setClassificationsLocked()` in `tripgenCount.js` lets `main.js` (which owns `tripgenEntries`, invisible to `tripgenCount.js` by design) tell the editor when to lock — computed by a new `hasTripgenCountData()` check (any location with a day whose intervals carry a nonzero value), called right before the classification list is rebuilt each time the "start a new location count" panel is (re)opened. A list being built for a location BEFORE any other location has real data stays freely reorderable; once any location has data, the drag handle locks (`drag-locked` class, same visual treatment as vPairs) — matches vPairs' `hasCountData()` intent of preventing a reorder from silently scrambling which historical column means what. `def` flows through `finishLocation()` as a new parallel `parsed.defs` array (index-matched to the existing `parsed.types` string array, so every existing by-label consumer of `types` — `groupTotals`, `categoryMap` — is untouched) and is surfaced in the Analysis screen's "Volume by classification" table (`renderDayBlock()` in `tripgenSection.js`) the same way as vPairs — ⓘ icon + tooltip, silent for classifications with no description. XLSX/paste-imported locations have no `def` (no editor step exists for them) — their table rows simply show no icon, same as any vPairs class with an empty description.

### Judgment calls
- **Did not rename `def` to `description`.** The field already existed under this name in vPairs' default data (shipped since early v3) and in the CSV/DOT-TMC import carry-through code; renaming would have touched more surface area for no functional gain. Used the same name (`def`) on Trip Gen's classifications for consistency, per the task's own "if you rename it, rename it on both sides" instruction — since it wasn't renamed on the vPairs side, it wasn't renamed on the Trip Gen side either.
- **UI widget: collapsed-by-default toggle + textarea, not an always-visible input.** Checked for an existing expand/collapse convention first — found the Analyze screen's native `<details>`/`<summary>` "Show all N intervals" pattern, but that's block-level, not a fit for a per-row grid cell. Built a smaller, purpose-specific pattern instead (`.desc-toggle-btn` / `.desc-row` / `.desc-textarea` / `.desc-view` in `style.css`) shared verbatim between vPairs and Trip Gen's classifications — same class names, same collapsed-by-default behavior, so the two editors read as one consistent interaction rather than two similar-but-different ones.
- **Trip Gen's reorder lock only gates dragging, not label/key editing or removal.** vPairs' lock (`hasCountData()`) freezes labels, keys, and removal all at once, matching its shared-across-every-period design. Trip Gen's classification list resets to empty every time a *new* location's "start counting" panel is opened (pre-existing behavior, not changed here) — each location effectively gets its own list — so locking label/key edits on a list that's about to be discarded/replaced anyway would have added restriction with no real protective value. The task's own framing was specifically about reordering ("Reordering should also lock..."), so scope stayed there.

## v3.36.0-alpha.1 — 2026-08-17

### Added
- **Trip Gen's per-day camera-image capture now surfaces in the Analysis screen, not just the tiny 64×40px setup-screen thumbnail** — the setup screen's Locations list already let a user upload/preview/remove a `data:` URL camera photo per count-day (`entry.days[i].cameraImageUrl`), and it already persisted correctly through save/load (whole-object clone, no allowlist stripping), but the photo itself was never shown anywhere except that tiny thumbnail. `renderDayBlock()` in `src/analysis/ui/tripgenSection.js` now renders a full-size "Camera view" card (`max-height:360px`, preserves aspect ratio) at the top of each day's section, right under the day header and before the Trip rate card, whenever `day.cameraImageUrl` is set — days without a photo render with no card and no gap, exactly as before. In-app analysis screen only; `exportTripgenXLSX` and print/export paths are untouched (out of scope for this task).

## v3.35.0-alpha.2 — 2026-08-12

### Fixed
- **Loading a standalone intersection project could show a stale QA/QC recount left over from a PREVIOUSLY loaded, unrelated project (BUG-027)** — found during a single end-of-batch audit covering today's four features together (lat/lng + %-of-peak-hour + day-of-week, StreetLight comparison import, fixed-window report). `loadProject()` restored `intersectionQaqc` via `Object.assign` with no reset first, so a project with fewer (or zero) recount keys than whatever was already loaded kept the old project's entries. Fixed by clearing the store before restoring, mirroring the reset-then-restore pattern the new `streetlightComparison` code already used correctly. See `BUGS.md`.

## v3.35.0-alpha.1 — 2026-08-12

### Added
- **Fixed-window report in the study-wide Aggregate view — one user-chosen clock-time window, reported across every intersection** — new "Fixed-window report" card in `renderAreaAggregateContent()`, complementary to (not a replacement for) the existing auto-DETECTED peak-hour logic (`ixDetectPeakStart()`/`peakHourInWindow()`). Here the user picks one fixed window via two `<input type="time">` fields (default 8:30–9:30) and every intersection is summed for exactly that clock-time span — fills a real, confirmed gap: StreetLight Insight's own TMC tool can't determine a common "network peak hour" across a group of intersections, and this app already has all the per-interval data to do it. New `fixedWindowForIntersection()` picks whichever of an intersection's periods actually CONTAINS the requested window (checked against each period's own `cfg.startMinutes`/`durationMin`/`intervalMin`), sums vehicle/pedestrian/TMC data for that window, and returns an explicit `{ noData: true }` when no period covers it — rendered as a clear "No data for this window" row rather than a silent zero. Vehicle and TMC totals are matched BY LABEL (`vp[i].label`), not array position, same discipline as `aggregateVehicleClassTotalsByIntersection()` (BUG-019/BUG-020 territory) — intersections with different `vPairs` sets and different `intervalMin` combine correctly. Interval-boundary math (`startIdx`/`windowSize` via `Math.round`) reuses the same rounding approach as `ixRowQuarters()`/`beginIxQaqcRecount()` rather than reinventing it. Doesn't assume every intersection has vehicle-mode data (BUG-025 lesson from the StreetLight comparison feature) — TMC-only intersections are summed correctly from `tmcData` alone. The window-change re-sum (`fixedWindowTableHtml()`/`wireFixedWindowInputs()`) is kept deliberately separate from the full, async `renderAreaAggregateContent()` render path (which re-runs QA/QC coverage scoring per intersection) — changing the window redraws only the report table instantly, with no stale data from the previous window and no interference with the existing BUG-022 generation-counter guard on the rest of the view. Verified live: hand-calculated totals for a mixed vehicle-mode/TMC-mode/mismatched-`vPairs`/mismatched-`intervalMin` 3-intersection fixture, an intersection whose only period doesn't cover the window (explicit no-data state, not zero), re-summing correctly on window change with no leftover data from the prior window, and a rapid re-trigger of `renderAreaAggregateContent()` confirming the existing staleness guard still covers the rest of the view correctly.

## v3.34.0-alpha.1 — 2026-08-12

### Added
- **StreetLight Insight TMC peak-hour comparison — read-only import, side by side with the manual count** — new `parseStreetlightXlsx.js` parses a StreetLight `*_tmc_peak_hour_table.xlsx` export (repeating day-type/peak-period blocks, 4 leg groups × Left/Thru/Right, 4 interval rows, Hourly Total/Hourly Total %/PHF rows — scanned by landmark, not fixed cell addresses, same approach as `parseDotTmcXlsx.js`), verified against a real sample export (Graham Ave & Driggs Ave, 8 blocks) with hand-checked totals. New `streetlightComparison` snapshot bucket (mirrors `intersectionQaqc`'s dual-source pattern — a standalone live global plus a per-area-intersection `snapshot.streetlightComparison`), never read by or merged into `tmcData`/the primary count. New "StreetLight comparison" screen (sidebar item for standalone projects; "StreetLight →" button next to "QA/QC →" for area-study children) shows StreetLight's Left/Thru/Right/Total/PHF per leg next to the manual count's own closest-matching peak hour, with a StreetLight-vs-manual diff per movement — every StreetLight number is visibly badged "SL PROJECTION" and the screen opens with a persistent banner restating StreetLight's own accuracy caveat (individual movements can be off by a meaningful margin). No pass/fail scoring — informational only, unlike QA/QC. Async render path is generation-counter-guarded (BUG-022 pattern), verified live with a rapid re-trigger test. Leg matching reads the compass word StreetLight already spells out in its own leg header text (e.g. "South - Graham Avenue (Northbound)" → leg `S`) rather than inferring a NB/SB/EB/WB mapping (see BUG-023).
- **Peak-hour detection now has a turning-movement-based fallback for TMC-only projects** — found live-testing the StreetLight comparison feature: the existing `ixDetectPeakStart()` (shared with QA/QC) only searches vehicle in/out volume and silently falls back to the search window's literal start time when vehicle mode isn't active, which is exactly the case for a turning-movement-only project. New local `slDetectPeakStart()` in `main.js` uses `ixDetectPeakStart()`'s vehicle-based search when available, otherwise searches `tmcData` volume directly — kept local to the StreetLight comparison code rather than changed in the shared QA/QC function, to avoid an unreviewed behavior change to QA/QC's own peak-hour search.

## v3.33.0-alpha.1 — 2026-08-12

### Added
- **Optional latitude/longitude fields for standalone intersection projects** — groundwork only (data capture, no matching/linking/fingerprinting logic). Area-study intersections already had this; standalone single-intersection projects had no location field at all. Two new optional text inputs on the Setup screen's "intersection" tab (`ix-lat-inp`/`ix-lng-inp`, bound to a new `intersection.lat`/`intersection.lng` in `state.js`), saved/loaded/serialized the same way every other field on `intersection` already is (the object is serialized wholesale, so no separate persistence code was needed). Hidden for area-study child intersections, which already have their own lat/lng fields on the hub row — showing both would create two disconnected entry points for the same intersection.
- **"% of peak hour" column in Interval Detail tables** — each interval row (vehicle, pedestrian, and turning-movement datasets) now shows what share of the study's detected peak hour that interval represents, alongside its existing raw total. Reuses the same rolling-hour peak detection (`analysisData.peakHour()`) already driving the Summary section's "Peak hour" stat card for the period being viewed — no new peak-detection logic. Intervals outside the detected peak-hour window show an em dash rather than a percentage against a different, non-peak hour, so every non-dash figure in the column sums to ~100% within the peak hour's own rows.
- **Day-of-week grouping and labeling for the vehicle-class stacked bar chart** — new "Day of week" option (`dow`) alongside the existing 15-min interval / hourly / day / study period groupings, collapsing every period across a multi-day (or multi-week) study onto one bar per weekday (Mon..Sun), useful for spotting a weekday pattern that spans several weeks. Reuses `classSeriesAcrossPeriods()`'s existing by-label vehicle-class aggregation — only the grouping-key function changed (weekday name instead of calendar date), so the BUG-019/BUG-020-class by-label discipline carries over unchanged. Every place a period's date was already shown as a label (the "day" grouping's bar labels, and the "All periods" summary table's Date row) now shows the weekday alongside it (e.g. "Tue 8/11" instead of just "8/11"), derived from the existing `meta.date` string rather than stored separately.

### Fixed
- **Setup screen's street-name fields didn't redisplay after a project load/resume, and threw on every keystroke (BUG-024)** — found while adding the new lat/lng fields to the same part of the setup screen. See BUGS.md. `renderLegConfig()` now syncs `street1-inp`/`street2-inp`/`street3-inp`/`ix-lat-inp`/`ix-lng-inp` from state on every setup-screen entry, and `updateDefaultFilenames` (called by all three street-name inputs' `oninput` handlers) is now actually exposed on `window`, where those inline handlers run.

## v3.32.0-alpha.2 — 2026-08-11

### Fixed
- **UTDF export had north/south and east/west turning-movement volumes silently swapped (BUG-023)** — found during an independent audit of the new UTDF export, before pushing. UTDF/Synchro labels columns by direction of travel (NB/SB/EB/WB), not by which physical leg a vehicle entered from; this app's own `parseDotTmcXlsx.js` already documents the correct convention ("SB = vehicle entered from North", etc.) but the new exporter assumed leg-name-matches-column-name. Fixed the leg-to-column mapping and verified against hand-derived expected values across all four directions. See `BUGS.md`.

## v3.32.0-alpha.1 — 2026-08-11

### Added
- **UTDF export for turning-movement counts, for direct import into Synchro** — new `.csv ↓ Turning-movement volumes (UTDF for Synchro)` button on the single-intersection Export screen, alongside the existing CSV/XLSX exports. Writes a genuine UTDF `[Volume]` section (`src/exportUtdf.js`), not a relabeled version of the existing generic CSV export: `[Volume]` section marker, `DATE,TIME,INTID,NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR` header row, one row per count interval in the active period. Format researched against PTV Vistro's UTDF import documentation (Vistro must round-trip real Synchro UTDF files, so its documented column layout is a strong secondary source) — see DEVLOG for the full confidence breakdown of what's confirmed vs. best-effort. Motor-vehicle classes only are summed per movement (bicycle volumes excluded — no confirmed UTDF bike-volume column layout found), matching the existing `motorOrigIdx`/`bikeOrigIdx` precedent in `exportCSV()`. Only cardinal N/E/S/W approach legs map to UTDF's fixed 12-column layout; a 5-way intersection's diagonal leg has no corresponding column and its movements are dropped with a surfaced warning rather than silently misattributed to an adjacent leg. Export is per-active-period (not per-project), matching how the existing CSV/XLSX "Count data (active period)" exports already work and matching UTDF's real-world one-peak-hour-per-file usage pattern. **Not yet round-trip validated against a real Synchro import** — flagged explicitly in-code and here.

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
