/* global __APP_VERSION__ */
import { cfg, vPairs, tmcPairs, intersection, tmcData, vData, pedData, mode, fnames, slotLabel } from './state.js';
import { classifyTurn, TURN_CLS_LABEL } from './diagram.js';
import { legLabel } from './setup.js';

export function getXLSXFilename(m) {
  const n = fnames[m === 'vehicle' ? 'vehicle' : m === 'ped' ? 'ped' : 'tmc'] || (m === 'vehicle' ? 'traffic_counts' : 'ped_counts');
  return n.replace(/\.(csv|xlsx)$/i, '') + '.xlsx';
}

function hasData(arr) {
  if (!arr) return false;
  for (const v of arr) {
    if (Array.isArray(v)) { if (hasData(v)) return true; }
    else if (v) return true;
  }
  return false;
}

// Format minutes-since-midnight as "12:00 AM"
function fmt12h(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Format minutes as "HH:MM:SS" (template uses this for start time metadata)
function fmtHHMMSS(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}

function getLocationLabel() {
  const s1 = intersection.street1?.trim() || '';
  const s2 = intersection.street2?.trim() || '';
  if (s1 && s2) return `${s1} and ${s2}`;
  return s1 || s2 || (window.projectInfo?.projectName) || '';
}

// Metadata block — always exactly META rows so freeze/merge offsets are stable.
// Row layout: Start Date | Start Time | Location | Project | Exported | blank
const META = 6;
function metaBlock() {
  const pi = window.projectInfo || {};
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return [
    ['Start Date:', pi.date || ''],
    ['Start Time:', fmtHHMMSS(cfg.startMinutes)],
    ['Location:', getLocationLabel()],
    ['Project:', pi.projectName || ''],
    ['Exported:', `${dateStr} ${timeStr}  ·  Traffic App v${__APP_VERSION__}`],
    [],
  ];
}

// Column width helper — sets wch in chars
function wch(w) { return { wch: w }; }

export function exportXLSX() {
  const XLSX = window.XLSX;
  if (!XLSX) { alert('XLSX library not loaded'); return; }
  const wb = XLSX.utils.book_new();
  const hasVehicle = hasData(vData.in) || hasData(vData.out);
  const hasPed     = hasData(pedData);
  const hasTMC     = intersection.approaches.some(a => a.destinations.some(d => hasData(tmcData[a.leg]?.[d])));
  const bikeIdx  = tmcPairs.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
  const motorIdx = tmcPairs.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
  const hasBikePairs = bikeIdx.length > 0;

  function appendTmcSheets(wb) {
    if (hasBikePairs && motorIdx.length > 0) {
      buildTMCSheet(wb, motorIdx, 'TMC');
      buildTMCSheet(wb, bikeIdx, 'TMC-Bikes');
    } else {
      buildTMCSheet(wb);
    }
  }

  if (!hasVehicle && !hasPed && !hasTMC) {
    if (mode === 'vehicle') buildVehicleSheet(wb);
    else if (mode === 'ped') buildPedSheet(wb);
    else appendTmcSheets(wb);
  } else {
    if (hasVehicle) buildVehicleSheet(wb);
    if (hasPed)     buildPedSheet(wb);
    if (hasTMC)     appendTmcSheets(wb);
  }
  const base = fnames.vehicle || fnames.tmc || fnames.ped || 'traffic_counts';
  XLSX.writeFile(wb, base.replace(/\.(csv|xlsx)$/i, '') + '.xlsx');
}

// ─── TMC sheet ──────────────────────────────────────────────────────────────
// Layout matches 24-Hour Count Template TMC sheet:
//   Rows 1-3: metadata (Start Date, Start Time, Location)
//   Row 4:    blank
//   Row 5:    approach labels merged across their columns
//   Row 6:    movement labels (+ type labels if multi-type)
//   Row 7:    type sub-labels (only when multi-type)
//   Row 8+:   data — col A = Time, remaining cols = counts

// origIndices: optional array of tmcPairs indices to include (for bike filtering).
// sheetName: optional override for the sheet tab label.
function buildTMCSheet(wb, origIndices, sheetName) {
  const apps = intersection.approaches;
  // Derive actual recorded type count from tmcData so header matches data
  // even if tmcPairs was reset to defaults after the count was recorded.
  let nT = tmcPairs.length;
  outer: for (const app of apps) {
    for (const dest of app.destinations) {
      const s0 = tmcData[app.leg]?.[dest]?.[0];
      if (Array.isArray(s0)) { nT = s0.length; break outer; }
    }
  }
  // Build a types array preserving original data index for each selected type.
  const allIndices = Array.from({ length: nT }, (_, i) => i);
  const selectedIndices = (origIndices && origIndices.length) ? origIndices.filter(i => i < nT) : allIndices;
  const types = selectedIndices.map(origIdx => ({
    label: tmcPairs[origIdx]?.label || `type ${origIdx + 1}`,
    origIdx,
  }));
  const multi = types.length > 1;

  const colDefs = [];
  let ci = 1; // column index (0 = Time)

  apps.forEach((app, ai) => {
    const aLbl = legLabel(app.leg);
    const appStart = ci;
    app.destinations.forEach(dest => {
      const cls = classifyTurn(app.leg, dest);
      const movLabel = `${aLbl} - ${TURN_CLS_LABEL[cls]}`;
      const movStart = ci;
      if (multi) {
        types.forEach(p => {
          colDefs.push({ c: ci++, kind: 'type', ai, appLabel: aLbl, appStart, movLabel, movStart, typLabel: p.label,
            getVal: ri => tmcData[app.leg]?.[dest]?.[ri]?.[p.origIdx] ?? 0 });
        });
      }
      colDefs.push({ c: ci++, kind: 'mvmt-total', ai, appLabel: aLbl, appStart, movLabel, movStart,
        getVal: ri => types.reduce((s, p) => s + (tmcData[app.leg]?.[dest]?.[ri]?.[p.origIdx] ?? 0), 0) });
    });
    colDefs.push({ c: ci++, kind: 'app-total', ai, appLabel: aLbl, appStart,
      getVal: ri => app.destinations.reduce((s, dest) =>
        s + types.reduce((s2, p) => s2 + (tmcData[app.leg]?.[dest]?.[ri]?.[p.origIdx] ?? 0), 0), 0) });
  });

  colDefs.push({ c: ci++, kind: 'grand-total',
    getVal: ri => apps.reduce((s, app) =>
      s + app.destinations.reduce((s2, dest) =>
        s2 + types.reduce((s3, p) => s3 + (tmcData[app.leg]?.[dest]?.[ri]?.[p.origIdx] ?? 0), 0), 0), 0) });

  const totalCols = ci;
  const nHdr = multi ? 3 : 2;
  const merges = [];

  // Header rows (relative to META offset = 0-based within hRows)
  const hRows = Array.from({ length: nHdr }, () => Array(totalCols).fill(''));
  hRows[0][0] = 'Time';
  merges.push({ s: { r: META, c: 0 }, e: { r: META + nHdr - 1, c: 0 } });

  // Approach labels row (row 0 of hRows = sheet row META)
  apps.forEach((app, ai) => {
    const appCols = colDefs.filter(cd => cd.ai === ai);
    if (!appCols.length) return;
    const firstC = appCols[0].c;
    const lastC = appCols[appCols.length - 1].c;
    hRows[0][firstC] = legLabel(app.leg);
    if (firstC !== lastC) merges.push({ s: { r: META, c: firstC }, e: { r: META, c: lastC } });
  });

  // Grand-total merged down
  const gtDef = colDefs.find(cd => cd.kind === 'grand-total');
  if (gtDef) {
    hRows[0][gtDef.c] = 'Grand Total';
    merges.push({ s: { r: META, c: gtDef.c }, e: { r: META + nHdr - 1, c: gtDef.c } });
  }

  // Movement + type labels
  for (const cd of colDefs) {
    if (cd.kind === 'app-total') {
      hRows[1][cd.c] = 'Total';
      if (multi) merges.push({ s: { r: META + 1, c: cd.c }, e: { r: META + 2, c: cd.c } });
    } else if (cd.kind === 'mvmt-total') {
      if (multi) {
        hRows[1][cd.movStart] = cd.movLabel;
        if (cd.movStart !== cd.c) merges.push({ s: { r: META + 1, c: cd.movStart }, e: { r: META + 1, c: cd.c } });
        hRows[2][cd.c] = 'Total';
      } else {
        hRows[1][cd.c] = cd.movLabel;
      }
    } else if (cd.kind === 'type') {
      hRows[2][cd.c] = cd.typLabel;
    }
  }

  const aoa = [...metaBlock(), ...hRows];
  for (let ri = 0; ri < cfg.slots; ri++) {
    const row = Array(totalCols).fill(0);
    row[0] = fmt12h(cfg.startMinutes + ri * cfg.intervalMin);
    for (const cd of colDefs) row[cd.c] = cd.getVal(ri);
    aoa.push(row);
  }

  const totRow = Array(totalCols).fill(0);
  totRow[0] = 'Total';
  for (const cd of colDefs) {
    let s = 0;
    for (let ri = 0; ri < cfg.slots; ri++) s += cd.getVal(ri);
    totRow[cd.c] = s;
  }
  aoa.push(totRow);

  const cols = Array(totalCols).fill(null).map(() => wch(9));
  cols[0] = wch(10); // Time col
  for (const cd of colDefs) {
    if (cd.kind === 'mvmt-total' && !multi) cols[cd.c] = wch(26);
    if (cd.kind === 'app-total') cols[cd.c] = wch(12);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = cols;
  // Freeze: col 1 (after Time), row after all headers
  ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: META + nHdr }];
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName || 'TMC');
}

// ─── Vehicle sheet ───────────────────────────────────────────────────────────

function buildVehicleSheet(wb) {
  const nT = vPairs.length;
  const typeLabels = vPairs.map(p => p.label);
  const hdr = ['Time', ...typeLabels, 'Total'];
  const cols = [wch(10), ...typeLabels.map(() => wch(16)), wch(10)];

  function makeRows(dir) {
    return Array.from({ length: cfg.slots }, (_, ri) => {
      const counts = vData[dir][ri] || Array(nT).fill(0);
      const total = counts.reduce((a, b) => a + b, 0);
      return [fmt12h(cfg.startMinutes + ri * cfg.intervalMin), ...counts, total];
    });
  }

  function totRow(dir) {
    const t = vPairs.map((_, pi) => vData[dir].reduce((s, r) => s + (r[pi] ?? 0), 0));
    return ['Total', ...t, t.reduce((a, b) => a + b, 0)];
  }

  const aoa = [
    ...metaBlock(),
    ['INBOUND'], hdr, ...makeRows('in'), totRow('in'),
    [],
    ['OUTBOUND'], hdr, ...makeRows('out'), totRow('out'),
  ];

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols;
  ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: META + 2 }];
  window.XLSX.utils.book_append_sheet(wb, ws, 'Vehicle');
}

// ─── Pedestrian sheet ────────────────────────────────────────────────────────
// Layout matches 24-Hour Count Template Pedestrian sheet:
//   Rows 1-3: metadata
//   Row 4:    blank
//   Row 5:    crosswalk names merged across direction columns (3 cols each)
//   Row 6:    direction labels (dir0, dir1, Total) per crosswalk
//   Row 7+:   data

function buildPedSheet(wb) {
  const xwalks = window.pedPairs;
  const nX = xwalks.length;
  // 3 columns per crosswalk: dir0, dir1, Total
  const totalCols = 1 + nX * 3;
  const merges = [];

  // Row 0 of hRows (= sheet row META): crosswalk names merged 3 cols each
  // Row 1 of hRows: direction labels
  const hRows = [Array(totalCols).fill(''), Array(totalCols).fill('')];
  hRows[0][0] = 'Time';
  merges.push({ s: { r: META, c: 0 }, e: { r: META + 1, c: 0 } }); // Time merged down

  xwalks.forEach((xw, xi) => {
    const base = 1 + xi * 3;
    hRows[0][base] = xw.name || `X-walk ${xi + 1}`;
    merges.push({ s: { r: META, c: base }, e: { r: META, c: base + 2 } });
    hRows[1][base]     = xw.dir0 || 'Dir 0';
    hRows[1][base + 1] = xw.dir1 || 'Dir 1';
    hRows[1][base + 2] = 'Total';
    // Total col merged vertically (matches template)
    merges.push({ s: { r: META + 1, c: base + 2 }, e: { r: META + 1, c: base + 2 } });
  });

  const aoa = [...metaBlock(), ...hRows];
  for (let ri = 0; ri < cfg.slots; ri++) {
    const row = [fmt12h(cfg.startMinutes + ri * cfg.intervalMin)];
    xwalks.forEach((_, xi) => {
      const d0 = pedData[xi]?.[ri]?.[0] ?? 0;
      const d1 = pedData[xi]?.[ri]?.[1] ?? 0;
      row.push(d0, d1, d0 + d1);
    });
    aoa.push(row);
  }

  // Totals row
  const tots = ['Total'];
  xwalks.forEach((_, xi) => {
    const d0 = pedData[xi].reduce((s, r) => s + (r[0] ?? 0), 0);
    const d1 = pedData[xi].reduce((s, r) => s + (r[1] ?? 0), 0);
    tots.push(d0, d1, d0 + d1);
  });
  aoa.push(tots);

  const cols = [wch(10), ...Array(nX * 3).fill(null).map(() => wch(10))];
  // Wider col for first crosswalk name header
  cols[1] = wch(12);

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = cols;
  ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: META + 2 }];
  window.XLSX.utils.book_append_sheet(wb, ws, 'Pedestrian');
}

// ─── Analyze xlsx export (called from analyze tab) ────────────────────────────

export function exportAnalyzeXLSX() {
  exportXLSX();
}

// ─── Trip generation export ──────────────────────────────────────────────────
// Layout matches TripGenData.xlsx WKDY sheet structure:
//   Row 1-4: metadata block
//   Row 5:   blank
//   Row 6:   "Direction" header | Entry section header | Exit section header
//   Row 7:   "Classification" | type labels (Entry) | type labels (Exit)
//   Row 8:   "Start Time" (with start–end in cols B-C) | data cells
//   Row 9+:  data rows
//   Last:    totals row

export function exportTripgenXLSX(entries, siteInfo, projectInfo) {
  const XLSX = window.XLSX;
  if (!XLSX) { alert('XLSX library not loaded'); return; }
  if (!entries?.length) { alert('No trip generation data to export.'); return; }

  const wb = XLSX.utils.book_new();

  // ── Summary sheet ──
  const now = new Date();
  const exportedStr = `${now.toLocaleDateString('en-US',{year:'numeric',month:'2-digit',day:'2-digit'})} ${now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}`;
  const summaryAoa = [];
  summaryAoa.push([`Traffic App v${__APP_VERSION__} — Trip Generation Export`]);
  summaryAoa.push(['Exported:', exportedStr]);
  summaryAoa.push(['Project:', projectInfo?.projectName || '']);
  summaryAoa.push(['Site:', siteInfo?.location || '']);
  if (siteInfo?.gsf) summaryAoa.push(['GSF:', siteInfo.gsf]);
  summaryAoa.push([]);
  summaryAoa.push(['Location', 'Date', 'Day Type', 'Classification', 'Total In', 'Total Out', 'Total']);

  for (const entry of entries) {
    for (const day of entry.days) {
      const types = day.parsed?.types || [];
      for (const type of types) {
        const ti = types.indexOf(type);
        const inTotal  = (day.parsed.intervals || []).reduce((s, iv) => s + (iv.inbound?.[ti] ?? 0), 0);
        const outTotal = (day.parsed.intervals || []).reduce((s, iv) => s + (iv.outbound?.[ti] ?? 0), 0);
        summaryAoa.push([entry.locationLabel, day.sheetName, day.dayType || '', type, inTotal, outTotal, inTotal + outTotal]);
      }
    }
  }

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
  summaryWs['!cols'] = [wch(28), wch(20), wch(12), wch(24), wch(10), wch(10), wch(10)];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // ── Per location+day sheets ──
  // Structure matches TripGenData WKDY sheet:
  //   Col A: Start Time, Col B: dash, Col C: End Time
  //   Col D+: Entry counts per classification
  //   [gap col] then Exit counts per classification
  const usedNames = {};
  for (const entry of entries) {
    for (const day of entry.days) {
      const types = day.parsed?.types || [];
      const intervals = day.parsed?.intervals || [];
      const nT = types.length;

      // Columns: A=Start, B=-, C=End | [nT entry cols] | [nT exit cols] | Total In | Total Out | Total
      // Header row 0: site/day metadata
      // Header row 1: "Direction" | "Entry" merged nT | "Exit" merged nT | totals
      // Header row 2: "Classification" | type labels × 2 | labels
      // Header row 3: "Start Time" | blanks
      const merges = [];
      const ENTRY_START = 3;        // col index where entry data starts
      const EXIT_START = 3 + nT;   // col index where exit data starts
      const TOTAL_IN_COL = 3 + nT * 2;
      const TOTAL_OUT_COL = 3 + nT * 2 + 1;
      const GRAND_COL    = 3 + nT * 2 + 2;
      const totalCols    = 3 + nT * 2 + 3;

      // Metadata rows
      const aoa = [
        ['Study Name', '', entry.locationLabel || ''],
        ['Start Date', '', day.sheetName || ''],
        ['Day Type', '', day.dayType || ''],
        [siteInfo?.location ? 'Site Name' : '', '', siteInfo?.location || ''],
        ['Exported:', '', `${exportedStr}  ·  Traffic App v${__APP_VERSION__}`],
        [],
      ];
      const HDR = aoa.length; // row index where headers start

      const row1 = Array(totalCols).fill('');
      row1[0] = 'Direction';
      if (nT > 0) {
        row1[ENTRY_START] = 'Entry';
        if (nT > 1) merges.push({ s: { r: HDR, c: ENTRY_START }, e: { r: HDR, c: EXIT_START - 1 } });
        row1[EXIT_START] = 'Exit';
        if (nT > 1) merges.push({ s: { r: HDR, c: EXIT_START }, e: { r: HDR, c: TOTAL_IN_COL - 1 } });
      }
      row1[TOTAL_IN_COL]  = 'Total In';
      row1[TOTAL_OUT_COL] = 'Total Out';
      row1[GRAND_COL]     = 'Total';
      // "Direction" merged down 2 rows
      merges.push({ s: { r: HDR, c: 0 }, e: { r: HDR + 1, c: 0 } });

      const row2 = Array(totalCols).fill('');
      row2[0] = 'Classification';
      types.forEach((t, ti) => {
        row2[ENTRY_START + ti] = t;
        row2[EXIT_START + ti]  = t;
      });
      row2[TOTAL_IN_COL]  = '';
      row2[TOTAL_OUT_COL] = '';
      row2[GRAND_COL]     = '';

      const row3 = Array(totalCols).fill('');
      row3[0] = 'Start Time';
      row3[1] = '-';
      row3[2] = 'End Time';

      aoa.push(row1, row2, row3);

      let sumIn = 0, sumOut = 0;
      const typeSumIn = types.map(() => 0), typeSumOut = types.map(() => 0);

      for (const iv of intervals) {
        const [startStr, , endStr] = (iv.label || '').split(/\s*[–-]\s*/);
        const cells = [startStr || iv.label || '', '-', endStr || ''];
        let rowIn = 0, rowOut = 0;
        types.forEach((_, ti) => {
          const inn = iv.inbound?.[ti] ?? 0;
          const out = iv.outbound?.[ti] ?? 0;
          cells[ENTRY_START + ti] = inn;
          cells[EXIT_START + ti]  = out;
          rowIn += inn; rowOut += out;
          typeSumIn[ti] += inn; typeSumOut[ti] += out;
        });
        cells[TOTAL_IN_COL]  = rowIn;
        cells[TOTAL_OUT_COL] = rowOut;
        cells[GRAND_COL]     = rowIn + rowOut;
        sumIn += rowIn; sumOut += rowOut;
        // Pad to totalCols
        while (cells.length < totalCols) cells.push('');
        aoa.push(cells);
      }

      // Totals row
      const totRow = Array(totalCols).fill('');
      totRow[0] = 'Total';
      types.forEach((_, ti) => {
        totRow[ENTRY_START + ti] = typeSumIn[ti];
        totRow[EXIT_START + ti]  = typeSumOut[ti];
      });
      totRow[TOTAL_IN_COL]  = sumIn;
      totRow[TOTAL_OUT_COL] = sumOut;
      totRow[GRAND_COL]     = sumIn + sumOut;
      aoa.push(totRow);

      const cols = [wch(10), wch(3), wch(10), ...types.flatMap(() => [wch(12), wch(12)]), wch(10), wch(10), wch(10)];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = merges;
      ws['!cols'] = cols;
      ws['!views'] = [{ state: 'frozen', xSplit: 3, ySplit: HDR + 3 }];

      let sheetName = `${entry.locationLabel} ${day.sheetName}`.slice(0, 28).replace(/[:\\/?*[\]]/g, '');
      if (usedNames[sheetName]) sheetName = sheetName.slice(0, 26) + ` ${++usedNames[sheetName]}`;
      else usedNames[sheetName] = 1;

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  const base = (projectInfo?.projectName || siteInfo?.location || 'tripgen').replace(/[^\w\s-]/g, '').trim() || 'tripgen';
  XLSX.writeFile(wb, base + '.xlsx');
}
