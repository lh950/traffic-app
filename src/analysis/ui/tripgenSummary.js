// Trip Generation Summary — the one-page, per-category summary a trip-gen report leads with.
// Layout follows the firm's own "Summary" workbook (Summary_Lindenwood_Fedex.xlsx): a site
// facts header, then one block per vehicle category (Light Goods / Trucks / Personal+Peds…)
// with a trip-rate table (daily + AM/MD/PM per survey day) and a peak-hour volume table
// (In / Out / % In / % Out). Survey days sit side by side as Weekday 1, Weekday 2, Saturday,
// Sunday — every location counted that day is combined, matching the workbook's "Total (N
// locs)". Styled with the app's own tokens (see .tgs-* in analysis/style.css).
//
// Two deliberate differences from the workbook, both about honesty of the numbers:
//  1. The workbook's AM/MD/PM figures under "Trip Rate" are peak-hour volume ÷ the day's total
//     (a share of the day, e.g. 0.27), not a rate per 1,000 SF. Here the AM/MD/PM cells show the
//     real peak-hour rate per 1,000 SF, with that same share of the day printed under it.
//  2. Categories come from the user's own classification grouping (Setup → classifications),
//     not a fixed list.

import * as data from './dataAdapter.js';
import { dateLabelWithWeekday } from './dateUtils.js';

function fmt(n) { return Number(n).toLocaleString(); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function pct(n) { return `${(Math.round(n * 1000) / 10).toFixed(1)}%`; }
const NA = '<span class="tgs-na">N/A</span>';

function parseGsf(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Survey days → columns ───────────────────────────────────────────────────────────────
// A "survey day" is one calendar date across every location (the same Tuesday counted at the
// driveway, parking lot and storage yard is ONE column). Imported days with no date fall back
// to their sheet name as the key.
function dowOf(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function buildColumns(entries) {
  const byKey = new Map();
  entries.forEach((entry) => {
    (entry.days || []).forEach((day) => {
      if (day.includeInAnalysis === false || !day.parsed) return;
      const key = day.date || day.sheetName;
      if (!byKey.has(key)) byKey.set(key, { key, date: day.date || null, dayType: day.dayType, parts: [] });
      byKey.get(key).parts.push({ entry, day });
    });
  });
  const weekdays = [], saturdays = [], sundays = [];
  [...byKey.values()].forEach((s) => {
    const dow = dowOf(s.date);
    if (dow === 6) saturdays.push(s);
    else if (dow === 0) sundays.push(s);
    else if (dow == null && s.dayType === 'weekend') (saturdays.length <= sundays.length ? saturdays : sundays).push(s);
    else weekdays.push(s);
  });
  const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
  weekdays.sort(byDate); saturdays.sort(byDate); sundays.sort(byDate);

  const cols = [];
  const add = (list, base, min, kind) => {
    const n = Math.max(min, list.length);
    for (let i = 0; i < n; i++) {
      cols.push({ kind, label: n > 1 || min > 1 ? `${base} ${i + 1}` : base, survey: list[i] || null, sub: list[i]?.date ? dateLabelWithWeekday(list[i].date) : '' });
    }
  };
  add(weekdays, 'Weekday', 2, 'weekday');
  add(saturdays, 'Saturday', 1, 'weekend');
  add(sundays, 'Sunday', 1, 'weekend');
  return { cols, surveys: [...byKey.values()].sort(byDate) };
}

function categoryOrder(entries, categoryMap) {
  const seen = [];
  entries.forEach((entry) => (entry.days || []).forEach((day) => {
    if (day.includeInAnalysis === false || !day.parsed) return;
    day.parsed.types.forEach((t) => { const g = categoryMap[t] || t; if (!seen.includes(g)) seen.push(g); });
  }));
  return seen;
}

// ── One category × one survey day ──────────────────────────────────────────────────────
function peakWindowsFor(kind, ctx) {
  if (kind === 'weekend') return [{ label: 'Peak hour', searchStartMin: 0, searchEndMin: 24 * 60, manualStartMin: null }];
  return ctx.peakWindows?.weekday || [];
}
// 'AM peak' / 'Midday peak' / 'PM peak' → AM / MD / PM, as on the workbook; any other
// (user-renamed) window keeps its own label minus a trailing "peak".
function shortWindowLabel(w) {
  return w.label.replace(/\s*peak$/i, '').replace(/^Midday$/i, 'MD');
}

async function categoryCell(group, col, ctx, gsf) {
  const survey = col.survey;
  if (!survey) return null;
  const bucket = new Map();
  survey.parts.forEach(({ day }) => {
    const { parsed } = day;
    const idxs = parsed.types.map((t, i) => ((ctx.categoryMap[t] || t) === group ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return;
    parsed.intervals.forEach((iv) => {
      let b = bucket.get(iv.start);
      if (!b) { b = { start: iv.start, end: iv.end, label: iv.label, inbound: [0], outbound: [0] }; bucket.set(iv.start, b); }
      idxs.forEach((i) => { b.inbound[0] += iv.inbound[i] || 0; b.outbound[0] += iv.outbound[i] || 0; });
    });
  });
  if (!bucket.size) return null;
  const intervals = [...bucket.values()].sort((a, b) => toMin(a.start) - toMin(b.start));
  const intervalMinutes = intervals.length > 1 ? Math.max(1, toMin(intervals[1].start) - toMin(intervals[0].start)) : 15;
  const inbound = intervals.reduce((s, iv) => s + iv.inbound[0], 0);
  const outbound = intervals.reduce((s, iv) => s + iv.outbound[0], 0);
  const total = inbound + outbound;
  const rate = gsf ? await data.tripRate(total, gsf) : null;

  const windows = peakWindowsFor(col.kind, ctx);
  const peaks = await Promise.all(windows.map(async (w) => {
    const [s, e] = w.manualStartMin != null ? [w.manualStartMin, w.manualStartMin + 1] : [w.searchStartMin, w.searchEndMin];
    const p = await data.peakHourInWindow(intervals, intervalMinutes, s, e, 'vehicle');
    const label = col.kind === 'weekend' ? 'Peak hour' : shortWindowLabel(w);
    if (p.startIdx < 0 || p.volume === 0) return { label, found: false };
    return {
      label, found: true, volume: p.volume, inbound: p.inbound, outbound: p.outbound, hour: p.label,
      rate: gsf ? await data.tripRate(p.volume, gsf) : null,
      shareOfDay: total > 0 ? p.volume / total : 0,
    };
  }));
  return { total, inbound, outbound, rate, peaks, intervals };
}

// ── Markup ───────────────────────────────────────────────────────────────────────────────
function siteHeaderHtml(entries, surveys, siteInfo) {
  const gsf = parseGsf(siteInfo.gsf);
  const lot = parseGsf(siteInfo.lotSf);
  const far = gsf && lot ? (gsf / lot).toFixed(2) : '';
  const studyDates = siteInfo.studyDates || surveys.map((s) => (s.date ? dateLabelWithWeekday(s.date) : s.key)).join(', ');
  const facts = [
    ['Land use', siteInfo.landUseType],
    ['ITE land use', siteInfo.iteLandUse],
    ['Size (GSF)', gsf ? fmt(gsf) : ''],
    ['Available GSF', siteInfo.availableGsf ? fmt(parseGsf(siteInfo.availableGsf)) : ''],
    ['Occupancy rate', siteInfo.occupancy],
    ['Lot gross SF', lot ? fmt(lot) : ''],
    ['FAR', far],
    ['Borough', siteInfo.borough],
    ['Transit zone*', siteInfo.transitZone],
    ['Parking spaces', siteInfo.parking],
    ['Units / employees', siteInfo.units],
    ['Study dates', studyDates],
  ].filter(([, v]) => v !== '' && v != null);
  const locs = entries.map((e) => e.locationLabel).filter(Boolean);
  return `
    <div class="tgs-site">
      <div class="tgs-site-title">${esc(siteInfo.location || 'Trip generation study')}</div>
      <div class="tgs-site-grid">
        ${facts.map(([k, v]) => `<div class="tgs-fact"><span class="tgs-fact-k">${k}</span><span class="tgs-fact-v">${esc(String(v))}</span></div>`).join('')}
      </div>
      ${locs.length ? `<div class="tgs-locs"><span class="tgs-fact-k">Locations counted (${locs.length})</span> ${locs.map((l) => `<span class="tgs-chip">${esc(l)}</span>`).join('')}</div>` : ''}
      ${siteInfo.transitZone ? '<div class="tgs-note">*Transit zone is defined as within &frac14; mile of a subway station.</div>' : ''}
      ${siteInfo.notes ? `<div class="tgs-note">${esc(siteInfo.notes)}</div>` : ''}
      ${siteInfo.zolaScreenshotUrl ? `<details class="interval-detail tgs-zola" data-print-open><summary class="interval-detail-summary">ZOLA location information</summary><div class="interval-detail-wrap"><img src="${siteInfo.zolaScreenshotUrl}" alt="ZOLA location information" style="max-width:100%;max-height:420px;display:block;border:1px solid var(--border);border-radius:4px"></div></details>` : ''}
    </div>`;
}

function rateTableHtml(cols, cells, gsf) {
  const head1 = cols.map((c, i) => {
    const span = 1 + (cells[i]?.peaks.length ?? peakWindowsForCount(c));
    return `<th colspan="${span}" class="tgs-grp">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`;
  }).join('');
  const head2 = cols.map((c, i) => {
    const peaks = cells[i]?.peaks ?? Array.from({ length: peakWindowsForCount(c) }, (_, k) => ({ label: c.kind === 'weekend' ? 'Peak hr' : ['AM', 'MD', 'PM'][k] || `P${k + 1}` }));
    return `<th class="tgs-sub tgs-first">Daily</th>${peaks.map((p) => `<th class="tgs-sub">${esc(p.label)}</th>`).join('')}`;
  }).join('');
  const rateRow = cols.map((c, i) => {
    const cell = cells[i];
    if (!cell) return `<td class="tgs-first">${NA}</td>${Array.from({ length: peakWindowsForCount(c) }, () => `<td>${NA}</td>`).join('')}`;
    const daily = `<td class="tgs-first tgs-strong">${cell.rate != null ? cell.rate.toFixed(2) : '—'}</td>`;
    const pk = cell.peaks.map((p) => p.found
      ? `<td>${p.rate != null ? p.rate.toFixed(2) : '—'}<small>${pct(p.shareOfDay)} of day</small></td>` : `<td>${NA}</td>`).join('');
    return daily + pk;
  }).join('');
  const volRow = cols.map((c, i) => {
    const cell = cells[i];
    if (!cell) return `<td class="tgs-first">${NA}</td>${Array.from({ length: peakWindowsForCount(c) }, () => `<td>${NA}</td>`).join('')}`;
    return `<td class="tgs-first">${fmt(cell.total)}</td>${cell.peaks.map((p) => `<td>${p.found ? fmt(p.volume) : NA}</td>`).join('')}`;
  }).join('');
  return `
    <table class="tgs-table">
      <thead>
        <tr><th rowspan="2" class="tgs-rowhead">Trip rate<small>${gsf ? 'trips per 1,000 SF' : 'enter facility SF to compute'}</small></th>${head1}</tr>
        <tr>${head2}</tr>
      </thead>
      <tbody>
        <tr><th class="tgs-rowhead">Rate</th>${rateRow}</tr>
        <tr class="tgs-vol"><th class="tgs-rowhead">Trips (in + out)</th>${volRow}</tr>
      </tbody>
    </table>`;
}
// Placeholder column width for a survey day with no data (keeps column groups aligned).
function peakWindowsForCount(col) { return col.kind === 'weekend' ? 1 : 3; }

function peakVolumeTableHtml(cols, cells, kind, rowLabels, title) {
  const use = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === kind);
  if (!use.length) return '';
  const head = use.map(({ c }) => `<th colspan="5" class="tgs-grp">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('');
  const sub = use.map(() => ['Hour', 'In', 'Out', '% In', '% Out'].map((h, k) => `<th class="tgs-sub${k === 0 ? ' tgs-first' : ''}">${h}</th>`).join('')).join('');
  const rows = rowLabels.map((label, r) => {
    const tds = use.map(({ i }) => {
      const p = cells[i]?.peaks[r];
      if (!p || !p.found) return `<td class="tgs-first">${NA}</td><td>${NA}</td><td>${NA}</td><td>${NA}</td><td>${NA}</td>`;
      const t = p.inbound + p.outbound;
      return `<td class="tgs-first tgs-hour">${esc(p.hour)}</td><td>${fmt(p.inbound)}</td><td>${fmt(p.outbound)}</td><td>${t ? pct(p.inbound / t) : '—'}</td><td>${t ? pct(p.outbound / t) : '—'}</td>`;
    }).join('');
    return `<tr><th class="tgs-rowhead">${esc(label)}</th>${tds}</tr>`;
  }).join('');
  return `
    <table class="tgs-table">
      <thead>
        <tr><th rowspan="2" class="tgs-rowhead">${esc(title)}</th>${head}</tr>
        <tr>${sub}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// 15-minute volumes per survey day — the workbook's Analysis_* tab. Collapsed on screen; the
// beforeprint handler below opens it so it prints as an appendix.
function intervalAppendixHtml(group, cols, cells) {
  const used = cols.map((c, i) => ({ c, i })).filter(({ i }) => cells[i]);
  if (!used.length) return '';
  const times = [...new Set(used.flatMap(({ i }) => cells[i].intervals.map((iv) => iv.start)))].sort((a, b) => toMin(a) - toMin(b));
  const endOf = {};
  used.forEach(({ i }) => cells[i].intervals.forEach((iv) => { endOf[iv.start] = iv.end; }));
  const lookup = used.map(({ i }) => new Map(cells[i].intervals.map((iv) => [iv.start, iv])));
  const weekdayIdx = used.map(({ c }, k) => (c.kind === 'weekday' ? k : -1)).filter((k) => k >= 0);
  const showAvg = weekdayIdx.length >= 2;
  const head1 = used.map(({ c }) => `<th colspan="3" class="tgs-grp">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('') + (showAvg ? '<th colspan="3" class="tgs-grp">Avg weekday</th>' : '');
  const head2 = (used.map(() => '<th class="tgs-sub tgs-first">In</th><th class="tgs-sub">Out</th><th class="tgs-sub">Total</th>').join('')) + (showAvg ? '<th class="tgs-sub tgs-first">In</th><th class="tgs-sub">Out</th><th class="tgs-sub">Total</th>' : '');
  const body = times.map((t) => {
    const vals = lookup.map((m) => m.get(t));
    const tds = vals.map((iv) => iv
      ? `<td class="tgs-first">${fmt(iv.inbound[0])}</td><td>${fmt(iv.outbound[0])}</td><td>${fmt(iv.inbound[0] + iv.outbound[0])}</td>`
      : `<td class="tgs-first">${NA}</td><td>${NA}</td><td>${NA}</td>`).join('');
    let avg = '';
    if (showAvg) {
      const have = weekdayIdx.map((k) => vals[k]).filter(Boolean);
      const a = have.reduce((s, iv) => s + iv.inbound[0], 0) / have.length;
      const b = have.reduce((s, iv) => s + iv.outbound[0], 0) / have.length;
      avg = have.length ? `<td class="tgs-first">${a.toFixed(1)}</td><td>${b.toFixed(1)}</td><td>${(a + b).toFixed(1)}</td>` : `<td class="tgs-first">${NA}</td><td>${NA}</td><td>${NA}</td>`;
    }
    return `<tr><th class="tgs-rowhead tgs-time">${t} – ${endOf[t] || ''}</th>${tds}${avg}</tr>`;
  }).join('');
  return `
    <details class="interval-detail tgs-appendix" data-print-open>
      <summary class="interval-detail-summary">${esc(group)} — volumes by interval</summary>
      <div class="interval-detail-wrap" style="overflow-x:auto">
        <table class="tgs-table tgs-compact">
          <thead><tr><th rowspan="2" class="tgs-rowhead">Time</th>${head1}</tr><tr>${head2}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </details>`;
}

// <details> content is not printed unless it is open — open everything marked data-print-open
// just for the print, then put each one back the way the viewer had it.
let printHookInstalled = false;
function installPrintHook() {
  if (printHookInstalled || typeof window === 'undefined') return;
  printHookInstalled = true;
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('details[data-print-open]').forEach((d) => { d.dataset.wasOpen = d.open ? '1' : '0'; d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('details[data-print-open]').forEach((d) => { d.open = d.dataset.wasOpen === '1'; delete d.dataset.wasOpen; });
  });
}

export async function tripGenSummaryHtml(entries, ctx) {
  installPrintHook();
  const { siteInfo, categoryMap } = ctx;
  const gsf = parseGsf(siteInfo.gsf);
  const { cols, surveys } = buildColumns(entries);
  const groups = categoryOrder(entries, categoryMap);
  const weekdayRows = (ctx.peakWindows?.weekday || []).map((w) => shortWindowLabel(w));

  const blocks = await Promise.all(groups.map(async (group) => {
    const cells = await Promise.all(cols.map((c) => categoryCell(group, c, ctx, gsf)));
    return `
      <div class="tgs-cat">
        <div class="tgs-cat-title">${esc(group)}</div>
        <div class="tgs-scroll">${rateTableHtml(cols, cells, gsf)}</div>
        <div class="tgs-scroll">${peakVolumeTableHtml(cols, cells, 'weekday', weekdayRows, 'Peak-hour volumes')}</div>
        <div class="tgs-scroll">${peakVolumeTableHtml(cols, cells, 'weekend', ['Peak hour'], 'Weekend peak hour')}</div>
        ${intervalAppendixHtml(group, cols, cells)}
      </div>`;
  }));

  return `
    <div class="tgs">
      ${siteHeaderHtml(entries, surveys, siteInfo)}
      ${blocks.join('')}
      <div class="tgs-note">Every location counted on a survey day is combined. Trip rate = trips (in + out) per 1,000 SF of facility GSF; AM / MD / PM are each category's own busiest hour in that period, shown as a rate with its share of the day beneath. Peak hours and groupings follow the project's own peak windows and classification groups.</div>
    </div>`;
}
