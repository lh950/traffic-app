import { cfg, vPairs, tmcPairs, intersection, tmcData, vData, pedData, slotLabel } from './state.js';
import { classifyTurn } from './diagram.js';
import { legLabel } from './setup.js';

const TURN_NAMES = { L: 'Left', T: 'Thru', R: 'Right', U: 'U-turn' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function minToHHMM(m) {
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  const mn = ((m % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

function lbl(leg) { return legLabel(leg) || leg; }

function movLabel(appLeg, destLeg) {
  const cls = classifyTurn(appLeg, destLeg);
  return `${lbl(appLeg)} → ${TURN_NAMES[cls] || cls} (${lbl(destLeg)})`;
}

function tmcCountAt(appLeg, destLeg, slotIdx) {
  return (tmcData[appLeg] && tmcData[appLeg][destLeg] && tmcData[appLeg][destLeg][slotIdx]) || tmcPairs.map(() => 0);
}

function sumAtIndices(arr, indices) {
  if (!indices) return arr.reduce((s, v) => s + v, 0);
  return indices.reduce((s, i) => s + (arr[i] || 0), 0);
}

function slotTmcTotal(slotIdx, typeIndices) {
  let t = 0;
  intersection.approaches.forEach(a => a.destinations.forEach(d => { t += sumAtIndices(tmcCountAt(a.leg, d, slotIdx), typeIndices); }));
  return t;
}

// Rolling 1-hour peak within a search window (returns startIdx, endIdx, or -1 if no data)
function findPeak(searchStartMin, searchEndMin, typeIndices) {
  const sph = Math.max(1, Math.round(60 / cfg.intervalMin));
  let best = -1, bestVol = -1;
  for (let i = 0; i + sph <= cfg.slots; i++) {
    const slotMin = cfg.startMinutes + i * cfg.intervalMin;
    if (slotMin < searchStartMin || slotMin >= searchEndMin) continue;
    let vol = 0;
    for (let j = i; j < i + sph; j++) vol += slotTmcTotal(j, typeIndices);
    if (vol > bestVol) { bestVol = vol; best = i; }
  }
  return best === -1 ? null : { startIdx: best, endIdx: best + sph - 1, volume: bestVol };
}

// ── SVG intersection diagram with peak-hour volumes ──────────────────────────

const LEG_POS = {
  N: { x: 0, y: -1 }, NE: { x: 0.7, y: -0.7 }, E: { x: 1, y: 0 }, SE: { x: 0.7, y: 0.7 },
  S: { x: 0, y: 1 }, SW: { x: -0.7, y: 0.7 }, W: { x: -1, y: 0 }, NW: { x: -0.7, y: -0.7 },
};
const TURN_COLORS = { L: '#1d4ed8', T: '#15803d', R: '#b45309', U: '#dc2626' };

function buildReportSVG(peakRange) {
  const cx = 220, cy = 220, R = 155, roadW = 52;
  const legs = intersection.approaches.map(a => a.leg);

  const roads = legs.map(leg => {
    const p = LEG_POS[leg] || { x: 0, y: -1 };
    return `<line x1="${cx}" y1="${cy}" x2="${cx + p.x * R}" y2="${cy + p.y * R}" stroke="#c8c8c4" stroke-width="${roadW}" stroke-linecap="round"/>`;
  }).join('');

  // Per-movement peak volumes
  const movVols = {};
  if (peakRange) {
    intersection.approaches.forEach(a => a.destinations.forEach(d => {
      let tot = 0;
      for (let i = peakRange.startIdx; i <= peakRange.endIdx; i++) tmcCountAt(a.leg, d, i).forEach(v => { tot += v; });
      movVols[`${a.leg}→${d}`] = tot;
    }));
  }

  let arrows = '';
  intersection.approaches.forEach(app => {
    const from = LEG_POS[app.leg] || { x: 0, y: -1 };
    const sx = cx + from.x * (R * 0.38), sy = cy + from.y * (R * 0.38);
    const maxVol = Math.max(1, ...app.destinations.map(d => movVols[`${app.leg}→${d}`] || 0));
    app.destinations.forEach(d => {
      const to = LEG_POS[d] || { x: 0, y: -1 };
      const ex = cx + to.x * (R * 0.76), ey = cy + to.y * (R * 0.76);
      const vol = movVols[`${app.leg}→${d}`] || 0;
      const cls = classifyTurn(app.leg, d);
      const col = TURN_COLORS[cls] || '#555';
      const sw = peakRange ? (2 + (vol / maxVol) * 9).toFixed(1) : '2';
      const mx = ((sx + ex) / 2).toFixed(1), my = ((sy + ey) / 2 - 9).toFixed(1);
      arrows += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" marker-end="url(#arr)" opacity="0.82"/>`;
      if (peakRange && vol > 0) arrows += `<text x="${mx}" y="${my}" text-anchor="middle" font-size="10" font-weight="700" fill="${col}">${vol}</text>`;
    });
  });

  const legLabelsEl = legs.map(leg => {
    const p = LEG_POS[leg] || { x: 0, y: -1 };
    const x = (cx + p.x * (R + 26)).toFixed(1), y = (cy + p.y * (R + 26)).toFixed(1);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="#222">${lbl(leg)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 440 440" width="340" height="340">
    <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1.5L8 5L1 8.5" fill="none" stroke="context-stroke" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
    ${roads}
    <circle cx="${cx}" cy="${cy}" r="34" fill="#f0efea" stroke="#bbb" stroke-width="1"/>
    ${arrows}
    ${legLabelsEl}
  </svg>`;
}

// ── Full interval TMC table ───────────────────────────────────────────────────

function buildTmcTable(peakSlots, typeIndices) {
  const apps = intersection.approaches.filter(a => a.destinations.length);
  if (!apps.length) return '';

  // Build column definitions
  const cols = []; // { appLeg, destLeg, label }
  apps.forEach(a => {
    a.destinations.forEach(d => {
      cols.push({ appLeg: a.leg, destLeg: d, label: movLabel(a.leg, d) });
    });
    cols.push({ appLeg: a.leg, destLeg: null, label: `${lbl(a.leg)} total`, isTotal: true });
  });

  const thCells = cols.map(c => `<th class="${c.isTotal ? 'col-subtot' : ''}">${c.label}</th>`).join('');
  const rows = [];

  for (let i = 0; i < cfg.slots; i++) {
    const isPeak = peakSlots && peakSlots.has(i);
    const cells = [slotLabel(i)];
    apps.forEach(a => {
      let appTot = 0;
      a.destinations.forEach(d => {
        const tot = sumAtIndices(tmcCountAt(a.leg, d, i), typeIndices);
        appTot += tot;
        cells.push(tot || '');
      });
      cells.push(appTot || '');
    });
    rows.push(`<tr class="${isPeak ? 'peak-row' : ''}">${cells.map((v, ci) => ci === 0 ? `<td class="time-col">${v}</td>` : `<td class="num-col${cols[ci - 1]?.isTotal ? ' col-subtot' : ''}">${v}</td>`).join('')}</tr>`);
  }

  // Totals row
  const totCells = [slotLabel(0).replace(/–.*/, '') + ' total'];
  apps.forEach(a => {
    let appTot = 0;
    a.destinations.forEach(d => {
      const tot = Array.from({ length: cfg.slots }, (_, i) => sumAtIndices(tmcCountAt(a.leg, d, i), typeIndices)).reduce((a, b) => a + b, 0);
      appTot += tot;
      totCells.push(tot || '');
    });
    totCells.push(appTot || '');
  });

  return `
    <table class="tmc-table">
      <thead>
        <tr><th class="time-col">Time</th>${thCells}</tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot><tr>${totCells.map((v, ci) => ci === 0 ? `<td class="time-col">${v}</td>` : `<td class="num-col${cols[ci - 1]?.isTotal ? ' col-subtot' : ''}">${v}</td>`).join('')}</tr></tfoot>
    </table>`;
}

// ── Peak hour summary boxes ───────────────────────────────────────────────────

function buildPeakBox(label, peak, typeIndices) {
  if (!peak) return '';
  const timeRange = `${slotLabel(peak.startIdx).split('–')[0].trim()} – ${minToHHMM(cfg.startMinutes + (peak.endIdx + 1) * cfg.intervalMin)}`;
  const rows = [];
  intersection.approaches.filter(a => a.destinations.length).forEach(a => {
    let appTot = 0;
    a.destinations.forEach(d => {
      let tot = 0;
      for (let i = peak.startIdx; i <= peak.endIdx; i++) tot += sumAtIndices(tmcCountAt(a.leg, d, i), typeIndices);
      appTot += tot;
      if (tot > 0) rows.push(`<tr><td>${movLabel(a.leg, d)}</td><td class="num-col">${tot}</td></tr>`);
    });
    rows.push(`<tr class="subtot-row"><td>${lbl(a.leg)} approach total</td><td class="num-col">${appTot}</td></tr>`);
  });
  return `
    <div class="peak-box">
      <div class="peak-box-head">${label} Peak Hour &nbsp;·&nbsp; <span class="peak-time">${timeRange}</span> &nbsp;·&nbsp; <span class="peak-vol">${peak.volume.toLocaleString()} vehicles</span></div>
      <table class="peak-table"><tbody>${rows.join('')}</tbody></table>
    </div>`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function openPrintReport(projectInfo = {}) {
  const apps = intersection.approaches.filter(a => a.destinations.length);
  const hasTmc = apps.length > 0;

  // Separate bike and motor vehicle type indices
  const bikeIdx  = tmcPairs.map((p, i) => p.isBike  ? i : -1).filter(i => i >= 0);
  const motorIdx = tmcPairs.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
  const hasBikes = hasTmc && bikeIdx.length > 0 && motorIdx.length > 0;
  const peakTypeIdx = hasBikes ? motorIdx : undefined;

  // Find peaks (search windows in minutes from midnight) — always on motor vehicles when bikes present
  const amPeak  = hasTmc ? findPeak(7 * 60, 11 * 60,  peakTypeIdx) : null;
  const midPeak = hasTmc ? findPeak(11 * 60, 15 * 60, peakTypeIdx) : null;
  const pmPeak  = hasTmc ? findPeak(16 * 60, 19 * 60, peakTypeIdx) : null;
  const peakSlots = new Set([amPeak, midPeak, pmPeak].filter(Boolean).flatMap(p => Array.from({ length: p.endIdx - p.startIdx + 1 }, (_, i) => p.startIdx + i)));

  const diagramSvg = hasTmc ? buildReportSVG(amPeak || pmPeak) : '';
  const tmcTable  = hasTmc ? buildTmcTable(peakSlots, hasBikes ? motorIdx : undefined) : '';
  const bikeTmcTable = hasBikes ? buildTmcTable(null, bikeIdx) : '';

  const logoHtml = projectInfo.logoUrl
    ? `<img src="${projectInfo.logoUrl}" style="max-height:56px;max-width:180px;object-fit:contain">`
    : '';

  const infoLines = [
    projectInfo.projectName && `<strong>${projectInfo.projectName}</strong>`,
    projectInfo.projectNumber && `Project #${projectInfo.projectNumber}`,
    projectInfo.companyName,
    projectInfo.companyAddress,
  ].filter(Boolean).map(l => `<div>${l}</div>`).join('');

  const fmtDate = d => { if (!d) return ''; const [y,m,dy] = d.split('-'); return `${m}/${dy}/${y}`; };
  const countInfo = [
    projectInfo.date          && `Date: ${fmtDate(projectInfo.date)}`,
    projectInfo.weather       && `Weather: ${projectInfo.weather}`,
    projectInfo.counterName   && `Counter: ${projectInfo.counterName}`,
    projectInfo.qaCounterName && `QA: ${projectInfo.qaCounterName}`,
    projectInfo.studyPurpose  && `Notes: ${projectInfo.studyPurpose}`,
  ].filter(Boolean).map(l => `<div class="count-meta">${l}</div>`).join('');

  const legNames = intersection.approaches.map(a => lbl(a.leg)).join(' / ');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${projectInfo.projectName || 'Traffic Count Report'}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:18px 22px}
@media print{body{padding:0}@page{margin:14mm 12mm;size:letter landscape}}

/* ── Header ── */
.report-header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:12px;gap:16px}
.header-left{display:flex;align-items:center;gap:14px}
.header-info{font-size:10.5px;line-height:1.55}
.header-info strong{font-size:13px}
.header-right{text-align:right;font-size:10px;color:#555;line-height:1.6}
.report-title{font-size:16px;font-weight:700;letter-spacing:.02em;margin-bottom:2px}
.report-subtitle{font-size:10px;color:#555;margin-bottom:6px}
.count-meta{font-size:10px;color:#444}

/* ── Layout ── */
.report-body{display:flex;gap:20px;align-items:flex-start}
.diagram-col{flex-shrink:0}
.data-col{flex:1;min-width:0}

/* ── Peak boxes ── */
.peak-boxes{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.peak-box{border:1.5px solid #1d4ed8;border-radius:5px;overflow:hidden;min-width:200px;flex:1}
.peak-box-head{background:#1d4ed8;color:#fff;font-size:10px;font-weight:600;padding:4px 8px;white-space:nowrap}
.peak-time{font-weight:400;opacity:.9}
.peak-vol{font-weight:700}
.peak-table{width:100%;border-collapse:collapse;font-size:10px}
.peak-table td{padding:2px 6px;border-bottom:.5px solid #e0e0e0}
.peak-table .num-col{text-align:right;font-variant-numeric:tabular-nums;width:54px}
.subtot-row td{font-weight:600;background:#eef2ff;border-top:.5px solid #bcd}

/* ── Full TMC table ── */
.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:4px;margin-top:14px}
.tmc-table{border-collapse:collapse;width:100%;font-size:9.5px}
.tmc-table th,.tmc-table td{border:.5px solid #ccc;padding:2px 4px}
.tmc-table th{background:#f0efea;font-weight:600;text-align:center;font-size:9px;white-space:normal;max-width:80px;line-height:1.3}
.tmc-table .time-col{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600;color:#333;width:72px}
.tmc-table .num-col{text-align:right;font-variant-numeric:tabular-nums}
.tmc-table .col-subtot{background:#f8f8f5;font-weight:700}
.tmc-table tfoot td{font-weight:700;background:#f0efea}
.tmc-table .peak-row{background:#fefce8}
.tmc-table .peak-row .col-subtot{background:#fef9c3}

/* ── Footer ── */
.report-footer{margin-top:18px;border-top:.5px solid #ccc;padding-top:8px;display:flex;gap:40px;font-size:10px;color:#444}
.sig-line{border-top:1px solid #888;padding-top:2px;min-width:180px;margin-top:16px;font-size:9px;color:#666}
</style></head><body>

<div class="report-header">
  <div class="header-left">
    ${logoHtml ? `<div>${logoHtml}</div>` : ''}
    <div class="header-info">${infoLines}</div>
  </div>
  <div class="header-right">
    <div class="report-title">Turning Movement Count</div>
    <div class="report-subtitle">${legNames ? `Intersection: ${legNames}` : ''}</div>
    ${countInfo}
    <div class="count-meta">Count period: ${slotLabel(0)} – ${minToHHMM(cfg.startMinutes + cfg.slots * cfg.intervalMin)} &nbsp;·&nbsp; ${cfg.intervalMin}-min intervals</div>
  </div>
</div>

<div class="report-body">
  ${diagramSvg ? `<div class="diagram-col">${diagramSvg}</div>` : ''}
  <div class="data-col">
    <div class="peak-boxes">
      ${buildPeakBox('AM', amPeak, peakTypeIdx)}
      ${buildPeakBox('Midday', midPeak, peakTypeIdx)}
      ${buildPeakBox('PM', pmPeak, peakTypeIdx)}
    </div>
    ${hasTmc ? `<div class="section-label">${hasBikes ? 'Motor vehicles — full count' : 'Full count — all intervals'}</div>` + tmcTable : '<p style="color:#888">No turning movement data recorded.</p>'}
    ${hasBikes ? '<div class="section-label" style="margin-top:18px">Bicycles — full count</div>' + bikeTmcTable : ''}
  </div>
</div>

<div class="report-footer">
  <div>
    <div>Counter</div>
    <div class="sig-line">${projectInfo.counterName || ''}</div>
  </div>
  <div>
    <div>QA Reviewer</div>
    <div class="sig-line">${projectInfo.qaCounterName || ''}</div>
  </div>
  <div style="margin-left:auto;text-align:right;color:#aaa;font-size:9px;align-self:flex-end">
    Generated by Traffic App v1.6.2 &nbsp;·&nbsp; ${new Date().toLocaleDateString()}
  </div>
</div>

<script>window.onload=()=>window.print();<\/script>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=1100,height=750,scrollbars=yes');
  if (!win) alert('Allow popups to open the print report.');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
