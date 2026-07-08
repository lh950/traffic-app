// Mock data matching the shapes documented in DATA_CONTRACT.md, used only until
// src/data/index.js exists (the data agent's real parse/analyze functions).
// Once real data is loaded, none of this is referenced.

function buildIntervals(hours, intervalMin, fn) {
  const perHour = 60 / intervalMin;
  const n = hours * perHour;
  const intervals = [];
  for (let i = 0; i < n; i++) {
    const startMin = i * intervalMin;
    const h = Math.floor(startMin / 60);
    const m = startMin % 60;
    const endMin = startMin + intervalMin;
    const eh = Math.floor(endMin / 60);
    const em = endMin % 60;
    const pad = (x) => String(x).padStart(2, '0');
    const start = `${pad(h)}:${pad(m)}`;
    const end = `${pad(eh)}:${pad(em)}`;
    intervals.push({ label: `${start} – ${end}`, start, end, ...fn(i, n) });
  }
  return intervals;
}

function bellCurve(i, n, peakAt = 0.45, spread = 0.18, scale = 40) {
  const x = i / n;
  const v = Math.exp(-Math.pow(x - peakAt, 2) / (2 * spread * spread));
  return Math.max(0, Math.round(v * scale + (Math.random() * 4 - 2)));
}

export function mockVehicleData() {
  const types = ['passenger / light', 'truck / heavy'];
  const intervals = buildIntervals(12, 15, (i, n) => {
    const base = bellCurve(i, n, 0.5, 0.22, 36);
    const inA = Math.round(base * 0.7);
    const inB = Math.max(0, base - inA);
    const outBase = bellCurve(i, n, 0.55, 0.22, 30);
    const outA = Math.round(outBase * 0.65);
    const outB = Math.max(0, outBase - outA);
    return { inbound: [inA, inB], outbound: [outA, outB] };
  });
  return { types, intervals, _mock: true };
}

export function mockPedData() {
  const crosswalks = [
    { name: 'North', dir0: 'EB', dir1: 'WB' },
    { name: 'South', dir0: 'EB', dir1: 'WB' },
  ];
  const intervals = buildIntervals(12, 15, (i, n) => {
    const base = bellCurve(i, n, 0.48, 0.2, 14);
    return {
      counts: [
        [Math.round(base * 0.5), Math.round(base * 0.4)],
        [Math.round(base * 0.3), Math.round(base * 0.35)],
      ],
    };
  });
  return { crosswalks, intervals, _mock: true };
}

export function mockTmcData() {
  // turnClass uses single letters (L/T/R/U) to match src/data/parse.js's TURN_LABEL_TO_CLASS.
  const approaches = [
    { leg: 'N', destinations: [{ leg: 'S', turnClass: 'T' }, { leg: 'E', turnClass: 'L' }, { leg: 'W', turnClass: 'R' }] },
    { leg: 'E', destinations: [{ leg: 'W', turnClass: 'T' }, { leg: 'S', turnClass: 'L' }, { leg: 'N', turnClass: 'R' }] },
    { leg: 'S', destinations: [{ leg: 'N', turnClass: 'T' }, { leg: 'W', turnClass: 'L' }, { leg: 'E', turnClass: 'R' }] },
    { leg: 'W', destinations: [{ leg: 'E', turnClass: 'T' }, { leg: 'N', turnClass: 'L' }, { leg: 'S', turnClass: 'R' }] },
  ];
  const types = ['passenger / light'];
  const intervals = buildIntervals(12, 15, (i, n) => {
    const counts = {};
    for (const a of approaches) {
      counts[a.leg] = {};
      for (const d of a.destinations) {
        const mult = d.turnClass === 'T' ? 1 : d.turnClass === 'R' ? 0.5 : 0.35;
        counts[a.leg][d.leg] = [Math.max(0, bellCurve(i, n, 0.5, 0.22, 22 * mult))];
      }
    }
    return { counts };
  });
  return { approaches, types, intervals, _mock: true };
}
