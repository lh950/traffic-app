import * as data from './dataAdapter.js';
import { renderMultiSeriesBarChart, renderStackedBarChart } from './charts.js';
import { weekdayShort, dateLabelWithWeekday } from './dateUtils.js';
import { intervalBar, pctOfPeakCell } from './intervalDetail.js';
import { runVehicleQA, renderQASection } from '../../qa.js';

// Trip generation view — one entry per uploaded TripGenData.xlsx-style file (one physical
// location: driveway/parking lot/storage lot/etc, all part of one site), each containing
// several day-sheets (WKDY 1/2, WKND 1/2).
//
// Report philosophy per maintainer: data first, charts second (charts support the data,
// they aren't the point) — so every block below renders its table(s) before its chart, and
// nothing here hides the raw per-classification numbers behind only a grouped rollup.
//
// Peak-hour, QA/QC, and trip-rate logic here are traced from the actual source workbook's
// formulas (TripGenData.xlsx's "auto+bike+bus+moto" QC-rating legend, TripGenSummary.xlsx's
// Analysis_*/Summary sheets) rather than invented — see analyze.js for the per-function
// citations.
//
// State this module is handed (owned by main.js, mutated only via the on*Change callbacks
// so re-render stays a pure function of state):
//   siteInfo: { location, landUseType, gsf, lotSf, parking, units, studyDates, notes,
//     zolaScreenshotUrl }
//     gsf = facility's own "Available GSF" (building/leasable floor area) — feeds
//     tripRate() unchanged. lotSf = the site/parcel's total land area — additive context
//     only, never a trip-rate input. Together they compute FAR (computeFar(), below).
//     zolaScreenshotUrl = project-wide ZOLA (NYC zoning-lookup) screenshot, a data: URL —
//     shared across every location, distinct from each entry's per-location zolaPdfData.
//   categoryMap: { [classificationLabel]: groupName } — a NON-AUTHORITATIVE starting
//     suggestion, always user-editable; grouping is project-specific (different sites split
//     pedestrians/trucks differently), never a fixed standard.
//   peakWindows: { weekday: [{label, searchStartMin, searchEndMin, manualStartMin}×3],
//     weekend: [...] } — manualStartMin is null by default (auto-detect busiest hour within
//     the search range, per the source's own method); set it to pin an exact hour instead.
//   qaqc: { [entryId__sheetName__peakLabel__quarterIdx]: recountValue } — second-counter
//     recount, ONE VALUE PER 15-MIN QUARTER of the peak hour (not an aggregate — the
//     source's QC scoring is per-quarter, see qaqcPeakHourScore).
//   dataView: 'raw' | 'balanced' — toggles the classification table between as-counted and
//     entry/exit-reconciled values.

export const DEFAULT_PEAK_WINDOWS = {
  weekday: [
    { label: 'AM peak', searchStartMin: 7 * 60, searchEndMin: 11 * 60, manualStartMin: null },
    { label: 'Midday peak', searchStartMin: 11 * 60, searchEndMin: 15 * 60, manualStartMin: null },
    { label: 'PM peak', searchStartMin: 16 * 60, searchEndMin: 19 * 60, manualStartMin: null },
  ],
  weekend: [
    { label: 'Weekend peak 1', searchStartMin: 9 * 60, searchEndMin: 13 * 60, manualStartMin: null },
    { label: 'Weekend peak 2', searchStartMin: 12 * 60, searchEndMin: 16 * 60, manualStartMin: null },
    { label: 'Weekend peak 3', searchStartMin: 15 * 60, searchEndMin: 19 * 60, manualStartMin: null },
  ],
};

function fmt(n) {
  return Number(n).toLocaleString();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToTimeInput(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Sum inbound+outbound per classification across ALL intervals (full day).
function dayTotalsByType(parsed) {
  const totals = parsed.types.map(() => 0);
  parsed.intervals.forEach((iv) => {
    parsed.types.forEach((_, i) => { totals[i] += (iv.inbound[i] || 0) + (iv.outbound[i] || 0); });
  });
  return totals;
}

// Same as dayTotalsByType but using the balanced (entry/exit-reconciled) series per
// classification — used when ctx.dataView === 'balanced'.
async function balancedDayTotalsByType(parsed) {
  const totals = [];
  for (let i = 0; i < parsed.types.length; i++) {
    const inbound = parsed.intervals.map((iv) => iv.inbound[i] || 0);
    const outbound = parsed.intervals.map((iv) => iv.outbound[i] || 0);
    const balanced = await data.balanceEntryExit(inbound, outbound);
    totals.push(balanced.inbound.reduce((a, b) => a + b, 0) + balanced.outbound.reduce((a, b) => a + b, 0));
  }
  return totals;
}

function groupTotals(types, totalsArr, categoryMap) {
  const groups = {};
  types.forEach((t, i) => {
    const g = categoryMap[t] || 'Other';
    groups[g] = (groups[g] || 0) + totalsArr[i];
  });
  return groups;
}

function inferIntervalMinutes(intervals) {
  if (intervals.length < 2) return 15;
  return Math.max(1, toMin(intervals[1].start) - toMin(intervals[0].start));
}

function qaqcKey(entryId, sheetName, peakLabel, quarterIdx) {
  return `${entryId}__${sheetName}__${peakLabel}__${quarterIdx}`;
}

function ratingBadge(rating) {
  const map = { Good: 'badge-pass', Borderline: 'badge-caution', Failed: 'badge-fail', Incomplete: '' };
  return `<span class="tag ${map[rating] || ''}">${rating}</span>`;
}

// FAR = facility's Available GSF ÷ lot square footage — the standard combined use of the
// two site-area figures (e.g. FAR 0.42, FAR 2.1). Only meaningful when both values are
// present and lotSf is nonzero; returns null otherwise so callers can hide the stat rather
// than showing NaN/Infinity from a partially-filled form.
function computeFar(siteInfo) {
  const gsf = Number(siteInfo.gsf);
  const lotSf = Number(siteInfo.lotSf);
  if (!gsf || !lotSf) return null;
  return Math.round((gsf / lotSf) * 100) / 100;
}

function renderSiteInfoForm(siteInfo) {
  const fields = [
    ['location', 'Location / address'],
    ['landUseType', 'Land use type'],
    ['gsf', 'Available GSF (facility)'],
    ['lotSf', 'Lot square footage'],
    ['parking', 'Parking spaces'],
    ['units', 'Units / employees'],
    ['studyDates', 'Study date range'],
  ];
  const far = computeFar(siteInfo);
  return `
    <div class="card no-print" style="margin-bottom:14px">
      <h3>Site information</h3>
      <div class="card-grid" style="grid-template-columns:repeat(3,1fr)">
        ${fields.map(([key, label]) => `
          <div class="setup-field">
            <label>${label}</label>
            <input type="text" data-site-field="${key}" value="${escapeHtml(siteInfo[key] || '')}" />
          </div>
        `).join('')}
      </div>
      ${far !== null ? `<div class="stat-detail" style="margin-top:10px">FAR (Available GSF &divide; lot SF): <strong>${far.toFixed(2)}</strong></div>` : ''}
      <div class="setup-field" style="margin-top:10px">
        <label>Notes</label>
        <textarea data-site-field="notes" rows="2" style="width:100%;font-family:inherit;font-size:13px;padding:6px 10px;border:.5px solid var(--border2);border-radius:var(--r);background:var(--surface2);color:var(--text)">${escapeHtml(siteInfo.notes || '')}</textarea>
      </div>
      <div class="setup-field" style="margin-top:10px">
        <label>ZOLA screenshot <span style="color:var(--text3)">(NYC zoning lookup — project-wide, shared across all locations)</span></label>
        ${siteInfo.zolaScreenshotUrl
          ? `<div style="margin-top:6px">
               <img src="${siteInfo.zolaScreenshotUrl}" alt="ZOLA screenshot" style="max-width:100%;max-height:400px;width:auto;height:auto;display:block;border-radius:4px;border:1px solid var(--border);margin-bottom:6px">
               <button type="button" data-site-zola-clear style="font-size:12px">&times; remove</button>
             </div>`
          : `<label style="display:inline-block;cursor:pointer;font-size:12px;color:var(--blue-text);margin-top:4px">
               upload screenshot&hellip; <input type="file" accept="image/*" data-site-zola-upload style="display:none">
             </label>`}
      </div>
    </div>
    <div class="card print-only" id="site-info-print" style="margin-bottom:14px">
      <h3>Site information</h3>
      <table class="crosswalk-table">
        <tbody>
          ${fields.filter(([key]) => siteInfo[key]).map(([key, label]) => `<tr><td>${label}</td><td>${escapeHtml(String(siteInfo[key]))}</td></tr>`).join('') || '<tr><td colspan="2" style="color:var(--text3)">No site information entered yet</td></tr>'}
          ${far !== null ? `<tr><td>FAR</td><td>${far.toFixed(2)}</td></tr>` : ''}
          ${siteInfo.notes ? `<tr><td>Notes</td><td>${escapeHtml(siteInfo.notes)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategoryMapForm(types, categoryMap) {
  return `
    <div class="card no-print" style="margin-bottom:14px">
      <h3>Classification grouping</h3>
      <div class="stat-detail" style="margin-bottom:10px">Starting grouping only — reassign as <em>this</em> site/project needs (e.g. split pedestrians into walking/biking, or trucks by use type). No default here is a standard; type any group name, matching names share a group.</div>
      <table class="crosswalk-table">
        <thead><tr><th>Classification</th><th>Group</th></tr></thead>
        <tbody>
          ${types.map((t) => `
            <tr><td>${escapeHtml(t)}</td><td><input type="text" data-category-field="${escapeHtml(t)}" value="${escapeHtml(categoryMap[t] || '')}" style="width:160px" /></td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDataViewToggle(dataView) {
  return `
    <div class="day-tabs no-print" style="margin-bottom:10px">
      <button class="day-tab${dataView === 'raw' ? ' active' : ''}" data-view-field="raw">Raw</button>
      <button class="day-tab${dataView === 'balanced' ? ' active' : ''}" data-view-field="balanced">Balanced</button>
    </div>
  `;
}

// Resolve one peak window for one day's parsed data: auto-detect within the search range,
// or use the manual override if one's been set.
async function resolvePeak(parsed, intervalMinutes, window) {
  if (window.manualStartMin != null) {
    return data.peakHourInWindow(parsed.intervals, intervalMinutes, window.manualStartMin, window.manualStartMin + 1, 'vehicle');
  }
  return data.peakHourInWindow(parsed.intervals, intervalMinutes, window.searchStartMin, window.searchEndMin, 'vehicle');
}

// ── Volume by classification: switchable-grouping stacked chart ─────────────────────────
// Trip Gen's counterpart to main.js's renderVehicleClassStackedSection()/
// classSeriesFromVehParsed()/classSeriesAcrossPeriods() — stacked by raw CLASSIFICATION,
// not the categoryMap *group* rollup shown in the "Volume by classification" table above
// (that's a separate, already-existing rollup — not duplicated here). Same five-groupings
// idea, adapted to Trip Gen's own peak-window concept (AM/Midday/PM weekday, or Weekend
// peak 1/2/3) in place of the intersection side's generic "study period".
const TG_CLASS_CHART_GROUPINGS = [
  { key: 'bin', label: '15-min interval' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'day', label: 'Day' },
  { key: 'dow', label: 'Day of week' },
  { key: 'peak', label: 'Peak window' },
];

// 'bin'/'hourly' only use this day's own parsed data — mirrors main.js's
// classSeriesFromVehParsed(); kept as a local copy rather than importing that function
// since main.js is the app entry point that imports THIS module (importing back would be
// circular) — Trip Gen's day.parsed carries the identical
// { types, intervals: [{ inbound, outbound }] } shape as vehParsed, so the logic is
// intentionally identical.
function classSeriesFromTgParsed(parsed, mode) {
  const { types, intervals } = parsed;
  if (!types.length || !intervals.length) return { labels: [], series: [] };

  if (mode === 'hourly') {
    const order = [];
    const buckets = new Map();
    intervals.forEach((iv) => {
      const key = `${(iv.start || '00:00').split(':')[0]}:00`;
      if (!buckets.has(key)) { buckets.set(key, types.map(() => 0)); order.push(key); }
      const arr = buckets.get(key);
      types.forEach((_, ci) => { arr[ci] += (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0); });
    });
    return {
      labels: order,
      series: types.map((label, ci) => ({ label, values: order.map((k) => buckets.get(k)[ci]) })),
    };
  }

  return {
    labels: intervals.map((iv) => iv.label || `${iv.start}–${iv.end}`),
    series: types.map((label, ci) => ({
      label,
      values: intervals.map((iv) => (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0)),
    })),
  };
}

// 'day'/'dow'/'peak' groupings across a location's multiple day-sheets (entry.days). Matches
// classes BY LABEL, not array position — a different day-sheet can carry a different
// classification set/order, same BUG-019/BUG-020 discipline as the intersection side.
async function classSeriesAcrossTgDays(days, mode, peakWindows) {
  const groupTotalsMap = new Map(); // group key -> Map(class label -> total)
  const groupOrderRaw = [];
  const groupLabels = new Map();

  function addToGroup(key, groupLabel, parsed, startIdx, endIdx) {
    if (!groupTotalsMap.has(key)) { groupTotalsMap.set(key, new Map()); groupOrderRaw.push(key); groupLabels.set(key, groupLabel); }
    const classMap = groupTotalsMap.get(key);
    const lo = startIdx == null ? 0 : startIdx;
    const hi = endIdx == null ? parsed.intervals.length - 1 : endIdx;
    parsed.types.forEach((label, ci) => {
      let sum = 0;
      for (let i = lo; i <= hi; i++) {
        const iv = parsed.intervals[i];
        sum += (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0);
      }
      classMap.set(label, (classMap.get(label) || 0) + sum);
    });
  }

  if (mode === 'peak') {
    for (const day of days) {
      const { parsed, dayType } = day;
      const intervalMinutes = inferIntervalMinutes(parsed.intervals);
      for (const w of (peakWindows[dayType] || [])) {
        const peak = await resolvePeak(parsed, intervalMinutes, w);
        if (peak.startIdx < 0) continue;
        addToGroup(w.label, w.label, parsed, peak.startIdx, peak.endIdx);
      }
    }
  } else {
    for (const day of days) {
      let key, groupLabel;
      if (mode === 'dow') {
        key = weekdayShort(day.date) || 'No date';
        groupLabel = key;
      } else { // 'day'
        key = day.date || 'No date';
        groupLabel = key === 'No date' ? key : dateLabelWithWeekday(key);
      }
      addToGroup(key, groupLabel, day.parsed, null, null);
    }
  }

  let groupOrder;
  if (mode === 'day') {
    groupOrder = [...groupOrderRaw].sort((a, b) => (a === 'No date' ? 1 : b === 'No date' ? -1 : a.localeCompare(b)));
  } else if (mode === 'dow') {
    const dowRank = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6, 'No date': 7 };
    groupOrder = [...groupOrderRaw].sort((a, b) => (dowRank[a] ?? 8) - (dowRank[b] ?? 8));
  } else {
    groupOrder = groupOrderRaw; // 'peak' — keep encounter order (AM/Midday/PM as configured)
  }

  const labelTotals = new Map();
  groupOrder.forEach((key) => {
    for (const [label, val] of groupTotalsMap.get(key)) labelTotals.set(label, (labelTotals.get(label) || 0) + val);
  });
  const classLabels = [...labelTotals.keys()];
  return {
    labels: groupOrder.map((key) => groupLabels.get(key)),
    series: classLabels.map((label) => ({
      label,
      values: groupOrder.map((key) => groupTotalsMap.get(key).get(label) || 0),
    })),
  };
}

// `container` is a placeholder div unique to this one day-block (see the
// data-tg-classchart wiring in renderTripGenSection below — mirrors BUG-017's discipline:
// no ids shared across simultaneously-mounted day blocks), rebuilt fresh on every full
// renderTripGenSection() repaint, so the grouping toggle state below lives only as long as
// this one render call.
function renderTgClassStackedSection(container, { parsed, days, dayType, peakWindows }) {
  let grouping = 'bin';

  async function paint() {
    const chartRoot = container.querySelector('.tg-vcls-chart-root');
    if (!chartRoot) return;
    const { labels, series } = (grouping === 'bin' || grouping === 'hourly')
      ? classSeriesFromTgParsed(parsed, grouping)
      : await classSeriesAcrossTgDays(days, grouping, peakWindows);
    if (!labels.length || !series.length) {
      chartRoot.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:10px 0">No classification data available for this grouping.</div>';
      return;
    }
    chartRoot.innerHTML = renderStackedBarChart({ labels, series });
  }

  container.innerHTML = `
    <div class="tg-vcls-toolbar dataset-tabs no-print" style="margin-bottom:12px">
      ${TG_CLASS_CHART_GROUPINGS.map((g, i) => `<button class="dataset-tab tg-vcls-grp-btn${i === 0 ? ' active' : ''}" data-grp="${g.key}">${escapeHtml(g.label)}</button>`).join('')}
    </div>
    <div class="tg-vcls-chart-root"></div>
  `;
  container.querySelectorAll('.tg-vcls-grp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tg-vcls-grp-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      grouping = btn.dataset.grp;
      paint();
    });
  });
  paint();
}

// ── Interval Detail table with "% of peak hour" column ───────────────────────────────────
// Trip Gen's counterpart to main.js's buildIntervalDetailMarkup()/pctOfPeakCell(). Trip Gen
// has up to 3 named peak windows per day type (AM/Midday/PM weekday, or Weekend peak 1/2/3)
// rather than one generic peak hour, so each interval's %-of-peak-hour is computed against
// whichever of that day's already-resolved peak windows actually contains it (an interval
// outside every window shows "—", same as the intersection side). Reuses resolvePeak() —
// the same peak detection already driving the "Peak periods" card above — rather than
// re-detecting peaks with new logic.
async function buildTgIntervalDetailMarkup(day, peakWindows) {
  const { parsed, dayType } = day;
  const { intervals } = parsed;
  const intervalMinutes = inferIntervalMinutes(intervals);
  const totals = intervals.map((iv) => iv.inbound.reduce((a, b) => a + (b || 0), 0) + iv.outbound.reduce((a, b) => a + (b || 0), 0));
  const maxT = Math.max(...totals, 1);

  const resolvedPeaks = [];
  for (const w of (peakWindows[dayType] || [])) {
    const peak = await resolvePeak(parsed, intervalMinutes, w);
    if (peak.startIdx >= 0) resolvedPeaks.push({ ...peak, label: w.label });
  }
  const peakForIdx = (i) => resolvedPeaks.find((p) => i >= p.startIdx && i <= p.endIdx);

  const rows = intervals.map((iv, i) => {
    const p = peakForIdx(i);
    return `
      <tr class="ix-tr${p ? ' ix-tr-peak' : ''}">
        <td class="ix-td ix-td-time">${iv.start}–${iv.end}</td>
        <td class="ix-td ix-td-num ix-td-bold">${totals[i].toLocaleString()}</td>
        <td class="ix-td" style="font-size:11px;color:var(--text3)">${p ? escapeHtml(p.label) : ''}</td>
        <td class="ix-td ix-td-num">${pctOfPeakCell(i, totals, p)}</td>
        <td class="ix-td ix-td-bar">${intervalBar(totals[i], maxT)}</td>
      </tr>`;
  }).join('');

  return `
    <details class="interval-detail">
      <summary class="interval-detail-summary">Show all ${intervals.length} interval${intervals.length !== 1 ? 's' : ''}</summary>
      <div class="interval-detail-wrap">
        <table class="ix-table">
          <thead><tr><th class="ix-th">Interval</th><th class="ix-th ix-th-r">Total (in+out)</th><th class="ix-th">Peak window</th><th class="ix-th ix-th-r">% of peak hour</th><th class="ix-th"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>`;
}

function renderPeakWindowRangeControls(dayType, peakWindows) {
  return peakWindows[dayType].map((w, i) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;flex-wrap:wrap">
      <span style="min-width:90px;font-weight:500">${escapeHtml(w.label)}</span>
      <span style="color:var(--text3)">search</span>
      <input type="time" data-peak-search-field="${dayType}__${i}__start" value="${minToTimeInput(w.searchStartMin)}" style="font-size:11px;padding:2px 4px;width:auto" />
      <span style="color:var(--text3)">–</span>
      <input type="time" data-peak-search-field="${dayType}__${i}__end" value="${minToTimeInput(w.searchEndMin)}" style="font-size:11px;padding:2px 4px;width:auto" />
      <label style="display:flex;align-items:center;gap:4px;margin-left:8px">
        <input type="checkbox" data-peak-manual-toggle="${dayType}__${i}" ${w.manualStartMin != null ? 'checked' : ''} style="width:auto" />
        pin exact hour
      </label>
      ${w.manualStartMin != null ? `<input type="time" data-peak-manual-field="${dayType}__${i}" value="${minToTimeInput(w.manualStartMin)}" style="font-size:11px;padding:2px 4px;width:auto" />` : ''}
    </div>
  `).join('');
}

async function renderDayBlock(entry, day, dayIdx, ctx) {
  const { parsed, sheetName, dayType } = day;
  const { categoryMap, peakWindows, qaqc, entryId, siteInfo, dataView } = ctx;
  const intervalMinutes = inferIntervalMinutes(parsed.intervals);
  const dayKey = `${entryId}__${dayIdx}`; // unique per entry+day, for the placeholder-div ids wired post-render below (BUG-017 discipline — no ids shared across simultaneously-mounted day blocks)

  const dayTotalsArr = dataView === 'balanced' ? await balancedDayTotalsByType(parsed) : dayTotalsByType(parsed);
  const rawDayTotalsArr = dayTotalsByType(parsed); // always needed for trip-rate denominators below
  const dayGroups = groupTotals(parsed.types, dayTotalsArr, categoryMap);
  const dayTotal = dayTotalsArr.reduce((s, v) => s + v, 0);

  const groupNames = [...new Set(Object.keys(dayGroups))];
  // defs is a parallel array (index-matched to parsed.types) — populated for locations
  // counted live through the classification editor's own description field; empty for
  // XLSX/paste imports, which have no such editor step and so carry no description.
  const defs = parsed.defs || [];
  const detailRows = groupNames.map((g) => {
    const subRows = parsed.types
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => (categoryMap[t] || 'Other') === g)
      .map(({ t, i }) => `<tr><td style="padding-left:1.5em;color:var(--text2)"${defs[i] ? ` title="${escapeHtml(defs[i])}"` : ''}>${escapeHtml(t)}${defs[i] ? ' <span style="color:var(--text3);font-size:10px" title="' + escapeHtml(defs[i]) + '">ⓘ</span>' : ''}</td><td>${fmt(dayTotalsArr[i])}</td></tr>`)
      .join('');
    return `<tr style="font-weight:500"><td>${escapeHtml(g)}</td><td>${fmt(dayGroups[g])}</td></tr>${subRows}`;
  }).join('');

  const labels = parsed.intervals.map((iv) => iv.label);
  const groupSeries = {};
  groupNames.forEach((g) => { groupSeries[g] = labels.map(() => 0); });
  parsed.types.forEach((t, ti) => {
    const g = categoryMap[t] || 'Other';
    parsed.intervals.forEach((iv, ii) => { groupSeries[g][ii] += (iv.inbound[ti] || 0) + (iv.outbound[ti] || 0); });
  });
  const sortedGroups = groupNames.sort((a, b) => dayGroups[b] - dayGroups[a]);
  const chartHTML = sortedGroups.length >= 2
    ? renderMultiSeriesBarChart({
        labels,
        series: sortedGroups.map((g) => ({ label: g, values: groupSeries[g] })),
      })
    : '';

  // Trip rate per category per day (rawDayTotalsArr — rate is always computed off the
  // as-counted day total, matching the source; "balanced" view doesn't change the rate).
  const rawGroups = groupTotals(parsed.types, rawDayTotalsArr, categoryMap);
  const rateRows = await Promise.all(Object.keys(rawGroups).map(async (g) => {
    const rate = await data.tripRate(rawGroups[g], siteInfo.gsf);
    return `<tr><td>${escapeHtml(g)}</td><td>${fmt(rawGroups[g])}</td><td>${rate != null ? rate : '—'}</td></tr>`;
  }));
  const tripRateHTML = `
    <div class="card" style="margin-bottom:14px">
      <h3>Trip rate</h3>
      ${!siteInfo.gsf ? '<div class="stat-detail" style="margin-bottom:8px">Enter site square footage above to compute rates.</div>' : ''}
      <table class="crosswalk-table">
        <thead><tr><th>Group</th><th>Day total</th><th>Trips / 1000 GSF</th></tr></thead>
        <tbody>${rateRows.join('')}</tbody>
      </table>
    </div>
  `;

  // Peak periods card here is a READ-ONLY summary (hour found, volume, in/out split, % of
  // day) — the recount entry/scoring UI lives in its own dedicated QA/QC section now (see
  // renderQaqcSection), so this card doesn't duplicate it.
  const peakBlocks = await Promise.all(peakWindows[dayType].map(async (w) => {
    const peak = await resolvePeak(parsed, intervalMinutes, w);
    if (peak.startIdx < 0) {
      return `<tr><td>${escapeHtml(w.label)}</td><td colspan="3" style="color:var(--text3)">No interval found in the search range.</td></tr>`;
    }
    const inOutPct = peak.inbound + peak.outbound > 0 ? Math.round((peak.inbound / (peak.inbound + peak.outbound)) * 1000) / 10 : 0;
    return `
      <tr>
        <td>${escapeHtml(w.label)}${w.manualStartMin != null ? ' (pinned)' : ''}</td>
        <td>${peak.label}</td>
        <td>${fmt(peak.volume)}</td>
        <td>In ${fmt(peak.inbound)} (${inOutPct}%) / Out ${fmt(peak.outbound)} (${(100 - inOutPct).toFixed(1)}%)</td>
        <td>${peak.pctOfDay}%</td>
      </tr>
    `;
  }));

  const cameraImageHTML = day.cameraImageUrl
    ? `
      <div class="card" style="margin-bottom:14px">
        <h3>Camera view</h3>
        <img src="${day.cameraImageUrl}" alt="Camera view for ${escapeHtml(sheetName)}" style="max-width:100%;max-height:360px;width:auto;height:auto;display:block;border-radius:4px;border:1px solid var(--border)">
      </div>
    `
    : '';

  // Weekday alongside the day's date — reuses dateLabelWithWeekday() (see header comment
  // at the top of this module's imports), never re-derives the weekday. sheetName is often
  // already a full formatted date for live-counted/pasted entries (formatDateLong(), which
  // includes the weekday) — the short "Tue 8/11" form is still shown alongside it for a
  // quick scan, and is the ONLY place the weekday appears for XLSX imports (sheetName there
  // is the source sheet name, e.g. "WKDY 1", which carries no weekday at all).
  const weekdayHeaderBit = day.date ? ` — ${dateLabelWithWeekday(day.date)}` : '';

  const intervalDetailHTML = await buildTgIntervalDetailMarkup(day, peakWindows);

  return `
    <div class="section" style="margin-bottom:1.5rem">
      <h3 style="font-size:13px;color:var(--text2);margin-bottom:10px">${escapeHtml(sheetName)}${weekdayHeaderBit} (${dayType})</h3>
      ${cameraImageHTML}
      ${tripRateHTML}
      <div class="card" style="margin-bottom:14px">
        <h3>Peak periods</h3>
        <div class="no-print" style="margin-bottom:10px;display:flex;flex-direction:column;gap:6px">
          ${renderPeakWindowRangeControls(dayType, peakWindows)}
        </div>
        <table class="crosswalk-table">
          <thead><tr><th>Period</th><th>Hour found</th><th>Volume</th><th>In/Out split</th><th>% of day</th></tr></thead>
          <tbody>${peakBlocks.join('')}</tbody>
        </table>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3>Volume by classification</h3>
        ${renderDataViewToggle(dataView)}
        <table class="crosswalk-table" style="margin-bottom:14px">
          <thead><tr><th>Classification</th><th>Day total (in+out)</th></tr></thead>
          <tbody>${detailRows}</tbody>
          <tfoot><tr style="font-weight:600"><td>Day total — all classifications</td><td>${fmt(dayTotal)}</td></tr></tfoot>
        </table>
        ${chartHTML}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3>Volume by classification — stacked, by grouping</h3>
        <div class="stat-detail" style="margin-bottom:10px">Stacked by raw classification (not the group rollup above). "Day"/"Day of week"/"Peak window" groupings combine this location's other counted days.</div>
        <div class="tg-vcls-root" data-tg-classchart="${dayKey}"></div>
      </div>
      <div class="section no-print" style="margin-bottom:14px">
        <div class="section-head"><h2 style="font-size:14px;font-weight:600;margin:0">Interval detail</h2></div>
        ${intervalDetailHTML}
      </div>
      <div class="section no-print" style="margin-bottom:14px">
        <div class="section-head"><h2 style="font-size:14px;font-weight:600;margin:0">Data quality</h2></div>
        <div class="tg-qa-root" data-tg-qa="${dayKey}"></div>
      </div>
    </div>
  `;
}

function qaqcPeakKey(entryId, sheetName, peakLabel) {
  return `${entryId}__${sheetName}__${peakLabel}`;
}

// Sums one recount's classifications into one in+out total per interval — recounts always
// carry their own full classification breakdown (never a single aggregate number, to avoid
// transcription errors against the wrong category), but scoring against the primary count's
// quarters only needs the combined total per interval.
function recountIntervalTotals(recount) {
  return recount.parsed.intervals.map((iv) => iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0));
}

// A recount only scores against a peak if its interval grid lines up exactly (same start
// times in the same order) — guessing at a partial overlap would silently misalign two
// different time grids. Mismatched recounts are still shown (so the entered data isn't
// hidden), just flagged as not contributing to the score.
function recountAlignsWithPeak(recount, quarterIntervals) {
  if (recount.parsed.intervals.length !== quarterIntervals.length) return false;
  return recount.parsed.intervals.every((iv, i) => iv.start === quarterIntervals[i].start);
}

// Dedicated QA/QC section — read-only summary of recounts entered via the standalone QA/QC
// screen (main.js's renderQaqcScreen), covering every location × day × peak period in one
// place. Data entry itself lives outside the analysis view entirely now, so this section is
// just reporting: a score table, plus per-peak detail showing the primary count alongside
// every recount that was entered for it.
async function renderQaqcSection(entries, ctx) {
  const { peakWindows, qaqc } = ctx;
  const summaryRows = [];
  const detailBlocks = [];

  for (const entry of entries) {
    for (const day of entry.days) {
      const { parsed, sheetName, dayType } = day;
      const intervalMinutes = inferIntervalMinutes(parsed.intervals);
      const scores = [];
      for (const w of peakWindows[dayType]) {
        const peak = await resolvePeak(parsed, intervalMinutes, w);
        // Push null (not skip) when a peak window has no data at all — threePeakHourRating
        // needs scores.length to always match peakWindows[dayType].length (3) so it reports
        // "Incomplete" rather than silently scoring e.g. 1-of-3 peaks against the full
        // 3-peak/15-point scale, which would misreport a partial study as "Failed".
        if (peak.startIdx < 0) { scores.push(null); continue; }
        const quarterIntervals = parsed.intervals.slice(peak.startIdx, peak.endIdx + 1);
        const quarterTotals = quarterIntervals.map((iv) => iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0));

        const key = qaqcPeakKey(entry.id, sheetName, w.label);
        const allRecounts = qaqc[key]?.recounts || [];
        const alignedRecounts = allRecounts.filter((r) => recountAlignsWithPeak(r, quarterIntervals));
        // Multiple recounts (extra confidence passes) are averaged per interval before
        // scoring — a single combined comparison rather than picking one arbitrarily.
        const recountQuarters = alignedRecounts.length
          ? quarterIntervals.map((_, qi) => alignedRecounts.reduce((s, r) => s + recountIntervalTotals(r)[qi], 0) / alignedRecounts.length)
          : quarterIntervals.map(() => null);
        const scoreResult = await data.qaqcPeakHourScore(quarterTotals, recountQuarters);
        scores.push(scoreResult.score);

        summaryRows.push(`
          <tr>
            <td>${escapeHtml(entry.locationLabel)}</td>
            <td>${escapeHtml(sheetName)}</td>
            <td>${escapeHtml(w.label)}</td>
            <td>${peak.label}</td>
            <td>${scoreResult.score != null ? `${scoreResult.score}/${quarterIntervals.length + 1}` : 'incomplete'}</td>
          </tr>
        `);

        const quarterRows = quarterIntervals.map((iv, qi) => `
          <tr>
            <td>${escapeHtml(iv.label)}</td>
            <td>${fmt(quarterTotals[qi])}</td>
            <td>${alignedRecounts.length ? fmt(Math.round(recountQuarters[qi])) : '—'}</td>
            <td>${scoreResult.perQuarterPass[qi] != null ? (scoreResult.perQuarterPass[qi] ? '✓ within band' : '✗ over band') : '—'}</td>
          </tr>
        `).join('');

        const skippedNote = allRecounts.length > alignedRecounts.length
          ? `<div class="stat-detail" style="margin-top:6px;color:var(--bad-text)">${allRecounts.length - alignedRecounts.length} recount(s) used a different time range/interval length than this peak and were excluded from scoring.</div>`
          : '';

        detailBlocks.push(`
          <div class="card" style="margin-bottom:10px">
            <h3>${escapeHtml(entry.locationLabel)} — ${escapeHtml(sheetName)} — ${escapeHtml(w.label)} (${peak.label})</h3>
            <table class="crosswalk-table">
              <thead><tr><th>${intervalMinutes}-min interval</th><th>Primary count</th><th>2nd-count recount${alignedRecounts.length > 1 ? ` (avg of ${alignedRecounts.length})` : ''}</th><th>Band</th></tr></thead>
              <tbody>${quarterRows}</tbody>
            </table>
            <div class="stat-detail" style="margin-top:6px">Hour score: ${scoreResult.score != null ? `${scoreResult.score}/${quarterIntervals.length + 1}` : `incomplete — add a recount covering all ${quarterIntervals.length} interval${quarterIntervals.length === 1 ? '' : 's'} on the QA/QC screen`}</div>
            ${skippedNote}
          </div>
        `);
      }
      const threePeak = await data.threePeakHourRating(scores);
      summaryRows.push(`
        <tr style="font-weight:600">
          <td>${escapeHtml(entry.locationLabel)}</td>
          <td>${escapeHtml(sheetName)}</td>
          <td colspan="2">Three Peak Hour QC Rating</td>
          <td>${threePeak.total != null ? `${threePeak.total}/15 — ` : ''}${ratingBadge(threePeak.rating)}</td>
        </tr>
      `);
    }
  }

  return `
    <div class="card" style="margin-bottom:14px">
      <h3>QA/QC summary</h3>
      <div class="stat-detail" style="margin-bottom:10px">Second-counter recounts — entered on the dedicated QA/QC screen, by the same classifications as the original count — compared per interval against the primary count. Bands are volume-dependent (≥75 trips → ≤5% diff, 50–75 → ≤7.5%, &lt;50 → ≤10%), traced from the source workbook's own QC-rating legend.</div>
      <table class="crosswalk-table">
        <thead><tr><th>Location</th><th>Day</th><th>Period</th><th>Hour</th><th>Score / rating</th></tr></thead>
        <tbody>${summaryRows.join('') || '<tr><td colspan="5" style="color:var(--text3)">No peak periods found yet.</td></tr>'}</tbody>
      </table>
    </div>
    ${detailBlocks.join('')}
  `;
}

// Sums peak hour inbound + outbound volumes across all entries for every peak window.
// Returns { [dayType__peakLabel]: { dayType, label, inbound, outbound } }.
export async function computePeakVolumes(entries, peakWindows) {
  const volumes = {};
  for (const entry of entries) {
    for (const day of entry.days) {
      const { parsed, dayType } = day;
      const intervalMinutes = inferIntervalMinutes(parsed.intervals);
      for (const w of peakWindows[dayType] || []) {
        const peak = await resolvePeak(parsed, intervalMinutes, w);
        if (peak.startIdx < 0) continue;
        const key = `${dayType}__${w.label}`;
        if (!volumes[key]) volumes[key] = { dayType, label: w.label, inbound: 0, outbound: 0 };
        volumes[key].inbound += peak.inbound;
        volumes[key].outbound += peak.outbound;
      }
    }
  }
  return volumes;
}

// ── Fixed-window report across all locations ─────────────────────────────────────────────
// Trip Gen's counterpart to main.js's fixedWindowForIntersection()/fixedWindowSectionHtml()/
// wireFixedWindowInputs() (the area-study Aggregate view's fixed-window picker) — pick one
// clock-time window and see every LOCATION's classification volume for exactly that window,
// not each location's own detected peak. Adapted to Trip Gen's entries/days/classifications
// shape instead of areaIntersections/vPairs. Matches classes BY LABEL, not array position
// (BUG-019/BUG-020 discipline — a different day-sheet can carry a different classification
// set/order), and shows an explicit "no data" state when a location's counted day(s) don't
// cover the requested window, rather than a silent zero.
function fixedWindowForEntry(entry, startMin, endMin) {
  for (const day of entry.days) {
    const { parsed } = day;
    if (!parsed.intervals.length) continue;
    const intervalMinutes = inferIntervalMinutes(parsed.intervals);
    const dayStartMin = toMin(parsed.intervals[0].start);
    const slots = parsed.intervals.length;
    const dayEndMin = dayStartMin + slots * intervalMinutes;
    if (!(dayStartMin <= startMin && dayEndMin >= endMin)) continue;
    const startIdx = Math.round((startMin - dayStartMin) / intervalMinutes);
    const windowSize = Math.max(1, Math.round((endMin - startMin) / intervalMinutes));
    if (startIdx < 0 || startIdx + windowSize > slots) continue;

    let total = 0;
    const byLabel = new Map();
    parsed.types.forEach((label, ci) => {
      let sum = 0;
      for (let k = 0; k < windowSize; k++) {
        const iv = parsed.intervals[startIdx + k];
        sum += (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0);
      }
      if (sum) byLabel.set(label, (byLabel.get(label) || 0) + sum);
      total += sum;
    });
    return { noData: false, dayLabel: day.sheetName, total, byLabel };
  }
  return { noData: true };
}

function fixedWindowTripgenTableHtml(entries, startMin, endMin) {
  const fmtN = (n) => n.toLocaleString();
  if (endMin <= startMin) {
    return '<div class="stat-detail" style="color:var(--bad-text)">End time must be after start time.</div>';
  }
  if (!entries.length) {
    return '<div class="stat-detail">No locations counted yet.</div>';
  }
  const rows = entries.map((entry) => {
    const r = fixedWindowForEntry(entry, startMin, endMin);
    const name = escapeHtml(entry.locationLabel || 'Location');
    if (r.noData) {
      return `<tr><td>${name}</td><td colspan="2" style="color:var(--text3)">No data for this window — no counted day covers ${minToTimeInput(startMin)}–${minToTimeInput(endMin)}.</td></tr>`;
    }
    const breakdown = [...r.byLabel.entries()].map(([label, v]) => `${escapeHtml(label)}: ${fmtN(v)}`).join(' · ');
    return `<tr><td>${name}</td><td style="color:var(--text3)">${escapeHtml(r.dayLabel)}</td><td style="text-align:right;font-weight:600">${fmtN(r.total)}<div style="font-weight:400;font-size:11px;color:var(--text3)">${breakdown}</div></td></tr>`;
  }).join('');
  return `
    <div style="overflow-x:auto">
      <table class="crosswalk-table">
        <thead><tr><th>Location</th><th>Day used</th><th style="text-align:right">Volume (in+out)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function fixedWindowTripgenSectionHtml(entries, startMin, endMin) {
  return `
    <div class="card" style="margin-bottom:14px">
      <h3>Fixed-window report</h3>
      <div class="stat-detail" style="margin-bottom:10px">Pick one clock-time window and see every location's volume for exactly that window — not each location's own detected peak hour. Useful for a common cross-site window rather than each site's independently detected peak.</div>
      <div class="card-grid no-print" style="margin-bottom:10px;grid-template-columns:repeat(2,minmax(120px,160px))">
        <div class="setup-field"><label>window start</label><input type="time" data-tg-fixedwin="start" value="${minToTimeInput(startMin)}"></div>
        <div class="setup-field"><label>window end</label><input type="time" data-tg-fixedwin="end" value="${minToTimeInput(endMin)}"></div>
      </div>
      <div data-tg-fixedwin-table>${fixedWindowTripgenTableHtml(entries, startMin, endMin)}</div>
    </div>`;
}

export async function renderTripGenSection(container, entries, ctx) {
  if (entries.length === 0) { container.innerHTML = ''; return; }
  const { siteInfo, categoryMap, dataView } = ctx;
  const allTypes = entries[0]?.days[0]?.parsed.types || [];
  // categoryMap may be missing entries for newly-seen classifications (e.g. a second
  // location file with slightly different columns) — fill defaults without clobbering
  // anything the user already customized.
  await Promise.all(allTypes.map(async (t) => { if (!(t in categoryMap)) categoryMap[t] = await data.categoryFor(t); }));

  const crossGroups = {};
  entries.forEach((entry) => {
    entry.days.forEach((day) => {
      const totalsArr = dayTotalsByType(day.parsed);
      const groups = groupTotals(day.parsed.types, totalsArr, categoryMap);
      const bucket = day.dayType;
      crossGroups[bucket] = crossGroups[bucket] || {};
      Object.entries(groups).forEach(([g, v]) => { crossGroups[bucket][g] = (crossGroups[bucket][g] || 0) + v; });
    });
  });
  const allGroupNames = [...new Set([...Object.values(crossGroups).flatMap((g) => Object.keys(g))])];

  const qaqcSectionHTML = await renderQaqcSection(entries, ctx);

  const fixedWinStartMin = ctx.fixedWindowStartMin ?? (8 * 60);
  const fixedWinEndMin = ctx.fixedWindowEndMin ?? (9 * 60);
  const fixedWindowHTML = fixedWindowTripgenSectionHtml(entries, fixedWinStartMin, fixedWinEndMin);

  const locationBlocks = await Promise.all(entries.map(async (entry) => {
    const dayBlocks = await Promise.all(entry.days.map((d, di) => renderDayBlock(entry, d, di, { ...ctx, entryId: entry.id })));
    const meta = entry.meta || {};
    return `
      <div class="card" style="margin-bottom:14px">
        <h3>${escapeHtml(entry.locationLabel)}</h3>
        ${(meta.siteName || meta.studyName || meta.gsf) ? `
          <div class="stat-detail">
            ${meta.studyName ? `Study: ${escapeHtml(String(meta.studyName))} &middot; ` : ''}
            ${meta.siteName ? `Site: ${escapeHtml(String(meta.siteName))} &middot; ` : ''}
            ${meta.gsf ? `GSF: ${fmt(meta.gsf)} sq ft` : ''}
          </div>
        ` : ''}
      </div>
      ${dayBlocks.join('')}
    `;
  }));

  container.innerHTML = `
    <div class="stat-detail" style="margin-bottom:14px">Combines every location counted so far into one set of totals, grouped by day type. Assign each classification to a category below if it isn't already grouped correctly, then scroll down for per-location, per-day breakdowns and the peak-hour trip generation figures.</div>
    ${renderSiteInfoForm(siteInfo)}
    ${renderCategoryMapForm(allTypes, categoryMap)}
    <div class="card" style="margin-bottom:14px">
      <h3>Totals by day type — all ${entries.length} location${entries.length > 1 ? 's' : ''} combined</h3>
      <table class="crosswalk-table">
        <thead><tr><th>Group</th>${Object.keys(crossGroups).map((b) => `<th>${escapeHtml(b)} total</th>`).join('')}</tr></thead>
        <tbody>
          ${allGroupNames.map((g) => `<tr><td>${escapeHtml(g)}</td>${Object.keys(crossGroups).map((b) => `<td>${fmt(crossGroups[b][g] || 0)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>

    ${fixedWindowHTML}

    <div class="section" style="margin-bottom:1.5rem">
      <div class="section-head"><h2>QA/QC</h2></div>
      ${qaqcSectionHTML}
    </div>

    ${locationBlocks.join('')}
  `;

  // 'change' (commits on blur/Enter), not 'input' — these all trigger a full re-render via
  // the on*Change callbacks, and re-rendering on every keystroke would rebuild the input
  // element out from under the cursor, losing focus after the first character typed.
  container.querySelectorAll('[data-site-field]').forEach((el) => {
    el.addEventListener('change', () => ctx.onSiteInfoChange(el.dataset.siteField, el.value));
  });
  container.querySelectorAll('[data-site-zola-upload]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => ctx.onSiteInfoChange('zolaScreenshotUrl', evt.target.result);
      reader.readAsDataURL(file);
    });
  });
  container.querySelectorAll('[data-site-zola-clear]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.onSiteInfoChange('zolaScreenshotUrl', ''));
  });
  container.querySelectorAll('[data-category-field]').forEach((el) => {
    el.addEventListener('change', () => ctx.onCategoryMapChange(el.dataset.categoryField, el.value));
  });
  container.querySelectorAll('[data-peak-search-field]').forEach((el) => {
    el.addEventListener('change', () => {
      const [dayType, idx, edge] = el.dataset.peakSearchField.split('__');
      ctx.onPeakWindowChange(dayType, Number(idx), edge, toMin(el.value));
    });
  });
  container.querySelectorAll('[data-peak-manual-toggle]').forEach((el) => {
    el.addEventListener('change', () => {
      const [dayType, idx] = el.dataset.peakManualToggle.split('__');
      ctx.onPeakManualToggle(dayType, Number(idx), el.checked);
    });
  });
  container.querySelectorAll('[data-peak-manual-field]').forEach((el) => {
    el.addEventListener('change', () => {
      const [dayType, idx] = el.dataset.peakManualField.split('__');
      ctx.onPeakWindowChange(dayType, Number(idx), 'manual', toMin(el.value));
    });
  });
  container.querySelectorAll('[data-qaqc-field]').forEach((el) => {
    el.addEventListener('change', () => ctx.onQaqcChange(el.dataset.qaqcField, el.value));
  });
  container.querySelectorAll('[data-view-field]').forEach((el) => {
    el.addEventListener('click', () => ctx.onDataViewChange(el.dataset.viewField));
  });

  // Fixed-window report inputs — 'change' (not 'input') so a partially-typed time doesn't
  // trigger a re-render mid-edit; re-render is a full renderTripGenSection() pass via the
  // ctx callback (same convention as the peak-window/site-info fields above), which recomputes
  // fixedWindowForEntry() for every location fresh, so a window change always re-sums
  // correctly rather than reusing stale per-location totals.
  container.querySelectorAll('[data-tg-fixedwin]').forEach((el) => {
    el.addEventListener('change', () => {
      const startEl = container.querySelector('[data-tg-fixedwin="start"]');
      const endEl = container.querySelector('[data-tg-fixedwin="end"]');
      ctx.onFixedWindowChange?.(toMin(startEl.value || minToTimeInput(fixedWinStartMin)), toMin(endEl.value || minToTimeInput(fixedWinEndMin)));
    });
  });

  // Post-hoc wiring for the two placeholder-div sections in each day block — both need a
  // live DOM container (renderTgClassStackedSection wires its own click handlers;
  // renderQASection just writes findings markup), so they're painted here after the full
  // innerHTML write above rather than inlined as strings, same pattern main.js uses for its
  // own renderVehicleClassStackedSection()/paintQA() post-render calls.
  for (const entry of entries) {
    entry.days.forEach((day, di) => {
      const dayKey = `${entry.id}__${di}`;
      const classChartEl = container.querySelector(`[data-tg-classchart="${dayKey}"]`);
      if (classChartEl) {
        renderTgClassStackedSection(classChartEl, { parsed: day.parsed, days: entry.days, dayType: day.dayType, peakWindows: ctx.peakWindows });
      }
      const qaEl = container.querySelector(`[data-tg-qa="${dayKey}"]`);
      if (qaEl) {
        renderQASection(qaEl, runVehicleQA(day.parsed));
      }
    });
  }
}
