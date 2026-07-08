/* global __APP_VERSION__ */
// Printable reports for pedestrian count data
// Generates standalone HTML in a popup window that auto-triggers window.print()

import { buildVolumeProfileSVG, buildCrosswalkBarSVG, buildChartLegend } from './chartUtils.js';

function toHHMM(m) {
  const h = Math.floor(m / 60) % 24, mn = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
}

function baseStyles() {
  return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:18px 22px}
@media print{body{padding:0}}

.rpt-header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2.5px solid #111;padding-bottom:10px;margin-bottom:14px;gap:16px}
.rpt-header-left{display:flex;align-items:center;gap:14px}
.rpt-info{font-size:10.5px;line-height:1.6}
.rpt-info strong{font-size:13px}
.rpt-header-right{text-align:right;font-size:10px;color:#444;line-height:1.65}
.rpt-title{font-size:15px;font-weight:700;letter-spacing:.01em;margin-bottom:2px}
.rpt-subtitle{font-size:11px;font-weight:600;color:#222;margin-bottom:1px}
.rpt-meta{font-size:9.5px;color:#555;margin-top:1px}

.section-head{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#666;margin:10px 0 4px}

table{border-collapse:collapse;width:100%;font-size:10.5px}
th{padding:5px 8px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:1px solid #bbb;white-space:nowrap;background:#f5f5f3}
th.r{text-align:right}
td{padding:5px 8px;vertical-align:middle;border-bottom:.5px solid #e4e4e4}
td.r{text-align:right;font-variant-numeric:tabular-nums}
td.bold{font-weight:700}
tr.foot-row td{border-top:1.5px solid #111;border-bottom:none;font-weight:700;background:#f0efea}

.rpt-footer{margin-top:20px;padding-top:8px;border-top:.5px solid #ccc;display:flex;gap:40px;font-size:10px;color:#444;align-items:flex-end}
.sig-block div:first-child{margin-bottom:12px}
.sig-line{border-top:1px solid #888;padding-top:2px;min-width:180px;font-size:9px;color:#666}
.generated{margin-left:auto;text-align:right;color:#bbb;font-size:9px}
`;
}

function openReportWindow(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=1100,height=820,scrollbars=yes');
  if (!win) alert('Allow popups to open the print report.');
  setTimeout(() => URL.revokeObjectURL(url), 90000);
}

// ── Area-wide study summary report ──────────────────────────────────────────

export function printSummaryReport(projectInfo, intersections, opts = {}) {
  const showPeriods = opts.showPeriods !== false;
  const showFooter  = opts.showFooter  !== false;
  const allPeriods = [];
  for (const ix of intersections) {
    for (const p of ix.snapshot?.periods || []) {
      if (!allPeriods.includes(p.name)) allPeriods.push(p.name);
    }
  }

  function pedTotalForPeriod(snap, pname) {
    const p = snap?.periods?.find(p => p.name === pname);
    if (!p) return null;
    let t = 0;
    for (const xw of p.pedData) for (const sl of xw) t += (sl[0]||0)+(sl[1]||0);
    return t;
  }
  function pedTotal(snap) {
    let t = 0;
    for (const p of snap?.periods||[]) for (const xw of p.pedData) for (const sl of xw) t += (sl[0]||0)+(sl[1]||0);
    return t;
  }

  const visiblePeriods = showPeriods ? allPeriods : [];

  const tableRows = intersections.map((ix, i) => {
    const snap = ix.snapshot;
    const tot = snap ? pedTotal(snap) : 0;
    const byPeriod = visiblePeriods.map(n => pedTotalForPeriod(snap, n));
    return `<tr style="${i % 2 === 0 ? '' : 'background:#fafafa'}">
      <td class="r" style="color:#999;width:24px">${i+1}</td>
      <td style="font-weight:500">${ix.name}</td>
      <td style="color:#555">${ix.counterName || '—'}</td>
      <td class="r bold">${tot > 0 ? tot.toLocaleString() : '—'}</td>
      ${byPeriod.map(v => `<td class="r">${v != null ? (v > 0 ? v.toLocaleString() : '—') : '<span style="color:#ddd">·</span>'}</td>`).join('')}
    </tr>`;
  }).join('');

  const totAll = intersections.reduce((a,ix) => a + (ix.snapshot ? pedTotal(ix.snapshot) : 0), 0);
  const periodTotals = visiblePeriods.map(n =>
    intersections.reduce((a, ix) => a + (pedTotalForPeriod(ix.snapshot, n)||0), 0));

  const logoHtml = projectInfo.logoUrl
    ? `<img src="${projectInfo.logoUrl}" style="max-height:54px;max-width:170px;object-fit:contain">` : '';
  const infoHtml = [
    projectInfo.projectName   && `<strong>${projectInfo.projectName}</strong>`,
    projectInfo.projectNumber && `Project #${projectInfo.projectNumber}`,
    projectInfo.companyName,
    projectInfo.companyAddress,
  ].filter(Boolean).map(l => `<div>${l}</div>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Summary — ${projectInfo.projectName || 'Area Study'}</title>
<style>
${baseStyles()}
@media print{@page{size:letter landscape;margin:12mm 14mm}}
</style></head><body>

<div class="rpt-header">
  <div class="rpt-header-left">
    ${logoHtml ? `<div>${logoHtml}</div>` : ''}
    <div class="rpt-info">${infoHtml}</div>
  </div>
  <div class="rpt-header-right">
    <div class="rpt-title">Pedestrian Count Summary</div>
    <div class="rpt-meta">${intersections.length} intersection${intersections.length!==1?'s':''} · Area-wide study</div>
    ${projectInfo.studyPurpose ? `<div class="rpt-meta">${projectInfo.studyPurpose}</div>` : ''}
    ${projectInfo.counterName ? `<div class="rpt-meta">Project manager: ${projectInfo.counterName}</div>` : ''}
  </div>
</div>

<table>
  <thead><tr>
    <th>#</th>
    <th>Intersection</th>
    <th>Counter</th>
    <th class="r">Total Peds</th>
    ${visiblePeriods.map(n => `<th class="r">${n}</th>`).join('')}
  </tr></thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr class="foot-row">
      <td></td><td colspan="2" style="font-weight:700">Study Total</td>
      <td class="r">${totAll.toLocaleString()}</td>
      ${periodTotals.map(t => `<td class="r">${t.toLocaleString()}</td>`).join('')}
    </tr>
  </tfoot>
</table>

${showFooter ? `<div class="rpt-footer">
  <div class="sig-block">
    <div>Prepared by</div>
    <div class="sig-line">${projectInfo.counterName || ''}</div>
  </div>
  <div class="sig-block">
    <div>QA Reviewer</div>
    <div class="sig-line"></div>
  </div>
  <div class="generated">Traffic App v${__APP_VERSION__} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</div>
</div>` : `<div style="text-align:right;font-size:9px;color:#ccc;margin-top:16px">Traffic App v${__APP_VERSION__} · ${new Date().toLocaleDateString()}</div>`}

<script>window.onload=()=>window.print();<\/script>
</body></html>`;

  openReportWindow(html);
}

// ── Single-intersection pedestrian count report ──────────────────────────────

export function printIntersectionReport(projectInfo, ixEntry, opts = {}) {
  const showXwTable  = opts.crosswalkTable !== false;
  const showDistTable = opts.distTable     !== false;
  const showCharts   = opts.charts         !== false;
  const showComp     = opts.periodComp     !== false;
  const snap = ixEntry?.snapshot;
  if (!snap?.periods?.length) return;

  const crosswalks = snap.intersection?.crosswalks || [
    { name: 'N crosswalk', dir0: 'EB', dir1: 'WB', assign: 'N' },
    { name: 'E crosswalk', dir0: 'NB', dir1: 'SB', assign: 'E' },
    { name: 'S crosswalk', dir0: 'EB', dir1: 'WB', assign: 'S' },
    { name: 'W crosswalk', dir0: 'NB', dir1: 'SB', assign: 'W' },
  ];

  const logoHtml = projectInfo.logoUrl
    ? `<img src="${projectInfo.logoUrl}" style="max-height:54px;max-width:170px;object-fit:contain">` : '';
  const infoHtml = [
    projectInfo.projectName   && `<strong>${projectInfo.projectName}</strong>`,
    projectInfo.projectNumber && `Project #${projectInfo.projectNumber}`,
    projectInfo.companyName,
    projectInfo.companyAddress,
  ].filter(Boolean).map(l => `<div>${l}</div>`).join('');

  // One section per period — each gets its own page when printed
  const periodHtml = snap.periods.map((period, pi) => {
    const cfg = period.cfg;
    const intervalMin = cfg.intervalMin || 15;
    const startMin = cfg.startMinutes;
    const pedData = period.pedData;
    const slots = pedData[0]?.length || 0;

    const xwTotals = crosswalks.map((xw, xi) => {
      let d0 = 0, d1 = 0;
      for (let s = 0; s < slots; s++) { d0 += pedData[xi]?.[s]?.[0]||0; d1 += pedData[xi]?.[s]?.[1]||0; }
      return { ...xw, d0, d1, total: d0+d1 };
    });
    const grandTotal = xwTotals.reduce((a,x) => a+x.total, 0);

    const slotData = Array.from({ length: slots }, (_, s) => {
      const byCw = crosswalks.map((_,xi) => (pedData[xi]?.[s]?.[0]||0)+(pedData[xi]?.[s]?.[1]||0));
      return { time: startMin + s*intervalMin, byCw, total: byCw.reduce((a,b)=>a+b,0) };
    });
    const maxSlot = Math.max(...slotData.map(s => s.total), 1);

    const peakSlot = slotData.reduce((b,s) => s.total > b.total ? s : b, slotData[0]||{time:startMin,total:0});
    let peakHrStart = startMin, peakHrTotal = 0;
    if (slots >= 4) {
      for (let s = 0; s <= slots-4; s++) {
        const t = slotData.slice(s,s+4).reduce((a,sl)=>a+sl.total,0);
        if (t > peakHrTotal) { peakHrTotal = t; peakHrStart = slotData[s].time; }
      }
    }

    const volumeSvg  = showCharts ? buildVolumeProfileSVG(slotData, crosswalks, intervalMin, true) : '';
    const legendHtml = showCharts ? buildChartLegend(crosswalks, true) : '';

    const phf = (slots >= 4 && peakSlot.total > 0)
      ? (peakHrTotal / (4 * peakSlot.total)).toFixed(2) : null;

    const xwRows = xwTotals.map(xw => {
      const pct = grandTotal > 0 ? Math.round(xw.total / grandTotal * 100) : 0;
      return '<tr>'
        + `<td style="font-weight:600;padding-left:4px;width:18px;color:#444">${xw.assign}</td>`
        + `<td>${xw.name.replace(/\s*\([NESW] crosswalk\)/,'')}</td>`
        + `<td class="r">${xw.d0.toLocaleString()}</td>`
        + `<td style="font-size:9px;color:#888;text-align:center;padding:2px 3px">${xw.dir0}</td>`
        + `<td class="r">${xw.d1.toLocaleString()}</td>`
        + `<td style="font-size:9px;color:#888;text-align:center;padding:2px 3px">${xw.dir1}</td>`
        + `<td class="r bold" style="border-left:.5px solid #ccc">${xw.total.toLocaleString()}</td>`
        + `<td class="r" style="color:#888;width:32px">${pct}%</td>`
        + '</tr>';
    }).join('');

    const BAR_MAX = 90;
    const timeRows = slotData.map(s => {
      const isPeak = s.time === peakSlot.time && s.total === peakSlot.total;
      const barW = Math.max(2, Math.round(s.total / maxSlot * BAR_MAX));
      const barColor = isPeak ? '#f59e0b' : '#3b82f6';
      const rowBg = isPeak ? 'background:#fefce8' : '';
      const tdColor = isPeak ? '#92400e' : '#555';
      const tdFW = isPeak ? '700' : '400';
      const cwCells = s.byCw.map(v => `<td class="r">${v > 0 ? v : ''}</td>`).join('');
      return `<tr style="${rowBg}">`
        + `<td style="font-variant-numeric:tabular-nums;white-space:nowrap;color:${tdColor};font-weight:${tdFW}">`
        + `${toHHMM(s.time)}–${toHHMM(s.time + intervalMin)}</td>`
        + cwCells
        + `<td class="r bold">${s.total}</td>`
        + `<td style="padding:3px 4px"><div style="height:7px;width:${barW}px;background:${barColor};border-radius:2px"></div></td>`
        + '</tr>';
    }).join('');

    // Pre-compute all conditional sections to avoid nested template literals
    const piHeaderHtml = pi > 0
      ? '<div class="rpt-header" style="border-bottom-width:1px">'
        + '<div class="rpt-header-left"><div class="rpt-info">' + infoHtml + '</div></div>'
        + '<div class="rpt-header-right">'
        + '<div class="rpt-title" style="font-size:13px">Pedestrian Count Report</div>'
        + `<div class="rpt-subtitle">${ixEntry.name}</div>`
        + '</div></div>'
      : '';

    const peakHrBlock = slots >= 4
      ? '<div style="margin-bottom:8px">'
        + '<div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.04em">Peak Hour</div>'
        + `<div style="font-weight:700;font-variant-numeric:tabular-nums;margin-top:1px">${toHHMM(peakHrStart)}–${toHHMM(peakHrStart + 60)}</div>`
        + `<div style="color:#555">${peakHrTotal.toLocaleString()} peds</div>`
        + '</div>'
      : '';

    const phfBlock = phf
      ? '<div style="margin-bottom:8px">'
        + '<div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.04em" title="Peak Hour Factor">PHF</div>'
        + `<div style="font-weight:700;font-variant-numeric:tabular-nums;margin-top:1px">${phf}</div>`
        + '</div>'
      : '';

    const d0Total = xwTotals.reduce((a,x) => a+x.d0, 0).toLocaleString();
    const d1Total = xwTotals.reduce((a,x) => a+x.d1, 0).toLocaleString();

    const xwSection = showXwTable
      ? '<div style="display:flex;gap:18px;align-items:flex-start;margin-bottom:14px">'
        + '<div style="flex:1;min-width:0">'
        + '<div class="section-head">Crosswalk volumes</div>'
        + '<table><thead><tr>'
        + '<th colspan="2">Crosswalk</th>'
        + '<th class="r" colspan="2">Dir A</th>'
        + '<th class="r" colspan="2">Dir B</th>'
        + '<th class="r" style="border-left:.5px solid #ccc">Total</th>'
        + '<th class="r">%</th>'
        + '</tr></thead>'
        + `<tbody>${xwRows}</tbody>`
        + '<tfoot><tr class="foot-row">'
        + '<td colspan="2">Total</td>'
        + `<td class="r">${d0Total}</td><td></td>`
        + `<td class="r">${d1Total}</td><td></td>`
        + `<td class="r" style="border-left:.5px solid #ccc">${grandTotal.toLocaleString()}</td>`
        + '<td></td></tr></tfoot></table></div>'
        + '<div style="min-width:145px;background:#f7f7f5;border:.5px solid #ddd;border-radius:4px;padding:10px 12px;font-size:10px;flex-shrink:0">'
        + '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:8px">Peak Statistics</div>'
        + '<div style="margin-bottom:8px">'
        + '<div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.04em">Peak 15-min</div>'
        + `<div style="font-weight:700;font-variant-numeric:tabular-nums;margin-top:1px">${toHHMM(peakSlot.time)}–${toHHMM(peakSlot.time + intervalMin)}</div>`
        + `<div style="color:#555">${peakSlot.total.toLocaleString()} peds</div>`
        + '</div>'
        + peakHrBlock + phfBlock
        + '<div style="border-top:.5px solid #ddd;padding-top:8px;margin-top:4px">'
        + '<div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.04em">Period Total</div>'
        + `<div style="font-weight:700;font-size:15px;font-variant-numeric:tabular-nums;margin-top:2px">${grandTotal.toLocaleString()}</div>`
        + '<div style="color:#888;font-size:9.5px">pedestrians</div>'
        + '</div></div></div>'
      : '';

    const chartsSection = showCharts
      ? '<div style="margin-bottom:14px">'
        + '<div class="section-head">Volume Profile · stacked by crosswalk · ▲ = peak 15-min</div>'
        + `<div style="overflow-x:auto">${volumeSvg}</div>`
        + `<div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap">${legendHtml}</div>`
        + '</div>'
      : '';

    const distCwHeaders = crosswalks.map(xw => `<th class="r">${xw.assign}</th>`).join('');
    const distCwTotals = xwTotals.map(x => `<td class="r">${x.total.toLocaleString()}</td>`).join('');
    const distSection = showDistTable
      ? '<div class="section-head">15-minute interval distribution</div>'
        + '<table><thead><tr>'
        + `<th>Interval</th>${distCwHeaders}<th class="r">Total</th><th></th>`
        + `</tr></thead><tbody>${timeRows}</tbody>`
        + `<tfoot><tr class="foot-row"><td>Total</td>${distCwTotals}`
        + `<td class="r">${grandTotal.toLocaleString()}</td><td></td></tr></tfoot></table>`
      : '';

    const counterName = ixEntry.counterName || '';
    const footerSection = pi === snap.periods.length - 1
      ? '<div class="rpt-footer" style="margin-top:24px">'
        + `<div class="sig-block"><div>Counter</div><div class="sig-line">${counterName}</div></div>`
        + '<div class="sig-block"><div>QA Reviewer</div><div class="sig-line"></div></div>'
        + `<div class="generated">Traffic App v${__APP_VERSION__}  ·  ${new Date().toLocaleDateString()}</div>`
        + '</div>'
      : '';

    const pgBreak = pi > 0 ? 'page-break-before:always;padding-top:18px' : '';

    return `<div style="${pgBreak}">${piHeaderHtml}`
      + `<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #ddd">`
      + `<div style="font-size:13px;font-weight:700">${period.name}</div>`
      + `<div style="font-size:10px;color:#666">${slots} intervals · ${intervalMin}-min · ${slots * intervalMin}-min total</div>`
      + `</div>${xwSection}${chartsSection}${distSection}${footerSection}</div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Pedestrian Count — ${ixEntry.name}</title>
<style>
${baseStyles()}
@media print{@page{size:letter portrait;margin:12mm 14mm}}
</style></head><body>

<div class="rpt-header">
  <div class="rpt-header-left">
    ${logoHtml ? `<div>${logoHtml}</div>` : ''}
    <div class="rpt-info">${infoHtml}</div>
  </div>
  <div class="rpt-header-right">
    <div class="rpt-title">Pedestrian Count Report</div>
    <div class="rpt-subtitle">${ixEntry.name}</div>
    ${ixEntry.counterName ? `<div class="rpt-meta">Counter: ${ixEntry.counterName}</div>` : ''}
    ${projectInfo.studyPurpose ? `<div class="rpt-meta">${projectInfo.studyPurpose}</div>` : ''}
    <div class="rpt-meta">${snap.periods.length} count period${snap.periods.length!==1?'s':''} · ${snap.periods.map(p=>p.name).join(', ')}</div>
  </div>
</div>

${periodHtml}

<script>window.onload=()=>window.print();<\/script>
</body></html>`;

  openReportWindow(html);
}
