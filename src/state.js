// ═══════════════════════════════════════════
// CONFIG STATE
// ═══════════════════════════════════════════
export const TEMPLATES = [
  {id:'t3',  name:'T-intersection', sub:'3 crosswalks', xwalks:3,  slots:['N','E','W']},
  {id:'t4',  name:'4-way',          sub:'4 crosswalks', xwalks:4,  slots:['N','E','S','W']},
  {id:'t5',  name:'5-way',          sub:'5 crosswalks', xwalks:5,  slots:['N','E','S','W','SE']},
];

// xwalkAssign: maps pedPair index → diagram slot label
// Populated when a template is chosen; user can override in setup
export let xwalkAssign = ['N','E','S','W']; // default 4-way
export function setXwalkAssign(arr){ xwalkAssign = arr; }

export const PED_COLORS = [
  {light:'#e8d8ff',mid:'#a888e8',zone:'rgba(184,157,224,0.18)',badge:'rgba(160,120,210,0.22)',bdStroke:'rgba(184,157,224,0.7)',nameColor:'#c8aaee',k0c:'#f0e8ff',k1c:'#c8aaff',d0c:'#e8d8ff',d1c:'#a888e8'},
  {light:'#fde0c0',mid:'#e09050',zone:'rgba(232,168,124,0.18)',badge:'rgba(210,130,80,0.22)', bdStroke:'rgba(232,168,124,0.7)',nameColor:'#d0a070',k0c:'#fde0c0',k1c:'#f0a860',d0c:'#fde0c0',d1c:'#e09050'},
  {light:'#c0eedd',mid:'#40a888',zone:'rgba(122,203,184,0.18)',badge:'rgba(80,170,150,0.22)', bdStroke:'rgba(122,203,184,0.7)',nameColor:'#80ccb8',k0c:'#c0eedd',k1c:'#70c8a8',d0c:'#c0eedd',d1c:'#40a888'},
  {light:'#f8f0a0',mid:'#c09820',zone:'rgba(212,192,112,0.18)',badge:'rgba(180,160,60,0.22)', bdStroke:'rgba(212,192,112,0.7)',nameColor:'#c8b040',k0c:'#f8f0a0',k1c:'#e0b830',d0c:'#f8f0a0',d1c:'#c09820'},
  {light:'#b0d8ff',mid:'#3070c8',zone:'rgba(100,160,230,0.18)',badge:'rgba(60,110,200,0.22)', bdStroke:'rgba(100,160,230,0.7)',nameColor:'#6090d8',k0c:'#b0d8ff',k1c:'#80b0f0',d0c:'#b0d8ff',d1c:'#3070c8'},
  {light:'#f0b8e0',mid:'#b03080',zone:'rgba(200,120,180,0.18)',badge:'rgba(160,60,130,0.22)', bdStroke:'rgba(200,120,180,0.7)',nameColor:'#c060a0',k0c:'#f0b8e0',k1c:'#d080b8',d0c:'#f0b8e0',d1c:'#b03080'},
];

export let cfg = {
  startMinutes:0, intervalMin:15, durationMin:1440,
  get slots(){return Math.max(1,Math.round(this.durationMin/this.intervalMin))}
};

export const periodMeta = { date:'', weather:'', observer:'', equipment:'', notes:'' };

export let customInterval = 15;
export function setCustomInterval(v){ customInterval = v; }

export const vPairs = [
  {label:'light truck',     def:'Class 2 — passenger cars & light vehicles',   inKey:'a', outKey:'j', icon:null},
  {label:'single truck',    def:'Class 5 — 2-axle, 6-tire single unit',         inKey:'s', outKey:'k', icon:null},
  {label:'tractor trailer', def:'Class 8 — 3-axle single trailer combination',  inKey:'d', outKey:'l', icon:null},
  {label:'tandem trailer',  def:'Class 9 — 4-axle single trailer combination',  inKey:'f', outKey:';', icon:null},
];
// Mutates in place (not a reassignment) so window.vPairs stays valid for inline HTML handlers.
export function setVPairs(arr){ vPairs.length=0; vPairs.push(...arr); }

// Shared intersection definition — consumed by pedestrian and turning modes.
export let intersection = {
  template: 't4',
  diagLeg:  'SE',   // for t5: which diagonal leg (NE|SE|SW|NW)
  missingLeg:'S',   // for t3: which cardinal leg is absent (N|E|S|W)
  street1: '',      // N-S street name
  street2: '',      // E-W street name
  street3: '',      // diagonal street name (t5)
  legLabels: {},    // {leg: customLabel}
  oneWay: {},       // {leg: true} — one-way-out: vehicles exit via this leg; no approach, remains valid destination
  oneWayIn: {},     // {leg: true} — one-way-in: vehicles enter from this leg; has approach, excluded from others' destinations
  crosswalks: [
    {name:'North x-walk', dir0:'EB', dir1:'WB', key0:'a', key1:'s', assign:'N'},
    {name:'East x-walk',  dir0:'NB', dir1:'SB', key0:'j', key1:'k', assign:'E'},
    {name:'South x-walk', dir0:'EB', dir1:'WB', key0:'d', key1:'f', assign:'S'},
    {name:'West x-walk',  dir0:'NB', dir1:'SB', key0:'l', key1:';', assign:'W'},
  ],
  approaches: [],
};
// Aliases preserved exactly as in v5: pedTemplate/pedPairs read/write through to intersection.
Object.defineProperty(window,'pedTemplate',{get(){return intersection.template;},set(v){intersection.template=v;}});
Object.defineProperty(window,'pedPairs',   {get(){return intersection.crosswalks;},set(v){intersection.crosswalks=v;}});

// Separate type list for turning-movement counts — one key per type, independent of vehicle in/out.
// Mutates in place so window.tmcPairs stays valid for inline HTML handlers.
export const tmcPairs = [
  {label:'passenger / light',  def:'Cars, vans, pickups',                      key:'a'},
  {label:'single unit',        def:'2-axle, 6-tire trucks',                    key:'s'},
  {label:'tractor trailer',    def:'3-axle+ combination trucks',                key:'d'},
  {label:'bus',                def:'Full-size transit / charter bus',           key:'f'},
];
export function setTmcPairs(arr){ tmcPairs.length=0; tmcPairs.push(...arr); }

export let fnames = {vehicle:'traffic_counts', ped:'ped_counts', tmc:'tmc_counts'};

export let tmcData = {};
export let tmcApproach = null;
export function setTmcApproach(v){ tmcApproach = v; }
export let tmManual = {}; // {leg: {dest: Set('slot-col')}}
export function clearTmManual(){ tmManual = {}; }

// ═══════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════
export let vData   = {in:[],out:[]};
export let vManual = {in:new Set(),out:new Set()};
export let pedData   = [];
export let pedManual = [];

export function initVData(){
  const n=vPairs.length,s=cfg.slots;
  vData={in:Array.from({length:s},()=>Array(n).fill(0)),out:Array.from({length:s},()=>Array(n).fill(0))};
  vManual={in:new Set(),out:new Set()};
}

export function initTMCData(initApproaches){
  tmcData={}; tmManual={};
  initApproaches();
  const s=cfg.slots,n=tmcPairs.length;
  intersection.approaches.forEach(app=>{
    tmcData[app.leg]={}; tmManual[app.leg]={};
    app.destinations.forEach(dest=>{
      tmcData[app.leg][dest]=Array.from({length:s},()=>Array(n).fill(0));
      tmManual[app.leg][dest]=new Set();
    });
  });
  const counted=intersection.approaches.filter(a=>a.count!==false);
  tmcApproach=counted.length?counted[0].leg:(intersection.approaches[0]?.leg||null);
}

export function initPedData(){
  const s=cfg.slots;
  pedData=window.pedPairs.map(()=>Array.from({length:s},()=>[0,0]));
  pedManual=window.pedPairs.map(()=>new Set());
}

initVData(); initPedData();

// ═══════════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════════
export let undoStack=[], redoStack=[];
export function pushUndo(action){undoStack.push(action);redoStack=[];updateUndoUI()}
export function updateUndoUI(){
  document.getElementById('btn-undo').disabled=undoStack.length===0;
  document.getElementById('btn-redo').disabled=redoStack.length===0;
  document.getElementById('undo-count').textContent=undoStack.length;
}
export function undo(render){
  if(!undoStack.length)return;
  const a=undoStack.pop();
  applyAction(a,true);
  redoStack.push(a);
  updateUndoUI(); render();
}
export function redo(render){
  if(!redoStack.length)return;
  const a=redoStack.pop();
  applyAction(a,false);
  undoStack.push(a);
  updateUndoUI(); render();
}
export function applyAction(a,reverse){
  if(a.type==='vcount'){
    const delta=reverse?-1:1;
    vData[a.dir][a.slot][a.col]+=delta;
    vData[a.dir][a.slot][a.col]=Math.max(0,vData[a.dir][a.slot][a.col]);
  } else if(a.type==='pcount'){
    const delta=reverse?-1:1;
    pedData[a.xi][a.slot][a.di]+=delta;
    pedData[a.xi][a.slot][a.di]=Math.max(0,pedData[a.xi][a.slot][a.di]);
  } else if(a.type==='vcell'){
    vData[a.dir][a.slot][a.col]=reverse?a.before:a.after;
  } else if(a.type==='pcell'){
    pedData[a.xi][a.slot][a.di]=reverse?a.before:a.after;
  } else if(a.type==='vreset'){
    if(reverse){vData.in[a.slot]=a.inBefore.slice();vData.out[a.slot]=a.outBefore.slice();}
    else{vData.in[a.slot]=a.inAfter.slice();vData.out[a.slot]=a.outAfter.slice();}
  } else if(a.type==='preset'){
    if(reverse){pedData.forEach((xw,xi)=>{xw[a.slot]=a.before[xi].slice();});}
    else{pedData.forEach((xw,xi)=>{xw[a.slot]=a.after[xi].slice();});}
  } else if(a.type==='tmcount'){
    const delta=reverse?-1:1;
    if(tmcData[a.leg]&&tmcData[a.leg][a.dest]&&tmcData[a.leg][a.dest][a.slot])
      tmcData[a.leg][a.dest][a.slot][a.col]=Math.max(0,tmcData[a.leg][a.dest][a.slot][a.col]+delta);
  } else if(a.type==='tmcell'){
    if(tmcData[a.leg]&&tmcData[a.leg][a.dest]&&tmcData[a.leg][a.dest][a.slot])
      tmcData[a.leg][a.dest][a.slot][a.col]=reverse?a.before:a.after;
  } else if(a.type==='tmcreset'){
    const src=reverse?a.before:a.after;
    Object.keys(src).forEach(leg=>Object.keys(src[leg]).forEach(dest=>{
      if(tmcData[leg]&&tmcData[leg][dest]&&tmcData[leg][dest][a.slot])
        tmcData[leg][dest][a.slot]=src[leg][dest].slice();
    }));
  }
}
export function resetUndoStacks(){ undoStack=[]; redoStack=[]; }
export function filterUndoStack(predicate){ undoStack=undoStack.filter(predicate); redoStack=[]; }

// ═══════════════════════════════════════════
// SHARED STATE
// ═══════════════════════════════════════════
export let slot=0, mode='vehicle', kbdCollapsed=false;
export let scrollOnRender=false; // only true when slot changes via navigation
export let focusMode=false;
export let vGroup=0;  // active vehicle type group (groups of 4)
export let focusTarget=0; // index into pedPairs (ped) or vPairs (vehicle)
export let diagWin=null;
export let tmcWin=null;
export const diagTimers={};

export function setSlot(v){ slot=v; }
export function setMode_(v){ mode=v; }
export function setKbdCollapsed(v){ kbdCollapsed=v; }
export function setScrollOnRender(v){ scrollOnRender=v; }
export function setFocusMode(v){ focusMode=v; }
export function setVGroup(v){ vGroup=v; }
export function setFocusTargetState(v){ focusTarget=v; }
export function setDiagWin(v){ diagWin=v; }
export function setTmcWin(v){ tmcWin=v; }

export function slotLabel(i){
  const s=cfg.startMinutes+i*cfg.intervalMin, e=s+cfg.intervalMin;
  const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  return fmt(s)+' – '+fmt(e);
}

// ═══════════════════════════════════════════
// MULTI-PERIOD
// ═══════════════════════════════════════════
export const periods=[];
export let activePeriodIdx=0;
export function setActivePeriodIdx(i){activePeriodIdx=i;}

function cloneManual(m){
  if(m instanceof Set) return new Set(m);
  if(Array.isArray(m)) return m.map(cloneManual);
  const out={};
  for(const k in m) out[k]=cloneManual(m[k]);
  return out;
}

export function captureActivePeriod(){
  return {
    cfg:{startMinutes:cfg.startMinutes,intervalMin:cfg.intervalMin,durationMin:cfg.durationMin},
    meta:{...periodMeta},
    vData:JSON.parse(JSON.stringify(vData)),
    pedData:JSON.parse(JSON.stringify(pedData)),
    tmcData:JSON.parse(JSON.stringify(tmcData)),
    vManual:cloneManual(vManual),
    pedManual:cloneManual(pedManual),
    tmManual:cloneManual(tmManual),
  };
}

export function restoreActivePeriod(p){
  Object.assign(cfg,p.cfg);
  Object.assign(periodMeta, p.meta || {date:'',weather:'',observer:'',equipment:'',notes:''});
  Object.assign(vData,JSON.parse(JSON.stringify(p.vData)));
  pedData.length=0; pedData.push(...JSON.parse(JSON.stringify(p.pedData)));
  Object.keys(tmcData).forEach(k=>delete tmcData[k]);
  Object.assign(tmcData,JSON.parse(JSON.stringify(p.tmcData||{})));
  vManual.in=cloneManual(p.vManual?.in||new Set());
  vManual.out=cloneManual(p.vManual?.out||new Set());
  pedManual.length=0; pedManual.push(...cloneManual(Array.isArray(p.pedManual)?p.pedManual:[]));
  Object.keys(tmManual).forEach(k=>delete tmManual[k]);
  Object.assign(tmManual,cloneManual(p.tmManual||{}));
}

export function initDefaultPeriods(name='Period 1'){
  periods.length=0;
  activePeriodIdx=0;
  periods.push({name,data:captureActivePeriod()});
}
