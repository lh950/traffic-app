import {
  TEMPLATES, cfg, vPairs, tmcPairs, intersection, tmcData, tmcApproach, slot, mode, focusTarget,
  pedData, slotLabel, setDiagWin, setTmcWin, diagWin, tmcWin, diagTimers,
} from './state.js';

// ═══════════════════════════════════════════
// TURN CLASSIFICATION
// ═══════════════════════════════════════════
export const LEG_BEARING = {N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315};

// 'L' left | 'T' through | 'R' right | 'U' u-turn
// U-turn means re-entering your own approach leg — destLeg!==approachLeg already excludes
// that everywhere this is used, so 'U' only fires for the literal rel===180 case (kept for
// correctness, e.g. future 6+ way templates with paired-opposite diagonals).
// Buckets are exact compass-degree splits (not 90°-wide ranges) so they scale correctly to
// 45°-spaced legs (5-way's diagonal) instead of misclassifying real turns as U and dropping them.
export function classifyTurn(approachLeg, destLeg){
  const bA=LEG_BEARING[approachLeg], bD=LEG_BEARING[destLeg];
  if(bA===undefined||bD===undefined)return'?';
  const heading=(bA+180)%360;
  const rel=(bD-heading+360)%360;
  if(rel===0)return'T';
  if(rel===180)return'U';
  if(rel<180)return'R';
  return'L';
}
export const TURN_CLS_LABEL={L:'left',T:'thru',R:'right',U:'U-turn'};

// Diagram slot geometry: for each template, define where each slot's arrows sit
const SLOT_GEOM = {
  N:  {horiz:true,  zone:{x:192,y:150,w:80,h:34},
       a0:{x1:200,y1:130,x2:246,y2:130}, a1:{x1:264,y1:114,x2:218,y2:114}},
  S:  {horiz:true,  zone:{x:192,y:280,w:80,h:34},
       a0:{x1:246,y1:334,x2:200,y2:334}, a1:{x1:218,y1:350,x2:264,y2:350}},
  E:  {horiz:false, zone:{x:280,y:192,w:34,h:80},
       a0:{x1:334,y1:200,x2:334,y2:246}, a1:{x1:350,y1:264,x2:350,y2:218}},
  W:  {horiz:false, zone:{x:150,y:192,w:34,h:80},
       a0:{x1:130,y1:246,x2:130,y2:200}, a1:{x1:114,y1:218,x2:114,y2:264}},
  SE: {horiz:false, diag:true, zone:{x:318,y:330,w:60,h:34,rot:45, cx:348,cy:347},
       a0:{x1:372,y1:322,x2:340,y2:354}, a1:{x1:330,y1:368,x2:362,y2:336}},
  NE: {horiz:false, diag:true, zone:{x:318,y:100,w:60,h:34,rot:-45,cx:348,cy:117},
       a0:{x1:372,y1:142,x2:340,y2:110}, a1:{x1:330,y1:96, x2:362,y2:128}},
  SW: {horiz:false, diag:true, zone:{x:86, y:330,w:60,h:34,rot:135,cx:116,cy:347},
       a0:{x1:92, y1:322,x2:124,y2:354}, a1:{x1:134,y1:368,x2:102,y2:336}},
  NW: {horiz:false, diag:true, zone:{x:86, y:100,w:60,h:34,rot:225,cx:116,cy:117},
       a0:{x1:92, y1:142,x2:124,y2:110}, a1:{x1:134,y1:96, x2:102,y2:128}},
};

const DIAG_COLORS = [
  {light:'#e8d8ff',mid:'#a888e8',zone:'rgba(184,157,224,0.22)',badge:'rgba(160,120,210,0.25)',bs:'rgba(184,157,224,0.8)',nc:'#d4c0ff',k0:'#f0e8ff',k1:'#c8aaff'},
  {light:'#fde0c0',mid:'#e09050',zone:'rgba(232,168,124,0.22)',badge:'rgba(210,130,80,0.25)', bs:'rgba(232,168,124,0.8)',nc:'#f0c098',k0:'#fde0c0',k1:'#f0a860'},
  {light:'#c0eedd',mid:'#40a888',zone:'rgba(122,203,184,0.22)',badge:'rgba(80,170,150,0.25)', bs:'rgba(122,203,184,0.8)',nc:'#98ddc8',k0:'#c0eedd',k1:'#70c8a8'},
  {light:'#f8f0a0',mid:'#c09820',zone:'rgba(212,192,112,0.22)',badge:'rgba(180,160,60,0.25)', bs:'rgba(212,192,112,0.8)',nc:'#e0d060',k0:'#f8f0a0',k1:'#e0b830'},
  {light:'#b0d8ff',mid:'#3070c8',zone:'rgba(100,160,230,0.22)',badge:'rgba(60,110,200,0.25)', bs:'rgba(100,160,230,0.8)',nc:'#88b8f0',k0:'#b0d8ff',k1:'#80b0f0'},
  {light:'#f0b8e0',mid:'#b03080',zone:'rgba(200,120,180,0.22)',badge:'rgba(160,60,130,0.25)', bs:'rgba(200,120,180,0.8)',nc:'#e098c8',k0:'#f0b8e0',k1:'#d080b8'},
];

import { destLabel, legLabel } from './setup.js';

// ═══════════════════════════════════════════
// SETUP SCREEN LIVE DIAGRAM
// ═══════════════════════════════════════════
// Deliberately minimal: roads + one small status dot per leg. All direction/crosswalk
// detail lives in the leg detail panel (renderLegPopoverContent in setup.js +
// buildLegDestinationsSVG below) so the overview never gets cluttered, even at 5 legs.
export function renderSetupDiagram(){
  const roadEl = document.getElementById('setup-diag-road');
  if(!roadEl) return;

  const tpl = TEMPLATES.find(t=>t.id===window.pedTemplate)||TEMPLATES[1];
  const lc = 'var(--text3)';
  const ls = `stroke="${lc}" stroke-width="1.5"`;
  const ib = 'fill="var(--surface3)" stroke="var(--border)" stroke-width="0.5"';

  function roadLines(id){
    const vN=`<line x1="192" y1="0" x2="192" y2="192" ${ls}/><line x1="272" y1="0" x2="272" y2="192" ${ls}/>`;
    const vS=`<line x1="192" y1="272" x2="192" y2="480" ${ls}/><line x1="272" y1="272" x2="272" y2="480" ${ls}/>`;
    const hW=`<line x1="0" y1="192" x2="192" y2="192" ${ls}/><line x1="0" y1="272" x2="192" y2="272" ${ls}/>`;
    const hE=`<line x1="272" y1="192" x2="464" y2="192" ${ls}/><line x1="272" y1="272" x2="464" y2="272" ${ls}/>`;
    const box=`<rect x="192" y="192" width="80" height="80" ${ib}/>`;
    const rDiagSE=`<line x1="272" y1="272" x2="400" y2="400" ${ls}/><line x1="272" y1="320" x2="352" y2="400" ${ls}/>`;
    const rDiagNE=`<line x1="272" y1="192" x2="400" y2="64"  ${ls}/><line x1="272" y1="144" x2="352" y2="64"  ${ls}/>`;
    const rDiagSW=`<line x1="192" y1="272" x2="64"  y2="400" ${ls}/><line x1="192" y1="320" x2="112" y2="400" ${ls}/>`;
    const rDiagNW=`<line x1="192" y1="192" x2="64"  y2="64"  ${ls}/><line x1="192" y1="144" x2="112" y2="64"  ${ls}/>`;
    const rDiagMap={SE:rDiagSE,NE:rDiagNE,SW:rDiagSW,NW:rDiagNW};
    switch(id){
      case 't4': return vN+vS+hW+hE+box;
      case 't3':{
        const ml=intersection.missingLeg||'S';
        const arms={N:vN,E:hE,S:vS,W:hW};
        return ['N','E','S','W'].filter(l=>l!==ml).map(l=>arms[l]).join('')+box;
      }
      case 't5':{
        const dl=intersection.diagLeg||'SE';
        return vN+vS+hW+hE+(rDiagMap[dl]||rDiagSE)+box;
      }
      default: return roadLines('t4');
    }
  }

  roadEl.innerHTML = roadLines(window.pedTemplate);

  const linksEl = document.getElementById('setup-diag-links');
  if(linksEl) linksEl.innerHTML = buildLegLinks();

  const dotsEl = document.getElementById('setup-diag-dots');
  if(dotsEl) dotsEl.innerHTML = buildLegDots(tpl);

  const arrowsEl = document.getElementById('setup-diag-arrows');
  if(arrowsEl) arrowsEl.innerHTML = buildLegArrows(tpl);

  const hitEl = document.getElementById('setup-diag-hit');
  if(hitEl) hitEl.innerHTML = buildLegHitAreas(tpl);
}

// Thin, non-interactive lines between leg dots for every configured turning movement,
// so the intersection's structure — which legs feed which — reads at a glance without
// opening each leg's detail panel. Deliberately plain (straight lines, one weight, one
// color) rather than the colored bezier arrows in the detail diagram — that level of
// fidelity belongs there; this is just a structural cue.
function buildLegLinks(){
  let html='';
  intersection.approaches.forEach(a=>{
    const from=LEG_DOT_POS[a.leg];
    if(!from)return;
    a.destinations.forEach(d=>{
      const to=LEG_DOT_POS[d];
      if(!to)return;
      html+=`<line class="leg-link" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="url(#leg-link-arrow)"/>`;
    });
  });
  return html;
}

// Generous click/tap targets over each leg's road stub, so the diagram itself is the
// builder surface (click a leg → detail panel) rather than a separate list. Diagonal leg
// (t5) is rendered after the cardinals so it wins the small corner overlap.
const LEG_HIT_RECTS = {
  N:{x:182,y:0,  w:100,h:188},
  S:{x:182,y:292,w:100,h:188},
  W:{x:0,  y:182,w:188,h:100},
  E:{x:276,y:182,w:188,h:100},
  SE:{x:276,y:276,w:184,h:184},
  NE:{x:276,y:4,  w:184,h:184},
  SW:{x:4,  y:276,w:184,h:184},
  NW:{x:4,  y:4,  w:184,h:184},
};
// Where each leg's status dot is drawn — near the outer edge of its stub, away from
// the intersection box, so the box itself stays uncluttered.
const LEG_DOT_POS = {
  N:{x:232,y:36}, S:{x:232,y:444}, E:{x:444,y:232}, W:{x:36,y:232},
  SE:{x:388,y:388}, NE:{x:388,y:76}, SW:{x:76,y:388}, NW:{x:76,y:76},
};
function legHitRectHTML(leg){
  const r=LEG_HIT_RECTS[leg];
  if(!r)return'';
  return `<rect class="leg-hit" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10"
    onclick="openLegPopover('${leg}')"
    ><title>${leg} leg — click to configure crosswalk &amp; approach</title></rect>`;
}
// Mid-road positions for directional arrow overlays (between dot and intersection box)
const LEG_ARROW_MID = {
  N:{x:232,y:96},  S:{x:232,y:376},
  E:{x:376,y:232}, W:{x:96, y:232},
  SE:{x:352,y:352}, NE:{x:352,y:112},
  SW:{x:112,y:352}, NW:{x:112,y:112},
};
// Unit vector pointing AWAY from intersection for each leg (one-way-out direction)
const LEG_OUT_DIR = {
  N:[0,-1], S:[0,1], E:[1,0], W:[-1,0],
  SE:[0.707,0.707], NE:[0.707,-0.707],
  SW:[-0.707,0.707], NW:[-0.707,-0.707],
};
// Filled triangle arrowhead pointing in direction (dx,dy) centered at (cx,cy)
function arrowPolygon(cx,cy,dx,dy,size,cls){
  const tx=cx+dx*size, ty=cy+dy*size;
  const s2=size*0.65;
  // perpendicular: (-dy, dx)
  const b1x=cx-dx*s2-dy*s2, b1y=cy-dy*s2+dx*s2;
  const b2x=cx-dx*s2+dy*s2, b2y=cy-dy*s2-dx*s2;
  return `<polygon class="${cls}" points="${tx.toFixed(1)},${ty.toFixed(1)} ${b1x.toFixed(1)},${b1y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}"/>`;
}
function buildLegArrows(tpl){
  let html='';
  tpl.slots.forEach(leg=>{
    const pos=LEG_ARROW_MID[leg], dir=LEG_OUT_DIR[leg];
    if(!pos||!dir)return;
    if(intersection.oneWay[leg]){
      // one-way-out: arrow pointing away from intersection
      html+=arrowPolygon(pos.x,pos.y,dir[0],dir[1],13,'ow-arrow-out');
    }
    if(intersection.oneWayIn&&intersection.oneWayIn[leg]){
      // one-way-in: arrow pointing toward intersection (reverse direction)
      html+=arrowPolygon(pos.x,pos.y,-dir[0],-dir[1],13,'ow-arrow-in');
    }
  });
  return html;
}
function buildLegHitAreas(tpl){
  const cardinals=['N','E','S','W'].filter(l=>tpl.slots.includes(l)).map(legHitRectHTML).join('');
  const diagonal=tpl.slots.filter(l=>!['N','E','S','W'].includes(l)).map(legHitRectHTML).join('');
  return cardinals+diagonal;
}
function legDotHTML(leg){
  const pos=LEG_DOT_POS[leg];
  if(!pos)return'';
  const xw=intersection.crosswalks.some(c=>c.assign===leg);
  const app=intersection.approaches.some(a=>a.leg===leg&&a.destinations.length);
  const ow=!!intersection.oneWay[leg];
  const isOpen=window.getOpenLeg&&window.getOpenLeg()===leg;
  const configured=xw||app||ow;
  const fillCls=isOpen?'leg-dot-open':configured?'leg-dot-configured':'leg-dot-empty';
  const labelCls=isOpen?'on-dark':'on-light';
  const marks=[xw?'═':'',app?'▶':'',ow?'⊘':''].filter(Boolean).join(' ');
  return `<g class="leg-dot-group" tabindex="0" onclick="openLegPopover('${leg}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLegPopover('${leg}');}">
    <circle class="leg-dot ${fillCls}" cx="${pos.x}" cy="${pos.y}" r="15"/>
    <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central"
      class="leg-dot-label ${labelCls}">${leg}</text>
    ${marks?`<text x="${pos.x}" y="${pos.y+24}" text-anchor="middle" class="leg-dot-marks">${marks}</text>`:''}
  </g>`;
}
function buildLegDots(tpl){
  return tpl.slots.map(legDotHTML).join('');
}

// ═══════════════════════════════════════════
// LEG DETAIL DIAGRAM — zoomed view of one leg's destination arrows, for the leg
// detail panel. Gray + faded when a destination isn't in that leg's approach list,
// colored + clickable-to-toggle when it is, opacity transition handled in CSS so
// turning a destination on/off visibly fades the arrow in or out.
// ═══════════════════════════════════════════
const LEG_ENTRY={
  N:{x:215,y:192,dx:0,dy:1},  S:{x:249,y:272,dx:0,dy:-1},
  E:{x:272,y:215,dx:-1,dy:0}, W:{x:192,y:249,dx:1,dy:0},
  NE:{x:261,y:203,dx:-0.707,dy:0.707}, SE:{x:261,y:261,dx:-0.707,dy:-0.707},
  SW:{x:203,y:261,dx:0.707,dy:-0.707}, NW:{x:203,y:203,dx:0.707,dy:0.707},
};
const LEG_EXIT={
  N:{x:249,y:192,dx:0,dy:-1},  S:{x:215,y:272,dx:0,dy:1},
  E:{x:272,y:249,dx:1,dy:0},   W:{x:192,y:215,dx:-1,dy:0},
  NE:{x:261,y:191,dx:0.707,dy:-0.707}, SE:{x:273,y:261,dx:0.707,dy:0.707},
  SW:{x:191,y:261,dx:-0.707,dy:0.707}, NW:{x:191,y:191,dx:-0.707,dy:-0.707},
};
export function buildLegDestinationsSVG(leg){
  const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  if(!tpl.slots.includes(leg))return'';
  const ls=`stroke="var(--text3)" stroke-width="13" stroke-linecap="square" fill="none"`;
  const vN=`<line x1="192" y1="134" x2="192" y2="192" ${ls}/><line x1="272" y1="134" x2="272" y2="192" ${ls}/>`;
  const vS=`<line x1="192" y1="272" x2="192" y2="330" ${ls}/><line x1="272" y1="272" x2="272" y2="330" ${ls}/>`;
  const hW=`<line x1="134" y1="192" x2="192" y2="192" ${ls}/><line x1="134" y1="272" x2="192" y2="272" ${ls}/>`;
  const hE=`<line x1="272" y1="192" x2="330" y2="192" ${ls}/><line x1="272" y1="272" x2="330" y2="272" ${ls}/>`;
  const dSE=`<line x1="272" y1="272" x2="304" y2="304" ${ls}/>`;
  const dNE=`<line x1="272" y1="192" x2="304" y2="160" ${ls}/>`;
  const dSW=`<line x1="192" y1="272" x2="160" y2="304" ${ls}/>`;
  const dNW=`<line x1="192" y1="192" x2="160" y2="160" ${ls}/>`;
  let roads;
  if(tpl.id==='t3'){
    const ml=intersection.missingLeg||'S';
    const arms={N:vN,E:hE,S:vS,W:hW};
    roads=Object.entries(arms).filter(([k])=>k!==ml).map(([,v])=>v).join('');
  } else if(tpl.id==='t5'){
    const dl=intersection.diagLeg||'SE';
    const dmap={SE:dSE,NE:dNE,SW:dSW,NW:dNW};
    roads=vN+vS+hW+hE+(dmap[dl]||dSE);
  } else {
    roads=vN+vS+hW+hE;
  }
  const box=`<rect x="192" y="192" width="80" height="80" fill="var(--surface3)" stroke="var(--border)" stroke-width="1"/>`;
  const mkActive=`<marker id="lda-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--blue-text)"/></marker>`;
  const mkGray=`<marker id="lda-gray" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--text3)"/></marker>`;

  const app=intersection.approaches.find(a=>a.leg===leg);
  const activeSet=new Set(app?app.destinations:[]);
  const dests=tpl.slots.filter(d=>d!==leg&&!intersection.oneWayIn?.[d]);
  const en=LEG_ENTRY[leg];
  let arrows='';
  dests.forEach(d=>{
    const ex=LEG_EXIT[d];
    if(!en||!ex)return;
    const active=activeSet.has(d);
    // Control-point distance scales with how far apart the two legs actually are —
    // a fixed distance overshoots for legs only 45° apart (5-way's diagonal sitting
    // next to a cardinal), producing a looped/kinked curve instead of a clean turn.
    const dist=Math.hypot(ex.x-en.x,ex.y-en.y);
    const T=Math.min(48,dist*0.42);
    const c1x=en.x+en.dx*T, c1y=en.y+en.dy*T;
    const c2x=ex.x-ex.dx*T, c2y=ex.y-ex.dy*T;
    const cls=active?'leg-dest-arrow leg-dest-arrow-active':'leg-dest-arrow leg-dest-arrow-off';
    const mk=active?'url(#lda-active)':'url(#lda-gray)';
    arrows+=`<path class="${cls}" d="M${en.x},${en.y} C${c1x},${c1y} ${c2x},${c2y} ${ex.x},${ex.y}"
      fill="none" marker-end="${mk}"
      onclick="toggleApproachDestUnified('${leg}','${d}',${!active})"
      ><title>${active?'click to remove':'click to add'} turn to ${d}</title></path>`;
  });
  const crosswalkHTML=tpl.slots.map(crosswalkBandHTML).join('');
  const oneWayHTML=tpl.slots.map(oneWaySignHTML).join('');
  return `<svg viewBox="130 130 204 204" xmlns="http://www.w3.org/2000/svg" class="leg-dest-svg" role="img" aria-label="Destinations from leg ${leg}">
    <defs>${mkActive}${mkGray}</defs>
    ${roads}${box}${crosswalkHTML}${arrows}${oneWayHTML}
    <text x="${en?en.x:232}" y="${en?(en.y+(en.dy>0?-10:en.dy<0?10:0)):140}"
      text-anchor="middle" dominant-baseline="${en&&en.dy>0?'auto':'hanging'}"
      font-size="14" font-weight="700" fill="var(--blue-text)" font-family="var(--mono)">${leg}</text>
  </svg>`;
}

// Light striped band across a leg's stub when that leg has a crosswalk configured —
// reuses the same SLOT_GEOM zone rects the counting-screen popup diagram uses, since
// this mini-diagram shares its coordinate space (just viewBox-cropped to the box area).
function crosswalkBandHTML(leg){
  if(!intersection.crosswalks.some(c=>c.assign===leg))return'';
  const g=SLOT_GEOM[leg];
  if(!g)return'';
  const n=4;
  let ticks='';
  if(g.horiz){
    for(let i=0;i<n;i++){
      const tx=g.zone.x+(g.zone.w/n)*(i+0.5);
      ticks+=`<line x1="${tx}" y1="${g.zone.y+4}" x2="${tx}" y2="${g.zone.y+g.zone.h-4}" stroke="var(--surface2)" stroke-width="3.5"/>`;
    }
  } else {
    for(let i=0;i<n;i++){
      const ty=g.zone.y+(g.zone.h/n)*(i+0.5);
      ticks+=`<line x1="${g.zone.x+4}" y1="${ty}" x2="${g.zone.x+g.zone.w-4}" y2="${ty}" stroke="var(--surface2)" stroke-width="3.5"/>`;
    }
  }
  const transform=g.zone.rot?` transform="rotate(${g.zone.rot} ${g.zone.cx} ${g.zone.cy})"`:'';
  return `<g${transform}>
    <rect x="${g.zone.x}" y="${g.zone.y}" width="${g.zone.w}" height="${g.zone.h}" rx="3" fill="var(--ped0-bg)" stroke="var(--ped0-bd)" stroke-width="1"/>
    ${ticks}
  </g>`;
}

// "Do not enter" sign at a one-way-IN leg's stub — signals this leg can't be a destination.
// One-way-OUT legs are still valid destinations so get no sign here.
function oneWaySignHTML(leg){
  if(!intersection.oneWayIn?.[leg])return'';
  const en=LEG_ENTRY[leg];
  if(!en)return'';
  const dist=46;
  const sx=en.x-en.dx*dist, sy=en.y-en.dy*dist;
  return `<g><title>${leg} is one-way in — vehicles enter only, not a valid turn destination</title>
    <circle cx="${sx}" cy="${sy}" r="11" fill="#c0392b" stroke="#fff" stroke-width="1.5"/>
    <rect x="${sx-7}" y="${sy-2}" width="14" height="4" fill="#fff" rx="1"/>
  </g>`;
}

// ═══════════════════════════════════════════
// TURNING DIAGRAM SVG (inline, used in cfg panel + popup)
// ═══════════════════════════════════════════
export function buildTurningDiagramSVG(app, focusIdx){
  if(!app) return '';
  const dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  const roadClr=dark?'rgba(255,255,255,0.22)':'rgba(0,0,0,0.20)';
  const textClr=dark?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.40)';
  const boxFill=dark?'#2a2a28':'#f0efe9';

  const ls=`stroke="${roadClr}" stroke-width="14" stroke-linecap="square" fill="none"`;
  const vN=`<line x1="192" y1="134" x2="192" y2="192" ${ls}/><line x1="272" y1="134" x2="272" y2="192" ${ls}/>`;
  const vS=`<line x1="192" y1="272" x2="192" y2="330" ${ls}/><line x1="272" y1="272" x2="272" y2="330" ${ls}/>`;
  const hW=`<line x1="134" y1="192" x2="192" y2="192" ${ls}/><line x1="134" y1="272" x2="192" y2="272" ${ls}/>`;
  const hE=`<line x1="272" y1="192" x2="330" y2="192" ${ls}/><line x1="272" y1="272" x2="330" y2="272" ${ls}/>`;
  const dSE=`<line x1="272" y1="272" x2="304" y2="304" ${ls}/>`;
  const dNE=`<line x1="272" y1="192" x2="304" y2="160" ${ls}/>`;
  const dSW=`<line x1="192" y1="272" x2="160" y2="304" ${ls}/>`;
  const dNW=`<line x1="192" y1="192" x2="160" y2="160" ${ls}/>`;

  const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  let roads;
  if(tpl.id==='t3'){
    const ml=intersection.missingLeg||'S';
    const arms={N:vN,E:hE,S:vS,W:hW};
    roads=Object.entries(arms).filter(([k])=>k!==ml).map(([,v])=>v).join('');
  } else if(tpl.id==='t5'){
    const dl=intersection.diagLeg||'SE';
    const dmap={SE:dSE,NE:dNE,SW:dSW,NW:dNW};
    roads=vN+vS+hW+hE+(dmap[dl]||dSE);
  } else {
    roads=vN+vS+hW+hE;
  }
  const box=`<rect x="192" y="192" width="80" height="80" fill="${boxFill}" stroke="${roadClr}" stroke-width="1"/>`;

  const cl=`stroke="${roadClr}" stroke-width="0.8" stroke-dasharray="4,4" fill="none"`;
  const clN=`<line x1="232" y1="134" x2="232" y2="192" ${cl}/>`;
  const clS=`<line x1="232" y1="272" x2="232" y2="330" ${cl}/>`;
  const clW=`<line x1="134" y1="232" x2="192" y2="232" ${cl}/>`;
  const clE=`<line x1="272" y1="232" x2="330" y2="232" ${cl}/>`;
  const clLines=tpl.id==='t3'?'':clN+clS+clW+clE;

  const mkA=`<marker id="arh-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--blue-text)"/></marker>`;
  const mkG=`<marker id="arh-g" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${textClr}"/></marker>`;

  const ENTRY={
    N:{x:215,y:192,dx:0,dy:1},  S:{x:249,y:272,dx:0,dy:-1},
    E:{x:272,y:215,dx:-1,dy:0}, W:{x:192,y:249,dx:1,dy:0},
    NE:{x:261,y:203,dx:-0.707,dy:0.707}, SE:{x:261,y:261,dx:-0.707,dy:-0.707},
    SW:{x:203,y:261,dx:0.707,dy:-0.707}, NW:{x:203,y:203,dx:0.707,dy:0.707},
  };
  const EXIT={
    N:{x:249,y:192,dx:0,dy:-1},  S:{x:215,y:272,dx:0,dy:1},
    E:{x:272,y:249,dx:1,dy:0},   W:{x:192,y:215,dx:-1,dy:0},
    NE:{x:261,y:191,dx:0.707,dy:-0.707}, SE:{x:273,y:261,dx:0.707,dy:0.707},
    SW:{x:191,y:261,dx:-0.707,dy:0.707}, NW:{x:191,y:191,dx:-0.707,dy:-0.707},
  };

  const totals=app.destinations.map(d=>
    Array.from({length:cfg.slots},(_,ri)=>(tmcData[app.leg]&&tmcData[app.leg][d]&&tmcData[app.leg][d][ri]||[]).reduce((a,b)=>a+b,0)).reduce((a,b)=>a+b,0)
  );

  let arrows='';
  app.destinations.forEach((d,i)=>{
    const en=ENTRY[app.leg]; const ex=EXIT[d];
    if(!en||!ex)return;
    const active=i===focusIdx;
    // See buildLegDestinationsSVG for why this is adaptive rather than a fixed 48 —
    // same overshoot/kink bug for legs that are only 45° apart (5-way's diagonal).
    const dist=Math.hypot(ex.x-en.x,ex.y-en.y);
    const T=Math.min(48,dist*0.42);
    const c1x=en.x+en.dx*T, c1y=en.y+en.dy*T;
    const c2x=ex.x-ex.dx*T, c2y=ex.y-ex.dy*T;
    const clr=active?'var(--blue-text)':textClr;
    const sw=active?3:1.8;
    const mk=active?'url(#arh-a)':'url(#arh-g)';
    arrows+=`<path d="M${en.x},${en.y} C${c1x},${c1y} ${c2x},${c2y} ${ex.x},${ex.y}"
      stroke="${clr}" stroke-width="${sw}" fill="none" marker-end="${mk}" opacity="${active?1:0.5}"/>`;
    const tot=totals[i];
    const lx=(en.x*0.15+c1x*0.35+c2x*0.35+ex.x*0.15);
    const ly=(en.y*0.15+c1y*0.35+c2y*0.35+ex.y*0.15);
    if(tot>0||active){
      arrows+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
        font-size="${active?13:10}" font-weight="${active?700:400}" fill="${active?'var(--blue-text)':textClr}"
        font-family="var(--mono)" paint-order="stroke" stroke="${boxFill}" stroke-width="3">${tot||''}</text>`;
    }
  });

  const en=ENTRY[app.leg];
  return `<svg viewBox="130 130 204 204" xmlns="http://www.w3.org/2000/svg" tabindex="-1" style="width:100%;height:100%;pointer-events:none;outline:none">
    <defs>${mkA}${mkG}</defs>
    ${roads}${clLines}${box}${arrows}
    <text x="${en?en.x:232}" y="${en?(en.y+(en.dy>0?-10:en.dy<0?10:0)+(en.dx>0?0:en.dx<0?0:0)):140}"
      text-anchor="middle" dominant-baseline="${en&&en.dy>0?'auto':'hanging'}"
      font-size="14" font-weight="700" fill="var(--blue-text)" font-family="var(--mono)">${app.leg}</text>
  </svg>`;
}

// Template-specific road geometry SVG strings (white on transparent) — used in popup builders
function templateRoadSVG(tplId, roadStroke, compassColor){
  const lc=roadStroke||'rgba(255,255,255,0.28)';
  const cc=compassColor||'rgba(255,255,255,0.35)';
  const ls=`stroke="${lc}" stroke-width="1.5"`;
  const ib=`fill="${lc}" fill-opacity="0.06" stroke="${lc}" stroke-opacity="0.5" stroke-width="0.5"`;
  const cmp=(x,y,t)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="${cc}" font-family="monospace">${t}</text>`;
  const vN=`<line x1="192" y1="0" x2="192" y2="192" ${ls}/><line x1="272" y1="0" x2="272" y2="192" ${ls}/>`;
  const vS=`<line x1="192" y1="272" x2="192" y2="480" ${ls}/><line x1="272" y1="272" x2="272" y2="480" ${ls}/>`;
  const hW=`<line x1="0" y1="192" x2="192" y2="192" ${ls}/><line x1="0" y1="272" x2="192" y2="272" ${ls}/>`;
  const hE=`<line x1="272" y1="192" x2="464" y2="192" ${ls}/><line x1="272" y1="272" x2="464" y2="272" ${ls}/>`;
  const box=`<rect x="192" y="192" width="80" height="80" ${ib}/>`;
  const diagSE=`<line x1="272" y1="272" x2="400" y2="400" ${ls}/><line x1="272" y1="320" x2="352" y2="400" ${ls}/>`;
  const diagNE=`<line x1="272" y1="192" x2="400" y2="64"  ${ls}/><line x1="272" y1="144" x2="352" y2="64"  ${ls}/>`;
  const diagSW=`<line x1="192" y1="272" x2="64"  y2="400" ${ls}/><line x1="192" y1="320" x2="112" y2="400" ${ls}/>`;
  const diagNW=`<line x1="192" y1="192" x2="64"  y2="64"  ${ls}/><line x1="192" y1="144" x2="112" y2="64"  ${ls}/>`;
  const diagMap={SE:diagSE,NE:diagNE,SW:diagSW,NW:diagNW};
  const diagCmp={SE:cmp(392,392,'SE'),NE:cmp(392,52,'NE'),SW:cmp(52,396,'SW'),NW:cmp(52,52,'NW')};
  switch(tplId){
    case 't4': return vN+vS+hW+hE+box+cmp(232,16,'N')+cmp(232,476,'S')+cmp(12,196,'W')+cmp(452,196,'E');
    case 't3':{
      const ml=intersection.missingLeg||'S';
      const arms={N:vN,E:hE,S:vS,W:hW};
      const labels={N:cmp(232,16,'N'),E:cmp(452,196,'E'),S:cmp(232,476,'S'),W:cmp(12,196,'W')};
      return ['N','E','S','W'].filter(l=>l!==ml).map(l=>arms[l]).join('')+box+['N','E','S','W'].filter(l=>l!==ml).map(l=>labels[l]).join('');
    }
    case 't5':{
      const dl=intersection.diagLeg||'SE';
      return vN+vS+hW+hE+(diagMap[dl]||diagSE)+box+cmp(232,16,'N')+cmp(232,476,'S')+cmp(12,196,'W')+cmp(452,196,'E')+(diagCmp[dl]||diagCmp.SE);
    }
    default: return templateRoadSVG('t4');
  }
}

export function pedCountsForSlot(){
  return window.pedPairs.map((p,xi)=>{
    const row=pedData[xi]&&pedData[xi][slot]?pedData[xi][slot]:[0,0];
    return [row[0],row[1]];
  });
}

// ═══════════════════════════════════════════
// CROSSWALK DIAGRAM POPUP (HTML builder)
// ═══════════════════════════════════════════
export function buildDiagramHTML(){
  const tpl=TEMPLATES.find(t=>t.id===window.pedTemplate)||TEMPLATES[1];
  const dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  const bg=dark?'#242420':'#ffffff';
  const fg=dark?'#f0efe9':'#1a1a18';
  const fg2=dark?'#a0a090':'#6b6960';
  const fg3=dark?'#6b6960':'#9b9890';
  const bd=dark?'#3a3a34':'#e0ddd5';
  const surf2=dark?'#2e2e2a':'#f0efe9';
  const roadStroke=dark?'rgba(240,239,233,0.32)':'rgba(26,26,24,0.30)';
  const roadSVG=templateRoadSVG(window.pedTemplate,roadStroke,fg3);
  let arrowsSVG='', zonesSVG='', badgesSVG='';
  const SLOT_BADGE_T5_POPUP = {
    SE:{N:{bx:2,by:2,tx:14},   E:{bx:262,by:2,tx:274},   W:{bx:2,by:188,tx:14},   S:{bx:2,by:374,tx:14},   SE:{bx:262,by:374,tx:274}},
    NE:{N:{bx:2,by:2,tx:14},   NE:{bx:262,by:2,tx:274},  E:{bx:262,by:188,tx:274},W:{bx:2,by:374,tx:14},   S:{bx:262,by:374,tx:274}},
    SW:{N:{bx:2,by:2,tx:14},   E:{bx:262,by:2,tx:274},   W:{bx:2,by:188,tx:14},   SW:{bx:2,by:374,tx:14},  S:{bx:262,by:374,tx:274}},
    NW:{NW:{bx:2,by:2,tx:14},  N:{bx:262,by:2,tx:274},   E:{bx:262,by:188,tx:274},S:{bx:262,by:374,tx:274},W:{bx:2,by:374,tx:14}},
  };
  const SLOT_BADGE = (window.pedTemplate==='t5')
    ? (SLOT_BADGE_T5_POPUP[intersection.diagLeg]||SLOT_BADGE_T5_POPUP.SE)
    : {N:{bx:2,by:2,tx:14}, E:{bx:262,by:2,tx:274}, S:{bx:262,by:374,tx:274}, W:{bx:2,by:374,tx:14}};
  const fallbackCorners=[{bx:2,by:2,tx:14},{bx:262,by:2,tx:274},{bx:2,by:374,tx:14},{bx:262,by:374,tx:274},{bx:2,by:188,tx:14},{bx:262,by:188,tx:274}];
  let badgeFallback=0;
  window.pedPairs.forEach((p,i)=>{
    const slotId=p.assign||tpl.slots[i]||'N';
    const g=SLOT_GEOM[slotId];
    const c=DIAG_COLORS[i]||DIAG_COLORS[0];
    const k0=p.key0===';'?';':p.key0.toUpperCase();
    const k1=p.key1===';'?';':p.key1.toUpperCase();
    if(g && tpl.slots.includes(slotId)){
      const zt=g.zone.rot?` transform="rotate(${g.zone.rot} ${g.zone.cx} ${g.zone.cy})"`:'';
      zonesSVG+=`<rect x="${g.zone.x}" y="${g.zone.y}" width="${g.zone.w}" height="${g.zone.h}" rx="4" fill="${c.zone}"${zt}/>`;
    }
    const bc=SLOT_BADGE[slotId]||fallbackCorners[badgeFallback++]||fallbackCorners[0];
    const arrow0=g&&g.horiz?'→':'↑', arrow1=g&&g.horiz?'←':'↓';
    const nameCol = dark?c.nc:c.mid;
    const k0col = dark?c.k0:c.mid;
    const k1col = dark?c.k1:c.mid;
    const dirTextCol = fg2;
    const cnt0=pedData[i]&&pedData[i][slot]?pedData[i][slot][0]:0;
    const cnt1=pedData[i]&&pedData[i][slot]?pedData[i][slot][1]:0;
    const BW=200, BH=104;
    const countX=bc.bx+BW-14;
    badgesSVG+=`
      <rect id="dbbg-${i}" x="${bc.bx}" y="${bc.by}" width="${BW}" height="${BH}" rx="10" fill="${c.zone}" stroke="${c.bs}" stroke-width="1"/>
      <text id="dbn-${i}" x="${bc.tx}" y="${bc.by+24}" font-size="14" fill="${nameCol}" font-family="monospace" font-weight="700">${p.name}</text>
      <line x1="${bc.bx+14}" y1="${bc.by+34}" x2="${bc.bx+BW-14}" y2="${bc.by+34}" stroke="${c.bs}" stroke-width="0.5" opacity="0.5"/>
      <text id="dbk0-${i}" x="${bc.tx}" y="${bc.by+62}" font-size="28" fill="${k0col}" font-family="monospace" font-weight="700">${k0}</text>
      <text id="dbd0-${i}" x="${bc.tx+38}" y="${bc.by+62}" font-size="15" fill="${dirTextCol}" font-family="monospace" font-weight="600">${p.dir0} ${arrow0}</text>
      <text id="dbc0-${i}" x="${countX}" y="${bc.by+62}" font-size="22" fill="${nameCol}" font-family="monospace" font-weight="700" text-anchor="end">${cnt0}</text>
      <text id="dbk1-${i}" x="${bc.tx}" y="${bc.by+94}" font-size="28" fill="${k1col}" font-family="monospace" font-weight="700">${k1}</text>
      <text id="dbd1-${i}" x="${bc.tx+38}" y="${bc.by+94}" font-size="15" fill="${dirTextCol}" font-family="monospace" font-weight="600">${p.dir1} ${arrow1}</text>
      <text id="dbc1-${i}" x="${countX}" y="${bc.by+94}" font-size="22" fill="${nameCol}" font-family="monospace" font-weight="700" text-anchor="end">${cnt1}</text>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Crosswalk Reference</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${bg};color:${fg};width:100%;height:100%;overflow:hidden}
.wrap{display:flex;flex-direction:column;height:100vh;padding:12px}
.bar{display:flex;align-items:center;gap:6px;padding-bottom:8px;margin-bottom:6px;border-bottom:0.5px solid ${bd};flex-wrap:wrap}
.title{font-size:10px;font-weight:500;color:${fg2};letter-spacing:.08em;text-transform:uppercase;font-family:monospace;flex:1}
.interval{font-size:15px;font-weight:700;color:${fg};font-variant-numeric:tabular-nums;font-family:monospace}
.close-btn{background:${surf2};border:0.5px solid ${bd};border-radius:50%;width:22px;height:22px;color:${fg2};font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.close-btn:hover{background:${bd}}
svg{flex:1;width:100%}
.focus-ctrl{display:none;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;background:rgba(59,130,246,0.12);border:0.5px solid rgba(59,130,246,0.35)}
.focus-ctrl.on{display:flex}
.fc-label{font-size:10px;font-weight:600;color:#3b82f6;letter-spacing:.05em;text-transform:uppercase}
.fc-btn{background:${surf2};border:0.5px solid ${bd};border-radius:4px;padding:2px 7px;font-size:12px;color:${fg};cursor:pointer;font-family:monospace}
.fc-btn:hover{background:${bd}}
.fc-chip{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:0.5px solid ${bd};background:${surf2};color:${fg2};font-family:monospace}
.fc-chip.active{background:rgba(59,130,246,0.15);border-color:#3b82f6;color:#3b82f6}
.focus-toggle{font-size:11px;padding:3px 10px;border:.5px solid ${bd};border-radius:4px;background:${surf2};color:${fg2};cursor:pointer;font-family:monospace}
.focus-toggle.on{background:rgba(59,130,246,0.15);border-color:#3b82f6;color:#3b82f6;font-weight:600}
</style></head><body>
<div class="wrap">
  <div class="bar">
    <span class="title">crosswalk reference &nbsp;·&nbsp; ${tpl.name}</span>
    <span class="interval" id="diag-interval">${slotLabel(slot)}</span>
    <button class="focus-toggle" id="focus-toggle-btn" onclick="sendControl('toggle-focus')">○ focus</button>
    <div class="focus-ctrl" id="focus-ctrl">
      <span class="fc-label">focus</span>
      <button class="fc-btn" onclick="sendControl('prev')">‹</button>
      <span id="focus-chips-wrap" style="display:flex;gap:4px"></span>
      <button class="fc-btn" onclick="sendControl('next')">›</button>
    </div>
    <button class="close-btn" onclick="window.close()">×</button>
  </div>
  <svg viewBox="0 0 464 480" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="daw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M1 1.5L8 5L1 8.5" fill="none" stroke="context-stroke" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </marker>
    </defs>
    ${roadSVG}
    ${zonesSVG}
    ${arrowsSVG}
    ${badgesSVG}
  </svg>
</div>
${'<'+'script>'}
const timers={};
function updateCounts(counts){
  if(!counts)return;
  counts.forEach((pair,xi)=>{
    const c0=document.getElementById('dbc0-'+xi);
    const c1=document.getElementById('dbc1-'+xi);
    if(c0)c0.textContent=pair[0];
    if(c1)c1.textContent=pair[1];
  });
}
let focusState={on:false,xi:-1,n:0};
let xwalkNames=[];
function sendControl(action,xi){
  if(window.opener)window.opener.postMessage({type:'diag-control',action,xi},'*');
}
function applyFocus(d){
  focusState={on:d.on,xi:d.xi,n:d.n||focusState.n};
  const ftBtn=document.getElementById('focus-toggle-btn');
  const fCtrl=document.getElementById('focus-ctrl');
  const chips=document.getElementById('focus-chips-wrap');
  if(ftBtn){ftBtn.className='focus-toggle'+(d.on?' on':'');ftBtn.textContent=d.on?'◎ focus on':'○ focus';}
  if(fCtrl)fCtrl.className='focus-ctrl'+(d.on?' on':'');
  if(chips&&d.n>0){
    chips.innerHTML='';
    for(let i=0;i<d.n;i++){
      const sp=document.createElement('span');
      sp.className='fc-chip'+(d.on&&i===d.xi?' active':'');
      sp.textContent=xwalkNames[i]||('X'+(i+1));
      const _i=i;
      sp.onclick=()=>sendControl('select',_i);
      chips.appendChild(sp);
    }
  }
  const total=document.querySelectorAll('[id^="dbbg-"]').length;
  for(let i=0;i<total;i++){
    const bg=document.getElementById('dbbg-'+i);
    const dimmed=d.on&&i!==d.xi;
    if(bg){bg.style.opacity=dimmed?'0.18':'1';bg.style.transition='opacity .2s';
      if(!dimmed&&d.on){bg.style.filter='drop-shadow(0 0 4px rgba(59,130,246,0.5))';}
      else{bg.style.filter='';}}
    ['dbn-','dbk0-','dbd0-','dbc0-','dbk1-','dbd1-','dbc1-'].forEach(p=>{
      const el=document.getElementById(p+i);
      if(el){el.style.opacity=dimmed?'0.15':'1';el.style.transition='opacity .2s';}
    });
  }
}
window.addEventListener('keydown',e=>{
  if(window.opener&&!window.opener.closed){
    e.preventDefault();
    window.opener.postMessage({type:'kbd-passthrough',key:e.key},'*');
  }
});
window.addEventListener('message',e=>{
  const d=e.data;
  if(!d)return;
  const intEl=document.getElementById('diag-interval');
  if(intEl&&d.interval)intEl.textContent=d.interval;
  if(d.counts)updateCounts(d.counts);
  if(d.names)xwalkNames=d.names;
  if(d.type==='focus'){
    applyFocus(d);
    return;
  }
  if(d.type!=='flash')return;
  const {xi,di,dur}=d;
  if(xi<0)return;
  const key=xi+'-'+di;
  if(timers[key])clearTimeout(timers[key]);
  const cnt=document.getElementById('dbc'+di+'-'+xi);
  if(cnt){
    cnt.setAttribute('data-flash','1');
    cnt.style.transition='none';
    cnt.style.fontSize='28px';
    cnt.style.opacity='1';
    timers[key]=setTimeout(()=>{
      cnt.style.transition='font-size .3s ease-out';
      cnt.style.fontSize='22px';
    },dur);
  }
});
${'<'+'/script>'}
</div>
</body></html>`;
}

export function updateDiagram(){
  if(!diagWin||diagWin.closed)return;
  const htmlStr=buildDiagramHTML();
  const blob=new Blob([htmlStr],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  diagWin.location.replace(url);
  Object.keys(diagTimers).forEach(k=>{ if(diagTimers[k])clearTimeout(diagTimers[k]); delete diagTimers[k]; });
}

window.addEventListener('message',e=>{
  if(e.data?.type==='diag-control'&&mode==='ped'){
    const {action,xi}=e.data;
    if(action==='toggle-focus')window.toggleFocusMode();
    else if(action==='prev')window.cycleFocus(-1);
    else if(action==='next')window.cycleFocus(1);
    else if(action==='select'&&xi!=null)window.setFocusTarget(xi);
  }
});

export function toggleDiagram(){
  if(diagWin&&!diagWin.closed){diagWin.focus();return;}
  const htmlStr=buildDiagramHTML();
  const blob=new Blob([htmlStr],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const win=window.open(url,'crosswalkDiagram','width=520,height=600,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no');
  if(!win){alert('Please allow popups for this page to open the crosswalk diagram.');return;}
  setDiagWin(win);
  window.updateFocusBanner&&window.updateFocusBanner();
  win.onbeforeunload=()=>{setDiagWin(null); URL.revokeObjectURL(url); window.updateFocusBanner&&window.updateFocusBanner();};
}

// ═══════════════════════════════════════════
// TMC DATA HELPERS + TURNING DIAGRAM POPUP
// ═══════════════════════════════════════════
export function tmcCountsForSlot(){
  const result={};
  intersection.approaches.forEach(app=>{
    result[app.leg]={};
    app.destinations.forEach(d=>{
      result[app.leg][d]=(tmcData[app.leg]&&tmcData[app.leg][d]&&tmcData[app.leg][d][slot])||
        Array(vPairs.length).fill(0);
    });
  });
  return result;
}

export function tmcPopupPayload(){
  const app=intersection.approaches.find(a=>a.leg===tmcApproach);
  if(!app)return null;
  const svgStr=buildTurningDiagramSVG(app,focusTarget);
  return {
    type:'tmcUpdate',
    svgContent:svgStr,
    approach:tmcApproach,
    approachLabel:legLabel(tmcApproach),
    focusIdx:focusTarget,
    interval:slotLabel(slot),
    approaches:intersection.approaches.map(a=>a.leg),
    vLabels:tmcPairs.map(p=>p.label),
    dests:app.destinations,
    destLabels:app.destinations.map(d=>destLabel(app.leg,d)),
    clsLabels:app.destinations.map(d=>''),
    counts:tmcCountsForSlot(),
  };
}

export function buildTurningPopupHTML(){
  const dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  const bg=dark?'#242420':'#ffffff';
  const fg=dark?'#f0efe9':'#1a1a18';
  const fg2=dark?'#a0a090':'#6b6960';
  const bd=dark?'#3a3a34':'#e0ddd5';
  const surf=dark?'#2e2e2a':'#f4f3ec';
  const surf2=dark?'#383834':'#e8e7e0';
  const blue=dark?'#60a5fa':'#2563eb';
  const blueBg=dark?'rgba(96,165,250,.15)':'rgba(37,99,235,.08)';
  const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  const payload=tmcPopupPayload();
  const initData=payload?JSON.stringify(payload):'null';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Turning Reference</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${bg};color:${fg};width:100%;height:100%;overflow:hidden;font-family:-apple-system,sans-serif}
.focus-warn{display:none;position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;font-size:12px;font-weight:500;text-align:center;padding:6px;z-index:99}
.focus-warn.visible{display:block}
.wrap{display:flex;flex-direction:column;height:100vh;padding:10px;gap:8px}
.bar{display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:.5px solid ${bd};flex-shrink:0}
.title{font-size:10px;font-weight:600;color:${fg2};letter-spacing:.08em;text-transform:uppercase;font-family:monospace;flex:1}
.interval-badge{font-size:14px;font-weight:700;color:${fg};font-variant-numeric:tabular-nums;font-family:monospace;
  background:${surf2};border:.5px solid ${bd};border-radius:4px;padding:2px 8px}
.close-btn{background:${surf};border:.5px solid ${bd};border-radius:50%;width:22px;height:22px;color:${fg2};
  font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.close-btn:hover{background:${bd}}
.body{display:flex;gap:10px;flex:1;min-height:0}
.diag-wrap{width:230px;flex-shrink:0;border:.5px solid ${bd};border-radius:6px;overflow:hidden}
.diag-wrap svg{width:100%;height:100%}
.table-wrap{flex:1;min-width:0;overflow:auto}
.approach-label{font-size:20px;font-weight:700;font-family:monospace;color:${blue};margin-bottom:6px}
table{border-collapse:collapse;width:100%;font-family:monospace;font-size:12px}
th{background:${surf};color:${fg2};font-size:10px;font-weight:600;text-transform:uppercase;
   letter-spacing:.05em;padding:4px 8px;border-bottom:.5px solid ${bd};white-space:nowrap}
th.dest-th{text-align:center;border-left:.5px solid ${bd}}
td{padding:4px 8px;border-bottom:.5px solid ${bd};white-space:nowrap}
td.type-label{color:${fg2};font-size:11px}
td.count{text-align:center;font-variant-numeric:tabular-nums;border-left:.5px solid ${bd};min-width:36px}
td.count.active{background:${blueBg};color:${blue};font-weight:700}
tr.tot-row td{font-weight:700;background:${surf};border-top:.5px solid ${bd}}
.cls-badge{font-size:9px;color:${fg2};display:block;margin-top:1px;font-weight:400}
.active-banner{font-size:13px;font-weight:700;color:${blue};font-family:monospace;
  background:${blueBg};border:.5px solid ${bd};border-radius:4px;padding:2px 10px;white-space:nowrap}
</style></head><body>
<div class="focus-warn" id="focus-warn">⚠ window not focused — keystrokes will not register · click here to resume</div>
<div class="wrap">
  <div class="bar">
    <span class="title">turning reference &nbsp;·&nbsp; ${tpl.name}</span>
    <span class="active-banner" id="active-banner">–</span>
    <span class="interval-badge" id="diag-interval">–</span>
    <button class="close-btn" onclick="window.close()">×</button>
  </div>
  <div class="body">
    <div class="diag-wrap" id="diag-svg-wrap"></div>
    <div class="table-wrap">
      <div class="approach-label" id="app-label">–</div>
      <table id="count-table"><thead id="tbl-head"></thead><tbody id="tbl-body"></tbody></table>
    </div>
  </div>
</div>
${'<'+'script>'}
let state=${initData};
function render(d){
  if(!d)return;
  state=d;
  document.getElementById('diag-interval').textContent=d.interval||'–';
  const appDisplay=d.approachLabel||d.approach||'–';
  document.getElementById('app-label').textContent=appDisplay;
  const activeMov=d.focusIdx>=0&&d.destLabels?d.destLabels[d.focusIdx]:'–';
  const banner=document.getElementById('active-banner');
  if(banner)banner.textContent=(appDisplay&&activeMov!=='–')?(appDisplay+' → '+activeMov):'–';
  const sw=document.getElementById('diag-svg-wrap');
  if(sw&&d.svgContent)sw.innerHTML=d.svgContent;
  const th=document.getElementById('tbl-head');
  const tb=document.getElementById('tbl-body');
  if(!th||!tb||!d.dests)return;
  let hRow='<tr><th>type</th>';
  d.dests.forEach((dest,di)=>{
    const active=di===d.focusIdx?' class="dest-th" style="background:${blueBg}"':'class="dest-th"';
    hRow+=\`<th \${active} style="white-space:normal;max-width:90px">\${d.destLabels[di]||dest}</th>\`;
  });
  hRow+='<th class="dest-th">tot</th></tr>';
  th.innerHTML=hRow;
  const nTypes=d.vLabels?d.vLabels.length:0;
  const typeTots=Array(d.dests.length).fill(0);
  let rows='';
  for(let ti=0;ti<nTypes;ti++){
    rows+='<tr><td class="type-label">'+d.vLabels[ti]+'</td>';
    let rowTot=0;
    d.dests.forEach((dest,di)=>{
      const cnt=(d.counts&&d.counts[d.approach]&&d.counts[d.approach][dest]&&d.counts[d.approach][dest][ti])||0;
      typeTots[di]+=cnt; rowTot+=cnt;
      const active=di===d.focusIdx?' active':'';
      rows+=\`<td class="count\${active}">\${cnt||''}</td>\`;
    });
    rows+=\`<td class="count">\${rowTot||''}</td></tr>\`;
  }
  rows+='<tr class="tot-row"><td class="type-label">total</td>';
  let grandTot=0;
  typeTots.forEach((t,di)=>{
    const active=di===d.focusIdx?' active':'';
    grandTot+=t;
    rows+=\`<td class="count\${active}">\${t||''}</td>\`;
  });
  rows+=\`<td class="count">\${grandTot||''}</td></tr>\`;
  tb.innerHTML=rows;
}
const fw=document.getElementById('focus-warn');
window.addEventListener('focus',()=>{
  fw.classList.remove('visible');
  if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'popup-focus'},'*');
});
window.addEventListener('blur',()=>{
  fw.classList.add('visible');
  if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'popup-blur'},'*');
});
window.addEventListener('keydown',e=>{
  if(window.opener&&!window.opener.closed){
    e.preventDefault();
    window.opener.postMessage({type:'kbd-passthrough',key:e.key},'*');
  }
});
window.addEventListener('message',e=>{
  const d=e.data;
  if(!d||d.type!=='tmcUpdate')return;
  render(d);
});
if(state)render(state);
${'<'+'/script>'}
</body></html>`;
}

export function toggleTurningDiagram(){
  if(tmcWin&&!tmcWin.closed){tmcWin.focus();return;}
  const htmlStr=buildTurningPopupHTML();
  const blob=new Blob([htmlStr],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const win=window.open(url,'turningDiagram','width=600,height=420,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no');
  if(!win){alert('Please allow popups for this page to open the turning diagram.');return;}
  setTmcWin(win);
  window.updateFocusBanner&&window.updateFocusBanner();
  win.onbeforeunload=()=>{setTmcWin(null);URL.revokeObjectURL(url);window.updateCfgFields&&window.updateCfgFields();window.updateFocusBanner&&window.updateFocusBanner();};
  setTimeout(()=>{
    if(win&&!win.closed){
      const p=tmcPopupPayload();
      if(p)win.postMessage(p,'*');
    }
    window.updateCfgFields&&window.updateCfgFields();
  },400);
}
