// Parser for standard pedestrian count XLSX template (RawCountTemplate format)
// 16-movement pedestrian count: movements 1-8 = crosswalk volumes, 9-16 = corner/sidewalk
// Requires window.XLSX (SheetJS, CDN-loaded)
//
// Movement → crosswalk mapping (from PEDESTRIAN LOS WORKSHEET):
//   v1, v2 = North crosswalk (dir0 = EB, dir1 = WB)
//   v3, v4 = East crosswalk  (dir0 = NB, dir1 = SB)
//   v5, v6 = South crosswalk (dir0 = EB, dir1 = WB)
//   v7, v8 = West crosswalk  (dir0 = NB, dir1 = SB)
//   s9-s16 = corner/sidewalk flows (stored for future LOS use)

// Metadata rows and first data row are both derived dynamically from label scanning / marker position

// Excel time serial → HH:MM string (times are fractions of a day)
function xlTimeToMinutes(v) {
  if (v == null) return null;
  // datetime.time objects come through as fractional day values
  if (typeof v === 'number') {
    const totalMin = Math.round(v * 24 * 60);
    return totalMin;
  }
  // Might already be a string "H:MM:SS" or "H:MM"
  if (typeof v === 'string') {
    const parts = v.split(':').map(Number);
    if (parts.length >= 2) return parts[0] * 60 + parts[1];
  }
  return null;
}

function minutesToHHMM(m) {
  const h = Math.floor(m / 60) % 24;
  const mn = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
}

function readMeta(sheet) {
  const XLSX = window.XLSX;
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
  const result = { nodeId: null, locationNS: null, locationEW: null, borough: null, intervalMin: 15 };
  // Scan column A for labels — handles files with blank rows at top or other structural variations
  for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
    const aCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!aCell || !aCell.v) continue;
    const label = String(aCell.v).toLowerCase().trim();
    const bCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const val = bCell ? bCell.v : null;
    if (label.includes('node id') || label.includes('node_id')) result.nodeId = val;
    else if ((label.includes('location') && label.includes('n/s')) || label.includes('location1')) result.locationNS = val != null ? String(val) : null;
    else if ((label.includes('location') && label.includes('e/w')) || label.includes('location2')) result.locationEW = val != null ? String(val) : null;
    else if (label.includes('borough')) result.borough = val;
    else if (label.includes('interval')) result.intervalMin = Math.round(Number(val)) || 15;
  }
  return result;
}

// Parse one sheet — returns array of {startMin, counts[16]} per row
// firstDataRow: 0-indexed row where data starts (derived from PEDESTRIAN marker position)
function parseSheetRows(sheet, firstDataRow) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS not loaded');
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:R100');
  const rows = [];
  for (let r = firstDataRow; r <= range.e.r; r++) {
    const timeCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!timeCell || timeCell.t === 'e') continue; // skip missing or Excel error cells (#VALUE! etc.)
    if (!timeCell.v) continue; // skip zero/empty
    const startMin = xlTimeToMinutes(timeCell.v);
    if (startMin == null || isNaN(startMin) || startMin <= 0) continue;
    if (startMin > 1439) continue; // skip error codes that parsed as large numbers (> 24h)
    const counts = [];
    for (let c = 1; c <= 16; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      counts.push(cell ? (Number(cell.v) || 0) : 0);
    }
    rows.push({ startMin, counts });
  }
  return rows;
}

// Detect time gaps > maxGapMin and split into consecutive blocks
function splitByTimeGap(rows, intervalMin) {
  if (!rows.length) return [];
  const maxGap = intervalMin * 1.5; // allow 50% slack for rounding
  const blocks = [[rows[0]]];
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].startMin - rows[i - 1].startMin;
    if (gap > maxGap) blocks.push([]);
    blocks[blocks.length - 1].push(rows[i]);
  }
  return blocks;
}

// Convert a block of rows into a period data object compatible with captureActivePeriod()
// crosswalks: [{name, dir0, dir1}, ...]  (4 fixed entries for N/E/S/W)
function blockToPeriodData(block, intervalMin) {
  const slots = block.length;

  // Build pedData: [4 crosswalks][slots][2 directions]
  const pedData = [
    Array.from({length: slots}, (_, i) => [block[i].counts[0], block[i].counts[1]]), // N: m1, m2
    Array.from({length: slots}, (_, i) => [block[i].counts[2], block[i].counts[3]]), // E: m3, m4
    Array.from({length: slots}, (_, i) => [block[i].counts[4], block[i].counts[5]]), // S: m5, m6
    Array.from({length: slots}, (_, i) => [block[i].counts[6], block[i].counts[7]]), // W: m7, m8
  ];

  // Store corner/sidewalk movements 9-16 as extra data (not yet used by LOS)
  const cornerData = Array.from({length: slots}, (_, i) => block[i].counts.slice(8));

  const startMin = block[0].startMin;
  const durationMin = slots * intervalMin;

  return {
    cfg: { startMinutes: startMin, intervalMin, durationMin },
    pedData,
    cornerData,
    // vData: 1 vehicle pair, all zeros — raw count is ped-only
    vData: { in: Array.from({length: slots}, () => [0]), out: Array.from({length: slots}, () => [0]) },
    tmcData: {},
    vManual: { in: new Set(), out: new Set() },
    pedManual: Array(4).fill(null).map(() => new Set()),
    tmManual: {},
  };
}

export function parseRawCountXlsx(arrayBuffer) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS (window.XLSX) is not loaded. Reload the page and try again.');

  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  if (!wb.SheetNames.length) throw new Error('No sheets found in file.');

  const results = [];
  let pedSheetsFound = 0;
  const skippedNoData = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    // Scan rows 1–30, columns A–E for "PEDESTRIAN" marker; record which row it's on
    let markerRow = -1;
    for (let r = 0; r <= 29 && markerRow === -1; r++) {
      for (let c = 0; c <= 4; c++) {
        const cell = sheet[window.XLSX.utils.encode_cell({ r, c })];
        if (cell && String(cell.v).toUpperCase().includes('PEDESTRIAN')) { markerRow = r; break; }
      }
    }
    if (markerRow === -1) continue;
    pedSheetsFound++;

    // Template structure after marker: [marker] [Movement Number] [header row] [first data row]
    // So first data row (0-indexed) = markerRow + 3
    const firstDataRow = markerRow + 3;

    const meta = readMeta(sheet);
    const rows = parseSheetRows(sheet, firstDataRow);
    if (!rows.length) {
      skippedNoData.push(sheetName);
      continue;
    }

    const blocks = splitByTimeGap(rows, meta.intervalMin);

    // Name periods by actual time range (e.g. "07:00–09:00")
    const periodNames = blocks.map(block => {
      const startStr = minutesToHHMM(block[0].startMin);
      const endMin = block[block.length - 1].startMin + meta.intervalMin;
      const endStr = minutesToHHMM(endMin);
      return `${startStr}–${endStr}`;
    });

    results.push({
      sheetName,
      meta,
      periods: blocks.map((block, i) => ({
        name: periodNames[i],
        startMin: block[0].startMin,
        data: blockToPeriodData(block, meta.intervalMin),
      })),
    });
  }

  if (!results.length) {
    if (pedSheetsFound > 0) {
      throw new Error(
        `Found ${pedSheetsFound} pedestrian sheet(s) but no valid time-series data rows. ` +
        `Sheets checked: ${skippedNoData.join(', ')}. ` +
        `This may be a summary/totals-only file or a format not yet supported.`
      );
    }
    const sheetList = wb.SheetNames.slice(0, 5).join(', ') + (wb.SheetNames.length > 5 ? '…' : '');
    // Dump first sheet's B column to help diagnose format
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const bColPreview = firstSheet ? Array.from({length: 15}, (_, i) => {
      const cell = firstSheet[window.XLSX.utils.encode_cell({ r: i, c: 1 })];
      return cell ? `B${i+1}="${cell.v}"` : null;
    }).filter(Boolean).slice(0, 6).join(', ') : '';
    throw new Error(
      `No pedestrian count sheets found. Sheets: ${sheetList}. ` +
      (bColPreview ? `Column B preview: ${bColPreview}. ` : '') +
      `This may be a vehicle/TMC count file — pedestrian import only supports the standard pedestrian count template.`
    );
  }

  return results;
}

// Build intersection and vPairs config matching the 4 N/E/S/W crosswalks
export function buildIntersectionFromMeta(meta) {
  const ns = meta.locationNS || 'N/S Street';
  const ew = meta.locationEW || 'E/W Street';
  return {
    street1: ns,
    street2: ew,
    crosswalks: [
      { name: `${ns} (N crosswalk)`, dir0: 'EB', dir1: 'WB', key0: 'q', key1: 'a', assign: 'N', oneWay: false },
      { name: `${ew} (E crosswalk)`, dir0: 'NB', dir1: 'SB', key0: 'w', key1: 's', assign: 'E', oneWay: false },
      { name: `${ns} (S crosswalk)`, dir0: 'EB', dir1: 'WB', key0: 'e', key1: 'd', assign: 'S', oneWay: false },
      { name: `${ew} (W crosswalk)`, dir0: 'NB', dir1: 'SB', key0: 'r', key1: 'f', assign: 'W', oneWay: false },
    ],
    approaches: [],
    template: 'standard',
    diagLeg: 'N',
    missingLeg: '',
    legLabels: {},
    oneWay: {},
    oneWayIn: {},
  };
}
