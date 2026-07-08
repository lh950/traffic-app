// Shared SVG chart generators — used by both the analysis screen and print reports.
// All functions return plain SVG markup strings.
// Use CSS classes (chart-label, chart-grid) so the app's CSS can theme them via custom properties.
// Print reports inject explicit fill/stroke values via the printChart* wrappers below.

export const CW_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];  // N E S W

function hhmm(m) {
  return `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}

// ── Volume profile: stacked bar chart over time ──────────────────────────────

export function buildVolumeProfileSVG(slotData, crosswalks, intervalMin, printMode = false) {
  const VW = 580, VH = 140;
  const ML = 36, MT = 16, MR = 10, MB = 22;
  const IW = VW - ML - MR, IH = VH - MT - MB;
  const n = slotData.length;
  if (n === 0) return '';

  const maxTotal = Math.max(...slotData.map(s => s.total), 1);
  const bw = IW / n;
  const gap = Math.min(1.5, bw * 0.1);
  const bwActual = Math.max(0.5, bw - gap);

  const labelFill   = printMode ? '#666' : 'var(--text3,#94a3b8)';
  const gridStroke  = printMode ? '#ddd' : 'var(--border,#e2e8f0)';
  const axisStroke  = printMode ? '#ccc' : 'var(--border2,#cbd5e1)';

  // Y grid
  let grid = '';
  [0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = (MT + IH - frac * IH).toFixed(1);
    const val = Math.round(frac * maxTotal);
    grid += `<line x1="${ML}" y1="${y}" x2="${ML + IW}" y2="${y}" stroke="${gridStroke}" stroke-width="0.5"/>`;
    grid += `<text x="${ML - 4}" y="${(parseFloat(y) + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${labelFill}">${val}</text>`;
  });

  // Bars (stacked, bottom → top = N → W)
  let bars = '';
  let peakX = -1, peakTotal = 0;
  for (let i = 0; i < n; i++) {
    const s = slotData[i];
    const x = ML + i * bw + gap / 2;
    let stackY = MT + IH;
    for (let xi = 0; xi < crosswalks.length; xi++) {
      const v = s.byCw[xi] || 0;
      if (!v) continue;
      const bh = (v / maxTotal) * IH;
      stackY -= bh;
      bars += `<rect x="${x.toFixed(1)}" y="${stackY.toFixed(1)}" width="${bwActual.toFixed(1)}" height="${bh.toFixed(1)}" fill="${CW_COLORS[xi % CW_COLORS.length]}"/>`;
    }
    if (s.total > peakTotal) { peakTotal = s.total; peakX = x + bwActual / 2; }
  }

  // Peak annotation
  const peakAnnot = peakX >= 0 ? `
    <line x1="${peakX.toFixed(1)}" y1="${MT}" x2="${peakX.toFixed(1)}" y2="${MT+IH}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3,2" opacity="0.75"/>
    <text x="${peakX.toFixed(1)}" y="${MT - 3}" text-anchor="middle" font-size="9" font-weight="600" fill="#f59e0b">▲ ${peakTotal}</text>` : '';

  // X labels — step to avoid overlap
  let xLabels = '';
  const step = n <= 8 ? 1 : n <= 16 ? 2 : n <= 32 ? 4 : Math.ceil(n / 8);
  const shownIdx = new Set();
  for (let i = 0; i < n; i += step) {
    const x = (ML + i * bw + bw / 2).toFixed(1);
    xLabels += `<text x="${x}" y="${VH - 5}" text-anchor="middle" font-size="9" fill="${labelFill}">${hhmm(slotData[i].time)}</text>`;
    shownIdx.add(i);
  }
  if (!shownIdx.has(n - 1)) {
    const x = (ML + (n - 1) * bw + bw / 2).toFixed(1);
    xLabels += `<text x="${x}" y="${VH - 5}" text-anchor="middle" font-size="9" fill="${labelFill}">${hhmm(slotData[n-1].time + intervalMin)}</text>`;
  }

  return `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
    ${grid}
    <line x1="${ML}" y1="${MT+IH}" x2="${ML+IW}" y2="${MT+IH}" stroke="${axisStroke}" stroke-width="1"/>
    ${bars}${peakAnnot}${xLabels}
  </svg>`;
}

// ── Crosswalk comparison: horizontal bars, dir A solid + dir B lighter ───────

export function buildCrosswalkBarSVG(xwTotals, printMode = false) {
  const VW = 220, VH = 96;
  const ML = 20, MT = 6, MR = 46, MB = 6;
  const IW = VW - ML - MR, IH = VH - MT - MB;
  const n = xwTotals.length;
  const rowH = IH / n;
  const barH = Math.min(rowH * 0.55, 14);
  const maxTotal = Math.max(...xwTotals.map(x => x.total), 1);
  const trackFill  = printMode ? '#f1f5f9' : 'var(--surface2,#f1f5f9)';
  const labelFill  = printMode ? '#475569' : 'var(--text2,#475569)';

  let bars = '';
  for (let i = 0; i < n; i++) {
    const xw = xwTotals[i];
    const y  = MT + i * rowH + (rowH - barH) / 2;
    const totalW = (xw.total / maxTotal) * IW;
    const d0W    = xw.total > 0 ? (xw.d0 / xw.total) * totalW : 0;
    const color  = CW_COLORS[i % CW_COLORS.length];

    bars += `
      <text x="${ML - 4}" y="${(y + barH / 2 + 3.5).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="${color}">${xw.assign}</text>
      <rect x="${ML}" y="${y.toFixed(1)}" width="${IW}" height="${barH.toFixed(1)}" fill="${trackFill}" rx="2"/>
      <rect x="${ML}" y="${y.toFixed(1)}" width="${totalW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" opacity="0.22" rx="2"/>
      <rect x="${ML}" y="${y.toFixed(1)}" width="${d0W.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" rx="2"/>
      <text x="${(ML + totalW + 5).toFixed(1)}" y="${(y + barH / 2 + 3.5).toFixed(1)}" font-size="10" fill="${labelFill}" font-weight="600">${xw.total}</text>`;
  }

  return `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
    ${bars}
  </svg>`;
}

// ── Direction balance per crosswalk: inline split bars ───────────────────────
// Returns an HTML string, not SVG, for use inside table rows.

export function dirSplitBar(d0, d1, color) {
  const total = d0 + d1;
  if (total === 0) return '<div class="dir-split-wrap"><div class="dir-split-empty"></div></div>';
  const pct0 = Math.round((d0 / total) * 100);
  return `<div class="dir-split-wrap" title="${pct0}% / ${100 - pct0}%">
    <div class="dir-split-a" style="width:${pct0}%;background:${color}"></div>
    <div class="dir-split-b" style="width:${100 - pct0}%;background:${color};opacity:.3"></div>
  </div>`;
}

// ── Chart legend HTML ─────────────────────────────────────────────────────────

export function buildChartLegend(crosswalks, printMode = false) {
  if (printMode) {
    return crosswalks.map((xw, i) =>
      `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#555;margin-right:12px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${CW_COLORS[i % CW_COLORS.length]}"></span>${xw.assign}
      </span>`
    ).join('');
  }
  return `<div class="ix-chart-legend">${crosswalks.map((xw, i) =>
    `<span class="ix-legend-item"><span class="ix-legend-swatch" style="background:${CW_COLORS[i % CW_COLORS.length]}"></span>${xw.assign}</span>`
  ).join('')}</div>`;
}
