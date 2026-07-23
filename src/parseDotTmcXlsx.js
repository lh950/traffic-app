// Parser for standard Turning Movement Count (TMC) XLSX template
// 4 approaches × 3 movements = 12 direction columns
// 6 rows per 15-min interval: Car, Truck, Bus, Bike, (blank), (blank)
// From/To time appears only on the Car row; Class column = "Car" / "Truck" / "Bus" / "Bike"
// Requires window.XLSX (SheetJS, CDN-loaded)

// Direction columns D–O (0-indexed cols 3–14) → [fromLeg, toLeg]
// SB = vehicle entered from North; EB = from West; NB = from South; WB = from East
const DIR_MAP = [
  ['N','E'], ['N','S'], ['N','W'],  // SB LT, TH, RT
  ['W','N'], ['W','E'], ['W','S'],  // EB LT, TH, RT
  ['S','W'], ['S','N'], ['S','E'],  // NB LT, TH, RT
  ['E','S'], ['E','W'], ['E','N'],  // WB LT, TH, RT
];

const STANDARD_APPROACHES = [
  { leg: 'N', destinations: ['E', 'S', 'W'] },
  { leg: 'W', destinations: ['N', 'E', 'S'] },
  { leg: 'S', destinations: ['W', 'N', 'E'] },
  { leg: 'E', destinations: ['S', 'W', 'N'] },
];

function parseTime(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    const m = Math.round(v * 24 * 60);
    return (m > 0 && m <= 1439) ? m : null;
  }
  if (typeof v === 'string') {
    const match = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  return null;
}

function minutesToHHMM(m) {
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function readTmcMeta(sheet, range) {
  const XLSX = window.XLSX;
  const meta = { nodeId: null, locationNS: null, locationEW: null, borough: null, intervalMin: 15, collectDate: null, hasBike: false };
  for (let r = 0; r <= Math.min(22, range.e.r); r++) {
    const aCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!aCell || !aCell.v) continue;
    const label = String(aCell.v).toLowerCase().trim();
    const bCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const val = bCell ? bCell.v : null;
    if (label.includes('node id') || label.includes('node_id')) {
      meta.nodeId = val;
    } else if (label.includes('location') && (label.includes('1') || label.includes('n/s'))) {
      if (meta.locationNS === null) meta.locationNS = val != null ? String(val) : null;
    } else if (label.includes('location') && (label.includes('2') || label.includes('e/w'))) {
      if (meta.locationEW === null) meta.locationEW = val != null ? String(val) : null;
    } else if (label.includes('borough')) {
      meta.borough = val;
    } else if (label === 'interval' || label.includes('interval (')) {
      meta.intervalMin = Math.round(Number(val)) || 15;
    } else if (label.includes('collect date') || label.includes('date of count')) {
      meta.collectDate = val;
    } else if (label === 'bike' || label === 'bicycle') {
      meta.hasBike = bCell && String(bCell.v).toUpperCase().trim() === 'Y';
    }
  }
  return meta;
}

function parseTmcIntervals(sheet, range, firstDataRow) {
  const XLSX = window.XLSX;
  const intervals = [];
  let currentTime = null;
  let motor = null;
  let bike = null;

  for (let r = firstDataRow; r <= range.e.r; r++) {
    const aCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    const cCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];

    // New interval when col A has a time value
    if (aCell && aCell.v != null && aCell.v !== '') {
      const t = parseTime(aCell.v);
      if (t !== null) {
        if (currentTime !== null && motor !== null) {
          intervals.push({ startMin: currentTime, motor, bike: bike || Array(12).fill(0) });
        }
        currentTime = t;
        motor = Array(12).fill(0);
        bike = Array(12).fill(0);
      }
    }

    if (motor === null || !cCell || !cCell.v) continue;

    const cls = String(cCell.v).toLowerCase().trim();
    if (!cls) continue;

    const isBike = cls === 'bike' || cls === 'bicycle';
    const isMotor = cls === 'car' || cls === 'truck' || cls === 'bus'
      || cls === 'auto' || cls === 'heavy vehicle' || cls === 'suv/van/pickup'
      || cls === 'motorbike' || cls === 'motorcycle';

    if (!isBike && !isMotor) continue;

    for (let d = 0; d < 12; d++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: 3 + d })];
      const v = cell && cell.v != null ? (Number(cell.v) || 0) : 0;
      if (isBike) bike[d] += v;
      else motor[d] += v;
    }
  }

  if (currentTime !== null && motor !== null) {
    intervals.push({ startMin: currentTime, motor, bike: bike || Array(12).fill(0) });
  }

  return intervals;
}

function groupIntoPeriods(intervals, intervalMin) {
  if (!intervals.length) return [];

  const maxGap = intervalMin * 1.5;
  const blocks = [[intervals[0]]];
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].startMin - intervals[i - 1].startMin > maxGap) blocks.push([]);
    blocks[blocks.length - 1].push(intervals[i]);
  }

  return blocks.map(block => {
    const startMin = block[0].startMin;
    const slots = block.length;
    const endMin = block[slots - 1].startMin + intervalMin;
    const name = `${minutesToHHMM(startMin)}–${minutesToHHMM(endMin)}`;

    const hasBike = block.some(iv => iv.bike.some(v => v > 0));
    const typeCount = hasBike ? 2 : 1;

    const tmcData = {};
    for (const [from, to] of DIR_MAP) {
      if (!tmcData[from]) tmcData[from] = {};
      tmcData[from][to] = Array.from({ length: slots }, () => Array(typeCount).fill(0));
    }
    DIR_MAP.forEach(([from, to], dirIdx) => {
      block.forEach((iv, slotIdx) => {
        tmcData[from][to][slotIdx][0] = iv.motor[dirIdx];
        if (hasBike) tmcData[from][to][slotIdx][1] = iv.bike[dirIdx];
      });
    });

    return {
      name,
      startMin,
      slots,
      hasBike,
      data: {
        cfg: { startMinutes: startMin, intervalMin, durationMin: slots * intervalMin },
        tmcData,
        // Zero-fill pedData so shared sheet-picker code (pedData[0]?.length) works correctly
        pedData: Array(4).fill(null).map(() => Array.from({ length: slots }, () => [0, 0])),
        vData: { in: Array.from({ length: slots }, () => [0]), out: Array.from({ length: slots }, () => [0]) },
        vManual: { in: new Set(), out: new Set() },
        pedManual: Array(4).fill(null).map(() => new Set()),
        tmManual: {},
      },
    };
  });
}

export function parseDotTmcXlsx(arrayBuffer) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS (window.XLSX) is not loaded. Reload the page and try again.');

  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  if (!wb.SheetNames.length) throw new Error('No sheets found in file.');

  const results = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

    // Detect TMC format: any cell in first 5 rows / 4 cols contains "turning"
    let isTmc = false;
    outer: for (let r = 0; r <= Math.min(4, range.e.r); r++) {
      for (let c = 0; c <= 3; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && String(cell.v || '').toLowerCase().includes('turning')) { isTmc = true; break outer; }
      }
    }
    if (!isTmc) continue;

    const meta = readTmcMeta(sheet, range);

    // Find data header row: col A = "From" (case-insensitive)
    let dataHeaderRow = -1;
    for (let r = 0; r <= Math.min(35, range.e.r); r++) {
      const aCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
      if (aCell && String(aCell.v || '').toLowerCase().trim() === 'from') { dataHeaderRow = r; break; }
    }
    if (dataHeaderRow < 0) continue;

    const intervals = parseTmcIntervals(sheet, range, dataHeaderRow + 1);
    if (!intervals.length) continue;

    const periods = groupIntoPeriods(intervals, meta.intervalMin);
    if (!periods.length) continue;

    results.push({ sheetName, meta, periods });
  }

  if (!results.length) {
    throw new Error('No turning movement count sheets found in this file.');
  }

  return results;
}

export function buildTmcIntersectionFromMeta(meta) {
  const ns = meta.locationNS || 'N/S Street';
  const ew = meta.locationEW || 'E/W Street';
  return {
    street1: ns,
    street2: ew,
    crosswalks: [],
    approaches: STANDARD_APPROACHES.map(a => ({ leg: a.leg, destinations: [...a.destinations] })),
    template: 't4',
    diagLeg: 'SE',
    missingLeg: '',
    legLabels: {},
    oneWay: {},
    oneWayIn: {},
  };
}
