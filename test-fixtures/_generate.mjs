// One-off generator for test-fixtures/*.tcproject. Not part of the app build — run manually
// with `node test-fixtures/_generate.mjs` after editing, then delete or leave in place for
// future regeneration. Produces files matching the exact save format read/written by
// src/main.js (serializeCurrentProject / loadProject) as of v3.4x — see README.md.

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── turn classification (mirrors src/diagram.js classifyTurn) ───
const LEG_BEARING = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
function classifyTurn(approachLeg, destLeg) {
  const bA = LEG_BEARING[approachLeg], bD = LEG_BEARING[destLeg];
  const heading = (bA + 180) % 360;
  const rel = (bD - heading + 360) % 360;
  if (rel === 0) return 'T';
  if (rel === 180) return 'U';
  if (rel < 180) return 'R';
  return 'L';
}
const TURN_SORT_ORDER = { L: 0, T: 1, R: 2, U: 3 };
function sortDestsByTurn(leg, arr) {
  return [...arr].sort((a, b) => (TURN_SORT_ORDER[classifyTurn(leg, a)] ?? 9) - (TURN_SORT_ORDER[classifyTurn(leg, b)] ?? 9));
}

// ─── helpers ───
function zeros(slots, cols) { return Array.from({ length: slots }, () => Array(cols).fill(0)); }
function pedZeros(xwalks, slots) { return Array.from({ length: xwalks }, () => Array.from({ length: slots }, () => [0, 0])); }

// Deterministic pseudo-random (no external deps) so re-running the generator is reproducible.
let seed = 42;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }

// Builds a plausible AM/PM-shaped bell curve of counts across `slots` intervals, scaled by `peak`.
function bellCurve(slots, peak, noise = 0.25) {
  const out = [];
  for (let i = 0; i < slots; i++) {
    const t = i / (slots - 1 || 1);
    const shape = Math.sin(Math.PI * t) ** 1.3; // 0 at edges, 1 near middle
    const base = Math.max(0, Math.round(peak * shape * (1 + (rnd() - 0.5) * noise)));
    out.push(base);
  }
  return out;
}

function vDataFromCurve(slots, nCols, peaksPerCol) {
  const curves = peaksPerCol.map((peak) => bellCurve(slots, peak));
  return Array.from({ length: slots }, (_, s) => curves.map((c) => c[s]));
}

function pedDataFromCurve(xwalkPeaks, slots) {
  return xwalkPeaks.map(([p0, p1]) => {
    const c0 = bellCurve(slots, p0), c1 = bellCurve(slots, p1);
    return Array.from({ length: slots }, (_, s) => [c0[s], c1[s]]);
  });
}

function tmcDataFromApproaches(approaches, vPairsTmc, slots, scale = 1) {
  const out = {};
  approaches.forEach((app) => {
    out[app.leg] = {};
    app.destinations.forEach((dest, di) => {
      const cls = classifyTurn(app.leg, dest);
      // Thru heaviest, right moderate, left lighter, u-turn rare — realistic split.
      const base = { T: 40, R: 18, L: 12, U: 2 }[cls] || 8;
      const peaks = vPairsTmc.map((_, ci) => Math.max(1, Math.round((base - ci * 3 + di * 2) * scale)));
      out[app.leg][dest] = vDataFromCurve(slots, vPairsTmc.length, peaks);
    });
  });
  return out;
}

function emptyManualForTmc(approaches) {
  const out = {};
  approaches.forEach((app) => { out[app.leg] = {}; app.destinations.forEach((d) => { out[app.leg][d] = []; }); });
  return out;
}

const nowIso = () => new Date().toISOString();
const uuid = (tag) => `test-fixture-${tag}-0000-0000-000000000000`;

function baseVPairs() {
  return [
    { label: 'Passenger cars', def: 'Classes 1–3 — motorcycles through pickups & vans', inKey: 'a', outKey: 'j', icon: null, tmcKey: 'a', includeTmc: true, isBike: false },
    { label: 'Single unit trucks', def: 'Class 5 — 2-axle, 6-tire single unit', inKey: 's', outKey: 'k', icon: null, tmcKey: 's', includeTmc: true, isBike: false },
    { label: 'Tractor trailers', def: 'Class 8 — 3-axle single trailer combination', inKey: 'd', outKey: 'l', icon: null, tmcKey: 'd', includeTmc: true, isBike: false },
    { label: 'Buses', def: 'Class 4 — transit and school buses', inKey: 'f', outKey: ';', icon: null, tmcKey: 'f', includeTmc: true, isBike: false },
  ];
}

function fourWayIntersection(overrides = {}) {
  return Object.assign({
    template: 't4', diagLeg: 'SE', missingLeg: 'S',
    street1: 'Main St', street2: 'Oak Ave', street3: '',
    lat: '', lng: '',
    legLabels: {}, oneWay: {}, oneWayIn: {},
    crosswalks: [
      { name: 'North x-walk', dir0: 'EB', dir1: 'WB', key0: 'a', key1: 's', assign: 'N' },
      { name: 'East x-walk', dir0: 'NB', dir1: 'SB', key0: 'j', key1: 'k', assign: 'E' },
      { name: 'South x-walk', dir0: 'EB', dir1: 'WB', key0: 'd', key1: 'f', assign: 'S' },
      { name: 'West x-walk', dir0: 'NB', dir1: 'SB', key0: 'l', key1: ';', assign: 'W' },
    ],
    approaches: [
      { leg: 'N', count: true, destinations: sortDestsByTurn('N', ['E', 'S', 'W']) },
      { leg: 'E', count: true, destinations: sortDestsByTurn('E', ['N', 'S', 'W']) },
      { leg: 'S', count: true, destinations: sortDestsByTurn('S', ['N', 'E', 'W']) },
      { leg: 'W', count: true, destinations: sortDestsByTurn('W', ['N', 'E', 'S']) },
    ],
  }, overrides);
}

function projectInfoBase(over = {}) {
  return Object.assign({
    companyName: 'Sample Traffic Engineering Co.', companyAddress: '100 Consultant Way, Springfield',
    projectName: '', projectNumber: '2026-0100', studyPurpose: 'Signal warrant data collection',
    location: '', countDate: '2026-06-15',
    projectManagerName: 'J. Rivera', projectManagerTitle: 'PE',
    counterName: 'A. Chen', counterTitle: 'Field Technician',
    qaCounterName: '', qaCounterTitle: '',
    logoUrl: '',
  }, over);
}

function period(name, { startMinutes, intervalMin, durationMin, vData, pedData, tmcData, vManual, pedManual, tmManual, meta }) {
  return {
    name,
    cfg: { startMinutes, intervalMin, durationMin },
    meta: Object.assign({ date: '2026-06-15', weather: 'Clear, 72F', observer: 'A. Chen', equipment: 'Clipboard + tally counter', notes: '' }, meta || {}),
    vData: vData || { in: [], out: [] },
    pedData: pedData || [],
    tmcData: tmcData || {},
    vManual: vManual || { in: [], out: [] },
    pedManual: pedManual || [],
    tmManual: tmManual || {},
  };
}

function intersectionProject({ projectName, location, mode, enabledModes, vPairs, intersection, periods, fnamesPrefix }) {
  return {
    version: 2, projectType: 'intersection', savedAt: nowIso(), uuid: uuid(fnamesPrefix),
    projectInfo: projectInfoBase({ projectName, location }),
    mode,
    enabledModes,
    vPairs,
    intersection,
    fnames: { vehicle: `${fnamesPrefix}_vehicle`, ped: `${fnamesPrefix}_ped`, tmc: `${fnamesPrefix}_tmc` },
    intersectionQaqc: {},
    streetlightComparison: { blocks: {}, sourceFileName: null, importedAt: null },
    intersectionQaqcReviewerName: '',
    intersectionQaqcReviewDate: '',
    activePeriodIdx: 0,
    plannedPeriods: periods.map((p, i) => ({ name: p.name, start: p.cfg.startMinutes, end: p.cfg.startMinutes + p.cfg.durationMin })),
    periods,
  };
}

function write(name, obj) {
  const p = path.join(__dirname, name);
  writeFileSync(p, JSON.stringify(obj), 'utf8');
  console.log('wrote', name, (JSON.stringify(obj).length / 1024).toFixed(1) + 'KB');
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 1 — 4-way, vehicle-only, single period
// ═══════════════════════════════════════════════════════════
{
  seed = 1;
  const vPairs = baseVPairs();
  const ix = fourWayIntersection({ street1: 'Elm St', street2: '5th Ave' });
  const slots = 8; // 2 hours @ 15-min
  const vData = {
    in: vDataFromCurve(slots, vPairs.length, [55, 14, 6, 3]),
    out: vDataFromCurve(slots, vPairs.length, [50, 12, 5, 2]),
  };
  const pedData = pedZeros(4, slots);
  const tmcData = {};
  const p1 = period('Period 1 (7:00–9:00 AM)', {
    startMinutes: 420, intervalMin: 15, durationMin: 120,
    vData, pedData, tmcData,
    vManual: { in: [], out: [] }, pedManual: [[], [], [], []], tmManual: {},
  });
  write('4way-vehicle-only.tcproject', intersectionProject({
    projectName: 'Elm St & 5th Ave — AM Vehicle Count',
    location: 'Elm St & 5th Ave, Springfield',
    mode: 'vehicle',
    enabledModes: { ped: false, vehicle: true, turning: false },
    vPairs, intersection: ix, periods: [p1], fnamesPrefix: 'elm_5th',
  }));
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 2 — 4-way, FULL data: vehicle (6 types, 2 groups) + ped (4 legs) + TMC, 2 periods
// ═══════════════════════════════════════════════════════════
{
  seed = 2;
  const vPairs = [
    { label: 'Passenger cars', def: 'Classes 1–3', inKey: 'a', outKey: 'j', icon: null, tmcKey: 'a', includeTmc: true, isBike: false },
    { label: 'Single unit trucks', def: 'Class 5', inKey: 's', outKey: 'k', icon: null, tmcKey: 's', includeTmc: true, isBike: false },
    { label: 'Tractor trailers', def: 'Class 8', inKey: 'd', outKey: 'l', icon: null, tmcKey: 'd', includeTmc: true, isBike: false },
    { label: 'Buses', def: 'Class 4', inKey: 'f', outKey: ';', icon: null, tmcKey: 'f', includeTmc: true, isBike: false },
    { label: 'Motorcycles', def: 'Class 1', inKey: 'a', outKey: 'j', icon: null, tmcKey: 'g', includeTmc: true, isBike: false },
    { label: 'Tandem trailers', def: 'Class 9', inKey: 's', outKey: 'k', icon: null, tmcKey: 'h', includeTmc: true, isBike: false },
  ];
  const ix = fourWayIntersection({ street1: 'Cedar Blvd', street2: 'Park St', legLabels: { N: 'Cedar Blvd (north)', S: 'Cedar Blvd (south)' } });
  const slots = 8;
  function mkPeriod(name, startMinutes, vPeaks, pedPeaks, tmcScale, notes) {
    const vData = { in: vDataFromCurve(slots, vPairs.length, vPeaks.in), out: vDataFromCurve(slots, vPairs.length, vPeaks.out) };
    const pedData = pedDataFromCurve(pedPeaks, slots);
    const tmcData = tmcDataFromApproaches(ix.approaches, vPairs.filter((p) => p.includeTmc), slots, tmcScale);
    return period(name, {
      startMinutes, intervalMin: 15, durationMin: 120,
      vData, pedData, tmcData,
      vManual: { in: [], out: [] }, pedManual: vPairs.map ? [[], [], [], []] : [], tmManual: emptyManualForTmc(ix.approaches),
      meta: { notes },
    });
  }
  const p1 = mkPeriod('AM Peak (7:00–9:00)', 420, { in: [48, 12, 5, 2, 6, 1], out: [44, 10, 4, 2, 5, 1] }, [[14, 3], [9, 12], [16, 4], [7, 10]], 1.0, 'AM school + commuter peak');
  const p2 = mkPeriod('PM Peak (4:00–6:00)', 960, { in: [40, 8, 3, 3, 4, 0], out: [52, 11, 5, 2, 6, 1] }, [[10, 6], [15, 8], [11, 9], [12, 5]], 1.2, 'PM commuter peak, higher pedestrian volume');
  write('4way-full-vehicle-ped-tmc.tcproject', intersectionProject({
    projectName: 'Cedar Blvd & Park St — Full AM/PM Count',
    location: 'Cedar Blvd & Park St, Springfield',
    mode: 'vehicle',
    enabledModes: { ped: true, vehicle: true, turning: true },
    vPairs, intersection: ix, periods: [p1, p2], fnamesPrefix: 'cedar_park',
  }));
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 3 — 5-way, diagLeg NE, W leg one-way-in, TMC-only, multiple L dests on NE approach
// ═══════════════════════════════════════════════════════════
{
  seed = 3;
  const vPairs = baseVPairs();
  const vTmc = vPairs.filter((p) => p.includeTmc);
  const slots5 = ['N', 'E', 'S', 'W', 'NE'];
  const oneWayIn = { W: true };
  function dests(leg) {
    return sortDestsByTurn(leg, slots5.filter((d) => d !== leg && !oneWayIn[d]));
  }
  const approaches = [
    { leg: 'N', count: true, destinations: dests('N') },
    { leg: 'E', count: true, destinations: dests('E') },
    { leg: 'S', count: true, destinations: dests('S') },
    { leg: 'W', count: true, destinations: dests('W') }, // W keeps its own approach (one-way-IN means traffic enters here)
    { leg: 'NE', count: true, destinations: dests('NE') }, // -> [E, S, N] : E and S are BOTH left turns off the diagonal leg
  ];
  const ix = {
    template: 't5', diagLeg: 'NE', missingLeg: 'S',
    street1: 'Highland Ave', street2: 'Route 9', street3: 'Industrial Pkwy',
    lat: '42.3601', lng: '-71.0589',
    legLabels: { NE: 'Industrial Pkwy (NE leg)' },
    oneWay: {}, oneWayIn,
    crosswalks: [
      { name: 'North x-walk', dir0: 'EB', dir1: 'WB', key0: 'a', key1: 's', assign: 'N' },
      { name: 'East x-walk', dir0: 'NB', dir1: 'SB', key0: 'j', key1: 'k', assign: 'E' },
      { name: 'South x-walk', dir0: 'EB', dir1: 'WB', key0: 'd', key1: 'f', assign: 'S' },
      { name: 'West x-walk', dir0: 'NB', dir1: 'SB', key0: 'l', key1: ';', assign: 'W' },
      { name: 'NE x-walk', dir0: 'NB', dir1: 'SB', key0: 'z', key1: 'x', assign: 'NE' },
    ],
    approaches,
  };
  const slots = 8;
  function mkPeriod(name, startMinutes, scale) {
    const tmcData = tmcDataFromApproaches(approaches, vTmc, slots, scale);
    return period(name, {
      startMinutes, intervalMin: 15, durationMin: 120,
      vData: { in: [], out: [] }, pedData: [],
      tmcData,
      vManual: { in: [], out: [] }, pedManual: [], tmManual: emptyManualForTmc(approaches),
      meta: { notes: 'TMC-only count; vehicle and pedestrian modes disabled for this project.' },
    });
  }
  const p1 = mkPeriod('AM Peak (7:00–9:00)', 420, 1.0);
  const p2 = mkPeriod('PM Peak (4:00–6:00)', 960, 1.15);
  write('5way-diagNE-oneway-tmc-only.tcproject', intersectionProject({
    projectName: 'Highland Ave & Route 9 (5-way) — TMC Only',
    location: 'Highland Ave & Route 9, Springfield',
    mode: 'turning',
    enabledModes: { ped: false, vehicle: false, turning: true },
    vPairs, intersection: ix, periods: [p1, p2], fnamesPrefix: 'highland_rt9',
  }));
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 4 — 3-way (T-intersection), ped-only
// ═══════════════════════════════════════════════════════════
{
  seed = 4;
  const vPairs = baseVPairs();
  const missingLeg = 'S';
  const slots3 = ['N', 'E', 'W'];
  function dests(leg) { return sortDestsByTurn(leg, slots3.filter((d) => d !== leg)); }
  const ix = {
    template: 't3', diagLeg: 'SE', missingLeg,
    street1: 'Birch Ln', street2: 'Water St', street3: '',
    lat: '', lng: '',
    legLabels: {}, oneWay: {}, oneWayIn: {},
    crosswalks: [
      { name: 'North x-walk', dir0: 'EB', dir1: 'WB', key0: 'a', key1: 's', assign: 'N' },
      { name: 'East x-walk', dir0: 'NB', dir1: 'SB', key0: 'j', key1: 'k', assign: 'E' },
      { name: 'West x-walk', dir0: 'NB', dir1: 'SB', key0: 'd', key1: 'f', assign: 'W' },
    ],
    approaches: [
      { leg: 'N', count: true, destinations: dests('N') },
      { leg: 'E', count: true, destinations: dests('E') },
      { leg: 'W', count: true, destinations: dests('W') },
    ],
  };
  const slots = 8;
  const pedData = pedDataFromCurve([[9, 4], [6, 11], [5, 8]], slots);
  const p1 = period('Midday (11:00 AM–1:00 PM)', {
    startMinutes: 660, intervalMin: 15, durationMin: 120,
    vData: { in: [], out: [] }, pedData, tmcData: {},
    vManual: { in: [], out: [] }, pedManual: [[], [], []], tmManual: {},
    meta: { notes: 'Pedestrian-only count; vehicle and turning modes disabled.' },
  });
  write('3way-ped-only.tcproject', intersectionProject({
    projectName: 'Birch Ln & Water St (T-intersection) — Ped Only',
    location: 'Birch Ln & Water St, Springfield',
    mode: 'ped',
    enabledModes: { ped: true, vehicle: false, turning: false },
    vPairs, intersection: ix, periods: [p1], fnamesPrefix: 'birch_water',
  }));
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 5 — 4-way, TMC-only project with EMPTY tmcData but populated vData (corruption signature)
// ═══════════════════════════════════════════════════════════
{
  seed = 5;
  const vPairs = baseVPairs();
  const ix = fourWayIntersection({ street1: 'Grove St', street2: '2nd Ave' });
  const slots = 8;
  // The corruption signature this fixture reproduces: project is configured/labeled as a
  // turning-movement (TMC) count (mode:'turning', enabledModes.turning:true, vehicle/ped
  // disabled) but tmcData is an EMPTY object while vData holds real, non-zero counts — as
  // if vehicle-mode data got saved into a project that was set up for TMC. Used to confirm
  // the Data Quality "wrong mode" flag (in progress elsewhere — see BUGS.md/DEVLOG.md) fires
  // on this shape once shipped.
  const vData = {
    in: vDataFromCurve(slots, vPairs.length, [46, 11, 4, 2]),
    out: vDataFromCurve(slots, vPairs.length, [42, 9, 3, 2]),
  };
  const p1 = period('Period 1 (7:00–9:00 AM)', {
    startMinutes: 420, intervalMin: 15, durationMin: 120,
    vData, pedData: pedZeros(4, slots), tmcData: {},
    vManual: { in: [], out: [] }, pedManual: [[], [], [], []], tmManual: {},
    meta: { notes: 'INTENTIONAL FIXTURE DEFECT: tmcData is empty ({}) while vData is populated, even though this project is configured turning-only. Reproduces the wrong-mode corruption signature.' },
  });
  write('4way-tmc-only-empty-tmcdata-populated-vdata.tcproject', intersectionProject({
    projectName: 'Grove St & 2nd Ave — TMC Project w/ Wrong-Mode Data (corruption fixture)',
    location: 'Grove St & 2nd Ave, Springfield',
    mode: 'turning',
    enabledModes: { ped: false, vehicle: false, turning: true },
    vPairs, intersection: ix, periods: [p1], fnamesPrefix: 'grove_2nd',
  }));
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 6 — 4-way, 8 vehicle types across 2 keybinding groups (group 1 general, group 2 freight-only)
// ═══════════════════════════════════════════════════════════
{
  seed = 6;
  const vPairs = [
    // Group 1 (indices 0-3): general traffic
    { label: 'Passenger cars', def: 'Classes 1–3', inKey: 'a', outKey: 'j', icon: null, tmcKey: 'a', includeTmc: true, isBike: false },
    { label: 'Motorcycles', def: 'Class 1 (counted separately)', inKey: 's', outKey: 'k', icon: null, tmcKey: 's', includeTmc: true, isBike: false },
    { label: 'Pickups/vans', def: 'Class 3', inKey: 'd', outKey: 'l', icon: null, tmcKey: 'd', includeTmc: true, isBike: false },
    { label: 'Transit buses', def: 'Class 4', inKey: 'f', outKey: ';', icon: null, tmcKey: 'f', includeTmc: true, isBike: false },
    // Group 2 (indices 4-7): freight-only, reuses same physical keys, distinct tmcKeys
    { label: 'Single-unit trucks', def: 'Class 5 — 2-axle, 6-tire single unit', inKey: 'a', outKey: 'j', icon: null, tmcKey: 'g', includeTmc: true, isBike: false },
    { label: 'SU 3+ axle trucks', def: 'Class 6', inKey: 's', outKey: 'k', icon: null, tmcKey: 'h', includeTmc: true, isBike: false },
    { label: 'Tractor + semi-trailer', def: 'Class 8', inKey: 'd', outKey: 'l', icon: null, tmcKey: 'i', includeTmc: true, isBike: false },
    { label: 'Multi-trailer combos', def: 'Classes 9–13', inKey: 'f', outKey: ';', icon: null, tmcKey: 'j', includeTmc: true, isBike: false },
  ];
  const ix = fourWayIntersection({ street1: 'Freight Way', street2: 'Commerce Dr' });
  const slots = 8;
  const vData = {
    in: vDataFromCurve(slots, vPairs.length, [38, 4, 9, 2, 14, 5, 8, 2]),
    out: vDataFromCurve(slots, vPairs.length, [35, 3, 8, 2, 13, 4, 7, 1]),
  };
  const p1 = period('Period 1 (6:00–8:00 AM, truck route)', {
    startMinutes: 360, intervalMin: 15, durationMin: 120,
    vData, pedData: pedZeros(4, slots), tmcData: {},
    vManual: { in: [], out: [] }, pedManual: [[], [], [], []], tmManual: {},
    meta: { notes: 'Truck-route count; group 2 (indices 4-7) is freight-only classes with distinct TMC keys, reference for group-customization work.' },
  });
  write('4way-multi-vehicle-groups.tcproject', intersectionProject({
    projectName: 'Freight Way & Commerce Dr — Multi-Group Vehicle Classification',
    location: 'Freight Way & Commerce Dr, Springfield',
    mode: 'vehicle',
    enabledModes: { ped: false, vehicle: true, turning: false },
    vPairs, intersection: ix, periods: [p1], fnamesPrefix: 'freight_commerce',
  }));
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 7 — parking occupancy count (separate project type)
// ═══════════════════════════════════════════════════════════
{
  seed = 7;
  const zones = [
    { id: '1', name: 'Front Lot', capacity: 60 },
    { id: '2', name: 'Rear Lot', capacity: 40 },
    { id: '3', name: 'Street Spaces (Main St)', capacity: 22 },
  ];
  const parkingCfg = { startMin: 480, intervalMin: 30, durationMin: 480 }; // 8:00 AM - 4:00 PM, 16 slots
  const totalSlots = Math.round(parkingCfg.durationMin / parkingCfg.intervalMin);
  // Realistic occupancy curve per zone: rises through morning, peaks midday, tapers off —
  // each zone capped at its own capacity and varying non-uniformly slot to slot.
  const curves = {
    1: bellCurve(totalSlots, 52, 0.18).map((v) => Math.min(v, zones[0].capacity)),
    2: bellCurve(totalSlots, 31, 0.22).map((v) => Math.min(v, zones[1].capacity)),
    3: bellCurve(totalSlots, 18, 0.3).map((v) => Math.min(v, zones[2].capacity)),
  };
  const parkingGrid = {};
  for (let s = 0; s < totalSlots; s++) {
    parkingGrid[s] = { 1: curves[1][s], 2: curves[2][s], 3: curves[3][s] };
  }
  const proj = {
    version: 1, projectType: 'parking', savedAt: nowIso(), uuid: uuid('parking'),
    parkingProjectInfo: {
      projectName: 'Downtown Municipal Lot — Occupancy Count',
      location: '100 Main St, Springfield',
      date: '2026-06-15',
      notes: 'Front/rear lot + on-street spaces, 30-min intervals, 8am-4pm.',
    },
    zones,
    cfg: parkingCfg,
    grid: parkingGrid,
  };
  write('parking-occupancy-3zones.tcproject', proj);
}

// ═══════════════════════════════════════════════════════════
// FIXTURE 8 — area-wide study, 3 intersections along a corridor
// ═══════════════════════════════════════════════════════════
{
  seed = 8;
  function intersectionSnapshot({ street1, street2, vPairs, ix, slots, vPeaks, pedPeaks, startMinutes }) {
    const vData = { in: vDataFromCurve(slots, vPairs.length, vPeaks.in), out: vDataFromCurve(slots, vPairs.length, vPeaks.out) };
    const pedData = pedDataFromCurve(pedPeaks, slots);
    const p1 = period('AM Peak (7:00–9:00)', {
      startMinutes, intervalMin: 15, durationMin: 120,
      vData, pedData, tmcData: {},
      vManual: { in: [], out: [] }, pedManual: ix.crosswalks.map(() => []), tmManual: {},
    });
    return {
      version: 2, projectType: 'intersection', mode: 'vehicle',
      vPairs, intersection: ix,
      fnames: { vehicle: `${street1}_${street2}_vehicle`.replace(/\s+/g, '_'), ped: `${street1}_${street2}_ped`.replace(/\s+/g, '_'), tmc: `${street1}_${street2}_tmc`.replace(/\s+/g, '_') },
      activePeriodIdx: 0,
      intersectionQaqc: {},
      streetlightComparison: { blocks: {}, sourceFileName: null, importedAt: null },
      periods: [p1],
    };
  }

  const vPairsA = baseVPairs();
  const ixA = fourWayIntersection({ street1: 'Corridor Ave', street2: '1st St' });
  const snapA = intersectionSnapshot({ street1: 'Corridor Ave', street2: '1st St', vPairs: vPairsA, ix: ixA, slots: 8, vPeaks: { in: [30, 6, 2, 1], out: [28, 5, 2, 1] }, pedPeaks: [[6, 3], [4, 7], [5, 4], [3, 6]], startMinutes: 420 });

  const vPairsB = baseVPairs();
  const ixB = fourWayIntersection({ street1: 'Corridor Ave', street2: '3rd St' });
  const snapB = intersectionSnapshot({ street1: 'Corridor Ave', street2: '3rd St', vPairs: vPairsB, ix: ixB, slots: 8, vPeaks: { in: [44, 9, 5, 2], out: [40, 8, 4, 1] }, pedPeaks: [[11, 5], [7, 9], [9, 6], [6, 8]], startMinutes: 420 });

  const vPairsC = baseVPairs();
  const ixC3 = (() => {
    const missingLeg = 'S';
    const slots3 = ['N', 'E', 'W'];
    function dests(leg) { return sortDestsByTurn(leg, slots3.filter((d) => d !== leg)); }
    return {
      template: 't3', diagLeg: 'SE', missingLeg,
      street1: 'Corridor Ave', street2: '5th St', street3: '',
      lat: '', lng: '', legLabels: {}, oneWay: {}, oneWayIn: {},
      crosswalks: [
        { name: 'North x-walk', dir0: 'EB', dir1: 'WB', key0: 'a', key1: 's', assign: 'N' },
        { name: 'East x-walk', dir0: 'NB', dir1: 'SB', key0: 'j', key1: 'k', assign: 'E' },
        { name: 'West x-walk', dir0: 'NB', dir1: 'SB', key0: 'd', key1: 'f', assign: 'W' },
      ],
      approaches: [
        { leg: 'N', count: true, destinations: dests('N') },
        { leg: 'E', count: true, destinations: dests('E') },
        { leg: 'W', count: true, destinations: dests('W') },
      ],
    };
  })();
  const snapC = intersectionSnapshot({ street1: 'Corridor Ave', street2: '5th St', vPairs: vPairsC, ix: ixC3, slots: 8, vPeaks: { in: [18, 3, 1, 0], out: [16, 3, 1, 0] }, pedPeaks: [[8, 4], [5, 9], [6, 5]], startMinutes: 420 });

  const proj = {
    version: 2, projectType: 'area', savedAt: nowIso(), uuid: uuid('area'),
    projectInfo: projectInfoBase({ projectName: 'Corridor Ave Signal Timing Study', location: 'Corridor Ave, Springfield', studyPurpose: 'Corridor-wide signal retiming study' }),
    activeIntersectionIdx: 0,
    intersections: [
      { name: 'Corridor Ave & 1st St', snapshot: snapA, street1: 'Corridor Ave', street2: '1st St', corridor: 'Corridor Ave', counterName: 'A. Chen', lat: '42.3601', lng: '-71.0589' },
      { name: 'Corridor Ave & 3rd St', snapshot: snapB, street1: 'Corridor Ave', street2: '3rd St', corridor: 'Corridor Ave', counterName: 'B. Diaz', lat: '42.3615', lng: '-71.0570' },
      { name: 'Corridor Ave & 5th St (T-int.)', snapshot: snapC, street1: 'Corridor Ave', street2: '5th St', corridor: 'Corridor Ave', counterName: 'A. Chen', lat: '42.3629', lng: '-71.0551' },
    ],
  };
  write('area-study-corridor-3intersections.tcproject', proj);
}

console.log('done');
