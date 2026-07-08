import * as data from './dataAdapter.js';

// SVG turning-movement diagram annotated with volumes/percentages per approach.
// Simpler than the field-counter app's diagram — built for report clarity, not
// keystroke-driven counting: one approach highlighted at a time with a legend table.
//
// Real tmcSummary(tmcParsed) shape (src/data/analyze.js):
//   { approaches: [{ leg, approachTotal, destinations: [{ leg, turnClass, total, pctOfApproach }] }], grandTotal }
// turnClass is a single letter: 'L' | 'T' | 'R' | 'U'.

const LEG_POS = {
  N: { x: 0, y: -1 }, NE: { x: 0.7, y: -0.7 }, E: { x: 1, y: 0 }, SE: { x: 0.7, y: 0.7 },
  S: { x: 0, y: 1 }, SW: { x: -0.7, y: 0.7 }, W: { x: -1, y: 0 }, NW: { x: -0.7, y: -0.7 },
};

const TURN_NAMES = { L: 'left', T: 'thru', R: 'right', U: 'U-turn' };

function turnColor(turnClass) {
  if (turnClass === 'L') return 'var(--in-text)';
  if (turnClass === 'R') return 'var(--out-text)';
  if (turnClass === 'U') return 'var(--warn-text)';
  return 'var(--accent)';
}

function buildDiagramSVG(approaches, activeApproach, lbl) {
  const cx = 200, cy = 200, R = 150, roadW = 56;
  const legs = approaches.map((a) => a.leg);

  const roads = legs.map((leg) => {
    const pos = LEG_POS[leg] || { x: 0, y: -1 };
    const x2 = cx + pos.x * R, y2 = cy + pos.y * R;
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="var(--border2)" stroke-width="${roadW}" stroke-linecap="round" opacity="0.5"/>`;
  }).join('');

  const labels = legs.map((leg) => {
    const pos = LEG_POS[leg] || { x: 0, y: -1 };
    const x = cx + pos.x * (R + 24), y = cy + pos.y * (R + 24);
    const isActive = leg === activeApproach?.leg;
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${isActive ? 'var(--blue-text)' : 'var(--text2)'}">${lbl(leg)}</text>`;
  }).join('');

  let arrows = '';
  if (activeApproach) {
    const fromPos = LEG_POS[activeApproach.leg] || { x: 0, y: -1 };
    const startX = cx + fromPos.x * (R * 0.4), startY = cy + fromPos.y * (R * 0.4);
    const maxVal = Math.max(1, ...activeApproach.destinations.map((d) => d.total));
    activeApproach.destinations.forEach((d) => {
      const toPos = LEG_POS[d.leg] || { x: 0, y: -1 };
      const endX = cx + toPos.x * (R * 0.78), endY = cy + toPos.y * (R * 0.78);
      const strokeW = 2 + (d.total / maxVal) * 10;
      const color = turnColor(d.turnClass);
      const midX = (startX + endX) / 2, midY = (startY + endY) / 2;
      arrows += `
        <line x1="${startX.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}"
          stroke="${color}" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" marker-end="url(#arrowhead)" opacity="0.85"/>
        <text x="${midX.toFixed(1)}" y="${(midY - 8).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="${color}">${d.total} (${d.pctOfApproach.toFixed(0)}%)</text>
      `;
    });
  }

  return `
    <svg viewBox="0 0 400 400" width="100%" style="max-width:420px;display:block;margin:0 auto">
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M1 1.5L8 5L1 8.5" fill="none" stroke="context-stroke" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </marker>
      </defs>
      ${roads}
      <circle cx="${cx}" cy="${cy}" r="30" fill="var(--surface2)" stroke="var(--border)" />
      ${arrows}
      ${labels}
    </svg>
  `;
}

export async function renderTmcSection(container, parsed) {
  const summary = await data.tmcSummary(parsed); // { approaches: [...], grandTotal }
  const approaches = summary.approaches;
  let activeLeg = approaches[0]?.leg;
  const legLabels = parsed.legLabels || {};
  const lbl = (leg) => legLabels[leg] || leg;

  function paint() {
    const activeApproach = approaches.find((a) => a.leg === activeLeg) || null;

    const chips = approaches.map((a) =>
      `<button class="leg-chip${a.leg === activeLeg ? ' active' : ''}" data-leg="${a.leg}">${lbl(a.leg)}</button>`
    ).join('');

    const destRows = activeApproach
      ? activeApproach.destinations.map((d) => `
          <tr>
            <td>${lbl(activeApproach.leg)} → ${TURN_NAMES[d.turnClass] || d.turnClass} (${lbl(d.leg)})</td>
            <td><span class="tag" style="background:transparent;border:1px solid ${turnColor(d.turnClass)};color:${turnColor(d.turnClass)}">${TURN_NAMES[d.turnClass] || d.turnClass}</span></td>
            <td style="text-align:right">${d.total.toLocaleString()}</td>
            <td style="text-align:right">${d.pctOfApproach.toFixed(1)}%</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="color:var(--text3)">No data for this approach</td></tr>';

    const approachTotal = activeApproach ? activeApproach.approachTotal : 0;

    container.innerHTML = `
      <div class="tmc-layout">
        <div class="card tmc-diagram-card">
          ${buildDiagramSVG(approaches, activeApproach, lbl)}
        </div>
        <div>
          <div class="tmc-approach-select">${chips}</div>
          <div class="card">
            <h3>${activeLeg ? lbl(activeLeg) : ''} — movement breakdown</h3>
            <table class="los-table">
              <thead><tr><th>Movement</th><th>Class</th><th style="text-align:right">Volume</th><th style="text-align:right">% of approach</th></tr></thead>
              <tbody>${destRows}</tbody>
              <tfoot><tr><td colspan="2">Approach total</td><td style="text-align:right">${approachTotal.toLocaleString()}</td><td></td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('.leg-chip').forEach((btn) => {
      btn.addEventListener('click', () => { activeLeg = btn.dataset.leg; paint(); });
    });
  }

  paint();
  return summary;
}
