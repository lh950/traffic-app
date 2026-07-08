// Single seam between the UI and the data layer (src/data/**, owned by the data agent).
// src/data/index.js now exists, so this module is mostly a thin pass-through with a
// pre-real-data fallback retained as a safety net (e.g. if the barrel temporarily fails
// to import during a rebuild). The fallback mirrors the documented shapes but is NOT
// kept in sync function-for-function with analyze.js — once the real module is present
// it is always preferred.

let real = null;
let loadPromise = null;

// Memoizes the in-flight PROMISE, not just a "have we started" flag — concurrent callers
// (e.g. several Promise.all'd categoryFor() calls firing at once) must all await the same
// import rather than racing: a flag-only memo lets every caller after the first see the
// flag flip before the import resolves and bail out early with `real` still null.
function loadReal() {
  if (!loadPromise) {
    loadPromise = import('../data/index.js').then(
      (mod) => { real = mod; return real; },
      () => { real = null; return real; },
    );
  }
  return loadPromise;
}

export async function hasRealDataLayer() {
  const mod = await loadReal();
  return !!mod;
}

// Each parsed dataset shape totals one interval differently (vehicle: inbound+outbound;
// ped: sum of crosswalk pairs; tmc: sum across approach->destination->type). The real
// analyze.js exposes vehicleIntervalTotal/pedIntervalTotal/tmcIntervalTotal for this and
// every peak/volume/AM-PM function takes the relevant one as an optional last argument
// (default is vehicle). totalFnFor() resolves the right one by dataset kind.
export function totalFnFor(kind) {
  return async (interval) => {
    const mod = await loadReal();
    if (kind === 'ped' && mod?.pedIntervalTotal) return mod.pedIntervalTotal(interval);
    if (kind === 'tmc' && mod?.tmcIntervalTotal) return mod.tmcIntervalTotal(interval);
    if (mod?.vehicleIntervalTotal) return mod.vehicleIntervalTotal(interval);
    return fallbackTotal(interval);
  };
}

// The real analyze.js functions are synchronous and expect a synchronous totalFn, so we
// resolve the actual named totaler (not the async wrapper above) before calling them.
async function resolveTotalFn(kind) {
  const mod = await loadReal();
  if (kind === 'ped' && mod?.pedIntervalTotal) return mod.pedIntervalTotal;
  if (kind === 'tmc' && mod?.tmcIntervalTotal) return mod.tmcIntervalTotal;
  if (mod?.vehicleIntervalTotal) return mod.vehicleIntervalTotal;
  return fallbackTotal;
}

function fallbackTotal(interval) {
  if (interval.inbound || interval.outbound) {
    const a = (interval.inbound || []).reduce((s, v) => s + v, 0);
    const b = (interval.outbound || []).reduce((s, v) => s + v, 0);
    return a + b;
  }
  if (interval.counts && Array.isArray(interval.counts)) {
    return interval.counts.reduce((s, pair) => s + pair[0] + pair[1], 0);
  }
  if (interval.counts && typeof interval.counts === 'object') {
    let sum = 0;
    for (const leg in interval.counts) {
      for (const dest in interval.counts[leg]) {
        sum += interval.counts[leg][dest].reduce((s, v) => s + v, 0);
      }
    }
    return sum;
  }
  return 0;
}

// ---- parsing ----
export async function parseVehicleCSV(text) {
  const mod = await loadReal();
  if (mod?.parseVehicleCSV) return mod.parseVehicleCSV(text);
  return fallbackParseVehicleCSV(text);
}
export async function parsePedCSV(text) {
  const mod = await loadReal();
  if (mod?.parsePedCSV) return mod.parsePedCSV(text);
  return fallbackParsePedCSV(text);
}
export async function parseTmcCSV(text) {
  const mod = await loadReal();
  if (mod?.parseTmcCSV) return mod.parseTmcCSV(text);
  return fallbackParseTmcCSV(text);
}
// No fallback for the xlsx path — there's no meaningful "local approximation" of a binary
// workbook format the way there is for CSV text, so this throws if the data layer is
// unavailable rather than silently producing wrong numbers.
export async function parseTripGenWorkbook(arrayBuffer, filename) {
  const mod = await loadReal();
  if (mod?.parseTripGenWorkbook) return mod.parseTripGenWorkbook(arrayBuffer, filename);
  throw new Error('Trip generation import requires the data layer (src/data/index.js), which is not available.');
}
// Async — `real` is populated by a dynamic import() that may not have resolved yet on first
// use (e.g. the very first trip-gen analysis render after page load), so a sync version here
// would race and silently fall back to the default bucket for every classification.
export async function categoryFor(label) {
  const mod = await loadReal();
  return mod?.categoryFor ? mod.categoryFor(label) : 'Personal Vehicles+Peds+Pickup-Dropoff';
}

// ---- analysis ----
// `kindOrTotalFn` accepts either the resolved totalFn (preferred call style used by
// summary.js below, via totalFnFor + these wrappers) — kept simple by always resolving
// against `kind` inside each renderer rather than threading function references through
// async boundaries awkwardly.
export async function peakHour(intervals, intervalMinutes, totalFnPromiseOrKind) {
  const mod = await loadReal();
  const totalFn = await resolveMaybeKind(totalFnPromiseOrKind);
  if (mod?.peakHour) return mod.peakHour(intervals, intervalMinutes, totalFn);
  return fallbackPeakHour(intervals, intervalMinutes, totalFn);
}
export async function peakFifteen(intervals, totalFnPromiseOrKind) {
  const mod = await loadReal();
  const totalFn = await resolveMaybeKind(totalFnPromiseOrKind);
  if (mod?.peakFifteen) return mod.peakFifteen(intervals, totalFn);
  return fallbackPeakFifteen(intervals, totalFn);
}
export async function volumeByInterval(intervals, totalFnPromiseOrKind) {
  const mod = await loadReal();
  const totalFn = await resolveMaybeKind(totalFnPromiseOrKind);
  if (mod?.volumeByInterval) return mod.volumeByInterval(intervals, totalFn);
  return fallbackVolumeByInterval(intervals, totalFn);
}
export async function amPmSplit(intervals, totalFnPromiseOrKind) {
  const mod = await loadReal();
  const totalFn = await resolveMaybeKind(totalFnPromiseOrKind);
  if (mod?.amPmSplit) return mod.amPmSplit(intervals, totalFn);
  return fallbackAmPmSplit(intervals, totalFn);
}

async function resolveMaybeKind(x) {
  if (typeof x === 'function') return x;
  if (typeof x === 'string') return resolveTotalFn(x);
  return undefined; // let the real fn use its own default (vehicleIntervalTotal)
}

// tmcSummary(tmcParsed) -> { approaches: [{ leg, approachTotal, destinations:
//   [{ leg, turnClass, total, pctOfApproach }] }], grandTotal }   (shape tmcDiagram.js consumes)
//
// analyze.js's real tmcSummary() returns a DIFFERENT shape — an object keyed by leg
// ({ [leg]: { total, destinations: { [destLeg]: { total, turnClass, pct } } } }), per its
// own selftest.js assertions. That shape is correct and has test coverage; this function
// adapts it to the array shape below rather than changing the data layer.
export async function tmcSummary(tmcParsed) {
  const mod = await loadReal();
  if (mod?.tmcSummary) return adaptRealTmcSummary(mod.tmcSummary(tmcParsed));
  return fallbackTmcSummary(tmcParsed);
}

function adaptRealTmcSummary(real) {
  let grandTotal = 0;
  const approaches = Object.keys(real).map((leg) => {
    const a = real[leg];
    grandTotal += a.total;
    return {
      leg,
      approachTotal: a.total,
      destinations: Object.keys(a.destinations).map((destLeg) => {
        const d = a.destinations[destLeg];
        return { leg: destLeg, turnClass: d.turnClass, total: d.total, pctOfApproach: d.pct };
      }),
    };
  });
  return { approaches, grandTotal };
}

// levelOfService(volume, capacity, opts?) -> { vc: number|null, los: 'A'..'F'|null }
export async function levelOfService(volume, capacity, opts) {
  const mod = await loadReal();
  if (mod?.levelOfService) return mod.levelOfService(volume, capacity, opts);
  return fallbackLevelOfService(volume, capacity, opts);
}

// ---- trip-generation analysis (no CSV-era fallback needed — only used by tripgenSection.js,
// which already requires the real data layer for parseTripGenWorkbook) ----
export async function peakHourInWindow(intervals, intervalMinutes, searchStartMin, searchEndMin, totalFnPromiseOrKind) {
  const mod = await loadReal();
  const totalFn = await resolveMaybeKind(totalFnPromiseOrKind);
  if (!mod?.peakHourInWindow) throw new Error('peakHourInWindow requires the data layer.');
  return mod.peakHourInWindow(intervals, intervalMinutes, searchStartMin, searchEndMin, totalFn);
}
export async function tripRate(dayTotalVolume, gsf) {
  const mod = await loadReal();
  return mod?.tripRate ? mod.tripRate(dayTotalVolume, gsf) : null;
}
export async function balanceEntryExit(inboundByInterval, outboundByInterval) {
  const mod = await loadReal();
  if (mod?.balanceEntryExit) return mod.balanceEntryExit(inboundByInterval, outboundByInterval);
  return { inbound: [...inboundByInterval], outbound: [...outboundByInterval] };
}
export async function qaqcPeakHourScore(primaryQuarters, recountQuarters) {
  const mod = await loadReal();
  if (!mod?.qaqcPeakHourScore) throw new Error('qaqcPeakHourScore requires the data layer.');
  return mod.qaqcPeakHourScore(primaryQuarters, recountQuarters);
}
export async function threePeakHourRating(scores) {
  const mod = await loadReal();
  if (!mod?.threePeakHourRating) throw new Error('threePeakHourRating requires the data layer.');
  return mod.threePeakHourRating(scores);
}

// ===================== fallbacks (used only if src/data/index.js fails to import) =====================

function fallbackPeakFifteen(intervals, totalFn = fallbackTotal) {
  let idx = 0, volume = -Infinity;
  intervals.forEach((iv, i) => {
    const t = totalFn(iv);
    if (t > volume) { volume = t; idx = i; }
  });
  return { idx, volume, label: intervals[idx]?.label ?? '' };
}

function fallbackPeakHour(intervals, intervalMinutes, totalFn = fallbackTotal) {
  const per = Math.max(1, Math.round(60 / intervalMinutes));
  if (per >= intervals.length) {
    const volume = intervals.reduce((s, iv) => s + totalFn(iv), 0);
    return { startIdx: 0, endIdx: intervals.length - 1, volume, label: rangeLabel(intervals, 0, intervals.length - 1) };
  }
  let best = { startIdx: 0, endIdx: per - 1, volume: -Infinity };
  for (let i = 0; i + per <= intervals.length; i++) {
    let v = 0;
    for (let j = i; j < i + per; j++) v += totalFn(intervals[j]);
    if (v > best.volume) best = { startIdx: i, endIdx: i + per - 1, volume: v };
  }
  return { ...best, label: rangeLabel(intervals, best.startIdx, best.endIdx) };
}

function rangeLabel(intervals, startIdx, endIdx) {
  const s = intervals[startIdx], e = intervals[endIdx];
  return `${s?.start ?? ''} – ${e?.end ?? ''}`;
}

function fallbackVolumeByInterval(intervals, totalFn = fallbackTotal) {
  return { labels: intervals.map((iv) => iv.label), totals: intervals.map(totalFn) };
}

function fallbackAmPmSplit(intervals, totalFn = fallbackTotal) {
  let am = 0, pm = 0;
  for (const iv of intervals) {
    if (iv.start == null) continue;
    const hour = Number(iv.start.split(':')[0]);
    const v = totalFn(iv);
    if (hour < 12) am += v; else pm += v;
  }
  return { am, pm };
}

function fallbackTmcSummary(tmcParsed) {
  let grandTotal = 0;
  const approaches = tmcParsed.approaches.map((app) => {
    let approachTotal = 0;
    const destinations = app.destinations.map((d) => {
      let total = 0;
      for (const iv of tmcParsed.intervals) {
        const arr = iv.counts?.[app.leg]?.[d.leg] || [];
        total += arr.reduce((s, v) => s + v, 0);
      }
      approachTotal += total;
      return { leg: d.leg, turnClass: d.turnClass, total };
    });
    grandTotal += approachTotal;
    return {
      leg: app.leg,
      approachTotal,
      destinations: destinations.map((d) => ({
        ...d,
        pctOfApproach: approachTotal > 0 ? Math.round((d.total / approachTotal) * 1000) / 10 : 0,
      })),
    };
  });
  return { approaches, grandTotal };
}

function fallbackLevelOfService(volume, capacity, opts = {}) {
  const thresholds = opts.thresholds || [0.6, 0.7, 0.8, 0.9, 1.0];
  if (!capacity || capacity <= 0) return { vc: null, los: null };
  const vc = volume / capacity;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  let los = 'F';
  for (let i = 0; i < thresholds.length; i++) {
    if (vc <= thresholds[i]) { los = letters[i]; break; }
  }
  return { vc: Math.round(vc * 1000) / 1000, los };
}

// ---- minimal CSV fallback parsers (BOM + en-dash aware) ----
function stripBOM(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
function splitCSVLine(line) {
  return line.split(',').map((s) => s.trim());
}
function parseTimeCol(cell) {
  const m = cell.split('–').map((s) => s.trim());
  return { start: m[0], end: m[1] };
}

function fallbackParseVehicleCSV(text) {
  const lines = stripBOM(text).split(/\r?\n/);
  const sections = { INBOUND: [], OUTBOUND: [] };
  let current = null;
  let header = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { current = null; header = null; continue; }
    if (line === 'INBOUND' || line === 'OUTBOUND') { current = line; header = null; continue; }
    if (!current) continue;
    const cells = splitCSVLine(line);
    if (!header) { header = cells; continue; }
    if (cells[0] === 'total') continue;
    sections[current].push(cells);
  }
  const types = header ? header.slice(1, -1) : [];
  const n = Math.max(sections.INBOUND.length, sections.OUTBOUND.length);
  const intervals = [];
  for (let i = 0; i < n; i++) {
    const inRow = sections.INBOUND[i];
    const outRow = sections.OUTBOUND[i];
    const row = inRow || outRow;
    const { start, end } = parseTimeCol(row[0]);
    intervals.push({
      label: row[0],
      start,
      end,
      inbound: inRow ? inRow.slice(1, -1).map(Number) : types.map(() => 0),
      outbound: outRow ? outRow.slice(1, -1).map(Number) : types.map(() => 0),
    });
  }
  return { types, intervals };
}

function fallbackParsePedCSV(text) {
  const lines = stripBOM(text).split(/\r?\n/).filter((l) => l.trim().length);
  const header = splitCSVLine(lines[0]);
  const cols = header.slice(1, -1);
  const crosswalks = [];
  for (let i = 0; i < cols.length; i += 2) {
    const a = cols[i], b = cols[i + 1] || '';
    const name = a.replace(/\s+\S+$/, '');
    crosswalks.push({ name, dir0: a.split(' ').pop(), dir1: b.split(' ').pop() });
  }
  const intervals = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells[0] === 'total') continue;
    const { start, end } = parseTimeCol(cells[0]);
    const nums = cells.slice(1, -1).map(Number);
    const counts = [];
    for (let j = 0; j < nums.length; j += 2) counts.push([nums[j], nums[j + 1] || 0]);
    intervals.push({ label: cells[0], start, end, counts });
  }
  return { crosswalks, intervals };
}

function fallbackParseTmcCSV(text) {
  const lines = stripBOM(text).split(/\r?\n/).filter((l) => l.trim().length);
  const header = splitCSVLine(lines[0]);
  const cols = header.slice(1);
  const approachMap = new Map();
  const movRe = /^(\w+)→(\w+)\(([^)]+)\)\s+(.+)$/;
  cols.forEach((col) => {
    const m = col.match(movRe);
    if (!m) return;
    const [, fromLeg, toLeg, turn] = m;
    if (!approachMap.has(fromLeg)) approachMap.set(fromLeg, new Map());
    approachMap.get(fromLeg).set(toLeg, turn);
  });
  const approaches = Array.from(approachMap.entries()).map(([leg, destMap]) => ({
    leg,
    destinations: Array.from(destMap.entries()).map(([dleg, turnClass]) => ({ leg: dleg, turnClass })),
  }));
  const intervals = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells[0] === 'total') continue;
    const { start, end } = parseTimeCol(cells[0]);
    const counts = {};
    approaches.forEach((a) => {
      counts[a.leg] = {};
      a.destinations.forEach((d) => {
        const idx = cols.findIndex((c) => c.startsWith(`${a.leg}→${d.leg}(`) && c.endsWith('total'));
        counts[a.leg][d.leg] = [idx >= 0 ? Number(cells[idx + 1] || 0) : 0];
      });
    });
    intervals.push({ label: cells[0], start, end, counts });
  }
  return { approaches, types: [], intervals };
}
