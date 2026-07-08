// Pure analysis functions over the parsed shapes produced by parse.js.
// None of these functions mutate their inputs or read global state.

/**
 * Sum the total volume of one interval. Works for vehicle, ped, or TMC interval objects
 * (each shape has a different "raw" layout, so the caller supplies how to total a single
 * interval object via a totaling function — see totalsFor() below for the per-mode adapters).
 */
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Build a flat per-interval total-volume array from a generic intervals[] array, given a
 * function that extracts the numeric total for one interval. Used internally by the
 * peak/volume/AM-PM functions so they work across vehicle/ped/TMC shapes uniformly.
 */
function totalsFor(intervals, totalFn) {
  return intervals.map(totalFn);
}

/** Default totaler: vehicle intervals -> inbound+outbound total. */
export function vehicleIntervalTotal(interval) {
  return sum(interval.inbound) + sum(interval.outbound);
}

/** Default totaler: ped intervals -> sum of all crosswalk dir0/dir1 counts. */
export function pedIntervalTotal(interval) {
  return interval.counts.reduce((acc, pair) => acc + pair[0] + pair[1], 0);
}

/** Default totaler: TMC intervals -> sum of all approach->destination type counts. */
export function tmcIntervalTotal(interval) {
  let total = 0;
  for (const leg in interval.counts) {
    for (const dest in interval.counts[leg]) {
      total += sum(interval.counts[leg][dest]);
    }
  }
  return total;
}

/**
 * peakHour(intervals, intervalMinutes, totalFn?) -> { startIdx, endIdx, volume, label }
 * Finds the contiguous run of intervals spanning (closest to) 60 minutes with the highest
 * summed volume (a rolling-hour peak-hour-factor style search). `intervalMinutes` is the
 * study's interval length (5/10/15/20/30/60). `totalFn` defaults to vehicleIntervalTotal;
 * pass pedIntervalTotal or tmcIntervalTotal (or a custom fn) for other modes.
 * label is `"${intervals[startIdx].label.split(...)[0]} – ${intervals[endIdx].label...}"`-style,
 * built from the start of the first interval and the end of the last interval in the window.
 */
export function peakHour(intervals, intervalMinutes, totalFn = vehicleIntervalTotal) {
  if (!intervals || intervals.length === 0) return { startIdx: -1, endIdx: -1, volume: 0, label: '' };
  const perInterval = totalsFor(intervals, totalFn);
  const windowSize = Math.max(1, Math.round(60 / intervalMinutes));
  if (windowSize >= intervals.length) {
    const volume = sum(perInterval);
    return {
      startIdx: 0,
      endIdx: intervals.length - 1,
      volume,
      label: buildRangeLabel(intervals, 0, intervals.length - 1),
    };
  }

  let bestStart = 0;
  let bestVolume = -Infinity;
  let windowSum = sum(perInterval.slice(0, windowSize));
  bestVolume = windowSum;

  for (let start = 1; start <= perInterval.length - windowSize; start++) {
    windowSum = windowSum - perInterval[start - 1] + perInterval[start + windowSize - 1];
    if (windowSum > bestVolume) {
      bestVolume = windowSum;
      bestStart = start;
    }
  }

  const endIdx = bestStart + windowSize - 1;
  return {
    startIdx: bestStart,
    endIdx,
    volume: bestVolume,
    label: buildRangeLabel(intervals, bestStart, endIdx),
  };
}

function buildRangeLabel(intervals, startIdx, endIdx) {
  const startInterval = intervals[startIdx];
  const endInterval = intervals[endIdx];
  const start = startInterval && startInterval.start != null ? startInterval.start : (startInterval ? startInterval.label : '');
  const end = endInterval && endInterval.end != null ? endInterval.end : (endInterval ? endInterval.label : '');
  return `${start} – ${end}`;
}

/**
 * peakFifteen(intervals, totalFn?) -> { idx, volume, label }
 * The single highest-volume interval, regardless of its actual duration (named "fifteen"
 * per the common 15-min traffic-study convention, but works for any interval length —
 * it simply returns the single busiest row).
 */
export function peakFifteen(intervals, totalFn = vehicleIntervalTotal) {
  if (!intervals || intervals.length === 0) return { idx: -1, volume: 0, label: '' };
  let bestIdx = 0;
  let bestVolume = -Infinity;
  intervals.forEach((interval, idx) => {
    const v = totalFn(interval);
    if (v > bestVolume) {
      bestVolume = v;
      bestIdx = idx;
    }
  });
  return { idx: bestIdx, volume: bestVolume, label: intervals[bestIdx].label };
}

/**
 * volumeByInterval(intervals, totalFn?) -> { labels: string[], totals: number[] }
 * Flat per-interval volume series, ready for charting (x = labels, y = totals).
 */
export function volumeByInterval(intervals, totalFn = vehicleIntervalTotal) {
  return {
    labels: intervals.map((i) => i.label),
    totals: intervals.map((i) => totalFn(i)),
  };
}

/**
 * amPmSplit(intervals, totalFn?) -> { am: number, pm: number }
 * Sums volume for intervals starting before 12:00 (am) vs. at/after 12:00 (pm), based on
 * each interval's parsed `start` time ("HH:MM"). Intervals with an unparsed start time
 * (start === null) are excluded from both buckets.
 */
export function amPmSplit(intervals, totalFn = vehicleIntervalTotal) {
  let am = 0;
  let pm = 0;
  intervals.forEach((interval) => {
    if (interval.start == null) return;
    const hour = Number(interval.start.split(':')[0]);
    const v = totalFn(interval);
    if (hour < 12) am += v;
    else pm += v;
  });
  return { am, pm };
}

/**
 * tmcSummary(tmcParsed) -> {
 *   [approachLeg]: {
 *     total: number,                                                  // approach total volume
 *     destinations: { [destLeg]: { total: number, turnClass, pct: number } }  // pct is 0-100
 *   }
 * }
 * Per-approach, per-destination totals (summed across all intervals and vehicle types) plus
 * each destination's share of its approach's total as a 0–100 percentage. Object-keyed by leg
 * (not an array) to match how src/ui/tmcDiagram.js indexes it (`summary[activeLeg].destinations`).
 */
export function tmcSummary(tmcParsed) {
  const { approaches, intervals } = tmcParsed;
  const result = {};

  approaches.forEach((app) => {
    let approachTotal = 0;
    const destTotals = app.destinations.map((d) => {
      let total = 0;
      intervals.forEach((interval) => {
        const arr = interval.counts[app.leg] && interval.counts[app.leg][d.leg];
        if (arr) total += sum(arr);
      });
      approachTotal += total;
      return { leg: d.leg, turnClass: d.turnClass, total };
    });

    const destinations = {};
    destTotals.forEach((d) => {
      destinations[d.leg] = {
        total: d.total,
        turnClass: d.turnClass,
        pct: approachTotal > 0 ? Math.round((d.total / approachTotal) * 1000) / 10 : 0,
      };
    });

    result[app.leg] = { total: approachTotal, destinations };
  });

  return result;
}

/**
 * levelOfService(volume, capacity, opts?) -> { vc: number, los: 'A'|'B'|'C'|'D'|'E'|'F' }
 *
 * Simplified volume-to-capacity (v/c) ratio method — NOT a full HCM delay-based LOS
 * calculation. The counter app captures movement/approach volumes only (no signal timing,
 * phasing, or geometry), so a true HCM Chapter 19 (signalized) or Chapter 20 (unsignalized)
 * delay-based LOS cannot be derived from counts alone. `capacity` (vehicles/hour for the
 * period being analyzed) is a caller-supplied input — typically an engineer's estimate or a
 * planning-level capacity value — never derived from the count data itself.
 *
 * Default thresholds below follow the common simplified v/c-ratio convention used in many
 * planning-level sketch analyses (e.g. as summarized in ITE/FHWA planning guidance and
 * HCM-adjacent practice): LOS degrades as v/c approaches and exceeds 1.0.
 *   A: v/c <= 0.60   (free flow, well under capacity)
 *   B: v/c <= 0.70
 *   C: v/c <= 0.80
 *   D: v/c <= 0.90
 *   E: v/c <= 1.00   (at capacity)
 *   F: v/c >  1.00   (over capacity / breakdown)
 * These thresholds are a simplification and should be confirmed against the specific HCM
 * edition/method the maintainer wants before being treated as authoritative — see
 * DATA_CONTRACT.md "Open questions". Callers may override via opts.thresholds, an array of
 * 5 ascending v/c cut points for A/B/C/D/E (F is anything above the 5th value).
 */
export function levelOfService(volume, capacity, opts = {}) {
  const thresholds = opts.thresholds || [0.6, 0.7, 0.8, 0.9, 1.0];
  if (!capacity || capacity <= 0) return { vc: null, los: null };
  const vc = volume / capacity;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  let los = 'F';
  for (let i = 0; i < thresholds.length; i++) {
    if (vc <= thresholds[i]) {
      los = letters[i];
      break;
    }
  }
  return { vc: Math.round(vc * 1000) / 1000, los };
}

/**
 * peakHourInWindow(intervals, intervalMinutes, searchStartMin, searchEndMin, totalFn?)
 *   -> { startIdx, endIdx, volume, label, inbound, outbound, pctOfDay }
 *
 * Source-methodology peak-hour finder (traced from TripGenSummary's Analysis_* sheets,
 * which auto-detect the busiest contiguous 1-hour window WITHIN a bounded default search
 * range per period — e.g. "AM" candidates ≈7-11am — rather than either a single fixed hour
 * or an unbounded 24h search). `searchStartMin`/`searchEndMin` are minutes-since-midnight
 * bounding which interval start times are eligible to begin the rolling 1-hour window.
 * `pctOfDay` is the peak hour's share of the full day's total volume (a K-factor-style
 * figure the source reports alongside trip rate).
 */
export function peakHourInWindow(intervals, intervalMinutes, searchStartMin, searchEndMin, totalFn = vehicleIntervalTotal) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const windowSize = Math.max(1, Math.round(60 / intervalMinutes));
  const eligible = [];
  for (let start = 0; start + windowSize <= intervals.length; start++) {
    const s = toMin(intervals[start].start);
    if (s >= searchStartMin && s < searchEndMin) eligible.push(start);
  }
  const dayTotal = sum(totalsFor(intervals, totalFn));
  if (eligible.length === 0) {
    return { startIdx: -1, endIdx: -1, volume: 0, label: 'N/A', inbound: 0, outbound: 0, pctOfDay: 0 };
  }
  let bestStart = eligible[0];
  let bestVolume = -Infinity;
  eligible.forEach((start) => {
    const v = sum(intervals.slice(start, start + windowSize).map(totalFn));
    if (v > bestVolume) { bestVolume = v; bestStart = start; }
  });
  const endIdx = bestStart + windowSize - 1;
  const slice = intervals.slice(bestStart, endIdx + 1);
  const inbound = slice.reduce((s, iv) => s + (iv.inbound ? sum(iv.inbound) : 0), 0);
  const outbound = slice.reduce((s, iv) => s + (iv.outbound ? sum(iv.outbound) : 0), 0);
  return {
    startIdx: bestStart, endIdx, volume: bestVolume,
    label: buildRangeLabel(intervals, bestStart, endIdx),
    inbound, outbound,
    pctOfDay: dayTotal > 0 ? Math.round((bestVolume / dayTotal) * 1000) / 10 : 0,
  };
}

/**
 * tripRate(dayTotalVolume, gsf) -> number|null
 * Trips per 1000 GSF for one day — the headline number TripGenSummary's own Summary tab
 * reports per category per day-type. `gsf` is always a user-supplied site value (never
 * derived from counts); returns null if gsf is missing/zero rather than dividing by zero.
 */
export function tripRate(dayTotalVolume, gsf) {
  if (!gsf || gsf <= 0) return null;
  return Math.round((dayTotalVolume / (gsf / 1000)) * 100) / 100;
}

/**
 * balanceEntryExit(inboundByInterval, outboundByInterval) -> { inbound: number[], outbound: number[] }
 * Reconciles one classification's entry/exit series so the day's entry total equals its
 * exit total — same concept as the source workbook's "Balanced DATA" columns (trust
 * whichever day-total is SMALLER as ground truth, the larger side gets scaled down to match
 * it, keeping the larger side's own temporal shape rather than overwriting it with the
 * trusted side's shape — a vehicle that enters at 8am and exits at 5pm shouldn't have its
 * exit-side count moved to mimic the entry-side's daily curve).
 * NOTE: this is an approximation, not a literal port of the source's exact formula — the
 * real `AB10`-style formula adds a correction term derived from the *trusted* side's own
 * temporal distribution. Revisit if exact per-interval parity with the source ever matters.
 */
export function balanceEntryExit(inboundByInterval, outboundByInterval) {
  const inTotal = sum(inboundByInterval);
  const outTotal = sum(outboundByInterval);
  if (inTotal === outTotal || inTotal === 0 || outTotal === 0) {
    return { inbound: [...inboundByInterval], outbound: [...outboundByInterval] };
  }
  const trustIn = inTotal <= outTotal;
  const trustedTotal = trustIn ? inTotal : outTotal;
  const otherSide = trustIn ? outboundByInterval : inboundByInterval;
  const otherTotal = trustIn ? outTotal : inTotal;
  const scale = otherTotal > 0 ? trustedTotal / otherTotal : 0;
  const balancedOther = otherSide.map((v) => v * scale);
  return trustIn
    ? { inbound: [...inboundByInterval], outbound: balancedOther }
    : { inbound: balancedOther, outbound: [...outboundByInterval] };
}

/**
 * qaqcThresholdPct(volume) -> number
 * Volume-dependent acceptable-difference threshold, traced from TripGenData.xlsx's
 * "auto+bike+bus+moto" QC-rating legend (columns BY-CC): >=75 trips in the period -> 5%;
 * 50-75 -> 7.5%; <50 -> 10%. `volume` is the PRIMARY count's own volume for that window
 * (never the recount's), since the threshold reflects how much a few miscounts can swing
 * a low-volume period's percentage.
 */
export function qaqcThresholdPct(volume) {
  if (volume >= 75) return 5;
  if (volume >= 50) return 7.5;
  return 10;
}

/**
 * qaqcPeakHourScore(primaryQuarters, recountQuarters) -> { score, perQuarterPass, overallPass, rating }
 * primaryQuarters/recountQuarters: one number per interval actually present in the peak hour
 * — 4 for a 15-min study (the source's own granularity), but fewer/more for any other
 * interval length (e.g. 2 for 30-min, 12 for 5-min). Sized off primaryQuarters.length rather
 * than hardcoded to 4, or studies not run at 15-min intervals could never reach "complete"
 * (30-min: only 2 quarters ever possible) or could falsely complete early (5-min: only 4 of
 * 12 entered). NOTE: the resulting 0-4(+1) scale and the "Three Peak Hour" 0-15 Good/Failed
 * thresholds below are calibrated specifically for the 4-quarters-per-hour (15-min) case from
 * the source workbook — for other interval lengths the score is still computed consistently
 * but those literal thresholds won't carry the same meaning.
 * recountQuarters entries may be null/undefined for not-yet-entered quarters (excluded from
 * scoring, not counted as failing). Composite score: 0..N points for how many quarters are
 * within their own (volume-dependent) acceptable-difference band, +0/1 for whether the
 * overall hour total is within band. `rating` is null until every quarter is entered
 * (matches the source: partial data isn't rated).
 */
export function qaqcPeakHourScore(primaryQuarters, recountQuarters) {
  const entered = recountQuarters.filter((v) => v != null && v !== '');
  if (entered.length < primaryQuarters.length) return { score: null, perQuarterPass: [], overallPass: null, rating: 'Incomplete' };
  const perQuarterPass = primaryQuarters.map((p, i) => {
    const r = Number(recountQuarters[i]);
    const diffPct = p > 0 ? Math.abs((r - p) / p) * 100 : (r === 0 ? 0 : 100);
    return diffPct <= qaqcThresholdPct(p);
  });
  const primaryTotal = sum(primaryQuarters);
  const recountTotal = sum(recountQuarters.map(Number));
  const overallDiffPct = primaryTotal > 0 ? Math.abs((recountTotal - primaryTotal) / primaryTotal) * 100 : (recountTotal === 0 ? 0 : 100);
  const overallPass = overallDiffPct <= qaqcThresholdPct(primaryTotal);
  const score = perQuarterPass.filter(Boolean).length + (overallPass ? 1 : 0);
  return { score, perQuarterPass, overallPass, rating: null };
}

/**
 * threePeakHourRating(scores) -> { total, rating }
 * scores: up to 3 numbers (one per peak hour, 0-5 each, from qaqcPeakHourScore — null
 * entries are skipped). Source's "Three Peak Hour QC Rating": Good if total >=9, Failed if
 * <=6; 7-8 is an unscored middle zone in the source too — labeled "Borderline" here.
 */
export function threePeakHourRating(scores) {
  const valid = scores.filter((s) => s != null);
  if (valid.length < scores.length) return { total: null, rating: 'Incomplete' };
  const total = valid.reduce((a, b) => a + b, 0);
  const rating = total >= 9 ? 'Good' : total <= 6 ? 'Failed' : 'Borderline';
  return { total, rating };
}
