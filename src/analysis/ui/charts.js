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

// Every series in a chart must look different from every other one. The palette has 6 hues; the
// 7th series onward keeps a hue but adds a hatch (diagonal, back-diagonal, cross, dots, horizontal),
// so 36 series stay distinguishable — in print and in black and white too. A series says which
// slot it takes with `styleIndex` (callers pass the classification's position in the full
// classification list, so a classification looks the same in every chart); without one the
// series' position in this chart is used.
const HATCH_NAMES = ['solid', 'diag', 'back', 'cross', 'dots', 'horiz'];
const LINE_DASH = ['', '2,3', '8,3,2,3', '1,4', '10,4', '3,2,1,2'];
const LINE_DASH_DIR = ['5,4', '4,2,1,2', '6,2,2,2,2,2', '2,2', '9,2,3,2', '1,1'];
let chartSeq = 0;

function look(s, si) {
  const derive = Number.isInteger(s.styleIndex) || !s.colorVar;
  const idx = Number.isInteger(s.styleIndex) ? s.styleIndex : si;
  return {
    colorVar: derive ? SERIES_COLOR_VARS[idx % SERIES_COLOR_VARS.length] : s.colorVar,
    hatch: derive ? Math.floor(idx / SERIES_COLOR_VARS.length) % HATCH_NAMES.length : (Number.isInteger(s.hatch) ? s.hatch % HATCH_NAMES.length : 0),
  };
}

function patternId(uid, lk) { return `hp-${uid}-${lk.colorVar.slice(2)}-${lk.hatch}`; }

function patternDefs(looks, uid) {
  const seen = new Set();
  const ink = 'stroke="#fff" stroke-opacity=".85" stroke-width="1.4"';
  const art = {
    1: `<path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" ${ink}/>`,
    2: `<path d="M-1,5 l2,2 M0,0 l6,6 M5,-1 l2,2" ${ink}/>`,
    3: `<path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2 M-1,5 l2,2 M0,0 l6,6 M5,-1 l2,2" ${ink}/>`,
    4: '<circle cx="3" cy="3" r="1.3" fill="#fff" fill-opacity=".9"/>',
    5: `<path d="M0,3 h6" ${ink}/>`,
  };
  const defs = looks.filter((lk) => lk.hatch > 0).map((lk) => {
    const id = patternId(uid, lk);
    if (seen.has(id)) return '';
    seen.add(id);
    return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" style="fill:var(${lk.colorVar})"/>${art[lk.hatch]}</pattern>`;
  }).join('');
  return defs ? `<defs>${defs}</defs>` : '';
}

function fillOf(lk, uid) {
  return lk.hatch > 0 ? `url(#${patternId(uid, lk)})` : `var(${lk.colorVar})`;
}

// Legend swatch for a filled series — the same hatch as the bars, drawn with CSS gradients.
function swatchStyle(lk) {
  const stripe = (deg) => `repeating-linear-gradient(${deg}deg,transparent 0 2px,rgba(255,255,255,.85) 2px 3.5px)`;
  const img = [null, stripe(45), stripe(-45), `${stripe(45)},${stripe(-45)}`, 'radial-gradient(circle,rgba(255,255,255,.9) 1px,transparent 1.4px)', stripe(90)][lk.hatch];
  return `background-color:var(${lk.colorVar})${img ? `;background-image:${img}${lk.hatch === 4 ? ';background-size:4px 4px' : ''}` : ''}`;
}

function lineDash(lk, dashed) {
  return (dashed ? LINE_DASH_DIR : LINE_DASH)[lk.hatch];
}

// Legend swatch for a line series: a short stroke with the line's own color and dash.
function lineSwatch(lk, dashed, w = 2.5) {
  const da = lineDash(lk, dashed);
  return `<svg width="22" height="8" style="flex-shrink:0;margin-right:4px"><line x1="0" y1="4" x2="22" y2="4" style="stroke:var(${lk.colorVar});stroke-width:${w}${da ? `;stroke-dasharray:${da}` : ''}"/></svg>`;
}

function barLegend(series, looks) {
  return series.map((s, si) => `<span class="legend-item"><span class="legend-swatch" style="${swatchStyle(looks[si])}"></span>${escapeAttr(s.label)}</span>`).join('');
}

// N grouped bars per interval — for breakdowns with an arbitrary number of categories (e.g.
// trip-gen classification groups), where renderGroupedBarChart's fixed 2-series shape would
// force collapsing every group past the first into one combined "A + B + C" series.
// `series` is [{label, values, styleIndex?}], values parallel to `labels`.
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
  const uid = ++chartSeq;
  const looks = series.map(look);

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
      return `<rect class="chart-bar" style="fill:${fillOf(looks[si], uid)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"><title>${escapeAttr(label)} ${escapeAttr(s.label)}: ${v}</title></rect>`;
    }).join('');
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
        ${patternDefs(looks, uid)}
        ${gridLines.join('')}
        ${bars}
        ${xLabels}
      </svg>
    </div>
    <div class="legend">${barLegend(series, looks)}</div>
  `;
}

// Stacked bars — one bar per label, with `series` segments stacked vertically inside
// each bar (e.g. per-vehicle-class volume within a time interval / day / study period).
// `series` is [{label, values, styleIndex?}], values parallel to `labels`. A class keeps the
// same color and hatch whether it is shown grouped or stacked elsewhere in the app.
export function renderStackedBarChart({ labels, series, width = 900, height = 260 }) {
  const padL = 44, padB = 46, padT = 10, padR = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] || 0), 0));
  const max = Math.max(1, ...totals);
  const barGap = Math.max(2, innerW / n * 0.15);
  const barW = Math.max(1, innerW / n - barGap);
  const uid = ++chartSeq;
  const looks = series.map(look);

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
    const x = padL + i * (barW + barGap);
    let yCursor = padT + innerH;
    return series.map((s, si) => {
      const v = s.values[i] || 0;
      const h = (v / max) * innerH;
      const y = yCursor - h;
      yCursor = y;
      if (v <= 0) return '';
      return `<rect class="chart-bar chart-bar-stack" style="fill:${fillOf(looks[si], uid)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"><title>${escapeAttr(label)} — ${escapeAttr(s.label)}: ${v.toLocaleString()}</title></rect>`;
    }).join('');
  }).join('');

  const totalLabels = labels.map((label, i) => {
    if (totals[i] <= 0) return '';
    const x = padL + i * (barW + barGap) + barW / 2;
    const y = padT + innerH - (totals[i] / max) * innerH - 4;
    return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${Math.max(10, y).toFixed(2)}" text-anchor="middle">${totals[i].toLocaleString()}</text>`;
  }).join('');

  // X labels get more room than the other charts (rotated when there isn't room to sit
  // flat) since this chart's labels are often multi-word (period names, dates) rather
  // than short interval-start times.
  const labelEvery = Math.max(1, Math.ceil(n / 16));
  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0) return '';
    const x = padL + i * (barW + barGap) + barW / 2;
    const y = height - padB + 14;
    return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="end" transform="rotate(-40 ${x.toFixed(2)} ${y.toFixed(2)})">${escapeAttr(l)}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">
        ${patternDefs(looks, uid)}
        ${gridLines.join('')}
        ${bars}
        ${totalLabels}
        ${xLabels}
      </svg>
    </div>
    <div class="legend">${barLegend(series, looks)}</div>
  `;
}

// Multi-series line chart — e.g. in/out counts per interval, one line per (classification,
// direction) pair. `series` is [{label, values, styleIndex?, dashed}], values parallel to
// `labels`. `styleIndex` picks the classification's color and (past 6) its dash pattern, so it
// matches the bar charts on the same page. `dashed: true` marks the second direction (this app's
// existing convention for encoding a second dimension); it takes its own dash family so no
// in-line and out-line ever look alike.
export function renderLineChart({ labels, series, width = 900, height = 240 }) {
  const padL = 40, padB = 28, padT = 10, padR = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const xAt = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => padT + innerH - (v / max) * innerH;
  const looks = series.map(look);

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

  const lines = series.map((s, si) => {
    if (!s.values.length) return '';
    const lk = looks[si];
    const color = `var(${lk.colorVar})`;
    const da = lineDash(lk, s.dashed);
    const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
    const path = `<path class="chart-line" style="stroke:${color}${da ? `;stroke-dasharray:${da}` : ''}" d="${d}" fill="none" />`;
    // Small hit-circle per point for hover — same native-<title> convention the bar charts
    // above already use instead of a custom JS tooltip layer, kept deliberately small (r=2.5)
    // rather than the usual "marker" size since a 96-interval line can carry hundreds of
    // these; the line itself, not the markers, is what should read at a glance.
    const points = s.values.map((v, i) =>
      `<circle class="chart-line-pt" style="fill:${color}" cx="${xAt(i).toFixed(2)}" cy="${yAt(v).toFixed(2)}" r="2.5"><title>${escapeAttr(s.label)} — ${escapeAttr(labels[i])}: ${v.toLocaleString()}</title></circle>`
    ).join('');
    return path + points;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0) return '';
    return `<text class="chart-axis-label" x="${xAt(i).toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeAttr(l.split(' ')[0])}</text>`;
  }).join('');

  const legend = series.map((s, si) => `<span class="legend-item">${lineSwatch(looks[si], s.dashed, 2)}${escapeAttr(s.label)}</span>`).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">
        ${gridLines.join('')}
        ${lines}
        ${xLabels}
      </svg>
    </div>
    <div class="legend">${legend}</div>
  `;
}

// Stacked classification bars + one or more overlaid total lines, sharing one axis — the
// bars and lines are the SAME unit (vehicle-or-ped count), just two different cuts of the
// same data (a per-classification/group breakdown vs. a per-location or overall total), not
// two different measures, so a single shared axis is valid (never a second y-axis — see the
// "one axis" rule this app's chart functions already follow). `barSeries`/`lineSeries` are
// [{label, values, styleIndex?, colorVar?, dashed?}], values parallel to `labels`. Built for the
// site-wide/per-location classification charts — reuses the exact stacked-bar and line-draw
// logic already established in renderStackedBarChart/renderLineChart above rather than a
// third, divergent implementation.
export function renderComboChart({ labels, barSeries, lineSeries, width = 900, height = 280 }) {
  const padL = 44, padB = 30, padT = 14, padR = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = labels.length;
  const barTotals = labels.map((_, i) => barSeries.reduce((s, ser) => s + (ser.values[i] || 0), 0));
  const lineMax = Math.max(0, ...lineSeries.flatMap((s) => s.values));
  const max = Math.max(1, ...barTotals, lineMax);
  const barGap = Math.max(2, innerW / n * 0.2);
  const barW = Math.max(1, innerW / n - barGap);
  const xAt = (i) => padL + i * (barW + barGap) + barW / 2;
  const yAt = (v) => padT + innerH - (v / max) * innerH;
  const uid = ++chartSeq;
  const barLooks = barSeries.map(look);
  const lineLooks = lineSeries.map(look);

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
    const x = padL + i * (barW + barGap);
    let yCursor = padT + innerH;
    return barSeries.map((s, si) => {
      const v = s.values[i] || 0;
      const h = (v / max) * innerH;
      const y = yCursor - h;
      yCursor = y;
      if (v <= 0) return '';
      return `<rect class="chart-bar chart-bar-stack" style="fill:${fillOf(barLooks[si], uid)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"><title>${escapeAttr(label)} — ${escapeAttr(s.label)}: ${v.toLocaleString()}</title></rect>`;
    }).join('');
  }).join('');

  const lines = lineSeries.map((s, si) => {
    if (!s.values.length) return '';
    const lk = lineLooks[si];
    const color = `var(${lk.colorVar})`;
    const da = lineDash(lk, s.dashed);
    const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
    const path = `<path class="chart-line" style="stroke:${color}${da ? `;stroke-dasharray:${da}` : ''}" d="${d}" fill="none" />`;
    const points = s.values.map((v, i) =>
      `<circle class="chart-line-pt" style="fill:${color}" cx="${xAt(i).toFixed(2)}" cy="${yAt(v).toFixed(2)}" r="3"><title>${escapeAttr(s.label)} — ${escapeAttr(labels[i])}: ${v.toLocaleString()}</title></circle>`
    ).join('');
    return path + points;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(n / 10));
  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0) return '';
    return `<text class="chart-axis-label" x="${xAt(i).toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeAttr(l)}</text>`;
  }).join('');

  const lineLegend = lineSeries.map((s, si) => `<span class="legend-item">${lineSwatch(lineLooks[si], s.dashed)}${escapeAttr(s.label)}</span>`).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">
        ${patternDefs(barLooks, uid)}
        ${gridLines.join('')}
        ${bars}
        ${lines}
        ${xLabels}
      </svg>
    </div>
    <div class="legend">${barLegend(barSeries, barLooks)}${lineLegend}</div>
  `;
}

export { SERIES_COLOR_VARS };

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
