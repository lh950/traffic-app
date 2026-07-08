// Hand-rolled SVG charts — no charting library, per project constraints.

export function renderBarChart({ labels, totals, peakIdx, width = 900, height = 220 }) {
  const padL = 36, padB = 28, padT = 10, padR = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...totals);
  const n = totals.length;
  const barGap = 2;
  const barW = Math.max(1, innerW / n - barGap);

  const gridLines = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + innerH - (i / steps) * innerH;
    const val = Math.round((i / steps) * max);
    gridLines.push(
      `<line class="chart-gridline" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />` +
      `<text class="chart-axis-label" x="${padL - 6}" y="${y + 3}" text-anchor="end">${val}</text>`
    );
  }

  const bars = totals.map((v, i) => {
    const x = padL + i * (barW + barGap);
    const h = (v / max) * innerH;
    const y = padT + innerH - h;
    const isPeak = i === peakIdx;
    return `<rect class="chart-bar${isPeak ? ' peak' : ''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" data-idx="${i}" data-label="${escapeAttr(labels[i])}" data-value="${v}"><title>${escapeAttr(labels[i])}: ${v}</title></rect>`;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0) return '';
    const x = padL + i * (barW + barGap) + barW / 2;
    return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeAttr(l.split(' ')[0])}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">
        ${gridLines.join('')}
        ${bars}
        ${xLabels}
      </svg>
    </div>
  `;
}

// Two side-by-side bars per interval (e.g. inbound vs outbound) instead of one combined
// total — for the vehicle directional split. `seriesA`/`seriesB` are parallel arrays to
// `labels`, same length.
export function renderGroupedBarChart({ labels, seriesA, seriesB, labelA = 'In', labelB = 'Out', width = 900, height = 220 }) {
  const padL = 36, padB = 28, padT = 10, padR = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...seriesA, ...seriesB);
  const n = labels.length;
  const groupGap = 3, barGap = 1;
  const groupW = Math.max(2, innerW / n - groupGap);
  const barW = Math.max(1, (groupW - barGap) / 2);

  const gridLines = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + innerH - (i / steps) * innerH;
    const val = Math.round((i / steps) * max);
    gridLines.push(
      `<line class="chart-gridline" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />` +
      `<text class="chart-axis-label" x="${padL - 6}" y="${y + 3}" text-anchor="end">${val}</text>`
    );
  }

  const bars = labels.map((label, i) => {
    const gx = padL + i * (groupW + groupGap);
    const a = seriesA[i] || 0, b = seriesB[i] || 0;
    const ha = (a / max) * innerH, hb = (b / max) * innerH;
    const ya = padT + innerH - ha, yb = padT + innerH - hb;
    return (
      `<rect class="chart-bar chart-bar-a" x="${gx.toFixed(2)}" y="${ya.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, ha).toFixed(2)}"><title>${escapeAttr(label)} ${labelA}: ${a}</title></rect>` +
      `<rect class="chart-bar chart-bar-b" x="${(gx + barW + barGap).toFixed(2)}" y="${yb.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, hb).toFixed(2)}"><title>${escapeAttr(label)} ${labelB}: ${b}</title></rect>`
    );
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0) return '';
    const x = padL + i * (groupW + groupGap) + groupW / 2;
    return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeAttr(l.split(' ')[0])}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">
        ${gridLines.join('')}
        ${bars}
        ${xLabels}
      </svg>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch" style="background:var(--chart-bar)"></span>${escapeAttr(labelA)}</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--chart-bar2)"></span>${escapeAttr(labelB)}</span>
    </div>
  `;
}

const SERIES_COLOR_VARS = ['--chart-bar', '--chart-bar2', '--chart-bar3', '--chart-bar4', '--chart-bar5', '--chart-bar6'];

// N grouped bars per interval — for breakdowns with an arbitrary number of categories (e.g.
// trip-gen classification groups), where renderGroupedBarChart's fixed 2-series shape would
// force collapsing every group past the first into one combined "A + B + C" series.
// `series` is [{label, values}], values parallel to `labels`. Colors cycle through the
// palette above if there are more series than swatches defined.
export function renderMultiSeriesBarChart({ labels, series, width = 900, height = 220 }) {
  const padL = 36, padB = 28, padT = 10, padR = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = labels.length;
  const k = series.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupGap = 3, barGap = 1;
  const groupW = Math.max(2, innerW / n - groupGap);
  const barW = Math.max(1, (groupW - barGap * (k - 1)) / k);

  const gridLines = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + innerH - (i / steps) * innerH;
    const val = Math.round((i / steps) * max);
    gridLines.push(
      `<line class="chart-gridline" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />` +
      `<text class="chart-axis-label" x="${padL - 6}" y="${y + 3}" text-anchor="end">${val}</text>`
    );
  }

  const bars = labels.map((label, i) => {
    const gx = padL + i * (groupW + groupGap);
    return series.map((s, si) => {
      const v = s.values[i] || 0;
      const h = (v / max) * innerH;
      const y = padT + innerH - h;
      const x = gx + si * (barW + barGap);
      const color = `var(${SERIES_COLOR_VARS[si % SERIES_COLOR_VARS.length]})`;
      return `<rect class="chart-bar" style="fill:${color}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"><title>${escapeAttr(label)} ${escapeAttr(s.label)}: ${v}</title></rect>`;
    }).join('');
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0) return '';
    const x = padL + i * (groupW + groupGap) + groupW / 2;
    return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeAttr(l.split(' ')[0])}</text>`;
  }).join('');

  const legend = series.map((s, si) => {
    const color = `var(${SERIES_COLOR_VARS[si % SERIES_COLOR_VARS.length]})`;
    return `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${escapeAttr(s.label)}</span>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">
        ${gridLines.join('')}
        ${bars}
        ${xLabels}
      </svg>
    </div>
    <div class="legend">${legend}</div>
  `;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
