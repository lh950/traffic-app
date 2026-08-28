// Parser for a StreetLight Insight "Zone Activity" export (`*_zone_odg_all.csv`, found in the
// analysis's "Zone Activity" folder — NOT the O-D file at the project root, which is trip
// DISTRIBUTION data between the site and surrounding geography, a different concept from a
// count comparison, and NOT the TMC peak-hour table (`parseStreetlightXlsx.js`), which is
// intersection-only).
//
// Real file structure (confirmed from an actual sample export, not guessed):
// Plain comma-separated, one header row, one data row per (zone, day type, day part) triple.
// Columns (by name, not fixed position — StreetLight adds/reorders columns across analysis
// configs): Mode of Travel, Intersection Type, Zone ID, Zone Name, Zone Is Pass-Through, Zone
// Direction (degrees), Zone is Bi-Direction, Day Type, Day Part, then a volume column whose
// exact header depends on the analysis's chosen Output Unit — seen as "Average Daily Zone
// Traffic (StL Volume)"; matched by substring ("Zone Traffic") rather than the exact string,
// since a different Output Unit (StL Index, Calibrated Index, etc.) changes the parenthetical.
//
// Day Type values look like "0: All Days (M-Su)", "1: Monday (M-M)", ... "7: Sunday (Su-Su)" —
// the leading digit is what this parser keys on (1-5 = weekday, 6-7 = weekend, 0 = all days).
// Day Part values look like "2: Peak AM (6am-10am)" — same leading-digit convention, matched
// against DAY_PART labels below rather than assumed to always be exactly six buckets.
//
// Critically, this export has NO vehicle-classification breakdown — "All Vehicles CVD Plus" is
// one combined bidirectional volume per zone per time bucket. A Trip Gen comparison against
// this file can therefore only ever be total-volume-vs-total-volume, never
// classification-vs-classification — callers must make that limitation visible, not paper
// over it (same spirit as parseStreetlightXlsx.js's projection-not-a-count framing).

export const SL_DAY_PART = {
  ALL_DAY: 0, EARLY_AM: 1, PEAK_AM: 2, MID_DAY: 3, PEAK_PM: 4, LATE_PM: 5,
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function leadingIndex(cell) {
  const m = String(cell || '').match(/^(\d+)\s*:/);
  return m ? Number(m[1]) : null;
}

export function parseStreetlightZoneCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) throw new Error('Empty file.');
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (predicate) => headers.findIndex(predicate);
  const nameCol = col((h) => h === 'zone name');
  const dayTypeCol = col((h) => h === 'day type');
  const dayPartCol = col((h) => h === 'day part');
  const volCol = col((h) => h.includes('zone traffic'));
  if (nameCol < 0 || dayTypeCol < 0 || dayPartCol < 0 || volCol < 0) {
    throw new Error('This doesn\'t look like a StreetLight Zone Activity export — expected columns for Zone Name, Day Type, Day Part, and a Zone Traffic volume. Make sure you picked the file from the "Zone Activity" folder, not the O-D file at the project root.');
  }

  const zoneOrder = [];
  const byZone = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = cells[nameCol];
    if (!name) continue;
    const dayTypeIdx = leadingIndex(cells[dayTypeCol]);
    const dayPartIdx = leadingIndex(cells[dayPartCol]);
    if (dayTypeIdx == null || dayPartIdx == null) continue;
    const vol = Number(cells[volCol]);
    if (!Number.isFinite(vol)) continue;
    if (!byZone[name]) { byZone[name] = {}; zoneOrder.push(name); }
    byZone[name][dayTypeIdx] = byZone[name][dayTypeIdx] || {};
    byZone[name][dayTypeIdx][dayPartIdx] = vol;
  }

  if (!zoneOrder.length) {
    throw new Error('No zone rows found in this file.');
  }

  return {
    zones: zoneOrder.map((name) => ({ name, byDayType: byZone[name] })),
  };
}

// Weekday = average of Monday(1)..Friday(5) rows that are actually present; Weekend =
// average of Saturday(6)/Sunday(7). Returns null (not 0) when nothing matches, so callers can
// show "no data" instead of a misleading zero.
export function slZoneAverageForDayType(zone, dayTypeGroup, dayPartIdx) {
  const idxs = dayTypeGroup === 'weekday' ? [1, 2, 3, 4, 5] : [6, 7];
  const vals = idxs
    .map((i) => zone.byDayType[i]?.[dayPartIdx])
    .filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
