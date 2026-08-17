// Shared interval-detail table helpers — used by both the intersection Analyze screen
// (main.js's buildIntervalDetailMarkup) and Trip Gen's Analyze screen (tripgenSection.js).
// Extracted so the "% of peak hour" formula and bar-rendering stay identical between the two
// rather than drifting.

export function intervalBar(val, max, w = 84) {
  const px = max > 0 ? Math.max(2, Math.round((val / max) * w)) : 2;
  return `<div class="ix-bar-wrap"><div class="ix-bar" style="width:${px}px"></div></div>`;
}

// Builds the "% of peak hour" cell text for interval i, given the study's already-detected
// peak-hour window ({ startIdx, endIdx, volume }). Intervals outside the window show an em
// dash rather than a percentage against a different (non-peak) hour — keeps the column
// unambiguous: every non-dash figure sums to ~100% across the peak hour's own rows.
export function pctOfPeakCell(i, totals, peak) {
  if (!peak || peak.startIdx < 0 || i < peak.startIdx || i > peak.endIdx || !peak.volume) return '—';
  return `${Math.round((totals[i] / peak.volume) * 1000) / 10}%`;
}
