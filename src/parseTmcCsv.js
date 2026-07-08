// ═══════════════════════════════════════════
// TMC CSV IMPORTER
// Parses three export formats:
//   Legacy:   "{FROM}→{TO}({dir}) {type}"          e.g. "W→E(left) POV"
//   New:      "{from} → {dir} ({dest}) {type}"     e.g. "W → left (Tenbroeck) POV"
//   Recovery: "{from}->{dest} ({dir}) {type}"      e.g. "W->Tenbroeck (left) POV"
//   Bare:     "{from}->{dest} {type}"               e.g. "W->Thru POV"
// Returns everything needed to reconstruct a full session.
// ═══════════════════════════════════════════

const LEG_BEARING = {N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
const COMPASS_KEYS = new Set(Object.keys(LEG_BEARING));
const DIRS = new Set(['left','right','thru','u-turn','through']);
const DIR_WORDS = { thru:'T', through:'T', left:'L', right:'R', 'u-turn':'U' };

function parseMinutes(timeStr) {
  const [h, m] = timeStr.trim().split(':').map(Number);
  return h * 60 + (m || 0);
}

function parseTimeRange(cell) {
  const m = cell.match(/(\d+:\d+)\s*[–-]\s*(\d+:\d+)/);
  if (m) return { start: parseMinutes(m[1]), end: parseMinutes(m[2]) };
  return { start: parseMinutes(cell.split(/[–-]/)[0]), end: 0 };
}

// For a given approach leg, return compass keys grouped by the turn they produce.
function turnsFromApproach(approachLeg) {
  const bA = LEG_BEARING[approachLeg];
  if (bA === undefined) return { L: [], T: [], R: [], U: [] };
  const heading = (bA + 180) % 360;
  const groups = { L: [], T: [], R: [], U: [] };
  for (const leg of Object.keys(LEG_BEARING)) {
    if (leg === approachLeg) continue;
    const rel = (LEG_BEARING[leg] - heading + 360) % 360;
    if (rel === 0) groups.T.push(leg);
    else if (rel === 180) groups.U.push(leg);
    else if (rel < 180) groups.R.push(leg);
    else groups.L.push(leg);
  }
  return groups;
}

// Assign synthetic compass keys to named destinations based on their turn direction.
// Returns { syntheticKey: originalName } for building legLabels, and remap { origName: synKey }.
function assignSyntheticKeys(approachLeg, destinations, destDirMap) {
  const avail = turnsFromApproach(approachLeg);
  // Counters for picking from available slots
  const used = { L: 0, T: 0, R: 0, U: 0 };
  const remap = {}; // origName → synthetic compass key
  const legLabels = {}; // synthetic key → original display name

  for (const dest of destinations) {
    if (COMPASS_KEYS.has(dest)) {
      // Already a compass key — no remapping needed
      remap[dest] = dest;
      continue;
    }
    // Determine turn class from stored direction or from dest name itself
    let dirWord = (destDirMap[dest] || '').toLowerCase();
    if (!dirWord && DIRS.has(dest.toLowerCase())) dirWord = dest.toLowerCase();
    const cls = DIR_WORDS[dirWord] || 'L'; // default to L if unknown
    const pool = avail[cls];
    const idx = used[cls]++;
    const synKey = pool[idx] || pool[pool.length - 1] || dest; // fallback: reuse last or keep name
    remap[dest] = synKey;
    legLabels[synKey] = dest;
  }
  return { remap, legLabels };
}

export function parseTmcCsv(text) {
  const lines = text.trim().replace(/\r/g, '').split('\n');
  if (lines.length < 2) throw new Error('CSV appears to be empty.');

  // Read structured metadata rows (key,value pairs before the time header)
  const csvMeta = {};
  let hdrLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.toLowerCase().startsWith('time,') || trimmed.toLowerCase() === 'time') {
      hdrLineIdx = i;
      break;
    }
    const [key, ...rest] = trimmed.split(',');
    if (key && rest.length) csvMeta[key.trim()] = rest.join(',').trim();
  }
  const headers = lines[hdrLineIdx].split(',');

  // ── Parse column map ──
  const COL_WITH = /^(.+?)\s*(?:→|->)\s*(.+?)\s*\(([^)]+)\)\s+(.+)$/;
  const COL_BARE = /^(.+?)\s*(?:→|->)\s*(.+?)\s+(.+)$/;
  const colMap = []; // [{from, to, dir, type, colIdx}]  dir may be ''
  const typeOrder = [];

  headers.forEach((h, i) => {
    if (i === 0) return;
    const trimmed = h.trim();
    if (trimmed.toLowerCase().endsWith('total') || trimmed.toLowerCase() === 'grand total') return;
    const mw = trimmed.match(COL_WITH);
    if (mw) {
      const [, from, mid, paren, type] = mw;
      const midLc = mid.trim().toLowerCase();
      const isDirFirst = DIRS.has(midLc);
      const to   = isDirFirst ? paren.trim() : mid.trim();
      const dir  = isDirFirst ? midLc        : paren.trim().toLowerCase();
      if (!typeOrder.includes(type)) typeOrder.push(type);
      colMap.push({ from: from.trim(), to, dir, type, colIdx: i });
      return;
    }
    const mb = trimmed.match(COL_BARE);
    if (mb) {
      const [, from, dest, type] = mb;
      if (!typeOrder.includes(type)) typeOrder.push(type);
      colMap.push({ from: from.trim(), to: dest.trim(), dir: '', type, colIdx: i });
    }
  });

  if (colMap.length === 0) throw new Error('No movement columns found — check the CSV format.');

  // ── Derive leg/destination structure ──
  const legOrder = [];
  colMap.forEach(({ from }) => { if (!legOrder.includes(from)) legOrder.push(from); });

  const approachDests = {};
  // per-approach direction map: { from: { dest: dir } } — avoids cross-approach contamination
  const approachDestDir = {};
  colMap.forEach(({ from, to, dir }) => {
    if (!approachDests[from]) approachDests[from] = [];
    if (!approachDests[from].includes(to)) approachDests[from].push(to);
    if (!approachDestDir[from]) approachDestDir[from] = {};
    if (dir && !approachDestDir[from][to]) approachDestDir[from][to] = dir;
  });

  // ── Remap named destinations to synthetic compass keys if needed ──
  const allLegLabels = {};
  const remapByApproach = {}; // { approachLeg: { origDest: synKey } }
  const finalApproachDests = {};

  for (const from of legOrder) {
    const dests = approachDests[from];
    const needsRemap = dests.some(d => !COMPASS_KEYS.has(d));
    if (needsRemap && COMPASS_KEYS.has(from)) {
      // Pass per-approach direction map to avoid cross-approach contamination
      const { remap, legLabels } = assignSyntheticKeys(from, dests, approachDestDir[from] || {});
      remapByApproach[from] = remap;
      Object.assign(allLegLabels, legLabels);
      finalApproachDests[from] = dests.map(d => remap[d]);
    } else {
      finalApproachDests[from] = dests;
    }
  }

  // ── Parse data rows ──
  const dataLines = lines.slice(hdrLineIdx + 1).filter(l => {
    const firstCell = l.split(',')[0].trim().toLowerCase();
    return l.trim() && firstCell !== 'total' && /\d/.test(firstCell);
  });
  const slots = dataLines.length;
  if (slots === 0) throw new Error('No data rows found in CSV.');

  const firstRange = parseTimeRange(dataLines[0].split(',')[0]);
  const secondRange = dataLines[1] ? parseTimeRange(dataLines[1].split(',')[0]) : null;
  const intervalMin = secondRange ? secondRange.start - firstRange.start : 15;
  const startMinutes = firstRange.start;
  const durationMin = slots * intervalMin;

  // Build tmcData using remapped (synthetic compass) keys
  const tmcData = {};
  for (const from of legOrder) {
    tmcData[from] = {};
    for (const to of finalApproachDests[from]) {
      tmcData[from][to] = Array.from({ length: slots }, () => Array(typeOrder.length).fill(0));
    }
  }

  dataLines.forEach((line, ri) => {
    const vals = line.split(',');
    colMap.forEach(({ from, to, type, colIdx }) => {
      const synTo = remapByApproach[from]?.[to] ?? to;
      const ti = typeOrder.indexOf(type);
      const v = parseInt(vals[colIdx]) || 0;
      if (v) tmcData[from][synTo][ri][ti] = v;
    });
  });

  // ── Reconstruct approaches ──
  const approaches = legOrder.map(leg => ({
    leg,
    destinations: finalApproachDests[leg],
  }));

  // ── Derive or read intersection template ──
  const allLegs = new Set([...legOrder, ...Object.values(finalApproachDests).flat()]);
  let template = 't4', diagLeg = 'SE', missingLeg = 'S';
  if (csvMeta['IntersectionTemplate']) {
    template = csvMeta['IntersectionTemplate'];
    diagLeg  = csvMeta['DiagLeg'] || diagLeg;
  } else if (allLegs.size === 5) {
    template = 't5';
    const cardinal = new Set(['N','E','S','W']);
    const diagonal = [...allLegs].find(l => !cardinal.has(l));
    if (diagonal) diagLeg = diagonal;
  } else if (allLegs.size === 3) {
    template = 't3';
    const cardinal = ['N','E','S','W'];
    missingLeg = cardinal.find(l => !allLegs.has(l)) || 'S';
  }

  // ── Leg labels: merge synthetic labels with explicit metadata labels ──
  const metaLegLabels = {};
  for (const [k, v] of Object.entries(csvMeta)) {
    if (k.startsWith('LegLabel.')) metaLegLabels[k.slice(9)] = v;
  }
  const legLabels = { ...allLegLabels, ...metaLegLabels };

  // ── One-way flags from metadata ──
  const oneWayIn = {};
  if (csvMeta['OneWayIn']) {
    csvMeta['OneWayIn'].split(/[\s,]+/).filter(Boolean).forEach(leg => { oneWayIn[leg] = true; });
  }

  // ── Counted approaches (which approaches have the count flag) ──
  const countedSet = csvMeta['CountedApproaches']
    ? new Set(csvMeta['CountedApproaches'].split(/[\s,]+/).filter(Boolean))
    : null;

  // Apply count:false to approaches not in countedSet
  if (countedSet) {
    approaches.forEach(a => { a.count = countedSet.has(a.leg); });
  }

  return {
    tmcData,
    tmcPairs: typeOrder.map((label, i) => ({
      label,
      def: '',
      key: 'asdfjkl;'.split('')[i] || '?',
    })),
    approaches,
    cfg: { startMinutes, intervalMin, durationMin },
    intersection: {
      template, diagLeg, missingLeg,
      legLabels,
      oneWayIn,
      street1: csvMeta['Street1'] || '',
      street2: csvMeta['Street2'] || '',
      street3: csvMeta['Street3'] || '',
    },
    slots,
    legs: [...allLegs],
    firstApproach: legOrder[0] || null,
  };
}
