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
import { renderGroupedBarChart } from './charts.js';

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

function allLabels(entries) {
  const seen = [];
  entries.forEach((entry) => (entry.days || []).forEach((day) => {
    if (day.includeInAnalysis === false || !day.parsed) return;
    day.parsed.types.forEach((t) => { if (!seen.includes(t)) seen.push(t); });
  }));
  return seen;
}

// The report groups: what the user built in the Report builder, or — until they build any —
// one group per classification-group name (Setup → classifications), so nothing changes for a
// project that never opens the builder. `explicit` tells the builder which case it is in.
// "All vehicles" (ITE-style total vehicle trips): every classification EXCEPT pedestrians. It is
// an automatic group — its classifications are worked out each render, so a classification added
// later is included without anyone editing the group.
export const ALL_VEHICLES = 'allVehicles';
const PED_LABEL = /pedestrian|micro-?mobility/i;
// A source column that counted vehicles and pedestrians together (e.g. "Vehicles + Peds
// (combined)"). It cannot be split, so it is counted in All vehicles and flagged on the report.
const COMBINED_WITH_PEDS = /\+\s*peds?\b/i;
export const isPedLabel = (l) => PED_LABEL.test(l);
export const isCombinedWithPeds = (l) => COMBINED_WITH_PEDS.test(l);

function fillAuto(groups, entries) {
  const labels = allLabels(entries).filter((l) => !isPedLabel(l));
  return groups.map((g) => (g.auto === ALL_VEHICLES ? { ...g, labels } : g));
}

export function resolveReportGroups(entries, ctx) {
  const saved = ctx.reportGroups || [];
  if (saved.length) return { groups: fillAuto(saved, entries), explicit: true };
  const byName = new Map();
  allLabels(entries).forEach((t) => {
    const name = ctx.categoryMap[t] || t;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(t);
  });
  const groups = [...byName.entries()].map(([name, labels], i) => ({ id: i + 1, name, labels }));
  if (groups.length) groups.push({ id: groups.length + 1, name: 'All vehicles', labels: [], auto: ALL_VEHICLES });
  return { groups: fillAuto(groups, entries), explicit: false };
}

// ── One category × one survey day ──────────────────────────────────────────────────────
// The user's own peak periods (Summary tab → Peak periods; suggested defaults until edited).
// Set once per render by buildReportModel so the placeholder columns below match them.
let WINDOWS = { weekday: [], weekend: [] };
function peakWindowsFor(kind) {
  return WINDOWS[kind] || [];
}
// 'AM peak' / 'Midday peak' / 'PM peak' → AM / MD / PM, as on the workbook; any other
// (user-renamed) window keeps its own label minus a trailing "peak".
function shortWindowLabel(w) {
  return w.label.replace(/\s*peak$/i, '').replace(/^Midday$/i, 'MD').replace(/^Weekend peak (\d+)$/i, 'Peak $1');
}

async function categoryCell(group, col, ctx, gsf) {
  const survey = col.survey;
  if (!survey) return null;
  const wanted = new Set(group.labels);
  const bucket = new Map();
  const mixedLocs = [];
  survey.parts.forEach(({ entry, day }) => {
    const { parsed } = day;
    const idxs = parsed.types.map((t, i) => (wanted.has(t) ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return;
    if (group.auto === ALL_VEHICLES && idxs.some((i) => isCombinedWithPeds(parsed.types[i]))) mixedLocs.push(entry.locationLabel);
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

  const windows = peakWindowsFor(col.kind);
  const peaks = await Promise.all(windows.map(async (w) => {
    const [s, e] = w.manualStartMin != null ? [w.manualStartMin, w.manualStartMin + 1] : [w.searchStartMin, w.searchEndMin];
    const p = await data.peakHourInWindow(intervals, intervalMinutes, s, e, 'vehicle');
    const label = shortWindowLabel(w);
    if (p.startIdx < 0 || p.volume === 0) return { label, found: false };
    return {
      label, found: true, volume: p.volume, inbound: p.inbound, outbound: p.outbound, hour: p.label,
      rate: gsf ? await data.tripRate(p.volume, gsf) : null,
      shareOfDay: total > 0 ? p.volume / total : 0,
    };
  }));
  return { total, inbound, outbound, rate, peaks, intervals, mixedLocs };
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
    const peaks = cells[i]?.peaks ?? peakWindowsFor(c.kind).map((w) => ({ label: shortWindowLabel(w) }));
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
function peakWindowsForCount(col) { return peakWindowsFor(col.kind).length; }

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
      return `<td class="tgs-first tgs-hour">${esc(String(p.hour).replace(/\s*[–-]\s*/, "–"))}</td><td>${fmt(p.inbound)}</td><td>${fmt(p.outbound)}</td><td>${t ? pct(p.inbound / t) : '—'}</td><td>${t ? pct(p.outbound / t) : '—'}</td>`;
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
function intervalAppendixHtml(group, cols, cells, open = false) {
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
    <details class="interval-detail tgs-appendix" data-print-open${open ? " open" : ""}>
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

// Everything the Summary tab, the group tabs and the builder need, computed once per render.
export async function buildReportModel(entries, ctx) {
  installPrintHook();
  WINDOWS = { weekday: ctx.peakWindows?.weekday || [], weekend: ctx.peakWindows?.weekend || [] };
  const gsf = parseGsf(ctx.siteInfo.gsf);
  const { cols, surveys } = buildColumns(entries);
  const { groups, explicit } = resolveReportGroups(entries, ctx);
  const cellsByGroup = await Promise.all(groups.map((g) => Promise.all(cols.map((c) => categoryCell(g, c, ctx, gsf)))));
  const weekdayRows = WINDOWS.weekday.map((w) => shortWindowLabel(w));
  const weekendRows = WINDOWS.weekend.map((w) => shortWindowLabel(w));
  return { gsf, cols, surveys, groups, explicit, cellsByGroup, weekdayRows, weekendRows, labels: allLabels(entries) };
}

function groupTablesHtml(model, gi) {
  const { cols, cellsByGroup, weekdayRows, weekendRows, gsf } = model;
  const cells = cellsByGroup[gi];
  const g = model.groups[gi];
  const mixed = g.auto === ALL_VEHICLES
    ? cols.map((c, i) => (cells[i]?.mixedLocs?.length ? `${esc(c.label)}${c.sub ? ` (${esc(c.sub)})` : ''}: ${cells[i].mixedLocs.map(esc).join(', ')}` : '')).filter(Boolean)
    : [];
  const mixedNote = mixed.length
    ? `<div class="tgs-note" style="padding:0 16px"><strong>Includes some pedestrians:</strong> the source counts for ${mixed.join('; ')} combine vehicles and pedestrians in one column, so pedestrians can't be taken out there.</div>`
    : '';
  return `
    ${mixedNote}
    <div class="tgs-scroll">${rateTableHtml(cols, cells, gsf)}</div>
    <div class="tgs-scroll">${peakVolumeTableHtml(cols, cells, 'weekday', weekdayRows, 'Peak-hour volumes')}</div>
    <div class="tgs-scroll">${peakVolumeTableHtml(cols, cells, 'weekend', weekendRows, 'Weekend peak hours')}</div>`;
}

const NOTE = "Every location counted on a survey day is combined. Trip rate = trips (in + out) per 1,000 SF of facility GSF; AM / MD / PM (and the weekend peaks) are each group's own busiest hour inside the peak periods set on the Summary tab, shown as a rate with its share of the day beneath. Peak hours follow the project's own peak windows; groups come from the Report builder.";

// Summary tab: site facts + every group's rate and peak-hour tables.
export function summaryTabHtml(model, entries, ctx) {
  const blocks = model.groups.map((g, gi) => `
    <div class="tgs-cat">
      <div class="tgs-cat-title">${esc(g.name)}</div>
      ${groupTablesHtml(model, gi)}
      <div style="height:10px"></div>
    </div>`);
  return `
    <div class="tgs">
      ${siteHeaderHtml(entries, model.surveys, ctx.siteInfo)}
      ${blocks.join('') || '<div class="stat-detail">No report groups yet — add one in the Report builder.</div>'}
      <div class="tgs-note">${NOTE}</div>
    </div>`;
}

// Print Summary (page 1 of the printed report): site facts and ONE compact table — a row pair
// (rate, trips) per report group across every survey day — so the whole summary fits one Letter
// page however many groups there are. Each group's full tables live on that group's own page.
export function summaryPrintHtml(model, entries, ctx) {
  const { cols, groups, cellsByGroup } = model;
  const head1 = cols.map((c) => `<th colspan="${1 + peakWindowsForCount(c)}" class="tgs-grp">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('');
  const head2 = cols.map((c) => `<th class="tgs-sub tgs-first">Daily</th>${peakWindowsFor(c.kind).map((w) => `<th class="tgs-sub">${esc(shortWindowLabel(w))}</th>`).join('')}`).join('');
  const rows = groups.map((g, gi) => {
    const cells = cellsByGroup[gi];
    const rate = cols.map((c, i) => {
      const cell = cells[i];
      if (!cell) return `<td class="tgs-first">${NA}</td>${peakWindowsFor(c.kind).map(() => `<td>${NA}</td>`).join('')}`;
      return `<td class="tgs-first tgs-strong">${cell.rate != null ? cell.rate.toFixed(2) : '—'}</td>${cell.peaks.map((p) => (p.found ? `<td>${p.rate != null ? p.rate.toFixed(2) : '—'}</td>` : `<td>${NA}</td>`)).join('')}`;
    }).join('');
    const trips = cols.map((c, i) => {
      const cell = cells[i];
      if (!cell) return `<td class="tgs-first">${NA}</td>${peakWindowsFor(c.kind).map(() => `<td>${NA}</td>`).join('')}`;
      return `<td class="tgs-first">${fmt(cell.total)}</td>${cell.peaks.map((p) => `<td>${p.found ? fmt(p.volume) : NA}</td>`).join('')}`;
    }).join('');
    return `<tr><th rowspan="2" class="tgs-rowhead tgs-sumname">${esc(g.name)}</th><th class="tgs-rowhead tgs-sumkind">Rate</th>${rate}</tr><tr class="tgs-vol"><th class="tgs-rowhead tgs-sumkind">Trips</th>${trips}</tr>`;
  }).join('');
  return `
    <div class="tgs">
      ${siteHeaderHtml(entries, model.surveys, ctx.siteInfo)}
      <div class="tgs-cat">
        <div class="tgs-cat-title">Trip generation summary</div>
        <div class="tgs-scroll">
          <table class="tgs-table tgs-sumtbl">
            <thead><tr><th rowspan="2" class="tgs-rowhead">Group</th><th rowspan="2" class="tgs-rowhead">${model.gsf ? 'per 1,000 SF' : 'enter facility SF'}</th>${head1}</tr><tr>${head2}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="tgs-note" style="padding:6px 16px 10px">Rate = trips (in + out) per 1,000 SF of facility GSF, for the whole day (Daily) and for each group's busiest hour in each peak period. Trips = vehicles in + out. Hour-by-hour detail, in/out splits and charts are on each group's own page.</div>
      </div>
    </div>`;
}

// One group's own tab: the same tables, the full 15-minute table (always open), and an in/out
// chart per survey day.
export function groupTabHtml(model, gi, opts = {}) {
  const { charts: withCharts = true, intervals: withIntervals = true } = opts;
  const g = model.groups[gi];
  const cells = model.cellsByGroup[gi];
  const charts = !withCharts ? '' : model.cols.map((c, i) => {
    const cell = cells[i];
    if (!cell) return '';
    return `
      <div class="card" style="margin-bottom:14px">
        <h3>${esc(g.name)} — ${esc(c.label)}${c.sub ? ` (${esc(c.sub)})` : ''}</h3>
        ${renderGroupedBarChart({ labels: cell.intervals.map((iv) => iv.start), seriesA: cell.intervals.map((iv) => iv.inbound[0]), seriesB: cell.intervals.map((iv) => iv.outbound[0]), labelA: 'In', labelB: 'Out' })}
      </div>`;
  }).join('');
  return `
    <div class="tgs">
      <div class="tgs-cat">
        <div class="tgs-cat-title">${esc(g.name)}</div>
        <div class="stat-detail" style="padding:10px 16px 0">Classifications in this report: ${g.labels.length ? g.labels.map((l) => `<span class="tgs-chip">${esc(l)}</span>`).join(' ') : '<em>none selected</em>'}</div>
        ${groupTablesHtml(model, gi)}
        <div style="height:10px"></div>
      </div>
      <div class="tgs-charts">${charts}</div>
      ${withIntervals ? `<div class="tgs-cat">${intervalAppendixHtml(g.name, model.cols, cells, true)}</div>` : ''}
      <div class="tgs-note">${NOTE}</div>
    </div>`;
}

// Report builder tab (owner only): pick which classifications make up each report group. Each
// group becomes its own tab; the Summary tab covers all of them. A classification can be in
// more than one group, or in none (then it is simply not reported).
export function builderTabHtml(model) {
  const used = new Map();
  model.groups.filter((g) => !g.auto).forEach((g) => g.labels.forEach((l) => used.set(l, (used.get(l) || 0) + 1)));
  const unassigned = model.labels.filter((l) => !used.has(l));
  const overlap = model.labels.filter((l) => (used.get(l) || 0) > 1);
  return `
    <div class="tgs">
      <div class="stat-detail">Build the groups this study reports on — for example Light goods, Trucks, and Vehicles + peds. Each group gets its own tab with its trip rate, peak hours and 15-minute volumes, and all of them roll up on the Summary tab.${model.explicit ? '' : ' These starting groups come from the classification grouping on Setup; the first change here makes them yours.'}</div>
      ${model.groups.map((g, gi) => `
        <div class="card tgs-builder-group">
          <div class="tgs-builder-head">
            <input type="text" data-rg-name="${gi}" value="${esc(g.name)}" placeholder="Group name">
            <button type="button" data-rg-remove="${gi}" style="font-size:12px">&times; remove group</button>
          </div>
          ${g.auto
    ? `<div class="stat-detail">Every classification except pedestrians, kept up to date automatically — the ITE-style total of vehicle trips: ${g.labels.map((l) => `<span class="tgs-chip">${esc(l)}</span>`).join(' ') || '<em>none</em>'}</div>`
    : `<div class="tgs-builder-chips">
            ${model.labels.map((l) => `<label class="tgs-pick"><input type="checkbox" data-rg-toggle="${gi}" data-rg-label="${esc(l)}"${g.labels.includes(l) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}
          </div>`}
        </div>`).join('')}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-rg-add>+ add report group</button>
        ${model.groups.some((g) => g.auto === ALL_VEHICLES) ? '' : '<button type="button" data-rg-add-allveh>+ add All vehicles (no pedestrians)</button>'}
        ${model.explicit ? '<button type="button" data-rg-reset style="font-size:12px">reset to classification groups</button>' : ''}
      </div>
      ${unassigned.length ? `<div class="tgs-note"><strong>Not in any report:</strong> ${unassigned.map(esc).join(', ')}</div>` : ''}
      ${overlap.length ? `<div class="tgs-note"><strong>In more than one group (counted in each):</strong> ${overlap.map(esc).join(', ')}</div>` : ''}
    </div>`;
}

// Wires the builder's controls. Every edit goes out through onChange(groups) as a full new list.
export function wireBuilder(container, model, onChange) {
  const copy = () => model.groups.map((g) => (g.auto ? { id: g.id, name: g.name, labels: [], auto: g.auto } : { id: g.id, name: g.name, labels: [...g.labels] }));
  const nextId = () => Math.max(0, ...model.groups.map((g) => g.id)) + 1;
  container.querySelectorAll('[data-rg-name]').forEach((el) => el.addEventListener('change', () => {
    const gs = copy(); gs[Number(el.dataset.rgName)].name = el.value.trim() || 'Untitled group'; onChange(gs);
  }));
  container.querySelectorAll('[data-rg-toggle]').forEach((el) => el.addEventListener('change', () => {
    const gs = copy(); const g = gs[Number(el.dataset.rgToggle)];
    const l = el.dataset.rgLabel;
    g.labels = el.checked ? [...new Set([...g.labels, l])] : g.labels.filter((x) => x !== l);
    onChange(gs);
  }));
  container.querySelectorAll('[data-rg-remove]').forEach((el) => el.addEventListener('click', () => {
    const gs = copy(); gs.splice(Number(el.dataset.rgRemove), 1); onChange(gs);
  }));
  container.querySelector('[data-rg-add]')?.addEventListener('click', () => {
    const gs = copy(); gs.push({ id: nextId(), name: `Group ${gs.length + 1}`, labels: [] }); onChange(gs);
  });
  container.querySelector('[data-rg-add-allveh]')?.addEventListener('click', () => {
    const gs = copy(); gs.push({ id: nextId(), name: 'All vehicles', labels: [], auto: ALL_VEHICLES }); onChange(gs);
  });
  container.querySelector('[data-rg-reset]')?.addEventListener('click', () => onChange([]));
}
