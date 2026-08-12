import {
  TEMPLATES, PED_COLORS, cfg, vPairs, setVPairs, intersection,
  fnames, customInterval, setCustomInterval, setXwalkAssign,
  vData, pedData, tmcData, periods, activePeriodIdx,
} from './state.js';
import { classifyTurn, renderSetupDiagram, buildLegDestinationsSVG } from './diagram.js';
import { startCounting, goSetup } from './counter.js';

// ═══════════════════════════════════════════
// SETUP SCREEN LOGIC
// ═══════════════════════════════════════════
export function switchSetupTab(name,btn){
  document.querySelectorAll('.setup-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.setup-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sp-'+name).classList.add('active');
}

// interval pills
export function setIntervalLen(v,btn){
  document.querySelectorAll('.ipill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const ci=document.getElementById('custom-interval');
  if(v==='custom'){ci.style.display='block';setCustomInterval(parseInt(ci.value)||15);}
  else{ci.style.display='none';setCustomInterval(v);}
  updateDerived();
}

export function updateDerived(){
  const sv=document.getElementById('set-start').value||'00:00';
  const[sh,sm]=sv.split(':').map(Number);
  const startMin=sh*60+(sm||0);
  const intMin=customInterval||15;
  const dh=parseInt(document.getElementById('set-dur-h').value)||0;
  const dm=parseInt(document.getElementById('set-dur-m').value)||0;
  const durMin=Math.max(intMin,dh*60+dm);
  const slots=Math.max(1,Math.round(durMin/intMin));
  const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  document.getElementById('derived-preview').innerHTML=
    `<strong>${slots} interval${slots!==1?'s':''}</strong> &nbsp;·&nbsp; ${fmt(startMin)} to ${fmt(startMin+durMin)} &nbsp;·&nbsp; ${intMin}-min intervals`;
}

// vehicle pairs in setup
export function updateVCount(n){
  const G1_IN=['a','s','d','f'], G1_OUT=['j','k','l',';'];
  while(vPairs.length<n){
    const gi=vPairs.length%4;
    vPairs.push({label:`type ${vPairs.length+1}`,def:'',inKey:G1_IN[gi],outKey:G1_OUT[gi],icon:null});
  }
  setVPairs(vPairs.slice(0,n));
  renderVPairsList();
}
const FHWA_PRECISE=[
  {label:'passenger / light',def:'Classes 1–3 — motorcycles through pickups & vans',  inKey:'a',outKey:'j',icon:null},
  {label:'single unit',      def:'Class 5 — 2-axle, 6-tire single unit trucks',       inKey:'s',outKey:'k',icon:null},
  {label:'tractor trailer',  def:'Class 8 — 3-axle single trailer combination',       inKey:'d',outKey:'l',icon:null},
  {label:'multi-trailer',    def:'Class 9 — 4-axle single trailer combination',       inKey:'f',outKey:';',icon:null},
];
const FHWA_COMBINED=[
  {label:'light (1–3)',      def:'Motorcycles, cars, pickups, vans',                  inKey:'a',outKey:'j',icon:null},
  {label:'single unit (5)',  def:'Class 5 — 2-axle 6-tire single unit',               inKey:'s',outKey:'k',icon:null},
  {label:'bus / light SU (4–6)', def:'Buses and single-unit trucks classes 4–6',     inKey:'d',outKey:'l',icon:null},
  {label:'combination (7–13)',def:'All multi-unit combinations classes 7–13',         inKey:'f',outKey:';',icon:null},
];
export function applyVPreset(p){
  setVPairs((p==='precise'?FHWA_PRECISE:FHWA_COMBINED).map(x=>({...x})));
  document.getElementById('v-count').value=vPairs.length;
  renderVPairsList();
}

export async function copyVPairsFromProject(file){
  try {
    const proj = JSON.parse(await file.text());
    if (!proj?.vPairs?.length) { alert('No vehicle types found in that project file.'); return; }
    setVPairs(proj.vPairs.map(p=>({...p})));
    document.getElementById('v-count').value=vPairs.length;
    renderVPairsList();
  } catch(e) { alert('Could not read project file: '+e.message); }
}

export async function copyTmcPairsFromProject(file){
  try {
    const proj = JSON.parse(await file.text());
    if (proj?.vPairs?.length) { setVPairs(proj.vPairs.map(p=>({...p}))); renderVPairsList(); }
    else alert('No vehicle types found in that project file.');
  } catch(e) { alert('Could not read project file: '+e.message); }
}

function hasCountData(){
  const chkV=d=>d.in.some(r=>r.some(v=>v))||d.out.some(r=>r.some(v=>v));
  const chkP=d=>d.some(xw=>xw.some(sl=>sl[0]||sl[1]));
  const chkT=d=>Object.values(d).some(leg=>Object.values(leg).some(dests=>dests.some(sl=>sl.some(v=>v))));
  if(chkV(vData)||chkP(pedData)||chkT(tmcData)) return true;
  return periods.some(p=>{const d=p.data;if(!d)return false;return chkV(d.vData)||chkP(d.pedData)||chkT(d.tmcData||{});});
}

export function renderVPairsList(){
  const wrap=document.getElementById('v-pairs-list'); if(!wrap) return;
  wrap.innerHTML='';
  const locked=hasCountData();
  const multiGroup=vPairs.length>4;
  if(multiGroup){
    const notice=document.createElement('div'); notice.className='group-notice';
    notice.innerHTML=`<strong>Keybinding groups</strong> — types 1–4 use one set of keys; types 5–8 reuse the same keys as a second group. Use ‹ › during counting to switch groups.`;
    wrap.appendChild(notice);
  }
  let dragSrc=-1;
  vPairs.forEach((p,i)=>{
    if(multiGroup&&!p.isBike&&i%4===0){
      const sep=document.createElement('div'); sep.className='group-sep';
      sep.textContent=`Group ${Math.floor(i/4)+1}`; wrap.appendChild(sep);
    }
    const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const labelEl=locked||p.isBike
      ?`<span class="pair-label-ro${p.isBike?' bike-label-locked':''}">${esc(p.label)}</span>`
      :`<input type="text" value="${esc(p.label)}" placeholder="label" oninput="vPairs[${i}].label=this.value;updateCfgFields()">`;
    const defEl=locked||p.isBike
      ?`<span class="tmc-def-ro">${p.isBike?'Cyclists':esc(p.def)}</span>`
      :`<input type="text" value="${esc(p.def)}" placeholder="definition" style="font-size:11px" oninput="vPairs[${i}].def=this.value">`;
    const inKeyEl=p.isBike
      ?`<span class="key-input key-input-blank"></span>`
      :`<input type="text" class="key-input" maxlength="1" value="${(p.inKey||'')===';'?';':(p.inKey||'').toUpperCase()}" placeholder="in" oninput="vPairs[${i}].inKey=this.value.toLowerCase();checkVKeys()">`;
    const outKeyEl=p.isBike
      ?`<span class="key-input key-input-blank"></span>`
      :`<input type="text" class="key-input" maxlength="1" value="${(p.outKey||'')===';'?';':(p.outKey||'').toUpperCase()}" placeholder="out" oninput="vPairs[${i}].outKey=this.value.toLowerCase();checkVKeys()">`;
    const tmcKey=(p.tmcKey||'')===';'?';':(p.tmcKey||'').toUpperCase();
    const row=document.createElement('div'); row.className='pair-row vpair-row'; row.dataset.idx=i;
    row.innerHTML=`
      <span class="drag-handle${locked?' drag-locked':''}" title="${locked?'locked — count data exists':'drag to reorder'}">⣿</span>
      ${labelEl}${defEl}${inKeyEl}${outKeyEl}
      <label class="tmc-incl-label" title="Include in TMC turning mode">
        <input type="checkbox" class="tmc-incl-chk" ${p.includeTmc?'checked':''} ${locked||p.isBike?'disabled':''}>
        <span>tmc</span>
      </label>
      <input type="text" class="key-input tmc-key-input" maxlength="1" value="${tmcKey}" placeholder="t-key"
        style="${p.includeTmc?'':'opacity:.35;pointer-events:none'}"
        oninput="vPairs[${i}].tmcKey=this.value.toLowerCase();checkTmcKeys()">
      <button class="tmc-remove-btn" onclick="vPairs.splice(${i},1);renderVPairsList()" title="Remove" ${locked?'disabled':''}>×</button>`;
    const chk=row.querySelector('.tmc-incl-chk');
    if(chk&&!locked&&!p.isBike){
      chk.addEventListener('change',()=>{
        vPairs[i].includeTmc=chk.checked;
        const ki=row.querySelector('.tmc-key-input');
        if(ki)ki.style.cssText=chk.checked?'':'opacity:.35;pointer-events:none';
        checkTmcKeys();
      });
    }
    if(!locked){
      row.draggable=true;
      row.addEventListener('dragstart',e=>{dragSrc=i;e.dataTransfer.effectAllowed='move';row.classList.add('dragging');});
      row.addEventListener('dragend',()=>row.classList.remove('dragging'));
      row.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';row.classList.add('drag-over');});
      row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
      row.addEventListener('drop',e=>{
        e.preventDefault();row.classList.remove('drag-over');
        if(dragSrc<0||dragSrc===i)return;
        const moved=vPairs.splice(dragSrc,1)[0];
        vPairs.splice(i,0,moved);
        renderVPairsList();
      });
    }
    wrap.appendChild(row);
  });
  checkVKeys();
  checkTmcKeys();
  // show/hide bicycle button
  const bikeBtn=document.getElementById('btn-vpairs-add-bike');
  if(bikeBtn)bikeBtn.style.display=vPairs.some(p=>p.isBike)?'none':'';
}

export function addBikeToVPairs(){
  if(vPairs.some(p=>p.isBike))return;
  const usedTmc=new Set(vPairs.map(p=>p.tmcKey));
  const freeKey='abcdefghijklmnopqrstuvwxyz'.split('').find(c=>!usedTmc.has(c))||'?';
  vPairs.push({label:'Bicycle',def:'Cyclists',inKey:null,outKey:null,icon:null,tmcKey:freeKey,includeTmc:true,isBike:true});
  renderVPairsList();
}

export function checkVKeys(){
  const dupeSet=new Set();
  for(let g=0;g<vPairs.length;g+=4){
    const grp=vPairs.slice(g,g+4).filter(p=>!p.isBike);
    const gk=grp.flatMap(p=>[p.inKey,p.outKey]);
    gk.forEach((k,i)=>{if(k&&k!=='?'&&gk.indexOf(k)!==i)dupeSet.add(g+'_'+k);});
  }
  document.querySelectorAll('#v-pairs-list .vpair-row input.key-input:not(.tmc-key-input)').forEach(inp=>{
    const row=inp.closest('[data-idx]');
    const idx=row?parseInt(row.dataset.idx):-1;
    const g=Math.floor(idx/4);
    inp.classList.toggle('key-conflict',idx>=0&&dupeSet.has(g+'_'+inp.value.toLowerCase()));
  });
  const conf=document.getElementById('v-conflict');
  if(conf)conf.classList.toggle('visible',dupeSet.size>0);
  return dupeSet.size===0;
}

export function checkTmcKeys(){
  const seen=new Set(),dupes=new Set();
  vPairs.filter(p=>p.includeTmc).forEach(p=>{
    if(p.tmcKey&&seen.has(p.tmcKey))dupes.add(p.tmcKey);
    seen.add(p.tmcKey);
  });
  const navKeys=new Set(['arrowup','arrowdown','z','y','\\',']','[']);
  document.querySelectorAll('#v-pairs-list input.tmc-key-input').forEach(inp=>{
    const k=inp.value.toLowerCase();
    inp.classList.toggle('key-conflict',dupes.has(k)||navKeys.has(k));
  });
  const conf=document.getElementById('tmc-conflict');
  if(conf)conf.classList.toggle('visible',dupes.size>0);
  return dupes.size===0;
}

// stubs kept so any stale callers don't throw
export function renderTmcPairsList(){ renderVPairsList(); }
export function addTmcType(){ renderVPairsList(); }
export function addAllVPairsToTmc(){
  vPairs.filter(p=>!p.isBike).forEach(p=>{ p.includeTmc=true; if(!p.tmcKey){const used=new Set(vPairs.map(q=>q.tmcKey));p.tmcKey='abcdefghijklmnopqrstuvwxyz'.split('').find(c=>!used.has(c))||'?';} });
  renderVPairsList();
}
export function addBikeClass(){ addBikeToVPairs(); }
export function _syncTmcAddSelect(){}
export function applyTmcPreset(){}
export function updateTmcCount(){}

// ═══════════════════════════════════════════
// STREET NAMES + LEG HELPERS
// ═══════════════════════════════════════════
export function legToStreet(leg){
  if(leg==='N'||leg==='S') return intersection.street1||'';
  if(leg==='E'||leg==='W') return intersection.street2||'';
  return intersection.street3||'';
}
export function legLabel(leg){
  return (intersection.legLabels&&intersection.legLabels[leg])||leg;
}
export function destLabel(appLeg,destLeg){
  const cls=classifyTurn(appLeg,destLeg);
  const nm={L:'Left',T:'Thru',R:'Right',U:'U-turn'}[cls]||cls;
  const st=legToStreet(destLeg);
  return nm+' ('+destLeg+')'+(st?' — '+st:'');
}
export function streetSlug(s){
  return (s||'').trim().replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
}
export function updateDefaultFilenames(){
  const s1=streetSlug(intersection.street1),s2=streetSlug(intersection.street2);
  const pfx=s1&&s2?s1+'_'+s2:s1||s2||'';
  fnames.vehicle=pfx?pfx+'_vehicle':'traffic_counts';
  fnames.ped    =pfx?pfx+'_ped':'ped_counts';
  fnames.tmc    =pfx?pfx+'_tmc':'tmc_counts';
  ['vehicle','ped','tmc'].forEach(k=>{
    const el=document.getElementById('fname-'+k);
    if(el){el.value=fnames[k];const pv=document.getElementById('fname-'+k+'-preview');if(pv)pv.textContent='→ '+fnames[k]+'.csv';}
  });
}
export function setLegLabel(leg,val){
  if(!intersection.legLabels)intersection.legLabels={};
  intersection.legLabels[leg]=val;
}
export function updateCrosswalkField(leg,field,val){
  const xw=intersection.crosswalks.find(c=>c.assign===leg);
  if(xw){xw[field]=val;renderSetupDiagram();window.updateDiagram&&window.updateDiagram();}
}
export function toggleLegCrosswalk(leg,checked){
  if(checked){
    if(!intersection.crosswalks.find(c=>c.assign===leg)){
      const used=new Set(intersection.crosswalks.flatMap(c=>[c.key0,c.key1]));
      const pool='asdfghjklzxcvbnm;'.split('').filter(k=>!used.has(k));
      intersection.crosswalks.push({name:leg+' crosswalk',dir0:'EB',dir1:'WB',
        key0:pool[0]||'?',key1:pool[1]||'?',assign:leg});
    }
  } else {
    intersection.crosswalks=intersection.crosswalks.filter(c=>c.assign!==leg);
  }
  setXwalkAssign(intersection.crosswalks.map(p=>p.assign));
  renderLegConfig();renderSetupDiagram();
}
export function toggleLegApproach(leg,checked){
  if(checked&&intersection.oneWay[leg])return; // one-way-out legs have no approach (traffic exits only)
  const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  if(checked){
    if(!intersection.approaches.find(a=>a.leg===leg)){
      const dests=validDestinations(tpl,leg);
      intersection.approaches.push({leg,destinations:dests});
    }
  } else {
    intersection.approaches=intersection.approaches.filter(a=>a.leg!==leg);
  }
  renderLegConfig();renderSetupDiagram();
}
export function toggleApproachDestUnified(leg,dest,checked){
  const app=intersection.approaches.find(a=>a.leg===leg);
  if(!app)return;
  if(checked){if(!app.destinations.includes(dest))app.destinations.push(dest);}
  else{app.destinations=app.destinations.filter(d=>d!==dest);}
  renderLegConfig();
  renderSetupDiagram();
}
// A leg is a valid turn destination unless it's the same leg or it's one-way-in
// (one-way-in legs can't be exited to — traffic flows inbound only).
// One-way-out legs ARE valid destinations (traffic exits the intersection via them).
function validDestinations(tpl,leg){
  return tpl.slots.filter(d=>d!==leg&&!intersection.oneWayIn?.[d]);
}
export function toggleLegOneWay(leg,checked){
  intersection.oneWay[leg]=checked;
  if(checked){
    // One-way-out: remove the approach (no inbound traffic from this leg).
    // Crosswalk stays — pedestrians can still cross a one-way street.
    // This leg remains a valid destination for other approaches.
    intersection.approaches=intersection.approaches.filter(a=>a.leg!==leg);
    // Mutually exclusive with one-way-in
    if(intersection.oneWayIn) delete intersection.oneWayIn[leg];
  }
  renderLegConfig();renderSetupDiagram();
}
export function toggleLegOneWayIn(leg,checked){
  if(!intersection.oneWayIn) intersection.oneWayIn={};
  intersection.oneWayIn[leg]=checked;
  if(checked){
    // One-way-in: remove this leg from all other approaches' destination lists
    // (traffic can't exit the intersection onto a one-way-in street).
    // The approach stays (vehicles enter from this leg).
    // Crosswalk stays.
    intersection.approaches.forEach(a=>{ a.destinations=a.destinations.filter(d=>d!==leg); });
    // Mutually exclusive with one-way-out
    delete intersection.oneWay[leg];
  } else {
    // Restore this leg as a valid destination for any approach that doesn't already have it
    const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
    intersection.approaches.forEach(a=>{
      if(a.leg!==leg&&!a.destinations.includes(leg)) a.destinations.push(leg);
    });
  }
  renderLegConfig();renderSetupDiagram();
}

// ═══════════════════════════════════════════
// LEG DETAIL PANEL (click-on-diagram builder)
// ═══════════════════════════════════════════
// The overview diagram only shows a small status dot per leg (see diagram.js's
// buildLegDots) — clicking one fills this docked side panel with that leg's full
// detail, including its own zoomed destination-arrow diagram. Keeping detail out of
// the shared overview is what keeps the overview legible at 5 legs.
let openLeg=null;
export function getOpenLeg(){ return openLeg; }

export function openLegPopover(leg){
  openLeg=(openLeg===leg)?null:leg;
  renderLegConfig();
  renderSetupDiagram();
}
export function closeLegPopover(){
  if(!openLeg)return;
  openLeg=null;
  renderLegConfig();
  renderSetupDiagram();
}

export function renderLegConfig(){
  const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  // show/hide street3 field
  const s3=document.getElementById('street3-field');
  if(s3)s3.style.display=tpl.id==='t5'?'block':'none';
  syncIntersectionLocationFields();
  renderLegPopoverContent(tpl);
}

// Street/lat/lng inputs are plain oninput="intersection.X=this.value" handlers with no
// reverse sync — nothing previously re-populated their .value from state on reload/project
// load, so re-entering Setup after a resume/load showed blank fields even though the
// underlying data was intact (found while adding lat/lng; same gap existed for street1/2/3
// already — see BUG-024). renderLegConfig() runs on every setup-screen (re)entry and after
// every project load, so syncing here covers all paths without a new call site.
export function syncIntersectionLocationFields(){
  const s1=document.getElementById('street1-inp'); if(s1) s1.value=intersection.street1||'';
  const s2=document.getElementById('street2-inp'); if(s2) s2.value=intersection.street2||'';
  const s3=document.getElementById('street3-inp'); if(s3) s3.value=intersection.street3||'';
  const lat=document.getElementById('ix-lat-inp'); if(lat) lat.value=intersection.lat||'';
  const lng=document.getElementById('ix-lng-inp'); if(lng) lng.value=intersection.lng||'';
}

function renderLegPopoverContent(tpl){
  const panel=document.getElementById('leg-detail-panel');
  if(!panel)return;
  tpl=tpl||TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  if(openLeg&&!tpl.slots.includes(openLeg))openLeg=null;
  if(!openLeg){
    panel.innerHTML=`<div class="leg-detail-empty">click a leg on the diagram to configure its crosswalk and approach</div>`;
    return;
  }

  const leg=openLeg;
  const xw=intersection.crosswalks.find(c=>c.assign===leg);
  const app=intersection.approaches.find(a=>a.leg===leg);
  const oneWay=!!intersection.oneWay[leg];
  const oneWayIn=!!(intersection.oneWayIn&&intersection.oneWayIn[leg]);
  const lbl=(intersection.legLabels&&intersection.legLabels[leg])||'';
  const st=legToStreet(leg);
  const allDests=validDestinations(tpl,leg);

  panel.innerHTML=`
    <div class="leg-popover-head">
      <span class="leg-badge-lg">${leg}</span>
      <input class="leg-label-input" type="text" value="${lbl}"
        placeholder="${st||leg} label (optional)"
        oninput="setLegLabel('${leg}',this.value)">
      <button class="leg-popover-close" onclick="closeLegPopover()" aria-label="Deselect leg">×</button>
    </div>
    ${st?`<div class="leg-detail-street">${st}</div>`:''}
    <div class="leg-toggles">
      <label class="leg-toggle${xw?' active':''}">
        <input type="checkbox"${xw?' checked':''} onchange="toggleLegCrosswalk('${leg}',this.checked)">
        crosswalk
      </label>
      <label class="leg-toggle${app?' active':''}"${oneWay?' title="Disabled — one-way-out legs have no approach"':''}>
        <input type="checkbox"${app?' checked':''}${oneWay?' disabled':''} onchange="toggleLegApproach('${leg}',this.checked)">
        approach
      </label>
      <label class="leg-toggle${oneWay?' active':''}" title="One-way out — traffic exits the intersection on this leg; no inbound approach; crosswalk still allowed">
        <input type="checkbox"${oneWay?' checked':''} onchange="toggleLegOneWay('${leg}',this.checked)">
        one-way out ↑
      </label>
      <label class="leg-toggle${oneWayIn?' active':''}" title="One-way in — traffic enters the intersection from this leg only; approach allowed, but not a valid exit destination">
        <input type="checkbox"${oneWayIn?' checked':''} onchange="toggleLegOneWayIn('${leg}',this.checked)">
        one-way in ↓
      </label>
    </div>
    ${xw?`
    <div class="leg-detail">
      <input class="leg-inp" style="width:120px" type="text" value="${xw.name}" placeholder="name"
        oninput="updateCrosswalkField('${leg}','name',this.value)">
      <input class="leg-inp leg-inp-sm" type="text" value="${xw.dir0}" placeholder="dir 1"
        oninput="updateCrosswalkField('${leg}','dir0',this.value)">
      <input class="leg-inp leg-inp-key" maxlength="1" type="text" value="${xw.key0}"
        oninput="updateCrosswalkField('${leg}','key0',this.value.toLowerCase());checkPKeys()">
      <input class="leg-inp leg-inp-sm" type="text" value="${xw.dir1}" placeholder="dir 2"
        oninput="updateCrosswalkField('${leg}','dir1',this.value)">
      <input class="leg-inp leg-inp-key" maxlength="1" type="text" value="${xw.key1}"
        oninput="updateCrosswalkField('${leg}','key1',this.value.toLowerCase());checkPKeys()">
    </div>`:''}
    ${app?`
    <div class="leg-dest-wrap">
      <div class="leg-dest-diagram" id="leg-dest-diagram"></div>
      <div class="leg-approach-detail">
        <label class="dest-check approach-count-toggle" title="Uncheck to hide this approach in the counter — use when you are not counting this direction">
          <input type="checkbox"${app.count!==false?' checked':''} onchange="toggleApproachCount('${leg}',this.checked);renderSetupDiagram()">
          <span style="font-weight:600">count this approach</span>
        </label>
        <div class="dest-checks-group"${app.count===false?' style="opacity:0.4;pointer-events:none"':''}>
        ${allDests.map(dest=>{
          const chk=app.destinations.includes(dest);
          const dl=destLabel(leg,dest);
          return `<label class="dest-check"><input type="checkbox"${chk?' checked':''} onchange="toggleApproachDestUnified('${leg}','${dest}',this.checked)"><span>${dl}</span></label>`;
        }).join('')}
        </div>
      </div>
    </div>`:''}
  `;
  if(app){
    const diagWrap=document.getElementById('leg-dest-diagram');
    if(diagWrap)diagWrap.innerHTML=buildLegDestinationsSVG(leg);
  }
}

export function wireLegPopoverDismiss(){
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&openLeg)closeLegPopover();
  });
}

export function buildTemplateGrid(){
  const wrap=document.getElementById('template-grid'); wrap.innerHTML='';
  TEMPLATES.forEach(t=>{
    const card=document.createElement('div'); card.className='template-card'+(window.pedTemplate===t.id?' active':'');
    card.innerHTML=`${templateSVG(t.id)}<div class="template-card-name">${t.name}</div><div class="template-card-sub">${t.sub}</div>`;
    card.onclick=()=>{
      window.pedTemplate=t.id;
      document.querySelectorAll('.template-card').forEach(c=>c.classList.remove('active'));
      card.classList.add('active');
      const n=t.xwalks;
      while(window.pedPairs.length<n)window.pedPairs.push({name:`crosswalk ${window.pedPairs.length+1}`,dir0:'dir 1',dir1:'dir 2',key0:'?',key1:'?',assign:t.slots[window.pedPairs.length]||'N'});
      window.pedPairs=window.pedPairs.slice(0,n);
      // re-assign every pair to this template's slot order
      window.pedPairs.forEach((p,idx)=>{ p.assign=t.slots[idx]||'N'; });
      setXwalkAssign(window.pedPairs.map(p=>p.assign));
      updateTemplateSuboption();
      initApproaches();
      renderLegConfig();
      renderSetupDiagram();
    };
    wrap.appendChild(card);
  });
}

export function templateSVG(id){
  const s='<svg width="60" height="44" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity:.7">';
  const rc='stroke="var(--text2)" stroke-width="1.5"';
  const maps={
    t3:`${s}<line x1="28" y1="0" x2="28" y2="22" ${rc}/><line x1="32" y1="0" x2="32" y2="22" ${rc}/><line x1="0" y1="22" x2="60" y2="22" ${rc}/><line x1="0" y1="26" x2="60" y2="26" ${rc}/></svg>`,
    t4:`${s}<line x1="28" y1="0" x2="28" y2="44" ${rc}/><line x1="32" y1="0" x2="32" y2="44" ${rc}/><line x1="0" y1="20" x2="60" y2="20" ${rc}/><line x1="0" y1="24" x2="60" y2="24" ${rc}/></svg>`,
    t5:`${s}<line x1="28" y1="0" x2="28" y2="44" ${rc}/><line x1="32" y1="0" x2="32" y2="44" ${rc}/><line x1="0" y1="20" x2="60" y2="20" ${rc}/><line x1="0" y1="24" x2="60" y2="24" ${rc}/><line x1="34" y1="24" x2="52" y2="44" ${rc}/><line x1="38" y1="24" x2="56" y2="44" ${rc}/></svg>`,
  };
  return maps[id]||'';
}

export function checkPKeys(){
  const keys=window.pedPairs.flatMap(p=>[p.key0,p.key1]);
  const dupes=keys.filter((k,i)=>k&&k!=='?'&&keys.indexOf(k)!==i);
  document.querySelectorAll('.leg-detail input.leg-inp-key').forEach(inp=>{
    inp.classList.toggle('key-conflict',dupes.includes(inp.value.toLowerCase()));
  });
  document.getElementById('p-conflict').classList.toggle('visible',dupes.length>0);
  return dupes.length===0;
}

// ═══════════════════════════════════════════
// TEMPLATE SUB-OPTIONS (diagLeg / missingLeg)
// ═══════════════════════════════════════════
export function updateTemplateSuboption(){
  const wrap=document.getElementById('template-suboption');
  const inner=document.getElementById('template-suboption-inner');
  if(!wrap||!inner)return;
  const tpl=intersection.template;
  if(tpl==='t5'){
    wrap.style.display='block';
    inner.innerHTML='<span style="font-size:11px;font-weight:500;color:var(--text2);margin-right:4px">5th leg:</span>'+
      ['NE','SE','SW','NW'].map(d=>
        `<button class="ipill${d===intersection.diagLeg?' active':''}" onclick="setDiagLeg('${d}')">${d}</button>`
      ).join('');
  } else if(tpl==='t3'){
    wrap.style.display='block';
    inner.innerHTML='<span style="font-size:11px;font-weight:500;color:var(--text2);margin-right:4px">missing leg:</span>'+
      ['N','E','S','W'].map(l=>
        `<button class="ipill${l===intersection.missingLeg?' active':''}" onclick="setMissingLeg('${l}')">${l}</button>`
      ).join('');
  } else {
    wrap.style.display='none';
  }
}

export function setDiagLeg(leg){
  const tpl=TEMPLATES.find(t=>t.id==='t5');
  const oldDiag=intersection.diagLeg;
  intersection.diagLeg=leg;
  tpl.slots=['N','E','S','W',leg];
  tpl.xwalks=5;
  // reassign any crosswalk that was on the old diagonal slot to the new one
  intersection.crosswalks.forEach(xw=>{if(xw.assign===oldDiag)xw.assign=leg;});
  setXwalkAssign(intersection.crosswalks.map(p=>p.assign));
  // update pills
  document.querySelectorAll('#template-suboption-inner .ipill').forEach(b=>b.classList.toggle('active',b.textContent===leg));
  initApproaches(); renderLegConfig(); renderSetupDiagram();
}

export function setMissingLeg(leg){
  const tpl=TEMPLATES.find(t=>t.id==='t3');
  intersection.missingLeg=leg;
  const all=['N','E','S','W'];
  tpl.slots=all.filter(l=>l!==leg);
  tpl.xwalks=3;
  // trim/extend crosswalks to match
  while(intersection.crosswalks.length>3)intersection.crosswalks.pop();
  while(intersection.crosswalks.length<3)intersection.crosswalks.push(
    {name:`crosswalk ${intersection.crosswalks.length+1}`,dir0:'dir 1',dir1:'dir 2',key0:'?',key1:'?',assign:tpl.slots[intersection.crosswalks.length]||'N'}
  );
  intersection.crosswalks.forEach((xw,idx)=>{xw.assign=tpl.slots[idx]||'N';});
  setXwalkAssign(intersection.crosswalks.map(p=>p.assign));
  document.querySelectorAll('#template-suboption-inner .ipill').forEach(b=>b.classList.toggle('active',b.textContent===leg));
  initApproaches(); renderLegConfig(); renderSetupDiagram();
}

// ═══════════════════════════════════════════
// APPROACH CONFIG
// ═══════════════════════════════════════════
export function initApproaches(){
  const tpl=TEMPLATES.find(t=>t.id===intersection.template)||TEMPLATES[1];
  const legs=tpl.slots;
  const prev={};
  (intersection.approaches||[]).forEach(a=>{prev[a.leg]={dests:new Set(a.destinations),count:a.count!==false};});
  intersection.approaches=legs.map(leg=>({
    leg,
    count: prev[leg]?prev[leg].count:true,
    destinations:legs.filter(d=>{
      if(d===leg)return false;
      if(intersection.oneWayIn?.[d])return false;
      if(intersection.oneWay[leg]) return false;
      if(prev[leg])return prev[leg].dests.has(d);
      return true;
    }),
  })).filter(a=>!intersection.oneWay[a.leg]);
}

export function toggleApproachCount(leg, counted){
  const app=intersection.approaches.find(a=>a.leg===leg);
  if(app) app.count=counted;
  // Live-update the destination group styling so the popover reflects the change immediately
  const grp=document.querySelector('.dest-checks-group');
  if(grp){
    grp.style.opacity=counted?'':'0.4';
    grp.style.pointerEvents=counted?'':'none';
  }
}

// ═══════════════════════════════════════════
// EXPORT FILENAME PREVIEWS (setup screen)
// ═══════════════════════════════════════════
export function wireSetupFilenameInputs(){
  ['fname-vehicle','fname-ped','fname-tmc'].forEach(id=>{
    document.getElementById(id).addEventListener('input',function(){
      const key=id==='fname-ped'?'ped':id==='fname-tmc'?'tmc':'vehicle';
      fnames[key]=this.value.trim()||{ped:'ped_counts',tmc:'tmc_counts',vehicle:'traffic_counts'}[key];
      document.getElementById(id+'-preview').textContent=`→ ${fnames[key].endsWith('.csv')?fnames[key]:fnames[key]+'.csv'}`;
    });
  });
  document.getElementById('custom-interval').addEventListener('input',function(){
    setCustomInterval(parseInt(this.value)||15); updateDerived();
  });
}

export { startCounting, goSetup };
