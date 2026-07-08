// CSV parsers for the three traffic-counter export formats.
// See ../../DATA_CONTRACT.md for the exact file shapes.
//
// All parsers are defensive about:
//  - a leading UTF-8 BOM (U+FEFF) on the file
//  - the en-dash time separator "HH:MM – HH:MM" (U+2013, spaces around it)
//  - trailing blank lines / CRLF line endings

/** Strip a leading BOM character if present. */
function stripBOM(text) {
  if (text.length && text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/** Split text into non-empty trimmed-of-CR lines, preserving blank lines for section splitting. */
function toLines(text) {
  return stripBOM(text).replace(/\r\n/g, '\n').split('\n');
}

/** Parse a single CSV row (no quoted-field support needed — all values are plain numbers/labels). */
function splitRow(line) {
  return line.split(',');
}

const TIME_SEP = /\s*[–‒\-]\s*/; // en dash (U+2013), figure dash, or plain hyphen as fallback

/**
 * Parse a "HH:MM – HH:MM" time-range label into { label, start, end }.
 * Falls back gracefully (start/end = null) if the format doesn't match.
 */
function parseTimeLabel(raw) {
  const label = raw.trim();
  const parts = label.split(TIME_SEP);
  if (parts.length === 2 && /^\d{1,2}:\d{2}$/.test(parts[0].trim()) && /^\d{1,2}:\d{2}$/.test(parts[1].trim())) {
    return { label, start: parts[0].trim(), end: parts[1].trim() };
  }
  return { label, start: null, end: null };
}

function isBlank(line) {
  return line == null || line.trim() === '';
}

/**
 * parseVehicleCSV(text) -> {
 *   types: string[],                                  // vehicle type labels, in column order
 *   intervals: [{ label, start, end, inbound: number[], outbound: number[] }]
 * }
 * Reads the INBOUND and OUTBOUND stacked sections; ignores the trailing "total" rows
 * (totals are derived on demand by analyze.js, not trusted from the file).
 */
export function parseVehicleCSV(text) {
  const lines = toLines(text).filter((l) => l.trim() !== '' || true); // keep blanks for section detection
  let i = 0;
  const sections = {}; // { INBOUND: {types, rows: Map<label, number[]>}, OUTBOUND: {...} }
  let current = null;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const upper = line.trim().toUpperCase();
    if (upper === 'INBOUND' || upper === 'OUTBOUND') {
      current = { name: upper, types: [], rows: [] };
      sections[upper] = current;
      i++;
      continue;
    }
    if (!current) {
      // Unexpected content before a section header — skip defensively.
      i++;
      continue;
    }
    const cols = splitRow(line);
    const firstCell = (cols[0] || '').trim().toLowerCase();
    if (firstCell === 'time') {
      // header row: time, <type1>, <type2>, ..., total
      current.types = cols.slice(1, cols.length - 1).map((c) => c.trim());
      i++;
      continue;
    }
    if (firstCell === 'total') {
      // grand-total row for this section — not stored, totals are recomputed.
      i++;
      continue;
    }
    // data row
    const { label, start, end } = parseTimeLabel(cols[0]);
    const values = cols.slice(1, cols.length - 1).map((v) => Number(v) || 0);
    current.rows.push({ label, start, end, values });
    i++;
  }

  const inbound = sections.INBOUND || { types: [], rows: [] };
  const outbound = sections.OUTBOUND || { types: [], rows: [] };
  const types = inbound.types.length ? inbound.types : outbound.types;

  const count = Math.max(inbound.rows.length, outbound.rows.length);
  const intervals = [];
  for (let r = 0; r < count; r++) {
    const inRow = inbound.rows[r];
    const outRow = outbound.rows[r];
    const base = inRow || outRow;
    intervals.push({
      label: base ? base.label : '',
      start: base ? base.start : null,
      end: base ? base.end : null,
      inbound: inRow ? inRow.values : new Array(types.length).fill(0),
      outbound: outRow ? outRow.values : new Array(types.length).fill(0),
    });
  }

  return { types, intervals };
}

/**
 * parsePedCSV(text) -> {
 *   crosswalks: [{ name, dir0, dir1 }],
 *   intervals: [{ label, start, end, counts: [[dir0,dir1], ...] }]  // one [dir0,dir1] pair per crosswalk
 * }
 * Header columns come in pairs per crosswalk: "{name} {dir0}", "{name} {dir1}".
 * The crosswalk name/direction split is done on the LAST space in each header cell,
 * per DATA_CONTRACT.md guidance (direction labels are free text but are single tokens
 * in practice; if a direction label itself contains spaces this split may mis-attribute
 * the name/direction boundary — the canonical column header text is still recoverable
 * by re-joining name+dir if needed).
 */
export function parsePedCSV(text) {
  const lines = toLines(text).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { crosswalks: [], intervals: [] };

  const headerCols = splitRow(lines[0]);
  const dataHeaderCols = headerCols.slice(1, headerCols.length - 1); // drop "time" and "total"

  // Pair up columns two at a time -> one crosswalk per pair.
  const crosswalks = [];
  for (let c = 0; c < dataHeaderCols.length; c += 2) {
    const h0 = (dataHeaderCols[c] || '').trim();
    const h1 = (dataHeaderCols[c + 1] || '').trim();
    const lastSpace0 = h0.lastIndexOf(' ');
    const lastSpace1 = h1.lastIndexOf(' ');
    const name0 = lastSpace0 >= 0 ? h0.slice(0, lastSpace0) : h0;
    const dir0 = lastSpace0 >= 0 ? h0.slice(lastSpace0 + 1) : '';
    const name1 = lastSpace1 >= 0 ? h1.slice(0, lastSpace1) : h1;
    const dir1 = lastSpace1 >= 0 ? h1.slice(lastSpace1 + 1) : '';
    crosswalks.push({ name: name0 || name1 || `crosswalk${crosswalks.length + 1}`, dir0, dir1 });
  }

  const intervals = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const firstCell = (cols[0] || '').trim().toLowerCase();
    if (firstCell === 'total') continue; // grand-total row, recomputed on demand
    const { label, start, end } = parseTimeLabel(cols[0]);
    const dataCols = cols.slice(1, cols.length - 1).map((v) => Number(v) || 0);
    const counts = [];
    for (let c = 0; c < dataCols.length; c += 2) {
      counts.push([dataCols[c] || 0, dataCols[c + 1] || 0]);
    }
    intervals.push({ label, start, end, counts });
  }

  return { crosswalks, intervals };
}

// Turn-class labels are kept as the full words used directly in the CSV header text
// ("left"/"thru"/"right"/"U-turn", per export.js's TURN_CLS_LABEL) rather than single-letter
// codes — this matches what src/ui/mockData.js and src/ui/tmcDiagram.js's turnColor() already
// expect/compare against, so no translation layer is needed between parser output and UI.
const VALID_TURN_LABELS = new Set(['left', 'thru', 'right', 'U-turn']);

// Matches a TMC data-column header, e.g. "N→E(thru) passenger / light" or "N→E(thru) total"
const MOVE_COL_RE = /^(.+?)→(.+?)\(([^)]+)\)\s+(.+)$/; // → = → (U+2192 RIGHTWARDS ARROW)
const APPROACH_TOTAL_RE = /^(.+?)\s+approach total$/;

/**
 * parseTmcCSV(text) -> {
 *   approaches: [{ leg, destinations: [{ leg, turnClass }] }],   // turnClass in {'left','thru','right','U-turn'}
 *   types: string[],                                            // vehicle type labels
 *   intervals: [{ label, start, end, counts: { [approachLeg]: { [destLeg]: number[] } } }]
 * }
 * Parsed purely from header text (per-column), not fixed column position, since the set of
 * approaches/destinations/types varies per study. Approach-total and grand-total columns are
 * read for header bookkeeping only; numeric per-movement-per-type values are recomputed by
 * analyze.js rather than trusted from any "total" column/row.
 */
export function parseTmcCSV(text) {
  const lines = toLines(text).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { approaches: [], types: [], intervals: [] };

  const headerCols = splitRow(lines[0]).map((c) => c.trim());
  // headerCols[0] === 'time', last === 'grand total'
  const dataHeaderCols = headerCols.slice(1, headerCols.length - 1);

  // Column plan: for each column index (within dataHeaderCols), record what it is.
  // kind: 'count' (per-type value for a movement), 'subtotal' (movement total), 'approachTotal'
  const plan = [];
  const approachOrder = [];
  const approachMap = new Map(); // leg -> { leg, destinations: [{leg, turnClass}] }
  const destSeen = new Map(); // `${approachLeg}>${destLeg}` -> true
  const typesSeen = [];
  const typesSeenSet = new Set();

  dataHeaderCols.forEach((col, idx) => {
    const moveMatch = col.match(MOVE_COL_RE);
    if (moveMatch) {
      const [, approachLeg, destLeg, turnLabel, rest] = moveMatch;
      const trimmedLabel = turnLabel.trim();
      const turnClass = VALID_TURN_LABELS.has(trimmedLabel) ? trimmedLabel : '?';
      const key = `${approachLeg}>${destLeg}`;
      if (!approachMap.has(approachLeg)) {
        approachMap.set(approachLeg, { leg: approachLeg, destinations: [] });
        approachOrder.push(approachLeg);
      }
      if (!destSeen.has(key)) {
        destSeen.set(key, true);
        approachMap.get(approachLeg).destinations.push({ leg: destLeg, turnClass });
      }
      if (rest.trim() === 'total') {
        plan.push({ idx, kind: 'subtotal', approachLeg, destLeg });
      } else {
        if (!typesSeenSet.has(rest.trim())) {
          typesSeenSet.add(rest.trim());
          typesSeen.push(rest.trim());
        }
        plan.push({ idx, kind: 'count', approachLeg, destLeg, type: rest.trim() });
      }
      return;
    }
    const approachTotalMatch = col.match(APPROACH_TOTAL_RE);
    if (approachTotalMatch) {
      plan.push({ idx, kind: 'approachTotal', approachLeg: approachTotalMatch[1].trim() });
      return;
    }
    // Unrecognized column — keep as opaque/ignored.
    plan.push({ idx, kind: 'ignore' });
  });

  const approaches = approachOrder.map((leg) => approachMap.get(leg));
  const types = typesSeen;
  const typeIndex = new Map(types.map((t, i) => [t, i]));

  const intervals = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const firstCell = (cols[0] || '').trim().toLowerCase();
    if (firstCell === 'total') continue; // grand-total row, recomputed on demand
    const { label, start, end } = parseTimeLabel(cols[0]);
    const dataCols = cols.slice(1, cols.length - 1);

    const counts = {};
    approaches.forEach((app) => {
      counts[app.leg] = {};
      app.destinations.forEach((d) => {
        counts[app.leg][d.leg] = new Array(types.length).fill(0);
      });
    });

    plan.forEach((p) => {
      if (p.kind !== 'count') return;
      const v = Number(dataCols[p.idx]) || 0;
      const ti = typeIndex.get(p.type);
      if (ti == null) return;
      if (!counts[p.approachLeg] || !counts[p.approachLeg][p.destLeg]) return;
      counts[p.approachLeg][p.destLeg][ti] = v;
    });

    intervals.push({ label, start, end, counts });
  }

  return { approaches, types, intervals };
}
