// Shareable study page — a self-contained HTML file the user can email or host.
// Screen-optimised (not print-optimised), dark/light aware.

import { toHourlyVolumes, runWarrant1, runWarrant2, runWarrant3, runWarrant4 } from './warrant.js';

// ── Signal warrant summary (uses same defaults as the interactive warrant UI) ─

function computeShareableWarrants(tmcParsed, pedParsed, intervalMin) {
  const allLegs = (tmcParsed?.approaches || []).map(a => a.leg).filter(Boolean);
  if (!allLegs.length) return null;
  const majorLegs = new Set(
    allLegs.filter(l => l === 'N' || l === 'S').length >= 2
      ? allLegs.filter(l => l === 'N' || l === 'S')
      : allLegs.slice(0, 2)
  );
  const minorLegs = allLegs.filter(l => !majorLegs.has(l));
  const hasTmc = tmcParsed?.intervals?.some(iv =>
    Object.values(iv.counts).some(dests => Object.values(dests).some(arr => arr.some(v => v > 0))));
  let w1 = null, w2 = null, w3 = null;
  if (hasTmc && majorLegs.size > 0 && minorLegs.length > 0) {
    const hourly = toHourlyVolumes(tmcParsed, majorLegs, intervalMin);
    if (hourly.length > 0) {
      w1 = runWarrant1(hourly, 1, 1);
      w2 = runWarrant2(hourly, 'urban');
      w3 = runWarrant3(hourly, 'urban');
    }
  }
  const w4 = runWarrant4(pedParsed, intervalMin);
  const results = [
    { num: 1, title: 'Eight-Hour Vehicular Volume', result: w1 },
    { num: 2, title: 'Four-Hour Vehicular Volume',  result: w2 },
    { num: 3, title: 'Peak Hour',                   result: w3 },
    { num: 4, title: 'Pedestrian Volume',            result: w4 },
  ];
  const anyData = results.some(r => r.result !== null);
  return anyData ? results : null;
}

// ── TMC peak-hour computation ─────────────────────────────────────────────────

function computePeakHour(tmcParsed) {
  const ivs = tmcParsed?.intervals;
  if (!ivs?.length) return null;
  const n = ivs.length;
  const W = Math.min(4, n);
  const totals = ivs.map(iv => {
    let t = 0;
    for (const leg in iv.counts) for (const dest in iv.counts[leg]) t += (iv.counts[leg][dest] || []).reduce((a,b)=>a+b,0);
    return t;
  });
  let bestStart = 0, bestSum = -1;
  for (let i = 0; i <= n - W; i++) {
    const s = totals.slice(i, i + W).reduce((a,b)=>a+b,0);
    if (s > bestSum) { bestSum = s; bestStart = i; }
  }
  const dirs = ['N','E','S','W'];
  const ph = { NBL:0, NBT:0, NBR:0, SBL:0, SBT:0, SBR:0, EBL:0, EBT:0, EBR:0, WBL:0, WBT:0, WBR:0 };
  const turnType = (from, to) => {
    const fi = dirs.indexOf(from), ti = dirs.indexOf(to);
    if (fi<0||ti<0) return null;
    const d = ((ti-fi)+4)%4;
    return d===1?'R':d===2?'T':d===3?'L':null;
  };
  for (let i = bestStart; i < bestStart + W; i++) {
    const iv = ivs[i];
    for (const from in iv.counts) {
      for (const to in iv.counts[from]) {
        const type = turnType(from, to);
        if (!type) continue;
        const prefix = from==='N'?'NB':from==='S'?'SB':from==='E'?'EB':'WB';
        const key = `${prefix}${type}`;
        if (key in ph) ph[key] += (iv.counts[from][to]||[]).reduce((a,b)=>a+b,0);
      }
    }
  }
  return Object.values(ph).some(v=>v>0) ? ph : null;
}

// ── TMD SVG for self-contained pages (uses CSS vars defined in PAGE_CSS) ──────

function buildTmdSvgString(d) {
  const W = 520, H = 520, cx = 260, cy = 260;
  const BH = 52, ARM = 108, ARMW = 58, LO = 9;
  const NY = cy-BH, SY = cy+BH, EX = cx+BH, WX = cx-BH;
  const NT = NY-ARM, ST = SY+ARM, ET = EX+ARM, WT = WX-ARM;
  const nEnt=[cx+LO,NY], nExt=[cx-LO,NY];
  const sEnt=[cx-LO,SY], sExt=[cx+LO,SY];
  const eEnt=[EX,cy-LO],  eExt=[EX,cy+LO];
  const wEnt=[WX,cy+LO],  wExt=[WX,cy-LO];
  const maxV = Math.max(1,...Object.values(d).map(v=>v||0));
  function sw(v){ return Math.max(1.5,Math.min(11,1.5+((v||0)/maxV)*9.5)); }
  function bez(ax,ay,bx,by,pull=0.48){
    const c1x=+(ax+(cx-ax)*pull).toFixed(1), c1y=+(ay+(cy-ay)*pull).toFixed(1);
    const c2x=+(bx+(cx-bx)*pull).toFixed(1), c2y=+(by+(cy-by)*pull).toFixed(1);
    return {path:`M ${ax} ${ay} C ${c1x} ${c1y} ${c2x} ${c2y} ${bx} ${by}`,c1x,c1y,c2x,c2y};
  }
  function bezMid(ax,ay,c1x,c1y,c2x,c2y,bx,by){
    return [0.125*ax+0.375*c1x+0.375*c2x+0.125*bx, 0.125*ay+0.375*c1y+0.375*c2y+0.125*by];
  }
  function mov(ax,ay,bx,by,col,vol){
    if(!vol) return '';
    const {path,c1x,c1y,c2x,c2y}=bez(ax,ay,bx,by);
    const [mx,my]=bezMid(ax,ay,c1x,c1y,c2x,c2y,bx,by);
    return `<path d="${path}" fill="none" stroke="${col}" stroke-width="${sw(vol).toFixed(1)}" stroke-linecap="round" marker-end="url(#tmd-sa)" opacity="0.82"/>
<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="${col}" stroke="var(--bg2)" stroke-width="2.5" paint-order="stroke">${vol}</text>`;
  }
  const CL='var(--tmd-l)', CT='var(--tmd-t)', CR='var(--tmd-r)';
  const roads=[
    `<rect x="${cx-ARMW/2}" y="${NT}" width="${ARMW}" height="${NY-NT}" fill="var(--tmd-road)" stroke="var(--border)" stroke-width=".5"/>`,
    `<rect x="${cx-ARMW/2}" y="${SY}" width="${ARMW}" height="${ST-SY}" fill="var(--tmd-road)" stroke="var(--border)" stroke-width=".5"/>`,
    `<rect x="${EX}" y="${cy-ARMW/2}" width="${ET-EX}" height="${ARMW}" fill="var(--tmd-road)" stroke="var(--border)" stroke-width=".5"/>`,
    `<rect x="${WT}" y="${cy-ARMW/2}" width="${WX-WT}" height="${ARMW}" fill="var(--tmd-road)" stroke="var(--border)" stroke-width=".5"/>`,
  ].join('');
  const box=`<rect x="${WX}" y="${NY}" width="${BH*2}" height="${BH*2}" fill="var(--bg2)" stroke="var(--border)" stroke-width="1.5"/>`;
  const nbTotal=(d.NBL||0)+(d.NBT||0)+(d.NBR||0);
  const sbTotal=(d.SBL||0)+(d.SBT||0)+(d.SBR||0);
  const ebTotal=(d.EBL||0)+(d.EBT||0)+(d.EBR||0);
  const wbTotal=(d.WBL||0)+(d.WBT||0)+(d.WBR||0);
  const grandTotal=nbTotal+sbTotal+ebTotal+wbTotal;
  const moves=[
    mov(...nEnt,...eExt,CL,d.NBL||0),mov(...nEnt,...sExt,CT,d.NBT||0),mov(...nEnt,...wExt,CR,d.NBR||0),
    mov(...sEnt,...wExt,CL,d.SBL||0),mov(...sEnt,...nExt,CT,d.SBT||0),mov(...sEnt,...eExt,CR,d.SBR||0),
    mov(...eEnt,...sExt,CL,d.EBL||0),mov(...eEnt,...wExt,CT,d.EBT||0),mov(...eEnt,...nExt,CR,d.EBR||0),
    mov(...wEnt,...nExt,CL,d.WBL||0),mov(...wEnt,...eExt,CT,d.WBT||0),mov(...wEnt,...sExt,CR,d.WBR||0),
  ].join('');
  const totals=[
    `<text x="${cx}" y="${NT-14}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text2)">${nbTotal}</text>`,
    `<text x="${cx}" y="${ST+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text2)">${sbTotal}</text>`,
    `<text x="${ET+18}" y="${cy+4}" text-anchor="start" font-size="12" font-weight="700" fill="var(--text2)">${ebTotal}</text>`,
    `<text x="${WT-18}" y="${cy+4}" text-anchor="end" font-size="12" font-weight="700" fill="var(--text2)">${wbTotal}</text>`,
  ].join('');
  const dirLabels=[
    `<text x="${cx}" y="${NT-30}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text)" font-family="monospace">N</text>`,
    `<text x="${cx}" y="${ST+37}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text)" font-family="monospace">S</text>`,
    `<text x="${ET+36}" y="${cy+5}" text-anchor="start" font-size="14" font-weight="800" fill="var(--text)" font-family="monospace">E</text>`,
    `<text x="${WT-36}" y="${cy+5}" text-anchor="end" font-size="14" font-weight="800" fill="var(--text)" font-family="monospace">W</text>`,
  ].join('');
  const centerLabel=grandTotal>0?`<text x="${cx}" y="${cy-8}" text-anchor="middle" font-size="17" font-weight="800" fill="var(--tmd-t)">${grandTotal}</text><text x="${cx}" y="${cy+9}" text-anchor="middle" font-size="9" fill="var(--text3)">peak hr total</text>`:'';
  const defs=`<defs><marker id="tmd-sa" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L8 3 L0 6 Z" fill="context-stroke"/></marker></defs>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:460px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
  ${defs}${roads}${box}${moves}${totals}${dirLabels}${centerLabel}</svg>`;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function classifyTurn(from, to) {
  const dirs = ['N','E','S','W'];
  const fi = dirs.indexOf(from), ti = dirs.indexOf(to);
  if (fi < 0 || ti < 0) return 'U';
  const diff = ((ti - fi) + 4) % 4;
  return diff === 1 ? 'R' : diff === 2 ? 'T' : diff === 3 ? 'L' : 'U';
}

function sumTypeArr(arr, indices) {
  if (!indices) return arr.reduce((a, b) => a + b, 0);
  return indices.reduce((s, i) => s + (arr[i] || 0), 0);
}

function tmcApproachTotal(tmcParsed, leg, typeIndices) {
  return tmcParsed.intervals.reduce((s, iv) => {
    const dests = iv.counts[leg] || {};
    return s + Object.values(dests).reduce((s2, arr) => s2 + sumTypeArr(arr, typeIndices), 0);
  }, 0);
}

function vehSlotTotals(vehParsed) {
  return vehParsed.intervals.map(iv =>
    iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0)
  );
}

// ── Inline SVG bar chart (time vs volume) ────────────────────────────────────

function buildBarChartSVG(values, labels, color = '#6a8fc8') {
  const W = 600, H = 100, pL = 32, pR = 8, pT = 8, pB = 24;
  const iW = W - pL - pR, iH = H - pT - pB;
  const n = values.length;
  const maxV = Math.max(1, ...values);
  const bW = Math.max(2, iW / n - 1);

  const yLines = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const v = Math.round(maxV * t);
    const y = pT + iH - t * iH;
    return `<line x1="${pL}" x2="${W-pR}" y1="${y}" y2="${y}" stroke="#444" stroke-width=".5" stroke-dasharray="2,2"/>
      <text x="${pL-3}" y="${y+3}" text-anchor="end" font-size="8" fill="#888">${v}</text>`;
  }).join('');

  const bars = values.map((v, i) => {
    const h = (v / maxV) * iH;
    const x = pL + i * (iW / n);
    return `<rect x="${x.toFixed(1)}" y="${(pT+iH-h).toFixed(1)}" width="${bW.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" fill="${color}" fill-opacity=".85"><title>${labels[i]}: ${v}</title></rect>`;
  }).join('');

  const skip = Math.max(1, Math.ceil(n / 12));
  const xLabels = labels.map((lbl, i) => {
    if (i % skip !== 0) return '';
    const x = pL + i * (iW / n) + bW / 2;
    return `<text x="${x.toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="7.5" fill="#888">${lbl}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">${yLines}${bars}${xLabels}</svg>`;
}

// ── TMC turning movement table HTML ──────────────────────────────────────────

function buildTmcHtml(tmcParsed, typeIndices, legLabels) {
  const apps = tmcParsed.approaches.filter(a => a.destinations.length);
  if (!apps.length) return '';

  const allDests = [...new Set(apps.flatMap(a => a.destinations.map(d => d.leg)))].sort();
  const lbl = leg => legLabels[leg] || leg;

  const header = `<tr><th>Approach</th>${allDests.map(d => `<th>${lbl(d)}</th>`).join('')}<th>Total</th></tr>`;

  const rows = apps.map(a => {
    const cells = allDests.map(d => {
      const destDef = a.destinations.find(x => x.leg === d);
      if (!destDef) return '<td class="tmc-na">—</td>';
      const vol = tmcParsed.intervals.reduce((s, iv) => {
        const arr = iv.counts[a.leg]?.[d] || [];
        return s + sumTypeArr(arr, typeIndices);
      }, 0);
      return `<td>${vol.toLocaleString()}</td>`;
    }).join('');
    const total = tmcApproachTotal(tmcParsed, a.leg, typeIndices);
    return `<tr><td class="approach-cell">${lbl(a.leg)}</td>${cells}<td class="total-cell">${total.toLocaleString()}</td></tr>`;
  });

  const grandTotal = apps.reduce((s, a) => s + tmcApproachTotal(tmcParsed, a.leg, typeIndices), 0);
  const totalRow = `<tr class="grand-total"><td>Total</td>${allDests.map(() => '<td></td>').join('')}<td>${grandTotal.toLocaleString()}</td></tr>`;

  return `<table class="tmc-tbl">${header}${rows.join('')}${totalRow}</table>`;
}

// ── Vehicle / ped summary table ───────────────────────────────────────────────

function buildVehHtml(vehParsed) {
  const inTotal  = vehParsed.intervals.reduce((s, iv) => s + iv.inbound.reduce((a,b)=>a+b,0),  0);
  const outTotal = vehParsed.intervals.reduce((s, iv) => s + iv.outbound.reduce((a,b)=>a+b,0), 0);
  if (inTotal + outTotal === 0) return '';
  return `<table class="tmc-tbl">
    <tr><th>Direction</th><th>Total</th></tr>
    <tr><td>Inbound</td><td>${inTotal.toLocaleString()}</td></tr>
    <tr><td>Outbound</td><td>${outTotal.toLocaleString()}</td></tr>
    <tr class="grand-total"><td>Total</td><td>${(inTotal+outTotal).toLocaleString()}</td></tr>
  </table>`;
}

function buildPedHtml(pedParsed) {
  if (!pedParsed?.crosswalks?.length) return '';
  const totals = pedParsed.crosswalks.map((xw, xi) => ({
    name: xw.name,
    d0: pedParsed.intervals.reduce((s, iv) => s + (iv.counts[xi]?.[0]||0), 0),
    d1: pedParsed.intervals.reduce((s, iv) => s + (iv.counts[xi]?.[1]||0), 0),
  }));
  const grandTotal = totals.reduce((s, r) => s + r.d0 + r.d1, 0);
  if (!grandTotal) return '';
  const rows = totals.map(r =>
    `<tr><td>${r.name}</td><td>${r.d0.toLocaleString()}</td><td>${r.d1.toLocaleString()}</td><td>${(r.d0+r.d1).toLocaleString()}</td></tr>`
  ).join('');
  return `<table class="tmc-tbl">
    <tr><th>Crosswalk</th><th>${pedParsed.crosswalks[0]?.dir0||'Dir 1'}</th><th>${pedParsed.crosswalks[0]?.dir1||'Dir 2'}</th><th>Total</th></tr>
    ${rows}
    <tr class="grand-total"><td>Total</td><td></td><td></td><td>${grandTotal.toLocaleString()}</td></tr>
  </table>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8f8f8;--bg2:#fff;--text:#111;--text2:#444;--text3:#888;--border:#ddd;--accent:#2563eb;--accent-bg:#eff6ff;--tmd-l:#2563eb;--tmd-t:#7c3aed;--tmd-r:#059669;--tmd-road:#e8e8e8}
@media(prefers-color-scheme:dark){:root{--bg:#14141a;--bg2:#1e1e28;--text:#e8e8ee;--text2:#aaa;--text3:#666;--border:#2e2e3a;--accent:#6a8fc8;--accent-bg:#1e2a38;--tmd-l:#6a8fc8;--tmd-t:#a78bfa;--tmd-r:#34d399;--tmd-road:#252530}}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:var(--text);background:var(--bg);padding:0;min-height:100vh}
a{color:var(--accent)}

.page{max-width:900px;margin:0 auto;padding:32px 24px}

/* Header */
.report-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:2px solid var(--accent);padding-bottom:16px;margin-bottom:24px}
.report-hd-left h1{font-size:20px;font-weight:700;color:var(--text);margin-bottom:3px}
.report-hd-left .subtitle{font-size:12px;color:var(--text3)}
.report-hd-right{text-align:right;font-size:11.5px;color:var(--text2);line-height:1.7}

/* Metadata pills */
.meta-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
.meta-pill{background:var(--bg2);border:1px solid var(--border);border-radius:99px;padding:4px 12px;font-size:11px;color:var(--text2)}
.meta-pill strong{color:var(--text)}

/* Section */
.section{margin-bottom:28px}
.section-title{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text3);margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid var(--border)}

/* Tables */
.tmc-tbl{width:100%;border-collapse:collapse;font-size:12px}
.tmc-tbl th,.tmc-tbl td{border:1px solid var(--border);padding:5px 8px;text-align:right}
.tmc-tbl th{background:var(--bg2);font-weight:600;font-size:11px;text-align:center;color:var(--text2)}
.tmc-tbl .approach-cell{text-align:left;font-weight:600;color:var(--text)}
.tmc-tbl .total-cell{font-weight:600;color:var(--accent)}
.tmc-tbl .tmc-na{color:var(--text3);text-align:center}
.tmc-tbl .grand-total td{font-weight:700;background:var(--accent-bg);color:var(--text)}

/* Chart */
.chart-wrap{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:12px}

/* TMD legend */
.tmd-legend{display:flex;gap:16px;justify-content:center;margin-top:10px;font-size:11px;color:var(--text2)}
.tmd-sw{display:inline-block;width:24px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}

/* Warrant summary */
.warrant-grid{display:flex;flex-wrap:wrap;gap:10px}
.warrant-row{display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;min-width:220px;flex:1}
.warrant-badge{font-size:10px;font-weight:700;border-radius:4px;padding:2px 7px;white-space:nowrap}
.warrant-badge.pass{background:#dcfce7;color:#166534}
.warrant-badge.fail{background:#fee2e2;color:#991b1b}
.warrant-badge.na{background:var(--border);color:var(--text3)}
@media(prefers-color-scheme:dark){
  .warrant-badge.pass{background:#14532d;color:#86efac}
  .warrant-badge.fail{background:#7f1d1d;color:#fca5a5}
}
.warrant-num{font-size:11px;font-weight:700;color:var(--text3)}
.warrant-title{font-size:12px;color:var(--text);flex:1}

/* Footer */
.page-footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);display:flex;justify-content:space-between;align-items:center}
`;

// ── Main export ───────────────────────────────────────────────────────────────

export function exportShareablePage(projectInfo, intersection, vehParsed, pedParsed, tmcParsed, motorIdx, bikeIdx, hasBikes, intervalMin = 15) {
  const legLabels = intersection.legLabels || {};

  // Meta
  const fmtDate = d => { if (!d) return ''; const [y,m,dy] = d.split('-'); return `${m}/${dy}/${y}`; };
  const metaItems = [
    projectInfo.date          && { label: 'Date', value: fmtDate(projectInfo.date) },
    projectInfo.weather       && { label: 'Weather', value: projectInfo.weather },
    projectInfo.counterName   && { label: 'Counter', value: projectInfo.counterName },
    projectInfo.equipment     && { label: 'Equipment', value: projectInfo.equipment },
    projectInfo.companyName   && { label: 'Firm', value: projectInfo.companyName },
    projectInfo.studyPurpose  && { label: 'Purpose', value: projectInfo.studyPurpose },
  ].filter(Boolean);

  const metaHtml = metaItems.map(m =>
    `<span class="meta-pill"><strong>${m.label}:</strong> ${m.value}</span>`
  ).join('');

  const streetPair = [intersection.street1, intersection.street2].filter(Boolean).join(' & ');
  const title = projectInfo.projectName || streetPair || 'Traffic Count Report';
  const subtitle = [projectInfo.projectNumber && `Project #${projectInfo.projectNumber}`, streetPair].filter(Boolean).join(' · ');

  const rightInfo = [
    projectInfo.companyName,
    projectInfo.companyAddress,
  ].filter(Boolean).join('<br>');

  // Turning movement diagram
  const phData = computePeakHour(tmcParsed);
  const tmdSection = phData ? `
  <div class="section">
    <div class="section-title">Turning movement diagram — peak hour</div>
    ${buildTmdSvgString(phData)}
    <div class="tmd-legend">
      <span><span class="tmd-sw" style="background:var(--tmd-l)"></span>Left</span>
      <span><span class="tmd-sw" style="background:var(--tmd-t)"></span>Through</span>
      <span><span class="tmd-sw" style="background:var(--tmd-r)"></span>Right</span>
    </div>
  </div>` : '';

  // Vehicle bar chart
  const slotTotals = vehSlotTotals(vehParsed);
  const slotLabels = vehParsed.intervals.map(iv => iv.label?.split('–')[0]?.trim() || '');
  const hasVeh = slotTotals.some(v => v > 0);
  const vehSection = hasVeh ? `
  <div class="section">
    <div class="section-title">Vehicle volume profile</div>
    <div class="chart-wrap">${buildBarChartSVG(slotTotals, slotLabels, '#6a8fc8')}</div>
  </div>
  <div class="section">
    <div class="section-title">Vehicle count totals</div>
    ${buildVehHtml(vehParsed)}
  </div>` : '';

  // TMC section
  const hasTmc = tmcParsed.approaches.some(a => a.destinations.length);
  const motorSection = hasTmc ? `
  <div class="section">
    <div class="section-title">Turning movements${hasBikes ? ' — motor vehicles' : ''}</div>
    ${buildTmcHtml(hasBikes ? { ...tmcParsed, /* motor-filtered handled in caller */ } : tmcParsed, hasBikes ? motorIdx : undefined, legLabels)}
  </div>` : '';

  const bikeSection = hasBikes ? `
  <div class="section">
    <div class="section-title">Turning movements — bicycles</div>
    ${buildTmcHtml(tmcParsed, bikeIdx, legLabels)}
  </div>` : '';

  // Ped section
  const hasPed = pedParsed?.crosswalks?.length && pedParsed.intervals.some(iv => iv.counts.some(xw => xw[0]+xw[1] > 0));
  const pedSection = hasPed ? `
  <div class="section">
    <div class="section-title">Pedestrian counts</div>
    ${buildPedHtml(pedParsed)}
  </div>` : '';

  // Signal warrant summary
  const warrantResults = computeShareableWarrants(tmcParsed, pedParsed, intervalMin);
  const warrantsSection = warrantResults ? `
  <div class="section">
    <div class="section-title">Signal warrant screening (HCM defaults — urban, 1 lane each approach)</div>
    <div class="warrant-grid">
      ${warrantResults.map(w => {
        const r = w.result;
        const badge = r === null
          ? `<span class="warrant-badge na">No data</span>`
          : r.noData
            ? `<span class="warrant-badge na">No data</span>`
            : r.passed
              ? `<span class="warrant-badge pass">MEETS</span>`
              : `<span class="warrant-badge fail">Does not meet</span>`;
        return `<div class="warrant-row"><span class="warrant-num">${w.num}</span><span class="warrant-title">${w.title}</span>${badge}</div>`;
      }).join('')}
    </div>
    <p style="margin-top:8px;font-size:11px;color:var(--text3)">Screening only — does not substitute for a formal engineering study.</p>
  </div>` : '';

  const generatedOn = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="page">

  <header class="report-hd">
    <div class="report-hd-left">
      <h1>${title}</h1>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
    </div>
    ${rightInfo ? `<div class="report-hd-right">${rightInfo}</div>` : ''}
  </header>

  ${metaHtml ? `<div class="meta-row">${metaHtml}</div>` : ''}

  ${tmdSection}
  ${vehSection}
  ${motorSection}
  ${bikeSection}
  ${pedSection}
  ${warrantsSection}

  <footer class="page-footer">
    <span>Generated ${generatedOn}</span>
    <span>Traffic App v3</span>
  </footer>

</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = (title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'traffic-report') + '.html';
  a.click();
  URL.revokeObjectURL(url);
}
