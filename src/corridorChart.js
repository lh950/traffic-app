// Corridor chart — heat-map of vehicle volume across time for each intersection
// in a named corridor, rendered into the area study summary screen.

// Build a unified time grid covering all intersections.
// Returns { slots: [{ minuteOfDay, label }], slotMin: number }
function buildTimeGrid(rows, periodName) {
  let lo = Infinity, hi = -Infinity, intervalMin = 15;
  for (const { ix } of rows) {
    const period = ix.snapshot?.periods?.find(p => p.name === periodName)
      ?? ix.snapshot?.periods?.[0];
    if (!period) continue;
    const { startMinutes = 0, intervalMin: im = 15, durationMin = 1440 } = period.cfg || {};
    intervalMin = im;
    const end = startMinutes + durationMin;
    if (startMinutes < lo) lo = startMinutes;
    if (end > hi) hi = end;
  }
  if (lo === Infinity) return { slots: [], slotMin: 15 };
  const slots = [];
  for (let m = lo; m < hi; m += intervalMin) {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    const label = mm === 0
      ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`)
      : '';
    slots.push({ minuteOfDay: m, label });
  }
  return { slots, slotMin: intervalMin };
}

// Sum vehicle counts for a single intersection period at a given absolute minute offset.
function slotVolume(period, minuteOfDay) {
  const { startMinutes = 0, intervalMin = 15 } = period.cfg || {};
  const idx = Math.round((minuteOfDay - startMinutes) / intervalMin);
  if (idx < 0) return 0;
  const vData = period.vData;
  if (!vData?.in) return 0;
  let total = 0;
  for (const typeArr of vData.in)  total += typeArr?.[idx] ?? 0;
  for (const typeArr of vData.out) total += typeArr?.[idx] ?? 0;
  return total;
}

// Build volume matrix: rows[ix] × cols[slot]
function buildMatrix(rows, slots, periodName) {
  return rows.map(({ ix }) => {
    const period = ix.snapshot?.periods?.find(p => p.name === periodName)
      ?? ix.snapshot?.periods?.[0];
    if (!period) return slots.map(() => 0);
    return slots.map(s => slotVolume(period, s.minuteOfDay));
  });
}

// ── SVG renderer ─────────────────────────────────────────────────────────────

const CELL_W = 18;
const CELL_H = 28;
const LABEL_W = 160;
const AXIS_H  = 28;
const PAD     = 8;

export function renderCorridorChart(container, rows, periodName) {
  if (!rows.length) {
    container.innerHTML = '<p class="corr-empty">No intersections in this corridor.</p>';
    return;
  }

  const { slots, slotMin } = buildTimeGrid(rows, periodName);
  if (!slots.length) {
    container.innerHTML = '<p class="corr-empty">No count data found in the selected corridor.</p>';
    return;
  }

  const matrix = buildMatrix(rows, slots, periodName);
  const maxVol = Math.max(1, ...matrix.flat());

  const W = LABEL_W + slots.length * CELL_W + PAD * 2;
  const H = AXIS_H + rows.length * CELL_H + PAD;

  // Time axis labels — show every hour (4 slots at 15-min)
  const slotsPerHour = Math.round(60 / slotMin);
  let axisLabels = '';
  slots.forEach((s, ci) => {
    if (!s.label) return;
    const x = LABEL_W + ci * CELL_W + CELL_W / 2;
    axisLabels += `<text class="corr-axis" x="${x}" y="${AXIS_H - 6}">${s.label}</text>`;
  });

  // Grid lines at every hour
  let gridLines = '';
  slots.forEach((s, ci) => {
    if (!s.label) return;
    const x = LABEL_W + ci * CELL_W;
    gridLines += `<line class="corr-grid" x1="${x}" y1="${AXIS_H}" x2="${x}" y2="${H}"/>`;
  });

  // Heat cells
  let cells = '';
  matrix.forEach((rowVols, ri) => {
    const iy = AXIS_H + ri * CELL_H;
    rowVols.forEach((vol, ci) => {
      const ix2 = LABEL_W + ci * CELL_W;
      const intensity = vol / maxVol;
      // opacity from 0.04 (zero) to 1.0 (max)
      const op = vol > 0 ? (0.07 + intensity * 0.93).toFixed(3) : '0';
      const titleStr = `${rows[ri].ix.name} ${slots[ci].minuteOfDay % 60 === 0
        ? Math.floor(slots[ci].minuteOfDay/60)%24 + ':00'
        : slots[ci].minuteOfDay}: ${vol}`;
      cells += `<rect class="corr-cell" x="${ix2}" y="${iy}" width="${CELL_W}" height="${CELL_H}" fill-opacity="${op}"><title>${titleStr}</title></rect>`;
    });
  });

  // Row labels + total bar
  let rowLabels = '';
  matrix.forEach((rowVols, ri) => {
    const iy = AXIS_H + ri * CELL_H;
    const total = rowVols.reduce((a, b) => a + b, 0);
    const name = rows[ri].ix.name || `Intersection ${ri + 1}`;
    const truncName = name.length > 22 ? name.slice(0, 21) + '…' : name;
    rowLabels += `<text class="corr-row-label" x="${LABEL_W - 8}" y="${iy + CELL_H / 2 + 4}">${truncName}</text>`;
    rowLabels += `<text class="corr-row-total" x="${PAD}" y="${iy + CELL_H / 2 + 4}">${total > 0 ? total.toLocaleString() : '—'}</text>`;
    // Row separator
    if (ri > 0) {
      gridLines += `<line class="corr-grid" x1="${0}" y1="${iy}" x2="${W}" y2="${iy}"/>`;
    }
  });

  // Legend
  const legendStops = [0, 0.25, 0.5, 0.75, 1].map((t, i) => {
    const op = (0.07 + t * 0.93).toFixed(3);
    const lx = LABEL_W + i * 24;
    return `<rect x="${lx}" y="0" width="22" height="12" class="corr-cell" fill-opacity="${op}"/>`;
  }).join('');
  const legendSvg = `<svg class="corr-legend-svg" viewBox="0 0 ${LABEL_W + 5 * 24 + 60} 16" style="height:16px;width:${LABEL_W + 5*24 + 60}px">
    <text class="corr-axis" x="${LABEL_W - 4}" y="10" text-anchor="end">low</text>
    ${legendStops}
    <text class="corr-axis" x="${LABEL_W + 5*24 + 4}" y="10">high vol.</text>
  </svg>`;

  container.innerHTML = `
  <div class="corr-period-label">Period: <strong>${periodName}</strong></div>
  <div class="corr-scroll">
    <svg class="corr-svg" viewBox="0 0 ${W} ${H}" style="min-width:${W}px;height:${H}px">
      <defs><clipPath id="corr-clip"><rect x="${LABEL_W}" y="0" width="${W-LABEL_W}" height="${H}"/></clipPath></defs>
      ${gridLines}
      ${axisLabels}
      <g clip-path="url(#corr-clip)">${cells}</g>
      ${rowLabels}
    </svg>
  </div>
  <div class="corr-legend">${legendSvg}</div>`;
}
