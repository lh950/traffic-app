// Barrel export — single import surface for the UI layer.
// `import { parseVehicleCSV, peakHour, ... } from '../data/index.js'`

export {
  /** parseVehicleCSV(text) -> { types: string[], intervals: [{ label, start, end, inbound: number[], outbound: number[] }] } */
  parseVehicleCSV,
  /** parsePedCSV(text) -> { crosswalks: [{ name, dir0, dir1 }], intervals: [{ label, start, end, counts: [[dir0,dir1], ...] }] } */
  parsePedCSV,
  /** parseTmcCSV(text) -> { approaches: [{ leg, destinations: [{ leg, turnClass }] }], types: string[], intervals: [{ label, start, end, counts: {leg:{destLeg:number[]}} }] } */
  parseTmcCSV,
} from './parse.js';

export {
  /** parseTripGenWorkbook(arrayBuffer, filename) -> { meta: {studyName,siteName,gsf}, days: [{sheetName, dayType, parsed: {types, intervals}}] } */
  parseTripGenWorkbook,
  /** categoryFor(classificationLabel) -> a NON-AUTHORITATIVE starting-grouping suggestion only — grouping is project-specific and always user-editable, never a fixed standard. */
  categoryFor,
} from './parseTripGen.js';

export {
  /** vehicleIntervalTotal(interval) -> number — inbound+outbound total for one vehicle interval */
  vehicleIntervalTotal,
  /** pedIntervalTotal(interval) -> number — total of all crosswalk dir0/dir1 counts for one ped interval */
  pedIntervalTotal,
  /** tmcIntervalTotal(interval) -> number — total of all approach->destination counts for one TMC interval */
  tmcIntervalTotal,
  /** peakHour(intervals, intervalMinutes, totalFn?) -> { startIdx, endIdx, volume, label } — busiest rolling 60-min window */
  peakHour,
  /** peakHourInWindow(intervals, intervalMinutes, searchStartMin, searchEndMin, totalFn?) -> { startIdx, endIdx, volume, label, inbound, outbound, pctOfDay } — busiest hour within a bounded search range (AM/Midday/PM style), per the source workbook's actual method */
  peakHourInWindow,
  /** peakFifteen(intervals, totalFn?) -> { idx, volume, label } — single busiest interval */
  peakFifteen,
  /** volumeByInterval(intervals, totalFn?) -> { labels: string[], totals: number[] } — series for charting */
  volumeByInterval,
  /** amPmSplit(intervals, totalFn?) -> { am: number, pm: number } — volume before/after 12:00 */
  amPmSplit,
  /** tmcSummary(tmcParsed) -> { [approachLeg]: { total, destinations: { [destLeg]: { total, turnClass, pct } } } } */
  tmcSummary,
  /** levelOfService(volume, capacity, opts?) -> { vc: number|null, los: 'A'|'B'|'C'|'D'|'E'|'F'|null } — simplified v/c-ratio method, see analyze.js for cited thresholds */
  levelOfService,
  /** tripRate(dayTotalVolume, gsf) -> number|null — trips per 1000 GSF for one day */
  tripRate,
  /** balanceEntryExit(inboundByInterval, outboundByInterval) -> { inbound: number[], outbound: number[] } — reconciles entry/exit so day totals match */
  balanceEntryExit,
  /** qaqcThresholdPct(volume) -> number — volume-dependent acceptable %-difference band */
  qaqcThresholdPct,
  /** qaqcPeakHourScore(primaryQuarters, recountQuarters) -> { score, perQuarterPass, overallPass, rating } */
  qaqcPeakHourScore,
  /** threePeakHourRating(scores) -> { total, rating: 'Good'|'Borderline'|'Failed'|'Incomplete' } */
  threePeakHourRating,
} from './analyze.js';
