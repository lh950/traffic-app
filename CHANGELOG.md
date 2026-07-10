# Changelog

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
