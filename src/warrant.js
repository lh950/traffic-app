// MUTCD (2009 / 2012 rev.) Signal Warrant Analysis
// Implements Warrants 1–4 using approach-level TMC volumes and pedestrian counts.

// ── Data helpers ─────────────────────────────────────────────────────────────

// Sum all type counts for one approach leg in one interval
function legVolume(iv, leg) {
  const dests = iv.counts[leg];
  if (!dests) return 0;
  return Object.values(dests).reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0);
}

// Aggregate TMC intervals into hourly {majVol, minVol} objects.
// majorLegs: Set of leg keys that form the major street (e.g. new Set(['N','S']))
// Returns array of { majVol, minVol, slotStart } — one entry per complete hour.
export function toHourlyVolumes(tmcParsed, majorLegs, intervalMin) {
  const sph = Math.round(60 / intervalMin);          // slots per hour
  const ivs = tmcParsed.intervals;
  const allLegs = tmcParsed.approaches.map(a => a.leg);
  const minorLegs = allLegs.filter(l => !majorLegs.has(l));

  const hourly = [];
  for (let h = 0; h * sph < ivs.length; h++) {
    const slice = ivs.slice(h * sph, h * sph + sph);
    if (slice.length < sph) break;  // skip incomplete final hour

    let majVol = 0;
    const minorByLeg = {};
    for (const iv of slice) {
      for (const leg of allLegs) {
        const v = legVolume(iv, leg);
        if (majorLegs.has(leg)) {
          majVol += v;
        } else {
          minorByLeg[leg] = (minorByLeg[leg] || 0) + v;
        }
      }
    }
    const minVol = Math.max(0, ...Object.values(minorByLeg));  // critical (highest) approach
    hourly.push({ majVol, minVol, slotStart: h * sph });
  }
  return hourly;
}

// ── Warrant 1 — Eight-Hour Vehicular Volume (Table 4C-1) ─────────────────────

// [1lane/1lane, 1lane/2+lane, 2+lane/1lane, 2+lane/2+lane]
const W1A_MAJ = [500, 500, 600, 600];
const W1A_MIN = [150, 200, 150, 200];
const W1B_MAJ = [750, 750, 900, 900];
const W1B_MIN = [75,  100, 75,  100];

function lanesTierIdx(majorLanes, minorLanes) {
  return (majorLanes >= 2 ? 2 : 0) + (minorLanes >= 2 ? 1 : 0);
}

export function runWarrant1(hourly, majorLanes, minorLanes) {
  const t   = lanesTierIdx(majorLanes, minorLanes);
  const majA = W1A_MAJ[t], minA = W1A_MIN[t];
  const majB = W1B_MAJ[t], minB = W1B_MIN[t];

  let condA = 0, condB = 0, comb = 0;
  const details = hourly.map(({ majVol, minVol, slotStart }) => {
    const a = majVol >= majA && minVol >= minA;
    const b = majVol >= majB && minVol >= minB;
    const c = majVol >= majA * 0.8 && minVol >= minA * 0.8
           && majVol >= majB * 0.8 && minVol >= minB * 0.8;
    if (a) condA++;
    if (b) condB++;
    if (c) comb++;
    return { slotStart, majVol, minVol, condA: a, condB: b, comb: c };
  });

  return {
    passed: condA >= 8 || condB >= 8 || comb >= 8,
    condA, condAReq: 8, condAThresh: { maj: majA, min: minA },
    condB, condBReq: 8, condBThresh: { maj: majB, min: minB },
    comb,  combReq: 8,
    details,
  };
}

// ── Warrant 2 — Four-Hour Vehicular Volume (Figure 4C-1, piecewise linear) ───

// Key points read from MUTCD Figure 4C-1
// [major vph, minor vph threshold] — upper curve (urban / multi-lane)
const W2_URBAN = [[400,400],[600,300],[800,225],[1000,175],[1200,150],[1400,125],[1600,100]];
// Lower curve (rural / lower volume)
const W2_RURAL = [[300,300],[400,200],[600,150],[800,125],[1000,100],[1200,75]];

function w2Threshold(majVol, curve) {
  if (majVol <= curve[0][0]) return curve[0][1];
  if (majVol >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 1; i < curve.length; i++) {
    if (majVol <= curve[i][0]) {
      const [x0, y0] = curve[i - 1];
      const [x1, y1] = curve[i];
      return Math.round(y0 + (y1 - y0) * (majVol - x0) / (x1 - x0));
    }
  }
  return curve[curve.length - 1][1];
}

export function runWarrant2(hourly, areaType) {
  const curve = areaType === 'rural' ? W2_RURAL : W2_URBAN;
  const minFloor = areaType === 'rural' ? 75 : 100;

  let hours = 0;
  const details = hourly.map(({ majVol, minVol, slotStart }) => {
    if (minVol < minFloor) return { slotStart, majVol, minVol, qualifies: false };
    const thresh = w2Threshold(majVol, curve);
    const qualifies = minVol >= thresh;
    if (qualifies) hours++;
    return { slotStart, majVol, minVol, thresh, qualifies };
  });

  return { passed: hours >= 4, hours, required: 4, details };
}

// ── Warrant 3 — Peak Hour (4C.05, Condition B volume) ────────────────────────

export function runWarrant3(hourly, areaType) {
  const majThresh = areaType === 'urban' ? 1200 : 750;
  const minThresh = 100;

  // Find the hour with the highest minor approach volume where major also qualifies
  let best = null;
  for (const h of hourly) {
    if (h.majVol >= majThresh && h.minVol >= minThresh) {
      if (!best || h.minVol > best.minVol) best = h;
    }
  }

  // Also find single peak hour by total volume for context
  const peakHour = hourly.reduce((a, b) => (!a || b.majVol + b.minVol > a.majVol + a.minVol) ? b : a, null);

  return {
    passed: !!best,
    majThresh,
    minThresh,
    qualifyingHour: best,
    peakHour,
  };
}

// ── Warrant 4 — Pedestrian Volume (4C.06) ─────────────────────────────────────

export function runWarrant4(pedParsed, intervalMin) {
  if (!pedParsed?.intervals?.length) return { passed: false, noData: true };

  const sph = Math.round(60 / intervalMin);
  const ivs = pedParsed.intervals;

  const hourly = [];
  for (let h = 0; h * sph < ivs.length; h++) {
    const slice = ivs.slice(h * sph, h * sph + sph);
    if (slice.length < sph) break;
    const vol = slice.reduce((s, iv) =>
      s + iv.counts.reduce((s2, xw) => s2 + xw[0] + xw[1], 0), 0);
    hourly.push(vol);
  }

  const hoursAbove100 = hourly.filter(v => v >= 100).length;
  const maxHour = Math.max(0, ...hourly);

  return {
    passed: hoursAbove100 >= 4 || maxHour >= 190,
    hoursAbove100,
    maxHour,
    req4Hour: 100,
    req1Hour: 190,
  };
}

// ── Render ─────────────────────────────────────────────────────────────────────

function badge(passed, insufficient) {
  if (insufficient) return `<span class="warrant-badge warrant-na">NO DATA</span>`;
  return passed
    ? `<span class="warrant-badge warrant-pass">PASS</span>`
    : `<span class="warrant-badge warrant-fail">NOT MET</span>`;
}

function condRow(label, count, req, thresh) {
  const met = count >= req;
  return `<tr class="${met ? 'wc-met' : ''}">
    <td>${label}</td>
    <td class="wc-num">${count}/${req} hrs</td>
    ${thresh ? `<td class="wc-thresh">${thresh}</td>` : '<td></td>'}
  </tr>`;
}

function w1Detail(r) {
  if (!r) return '';
  const cA = `≥${r.condAThresh.maj} maj + ≥${r.condAThresh.min} min`;
  const cB = `≥${r.condBThresh.maj} maj + ≥${r.condBThresh.min} min`;
  const combA = `≥${Math.round(r.condAThresh.maj*0.8)} maj + ≥${Math.round(r.condAThresh.min*0.8)} min`;
  const combB = `≥${Math.round(r.condBThresh.maj*0.8)} maj + ≥${Math.round(r.condBThresh.min*0.8)} min`;
  return `<table class="wc-table">
    ${condRow('Condition A (min. vehicular volume)', r.condA, r.condAReq, cA)}
    ${condRow('Condition B (continuous traffic)', r.condB, r.condBReq, cB)}
    ${condRow('Combination (80% of A and B)', r.comb, r.combReq, `${combA} &amp; ${combB}`)}
  </table>`;
}

function w2Detail(r) {
  if (!r) return '';
  return `<table class="wc-table">
    ${condRow('Hours above curve', r.hours, r.required, 'MUTCD Fig. 4C-1')}
  </table>`;
}

function w3Detail(r) {
  if (!r) return '';
  if (r.passed) {
    const h = r.qualifyingHour;
    return `<p class="wc-note">Qualifying hour: ${h.majVol.toLocaleString()} major / ${h.minVol.toLocaleString()} minor (thresholds: ${r.majThresh.toLocaleString()} / ${r.minThresh})</p>`;
  }
  return `<p class="wc-note">Thresholds: major ≥${r.majThresh.toLocaleString()} vph &amp; minor ≥${r.minThresh} vph in the same hour</p>`;
}

function w4Detail(r) {
  if (!r || r.noData) return `<p class="wc-note">No pedestrian count data recorded.</p>`;
  return `<table class="wc-table">
    ${condRow('Hours ≥ 100 ped/hr', r.hoursAbove100, 4, '≥100 ped/hr')}
    <tr class="${r.maxHour >= 190 ? 'wc-met' : ''}">
      <td>Peak hour volume</td>
      <td class="wc-num">${r.maxHour}</td>
      <td class="wc-thresh">≥190 ped/hr</td>
    </tr>
  </table>`;
}

function warrantCard(num, title, passed, insufficient, detailHtml) {
  return `
  <div class="warrant-card">
    <div class="warrant-card-head">
      <div>
        <div class="warrant-num">Warrant ${num}</div>
        <div class="warrant-title">${title}</div>
      </div>
      ${badge(passed, insufficient)}
    </div>
    <div class="warrant-detail">${detailHtml}</div>
  </div>`;
}

export function renderWarrantSection(container, tmcParsed, pedParsed, intervalMin, allLegs) {
  // Default: N-S are major (if present), else first two legs
  const defaultMajor = new Set(
    allLegs.filter(l => l === 'N' || l === 'S').length >= 2
      ? allLegs.filter(l => l === 'N' || l === 'S')
      : allLegs.slice(0, 2)
  );

  let majorLegs   = new Set(defaultMajor);
  let areaType    = 'urban';
  let majorLanes  = 1;
  let minorLanes  = 1;

  function compute() {
    const hasTmc = tmcParsed?.approaches?.length > 0
      && tmcParsed.intervals.some(iv =>
          Object.values(iv.counts).some(dests =>
            Object.values(dests).some(arr => arr.some(v => v > 0))));

    const minorLegs = allLegs.filter(l => !majorLegs.has(l));

    let w1 = null, w2 = null, w3 = null;
    if (hasTmc && majorLegs.size > 0 && minorLegs.length > 0) {
      const hourly = toHourlyVolumes(tmcParsed, majorLegs, intervalMin);
      if (hourly.length > 0) {
        w1 = runWarrant1(hourly, majorLanes, minorLanes);
        w2 = runWarrant2(hourly, areaType);
        w3 = runWarrant3(hourly, areaType);
      }
    }
    const w4 = runWarrant4(pedParsed, intervalMin);
    return { w1, w2, w3, w4, hasTmc, hourlyCount: w1?.details?.length ?? 0 };
  }

  function paint() {
    const { w1, w2, w3, w4, hasTmc, hourlyCount } = compute();

    const noTmcMsg = `<p class="wc-note">No turning movement count data recorded. Warrants 1–3 require TMC data.</p>`;
    const insufficientHours = hasTmc && hourlyCount < 1;
    const tmcInsuffNote = insufficientHours
      ? `<p class="wc-note">Study is less than one hour — Warrants 1–3 require at least 1 hour of data.</p>`
      : '';

    const legToggle = allLegs.map(l => `
      <button class="wleg-btn ${majorLegs.has(l) ? 'active' : ''}" data-leg="${l}">${l}</button>
    `).join('');

    container.innerHTML = `
    <div class="warrant-config">
      <div class="warrant-config-row">
        <label class="wc-label">Major street legs</label>
        <div class="wleg-group">${legToggle}</div>
      </div>
      <div class="warrant-config-row">
        <label class="wc-label">Area type</label>
        <div class="wc-radios">
          <label><input type="radio" name="wc-area" value="urban" ${areaType==='urban'?'checked':''}> Urban</label>
          <label><input type="radio" name="wc-area" value="rural" ${areaType==='rural'?'checked':''}> Rural</label>
        </div>
      </div>
      <div class="warrant-config-row">
        <label class="wc-label">Major street lanes</label>
        <div class="wc-radios">
          <label><input type="radio" name="wc-maj-lanes" value="1" ${majorLanes===1?'checked':''}> 1</label>
          <label><input type="radio" name="wc-maj-lanes" value="2" ${majorLanes===2?'checked':''}> 2 or more</label>
        </div>
      </div>
      <div class="warrant-config-row">
        <label class="wc-label">Minor street lanes</label>
        <div class="wc-radios">
          <label><input type="radio" name="wc-min-lanes" value="1" ${minorLanes===1?'checked':''}> 1</label>
          <label><input type="radio" name="wc-min-lanes" value="2" ${minorLanes===2?'checked':''}> 2 or more</label>
        </div>
      </div>
    </div>
    ${tmcInsuffNote}
    <div class="warrant-grid">
      ${warrantCard(1, 'Eight-Hour Vehicular Volume', w1?.passed, !hasTmc || insufficientHours, hasTmc && !insufficientHours ? w1Detail(w1) : noTmcMsg)}
      ${warrantCard(2, 'Four-Hour Vehicular Volume',  w2?.passed, !hasTmc || insufficientHours, hasTmc && !insufficientHours ? w2Detail(w2) : noTmcMsg)}
      ${warrantCard(3, 'Peak Hour',                   w3?.passed, !hasTmc || insufficientHours, hasTmc && !insufficientHours ? w3Detail(w3) : noTmcMsg)}
      ${warrantCard(4, 'Pedestrian Volume',            w4?.passed, w4?.noData,                  w4Detail(w4))}
    </div>`;

    // Wire config controls
    container.querySelectorAll('.wleg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const leg = btn.dataset.leg;
        if (majorLegs.has(leg)) majorLegs.delete(leg);
        else majorLegs.add(leg);
        paint();
      });
    });
    container.querySelectorAll('input[name="wc-area"]').forEach(r =>
      r.addEventListener('change', () => { areaType = r.value; paint(); }));
    container.querySelectorAll('input[name="wc-maj-lanes"]').forEach(r =>
      r.addEventListener('change', () => { majorLanes = parseInt(r.value); paint(); }));
    container.querySelectorAll('input[name="wc-min-lanes"]').forEach(r =>
      r.addEventListener('change', () => { minorLanes = parseInt(r.value); paint(); }));
  }

  paint();
}
