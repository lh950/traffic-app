// Pop-out vehicle reference window for Trip Gen counting — same pattern as diagram.js's TMC
// turning-movement popup (buildTurningPopupHTML/toggleTurningDiagram): a Blob-URL'd HTML
// document opened via window.open(), kept in sync with the live counter via postMessage, with
// keyboard-passthrough back to the opener so typing directly in the popup still counts.
// Deliberately its own file (not folded into tripgenCount.js) for the same reason diagram.js
// is split from counter.js/state.js — keeps the popup-HTML-building logic isolated from the
// counting engine it displays.
//
// tripgenCount.js is deliberately standalone from state.js (see that file's header), so this
// module reads live state via tgLiveState()/slotLabel()/distinctTgGroups() rather than
// importing shared mutable bindings the way diagram.js pulls from state.js. That import runs
// the other direction too (tripgenCount.js imports toggleTgDiagram/updateTgDiagram/
// flashTgCell from here) — the same circular-import shape this codebase already has between
// counter.js and focus.js.
import { tgLiveState, slotLabel, distinctTgGroups } from './tripgenCount.js';

let tgWin = null;

// Rows for the currently active group only — a physical key can mean a different
// classification depending on which group is active (that's the whole point of grouping), so
// showing every classification regardless of group would make the key column ambiguous. (The
// TMC popup's own tmcPopupPayload doesn't filter by vGroup, but TMC's vLabels rows are vehicle
// *types*, not group-scoped keys the way Trip Gen's in/out keys are — so unlike TMC, filtering
// here is the correct read of "mirror whatever pattern it uses" rather than a literal copy.)
function tgPopupPayload(flash) {
  const { classifications, tgData, slot, cfg, tgGroup } = tgLiveState();
  const groupIds = distinctTgGroups();
  const nG = groupIds.length;
  const gid = groupIds[Math.min(tgGroup, nG - 1)] ?? 0;
  const rows = classifications
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (c.group ?? 0) === gid)
    .map(({ c, i }) => ({
      idx: i,
      label: c.label,
      inKey: (c.inKey || '?').toUpperCase(),
      outKey: (c.outKey || '?').toUpperCase(),
      inCount: (tgData.in[slot] && tgData.in[slot][i]) || 0,
      outCount: (tgData.out[slot] && tgData.out[slot][i]) || 0,
    }));
  const payload = {
    type: 'tgUpdate',
    interval: slotLabel(slot),
    groupLabel: nG > 1 ? `group ${tgGroup + 1}/${nG}` : null,
    rows,
  };
  if (flash) payload.flash = flash; // {idx, dir}
  return payload;
}

export function buildTgPopupHTML() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const bg = dark ? '#242420' : '#ffffff';
  const fg = dark ? '#f0efe9' : '#1a1a18';
  const fg2 = dark ? '#a0a090' : '#6b6960';
  const bd = dark ? '#3a3a34' : '#e0ddd5';
  const surf = dark ? '#2e2e2a' : '#f4f3ec';
  const surf2 = dark ? '#383834' : '#e8e7e0';
  const blue = dark ? '#60a5fa' : '#2563eb';
  const blueBg = dark ? 'rgba(96,165,250,.15)' : 'rgba(37,99,235,.08)';
  const green = dark ? '#4ade80' : '#16a34a';
  const greenBg = dark ? 'rgba(74,222,128,.18)' : 'rgba(22,163,74,.12)';
  const payload = tgPopupPayload();
  const initData = payload ? JSON.stringify(payload) : 'null';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Vehicle Reference</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${bg};color:${fg};width:100%;height:100%;overflow:hidden;font-family:-apple-system,sans-serif}
.focus-warn{display:none;position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;font-size:12px;font-weight:500;text-align:center;padding:6px;z-index:99}
.focus-warn.visible{display:block}
.wrap{display:flex;flex-direction:column;height:100vh;padding:10px;gap:8px}
.bar{display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:.5px solid ${bd};flex-shrink:0;flex-wrap:wrap}
.title{font-size:10px;font-weight:600;color:${fg2};letter-spacing:.08em;text-transform:uppercase;font-family:monospace;flex:1}
.group-badge{font-size:11px;font-weight:600;color:${fg2};font-family:monospace;background:${surf2};
  border:.5px solid ${bd};border-radius:4px;padding:2px 8px}
.interval-badge{font-size:14px;font-weight:700;color:${fg};font-variant-numeric:tabular-nums;font-family:monospace;
  background:${surf2};border:.5px solid ${bd};border-radius:4px;padding:2px 8px}
.close-btn{background:${surf};border:.5px solid ${bd};border-radius:50%;width:22px;height:22px;color:${fg2};
  font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.close-btn:hover{background:${bd}}
.table-wrap{flex:1;min-height:0;overflow:auto}
table{border-collapse:collapse;width:100%;font-family:monospace;font-size:13px}
th{background:${surf};color:${fg2};font-size:10px;font-weight:600;text-transform:uppercase;
   letter-spacing:.05em;padding:6px 10px;border-bottom:.5px solid ${bd};text-align:left}
th.num{text-align:center}
td{padding:6px 10px;border-bottom:.5px solid ${bd};vertical-align:middle}
td.label{font-size:13px;font-weight:600}
td.dir{text-align:center;min-width:80px}
.dir-inner{display:inline-flex;align-items:center;gap:8px;justify-content:center}
kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 4px;
  border-radius:4px;border:.5px solid ${bd};background:${surf2};font-size:11px;font-weight:700;font-family:monospace}
.cnt{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;min-width:22px;text-align:right;
  transition:background-color .18s ease, color .18s ease}
.cnt.in{color:${blue}}
.cnt.out{color:${green}}
.cnt.flash-in{background:${blueBg};border-radius:4px}
.cnt.flash-out{background:${greenBg};border-radius:4px}
.empty-hint{font-size:12px;color:${fg2};padding:16px 10px}
</style></head><body>
<div class="focus-warn" id="focus-warn">⚠ window not focused — keystrokes will not register · click here to resume</div>
<div class="wrap">
  <div class="bar">
    <span class="title">vehicle reference</span>
    <span class="group-badge" id="group-badge" style="display:none">–</span>
    <span class="interval-badge" id="tg-diag-interval">–</span>
    <button class="close-btn" onclick="window.close()">×</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>classification</th><th class="num">in</th><th class="num">out</th></tr></thead>
      <tbody id="tg-diag-body"></tbody>
    </table>
  </div>
</div>
${'<' + 'script>'}
let state=${initData};
const flashTimers={};
function render(d){
  if(!d)return;
  state=d;
  document.getElementById('tg-diag-interval').textContent=d.interval||'–';
  const gb=document.getElementById('group-badge');
  if(gb){
    if(d.groupLabel){gb.textContent=d.groupLabel;gb.style.display='';}
    else{gb.style.display='none';}
  }
  const tb=document.getElementById('tg-diag-body');
  if(!tb)return;
  if(!d.rows||!d.rows.length){
    tb.innerHTML='<tr><td colspan="3" class="empty-hint">no classifications in this group</td></tr>';
    return;
  }
  tb.innerHTML=d.rows.map(r=>\`
    <tr>
      <td class="label">\${r.label}</td>
      <td class="dir"><span class="dir-inner"><kbd>\${r.inKey}</kbd><span class="cnt in" id="tg-diag-in-\${r.idx}">\${r.inCount}</span></span></td>
      <td class="dir"><span class="dir-inner"><kbd>\${r.outKey}</kbd><span class="cnt out" id="tg-diag-out-\${r.idx}">\${r.outCount}</span></span></td>
    </tr>\`).join('');
  if(d.flash)applyFlash(d.flash);
}
function applyFlash(f){
  const el=document.getElementById('tg-diag-'+f.dir+'-'+f.idx);
  if(!el)return;
  const key=f.dir+'-'+f.idx;
  if(flashTimers[key])clearTimeout(flashTimers[key]);
  el.classList.add('flash-'+f.dir);
  flashTimers[key]=setTimeout(()=>{el.classList.remove('flash-'+f.dir);},260);
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
  if(!d||d.type!=='tgUpdate')return;
  render(d);
});
if(state)render(state);
${'<' + '/script>'}
</body></html>`;
}

export function toggleTgDiagram() {
  if (tgWin && !tgWin.closed) { tgWin.focus(); return; }
  const htmlStr = buildTgPopupHTML();
  const blob = new Blob([htmlStr], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, 'tgVehicleReference', 'width=460,height=440,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no');
  if (!win) { alert('Please allow popups for this page to open the vehicle reference window.'); return; }
  tgWin = win;
  win.onbeforeunload = () => { tgWin = null; URL.revokeObjectURL(url); };
  setTimeout(() => {
    if (win && !win.closed) {
      const p = tgPopupPayload();
      if (p) win.postMessage(p, '*');
    }
  }, 400);
}

export function updateTgDiagram(flash) {
  if (!tgWin || tgWin.closed) return;
  const p = tgPopupPayload(flash);
  if (p) tgWin.postMessage(p, '*');
}

export function flashTgCell(idx, dir) {
  updateTgDiagram({ idx, dir });
}

export function isTgDiagOpen() {
  return !!(tgWin && !tgWin.closed);
}
