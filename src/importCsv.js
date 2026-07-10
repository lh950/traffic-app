// AI-assisted CSV import — calls Claude API to map columns to the app's snapshot format

export const LS_API_KEY = 'traffic-app-claude-api-key';
export const LS_LEARNED_MAPS = 'traffic-app-learned-column-maps';

/** Save column→code pairs learned from a successful Claude mapping to localStorage. */
export function saveLearnedMappings(mapping) {
  if (!mapping?.movements) return;
  try {
    const existing = JSON.parse(localStorage.getItem(LS_LEARNED_MAPS) || '{}');
    for (const [code, colName] of Object.entries(mapping.movements)) {
      if (colName) existing[colName.toLowerCase().trim()] = code;
    }
    localStorage.setItem(LS_LEARNED_MAPS, JSON.stringify(existing));
  } catch (_) {}
}

function loadLearnedMappings() {
  try { return JSON.parse(localStorage.getItem(LS_LEARNED_MAPS) || '{}'); } catch (_) { return {}; }
}

// Maps standard movement codes to [fromLeg, toLeg] in the app's tmcData schema.
// NBL=N→E, NBT=N→S, NBR=N→W | SBL=S→W, SBT=S→N, SBR=S→E
// EBL=E→S, EBT=E→W, EBR=E→N | WBL=W→N, WBT=W→E, WBR=W→S
export const MOVE_TO_LEGS = {
  NBL: ['N','E'], NBT: ['N','S'], NBR: ['N','W'],
  SBL: ['S','W'], SBT: ['S','N'], SBR: ['S','E'],
  EBL: ['E','S'], EBT: ['E','W'], EBR: ['E','N'],
  WBL: ['W','N'], WBT: ['W','E'], WBR: ['W','S'],
};

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const parseLine = (line) => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseLine);
  return { headers, rows };
}

// Regex patterns per movement code. Each header is stripped of parens/punctuation before matching.
const MOVE_PATTERNS = {
  NBL: [/^nbl?$/i, /^nb[\s\-_]?le?f?t?$/i, /^north[\s\-_]?le?f?t?$/i, /^n[\s\-_]l(eft)?$/i],
  NBT: [/^nbt$/i, /^nb[\s\-_]?th?(r(u|ough)?)?$/i, /^north[\s\-_]?th?(r(u|ough)?)?$/i, /^n[\s\-_]th?r?$/i],
  NBR: [/^nbr$/i, /^nb[\s\-_]?ri?g?h?t?$/i, /^north[\s\-_]?ri?g?h?t?$/i, /^n[\s\-_]r(ight)?$/i],
  SBL: [/^sbl?$/i, /^sb[\s\-_]?le?f?t?$/i, /^south[\s\-_]?le?f?t?$/i, /^s[\s\-_]l(eft)?$/i],
  SBT: [/^sbt$/i, /^sb[\s\-_]?th?(r(u|ough)?)?$/i, /^south[\s\-_]?th?(r(u|ough)?)?$/i, /^s[\s\-_]th?r?$/i],
  SBR: [/^sbr$/i, /^sb[\s\-_]?ri?g?h?t?$/i, /^south[\s\-_]?ri?g?h?t?$/i, /^s[\s\-_]r(ight)?$/i],
  EBL: [/^ebl?$/i, /^eb[\s\-_]?le?f?t?$/i, /^east[\s\-_]?le?f?t?$/i, /^e[\s\-_]l(eft)?$/i],
  EBT: [/^ebt$/i, /^eb[\s\-_]?th?(r(u|ough)?)?$/i, /^east[\s\-_]?th?(r(u|ough)?)?$/i, /^e[\s\-_]th?r?$/i],
  EBR: [/^ebr$/i, /^eb[\s\-_]?ri?g?h?t?$/i, /^east[\s\-_]?ri?g?h?t?$/i, /^e[\s\-_]r(ight)?$/i],
  WBL: [/^wbl?$/i, /^wb[\s\-_]?le?f?t?$/i, /^west[\s\-_]?le?f?t?$/i, /^w[\s\-_]l(eft)?$/i],
  WBT: [/^wbt$/i, /^wb[\s\-_]?th?(r(u|ough)?)?$/i, /^west[\s\-_]?th?(r(u|ough)?)?$/i, /^w[\s\-_]th?r?$/i],
  WBR: [/^wbr$/i, /^wb[\s\-_]?ri?g?h?t?$/i, /^west[\s\-_]?ri?g?h?t?$/i, /^w[\s\-_]r(ight)?$/i],
};
const TIME_PATTERNS = [/^time/i, /^(start[\s_]?)?time$/i, /^period/i, /^interval/i, /^start$/i, /^clock/i, /^t$/i];

function normalizeHeader(h) {
  return h.replace(/\s*\(.*?\)\s*/g, '').trim(); // strip parenthetical suffixes like "(veh)"
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  // Handle "07:00", "7:00 AM", "0700", "07:00:00"
  const m = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]), min = parseInt(m[2]);
  const ampm = m[4]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

function inferPeriodName(startMin) {
  if (startMin == null) return 'AM Peak';
  if (startMin < 600) return 'AM Peak';       // before 10:00
  if (startMin < 840) return 'Midday';        // 10:00–14:00
  return 'PM Peak';
}

/**
 * Attempt column detection without AI.
 * Returns the same mapping shape as mapColumnsWithClaude, plus a `confidence` field
 * indicating how many of the 12 movement codes were matched.
 * Returns null if no time column could be found.
 */
export function detectColumnsLocally(headers, rows) {
  const normalized = headers.map(normalizeHeader);

  // Detect time column
  const timeIdx = normalized.findIndex(h => TIME_PATTERNS.some(p => p.test(h)));
  if (timeIdx < 0) return null;
  const time_column = headers[timeIdx];

  // Parse start time and interval from first two data rows
  const t0 = parseTimeToMinutes(rows[0]?.[timeIdx]);
  const t1 = parseTimeToMinutes(rows[1]?.[timeIdx]);
  const interval_minutes = (t0 != null && t1 != null && t1 > t0) ? (t1 - t0) : 15;
  const start_time = t0 != null
    ? `${String(Math.floor(t0 / 60)).padStart(2, '0')}:${String(t0 % 60).padStart(2, '0')}`
    : '07:00';
  const period_name = inferPeriodName(t0);

  // Match each movement code: learned exact matches first, then regex patterns
  const learned = loadLearnedMappings();
  const movements = {};
  for (const [code, patterns] of Object.entries(MOVE_PATTERNS)) {
    // 1. Check learned mappings (exact, case-insensitive)
    const learnedIdx = headers.findIndex(h => learned[h.toLowerCase().trim()] === code);
    if (learnedIdx >= 0) { movements[code] = headers[learnedIdx]; continue; }
    // 2. Fall back to regex patterns on normalised header
    const regexIdx = normalized.findIndex(h => patterns.some(p => p.test(h)));
    movements[code] = regexIdx >= 0 ? headers[regexIdx] : null;
  }

  const matched = Object.values(movements).filter(Boolean).length;

  return { format: 'tmc', time_column, interval_minutes, start_time, period_name, movements, _localMatched: matched };
}

export async function mapColumnsWithClaude(headers, sampleRows, apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const sampleText = [headers.join(','), ...sampleRows.slice(0, 15).map(r => r.join(','))].join('\n');

  const prompt = `You are analyzing a traffic count CSV file. Identify the column mapping.

CSV (first rows):
${sampleText}

Return ONLY a JSON object with this structure (no markdown fences, no explanation):
{
  "format": "tmc",
  "time_column": "<header name of the time/interval column>",
  "interval_minutes": 15,
  "start_time": "<HH:MM in 24-hour format of the first data row's time>",
  "period_name": "<AM Peak|PM Peak|Midday|Full Day — infer from start time>",
  "movements": {
    "NBL": "<column header or null>",
    "NBT": "<column header or null>",
    "NBR": "<column header or null>",
    "SBL": "<column header or null>",
    "SBT": "<column header or null>",
    "SBR": "<column header or null>",
    "EBL": "<column header or null>",
    "EBT": "<column header or null>",
    "EBR": "<column header or null>",
    "WBL": "<column header or null>",
    "WBT": "<column header or null>",
    "WBR": "<column header or null>"
  }
}

Movement column matching rules:
- NBL: "NBL", "NB Left", "NB-L", "NORTH LEFT", "N Left", "N-L"
- NBT: "NBT", "NB Thru", "NORTH THRU", "N Thru", "NB Through"
- NBR: "NBR", "NB Right", "NORTH RIGHT", "N Right", "N-R"
- SBL/SBT/SBR: same pattern with S/SB/South
- EBL/EBT/EBR: same pattern with E/EB/East
- WBL/WBT/WBR: same pattern with W/WB/West
Set a movement to null if no matching column found.
For interval_minutes infer from time gaps (usually 15). For start_time parse the first data row's time value.
Period: before 10:00 → AM Peak, 10:00-14:00 → Midday, 14:00+ → PM Peak.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.trim();
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

export function buildSnapshotFromMapping(mapping, headers, rows) {
  const timeIdx = headers.findIndex(h => h === mapping.time_column);
  if (timeIdx < 0) throw new Error(`Time column "${mapping.time_column}" not found in headers`);

  const [sh, sm] = (mapping.start_time || '07:00').split(':').map(Number);
  const startMinutes = (sh || 0) * 60 + (sm || 0);
  const intervalMin = mapping.interval_minutes || 15;
  const slots = rows.length;
  const cfg = { intervalMin, startMinutes, durationMin: slots * intervalMin, slots };

  // Build tmcData and collect which approaches/destinations are present
  const tmcData = {};
  const approachSet = {}; // fromLeg → Set of toLeg

  for (const [code, [from, to]] of Object.entries(MOVE_TO_LEGS)) {
    const colName = mapping.movements?.[code];
    if (!colName) continue;
    const colIdx = headers.findIndex(h => h === colName);
    if (colIdx < 0) continue;

    if (!tmcData[from]) tmcData[from] = {};
    if (!tmcData[from][to]) tmcData[from][to] = [];
    if (!approachSet[from]) approachSet[from] = new Set();
    approachSet[from].add(to);

    for (let s = 0; s < slots; s++) {
      const raw = rows[s]?.[colIdx];
      const val = parseInt(raw) || 0;
      tmcData[from][to][s] = [val];
    }
  }

  const LEG_ORDER = ['N', 'S', 'E', 'W'];
  const approachList = LEG_ORDER.filter(l => approachSet[l]).map(leg => ({
    leg,
    destinations: LEG_ORDER.filter(d => approachSet[leg]?.has(d)),
    label: leg,
  }));

  const vData = {
    in: Array.from({ length: slots }, () => [0]),
    out: Array.from({ length: slots }, () => [0]),
  };

  return {
    version: 2,
    projectType: 'intersection',
    mode: 'turning',
    vPairs: [{ label: 'All', in: true, out: true }],
    tmcPairs: [],
    intersection: {
      approaches: approachList,
      legLabels: {},
      crosswalks: [],
      street1: '',
      street2: '',
      diagLeg: '',
      missingLeg: '',
      oneWay: {},
      oneWayIn: {},
    },
    fnames: { vehicle: '', ped: '', tmc: '' },
    activePeriodIdx: 0,
    periods: [{
      name: mapping.period_name || 'AM Peak',
      cfg,
      vData,
      pedData: [],
      tmcData,
      vManual: [],
      pedManual: [],
      tmManual: [],
    }],
  };
}
