import { vPairs, tmcPairs, fnames, vGroup, mode } from './state.js';
import { render } from './counter.js';

export function openHelp() {document.getElementById('help-modal').classList.add('open');}
export function closeHelp(){document.getElementById('help-modal').classList.remove('open');}

export function renderMsKeymaps(){
  const wrap=document.getElementById('ms-keymaps');
  const KI=`style="width:34px;text-align:center;font-family:var(--mono);font-size:13px;padding:3px 4px;border:.5px solid var(--border2);border-radius:var(--r);background:var(--surface2);color:var(--text)"`;
  // Vehicle section
  let vh=`<div><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:7px">vehicle types</div><div style="display:flex;flex-direction:column;gap:6px">`;
  vPairs.forEach((p,i)=>{
    vh+=`<div style="display:flex;align-items:center;gap:10px;font-size:13px">
      <span style="flex:1;color:var(--text)">${p.label||'type '+(i+1)}</span>
      <span style="color:var(--text2);font-size:11px">in</span>
      <input ${KI} maxlength="1" id="ms-vk-${i}-in" value="${p.inKey||''}" oninput="checkMsKeys()">
      <span style="color:var(--text2);font-size:11px">out</span>
      <input ${KI} maxlength="1" id="ms-vk-${i}-out" value="${p.outKey||''}" oninput="checkMsKeys()">
    </div>`;
  });
  vh+=`</div></div>`;
  // Pedestrian section
  let ph=`<div><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:7px">crosswalk keys</div><div style="display:flex;flex-direction:column;gap:6px">`;
  window.pedPairs.forEach((p,i)=>{
    ph+=`<div style="display:flex;align-items:center;gap:10px;font-size:13px">
      <span style="flex:1;color:var(--text)">${p.name||'x-walk '+(i+1)}</span>
      <span style="color:var(--text2);font-size:11px">${p.dir0||'dir1'}</span>
      <input ${KI} maxlength="1" id="ms-pk-${i}-0" value="${p.key0===';'?';':p.key0||''}" oninput="checkMsKeys()">
      <span style="color:var(--text2);font-size:11px">${p.dir1||'dir2'}</span>
      <input ${KI} maxlength="1" id="ms-pk-${i}-1" value="${p.key1===';'?';':p.key1||''}" oninput="checkMsKeys()">
    </div>`;
  });
  ph+=`</div></div>`;
  let th='';
  if(tmcPairs.length){
    th=`<div style="margin-top:14px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:7px">TMC vehicle types</div><div style="display:flex;flex-direction:column;gap:6px">`;
    tmcPairs.forEach((p,i)=>{
      th+=`<div style="display:flex;align-items:center;gap:10px;font-size:13px">
        <span style="flex:1;color:var(--text)">${p.label||'type '+(i+1)}</span>
        <span style="color:var(--text2);font-size:11px">key</span>
        <input ${KI} maxlength="1" id="ms-tk-${i}" value="${p.key===';'?';':p.key||''}" oninput="checkMsKeys()">
      </div>`;
    });
    th+=`</div></div>`;
  }
  wrap.innerHTML=vh+th+ph;
}

export function checkMsKeys(){
  // Vehicle keys: only conflict within same group of 4; ped keys: global unique
  const vInputs=[...document.querySelectorAll('#ms-keymaps input[id^="ms-vk-"]')];
  const pInputs=[...document.querySelectorAll('#ms-keymaps input[id^="ms-pk-"]')];
  let hasDupe=false;
  // Vehicle: group-aware
  const vByGroup={};
  vInputs.forEach(el=>{
    const m=el.id.match(/ms-vk-(\d+)-/); if(!m)return;
    const g=Math.floor(parseInt(m[1])/4);
    (vByGroup[g]=vByGroup[g]||[]).push(el);
  });
  vInputs.forEach(el=>el.style.borderColor='');
  Object.values(vByGroup).forEach(group=>{
    const vals=group.map(e=>e.value.trim().toLowerCase()).filter(Boolean);
    group.forEach(el=>{
      const v=el.value.trim().toLowerCase();
      if(v&&vals.filter(x=>x===v).length>1){el.style.borderColor='#ef4444';hasDupe=true;}
    });
  });
  // Ped: all must be unique among themselves (ped and vehicle modes are mutually exclusive — no cross-check needed)
  const pVals=pInputs.map(e=>e.value.trim().toLowerCase()).filter(Boolean);
  pInputs.forEach(el=>{
    el.style.borderColor='';
    const v=el.value.trim().toLowerCase();
    if(v&&pVals.filter(x=>x===v).length>1){el.style.borderColor='#ef4444';hasDupe=true;}
  });
  // TMC keys: all must be unique
  const tInputs=[...document.querySelectorAll('#ms-keymaps input[id^="ms-tk-"]')];
  const tVals=tInputs.map(e=>e.value.trim().toLowerCase()).filter(Boolean);
  tInputs.forEach(el=>{
    el.style.borderColor='';
    const v=el.value.trim().toLowerCase();
    if(v&&tVals.filter(x=>x===v).length>1){el.style.borderColor='#ef4444';hasDupe=true;}
    else el.style.borderColor='';
  });
  document.getElementById('ms-key-warn').style.display=hasDupe?'block':'none';
}

export function openSettings(){
  document.getElementById('ms-fname-v').value=fnames.vehicle;
  document.getElementById('ms-fname-p').value=fnames.ped;
  document.getElementById('ms-fname-tmc').value=fnames.tmc;
  renderMsKeymaps();
  document.getElementById('ms-key-warn').style.display='none';
  document.getElementById('settings-modal').classList.add('open');
}
export function closeSettings(){document.getElementById('settings-modal').classList.remove('open');}

export function applyMidSettings(){
  fnames.vehicle=document.getElementById('ms-fname-v').value.trim()||'traffic_counts';
  fnames.ped    =document.getElementById('ms-fname-p').value.trim()||'ped_counts';
  fnames.tmc    =document.getElementById('ms-fname-tmc').value.trim()||'tmc_counts';
  document.getElementById('fn-live').value=fnames[mode==='vehicle'?'vehicle':mode==='tmc'?'tmc':'ped'];
  // Apply vehicle key changes
  vPairs.forEach((p,i)=>{
    const inEl=document.getElementById('ms-vk-'+i+'-in');
    const outEl=document.getElementById('ms-vk-'+i+'-out');
    if(inEl)p.inKey=inEl.value.trim().toLowerCase()||p.inKey;
    if(outEl)p.outKey=outEl.value.trim().toLowerCase()||p.outKey;
  });
  // Apply TMC key changes
  tmcPairs.forEach((p,i)=>{
    const el=document.getElementById('ms-tk-'+i);
    if(el)p.key=el.value.trim().toLowerCase()||p.key;
  });
  // Apply ped key changes
  window.pedPairs.forEach((p,i)=>{
    const el0=document.getElementById('ms-pk-'+i+'-0');
    const el1=document.getElementById('ms-pk-'+i+'-1');
    if(el0)p.key0=el0.value.trim().toLowerCase()||p.key0;
    if(el1)p.key1=el1.value.trim().toLowerCase()||p.key1;
  });
  render();
  closeSettings();
}

export function switchHelpTab(name,btn){
  document.querySelectorAll('#help-modal .modal-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#help-modal .modal-tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('htab-'+name).classList.add('active');
  btn.classList.add('active');
}

export function wireHelpKeydown(){
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeHelp();closeSettings();}});
}
