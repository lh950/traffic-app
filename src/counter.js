import {
  cfg, vPairs, tmcPairs, intersection, fnames, tmcData, tmcApproach, setTmcApproach, tmManual,
  vData, vManual, pedData, pedManual, customInterval, undoStack,
  slot, setSlot, mode, setMode_, kbdCollapsed, setKbdCollapsed, scrollOnRender, setScrollOnRender,
  focusMode, setFocusMode, vGroup, setVGroup, focusTarget, setFocusTargetState,
  diagWin, setDiagWin, tmcWin, setTmcWin,
  slotLabel, initVData, initPedData, initTMCData, resetUndoStacks, updateUndoUI,
} from './state.js';
import { classifyTurn, TURN_CLS_LABEL, buildTurningDiagramSVG, tmcPopupPayload, pedCountsForSlot } from './diagram.js';
import { legLabel, destLabel, initApproaches, checkVKeys, checkPKeys } from './setup.js';
import { attachEditors, attachContextMenus } from './record.js';
import { focusCount, setFocusTarget, updateFocusUI } from './focus.js';

// ═══════════════════════════════════════════
// SETUP → COUNTER TRANSITION
// ═══════════════════════════════════════════
export function startCounting(){
  if(!checkVKeys()){alert('Resolve duplicate vehicle type keys before starting.');return;}
  if(!checkPKeys()){alert('Resolve duplicate crosswalk keys before starting.');return;}
  const sv=document.getElementById('set-start').value||'00:00';
  const[sh,sm]=sv.split(':').map(Number);
  cfg.startMinutes=sh*60+(sm||0);
  cfg.intervalMin=customInterval||15;
  const dh=parseInt(document.getElementById('set-dur-h').value)||0;
  const dm=parseInt(document.getElementById('set-dur-m').value)||0;
  cfg.durationMin=Math.max(cfg.intervalMin,dh*60+dm);
  fnames.vehicle=document.getElementById('fname-vehicle').value.trim()||'traffic_counts';
  fnames.ped=document.getElementById('fname-ped').value.trim()||'ped_counts';
  fnames.tmc=document.getElementById('fname-tmc').value.trim()||'tmc_counts';
  setSlot(0); resetUndoStacks();
  setFocusMode(false); setFocusTargetState(0);
  initVData(); initPedData(); initTMCData(initApproaches);
  updateUndoUI();
  buildCounterUI();
  updateFocusUI();
  if (!document.body.classList.contains('workspace-mode')) {
    // Non-workspace path: manipulate display directly.
    // In workspace mode the window.startCounting wrapper in main.js calls openWorkspaceTab('count').
    document.getElementById('setup-screen').style.display='none';
    document.getElementById('counter-screen').style.display='';
    document.getElementById('counter-screen').classList.add('active');
  }
  setMode('vehicle');
}

export function goSetup(){
  if(undoStack.length>0&&!confirm('Return to setup? Count data will be preserved but structural changes will reset it.'))return;
  if (document.body.classList.contains('workspace-mode')) {
    window.openWorkspaceTab?.('setup');
    return;
  }
  document.getElementById('counter-screen').classList.remove('active');
  document.getElementById('setup-screen').style.display='';
}

// ═══════════════════════════════════════════
// COUNTER UI BUILD
// ═══════════════════════════════════════════
export function buildCounterUI(){
  const h=Math.floor(cfg.durationMin/60),m=cfg.durationMin%60;
  const ds=h>0?(m>0?`${h}h ${m}m`:`${h}h`):`${m}m`;
  const _s1=intersection.street1||'',_s2=intersection.street2||'';
  const _stLabel=(_s1&&_s2)?_s1+' & '+_s2:_s1||_s2||'';
  document.getElementById('study-sub').textContent=(_stLabel?_stLabel+' · ':'')+ds+' · '+cfg.intervalMin+'-min intervals · '+cfg.slots+' slots';
  const vw=document.getElementById('tables-vehicle');
  vw.innerHTML=`
    <div><div class="table-heading"><h2>inbound counts</h2><span class="tag tag-in">IN</span></div>
    <div class="tbl-scroll"><table id="tbl-in"></table></div></div>
    <div><div class="table-heading"><h2>outbound counts</h2><span class="tag tag-out">OUT</span></div>
    <div class="tbl-scroll"><table id="tbl-out"></table></div></div>`;
  updateCfgFields();
  buildKbd();
  document.getElementById('fn-live').value=fnames.vehicle;
  document.getElementById('btn-diag').style.display='none';
  document.getElementById('tables-tmc').innerHTML='';
  document.getElementById('fn-live').value=fnames.tmc;
}

export function updateCfgFields(){
  const wrap=document.getElementById('cfg-type-fields'); wrap.innerHTML='';
  if(mode==='turning'){
    const outer=document.createElement('div');
    outer.style.cssText='display:flex;align-items:flex-start;gap:12px';
    const diagBox=document.createElement('div');
    if(tmcWin&&!tmcWin.closed){
      diagBox.style.cssText='width:148px;height:148px;flex-shrink:0;border:.5px solid var(--border);border-radius:var(--r);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;color:var(--text3);font-size:11px;cursor:pointer';
      diagBox.innerHTML='<span style="font-size:18px">⊞</span><span>diagram open</span>';
      diagBox.onclick=()=>{if(tmcWin&&!tmcWin.closed)tmcWin.focus();};
    } else {
      diagBox.style.cssText='width:148px;height:148px;flex-shrink:0;border:.5px solid var(--border);border-radius:var(--r);overflow:hidden';
      diagBox.addEventListener('mouseup',()=>{
        setTimeout(()=>{document.getElementById('counter-kbd-anchor')?.focus({preventScroll:true});},0);
      });
      const tAppD=intersection.approaches.find(a=>a.leg===tmcApproach);
      diagBox.innerHTML=buildTurningDiagramSVG(tAppD,focusTarget);
    }
    outer.appendChild(diagBox);
    const chipsCol=document.createElement('div');
    chipsCol.style.cssText='display:flex;flex-direction:column;gap:8px;flex:1;min-width:0';
    const appRow=document.createElement('div');
    appRow.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap';
    appRow.innerHTML='<span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-right:2px">approach</span>';
    const _retFocus=()=>{setTimeout(()=>{document.getElementById('counter-kbd-anchor')?.focus({preventScroll:true});},0);};
    intersection.approaches.filter(a=>a.count!==false).forEach(app=>{
      const b=document.createElement('button');
      b.className='app-sel-btn'+(app.leg===tmcApproach?' active':'');
      b.textContent=legLabel(app.leg); b.title=app.leg;
      b.onclick=()=>setApproach(app.leg);
      b.addEventListener('mouseup',_retFocus);
      appRow.appendChild(b);
    });
    // Active summary banner — shows "W → Thru (E)" at a glance
    const tApp=intersection.approaches.find(a=>a.leg===tmcApproach);
    const activeDest=tApp?.destinations[focusTarget];
    const activeMovLabel=activeDest?destLabel(tApp.leg,activeDest):'—';
    const summary=document.createElement('div');
    summary.id='tmc-active-summary';
    summary.style.cssText='font-family:var(--mono);font-size:15px;font-weight:700;color:var(--blue-text);letter-spacing:.02em;padding:2px 0 4px 0';
    summary.textContent=tmcApproach?`${legLabel(tmcApproach)} → ${activeMovLabel}`:'select approach';
    chipsCol.insertBefore(summary, chipsCol.firstChild);

    chipsCol.appendChild(appRow);
    const movRow=document.createElement('div');
    movRow.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap';
    movRow.innerHTML='<span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-right:2px">movement</span>';
    if(tApp&&tApp.destinations.length){
      tApp.destinations.forEach((d,i)=>{
        const cls=classifyTurn(tApp.leg,d);
        const chip=document.createElement('button');
        chip.className='mov-sel-chip'+(i===focusTarget?' active':'');
        chip.innerHTML=`<span style="font-size:10px">${destLabel(tApp.leg,d)}</span>`;
        chip.title=destLabel(tApp.leg,d);
        chip.onclick=()=>setFocusTarget(i);
        chip.addEventListener('mouseup',_retFocus);
        movRow.appendChild(chip);
      });
    } else {
      movRow.innerHTML+='<span style="font-size:11px;color:var(--text3)">no movements — check setup</span>';
    }
    chipsCol.appendChild(movRow);
    outer.appendChild(chipsCol);
    wrap.appendChild(outer);
  } else if(mode==='vehicle'){
    const nG=Math.ceil(vPairs.length/4);
    if(nG>1){
      const gr=document.createElement('div');
      gr.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap';
      gr.innerHTML='<span style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3);margin-right:2px">group</span>';
      for(let g=0;g<nG;g++){
        const gb=document.createElement('button');
        gb.className='vgrp-btn'+(g===vGroup?' active':'');
        gb.textContent='Group '+(g+1);
        const _g=g;
        gb.onclick=()=>{setVGroup(_g);setFocusTargetState(_g*4);buildKbd();updateCfgFields();};
        gr.appendChild(gb);
      }
      wrap.appendChild(gr);
    }
    const gs=vGroup*4, ge=Math.min(gs+4,vPairs.length);
    vPairs.slice(gs,ge).forEach((p,j)=>{
      const i=gs+j;
      const f=document.createElement('div'); f.className='cfg-field';
      f.innerHTML=`<label>${p.inKey.toUpperCase()}/${p.outKey===';'?';':p.outKey.toUpperCase()}</label>
        <input type="text" value="${p.label}" oninput="vPairs[${i}].label=this.value;buildKbd();render()">`;
      wrap.appendChild(f);
    });
  } else if(mode==='ped'){
    window.pedPairs.forEach((p,i)=>{
      const f=document.createElement('div'); f.className='cfg-field';
      f.innerHTML=`<label style="color:var(--ped${i})">${p.key0.toUpperCase()}/${p.key1===';'?';':p.key1.toUpperCase()}</label>
        <input type="text" value="${p.name}" placeholder="name" oninput="pedPairs[${i}].name=this.value;buildKbd();render();updateDiagram()">
        <div style="display:flex;gap:4px;margin-top:3px">
          <input type="text" value="${p.dir0}" placeholder="dir 1" style="font-size:11px;padding:3px 6px;width:60px" oninput="pedPairs[${i}].dir0=this.value;render();updateDiagram()">
          <input type="text" value="${p.dir1}" placeholder="dir 2" style="font-size:11px;padding:3px 6px;width:60px" oninput="pedPairs[${i}].dir1=this.value;render();updateDiagram()">
        </div>`;
      wrap.appendChild(f);
    });
  }
  document.getElementById('cfg-type-label').textContent=mode==='vehicle'?'vehicle types':mode==='ped'?'crosswalks':'counting';
}

export function buildKbd(){
  const grid=document.getElementById('kbd-grid');
  if(!grid)return;
  let html='';
  const sep='<span class="kbd-group-sep"></span>';
  const dim=(i)=> (focusMode && i!==focusTarget) ? ' dimmed' : '';
  if(mode==='turning'){
    const tApp=intersection.approaches.find(a=>a.leg===tmcApproach);
    if(tApp&&tApp.destinations.length){
      const dest=tApp.destinations[focusTarget];
      const cls=classifyTurn(tApp.leg,dest);
      html+=`<span class="kbd-group-label"><span class="turn-cls turn-cls-${cls}" style="font-size:9px">${TURN_CLS_LABEL[cls]}</span> → ${legLabel(dest)}</span>`;
      // flat layout — all types in one row, no groups
      tmcPairs.forEach((p,i)=>{
        const k=p.key===';'?';':p.key.toUpperCase();
        html+=`<span class="kbd-chip" data-focus-idx="${i}"><kbd>${k}</kbd><span class="key-label">${p.label}</span></span>`;
      });
    } else {
      html+='<span style="color:var(--text3);font-size:11px">select approach to count</span>';
    }
  } else if(mode==='vehicle'){
    const nGkbd=Math.ceil(vPairs.length/4);
    const gskbd=vGroup*4, gekbd=Math.min(gskbd+4,vPairs.length);
    const grpKbd=vPairs.slice(gskbd,gekbd);
    if(nGkbd>1){
      const canPrev=vGroup>0, canNext=vGroup<nGkbd-1;
      const btnStyle=`style="font-size:11px;padding:2px 8px;border:.5px solid var(--border2);border-radius:var(--r);background:var(--surface2);color:var(--text);cursor:pointer;opacity:`;
      html+=`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px">
        <button ${btnStyle}${canPrev?'1':'0.3'}" onclick="if(${canPrev}){vGroupPrev();}" title="previous group">‹</button>
        <span style="font-size:10px;font-weight:600;color:var(--text2);white-space:nowrap">group ${vGroup+1}/${nGkbd}</span>
        <button ${btnStyle}${canNext?'1':'0.3'}" onclick="if(${canNext}){vGroupNext();}" title="next group">›</button>
      </span>`;
    }
    html+=`<span class="kbd-group-label label-in">← in</span>`;
    grpKbd.forEach((p,j)=>{const i=gskbd+j;
      html+=`<span class="kbd-chip${dim(i)}"><kbd id="vk-in-${i}">${p.inKey===';'?';':p.inKey.toUpperCase()}</kbd><span class="key-label">${p.label}</span></span>`;
    });
    html+=sep;
    html+=`<span class="kbd-group-label label-out">out →</span>`;
    grpKbd.forEach((p,j)=>{const i=gskbd+j;
      html+=`<span class="kbd-chip${dim(i)}"><kbd id="vk-out-${i}">${p.outKey===';'?';':p.outKey.toUpperCase()}</kbd><span class="key-label">${p.label}</span></span>`;
    });
  } else if(mode==='ped'){
    window.pedPairs.forEach((p,i)=>{
      if(i>0)html+=sep;
      const k0d=p.key0===';'?';':p.key0.toUpperCase();
      const k1d=p.key1===';'?';':p.key1.toUpperCase();
      html+=`<span class="kbd-group-label label-p${i}${focusMode&&i!==focusTarget?'" style="opacity:.3':''}">${p.name}</span>`;
      html+=`<span class="kbd-chip${dim(i)}"><kbd id="pk-${i}-0">${k0d}</kbd><span class="key-label">${p.dir0}</span></span>`;
      html+=`<span class="kbd-chip${dim(i)}"><kbd id="pk-${i}-1">${k1d}</kbd><span class="key-label">${p.dir1}</span></span>`;
    });
  }
  html+=sep;
  html+=`<span class="kbd-group-label label-nav">nav</span>`;
  html+=`<span class="kbd-chip"><kbd>↑</kbd><span class="key-label">prev</span></span>`;
  html+=`<span class="kbd-chip"><kbd>↓</kbd><span class="key-label">next</span></span>`;
  html+=`<span class="kbd-chip"><kbd>Z</kbd><span class="key-label">undo</span></span>`;
  html+=`<span class="kbd-chip"><kbd>Y</kbd><span class="key-label">redo</span></span>`;
  grid.innerHTML=html;
}

export function vGroupPrev(){
  if(vGroup>0){setVGroup(vGroup-1);setFocusTargetState(vGroup*4);buildKbd();updateCfgFields();}
}
export function vGroupNext(){
  const nG=Math.ceil(vPairs.length/4);
  if(vGroup<nG-1){setVGroup(vGroup+1);setFocusTargetState(vGroup*4);buildKbd();updateCfgFields();}
}

export function toggleKbd(){
  setKbdCollapsed(!kbdCollapsed);
  document.getElementById('kbd-inner').classList.toggle('collapsed',kbdCollapsed);
  document.getElementById('kbd-toggle-label').textContent='keyboard reference';
  document.getElementById('kbd-toggle-btn').classList.toggle('collapsed',kbdCollapsed);
}

// ═══════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════
export function render(){
  if(mode==='vehicle') renderVehicle();
  else if(mode==='ped') renderPed();
  else renderTMC();
  document.getElementById('cur-interval').textContent=slotLabel(slot);
  if(mode==='ped'&&diagWin&&!diagWin.closed){
    diagWin.postMessage({type:'flash',xi:-1,di:-1,dur:0,interval:slotLabel(slot),counts:pedCountsForSlot()},'*');
  }
  setScrollOnRender(false);
  window.scheduleAutosave?.();
}

function buildVehicleTable(el,dir){
  const n=vPairs.length;
  const head=`<thead><tr><th>time</th>${vPairs.map(p=>`<th>${p.label}</th>`).join('')}<th>total</th></tr></thead>`;
  const body=vData[dir].map((counts,i)=>{
    const total=counts.reduce((a,b)=>a+b,0);
    const cur=i===slot?' class="current"':'';
    const cells=counts.map((c,ti)=>{
      const ed=vManual[dir].has(i+'-'+ti)?' manually-edited':'';
      const nz=c>0?' nonzero':'';
      return `<td class="${(ed+nz).trim()}" data-editable data-table="${dir}" data-row="${i}" data-col="${ti}">${c}</td>`;
    }).join('');
    return `<tr${cur} id="v-${dir}-r-${i}"><td class="time-cell" data-mode="vehicle" data-slot="${i}">${slotLabel(i)}</td>${cells}<td class="${total>0?'nonzero':''}">${total}</td></tr>`;
  }).join('');
  const tots=Array.from({length:n},(_,t)=>vData[dir].reduce((s,r)=>s+r[t],0));
  const grand=tots.reduce((a,b)=>a+b,0);
  const foot=`<tfoot><tr><td>total</td>${tots.map(t=>`<td>${t}</td>`).join('')}<td>${grand}</td></tr></tfoot>`;
  el.innerHTML=head+'<tbody>'+body+'</tbody>'+foot;
  attachEditors(el,'vehicle'); attachContextMenus(el);
}

export function renderVehicle(){
  const scrollPos={};
  document.querySelectorAll('#tables-vehicle .tbl-scroll').forEach((el,idx)=>{scrollPos[idx]=el.scrollTop;});
  buildVehicleTable(document.getElementById('tbl-in'),'in');
  buildVehicleTable(document.getElementById('tbl-out'),'out');
  if(scrollOnRender){
    ['v-in','v-out'].forEach(p=>{
      const r=document.getElementById(p+'-r-'+slot);
      if(r)r.scrollIntoView({block:'center',behavior:'auto'});
    });
  } else {
    document.querySelectorAll('#tables-vehicle .tbl-scroll').forEach((el,idx)=>{if(scrollPos[idx]!=null)el.scrollTop=scrollPos[idx];});
    ['v-in','v-out'].forEach(p=>{
      const r=document.getElementById(p+'-r-'+slot);
      if(r)r.scrollIntoView({block:'nearest',behavior:'auto'});
    });
  }
}

export function renderPed(){
  const wrap=document.getElementById('tables-ped');
  const existingScroll=wrap.querySelector('.tbl-scroll');
  const prevPedScroll=existingScroll?existingScroll.scrollTop:null;
  wrap.style.gridTemplateColumns='1fr';
  wrap.innerHTML='';
  const block=document.createElement('div');
  const fcxi=(focusMode&&mode==='ped')?focusTarget:-1;
  const colHeaders=window.pedPairs.flatMap((p,i)=>{
    const focused=i===fcxi, anyFocus=fcxi>=0;
    const hd=focused?'ped-focus-col-hd':anyFocus?'ped-dimmed':'';
    return [
      `<th class="${hd}" style="border-left:2px solid var(--ped${i});max-width:90px"><span style="font-size:10px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${p.name} — ${p.dir0}">${p.name}</span><span style="font-weight:400;font-size:10px;color:var(--text3)">${p.dir0}</span></th>`,
      `<th class="${hd}" style="max-width:90px"><span style="font-size:10px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0" title="${p.name} — ${p.dir1}">·</span><span style="font-weight:400;font-size:10px;color:var(--text3)">${p.dir1}</span></th>`
    ];
  }).join('');
  const head=`<thead><tr><th>time</th>${colHeaders}<th>total</th></tr></thead>`;
  const rows=Array.from({length:cfg.slots},(_,ri)=>{
    const cur=ri===slot?' class="current"':'';
    const rowTotal=window.pedPairs.reduce((sum,p,xi)=>sum+pedData[xi][ri][0]+pedData[xi][ri][1],0);
    const cells=window.pedPairs.flatMap((p,xi)=>[0,1].map(di=>{
      const c=pedData[xi][ri][di];
      const ed=pedManual[xi].has(ri+'-'+di)?' manually-edited':'';
      const nz=c>0?' nonzero':'';
      const focused=xi===fcxi, anyFocus=fcxi>=0;
      const focusCls=focused?' ped-focus-col':anyFocus?' ped-dimmed':'';
      const bl=di===0?` style="border-left:2px solid var(--ped${xi})"`:' ';
      return `<td class="${(ed+nz+focusCls).trim()}"${bl} data-editable data-table="${xi}" data-row="${ri}" data-col="${di}">${c}</td>`;
    })).join('');
    return `<tr${cur} id="ped-unified-r-${ri}"><td class="time-cell" data-mode="ped" data-slot="${ri}">${slotLabel(ri)}</td>${cells}<td class="${rowTotal>0?'nonzero':''}">${rowTotal}</td></tr>`;
  }).join('');
  const footCells=window.pedPairs.flatMap((p,xi)=>[0,1].map(di=>{
    const t=pedData[xi].reduce((s,r)=>s+r[di],0);
    const focused=xi===fcxi, anyFocus=fcxi>=0;
    const focusCls=focused?' ped-focus-col':anyFocus?' ped-dimmed':'';
    const bl=di===0?` style="border-left:2px solid var(--ped${xi})"`:' ';
    return `<td class="${focusCls.trim()}"${bl}>${t}</td>`;
  })).join('');
  const grandTotal=window.pedPairs.reduce((sum,p,xi)=>sum+pedData[xi].reduce((s,r)=>s+r[0]+r[1],0),0);
  const foot=`<tfoot><tr><td>total</td>${footCells}<td>${grandTotal}</td></tr></tfoot>`;
  block.innerHTML=`<div class="tbl-scroll"><table id="tbl-ped-unified">${head}<tbody>${rows}</tbody>${foot}</table></div>`;
  wrap.appendChild(block);
  attachEditors(block,'ped'); attachContextMenus(block);
  const newScroll=block.querySelector('.tbl-scroll');
  if(scrollOnRender){
    const r=document.getElementById(`ped-unified-r-${slot}`);
    if(r)r.scrollIntoView({block:'center',behavior:'auto'});
  } else {
    if(newScroll && prevPedScroll!=null) newScroll.scrollTop=prevPedScroll;
    const r=document.getElementById(`ped-unified-r-${slot}`);
    if(r)r.scrollIntoView({block:'nearest',behavior:'auto'});
  }
}


export function setApproach(leg){
  setTmcApproach(leg);
  setFocusTargetState(0);
  updateCfgFields();
  buildKbd();
  setScrollOnRender(true);
  render();
  if(tmcWin&&!tmcWin.closed){const p=tmcPopupPayload();if(p)tmcWin.postMessage(p,'*');}
}

export function renderTMC(){
  const wrap=document.getElementById('tables-tmc');
  if(!wrap)return;
  if(tmcWin&&!tmcWin.closed){const p=tmcPopupPayload();if(p)tmcWin.postMessage(p,'*');}
  const app=intersection.approaches.find(a=>a.leg===tmcApproach);
  if(!app||!app.destinations.length){
    wrap.innerHTML='<div style="padding:32px;color:var(--text3);font-size:13px">'+(
      !app?'Select an approach above to start counting.':'No movements configured for this approach — edit in setup.'
    )+'</div>';
    return;
  }
  const dests=app.destinations;
  const n=tmcPairs.length;

  let movHdrs='';
  dests.forEach((d,di)=>{
    const cls=classifyTurn(app.leg,d);
    const sep=di>0?' mov-group-sep':'';
    const acol=di===focusTarget?' tmc-acol':'';
    const _dlbl=destLabel(app.leg,d);
    movHdrs+=`<th colspan="${n+1}" class="mov-group-hdr mov-${cls}${sep}${acol}" title="${_dlbl}" style="white-space:normal"><span style="font-size:10px">${_dlbl}</span></th>`;
  });

  let typeHdrs='';
  dests.forEach((d,di)=>{
    const acol=di===focusTarget?' tmc-acol':'';
    tmcPairs.forEach((p,ti)=>{
      const sep=(di>0&&ti===0)?' class="type-sub-hdr mov-group-sep'+acol+'"':` class="type-sub-hdr${acol}"`;
      typeHdrs+=`<th${sep}>${p.label}</th>`;
    });
    typeHdrs+=`<th class="type-sub-hdr subtotal${acol}">sub</th>`;
  });

  const rows=Array.from({length:cfg.slots},(_,ri)=>{
    const cur=ri===slot?' class="current"':'';
    const timeCell=`<td class="time-cell" data-mode="tmc" data-slot="${ri}">${slotLabel(ri)}</td>`;
    let rowTotal=0;
    let cells='';
    dests.forEach((d,di)=>{
      const row=(tmcData[app.leg]&&tmcData[app.leg][d]&&tmcData[app.leg][d][ri])||Array(n).fill(0);
      const sub=row.reduce((a,b)=>a+b,0);
      const acol=di===focusTarget?' tmc-acol':'';
      row.forEach((v,ti)=>{
        const sep=(di>0&&ti===0)?' style="border-left:2px solid var(--border)"':'';
        const manual=(tmManual[app.leg]&&tmManual[app.leg][d]&&tmManual[app.leg][d].has(ri+'-'+ti))?' manually-edited':'';
        const cls=[manual,v>0?'nonzero':'',acol.trim()].filter(Boolean).join(' ');
        cells+=`<td class="${cls}"${sep} data-editable data-mode-cell="tmc" data-table="tmc" data-leg="${app.leg}" data-dest="${d}" data-row="${ri}" data-col="${ti}">${v||''}</td>`;
      });
      cells+=`<td class="${[sub>0?'nonzero':'',acol.trim()].filter(Boolean).join(' ')}">${sub||''}</td>`;
      rowTotal+=sub;
    });
    return `<tr${cur} id="tmc-r-${ri}">${timeCell}${cells}<td class="${rowTotal>0?'nonzero':''}">${rowTotal||''}</td></tr>`;
  }).join('');

  let totCells=''; let grandTot=0;
  dests.forEach((d,di)=>{
    const typeTots=tmcPairs.map((_,ti)=>Array.from({length:cfg.slots},(_,ri)=>(tmcData[app.leg]&&tmcData[app.leg][d]&&tmcData[app.leg][d][ri]&&tmcData[app.leg][d][ri][ti])||0).reduce((a,b)=>a+b,0));
    const sub=typeTots.reduce((a,b)=>a+b,0);
    const tacol=di===focusTarget?' tmc-acol':'';
    typeTots.forEach((t,ti)=>{
      const sep=(di>0&&ti===0)?' style="border-left:2px solid var(--border)"':'';
      totCells+=`<td class="${tacol.trim()}"${sep}>${t||''}</td>`;
    });
    totCells+=`<td class="${tacol.trim()}">${sub||''}</td>`;
    grandTot+=sub;
  });

  wrap.style.gridTemplateColumns='1fr';
  wrap.innerHTML=`<div><div class="table-heading"><h2>${app.leg} approach</h2><span class="tag" style="background:var(--blue-bg);color:var(--blue-text);border-color:var(--blue-border)">${dests.length} movements</span></div>
    <div class="tbl-scroll"><table class="count-table tmc-table">
      <thead><tr><th rowspan="2">time</th>${movHdrs}<th rowspan="2">total</th></tr><tr>${typeHdrs}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>total</td>${totCells}<td>${grandTot||''}</td></tr></tfoot>
    </table></div></div>`;

  attachEditors(wrap); attachContextMenus(wrap);

  const curTmcRow=document.getElementById(`tmc-r-${slot}`);
  if(scrollOnRender){
    if(curTmcRow)curTmcRow.scrollIntoView({block:'center',behavior:'auto'});
  } else {
    if(curTmcRow)curTmcRow.scrollIntoView({block:'nearest',behavior:'auto'});
  }
}

// ═══════════════════════════════════════════
// MODE SWITCH
// ═══════════════════════════════════════════
export function setMode(m){
  setMode_(m);
  document.getElementById('btn-v').classList.toggle('active',m==='vehicle');
  document.getElementById('btn-p').classList.toggle('active',m==='ped');
  document.getElementById('btn-t').classList.toggle('active',m==='turning');
  document.getElementById('tables-vehicle').classList.toggle('hidden',m!=='vehicle');
  document.getElementById('tables-ped').classList.toggle('hidden',m!=='ped');
  document.getElementById('tables-tmc').classList.toggle('hidden',m!=='turning');
  const db=document.getElementById('btn-diag');
  db.style.display=m==='ped'?'flex':'none';
  const dtb=document.getElementById('btn-tmc-diag');
  if(dtb)dtb.style.display=m==='turning'?'flex':'none';
  if(m!=='ped'&&diagWin&&!diagWin.closed){diagWin.close();setDiagWin(null);}
  if(m!=='turning'&&tmcWin&&!tmcWin.closed){tmcWin.close();setTmcWin(null);}
  const fnKey=m==='vehicle'?'vehicle':m==='ped'?'ped':'tmc';
  document.getElementById('fn-live').value=fnames[fnKey]||'';
  if(focusTarget>=focusCount())setFocusTargetState(0);

  document.getElementById('btn-focus').style.display=m==='turning'?'none':'';
  document.getElementById('kbd-toggle-btn').style.display=m==='turning'?'none':'';
  if(m==='turning'){ setFocusMode(false); document.getElementById('kbd-inner').classList.remove('collapsed'); }
  setVGroup(0);
  updateCfgFields();
  buildKbd();
  updateFocusUI();
  setScrollOnRender(true);
  render();
}
