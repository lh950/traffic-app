// Shared date/weekday helpers — used by both the intersection Analyze screen (main.js) and
// Trip Gen's Analyze screen (tripgenSection.js). Extracted to a standalone module so both
// callers reuse the exact same logic rather than drifting (see BUGS.md — weekday derivation
// has a documented pitfall, below).

// Safe 'YYYY-MM-DD' -> weekday parsing. Deliberately NOT `new Date(dateStr)` — passing a
// plain date string to the Date constructor parses it as UTC midnight, which shifts to the
// PREVIOUS calendar day once rendered in any timezone west of UTC (all of the US). Splitting
// into y/m/d and constructing via `new Date(y, m-1, d)` uses local-time components instead,
// so the weekday always matches the date as printed. Verified by hand against a real
// calendar: 2026-08-11 -> Tuesday (not Monday/Wednesday off-by-one). Same style of pitfall
// as BUG-023 (direction convention trusted without checking against a concrete example).
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayShort(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()];
}

// "Tue 8/11" style — weekday + M/D, no leading zeros, no year. Falls back to the raw string
// (or '') if it isn't a plain YYYY-MM-DD, e.g. missing/malformed dates.
export function dateLabelWithWeekday(dateStr) {
  const wd = weekdayShort(dateStr);
  if (!wd) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${wd} ${m}/${d}`;
}
