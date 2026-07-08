import {
  vPairs, intersection, vData, vManual, pedData, pedManual, tmcData, tmManual,
  slot, mode, tmcApproach, focusMode, focusTarget, pushUndo, diagWin, tmcWin, diagTimers,
  slotLabel,
} from './state.js';
import { render } from './counter.js';
import { pedCountsForSlot, tmcPopupPayload } from './diagram.js';

// ═══════════════════════════════════════════
// VEHICLE RECORDING
// ═══════════════════════════════════════════
export function vRecord(dir,pi){
  pushUndo({type:'vcount',dir,slot,col:pi});
  vData[dir][slot][pi]++;
  render();
  const el=document.getElementById(`vk-${dir}-${pi}`);
  if(el){el.classList.add(`flash-${dir}`);setTimeout(()=>el.classList.remove(`flash-${dir}`),200);}
  const row=document.getElementById(`v-${dir}-r-${slot}`);
  if(row){row.classList.add(`rf${dir[0]}`);setTimeout(()=>row.classList.remove(`rf${dir[0]}`),240);}
}

// ═══════════════════════════════════════════
// PED RECORDING + DIAGRAM FLASH
// ═══════════════════════════════════════════
export function pedRecord(xi,di){
  pushUndo({type:'pcount',xi,di,slot});
  pedData[xi][slot][di]++;
  render();
  const kid=`pk-${xi}-${di}`;
  const kel=document.getElementById(kid);
  if(kel){kel.classList.add(`flash-p${xi}`);setTimeout(()=>kel.classList.remove(`flash-p${xi}`),200);}
  const row=document.getElementById(`ped-${xi}-r-${slot}`);
  if(row){row.classList.add(`rfp${xi}`);setTimeout(()=>row.classList.remove(`rfp${xi}`),240);}
  if(diagWin&&!diagWin.closed){
    const key=`${xi}-${di}`;
    if(diagTimers[key])clearTimeout(diagTimers[key]);
    diagTimers[key+'_count']=(diagTimers[key+'_count']||0)+1;
    const count=diagTimers[key+'_count'];
    const totalDur=1500+500*(count-1);
    diagWin.postMessage({type:'flash',xi,di,dur:totalDur,interval:slotLabel(slot),counts:pedCountsForSlot(),names:window.pedPairs.map(p=>p.name),n:window.pedPairs.length},'*');
    diagTimers[key]=setTimeout(()=>{
      diagTimers[key+'_count']=0;
    },totalDur+200);
  }
}

// ═══════════════════════════════════════════
// TURNING COUNTING
// ═══════════════════════════════════════════
export function tmcRecord(typeIdx){
  const app=intersection.approaches.find(a=>a.leg===tmcApproach);
  if(!app||!app.destinations.length)return;
  const dest=app.destinations[focusTarget];
  if(!tmcData[app.leg]||!tmcData[app.leg][dest]||!tmcData[app.leg][dest][slot])return;
  pushUndo({type:'tmcount',mode:'turning',leg:app.leg,dest,slot,col:typeIdx});
  tmcData[app.leg][dest][slot][typeIdx]++;
  render();
  const chips=document.querySelectorAll(`#kbd-grid .kbd-chip`);
  const chip=chips[typeIdx];
  if(chip){chip.classList.add('flash');setTimeout(()=>chip.classList.remove('flash'),140);}
  if(tmcWin&&!tmcWin.closed){const p=tmcPopupPayload();if(p)tmcWin.postMessage(p,'*');}
}

// ═══════════════════════════════════════════
// CELL EDITING
// ═══════════════════════════════════════════
export function attachEditors(tableEl){
  tableEl.querySelectorAll('tbody td[data-editable]').forEach(td=>{
    td.addEventListener('click',startCellEdit);
  });
}
function startCellEdit(e){
  const td=e.currentTarget;
  if(td.querySelector('input'))return;
  const before=parseInt(td.textContent)||0;
  td.classList.add('editing');
  const inp=document.createElement('input');
  inp.type='number'; inp.min='0'; inp.value=before;
  td.textContent=''; td.appendChild(inp);
  inp.focus(); inp.select();
  function commit(){
    const raw=parseInt(inp.value); const after=isNaN(raw)||raw<0?before:raw;
    const tableId=td.dataset.table, row=+td.dataset.row, col=+td.dataset.col;
    if(mode==='vehicle'){
      pushUndo({type:'vcell',dir:tableId,slot:row,col,before,after});
      vData[tableId][row][col]=after;
      if(after!==before)vManual[tableId].add(row+'-'+col);
    } else if(mode==='ped'){
      pushUndo({type:'pcell',xi:+tableId,slot:row,di:col,before,after,mode:'ped'});
      pedData[+tableId][row][col]=after;
      if(after!==before)pedManual[+tableId].add(row+'-'+col);
    } else if(mode==='turning'){
      const leg=td.dataset.leg, dest=td.dataset.dest;
      pushUndo({type:'tmcell',leg,dest,slot:row,col,before,after,mode:'turning'});
      if(tmcData[leg]&&tmcData[leg][dest]&&tmcData[leg][dest][row])tmcData[leg][dest][row][col]=after;
      if(after!==before&&tmManual[leg]&&tmManual[leg][dest])tmManual[leg][dest].add(row+'-'+col);
    }
    render();
  }
  inp.addEventListener('blur',commit);
  inp.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ev.preventDefault();inp.blur();}
    if(ev.key==='Escape'){inp.value=before;inp.blur();}
    ev.stopPropagation();
  });
}

// ═══════════════════════════════════════════
// CONTEXT MENU — right-click time cell to reset interval
// ═══════════════════════════════════════════
let ctxSlot=null, ctxMode=null;
export function attachContextMenus(tableEl){
  tableEl.querySelectorAll('.time-cell').forEach(td=>{
    td.addEventListener('contextmenu',e=>{
      e.preventDefault();
      ctxSlot=+td.dataset.slot; ctxMode=td.dataset.mode;
      const menu=document.getElementById('ctx-menu');
      menu.style.left=e.clientX+'px'; menu.style.top=e.clientY+'px';
      menu.classList.add('open');
      document.getElementById('ctx-reset-interval').textContent=`↺ reset interval ${slotLabel(ctxSlot)}`;
    });
  });
}

export function wireContextMenu(){
  document.getElementById('ctx-reset-interval').onclick=()=>{
    if(ctxSlot===null)return;
    if(ctxMode==='vehicle'){
      const inBefore=vData.in[ctxSlot].slice(), outBefore=vData.out[ctxSlot].slice();
      vData.in[ctxSlot]=Array(vPairs.length).fill(0);
      vData.out[ctxSlot]=Array(vPairs.length).fill(0);
      pushUndo({type:'vreset',slot:ctxSlot,inBefore,outBefore,inAfter:vData.in[ctxSlot].slice(),outAfter:vData.out[ctxSlot].slice()});
    } else if(ctxMode==='ped'){
      const before=pedData.map(xw=>xw[ctxSlot].slice());
      pedData.forEach(xw=>{xw[ctxSlot]=[0,0];});
      pushUndo({type:'preset',slot:ctxSlot,before,after:pedData.map(xw=>xw[ctxSlot].slice()),mode:'ped'});
    } else if(ctxMode==='tmc'){
      const before={},after={};
      intersection.approaches.forEach(app=>{
        before[app.leg]={}; after[app.leg]={};
        app.destinations.forEach(dest=>{
          if(tmcData[app.leg]&&tmcData[app.leg][dest]){
            before[app.leg][dest]=(tmcData[app.leg][dest][ctxSlot]||[]).slice();
            tmcData[app.leg][dest][ctxSlot]=Array(vPairs.length).fill(0);
            after[app.leg][dest]=tmcData[app.leg][dest][ctxSlot].slice();
          }
        });
      });
      pushUndo({type:'tmcreset',slot:ctxSlot,before,after,mode:'turning'});
    }
    document.getElementById('ctx-menu').classList.remove('open');
    render();
  };
  document.addEventListener('click',()=>document.getElementById('ctx-menu').classList.remove('open'));
}
