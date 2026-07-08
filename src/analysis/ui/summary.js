import * as data from './dataAdapter.js';
import { renderBarChart, renderGroupedBarChart } from './charts.js';

// Renders the summary dashboard for one kind (vehicle / ped / tmc) across all its loaded
// day-entries: `entries` is [{ id, dayLabel, parsed }, ...] (errored entries already
// filtered out by main.js). Each day gets its own peak-hour/peak-15/AM-PM/volume-chart
// block (computed from that day's own intervals — correct, since those metrics depend on
// a real time-of-day sequence), plus a day-to-day totals comparison chart up top.
// Vehicle days additionally get an in/out directional chart; ped days get a per-crosswalk
// breakdown table — the "location" dimension that exists in the real data (crosswalks for
// ped, approach legs for tmc, handled by tmcDiagram.js) rather than the driveway/parking-lot
// concept from the trip-gen reference workbook, which traffic-counter doesn't produce.

function inferIntervalMinutes(intervals) {
  if (intervals.length < 2) return 15;
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const a = intervals[0].start, b = intervals[1].start;
  if (!a || !b) return 15;
  return Math.max(1, toMin(b) - toMin(a));
}

function fmt(n) {
  return Number(n).toLocaleString();
}

function vehicleInOutSeries(intervals) {
  return {
    inSeries: intervals.map((iv) => iv.inbound.reduce((a, b) => a + b, 0)),
    outSeries: intervals.map((iv) => iv.outbound.reduce((a, b) => a + b, 0)),
  };
}

function crosswalkBreakdown(parsed) {
  const totals = parsed.crosswalks.map(() => [0, 0]);
  parsed.intervals.forEach((iv) => {
    iv.counts.forEach((pair, xi) => {
      totals[xi][0] += pair[0];
      totals[xi][1] += pair[1];
    });
  });
  return parsed.crosswalks.map((c, xi) => ({
    name: c.name, dir0: c.dir0, dir1: c.dir1,
    total0: totals[xi][0], total1: totals[xi][1],
  }));
}

export async function renderSummary(container, kind, entries) {
  const dayTotals = await Promise.all(entries.map(async (e) => {
    const v = await data.volumeByInterval(e.parsed.intervals, kind);
    return v.totals.reduce((s, x) => s + x, 0);
  }));
  const grandAll = dayTotals.reduce((s, v) => s + v, 0);

  const dayBlocks = await Promise.all(entries.map((e, i) => renderDayBlock(e, kind, dayTotals[i])));

  container.innerHTML = `
    ${entries.length > 1 ? `
      <div class="card" style="margin-bottom:14px">
        <h3>Totals by day</h3>
        ${renderBarChart({ labels: entries.map((e) => e.dayLabel), totals: dayTotals })}
        <div class="stat-detail" style="margin-top:8px">Combined total across ${entries.length} days: ${fmt(grandAll)}</div>
      </div>
    ` : ''}
    ${dayBlocks.join('')}
  `;
}

async function renderDayBlock(entry, kind, dayTotal) {
  const { parsed, dayLabel } = entry;
  const intervalMinutes = inferIntervalMinutes(parsed.intervals);
  const [peakH, peakQ, volChart, ampm] = await Promise.all([
    data.peakHour(parsed.intervals, intervalMinutes, kind),
    data.peakFifteen(parsed.intervals, kind),
    data.volumeByInterval(parsed.intervals, kind),
    data.amPmSplit(parsed.intervals, kind),
  ]);
  const amPmTotal = Math.max(1, ampm.am + ampm.pm);

  let chartHTML;
  if (kind === 'vehicle') {
    const { inSeries, outSeries } = vehicleInOutSeries(parsed.intervals);
    chartHTML = renderGroupedBarChart({ labels: volChart.labels, seriesA: inSeries, seriesB: outSeries, labelA: 'In', labelB: 'Out' });
  } else {
    chartHTML = renderBarChart({ labels: volChart.labels, totals: volChart.totals, peakIdx: peakQ.idx });
  }

  const crosswalkHTML = kind === 'ped' ? `
    <div class="card" style="margin-top:14px">
      <h3>By crosswalk</h3>
      <table class="crosswalk-table">
        <thead><tr><th>Crosswalk</th><th>${escapeHtml(parsed.crosswalks[0]?.dir0 || 'Dir 1')}</th><th>${escapeHtml(parsed.crosswalks[0]?.dir1 || 'Dir 2')}</th><th>Total</th></tr></thead>
        <tbody>
          ${crosswalkBreakdown(parsed).map((c) => `
            <tr><td>${escapeHtml(c.name)}</td><td>${fmt(c.total0)}</td><td>${fmt(c.total1)}</td><td>${fmt(c.total0 + c.total1)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <div class="section" style="margin-bottom:1.5rem">
      <h3 style="font-size:13px;color:var(--text2);margin-bottom:10px">${escapeHtml(dayLabel)}</h3>
      <div class="card-grid" style="margin-bottom:14px">
        <div class="stat-card accent">
          <div class="stat-label">Peak hour</div>
          <div class="stat-value">${fmt(peakH.volume)}</div>
          <div class="stat-detail">${peakH.label}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Peak 15-min interval</div>
          <div class="stat-value">${fmt(peakQ.volume)}</div>
          <div class="stat-detail">${peakQ.label}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">AM / PM split</div>
          <div class="stat-value">${Math.round((ampm.am / amPmTotal) * 100)}<span class="unit">% AM</span></div>
          <div class="stat-detail">AM ${fmt(ampm.am)} &middot; PM ${fmt(ampm.pm)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Day total</div>
          <div class="stat-value">${fmt(dayTotal)}</div>
          <div class="stat-detail">${parsed.intervals.length} intervals &middot; ${intervalMinutes}-min</div>
        </div>
      </div>
      <div class="card">
        <h3>Volume by interval${kind === 'vehicle' ? ' — in vs out' : ''}</h3>
        ${chartHTML}
      </div>
      ${crosswalkHTML}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
