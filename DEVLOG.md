# Development log

Key decisions, scope constraints, and architectural choices.

---

## 2026-08-11 — v3.32.0-alpha.1

**UTDF export for turning-movement counts — researched the real format before writing any code, per the task's explicit instruction not to guess.** UTDF (Universal Traffic Data Format) is Trafficware/Synchro's own interchange format; getting the field layout wrong means a file that silently fails or garbles data on import, the worst kind of bug for an export feature. Went in assuming I'd need to flag this as unverified best-effort — ended up with moderate-to-good confidence after cross-checking multiple independent sources, documented below.

**Sources consulted (via WebSearch/WebFetch):**
- General background confirming UTDF is a CSV-based Trafficware/Synchro format, that the modern ("2006 reformat") "Combined UTDF" bundles everything into one file, and that sections are delimited by bracketed name lines (`[SectionName]`) with a blank line between sections — cross-referenced across a Strong Concepts forum post (SYNCHRO Ver 7 1-File CSV Export Problem) and general search summaries; consistent across sources.
- **PTV Vistro's own UTDF import documentation** (`cgi.ptvgroup.com/vision-help/VISTRO_2023_ENG/Content/Content-Topics/utdf-import.htm`) — the strongest single source found, because Vistro is a *competing* traffic analysis tool that must round-trip real Synchro-produced UTDF files exactly to be useful, giving it a strong incentive to document the layout precisely rather than approximately. It lists exact header rows for Layout, Lanes, Phasing, Timing Plans, and **Volumes** sections. The Volumes header: `DATE,TIME,INTID,NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR` — DATE as mm/dd/yyyy, TIME as a 3-4 digit 24-hour value with no colon (e.g. `700`/`0700`, `1200`). It also confirms Vistro sums 15-minute (or other) count bins into hourly totals on import, i.e. multiple interval rows per DATE in one Volumes section is the expected, normal shape — not an aggregated single-row-per-period file.
- A general web-search summary independently citing the same `NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR` 12-column movement layout for Synchro's "TMC file" / Lanes-record format, corroborating the column set and order from a second angle.
- Searched specifically for the Synchro 11 User Guide's own UTDF chapter (would have been the single best primary source) but could only reach a Scribd metadata/preview page, not the actual document text — noted as a gap, not fabricated around.

**Confidence: CONFIRMED (cross-checked, not primary-source-verified) for structure and the Volumes column layout; BEST-EFFORT for several specifics — see the confidence block at the top of `src/exportUtdf.js` for the full itemized breakdown.** Summary:
- Confirmed (2+ independent sources agreeing): CSV file, `[SectionName]` bracket markers with blank-line separation between sections, and the exact `DATE,TIME,INTID,NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR` Volumes header/column order.
- Best-effort / explicitly flagged as unverified: exact bracket casing/pluralization (`[Volume]` vs `[Volumes]`); INTID hardcoded to `1` (no real network-ID concept in this app); U-turns folded into the Left column (UTDF's 12-column layout has no U-turn column — no source confirmed Synchro's own convention here, this is a traffic-engineering-convention guess); bicycle volumes excluded entirely rather than guessed at (Vistro's docs note bike fields exist elsewhere in UTDF but are ignored on import — didn't find a confirmed layout, so left out rather than guessed). **Not round-trip tested against a real Synchro import** — that remains the one thing that would move this from "best-effort" to "confirmed," and is called out explicitly in-code and in the export UI's own caption text.

**Scope decisions:**
- **Volumes-only, no Layout/Lanes/Timing Plans sections.** The intended workflow is bringing fresh field-count volumes into an intersection already built in Synchro (geometry, lanes, signal timing already exist there) — a volumes-only UTDF import is the standard, low-risk way to do that. Guessing at Layout's X/Y coordinate fields (this app has no geo-referenced coordinates) or Lanes' PHF/detector/storage-lane fields would have meant fabricating data with no source backing, which is exactly the kind of guess the task said not to make.
- **Per-active-period export**, matching the existing `exportCSV()`/`exportXLSX()` "Count data (active period)" precedent and matching the real-world UTDF usage pattern of one intersection's peak-period volumes per file — not an attempt to bundle every period of a multi-period study into one file.
- **Motor-vehicle classes only, summed per movement** — reused the existing `motorOrigIdx`/`bikeOrigIdx` split from `exportCSV()` (the established pattern for this exact "UTDF wants one number, not a class breakdown" problem), and used it as the BUG-019/BUG-020-class safeguard: sums are built by iterating `vPairs` and checking `isBike`, never by a fixed array position, and `nT` (actual recorded class count) is derived from `tmcData` itself rather than trusted from `tmcPairs.length`, mirroring `exportCSV()`'s existing guard for the same reason.
- **Single-intersection only, no area-study batch export** — matches the task's suggested default; an area study's multi-intersection UTDF batch would need its own INTID-per-intersection scheme this app has no equivalent of yet, better left for a follow-up if it's ever needed.
- **Non-cardinal legs (5-way's diagonal leg) are dropped, not misattributed.** UTDF's 12-column layout has exactly 4 approach directions; a 5th leg has nowhere to go. Rather than guessing which cardinal bucket it should fold into (which would silently corrupt that bucket's totals), the export drops that leg's movements entirely and surfaces a warning string back to the caller, which `main.js`'s export-screen wiring shows via `alert()`.

**Verified live**, via a fabricated 4-way fixture project loaded through `window.__loadProject()` (2 vehicle classes, one `isBike:true`; distinct counts per approach×destination so cross-contamination or mis-mapping would be obvious): called `buildUTDFText()` directly (same function the UI button calls) and hand-verified every one of the 12 movement columns for a 2-interval period against manually-computed compass-bearing turn classifications (e.g. approach N, dest E → helper computes Left; approach N, dest S → Through; approach N, dest W → Right) — output matched hand computation exactly, bike counts correctly excluded from every column, DATE/TIME formatted correctly (`08/11/2026`, `0700`/`0715`). Separately added a synthetic 5th "SE" leg with its own tmcData to confirm the diagonal-leg-drop path: output correctly excluded it from all columns and returned the expected warning string, rather than silently folding it into N or E. Clicked the actual Export-screen button in a live browser session (`preview_start` against this session's own dev server) and confirmed no console errors and no crash on the real click path (not just the underlying function call). Did not — and could not — verify the output actually imports correctly into real Synchro software; that remains the explicit open item.

`npm run build` passes cleanly. No scratch files left under `public/`.

## 2026-08-11 — v3.31.0-alpha.1 (audit note)

**Independent audit of the stacked bar chart, before pushing.** Read the full diff directly: `renderStackedBarChart()`, `classSeriesFromVehParsed()`, `classSeriesAcrossPeriods()`, and `aggregateVehicleClassTotalsByIntersection()` all held up — by-label aggregation throughout, container-scoped rendering (no BUG-017-class id reuse), and the new Aggregate-view addition sits safely before the existing `_areaAggRenderGen` staleness guard's final write (no new `await` introduced, so BUG-022's fix still covers it).

Live-verified with a fabricated 3-period, 2-intersection study (mismatched vPairs: Car/Truck/Bike vs. Car/Bus, two periods on the same date + one on a different date) and hand-checked every number: single-intersection chart's four groupings (15-min interval: 26/interval; day: 176 + 40; study period: 104/72/40) and the Aggregate view's new "Vehicle volume by intersection" chart (216 + 72 = 288, matching the stat card) all matched by-hand totals exactly. Rapid re-trigger of the Aggregate screen (3x back-to-back) still resolved to correct data.

One red herring worth recording: my first test fixture omitted `destinations` on each approach (a field I'd forgotten is always populated by `setup.js`, used throughout the analyze pipeline via `parsedFromPeriod()`) and threw a real, reproducible `TypeError` — but confirmed via `git grep` that every real approach the app itself creates always has this field, so it's a test-fixture gap, not a shipped bug. Also hit a second false alarm mid-audit: reusing the same long-lived browser tab across many reload cycles left a stale JS realm that kept re-writing an old broken fixture back into `localStorage` regardless of what was freshly seeded — resolved by opening a fresh tab. Neither is an app defect; noting both so a future audit doesn't re-chase the same dead ends.

No code changes were needed — committing pushed as-is.

## 2026-08-11 — v3.31.0-alpha.1

**Stage 7 opener — stacked bar chart, checked against scope first.** Pure data visualization, no engineering-analysis judgment involved (no LOS/warrant logic), so no scope debate needed — went straight to reading the existing chart code.

**Read `analysis/ui/charts.js` before writing anything — no dead `renderTimeOfDayChart` to find, and no existing stacked chart to extend.** DEVLOG's v3.27.0-alpha.2 entry flagged that name as removed dead code; confirmed it's genuinely gone (no call sites). The current "volume by interval" chart lives in `analysis/ui/summary.js`'s `renderDayBlock()`, calling `renderGroupedBarChart()` (vehicle: in vs out) or `renderBarChart()` (ped/tmc) from `charts.js` — neither shows a per-class breakdown at all, so the new stacked chart is genuinely additive, not a near-duplicate of something already there. `charts.js` already had `renderMultiSeriesBarChart()` (grouped, not stacked, N series side-by-side) with a `SERIES_COLOR_VARS` palette — reused that same palette and CSS classes (`chart-svg`/`chart-bar`/`legend`, defined in `analysis/style.css`) for the new `renderStackedBarChart()` rather than inventing new styling, so a vehicle class keeps the same color whether it's shown stacked or (elsewhere, if ever) grouped.

**Threading multi-period data through `renderIntersectionAnalysis()` without touching its existing period-picker/read-only-snapshot plumbing.** The "day" and "study period" groupings need every period's data, not just the one currently in view (`renderAnalyzePeriodContent()` normally only receives the selected period's parsed data). Rather than restructuring that flow, `repaintContent()` now also builds an `allPeriods` array (`{name, meta, vehParsed}` per period, via the same `parsedFromPeriod()` helper the single-period path already uses) and threads it through `ctx.allPeriods` — works identically for live-counting and read-only area-study-snapshot panes, since both already flow through the same `src.periods`/`analysisSource()` seam, and `captureActive()` (called at the top of `renderIntersectionAnalysis()`) already guarantees the live active period's entry in `src.periods` is fresh before this runs. "15-min interval"/"hourly" groupings deliberately stay scoped to the single currently-viewed period's own intervals — different periods aren't contiguous in time, so stacking them onto one time-of-day axis would misrepresent the data.

**Aggregation by class LABEL, not array position — same discipline as `aggregateVehicleClassTotals()`, and same reason.** Both new grouping-across-periods helper (`classSeriesAcrossPeriods()`) and the new Aggregate-view helper (`aggregateVehicleClassTotalsByIntersection()`) build a label→total map per group/intersection and take the union of labels across every group before building series arrays, instead of assuming every period/intersection shares the same `vPairs` ordering. Verified live with a fabricated 2-intersection area study where the intersections deliberately have different class sets (`Car/Truck/Bike` vs `Car/Bus`) — the Aggregate view's new "Vehicle volume by intersection" chart correctly stacked each intersection's own classes under the right label, with `Bus`/`Truck`/`Bike` each showing as present in only 1 of 2 intersections, matching the existing "Vehicle class breakdown" table below it exactly (same underlying data, per-intersection instead of collapsed).

**Aggregate view — added it too, judged small enough not to overcomplicate the first pass.** The brief left this as a judgment call. `aggregateVehicleClassTotalsByIntersection()` duplicates `aggregateVehicleClassTotals()`'s per-period accumulation logic (deliberately — refactoring the existing, working, already-audited function to share code felt riskier than a small, clearly-commented duplicate) but keeps totals per-intersection instead of collapsing them, feeding a straightforward one-card addition (`renderStackedBarChart({labels: intersection names, series: per-class totals})`) slotted between the existing class-breakdown table and the data-quality table. No new awaits introduced, so the existing `_areaAggRenderGen` staleness guard (BUG-022's fix) covers it without changes — re-verified with a harder-than-required rapid-refire test below anyway, since the task called for it whenever an async render path is touched.

**Verified live**, via a temporary in-browser fixture built directly through `window.__loadProject()` (the app's own project-load path, not a new test hook — nothing added to the shipped code, nothing left under `public/`):
- Single-intersection Analyze screen: seeded a 3-period study (AM/Midday Peak on 2026-08-10, PM Peak on 2026-08-11) with 4 vehicle classes (Car/Truck/Bus/Bike) and hand-picked per-interval counts. Confirmed the "15-min interval" grouping's per-bar totals (14/16/18/20 = 68) summed to exactly the same 68 shown in the existing Peak Hour stat card for that period. Switched through all four groupings (15-min → hourly → day → study period) and confirmed each repaint replaced the SVG cleanly with no stale segments left from the previous grouping (checked via DOM inspection, not just visually). "Day" grouping correctly combined AM+Midday (both 2026-08-10) into one 125-total bar and kept PM (2026-08-11) as its own 103-total bar; "study period" grouping showed 68/57/103 per period, matching each period's own total.
- Aggregate view: seeded a 2-intersection area study with intentionally mismatched `vPairs` (described above). New chart's per-intersection totals (29 and 52, summing to 81) matched the "Total vehicle volume" stat card exactly. Fired `renderAreaAggregateContent()` five times back-to-back with no waits — final DOM had exactly one `.chart-wrap`, no duplicates or stale content, confirming the pre-existing staleness guard still holds with the new chart in the render path.
- No console errors in either screen. `npm run build` passes cleanly.

## 2026-07-27 — v3.30.0-alpha.1 (audit note)

**Independent audit of the Aggregate view, before pushing.** The build agent that wrote this feature hit a mid-stream API error and never committed — its changes were sitting uncommitted in the working tree along with its own DEVLOG/CHANGELOG entries (below), so its "Verified live" claims got re-checked from scratch rather than trusted. Read the full `main.js`/`index.html` diff directly: `aggregateVehicleClassTotals()`, `sumVehicleModeOnly()`, `ixQaqcCoverageForIntersection()`, and the `_areaAggRenderGen` staleness guard all held up on inspection. One thing worth flagging for future sessions: a first pass grepped the wrong stylesheet (`src/style.css`) for `.stat-card`/`.card-grid` and found nothing, which looked like a real problem — they're actually defined in `src/analysis/style.css` (imported by `main.js`), the file the single-intersection Analyze screen's own stat-card row already uses. Checked both CSS files before concluding anything.

Re-verified live with a fabricated 2-intersection study (one vehicle-mode with Car/Bike, one TMC-mode with Car/Truck/Bus/Bike) and hand-checked the math independently: Car 192 (160+32), Bike 16 (16+0, correctly counted as appearing in only 1/2 intersections since B's bike total is zero), Truck 16 and Bus 16 (both B-only), total vehicle volume 176 (A only, correctly excluding B's TMC data via `sumVehicleModeOnly`), total TMC volume 64 (B only) — all matched by hand. Confirmed "review →" opens the correct intersection's Analyze screen. Fired `showAreaAggregateScreen()` three times back-to-back with no waits between calls — the final render still showed correct data, confirming the BUG-022-pattern staleness guard works. No console errors. Build passes. No further fixes needed — committing the agent's work as-is.

## 2026-07-27 — v3.30.0-alpha.1

**Study-wide Aggregate view — pure data aggregation, checked against scope before building.** The brief asked for a new area-study screen combining every intersection's data (stat cards, class breakdown, data-quality rollup), explicitly not the existing Summary screen (sortable per-intersection table + corridor chart, unchanged). Before writing anything, re-checked against the app's scope guardrails from the warrant/LOS removal (v3.24.0-alpha.1/.2 — this app is a field-count + QA/QC + reporting tool, not an engineering-analysis tool): everything built here is pure totals/breakdowns/completeness, no level-of-service grading or warrant-style judgment calls, so it's in-scope as data review.

**`.stat-card` / `.card-grid` already existed — the brief's "I checked, they don't" was wrong.** Both are defined in `analysis/style.css` and already used by `renderSummary()` (the single-intersection Analyze screen's own stat-card row). Used them directly for true visual parity with the single-intersection Analyze screen, rather than inventing a parallel system — the better outcome than what the brief assumed was necessary.

**Vehicle-class aggregation — by label, verified live with genuinely mismatched `vPairs`.** Built `aggregateVehicleClassTotals()` to walk every intersection's every period and accumulate per-class totals keyed by `vPairs[i].label`, handling both vehicle-mode (`vData`) and TMC-mode (`tmcData`, same shape `reconcileTmcClasses()` aligns during import — see BUG-019) periods. Verified live with a fabricated 2-intersection study — one vehicle-mode intersection with just Car/Bike, one TMC-mode intersection with Car/Truck/Bus/Bike — and confirmed the breakdown table correctly combined Car (220 = 84 + 136) and Bike (25 = 11 + 14) across both while Truck (12) and Bus (6) only showed up from the second intersection, with an "N / 2 intersections" column showing which class appeared where. Matching by array position instead would have silently added Bike's numbers under Bus's column for the first intersection (2-class vPairs vs. 4-class) — exactly the BUG-019/BUG-020-adjacent failure mode the task called out to avoid.

**Found a real accuracy bug in the pre-existing `sumVehicle()` (used by Summary), worked around it rather than fixing it in place.** `sumVehicle()`'s TMC-mode fallback ("derive motor volume (index 0) from tmcData") is a leftover from the old two-bucket `[motor, bike]` model that predates v3.28's multi-class DOT import — for a TMC intersection with Car/Truck/Bus/Bike classes it only reads the class at array index 0 (whichever class happens to be first), silently under-counting Truck/Bus volume, and would even wrongly zero-flag an intersection whose *first* class is empty but later classes have real data. Reproduced live in the same fixture: the aggregate view's "Total vehicle volume" stat read 231 (should have been the vehicle-mode-only total, 95) when built on top of `sumVehicle()`, because it silently added intersection B's Car-only slice (136) despite B being a pure TMC-mode intersection with no vehicle-mode data at all. Since fixing `sumVehicle()` itself would change the existing Summary screen's "Vehicle" column for every TMC-mode intersection in every study — out of scope per this task's explicit instruction not to touch Summary — added a local `sumVehicleModeOnly()` instead (strictly `vData`-based, no TMC fallback) for this view's "Total vehicle volume" stat and its zero-count data-quality flag, and left `sumVehicle()` itself untouched. Flagged the underlying `sumVehicle()` bug as a follow-up task (not fixed here) since it still affects the shipped Summary screen.

**QA/QC coverage rollup — reused existing recount data without re-running peak detection.** A full pass/fail rollup would normally mean re-running `ixDetectPeakStart()`'s async peak-window search across every period × window × row for every intersection just to paint one summary number — doesn't scale and isn't needed for a coverage rollup. Instead `ixQaqcCoverageForIntersection()` only scores recounts that already exist, reusing each recount's own already-resolved `cfg.startMinutes` (captured once, at recount time) as the window instead of re-detecting it, then calls the same `analysisData.qaqcPeakHourScore()` the standalone QA/QC screen and Trip Gen QA/QC already use. Judgment call: this reports coverage/pass-fail counts ("X of Y intersections reviewed", "N failing"), not a full Three-Peak-Hour-style letter grade — matches the task's own note not to force a QA/QC-clean rollup if it overcomplicates the first pass.

**Async render race — same BUG-022 pattern, guarded from the start, verified with a harder adversarial test than a simple re-trigger.** `renderAreaAggregateContent()` is async (`ixQaqcCoverageForIntersection` awaits a score per existing recount), so it got the same `_areaAggRenderGen` generation-counter guard `renderIntersectionQaqcScreen()` uses, checked immediately before the DOM write. Tested it harder than "click twice fast": seeded one intersection with 60 synthetic QA/QC recount entries (many awaits, deliberately slow to resolve) and a second with 1 (fast), fired both renders back-to-back without awaiting either, and confirmed the second (newer) call's data always won regardless of which one actually resolved first — repeated in both directions (slow-then-fast, fast-then-slow, similar-speed) with consistent results.

**Entry point — new "Aggregate" sidebar item next to Summary, not a sub-tab of it.** Both `renderSidebarArea()`'s Study section and `openWorkspaceTab()` gained one new case (`area-aggregate` → `showAreaAggregateScreen()`), and a new `area-aggregate-screen` in `index.html` mirroring `summary-screen`'s structure. Kept as a fully separate screen/sidebar entry rather than a toggle on the Summary screen, since Summary is explicitly out of scope to modify and the two views answer different questions (per-intersection sortable comparison vs. whole-study rollup).

**Verified live:** built a fixture area study (via a temporary `window.__testSeedAreaStudy()` test hook, removed before finishing — no scratch files left under `public/`) with the mismatched-vPairs intersections described above, confirmed the aggregate stat totals matched the sum of what each intersection's own Analyze screen showed for the same data (vehicle-mode intersection: 95 in both places; TMC-mode intersection: 168 in both places, cross-checked against its own North + South approach totals), confirmed "review →" and "QA/QC →" buttons correctly opened `showIntersectionAnalysis()` / `showIntersectionQaqc()` for the right intersection, ran the async race test described above, and checked the browser console throughout (no errors). `npm run build` passes cleanly.

## 2026-07-27 — v3.29.0-alpha.2

**Independent audit of the area-study QA/QC work (v3.29.0-alpha.1), before pushing — found a real async render race not caught by the agent's own testing.** Reading the diff directly, `ixQaqcSource()`/`showIntersectionQaqc()`/`flushPendingAutosave()`/`persistAreaStudySnapshotsOnly()` all held up — the design correctly mirrors `analysisSource()` and the BUG-020/021 fixes close the exact race they describe. But `renderIntersectionQaqcScreen()` is `async` (awaits `ixDetectPeakStart()` per QA/QC window) and writes its result to a shared DOM container (`#intersection-qaqc-list`) unconditionally at the end, with nothing checking it's still the most-recently-requested render.

**BUG-022 (Major).** Reproduced live: seeded a 2-intersection area study, opened intersection A's QA/QC, ran a real recount via dispatched keydown events (through the actual recount UI, not a shortcut), clicked finish, then — with no wait — called `showIntersectionQaqc(1)` to jump straight to B. B's screen displayed A's primary/recount totals (80/3) instead of B's own (160/—), because the recount-finish callback's own re-render of A (triggered synchronously by the finish click, `await`s internally) resolved *after* B's newer render had already started, and both write to the same container with no ordering guard. This is the same failure family as BUG-017 (stale writes to a shared element) via an async race instead of a duplicate DOM id.

Fixed with a module-level `_ixQaqcRenderGen` counter: each call to `renderIntersectionQaqcScreen()` captures its own generation number at entry and checks it's still current immediately before every DOM write (the two early-return messages and the final card render) — a superseded render silently no-ops rather than clobbering a newer one. Re-ran the same tight-race sequence after the fix (recount finish → immediate switch, ~10–50ms gap) — the newer intersection's data always wins regardless of which async call happens to resolve first.

**Also verified:** the non-racing path (switching intersections with the render allowed to complete first) shows correct, distinct primary totals for each intersection — confirms the underlying read path (`ixQaqcSource`/`ixPeriodSnapshot`) was never the problem, only the missing staleness guard on the write.

## 2026-07-27 — v3.29.0-alpha.1

**QA/QC feature parity for area-study intersections — the second half of a two-session gap.** An earlier session closed this gap for Analyze (`renderIntersectionAnalysis(containerEl, snapshotCtx)` — a read-only snapshot ctx or live state, resolved once via `analysisSource()`). QA/QC had no equivalent: it was only reachable from a standalone intersection project's own sidebar, reading and writing a single module-level `intersectionQaqc` global that only ever reflected whichever project was currently loaded live.

- Added `intersectionQaqc: {}` to every place an area-study intersection snapshot gets built (`tmcSheetToSnapshot`, `rawCountSheetToSnapshot`, `importCsv.js`'s `buildSnapshotFromMapping`), and made `serializeIntersectionSnapshot()` (the function that re-derives a live-edited area intersection's snapshot on autosave/switch) preserve whatever `intersectionQaqc` was already on that slot instead of dropping it — it never derives this from the live `intersectionQaqc` global, which is a completely separate, standalone-project-only store.
- `ixQaqcSource(snapshotCtx)` mirrors `analysisSource()`'s shape but adds a `qaqcStore` (the mutable `{key:{recounts:[]}}` object a recount writes into) and a `persist()` method — QA/QC has to write new data back, unlike Analyze. `snapshotCtx` is deliberately just `{ areaIdx }` rather than a value copy, so writes land on the live `areaIntersections[areaIdx].snapshot` object itself. Threaded `src`/`ctx` through every helper that used to read `vPairs`/`intersection`/`periods`/`activePeriodIdx` globals directly (`ixPeriodSnapshot`, `ixRowQuarters`, `ixDetectPeakStart`, `ixQaqcActiveRowGroups`), and through the recount-finish callback in `beginIxQaqcRecount`.
- New entry point `showIntersectionQaqc(idx)`, mirroring `showIntersectionAnalysis(idx)`: a "QA/QC →" button next to "Open in counter" on the intersection-detail Analyze screen, and one per row on the area-study Summary table.

**Two real bugs found and fixed during live verification, not caught by the build.** The task's required adversarial-ordering test (QA/QC intersection A → recount → switch to B → confirm independent → switch back to A → confirm A's recount persisted) reproduced real cross-intersection data corruption on the first attempt: after switching away and back, intersection A's primary counts had been overwritten with intersection B's data.

Root-caused with a temporary `window.__debugState()` hook comparing live globals against both intersections' stored snapshots side by side after each step (removed before finishing) — two compounding causes, both written up as BUG-020 and BUG-021 in BUGS.md:
1. **BUG-021 (the trigger, Critical):** `focus.js`'s `wireKeydown()` — the listener that drives the live counter's keyboard-to-count mapping — had no active-screen guard at all, unlike every other keyboard-driven module in the app. QA/QC recount keystrokes were *also* silently recorded as live counts against whichever intersection happened to be loaded live in the counter. This is a pre-existing bug that also affected the standalone QA/QC flow, just less visibly (the leaked counts landed on the *same* project you were recounting, so they read as noise rather than obviously-wrong data).
2. **BUG-020 (the corruption mechanism, Critical):** `showIntersectionAnalysis`/`showIntersectionQaqc` reassign `activeIntersectionIdx` for sidebar-highlight bookkeeping without reloading that intersection's data live — `window.scheduleAutosave()`'s area branch blindly re-derives `areaIntersections[activeIntersectionIdx].snapshot` from the live globals regardless of whether they match. BUG-021's keystroke leak fed exactly this mismatch.

Fixed both: `flushPendingAutosave()` (called before `activeIntersectionIdx` changes, in both `showIntersectionAnalysis` and `showIntersectionQaqc`) flushes any pending debounced autosave against the still-correct index first; `persistAreaStudySnapshotsOnly()` (QA/QC's own persist path) never touches the blind live-re-derivation at all. Re-ran the full adversarial sequence after both fixes — clean.

**Judgment calls:** Reviewer name/date fields (`ix-qaqc-reviewer-name`/`ix-qaqc-review-date`) stayed a single shared UI-only field, not persisted per area-study intersection — not in the task's enumerated requirements, and adding per-intersection reviewer metadata felt like scope creep for a first pass. Fixed the BUG-020/BUG-021 exposure only at the two entry points this task touches (`showIntersectionAnalysis`, `showIntersectionQaqc`), not a broader `activeIntersectionIdx` semantics refactor — the narrower fix closes the concrete, reproduced corruption without touching unrelated code paths.

**Verified live:** built a fresh area study with two manually-set-up intersections (distinct pedestrian counts each), then: QA/QC for intersection A → recount (matching primary, pass) → immediately (no wait) switch to B's QA/QC → confirmed B empty/independent → switch back to A → confirmed A's recount still there and primary counts un-corrupted. Separately verified the standalone (non-area-study) QA/QC flow end-to-end (setup → count → sidebar QA/QC → recount → pass), confirming no regression and that live counter data wasn't polluted by recount keystrokes there either. No scratch files were created on disk for this — all verification was done via live DOM/JS interaction against the dev server, no `public/__test_import/`-style fixtures needed.

## 2026-07-27 — v3.28.0-alpha.2

**Audit of the vehicle-class-preservation work, before pushing — found a real cross-sheet merge bug.** Reading the diff directly (not the completion summary) raised a question the agent's own testing didn't cover: `tmcSheetToSnapshot()` now builds `vPairs` fresh per sheet, from that sheet's own `classNames` — but `loadTmcSheet()`'s area-study merge path (`existing.snapshot.periods.push(...newPeriods)`) never reconciled a newly-merged sheet's classes against the already-established `vPairs`. Checked the one sample file available and its AM/PM sheets happened to report classes in the same order (Car/Truck/Bus/Bike both times) — but nothing in the DOT file format guarantees that across 20+ files, and if it ever diverged, the failure mode is silent data misalignment (wrong class label attached to the wrong numbers), not a crash — the worst kind of bug to ship.

**BUG-019 (Major).** Added `reconcileTmcClasses(existingSnapshot, newSnapshot)`: before merging a new sheet's periods into an existing area-study intersection, extend the existing `vPairs` with any class the new sheet reports that isn't already there (zero-padding every already-merged period's `tmcData` for that new column), then remap the incoming periods' `tmcData` into the existing `vPairs`' column order by label match rather than assuming positional consistency. Verified live against the real 2-sheet sample file (still the only real repro available) — merge still works correctly for the matching-class case, math checks out exactly (Car 116 + Truck 8 + Bus 6 + Bike 1 = 131).

**Also re-verified the flagged 5-leg "driveway" file doesn't crash on import** — it does import successfully (using the standard 4-way template, which — as already documented in the alpha.1 entry — will misassign the driveway leg's columns; that's a known, accepted limitation, not new). One thing worth noting for future test sessions: a mid-session browser preview reconnect silently dropped `window`-scoped test state between two separate tool calls, producing a false "zero intersections" reading that cost real time to chase down before being traced to the test harness, not the app. Keep file-injection + trigger-click in a single script execution when driving import tests this way, not split across calls.

## 2026-07-27 — v3.28.0-alpha.1

**DOT raw-count TMC import: stop collapsing vehicle classes into "Motor".** The user is bulk-importing 20+ legacy NYC DOT-format raw count files via the existing "Import Raw Count XLSX" feature. It already worked correctly (intersection name extraction, period splitting) but discarded the per-vehicle-class detail: each raw file has one row per 15-min interval per class (`Car`/`Truck`/`Bus`/`Bike`, verified against a real sample), and `parseDotTmcXlsx.js` was hardcoding exactly two output buckets (`motor`, `bike`), throwing that detail away. Fixed at the data layer, not by adding a data-model — `tmcData[from][to][slotIdx]` was already an array indexed by an arbitrary number of `vPairs` positions (that's how live TMC counting already works), the importer just wasn't using that capacity.

- `parseTmcIntervals()` now builds a `byClass` map per interval keyed by the sheet's actual Class-column string (title-cased), and returns an ordered `classNames` list (first-seen order) alongside the intervals.
- `groupIntoPeriods()` sizes each `tmcData` slot to `classNames.length` and fills by class position instead of the old fixed `[motor, bike]` two-slot layout.
- `parseDotTmcXlsx()`'s per-sheet result now carries `classNames` so the caller knows what each `vPairs` position means.
- `tmcSheetToSnapshot()` in `main.js` builds one `vPairs` row per class (label = the class name as found, e.g. "Car"/"Truck"/"Bus"/"Bike"), with sequential tmcKey letter assignment (same free-letter-pool pattern as `addAllVPairsToTmc()` in `setup.js`) — no more hardcoded "Motor"/"Bicycle" labels.
- Investigated the "with driveway" sample file (`120210_..._loc 3_R) with driveway-f-TH.xlsx`) for the 5-leg-intersection case the task flagged as a risk: its direction-column header row is irregular (an extra `TH` column breaking the standard 4-approach x 3-movement 12-column layout used by `DIR_MAP`/`STANDARD_APPROACHES`), consistent with an added driveway leg. This is a structural template change, out of scope for this pass — **not implemented**. That one file (and any others like it in the batch) will still import using the standard 4-way template, which will misassign or drop the driveway leg's columns. Flagging for dedicated follow-up rather than guessing at a template.
- Verified live against a real sample (`120208_raw_counts(...loc 1)f-TH.xlsx`, standard 4-way layout): imported project's `vPairs` came out as `[Car(a), Truck(b), Bus(c), Bike(d, isBike:true)]` with correct per-class per-approach numbers (spot-checked one interval: Car 208 + Truck 13 + Bus 13 + Bike 2 = 236, matching the interval's total).

**Interval Detail: expose the per-class breakdown that was already being computed and thrown away.** The TMC "Interval detail" table only ever showed one summed "Total entering" number per interval — `tmcParsed.types` (per-class labels) and `iv.counts[leg][leg]` (array indexed by class) already carried everything needed, nothing new to compute. Made each interval row click-to-expand (`.ix-tr-expandable` / `.ix-detail-row`, plain DOM toggle via event delegation, no framework) revealing a nested table: rows = vehicle classes, columns = approaches, cells = entering volume for that class at that approach in that interval, with row/column totals. Reused the `.data-table` styling pattern from the existing "N — movement breakdown" panel (`src/analysis/ui/tmcDiagram.js`) for visual consistency. Same code path serves live-counted and imported data since both produce the same `tmcParsed` shape.

## 2026-07-25 — v3.27.0-alpha.2

**Independent audit of the analyze/charts consolidation, before pushing — found a real bug the implementing agent's own live-testing missed.** Read the actual diff rather than trusting the completion summary, then re-ran the same live-browser checks (standalone analyze, inline Count-screen pane, workspace sidebar, area-study drill-down) plus one the summary didn't cover: visiting the inline pane *and then* the workspace screen in the same session, for the same project.

**BUG-017 (Major) — the sections rendered, but every body was empty.** Both `#counter-analyze-pane` and `#ix-analysis-content` build their own copy of `renderAnalyzePeriodContent`'s markup, and both copies use the same ids (`analyze-summary-root`, `analyze-qa-root`, etc.) — both can be mounted in the DOM at once (one just hidden via `display:none`). Every paint function queried those ids via global `document.getElementById()`, which always returns the *first* match in document order regardless of which pane is actually visible. Once the inline pane had rendered once, the workspace screen's paint calls silently wrote into the inline pane's hidden, stale copy — the visible screen's real containers never got touched, hence blank sections with no error. Fixed by scoping every one of those seven lookups to `root.querySelector(...)` (the pane-specific container already passed into the function) instead of the document. This is exactly the failure mode that single-context live-testing can't catch — it only reproduces under an adversarial *ordering* (pane A, then pane B, same session), not by testing each pane in isolation.

**BUG-018 (Minor) — a read-only snapshot with zero periods fell back to live state.** `repaintContent()`'s no-data branch didn't distinguish snapshot mode from live mode, so a snapshot with no periods (not reachable via any real project today, but possible from a malformed project file) would render whatever was in the live counting session instead of an empty state — wrong data shown with confidence, the worst kind of failure. Added an explicit read-only branch that shows "No period data available" instead.

**Also removed ~285 lines of confirmed-dead code** left behind by the consolidation (`snapshotTmcPeakHour`, `renderTMDiagram`, `renderTimeOfDayChart`, `renderModeSplit` — the old Charts sub-tab's bespoke chart builders, superseded by `renderSummary()`/`renderTmcSection()` but never deleted, only stopped being called). Confirmed zero call sites before removing.

**Process note:** the previous DEVLOG entry for v3.27.0-alpha.1 already documented the agent's own verification (four contexts, tested individually). The gap wasn't a lack of testing — it was that no single test crossed contexts in the same session. Worth remembering for any future audit: test the *transition* between two things that share underlying state or markup, not just each thing on its own.

---

## 2026-07-25 — v3.27.0-alpha.1

**Two analysis screens, one design — read both in full before deciding the consolidation shape.** The app had `renderIntersectionAnalysis()` (live global state — `periods`/`vData`/`pedData`/`tmcData` from `state.js` — with a proven stat-cards → chart → data-quality → tables hierarchy) and `renderIxAnalysis()` (a serialized read-only snapshot — `areaIntersections[i].snapshot` for an area-study child, or `serializeIntersectionSnapshot()` for a standalone project — with a table-first design dominated by a 96-row raw interval table). Rather than picking one and reimplementing the other's data access on top of it, generalized the *data-shape* functions (`parsedFromPeriod`, and by extension `renderAnalyzePeriodContent`/`renderAllPeriodsView`) to accept an optional `ctx = { intersection, vPairs, readOnly }` — live callers omit it and get the current globals; snapshot callers pass the snapshot's own `intersection`/`vPairs`. A new `analysisSource(snapshotCtx)` is the single seam: it returns `{ periods, activePeriodIdx, ctx, captureActive() }`, live mode reading/flushing the real globals (`activePeriodIdx` reflects the actual counting period, `captureActive()` calls `captureActivePeriod()`), snapshot mode returning `activePeriodIdx: -1` (no "currently counting" marker makes sense for a read-only view) and a no-op flush.

**Why the standalone intersection project's workspace-sidebar Analyze screen no longer uses a snapshot at all.** The old `renderIxAnalysis()` always read through `areaIntersections[idx]?.snapshot || serializeIntersectionSnapshot()` — even for a standalone (non-area-study) project reviewing its *own* live data, it round-tripped through a serialize call. Since that's the same in-memory project as the Count screen's inline Analyze pane, there's no reason to indirect through a snapshot: `openWorkspaceTab('analyze')` now calls `renderIntersectionAnalysis(container, null)` (live mode) directly, which is a strict superset of the old behavior — it now also gets Export page, Before/After comparison, and the "currently counting" period dot, none of which the old snapshot-based version could offer since those features need live project metadata (`periodMeta`, `projectInfo`, `cfg`) that a snapshot doesn't carry. Only `showIntersectionAnalysis()` (the area-study corridor-chart drill-down, called for a *child* intersection whose data usually isn't loaded into live state) still passes a real snapshot context.

**"Analyze" vs "Charts" nav items — collapsed to one, not kept as two views into the same screen.** Before this change the two nav buttons opened the same `ix-analysis-screen` but toggled `ixAnalysisView` between a table-first "Data" sub-view and a chart-first "Charts" sub-view (turning-movement diagram, time-of-day line chart, mode-split donut). The consolidated design already interleaves stat cards, a volume chart, data quality, and detail tables together per dataset tab (Vehicle/Pedestrian/Turning movements) — there's no longer a meaningfully separate "charts only" screen to switch to, so keeping two nav items would just be two links to the identical screen. Removed the "Charts" sidebar button; `openWorkspaceTab`'s `'charts'` case is kept as a dead-simple alias of `'analyze'` in case anything else still dispatches it.

**Interval detail — demoted, not deleted.** The old `renderIxAnalysis`'s "15-Minute Distribution" table (every interval, every crosswalk/TMC column, always expanded) was the single dominant element of that screen. The consolidated screen keeps the same numbers but behind a per-dataset-tab `<details>` toggle (`renderIntervalDetailSection`, collapsed by default, `max-height:420px` scroll with a sticky header once expanded) placed after Data Quality and before Before/After comparison — available in one click, but no longer competing with the stat cards for attention on first paint.

**Area-study drill-down — the highest-regression-risk piece, tested explicitly.** `showIntersectionAnalysis(idx)` now resets `container._viewPeriodIdx = null` before rendering so switching between sibling intersections (which can have different period counts) doesn't carry over a stale period index from whichever one was viewed previously. Verified live: opened "TMC Area Test" (a 3-intersection area study already in the autosave history), drilled into "Main St & 2nd Ave" then "Oak Blvd & 1st Ave" from the sidebar, confirmed each showed that intersection's own totals (not the previous one's — e.g. approach total 383 vs. 253), confirmed the Interval Detail `<details>` toggle worked and re-collapsed on switching intersections, and confirmed Vehicle/Pedestrian/Turning-movements dataset tabs all rendered correctly off the snapshot data.

**Caption-overlap bug (BUG-016) — traced to inline-style specificity, not a missing rule.** First fix attempt added `body.workspace-mode #counter-instructions{margin-left:224px}` to the existing shared selector list and it silently did nothing — the caption's `style="margin:10px 24px 0"` inline attribute already set `margin-left:24px` directly on the element, and no external stylesheet rule beats an inline style regardless of selector specificity. Fixed by moving the base margin out of the inline attribute into `src/style.css` so the workspace-mode override rule has something it can actually win against. Caught the "did nothing" outcome by reading `getComputedStyle(...).marginLeft` in the live browser rather than trusting the CSS diff looked right.

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
