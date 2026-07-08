// Parser for TripGenData.xlsx-style workbooks — ONE file per physical location
// (driveway/parking lot/storage lot etc). Deliberately reads only the raw WKDY/WKND
// sheets (24h, 15-min Entry/Exit counts per classification) — NOT the auto+bike+bus+moto /
// light good vehs / Trucks / Pedestrians QA tabs (those recompute balancing/temporal-
// distribution from the same raw numbers, so re-deriving from raw is more reliable than
// trying to reverse-engineer their formulas), and NOT TripGenSummary.xlsx's Data_*/Analysis_*
// sheets, which formula-link to *other* external workbooks and can't be parsed standalone.
//
// Requires window.XLSX (SheetJS, loaded via CDN in index.html — XLSX is a zip+XML binary
// format that can't reasonably be hand-rolled the way CSV parsing is elsewhere in this app).

const ENTRY_COLS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const EXIT_COLS = ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
const CLASSIFICATION_ROW = 12;
const FIRST_DATA_ROW = 14;
const MAX_DATA_ROWS = 100; // 24h at 15-min = 96 rows; stop early if time values run out

function categoryFor(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('light goods')) return 'Light Goods';
  if (l.includes('single-unit') || l.includes('tractor trailer')) return 'Trucks';
  if (l.includes('pedestrian')) return 'Pedestrian';
  return 'Personal Vehicles+Peds+Pickup-Dropoff'; // autos, pickup/dropoff, bikes, motorcycles, buses — the source workbook's own name for this catch-all bucket, kept distinct from 'Pedestrian' above
}

function cellRef(sheet, col, row) {
  const cell = sheet[`${col}${row}`];
  return cell ? cell.v : null;
}

function timeToMinutes(v) {
  // SheetJS gives Excel time-of-day values as a Date with the 1899-12-30 epoch when
  // cellDates is set, or a fraction-of-a-day number otherwise. Handle both.
  if (v == null) return null;
  if (typeof v === 'number') return Math.round(v * 24 * 60);
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  return null;
}

function fmtTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDaySheet(sheet, sheetName) {
  const types = ENTRY_COLS.map((col) => String(cellRef(sheet, col, CLASSIFICATION_ROW) || '').trim());
  if (types.every((t) => !t)) {
    throw new Error(`Sheet "${sheetName}": couldn't find classification headers at row ${CLASSIFICATION_ROW} — layout may not match the expected TripGenData format.`);
  }

  const intervals = [];
  for (let row = FIRST_DATA_ROW; row < FIRST_DATA_ROW + MAX_DATA_ROWS; row++) {
    const rawTime = cellRef(sheet, 'A', row);
    const startMin = timeToMinutes(rawTime);
    if (startMin == null) break; // ran out of interval rows
    const inbound = ENTRY_COLS.map((col) => Number(cellRef(sheet, col, row)) || 0);
    const outbound = EXIT_COLS.map((col) => Number(cellRef(sheet, col, row)) || 0);
    const intervalLen = intervals.length === 0 ? 15 : startMin - timeToMinutes(cellRef(sheet, 'A', row - 1));
    const endMin = startMin + (intervalLen > 0 ? intervalLen : 15);
    intervals.push({ label: `${fmtTime(startMin)} – ${fmtTime(endMin)}`, start: fmtTime(startMin), end: fmtTime(endMin), inbound, outbound });
  }
  if (intervals.length === 0) {
    throw new Error(`Sheet "${sheetName}": no interval rows found starting at row ${FIRST_DATA_ROW} — expected time-of-day values in column A.`);
  }

  return { types, intervals };
}

function readMeta(wb) {
  const sheet = wb.Sheets['Summary'];
  if (!sheet) return { studyName: null, siteName: null, gsf: null };
  // Labels live in column A; the value is the first non-empty cell within a few columns
  // to the right on the same row — more robust to small template drift than hardcoding
  // exact cell addresses.
  function findByLabel(label) {
    for (let r = 1; r <= 10; r++) {
      const a = cellRef(sheet, 'A', r);
      if (typeof a === 'string' && a.trim().toLowerCase() === label) {
        for (const col of ['B', 'C', 'D']) {
          const v = cellRef(sheet, col, r);
          if (v != null && v !== '') return v;
        }
        return null;
      }
    }
    return null;
  }
  return {
    studyName: findByLabel('study name'),
    siteName: findByLabel('site name'),
    gsf: findByLabel('gross floor area (sq ft)'),
  };
}

export async function parseTripGenWorkbook(arrayBuffer, filename) {
  if (!window.XLSX) throw new Error('XLSX library not loaded — check your network connection and reload.');
  const wb = window.XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const daySheetNames = wb.SheetNames.filter((n) => /^WK(DY|ND)\s*\d+$/i.test(n.trim()));
  if (daySheetNames.length === 0) {
    throw new Error(`No WKDY/WKND sheets found in "${filename}" — this doesn't look like a TripGenData.xlsx workbook.`);
  }

  const days = daySheetNames.map((sheetName) => {
    const parsed = parseDaySheet(wb.Sheets[sheetName], sheetName);
    const dayType = /^WKDY/i.test(sheetName) ? 'weekday' : 'weekend';
    return { sheetName, dayType, parsed };
  });

  return { meta: readMeta(wb), days };
}

export { categoryFor };
