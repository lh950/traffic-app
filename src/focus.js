import {
  vPairs, intersection, cfg, tmcApproach, slot, setSlot, mode,
  focusMode, setFocusMode, vGroup, setVGroup, focusTarget, setFocusTargetState,
  diagWin, tmcWin, undo as undoImpl, redo as redoImpl, setScrollOnRender, keybindCfg,
} from './state.js';
import { tmcRecord, vRecord, pedRecord } from './record.js';
import { render, buildKbd, updateCfgFields, vGroupPrev, vGroupNext, tmcGroupPrev, tmcGroupNext } from './counter.js';
import { tmcPopupPayload } from './diagram.js';
import { distinctGroups, vehicleGroupPool, tmcGroupPool } from './keybind.js';

// ═══════════════════════════════════════════
// KEY MAPS
// ═══════════════════════════════════════════
export function buildVKeyMap(){
  // Only register the active group's keys (build brief item 1) — group membership is now the
  // row's explicit `group` field, not a hardcoded floor(index/4) slice.
  const m={};
  const pool=vehicleGroupPool();
  const groupIds=distinctGroups(pool);
  const gid=groupIds[Math.min(vGroup,groupIds.length-1)]??0;
  vPairs.forEach((p,i)=>{
    if(p.isBike||p.group!==gid)return;
    if(p.inKey) m[p.inKey]=()=>vRecord('in',i);
    if(p.outKey)m[p.outKey]=()=>vRecord('out',i);
  });
  return m;
}
export function buildPKeyMap(){
  const m={};
  window.pedPairs.forEach((p,i)=>{
    m[p.key0]=()=>pedRecord(i,0);
    m[p.key1]=()=>pedRecord(i,1);
  });
  return m;
}
export function buildTKeyMap(){
  const m={};
  const app=intersection.approaches.find(a=>a.leg===tmcApproach);
  if(!app||!app.destinations.length)return m;
  // Only register the ACTIVE group's TMC keys (build brief item 2 — mirrors buildVKeyMap's
  // group scoping below). `ti` stays the GLOBAL index into the full includeTmc pool, matching
  // tmcData's actual column layout — only which keys REGISTER is group-scoped, not the index.
  const tmcTypes=vPairs.filter(p=>p.includeTmc);
  const groupIds=distinctGroups(tmcTypes);
  const gid=groupIds[Math.min(vGroup,groupIds.length-1)]??0;
  tmcTypes.forEach((p,ti)=>{
    if(p.group!==gid)return;
    if(p.tmcKey)m[p.tmcKey]=()=>tmcRecord(ti);
  });
  return m;
}

// ═══════════════════════════════════════════
// FOCUS MODE
// ═══════════════════════════════════════════
// In focus mode, only the keys for the currently focused target register.
// Pedestrian: focus = one crosswalk index. Vehicle: focus = one type pair index.
export function focusCount(){
  if(mode==='vehicle')return vPairs.length;
  if(mode==='ped')return window.pedPairs.length;
  const app=intersection.approaches.find(a=>a.leg===tmcApproach);
  return app?app.destinations.length:0;
}

export function isPKeyAllowed(k){
  const p=window.pedPairs[focusTarget]; if(!p)return false;
  return k===p.key0||k===p.key1;
}
export function isVKeyAllowed(k){
  const p=vPairs[focusTarget]; if(!p)return false;
  return k===p.inKey||k===p.outKey;
}
export function isTKeyAllowed(k){
  return vPairs.filter(p=>p.includeTmc).some(p=>p.tmcKey===k);
}

export function toggleFocusMode(){
  setFocusMode(!focusMode);
  if(focusMode && focusTarget>=focusCount())setFocusTargetState(0);
  updateFocusUI();
}
export function cycleFocus(dir){
  const n=focusCount(); if(!n)return;
  setFocusTargetState((focusTarget+dir+n)%n);
  if(mode==='vehicle'){
    // Keep the visible group in sync with whichever group the newly-focused vPair actually
    // belongs to (its own `group` field), not a hardcoded floor(index/4) — see build brief
    // item 1.
    const groupIds=distinctGroups(vehicleGroupPool());
    const g=vPairs[focusTarget]?.group??0;
    const gi=groupIds.indexOf(g);
    setVGroup(gi>=0?gi:0);
  }
  if(mode==='turning'){
    updateCfgFields();buildKbd();render();
    if(tmcWin&&!tmcWin.closed){const p=tmcPopupPayload();if(p)tmcWin.postMessage(p,'*');}
    return;
  }
  updateFocusUI();
}
export function setFocusTarget(i){
  setFocusTargetState(i);
  if(mode==='turning'){updateCfgFields();buildKbd();render();return;}
  if(!focusMode)setFocusMode(true);
  updateFocusUI();
}

export function updateFocusUI(){
  const btn=document.getElementById('btn-focus');
  const bar=document.getElementById('focus-bar');
  if(!btn)return;
  // turning mode uses its own movement bar — don't show generic focus UI
  if(mode==='turning'){bar.style.display='none';return;}
  btn.classList.toggle('active',focusMode);
  btn.textContent=focusMode?'◎ focus on':'○ focus';
  if(focusMode){
    bar.style.display='flex';
    buildFocusChips();
  } else {
    bar.style.display='none';
  }
  buildKbd();
  // notify ped diagram popup of focus state
  if(mode==='ped'&&diagWin&&!diagWin.closed){
    diagWin.postMessage({type:'focus',xi:focusMode?focusTarget:-1,on:focusMode,n:window.pedPairs.length},'*');
  }
}

export function buildFocusChips(){
  const wrap=document.getElementById('focus-chips');
  if(!wrap)return;
  wrap.innerHTML='';

  const items=mode==='vehicle'?vPairs:window.pedPairs;
  items.forEach((p,i)=>{
    const name=mode==='vehicle'?p.label:p.name;
    const chip=document.createElement('button');
    chip.className='focus-chip'+(i===focusTarget?' active':'');
    if(mode==='ped')chip.style.setProperty('--chip-accent',`var(--ped${i})`);
    chip.textContent=name;
    chip.onclick=()=>setFocusTarget(i);
    wrap.appendChild(chip);
  });
}

export function undo(){ undoImpl(render); }
export function redo(){ redoImpl(render); }

// ═══════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════
// processKey — shared handler called from both the document keydown listener
// and the popup keydown forwarder (postMessage kbd-passthrough).
export function processKey(k){
  if(k==='arrowdown'){if(slot<cfg.slots-1){setSlot(slot+1);setScrollOnRender(true);render();}return;}
  if(k==='arrowup')  {if(slot>0){setSlot(slot-1);setScrollOnRender(true);render();}return;}
  if(k==='z')        {undo();return;}
  if(k==='y')        {redo();return;}
  if(k==='\\'){if(mode!=='turning')toggleFocusMode();return;}
  if(mode==='vehicle'&&!focusMode){
    if(k==='['){vGroupPrev();return;}
    if(k===']'){vGroupNext();return;}
  }
  if(focusMode||mode==='turning'){
    if(k==='['){cycleFocus(-1);return;}
    if(k===']'){cycleFocus(1);return;}
  }
  if(mode==='vehicle'){
    if(focusMode && !isVKeyAllowed(k))return;
    const a=buildVKeyMap()[k];if(a)a();
  } else if(mode==='ped'){
    if(focusMode && !isPKeyAllowed(k))return;
    const a=buildPKeyMap()[k];if(a)a();
  } else if(mode==='turning'){
    if(focusMode && !isTKeyAllowed(k))return;
    const a=buildTKeyMap()[k];if(a)a();
  }
}

// True only while the live intersection counter screen is actually the visible screen.
// Found while wiring area-study QA/QC (see BUGS.md): this listener had no such guard at
// all, unlike every other keyboard-driven module in the app (intersectionQaqcCount.js's
// wireKeydown, tripgenCount.js's, etc. — each checks its own screen's isActiveScreen()
// first). Without it, ANY keydown anywhere in the app — including keystrokes meant for a
// QA/QC recount session's own counter screen — was ALSO fed into the LIVE counter's
// vRecord/pedRecord/tmcRecord via processKey() below, silently mutating the live project's
// real count data in the background while the user believed they were only recounting.
function isLiveCounterScreenActive(){
  const el=document.getElementById('counter-screen');
  return !!el && el.style.display!=='none';
}

export function wireKeydown(){
  document.addEventListener('keydown',e=>{
    if(!isLiveCounterScreenActive())return;
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
    // Group-switch shortcuts (build brief item 5) — dedicated keys, separate from the existing
    // [ / ] (which stay exactly as before: vehicle-mode group nav when not in focus mode, focus
    // cycling otherwise). Checked via event.CODE, not event.key, so the numpad preset's Numpad/
    // and Numpad- can't collide with the QWERTY preset's Minus/Equal (same physical-key
    // distinction the build brief calls for) regardless of NumLock state. QWERTY's Minus/Equal
    // were picked because they're unused by any vPair key pool, undo/redo (Z/Y), focus toggle
    // (\\), focus-cycle ([/]), or arrow nav.
    if((mode==='vehicle'||mode==='turning')){
      const isNumpad=keybindCfg.preset==='numpad';
      const prevCode=isNumpad?'NumpadDivide':'Minus';
      const nextCode=isNumpad?'NumpadSubtract':'Equal';
      if(e.code===prevCode){e.preventDefault();(mode==='vehicle'?vGroupPrev:tmcGroupPrev)();return;}
      if(e.code===nextCode){e.preventDefault();(mode==='vehicle'?vGroupNext:tmcGroupNext)();return;}
    }
    const k=e.key===';'?';':e.key.toLowerCase();
    // preventDefault here to block browser defaults (scroll, undo, etc.)
    const nav=['arrowdown','arrowup','z','y','\\','[',']'];
    if(nav.includes(k)||buildVKeyMap()[k]||buildPKeyMap()[k]||buildTKeyMap()[k]) e.preventDefault();
    processKey(k);
  });
  // Forward counting keys from popup diagram windows back to this window. Guarded by the
  // same isLiveCounterScreenActive() check as the real keydown listener above (added
  // alongside tripgenDiagram.js's own popup) — 'kbd-passthrough' is a plain, unscoped
  // postMessage type, and tripgenCount.js's Trip Gen popup now posts it too. Without this
  // guard, typing in the Trip Gen popup fired the SAME message this listener reacts to,
  // running intersection-mode processKey() (touching #tbl-in/#tbl-out etc.) while the
  // intersection counter screen wasn't even the active one — a null-element crash in
  // practice, and an unrelated intersection-state mutation in principle.
  window.addEventListener('message',e=>{
    if(e.data?.type==='kbd-passthrough'&&isLiveCounterScreenActive()){
      const k=e.data.key===';'?';':e.data.key.toLowerCase();
      processKey(k);
    }
  });
}
