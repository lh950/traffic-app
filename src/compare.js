// Before / After comparison — loads a second .tcproject file and compares
// approach-level volumes against the current session.

// ── Parse reference project ───────────────────────────────────────────────────

// Extract motor-only approach totals from a serialised .tcproject object.
// Returns { approaches: [{ leg, dests: { dest: total } }], vIn, vOut, pedTotals, label, date }
export function parseProjectSnapshot(proj) {
  if (proj?.projectType !== 'intersection') return null;

  const periodIdx = proj.activePeriodIdx ?? 0;
  const period = proj.periods?.[periodIdx];
  if (!period) return null;

  const { cfg, tmcData, vData, pedData } = period;
  const tmcPairs = proj.tmcPairs || [];
  const motorIdx = tmcPairs
    .map((p, i) => (!p.isBike ? i : -1))
    .filter(i => i >= 0);

  const approaches = (proj.intersection?.approaches || []).map(a => {
    const dests = {};
    for (const dest of a.destinations) {
      let total = 0;
      const slotArr = tmcData?.[a.leg]?.[dest] || [];
      for (const slotCounts of slotArr) {
        for (const idx of motorIdx) {
          total += slotCounts?.[idx] || 0;
        }
      }
      dests[dest] = total;
    }
    return { leg: a.leg, dests };
  });

  // Vehicle totals
  const slots = cfg?.slots ?? Math.round((cfg?.durationMin ?? 1440) / (cfg?.intervalMin ?? 15));
  let vIn = 0, vOut = 0;
  for (let i = 0; i < slots; i++) {
    vIn  += (vData?.in  || []).reduce((s, arr) => s + (arr[i] || 0), 0);
    vOut += (vData?.out || []).reduce((s, arr) => s + (arr[i] || 0), 0);
  }

  // Ped totals per crosswalk
  const pedTotals = (pedData || []).map(xw =>
    xw.reduce((s, slotArr) => s + (slotArr?.[0] || 0) + (slotArr?.[1] || 0), 0)
  );

  const info = proj.projectInfo || {};
  const label = [info.location, info.intersection].filter(Boolean).join(' — ')
    || proj.fnames?.vehicle
    || 'Reference study';
  const date = info.date || proj.savedAt?.slice(0, 10) || '';

  return { approaches, vIn, vOut, pedTotals, label, date, legLabels: proj.intersection?.legLabels || {} };
}

// Parse the CURRENT session into the same shape.
// Accepts liveTmcParsed(), liveVehicleParsed(), livePedParsed(), motorIdx, legLabels.
export function parseCurrentSnapshot(tmcParsed, vehParsed, pedParsed, motorIdx, legLabels, label, date) {
  const approaches = (tmcParsed?.approaches || []).map(a => {
    const dests = {};
    for (const d of a.destinations) {
      let total = 0;
      for (const iv of tmcParsed.intervals) {
        const arr = iv.counts?.[a.leg]?.[d.leg] || [];
        for (const idx of motorIdx) total += arr[idx] || 0;
      }
      dests[d.leg] = total;
    }
    return { leg: a.leg, dests };
  });

  let vIn = 0, vOut = 0;
  for (const iv of vehParsed?.intervals || []) {
    vIn  += iv.inbound.reduce((a, b) => a + b, 0);
    vOut += iv.outbound.reduce((a, b) => a + b, 0);
  }

  const pedTotals = (pedParsed?.crosswalks || []).map((_, xi) =>
    (pedParsed?.intervals || []).reduce((s, iv) =>
      s + (iv.counts[xi]?.[0] || 0) + (iv.counts[xi]?.[1] || 0), 0)
  );

  return { approaches, vIn, vOut, pedTotals, label, date, legLabels: legLabels || {} };
}

// ── Render ────────────────────────────────────────────────────────────────────

function deltaCell(before, after) {
  if (before === 0 && after === 0) return '<td class="cmp-delta cmp-zero">—</td><td class="cmp-pct cmp-zero">—</td>';
  const d = after - before;
  const pct = before > 0 ? (d / before * 100) : null;
  const cls = d > 0 ? 'cmp-up' : d < 0 ? 'cmp-dn' : 'cmp-zero';
  const sign = d > 0 ? '+' : '';
  const pctStr = pct !== null ? `${sign}${pct.toFixed(0)}%` : '—';
  return `<td class="cmp-delta ${cls}">${sign}${d.toLocaleString()}</td><td class="cmp-pct ${cls}">${pctStr}</td>`;
}

function turnLabel(legLabels, fromLeg, toLeg) {
  const from = legLabels[fromLeg] || fromLeg;
  const to   = legLabels[toLeg]   || toLeg;
  return `${from} → ${to}`;
}

export function renderComparisonSection(container, before, after) {
  if (!before || !after) { container.innerHTML = ''; return; }

  // Collect all movements present in either snapshot
  const legSet = new Set([...before.approaches.map(a => a.leg), ...after.approaches.map(a => a.leg)]);
  const legs = [...legSet].sort();

  const rows = [];
  for (const leg of legs) {
    const bApp = before.approaches.find(a => a.leg === leg);
    const aApp = after.approaches.find(a => a.leg === leg);
    const destSet = new Set([...Object.keys(bApp?.dests || {}), ...Object.keys(aApp?.dests || {})]);
    let bLegTotal = 0, aLegTotal = 0;
    const moveRows = [];
    for (const dest of [...destSet].sort()) {
      const bVol = bApp?.dests[dest] ?? 0;
      const aVol = aApp?.dests[dest] ?? 0;
      bLegTotal += bVol;
      aLegTotal += aVol;
      moveRows.push(`<tr class="cmp-move">
        <td class="cmp-name">${turnLabel(after.legLabels || before.legLabels || {}, leg, dest)}</td>
        <td class="cmp-vol">${bVol.toLocaleString()}</td>
        <td class="cmp-vol">${aVol.toLocaleString()}</td>
        ${deltaCell(bVol, aVol)}
      </tr>`);
    }
    if (destSet.size > 0) {
      const legName = (after.legLabels[leg] || before.legLabels[leg] || leg) + ' approach';
      rows.push(`<tr class="cmp-leg-head">
        <td colspan="2" class="cmp-leg-name">${legName}</td>
        <td class="cmp-vol cmp-total">${bLegTotal.toLocaleString()}</td>
        <td class="cmp-vol cmp-total">${aLegTotal.toLocaleString()}</td>
        ${deltaCell(bLegTotal, aLegTotal)}
      </tr>`);
      rows.push(...moveRows);
    }
  }

  // Vehicle totals row
  const hasTmc  = rows.length > 0;
  const hasVeh  = before.vIn + before.vOut + after.vIn + after.vOut > 0;
  const hasPed  = (before.pedTotals || []).some(v => v > 0) || (after.pedTotals || []).some(v => v > 0);

  const vehSection = hasVeh ? `
  <div class="cmp-sub-head">Vehicle counts</div>
  <table class="cmp-table">
    <tr class="cmp-move">
      <td class="cmp-name">Inbound</td>
      <td class="cmp-vol">${before.vIn.toLocaleString()}</td>
      <td class="cmp-vol">${after.vIn.toLocaleString()}</td>
      ${deltaCell(before.vIn, after.vIn)}
    </tr>
    <tr class="cmp-move">
      <td class="cmp-name">Outbound</td>
      <td class="cmp-vol">${before.vOut.toLocaleString()}</td>
      <td class="cmp-vol">${after.vOut.toLocaleString()}</td>
      ${deltaCell(before.vOut, after.vOut)}
    </tr>
  </table>` : '';

  const pedRows = hasPed ? (before.pedTotals || after.pedTotals || []).map((_, i) => {
    const b = before.pedTotals?.[i] ?? 0;
    const a = after.pedTotals?.[i] ?? 0;
    return `<tr class="cmp-move">
      <td class="cmp-name">Crosswalk ${i + 1}</td>
      <td class="cmp-vol">${b.toLocaleString()}</td>
      <td class="cmp-vol">${a.toLocaleString()}</td>
      ${deltaCell(b, a)}
    </tr>`;
  }).join('') : '';

  const pedSection = hasPed ? `
  <div class="cmp-sub-head">Pedestrian counts</div>
  <table class="cmp-table">${pedRows}</table>` : '';

  const bLabel = before.date ? `${before.label} <span class="cmp-date">(${before.date})</span>` : before.label;
  const aLabel = after.date  ? `${after.label}  <span class="cmp-date">(${after.date})</span>`  : after.label;

  container.innerHTML = `
  <div class="cmp-header">
    <div class="cmp-col-labels">
      <span></span>
      <span class="cmp-col-b">Before<br><span class="cmp-study-name">${bLabel}</span></span>
      <span class="cmp-col-a">After<br><span class="cmp-study-name">${aLabel}</span></span>
      <span class="cmp-col-delta">Δ</span>
      <span class="cmp-col-pct">%</span>
    </div>
  </div>
  ${hasTmc ? `<div class="cmp-sub-head">Turning movements (motor)</div>
  <table class="cmp-table">${rows.join('')}</table>` : ''}
  ${vehSection}
  ${pedSection}
  ${!hasTmc && !hasVeh && !hasPed ? '<p class="cmp-empty">No count data found in either study.</p>' : ''}`;
}

// ── File load helper ──────────────────────────────────────────────────────────

export function pickComparisonFile(onLoaded) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.tcproject,.json';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const proj = JSON.parse(e.target.result);
        onLoaded(proj, file.name);
      } catch {
        alert('Could not read the selected file. Make sure it is a valid .tcproject file.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
