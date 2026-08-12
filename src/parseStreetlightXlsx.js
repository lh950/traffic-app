// Parser for a StreetLight Insight TMC "peak hour table" export
// (`*_tmc_peak_hour_table.xlsx`). This is a read-only, informational import — see
// DEVLOG/BUGS for the framing: StreetLight's numbers are a GPS-derived statistical
// PROJECTION, never a real count, and are never merged into this app's own tmcData.
//
// Real file structure (confirmed from an actual sample export, not guessed):
// One sheet, repeating blocks — one block per (day-type, peak-period) combination, e.g.
// "All Days, Peak AM", "All Days, Peak PM", "Tuesday, Peak AM", etc.
//   row 0 (block title): col A = "All Days, Peak AM, Intersection 01" (rest of row blank)
//   row 1 (leg headers):  4 groups of 3 cols, e.g. "South - Graham Avenue (Northbound)" —
//                         physical leg (compass word) + street name + travel direction,
//                         all spelled out together, so no NB/SB/EB/WB inference is needed
//                         (unlike UTDF/DOT-TMC — see BUG-023 for why that matters).
//   row 2 (sub-headers):  Left | Thru | Right repeated per leg group, then Total | Total %
//   rows 3-6 (data):      one row per 15-min interval within the peak hour (4 rows)
//   next rows:            Hourly Total, Hourly Total %, PHF (one PHF per leg-movement col)
//   blank row separates blocks. Block count/order/leg-count can vary by analysis (e.g. a
//   3-leg intersection, or a day-type that wasn't run) — this parser scans for landmarks
//   row-by-row rather than assuming fixed positions, same approach as parseDotTmcXlsx.js.

const TIME_RE = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i;

function parseTimeLabel(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    const m = Math.round(v * 24 * 60);
    return (m >= 0 && m < 1440) ? m : null;
  }
  const s = String(v).trim();
  const m = s.match(TIME_RE);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

// Compass word -> this app's own leg-letter convention (STANDARD_APPROACHES /
// diagLeg use the same initials). This is a plain spelling->abbreviation lookup of
// words StreetLight itself already prints, NOT an inferred NB/SB/EB/WB remapping
// table (the class of bug BUG-023 warns about) — the compass word IS the physical
// leg, spelled out, straight from the source file.
const COMPASS_TO_LEG = {
  north: 'N', south: 'S', east: 'E', west: 'W',
  northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
};

const LEG_HEADER_RE = /^\s*([A-Za-z]+)\s*-\s*(.+?)\s*\(([^)]+)\)\s*$/;

function cellVal(sheet, XLSX, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : null;
}
function cellText(sheet, XLSX, r, c) {
  const v = cellVal(sheet, XLSX, r, c);
  return v == null ? '' : String(v).trim();
}
function cellNum(sheet, XLSX, r, c) {
  const v = cellVal(sheet, XLSX, r, c);
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function cellPct(sheet, XLSX, r, c) {
  const v = cellVal(sheet, XLSX, r, c);
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // StreetLight exports percentages either as 0-1 fractions or already as 0-100 —
  // normalize to a 0-100 number for display.
  return Math.abs(n) <= 1 ? n * 100 : n;
}

const TITLE_RE = /,\s*Peak\s+([A-Za-z]+)/i;

function canonicalPeak(raw) {
  const s = raw.toLowerCase();
  if (s.startsWith('am')) return 'AM';
  if (s.startsWith('pm')) return 'PM';
  if (s.startsWith('md') || s.startsWith('mid')) return 'MD';
  return raw.toUpperCase();
}

function parseLegHeaderRow(sheet, XLSX, row, maxCol) {
  const starts = [];
  for (let c = 0; c <= maxCol; c++) {
    const txt = cellText(sheet, XLSX, row, c);
    if (!txt) continue;
    const m = txt.match(LEG_HEADER_RE);
    if (m) {
      starts.push({ col: c, compassWord: m[1], streetName: m[2], travelDir: m[3] });
    } else if (!/^total/i.test(txt)) {
      // Non-conforming header text (doesn't match "X - Street (Direction)" and isn't a
      // Total column) — still record it as a leg group so data isn't silently dropped,
      // just without a resolvable leg letter.
      starts.push({ col: c, compassWord: null, streetName: txt, travelDir: null });
    }
  }
  starts.sort((a, b) => a.col - b.col);
  return starts;
}

function widthsFor(starts, totalCol, maxCol) {
  return starts.map((s, i) => {
    const nextCol = i + 1 < starts.length ? starts[i + 1].col : (totalCol != null ? totalCol : maxCol + 1);
    return Math.max(1, Math.min(3, nextCol - s.col));
  });
}

function parseSubHeaderCols(sheet, XLSX, row, start, width) {
  const cols = {};
  for (let i = 0; i < width; i++) {
    const c = start + i;
    const txt = cellText(sheet, XLSX, row, c).toLowerCase();
    if (/^l/.test(txt)) cols.L = c;
    else if (/^t/.test(txt)) cols.T = c;
    else if (/^r/.test(txt)) cols.R = c;
  }
  return cols;
}

function readLegRow(sheet, XLSX, row, legs, numFn) {
  const byLeg = {};
  legs.forEach((leg) => {
    byLeg[leg.key] = {
      L: leg.cols.L != null ? numFn(sheet, XLSX, row, leg.cols.L) : 0,
      T: leg.cols.T != null ? numFn(sheet, XLSX, row, leg.cols.T) : 0,
      R: leg.cols.R != null ? numFn(sheet, XLSX, row, leg.cols.R) : 0,
    };
  });
  return byLeg;
}

export function parseStreetlightXlsx(arrayBuffer) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS (window.XLSX) is not loaded. Reload the page and try again.');

  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  if (!wb.SheetNames.length) throw new Error('No sheets found in file.');
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

  const blocks = [];

  for (let r = 0; r <= range.e.r; r++) {
    const titleTxt = cellText(sheet, XLSX, r, 0);
    if (!titleTxt) continue;
    const tMatch = titleTxt.match(TITLE_RE);
    if (!tMatch) continue;

    const dayType = titleTxt.split(',')[0].trim() || 'All Days';
    const peakPeriod = canonicalPeak(tMatch[1]);

    const headerRow = r + 1;
    const subHeaderRow = r + 2;
    if (subHeaderRow > range.e.r) continue;

    const starts = parseLegHeaderRow(sheet, XLSX, headerRow, range.e.c);
    if (!starts.length) continue;

    // Locate Total / Total % columns from the sub-header row (searched across the whole
    // row width, not assumed to sit at any fixed offset).
    let totalCol = null, totalPctCol = null;
    for (let c = 0; c <= range.e.c; c++) {
      const txt = cellText(sheet, XLSX, subHeaderRow, c).toLowerCase();
      if (/^total\s*%$/.test(txt)) totalPctCol = c;
      else if (/^total$/.test(txt)) totalCol = c;
    }

    const widths = widthsFor(starts, totalCol, range.e.c);
    const legs = starts.map((s, i) => {
      const legLetter = s.compassWord ? (COMPASS_TO_LEG[s.compassWord.toLowerCase()] || null) : null;
      const cols = parseSubHeaderCols(sheet, XLSX, subHeaderRow, s.col, widths[i]);
      const key = legLetter || `col${s.col}`;
      return { key, legLetter, compassWord: s.compassWord, streetName: s.streetName, travelDir: s.travelDir, cols };
    });

    // Interval rows: consecutive rows immediately below the sub-header whose col A parses
    // as a time label (e.g. "9:00am"). Stops at the first row that doesn't — normally 4
    // rows (one per 15-min interval in the peak hour), but not hardcoded to exactly 4 so a
    // differently-configured interval length still parses.
    const intervals = [];
    let dataRow = subHeaderRow + 1;
    while (dataRow <= range.e.r) {
      const startMin = parseTimeLabel(cellVal(sheet, XLSX, dataRow, 0));
      if (startMin == null) break;
      const byLeg = readLegRow(sheet, XLSX, dataRow, legs, cellNum);
      intervals.push({
        label: cellText(sheet, XLSX, dataRow, 0),
        startMin,
        byLeg,
        total: totalCol != null ? cellNum(sheet, XLSX, dataRow, totalCol) : null,
        totalPct: totalPctCol != null ? cellPct(sheet, XLSX, dataRow, totalPctCol) : null,
      });
      dataRow++;
    }
    if (!intervals.length) continue;

    // Hourly Total / Hourly Total % / PHF rows — searched by label match within the next
    // few rows after the interval rows (not assumed strictly positional), stopping if we
    // hit the next block's title or run off the sheet.
    let hourlyTotal = null, hourlyTotalPct = null, phf = null;
    let scanRow = dataRow;
    const scanLimit = Math.min(range.e.r, dataRow + 8);
    while (scanRow <= scanLimit) {
      const label = cellText(sheet, XLSX, scanRow, 0).toLowerCase();
      if (!label) { scanRow++; continue; }
      if (label.match(TITLE_RE)) break; // next block started
      if (label === 'hourly total') {
        hourlyTotal = {
          byLeg: readLegRow(sheet, XLSX, scanRow, legs, cellNum),
          total: totalCol != null ? cellNum(sheet, XLSX, scanRow, totalCol) : null,
        };
      } else if (label === 'hourly total %') {
        hourlyTotalPct = {
          byLeg: readLegRow(sheet, XLSX, scanRow, legs, cellPct),
          totalPct: totalPctCol != null ? cellPct(sheet, XLSX, scanRow, totalCol != null ? totalCol : totalPctCol) : null,
        };
      } else if (label === 'phf') {
        phf = {
          byLeg: readLegRow(sheet, XLSX, scanRow, legs, cellNum),
          overall: totalCol != null ? (cellVal(sheet, XLSX, scanRow, totalCol) != null ? cellNum(sheet, XLSX, scanRow, totalCol) : null) : null,
        };
        scanRow++;
        break; // PHF is always the last row of a block
      }
      scanRow++;
    }

    blocks.push({
      key: `${dayType}__${peakPeriod}`,
      dayType,
      peakPeriod,
      title: titleTxt,
      startMin: intervals[0].startMin,
      intervalMin: intervals.length > 1 ? (intervals[1].startMin - intervals[0].startMin) : 15,
      legs: legs.map((l) => ({ key: l.key, legLetter: l.legLetter, compassWord: l.compassWord, streetName: l.streetName, travelDir: l.travelDir })),
      intervals,
      hourlyTotal,
      hourlyTotalPct,
      phf,
    });
  }

  if (!blocks.length) {
    throw new Error('No StreetLight peak-hour blocks found in this file. Expected a title row like "All Days, Peak AM, ..." somewhere in column A.');
  }

  return { sheetName, blocks };
}
