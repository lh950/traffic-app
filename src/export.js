import {
  cfg, vPairs, tmcPairs, intersection, fnames, tmcData, vData, pedData, tmManual,
  mode, slot, setSlot, slotLabel, initVData, initPedData, initTMCData,
  undoStack, redoStack, filterUndoStack, updateUndoUI, clearTmManual,
} from './state.js';
import { classifyTurn, TURN_CLS_LABEL } from './diagram.js';
import { initApproaches, legLabel } from './setup.js';
import { render } from './counter.js';

export function getCSVFilename(m){
  const n=fnames[m==='vehicle'?'vehicle':m==='ped'?'ped':'tmc']||( m==='vehicle'?'traffic_counts':'ped_counts');
  return n.endsWith('.csv')?n:n+'.csv';
}

/* global __APP_VERSION__ */

function csvMeta() {
  const pi = window.projectInfo || {};
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'2-digit', day:'2-digit' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
  const lines = [
    `Traffic App v${__APP_VERSION__},Exported: ${dateStr} ${timeStr}`,
  ];
  if (pi.projectName) lines.push(`Project: ${pi.projectName}`);
  if (pi.projectNumber) lines.push(`Project #: ${pi.projectNumber}`);
  lines.push('');  // blank separator before data
  return lines.join('\n') + '\n';
}

export function exportCSV(){
  let csv='';
  if(mode==='vehicle'){
    const hdr=['time',...vPairs.map(p=>p.label),'total'].join(',');
    const rows=dir=>vData[dir].map((counts,i)=>[slotLabel(i),...counts,counts.reduce((a,b)=>a+b,0)].join(','));
    const tots=dir=>{const t=vPairs.map((_,pi)=>vData[dir].reduce((s,r)=>s+r[pi],0));return['total',...t,t.reduce((a,b)=>a+b,0)].join(',');};
    csv=['INBOUND',hdr,...rows('in'),tots('in'),'','OUTBOUND',hdr,...rows('out'),tots('out')].join('\n');
  } else if(mode==='ped'){
    const xwalkHdrs=window.pedPairs.flatMap((p,i)=>[`${p.name} ${p.dir0}`,`${p.name} ${p.dir1}`]);
    const hdr=['time',...xwalkHdrs,'total'].join(',');
    const rows=pedData[0].map((_,ri)=>{
      const vals=window.pedPairs.flatMap((p,xi)=>pedData[xi][ri]);
      const total=vals.reduce((a,b)=>a+b,0);
      return[slotLabel(ri),...vals,total].join(',');
    });
    const tots=window.pedPairs.flatMap((p,xi)=>[0,1].map(d=>pedData[xi].reduce((s,r)=>s+r[d],0)));
    const grandTot=tots.reduce((a,b)=>a+b,0);
    csv=[hdr,...rows,['total',...tots,grandTot].join('\n')].join('\n');
  } else {
    // TMC export — standard turning movement count format
    const apps=intersection.approaches;
    // Derive actual recorded type count from tmcData (not tmcPairs.length),
    // so header always matches data even if tmcPairs was reset after recording.
    let nT=tmcPairs.length;
    for(const app of apps){
      for(const dest of app.destinations){
        const slot0=tmcData[app.leg]?.[dest]?.[0];
        if(Array.isArray(slot0)){nT=slot0.length;break;}
      }
      if(nT!==tmcPairs.length)break;
    }
    // Use tmcPairs labels when count matches, otherwise fall back to generic labels
    const typeLabels=nT===tmcPairs.length
      ?tmcPairs.map(p=>p.label)
      :Array.from({length:nT},(_,i)=>tmcPairs[i]?.label||`type ${i+1}`);

    const hdrCols=['time'];
    apps.forEach(app=>{
      const aLbl=legLabel(app.leg);
      app.destinations.forEach(dest=>{
        const cls=classifyTurn(app.leg,dest);
        const dLbl=legLabel(dest);
        const mvmt=`${aLbl} → ${TURN_CLS_LABEL[cls]} (${dLbl})`;
        typeLabels.forEach(lbl=>{hdrCols.push(`${mvmt} ${lbl}`);});
        hdrCols.push(`${mvmt} total`);
      });
      hdrCols.push(`${aLbl} approach total`);
    });
    hdrCols.push('grand total');
    const rows=Array.from({length:cfg.slots},(_,ri)=>{
      const row=[slotLabel(ri)];
      let grandTot=0;
      apps.forEach(app=>{
        let appTot=0;
        app.destinations.forEach(dest=>{
          const counts=(tmcData[app.leg]&&tmcData[app.leg][dest]&&tmcData[app.leg][dest][ri])||Array(nT).fill(0);
          const sub=counts.reduce((a,b)=>a+b,0);
          counts.forEach(v=>row.push(v));
          row.push(sub); appTot+=sub;
        });
        row.push(appTot); grandTot+=appTot;
      });
      row.push(grandTot);
      return row.join(',');
    });
    const totRow=['total'];
    let gTot=0;
    apps.forEach(app=>{
      let appTot=0;
      app.destinations.forEach(dest=>{
        const typeTots=Array.from({length:nT},(_,ti)=>Array.from({length:cfg.slots},(_,ri)=>(tmcData[app.leg]&&tmcData[app.leg][dest]&&tmcData[app.leg][dest][ri]&&tmcData[app.leg][dest][ri][ti])||0).reduce((a,b)=>a+b,0));
        const sub=typeTots.reduce((a,b)=>a+b,0);
        typeTots.forEach(v=>totRow.push(v));
        totRow.push(sub); appTot+=sub;
      });
      totRow.push(appTot); gTot+=appTot;
    });
    totRow.push(gTot);
    csv=[hdrCols.join(','),...rows,totRow.join(',')].join('\n');
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csvMeta()+csv],{type:'text/csv;charset=utf-8'}));
  a.download=getCSVFilename(mode); a.click();
}

export function confirmReset(){
  if(!confirm(`Reset all counts for ${mode} mode? This cannot be undone.`))return;
  filterUndoStack(a=>a.mode!==mode);
  clearTmManual();
  if(mode==='vehicle')initVData();
  else if(mode==='ped')initPedData();
  else initTMCData(initApproaches);
  setSlot(0); updateUndoUI(); render();
}
