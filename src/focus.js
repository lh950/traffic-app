import {
  vPairs, tmcPairs, intersection, cfg, tmcApproach, slot, setSlot, mode,
  focusMode, setFocusMode, vGroup, setVGroup, focusTarget, setFocusTargetState,
  diagWin, tmcWin, undo as undoImpl, redo as redoImpl, setScrollOnRender,
} from './state.js';
import { tmcRecord, vRecord, pedRecord } from './record.js';
import { render, buildKbd, updateCfgFields, vGroupPrev, vGroupNext } from './counter.js';
import { tmcPopupPayload } from './diagram.js';

// ═══════════════════════════════════════════
// KEY MAPS
// ═══════════════════════════════════════════
export function buildVKeyMap(){
  // Only register the active group's keys so shared keys across groups work correctly
  const m={};
  const gs=vGroup*4, ge=Math.min(gs+4,vPairs.length);
  vPairs.slice(gs,ge).forEach((p,j)=>{
    const i=gs+j;
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
  tmcPairs.forEach((p,ti)=>{
    if(p.key)m[p.key]=()=>tmcRecord(ti);
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
  return tmcPairs.some(p=>p.key===k);
}

export function toggleFocusMode(){
  setFocusMode(!focusMode);
  if(focusMode && focusTarget>=focusCount())setFocusTargetState(0);
  updateFocusUI();
}
export function cycleFocus(dir){
  const n=focusCount(); if(!n)return;
  setFocusTargetState((focusTarget+dir+n)%n);
  if(mode==='vehicle'){setVGroup(Math.floor(focusTarget/4));}
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

export function wireKeydown(){
  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
    const k=e.key===';'?';':e.key.toLowerCase();
    // preventDefault here to block browser defaults (scroll, undo, etc.)
    const nav=['arrowdown','arrowup','z','y','\\','[',']'];
    if(nav.includes(k)||buildVKeyMap()[k]||buildPKeyMap()[k]||buildTKeyMap()[k]) e.preventDefault();
    processKey(k);
  });
  // Forward counting keys from popup diagram windows back to this window
  window.addEventListener('message',e=>{
    if(e.data?.type==='kbd-passthrough'){
      const k=e.data.key===';'?';':e.data.key.toLowerCase();
      processKey(k);
    }
  });
}
