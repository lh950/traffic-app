import * as data from './dataAdapter.js';
import { renderMultiSeriesBarChart } from './charts.js';

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
//   siteInfo: { location, landUseType, gsf, parking, units, studyDates, notes }
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

function renderSiteInfoForm(siteInfo) {
  const fields = [
    ['location', 'Location / address'],
    ['landUseType', 'Land use type'],
    ['gsf', 'Square footage (GSF)'],
    ['parking', 'Parking spaces'],
    ['units', 'Units / employees'],
    ['studyDates', 'Study date range'],
  ];
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
      <div class="setup-field" style="margin-top:10px">
        <label>Notes</label>
        <textarea data-site-field="notes" rows="2" style="width:100%;font-family:inherit;font-size:13px;padding:6px 10px;border:.5px solid var(--border2);border-radius:var(--r);background:var(--surface2);color:var(--text)">${escapeHtml(siteInfo.notes || '')}</textarea>
      </div>
    </div>
    <div class="card print-only" id="site-info-print" style="margin-bottom:14px">
      <h3>Site information</h3>
      <table class="crosswalk-table">
        <tbody>
          ${fields.filter(([key]) => siteInfo[key]).map(([key, label]) => `<tr><td>${label}</td><td>${escapeHtml(String(siteInfo[key]))}</td></tr>`).join('') || '<tr><td colspan="2" style="color:var(--text3)">No site information entered yet</td></tr>'}
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

async function renderDayBlock(entry, day, ctx) {
  const { parsed, sheetName, dayType } = day;
  const { categoryMap, peakWindows, qaqc, entryId, siteInfo, dataView } = ctx;
  const intervalMinutes = inferIntervalMinutes(parsed.intervals);

  const dayTotalsArr = dataView === 'balanced' ? await balancedDayTotalsByType(parsed) : dayTotalsByType(parsed);
  const rawDayTotalsArr = dayTotalsByType(parsed); // always needed for trip-rate denominators below
  const dayGroups = groupTotals(parsed.types, dayTotalsArr, categoryMap);
  const dayTotal = dayTotalsArr.reduce((s, v) => s + v, 0);

  const groupNames = [...new Set(Object.keys(dayGroups))];
  const detailRows = groupNames.map((g) => {
    const subRows = parsed.types
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => (categoryMap[t] || 'Other') === g)
      .map(({ t, i }) => `<tr><td style="padding-left:1.5em;color:var(--text2)">${escapeHtml(t)}</td><td>${fmt(dayTotalsArr[i])}</td></tr>`)
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

  return `
    <div class="section" style="margin-bottom:1.5rem">
      <h3 style="font-size:13px;color:var(--text2);margin-bottom:10px">${escapeHtml(sheetName)} (${dayType})</h3>
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

  const locationBlocks = await Promise.all(entries.map(async (entry) => {
    const dayBlocks = await Promise.all(entry.days.map((d) => renderDayBlock(entry, d, { ...ctx, entryId: entry.id })));
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
}
