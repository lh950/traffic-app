// QA checks for TMC (and vehicle) count data.
// All functions take the parsed object from liveTmcParsed() or liveVehicleParsed().

// Sum all counts in a TMC interval object
function tmcIvTotal(iv) {
  return Object.values(iv.counts).reduce((s, dests) =>
    s + Object.values(dests).reduce((s2, arr) =>
      s2 + arr.reduce((x, y) => x + y, 0), 0), 0);
}

// Sum inbound+outbound counts in a vehicle interval object
function vehIvTotal(iv) {
  return iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0);
}

function iqrBounds(values) {
  if (values.length < 4) return null;
  const s = [...values].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const iqr = q3 - q1;
  return { low: q1 - 1.5 * iqr, high: q3 + 1.5 * iqr, q1, q3 };
}

// Returns the index of the last interval with a non-zero total
function lastNonZeroIdx(totals) {
  for (let i = totals.length - 1; i >= 0; i--) if (totals[i] > 0) return i;
  return -1;
}

// Returns the index of the first interval with a non-zero total
function firstNonZeroIdx(totals) {
  for (let i = 0; i < totals.length; i++) if (totals[i] > 0) return i;
  return -1;
}

// ── TMC QA ────────────────────────────────────────────────────────────────────

export function runTmcQA(parsed) {
  const findings = [];
  const ivs = parsed.intervals;
  if (!ivs.length) return findings;

  const totals = ivs.map(tmcIvTotal);
  const studyTotal = totals.reduce((a, b) => a + b, 0);
  const first = firstNonZeroIdx(totals);
  const last  = lastNonZeroIdx(totals);

  // 1. No data at all
  if (studyTotal === 0) {
    findings.push({ severity: 'warn', code: 'NO_DATA', message: 'No turning movement counts recorded.' });
    return findings;
  }

  // 2. Gaps — zero-count intervals between the first and last counted interval
  for (let i = first + 1; i < last; i++) {
    if (totals[i] === 0) {
      // Consolidate consecutive gaps
      const start = i;
      while (i + 1 < last && totals[i + 1] === 0) i++;
      const label = start === i ? ivs[start].label : `${ivs[start].label.split('–')[0].trim()} – ${ivs[i].label.split('–')[1]?.trim() || ''}`;
      findings.push({
        severity: 'warn',
        code: 'GAP',
        message: `No counts recorded for ${label} — possible missed interval.`,
        slotIdx: start,
      });
    }
  }

  // 3. Isolated spike — a single interval whose total is ≥ 3× the average of its neighbors
  //    (only checked on non-zero intervals; spikes of 1 are noise-free with enough volume)
  const nonZeroTotals = totals.filter(t => t > 0);
  const meanNonZero = nonZeroTotals.reduce((a, b) => a + b, 0) / nonZeroTotals.length;

  for (let i = first; i <= last; i++) {
    if (totals[i] === 0) continue;
    const neighbors = [];
    if (i > 0 && totals[i - 1] > 0)       neighbors.push(totals[i - 1]);
    if (i < totals.length - 1 && totals[i + 1] > 0) neighbors.push(totals[i + 1]);
    if (!neighbors.length) continue;
    const neighborAvg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
    if (neighborAvg > 0 && totals[i] >= 3.5 * neighborAvg && totals[i] >= meanNonZero * 2) {
      findings.push({
        severity: 'error',
        code: 'SPIKE',
        message: `${ivs[i].label}: ${totals[i].toLocaleString()} vehicles is ${(totals[i] / neighborAvg).toFixed(1)}× neighboring intervals — possible double-count.`,
        slotIdx: i,
      });
    }
  }

  // 4. IQR high outlier — intervals above Q3 + 1.5×IQR (only flag if not already a spike)
  const spikeSlots = new Set(findings.filter(f => f.code === 'SPIKE').map(f => f.slotIdx));
  const bounds = iqrBounds(nonZeroTotals);
  if (bounds && bounds.high > 0) {
    for (let i = first; i <= last; i++) {
      if (totals[i] > bounds.high && !spikeSlots.has(i)) {
        findings.push({
          severity: 'warn',
          code: 'OUTLIER_HIGH',
          message: `${ivs[i].label}: ${totals[i].toLocaleString()} vehicles is unusually high compared to the rest of the study (Q3 = ${bounds.q3.toLocaleString()}).`,
          slotIdx: i,
        });
      }
    }
  }

  // 5. IQR low outlier — non-zero intervals below Q1 - 1.5×IQR (light info nudge)
  if (bounds && bounds.low > 0) {
    for (let i = first; i <= last; i++) {
      if (totals[i] > 0 && totals[i] < bounds.low) {
        findings.push({
          severity: 'info',
          code: 'OUTLIER_LOW',
          message: `${ivs[i].label}: ${totals[i].toLocaleString()} vehicles is unusually low for the study period.`,
          slotIdx: i,
        });
      }
    }
  }

  // 6. Low study total — fewer than 30 vehicles per approach-hour is suspect
  const approachCount = parsed.approaches.filter(a => a.destinations.length).length;
  const coveredSlots  = last - first + 1;
  const coveredHours  = coveredSlots * (parsed.intervalMin || 15) / 60;
  const threshold     = approachCount * coveredHours * 30;
  if (approachCount > 0 && studyTotal < threshold) {
    findings.push({
      severity: 'info',
      code: 'LOW_TOTAL',
      message: `Study total of ${studyTotal.toLocaleString()} vehicles seems low for ${approachCount} approach${approachCount > 1 ? 'es' : ''} over ${coveredHours.toFixed(1)} h.`,
    });
  }

  return findings;
}

// ── Vehicle QA ────────────────────────────────────────────────────────────────

export function runVehicleQA(parsed) {
  const findings = [];
  const ivs = parsed.intervals;
  if (!ivs.length) return findings;

  const totals = ivs.map(vehIvTotal);
  const studyTotal = totals.reduce((a, b) => a + b, 0);
  const first = firstNonZeroIdx(totals);
  const last  = lastNonZeroIdx(totals);

  if (studyTotal === 0) {
    findings.push({ severity: 'warn', code: 'NO_DATA', message: 'No vehicle counts recorded.' });
    return findings;
  }

  // Gaps
  for (let i = first + 1; i < last; i++) {
    if (totals[i] === 0) {
      const start = i;
      while (i + 1 < last && totals[i + 1] === 0) i++;
      const label = start === i ? ivs[start].label : `${ivs[start].label.split('–')[0].trim()} – ${ivs[i].label.split('–')[1]?.trim() || ''}`;
      findings.push({ severity: 'warn', code: 'GAP', message: `No counts recorded for ${label} — possible missed interval.`, slotIdx: start });
    }
  }

  // Spikes
  const nonZeroTotals = totals.filter(t => t > 0);
  const meanNonZero   = nonZeroTotals.reduce((a, b) => a + b, 0) / nonZeroTotals.length;
  for (let i = first; i <= last; i++) {
    if (totals[i] === 0) continue;
    const neighbors = [];
    if (i > 0 && totals[i - 1] > 0) neighbors.push(totals[i - 1]);
    if (i < totals.length - 1 && totals[i + 1] > 0) neighbors.push(totals[i + 1]);
    if (!neighbors.length) continue;
    const neighborAvg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
    if (neighborAvg > 0 && totals[i] >= 3.5 * neighborAvg && totals[i] >= meanNonZero * 2) {
      findings.push({
        severity: 'error',
        code: 'SPIKE',
        message: `${ivs[i].label}: ${totals[i].toLocaleString()} vehicles is ${(totals[i] / neighborAvg).toFixed(1)}× neighboring intervals — possible double-count.`,
        slotIdx: i,
      });
    }
  }

  return findings;
}

// ── Render ────────────────────────────────────────────────────────────────────

const SEV_ICON  = { error: '✕', warn: '⚠', info: 'ℹ' };
const SEV_LABEL = { error: 'Error', warn: 'Warning', info: 'Note' };

export function renderQASection(container, findings) {
  if (!findings.length) {
    container.innerHTML = `<div class="qa-clean">✓ No data quality issues found.</div>`;
    return;
  }

  const errors   = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warn').length;
  const infos    = findings.filter(f => f.severity === 'info').length;

  const items = findings.map(f => `
    <div class="qa-item qa-${f.severity}">
      <span class="qa-icon" title="${SEV_LABEL[f.severity]}">${SEV_ICON[f.severity]}</span>
      <span class="qa-msg">${f.message}</span>
    </div>`).join('');

  const badges = [
    errors   ? `<span class="qa-badge qa-badge-error">${errors} error${errors > 1 ? 's' : ''}</span>` : '',
    warnings ? `<span class="qa-badge qa-badge-warn">${warnings} warning${warnings > 1 ? 's' : ''}</span>` : '',
    infos    ? `<span class="qa-badge qa-badge-info">${infos} note${infos > 1 ? 's' : ''}</span>` : '',
  ].filter(Boolean).join('');

  container.innerHTML = `<div class="qa-badges">${badges}</div><div class="qa-list">${items}</div>`;
}
