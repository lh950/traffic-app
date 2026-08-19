# Bug tracker

Severity levels:
- **Critical** — data loss, broken save/load, app crash
- **Major** — a workflow is broken but has a workaround
- **Minor** — wrong behavior, doesn't block use
- **Cosmetic** — visual only

---

## BUG-036
**Status:** Fixed (v3.44.0-alpha.1, user-reported: mid live count on a Trip Gen location, hit "setup" to fix a classification without finishing — correctly avoiding "finish location" since the count wasn't done (exactly the case BUG-034's autosave net covers) — then, since the in-progress location correctly didn't appear in the committed Locations list yet, assumed nothing had started and clicked "begin counting" again, landing on what they described as a blank counter screen; recovered via reload + autosaved resume with no data actually lost)
**Severity:** Critical (a second "begin counting" click could silently discard the first, unfinished count's live in-memory state)
**Found in:** `main.js`'s `btn-tg-begin-counting` click handler, `tripgenCount.js`'s `beginCounting()`
**Description / root cause:** An in-progress Trip Gen count was tracked only via the module-level `tgPendingLocation` side-channel — nothing created a real `tripgenEntries` row until "finish location" ran. So a user who stepped away mid-count with the location correctly not yet appearing in the Locations list had no visual evidence anything was in progress, and re-clicking "begin counting" unconditionally called `tgBeginCounting()` again, which re-zeroes `tgData`/`classifications`/`slot` and overwrites `onFinish` — silently discarding the first session's live state (any counts entered since its last autosave tick).
**Fix:** Redesigned so "begin counting" creates the location's `tripgenEntries` row immediately (zeroed `parsed`/`editSnapshot`, `inProgress:true`), before the counter screen even opens, and sets `tgPendingLocation` to the same `{kind:'edit', entryId, dayIdx}` shape `editTripgenDay()` already uses to resume a finished entry — an in-progress entry is now just a special case of "editing an existing entry," not a separate code path. The Locations list shows an "● in progress" badge and a "resume count" button (reusing `editTripgenDay()` verbatim) on any such entry. `window.scheduleAutosave`'s debounced callback now also writes the live snapshot into that entry's `day.parsed`/`day.editSnapshot` on every autosave tick (not just into the separate BUG-034 `pendingLocation` reload-resume channel), so the entry itself stays current while counting continues, not just zeroed-and-stale. The "finish location" button was renamed **"save location and exit"** (see `CHANGELOG.md`) since it no longer means "count complete" — the entry is already saved from the moment counting started.
**Verified live** (dispatched real events, not calling internal functions directly): started a new Trip Gen count with a fresh 8-classification numpad-preset list, pressed a key twice, clicked back-to-setup without finishing, confirmed the Locations list immediately showed 1 entry with "● in progress" and a "resume count" button. Clicked it, confirmed the counter reopened with the exact 2 counts intact (not zeroed). Clicked "save location and exit," confirmed the entry's "in progress" badge cleared and the location count stayed at 1 (no duplicate entry created). No console errors throughout.
**Not addressed:** exact root cause of the user's reported "blank counter screen" (as opposed to the confirmed data-loss mechanism above) wasn't independently reproduced — the redesign structurally prevents the destructive re-click regardless, so it's moot going forward, but if a blank-screen render bug exists independently of this data-loss path it hasn't been ruled out.

---

## BUG-035
**Status:** Fixed (v3.43.0-alpha.6, user reported immediately after BUG-034: "locations and classifications did not save - but i also had no count data. but since this is config data it should always save")
**Severity:** Critical (data loss — project-wide config, not count data, silently excluded from every save)
**Found in:** pre-existing since Trip Gen classifications moved to their own tab — `serializeCurrentProject()`'s `tripgen` branch, `main.js`
**Description / root cause:** `classifications` (the labels/keys/descriptions configured on the Classifications tab) was never included in the object `serializeCurrentProject()` returns — not in autosave, not in an explicit "save project" export. A pre-existing code comment revealed the original design intent: classifications were deliberately treated as disposable "whatever's queued for the next new location" staging state, unconditionally wiped by `tgResetClassifications()` on every project load specifically to prevent one project's classifications leaking into another (the same BUG-027 leak class). That design predates classifications becoming real project-wide config with their own dedicated tab, and was never revisited — so real, deliberately-configured classification data was being silently discarded exactly like disposable scratch state. Also found, contributing to the same report: none of the classification editor's mutation handlers (add, edit label/key, edit description, reorder, remove) ever called `window.scheduleAutosave()` at all, so even a fix to the serializer alone wouldn't have helped until something actually triggered a save.
**Fix:** `serializeCurrentProject()`'s tripgen branch now includes `classifications: tgGetClassifications()`. New `restoreClassifications()` in `tripgenCount.js` replaces the unconditional reset in `loadProject()`'s tripgen branch — restores what was saved, still resetting to empty only when the loaded project genuinely has none (preserving the original anti-leak intent without discarding real saved data). `addClassification()`, the label/key/description input handlers, the drag-reorder drop handler, and the remove handler in `renderClassificationsList()` now all call `window.scheduleAutosave()`.
**Verified live:** cleared autosave, added 3 classifications with zero count data anywhere, renamed one label via a real `input` event, confirmed the autosave snapshot captured all 3 (including the rename) with `entries: []`, reloaded the page, clicked "resume," and confirmed the classifications tab showed the exact same 3 rows with the rename intact. No console errors. (Did not re-verify the new-project anti-leak path live — code path unchanged, already covered by BUG-027's own verification.)
**Not yet resolved — needs clarification:** the user's report also named "locations" as not saving. `tripgenEntries` (committed/uploaded/pasted locations) were already included in the serializer before this fix, and `renderTripgenLocationsList()` already triggers autosave on every entries mutation — so a location that was actually finished/uploaded/pasted should already persist. The likely explanation is that no location had been committed yet (only address/date typed into the "Add a location" form, which is uncommitted form input, not project config, and isn't expected to survive a reload any more than any other not-yet-submitted field would) — but this hasn't been confirmed with the user and may point to a real, separate gap if that's not what happened.

---

## BUG-034
**Status:** Fixed (v3.43.0-alpha.5, caused real field data loss — user reported "auto save did in fact not keep the data, it saved project info but not the counts" while mid-count on the deployed app)
**Severity:** Critical (data loss — an in-progress Trip Gen count had zero persistence of any kind; leaving the counter screen before clicking "finish location," for any reason, silently discarded it with no trace, in both autosave AND an explicit "save project" export)
**Found in:** pre-existing since Trip Gen live counting shipped — `tripgenCount.js`, `main.js`'s `serializeCurrentProject()`
**Description / root cause:** `serializeCurrentProject()`'s `tripgen` branch only ever wrote `tripgenEntries` — locations already committed via "finish location." Unlike the intersection counter (which snapshots the live active period into every serialize via `captureActivePeriod()`) and unlike `counter.js` (which schedules autosave on every keystroke), nothing in `tripgenCount.js` ever called `window.scheduleAutosave()`, and even if it had, there was no code path to capture the live, not-yet-finished `tgData`/`classifications` into anything durable. Confirmed live: started a count, entered real values, navigated back to setup via the intended "back" button (correctly avoiding "finish location" since the count wasn't actually done), and reproduced the user's exact report — the autosave snapshot showed the location entirely absent, and an explicit "save project" export was identical.
**Fix:** New `captureLiveSnapshot()` in `tripgenCount.js` (mirrors `finishLocation()`'s `{types, defs, intervals}`-building logic without requiring the count to be finished or invoking the finish callback). `record()`/`undo()`/`redo()` now call `window.scheduleAutosave()` on every action, matching the main counter's pattern. `main.js` tracks a new `tgPendingLocation` (kind `'new'` or `'edit'`, plus enough context to know how to commit it later) whenever a live count session starts, cleared the moment "finish location" actually runs. `serializeCurrentProject()`'s tripgen branch now includes a `pendingLocation` snapshot whenever one is active. `loadProject()`'s tripgen branch now checks for `pendingLocation` on load and — instead of landing on the bare setup screen — resumes straight back into the counter with the in-progress data restored, routing the eventual "finish" to the correct destination (push a new entry for `kind:'new'`, or update the existing entry's day in place for `kind:'edit'`, the latter verified to never touch the already-committed data until finish is clicked again).
**Verified live, both paths, via real dispatched keydown events (not calling internal functions directly):** (1) started a new count, recorded `inbound:[2,3] outbound:[1,0]`, left via the back button without finishing, confirmed the autosave snapshot now captured that exact data, reloaded the page, clicked "resume," and landed back in the counter with the identical numbers intact — pressed one more key and clicked finish, confirmed it committed correctly (`inbound:[3,3]`) and cleared the pending state. (2) Reopened that finished location for editing, added 2 more outbound counts, left without re-finishing — confirmed the edit-in-progress was captured separately in `pendingLocation` (`outbound:[3,0]`) while the already-committed entry was left untouched (`outbound:[1,0]`), so an abandoned edit session can't corrupt previously-saved data. No console errors in either run.
**Known minor gap, not data loss:** a resumed session always reopens at interval 0 (matching how reopening any finished location for edit already behaves) rather than the exact interval the user had scrolled to — every count value is preserved, the user may just need to scroll back down.
**Also noticed, not fixed (pre-existing, separate, lower severity):** `tripgenNextId` is never recomputed from loaded entries on `loadProject()` — always resets to 1, risking an id collision with existing entries if a new location is added after loading a project with entries already present. Flagging for a follow-up; out of scope for this fix.

---

## BUG-033
**Status:** Fixed (v3.43.0-alpha.4, reported by the user as "reopening a finished Trip Gen location for edit shows a smaller page that doesn't render correctly / doesn't fit screen"; investigation found it's not edit-path-specific)
**Severity:** Major (the trip-gen counter and the intersection QA/QC recount counter — both live-keystroke-driven screens — visually broke every time they were opened, header controls squeezed into roughly the right 65% of the screen and misaligned)
**Found in:** pre-existing since BUG-028 (which added workspace-mode margin-left offsetting for these two screens) — `#tripgen-counter-screen` and `#intersection-qaqc-counter-screen`, `src/style.css`
**Description / investigation:** Reproduced live in-browser (dev server + DOM/CSS measurement via the browser tools, screenshots unavailable in this environment) rather than guessing from code: built a fresh Trip Gen location with 6 classifications, finished it, reopened it via the "edit counts" button, and compared computed geometry against a freshly-started count. The two paths turned out byte-identical (same `outerHTML`, same layout) — so the bug is NOT specific to the edit-reopen flow as originally suspected; it's present on every visit to either screen, fresh or reopened. Two independent, compounding CSS bugs were found:
1. `#tripgen-counter-screen`/`#intersection-qaqc-counter-screen` are bare `<div>`s whose only source of flex-column layout was an inline `style="display:none;flex-direction:column;min-height:100vh"` attribute. `showScreen()` (`src/main.js`) does `el.style.display = s===id ? '' : 'none'` on every navigation — clearing `display` to `''` removes the `none` but never re-adds `flex`, so the div silently fell back to the UA default `display:block` the instant either screen was shown. Confirmed live: `getComputedStyle(screen).display` was `"block"`, and the inline style attribute read only `"flex-direction: column; min-height: 100vh;"` — no `display` at all. This differs from the intersection counter's own `#counter-screen`, which has a dedicated `#counter-screen.active{display:flex}` stylesheet rule that survives the inline-style wipe via the `.active` class toggle instead of inline style — the two screens fixed here never got the equivalent rule.
2. Independently, each screen's `<header class="counter-header">` was ALSO matched by the generic `body.workspace-mode .counter-header{margin-left:224px}` rule (written for `#counter-screen`, which uses `padding-left:0` on itself + `margin-left:224px` on children instead — see BUG-016). BUG-028's fix instead put `margin-left:224px` directly on the OUTER screen container for these two screens, so the nested `.counter-header` was being shifted TWICE (224+224=448px total), confirmed live via `getBoundingClientRect()`: header `left:448, width:832` instead of the correct `left:224, width:1056`.
**Fix:** Added `#tripgen-counter-screen.active, #intersection-qaqc-counter-screen.active{display:flex}` (mirroring `#counter-screen.active{display:flex}`), and `body.workspace-mode #tripgen-counter-screen .counter-header, body.workspace-mode #intersection-qaqc-counter-screen .counter-header{margin-left:0}` to cancel the double offset, in `src/style.css`.
**Also investigated, did not reproduce:** the user separately reported that Trip Gen's focus mode "doesn't render correctly / doesn't fit the page" — confirmed live this was the SAME root cause (missing `display:flex` broke `.tables-area{flex:1}`'s height distribution and general flex-column stacking for the whole screen, focus mode included); re-verified after the fix that the focus bar now renders full-width (`left:224, width:1056`) directly under the header with no overlap. Separately, a report that "group key bindings don't properly change in focus mode" (`]`/`[` cycling groups while focused) was investigated live in both Trip Gen (`tripgenCount.js`) and the intersection counter (`focus.js`/`counter.js`/`state.js`) by dispatching real keydown events and checking table footer totals before/after, forward and backward across group boundaries, including the case where two different groups intentionally share a physical key — the correct column incremented every time and the stale-group key was correctly ignored. Did not reproduce; no fix applied. Flagging here in case it's environment- or timing-specific and resurfaces.
**Verified live:** re-ran the original repro (6-classification location, finish, reopen for edit) after the fix — `getComputedStyle` confirmed `display:flex` on the screen, and the header/kbd-grid/tables-area all measured full `1056px` width starting at the correct `x:224` sidebar offset, matching the fresh-count screen exactly. No console errors.

---

## BUG-032
**Status:** Fixed (v3.43.0-alpha.2, flagged by the agent that fixed BUG-031 as a same-class leak at a different entry point, user asked to fix directly)
**Severity:** Major (a genuinely new project could silently start pre-configured as whatever the previously-open project in the same tab happened to be — wrong template, wrong diagonal leg, wrong enabled count types — with no visual indication anything carried over)
**Found in:** pre-existing (`home-btn-intersection` click handler, `src/main.js`), since the home screen's "Intersection count" card was added
**Description:** Clicking "Intersection count" from the home screen to start a brand-new project never reset the module-singleton `intersection` object, `TEMPLATES.t5`/`t3` `.slots`, or `enabledModes` — all three just kept whatever a previously-configured project (in the same browser tab) had last set them to. Reproduced live: configured one project as a 5-way intersection with `diagLeg:'NE'` and turning-only enabled modes, then started a second brand-new project without reloading the page — it opened already showing the 5-way template, `NE` diagonal leg, and turning-only checkboxes instead of the documented defaults (4-way, `SE`, all three modes enabled).
**Root cause:** No reset-before-populate on the "new project" entry point — the same bug class as BUG-027 (stale global) and the diagLeg-desync part of BUG-031 (stale template slots), but at a third, previously unaudited trigger (starting new vs. loading existing).
**Fix:** New `resetIntersection()` in `src/state.js` (delete-then-`Object.assign` back to the documented default shape, per the BUG-027 pattern — not `Object.assign` alone, which would leave stale keys). Wired into `home-btn-intersection`'s click handler along with: `syncTemplateSlotsFromIntersection()` (resets `TEMPLATES.t5`/`t3.slots`), an explicit reset of all three `enabledModes` flags plus `syncCountTypeToggles()` (the checkbox DOM doesn't auto-follow the JS object — first attempt at this fix reset the object but left the `ct-ped`/`ct-vehicle`/`ct-turning` checkboxes visually unchanged), and the same render-refresh call set `loadProject()`/`switchIntersection()` already use after restoring `intersection` (`buildTemplateGrid`, `renderVPairsList`, `updateDerived`, `renderLegConfig`, `renderSetupDiagram`, `updateTemplateSuboption`, `initApproaches`) — without these, the 5-way diagonal-leg pill selector stayed visually stuck on the old template's markup even though the underlying state was already correct.
**Verified live:** repeated the exact repro (5-way/`NE`/turning-only → new project) after each of two fix iterations; first iteration correctly reset `intersection.template` and the diagLeg pill's active state but left the count-type checkboxes and the diag-leg pill sub-panel showing stale values; second iteration (adding `syncCountTypeToggles()` and the full render-refresh set) came back completely clean — new project shows 4-way, `SE` (pills hidden via `display:none` as expected for t4), and pedestrian/vehicle/turning all re-checked. No console errors.

---

## BUG-031
**Status:** Fixed (v3.43.0-alpha.1, reported live by the user during a real 5-way TMC field count — session was killed mid-fix by a prior agent; this session verified and finished the in-progress uncommitted work, plus found and fixed one more related bug during the diagLeg audit requested alongside it)
**Severity:** Major (destination-order bug made a real field count visually confusing enough to misread movements; TMC-only default-mode bug forced a manual mode switch every single project open; the project-load diagLeg desync could silently misassign a whole leg's turning data)
**Found in:** pre-existing — destination ordering since the turn-classification/`app.destinations` model shipped, TMC-only default since `startCounting()`'s mode handling was written, project-load diagLeg desync since `setDiagLeg()` was added for the 5-way template
**Description / root cause (four related fixes):**
1. **Destination turn-ordering split Lefts apart.** `app.destinations` (an approach's list of valid destination legs) was stored in raw template/insertion order everywhere it was populated (`toggleApproachDestUnified`, `validDestinations`, `toggleLegOneWayIn`, `initApproaches`), with no sort applied by any consumer (the counter's TMC grid, the turning diagram). On a 5-way intersection, this could put two Left-turn-classified destinations on opposite ends of an approach's movement list — one grouped naturally near "Thru," the other stranded after "Right" — because raw template order has nothing to do with turn classification. Fixed by a new `sortDestsByTurn(leg, arr)` helper (`setup.js`) that stable-sorts an approach's destinations by `classifyTurn()`'s L/T/R/U bucket, applied at every mutation site above.
2. **TMC-only projects opened into empty vehicle mode.** `window.startCounting` never picked an initial mode based on `enabledModes` — `mode` defaults to `'vehicle'` (`state.js`) and nothing called `setMode()` before opening the counter workspace. A project with vehicle and pedestrian both disabled (TMC-only) still opened showing the empty, disabled vehicle screen, forcing a manual click into turning mode every time. Fixed with a new `pickInitialMode()` (`main.js`) mirroring `buildCounterSidebar()`'s own ped→vehicle→turning priority order, called via `if (!enabledModes[mode]) setMode(pickInitialMode())` right before the workspace opens — only overrides when the currently-active mode isn't actually enabled for this project, so normal projects are untouched.
3. **Approach/movement active-selection was a flat, easy-to-miss background swap.** `.app-sel-btn.active` only changed background/text color (no ring, no weight change), noticeably weaker than the already-existing `.mov-sel-chip.active` treatment (focus ring + bold + scale) one row below it — user feedback: selection "wasn't super clear." Brought `.app-sel-btn.active` up to the same ring-highlight language (`box-shadow:0 0 0 1.5px var(--blue-border)` + `font-weight:700`) and turned `#tmc-active-summary` (`counter.js`) from plain text into a filled pill (`background:var(--blue-bg)`, bordered, padded), matching the same blue-bg/border/text tokens used for every other "active" state app-wide.
4. **Project load didn't resync the 5-way/T-intersection template's diagonal/missing leg to the loaded project.** `setDiagLeg(leg)`/`setMissingLeg(leg)` correctly mutate the shared `TEMPLATES` array's `t5`/`t3` `.slots` in place when the user clicks a diagLeg pill live — `classifyTurn()` keys purely off real compass-letter leg strings (`LEG_BEARING`), so once `tpl.slots` holds the actual leg (e.g. `'NE'`), turn classification and the new destination sort above both work correctly for any diagLeg, not just the hardcoded `'SE'` default. But `TEMPLATES.t5`/`t3.slots` are module-singleton arrays, and BOTH project-load paths (`loadProject()` and the area-study `loadIntersectionIntoView()`/`switchIntersection()`) restore `intersection.diagLeg`/`missingLeg` via `Object.assign(intersection, proj.intersection)` and then immediately call `initApproaches()` — **without** going through `setDiagLeg()`/`setMissingLeg()` first. `initApproaches()` reads `tpl.slots`, which is left holding whatever diagonal/missing leg some *earlier* project in the same browser session last set (or the `'SE'`/`'S'` hardcoded defaults on a fresh page load) — not the just-loaded project's actual value. For a 5-way project whose `diagLeg` differs from that stale value, `initApproaches()` would silently derive approaches for the wrong 5th leg letter, dropping/misplacing that leg's configuration on load. Fixed with a new exported `syncTemplateSlotsFromIntersection()` (`setup.js`) that rebuilds `tpl.slots` from the live `intersection.diagLeg`/`missingLeg`, called at both load sites right after `Object.assign(intersection, ...)` and before `initApproaches()`.
**Verified live:** dev server, real UI flow, not fixture-driven.
- Built a 5-way project with `diagLeg:'NE'` (not the default `'SE'`) via the actual template-card + diagLeg-pill UI, enabled turning movements only (ped + vehicle disabled). Inspected `window.intersection` — `diagLeg:'NE'` and `TEMPLATES.t5.slots` correctly ending in `'NE'`, not `'SE'`. Opened the NE approach in the live counter — movement list read **"Left (E), Left (S), Right (N), Right (W)"**, the two Lefts correctly grouped adjacently — reproducing and confirming the fix for the user's exact original 5-way bug, using a real non-default diagonal leg (validates finding #4 didn't silently break finding #1).
- Same TMC-only project: `start counting` opened directly into Turning movement mode (COUNT MODE showed "↻ Turning movement" active, not "🚗 Vehicle") with no manual mode switch needed.
- Confirmed the active-state visual changes render: `getComputedStyle` on an active `.app-sel-btn` showed `box-shadow: 0 0 0 1.5px` + `font-weight:700`; `#tmc-active-summary` showed a filled `background-color` pill with padding, not plain text.
- New Data Quality flag (below, WRONG_MODE) verified in the same session — see BUG entry there for that scenario specifically.
- No console errors through any of the above.

---

## BUG-030
**Status:** Fixed (v3.42.1-alpha.1, reported live by the user while setting up an intersection count)
**Severity:** Major (a documented, supported capability — up to 12 vehicle types across 3 keybinding groups — was completely unreachable through the UI; the only way past 4 types was importing a saved project's `vPairs` wholesale via "copy from project…")
**Found in:** pre-existing (the "counting types" panel, `#sp-vehicle` in `index.html`, live since the v3.23.0 single-master-list refactor)
**Description:** The setup screen's own help panel documents "Up to 12 types across keybinding groups of 4," and `setup.js` already had a fully-working `updateVCount(n)` function (grows `vPairs` to `n` entries, reusing the 4-key group pool exactly like the keybinding-groups feature expects) — but no control in `index.html` ever called it. The two presets (`applyVPreset`) each set exactly 4 rows, "+ bicycle" adds exactly one special row (capped at 1), and "copy from project…" only helps if you already have a saved project file with more types. A user starting fresh had no way to add a 5th, 6th, ... type by hand.
**Root cause:** `updateVCount(n)` was written (and still exposed via `Object.assign(window,{...})` in `main.js`) for what was presumably an earlier numeric-input-driven UI, but no `<input id="v-count">` or equivalent control exists in the current `index.html` — the function was fully wired on the JS side and completely orphaned on the markup side.
**Fix:** Added a `+ vehicle type` button (`#btn-vpairs-add-type`) next to the existing `+ bicycle` button in the "counting types" panel's preset row, calling the existing `updateVCount(vPairs.length+1)` — one new row per click, correctly landing in the next keybinding group of 4 (reusing the exact logic already used for presets/import). `renderVPairsList()` hides the button once 12 non-bicycle types are reached, matching the help text's documented cap and mirroring how the bicycle button already hides once a bicycle row exists.
**Verified live:** dev server, real UI flow (Playwright-driven, not fixture-driven) — started a new intersection count, opened "counting types," confirmed exactly 4 default rows and a visible `+ vehicle type` button. Clicked it repeatedly: row 5 appeared under a new "Group 2" separator with the correct reused A/S/D/F·J/K/L/; keys, continued through row 12 (Group 3), at which point the button correctly hid itself. Confirmed "+ bicycle" still works independently alongside it (13th row, its own button then hides). No console errors from any of these interactions.

---

## BUG-029
**Status:** Fixed (v3.38.0-alpha.1, caught while building the matching per-group conflict check for Trip Gen — pre-existing, not caused by this session's earlier work)
**Severity:** Minor (only the red per-input `key-conflict` highlight was affected; the overall "duplicate keys" banner still correctly detected a conflict somewhere, and the conflict itself — sharing a key within one group of 4 vehicle types — is rare in practice since it requires 9+ vehicle types)
**Found in:** v3.23.0 (`checkVKeys()` in `setup.js`, shipped with the original vPairs keybinding-groups feature)
**Description:** For a vehicle-types list with 9 or more entries (3+ keybinding groups), a same-group key conflict in the 3rd group onward (types 9–12, 13–16, ...) was silently NOT highlighted red on the specific offending key inputs, even though the global "duplicate keys" warning banner still showed. Groups 1 and 2 (types 1–8) were unaffected.
**Root cause:** The conflict-detection loop (`for(let g=0;g<vPairs.length;g+=4)`) records conflicts keyed by the group's START index (`g` = 0, 4, 8, ...). But the per-input scan that reads those conflicts back computed its own group id as `Math.floor(idx/4)` — a group NUMBER (0, 1, 2, ...), not a group start index. These only coincide for group 0 (both give 0); group 1 stores under key `4_x` but was read back under `1_x`, group 2 stores under `8_x` but was read back under `2_x`, etc. — so no group past the first ever matched.
**Fix:** Changed the read-side group id to `Math.floor(idx/4)*4`, matching the write-side loop's group-start-index convention. Applied the identical fix pattern proactively to Trip Gen's new equivalent (`checkKeyConflicts()` in `tripgenCount.js`) so the same mismatch wasn't introduced there.
**Lesson:** A loop variable reused as a lookup key needs the read side to reconstruct that key with the exact same formula, not just "the same idea" (group start index vs. group number look superficially interchangeable but only agree at index 0). Found only because writing a second, independent implementation of the same per-group scoping (for Trip Gen) prompted comparing formulas side by side.

---

## BUG-028
**Status:** Fixed (v3.36.0-alpha.3, reported live by the user while field counting on the then-deployed v3.35.0-alpha.2 — pre-existing, not caused by this session's earlier work)
**Severity:** Major (a real, currently-deployed workflow was unusable at normal viewport sizes — the leftmost ~224px of the screen, including the header title, the keyboard reference bar, and the first table column, rendered underneath the opaque workspace sidebar)
**Found in:** pre-existing (`#tripgen-counter-screen`, live since Trip Gen's original counting-engine ship; also reproduced in `#intersection-qaqc-counter-screen`, live since the QA/QC recount feature)
**Description:** User reported "the actual count screen does not properly fit in the window" on the Trip Gen live counter. Reproduced live at both 1366×768 and 1280×800: the fixed 224px-wide workspace sidebar (`.app-sidebar`, `position:fixed;z-index:100`) rendered directly on top of the counter screen's left edge — the "trip generation" header title, the first ~1.5 classifications' worth of keyboard-reference chips, and the table's `time` column plus part of the first classification's columns were all hidden underneath it and inaccessible. Independently confirmed the same root cause reproduces in `#intersection-qaqc-counter-screen` (the QA/QC recount counter), which shares the identical structural gap.
**Root cause:** Every other workspace screen gets pushed right of the fixed sidebar via one of three existing CSS rules: the generic `body.workspace-mode .workspace-screen{margin-left:224px}` (applies to any screen carrying the `.workspace-screen` class, e.g. `#tripgen-setup-screen`, `#parking-counter-screen`), a `#setup-screen`-specific rule, or the intersection-counter-specific rule chain (`.counter-header`, `#period-tabs-bar`, `.counter-body`, etc., added for BUG-016). `#tripgen-counter-screen` and `#intersection-qaqc-counter-screen` are bare `<div>`s with no class attribute at all — matched by none of the three — so neither one ever received the offset, despite the fixed sidebar always being visible while either is shown (both only ever render inside an open project workspace).
**Fix:** Added `body.workspace-mode #tripgen-counter-screen, body.workspace-mode #intersection-qaqc-counter-screen{margin-left:224px}` to `src/style.css`, alongside the existing workspace-mode offset rules (same block that already carries the BUG-016 fix for `#counter-instructions`).
**Verified live:** at 1366×768 and 1280×800, the Trip Gen counter's header title, full keyboard-reference bar (3 classifications, all 6 chips), and the table's time column all render fully to the right of the sidebar with nothing obscured, at both sizes. No console errors introduced.

---

## BUG-027
**Status:** Fixed (v3.35.0-alpha.2, caught during my own end-of-batch independent audit — pre-existing, exposed by comparing against the new streetlightComparison code added in the same batch)
**Severity:** Major
**Found in:** pre-existing (`loadProject()`'s `intersectionQaqc` restore, shipped with area-study QA/QC in v3.29.0-alpha.1)
**Description:** `loadProject()` restored the standalone-project QA/QC store via `Object.assign(intersectionQaqc, proj.intersectionQaqc || {})` with no reset first. `Object.assign` only overwrites keys present in the source object — loading a project with fewer (or zero) QA/QC recount keys than whatever was already in memory from a *previously* loaded project left the old project's recount entries stranded in the live `intersectionQaqc` global. Reproduced live: loaded Project A (one vehicle-class recount, quarters summing to 20), opened its QA/QC screen (correctly showed the recount), then loaded Project B (a different, unrelated project with no QA/QC data of its own) and opened ITS QA/QC screen — it showed Project A's stale recount total (20) as if it were Project B's own, instead of "no recount."
**Root cause:** No reset-before-restore on a live global object that a later `Object.assign` only partially overwrites — the same shape of bug the streetlightComparison code (added in this same batch of work) explicitly avoided by resetting first, but the pre-existing `intersectionQaqc` line right next to it wasn't touched at the time and kept the old behavior.
**Fix:** Clear every key from `intersectionQaqc` (`for (const k in intersectionQaqc) delete intersectionQaqc[k]`) immediately before `Object.assign`-ing in the new project's data, mirroring `streetlightComparison`'s reset-then-restore pattern directly above it in the same function.
**Verified live:** re-ran the same two-project sequence (Project A with a recount → Project B without) after the fix — Project B's QA/QC screen correctly shows "no recount" instead of Project A's leaked total.

---

## BUG-026
**Status:** Fixed (v3.34.0-alpha.1, caught during required live verification of the new StreetLight comparison feature, before push)
**Severity:** Minor (wrong-but-plausible-looking output, not a crash — the app never signaled anything was off)
**Found in:** new (`renderStreetlightCompareScreen()`'s leg card, `src/main.js`)
**Description:** The StreetLight peak-hour-table PHF row is one value PER MOVEMENT COLUMN (Left/Thru/Right each get their own PHF), not one value per leg — confirmed against the real sample file (`..._tmc_peak_hour_table.xlsx`), e.g. the south leg's row read `[0.95, 0, 0]` for [Left, Thru, Right], not a single number. The first version of the comparison table's "PHF" column tried to call `.toFixed(2)` directly on `block.phf.byLeg[leg.key]`, which is the `{L,T,R}` object, not a number — threw `TypeError: slPhf.toFixed is not a function` on every render once a file was imported, caught immediately by the live-verification pass (real-file import test) rather than shipping silently.
**Root cause:** Assumed the PHF row had the same one-value-per-leg shape as the Total/Total % row, without checking the parsed data's actual shape before using it.
**Fix:** Replaced the single "PHF" table column with a caption line below each leg's table listing all three movement PHFs by name ("PHF (StreetLight, per movement) — Left: 0.95 · Thru: — · Right: —"), matching the data's real per-movement granularity instead of forcing it into a per-leg cell.
**Verified live:** re-imported the real sample file after the fix — all four legs render their correct per-movement PHF values with no console error.

---

## BUG-025
**Status:** Worked around locally (v3.34.0-alpha.1, caught during required live verification of the new StreetLight comparison feature); the underlying shared function (`ixDetectPeakStart()`) was deliberately left unchanged — see below
**Severity:** Major (wrong data shown with confidence: a plausible-looking but incorrect "peak hour" match, not a crash)
**Found in:** pre-existing (`ixDetectPeakStart()`, added for the standalone/area-study QA/QC feature), exposed by the new StreetLight comparison feature
**Description:** `ixDetectPeakStart()` only searches VEHICLE in/out volume (`vData`) for the busiest hour in a window; when vehicle mode isn't active (`enabledModes.vehicle` false — i.e. a turning-movement-only project, which is a completely normal configuration and exactly the kind of project someone would run a StreetLight TMC comparison against) it silently returns `searchStartMin` verbatim — the search window's literal floor, not an actual detected peak. Reproduced live: a TMC-only test project's "AM Peak" window (7:00–11:00 search range) always matched 7:00–8:00 (the window's start) instead of the intersection's actual busiest hour (9:00–10:00, where the test data was deliberately concentrated), with the StreetLight comparison screen confidently showing the wrong manual-count numbers (all zeros) with no error or warning.
**Root cause:** `ixDetectPeakStart()` has no fallback for when vehicle data isn't the count type in play — reasonable for its original QA/QC use (QA/QC's per-mode recount already knows which row group it's scoring), but a silent trap for any new caller that needs "the peak hour" for a TMC-only project.
**Fix:** New local `slDetectPeakStart()` in the StreetLight comparison section of `main.js`: uses `ixDetectPeakStart()` unchanged when vehicle mode/data is usable, otherwise searches `tmcData` volume directly for the busiest hour in the window. Deliberately NOT folded into `ixDetectPeakStart()` itself/QA/QC's own peak search — that would be an unreviewed behavior change to an already-shipped feature outside this task's scope. QA/QC's own TMC-only peak-window search likely has the same gap and should be looked at separately.
**Verified live:** re-ran the StreetLight comparison against the same TMC-only test project after the fix — "AM Peak" now correctly matches 9:00–10:00 (the intended peak), with StreetLight vs. manual diffs computing to the expected hand-checked values (+20 on one movement, 0 on the rest).

---

## BUG-024
**Status:** Fixed (v3.33.0-alpha.1, found while adding the new lat/lng setup fields)
**Severity:** Minor (data was never lost — only the setup screen's display of it — but two compounding issues, one of which threw on every keystroke)
**Found in:** pre-existing (`street1-inp`/`street2-inp`/`street3-inp`), exposed while adding the analogous `ix-lat-inp`/`ix-lng-inp` fields for standalone intersection projects
**Description:** Two separate bugs in the same corner of setup.js/index.html:
1. `renderLegConfig()` — which runs on every setup-screen (re)entry and after every project load/resume — never set `street1-inp`/`street2-inp`/`street3-inp`'s `.value` from `intersection.street1/street2/street3`. The underlying state was always saved and restored correctly (`intersection` is serialized/restored wholesale), but re-opening Setup after a resume or project load showed blank street-name fields even though the data was intact. Reproduced live: typed "Main St"/"Oak Ave", started counting (triggers autosave), reloaded the page, resumed, opened Setup → both fields showed empty while `window.intersection.street1` still held `"Main St"`.
2. Independently, every one of those three inputs' `oninput` handler calls `updateDefaultFilenames()` (`intersection.street1=this.value;updateDefaultFilenames();renderLegConfig()`), but `updateDefaultFilenames` was never added to the `Object.assign(window, {...})` block in `main.js` that exposes module-scoped functions to these inline HTML handlers. Every keystroke in any of the three street-name fields threw `ReferenceError: updateDefaultFilenames is not defined` — and because the handler is one sequential statement list, the error also aborted the `renderLegConfig()` call right after it, so the leg diagram/labels silently stopped live-updating on every keystroke too.
**Root cause:** (1) no re-sync path existed from state back to these specific DOM inputs; (2) a function used by an inline `oninput=` handler was imported into `main.js`'s module scope but never re-exported onto `window`, where inline handlers actually run.
**Fix:** Added `syncIntersectionLocationFields()` in `setup.js`, called at the top of `renderLegConfig()`, which sets `street1-inp`/`street2-inp`/`street3-inp` and the new `ix-lat-inp`/`ix-lng-inp` `.value` from `intersection`'s current state — covers every load/resume/re-entry path for free since `renderLegConfig()` already runs on all of them. Added `updateDefaultFilenames` to the `Object.assign(window, {...})` exposure list in `main.js`.
**Verified live:** typed into `street1-inp` in a fresh tab — no console error, leg diagram updates immediately. Set street1/street2/lat/lng, started counting (autosave), reloaded, resumed, opened Setup → all four fields showed the correct restored values.

---

## BUG-023
**Status:** Fixed (v3.32.0-alpha.2, caught during my own independent audit of the new UTDF export feature, before it was pushed)
**Severity:** Critical
**Found in:** new (`exportUtdf.js`, added for Synchro UTDF export)
**Description:** UTDF/Synchro labels turning-movement columns (NBL/NBT/NBR, SBL/SBT/SBR, EBL/EBT/EBR, WBL/WBT/WBR) by the direction a vehicle is TRAVELING, not by which physical leg it entered from — this app's own `parseDotTmcXlsx.js` (traced from real NYC DOT files) already documents the correct convention: "SB = vehicle entered from North; EB = from West; NB = from South; WB = from East". The original `exportUtdf.js` mapped this app's leg N straight to the UTDF NB column (and S→SB, E→EB, W→WB) — i.e. by physical leg position, which is backwards. Confirmed independently via `classifyTurn()`'s own bearing math (approach leg N's direction-of-travel heading computes to 180°, due south). Every UTDF file the feature produced before this fix had north/south and east/west turning-movement volumes silently swapped — exactly the kind of "garbled Synchro import" the feature's own build brief warned against, and not something the implementing agent's own verification could have caught since it hand-computed its "expected" values using the same (incorrect) directional assumption as the code, rather than against the app's own already-established DOT-TMC convention.
**Root cause:** `UTDF_LEG_ORDER` (and the unused `CARDINAL_TO_UTDF` constant) assumed leg-name-matches-UTDF-label, without cross-checking against the direction-of-travel convention this app had already established elsewhere for the same NB/SB/EB/WB labels.
**Fix:** `UTDF_LEG_ORDER` changed from `['N','S','E','W']` to `['S','N','W','E']` so each leg's L/T/R triplet lands under the correct direction-of-travel column; `CARDINAL_TO_UTDF` corrected to `{ S:'NB', N:'SB', W:'EB', E:'WB' }` for documentation accuracy (this constant isn't otherwise used in the export logic).
**Verified live:** seeded single-movement fixtures via `window.__loadProject()` and captured the exported UTDF text (intercepting `URL.createObjectURL`) — confirmed a leg-N right turn lands in SBR (not NBR), and a 4-direction fixture (N→S=3, S→N=5, E→W=9, W→E=11, all through movements) produced exactly `NBT=5, SBT=3, EBT=11, WBT=9` — matching the hand-derived expectation for every direction, not just one.

---

## BUG-022
**Status:** Fixed (v3.29.0-alpha.2, caught during my own independent audit of the area-study QA/QC feature, after BUG-020/021 had already been fixed)
**Severity:** Major
**Found in:** new (`renderIntersectionQaqcScreen()`, added for area-study QA/QC)
**Description:** `renderIntersectionQaqcScreen(snapshotCtx)` is `async` (it `await`s `ixDetectPeakStart()` per QA/QC window) and unconditionally writes its result to the shared `#intersection-qaqc-list` container at the end (`root.innerHTML = ...`) with no check that it's still the most recently requested render. The screen can be re-entered in quick succession multiple ways — switching straight from one area-study intersection's QA/QC to another (`showIntersectionQaqc`), or finishing a recount (which calls `renderIntersectionQaqcScreen(ixQaqcActiveCtx)` itself). Two overlapping calls race on the same DOM container; whichever resolves *last* wins, regardless of which one was requested last. Reproduced live: finish a recount on intersection A, then immediately (no wait) call `showIntersectionQaqc(1)` for B — B's screen displayed A's primary/recount totals instead of B's own, with no visual indication anything was wrong.
**Root cause:** No staleness/generation guard on an async render function writing to a shared DOM container — the same failure family as BUG-017 (stale writes to a shared element), but via an async race instead of a duplicate-id collision.
**Fix:** Added a module-level `_ixQaqcRenderGen` counter, incremented at the top of every `renderIntersectionQaqcScreen()` call; each call captures its own generation number and checks it's still current immediately before every `root.innerHTML` write (the two early-return messages and the final card render). A superseded render silently no-ops instead of overwriting a newer render's DOM.
**Verified live:** re-ran the same tight-race sequence (recount finish → immediate switch to another intersection's QA/QC, ~10-50ms gap) after the fix — the newer intersection's data always wins regardless of resolve order.

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
