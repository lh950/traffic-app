// ═══════════════════════════════════════════
// UTDF (Universal Traffic Data Format) export — turning-movement volumes only
//
// UTDF is Trafficware/Synchro's interchange format. Its modern "Combined UTDF"
// file is a single comma-delimited (CSV) text file split into named sections;
// each section starts with a line reading "[SectionName]" and sections are
// separated by a blank line. This module writes ONLY the volume-count section
// (no Layout/Lanes/Phasing/Timing Plans) — the intended workflow is: the user
// already has an intersection built in Synchro (geometry, lane config, signal
// timing) and wants to bring in fresh field-count turning-movement volumes for
// that intersection without retyping them, which is exactly what a
// volumes-only UTDF import supports. Geometry/lane sections were deliberately
// NOT attempted here — see the confidence note below.
//
// CONFIRMED (multiple independent sources, cross-checked, see DEVLOG v3.32.0-alpha.1):
//   - File is plain comma-delimited CSV text.
//   - Sections are marked by a bracketed name line, e.g. "[Volume]", followed
//     by a header row, then one data row per record, with a blank line
//     between sections (Combined UTDF format, in use since Synchro reformatted
//     UTDF to a single combined file in 2006).
//   - The volume section's header row / column order is:
//       DATE,TIME,INTID,NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR
//     (source: PTV Vistro's UTDF import documentation, which documents this
//     layout precisely because Vistro must round-trip real Synchro UTDF files)
//   - DATE is mm/dd/yyyy; TIME is a 3-4 digit 24-hour value with no colon
//     (e.g. "700" or "0700" for 7:00 AM, "1200" for noon).
//   - Each of the 12 movement columns is a SINGLE total volume number — UTDF's
//     volume record does not carry a per-vehicle-class breakdown (that's what
//     this app's existing exportCSV()/exportXLSX() already provide instead).
//
// BEST-EFFORT / NOT independently confirmed against a real Synchro import —
// flagged explicitly rather than presented as verified:
//   - Exact section-name casing/pluralization ("[Volume]" vs "[Volumes]") —
//     used "[Volume]" (singular) as the most consistently-cited form; Synchro
//     is commonly reported as case-insensitive on section names, but this was
//     not verified against the actual application.
//   - INTID: no meaningful ID exists in this app (single-intersection export,
//     no network/node numbering), so INTID is hardcoded to "1". If importing
//     into a Synchro file where the target intersection's UTDF-visible INTID
//     is a different number, this will need to be edited before import, OR
//     Synchro's import may match by DATE/TIME/geometry instead of INTID —
//     unconfirmed either way.
//   - U-turns: UTDF's 12-column layout has no dedicated U-turn column. This
//     export folds any U-turn movement into that approach's Left ('L') column,
//     matching the common traffic-engineering convention of counting U-turns
//     with lefts. Not confirmed against Synchro's own convention.
//   - Legs other than cardinal N/E/S/W (e.g. a 5-way intersection's diagonal
//     leg) have no corresponding UTDF column in this 12-column layout. Their
//     movements are DROPPED from the export (not silently folded into an
//     adjacent leg) and a warning is surfaced to the caller.
//   - Bicycle volumes are NOT included. No confirmed UTDF column layout for
//     bike turning-movement volumes was found during research (the Vistro
//     documentation notes bicycle fields exist elsewhere in UTDF but are
//     ignored on import) — rather than guess at a layout, only motor-vehicle
//     classes are summed into the movement totals here.
//
// NEEDS REAL-WORLD VALIDATION: this file has not been round-trip tested
// against an actual Synchro import. Before trusting it for a real project,
// import a generated file into Synchro (or PTV Vistro, which documents the
// same format) against a matching intersection and confirm the 12 movement
// volumes land in the correct NBL/NBT/NBR/etc. cells for the correct interval.
//
// FIXED DURING AUDIT (v3.32.0-alpha.2, before this feature was pushed): the
// original UTDF_LEG_ORDER mapped this app's leg N straight to the NB column
// (and S→SB, E→EB, W→WB) — i.e. by physical leg position. UTDF/Synchro
// actually labels by direction of travel, and this app's own DOT-TMC parser
// (parseDotTmcXlsx.js, traced from real NYC DOT files) already documents the
// correct convention: leg N is a SOUTHBOUND movement (entered from the
// north), leg S is NORTHBOUND, leg E is WESTBOUND, leg W is EASTBOUND. Every
// UTDF file this exporter produced before the fix had NB/SB and EB/WB
// silently swapped. See BUGS.md (BUG-023) and CARDINAL_TO_UTDF/UTDF_LEG_ORDER
// below for the corrected mapping.

import { cfg, vPairs, intersection, tmcData, periodMeta } from './state.js';
import { classifyTurn } from './diagram.js';

// UTDF/Synchro labels movements by the direction the vehicle is TRAVELING, not by which
// physical leg it entered from — same convention parseDotTmcXlsx.js already established
// from real NYC DOT files ("SB = vehicle entered from North; EB = from West; NB = from
// South; WB = from East", see that file's DIR_MAP comment). So this app's "leg N" (vehicles
// entering FROM the north, heading south) is a SOUTHBOUND movement, not northbound — the
// mapping below is inverted from what the leg names look like at a glance. Confirmed via
// classifyTurn()'s own heading math: approach leg N has heading (bA+180)%360 = 180° = due
// south.
const CARDINAL_TO_UTDF = { S:'NB', N:'SB', W:'EB', E:'WB' };
// Order to iterate this app's legs in so that the L,T,R triplets land under the header's
// NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR columns in the correct direction — see
// CARDINAL_TO_UTDF above for why 'S' (not 'N') comes first.
const UTDF_LEG_ORDER = ['S','N','W','E'];
const MVMT_ORDER = ['L','T','R'];

function pad2(n){ return String(n).padStart(2,'0'); }

// periodMeta.date comes from an <input type="date"> → 'YYYY-MM-DD'; falls back to today.
function utdfDate(){
  const d = periodMeta.date;
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y,m,dd] = d.split('-');
    return `${m}/${dd}/${y}`;
  }
  const now = new Date();
  return `${pad2(now.getMonth()+1)}/${pad2(now.getDate())}/${now.getFullYear()}`;
}

function utdfTime(startMinutes){
  const h = Math.floor(startMinutes/60)%24, m = startMinutes%60;
  return `${pad2(h)}${pad2(m)}`;
}

export function getUTDFFilename(){
  const pi = window.projectInfo || {};
  const raw = pi.projectName || [intersection.street1, intersection.street2].filter(Boolean).join('_') || 'intersection';
  const base = raw.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_') || 'intersection';
  return `${base}_UTDF.csv`;
}

// Returns { rows: string[], warnings: string[] } — rows are the data lines
// (no header, no section marker) of the [Volume] section for the currently
// loaded/active period's TMC data, one row per count interval.
export function buildUTDFVolumeRows(){
  const warnings = [];
  const apps = intersection.approaches || [];
  const tmcPairs = vPairs.filter(p=>p.includeTmc);

  // Derive the actual recorded vehicle-class count from tmcData itself (not
  // tmcPairs.length) — mirrors exportCSV()'s existing safeguard so header/data
  // width never mismatches if tmcPairs was edited/reset after recording.
  let nT = tmcPairs.length;
  for (const app of apps){
    for (const dest of app.destinations){
      const slot0 = tmcData[app.leg]?.[dest]?.[0];
      if (Array.isArray(slot0)) { nT = slot0.length; break; }
    }
    if (nT !== tmcPairs.length) break;
  }
  // Motor-vehicle classes only (bike excluded) — matches exportCSV()'s
  // motorOrigIdx precedent for separating bike vs. motor TMC data, and here
  // it is required since UTDF has no confirmed bike-volume column layout.
  const motorOrigIdx = tmcPairs.map((p,i)=>!p.isBike?i:-1).filter(i=>i>=0&&i<nT);

  const skippedLegs = new Set();
  const date = utdfDate();
  const dateStr = date;

  const rows = [];
  const nSlots = cfg.slots;
  for (let ri=0; ri<nSlots; ri++){
    // bucket[leg][movementClass] = total volume
    const bucket = { N:{L:0,T:0,R:0}, S:{L:0,T:0,R:0}, E:{L:0,T:0,R:0}, W:{L:0,T:0,R:0} };
    apps.forEach(app=>{
      if (!UTDF_LEG_ORDER.includes(app.leg)){
        skippedLegs.add(app.leg);
        return; // no UTDF column for this leg (e.g. a 5-way diagonal leg)
      }
      app.destinations.forEach(dest=>{
        let cls = classifyTurn(app.leg, dest);
        if (cls === 'U') cls = 'L'; // fold U-turns into Left — see confidence note above
        if (cls !== 'L' && cls !== 'T' && cls !== 'R') return; // unclassifiable ('?') — skip
        const allCounts = (tmcData[app.leg] && tmcData[app.leg][dest] && tmcData[app.leg][dest][ri]) || Array(nT).fill(0);
        const sub = motorOrigIdx.reduce((s,i)=>s+(allCounts[i]||0),0);
        bucket[app.leg][cls] += sub;
      });
    });
    const startMin = cfg.startMinutes + ri*cfg.intervalMin;
    const cols = [dateStr, utdfTime(startMin), '1'];
    UTDF_LEG_ORDER.forEach(leg=>{
      MVMT_ORDER.forEach(m=>cols.push(String(bucket[leg][m])));
    });
    rows.push(cols.join(','));
  }

  skippedLegs.forEach(leg=>warnings.push(
    `Leg "${leg}" has no standard UTDF column (only N/E/S/W are supported) — its turning-movement volumes were excluded from the UTDF export.`
  ));

  return { rows, warnings };
}

export function buildUTDFText(){
  const { rows, warnings } = buildUTDFVolumeRows();
  const header = 'DATE,TIME,INTID,NBL,NBT,NBR,SBL,SBT,SBR,EBL,EBT,EBR,WBL,WBT,WBR';
  // No leading comment/metadata line in the file itself — UTDF's documented
  // structure has no confirmed support for arbitrary comment lines, and this
  // export prioritizes import-safety over embedding provenance info in the
  // file. Provenance instead goes in the filename and in DEVLOG.md.
  const lines = [
    '[Volume]',
    header,
    ...rows,
    '',
  ];
  return { text: lines.join('\n'), warnings };
}

export function exportUTDF(){
  const { text, warnings } = buildUTDFText();
  if (warnings.length) warnings.forEach(w=>console.warn('[UTDF export]', w));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  a.download = getUTDFFilename();
  a.click();
  return warnings;
}
