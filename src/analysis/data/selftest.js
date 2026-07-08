// Smoke test for src/data — run with: node src/data/selftest.js
// No test framework dependency (per "no new npm deps"); plain assertions that throw on failure.
import { parseVehicleCSV, parsePedCSV, parseTmcCSV } from './parse.js';
import {
  peakHour,
  peakFifteen,
  volumeByInterval,
  amPmSplit,
  tmcSummary,
  levelOfService,
  vehicleIntervalTotal,
  pedIntervalTotal,
  tmcIntervalTotal,
} from './analyze.js';

let pass = 0;
let fail = 0;

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${msg}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

function assertClose(actual, expected, msg, eps = 1e-6) {
  if (Math.abs(actual - expected) <= eps) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${msg}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

// ───────────────────────────────────────────
// Fixture: vehicle CSV (matches export.js format exactly, incl. BOM)
// ───────────────────────────────────────────
const BOM = '﻿';
const vehicleCSV =
  BOM +
  [
    'INBOUND',
    'time,passenger / light,truck,total',
    '07:00 – 07:15,4,2,6',
    '07:15 – 07:30,6,1,7',
    '07:30 – 07:45,10,3,13',
    '07:45 – 08:00,8,2,10',
    'total,28,8,36',
    '',
    'OUTBOUND',
    'time,passenger / light,truck,total',
    '07:00 – 07:15,3,1,4',
    '07:15 – 07:30,5,0,5',
    '07:30 – 07:45,9,2,11',
    '07:45 – 08:00,7,1,8',
    'total,24,4,28',
  ].join('\n');

{
  const parsed = parseVehicleCSV(vehicleCSV);
  assertEqual(parsed.types, ['passenger / light', 'truck'], 'vehicle: types parsed');
  assertEqual(parsed.intervals.length, 4, 'vehicle: interval count');
  assertEqual(parsed.intervals[0], { label: '07:00 – 07:15', start: '07:00', end: '07:15', inbound: [4, 2], outbound: [3, 1] }, 'vehicle: interval 0 shape');
  assertEqual(parsed.intervals[2].inbound, [10, 3], 'vehicle: interval 2 inbound (peak interval)');

  const ph = peakHour(parsed.intervals, 15, vehicleIntervalTotal);
  // window of 4 intervals (60/15) == whole file; total = sum(in)+sum(out) = 36+28=64
  assertEqual(ph.startIdx, 0, 'vehicle: peakHour startIdx (whole-file window)');
  assertEqual(ph.endIdx, 3, 'vehicle: peakHour endIdx');
  assertEqual(ph.volume, 64, 'vehicle: peakHour volume');

  const pf = peakFifteen(parsed.intervals, vehicleIntervalTotal);
  assertEqual(pf.idx, 2, 'vehicle: peakFifteen idx (07:30-07:45 busiest: 13+11=24)');
  assertEqual(pf.volume, 24, 'vehicle: peakFifteen volume');

  const series = volumeByInterval(parsed.intervals, vehicleIntervalTotal);
  assertEqual(series.totals, [10, 12, 24, 18], 'vehicle: volumeByInterval totals');

  const ap = amPmSplit(parsed.intervals, vehicleIntervalTotal);
  assertEqual(ap, { am: 64, pm: 0 }, 'vehicle: amPmSplit (all intervals before noon)');
}

// ───────────────────────────────────────────
// Fixture: pedestrian CSV (two crosswalks)
// ───────────────────────────────────────────
const pedCSV =
  BOM +
  [
    'time,Main St EB,Main St WB,Oak Ave NB,Oak Ave SB,total',
    '07:00 – 07:15,2,1,0,3,6',
    '07:15 – 07:30,1,0,2,1,4',
    'total,3,1,2,4,10',
  ].join('\n');

{
  const parsed = parsePedCSV(pedCSV);
  assertEqual(parsed.crosswalks, [
    { name: 'Main St', dir0: 'EB', dir1: 'WB' },
    { name: 'Oak Ave', dir0: 'NB', dir1: 'SB' },
  ], 'ped: crosswalks parsed from header text');
  assertEqual(parsed.intervals.length, 2, 'ped: interval count (total row excluded)');
  assertEqual(parsed.intervals[0].counts, [[2, 1], [0, 3]], 'ped: interval 0 counts grouped by crosswalk');

  const total0 = pedIntervalTotal(parsed.intervals[0]);
  assertEqual(total0, 6, 'ped: pedIntervalTotal matches file total column');

  const series = volumeByInterval(parsed.intervals, pedIntervalTotal);
  assertEqual(series.totals, [6, 4], 'ped: volumeByInterval totals');
}

// ───────────────────────────────────────────
// Fixture: TMC CSV — mirrors export.js header construction exactly.
// Intersection: N and E approaches. Turn classes derived from classifyTurn (diagram.js logic,
// reproduced below) using bearings N=0,E=90,S=180,W=270. Labels stay as full words
// ("left"/"thru"/"right") to match export.js's TURN_CLS_LABEL and what the UI expects.
//   classifyTurn('N','E'): heading=(0+180)%360=180; rel=(90-180+360)%360=270 -> 'L' (left)
//   classifyTurn('N','S'): heading=180; rel=(180-180+360)%360=0           -> 'T' (thru)
//   classifyTurn('E','N'): heading=(90+180)%360=270; rel=(0-270+360)%360=90 -> 'R' (right)
// ───────────────────────────────────────────
// Re-derive turn classes programmatically from the same logic as diagram.js to keep the
// fixture's header text consistent with what the real export would produce.
const LEG_BEARING = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
function classifyTurn(approachLeg, destLeg) {
  const bA = LEG_BEARING[approachLeg];
  const bD = LEG_BEARING[destLeg];
  const heading = (bA + 180) % 360;
  const rel = (bD - heading + 360) % 360;
  if (rel < 45 || rel >= 315) return 'T';
  if (rel < 135) return 'R';
  if (rel < 225) return 'U';
  return 'L';
}
const TURN_CLS_LABEL = { L: 'left', T: 'thru', R: 'right', U: 'U-turn' };

const nToE = TURN_CLS_LABEL[classifyTurn('N', 'E')]; // left
const nToS = TURN_CLS_LABEL[classifyTurn('N', 'S')]; // thru
const eToN = TURN_CLS_LABEL[classifyTurn('E', 'N')]; // right

const tmcCSV =
  BOM +
  [
    `time,N→E(${nToE}) car,N→E(${nToE}) truck,N→E(${nToE}) total,N→S(${nToS}) car,N→S(${nToS}) truck,N→S(${nToS}) total,N approach total,E→N(${eToN}) car,E→N(${eToN}) truck,E→N(${eToN}) total,E approach total,grand total`,
    '07:00 – 07:15,3,1,4,5,2,7,11,2,0,2,2,13',
    '07:15 – 07:30,1,0,1,4,1,5,6,1,1,2,2,8',
    'total,4,1,5,9,3,12,17,3,1,4,4,21',
  ].join('\n');

{
  const parsed = parseTmcCSV(tmcCSV);
  assertEqual(parsed.types, ['car', 'truck'], 'tmc: types parsed from header');
  assertEqual(parsed.approaches.map((a) => a.leg), ['N', 'E'], 'tmc: approach legs in header order');
  assertEqual(parsed.approaches[0].destinations, [
    { leg: 'E', turnClass: 'left' },
    { leg: 'S', turnClass: 'thru' },
  ], 'tmc: N approach destinations + turn classes (left/thru)');
  assertEqual(parsed.approaches[1].destinations, [{ leg: 'N', turnClass: 'right' }], 'tmc: E approach destination (right)');

  assertEqual(parsed.intervals.length, 2, 'tmc: interval count (total row excluded)');
  assertEqual(parsed.intervals[0].counts.N.E, [3, 1], 'tmc: interval0 N->E counts by type');
  assertEqual(parsed.intervals[0].counts.N.S, [5, 2], 'tmc: interval0 N->S counts by type');
  assertEqual(parsed.intervals[0].counts.E.N, [2, 0], 'tmc: interval0 E->N counts by type');

  const t0total = tmcIntervalTotal(parsed.intervals[0]);
  assertEqual(t0total, 13, 'tmc: tmcIntervalTotal matches grand total column for interval 0');
  const t1total = tmcIntervalTotal(parsed.intervals[1]);
  assertEqual(t1total, 8, 'tmc: tmcIntervalTotal matches grand total column for interval 1');

  const summary = tmcSummary(parsed);
  const grandTotal = Object.values(summary).reduce((s, a) => s + a.total, 0);
  assertEqual(grandTotal, 21, 'tmc: tmcSummary total across approaches matches file grand total');
  assertEqual(summary.N.total, 17, 'tmc: N approach total (4+1 + 9+3 = 17)');
  assertEqual(summary.N.destinations.E.total, 5, 'tmc: N->E destination total (3+1+1+0=5)');
  assertClose(summary.N.destinations.E.pct, Math.round((5 / 17) * 1000) / 10, 'tmc: N->E pct');
}

// ───────────────────────────────────────────
// levelOfService
// ───────────────────────────────────────────
{
  assertEqual(levelOfService(500, 1000).los, 'A', 'los: v/c 0.5 -> A');
  assertEqual(levelOfService(650, 1000).los, 'B', 'los: v/c 0.65 -> B');
  assertEqual(levelOfService(750, 1000).los, 'C', 'los: v/c 0.75 -> C');
  assertEqual(levelOfService(850, 1000).los, 'D', 'los: v/c 0.85 -> D');
  assertEqual(levelOfService(950, 1000).los, 'E', 'los: v/c 0.95 -> E');
  assertEqual(levelOfService(1100, 1000).los, 'F', 'los: v/c 1.1 -> F');
  assertEqual(levelOfService(100, 0).los, null, 'los: zero capacity -> null (no division by zero)');
  assertClose(levelOfService(600, 1000).vc, 0.6, 'los: vc value rounded correctly');
}

// ───────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exitCode = 1;
} else {
  console.log('All self-tests passed.');
}
