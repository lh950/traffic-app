// Chart renderers for the printed Trip Gen report (inline SVG, no library). Print-first design:
// fixed print-safe colors (never theme variables — a dark OS theme must not change a printout),
// a different line style per series so they stay readable in black and white, light gridlines,
// direct value labels on the points that matter (the peak), and shaded peak periods so the
// reader sees WHERE the busy hours fall. Text sizes are in SVG units; each chart is drawn at the
// width it will print so 1 unit is about 1 css pixel.

const FONT = "font-family:'Segoe UI',system-ui,Arial,sans-serif";
export const SERIES_COLORS = ['#1f5fa8', '#d9741a', '#2e8b57', '#7a4fb5', '#b8352f', '#5b6770'];
export const SERIES_DASH = ['', '6 3', '2 3', '8 3 2 3', '', '6 3'];
const IN_COLOR = '#1f5fa8';
const OUT_COLOR = '#d9741a';
const INK = '#222';
const MUTED = '#666';
const GRID = '#d8d5ce';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function niceMax(v) {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return n * p;
}
function fmtTick(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

function svgOpen(width, height) {
  return `<svg class="pc-svg" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" style="${FONT};display:block" role="img">`;
}

// Hourly trips (in + out) as lines, one per survey day, with the peak periods shaded.
//   series: [{ label, values: number[24] }]   bands: [{ label, from, to }] in hours
export function hourlyProfileChart({ series, bands = [], width = 520, height = 210, yLabel = 'trips per hour' }) {
  const padL = 40, padR = 10, padT = 22, padB = 44;
  const iw = width - padL - padR, ih = height - padT - padB;
  const maxV = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const xe = (h) => padL + (h / 24) * iw;
  const xc = (h) => padL + ((h + 0.5) / 24) * iw;
  const y = (v) => padT + ih - (v / maxV) * ih;
  let out = svgOpen(width, height);
  bands.forEach((b) => {
    out += `<rect x="${xe(b.from).toFixed(1)}" y="${padT}" width="${(xe(b.to) - xe(b.from)).toFixed(1)}" height="${ih}" fill="#d8d5ce" fill-opacity="0.45"/>`;
    out += `<text x="${(xe(b.from) + 3).toFixed(1)}" y="${padT - 7}" font-size="8.5" fill="${MUTED}">${esc(b.label)}</text>`;
  });
  for (let i = 0; i <= 4; i++) {
    const v = (maxV * i) / 4;
    out += `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${width - padR}" y2="${y(v).toFixed(1)}" stroke="${i === 0 ? '#888' : GRID}" stroke-width="${i === 0 ? 1 : 0.6}"/>`;
    out += `<text x="${padL - 5}" y="${(y(v) + 3).toFixed(1)}" font-size="8.5" fill="${MUTED}" text-anchor="end">${fmtTick(v)}</text>`;
  }
  for (let h = 0; h <= 24; h += 3) {
    out += `<line x1="${xe(h).toFixed(1)}" y1="${padT + ih}" x2="${xe(h).toFixed(1)}" y2="${padT + ih + 3}" stroke="#888" stroke-width="0.8"/>`;
    out += `<text x="${xe(h).toFixed(1)}" y="${padT + ih + 13}" font-size="8.5" fill="${MUTED}" text-anchor="middle">${h === 24 ? '24:00' : hh(h)}</text>`;
  }
  out += `<text transform="translate(9 ${padT + ih / 2}) rotate(-90)" font-size="8.5" fill="${MUTED}" text-anchor="middle">${esc(yLabel)}</text>`;
  series.forEach((s, k) => {
    const color = SERIES_COLORS[k % SERIES_COLORS.length];
    const dash = SERIES_DASH[k % SERIES_DASH.length];
    const pts = s.values.map((v, h) => `${xc(h).toFixed(1)},${y(v).toFixed(1)}`);
    out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    const peak = s.values.indexOf(Math.max(...s.values));
    if (s.values[peak] > 0) {
      out += `<circle cx="${xc(peak).toFixed(1)}" cy="${y(s.values[peak]).toFixed(1)}" r="3.4" fill="${color}" stroke="#fff" stroke-width="1"/>`;
      out += `<text x="${xc(peak).toFixed(1)}" y="${(y(s.values[peak]) - 6).toFixed(1)}" font-size="9" font-weight="600" fill="${color}" text-anchor="middle">${s.values[peak]}</text>`;
    }
  });
  let lx = padL;
  const ly = height - 9;
  series.forEach((s, k) => {
    const color = SERIES_COLORS[k % SERIES_COLORS.length];
    const dash = SERIES_DASH[k % SERIES_DASH.length];
    out += `<line x1="${lx}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    out += `<text x="${lx + 20}" y="${ly}" font-size="8.5" fill="${INK}">${esc(s.label)}</text>`;
    lx += 20 + s.label.length * 5 + 16;
  });
  return `${out}</svg>`;
}

// Entering (up) vs exiting (down) by hour for one survey day — shows the arrive/leave pattern.
export function directionalChart({ inb, out, width = 250, height = 150 }) {
  const padL = 34, padR = 6, padT = 14, padB = 22;
  const iw = width - padL - padR, ih = height - padT - padB;
  const maxV = niceMax(Math.max(1, ...inb, ...out));
  const y0 = padT + ih / 2;
  const sy = ih / 2 / maxV;
  const bw = (iw / 24) * 0.72;
  const xe = (h) => padL + (h / 24) * iw;
  let s = svgOpen(width, height);
  [maxV, maxV / 2, 0, -maxV / 2, -maxV].forEach((v) => {
    const yy = y0 - v * sy;
    s += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${width - padR}" y2="${yy.toFixed(1)}" stroke="${v === 0 ? '#888' : GRID}" stroke-width="${v === 0 ? 1 : 0.6}"/>`;
    s += `<text x="${padL - 4}" y="${(yy + 3).toFixed(1)}" font-size="8" fill="${MUTED}" text-anchor="end">${fmtTick(Math.abs(v))}</text>`;
  });
  for (let h = 0; h < 24; h++) {
    const x = xe(h) + ((iw / 24) - bw) / 2;
    if (inb[h] > 0) s += `<rect x="${x.toFixed(1)}" y="${(y0 - inb[h] * sy).toFixed(1)}" width="${bw.toFixed(1)}" height="${(inb[h] * sy).toFixed(1)}" fill="${IN_COLOR}"/>`;
    if (out[h] > 0) s += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${(out[h] * sy).toFixed(1)}" fill="${OUT_COLOR}"/>`;
  }
  for (let h = 0; h <= 24; h += 6) s += `<text x="${xe(h).toFixed(1)}" y="${padT + ih + 12}" font-size="8" fill="${MUTED}" text-anchor="middle">${h === 24 ? '24' : hh(h).slice(0, 2)}</text>`;
  s += `<rect x="${padL + 2}" y="2" width="7" height="7" fill="${IN_COLOR}"/><text x="${padL + 12}" y="9" font-size="8" fill="${INK}">entering</text>`;
  s += `<rect x="${padL + 50}" y="2" width="7" height="7" fill="${OUT_COLOR}"/><text x="${padL + 60}" y="9" font-size="8" fill="${INK}">exiting</text>`;
  return `${s}</svg>`;
}

// Clustered bars: categories along the bottom, one bar per series (survey day) in each.
//   series: [{ label, values: number[] (one per category) }]
export function groupBarsChart({ categories, series, width = 720, height = 220, yLabel = 'trips (in + out)' }) {
  const padL = 46, padR = 10, padT = 18, padB = 52;
  const iw = width - padL - padR, ih = height - padT - padB;
  const maxV = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const y = (v) => padT + ih - (v / maxV) * ih;
  const slot = iw / Math.max(1, categories.length);
  const bw = Math.min(34, (slot * 0.78) / Math.max(1, series.length));
  let s = svgOpen(width, height);
  for (let i = 0; i <= 4; i++) {
    const v = (maxV * i) / 4;
    s += `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${width - padR}" y2="${y(v).toFixed(1)}" stroke="${i === 0 ? '#888' : GRID}" stroke-width="${i === 0 ? 1 : 0.6}"/>`;
    s += `<text x="${padL - 5}" y="${(y(v) + 3).toFixed(1)}" font-size="8.5" fill="${MUTED}" text-anchor="end">${fmtTick(v)}</text>`;
  }
  s += `<text transform="translate(10 ${padT + ih / 2}) rotate(-90)" font-size="8.5" fill="${MUTED}" text-anchor="middle">${esc(yLabel)}</text>`;
  categories.forEach((cat, ci) => {
    const cx = padL + slot * ci + slot / 2;
    const x0 = cx - (bw * series.length) / 2;
    series.forEach((sr, si) => {
      const v = sr.values[ci] || 0;
      const color = SERIES_COLORS[si % SERIES_COLORS.length];
      s += `<rect x="${(x0 + si * bw).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${Math.max(0, (v / maxV) * ih).toFixed(1)}" fill="${color}"/>`;
      if (v > 0) s += `<text x="${(x0 + si * bw + (bw - 1.5) / 2).toFixed(1)}" y="${(y(v) - 3).toFixed(1)}" font-size="8" fill="${INK}" text-anchor="middle">${Math.round(v).toLocaleString()}</text>`;
    });
    const words = String(cat).split(' ');
    const mid = Math.ceil(words.length / 2);
    const lines = String(cat).length > 14 && words.length > 1 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [String(cat)];
    lines.forEach((ln, li) => { s += `<text x="${cx.toFixed(1)}" y="${padT + ih + 13 + li * 10}" font-size="9" fill="${INK}" text-anchor="middle">${esc(ln)}</text>`; });
  });
  let lx = padL;
  series.forEach((sr, si) => {
    const color = SERIES_COLORS[si % SERIES_COLORS.length];
    s += `<rect x="${lx}" y="${height - 12}" width="9" height="9" fill="${color}"/><text x="${lx + 13}" y="${height - 4}" font-size="8.5" fill="${INK}">${esc(sr.label)}</text>`;
    lx += 13 + sr.label.length * 5 + 16;
  });
  return `${s}</svg>`;
}
