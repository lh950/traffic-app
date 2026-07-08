import './style.css';
import './analysis/style.css';

import {
  cfg, vPairs, tmcPairs, setTmcPairs, intersection, fnames, vData, pedData, tmcData,
  vManual, pedManual, tmManual, slotLabel, setVPairs, setTmcApproach,
  initVData, initPedData, initTMCData, mode,
  periods, activePeriodIdx, setActivePeriodIdx,
  captureActivePeriod, restoreActivePeriod, initDefaultPeriods,
  resetUndoStacks, updateUndoUI,
} from './state.js';
import {
  switchSetupTab, setIntervalLen, updateDerived, updateVCount, applyVPreset,
  checkVKeys, checkPKeys, setLegLabel, toggleLegCrosswalk, toggleLegApproach, toggleLegOneWay, toggleLegOneWayIn,
  updateCrosswalkField, toggleApproachDestUnified, toggleApproachCount, renderLegConfig,
  buildTemplateGrid, renderVPairsList, renderTmcPairsList, updateTmcCount, checkTmcKeys, applyTmcPreset,
  copyVPairsFromProject, copyTmcPairsFromProject,
  updateTemplateSuboption, setDiagLeg, setMissingLeg,
  initApproaches, updateDefaultFilenames, wireSetupFilenameInputs, startCounting, goSetup,
  openLegPopover, closeLegPopover, getOpenLeg, wireLegPopoverDismiss,
} from './setup.js';
import { renderSetupDiagram, updateDiagram, toggleDiagram, toggleTurningDiagram, classifyTurn } from './diagram.js';
import {
  setMode, render, buildKbd, buildCounterUI, updateCfgFields, vGroupPrev, vGroupNext,
} from './counter.js';
import { wireContextMenu } from './record.js';
import {
  toggleFocusMode, cycleFocus, setFocusTarget, undo, redo, wireKeydown,
} from './focus.js';
import { exportCSV, confirmReset } from './export.js';
import { exportXLSX, exportTripgenXLSX } from './exportXlsx.js';
import {
  openHelp, closeHelp, switchHelpTab, openSettings, closeSettings,
  applyMidSettings, checkMsKeys, wireHelpKeydown,
} from './help.js';

import { parseTmcCsv } from './parseTmcCsv.js';
import { parseRawCountXlsx, buildIntersectionFromMeta } from './parseRawCountXlsx.js';
import * as analysisData from './analysis/ui/dataAdapter.js';
import { renderSummary } from './analysis/ui/summary.js';
import { renderTmcSection } from './analysis/ui/tmcDiagram.js';
import { renderLosSection } from './analysis/ui/losSection.js';
import { openPrintReport } from './printReport.js';
import { printSummaryReport, printIntersectionReport } from './printPedReport.js';
import { buildVolumeProfileSVG, buildCrosswalkBarSVG, buildChartLegend, dirSplitBar, CW_COLORS } from './chartUtils.js';
import { renderTripGenSection, DEFAULT_PEAK_WINDOWS } from './analysis/ui/tripgenSection.js';

import {
  addClassification as tgAddClassification, beginCounting as tgBeginCounting,
  wireKeydown as tgWireKeydown, finishLocation as tgFinishLocation,
  resetClassifications as tgResetClassifications, beginEditing as tgBeginEditing,
  beginRecount as tgBeginRecount, defaultClassificationsFor as tgDefaultClassificationsFor,
} from './tripgenCount.js';

// ── Count type enabled flags ──
const enabledModes = { ped: true, vehicle: true, turning: true };

function syncCountTypeToggles() {
  const pe = document.getElementById('ct-ped');
  const ve = document.getElementById('ct-vehicle');
  const te = document.getElementById('ct-turning');
  if (pe) pe.checked = enabledModes.ped;
  if (ve) ve.checked = enabledModes.vehicle;
  if (te) te.checked = enabledModes.turning;
}
function readCountTypeToggles() {
  enabledModes.ped = document.getElementById('ct-ped')?.checked ?? true;
  enabledModes.vehicle = document.getElementById('ct-vehicle')?.checked ?? true;
  enabledModes.turning = document.getElementById('ct-turning')?.checked ?? true;
}

function buildCounterSidebar() {
  const nav = document.getElementById('counter-sidebar');
  if (!nav) return;

  const items = [];
  if (enabledModes.ped)     items.push({ key: 'ped',     label: 'Pedestrian',       icon: '🚶' });
  if (enabledModes.vehicle)  items.push({ key: 'vehicle',  label: 'Vehicle',          icon: '🚗' });
  if (enabledModes.turning)  items.push({ key: 'turning',  label: 'Turning movement', icon: '↻' });

  const isCountMode = document.getElementById('counter-screen')?.classList.contains('analyze-mode') === false;

  nav.innerHTML = items.map(item => `
    <button class="sidebar-nav-item${mode === item.key && isCountMode ? ' active' : ''}"
      data-mode="${item.key}">
      <span class="sidebar-nav-icon">${item.icon}</span>
      <span class="sidebar-nav-label">${item.label}</span>
    </button>
  `).join('') + `
    <div class="sidebar-nav-divider"></div>
    <button class="sidebar-nav-item${!isCountMode ? ' active' : ''}" data-mode="analyze">
      <span class="sidebar-nav-icon">📊</span>
      <span class="sidebar-nav-label">Analysis</span>
    </button>
  `;

  nav.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      if (m === 'analyze') {
        window.goToAnalyzeMode();
      } else {
        window.goToCountMode();
        setMode(m);
      }
    });
  });
}

// ── Expose state objects + functions referenced bare in inline HTML handlers ──
window.vPairs = vPairs;
window.tmcPairs = tmcPairs;
window.intersection = intersection;
Object.assign(window, {
  switchSetupTab, setIntervalLen, updateDerived, updateVCount, applyVPreset,
  checkVKeys, checkPKeys, setLegLabel, toggleLegCrosswalk, toggleLegApproach, toggleLegOneWay, toggleLegOneWayIn,
  updateCrosswalkField, toggleApproachDestUnified, toggleApproachCount, renderLegConfig,
  renderTmcPairsList, updateTmcCount, checkTmcKeys, applyTmcPreset,
  openLegPopover, closeLegPopover, getOpenLeg,
  setDiagLeg, setMissingLeg, updateDiagram, toggleDiagram, toggleTurningDiagram,
  setMode, render, buildKbd, updateCfgFields, vGroupPrev, vGroupNext,
  toggleFocusMode, cycleFocus, setFocusTarget, undo, redo,
  exportCSV, exportXLSX, confirmReset,
  exportTripgenXLSX: () => exportTripgenXLSX(tripgenEntries, tripgenSiteInfo, projectInfo),
  openHelp, closeHelp, switchHelpTab, openSettings, closeSettings,
  applyMidSettings, checkMsKeys,
  goSetup,
  openPrintReport: () => openPrintReport(projectInfo),
  exportAnalyzeXLSX: () => {
    if (projectType === 'tripgen') exportTripgenXLSX(tripgenEntries, tripgenSiteInfo, projectInfo);
    else exportXLSX();
  },
});

// Wrap startCounting to initialize periods after data is ready
window.startCounting = function () {
  startCounting();
  initDefaultPeriods();
  buildPeriodTabs();
  buildCounterSidebar();
};

(function(){
  const b=document.getElementById('focus-banner');
  let popupFocused=false;
  function isCounterActive(){
    const cs=document.getElementById('counter-screen');
    const tcs=document.getElementById('tripgen-counter-screen');
    return (cs&&cs.classList.contains('active'))||(tcs&&tcs.classList.contains('active'));
  }
  function updateFocusBanner(){
    const popupOpen=(window.tmcWin&&!window.tmcWin.closed)||(window.diagWin&&!window.diagWin.closed);
    const mainFocused=document.hasFocus();
    b.classList.remove('popup-mode');
    if(mainFocused||!isCounterActive()){
      b.classList.remove('visible');
      document.body.classList.remove('unfocused');
    } else if(popupOpen&&popupFocused){
      b.textContent='diagram window open — keystrokes register from either window';
      b.classList.add('visible','popup-mode');
      document.body.classList.remove('unfocused');
    } else {
      b.textContent='⚠ window not focused — keystrokes will not register · click anywhere to resume';
      b.classList.add('visible');
      document.body.classList.add('unfocused');
    }
  }
  window.addEventListener('focus',()=>{popupFocused=false;updateFocusBanner();});
  window.addEventListener('blur', updateFocusBanner);
  window.addEventListener('message',e=>{
    if(e.data?.type==='popup-focus'){popupFocused=true;updateFocusBanner();}
    if(e.data?.type==='popup-blur'){popupFocused=false;updateFocusBanner();}
  });
  window.updateFocusBanner=updateFocusBanner;
  window.setPopupFocused=v=>{popupFocused=v;updateFocusBanner();};
  if(!document.hasFocus()) updateFocusBanner();

  // Any click anywhere in the counter screen that lands on a non-input element
  // returns keyboard focus to the hidden anchor, ensuring counts register immediately.
  // setTimeout(0) defers until after the browser finishes its own focus handling (Firefox-safe).
  document.getElementById('counter-screen').addEventListener('mouseup', e => {
    const tag = e.target.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
    setTimeout(()=>{ document.getElementById('counter-kbd-anchor')?.focus({preventScroll:true}); }, 0);
  });
})();

wireKeydown();
wireHelpKeydown();
wireContextMenu();
wireSetupFilenameInputs();
wireLegPopoverDismiss();

['ct-ped','ct-vehicle','ct-turning'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    readCountTypeToggles();
    buildCounterSidebar();
  });
});

buildTemplateGrid();
renderVPairsList();
renderTmcPairsList();
updateDerived();
renderLegConfig();
renderSetupDiagram();
updateTemplateSuboption();
initApproaches();

// ═══════════════════════════════════════════
// SCREEN ROUTER
// ═══════════════════════════════════════════
const SCREENS = ['landing-screen', 'area-setup-screen', 'summary-screen', 'ix-analysis-screen', 'setup-screen', 'counter-screen', 'tripgen-setup-screen', 'tripgen-counter-screen', 'tripgen-qaqc-screen', 'analyze-screen'];
let projectType = null; // 'intersection' | 'tripgen' | null (no project loaded)

function showScreen(id) {
  SCREENS.forEach((s) => {
    const el = document.getElementById(s);
    if (!el) return;
    el.style.display = s === id ? '' : 'none';
    el.classList.toggle('active', s === id);
  });
}
showScreen('landing-screen');

window.goToCountMode = function () {
  document.getElementById('btn-count-mode')?.classList.add('active');
  document.getElementById('btn-analyze-mode')?.classList.remove('active');
  showScreen('counter-screen');
  buildCounterSidebar();
};
window.goToAnalyzeMode = async function () {
  document.getElementById('btn-count-mode')?.classList.remove('active');
  document.getElementById('btn-analyze-mode')?.classList.add('active');
  showScreen('analyze-screen');
  document.getElementById('btn-analyze-to-count').style.display = '';
  document.getElementById('btn-analyze-to-qaqc').style.display = 'none';
  document.getElementById('analyze-sub').textContent = '— live intersection count';
  await renderIntersectionAnalysis();
};
document.getElementById('btn-analyze-to-count')?.addEventListener('click', () => window.goToCountMode());
document.getElementById('btn-analyze-print')?.addEventListener('click', () => {
  populatePrintHeader();
  window.print();
});
document.getElementById('btn-analyze-to-landing')?.addEventListener('click', () => {
  document.getElementById('btn-analyze-to-count').style.display = 'none';
  document.getElementById('btn-analyze-to-qaqc').style.display = 'none';
  showScreen('landing-screen');
});

// ═══════════════════════════════════════════
// LIVE COUNTER STATE -> ANALYSIS SHAPES
// (converts the in-memory counter state into the exact parsed shapes analyze.js already
// consumes — see DATA_CONTRACT.md from the original two-app split — so summary.js/
// tmcDiagram.js/losSection.js are reused completely unmodified, no CSV round-trip needed.)
// ═══════════════════════════════════════════
function slotStartEnd(i) {
  const s = cfg.startMinutes + i * cfg.intervalMin, e = s + cfg.intervalMin;
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { start: fmt(s), end: fmt(e) };
}
function liveVehicleParsed() {
  const intervals = Array.from({ length: cfg.slots }, (_, i) => {
    const { start, end } = slotStartEnd(i);
    return { label: slotLabel(i), start, end, inbound: vData.in[i] || [], outbound: vData.out[i] || [] };
  });
  return { types: vPairs.map((p) => p.label), intervals };
}
function livePedParsed() {
  const intervals = Array.from({ length: cfg.slots }, (_, i) => {
    const { start, end } = slotStartEnd(i);
    return { label: slotLabel(i), start, end, counts: pedData.map((xw) => xw[i] || [0, 0]) };
  });
  return { crosswalks: intersection.crosswalks.map((c) => ({ name: c.name, dir0: c.dir0, dir1: c.dir1 })), intervals };
}
function liveTmcParsed() {
  const approaches = intersection.approaches.map((a) => ({
    leg: a.leg,
    destinations: a.destinations.map((d) => ({ leg: d, turnClass: classifyTurn(a.leg, d) })),
  }));
  const intervals = Array.from({ length: cfg.slots }, (_, i) => {
    const { start, end } = slotStartEnd(i);
    const counts = {};
    approaches.forEach((a) => {
      counts[a.leg] = {};
      a.destinations.forEach((d) => {
        counts[a.leg][d.leg] = (tmcData[a.leg] && tmcData[a.leg][d.leg] && tmcData[a.leg][d.leg][i]) || vPairs.map(() => 0);
      });
    });
    return { label: slotLabel(i), start, end, counts };
  });
  return { approaches, types: vPairs.map((p) => p.label), intervals, legLabels: intersection.legLabels || {} };
}

async function renderIntersectionAnalysis() {
  const root = document.getElementById('analyze-root');
  const vehParsed = liveVehicleParsed();
  const pedParsed = livePedParsed();
  const tmcParsed = liveTmcParsed();
  const hasTmc = intersection.approaches.some((a) => a.destinations.length);

  root.innerHTML = `
    <div class="dataset-tabs no-print" id="analyze-dataset-tabs" style="display:flex;align-items:center;gap:0">
      <button class="dataset-tab active" data-kind="vehicle">Vehicle</button>
      <button class="dataset-tab" data-kind="ped">Pedestrian</button>
      ${hasTmc ? '<button class="dataset-tab" data-kind="tmc">Turning movements</button>' : ''}
      <button class="dataset-tab" style="margin-left:auto;border-left:.5px solid var(--border)" onclick="openPrintReport()">⎙ Print report</button>
    </div>
    <div class="section"><div class="section-head"><h2>Summary</h2></div><div id="analyze-summary-root"></div></div>
    ${hasTmc ? '<div class="section"><div class="section-head"><h2>Turning movements</h2></div><div id="analyze-tmc-root"></div></div>' : ''}
    <div class="section"><div class="section-head"><h2>Level of service</h2></div><div id="analyze-los-root"></div></div>
  `;

  let activeKind = 'vehicle';
  async function paintSummary() {
    const parsed = activeKind === 'vehicle' ? vehParsed : activeKind === 'ped' ? pedParsed : tmcParsed;
    await renderSummary(document.getElementById('analyze-summary-root'), activeKind, [{ id: 1, dayLabel: 'Current session', parsed }]);
  }
  root.querySelectorAll('.dataset-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.dataset-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeKind = btn.dataset.kind;
      paintSummary();
    });
  });
  await paintSummary();

  if (hasTmc) {
    await renderTmcSection(document.getElementById('analyze-tmc-root'), tmcParsed);
  }

  const losRows = [];
  intersection.approaches.forEach((a) => {
    if (!a.destinations.length) return;
    const total = tmcParsed.intervals.reduce((s, iv) => s + Object.values(iv.counts[a.leg] || {}).reduce((s2, arr) => s2 + arr.reduce((x, y) => x + y, 0), 0), 0);
    losRows.push({ key: `tmc-${a.leg}`, label: `Approach ${a.leg}`, volume: total });
  });
  const inTotal = vehParsed.intervals.reduce((s, iv) => s + iv.inbound.reduce((a, b) => a + b, 0), 0);
  const outTotal = vehParsed.intervals.reduce((s, iv) => s + iv.outbound.reduce((a, b) => a + b, 0), 0);
  losRows.push({ key: 'veh-in', label: 'Vehicle — inbound', volume: inTotal });
  losRows.push({ key: 'veh-out', label: 'Vehicle — outbound', volume: outTotal });
  renderLosSection(document.getElementById('analyze-los-root'), losRows);
}

// ═══════════════════════════════════════════
// LANDING SCREEN
// ═══════════════════════════════════════════
document.getElementById('btn-new-intersection')?.addEventListener('click', () => {
  clearAutosave();
  projectType = 'intersection';
  showScreen('setup-screen');
});
document.getElementById('btn-new-tripgen')?.addEventListener('click', () => {
  clearAutosave();
  projectType = 'tripgen';
  showScreen('tripgen-setup-screen');
  renderTripgenLocationsList();
});
document.getElementById('btn-new-area-study')?.addEventListener('click', () => {
  clearAutosave();
  areaIntersections.length = 0;
  activeIntersectionIdx = 0;
  projectType = 'area';
  showAreaSetup();
});
document.getElementById('btn-tripgen-to-landing')?.addEventListener('click', () => showScreen('landing-screen'));

// ═══════════════════════════════════════════
// AREA-WIDE STUDY SETUP SCREEN
// ═══════════════════════════════════════════
function showProjectHub() {
  const titleEl = document.getElementById('area-study-title');
  const subEl = document.getElementById('area-study-subtitle');
  if (titleEl) titleEl.textContent = projectInfo.projectName || 'Untitled project';
  if (subEl) subEl.textContent = [projectInfo.companyName, projectInfo.studyPurpose].filter(Boolean).join(' · ');
  renderAreaIntersectionsList();
  showScreen('area-setup-screen');
}

function showAreaSetup() {
  showProjectHub();
}

function saveCurrentIntersectionToHub() {
  const snap = serializeIntersectionSnapshot();
  const name = (intersection.street1 && intersection.street2)
    ? `${intersection.street1} & ${intersection.street2}`
    : intersection.street1 || `Intersection ${areaIntersections.length + 1}`;

  if (activeIntersectionIdx >= 0 && activeIntersectionIdx < areaIntersections.length) {
    areaIntersections[activeIntersectionIdx].snapshot = snap;
    areaIntersections[activeIntersectionIdx].name = name;
  } else {
    areaIntersections.push({ name, snapshot: snap });
    activeIntersectionIdx = 0;
  }
}

function renderAreaIntersectionsList() {
  const container = document.getElementById('area-intersections-list');
  if (!container) return;
  const beginBtn = document.getElementById('btn-area-begin-review');

  if (!areaIntersections.length) {
    container.innerHTML = `
      <div style="background:var(--surface2);border:.5px solid var(--border);border-radius:var(--rl);padding:28px 24px;text-align:center;margin-bottom:14px;color:var(--text2);font-size:13px">
        No intersections yet — add one below to get started.
      </div>`;
    if (beginBtn) beginBtn.disabled = true;
    return;
  }

  const rows = areaIntersections.map((ix, i) => {
    const snap = ix.snapshot;
    const periods = snap?.periods?.length ?? 0;
    const periodNames = snap?.periods?.map(p => p.name).join(', ') || '—';
    const isActive = i === activeIntersectionIdx;
    const counter = ix.counterName || '';
    return `
      <div class="area-ix-row${isActive ? ' active' : ''}" data-idx="${i}">
        <div class="area-ix-num">${i + 1}</div>
        <div class="area-ix-info">
          <div class="area-ix-name">${ix.name}</div>
          <div class="area-ix-meta">${periods} period${periods !== 1 ? 's' : ''} · ${periodNames}</div>
        </div>
        <div class="area-ix-counter">
          <input class="area-ix-counter-input" data-idx="${i}" type="text" value="${counter.replace(/"/g,'&quot;')}" placeholder="counter name">
        </div>
        <div class="area-ix-actions">
          <button class="btn-icon area-ix-review" data-idx="${i}" title="Open for review">review →</button>
          <button class="btn-icon area-ix-remove" data-idx="${i}" title="Remove">×</button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="background:var(--surface);border:.5px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:14px">
      <div style="padding:12px 20px;border-bottom:.5px solid var(--border);font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text3)">
        Intersections (${areaIntersections.length})
      </div>
      ${rows}
    </div>`;

  container.querySelectorAll('.area-ix-review').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      activeIntersectionIdx = idx;
      loadIntersectionIntoView(areaIntersections[idx].snapshot);
    });
  });
  container.querySelectorAll('.area-ix-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      areaIntersections.splice(idx, 1);
      if (activeIntersectionIdx >= areaIntersections.length) activeIntersectionIdx = Math.max(0, areaIntersections.length - 1);
      renderAreaIntersectionsList();
    });
  });

  container.querySelectorAll('.area-ix-counter-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = +inp.dataset.idx;
      if (areaIntersections[idx]) areaIntersections[idx].counterName = inp.value;
    });
  });

  if (beginBtn) beginBtn.disabled = areaIntersections.length === 0;
}

document.getElementById('btn-area-to-landing')?.addEventListener('click', () => showScreen('landing-screen'));
document.getElementById('btn-summary-back')?.addEventListener('click', () => showProjectHub());
document.getElementById('btn-summary-export-csv')?.addEventListener('click', exportSummaryCSV);
// Summary print options popover
(function () {
  const btn   = document.getElementById('btn-summary-print');
  const panel = document.getElementById('sum-print-opts');
  if (!btn || !panel) return;
  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; });
  document.getElementById('btn-sum-print-cancel')?.addEventListener('click', () => { panel.style.display = 'none'; });
  document.getElementById('btn-sum-print-go')?.addEventListener('click', () => {
    panel.style.display = 'none';
    const opts = {
      showPeriods: document.getElementById('sumopt-periods')?.checked ?? true,
      showFooter:  document.getElementById('sumopt-footer')?.checked ?? true,
    };
    printSummaryReport(projectInfo, areaIntersections, opts);
  });
  document.addEventListener('click', (e) => { if (!btn.closest('.btn-print-wrap').contains(e.target)) panel.style.display = 'none'; });
})();
document.getElementById('btn-ix-analysis-back')?.addEventListener('click', () => showSummaryScreen());
// Intersection print options popover
(function () {
  const btn   = document.getElementById('btn-ix-print');
  const panel = document.getElementById('ix-print-opts');
  if (!btn || !panel) return;
  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; });
  document.getElementById('btn-ix-print-cancel')?.addEventListener('click', () => { panel.style.display = 'none'; });
  document.getElementById('btn-ix-print-go')?.addEventListener('click', () => {
    panel.style.display = 'none';
    const ix = areaIntersections[activeIntersectionIdx];
    if (!ix) return;
    const opts = {
      crosswalkTable: document.getElementById('ixopt-xw-table')?.checked ?? true,
      distTable:      document.getElementById('ixopt-dist-table')?.checked ?? true,
      charts:         document.getElementById('ixopt-charts')?.checked ?? true,
      periodComp:     document.getElementById('ixopt-period-comp')?.checked ?? true,
    };
    printIntersectionReport(projectInfo, ix, opts);
  });
  document.addEventListener('click', (e) => { if (!btn.closest('.btn-print-wrap').contains(e.target)) panel.style.display = 'none'; });
})();
document.getElementById('btn-ix-open-counter')?.addEventListener('click', () => {
  const snap = areaIntersections[activeIntersectionIdx]?.snapshot;
  if (snap) loadIntersectionIntoView(snap);
});

document.getElementById('btn-area-begin-review')?.addEventListener('click', () => {
  if (!areaIntersections.length) return;
  try {
    showSummaryScreen();
  } catch (err) {
    console.error('Continue to Analysis failed:', err);
    const errEl = document.getElementById('area-import-error');
    if (errEl) errEl.textContent = `Could not open analysis: ${err.message}`;
  }
});
document.getElementById('btn-back-to-project')?.addEventListener('click', () => {
  saveCurrentIntersectionToHub();
  showProjectHub();
});
document.getElementById('btn-area-save')?.addEventListener('click', () => saveProject());

// Area study XLSX import (uses the same file input as landing-screen import)
document.getElementById('btn-area-import-xlsx')?.addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.xlsx';
  inp.multiple = true;
  inp.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const errEl = document.getElementById('area-import-error');
    errEl.textContent = '';
    const errors = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const sheets = parseRawCountXlsx(buf);
        // Auto-import all valid sheets — no picker in batch mode
        for (const sheet of sheets) loadRawCountSheet(sheet);
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    if (errors.length) errEl.textContent = errors.join(' · ');
    renderAreaIntersectionsList();
  });
  inp.click();
});

function renderAreaSheetPicker(sheets) {
  const picker = document.getElementById('area-sheet-picker');
  if (!picker) return;
  picker.style.display = '';
  picker.innerHTML = `
    <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:8px">Found ${sheets.length} sheets — choose one to import:</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${sheets.map((s, i) => {
        const p0 = s.periods[0], pN = s.periods[s.periods.length - 1];
        const timeRange = p0 ? `${String(Math.floor(p0.startMin/60)).padStart(2,'0')}:${String(p0.startMin%60).padStart(2,'0')} – end` : '';
        return `<button class="area-sheet-pick-btn" data-idx="${i}" style="text-align:left;padding:10px 14px;display:flex;flex-direction:column;gap:2px">
          <span style="font-size:13px;font-weight:500">${s.sheetName}</span>
          <span style="font-size:11px;color:var(--text2)">${s.meta.locationNS || ''} &amp; ${s.meta.locationEW || ''} · ${s.periods.length} period${s.periods.length!==1?'s':''}</span>
        </button>`;
      }).join('')}
      <button id="area-sheet-cancel" style="font-size:12px;color:var(--text2)">cancel</button>
    </div>`;

  picker.querySelectorAll('.area-sheet-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      loadRawCountSheet(sheets[+btn.dataset.idx]);
      picker.style.display = 'none';
      picker.innerHTML = '';
      renderAreaIntersectionsList();
    });
  });
  picker.querySelector('#area-sheet-cancel')?.addEventListener('click', () => {
    picker.style.display = 'none';
    picker.innerHTML = '';
  });
}

document.getElementById('btn-area-new-manual')?.addEventListener('click', () => {
  // Start a blank intersection snapshot and add it to the area study
  const snap = rawCountSheetToSnapshot({
    sheetName: `Intersection ${areaIntersections.length + 1}`,
    meta: { locationNS: '', locationEW: '', intervalMin: 15 },
    periods: [{
      name: 'AM Peak',
      startMin: 420,
      data: { cfg: { startMinutes: 420, intervalMin: 15, durationMin: 60 },
        pedData: [Array(4).fill([0,0]), Array(4).fill([0,0]), Array(4).fill([0,0]), Array(4).fill([0,0])],
        vData: { in: [[0]], out: [[0]] }, tmcData: {}, cornerData: [],
        vManual: { in: new Set(), out: new Set() },
        pedManual: [new Set(), new Set(), new Set(), new Set()], tmManual: {} }
    }]
  });
  const name = `Intersection ${areaIntersections.length + 1}`;
  areaIntersections.push({ name, snapshot: snap });
  activeIntersectionIdx = areaIntersections.length - 1;
  loadIntersectionIntoView(snap);
});

document.getElementById('btn-load-project')?.addEventListener('click', () => document.getElementById('load-project-input').click());
document.getElementById('load-project-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const errEl = document.getElementById('load-project-error');
  try {
    const text = await file.text();
    const proj = JSON.parse(text);
    loadProject(proj);
    errEl.textContent = '';
  } catch (err) {
    errEl.textContent = `Could not load project: ${err.message}`;
  }
  e.target.value = '';
});

// ═══════════════════════════════════════════
// COPY VEHICLE TYPES FROM PROJECT
// ═══════════════════════════════════════════
document.getElementById('btn-copy-vpairs')?.addEventListener('click', () => document.getElementById('copy-vpairs-input').click());
document.getElementById('copy-vpairs-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await copyVPairsFromProject(file);
  e.target.value = '';
});
document.getElementById('btn-copy-tmcpairs')?.addEventListener('click', () => document.getElementById('copy-tmcpairs-input').click());
document.getElementById('copy-tmcpairs-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await copyTmcPairsFromProject(file);
  e.target.value = '';
});

// ═══════════════════════════════════════════
// TMC CSV IMPORT
// ═══════════════════════════════════════════
document.getElementById('btn-import-tmc-csv')?.addEventListener('click', () => document.getElementById('import-tmc-csv-input').click());
document.getElementById('import-tmc-csv-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const errEl = document.getElementById('load-project-error');
  try {
    const text = await file.text();
    const parsed = parseTmcCsv(text);
    loadTmcCsvData(parsed);
    errEl.textContent = '';
  } catch (err) {
    errEl.textContent = `Could not import CSV: ${err.message}`;
    console.error(err);
  }
  e.target.value = '';
});

function loadTmcCsvData(parsed) {
  // ── cfg ──
  Object.assign(cfg, parsed.cfg);

  // ── tmcPairs (vehicle types) ──
  setTmcPairs(parsed.tmcPairs);

  // ── intersection ──
  intersection.template   = parsed.intersection.template;
  intersection.diagLeg    = parsed.intersection.diagLeg;
  intersection.missingLeg = parsed.intersection.missingLeg;
  intersection.approaches = parsed.approaches;
  intersection.legLabels  = parsed.intersection.legLabels || {};
  intersection.oneWay     = {};
  intersection.oneWayIn   = parsed.intersection.oneWayIn || {};
  if (parsed.intersection.street1) intersection.street1 = parsed.intersection.street1;
  if (parsed.intersection.street2) intersection.street2 = parsed.intersection.street2;
  if (parsed.intersection.street3) intersection.street3 = parsed.intersection.street3;

  // ── tmcData ──
  Object.keys(tmcData).forEach(k => delete tmcData[k]);
  Object.assign(tmcData, parsed.tmcData);

  // ── vPairs: keep existing (vehicle/ped modes unused for CSV imports) ──
  // ── vData / pedData: reset to match slot count ──
  initVData(); initPedData();

  // ── Set initial approach ──
  setTmcApproach(parsed.firstApproach);

  projectType = 'intersection';
  initDefaultPeriods('Period 1');

  // Navigate to counter in TMC mode
  showScreen('counter-screen');
  setMode('turning');
  render();
  buildKbd();
  updateCfgFields();
  buildPeriodTabs();

  // Rebuild setup UI in background so setup tab is accurate if user visits it
  buildTemplateGrid();
  renderVPairsList();
  renderTmcPairsList();
  updateDerived();
  renderLegConfig();
  renderSetupDiagram();
  updateTemplateSuboption();
}

// ═══════════════════════════════════════════
// RAW COUNT XLSX IMPORT
// ═══════════════════════════════════════════
document.getElementById('btn-import-raw-count')?.addEventListener('click', () => document.getElementById('import-raw-count-input').click());
document.getElementById('btn-counter-import-raw')?.addEventListener('click', () => document.getElementById('import-raw-count-input').click());
document.getElementById('import-raw-count-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const errEl = document.getElementById('load-project-error');
  try {
    const buf = await file.arrayBuffer();
    const sheets = parseRawCountXlsx(buf);
    errEl.textContent = '';
    if (sheets.length === 1) {
      loadRawCountSheet(sheets[0]);
    } else {
      renderRawCountSheetPicker(sheets);
    }
  } catch (err) {
    errEl.textContent = `Could not import: ${err.message}`;
    console.error(err);
  }
  e.target.value = '';
});

function renderRawCountSheetPicker(sheets) {
  const banner = document.getElementById('autosave-banner');
  banner.innerHTML = `
    <div style="margin-bottom:8px;font-size:13px;font-weight:500">
      File contains ${sheets.length} count sheets — choose one to import:
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${sheets.map((s, i) => {
        const periods = s.periods.map(p => {
          const h = Math.floor(p.startMin / 60) % 24;
          const m = p.startMin % 60;
          const slots = p.data.pedData[0]?.length || 0;
          const endMin = p.startMin + slots * s.meta.intervalMin;
          const fmt = mn => `${String(Math.floor(mn/60)%24).padStart(2,'0')}:${String(mn%60).padStart(2,'0')}`;
          return `${p.name} (${fmt(p.startMin)}–${fmt(endMin)})`;
        }).join(', ');
        const loc = [s.meta.locationNS, s.meta.locationEW].filter(Boolean).join(' & ') || s.sheetName;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface);border:.5px solid var(--border);border-radius:var(--r)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${escapeHtmlMain(s.sheetName)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${escapeHtmlMain(loc)} · ${escapeHtmlMain(periods)}</div>
          </div>
          <button class="btn-primary" data-sheet-idx="${i}" style="white-space:nowrap;flex-shrink:0">Import →</button>
        </div>`;
      }).join('')}
    </div>
    <button id="btn-dismiss-sheet-picker" style="margin-top:8px;font-size:12px">cancel</button>
  `;
  banner.style.display = '';
  banner.querySelectorAll('[data-sheet-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sheet = sheets[Number(btn.dataset.sheetIdx)];
      banner.style.display = 'none';
      banner.innerHTML = '';
      loadRawCountSheet(sheet);
    });
  });
  document.getElementById('btn-dismiss-sheet-picker')?.addEventListener('click', () => {
    banner.style.display = 'none';
    banner.innerHTML = '';
  });
}

function rawCountSheetToSnapshot(sheet) {
  const { meta, periods: parsedPeriods } = sheet;
  const locName = [meta.locationNS, meta.locationEW].filter(Boolean).join(' & ') || sheet.sheetName;
  const newIntersection = buildIntersectionFromMeta(meta);
  return {
    version: 2, projectType: 'intersection', mode: 'ped',
    vPairs: [{ label: 'Vehicles', inKey: 'a', outKey: 'z', icon: null }],
    tmcPairs: [],
    intersection: newIntersection,
    fnames: { vehicle: locName, ped: locName, tmc: locName },
    activePeriodIdx: 0,
    periods: parsedPeriods.map(p => ({
      name: p.name, cfg: p.data.cfg,
      vData: p.data.vData,
      pedData: p.data.pedData,
      tmcData: {},
      vManual: { in: [], out: [] },
      pedManual: p.data.pedManual.map(() => []),
      tmManual: {},
    })),
  };
}

function loadRawCountSheet(sheet) {
  if (!sheet.periods || !sheet.periods.length) return; // skip empty sheets
  const locName = [sheet.meta.locationNS, sheet.meta.locationEW].filter(Boolean).join(' & ') || sheet.sheetName;
  const snapshot = rawCountSheetToSnapshot(sheet);

  if (projectType === 'area') {
    // Only save counter state if we're actually in the counter (not on the hub)
    // On the hub, periods[] is empty so serializeIntersectionSnapshot() would wipe the existing snapshot
    const onHub = document.getElementById('area-setup-screen')?.style.display !== 'none';
    if (!onHub && areaIntersections.length > 0) {
      try { areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot(); } catch (_) {}
    }
    // Merge into existing entry if same location name already imported
    const existing = areaIntersections.find(ix => ix.name === locName);
    if (existing) {
      const newPeriods = snapshot.periods.filter(
        np => !existing.snapshot.periods.some(ep => ep.name === np.name)
      );
      existing.snapshot.periods.push(...newPeriods);
      renderAreaIntersectionsList();
      return;
    }
    areaIntersections.push({ name: locName, snapshot });
    activeIntersectionIdx = areaIntersections.length - 1;
    // Stay on area setup screen if we're currently there; otherwise stay in counter
    if (document.getElementById('area-setup-screen')?.style.display !== 'none') {
      renderAreaIntersectionsList();
    } else {
      resetUndoStacks(); updateUndoUI();
      loadIntersectionIntoView(snapshot);
      window.scheduleAutosave();
    }
  } else {
    // Start a new area study from the landing screen import
    areaIntersections.length = 0;
    activeIntersectionIdx = 0;
    areaIntersections.push({ name: locName, snapshot });
    projectType = 'area';
    if (projectInfo.projectName === '') projectInfo.projectName = locName;
    showAreaSetup();
  }
}

// ═══════════════════════════════════════════
// PROJECT SAVE / LOAD
// ═══════════════════════════════════════════
function setsToArrays(manual) {
  if (manual instanceof Set) return [...manual];
  if (Array.isArray(manual)) return manual.map((s) => (s instanceof Set ? [...s] : s));
  const out = {};
  for (const k in manual) out[k] = setsToArrays(manual[k]);
  return out;
}
function arraysToSets(arr) {
  if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return new Set(arr);
  if (Array.isArray(arr)) return arr.map(arraysToSets);
  const out = {};
  for (const k in arr) out[k] = arraysToSets(arr[k]);
  return out;
}

window.saveProject = function () {
  const proj = serializeCurrentProject();
  if (!proj) return;
  downloadJSON(proj, `${fnames.vehicle || 'traffic'}.tcproject`);
};

// ═══════════════════════════════════════════
// MULTI-PERIOD UI
// ═══════════════════════════════════════════
function buildPeriodTabs() {
  const bar = document.getElementById('period-tabs-bar');
  if (!bar) return;
  bar.innerHTML = '';
  periods.forEach((p, i) => {
    const tab = document.createElement('button');
    tab.className = 'period-tab' + (i === activePeriodIdx ? ' active' : '');
    tab.textContent = p.name;
    tab.title = 'Switch to ' + p.name + ' (double-click to rename)';
    tab.addEventListener('click', () => switchPeriod(i));
    tab.addEventListener('dblclick', e => {
      e.stopPropagation();
      const name = prompt('Rename period:', p.name);
      if (name && name.trim()) { periods[i].name = name.trim(); buildPeriodTabs(); window.scheduleAutosave(); }
    });
    bar.appendChild(tab);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'period-tab period-tab-add';
  addBtn.textContent = '+ period';
  addBtn.title = 'Add a new time period';
  addBtn.addEventListener('click', () => {
    const name = prompt('New period name:', `Period ${periods.length + 1}`);
    if (name === null) return;
    addPeriod(name.trim() || `Period ${periods.length + 1}`);
  });
  bar.appendChild(addBtn);

  // Start/end time fields
  const timeWrap = document.createElement('div');
  timeWrap.className = 'period-time-wrap';

  const minToHHMM = (mins) => {
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };

  const startLabel = document.createElement('span');
  startLabel.textContent = 'start:';
  startLabel.className = 'period-time-label';

  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.className = 'period-time-input';
  startInput.title = 'Count start time';
  startInput.value = minToHHMM(cfg.startMinutes);
  startInput.addEventListener('change', () => {
    const [sh, sm] = startInput.value.split(':').map(Number);
    cfg.startMinutes = sh * 60 + (sm || 0);
    render();
    window.scheduleAutosave();
  });

  const sep = document.createElement('span');
  sep.textContent = '–';
  sep.className = 'period-time-label';
  sep.style.margin = '0 2px';

  const endLabel = document.createElement('span');
  endLabel.textContent = 'end:';
  endLabel.className = 'period-time-label';

  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.className = 'period-time-input';
  endInput.title = 'Count end time (sets duration)';
  endInput.value = minToHHMM(cfg.startMinutes + cfg.durationMin);
  endInput.addEventListener('change', () => {
    const [eh, em] = endInput.value.split(':').map(Number);
    const endMins = eh * 60 + (em || 0);
    const newDuration = endMins - cfg.startMinutes;
    if (newDuration > 0) {
      cfg.durationMin = newDuration;
      render();
      window.scheduleAutosave();
    }
  });

  timeWrap.appendChild(startLabel);
  timeWrap.appendChild(startInput);
  timeWrap.appendChild(sep);
  timeWrap.appendChild(endLabel);
  timeWrap.appendChild(endInput);
  bar.appendChild(timeWrap);
}

function switchPeriod(newIdx) {
  if (newIdx === activePeriodIdx || newIdx < 0 || newIdx >= periods.length) return;
  periods[activePeriodIdx].data = captureActivePeriod();
  setActivePeriodIdx(newIdx);
  restoreActivePeriod(periods[newIdx].data);
  resetUndoStacks(); updateUndoUI();
  buildCounterUI(); buildKbd(); updateCfgFields();
  buildPeriodTabs();
  render();
  window.scheduleAutosave();
}

function addPeriod(name) {
  periods[activePeriodIdx].data = captureActivePeriod();
  initVData(); initPedData(); initTMCData(initApproaches);
  const newData = captureActivePeriod();
  periods.push({ name, data: newData });
  setActivePeriodIdx(periods.length - 1);
  resetUndoStacks(); updateUndoUI();
  buildCounterUI(); buildKbd(); updateCfgFields();
  buildPeriodTabs();
  render();
  window.scheduleAutosave();
}

// ═══════════════════════════════════════════
// AREA STUDY — multi-intersection container
// ═══════════════════════════════════════════
const areaIntersections = []; // [{name, snapshot}]
let activeIntersectionIdx = 0;

function buildIntersectionTabs() {
  const bar = document.getElementById('intersection-tabs-bar');
  if (!bar) return;
  bar.style.display = 'none';
  document.getElementById('counter-screen')?.classList.remove('area-study');
  if (projectType !== 'area' || areaIntersections.length === 0) return;
  bar.innerHTML = '';
  areaIntersections.forEach((ix, i) => {
    const tab = document.createElement('button');
    tab.className = 'intersection-tab' + (i === activeIntersectionIdx ? ' active' : '');
    tab.textContent = ix.name;
    tab.title = ix.name + (i === activeIntersectionIdx ? ' (active)' : ' — click to switch');
    tab.addEventListener('click', () => switchIntersection(i));
    tab.addEventListener('dblclick', e => {
      e.stopPropagation();
      const name = prompt('Rename intersection:', ix.name);
      if (name?.trim()) { ix.name = name.trim(); buildIntersectionTabs(); window.scheduleAutosave(); }
    });
    bar.appendChild(tab);
  });
  // "Add intersection" lives on the area setup screen — not inline in the counter
}

function serializeIntersectionSnapshot() {
  if (periods.length > 0) periods[activePeriodIdx].data = captureActivePeriod();
  return {
    version: 2, projectType: 'intersection', mode,
    vPairs: JSON.parse(JSON.stringify(vPairs)),
    tmcPairs: JSON.parse(JSON.stringify(tmcPairs)),
    intersection: JSON.parse(JSON.stringify(intersection)),
    fnames: { ...fnames },
    activePeriodIdx,
    periods: periods.map(p => ({
      name: p.name, cfg: p.data.cfg,
      vData: JSON.parse(JSON.stringify(p.data.vData)),
      pedData: JSON.parse(JSON.stringify(p.data.pedData)),
      tmcData: JSON.parse(JSON.stringify(p.data.tmcData)),
      vManual: setsToArrays(p.data.vManual),
      pedManual: setsToArrays(p.data.pedManual),
      tmManual: setsToArrays(p.data.tmManual),
    })),
  };
}

// ═══════════════════════════════════════════
// SUMMARY + INTERSECTION ANALYSIS SCREENS
// ═══════════════════════════════════════════
function sumPed(snap) {
  let total = 0;
  for (const p of snap.periods) {
    for (const xw of p.pedData) {
      for (const slot of xw) total += (slot[0]||0) + (slot[1]||0);
    }
  }
  return total;
}
function sumVehicle(snap) {
  let total = 0;
  for (const p of snap.periods) {
    if (!p.vData?.in) continue;
    for (let i = 0; i < p.vData.in.length; i++) {
      total += (p.vData.in[i] || []).reduce((a,b) => a+(b||0), 0);
      total += (p.vData.out[i] || []).reduce((a,b) => a+(b||0), 0);
    }
  }
  return total;
}
function sumTmc(snap) {
  let total = 0;
  for (const p of snap.periods) {
    for (const fromLeg of Object.values(p.tmcData||{})) {
      for (const toLegSlots of Object.values(fromLeg)) {
        for (const slot of toLegSlots) total += (slot||[]).reduce((a,b)=>a+(b||0),0);
      }
    }
  }
  return total;
}

function showSummaryScreen() {
  const titleEl = document.getElementById('summary-project-title');
  const subEl = document.getElementById('summary-subtitle');
  if (titleEl) titleEl.textContent = projectInfo.projectName || 'Untitled project';
  if (subEl) subEl.textContent = [projectInfo.companyName, projectInfo.studyPurpose].filter(Boolean).join(' · ');

  renderSummaryContent();
  showScreen('summary-screen');
}

function renderSummaryContent() {
  const container = document.getElementById('summary-content');
  if (!container) return;

  if (!areaIntersections.length) {
    container.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">No intersections loaded.</div>`;
    return;
  }

  // Collect all unique period names across all intersections
  const allPeriodNames = [];
  for (const ix of areaIntersections) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
  }

  // Build totals for each intersection
  const rows = areaIntersections.map((ix, i) => {
    const snap = ix.snapshot;
    if (!snap) return null;
    const totalPed = sumPed(snap);
    const totalVeh = sumVehicle(snap);
    const totalTmc = sumTmc(snap);
    const hasTmcData = snap.periods?.some(p => Object.keys(p.tmcData||{}).length > 0);
    const pedByPeriod = allPeriodNames.map(pname => {
      const period = snap.periods?.find(p => p.name === pname);
      if (!period) return null;
      let t = 0;
      for (const xw of period.pedData) for (const slot of xw) t += (slot[0]||0)+(slot[1]||0);
      return t;
    });
    const vehByPeriod = allPeriodNames.map(pname => {
      const period = snap.periods?.find(p => p.name === pname);
      if (!period) return null;
      let t = 0;
      for (let s = 0; s < period.vData.in.length; s++) {
        t += (period.vData.in[s]||[]).reduce((a,b)=>a+(b||0),0);
        t += (period.vData.out[s]||[]).reduce((a,b)=>a+(b||0),0);
      }
      return t;
    });

    return { ix, i, totalPed, totalVeh, totalTmc, hasTmcData, pedByPeriod, vehByPeriod };
  }).filter(Boolean);

  const hasTmcAny = rows.some(r => r.hasTmcData);
  const hasVehAny = rows.some(r => r.totalVeh > 0);
  const hasPedAny = rows.some(r => r.totalPed > 0);
  const multiPeriod = allPeriodNames.length > 1;

  const periodHeadersPed = multiPeriod && hasPedAny
    ? allPeriodNames.map(n => `<th class="sum-th sum-th-period" colspan="1">${n}<br><span style="font-size:10px;font-weight:400;color:var(--text3)">peds</span></th>`).join('')
    : '';
  const periodHeadersVeh = multiPeriod && hasVehAny
    ? allPeriodNames.map(n => `<th class="sum-th sum-th-period">${n}<br><span style="font-size:10px;font-weight:400;color:var(--text3)">vehs</span></th>`).join('')
    : '';

  const html = `
    <div style="overflow-x:auto">
      <table class="summary-table">
        <thead>
          <tr>
            <th class="sum-th sum-th-name">#</th>
            <th class="sum-th sum-th-name">Intersection</th>
            <th class="sum-th">Counter</th>
            <th class="sum-th">Periods</th>
            ${hasPedAny ? `<th class="sum-th sum-th-total" colspan="2">Pedestrians<br><span style="font-size:10px;font-weight:400;color:var(--text3)">total</span></th>` : ''}
            ${periodHeadersPed}
            ${hasVehAny ? `<th class="sum-th sum-th-total">Vehicles<br><span style="font-size:10px;font-weight:400;color:var(--text3)">in+out</span></th>` : ''}
            ${periodHeadersVeh}
            ${hasTmcAny ? `<th class="sum-th sum-th-total">TMC<br><span style="font-size:10px;font-weight:400;color:var(--text3)">total</span></th>` : ''}
            <th class="sum-th"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="sum-row" data-idx="${r.i}">
              <td class="sum-td sum-td-num">${r.i + 1}</td>
              <td class="sum-td sum-td-name">${r.ix.name}</td>
              <td class="sum-td sum-td-meta">${r.ix.counterName || '<span style="color:var(--text3)">—</span>'}</td>
              <td class="sum-td sum-td-meta">${r.ix.snapshot?.periods?.length || 0}</td>
              ${hasPedAny ? `<td class="sum-td sum-td-num${r.totalPed > 0 ? ' sum-td-has-data' : ''}">${r.totalPed > 0 ? r.totalPed.toLocaleString() : '<span style="color:var(--text3)">—</span>'}</td><td class="sum-td" style="padding-left:0;width:90px"><div class="sum-mini-bar-wrap"><div class="sum-mini-bar" data-val="${r.totalPed}"></div></div></td>` : ''}
              ${multiPeriod && hasPedAny ? r.pedByPeriod.map(v => `<td class="sum-td sum-td-num">${v != null ? (v > 0 ? v.toLocaleString() : '<span style="color:var(--text3)">—</span>') : '<span style="color:var(--text3)">·</span>'}</td>`).join('') : ''}
              ${hasVehAny ? `<td class="sum-td sum-td-num${r.totalVeh > 0 ? ' sum-td-has-data' : ''}">${r.totalVeh > 0 ? r.totalVeh.toLocaleString() : '<span style="color:var(--text3)">—</span>'}</td>` : ''}
              ${multiPeriod && hasVehAny ? r.vehByPeriod.map(v => `<td class="sum-td sum-td-num">${v != null ? (v > 0 ? v.toLocaleString() : '<span style="color:var(--text3)">—</span>') : '<span style="color:var(--text3)">·</span>'}</td>`).join('') : ''}
              ${hasTmcAny ? `<td class="sum-td sum-td-num${r.totalTmc > 0 ? ' sum-td-has-data' : ''}">${r.totalTmc > 0 ? r.totalTmc.toLocaleString() : '<span style="color:var(--text3)">—</span>'}</td>` : ''}
              <td class="sum-td"><button class="sum-review-btn" data-idx="${r.i}">review →</button></td>
            </tr>
          `).join('')}
        </tbody>
        ${rows.length > 1 ? `
        <tfoot>
          <tr class="sum-total-row">
            <td class="sum-td" colspan="2" style="font-weight:600;font-size:12px">Total</td>
            <td class="sum-td" colspan="2"></td>
            ${hasPedAny ? `<td class="sum-td sum-td-num sum-td-total">${rows.reduce((a,r)=>a+r.totalPed,0).toLocaleString()}</td><td class="sum-td"></td>` : ''}
            ${multiPeriod && hasPedAny ? allPeriodNames.map((_,pi) => `<td class="sum-td sum-td-num sum-td-total">${rows.reduce((a,r)=>a+(r.pedByPeriod[pi]||0),0).toLocaleString()}</td>`).join('') : ''}
            ${hasVehAny ? `<td class="sum-td sum-td-num sum-td-total">${rows.reduce((a,r)=>a+r.totalVeh,0).toLocaleString()}</td>` : ''}
            ${multiPeriod && hasVehAny ? allPeriodNames.map((_,pi) => `<td class="sum-td sum-td-num sum-td-total">${rows.reduce((a,r)=>a+(r.vehByPeriod[pi]||0),0).toLocaleString()}</td>`).join('') : ''}
            ${hasTmcAny ? `<td class="sum-td sum-td-num sum-td-total">${rows.reduce((a,r)=>a+r.totalTmc,0).toLocaleString()}</td>` : ''}
            <td class="sum-td"></td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
  `;

  container.innerHTML = html;

  // Mini bars — compute max across all rows for scaling
  const maxPedAll = Math.max(...rows.map(r => r.totalPed), 1);
  container.querySelectorAll('.sum-mini-bar').forEach(el => {
    const pct = Math.round((+el.dataset.val / maxPedAll) * 72);
    el.style.width = pct + 'px';
  });

  container.querySelectorAll('.sum-review-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showIntersectionAnalysis(+btn.dataset.idx);
    });
  });

  container.querySelectorAll('tr.sum-row').forEach(row => {
    row.addEventListener('click', () => showIntersectionAnalysis(+row.dataset.idx));
  });
}

function exportSummaryCSV() {
  const allPeriodNames = [];
  for (const ix of areaIntersections) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
  }
  const headers = ['#', 'Intersection', 'Counter', 'Periods', 'Total Pedestrians',
    ...allPeriodNames.map(n => `Peds – ${n}`)];
  const csvRows = [headers.join(',')];
  areaIntersections.forEach((ix, i) => {
    const snap = ix.snapshot;
    if (!snap) return;
    const totalPed = sumPed(snap);
    const periodPeds = allPeriodNames.map(pname => {
      const period = snap.periods?.find(p => p.name === pname);
      if (!period) return '';
      let t = 0;
      for (const xw of period.pedData) for (const sl of xw) t += (sl[0]||0)+(sl[1]||0);
      return t;
    });
    csvRows.push([i+1, `"${ix.name.replace(/"/g,'""')}"`, `"${(ix.counterName||'').replace(/"/g,'""')}"`,
      snap.periods?.length||0, totalPed, ...periodPeds].join(','));
  });
  const bom = '﻿';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(projectInfo.projectName||'summary').replace(/[^a-z0-9]/gi,'-')}-pedestrian-counts.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Intersection detail analysis ──
let ixAnalysisPeriodIdx = 0;

function showIntersectionAnalysis(idx) {
  activeIntersectionIdx = idx;
  const ix = areaIntersections[idx];
  if (!ix?.snapshot) return;
  document.getElementById('ix-analysis-title').textContent = ix.name;
  const parts = [];
  if (ix.counterName) parts.push(`Counter: ${ix.counterName}`);
  if (projectInfo.projectName) parts.push(projectInfo.projectName);
  document.getElementById('ix-analysis-sub').textContent = parts.join(' · ');
  ixAnalysisPeriodIdx = 0;
  renderIxAnalysis(0);
  showScreen('ix-analysis-screen');
}

function renderIxAnalysis(periodIdx) {
  ixAnalysisPeriodIdx = periodIdx;
  const container = document.getElementById('ix-analysis-content');
  if (!container) return;
  const snap = areaIntersections[activeIntersectionIdx]?.snapshot;
  if (!snap?.periods?.length) {
    container.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">No period data available.</div>`;
    return;
  }

  const snPeriods = snap.periods;
  const period = snPeriods[periodIdx];
  const cfg = period.cfg;
  const intervalMin = cfg.intervalMin || 15;
  const startMin = cfg.startMinutes;
  const crosswalks = snap.intersection?.crosswalks || [
    { name: 'N crosswalk', dir0: 'EB', dir1: 'WB', assign: 'N' },
    { name: 'E crosswalk', dir0: 'NB', dir1: 'SB', assign: 'E' },
    { name: 'S crosswalk', dir0: 'EB', dir1: 'WB', assign: 'S' },
    { name: 'W crosswalk', dir0: 'NB', dir1: 'SB', assign: 'W' },
  ];

  const pedData = period.pedData;
  const slots = pedData[0]?.length || 0;

  function toHHMM(m) {
    const h = Math.floor(m / 60) % 24, mn = m % 60;
    return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
  }
  function bar(val, max, w = 84) {
    const px = max > 0 ? Math.max(2, Math.round((val / max) * w)) : 2;
    return `<div class="ix-bar-wrap"><div class="ix-bar" style="width:${px}px"></div></div>`;
  }

  // Per-crosswalk totals
  const xwTotals = crosswalks.map((xw, xi) => {
    let d0 = 0, d1 = 0;
    for (let s = 0; s < slots; s++) { d0 += pedData[xi]?.[s]?.[0]||0; d1 += pedData[xi]?.[s]?.[1]||0; }
    return { ...xw, d0, d1, total: d0 + d1 };
  });
  const grandTotal = xwTotals.reduce((a, x) => a + x.total, 0);
  const maxXw = Math.max(...xwTotals.map(x => x.total), 1);

  // Per-slot totals
  const slotData = Array.from({ length: slots }, (_, s) => {
    const byCw = crosswalks.map((_, xi) => (pedData[xi]?.[s]?.[0]||0) + (pedData[xi]?.[s]?.[1]||0));
    return { time: startMin + s * intervalMin, byCw, total: byCw.reduce((a,b)=>a+b,0) };
  });
  const maxSlot = Math.max(...slotData.map(s => s.total), 1);

  // Peak 15-min
  const peakSlot = slotData.reduce((best, s) => s.total > best.total ? s : best, slotData[0] || { time: startMin, total: 0 });

  // Peak hour (4 consecutive slots)
  let peakHrStart = startMin, peakHrTotal = 0;
  if (slots >= 4) {
    for (let s = 0; s <= slots - 4; s++) {
      const t = slotData.slice(s, s+4).reduce((a, sl) => a + sl.total, 0);
      if (t > peakHrTotal) { peakHrTotal = t; peakHrStart = slotData[s].time; }
    }
  }

  // Period tabs
  const tabsHtml = snPeriods.length > 1
    ? `<div class="ix-period-tabs">${snPeriods.map((p, pi) =>
        `<button class="ix-period-tab${pi === periodIdx ? ' active' : ''}" data-pi="${pi}">${p.name}</button>`
      ).join('')}</div>`
    : `<div class="ix-period-label">${period.name}</div>`;

  // Charts
  const volumeSvg = buildVolumeProfileSVG(slotData, crosswalks, intervalMin);
  const cwBarSvg  = buildCrosswalkBarSVG(xwTotals);
  const legendHtml = buildChartLegend(crosswalks);

  // PHF (peak hour factor) — standard traffic engineering metric
  const phf = (slots >= 4 && peakSlot.total > 0)
    ? (peakHrTotal / (4 * peakSlot.total)).toFixed(2) : null;

  // Crosswalk table rows — with direction-split bar
  const xwRows = xwTotals.map((xw, i) => `
    <tr class="ix-tr">
      <td class="ix-td ix-td-name"><span class="ix-leg-badge" style="background:${CW_COLORS[i%4]}">${xw.assign}</span>${xw.name.replace(/\s*\([NESW] crosswalk\)/,'')}</td>
      <td class="ix-td ix-td-num">${xw.d0.toLocaleString()}</td><td class="ix-td ix-td-dir">${xw.dir0}</td>
      <td class="ix-td ix-td-num">${xw.d1.toLocaleString()}</td><td class="ix-td ix-td-dir">${xw.dir1}</td>
      <td class="ix-td ix-td-num ix-td-bold">${xw.total.toLocaleString()}</td>
      <td class="ix-td ix-td-pct">${grandTotal > 0 ? Math.round(xw.total/grandTotal*100) : 0}%</td>
      <td class="ix-td" style="min-width:64px">${dirSplitBar(xw.d0, xw.d1, CW_COLORS[i%4])}</td>
    </tr>`).join('');

  // Time distribution rows
  const timeRows = slotData.map(s => `
    <tr class="ix-tr${s.total === peakSlot.total && s.time === peakSlot.time ? ' ix-tr-peak' : ''}">
      <td class="ix-td ix-td-time">${toHHMM(s.time)}–${toHHMM(s.time+intervalMin)}</td>
      ${s.byCw.map(v => `<td class="ix-td ix-td-num">${v > 0 ? v : '<span style="opacity:.35">—</span>'}</td>`).join('')}
      <td class="ix-td ix-td-num ix-td-bold">${s.total}</td>
      <td class="ix-td ix-td-bar">${bar(s.total, maxSlot)}</td>
    </tr>`).join('');

  // Period comparison (multi-period only)
  let compHtml = '';
  if (snPeriods.length > 1) {
    const compMaxPed = Math.max(...snPeriods.map(p => { let t=0; for(const xw of p.pedData) for(const sl of xw) t+=(sl[0]||0)+(sl[1]||0); return t; }), 1);
    const compRows = snPeriods.map((p, pi) => {
      let pedTotal = 0;
      for (const xw of p.pedData) for (const sl of xw) pedTotal += (sl[0]||0)+(sl[1]||0);
      const pSlots = p.pedData[0]?.length || 0;
      const pInt = p.cfg.intervalMin || 15;
      const pStart = p.cfg.startMinutes;
      const pSlotTotals = Array.from({ length: pSlots }, (_, s) => {
        let t=0; for(const xw of p.pedData) t+=(xw?.[s]?.[0]||0)+(xw?.[s]?.[1]||0);
        return { time: pStart + s*pInt, total: t };
      });
      const pk = pSlotTotals.reduce((b,s) => s.total > b.total ? s : b, pSlotTotals[0]||{time:pStart,total:0});
      const pPhf = (pSlots >= 4 && pk.total > 0) ? (pedTotal / (4 * pk.total)).toFixed(2) : '—';
      return `<tr class="ix-tr${pi === periodIdx ? ' ix-tr-active' : ''}">
        <td class="ix-td ix-td-time" style="cursor:pointer;color:var(--blue-text)" data-pi="${pi}">${p.name}</td>
        <td class="ix-td ix-td-num ix-td-bold">${pedTotal.toLocaleString()}</td>
        <td class="ix-td ix-td-time">${pk.total > 0 ? toHHMM(pk.time)+'–'+toHHMM(pk.time+pInt) : '—'}</td>
        <td class="ix-td ix-td-num">${pk.total > 0 ? pk.total : '—'}</td>
        <td class="ix-td ix-td-num">${pPhf}</td>
        <td class="ix-td ix-td-bar">${bar(pedTotal, compMaxPed)}</td>
      </tr>`;
    }).join('');
    compHtml = `<div class="ix-card">
      <div class="ix-card-header">Period Comparison</div>
      <table class="ix-table">
        <thead><tr>
          <th class="ix-th">Period</th><th class="ix-th ix-th-r">Total Peds</th>
          <th class="ix-th">Peak 15-min</th><th class="ix-th ix-th-r">Peak Count</th>
          <th class="ix-th ix-th-r" title="Peak Hour Factor = peak-hour vol ÷ (4 × peak-15-min vol)">PHF</th>
          <th class="ix-th"></th>
        </tr></thead>
        <tbody>${compRows}</tbody>
      </table>
    </div>`;
  }

  container.innerHTML = `
    ${tabsHtml}
    <div class="ix-grid">
      <div class="ix-card">
        <div class="ix-card-header">Crosswalk Summary
          <span class="ix-card-hint">dark = Dir A · light = Dir B</span>
        </div>
        <table class="ix-table">
          <thead><tr>
            <th class="ix-th">Crosswalk</th>
            <th class="ix-th ix-th-r" colspan="2">Dir A</th>
            <th class="ix-th ix-th-r" colspan="2">Dir B</th>
            <th class="ix-th ix-th-r">Total</th>
            <th class="ix-th ix-th-r">%</th>
            <th class="ix-th ix-th-r">Split</th>
          </tr></thead>
          <tbody>${xwRows}</tbody>
          <tfoot><tr class="ix-tr-total">
            <td class="ix-td ix-td-name" style="font-weight:600">Total</td>
            <td class="ix-td ix-td-num">${xwTotals.reduce((a,x)=>a+x.d0,0).toLocaleString()}</td><td class="ix-td"></td>
            <td class="ix-td ix-td-num">${xwTotals.reduce((a,x)=>a+x.d1,0).toLocaleString()}</td><td class="ix-td"></td>
            <td class="ix-td ix-td-num ix-td-bold">${grandTotal.toLocaleString()}</td>
            <td class="ix-td" colspan="2"></td>
          </tr></tfoot>
        </table>
        <div class="ix-bottom-row">
          <div class="ix-cw-chart">${cwBarSvg}</div>
          <div class="ix-peak-stats">
            <div class="ix-peak-item">
              <span class="ix-peak-label">Peak 15-min</span>
              <span class="ix-peak-val">${toHHMM(peakSlot.time)}–${toHHMM(peakSlot.time+intervalMin)}</span>
              <span class="ix-peak-count">${peakSlot.total} peds</span>
            </div>
            ${slots >= 4 ? `<div class="ix-peak-item">
              <span class="ix-peak-label">Peak hour</span>
              <span class="ix-peak-val">${toHHMM(peakHrStart)}–${toHHMM(peakHrStart+60)}</span>
              <span class="ix-peak-count">${peakHrTotal} peds</span>
            </div>` : ''}
            ${phf ? `<div class="ix-peak-item">
              <span class="ix-peak-label" title="Peak Hour Factor = peak-hour vol ÷ (4 × peak-15-min vol)">PHF</span>
              <span class="ix-peak-val">${phf}</span>
            </div>` : ''}
            <div class="ix-peak-item">
              <span class="ix-peak-label">Period total</span>
              <span class="ix-peak-val">${toHHMM(startMin)}–${toHHMM(startMin+cfg.durationMin)}</span>
              <span class="ix-peak-count">${grandTotal.toLocaleString()} peds</span>
            </div>
          </div>
        </div>
      </div>
      <div class="ix-card">
        <div class="ix-card-header">15-Minute Distribution</div>
        <table class="ix-table" style="overflow-x:auto">
          <thead><tr>
            <th class="ix-th">Interval</th>
            ${crosswalks.map(xw => `<th class="ix-th ix-th-r">${xw.assign}</th>`).join('')}
            <th class="ix-th ix-th-r">Total</th>
            <th class="ix-th"></th>
          </tr></thead>
          <tbody>${timeRows}</tbody>
          <tfoot><tr class="ix-tr-total">
            <td class="ix-td" style="font-weight:600">Total</td>
            ${xwTotals.map(x => `<td class="ix-td ix-td-num">${x.total.toLocaleString()}</td>`).join('')}
            <td class="ix-td ix-td-num ix-td-bold">${grandTotal.toLocaleString()}</td>
            <td class="ix-td"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>
    <div class="ix-card ix-card-full">
      <div class="ix-card-header">Volume Profile
        <span class="ix-card-hint">stacked by crosswalk · ▲ = peak 15-min</span>
      </div>
      <div class="ix-chart-wrap">${volumeSvg}</div>
      ${legendHtml}
    </div>
    ${compHtml}`;

  container.querySelectorAll('.ix-period-tab').forEach(btn =>
    btn.addEventListener('click', () => renderIxAnalysis(+btn.dataset.pi)));
  container.querySelectorAll('[data-pi]').forEach(el =>
    el.addEventListener('click', () => renderIxAnalysis(+el.dataset.pi)));
}

function loadIntersectionIntoView(snap) {
  setVPairs(snap.vPairs || []);
  if (snap.tmcPairs) setTmcPairs(snap.tmcPairs);
  Object.assign(intersection, snap.intersection);
  Object.assign(fnames, snap.fnames || {});
  if (snap.periods) {
    periods.length = 0;
    snap.periods.forEach(p => periods.push({
      name: p.name,
      data: {
        cfg: p.cfg,
        vData: JSON.parse(JSON.stringify(p.vData)),
        pedData: JSON.parse(JSON.stringify(p.pedData)),
        tmcData: JSON.parse(JSON.stringify(p.tmcData || {})),
        vManual: arraysToSets(p.vManual || { in: [], out: [] }),
        pedManual: arraysToSets(p.pedManual || []),
        tmManual: arraysToSets(p.tmManual || {}),
      },
    }));
    const idx = Math.min(snap.activePeriodIdx ?? 0, periods.length - 1);
    setActivePeriodIdx(idx);
    restoreActivePeriod(periods[idx].data);
  }
  buildTemplateGrid(); renderVPairsList(); renderTmcPairsList(); updateDerived(); renderLegConfig(); renderSetupDiagram();
  updateTemplateSuboption(); initApproaches();
  showScreen('counter-screen');
  window.goToCountMode();
  buildCounterUI(); buildKbd(); updateCfgFields();
  buildPeriodTabs();
  buildIntersectionTabs();
  buildCounterSidebar();
  setMode(snap.mode || 'ped');
  render();
}

function switchIntersection(newIdx) {
  if (newIdx === activeIntersectionIdx || newIdx < 0 || newIdx >= areaIntersections.length) return;
  areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot();
  activeIntersectionIdx = newIdx;
  resetUndoStacks(); updateUndoUI();
  loadIntersectionIntoView(areaIntersections[newIdx].snapshot);
  window.scheduleAutosave();
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function loadProject(proj) {
  if (proj.projectInfo) {
    Object.assign(projectInfo, proj.projectInfo);
    wireProjectInfoFields(); // re-sync all input values from restored state
  }
  if (proj.projectType === 'tripgen') {
    Object.assign(tripgenSiteInfo, proj.siteInfo || {});
    Object.assign(tripgenCategoryMap, proj.categoryMap || {});
    if (proj.peakWindows) Object.assign(tripgenPeakWindows, proj.peakWindows);
    Object.assign(tripgenQaqc, proj.qaqc || {});
    tripgenEntries.length = 0;
    tripgenEntries.push(...(proj.entries || []));
    if (proj.qaqcReviewerName) { const el = document.getElementById('qaqc-reviewer-name'); if (el) el.value = proj.qaqcReviewerName; }
    if (proj.qaqcReviewDate) { const el = document.getElementById('qaqc-review-date'); if (el) el.value = proj.qaqcReviewDate; }
    projectType = 'tripgen';
    showScreen('tripgen-setup-screen');
    wireSiteInfoFields();
    renderTripgenLocationsList();
    return;
  }
  if (proj.projectType === 'area') {
    areaIntersections.length = 0;
    areaIntersections.push(...(proj.intersections || []).map(ix => ({ name: ix.name, snapshot: ix.snapshot })));
    activeIntersectionIdx = Math.min(proj.activeIntersectionIdx ?? 0, Math.max(0, areaIntersections.length - 1));
    projectType = 'area';
    showAreaSetup();
    return;
  }
  // intersection project — structural (shared across all periods)
  if (proj.enabledModes) { Object.assign(enabledModes, proj.enabledModes); syncCountTypeToggles(); }
  setVPairs(proj.vPairs || []);
  if (proj.tmcPairs) setTmcPairs(proj.tmcPairs);
  Object.assign(intersection, proj.intersection);
  Object.assign(fnames, proj.fnames);

  if (proj.periods) {
    // v2 format — restore periods array
    periods.length = 0;
    proj.periods.forEach(p => {
      periods.push({
        name: p.name,
        data: {
          cfg: p.cfg,
          vData: JSON.parse(JSON.stringify(p.vData)),
          pedData: JSON.parse(JSON.stringify(p.pedData)),
          tmcData: JSON.parse(JSON.stringify(p.tmcData || {})),
          vManual: arraysToSets(p.vManual || { in: [], out: [] }),
          pedManual: arraysToSets(p.pedManual || []),
          tmManual: arraysToSets(p.tmManual || {}),
        },
      });
    });
    const idx = Math.min(proj.activePeriodIdx ?? 0, periods.length - 1);
    setActivePeriodIdx(idx);
    restoreActivePeriod(periods[idx].data);
  } else {
    // v1 format — load flat data and wrap in a single period
    Object.assign(cfg, proj.cfg);
    Object.assign(vData, proj.vData);
    pedData.length = 0; pedData.push(...(proj.pedData || []));
    Object.keys(tmcData).forEach((k) => delete tmcData[k]);
    Object.assign(tmcData, proj.tmcData || {});
    const vm = arraysToSets(proj.vManual || { in: [], out: [] });
    Object.assign(vManual, vm);
    const pm = arraysToSets(proj.pedManual || []);
    pedManual.length = 0; pedManual.push(...pm);
    Object.keys(tmManual).forEach((k) => delete tmManual[k]);
    Object.assign(tmManual, arraysToSets(proj.tmManual || {}));
    periods.length = 0;
    periods.push({ name: 'Period 1', data: captureActivePeriod() });
    setActivePeriodIdx(0);
  }

  projectType = 'intersection';
  buildTemplateGrid(); renderVPairsList(); renderTmcPairsList(); updateDerived(); renderLegConfig(); renderSetupDiagram();
  updateTemplateSuboption(); initApproaches();
  // Jump straight to the counter screen with restored data, skipping setup.
  document.getElementById('setup-screen').style.display = 'none';
  showScreen('counter-screen');
  window.goToCountMode();
  buildCounterUI(); buildKbd(); updateCfgFields();
  buildPeriodTabs();
  setMode(proj.mode || 'vehicle');
  render();
}

// ═══════════════════════════════════════════
// AUTOSAVE — localStorage
// ═══════════════════════════════════════════
const LS_KEY = 'traffic-app-autosave';

function serializeCurrentProject() {
  if (projectType === 'area') {
    areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot();
    return {
      version: 2, projectType: 'area', savedAt: new Date().toISOString(),
      projectInfo: { ...projectInfo },
      activeIntersectionIdx,
      intersections: areaIntersections.map(ix => ({ name: ix.name, snapshot: ix.snapshot })),
    };
  }
  if (projectType === 'intersection') {
    // Snapshot active period before serializing
    if (periods.length > 0) periods[activePeriodIdx].data = captureActivePeriod();
    return {
      version: 2, projectType: 'intersection', savedAt: new Date().toISOString(),
      projectInfo: { ...projectInfo },
      mode,
      enabledModes: { ...enabledModes },
      vPairs: JSON.parse(JSON.stringify(vPairs)),
      tmcPairs: JSON.parse(JSON.stringify(tmcPairs)),
      intersection: JSON.parse(JSON.stringify(intersection)),
      fnames: { ...fnames },
      activePeriodIdx,
      periods: periods.map(p => ({
        name: p.name,
        cfg: p.data.cfg,
        vData: JSON.parse(JSON.stringify(p.data.vData)),
        pedData: JSON.parse(JSON.stringify(p.data.pedData)),
        tmcData: JSON.parse(JSON.stringify(p.data.tmcData)),
        vManual: setsToArrays(p.data.vManual),
        pedManual: setsToArrays(p.data.pedManual),
        tmManual: setsToArrays(p.data.tmManual),
      })),
    };
  }
  if (projectType === 'tripgen') {
    return {
      version: 1, projectType: 'tripgen', savedAt: new Date().toISOString(),
      projectInfo: { ...projectInfo },
      siteInfo: { ...tripgenSiteInfo }, categoryMap: { ...tripgenCategoryMap },
      peakWindows: JSON.parse(JSON.stringify(tripgenPeakWindows)),
      qaqc: { ...tripgenQaqc },
      qaqcReviewerName: document.getElementById('qaqc-reviewer-name')?.value || '',
      qaqcReviewDate: document.getElementById('qaqc-review-date')?.value || '',
      entries: JSON.parse(JSON.stringify(tripgenEntries)),
    };
  }
  return null;
}

let _autosaveTimer = null;
window.scheduleAutosave = function () {
  if (!projectType) return;
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    try {
      const proj = serializeCurrentProject();
      if (proj) localStorage.setItem(LS_KEY, JSON.stringify(proj));
    } catch (_) {}
  }, 2000);
};

function clearAutosave() { localStorage.removeItem(LS_KEY); }
window.__loadProject = loadProject;

window.addEventListener('beforeunload', () => {
  if (!projectType) return;
  try {
    const proj = serializeCurrentProject();
    if (proj) localStorage.setItem(LS_KEY, JSON.stringify(proj));
  } catch (_) {}
});

function formatTimeAgo(date) {
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function checkAutosave() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const proj = JSON.parse(raw);
    if (!proj?.projectType || !proj?.savedAt) return;
    const banner = document.getElementById('autosave-banner');
    if (!banner) return;
    const label = proj.projectType === 'tripgen'
      ? (proj.siteInfo?.location || proj.projectInfo?.projectName || 'Trip generation project')
      : (proj.projectInfo?.projectName || 'Intersection count');
    const timeAgo = formatTimeAgo(new Date(proj.savedAt));
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="flex:1;min-width:0">
          <strong>Resume previous session</strong> — ${label || proj.projectType} · autosaved ${timeAgo}
        </span>
        <button id="btn-resume-autosave" class="btn-primary" style="white-space:nowrap">Resume →</button>
        <button id="btn-discard-autosave" style="white-space:nowrap">Discard</button>
      </div>
    `;
    banner.style.display = '';
    document.getElementById('btn-resume-autosave').addEventListener('click', () => {
      loadProject(proj);
      banner.style.display = 'none';
    });
    document.getElementById('btn-discard-autosave').addEventListener('click', () => {
      clearAutosave();
      banner.style.display = 'none';
    });
  } catch (_) {}
}

// ═══════════════════════════════════════════
// TRIP GENERATION SETUP + ANALYZE
// ═══════════════════════════════════════════
// Shared across both intersection and trip-gen projects — company, project, and personnel
// fields that appear on every printed report regardless of study type.
const projectInfo = {
  companyName: '', companyAddress: '',
  projectName: '', projectNumber: '', studyPurpose: '',
  projectManagerName: '', projectManagerTitle: '',
  counterName: '', counterTitle: '',
  qaCounterName: '', qaCounterTitle: '',
  logoUrl: '',
};

function renderLogoPreview() {
  ['logo-preview', 'logo-preview-tg'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = projectInfo.logoUrl
      ? `<img src="${projectInfo.logoUrl}" style="max-height:60px;max-width:220px;border-radius:4px;border:.5px solid var(--border)">`
      : '';
  });
  ['pi-logo-clear', 'pi-logo-clear-tg'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = projectInfo.logoUrl ? '' : 'none';
  });
}

function populatePrintHeader() {
  const isTripgen = projectType === 'tripgen';
  // Title: project name or intersection streets
  const title = projectInfo.projectName ||
    (isTripgen ? (tripgenSiteInfo.location || 'Trip Generation Study') :
      ((intersection.street1 && intersection.street2)
        ? `${intersection.street1} & ${intersection.street2}`
        : intersection.street1 || 'Intersection Count'));
  document.getElementById('prh-title').textContent = title;

  // Sub-line: project number + study purpose
  const subParts = [];
  if (projectInfo.projectNumber) subParts.push(`Project #${projectInfo.projectNumber}`);
  if (projectInfo.studyPurpose) subParts.push(projectInfo.studyPurpose);
  document.getElementById('prh-sub').textContent = subParts.join(' · ');

  // Meta row: company, personnel, date
  const meta = [];
  if (projectInfo.companyName) meta.push(`<span>${projectInfo.companyName}</span>`);
  if (projectInfo.projectManagerName) {
    const pmLine = projectInfo.projectManagerTitle
      ? `${projectInfo.projectManagerName}, ${projectInfo.projectManagerTitle}`
      : projectInfo.projectManagerName;
    meta.push(`<span>PM: ${pmLine}</span>`);
  }
  if (projectInfo.counterName) {
    const cLine = projectInfo.counterTitle
      ? `${projectInfo.counterName}, ${projectInfo.counterTitle}`
      : projectInfo.counterName;
    meta.push(`<span>Counter: ${cLine}</span>`);
  }
  if (!isTripgen && cfg.startMinutes != null) {
    const slots = Math.floor(cfg.durationMin / cfg.intervalMin);
    meta.push(`<span>${slots} × ${cfg.intervalMin}-min intervals</span>`);
  }
  meta.push(`<span>Printed ${new Date().toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'})}</span>`);
  document.getElementById('prh-meta').innerHTML = meta.join('');

  // Logo
  const logoEl = document.getElementById('prh-logo');
  if (projectInfo.logoUrl) {
    logoEl.src = projectInfo.logoUrl;
    logoEl.style.display = '';
  } else {
    logoEl.style.display = 'none';
  }
}

function wireProjectInfoFields() {
  // Sync all [data-pi="fieldName"] inputs — there are two instances of each field
  // (one in the intersection setup, one in the trip-gen setup) so editing one updates the other.
  const fields = ['companyName', 'companyAddress', 'projectName', 'projectNumber',
                  'studyPurpose', 'projectManagerName', 'projectManagerTitle',
                  'counterName', 'counterTitle', 'qaCounterName', 'qaCounterTitle'];
  fields.forEach((field) => {
    document.querySelectorAll(`[data-pi="${field}"]`).forEach((el) => {
      el.value = projectInfo[field] || '';
      el.addEventListener('input', () => {
        projectInfo[field] = el.value;
        document.querySelectorAll(`[data-pi="${field}"]`).forEach((o) => { if (o !== el) o.value = el.value; });
      });
    });
  });
  // Logo uploads
  ['pi-logo-input', 'pi-logo-input-tg'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => { projectInfo.logoUrl = evt.target.result; renderLogoPreview(); };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  });
  ['pi-logo-clear', 'pi-logo-clear-tg'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => { projectInfo.logoUrl = ''; renderLogoPreview(); });
  });
  renderLogoPreview();
}
wireProjectInfoFields();

const tripgenSiteInfo = { location: '', landUseType: '', gsf: '', parking: '', units: '', studyDates: '', notes: '' };
const tripgenCategoryMap = {};
const tripgenPeakWindows = { weekday: DEFAULT_PEAK_WINDOWS.weekday.map((w) => ({ ...w })), weekend: DEFAULT_PEAK_WINDOWS.weekend.map((w) => ({ ...w })) };
const tripgenQaqc = {};
const tripgenEntries = [];
let tripgenDataView = 'raw';
let tripgenNextId = 1;

// dayType is derived from the real date (never asked for separately — avoids the two
// disagreeing) — Saturday/Sunday count as weekend, everything else weekday.
function dayTypeFromDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}
function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Real address + real date are required before any "add a location" action proceeds —
// no placeholder "Location N" / generic day-type labels.
// Clears the shared address/date fields after a location is successfully added, so it's
// obvious the form is ready for the NEXT location rather than looking like a stale repeat.
function clearLocationContext() {
  document.getElementById('tg-location-address').value = '';
  document.getElementById('tg-location-date').value = '';
}

function requireLocationContext() {
  const errEl = document.getElementById('tripgen-upload-error');
  const address = document.getElementById('tg-location-address').value.trim();
  const date = document.getElementById('tg-location-date').value;
  if (!address) { errEl.textContent = 'Enter the real location/access-point address before adding a count.'; return null; }
  if (!date) { errEl.textContent = 'Enter the real date counted before adding a count.'; return null; }
  errEl.textContent = '';
  return { address, date };
}

function wireSiteInfoFields() {
  const map = { 'tg-site-address': 'location', 'tg-site-landuse': 'landUseType', 'tg-site-gsf': 'gsf', 'tg-site-parking': 'parking', 'tg-site-units': 'units', 'tg-site-studydates': 'studyDates', 'tg-site-notes': 'notes' };
  Object.entries(map).forEach(([id, field]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = tripgenSiteInfo[field] || '';
    el.addEventListener('change', () => { tripgenSiteInfo[field] = el.value; });
  });
}
wireSiteInfoFields();

function renderTripgenLocationsList() {
  const root = document.getElementById('tripgen-locations-list');
  if (!tripgenEntries.length) { root.innerHTML = '<div class="stat-detail">No locations added yet.</div>'; return; }

  const cards = tripgenEntries.map((e) => `
    <div class="card" style="margin-bottom:12px" data-loc-card="${e.id}">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">location / access point</div>
          <input type="text" data-tg-relabel="${e.id}" value="${escapeHtmlMain(e.locationLabel)}" style="width:100%;font-size:14px;font-weight:500">
        </div>
        <button data-tg-remove="${e.id}" style="flex-shrink:0;margin-top:18px">× remove</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">NYC Zola PDF <span style="color:var(--text3)">(optional — site zoning reference)</span></div>
          ${e.zolaPdfName
            ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
                 <a href="${e.zolaPdfData}" download="${escapeHtmlMain(e.zolaPdfName)}" style="color:var(--blue-text)">${escapeHtmlMain(e.zolaPdfName)}</a>
                 <button data-tg-zola-clear="${e.id}" style="font-size:11px">× remove</button>
               </div>`
            : `<label style="display:inline-block;cursor:pointer;font-size:12px;color:var(--blue-text)">
                 upload PDF… <input type="file" accept=".pdf,application/pdf" data-tg-zola-upload="${e.id}" style="display:none">
               </label>`}
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">source</div>
          <div style="font-size:13px;color:var(--text2)">${escapeHtmlMain(e.filename)}</div>
        </div>
      </div>

      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">count days</div>
      ${e.days.map((d, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:.5px solid var(--border);flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <span style="font-size:13px">${d.date ? formatDateLong(d.date) : escapeHtmlMain(d.sheetName)}</span>
            ${d.editSnapshot ? `<button data-tg-edit-entry="${e.id}" data-tg-edit-day="${i}" style="font-size:11px;margin-left:8px">edit counts</button>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${d.cameraImageUrl
              ? `<img src="${d.cameraImageUrl}" style="height:40px;width:64px;object-fit:cover;border-radius:3px;border:.5px solid var(--border)" title="Camera view">
                 <button data-tg-cam-clear="${e.id}" data-tg-cam-day="${i}" style="font-size:11px">× remove</button>`
              : `<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:var(--blue-text)">
                   📷 camera image <input type="file" accept="image/*" data-tg-cam-upload="${e.id}" data-tg-cam-day="${i}" style="display:none">
                 </label>`}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  root.innerHTML = `<div style="margin-bottom:4px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text2)">Locations (${tripgenEntries.length})</div>${cards}`;

  // enable action bar buttons once there's data
  const hasData = tripgenEntries.length > 0;
  document.getElementById('btn-tripgen-qaqc')?.toggleAttribute('disabled', !hasData);
  document.getElementById('btn-tripgen-analyze')?.toggleAttribute('disabled', !hasData);
  window.scheduleAutosave?.();

  root.querySelectorAll('[data-tg-relabel]').forEach((el) => {
    el.addEventListener('change', () => {
      const entry = tripgenEntries.find((e) => e.id === Number(el.dataset.tgRelabel));
      if (entry) entry.locationLabel = el.value;
    });
  });
  root.querySelectorAll('[data-tg-remove]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.tgRemove);
      const idx = tripgenEntries.findIndex((e) => e.id === id);
      if (idx >= 0) tripgenEntries.splice(idx, 1);
      renderTripgenLocationsList();
    });
  });
  root.querySelectorAll('[data-tg-edit-entry]').forEach((el) => {
    el.addEventListener('click', () => {
      editTripgenDay(Number(el.dataset.tgEditEntry), Number(el.dataset.tgEditDay));
    });
  });
  // NYC Zola PDF upload
  root.querySelectorAll('[data-tg-zola-upload]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const id = Number(input.dataset.tgZolaUpload);
      const entry = tripgenEntries.find((en) => en.id === id);
      if (!entry) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        entry.zolaPdfData = evt.target.result;
        entry.zolaPdfName = file.name;
        renderTripgenLocationsList();
      };
      reader.readAsDataURL(file);
    });
  });
  root.querySelectorAll('[data-tg-zola-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = tripgenEntries.find((e) => e.id === Number(btn.dataset.tgZolaClear));
      if (entry) { entry.zolaPdfData = null; entry.zolaPdfName = ''; renderTripgenLocationsList(); }
    });
  });
  // Camera image upload (per day)
  root.querySelectorAll('[data-tg-cam-upload]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const id = Number(input.dataset.tgCamUpload), dayIdx = Number(input.dataset.tgCamDay);
      const entry = tripgenEntries.find((en) => en.id === id);
      if (!entry) return;
      const reader = new FileReader();
      reader.onload = (evt) => { entry.days[dayIdx].cameraImageUrl = evt.target.result; renderTripgenLocationsList(); };
      reader.readAsDataURL(file);
    });
  });
  root.querySelectorAll('[data-tg-cam-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = tripgenEntries.find((e) => e.id === Number(btn.dataset.tgCamClear));
      if (entry) { entry.days[Number(btn.dataset.tgCamDay)].cameraImageUrl = null; renderTripgenLocationsList(); }
    });
  });
}

document.getElementById('btn-tripgen-upload-xlsx')?.addEventListener('click', () => {
  document.getElementById('tripgen-xlsx-input').click();
});
let pendingXlsxImport = null; // { filename, meta, days } awaiting per-sheet date confirmation
document.getElementById('tripgen-xlsx-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const ctx = requireLocationContext();
  if (!ctx) { e.target.value = ''; return; }
  const errEl = document.getElementById('tripgen-upload-error');
  try {
    const buf = await file.arrayBuffer();
    const { meta, days } = await analysisData.parseTripGenWorkbook(buf, file.name);
    pendingXlsxImport = { filename: file.name, meta, days };
    errEl.textContent = '';
    renderXlsxDateConfirmation(ctx.date);
  } catch (err) {
    errEl.textContent = err.message;
  }
  e.target.value = '';
});

// One .xlsx can contain several day-sheets (WKDY 1/2, WKND 1/2) — confirm a real date for
// each rather than guessing; defaults to consecutive days starting from the entered date,
// fully editable per row before committing.
function renderXlsxDateConfirmation(baseDate) {
  const area = document.getElementById('tripgen-xlsx-dates-area');
  const list = document.getElementById('tripgen-xlsx-dates-list');
  area.style.display = '';
  list.innerHTML = pendingXlsxImport.days.map((d, i) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:13px">
      <span style="min-width:120px">${d.sheetName}</span>
      <input type="date" data-xlsx-date-idx="${i}" value="${addDays(baseDate, i)}">
    </div>
  `).join('');
}
document.getElementById('btn-tripgen-xlsx-confirm')?.addEventListener('click', () => {
  if (!pendingXlsxImport) return;
  const ctx = requireLocationContext();
  if (!ctx) return;
  const dateInputs = [...document.querySelectorAll('[data-xlsx-date-idx]')];
  const days = pendingXlsxImport.days.map((d, i) => {
    const date = dateInputs[i]?.value || ctx.date;
    return { ...d, date, dayType: dayTypeFromDate(date) };
  });
  tripgenEntries.push({ id: tripgenNextId++, filename: pendingXlsxImport.filename, locationLabel: ctx.address, meta: pendingXlsxImport.meta, days });
  pendingXlsxImport = null;
  document.getElementById('tripgen-xlsx-dates-area').style.display = 'none';
  clearLocationContext();
  renderTripgenLocationsList();
});

document.getElementById('btn-tripgen-paste-toggle')?.addEventListener('click', () => {
  const area = document.getElementById('tripgen-paste-area');
  area.style.display = area.style.display === 'none' ? '' : 'none';
});

// ── Start a new live count (parallel to upload/paste — see tripgenCount.js) ──
document.getElementById('btn-tripgen-start-new')?.addEventListener('click', () => {
  const area = document.getElementById('tripgen-new-count-area');
  const isHidden = area.style.display === 'none';
  area.style.display = isHidden ? '' : 'none';
  if (isHidden) { tgResetClassifications(); tgAddClassification(); }
});
document.getElementById('btn-tg-add-classification')?.addEventListener('click', () => tgAddClassification());
document.getElementById('btn-tg-begin-counting')?.addEventListener('click', () => {
  const ctx = requireLocationContext();
  if (!ctx) return;
  const dayType = dayTypeFromDate(ctx.date);
  tgCounterBackTarget = 'tripgen-setup-screen';
  const started = tgBeginCounting((parsed, editSnapshot) => {
    tripgenEntries.push({
      id: tripgenNextId++, filename: '(live count)', locationLabel: ctx.address,
      meta: {}, days: [{ sheetName: formatDateLong(ctx.date), dayType, date: ctx.date, parsed, editSnapshot }],
    });
    clearLocationContext();
    renderTripgenLocationsList();
    // "finish location" takes you straight into the data view, not back to a bare list.
    goToTripgenAnalyze();
  });
  if (started) showScreen('tripgen-counter-screen');
});

// Re-opens a previously-finished live count for editing (only entries that were live-counted
// carry the entry-key/cfg snapshot needed to reconstruct the keyboard counter — uploaded/
// pasted entries have no live-count step to return to).
function editTripgenDay(entryId, dayIdx) {
  const entry = tripgenEntries.find((e) => e.id === entryId);
  const day = entry?.days[dayIdx];
  if (!day?.editSnapshot) return;
  tgCounterBackTarget = 'tripgen-setup-screen';
  showScreen('tripgen-counter-screen');
  tgBeginEditing(day.editSnapshot, day.parsed, (parsed, editSnapshot) => {
    day.parsed = parsed;
    day.editSnapshot = editSnapshot;
    renderTripgenLocationsList();
    goToTripgenAnalyze();
  });
}
window.editTripgenDay = editTripgenDay;
// The counter screen is reused for both "count a new location" and "QA/QC recount" flows —
// each begin* call sets this so the back button returns to the right place rather than
// always assuming the location-setup flow.
let tgCounterBackTarget = 'tripgen-setup-screen';
document.getElementById('tg-btn-finish')?.addEventListener('click', () => tgFinishLocation());
document.getElementById('tg-btn-to-setup')?.addEventListener('click', () => showScreen(tgCounterBackTarget));
tgWireKeydown();

// ═══════════════════════════════════════════
// QA/QC — standalone recount flow (separate from Analysis so data entry isn't competing
// with site info / category grouping / charts for screen space). Recounts use the SAME
// classifications as the original count (never a single aggregate number) so a recount
// can't be transcribed against the wrong category. Multiple recounts per peak are
// supported via "+ add count" — qaqc[peakKey].recounts is an array, not a single value.
// ═══════════════════════════════════════════
function qaqcPeakKey(entryId, sheetName, peakLabel) {
  return `${entryId}__${sheetName}__${peakLabel}`;
}
function inferIntervalMinutes(intervals) {
  if (intervals.length < 2) return 15;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return Math.max(1, toMin(intervals[1].start) - toMin(intervals[0].start));
}
let tgQaqcNextId = 1;

document.getElementById('btn-tripgen-qaqc')?.addEventListener('click', () => { showScreen('tripgen-qaqc-screen'); renderQaqcScreen(); });
document.getElementById('btn-qaqc-to-setup')?.addEventListener('click', () => showScreen('tripgen-setup-screen'));
document.getElementById('btn-qaqc-to-analyze')?.addEventListener('click', () => goToTripgenAnalyze());
document.getElementById('btn-analyze-to-qaqc')?.addEventListener('click', () => { showScreen('tripgen-qaqc-screen'); renderQaqcScreen(); });

async function renderQaqcScreen() {
  const root = document.getElementById('tripgen-qaqc-list');
  if (!tripgenEntries.length) { root.innerHTML = '<div class="stat-detail">No locations counted yet — add one from setup first.</div>'; return; }
  const cards = [];
  for (const entry of tripgenEntries) {
    for (const day of entry.days) {
      const intervalMinutes = inferIntervalMinutes(day.parsed.intervals);
      for (const w of tripgenPeakWindows[day.dayType]) {
        const peak = w.manualStartMin != null
          ? await analysisData.peakHourInWindow(day.parsed.intervals, intervalMinutes, w.manualStartMin, w.manualStartMin + 1, 'vehicle')
          : await analysisData.peakHourInWindow(day.parsed.intervals, intervalMinutes, w.searchStartMin, w.searchEndMin, 'vehicle');
        const key = qaqcPeakKey(entry.id, day.sheetName, w.label);
        const recounts = tripgenQaqc[key]?.recounts || [];
        const hasHour = peak.startIdx >= 0;
        const defaultStart = hasHour ? peak.startIdx * intervalMinutes + (day.parsed.intervals[0] ? toMinFromLabel(day.parsed.intervals[0].start) : 0) : w.searchStartMin;
        cards.push(`
          <div class="card" style="margin-bottom:14px" data-qaqc-card="${key}">
            <h3>${escapeHtmlMain(entry.locationLabel)} — ${escapeHtmlMain(day.sheetName)} — ${escapeHtmlMain(w.label)}</h3>
            <div class="stat-detail" style="margin-bottom:8px">${hasHour ? `Hour found: ${peak.label} · volume ${peak.volume}` : 'No interval found in the search range yet — you can still recount a specific time window below.'}</div>
            <table class="crosswalk-table" style="margin-bottom:10px">
              <thead><tr><th>#</th><th>Time range</th><th>Classifications</th><th>Total</th><th></th></tr></thead>
              <tbody>
                ${recounts.length ? recounts.map((r, ri) => {
                  const total = r.parsed.intervals.reduce((s, iv) => s + iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0), 0);
                  const range = `${r.parsed.intervals[0]?.start || ''} – ${r.parsed.intervals[r.parsed.intervals.length - 1]?.end || ''}`;
                  return `<tr><td>${ri + 1}</td><td>${escapeHtmlMain(range)}</td><td>${r.classifications.length}</td><td>${total}</td><td><button data-qaqc-remove-key="${key}" data-qaqc-remove-id="${r.id}">×</button></td></tr>`;
                }).join('') : '<tr><td colspan="5" style="color:var(--text3)">No recounts yet.</td></tr>'}
              </tbody>
            </table>
            <div data-qaqc-form-area="${key}" style="display:none;border-top:.5px solid var(--border);padding-top:10px;margin-bottom:10px">
              <div class="setup-grid" style="margin-bottom:10px">
                <div class="setup-field"><label>start time</label><input type="time" data-qaqc-start="${key}" value="${minToTimeStr(defaultStart)}"></div>
                <div class="setup-field"><label>interval length</label>
                  <select data-qaqc-interval="${key}">
                    <option value="5"${intervalMinutes === 5 ? ' selected' : ''}>5 min</option>
                    <option value="10"${intervalMinutes === 10 ? ' selected' : ''}>10 min</option>
                    <option value="15"${intervalMinutes === 15 ? ' selected' : ''}>15 min</option>
                    <option value="20"${intervalMinutes === 20 ? ' selected' : ''}>20 min</option>
                    <option value="30"${intervalMinutes === 30 ? ' selected' : ''}>30 min</option>
                    <option value="60"${intervalMinutes === 60 ? ' selected' : ''}>60 min</option>
                  </select>
                </div>
                <div class="setup-field"><label>duration (minutes)</label><input type="number" min="1" data-qaqc-duration="${key}" value="60"></div>
              </div>
              <button class="btn-primary" data-qaqc-begin="${key}">begin recount →</button>
            </div>
            <button data-qaqc-toggle-form="${key}">+ add count</button>
          </div>
        `);
      }
    }
  }
  root.innerHTML = cards.join('');

  root.querySelectorAll('[data-qaqc-toggle-form]').forEach((el) => {
    el.addEventListener('click', () => {
      const area = root.querySelector(`[data-qaqc-form-area="${el.dataset.qaqcToggleForm}"]`);
      area.style.display = area.style.display === 'none' ? '' : 'none';
    });
  });
  root.querySelectorAll('[data-qaqc-remove-key]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.qaqcRemoveKey;
      const id = Number(el.dataset.qaqcRemoveId);
      if (tripgenQaqc[key]) {
        tripgenQaqc[key].recounts = tripgenQaqc[key].recounts.filter((r) => r.id !== id);
        renderQaqcScreen();
      }
    });
  });
  root.querySelectorAll('[data-qaqc-begin]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.qaqcBegin;
      const [entryIdStr, sheetName] = key.split('__');
      const entry = tripgenEntries.find((e) => e.id === Number(entryIdStr));
      const day = entry?.days.find((d) => d.sheetName === sheetName);
      if (!day) return;
      const startEl = root.querySelector(`[data-qaqc-start="${key}"]`);
      const intervalEl = root.querySelector(`[data-qaqc-interval="${key}"]`);
      const durationEl = root.querySelector(`[data-qaqc-duration="${key}"]`);
      const [sh, sm] = (startEl.value || '00:00').split(':').map(Number);
      const recountCfg = {
        startMinutes: sh * 60 + (sm || 0),
        intervalMin: Number(intervalEl.value) || 15,
        durationMin: Math.max(1, Number(durationEl.value) || 60),
      };
      // Reuses the original count's entry keys if it was a live count (so the keys a user
      // already knows carry over); otherwise assigns fresh defaults from the same pool —
      // xlsx/paste imports never had keys of their own to begin with.
      const classificationList = day.editSnapshot?.classifications || tgDefaultClassificationsFor(day.parsed.types);
      tgCounterBackTarget = 'tripgen-qaqc-screen';
      document.getElementById('tg-btn-finish').textContent = '✓ finish recount';
      document.getElementById('tg-counter-sub').textContent = `— QA/QC recount: ${entry.locationLabel} / ${day.sheetName}`;
      const started = tgBeginRecount(classificationList, recountCfg, (parsed) => {
        tripgenQaqc[key] = tripgenQaqc[key] || { recounts: [] };
        tripgenQaqc[key].recounts.push({ id: tgQaqcNextId++, classifications: classificationList, cfg: recountCfg, parsed });
        document.getElementById('tg-btn-finish').textContent = '✓ finish location';
        document.getElementById('tg-counter-sub').textContent = '';
        showScreen('tripgen-qaqc-screen');
        renderQaqcScreen();
      });
      if (started) showScreen('tripgen-counter-screen');
    });
  });
}
function toMinFromLabel(t) { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function minToTimeStr(min) { const h = Math.floor(min / 60) % 24, m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
function escapeHtmlMain(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Parses a pasted tab-separated table into the {types, intervals} shape parseTripGen.js
// produces. Handles three common paste layouts:
//   A) Header: Time | ClassA |        | ClassB |        ...  (alternate, blank in between)
//   B) Header: Time | ClassA In | ClassA Out | ClassB In | ClassB Out ...  (each pair labeled)
//   C) Two-row header: row 0 = class names every-other, row 1 = "Entry"/"Exit" sub-labels
// Interval length is auto-derived from the time difference between the first two rows.
function parsePastedTable(text) {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split('\t'));
  if (rows.length < 2) throw new Error('Paste at least a header row and one data row.');

  const hdr0 = rows[0];

  // Detect a second sub-header row (Entry/Exit labels) and skip it for data
  const SUB_HDR = /^(entry|exit|in|out|inbound|outbound|nb|sb|eb|wb)$/i;
  let dataStart = 1;
  if (rows.length > 2 && rows[1].some((c) => SUB_HDR.test((c || '').trim()))) dataStart = 2;

  // Parse type names: take every-other column starting at index 1.
  // If the column immediately after has a matching "Out"/"Exit" label, strip the "In"/"Entry"
  // suffix from the class name so "Autos In" / "Autos Out" becomes just "Autos".
  const OUT_SUFFIX = /^(out|exit|outbound)$/i;
  const IN_STRIP = /\s+(in|entry|inbound|entr\.?)$/i;
  const types = [];
  for (let c = 1; c < hdr0.length; c += 2) {
    let name = (hdr0[c] || '').trim();
    if (!name) continue;
    const nextLabel = (hdr0[c + 1] || '').trim();
    if (OUT_SUFFIX.test(nextLabel)) name = name.replace(IN_STRIP, '');
    types.push(name);
  }

  // Parse time → minutes (handles HH:MM, H:MM, or plain integer minutes)
  function parseTimeMin(s) {
    const t = (s || '').trim();
    if (!t) return null;
    if (/^\d+:\d+/.test(t)) {
      const [h, m] = t.split(':').map(Number);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    }
    const n = Number(t);
    return isNaN(n) ? null : n;
  }

  const dataRows = rows.slice(dataStart).filter((r) => r[0] && r[0].trim());
  if (dataRows.length === 0) throw new Error('No data rows found — check that the time column is in the first column.');

  // Auto-derive interval length from the gap between the first two time values
  let intervalMin = 15;
  if (dataRows.length >= 2) {
    const t0 = parseTimeMin(dataRows[0][0]), t1 = parseTimeMin(dataRows[1][0]);
    if (t0 !== null && t1 !== null && t1 > t0) intervalMin = t1 - t0;
  }

  const fmt = (mm) => `${String(Math.floor(mm / 60) % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;

  const intervals = dataRows.map((row, ri) => {
    const startMin = parseTimeMin(row[0]) ?? ri * intervalMin;
    const endMin = startMin + intervalMin;
    const inbound = [], outbound = [];
    for (let c = 1; c < hdr0.length; c += 2) {
      inbound.push(Number(row[c]) || 0);
      outbound.push(Number(row[c + 1]) || 0);
    }
    return { label: `${fmt(startMin)} – ${fmt(endMin)}`, start: fmt(startMin), end: fmt(endMin), inbound, outbound };
  });

  if (types.length === 0) throw new Error('No classification columns found — check that classification names are in the first header row.');
  return { types, intervals };
}

function updatePastePreview() {
  const prev = document.getElementById('tripgen-paste-preview');
  if (!prev) return;
  const text = document.getElementById('tripgen-paste-input').value.trim();
  if (!text) { prev.textContent = ''; return; }
  try {
    const p = parsePastedTable(text);
    prev.style.color = 'var(--green-text,#15803d)';
    prev.textContent = `✓ Detected ${p.types.length} classification${p.types.length !== 1 ? 's' : ''} (${p.types.join(', ')}) · ${p.intervals.length} intervals`;
  } catch (e) {
    prev.style.color = 'var(--red-text,#c0392b)';
    prev.textContent = `✗ ${e.message}`;
  }
}

document.getElementById('tripgen-paste-input')?.addEventListener('input', updatePastePreview);

document.getElementById('btn-tripgen-paste-submit')?.addEventListener('click', () => {
  const errEl = document.getElementById('tripgen-upload-error');
  const ctx = requireLocationContext();
  if (!ctx) return;
  const text = document.getElementById('tripgen-paste-input').value;
  const dayType = dayTypeFromDate(ctx.date);
  try {
    const parsed = parsePastedTable(text);
    tripgenEntries.push({
      id: tripgenNextId++, filename: '(pasted)', locationLabel: ctx.address,
      meta: {}, days: [{ sheetName: formatDateLong(ctx.date), dayType, date: ctx.date, parsed }],
    });
    errEl.textContent = '';
    document.getElementById('tripgen-paste-input').value = '';
    document.getElementById('tripgen-paste-preview').textContent = '';
    clearLocationContext();
    renderTripgenLocationsList();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('btn-tripgen-analyze')?.addEventListener('click', () => goToTripgenAnalyze());

async function goToTripgenAnalyze() {
  if (!tripgenEntries.length) return;
  showScreen('analyze-screen');
  document.getElementById('btn-analyze-to-count').style.display = 'none';
  document.getElementById('btn-analyze-to-qaqc').style.display = '';
  document.getElementById('analyze-sub').textContent = '— trip generation';
  await rerenderTripgenAnalysis();
}

async function rerenderTripgenAnalysis() {
  await renderTripGenSection(document.getElementById('analyze-root'), tripgenEntries, {
    siteInfo: tripgenSiteInfo, categoryMap: tripgenCategoryMap, peakWindows: tripgenPeakWindows,
    qaqc: tripgenQaqc, dataView: tripgenDataView,
    onSiteInfoChange: (field, value) => { tripgenSiteInfo[field] = value; rerenderTripgenAnalysis(); },
    onCategoryMapChange: (label, group) => { tripgenCategoryMap[label] = group; rerenderTripgenAnalysis(); },
    onPeakWindowChange: (dayType, idx, edge, value) => {
      const w = tripgenPeakWindows[dayType][idx];
      if (edge === 'start') w.searchStartMin = value;
      else if (edge === 'end') w.searchEndMin = value;
      else if (edge === 'manual') w.manualStartMin = value;
      rerenderTripgenAnalysis();
    },
    onPeakManualToggle: (dayType, idx, checked) => {
      const w = tripgenPeakWindows[dayType][idx];
      w.manualStartMin = checked ? w.searchStartMin : null;
      rerenderTripgenAnalysis();
    },
    onDataViewChange: (view) => { tripgenDataView = view; rerenderTripgenAnalysis(); },
  });
}

checkAutosave();

window.saveTripgenProject = function () {
  const proj = {
    version: 1, projectType: 'tripgen', savedAt: new Date().toISOString(),
    projectInfo: { ...projectInfo },
    siteInfo: tripgenSiteInfo, categoryMap: tripgenCategoryMap, peakWindows: tripgenPeakWindows,
    qaqc: tripgenQaqc, qaqcReviewerName: document.getElementById('qaqc-reviewer-name')?.value || '',
    qaqcReviewDate: document.getElementById('qaqc-review-date')?.value || '',
    entries: tripgenEntries,
  };
  downloadJSON(proj, `${tripgenSiteInfo.location || 'tripgen'}.tcproject`);
};
