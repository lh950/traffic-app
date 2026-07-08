import * as data from './dataAdapter.js';

// LOS input/output table: one row per approach (TMC) or per direction (vehicle in/out).
// Capacity is always a user-supplied input — the data layer treats LOS as volume/capacity
// only (no signal timing/geometry), per DATA_CONTRACT.md.

export async function renderLosSection(container, rows) {
  // rows: [{ key, label, volume }]
  const capacities = {};

  function paint() {
    const trs = rows.map((r) => {
      const cap = capacities[r.key];
      return `
        <tr data-key="${r.key}">
          <td>${r.label}</td>
          <td style="text-align:right">${r.volume.toLocaleString()}</td>
          <td><input type="number" min="0" step="50" class="los-cap-input" data-key="${r.key}" placeholder="e.g. 1800" /></td>
          <td style="text-align:right" class="los-vc">–</td>
          <td class="los-result">–</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card">
        <h3>Level of service</h3>
        <table class="los-table">
          <thead>
            <tr>
              <th>Approach / movement</th>
              <th style="text-align:right">Volume</th>
              <th>Capacity (veh/hr)</th>
              <th style="text-align:right">v/c</th>
              <th>LOS</th>
            </tr>
          </thead>
          <tbody>${trs}</tbody>
        </table>
        <div class="los-note">
          LOS shown is a volume-to-capacity (v/c) ratio classification (HCM-style signalized-intersection
          thresholds: A ≤0.60, B ≤0.70, C ≤0.80, D ≤0.90, E ≤1.00, F &gt;1.00). Capacity is whatever you enter —
          it is not derived from the counts, and this method does not account for signal timing, lane
          geometry, or facility type. Treat as a planning-level estimate, not a substitute for a full HCM
          analysis.
        </div>
      </div>
    `;

    container.querySelectorAll('.los-cap-input').forEach((input) => {
      input.addEventListener('input', async (e) => {
        const key = e.target.dataset.key;
        const cap = Number(e.target.value);
        capacities[key] = cap;
        const row = rows.find((r) => r.key === key);
        const tr = container.querySelector(`tr[data-key="${key}"]`);
        if (!cap || cap <= 0) {
          tr.querySelector('.los-vc').textContent = '–';
          tr.querySelector('.los-result').innerHTML = '–';
          return;
        }
        const result = await data.levelOfService(row.volume, cap);
        tr.querySelector('.los-vc').textContent = result.vc != null ? result.vc.toFixed(2) : '–';
        tr.querySelector('.los-result').innerHTML = result.los
          ? `<span class="los-badge los-${result.los}">${result.los}</span>`
          : '–';
      });
    });
  }

  paint();
}
