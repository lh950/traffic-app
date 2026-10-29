// ITE comparison — the user types in what the ITE Trip Generation handbook gives for their land
// use (average rate, range, standard deviation, and the fitted equation if they want it), and the
// report shows how the counted All-vehicles trips compare. The app holds NO ITE data: the handbook
// is licensed, so every number here is typed by the user and saved in their project.
//
// Observed side: the All vehicles group (no pedestrians) from the report model — daily trips and the
// busiest hour inside each peak period. Expected side: the fitted equation at the site's size when
// one is entered, otherwise average rate x size. Both are trips per 1,000 SF of GSF.
//
// A caution the table prints: ITE peak hours are the peak hour of the ADJACENT STREET or of the
// GENERATOR; the counted peak here is the busiest hour inside this project's own peak periods.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ITE_PERIODS = [
  { key: 'wkDaily', label: 'Weekday, daily', day: 'weekday', which: 'daily' },
  { key: 'wkAM', label: 'Weekday, AM peak hour', day: 'weekday', which: 'AM' },
  { key: 'wkPM', label: 'Weekday, PM peak hour', day: 'weekday', which: 'PM' },
  { key: 'satDaily', label: 'Saturday, daily', day: 'Saturday', which: 'daily' },
  { key: 'satPeak', label: 'Saturday, peak hour', day: 'Saturday', which: 'best' },
  { key: 'sunDaily', label: 'Sunday, daily', day: 'Sunday', which: 'daily' },
  { key: 'sunPeak', label: 'Sunday, peak hour', day: 'Sunday', which: 'best' },
];
const FIELDS = ['avg', 'low', 'high', 'sd', 'eq', 'a', 'b'];
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };

export function emptyIte() { return { edition: '', rows: {} }; }
export function hasIteData(ite) {
  return !!ite && Object.values(ite.rows || {}).some((r) => num(r.avg) != null || (r.eq && r.eq !== 'none' && num(r.a) != null));
}

// Observed All-vehicles value for one period: { rate, trips, n } or null.
function observed(model, allIdx, p) {
  if (allIdx < 0) return null;
  const cells = model.cellsByGroup[allIdx];
  const picks = [];
  model.cols.forEach((c, i) => {
    const cell = cells[i];
    if (!cell) return;
    const isWeekday = c.kind === 'weekday';
    if (p.day === 'weekday' ? !isWeekday : !c.label.startsWith(p.day)) return;
    if (p.which === 'daily') { picks.push({ rate: cell.rate, trips: cell.total }); return; }
    const found = cell.peaks.filter((k) => k.found);
    let pk = null;
    if (p.which === 'best') pk = found.reduce((m, k) => (!m || k.volume > m.volume ? k : m), null);
    else pk = found.find((k) => k.label.toUpperCase().startsWith(p.which));
    if (pk) picks.push({ rate: pk.rate, trips: pk.volume });
  });
  if (!picks.length) return null;
  const rates = picks.map((x) => x.rate).filter((r) => r != null);
  return {
    n: picks.length,
    trips: picks.reduce((s, x) => s + x.trips, 0) / picks.length,
    rate: rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null,
  };
}

// Expected trips at X (= size / 1,000) from what the user typed.
function expected(row, x) {
  if (!row || !x) return null;
  const a = num(row.a), b = num(row.b);
  if (row.eq === 'linear' && a != null) return a * x + (b ?? 0);
  if (row.eq === 'ln' && a != null && b != null) return Math.exp(a * Math.log(x) + b);
  const avg = num(row.avg);
  return avg != null ? avg * x : null;
}

function inputCell(key, field, row, w = 58) {
  return `<input class="ite-in" data-ite-key="${key}" data-ite-field="${field}" value="${esc(row[field] ?? '')}" style="width:${w}px;text-align:right" inputmode="decimal">`;
}

// editable = owner Summary tab (inputs); false = viewer / print (results only, rows with data only).
export function iteComparisonHtml(model, ctx, editable) {
  const ite = ctx.ite || emptyIte();
  if (!editable && !hasIteData(ite)) return '';
  const allIdx = model.groups.findIndex((g) => g.auto === 'allVehicles' || /^all vehicles(?![a-z])/i.test(g.name || ''));
  const x = model.gsf ? model.gsf / 1000 : 0;
  const landUse = (ctx.siteInfo || {}).landUseType;
  const rows = ITE_PERIODS.filter((p) => editable || num((ite.rows[p.key] || {}).avg) != null || ((ite.rows[p.key] || {}).eq && ite.rows[p.key].eq !== 'none')).map((p) => {
    const r = ite.rows[p.key] || {};
    const obs = observed(model, allIdx, p);
    const exp = expected(r, x);
    const expRate = exp != null && x ? exp / x : null;
    const low = num(r.low), high = num(r.high), sd = num(r.sd), avg = num(r.avg);
    let diff = '—', range = '—';
    if (obs && obs.rate != null && expRate) {
      const d = (obs.rate - expRate) / expRate;
      diff = `${d > 0 ? '+' : ''}${(Math.round(d * 1000) / 10).toFixed(1)}%`;
    }
    if (obs && obs.rate != null && low != null && high != null) range = obs.rate < low ? 'below range' : obs.rate > high ? 'above range' : 'within range';
    else if (obs && obs.rate != null && sd != null && avg != null) range = Math.abs(obs.rate - avg) <= sd ? 'within 1 std dev' : 'outside 1 std dev';
    const inputs = editable ? `
      <td>${inputCell(p.key, 'avg', r)}</td><td>${inputCell(p.key, 'low', r)}</td><td>${inputCell(p.key, 'high', r)}</td><td>${inputCell(p.key, 'sd', r)}</td>
      <td><select class="ite-in" data-ite-key="${p.key}" data-ite-field="eq" style="width:100px">
        <option value="none"${!r.eq || r.eq === 'none' ? ' selected' : ''}>none</option>
        <option value="linear"${r.eq === 'linear' ? ' selected' : ''}>T = a·X + b</option>
        <option value="ln"${r.eq === 'ln' ? ' selected' : ''}>ln T = a·ln X + b</option></select></td>
      <td>${inputCell(p.key, 'a', r, 52)}</td><td>${inputCell(p.key, 'b', r, 52)}</td>` : `
      <td>${avg != null ? avg : '—'}</td><td>${low != null && high != null ? `${low} – ${high}` : '—'}</td>`;
    return `<tr>
      <th class="tgs-rowhead" style="text-align:left">${esc(p.label)}</th>
      <td class="tgs-first">${obs && obs.rate != null ? obs.rate.toFixed(2) : '—'}${obs && obs.n > 1 ? `<br><small>avg of ${obs.n} days</small>` : ''}</td>
      ${inputs}
      <td>${expRate != null ? expRate.toFixed(2) : '—'}</td>
      <td class="tgs-strong">${diff}</td>
      <td>${range}</td>
    </tr>`;
  }).join('');

  const head = editable
    ? '<th>Counted rate</th><th>ITE avg rate</th><th>Range low</th><th>Range high</th><th>Std dev</th><th>Equation</th><th>a</th><th>b</th><th>ITE expected rate</th><th>Counted vs ITE</th><th>Check</th>'
    : '<th>Counted rate</th><th>ITE avg rate</th><th>ITE range</th><th>ITE expected rate</th><th>Counted vs ITE</th><th>Check</th>';
  const note = `Rates are trips (in + out) per 1,000 SF of GSF. Counted = All vehicles, no pedestrians. ITE peak hours are the peak hour of the adjacent street or of the generator; the counted peak hour is the busiest hour inside this project's peak periods, so compare them with care. ${x ? '' : 'Enter the facility size to compute expected trips.'}`;
  return `
    <div class="tgs-cat ite-card">
      <div class="tgs-cat-title">ITE comparison${landUse ? ` — land use ${esc(landUse)}` : ''}</div>
      <div style="padding:10px 14px">
        ${editable ? `<div class="stat-detail" style="margin-bottom:8px">Type in the values from the ITE Trip Generation handbook for your land use. The app does not include ITE data. Fill in the average rate, or the fitted equation (X = size in 1,000 SF), for each period you want to compare.
          <label style="display:block;margin-top:6px">Handbook edition / land use name <input data-ite-edition value="${esc(ite.edition || '')}" style="width:260px" placeholder="e.g. 11th Edition, LU 150 Warehousing"></label></div>`
          : (ite.edition ? `<div class="stat-detail" style="margin-bottom:6px">Source: ${esc(ite.edition)}</div>` : '')}
        <div class="tgs-scroll"><table class="tgs-table tgs-compact ite-table"><thead><tr><th class="tgs-rowhead">Period</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="tgs-note" style="padding:6px 0 0">${note}</div>
      </div>
    </div>`;
}

export function wireIte(container, ite, onChange) {
  const cur = () => JSON.parse(JSON.stringify(ite || emptyIte()));
  container.querySelectorAll('[data-ite-field]').forEach((el) => el.addEventListener('change', () => {
    const next = cur();
    next.rows = next.rows || {};
    const row = (next.rows[el.dataset.iteKey] = next.rows[el.dataset.iteKey] || {});
    if (FIELDS.includes(el.dataset.iteField)) row[el.dataset.iteField] = el.value.trim();
    onChange(next);
  }));
  container.querySelector('[data-ite-edition]')?.addEventListener('change', (e) => {
    const next = cur(); next.edition = e.target.value.trim(); onChange(next);
  });
}
