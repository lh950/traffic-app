import './style.css';
import './analysis/style.css';

const LS_KEY = 'traffic-app-autosave';
const LS_RECENTS_KEY = 'tc_recents';
const LS_PROJECTS_INDEX = 'tc_projects_index';

let projectUUID = null;

import {
  cfg, vPairs, tmcPairs, setTmcPairs, intersection, fnames, vData, pedData, tmcData,
  vManual, pedManual, tmManual, slotLabel, setVPairs, setTmcApproach,
  initVData, initPedData, initTMCData, mode,
  periods, activePeriodIdx, setActivePeriodIdx,
  captureActivePeriod, restoreActivePeriod, initDefaultPeriods,
  resetUndoStacks, updateUndoUI, periodMeta,
} from './state.js';
import {
  switchSetupTab, setIntervalLen, updateDerived, updateVCount, applyVPreset,
  checkVKeys, checkPKeys, setLegLabel, toggleLegCrosswalk, toggleLegApproach, toggleLegOneWay, toggleLegOneWayIn,
  updateCrosswalkField, toggleApproachDestUnified, toggleApproachCount, renderLegConfig,
  buildTemplateGrid, renderVPairsList, renderTmcPairsList, checkTmcKeys, addBikeClass,
  addTmcType, addAllVPairsToTmc, _syncTmcAddSelect,
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
import { exportCSV, getCSVText, confirmReset } from './export.js';
import { exportXLSX, getXLSXBlob, exportTripgenXLSX } from './exportXlsx.js';
import {
  openHelp, closeHelp, switchHelpTab, openSettings, closeSettings,
  applyMidSettings, checkMsKeys, wireHelpKeydown,
} from './help.js';

import { parseTmcCsv } from './parseTmcCsv.js';
import { parseRawCountXlsx, buildIntersectionFromMeta } from './parseRawCountXlsx.js';
import { parseDotTmcXlsx, buildTmcIntersectionFromMeta } from './parseDotTmcXlsx.js';
import { parseCSV, detectColumnsLocally, mapColumnsWithClaude, buildSnapshotFromMapping, saveLearnedMappings, saveImportTemplate, loadImportTemplates, deleteImportTemplate, findMatchingTemplate, LS_API_KEY } from './importCsv.js';
import * as analysisData from './analysis/ui/dataAdapter.js';
import { renderSummary } from './analysis/ui/summary.js';
import { renderTmcSection } from './analysis/ui/tmcDiagram.js';
import { renderLosSection } from './analysis/ui/losSection.js';
import { openPrintReport } from './printReport.js';
import { runTmcQA, runVehicleQA, renderQASection } from './qa.js';
import { renderWarrantSection } from './warrant.js';
import { parseProjectSnapshot, parseCurrentSnapshot, renderComparisonSection, pickComparisonFile } from './compare.js';
import { renderCorridorChart } from './corridorChart.js';
import { exportShareablePage, buildShareableHTML } from './shareReport.js';
import JSZip from 'jszip';
import { printSummaryReport, printIntersectionReport } from './printPedReport.js';
import { buildVolumeProfileSVG, buildCrosswalkBarSVG, buildChartLegend, dirSplitBar, CW_COLORS } from './chartUtils.js';
import { renderTripGenSection, DEFAULT_PEAK_WINDOWS, computePeakVolumes } from './analysis/ui/tripgenSection.js';

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
  switchSetupTab, switchTgTab,
  setIntervalLen, updateDerived, updateVCount, applyVPreset,
  checkVKeys, checkPKeys, setLegLabel, toggleLegCrosswalk, toggleLegApproach, toggleLegOneWay, toggleLegOneWayIn,
  updateCrosswalkField, toggleApproachDestUnified, toggleApproachCount, renderLegConfig,
  renderTmcPairsList, checkTmcKeys, addBikeClass, addTmcType, addAllVPairsToTmc, _syncTmcAddSelect,
  openLegPopover, closeLegPopover, getOpenLeg,
  setDiagLeg, setMissingLeg, updateDiagram, toggleDiagram, toggleTurningDiagram,
  setMode, render, buildKbd, updateCfgFields, vGroupPrev, vGroupNext,
  toggleFocusMode, cycleFocus, setFocusTarget, undo, redo,
  exportCSV, exportXLSX, confirmReset,
  exportTripgenXLSX: () => exportTripgenXLSX(tripgenEntries, tripgenSiteInfo, projectInfo),
  openHelp, closeHelp, switchHelpTab, openSettings, closeSettings,
  applyMidSettings, checkMsKeys,
  goSetup,
  renderParkingSetupZones, pkSetOcc, renderParkingOccBadge,
  openPrintReport: () => openPrintReport({
    ...projectInfo,
    date: periodMeta.date,
    weather: periodMeta.weather,
    counterName: periodMeta.observer || projectInfo.counterName,
    studyPurpose: periodMeta.notes || projectInfo.studyPurpose,
    equipment: periodMeta.equipment,
  }),
  exportAnalyzeXLSX: () => {
    if (projectType === 'tripgen') exportTripgenXLSX(tripgenEntries, tripgenSiteInfo, projectInfo);
    else exportXLSX();
  },
});

// Wrap startCounting to initialize periods after data is ready
window.startCounting = function () {
  startCounting(); // reads form inputs → cfg, runs initVData/ped/tmc
  if (plannedPeriods.length > 0) {
    // Override cfg with period 0's planner timing, then build all period snapshots.
    // Each period gets its own cfg so the counter rows/slots reflect that period's window.
    applyPlannedTiming(plannedPeriods[0]);
    initVData(); initPedData(); initTMCData(initApproaches);
    initDefaultPeriods(plannedPeriods[0].name);
    // Build periods 1+ directly to avoid UI rebuild side effects of addPeriod()
    plannedPeriods.slice(1).forEach(p => {
      applyPlannedTiming(p);
      initVData(); initPedData(); initTMCData(initApproaches);
      periods.push({ name: p.name, data: captureActivePeriod() });
    });
    // Restore period 0 as the active counting period (activePeriodIdx stays 0)
    if (plannedPeriods.length > 1) restoreActivePeriod(periods[0].data);
  } else {
    initDefaultPeriods();
  }
  buildPeriodTabs();
  buildCounterSidebar();
  if (projectType === 'intersection') {
    if (document.body.classList.contains('workspace-mode')) {
      // Already in workspace (user navigated back to Setup tab); route via workspace router
      openWorkspaceTab('count');
    } else {
      enterWorkspace();
      setSidebarMeta(projectInfo.projectName || 'Intersection count', '');
      _sidebarActiveItem = 'count';
      renderAppSidebar();
    }
  }
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
const SCREENS = ['home-screen', 'help-screen', 'area-setup-screen', 'area-import-screen', 'summary-screen', 'export-screen', 'ix-analysis-screen', 'setup-screen', 'counter-screen', 'tripgen-setup-screen', 'tripgen-counter-screen', 'tripgen-qaqc-screen', 'tripgen-distribution-screen', 'analyze-screen', 'parking-setup-screen', 'parking-counter-screen'];
let projectType = null; // 'intersection' | 'area' | 'tripgen' | 'parking' | null

// ── Parking study state ──
let parkingProjectInfo = { projectName: '', location: '', date: '', notes: '' };
let parkingZones = []; // [{id, name, capacity}]
window.parkingZones = parkingZones; // exposed for inline oninput handlers in parking HTML
let parkingCfg = { startMin: 420, intervalMin: 15, durationMin: 240 };
let parkingGrid = {}; // {slotIdx: {zoneId: count}}
let parkingActiveSlot = 0;
let _parkingUndoStack = []; // [{slotIdx, zoneId, prev}]
let _pkZoneNextId = 1;

function parkingTotalSlots() { return Math.max(1, Math.round(parkingCfg.durationMin / parkingCfg.intervalMin)); }

function pkSlotLabel(slotIdx) {
  const m = parkingCfg.startMin + slotIdx * parkingCfg.intervalMin;
  const fmt = v => String(Math.floor(v / 60) % 24).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  return fmt(m) + ' – ' + fmt(m + parkingCfg.intervalMin);
}

function pkSetOcc(slotIdx, zoneId, val) {
  const prev = parkingGrid[slotIdx]?.[zoneId] ?? '';
  if (!parkingGrid[slotIdx]) parkingGrid[slotIdx] = {};
  parkingGrid[slotIdx][zoneId] = val;
  _parkingUndoStack.push({ slotIdx, zoneId, prev });
  if (_parkingUndoStack.length > 200) _parkingUndoStack.shift();
  window.scheduleAutosave?.();
}

function pkUndo() {
  if (!_parkingUndoStack.length) return;
  const { slotIdx, zoneId, prev } = _parkingUndoStack.pop();
  if (!parkingGrid[slotIdx]) parkingGrid[slotIdx] = {};
  if (prev === '') delete parkingGrid[slotIdx][zoneId];
  else parkingGrid[slotIdx][zoneId] = prev;
  renderParkingCounter();
}

function pkPctClass(pct) {
  if (isNaN(pct)) return '';
  if (pct >= 90) return 'pk-pct-crit';
  if (pct >= 70) return 'pk-pct-warn';
  return 'pk-pct-ok';
}

function renderParkingSetupZones() {
  const wrap = document.getElementById('pk-zones-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  parkingZones.forEach((z, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 100px 28px;gap:8px;align-items:center;margin-bottom:8px';
    row.innerHTML = `
      <input type="text" value="${z.name}" placeholder="Zone name (e.g. Level 1)"
        style="padding:6px 10px;border:.5px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--text);font-size:13px"
        oninput="parkingZones[${i}].name=this.value">
      <input type="number" value="${z.capacity}" min="1" placeholder="Spaces"
        style="padding:6px 10px;border:.5px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--text);font-size:13px;text-align:right"
        oninput="parkingZones[${i}].capacity=parseInt(this.value)||0">
      <button onclick="parkingZones.splice(${i},1);renderParkingSetupZones()"
        style="width:28px;height:28px;border:.5px solid var(--border);border-radius:var(--r);background:none;color:var(--text3);cursor:pointer;font-size:14px">×</button>`;
    wrap.appendChild(row);
  });
  if (!parkingZones.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">No zones yet — add one below.</div>';
  }
}

function pkUpdateTimingPreview() {
  const el = document.getElementById('pk-timing-preview');
  if (!el) return;
  const slots = parkingTotalSlots();
  const fmt = v => String(Math.floor(v / 60) % 24).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  el.textContent = `${slots} interval${slots !== 1 ? 's' : ''} · ${fmt(parkingCfg.startMin)} to ${fmt(parkingCfg.startMin + parkingCfg.durationMin)} · ${parkingCfg.intervalMin}-min intervals`;
}

function renderParkingCounter() {
  const labelEl = document.getElementById('pk-slot-label');
  const cardsEl = document.getElementById('pk-zone-cards');
  if (!labelEl || !cardsEl) return;

  const total = parkingTotalSlots();
  if (parkingActiveSlot >= total) parkingActiveSlot = total - 1;
  if (parkingActiveSlot < 0) parkingActiveSlot = 0;

  labelEl.textContent = pkSlotLabel(parkingActiveSlot);
  document.getElementById('pk-prev').disabled = parkingActiveSlot <= 0;
  document.getElementById('pk-next').disabled = parkingActiveSlot >= total - 1;

  cardsEl.innerHTML = '';
  const slotData = parkingGrid[parkingActiveSlot] || {};

  if (!parkingZones.length) {
    cardsEl.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:16px 0">No zones defined. Return to setup to add zones.</div>';
    return;
  }

  parkingZones.forEach(z => {
    const occ = slotData[z.id] ?? '';
    const pct = (occ !== '' && z.capacity > 0) ? Math.round((occ / z.capacity) * 100) : NaN;
    const pctText = isNaN(pct) ? '—' : `${pct}%`;
    const pctClass = pkPctClass(pct);
    const card = document.createElement('div');
    card.className = 'pk-zone-card';
    card.innerHTML = `
      <div class="pk-zone-head">
        <span class="pk-zone-name">${z.name}</span>
        <span class="pk-zone-cap">Capacity: ${z.capacity}</span>
      </div>
      <div class="pk-zone-entry">
        <input type="number" class="pk-occ-input" value="${occ}" min="0" max="${z.capacity}"
          placeholder="0" data-zone="${z.id}"
          oninput="pkSetOcc(${parkingActiveSlot},'${z.id}',this.value===''?'':parseInt(this.value)||0);renderParkingOccBadge(this,'${z.id}')">
        <span class="pk-occ-sep">/ ${z.capacity}</span>
        <span class="pk-pct ${pctClass}" id="pk-pct-${z.id}">${pctText}</span>
      </div>`;
    cardsEl.appendChild(card);
  });
}

function renderParkingOccBadge(input, zoneId) {
  const z = parkingZones.find(z => z.id === zoneId);
  const pctEl = document.getElementById(`pk-pct-${zoneId}`);
  if (!pctEl || !z) return;
  const occ = input.value === '' ? NaN : parseInt(input.value);
  const pct = (!isNaN(occ) && z.capacity > 0) ? Math.round((occ / z.capacity) * 100) : NaN;
  pctEl.textContent = isNaN(pct) ? '—' : `${pct}%`;
  pctEl.className = `pk-pct ${pkPctClass(pct)}`;
}

function renderParkingSummary() {
  const wrap = document.getElementById('pk-summary-table');
  if (!wrap) return;
  const total = parkingTotalSlots();
  const cols = parkingZones.map(z => z.name);
  let html = `<table class="pk-summary-tbl"><thead><tr><th>Interval</th>${cols.map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>`;
  for (let s = 0; s < total; s++) {
    const slotData = parkingGrid[s] || {};
    html += `<tr><td>${pkSlotLabel(s)}</td>`;
    parkingZones.forEach(z => {
      const occ = slotData[z.id];
      const pct = (occ != null && z.capacity > 0) ? Math.round((occ / z.capacity) * 100) : null;
      const cls = pct != null ? pkPctClass(pct).replace('pk-pct-', 'pk-cell-') : '';
      const txt = pct != null ? `${occ} (${pct}%)` : '—';
      html += `<td class="${cls}">${txt}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function exportParkingCSV() {
  const total = parkingTotalSlots();
  const header = ['Interval', ...parkingZones.map(z => `${z.name} (occ)`), ...parkingZones.map(z => `${z.name} (pct%)`)];
  const rows = [header];
  for (let s = 0; s < total; s++) {
    const sd = parkingGrid[s] || {};
    const row = [pkSlotLabel(s)];
    parkingZones.forEach(z => row.push(sd[z.id] ?? ''));
    parkingZones.forEach(z => {
      const occ = sd[z.id]; const pct = (occ != null && z.capacity > 0) ? Math.round((occ / z.capacity) * 100) : '';
      row.push(pct);
    });
    rows.push(row);
  }
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${(parkingProjectInfo.projectName || 'parking_study').replace(/[^a-z0-9_-]/gi, '_')}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

const SIDEBAR_FOOTER = `
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <button class="sidebar-item" data-ws="help">Help</button>
      <button class="sidebar-item sidebar-item-muted" data-action="bug-report">Report a bug</button>
    </div>`;

function renderSidebarParking() {
  const body = document.getElementById('sidebar-body');
  if (!body) return;
  body.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Study</div>
      <button class="sidebar-item" data-ws="pk-setup">Setup</button>
      <button class="sidebar-item" data-ws="pk-count">Count</button>
      <button class="sidebar-item" data-ws="pk-export">Export CSV</button>
    </div>
    ${SIDEBAR_FOOTER}`;
  body.querySelectorAll('.sidebar-item[data-ws]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ws === _sidebarActiveItem);
    btn.addEventListener('click', () => openWorkspaceTab(btn.dataset.ws));
  });
  body.querySelector('[data-action="bug-report"]')?.addEventListener('click', openBugReportDialog);
}

// ── In-app navigation history ──
const _navHistory = [];
let _currentScreen = 'home-screen';
let _navLock = false;

function switchTgTab(name, btn) {
  const screen = document.getElementById('tripgen-setup-screen');
  screen.querySelectorAll('.tg-tab').forEach(b => b.classList.remove('active'));
  screen.querySelectorAll('.tg-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tgp-' + name).classList.add('active');
}

function _updateBackBtn() {
  const btn = document.getElementById('app-back-btn');
  if (!btn) return;
  const show = _navHistory.length > 0 && _currentScreen !== 'home-screen';
  btn.style.display = show ? 'flex' : 'none';
}

function goBack() {
  if (!_navHistory.length) return;
  _navLock = true;
  const prev = _navHistory.pop();
  showScreen(prev);
  _navLock = false;
}

function showScreen(id) {
  if (!_navLock && _currentScreen && _currentScreen !== id && id !== 'home-screen') {
    _navHistory.push(_currentScreen);
    if (_navHistory.length > 30) _navHistory.shift();
  }
  _currentScreen = id;
  SCREENS.forEach((s) => {
    const el = document.getElementById(s);
    if (!el) return;
    el.style.display = s === id ? '' : 'none';
    el.classList.toggle('active', s === id);
  });
  _updateBackBtn();
}

// ── Workspace / sidebar ──
let _sidebarActiveItem = null;

function enterWorkspace() {
  if (!projectUUID) projectUUID = crypto.randomUUID();
  document.body.classList.add('workspace-mode');
  document.getElementById('app-sidebar')?.classList.add('visible');
}

function exitWorkspace() {
  projectUUID = null;
  document.body.classList.remove('workspace-mode');
  document.getElementById('app-sidebar')?.classList.remove('visible');
}

function showHome() {
  exitWorkspace();
  _sidebarActiveItem = null;
  _navHistory.length = 0;
  showScreen('home-screen');
  renderHomeResumeBanner();
  renderHomeRecents();
}

function showHelp() {
  showScreen('help-screen');
}

function setSidebarMeta(name, sub) {
  const nameEl = document.getElementById('sidebar-project-name');
  const subEl = document.getElementById('sidebar-project-sub');
  if (nameEl) nameEl.textContent = name || 'Untitled';
  if (subEl) subEl.textContent = sub || '';
}

function renderSidebarIntersection() {
  const body = document.getElementById('sidebar-body');
  if (!body) return;
  body.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Intersection</div>
      <button class="sidebar-item" data-ws="setup">Setup</button>
      <button class="sidebar-item" data-ws="count">Count</button>
      <button class="sidebar-item" data-ws="analyze">Analyze</button>
      <button class="sidebar-item" data-ws="charts">Charts</button>
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <div class="sidebar-section-label">Study</div>
      <button class="sidebar-item" data-ws="export">Export</button>
    </div>
    ${SIDEBAR_FOOTER}`;
  body.querySelectorAll('.sidebar-item[data-ws]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ws === _sidebarActiveItem);
    btn.addEventListener('click', () => openWorkspaceTab(btn.dataset.ws));
  });
  body.querySelector('[data-action="bug-report"]')?.addEventListener('click', openBugReportDialog);
}

function renderSidebarArea() {
  const body = document.getElementById('sidebar-body');
  if (!body) return;
  const studyItems = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Study</div>
      <button class="sidebar-item" data-ws="area-hub">Project info</button>
      <button class="sidebar-item" data-ws="area-summary">Summary</button>
      <button class="sidebar-item" data-ws="area-import">Import CSV</button>
      <button class="sidebar-item" data-ws="area-export">Export</button>
    </div>
    <div class="sidebar-divider"></div>`;
  const ixItems = areaIntersections.map((ix, i) => `
    <button class="sidebar-item sidebar-item-ix" data-ws="area-ix" data-idx="${i}">
      <span class="sidebar-ix-dot"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ix.name || `Intersection ${i + 1}`}</span>
    </button>`).join('');
  body.innerHTML = `
    ${studyItems}
    <div class="sidebar-section">
      <div class="sidebar-section-label">Intersections</div>
      ${ixItems}
      <button class="sidebar-add-btn" id="sidebar-add-ix">+ Add intersection</button>
    </div>
    ${SIDEBAR_FOOTER}`;
  body.querySelectorAll('.sidebar-item[data-ws]').forEach(btn => {
    const key = btn.dataset.ws === 'area-ix' ? `area-ix-${btn.dataset.idx}` : btn.dataset.ws;
    btn.classList.toggle('active', key === _sidebarActiveItem);
    btn.addEventListener('click', () => {
      if (btn.dataset.ws === 'area-ix') openWorkspaceTab('area-ix', +btn.dataset.idx);
      else openWorkspaceTab(btn.dataset.ws);
    });
  });
  document.getElementById('sidebar-add-ix')?.addEventListener('click', () => {
    _sidebarActiveItem = null;
    renderSidebarArea();
    showScreen('area-setup-screen');
  });
  body.querySelector('[data-action="bug-report"]')?.addEventListener('click', openBugReportDialog);
}

function renderSidebarTripgen() {
  const body = document.getElementById('sidebar-body');
  if (!body) return;
  body.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Study</div>
      <button class="sidebar-item" data-ws="tg-setup">Setup</button>
      <button class="sidebar-item" data-ws="tg-analyze">Analysis</button>
      <button class="sidebar-item" data-ws="tg-qaqc">QA/QC</button>
      <button class="sidebar-item" data-ws="tg-distribution">Distribution</button>
    </div>
    ${SIDEBAR_FOOTER}`;
  body.querySelectorAll('.sidebar-item[data-ws]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ws === _sidebarActiveItem);
    btn.addEventListener('click', () => openWorkspaceTab(btn.dataset.ws));
  });
  body.querySelector('[data-action="bug-report"]')?.addEventListener('click', openBugReportDialog);
}

function renderAppSidebar() {
  if (projectType === 'intersection') renderSidebarIntersection();
  else if (projectType === 'area') renderSidebarArea();
  else if (projectType === 'tripgen') renderSidebarTripgen();
  else if (projectType === 'parking') renderSidebarParking();
}

function openWorkspaceTab(tab, idx) {
  _sidebarActiveItem = tab === 'area-ix' ? `area-ix-${idx}` : tab;
  renderAppSidebar();
  switch (tab) {
    case 'setup': showScreen('setup-screen'); renderPlannedPeriods(); break;
    case 'count': showScreen('counter-screen'); window.goToCountMode?.(); break;
    case 'analyze':
    case 'charts': {
      showScreen('ix-analysis-screen');
      const isIxCount = projectType === 'intersection';
      const backBtn = document.getElementById('btn-ix-analysis-back');
      const openBtn = document.getElementById('btn-ix-open-counter');
      if (backBtn) backBtn.style.display = isIxCount ? 'none' : '';
      if (openBtn) openBtn.style.display = isIxCount ? 'none' : '';
      if (isIxCount) {
        const titleEl = document.getElementById('ix-analysis-title');
        const subEl = document.getElementById('ix-analysis-sub');
        if (titleEl) titleEl.textContent = [intersection.street1, intersection.street2].filter(Boolean).join(' & ') || projectInfo?.projectName || 'Intersection';
        if (subEl) subEl.textContent = projectInfo?.location || '';
      }
      renderIxAnalysis(ixAnalysisPeriodIdx, tab === 'charts' ? 'charts' : 'data');
      break;
    }
    case 'export': showExportScreen(); break;
    case 'help': showHelp(); break;
    case 'area-hub': showAreaSetup(); break;
    case 'area-summary':
      if (typeof showSummaryScreen === 'function') showSummaryScreen();
      break;
    case 'area-import': showImportScreen(); break;
    case 'area-export': showExportScreen(); break;
    case 'area-ix':
      showIntersectionAnalysis(idx ?? activeIntersectionIdx);
      break;
    case 'tg-setup': showScreen('tripgen-setup-screen'); break;
    case 'tg-analyze': showScreen('analyze-screen'); break;
    case 'tg-qaqc': showScreen('tripgen-qaqc-screen'); break;
    case 'tg-distribution': showScreen('tripgen-distribution-screen'); renderDistributionScreen(); break;
    case 'pk-setup': showScreen('parking-setup-screen'); renderParkingSetupZones(); pkUpdateTimingPreview(); break;
    case 'pk-count': showScreen('parking-counter-screen'); renderParkingCounter(); break;
    case 'pk-export': exportParkingCSV(); break;
    default: break;
  }
}

// ── Home screen ──
function renderHomeResumeBanner() {
  const banner = document.getElementById('home-resume-banner');
  if (!banner) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { banner.style.display = 'none'; return; }
    const proj = JSON.parse(raw);
    if (!proj?.projectType || !proj?.savedAt) { banner.style.display = 'none'; return; }
    const label = proj.projectType === 'tripgen'
      ? (proj.siteInfo?.location || proj.projectInfo?.projectName || 'Trip generation project')
      : (proj.projectInfo?.projectName || 'Intersection count');
    const timeAgo = formatTimeAgo(new Date(proj.savedAt));
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="flex:1;min-width:0"><strong>Resume previous session</strong> — ${label} · autosaved ${timeAgo}</span>
        <button id="home-btn-resume" class="btn-primary" style="white-space:nowrap">Resume →</button>
        <button id="home-btn-discard" style="white-space:nowrap">Discard</button>
      </div>`;
    banner.style.display = '';
    document.getElementById('home-btn-resume')?.addEventListener('click', () => {
      loadProject(proj);
      banner.style.display = 'none';
    });
    document.getElementById('home-btn-discard')?.addEventListener('click', () => {
      clearAutosave();
      banner.style.display = 'none';
    });
  } catch (_) { banner.style.display = 'none'; }
}

// Wire home screen buttons
document.getElementById('home-btn-intersection')?.addEventListener('click', () => {
  projectType = 'intersection';
  plannedPeriods.length = 0;
  enterWorkspace();
  setSidebarMeta('New intersection count', '');
  _sidebarActiveItem = 'setup';
  renderAppSidebar();
  showScreen('setup-screen');
  renderPlannedPeriods();
});

document.getElementById('home-btn-area')?.addEventListener('click', () => {
  projectType = 'area';
  areaIntersections.length = 0;
  enterWorkspace();
  setSidebarMeta('New area study', '');
  _sidebarActiveItem = null;
  renderAppSidebar();
  showScreen('area-setup-screen');
});

document.getElementById('home-btn-tripgen')?.addEventListener('click', () => {
  projectType = 'tripgen';
  enterWorkspace();
  setSidebarMeta('New trip generation', '');
  _sidebarActiveItem = 'tg-setup';
  renderAppSidebar();
  showScreen('tripgen-setup-screen');
});

document.getElementById('home-btn-parking')?.addEventListener('click', () => {
  projectUUID = crypto.randomUUID();
  Object.assign(parkingProjectInfo, { projectName: '', location: '', date: '', notes: '' });
  parkingZones.length = 0;
  Object.keys(parkingGrid).forEach(k => delete parkingGrid[k]);
  parkingCfg.startMin = 420; parkingCfg.intervalMin = 15; parkingCfg.durationMin = 240;
  parkingActiveSlot = 0; _parkingUndoStack.length = 0; _pkZoneNextId = 1;
  projectType = 'parking';
  enterWorkspace();
  setSidebarMeta('New parking study', '');
  _sidebarActiveItem = 'pk-setup';
  renderAppSidebar();
  showScreen('parking-setup-screen');
  renderParkingSetupZones();
  pkUpdateTimingPreview();
});

// Parking setup field wiring
['pk-name','pk-location','pk-date','pk-notes'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', function() {
    const key = { 'pk-name': 'projectName', 'pk-location': 'location', 'pk-date': 'date', 'pk-notes': 'notes' }[id];
    parkingProjectInfo[key] = this.value;
    setSidebarMeta(parkingProjectInfo.projectName || 'Parking study', parkingProjectInfo.location || '');
    window.scheduleAutosave?.();
  });
});

document.getElementById('pk-btn-add-zone')?.addEventListener('click', () => {
  parkingZones.push({ id: String(_pkZoneNextId++), name: `Zone ${parkingZones.length + 1}`, capacity: 100 });
  renderParkingSetupZones();
});

['pk-start','pk-interval','pk-dur-h','pk-dur-m'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    const startVal = document.getElementById('pk-start')?.value || '07:00';
    const [sh, sm] = startVal.split(':').map(Number);
    parkingCfg.startMin = sh * 60 + (sm || 0);
    parkingCfg.intervalMin = parseInt(document.getElementById('pk-interval')?.value) || 15;
    const h = parseInt(document.getElementById('pk-dur-h')?.value) || 0;
    const m = parseInt(document.getElementById('pk-dur-m')?.value) || 0;
    parkingCfg.durationMin = Math.max(parkingCfg.intervalMin, h * 60 + m);
    pkUpdateTimingPreview();
    window.scheduleAutosave?.();
  });
});

document.getElementById('pk-btn-start')?.addEventListener('click', () => {
  if (!parkingZones.length) { alert('Add at least one zone before counting.'); return; }
  parkingActiveSlot = 0;
  _sidebarActiveItem = 'pk-count';
  renderAppSidebar();
  showScreen('parking-counter-screen');
  renderParkingCounter();
});

// Parking counter controls
document.getElementById('pk-prev')?.addEventListener('click', () => {
  if (parkingActiveSlot > 0) { parkingActiveSlot--; renderParkingCounter(); }
});
document.getElementById('pk-next')?.addEventListener('click', () => {
  if (parkingActiveSlot < parkingTotalSlots() - 1) { parkingActiveSlot++; renderParkingCounter(); }
});
document.getElementById('pk-btn-undo')?.addEventListener('click', pkUndo);
document.getElementById('pk-btn-export')?.addEventListener('click', exportParkingCSV);
document.getElementById('pk-btn-summary')?.addEventListener('click', () => {
  const sumEl = document.getElementById('pk-summary');
  if (!sumEl) return;
  const showing = sumEl.style.display !== 'none';
  sumEl.style.display = showing ? 'none' : '';
  document.getElementById('pk-btn-summary').textContent = showing ? 'View summary ▾' : 'Hide summary ▴';
  if (!showing) renderParkingSummary();
});

document.getElementById('home-btn-load')?.addEventListener('click', () => {
  document.getElementById('home-load-input')?.click();
});
document.getElementById('home-load-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const errEl = document.getElementById('home-load-error');
  try {
    const text = await file.text();
    const proj = JSON.parse(text);
    addToRecents(proj);
    loadProject(proj);
    if (errEl) errEl.textContent = '';
  } catch (err) {
    if (errEl) errEl.textContent = `Could not load project: ${err.message}`;
  }
});

// ── Workspace sync ──────────────────────────────────────────────────────────
function exportSyncFile() {
  const index = loadProjectsIndex();
  if (!index.length) {
    const s = document.getElementById('home-sync-status');
    if (s) { s.style.color = 'var(--text3)'; s.textContent = 'No saved projects found.'; }
    return;
  }
  const projects = [];
  for (const entry of index) {
    try {
      const raw = localStorage.getItem(`tc_project_${entry.uuid}`);
      if (raw) projects.push(JSON.parse(raw));
    } catch (_) {}
  }
  if (!projects.length) {
    const s = document.getElementById('home-sync-status');
    if (s) { s.style.color = 'var(--text3)'; s.textContent = 'No project data to export.'; }
    return;
  }
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), projects }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traffic-projects-${new Date().toISOString().slice(0,10)}.tcsync`;
  a.click();
  URL.revokeObjectURL(url);
  const s = document.getElementById('home-sync-status');
  if (s) { s.style.color = 'var(--text3)'; s.textContent = `Exported ${projects.length} project${projects.length !== 1 ? 's' : ''}.`; }
}

async function importSyncFile(file) {
  const statusEl = document.getElementById('home-sync-status');
  const setStatus = (msg, isErr) => {
    if (!statusEl) return;
    statusEl.style.color = isErr ? 'var(--danger)' : 'var(--text3)';
    statusEl.textContent = msg;
  };
  try {
    const payload = JSON.parse(await file.text());
    const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.projects) ? payload.projects : null);
    if (!list) { setStatus('Unrecognized .tcsync format.', true); return; }
    let added = 0, skipped = 0;
    for (const proj of list) {
      if (!proj?.uuid || !proj?.projectType) { skipped++; continue; }
      const existing = localStorage.getItem(`tc_project_${proj.uuid}`);
      if (existing) { skipped++; continue; }
      localStorage.setItem(`tc_project_${proj.uuid}`, JSON.stringify(proj));
      upsertProjectIndex(proj);
      added++;
    }
    setStatus(`Imported ${added} project${added !== 1 ? 's' : ''}${skipped ? `, ${skipped} already existed (skipped)` : ''}.`, false);
    renderHomeRecents();
  } catch (err) {
    setStatus(`Import failed: ${err.message}`, true);
  }
}

document.getElementById('home-btn-export-sync')?.addEventListener('click', exportSyncFile);
document.getElementById('home-btn-import-sync')?.addEventListener('click', () => document.getElementById('home-sync-input')?.click());
document.getElementById('home-sync-input')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importSyncFile(file);
  e.target.value = '';
});

function openBugReportDialog() {
  document.getElementById('bug-report-modal')?.classList.add('open');
  document.getElementById('bug-desc').value = '';
  document.getElementById('bug-email-note').style.display = 'none';
}

function closeBugReportDialog() {
  document.getElementById('bug-report-modal')?.classList.remove('open');
}

function _bugStripPeriod(p) {
  const tmcTotal = Object.values(p.tmcData||{}).reduce((s, from) =>
    s + Object.values(from).reduce((s2, slots) =>
      s2 + slots.reduce((s3, slot) => s3 + (slot||[]).reduce((a,b) => a+(b||0), 0), 0), 0), 0);
  const vehTotal = (p.vData?.in||[]).reduce((s, r) => s + r.reduce((a,b) => a+(b||0), 0), 0)
                 + (p.vData?.out||[]).reduce((s, r) => s + r.reduce((a,b) => a+(b||0), 0), 0);
  const pedTotal = (p.pedData||[]).reduce((s, xw) => s + xw.reduce((s2, slot) => s2 + (slot[0]||0)+(slot[1]||0), 0), 0);
  return { name: p.name, cfg: p.cfg, meta: p.meta, tmcTotal, vehTotal, pedTotal,
    tmcMovements: Object.entries(p.tmcData||{}).flatMap(([from, dests]) => Object.keys(dests).map(to => `${from}→${to}`)) };
}

function _bugStripSnap(snap) {
  if (!snap) return null;
  return { ...snap, periods: (snap.periods||[]).map(_bugStripPeriod) };
}

function _bugReportPayload() {
  const storage = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    try {
      const val = JSON.parse(localStorage.getItem(key));
      if (key.startsWith('tc_project_') || key === 'traffic-app-autosave') {
        const proj = val;
        if (proj?.projectType === 'area') {
          storage[key] = { ...proj, intersections: (proj.intersections||[]).map(ix => ({ ...ix, snapshot: _bugStripSnap(ix.snapshot) })) };
        } else {
          storage[key] = _bugStripSnap(proj);
        }
      } else {
        storage[key] = val;
      }
    } catch { storage[key] = localStorage.getItem(key); }
  }
  return {
    timestamp: new Date().toISOString(),
    appVersion: document.title,
    description: document.getElementById('bug-desc').value.trim() || '(no description)',
    currentScreen: _currentScreen,
    projectType,
    navHistory: [..._navHistory],
    storage,
  };
}

function _bugDownloadJSON(report) {
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = report.timestamp.slice(0, 10);
  const uid = crypto.randomUUID().slice(0, 8);
  a.download = `bug-report-${ts}-${uid}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('bug-modal-close')?.addEventListener('click', closeBugReportDialog);
document.getElementById('bug-report-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeBugReportDialog();
});

document.getElementById('bug-btn-download')?.addEventListener('click', () => {
  _bugDownloadJSON(_bugReportPayload());
  closeBugReportDialog();
});

document.getElementById('bug-btn-email')?.addEventListener('click', () => {
  const report = _bugReportPayload();
  _bugDownloadJSON(report);
  const subject = encodeURIComponent(`Bug report — Traffic App ${report.appVersion}`);
  const body = encodeURIComponent(
    `Description:\n${report.description}\n\n` +
    `Version: ${report.appVersion}\nScreen: ${report.currentScreen}\nTime: ${report.timestamp}\n\n` +
    `Please attach the bug-report-*.json file that was just downloaded.`
  );
  window.open(`mailto:lhidalg93@gmail.com?subject=${subject}&body=${body}`);
  document.getElementById('bug-email-note').style.display = 'block';
});

document.getElementById('home-btn-bug-report')?.addEventListener('click', openBugReportDialog);
document.getElementById('home-btn-help')?.addEventListener('click', showHelp);
document.getElementById('app-back-btn')?.addEventListener('click', goBack);
// ────────────────────────────────────────────────────────────────────────────

document.getElementById('sidebar-back-btn')?.addEventListener('click', showHome);

showScreen('home-screen');
renderHomeResumeBanner();
renderHomeRecents();

window.openWorkspaceTab = openWorkspaceTab;

window.goToCountMode = function () {
  document.getElementById('btn-count-mode')?.classList.add('active');
  document.getElementById('btn-analyze-mode')?.classList.remove('active');
  showScreen('counter-screen');
  buildCounterSidebar();
  if (periods.length) { buildPeriodTabs(); }
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
// ─── Period planner (setup screen → study parameters tab) ───────────────
const plannedPeriods = []; // [{name, start, end}]

function applyPlannedTiming(p) {
  if (!p.start || !p.end) return;
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const startMin = toMin(p.start);
  const endMin = toMin(p.end);
  if (endMin > startMin) {
    cfg.startMinutes = startMin;
    cfg.durationMin = Math.max(cfg.intervalMin || 15, endMin - startMin);
  }
}

function renderPlannedPeriods() {
  const list = document.getElementById('pp-list');
  if (!list) return;
  const note = document.getElementById('timing-planner-note');
  if (!plannedPeriods.length) {
    list.innerHTML = '<div class="pp-empty-note">No periods planned — counting will start with one period.</div>';
    if (note) note.style.display = 'none';
    return;
  }
  list.innerHTML = plannedPeriods.map((p, i) => `
    <div class="pp-period-row">
      <span class="pp-period-name">${p.name}</span>
      <span class="pp-period-times">${p.start || '—'}–${p.end || '—'}</span>
      <button class="pp-del-btn" onclick="removePlannedPeriod(${i})" title="Remove">×</button>
    </div>`).join('');
  if (note) note.style.display = '';
}

window.addPlannedPeriod = function (name, start, end) {
  if (plannedPeriods.some(p => p.name === name)) return;
  plannedPeriods.push({ name, start: start || '', end: end || '' });
  renderPlannedPeriods();
};
window.removePlannedPeriod = function (idx) {
  plannedPeriods.splice(idx, 1);
  renderPlannedPeriods();
};
window.commitCustomPlannedPeriod = function () {
  const name = (document.getElementById('pp-name')?.value || '').trim();
  const start = document.getElementById('pp-start')?.value || '';
  const end = document.getElementById('pp-end')?.value || '';
  if (!name) { alert('Enter a period name.'); return; }
  plannedPeriods.push({ name, start, end });
  renderPlannedPeriods();
  document.getElementById('pp-name').value = '';
  document.getElementById('pp-start').value = '';
  document.getElementById('pp-end').value = '';
  document.getElementById('pp-custom-form').style.display = 'none';
};

document.getElementById('btn-analyze-to-count')?.addEventListener('click', () => window.goToCountMode());
document.getElementById('btn-analyze-print')?.addEventListener('click', () => {
  populatePrintHeader();
  window.print();
});
document.getElementById('btn-analyze-to-landing')?.addEventListener('click', () => {
  document.getElementById('btn-analyze-to-count').style.display = 'none';
  document.getElementById('btn-analyze-to-qaqc').style.display = 'none';
  if (projectType === 'area') showSummaryScreen();
  else showHome();
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
  return { approaches, types: tmcPairs.map(p => ({ label: p.label, isBike: !!p.isBike })), intervals, legLabels: intersection.legLabels || {}, intervalMin: cfg.intervalMin };
}

// ── Period-stored-data → analysis shapes ─────────────────────────────────────
// Like live*Parsed() but reads from a stored period's .data object, so the
// analyze screen can inspect any period without touching live counting state.
function parsedFromPeriod(pData) {
  const { startMinutes, intervalMin, durationMin } = pData.cfg;
  const slots = Math.floor(durationMin / intervalMin);
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  const slotLabel = (i) => { const s = startMinutes + i * intervalMin; return `${fmt(s)}–${fmt(s + intervalMin)}`; };
  const approaches = intersection.approaches.map(a => ({
    leg: a.leg,
    destinations: a.destinations.map(d => ({ leg: d, turnClass: classifyTurn(a.leg, d) })),
  }));
  const vehParsed = {
    types: vPairs.map(p => p.label),
    intervals: Array.from({ length: slots }, (_, i) => ({
      label: slotLabel(i), start: fmt(startMinutes + i * intervalMin), end: fmt(startMinutes + (i+1) * intervalMin),
      inbound: pData.vData.in[i] || [], outbound: pData.vData.out[i] || [],
    })),
  };
  const pedParsed = {
    crosswalks: intersection.crosswalks.map(c => ({ name: c.name, dir0: c.dir0, dir1: c.dir1 })),
    intervals: Array.from({ length: slots }, (_, i) => ({
      label: slotLabel(i), start: fmt(startMinutes + i * intervalMin), end: fmt(startMinutes + (i+1) * intervalMin),
      counts: pData.pedData.map(xw => xw[i] || [0,0]),
    })),
  };
  const tmcParsed = {
    approaches, types: tmcPairs.map(p => ({ label: p.label, isBike: !!p.isBike })),
    legLabels: intersection.legLabels || {}, intervalMin,
    intervals: Array.from({ length: slots }, (_, i) => {
      const counts = {};
      approaches.forEach(a => {
        counts[a.leg] = {};
        a.destinations.forEach(d => { counts[a.leg][d.leg] = pData.tmcData[a.leg]?.[d.leg]?.[i] || vPairs.map(() => 0); });
      });
      return { label: slotLabel(i), start: fmt(startMinutes + i * intervalMin), end: fmt(startMinutes + (i+1) * intervalMin), counts };
    }),
  };
  return { vehParsed, pedParsed, tmcParsed };
}

function filterTmcParsedByIndices(parsed, indices) {
  if (!indices || indices.length === parsed.types.length) return parsed;
  const idxSet = new Set(indices);
  return {
    ...parsed,
    types: parsed.types.filter((_, i) => idxSet.has(i)),
    intervals: parsed.intervals.map(iv => ({
      ...iv,
      counts: Object.fromEntries(
        Object.entries(iv.counts).map(([leg, dests]) => [
          leg,
          Object.fromEntries(
            Object.entries(dests).map(([dest, arr]) => [
              dest,
              indices.map(i => arr[i] || 0),
            ])
          ),
        ])
      ),
    })),
  };
}

// ── Analyze: single-period content ───────────────────────────────────────────
async function renderAnalyzePeriodContent(root, vehParsed, pedParsed, tmcParsed) {
  const hasTmc = intersection.approaches.some((a) => a.destinations.length);
  const bikeIdx = tmcPairs.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
  const motorIdx = tmcPairs.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
  const hasBikes = hasTmc && bikeIdx.length > 0;
  const hasMotor = hasTmc && motorIdx.length > 0;

  root.innerHTML = `
    <div class="dataset-tabs no-print" id="analyze-dataset-tabs" style="display:flex;align-items:center;gap:0">
      <button class="dataset-tab active" data-kind="vehicle">Vehicle</button>
      <button class="dataset-tab" data-kind="ped">Pedestrian</button>
      ${hasTmc ? '<button class="dataset-tab" data-kind="tmc">Turning movements</button>' : ''}
      <button class="dataset-tab" style="margin-left:auto;border-left:.5px solid var(--border)" onclick="openPrintReport()">⎙ Print report</button>
      <button class="dataset-tab" id="btn-share-report" style="border-left:.5px solid var(--border)">↓ Export page</button>
    </div>
    <div class="section"><div class="section-head"><h2>Summary</h2></div><div id="analyze-summary-root"></div></div>
    <div class="section"><div class="section-head"><h2>Data quality</h2></div><div id="analyze-qa-root"></div></div>
    ${hasMotor ? `<div class="section"><div class="section-head"><h2>Turning movements${hasBikes ? ' — motor vehicles' : ''}</h2></div><div id="analyze-tmc-root"></div></div>` : ''}
    ${hasBikes ? `<div class="section"><div class="section-head"><h2>Turning movements — bicycles</h2></div><div id="analyze-bike-root"></div></div>` : ''}
    ${hasTmc && !hasMotor && !hasBikes ? '<div class="section"><div class="section-head"><h2>Turning movements</h2></div><div id="analyze-tmc-root"></div></div>' : ''}
    <div class="section"><div class="section-head"><h2>Level of service</h2></div><div id="analyze-los-root"></div></div>
    <!-- signal warrants hidden: scope TBD -->
    <div class="section no-print" style="display:none"><div class="section-head"><h2>Signal warrants</h2><span class="section-sub">MUTCD Warrants 1–4</span></div><div id="analyze-warrant-root"></div></div>
    <div class="section no-print"><div class="section-head"><h2>Before / After comparison</h2></div><div id="analyze-compare-root"></div></div>
  `;

  let activeKind = 'vehicle';

  function paintQA() {
    const qaRoot = document.getElementById('analyze-qa-root');
    if (!qaRoot) return;
    const findings = activeKind === 'vehicle'
      ? runVehicleQA(vehParsed)
      : runTmcQA(hasBikes ? filterTmcParsedByIndices(tmcParsed, motorIdx) : tmcParsed);
    renderQASection(qaRoot, findings);
  }

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
      paintQA();
    });
  });
  await paintSummary();
  paintQA();

  if (hasMotor) {
    await renderTmcSection(document.getElementById('analyze-tmc-root'), filterTmcParsedByIndices(tmcParsed, motorIdx));
  } else if (hasTmc && !hasBikes) {
    await renderTmcSection(document.getElementById('analyze-tmc-root'), tmcParsed);
  }
  if (hasBikes) {
    await renderTmcSection(document.getElementById('analyze-bike-root'), filterTmcParsedByIndices(tmcParsed, bikeIdx));
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

  const warrantRoot = document.getElementById('analyze-warrant-root');
  if (warrantRoot) {
    const allLegs = intersection.approaches.map(a => a.leg);
    renderWarrantSection(warrantRoot, tmcParsed, pedParsed, cfg.intervalMin, allLegs);
  }

  const compareRoot = document.getElementById('analyze-compare-root');
  if (compareRoot) {
    let referenceSnap = null;
    function paintComparison() {
      if (!referenceSnap) {
        compareRoot.innerHTML = `
          <div class="cmp-empty-state">
            <p>Load a second study to compare volumes before and after.</p>
            <button id="btn-load-reference" class="btn-primary">Load reference study…</button>
          </div>`;
        compareRoot.querySelector('#btn-load-reference').addEventListener('click', loadReference);
      } else {
        const info = projectInfo || {};
        const currentLabel = [info.location, info.intersection].filter(Boolean).join(' — ') || 'Current session';
        const currentSnap = parseCurrentSnapshot(
          hasBikes ? filterTmcParsedByIndices(tmcParsed, motorIdx) : tmcParsed,
          vehParsed, pedParsed, motorIdx,
          intersection.legLabels || {}, currentLabel, info.date || ''
        );
        const cmpRoot = document.createElement('div');
        cmpRoot.innerHTML = `<button id="btn-change-reference" style="font-size:11px;margin-bottom:14px">← Change reference study</button>`;
        const tableRoot = document.createElement('div');
        cmpRoot.appendChild(tableRoot);
        compareRoot.innerHTML = '';
        compareRoot.appendChild(cmpRoot);
        renderComparisonSection(tableRoot, referenceSnap, currentSnap);
        compareRoot.querySelector('#btn-change-reference').addEventListener('click', () => { referenceSnap = null; paintComparison(); });
      }
    }
    function loadReference() {
      pickComparisonFile((proj) => {
        const snap = parseProjectSnapshot(proj);
        if (!snap) { alert('This file does not appear to be an intersection count project.'); return; }
        referenceSnap = snap;
        paintComparison();
      });
    }
    paintComparison();
  }

  document.getElementById('btn-share-report')?.addEventListener('click', () => {
    exportShareablePage(
      { ...projectInfo, date: periodMeta.date || projectInfo.date, weather: periodMeta.weather || projectInfo.weather, counterName: periodMeta.observer || projectInfo.counterName, studyPurpose: periodMeta.notes || projectInfo.studyPurpose, equipment: periodMeta.equipment },
      intersection, vehParsed, pedParsed, tmcParsed, motorIdx, bikeIdx, hasBikes, cfg?.intervalMin || 15
    );
  });
}

// ── Analyze: all-periods comparison view ─────────────────────────────────────
function renderAllPeriodsView(root) {
  const motorIdx = tmcPairs.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
  const fmt2 = (m) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  const cols = periods.map((p, i) => {
    const pd = i === activePeriodIdx ? captureActivePeriod() : p.data;
    const { startMinutes, intervalMin, durationMin } = pd.cfg;
    const slots = Math.floor(durationMin / intervalMin);
    const timeRange = `${fmt2(startMinutes)}–${fmt2(startMinutes + durationMin)}`;

    // Vehicle totals
    let vehIn = 0, vehOut = 0;
    for (let s = 0; s < slots; s++) {
      vehIn  += (pd.vData.in  || []).reduce((sum, arr) => sum + (arr[s] || 0), 0);
      vehOut += (pd.vData.out || []).reduce((sum, arr) => sum + (arr[s] || 0), 0);
    }

    // Peak vehicle hour
    let peakHour = '—', peakVol = 0;
    for (let s = 0; s + 4 <= slots; s++) {
      let hv = 0;
      for (let k = 0; k < 4; k++) {
        hv += (pd.vData.in  || []).reduce((sum, arr) => sum + (arr[s+k] || 0), 0);
        hv += (pd.vData.out || []).reduce((sum, arr) => sum + (arr[s+k] || 0), 0);
      }
      if (hv > peakVol) { peakVol = hv; peakHour = fmt2(startMinutes + s * intervalMin); }
    }

    // TMC totals (motor only)
    let tmcTotal = 0;
    for (const a of intersection.approaches) {
      for (const d of (a.destinations || [])) {
        for (let s = 0; s < slots; s++) {
          const arr = pd.tmcData[a.leg]?.[d]?.[s] || [];
          tmcTotal += motorIdx.reduce((sum, mi) => sum + (arr[mi] || 0), 0);
        }
      }
    }

    // Ped totals
    const pedTotal = (pd.pedData || []).reduce((sum, xw) =>
      sum + xw.reduce((s2, slot) => s2 + (slot[0]||0) + (slot[1]||0), 0), 0);

    // Meta
    const meta = pd.meta || {};
    return { name: p.name, timeRange, vehIn, vehOut, vehTotal: vehIn+vehOut, peakHour, peakVol, tmcTotal, pedTotal, date: meta.date || '', weather: meta.weather || '' };
  });

  const th = (txt) => `<th>${txt}</th>`;
  const td = (val) => `<td>${val != null ? String(val) : '—'}</td>`;

  const header = `<tr><th></th>${cols.map(c => `<th><div class="ap-period-name">${c.name}</div><div class="ap-period-range">${c.timeRange}</div></th>`).join('')}</tr>`;

  const rows = [
    ['Date',           cols.map(c => c.date || '—')],
    ['Weather',        cols.map(c => c.weather || '—')],
    ['Vehicle in',     cols.map(c => c.vehIn.toLocaleString())],
    ['Vehicle out',    cols.map(c => c.vehOut.toLocaleString())],
    ['Vehicle total',  cols.map(c => c.vehTotal.toLocaleString())],
    ['Peak hour start',cols.map(c => c.peakHour)],
    ['Peak hour vol.', cols.map(c => c.peakVol ? c.peakVol.toLocaleString() : '—')],
    ['TMC total (motor)', cols.map(c => c.tmcTotal ? c.tmcTotal.toLocaleString() : '—')],
    ['Pedestrian total',  cols.map(c => c.pedTotal ? c.pedTotal.toLocaleString() : '—')],
  ].map(([label, vals]) =>
    `<tr><td class="ap-row-label">${label}</td>${vals.map(v => `<td>${v}</td>`).join('')}</tr>`
  ).join('');

  root.innerHTML = `
    <div class="section">
      <div class="section-head"><h2>All periods — summary</h2></div>
      <div style="overflow-x:auto">
        <table class="ap-table">${header}${rows}</table>
      </div>
    </div>`;
}

// ── Analyze: main entry point ─────────────────────────────────────────────────
async function renderIntersectionAnalysis() {
  // Flush live state into active period before any reads
  if (periods.length > 0) periods[activePeriodIdx].data = captureActivePeriod();

  const analyzeScreen = document.getElementById('analyze-screen');
  if (!analyzeScreen) return;

  // Period picker bar (rendered once at the screen level, above #analyze-root)
  let periodBar = document.getElementById('analyze-period-bar');
  if (!periodBar) {
    periodBar = document.createElement('div');
    periodBar.id = 'analyze-period-bar';
    periodBar.className = 'analyze-period-bar no-print';
    analyzeScreen.insertBefore(periodBar, analyzeScreen.firstChild);
  }

  // Track which period/view is selected in the analyze screen (independent of active counting period)
  if (analyzeScreen._viewPeriodIdx == null) analyzeScreen._viewPeriodIdx = activePeriodIdx;
  const isAll = analyzeScreen._viewPeriodIdx === 'all';

  function buildPeriodBar() {
    const vpi = analyzeScreen._viewPeriodIdx;
    periodBar.innerHTML = '';
    if (periods.length <= 1) { periodBar.style.display = 'none'; return; }
    periodBar.style.display = 'flex';
    periods.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.className = 'apb-tab' + (vpi === i ? ' active' : '');
      const pCfg = p.data.cfg;
      const fmt2 = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      const timeRange = pCfg?.startMinutes != null
        ? `${fmt2(pCfg.startMinutes)}–${fmt2(pCfg.startMinutes + pCfg.durationMin)}`
        : '';
      btn.innerHTML = `<span class="apb-tab-name">${p.name}</span>${timeRange ? `<span class="apb-tab-time">${timeRange}</span>` : ''}`;
      btn.title = timeRange;
      if (i === activePeriodIdx) {
        const dot = document.createElement('span');
        dot.className = 'apb-active-dot';
        dot.title = 'Currently counting in this period';
        btn.appendChild(dot);
      }
      btn.addEventListener('click', () => {
        analyzeScreen._viewPeriodIdx = i;
        buildPeriodBar();
        repaintContent();
      });
      periodBar.appendChild(btn);
    });
    if (periods.length >= 2) {
      const allBtn = document.createElement('button');
      allBtn.className = 'apb-tab apb-all' + (vpi === 'all' ? ' active' : '');
      allBtn.textContent = 'All periods';
      allBtn.addEventListener('click', () => {
        analyzeScreen._viewPeriodIdx = 'all';
        buildPeriodBar();
        repaintContent();
      });
      periodBar.appendChild(allBtn);
    }
  }

  const root = document.getElementById('analyze-root');

  async function repaintContent() {
    const vpi = analyzeScreen._viewPeriodIdx;
    if (vpi === 'all') {
      renderAllPeriodsView(root);
      return;
    }
    const pData = periods[vpi]?.data;
    let vehParsed, pedParsed, tmcParsed;
    if (pData) {
      ({ vehParsed, pedParsed, tmcParsed } = parsedFromPeriod(pData));
    } else {
      vehParsed = liveVehicleParsed();
      pedParsed = livePedParsed();
      tmcParsed = liveTmcParsed();
    }
    await renderAnalyzePeriodContent(root, vehParsed, pedParsed, tmcParsed);
  }

  buildPeriodBar();
  await repaintContent();
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
  tripgenEntries.length = 0;
  tripgenDistribution = [];
  tripgenDistNextId = 1;
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
document.getElementById('btn-tripgen-to-landing')?.addEventListener('click', () => showHome());

// ═══════════════════════════════════════════
// AREA-WIDE STUDY SETUP SCREEN
// ═══════════════════════════════════════════
function showProjectHub() {
  const titleEl = document.getElementById('area-study-title');
  const subEl = document.getElementById('area-study-subtitle');
  if (titleEl) titleEl.textContent = projectInfo.projectName || 'Untitled project';
  if (subEl) subEl.textContent = [projectInfo.companyName, projectInfo.studyPurpose].filter(Boolean).join(' · ');
  renderAreaIntersectionsList();
  enterWorkspace();
  setSidebarMeta(projectInfo.projectName || 'Area study', '');
  renderAppSidebar();
  showScreen('area-setup-screen');
  // Live-update area header as project info is edited
  document.querySelectorAll('[data-pi="projectName"],[data-pi="companyName"],[data-pi="studyPurpose"]').forEach(el => {
    el.addEventListener('input', () => {
      if (titleEl) titleEl.textContent = projectInfo.projectName || 'Untitled project';
      if (subEl) subEl.textContent = [projectInfo.companyName, projectInfo.studyPurpose].filter(Boolean).join(' · ');
      if (el.dataset.pi === 'projectName') setSidebarMeta(projectInfo.projectName || 'Area study', '');
    });
  });
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
    const { street1, street2 } = extractStreets({ name, street1: intersection.street1, street2: intersection.street2, snapshot: snap });
    if (!areaIntersections[activeIntersectionIdx].street1) areaIntersections[activeIntersectionIdx].street1 = street1;
    if (!areaIntersections[activeIntersectionIdx].street2) areaIntersections[activeIntersectionIdx].street2 = street2;
  } else {
    const streets = extractStreets({ name, street1: intersection.street1, street2: intersection.street2, snapshot: snap });
    areaIntersections.push({ name, snapshot: snap, street1: streets.street1, street2: streets.street2, corridor: '', counterName: '', lat: '', lng: '' });
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
    const corridor = ix.corridor || '';
    const lat = ix.lat || '';
    const lng = ix.lng || '';
    return `
      <div class="area-ix-row${isActive ? ' active' : ''}" data-idx="${i}">
        <div class="area-ix-num">${i + 1}</div>
        <div class="area-ix-info">
          <div class="area-ix-name">${ix.name}</div>
          <div class="area-ix-meta">${periods} period${periods !== 1 ? 's' : ''} · ${periodNames}</div>
        </div>
        <div class="area-ix-fields">
          <div class="area-ix-fields-row">
            <input class="area-ix-field-input area-ix-corridor-input" data-idx="${i}" type="text" value="${corridor.replace(/"/g,'&quot;')}" placeholder="corridor (optional)">
            <input class="area-ix-field-input area-ix-counter-input" data-idx="${i}" type="text" value="${counter.replace(/"/g,'&quot;')}" placeholder="counter name">
          </div>
          <div class="area-ix-fields-row">
            <input class="area-ix-field-input area-ix-lat-input" data-idx="${i}" type="text" value="${lat.replace(/"/g,'&quot;')}" placeholder="latitude">
            <input class="area-ix-field-input area-ix-lng-input" data-idx="${i}" type="text" value="${lng.replace(/"/g,'&quot;')}" placeholder="longitude">
          </div>
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

  container.querySelectorAll('.area-ix-corridor-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = +inp.dataset.idx;
      if (areaIntersections[idx]) areaIntersections[idx].corridor = inp.value;
    });
  });

  container.querySelectorAll('.area-ix-counter-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = +inp.dataset.idx;
      if (areaIntersections[idx]) areaIntersections[idx].counterName = inp.value;
    });
  });

  container.querySelectorAll('.area-ix-lat-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = +inp.dataset.idx;
      if (areaIntersections[idx]) areaIntersections[idx].lat = inp.value;
    });
  });

  container.querySelectorAll('.area-ix-lng-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = +inp.dataset.idx;
      if (areaIntersections[idx]) areaIntersections[idx].lng = inp.value;
    });
  });

  if (beginBtn) beginBtn.disabled = areaIntersections.length === 0;
}

document.getElementById('btn-area-to-landing')?.addEventListener('click', () => showHome());
document.getElementById('btn-summary-back')?.addEventListener('click', () => showProjectHub());
document.getElementById('btn-summary-export')?.addEventListener('click', showExportScreen);
document.getElementById('btn-export-back')?.addEventListener('click', () => showScreen('summary-screen'));
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
        let sheets, isTmc = false;
        try {
          sheets = parseDotTmcXlsx(buf);
          isTmc = true;
        } catch (_tmcErr) {
          sheets = parseRawCountXlsx(buf);
        }
        // Auto-import all valid sheets — no picker in batch mode
        for (const sheet of sheets) {
          if (isTmc) loadTmcSheet(sheet);
          else loadRawCountSheet(sheet);
        }
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
  areaIntersections.push({ name, snapshot: snap, street1: '', street2: '', corridor: '', counterName: '', lat: '', lng: '' });
  activeIntersectionIdx = areaIntersections.length - 1;
  loadIntersectionIntoView(snap);
});

// ── CSV Import ──
let _csvImportMapping = null;
let _csvImportHeaders = null;
let _csvImportRows = null;
let _csvImportIxName = '';

const MIN_MOVEMENTS_TO_ACCEPT = 4; // built-in detection is considered successful with ≥ this many movements mapped

function importSetStep(step) {
  document.getElementById('import-step-upload').style.display       = step === 'upload' ? '' : 'none';
  document.getElementById('import-step-ai-fallback').style.display  = step === 'fallback' ? '' : 'none';
  document.getElementById('import-step-loading').style.display      = step === 'loading' ? '' : 'none';
  document.getElementById('import-step-preview').style.display      = step === 'preview' ? '' : 'none';
}

function renderImportTemplatesPanel() {
  const panel = document.getElementById('import-templates-panel');
  const list = document.getElementById('import-templates-list');
  if (!panel || !list) return;
  const templates = loadImportTemplates();
  if (!templates.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  list.innerHTML = templates.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px">${t.name}</span>
      <span style="font-size:11px;color:var(--text2)">${t.savedAt ? new Date(t.savedAt).toLocaleDateString() : ''}</span>
      <button data-tpl-id="${t.id}" style="font-size:11px;padding:2px 8px;color:var(--danger)">Delete</button>
    </div>`).join('');
  list.querySelectorAll('[data-tpl-id]').forEach(btn => {
    btn.addEventListener('click', () => { deleteImportTemplate(btn.dataset.tplId); renderImportTemplatesPanel(); });
  });
}

function showImportScreen() {
  _sidebarActiveItem = 'area-import';
  renderAppSidebar();
  showScreen('area-import-screen');
  importSetStep('upload');
  renderImportTemplatesPanel();
  document.getElementById('import-step1-error').textContent = '';
  // Pre-fill saved API key hint
  const savedKey = localStorage.getItem(LS_API_KEY);
  const note = document.getElementById('import-key-saved-note');
  if (note) note.textContent = savedKey ? 'API key saved from previous import' : '';
  const keyInput = document.getElementById('import-api-key-input');
  if (keyInput && savedKey) keyInput.value = savedKey;
}

document.getElementById('btn-area-import-csv')?.addEventListener('click', showImportScreen);
document.getElementById('btn-import-back')?.addEventListener('click', () => {
  _sidebarActiveItem = null;
  renderAppSidebar();
  showScreen('area-setup-screen');
});

// Show/hide API key
document.getElementById('import-key-toggle')?.addEventListener('click', () => {
  const inp = document.getElementById('import-api-key-input');
  const btn = document.getElementById('import-key-toggle');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? 'show' : 'hide';
});

// ── Path 1: built-in local detection ──
document.getElementById('import-detect-btn')?.addEventListener('click', async () => {
  const fileInput = document.getElementById('import-csv-file-input');
  const errEl = document.getElementById('import-step1-error');
  if (errEl) errEl.textContent = '';

  const file = fileInput?.files?.[0];
  if (!file) { if (errEl) errEl.textContent = 'Please select a CSV file.'; return; }

  _csvImportIxName = document.getElementById('import-ix-name-input')?.value?.trim() || '';

  const text = await file.text();
  const { headers, rows } = parseCSV(text);
  _csvImportHeaders = headers;
  _csvImportRows = rows;

  const tpl = findMatchingTemplate(headers);
  if (tpl) {
    _csvImportMapping = tpl.mapping;
    renderImportPreview(tpl.mapping, headers, rows, `template: ${tpl.name}`);
    importSetStep('preview');
    return;
  }

  const local = detectColumnsLocally(headers, rows);
  if (local && local._localMatched >= MIN_MOVEMENTS_TO_ACCEPT) {
    _csvImportMapping = local;
    renderImportPreview(local, headers, rows, 'auto-detected');
    importSetStep('preview');
  } else {
    // Show fallback panel
    importSetStep('fallback');
    const matched = local?._localMatched ?? 0;
    const msgEl = document.getElementById('import-fallback-msg');
    if (msgEl) {
      msgEl.textContent = local
        ? `Auto-detection matched ${matched} of 12 movement columns — not enough to import reliably.`
        : 'Could not find a time column in this file. The format may use non-standard headers.';
    }
    document.getElementById('import-step-ai-error').textContent = '';
  }
});

// ── Path 2: Claude AI fallback ──
document.getElementById('import-analyze-btn')?.addEventListener('click', async () => {
  const keyInput = document.getElementById('import-api-key-input');
  const errEl = document.getElementById('import-step-ai-error');
  if (errEl) errEl.textContent = '';

  const apiKey = keyInput?.value?.trim();
  if (!apiKey) { if (errEl) errEl.textContent = 'Please enter your Anthropic API key.'; return; }

  try { localStorage.setItem(LS_API_KEY, apiKey); } catch (_) {}

  importSetStep('loading');
  try {
    _csvImportMapping = await mapColumnsWithClaude(_csvImportHeaders, _csvImportRows, apiKey);
    saveLearnedMappings(_csvImportMapping);
    renderImportPreview(_csvImportMapping, _csvImportHeaders, _csvImportRows, 'Claude AI');
    importSetStep('preview');
  } catch (err) {
    importSetStep('fallback');
    if (errEl) errEl.textContent = `Claude error: ${err.message}`;
  }
});

function renderImportPreview(mapping, headers, rows, source) {
  const MOVE_CODES = ['NBL','NBT','NBR','SBL','SBT','SBR','EBL','EBT','EBR','WBL','WBT','WBR'];
  const found = MOVE_CODES.filter(c => mapping.movements?.[c]);

  const srcEl = document.getElementById('import-mapping-source');
  if (srcEl) srcEl.textContent = source ? `via ${source}` : '';

  const mappingEl = document.getElementById('import-mapping-table');
  if (mappingEl) {
    const tableRows = [
      ['Time column', mapping.time_column || '—', mapping.time_column ? 'found' : 'null'],
      ['Interval', `${mapping.interval_minutes || 15} min`, 'found'],
      ['Start time', mapping.start_time || '—', mapping.start_time ? 'found' : 'null'],
      ['Period name', mapping.period_name || '—', mapping.period_name ? 'found' : 'null'],
      ...MOVE_CODES.map(c => [c, mapping.movements?.[c] || '—', mapping.movements?.[c] ? 'found' : 'null']),
    ];
    mappingEl.innerHTML = `<table class="import-mapping-table">
      <thead><tr><th>Field</th><th>Mapped to column</th></tr></thead>
      <tbody>${tableRows.map(([f, v, cls]) =>
        `<tr><td>${f}</td><td class="import-mapping-${cls}">${v}</td></tr>`
      ).join('')}</tbody>
    </table>`;
  }

  const previewEl = document.getElementById('import-data-preview');
  if (previewEl && found.length) {
    const timeIdx = headers.findIndex(h => h === mapping.time_column);
    previewEl.innerHTML = `<table class="import-preview-table">
      <thead><tr><th>Time</th>${found.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, 8).map(row => {
        const time = timeIdx >= 0 ? (row[timeIdx] || '') : '';
        const cells = found.map(c => {
          const idx = headers.findIndex(h => h === mapping.movements?.[c]);
          return `<td>${idx >= 0 ? (row[idx] || '0') : '—'}</td>`;
        }).join('');
        return `<tr><td>${time}</td>${cells}</tr>`;
      }).join('')}</tbody>
    </table>`;
  } else if (previewEl) {
    previewEl.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">No movement columns detected. Check the mapping above.</div>';
  }
}

document.getElementById('import-retry-btn')?.addEventListener('click', () => {
  importSetStep('upload');
  document.getElementById('import-step1-error').textContent = '';
});

document.getElementById('import-save-template-btn')?.addEventListener('click', () => {
  const nameEl = document.getElementById('import-template-name');
  const msgEl = document.getElementById('import-template-save-msg');
  const name = nameEl?.value?.trim();
  if (!name) { if (msgEl) msgEl.textContent = 'Enter a name first.'; return; }
  if (!_csvImportMapping || !_csvImportHeaders) { if (msgEl) msgEl.textContent = 'No mapping to save.'; return; }
  saveImportTemplate(name, _csvImportMapping, _csvImportHeaders);
  if (msgEl) msgEl.textContent = `Saved "${name}" ✓`;
  if (nameEl) nameEl.value = '';
  setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
});

document.getElementById('import-confirm-btn')?.addEventListener('click', () => {
  const errEl = document.getElementById('import-step3-error');
  if (errEl) errEl.textContent = '';
  try {
    const snapshot = buildSnapshotFromMapping(_csvImportMapping, _csvImportHeaders, _csvImportRows);
    const name = _csvImportIxName || _csvImportMapping.period_name || `Intersection ${areaIntersections.length + 1}`;
    areaIntersections.push({ name, snapshot, street1: '', street2: '', corridor: '', counterName: '', lat: '', lng: '' });
    activeIntersectionIdx = areaIntersections.length - 1;
    serializeCurrentProject();
    autosave();
    renderSidebarArea();
    _sidebarActiveItem = null;
    showScreen('area-setup-screen');
    renderAreaIntersectionsList();
  } catch (err) {
    if (errEl) errEl.textContent = `Import failed: ${err.message}`;
  }
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
    let sheets, loadFn;
    try {
      sheets = parseDotTmcXlsx(buf);
      loadFn = loadTmcSheet;
    } catch (_tmcErr) {
      sheets = parseRawCountXlsx(buf);
      loadFn = loadRawCountSheet;
    }
    errEl.textContent = '';
    if (sheets.length === 1) {
      loadFn(sheets[0]);
    } else {
      renderRawCountSheetPicker(sheets, loadFn);
    }
  } catch (err) {
    errEl.textContent = `Could not import: ${err.message}`;
    console.error(err);
  }
  e.target.value = '';
});

function renderRawCountSheetPicker(sheets, loadFn = loadRawCountSheet) {
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
      loadFn(sheet);
    });
  });
  document.getElementById('btn-dismiss-sheet-picker')?.addEventListener('click', () => {
    banner.style.display = 'none';
    banner.innerHTML = '';
  });
}

function tmcSheetToSnapshot(sheet) {
  const { meta, periods: parsedPeriods } = sheet;
  const locName = [meta.locationNS, meta.locationEW].filter(Boolean).join(' & ') || sheet.sheetName;
  const newIntersection = buildTmcIntersectionFromMeta(meta);
  const hasBike = parsedPeriods.some(p => p.hasBike);
  const tmcPairs = [{ label: 'Motor', def: '', key: 'a', isBike: false }];
  if (hasBike) tmcPairs.push({ label: 'Bike', def: '', key: 'b', isBike: true });
  return {
    version: 2, projectType: 'intersection', mode: 'turning',
    vPairs: [{ label: 'Vehicles', inKey: 'a', outKey: 'z', icon: null }],
    tmcPairs,
    intersection: newIntersection,
    fnames: { vehicle: locName, ped: locName, tmc: locName },
    activePeriodIdx: 0,
    periods: parsedPeriods.map(p => ({
      name: p.name, cfg: p.data.cfg,
      vData: p.data.vData,
      pedData: p.data.pedData,
      tmcData: p.data.tmcData,
      vManual: { in: [], out: [] },
      pedManual: p.data.pedManual.map(() => []),
      tmManual: {},
    })),
  };
}

function loadTmcSheet(sheet) {
  if (!sheet.periods || !sheet.periods.length) return;
  const locName = [sheet.meta.locationNS, sheet.meta.locationEW].filter(Boolean).join(' & ') || sheet.sheetName;
  const snapshot = tmcSheetToSnapshot(sheet);

  if (projectType === 'area') {
    const onHub = document.getElementById('area-setup-screen')?.style.display !== 'none';
    if (!onHub && areaIntersections.length > 0) {
      try { areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot(); } catch (_) {}
    }
    const existing = areaIntersections.find(ix => ix.name === locName);
    if (existing) {
      const newPeriods = snapshot.periods.filter(
        np => !existing.snapshot.periods.some(ep => ep.name === np.name)
      );
      existing.snapshot.periods.push(...newPeriods);
      renderAreaIntersectionsList();
      return;
    }
    const _streets = extractStreets({ name: locName, snapshot });
    areaIntersections.push({ name: locName, snapshot, street1: _streets.street1, street2: _streets.street2, corridor: '', counterName: '', lat: '', lng: '' });
    activeIntersectionIdx = areaIntersections.length - 1;
    if (document.getElementById('area-setup-screen')?.style.display !== 'none') {
      renderAreaIntersectionsList();
    } else {
      resetUndoStacks(); updateUndoUI();
      loadIntersectionIntoView(snapshot);
      window.scheduleAutosave();
    }
  } else {
    areaIntersections.length = 0;
    activeIntersectionIdx = 0;
    const _streets = extractStreets({ name: locName, snapshot });
    areaIntersections.push({ name: locName, snapshot, street1: _streets.street1, street2: _streets.street2, corridor: '', counterName: '', lat: '', lng: '' });
    projectType = 'area';
    if (projectInfo.projectName === '') projectInfo.projectName = locName;
    // Navigate directly to data; user can reach project info via "Project info" in the sidebar
    enterWorkspace();
    setSidebarMeta(projectInfo.projectName, '');
    renderAppSidebar();
    resetUndoStacks(); updateUndoUI();
    loadIntersectionIntoView(snapshot);
    window.scheduleAutosave();
  }
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
    const _streets840 = extractStreets({ name: locName, snapshot });
    areaIntersections.push({ name: locName, snapshot, street1: _streets840.street1, street2: _streets840.street2, corridor: '', counterName: '', lat: '', lng: '' });
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
    const _streets854 = extractStreets({ name: locName, snapshot });
    areaIntersections.push({ name: locName, snapshot, street1: _streets854.street1, street2: _streets854.street2, corridor: '', counterName: '', lat: '', lng: '' });
    projectType = 'area';
    if (projectInfo.projectName === '') projectInfo.projectName = locName;
    enterWorkspace();
    setSidebarMeta(projectInfo.projectName, '');
    renderAppSidebar();
    resetUndoStacks(); updateUndoUI();
    loadIntersectionIntoView(snapshot);
    window.scheduleAutosave();
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
  addToRecents(proj);
  downloadJSON(proj, `${fnames.vehicle || 'traffic'}.tcproject`);
};

// ═══════════════════════════════════════════
// MULTI-PERIOD UI
// ═══════════════════════════════════════════
function startInlinePeriodRename(bar, tabEl, periodIdx) {
  const p = periods[periodIdx];
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = p.name;
  inp.className = 'period-tab-rename-input';
  inp.style.cssText = 'font-size:11px;font-family:var(--mono);font-weight:500;padding:2px 8px;border-radius:20px;border:.5px solid var(--amber,#ffb400);outline:none;background:var(--surface2);color:var(--text);width:100px;';
  tabEl.replaceWith(inp);
  inp.select();
  const commit = () => {
    const name = inp.value.trim() || p.name;
    periods[periodIdx].name = name;
    window.scheduleAutosave();
    buildPeriodTabs();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { buildPeriodTabs(); } });
  inp.addEventListener('blur', commit);
}

function showInlineAddPeriod(bar, addBtn) {
  const defaultName = `Period ${periods.length + 1}`;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = defaultName;
  inp.className = 'period-tab-rename-input';
  inp.style.cssText = 'font-size:11px;font-family:var(--mono);font-weight:500;padding:2px 8px;border-radius:20px;border:.5px solid var(--amber,#ffb400);outline:none;background:var(--surface2);color:var(--text);width:100px;';
  addBtn.replaceWith(inp);
  inp.focus();
  const commit = () => {
    const name = inp.value.trim() || defaultName;
    addPeriod(name);
  };
  const cancel = () => buildPeriodTabs();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') cancel(); });
  inp.addEventListener('blur', () => { if (inp.value.trim()) commit(); else cancel(); });
}

function buildPeriodTabs() {
  const bar = document.getElementById('period-tabs-bar');
  if (!bar) return;
  bar.innerHTML = '';
  periods.forEach((p, i) => {
    const tab = document.createElement('button');
    tab.className = 'period-tab' + (i === activePeriodIdx ? ' active' : '');
    tab.textContent = p.name;
    const pCfg = p.data?.cfg;
    const fmtM = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const timeRange = pCfg?.startMinutes != null
      ? `${fmtM(pCfg.startMinutes)}–${fmtM(pCfg.startMinutes + pCfg.durationMin)}`
      : '';
    tab.title = timeRange
      ? `${p.name}: ${timeRange} · double-click to rename`
      : `Switch to ${p.name} · double-click to rename`;
    tab.addEventListener('click', () => switchPeriod(i));
    tab.addEventListener('dblclick', e => { e.stopPropagation(); startInlinePeriodRename(bar, tab, i); });
    bar.appendChild(tab);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'period-tab period-tab-add';
  addBtn.textContent = '+ period';
  addBtn.title = 'Add a new time period';
  addBtn.addEventListener('click', () => showInlineAddPeriod(bar, addBtn));
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

  buildPeriodMetaBar();
}

function buildPeriodMetaBar() {
  const bar = document.getElementById('period-meta-bar');
  if (!bar) return;
  bar.innerHTML = '';
  const mk = (tag, props) => Object.assign(document.createElement(tag), props);
  const lbl = txt => bar.appendChild(mk('span', { className: 'period-meta-label', textContent: txt }));

  lbl('date:');
  const dateEl = mk('input', { type: 'date', className: 'period-meta-input', value: periodMeta.date || '' });
  dateEl.addEventListener('change', () => { periodMeta.date = dateEl.value; window.scheduleAutosave(); });
  bar.appendChild(dateEl);

  lbl('weather:');
  const wxEl = mk('select', { className: 'period-meta-input' });
  ['', 'Clear', 'Partly cloudy', 'Overcast', 'Rain', 'Snow'].forEach(w => {
    const o = mk('option', { value: w, textContent: w || '—' });
    if (w === periodMeta.weather) o.selected = true;
    wxEl.appendChild(o);
  });
  wxEl.addEventListener('change', () => { periodMeta.weather = wxEl.value; window.scheduleAutosave(); });
  bar.appendChild(wxEl);

  lbl('observer:');
  const obsEl = mk('input', { type: 'text', className: 'period-meta-input period-meta-wide', placeholder: 'name', value: periodMeta.observer || '' });
  obsEl.addEventListener('input', () => { periodMeta.observer = obsEl.value; window.scheduleAutosave(); });
  bar.appendChild(obsEl);

  lbl('equipment:');
  const eqEl = mk('input', { type: 'text', className: 'period-meta-input period-meta-wide', placeholder: 'e.g. manual, TDC', value: periodMeta.equipment || '' });
  eqEl.addEventListener('input', () => { periodMeta.equipment = eqEl.value; window.scheduleAutosave(); });
  bar.appendChild(eqEl);

  lbl('notes:');
  const notesEl = mk('input', { type: 'text', className: 'period-meta-input period-meta-notes', placeholder: 'optional', value: periodMeta.notes || '' });
  notesEl.addEventListener('input', () => { periodMeta.notes = notesEl.value; window.scheduleAutosave(); });
  bar.appendChild(notesEl);
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
const areaIntersections = []; // [{name, street1, street2, corridor, counterName, snapshot}]
let activeIntersectionIdx = 0;
// Summary table UI state — persists across re-renders
const sumState = { sortCol: null, sortDir: 1, filterCorr: '', selection: new Set(), view: 'summary' };

function extractStreets(ix) {
  // Return {street1, street2} from snapshot intersection data, falling back to parsing the name
  const intr = ix.snapshot?.intersection;
  const s1 = ix.street1 || intr?.street1 || ix.name.split(' & ')[0] || '';
  const s2 = ix.street2 || intr?.street2 || ix.name.split(' & ')[1] || '';
  return { street1: s1.trim(), street2: s2.trim() };
}

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
      meta: p.data.meta || {},
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
    const vRaw = p.vData.in.reduce((s, r) => s + r.reduce((a,b) => a+(b||0), 0), 0)
               + p.vData.out.reduce((s, r) => s + r.reduce((a,b) => a+(b||0), 0), 0);
    if (vRaw > 0) { total += vRaw; continue; }
    // TMC mode — derive motor volume (index 0) from tmcData
    for (const from of Object.values(p.tmcData||{}))
      for (const slots of Object.values(from))
        for (const slot of slots) total += slot?.[0] || 0;
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
  _sidebarActiveItem = 'area-summary';
  renderAppSidebar();
  renderSummaryContent();
  showScreen('summary-screen');
}

function renderSummaryContent() {
  const container = document.getElementById('summary-content');
  if (!container) return;

  if (!areaIntersections.length) {
    container.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px 0">No intersections loaded.</div>';
    return;
  }

  const allPeriodNames = [];
  for (const ix of areaIntersections) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
  }

  const allRows = areaIntersections.map((ix, i) => {
    const snap = ix.snapshot;
    if (!snap) return null;
    const { street1, street2 } = extractStreets(ix);
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
      if (!period.vData?.in) return null;
      const vRaw = period.vData.in.reduce((s, r) => s + r.reduce((a,b) => a+(b||0), 0), 0)
                 + period.vData.out.reduce((s, r) => s + r.reduce((a,b) => a+(b||0), 0), 0);
      if (vRaw > 0) return vRaw;
      // TMC mode — derive motor volume (index 0) from tmcData
      let t = 0;
      for (const from of Object.values(period.tmcData||{}))
        for (const slots of Object.values(from))
          for (const slot of slots) t += slot?.[0] || 0;
      return t || null;
    });
    return { ix, i, street1, street2, corridor: ix.corridor||'', totalPed, totalVeh, totalTmc, hasTmcData, pedByPeriod, vehByPeriod };
  }).filter(Boolean);

  // Unique corridors for filter
  const corridors = [...new Set(allRows.map(r => r.corridor).filter(Boolean))].sort();

  // Apply corridor filter
  let rows = sumState.filterCorr ? allRows.filter(r => r.corridor === sumState.filterCorr) : allRows;

  // Sort
  if (sumState.sortCol) {
    rows = [...rows].sort((a, b) => {
      let va, vb;
      if (sumState.sortCol === 'num')      { va = a.i; vb = b.i; }
      else if (sumState.sortCol === 'name')    { va = a.ix.name; vb = b.ix.name; }
      else if (sumState.sortCol === 'street1') { va = a.street1; vb = b.street1; }
      else if (sumState.sortCol === 'street2') { va = a.street2; vb = b.street2; }
      else if (sumState.sortCol === 'corridor'){ va = a.corridor; vb = b.corridor; }
      else if (sumState.sortCol === 'counter') { va = a.ix.counterName||''; vb = b.ix.counterName||''; }
      else if (sumState.sortCol === 'periods') { va = a.ix.snapshot?.periods?.length||0; vb = b.ix.snapshot?.periods?.length||0; }
      else if (sumState.sortCol === 'ped')     { va = a.totalPed; vb = b.totalPed; }
      else if (sumState.sortCol === 'veh')     { va = a.totalVeh; vb = b.totalVeh; }
      else if (sumState.sortCol === 'tmc')     { va = a.totalTmc; vb = b.totalTmc; }
      else if (sumState.sortCol.startsWith('ped-p')) { const pi = +sumState.sortCol.slice(5); va = a.pedByPeriod[pi]??-1; vb = b.pedByPeriod[pi]??-1; }
      else if (sumState.sortCol.startsWith('veh-p')) { const pi = +sumState.sortCol.slice(5); va = a.vehByPeriod[pi]??-1; vb = b.vehByPeriod[pi]??-1; }
      else { va = 0; vb = 0; }
      if (typeof va === 'string') return sumState.sortDir * va.localeCompare(vb);
      return sumState.sortDir * (va - vb);
    });
  }

  const hasTmcAny = rows.some(r => r.hasTmcData);
  const hasVehAny = rows.some(r => r.totalVeh > 0);
  const hasPedAny = rows.some(r => r.totalPed > 0);
  const multiPeriod = allPeriodNames.length > 1;

  function sortIcon(col) {
    if (sumState.sortCol !== col) return '<span class="sum-sort-icon">⇅</span>';
    return '<span class="sum-sort-icon sort-active">' + (sumState.sortDir > 0 ? '↑' : '↓') + '</span>';
  }
  function sTh(col, label, extra) {
    const active = sumState.sortCol === col ? ' sort-active' : '';
    return '<th class="sum-th sum-th-sort' + active + '" data-sort="' + col + '"' + (extra ? ' ' + extra : '') + '>' + label + sortIcon(col) + '</th>';
  }

  // View toggle — delegate early to specialised renderers
  if (sumState.view === 'alldata') {
    renderSummaryAllData(allRows, corridors);
    return;
  }
  if (sumState.view === 'corridor') {
    renderCorridorView(allRows, corridors);
    return;
  }

  // Filter bar
  const corrOptions = ['', ...corridors].map(c =>
    '<option value="' + c + '"' + (sumState.filterCorr === c ? ' selected' : '') + '>' + (c || 'All corridors') + '</option>'
  ).join('');
  const selCount = sumState.selection.size;
  const filterBar = '<div class="sum-filter-bar">'
    + '<div class="sum-view-toggle"><button class="sum-view-btn sum-view-btn-active" id="sum-view-summary">Summary</button><button class="sum-view-btn" id="sum-view-alldata">All Data</button>' + (corridors.length ? '<button class="sum-view-btn" id="sum-view-corridor">Corridor Chart</button>' : '') + '</div>'
    + '<label class="sum-filter-label">Corridor</label>'
    + '<select class="sum-filter-select" id="sum-corr-filter">' + corrOptions + '</select>'
    + '<button class="btn-sm" id="sum-select-all">Select all' + (selCount ? ' (' + selCount + ' selected)' : '') + '</button>'
    + (selCount ? '<button class="btn-sm btn-sm-ghost" id="sum-clear-sel">Clear</button>' : '')
    + '</div>';

  // Period headers
  const periodHeadersPed = multiPeriod && hasPedAny
    ? allPeriodNames.map((n, pi) => sTh('ped-p' + pi, n + '<br><span class="sum-th-sub">peds</span>')).join('')
    : '';
  const periodHeadersVeh = multiPeriod && hasVehAny
    ? allPeriodNames.map((n, pi) => sTh('veh-p' + pi, n + '<br><span class="sum-th-sub">vehs</span>')).join('')
    : '';

  const tdDash = '<span style="color:var(--text3)">—</span>';
  const tdDot  = '<span style="color:var(--text3)">·</span>';

  const rowsHtml = rows.map(r => {
    const checked = sumState.selection.has(r.i) ? ' checked' : '';
    const selCls = sumState.selection.has(r.i) ? ' sum-row-sel' : '';
    const corrCell = r.corridor ? '<span class="sum-corr-badge">' + r.corridor + '</span>' : tdDash;
    let cells = '<td class="sum-td sum-td-check"><input type="checkbox" class="sum-check"' + checked + ' data-idx="' + r.i + '"></td>'
      + '<td class="sum-td sum-td-num">' + (r.i + 1) + '</td>'
      + '<td class="sum-td sum-td-name">' + r.ix.name + '</td>'
      + '<td class="sum-td sum-td-meta">' + (r.street1 || tdDash) + '</td>'
      + '<td class="sum-td sum-td-meta">' + (r.street2 || tdDash) + '</td>'
      + '<td class="sum-td sum-td-meta">' + corrCell + '</td>'
      + '<td class="sum-td sum-td-meta">' + (r.ix.counterName || tdDash) + '</td>'
      + '<td class="sum-td sum-td-meta">' + (r.ix.snapshot?.periods?.length || 0) + '</td>';
    if (hasPedAny) {
      cells += '<td class="sum-td sum-td-num' + (r.totalPed > 0 ? ' sum-td-has-data' : '') + '">' + (r.totalPed > 0 ? r.totalPed.toLocaleString() : tdDash) + '</td>'
        + '<td class="sum-td" style="padding-left:0;width:80px"><div class="sum-mini-bar-wrap"><div class="sum-mini-bar" data-val="' + r.totalPed + '"></div></div></td>';
    }
    if (multiPeriod && hasPedAny) {
      cells += r.pedByPeriod.map(v => '<td class="sum-td sum-td-num">' + (v != null ? (v > 0 ? v.toLocaleString() : tdDash) : tdDot) + '</td>').join('');
    }
    if (hasVehAny) {
      cells += '<td class="sum-td sum-td-num' + (r.totalVeh > 0 ? ' sum-td-has-data' : '') + '">' + (r.totalVeh > 0 ? r.totalVeh.toLocaleString() : tdDash) + '</td>';
    }
    if (multiPeriod && hasVehAny) {
      cells += r.vehByPeriod.map(v => '<td class="sum-td sum-td-num">' + (v != null ? (v > 0 ? v.toLocaleString() : tdDash) : tdDot) + '</td>').join('');
    }
    if (hasTmcAny) {
      cells += '<td class="sum-td sum-td-num' + (r.totalTmc > 0 ? ' sum-td-has-data' : '') + '">' + (r.totalTmc > 0 ? r.totalTmc.toLocaleString() : tdDash) + '</td>';
    }
    cells += '<td class="sum-td"><button class="sum-review-btn" data-idx="' + r.i + '">review →</button></td>';
    return '<tr class="sum-row' + selCls + '" data-idx="' + r.i + '">' + cells + '</tr>';
  }).join('');

  // Tfoot totals (8 prefix cols: check + # + name + s1 + s2 + corr + counter + periods)
  const PREFIX_COLS = 8;
  const tfootHtml = rows.length > 1
    ? '<tfoot><tr class="sum-total-row">'
      + '<td class="sum-td"></td>'
      + '<td class="sum-td" colspan="' + (PREFIX_COLS - 1) + '" style="font-weight:600;font-size:12px">Total</td>'
      + (hasPedAny ? '<td class="sum-td sum-td-num sum-td-total">' + rows.reduce((a,r)=>a+r.totalPed,0).toLocaleString() + '</td><td class="sum-td"></td>' : '')
      + (multiPeriod && hasPedAny ? allPeriodNames.map((_,pi) => '<td class="sum-td sum-td-num sum-td-total">' + rows.reduce((a,r)=>a+(r.pedByPeriod[pi]||0),0).toLocaleString() + '</td>').join('') : '')
      + (hasVehAny ? '<td class="sum-td sum-td-num sum-td-total">' + rows.reduce((a,r)=>a+r.totalVeh,0).toLocaleString() + '</td>' : '')
      + (multiPeriod && hasVehAny ? allPeriodNames.map((_,pi) => '<td class="sum-td sum-td-num sum-td-total">' + rows.reduce((a,r)=>a+(r.vehByPeriod[pi]||0),0).toLocaleString() + '</td>').join('') : '')
      + (hasTmcAny ? '<td class="sum-td sum-td-num sum-td-total">' + rows.reduce((a,r)=>a+r.totalTmc,0).toLocaleString() + '</td>' : '')
      + '<td class="sum-td"></td></tr></tfoot>'
    : '';

  container.innerHTML = filterBar + '<div id="sum-sel-panel"></div><div style="overflow-x:auto"><table class="summary-table"><thead><tr>'
    + '<th class="sum-th sum-td-check"><input type="checkbox" id="sum-check-all"' + (rows.length && rows.every(r => sumState.selection.has(r.i)) ? ' checked' : '') + '></th>'
    + sTh('num', '#')
    + sTh('name', 'Intersection')
    + sTh('street1', 'Street 1')
    + sTh('street2', 'Street 2')
    + sTh('corridor', 'Corridor')
    + sTh('counter', 'Counter')
    + sTh('periods', 'Periods')
    + (hasPedAny ? sTh('ped', 'Pedestrians<br><span class="sum-th-sub">total</span>') + '<th class="sum-th"></th>' : '')
    + periodHeadersPed
    + (hasVehAny ? sTh('veh', 'Vehicles<br><span class="sum-th-sub">in+out</span>') : '')
    + periodHeadersVeh
    + (hasTmcAny ? sTh('tmc', 'TMC<br><span class="sum-th-sub">total</span>') : '')
    + '<th class="sum-th"></th>'
    + '</tr></thead><tbody>' + rowsHtml + '</tbody>' + tfootHtml + '</table></div>';

  // Mini bars
  const maxPedAll = Math.max(...rows.map(r => r.totalPed), 1);
  container.querySelectorAll('.sum-mini-bar').forEach(el => {
    el.style.width = Math.round((+el.dataset.val / maxPedAll) * 72) + 'px';
  });

  updateSelectionPanel(allRows, allPeriodNames, hasPedAny, hasVehAny, multiPeriod);

  // Event handlers
  container.querySelectorAll('.sum-review-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showIntersectionAnalysis(+btn.dataset.idx); });
  });
  container.querySelectorAll('tr.sum-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.sum-review-btn, .sum-check')) return;
      showIntersectionAnalysis(+row.dataset.idx);
    });
  });
  container.querySelectorAll('.sum-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = +cb.dataset.idx;
      if (cb.checked) sumState.selection.add(idx); else sumState.selection.delete(idx);
      renderSummaryContent();
    });
  });
  container.querySelectorAll('.sum-th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sumState.sortCol === col) sumState.sortDir *= -1;
      else { sumState.sortCol = col; sumState.sortDir = 1; }
      renderSummaryContent();
    });
  });
  document.getElementById('sum-check-all')?.addEventListener('change', e => {
    if (e.target.checked) rows.forEach(r => sumState.selection.add(r.i));
    else rows.forEach(r => sumState.selection.delete(r.i));
    renderSummaryContent();
  });
  document.getElementById('sum-select-all')?.addEventListener('click', () => {
    rows.forEach(r => sumState.selection.add(r.i));
    renderSummaryContent();
  });
  document.getElementById('sum-clear-sel')?.addEventListener('click', () => {
    sumState.selection.clear();
    renderSummaryContent();
  });
  document.getElementById('sum-corr-filter')?.addEventListener('change', e => {
    sumState.filterCorr = e.target.value;
    renderSummaryContent();
  });
  document.getElementById('sum-view-summary')?.addEventListener('click', () => { sumState.view = 'summary'; renderSummaryContent(); });
  document.getElementById('sum-view-alldata')?.addEventListener('click', () => { sumState.view = 'alldata'; renderSummaryContent(); });
  document.getElementById('sum-view-corridor')?.addEventListener('click', () => { sumState.view = 'corridor'; renderSummaryContent(); });
}

function renderCorridorView(allRows, corridors) {
  const container = document.getElementById('summary-content');
  if (!container) return;

  // Collect all period names
  const allPeriodNames = [];
  for (const { ix } of allRows) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
  }

  let selCorridor = sumState.filterCorr || corridors[0] || '';
  let selPeriod   = allPeriodNames[0] || '';

  function paint() {
    const ixRows = selCorridor
      ? allRows.filter(r => r.corridor === selCorridor)
      : allRows;

    const corrOptions = corridors.map(c =>
      `<option value="${c}"${c === selCorridor ? ' selected' : ''}>${c}</option>`).join('');
    const periodOptions = allPeriodNames.map(p =>
      `<option value="${p}"${p === selPeriod ? ' selected' : ''}>${p}</option>`).join('');

    container.innerHTML = `
    <div class="sum-filter-bar">
      <div class="sum-view-toggle">
        <button class="sum-view-btn" id="corr-back-summary">Summary</button>
        <button class="sum-view-btn" id="corr-back-alldata">All Data</button>
        <button class="sum-view-btn sum-view-btn-active" id="sum-view-corridor">Corridor Chart</button>
      </div>
      ${corridors.length > 1 ? `<label class="sum-filter-label">Corridor</label>
        <select class="sum-filter-select" id="corr-sel-corridor">${corrOptions}</select>` : ''}
      ${allPeriodNames.length > 1 ? `<label class="sum-filter-label">Period</label>
        <select class="sum-filter-select" id="corr-sel-period">${periodOptions}</select>` : ''}
    </div>
    <div id="corr-chart-root" style="margin-top:16px;overflow-x:auto"></div>`;

    renderCorridorChart(document.getElementById('corr-chart-root'), ixRows, selPeriod, idx => showIntersectionAnalysis(idx));

    document.getElementById('corr-back-summary')?.addEventListener('click', () => { sumState.view = 'summary'; renderSummaryContent(); });
    document.getElementById('corr-back-alldata')?.addEventListener('click', () => { sumState.view = 'alldata'; renderSummaryContent(); });
    document.getElementById('corr-sel-corridor')?.addEventListener('change', e => { selCorridor = e.target.value; paint(); });
    document.getElementById('corr-sel-period')?.addEventListener('change', e => { selPeriod = e.target.value; paint(); });
  }

  paint();
}

function updateSelectionPanel(allRows, allPeriodNames, hasPedAny, hasVehAny, multiPeriod) {
  const panel = document.getElementById('sum-sel-panel');
  if (!panel) return;
  const sel = allRows.filter(r => sumState.selection.has(r.i));
  if (!sel.length) { panel.innerHTML = ''; return; }

  const n = sel.length;
  const sumPedSel = sel.reduce((a, r) => a + r.totalPed, 0);
  const sumVehSel = sel.reduce((a, r) => a + r.totalVeh, 0);
  const avgPedSel = Math.round(sumPedSel / n);
  const avgVehSel = Math.round(sumVehSel / n);

  let periodRows = '';
  if (multiPeriod && (hasPedAny || hasVehAny)) {
    periodRows = '<div class="sum-sel-periods">'
      + allPeriodNames.map((pname, pi) => {
          const nc = sel.filter(r => r.pedByPeriod[pi] != null || r.vehByPeriod[pi] != null).length || 1;
          const pedSum = sel.reduce((a, r) => a + (r.pedByPeriod[pi] || 0), 0);
          const vehSum = sel.reduce((a, r) => a + (r.vehByPeriod[pi] || 0), 0);
          return '<div class="sum-sel-period-row"><span class="sum-sel-period-name">' + pname + '</span>'
            + (hasPedAny ? '<span class="sum-sel-stat">ped &Sigma;' + pedSum.toLocaleString() + ' / avg ' + Math.round(pedSum/nc).toLocaleString() + '</span>' : '')
            + (hasVehAny ? '<span class="sum-sel-stat">veh &Sigma;' + vehSum.toLocaleString() + ' / avg ' + Math.round(vehSum/nc).toLocaleString() + '</span>' : '')
            + '</div>';
        }).join('')
      + '</div>';
  }

  const corridorMap = {};
  for (const r of sel) {
    const corr = r.corridor || '(no corridor)';
    if (!corridorMap[corr]) corridorMap[corr] = [];
    corridorMap[corr].push(r);
  }
  const corridorKeys = Object.keys(corridorMap).sort();
  let corrRows = '';
  if (corridorKeys.length > 1) {
    corrRows = '<div class="sum-sel-corridors"><div class="sum-sel-sub-header">Corridor averages</div>'
      + corridorKeys.map(corr => {
          const crs = corridorMap[corr];
          const avgP = Math.round(crs.reduce((a, r) => a + r.totalPed, 0) / crs.length);
          const avgV = Math.round(crs.reduce((a, r) => a + r.totalVeh, 0) / crs.length);
          return '<div class="sum-sel-corr-row"><span class="sum-corr-badge">' + corr + '</span>'
            + '<span class="sum-sel-stat-sm">' + crs.length + ' ix</span>'
            + (hasPedAny ? '<span class="sum-sel-stat-sm">avg ped ' + avgP.toLocaleString() + '</span>' : '')
            + (hasVehAny ? '<span class="sum-sel-stat-sm">avg veh ' + avgV.toLocaleString() + '</span>' : '')
            + '</div>';
        }).join('')
      + '</div>';
  }

  panel.innerHTML = '<div class="sum-sel-panel">'
    + '<div class="sum-sel-header">'
    + '<span class="sum-sel-count">' + n + ' intersection' + (n !== 1 ? 's' : '') + ' selected</span>'
    + (hasPedAny ? '<span class="sum-sel-stat">Ped total <strong>' + sumPedSel.toLocaleString() + '</strong> &middot; avg <strong>' + avgPedSel.toLocaleString() + '</strong></span>' : '')
    + (hasVehAny ? '<span class="sum-sel-stat">Veh total <strong>' + sumVehSel.toLocaleString() + '</strong> &middot; avg <strong>' + avgVehSel.toLocaleString() + '</strong></span>' : '')
    + '</div>'
    + periodRows + corrRows
    + '</div>';
}

// ── Export builder ──────────────────────────────────────────────────────────

const exportState = {
  layout: 'alldata',   // 'summary' | 'alldata'
  fields: {
    name: true, street1: true, street2: true, corridor: true, counter: true, lat: true, lng: true,
    // alldata only
    period: true, start: true, end: true, intervalMin: true,
    pedTotal: true, pedByCw: true, vehTotal: true, tmcTotal: false,
    // summary only
    periods: false, pedByPeriod: true, vehByPeriod: true,
  },
};

async function exportProjectPackage() {
  const btn = document.getElementById('btn-ix-export-package');
  if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
  try {
    const zip = new JSZip();
    const safeBase = (projectInfo.projectName || 'project').replace(/[^a-z0-9]/gi, '-').toLowerCase();

    // Project JSON
    zip.file(`${safeBase}.tcproject.json`, JSON.stringify(serializeCurrentProject(), null, 2));

    // CSV
    const csvFiles = getCSVText();
    for (const { text, filename } of csvFiles) zip.file(filename, text);

    // XLSX
    const xlsx = getXLSXBlob();
    if (xlsx) {
      const buf = await xlsx.blob.arrayBuffer();
      zip.file(xlsx.filename, buf);
    }

    // Shareable HTML — build from active period data
    const pData = captureActivePeriod();
    const { vehParsed, pedParsed, tmcParsed } = parsedFromPeriod(pData);
    const bikeIdx = tmcPairs.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
    const motorIdx = tmcPairs.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
    const hasBikes = intersection.approaches.some(a => a.destinations.length) && bikeIdx.length > 0;
    const { html, filename: htmlFilename } = buildShareableHTML(
      { ...projectInfo, date: periodMeta.date || projectInfo.date, weather: periodMeta.weather || projectInfo.weather, counterName: periodMeta.observer || projectInfo.counterName, studyPurpose: periodMeta.notes || projectInfo.studyPurpose, equipment: periodMeta.equipment },
      intersection, vehParsed, pedParsed, tmcParsed, motorIdx, bikeIdx, hasBikes, pData.cfg?.intervalMin || 15
    );
    zip.file(htmlFilename, html);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeBase}-package.zip`; a.click();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Export project package (.zip)'; }
  }
}

function showExportScreen() {
  const sub = document.getElementById('export-subtitle');
  if (sub) sub.textContent = projectInfo.projectName || '';
  renderExportBuilder();
  showScreen('export-screen');
}

function renderExportBuilder() {
  const container = document.getElementById('export-builder-content');
  if (!container) return;

  if (projectType === 'intersection') {
    container.innerHTML = `
      <div class="setup-card" style="max-width:540px">
        <h3 style="margin:0 0 1.2rem;font-size:15px;font-weight:600">Download files</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn-primary" id="btn-ix-export-csv" style="text-align:left">.csv ↓ &nbsp; Count data (active period)</button>
          <button class="btn-primary" id="btn-ix-export-xlsx" style="text-align:left">.xlsx ↓ &nbsp; Count data (active period)</button>
          <button class="btn-primary" id="btn-ix-export-page" style="text-align:left">↓ HTML &nbsp; Shareable report page</button>
          <div style="border-top:1px solid var(--border);margin:4px 0"></div>
          <button class="btn-primary" id="btn-ix-export-package" style="text-align:left">⬇ Export project package (.zip)</button>
          <p style="margin:0;font-size:12px;color:var(--text3)">ZIP contains the CSV, Excel workbook, shareable HTML page, and a project JSON for re-import.</p>
        </div>
      </div>`;
    document.getElementById('btn-ix-export-csv')?.addEventListener('click', () => exportCSV());
    document.getElementById('btn-ix-export-xlsx')?.addEventListener('click', () => exportXLSX());
    document.getElementById('btn-ix-export-page')?.addEventListener('click', () => {
      exportShareablePage(
        { ...projectInfo, date: periodMeta.date || projectInfo.date, weather: periodMeta.weather || projectInfo.weather, counterName: periodMeta.observer || projectInfo.counterName, studyPurpose: periodMeta.notes || projectInfo.studyPurpose, equipment: periodMeta.equipment },
        intersection, ...(() => {
          const pData = captureActivePeriod();
          const { vehParsed, pedParsed, tmcParsed } = parsedFromPeriod(pData);
          const bikeIdx = tmcPairs.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
          const motorIdx = tmcPairs.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
          const hasBikes = intersection.approaches.some(a => a.destinations.length) && bikeIdx.length > 0;
          return [vehParsed, pedParsed, tmcParsed, motorIdx, bikeIdx, hasBikes, pData.cfg?.intervalMin || 15];
        })()
      );
    });
    document.getElementById('btn-ix-export-package')?.addEventListener('click', exportProjectPackage);
    return;
  }

  // Collect metadata about the data
  const allPeriodNames = [];
  const cwAssigns = [];
  for (const ix of areaIntersections) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
    for (const xw of (ix.snapshot?.intersection?.crosswalks || [])) {
      if (xw.assign && !cwAssigns.includes(xw.assign)) cwAssigns.push(xw.assign);
    }
  }
  if (!cwAssigns.length) cwAssigns.push('N', 'E', 'S', 'W');
  const multiPeriod = allPeriodNames.length > 1;
  const f = exportState.fields;

  function chk(key, label, disabled) {
    const checked = f[key] ? ' checked' : '';
    const dis = disabled ? ' disabled' : '';
    return '<label class="exp-field-check' + (disabled ? ' exp-field-disabled' : '') + '">'
      + '<input type="checkbox" data-field="' + key + '"' + checked + dis + '> ' + label + '</label>';
  }

  // Layout cards
  const layoutCards = '<div class="exp-section">'
    + '<div class="exp-section-title">Layout</div>'
    + '<div class="exp-layout-cards">'
    + '<button class="exp-layout-card' + (exportState.layout === 'summary' ? ' active' : '') + '" data-layout="summary">'
    + '<div class="exp-layout-name">Summary</div>'
    + '<div class="exp-layout-desc">One row per intersection — totals across all periods</div>'
    + '</button>'
    + '<button class="exp-layout-card' + (exportState.layout === 'alldata' ? ' active' : '') + '" data-layout="alldata">'
    + '<div class="exp-layout-name">All Data <span class="exp-layout-tag">GIS-ready</span></div>'
    + '<div class="exp-layout-desc">One row per intersection × period — long format, join to a point layer by name or counter</div>'
    + '</button>'
    + '</div></div>';

  // Location fields (shared by both layouts)
  const locationFields = '<div class="exp-field-group">'
    + '<div class="exp-field-group-label">Location</div>'
    + '<div class="exp-field-checks">'
    + chk('name', 'Intersection name') + chk('street1', 'Street 1') + chk('street2', 'Street 2')
    + chk('corridor', 'Corridor') + chk('counter', 'Counter name')
    + chk('lat', 'Latitude') + chk('lng', 'Longitude')
    + '</div></div>';

  // Period fields (alldata layout only)
  const periodFields = exportState.layout === 'alldata'
    ? '<div class="exp-field-group">'
      + '<div class="exp-field-group-label">Period</div>'
      + '<div class="exp-field-checks">'
      + chk('period', 'Period name') + chk('start', 'Start time') + chk('end', 'End time') + chk('intervalMin', 'Interval (min)')
      + '</div></div>'
    : '<div class="exp-field-group">'
      + '<div class="exp-field-group-label">Period</div>'
      + '<div class="exp-field-checks">'
      + chk('periods', 'Period count')
      + (multiPeriod ? chk('pedByPeriod', 'Ped by period') + chk('vehByPeriod', 'Veh by period') : '')
      + '</div></div>';

  // Count fields
  const cwLabel = 'Ped by crosswalk (' + cwAssigns.join('/') + ')';
  const countFields = '<div class="exp-field-group">'
    + '<div class="exp-field-group-label">Counts</div>'
    + '<div class="exp-field-checks">'
    + chk('pedTotal', 'Ped total')
    + (exportState.layout === 'alldata' ? chk('pedByCw', cwLabel) : '')
    + chk('vehTotal', 'Veh total')
    + chk('tmcTotal', 'TMC total')
    + '</div></div>';

  // Preview: first 3 header columns
  const previewHeaders = buildExportHeaders(allPeriodNames, cwAssigns);
  const previewHtml = '<div class="exp-section">'
    + '<div class="exp-section-title">Column preview</div>'
    + '<div class="exp-preview-wrap"><div class="exp-preview">'
    + previewHeaders.map(h => '<span class="exp-preview-col">' + h + '</span>').join('')
    + '</div></div></div>';

  container.innerHTML = layoutCards
    + '<div class="exp-section">'
    + '<div class="exp-section-title">Fields</div>'
    + locationFields + periodFields + countFields
    + '</div>'
    + previewHtml
    + '<div class="exp-section">'
    + '<button class="btn-primary exp-download-btn" id="btn-export-download">Download CSV ↓</button>'
    + '<span class="exp-row-count" id="exp-row-count"></span>'
    + '</div>';

  // Update row count
  updateExportRowCount();

  // Wire events
  container.querySelectorAll('.exp-layout-card').forEach(btn => {
    btn.addEventListener('click', () => {
      exportState.layout = btn.dataset.layout;
      renderExportBuilder();
    });
  });
  container.querySelectorAll('[data-field]').forEach(cb => {
    cb.addEventListener('change', () => {
      exportState.fields[cb.dataset.field] = cb.checked;
      renderExportBuilder();
    });
  });
  document.getElementById('btn-export-download')?.addEventListener('click', runExport);
}

function buildExportHeaders(allPeriodNames, cwAssigns) {
  const f = exportState.fields;
  const h = [];
  if (f.name)     h.push('intersection_name');
  if (f.street1)  h.push('street_1');
  if (f.street2)  h.push('street_2');
  if (f.corridor) h.push('corridor');
  if (f.counter)  h.push('counter_name');
  if (f.lat)      h.push('latitude');
  if (f.lng)      h.push('longitude');
  if (exportState.layout === 'alldata') {
    if (f.period)      h.push('period_name');
    if (f.start)       h.push('period_start');
    if (f.end)         h.push('period_end');
    if (f.intervalMin) h.push('interval_min');
    if (f.pedTotal)    h.push('ped_total');
    if (f.pedByCw)     cwAssigns.forEach(a => h.push('ped_' + a.toLowerCase()));
    if (f.vehTotal)    h.push('veh_total');
    if (f.tmcTotal)    h.push('tmc_total');
  } else {
    if (f.periods)    h.push('periods');
    if (f.pedTotal)   h.push('ped_total');
    if (f.pedByPeriod && allPeriodNames.length > 1) allPeriodNames.forEach(n => h.push('ped_' + n.toLowerCase().replace(/\s+/g,'_')));
    if (f.vehTotal)   h.push('veh_total');
    if (f.vehByPeriod && allPeriodNames.length > 1) allPeriodNames.forEach(n => h.push('veh_' + n.toLowerCase().replace(/\s+/g,'_')));
    if (f.tmcTotal)   h.push('tmc_total');
  }
  return h;
}

function updateExportRowCount() {
  const el = document.getElementById('exp-row-count');
  if (!el) return;
  let count = 0;
  for (const ix of areaIntersections) {
    if (!ix.snapshot) continue;
    if (exportState.layout === 'alldata') {
      count += (ix.snapshot.periods?.length || 0) || 1;
    } else {
      count += 1;
    }
  }
  el.textContent = count + ' row' + (count !== 1 ? 's' : '');
}

function runExport() {
  const allPeriodNames = [];
  const cwAssigns = [];
  for (const ix of areaIntersections) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
    for (const xw of (ix.snapshot?.intersection?.crosswalks || [])) {
      if (xw.assign && !cwAssigns.includes(xw.assign)) cwAssigns.push(xw.assign);
    }
  }
  if (!cwAssigns.length) cwAssigns.push('N', 'E', 'S', 'W');

  const f = exportState.fields;
  const headers = buildExportHeaders(allPeriodNames, cwAssigns);
  const csvRows = [headers.join(',')];

  function q(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }
  function toHHMM(m) {
    if (m == null) return '';
    return String(Math.floor(m / 60) % 24).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0');
  }

  for (const ix of areaIntersections) {
    const snap = ix.snapshot;
    if (!snap) continue;
    const { street1, street2 } = extractStreets(ix);
    const xws = snap.intersection?.crosswalks || cwAssigns.map(a => ({ assign: a }));

    const locationCells = () => {
      const c = [];
      if (f.name)     c.push(q(ix.name));
      if (f.street1)  c.push(q(street1));
      if (f.street2)  c.push(q(street2));
      if (f.corridor) c.push(q(ix.corridor || ''));
      if (f.counter)  c.push(q(ix.counterName || ''));
      if (f.lat)      c.push(q(ix.lat || ''));
      if (f.lng)      c.push(q(ix.lng || ''));
      return c;
    };

    if (exportState.layout === 'alldata') {
      const periods = snap.periods || [];
      const rows = periods.length ? periods : [null];
      for (const period of rows) {
        const cfg = period?.cfg || {};
        const startMin = cfg.startMinutes ?? null;
        const durMin = cfg.durationMin ?? null;
        const intMin = cfg.intervalMin ?? null;
        let pedTotal = 0;
        const pedByCw = cwAssigns.map(assign => {
          const xi = xws.findIndex(x => x.assign === assign);
          if (xi < 0 || !period) return '';
          let t = 0;
          for (const sl of (period.pedData?.[xi] || [])) t += (sl[0]||0) + (sl[1]||0);
          pedTotal += t;
          return t;
        });
        let vehTotal = 0;
        if (period?.vData?.in) {
          for (let s = 0; s < period.vData.in.length; s++) {
            vehTotal += (period.vData.in[s]||[]).reduce((a,b)=>a+(b||0),0);
            vehTotal += (period.vData.out[s]||[]).reduce((a,b)=>a+(b||0),0);
          }
        }
        let tmcTotal = 0;
        for (const leg of Object.values(period?.tmcData || {}))
          for (const mov of Object.values(leg))
            if (Array.isArray(mov)) for (const v of mov) tmcTotal += (v||0);

        const row = [...locationCells()];
        if (f.period)      row.push(q(period?.name || ''));
        if (f.start)       row.push(startMin != null ? toHHMM(startMin) : '');
        if (f.end)         row.push(startMin != null && durMin != null ? toHHMM(startMin + durMin) : '');
        if (f.intervalMin) row.push(intMin != null ? intMin : '');
        if (f.pedTotal)    row.push(pedTotal);
        if (f.pedByCw)     pedByCw.forEach(v => row.push(v));
        if (f.vehTotal)    row.push(vehTotal);
        if (f.tmcTotal)    row.push(tmcTotal);
        csvRows.push(row.join(','));
      }
    } else {
      // Summary layout — one row per intersection
      const totalPed = sumPed(snap);
      const totalVeh = sumVehicle(snap);
      const totalTmc = sumTmc(snap);
      const periodPeds = allPeriodNames.map(pname => {
        const p = snap.periods?.find(p => p.name === pname);
        if (!p) return '';
        let t = 0;
        for (const xw of p.pedData) for (const sl of xw) t += (sl[0]||0)+(sl[1]||0);
        return t;
      });
      const periodVehs = allPeriodNames.map(pname => {
        const p = snap.periods?.find(p => p.name === pname);
        if (!p || !p.vData?.in) return '';
        let t = 0;
        for (let s = 0; s < p.vData.in.length; s++) {
          t += (p.vData.in[s]||[]).reduce((a,b)=>a+(b||0),0);
          t += (p.vData.out[s]||[]).reduce((a,b)=>a+(b||0),0);
        }
        return t;
      });
      const row = [...locationCells()];
      if (f.periods)    row.push(snap.periods?.length || 0);
      if (f.pedTotal)   row.push(totalPed);
      if (f.pedByPeriod && allPeriodNames.length > 1) periodPeds.forEach(v => row.push(v));
      if (f.vehTotal)   row.push(totalVeh);
      if (f.vehByPeriod && allPeriodNames.length > 1) periodVehs.forEach(v => row.push(v));
      if (f.tmcTotal)   row.push(totalTmc);
      csvRows.push(row.join(','));
    }
  }

  const bom = '﻿';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = exportState.layout === 'alldata' ? '-gis-export' : '-summary';
  a.download = (projectInfo.projectName||'study').replace(/[^a-z0-9]/gi,'-') + suffix + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportSummaryCSV() {
  const allPeriodNames = [];
  for (const ix of areaIntersections) {
    for (const p of (ix.snapshot?.periods || [])) {
      if (!allPeriodNames.includes(p.name)) allPeriodNames.push(p.name);
    }
  }
  const headers = ['#', 'Intersection', 'Street 1', 'Street 2', 'Corridor', 'Counter', 'Periods',
    'Total Pedestrians', ...allPeriodNames.map(n => 'Peds – ' + n),
    'Total Vehicles', ...allPeriodNames.map(n => 'Vehs – ' + n)];
  const csvRows = [headers.join(',')];
  areaIntersections.forEach((ix, i) => {
    const snap = ix.snapshot;
    if (!snap) return;
    const { street1, street2 } = extractStreets(ix);
    const totalPed = sumPed(snap);
    const totalVeh = sumVehicle(snap);
    const periodPeds = allPeriodNames.map(pname => {
      const period = snap.periods?.find(p => p.name === pname);
      if (!period) return '';
      let t = 0;
      for (const xw of period.pedData) for (const sl of xw) t += (sl[0]||0)+(sl[1]||0);
      return t;
    });
    const periodVehs = allPeriodNames.map(pname => {
      const period = snap.periods?.find(p => p.name === pname);
      if (!period || !period.vData?.in) return '';
      let t = 0;
      for (let s = 0; s < period.vData.in.length; s++) {
        t += (period.vData.in[s]||[]).reduce((a,b)=>a+(b||0),0);
        t += (period.vData.out[s]||[]).reduce((a,b)=>a+(b||0),0);
      }
      return t;
    });
    csvRows.push([
      i+1,
      '"' + ix.name.replace(/"/g,'""') + '"',
      '"' + street1.replace(/"/g,'""') + '"',
      '"' + street2.replace(/"/g,'""') + '"',
      '"' + (ix.corridor||'').replace(/"/g,'""') + '"',
      '"' + (ix.counterName||'').replace(/"/g,'""') + '"',
      snap.periods?.length||0,
      totalPed, ...periodPeds,
      totalVeh, ...periodVehs
    ].join(','));
  });
  const bom = '﻿';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (projectInfo.projectName||'summary').replace(/[^a-z0-9]/gi,'-') + '-summary.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function renderSummaryAllData(allRows, corridors) {
  const container = document.getElementById('summary-content');
  if (!container) return;

  // Corridor filter options
  const corrOptions = ['', ...corridors].map(c =>
    '<option value="' + c + '"' + (sumState.filterCorr === c ? ' selected' : '') + '>' + (c || 'All corridors') + '</option>'
  ).join('');
  const filterBar = '<div class="sum-filter-bar">'
    + '<div class="sum-view-toggle"><button class="sum-view-btn" id="sum-view-summary">Summary</button><button class="sum-view-btn sum-view-btn-active" id="sum-view-alldata">All Data</button>' + (corridors.length ? '<button class="sum-view-btn" id="sum-view-corridor">Corridor Chart</button>' : '') + '</div>'
    + '<label class="sum-filter-label">Corridor</label>'
    + '<select class="sum-filter-select" id="sum-corr-filter">' + corrOptions + '</select>'
    + '</div>';

  const rows = sumState.filterCorr ? allRows.filter(r => r.corridor === sumState.filterCorr) : allRows;

  // Collect all crosswalk assignments across snapshots
  const cwAssigns = [];
  for (const r of rows) {
    const xws = r.ix.snapshot?.intersection?.crosswalks || [];
    for (const xw of xws) {
      if (xw.assign && !cwAssigns.includes(xw.assign)) cwAssigns.push(xw.assign);
    }
  }
  if (!cwAssigns.length) cwAssigns.push('N', 'E', 'S', 'W');

  const tdDash = '<span style="color:var(--text3)">—</span>';

  function toHHMM(m) {
    if (m == null) return '';
    const h = Math.floor(m / 60) % 24, mn = m % 60;
    return String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
  }

  let dataRows = '';
  let rowNum = 0;
  for (const r of rows) {
    const snap = r.ix.snapshot;
    const periods = snap?.periods || [];
    const lat = r.ix.lat || '';
    const lng = r.ix.lng || '';
    if (!periods.length) {
      rowNum++;
      dataRows += '<tr class="sum-row">'
        + '<td class="sum-td sum-td-num">' + rowNum + '</td>'
        + '<td class="sum-td sum-td-name">' + r.ix.name + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.street1 || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.street2 || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.corridor ? '<span class="sum-corr-badge">' + r.corridor + '</span>' : tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.ix.counterName || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (lat || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (lng || tdDash) + '</td>'
        + '<td class="sum-td" colspan="99">' + tdDash + '</td>'
        + '</tr>';
      continue;
    }
    for (const period of periods) {
      rowNum++;
      const cfg = period.cfg || {};
      const startMin = cfg.startMinutes ?? null;
      const durMin = cfg.durationMin ?? null;
      const intMin = cfg.intervalMin ?? null;

      // Ped total + per-crosswalk
      let pedTotal = 0;
      const xws = snap.intersection?.crosswalks || cwAssigns.map((a, i) => ({ assign: a, _idx: i }));
      const pedByCw = cwAssigns.map(assign => {
        const xi = xws.findIndex(x => x.assign === assign);
        if (xi < 0) return null;
        const cwSlots = period.pedData?.[xi] || [];
        let t = 0;
        for (const sl of cwSlots) t += (sl[0]||0) + (sl[1]||0);
        pedTotal += t;
        return t;
      });

      // Veh total
      let vehTotal = 0;
      if (period.vData?.in) {
        for (let s = 0; s < period.vData.in.length; s++) {
          vehTotal += (period.vData.in[s]||[]).reduce((a,b)=>a+(b||0),0);
          vehTotal += (period.vData.out[s]||[]).reduce((a,b)=>a+(b||0),0);
        }
      }

      // TMC total
      let tmcTotal = 0;
      for (const leg of Object.values(period.tmcData || {})) {
        for (const mov of Object.values(leg)) {
          if (Array.isArray(mov)) for (const v of mov) tmcTotal += (v||0);
        }
      }

      dataRows += '<tr class="sum-row">'
        + '<td class="sum-td sum-td-num">' + rowNum + '</td>'
        + '<td class="sum-td sum-td-name">' + r.ix.name + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.street1 || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.street2 || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.corridor ? '<span class="sum-corr-badge">' + r.corridor + '</span>' : tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (r.ix.counterName || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (lat || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (lng || tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + period.name + '</td>'
        + '<td class="sum-td sum-td-meta">' + (startMin != null ? toHHMM(startMin) : tdDash) + '</td>'
        + '<td class="sum-td sum-td-meta">' + (startMin != null && durMin != null ? toHHMM(startMin + durMin) : tdDash) + '</td>'
        + '<td class="sum-td sum-td-num">' + (intMin != null ? intMin : tdDash) + '</td>'
        + '<td class="sum-td sum-td-num' + (pedTotal > 0 ? ' sum-td-has-data' : '') + '">' + (pedTotal > 0 ? pedTotal.toLocaleString() : tdDash) + '</td>'
        + pedByCw.map(v => '<td class="sum-td sum-td-num">' + (v != null && v > 0 ? v : v === 0 ? '0' : tdDash) + '</td>').join('')
        + '<td class="sum-td sum-td-num' + (vehTotal > 0 ? ' sum-td-has-data' : '') + '">' + (vehTotal > 0 ? vehTotal.toLocaleString() : tdDash) + '</td>'
        + '<td class="sum-td sum-td-num' + (tmcTotal > 0 ? ' sum-td-has-data' : '') + '">' + (tmcTotal > 0 ? tmcTotal.toLocaleString() : tdDash) + '</td>'
        + '</tr>';
    }
  }

  const cwHeaders = cwAssigns.map(a => '<th class="sum-th">Ped ' + a + '</th>').join('');

  container.innerHTML = filterBar
    + '<div style="overflow-x:auto"><table class="summary-table"><thead><tr>'
    + '<th class="sum-th sum-td-num">#</th>'
    + '<th class="sum-th">Intersection</th>'
    + '<th class="sum-th">Street 1</th>'
    + '<th class="sum-th">Street 2</th>'
    + '<th class="sum-th">Corridor</th>'
    + '<th class="sum-th">Counter</th>'
    + '<th class="sum-th">Lat</th>'
    + '<th class="sum-th">Lng</th>'
    + '<th class="sum-th">Period</th>'
    + '<th class="sum-th">Start</th>'
    + '<th class="sum-th">End</th>'
    + '<th class="sum-th">Int (min)</th>'
    + '<th class="sum-th">Ped Total</th>'
    + cwHeaders
    + '<th class="sum-th">Veh Total</th>'
    + '<th class="sum-th">TMC Total</th>'
    + '</tr></thead><tbody>' + dataRows + '</tbody></table></div>';

  document.getElementById('sum-view-summary')?.addEventListener('click', () => { sumState.view = 'summary'; renderSummaryContent(); });
  document.getElementById('sum-view-alldata')?.addEventListener('click', () => { sumState.view = 'alldata'; renderSummaryContent(); });
  document.getElementById('sum-view-corridor')?.addEventListener('click', () => { sumState.view = 'corridor'; renderSummaryContent(); });
  document.getElementById('sum-corr-filter')?.addEventListener('change', e => { sumState.filterCorr = e.target.value; renderSummaryContent(); });
}

function exportGISCSV() {
  const rows = [];
  // Collect all crosswalk assignments
  const cwAssigns = [];
  for (const ix of areaIntersections) {
    const xws = ix.snapshot?.intersection?.crosswalks || [];
    for (const xw of xws) {
      if (xw.assign && !cwAssigns.includes(xw.assign)) cwAssigns.push(xw.assign);
    }
  }
  if (!cwAssigns.length) cwAssigns.push('N', 'E', 'S', 'W');

  function toHHMM(m) {
    if (m == null) return '';
    const h = Math.floor(m / 60) % 24, mn = m % 60;
    return String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
  }
  function q(s) { return '"' + String(s||'').replace(/"/g,'""') + '"'; }

  const headers = ['intersection_num','intersection_name','street_1','street_2','corridor','counter_name','latitude','longitude',
    'period_name','period_start','period_end','interval_min',
    'ped_total', ...cwAssigns.map(a => 'ped_' + a.toLowerCase()),
    'veh_total','tmc_total'];
  rows.push(headers.join(','));

  areaIntersections.forEach((ix, i) => {
    const snap = ix.snapshot;
    if (!snap) return;
    const { street1, street2 } = extractStreets(ix);
    const xws = snap.intersection?.crosswalks || cwAssigns.map((a, idx) => ({ assign: a, _idx: idx }));
    const periods = snap.periods || [];

    if (!periods.length) {
      rows.push([i+1, q(ix.name), q(street1), q(street2), q(ix.corridor||''), q(ix.counterName||''), q(ix.lat||''), q(ix.lng||''),
        '','','','','', ...cwAssigns.map(() => ''), '',''].join(','));
      return;
    }

    for (const period of periods) {
      const cfg = period.cfg || {};
      const startMin = cfg.startMinutes ?? null;
      const durMin = cfg.durationMin ?? null;
      const intMin = cfg.intervalMin ?? null;

      let pedTotal = 0;
      const pedByCw = cwAssigns.map(assign => {
        const xi = xws.findIndex(x => x.assign === assign);
        if (xi < 0) return '';
        const cwSlots = period.pedData?.[xi] || [];
        let t = 0;
        for (const sl of cwSlots) t += (sl[0]||0) + (sl[1]||0);
        pedTotal += t;
        return t;
      });

      let vehTotal = 0;
      if (period.vData?.in) {
        for (let s = 0; s < period.vData.in.length; s++) {
          vehTotal += (period.vData.in[s]||[]).reduce((a,b)=>a+(b||0),0);
          vehTotal += (period.vData.out[s]||[]).reduce((a,b)=>a+(b||0),0);
        }
      }

      let tmcTotal = 0;
      for (const leg of Object.values(period.tmcData || {})) {
        for (const mov of Object.values(leg)) {
          if (Array.isArray(mov)) for (const v of mov) tmcTotal += (v||0);
        }
      }

      rows.push([
        i+1, q(ix.name), q(street1), q(street2), q(ix.corridor||''), q(ix.counterName||''), q(ix.lat||''), q(ix.lng||''),
        q(period.name),
        startMin != null ? toHHMM(startMin) : '',
        startMin != null && durMin != null ? toHHMM(startMin + durMin) : '',
        intMin != null ? intMin : '',
        pedTotal, ...pedByCw,
        vehTotal, tmcTotal
      ].join(','));
    }
  });

  const bom = '﻿';
  const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (projectInfo.projectName||'study').replace(/[^a-z0-9]/gi,'-') + '-gis-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════
// STAGE 1 CHARTS  (TMD · Time-of-Day · Mode Split)
// ══════════════════════════════════════════════════════

/**
 * Convert snapshot period.tmcData → flat { NBL, NBT, NBR, SBL, … WBR }
 * summed over the peak-hour window (4 × intervalMin consecutive slots, max total).
 * Returns { flat, hasTmc, peakHrStart, windowSize }
 */
function snapshotTmcPeakHour(period) {
  const td = period.tmcData || {};
  const intervalMin = period.cfg?.intervalMin || 15;
  const slots = period.pedData?.[0]?.length || period.vData?.in?.length || 0;
  if (!slots) return { flat: {}, hasTmc: false };

  const slotTotals = Array.from({ length: slots }, (_, s) => {
    let t = 0;
    for (const toLegMap of Object.values(td)) {
      for (const slotsArr of Object.values(toLegMap)) {
        t += (slotsArr[s] || []).reduce((a, b) => a + (b || 0), 0);
      }
    }
    return t;
  });

  const windowSize = Math.max(1, Math.round(60 / intervalMin));
  let bestStart = 0, bestVol = -Infinity;
  let ws = slotTotals.slice(0, windowSize).reduce((a, b) => a + b, 0);
  bestVol = ws;
  for (let i = 1; i + windowSize <= slots; i++) {
    ws = ws - slotTotals[i - 1] + slotTotals[i + windowSize - 1];
    if (ws > bestVol) { bestVol = ws; bestStart = i; }
  }

  // NBL=N→E, NBT=N→S, NBR=N→W | SBL=S→W, SBT=S→N, SBR=S→E
  // EBL=E→S, EBT=E→W, EBR=E→N | WBL=W→N, WBT=W→E, WBR=W→S
  const MOVE_MAP = {
    N: { E: 'NBL', S: 'NBT', W: 'NBR' },
    S: { W: 'SBL', N: 'SBT', E: 'SBR' },
    E: { S: 'EBL', W: 'EBT', N: 'EBR' },
    W: { N: 'WBL', E: 'WBT', S: 'WBR' },
  };

  const flat = { NBL:0,NBT:0,NBR:0,SBL:0,SBT:0,SBR:0,EBL:0,EBT:0,EBR:0,WBL:0,WBT:0,WBR:0 };
  for (let si = bestStart; si < Math.min(bestStart + windowSize, slots); si++) {
    for (const [fromLeg, toLegMap] of Object.entries(td)) {
      const moves = MOVE_MAP[fromLeg];
      if (!moves) continue;
      for (const [toLeg, slotsArr] of Object.entries(toLegMap)) {
        const key = moves[toLeg];
        if (!key) continue;
        flat[key] += (slotsArr[si] || []).reduce((a, b) => a + (b || 0), 0);
      }
    }
  }

  return { flat, hasTmc: Object.values(flat).some(v => v > 0), peakHrStart: bestStart, windowSize };
}

/**
 * Classic TMC spider diagram. peakHourData = { NBL, NBT, … WBR }.
 * Renders an SVG into the element with containerId.
 */
function renderTMDiagram(peakHourData, containerId, options = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const d = peakHourData;
  const scaled = options.scaled === true;

  const nbTotal = (d.NBL||0)+(d.NBT||0)+(d.NBR||0);
  const sbTotal = (d.SBL||0)+(d.SBT||0)+(d.SBR||0);
  const ebTotal = (d.EBL||0)+(d.EBT||0)+(d.EBR||0);
  const wbTotal = (d.WBL||0)+(d.WBT||0)+(d.WBR||0);
  const grandTotal = nbTotal + sbTotal + ebTotal + wbTotal;
  const maxV = Math.max(1, ...Object.values(d).map(v => v||0));

  function sw(v) { return Math.max(1.5, Math.min(11, 1.5 + ((v||0) / maxV) * 9.5)); }

  const COL_L = 'var(--in-text)';
  const COL_T = 'var(--blue-text)';
  const COL_R = 'var(--out-text)';

  // Layout constants
  const W = 520, H = 520, cx = 260, cy = 260;
  const BH = 52;   // half-box: box from (208,208) to (312,312)
  const ARM = 108; // arm length from box edge to tip
  const ARMW = 58; // arm width
  const LO = 9;    // lane offset from arm centre

  // Box edges
  const NY = cy - BH, SY = cy + BH, EX = cx + BH, WX = cx - BH;
  // Arm tips
  const NT = NY - ARM, ST = SY + ARM, ET = EX + ARM, WT = WX - ARM;
  // Entry/exit x or y on each arm (at box edge)
  // NB entry (vehicles from N): east of centre on N arm → (cx+LO, NY)
  // NB exit  (vehicles leaving to N): west → (cx-LO, NY)
  const nEnt = [cx + LO, NY],  nExt = [cx - LO, NY];
  const sEnt = [cx - LO, SY],  sExt = [cx + LO, SY];
  const eEnt = [EX, cy - LO],  eExt = [EX, cy + LO];
  const wEnt = [WX, cy + LO],  wExt = [WX, cy - LO];

  // Cubic bezier: pull control points 48% toward intersection centre
  function bez(ax, ay, bx, by, pull = 0.48) {
    const c1x = +(ax + (cx - ax) * pull).toFixed(1);
    const c1y = +(ay + (cy - ay) * pull).toFixed(1);
    const c2x = +(bx + (cx - bx) * pull).toFixed(1);
    const c2y = +(by + (cy - by) * pull).toFixed(1);
    return { path: `M ${ax} ${ay} C ${c1x} ${c1y} ${c2x} ${c2y} ${bx} ${by}`, c1x, c1y, c2x, c2y };
  }

  // Mid-point of cubic bezier at t=0.5
  function bezMid(ax, ay, c1x, c1y, c2x, c2y, bx, by) {
    const t = 0.5, u = 0.5;
    return [
      u*u*u*ax + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*bx,
      u*u*u*ay + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*by,
    ];
  }

  function mov(ax, ay, bx, by, col, vol) {
    if (!vol) return '';
    const { path, c1x, c1y, c2x, c2y } = bez(ax, ay, bx, by);
    const [mx, my] = bezMid(ax, ay, c1x, c1y, c2x, c2y, bx, by);
    const strokeW = scaled ? sw(vol).toFixed(1) : '2.5';
    return `
      <path d="${path}" fill="none" stroke="${col}" stroke-width="${strokeW}" stroke-linecap="round" marker-end="url(#tmd-a)" opacity="0.82"/>
      <text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
        font-size="10" font-weight="700" fill="${col}"
        stroke="var(--surface)" stroke-width="2.5" paint-order="stroke">${vol}</text>`;
  }

  // Road arms
  const roads = [
    `<rect x="${cx-ARMW/2}" y="${NT}" width="${ARMW}" height="${NY-NT}" fill="var(--surface3)" stroke="var(--border)" stroke-width=".5"/>`,
    `<rect x="${cx-ARMW/2}" y="${SY}" width="${ARMW}" height="${ST-SY}" fill="var(--surface3)" stroke="var(--border)" stroke-width=".5"/>`,
    `<rect x="${EX}" y="${cy-ARMW/2}" width="${ET-EX}" height="${ARMW}" fill="var(--surface3)" stroke="var(--border)" stroke-width=".5"/>`,
    `<rect x="${WT}" y="${cy-ARMW/2}" width="${WX-WT}" height="${ARMW}" fill="var(--surface3)" stroke="var(--border)" stroke-width=".5"/>`,
  ].join('');

  const box = `<rect x="${WX}" y="${NY}" width="${BH*2}" height="${BH*2}" fill="var(--surface2)" stroke="var(--border)" stroke-width="1.5"/>`;

  const defs = `<defs>
    <marker id="tmd-a" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0 0 L8 3 L0 6 Z" fill="context-stroke"/>
    </marker>
  </defs>`;

  const moves = [
    mov(...nEnt, ...eExt, COL_L, d.NBL||0), // NBL: N→E
    mov(...nEnt, ...sExt, COL_T, d.NBT||0), // NBT: N→S
    mov(...nEnt, ...wExt, COL_R, d.NBR||0), // NBR: N→W
    mov(...sEnt, ...wExt, COL_L, d.SBL||0), // SBL: S→W
    mov(...sEnt, ...nExt, COL_T, d.SBT||0), // SBT: S→N
    mov(...sEnt, ...eExt, COL_R, d.SBR||0), // SBR: S→E
    mov(...eEnt, ...sExt, COL_L, d.EBL||0), // EBL: E→S
    mov(...eEnt, ...wExt, COL_T, d.EBT||0), // EBT: E→W
    mov(...eEnt, ...nExt, COL_R, d.EBR||0), // EBR: E→N
    mov(...wEnt, ...nExt, COL_L, d.WBL||0), // WBL: W→N
    mov(...wEnt, ...eExt, COL_T, d.WBT||0), // WBT: W→E
    mov(...wEnt, ...sExt, COL_R, d.WBR||0), // WBR: W→S
  ].join('');

  const approachTotals = [
    `<text x="${cx}" y="${NT-14}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text2)">${nbTotal}</text>`,
    `<text x="${cx}" y="${ST+20}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text2)">${sbTotal}</text>`,
    `<text x="${ET+18}" y="${cy+4}" text-anchor="start" font-size="12" font-weight="700" fill="var(--text2)">${ebTotal}</text>`,
    `<text x="${WT-18}" y="${cy+4}" text-anchor="end" font-size="12" font-weight="700" fill="var(--text2)">${wbTotal}</text>`,
  ].join('');

  const dirLabels = [
    `<text x="${cx}" y="${NT-30}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text)" font-family="var(--mono)">N</text>`,
    `<text x="${cx}" y="${ST+37}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text)" font-family="var(--mono)">S</text>`,
    `<text x="${ET+36}" y="${cy+5}" text-anchor="start" font-size="14" font-weight="800" fill="var(--text)" font-family="var(--mono)">E</text>`,
    `<text x="${WT-36}" y="${cy+5}" text-anchor="end" font-size="14" font-weight="800" fill="var(--text)" font-family="var(--mono)">W</text>`,
  ].join('');

  const centerLabel = grandTotal > 0 ? `
    <text x="${cx}" y="${cy-8}" text-anchor="middle" font-size="17" font-weight="800" fill="var(--blue-text)">${grandTotal}</text>
    <text x="${cx}" y="${cy+9}" text-anchor="middle" font-size="9" fill="var(--text3)">peak hr total</text>` : '';

  el.innerHTML = `
    <div class="tmd-wrap">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:520px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
        ${defs}${roads}${box}${moves}${approachTotals}${dirLabels}${centerLabel}
      </svg>
      <div class="tmd-legend">
        <span class="tmd-leg-item"><span class="tmd-swatch" style="background:var(--in-text)"></span>Left</span>
        <span class="tmd-leg-item"><span class="tmd-swatch" style="background:var(--blue-text)"></span>Through</span>
        <span class="tmd-leg-item"><span class="tmd-swatch" style="background:var(--out-text)"></span>Right</span>
        ${scaled ? '<span class="tmd-leg-hint">line weight ∝ volume</span>' : ''}
      </div>
    </div>`;
}

/**
 * Bar chart of volume by 15-min interval.
 * intervals: [{ time, vehicles, peds }]
 */
function renderTimeOfDayChart(intervals, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!intervals?.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:16px 0">No interval data.</div>';
    return;
  }

  const W = 900, H = 220, pL = 40, pB = 30, pT = 12, pR = 12;
  const iW = W - pL - pR, iH = H - pT - pB;
  const hasVeh = intervals.some(iv => (iv.vehicles||0) > 0);
  const hasPed = intervals.some(iv => (iv.peds||0) > 0);
  const maxV = Math.max(1, ...intervals.map(iv => Math.max(iv.vehicles||0, iv.peds||0)));
  const n = intervals.length;
  const grpGap = 2;
  const grpW = Math.max(2, iW / n - grpGap);
  const dual = hasVeh && hasPed;
  const barW = dual ? Math.max(1, (grpW - 1) / 2) : Math.max(2, grpW);

  const steps = 4;
  let grid = '';
  for (let i = 0; i <= steps; i++) {
    const y = pT + iH - (i / steps) * iH;
    const v = Math.round((i / steps) * maxV);
    grid += `<line class="chart-gridline" x1="${pL}" y1="${y.toFixed(1)}" x2="${W-pR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="chart-axis-label" x="${pL-5}" y="${(y+3).toFixed(1)}" text-anchor="end">${v}</text>`;
  }

  let bars = '';
  intervals.forEach((iv, i) => {
    const gx = pL + i * (grpW + grpGap);
    const vv = iv.vehicles||0, pv = iv.peds||0;
    if (dual) {
      const hv = (vv / maxV) * iH, hp = (pv / maxV) * iH;
      bars += `<rect class="chart-bar chart-bar-a" x="${gx.toFixed(1)}" y="${(pT+iH-hv).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0,hv).toFixed(1)}"><title>${iv.time}: ${vv} vehicles</title></rect>`;
      bars += `<rect class="chart-bar chart-bar-b" x="${(gx+barW+1).toFixed(1)}" y="${(pT+iH-hp).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0,hp).toFixed(1)}"><title>${iv.time}: ${pv} peds</title></rect>`;
    } else {
      const v = hasVeh ? vv : pv;
      const h = (v / maxV) * iH;
      bars += `<rect class="${hasVeh?'chart-bar chart-bar-a':'chart-bar chart-bar-b'}" x="${gx.toFixed(1)}" y="${(pT+iH-h).toFixed(1)}" width="${grpW.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}"><title>${iv.time}: ${v}</title></rect>`;
    }
  });

  const labelSkip = Math.max(1, Math.ceil(n / 14));
  let xLabels = '';
  intervals.forEach((iv, i) => {
    if (i % labelSkip !== 0) return;
    const x = pL + i * (grpW + grpGap) + grpW / 2;
    xLabels += `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${H-8}" text-anchor="middle">${iv.time}</text>`;
  });

  const legend = dual
    ? `<div class="legend"><span class="legend-item"><span class="legend-swatch" style="background:var(--chart-bar)"></span>Vehicles</span><span class="legend-item"><span class="legend-swatch" style="background:var(--chart-bar2)"></span>Pedestrians</span></div>`
    : hasVeh
      ? `<div class="legend"><span class="legend-item"><span class="legend-swatch" style="background:var(--chart-bar)"></span>Vehicles</span></div>`
      : `<div class="legend"><span class="legend-item"><span class="legend-swatch" style="background:var(--chart-bar2)"></span>Pedestrians</span></div>`;

  el.innerHTML = `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">${grid}${bars}${xLabels}</svg></div>${legend}`;
}

/**
 * Mode split proportional bar + percentage numbers.
 */
function renderModeSplit(vehicleTotal, pedTotal, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const total = (vehicleTotal||0) + (pedTotal||0);
  if (!total) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0">No data.</div>'; return; }
  const vPct = Math.round(((vehicleTotal||0) / total) * 100);
  const pPct = 100 - vPct;
  el.innerHTML = `
    <div class="mode-split-wrap">
      <div class="mode-split-nums">
        <div class="mode-split-item">
          <div class="mode-split-pct" style="color:var(--blue-text)">${vPct}%</div>
          <div class="mode-split-label">Vehicles</div>
          <div class="mode-split-count">${(vehicleTotal||0).toLocaleString()}</div>
        </div>
        <div class="mode-split-vsep"></div>
        <div class="mode-split-item">
          <div class="mode-split-pct" style="color:var(--in-text)">${pPct}%</div>
          <div class="mode-split-label">Pedestrians</div>
          <div class="mode-split-count">${(pedTotal||0).toLocaleString()}</div>
        </div>
      </div>
      <div class="mode-split-bar">
        ${vPct > 0 ? `<div class="mode-split-seg" style="width:${vPct}%;background:var(--blue-text)"></div>` : ''}
        ${pPct > 0 ? `<div class="mode-split-seg" style="width:${pPct}%;background:var(--in-border)"></div>` : ''}
      </div>
    </div>`;
}

// ── Intersection detail analysis ──
let ixAnalysisPeriodIdx = 0;
let ixAnalysisView = 'data'; // 'data' | 'charts'
let _tmdScaled = false;

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
  _sidebarActiveItem = `area-ix-${idx}`;
  renderAppSidebar();
  renderIxAnalysis(0);
  showScreen('ix-analysis-screen');
}

function renderIxAnalysis(periodIdx, view) {
  if (view !== undefined) ixAnalysisView = view;
  ixAnalysisPeriodIdx = periodIdx;
  const container = document.getElementById('ix-analysis-content');
  if (!container) return;
  const snap = areaIntersections[activeIntersectionIdx]?.snapshot
    || (projectType === 'intersection' ? serializeIntersectionSnapshot() : null);
  if (!snap?.periods?.length) {
    container.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">No period data available.</div>`;
    return;
  }

  const snPeriods = snap.periods;
  const period = snPeriods[periodIdx];
  const cfg = period.cfg;
  const intervalMin = cfg?.intervalMin || 15;
  const startMin = cfg?.startMinutes || 0;
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
    ? `<div class="ix-period-tabs">${snPeriods.map((p, pi) => {
        const pCfg = p.cfg;
        const tr = pCfg?.startMinutes != null
          ? `<span class="ixt-time">${toHHMM(pCfg.startMinutes)}–${toHHMM(pCfg.startMinutes + (pCfg.durationMin || 0))}</span>`
          : '';
        return `<button class="ix-period-tab${pi === periodIdx ? ' active' : ''}" data-pi="${pi}">${p.name}${tr}</button>`;
      }).join('')}</div>`
    : `<div class="ix-period-label">${period.name}</div>`;

  // View toggle (Data | Charts)
  const viewTabsHtml = `<div class="ix-view-tabs no-print">
    <button class="ix-view-tab${ixAnalysisView==='data'?' active':''}" data-view="data">Data</button>
    <button class="ix-view-tab${ixAnalysisView==='charts'?' active':''}" data-view="charts">Charts</button>
  </div>`;

  // ── CHARTS VIEW ────────────────────────────────────────
  if (ixAnalysisView === 'charts') {
    const tmcInfo = snapshotTmcPeakHour(period);
    const vTotalPerSlot = Array.from({ length: slots }, (_, s) => {
      const inArr = period.vData?.in?.[s] || [];
      const outArr = period.vData?.out?.[s] || [];
      return inArr.reduce((a, b) => a + (b||0), 0) + outArr.reduce((a, b) => a + (b||0), 0);
    });
    const chartIntervals = slotData.map((s, i) => ({
      time: toHHMM(s.time),
      vehicles: vTotalPerSlot[i] || 0,
      peds: s.total,
    }));
    const vPeriodTotal = vTotalPerSlot.reduce((a, b) => a + b, 0);
    const hasModeData = grandTotal > 0 || vPeriodTotal > 0;

    container.innerHTML = `
      ${tabsHtml}
      ${viewTabsHtml}
      ${tmcInfo.hasTmc ? `<div class="ix-card ix-card-full" style="margin-bottom:14px">
        <div class="ix-card-header">Turning Movement Diagram
          <span class="ix-card-hint">peak hour</span>
          <button class="ix-card-toggle no-print" id="tmd-scale-btn" title="Toggle scaled line weights">${_tmdScaled ? 'scaled ✓' : 'scaled'}</button>
        </div>
        <div id="ix-tmd-root"></div>
      </div>` : ''}
      <div class="ix-card ix-card-full" style="margin-bottom:14px">
        <div class="ix-card-header">Time-of-Day Volume
          <span class="ix-card-hint">15-min intervals</span>
        </div>
        <div id="ix-tod-root"></div>
      </div>
      ${hasModeData ? `<div class="ix-card ix-card-full">
        <div class="ix-card-header">Mode Split</div>
        <div id="ix-mode-root"></div>
      </div>` : ''}`;

    function wireViewTabs() {
      container.querySelectorAll('.ix-period-tab').forEach(btn =>
        btn.addEventListener('click', () => renderIxAnalysis(+btn.dataset.pi)));
      container.querySelectorAll('[data-pi]').forEach(el =>
        el.addEventListener('click', () => renderIxAnalysis(+el.dataset.pi)));
      container.querySelectorAll('.ix-view-tab').forEach(btn =>
        btn.addEventListener('click', () => renderIxAnalysis(ixAnalysisPeriodIdx, btn.dataset.view)));
    }
    wireViewTabs();

    if (tmcInfo.hasTmc) {
      renderTMDiagram(tmcInfo.flat, 'ix-tmd-root', { scaled: _tmdScaled });
      document.getElementById('tmd-scale-btn')?.addEventListener('click', () => {
        _tmdScaled = !_tmdScaled;
        renderTMDiagram(tmcInfo.flat, 'ix-tmd-root', { scaled: _tmdScaled });
        const btn = document.getElementById('tmd-scale-btn');
        if (btn) btn.textContent = _tmdScaled ? 'scaled ✓' : 'scaled';
      });
    }
    renderTimeOfDayChart(chartIntervals, 'ix-tod-root');
    if (hasModeData) renderModeSplit(vPeriodTotal, grandTotal, 'ix-mode-root');
    return;
  }
  // ── END CHARTS VIEW ─────────────────────────────────────

  // Charts (existing ped volume profile)
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
    ${viewTabsHtml}
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
  container.querySelectorAll('.ix-view-tab').forEach(btn =>
    btn.addEventListener('click', () => renderIxAnalysis(ixAnalysisPeriodIdx, btn.dataset.view)));
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
        meta: p.meta || { date:'', weather:'', observer:'', notes:'' },
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
  projectUUID = proj.uuid || crypto.randomUUID();
  if (proj.projectInfo) {
    Object.assign(projectInfo, proj.projectInfo);
    wireProjectInfoFields(); // re-sync all input values from restored state
  }
  if (proj.projectType === 'parking') {
    Object.assign(parkingProjectInfo, proj.parkingProjectInfo || {});
    parkingZones.length = 0;
    parkingZones.push(...(proj.zones || []));
    _pkZoneNextId = parkingZones.reduce((mx, z) => Math.max(mx, (parseInt(z.id) || 0) + 1), 1);
    Object.assign(parkingCfg, proj.cfg || {});
    Object.keys(parkingGrid).forEach(k => delete parkingGrid[k]);
    Object.assign(parkingGrid, proj.grid || {});
    parkingActiveSlot = 0;
    _parkingUndoStack.length = 0;
    projectType = 'parking';
    enterWorkspace();
    setSidebarMeta(parkingProjectInfo.projectName || 'Parking study', parkingProjectInfo.location || '');
    _sidebarActiveItem = 'pk-count';
    renderAppSidebar();
    showScreen('parking-counter-screen');
    renderParkingCounter();
    return;
  }
  if (proj.projectType === 'tripgen') {
    Object.assign(tripgenSiteInfo, proj.siteInfo || {});
    Object.assign(tripgenCategoryMap, proj.categoryMap || {});
    if (proj.peakWindows) Object.assign(tripgenPeakWindows, proj.peakWindows);
    Object.assign(tripgenQaqc, proj.qaqc || {});
    tripgenEntries.length = 0;
    tripgenEntries.push(...(proj.entries || []));
    tripgenDistribution = JSON.parse(JSON.stringify(proj.distribution || []));
    tripgenDistNextId = tripgenDistribution.reduce((mx, ix) => Math.max(mx, ix.id + 1), 1);
    if (proj.qaqcReviewerName) { const el = document.getElementById('qaqc-reviewer-name'); if (el) el.value = proj.qaqcReviewerName; }
    if (proj.qaqcReviewDate) { const el = document.getElementById('qaqc-review-date'); if (el) el.value = proj.qaqcReviewDate; }
    projectType = 'tripgen';
    enterWorkspace();
    setSidebarMeta(proj.projectInfo?.projectName || 'Trip generation', proj.siteInfo?.location || '');
    _sidebarActiveItem = 'tg-setup';
    renderAppSidebar();
    showScreen('tripgen-setup-screen');
    wireSiteInfoFields();
    renderTripgenLocationsList();
    return;
  }
  if (proj.projectType === 'area') {
    areaIntersections.length = 0;
    areaIntersections.push(...(proj.intersections || []).map(ix => ({ name: ix.name, snapshot: ix.snapshot, street1: ix.street1 || '', street2: ix.street2 || '', corridor: ix.corridor || '', counterName: ix.counterName || '', lat: ix.lat || '', lng: ix.lng || '' })));
    activeIntersectionIdx = Math.min(proj.activeIntersectionIdx ?? 0, Math.max(0, areaIntersections.length - 1));
    projectType = 'area';
    enterWorkspace();
    setSidebarMeta(proj.projectInfo?.projectName || 'Area study', '');
    _sidebarActiveItem = null;
    renderAppSidebar();
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
          meta: p.meta || { date:'', weather:'', observer:'', notes:'' },
          vData: JSON.parse(JSON.stringify(p.vData)),
          pedData: JSON.parse(JSON.stringify(p.pedData)),
          tmcData: JSON.parse(JSON.stringify(p.tmcData || {})),
          vManual: arraysToSets(p.vManual || { in: [], out: [] }),
          pedManual: arraysToSets(p.pedManual || []),
          tmManual: arraysToSets(p.tmManual || {}),
        },
      });
    });
    const idx = periods.length > 0 ? Math.min(proj.activePeriodIdx ?? 0, periods.length - 1) : -1;
    if (idx >= 0) {
      setActivePeriodIdx(idx);
      restoreActivePeriod(periods[idx].data);
    } else {
      setActivePeriodIdx(0);
    }
    // Restore planned periods (informational after counting has started)
    plannedPeriods.length = 0;
    if (Array.isArray(proj.plannedPeriods)) plannedPeriods.push(...proj.plannedPeriods);
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
  enterWorkspace();
  setSidebarMeta(proj.projectInfo?.projectName || 'Intersection count', '');
  _sidebarActiveItem = 'count';
  renderAppSidebar();
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
// LS_KEY moved to top of file — see const declaration near imports

function serializeCurrentProject() {
  if (projectType === 'area') {
    areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot();
    return {
      version: 2, projectType: 'area', savedAt: new Date().toISOString(), uuid: projectUUID,
      projectInfo: { ...projectInfo },
      activeIntersectionIdx,
      intersections: areaIntersections.map(ix => ({ name: ix.name, snapshot: ix.snapshot, street1: ix.street1 || '', street2: ix.street2 || '', corridor: ix.corridor || '', counterName: ix.counterName || '', lat: ix.lat || '', lng: ix.lng || '' })),
    };
  }
  if (projectType === 'intersection') {
    // Snapshot active period before serializing
    if (periods.length > 0) periods[activePeriodIdx].data = captureActivePeriod();
    return {
      version: 2, projectType: 'intersection', savedAt: new Date().toISOString(), uuid: projectUUID,
      projectInfo: { ...projectInfo },
      mode,
      enabledModes: { ...enabledModes },
      vPairs: JSON.parse(JSON.stringify(vPairs)),
      tmcPairs: JSON.parse(JSON.stringify(tmcPairs)),
      intersection: JSON.parse(JSON.stringify(intersection)),
      fnames: { ...fnames },
      activePeriodIdx,
      plannedPeriods: plannedPeriods.map(p => ({ ...p })),
      periods: periods.map(p => ({
        name: p.name,
        cfg: p.data.cfg,
        meta: p.data.meta || {},
        vData: JSON.parse(JSON.stringify(p.data.vData)),
        pedData: JSON.parse(JSON.stringify(p.data.pedData)),
        tmcData: JSON.parse(JSON.stringify(p.data.tmcData)),
        vManual: setsToArrays(p.data.vManual),
        pedManual: setsToArrays(p.data.pedManual),
        tmManual: setsToArrays(p.data.tmManual),
      })),
    };
  }
  if (projectType === 'parking') {
    return {
      version: 1, projectType: 'parking', savedAt: new Date().toISOString(), uuid: projectUUID,
      parkingProjectInfo: { ...parkingProjectInfo },
      zones: JSON.parse(JSON.stringify(parkingZones)),
      cfg: { ...parkingCfg },
      grid: JSON.parse(JSON.stringify(parkingGrid)),
    };
  }
  if (projectType === 'tripgen') {
    return {
      version: 1, projectType: 'tripgen', savedAt: new Date().toISOString(), uuid: projectUUID,
      projectInfo: { ...projectInfo },
      siteInfo: { ...tripgenSiteInfo }, categoryMap: { ...tripgenCategoryMap },
      peakWindows: JSON.parse(JSON.stringify(tripgenPeakWindows)),
      qaqc: { ...tripgenQaqc },
      qaqcReviewerName: document.getElementById('qaqc-reviewer-name')?.value || '',
      qaqcReviewDate: document.getElementById('qaqc-review-date')?.value || '',
      entries: JSON.parse(JSON.stringify(tripgenEntries)),
      distribution: JSON.parse(JSON.stringify(tripgenDistribution)),
    };
  }
  return null;
}

let _autosaveTimer = null;
let _saveStateTimer = null;

function setSaveState(msg, durationMs) {
  const el = document.getElementById('sidebar-save-state');
  if (!el) return;
  el.textContent = msg;
  clearTimeout(_saveStateTimer);
  if (durationMs) _saveStateTimer = setTimeout(() => { el.textContent = ''; }, durationMs);
}

window.scheduleAutosave = function () {
  if (!projectType) return;
  setSaveState('Saving…');
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    try {
      const proj = serializeCurrentProject();
      if (proj) {
        localStorage.setItem(LS_KEY, JSON.stringify(proj));
        addToRecents(proj);
        setSaveState('Saved', 2000);
      }
    } catch (_) { setSaveState('', 0); }
  }, 2000);
};

function clearAutosave() { localStorage.removeItem(LS_KEY); }

function getProjectName(proj) {
  if (proj?.projectType === 'tripgen') return proj.siteInfo?.location || proj.projectInfo?.projectName || 'Trip generation project';
  if (proj?.projectType === 'area') return proj.projectInfo?.projectName || 'Area study';
  if (proj?.projectType === 'parking') return proj.parkingProjectInfo?.projectName || 'Parking study';
  return proj?.projectInfo?.projectName || 'Intersection count';
}

function loadProjectsIndex() {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS_INDEX) || '[]'); } catch (_) { return []; }
}

function upsertProjectIndex(proj) {
  if (!proj?.uuid || !proj?.projectType) return;
  try {
    const name = getProjectName(proj);
    const index = loadProjectsIndex().filter(e => e.uuid !== proj.uuid);
    index.unshift({ uuid: proj.uuid, name, type: proj.projectType, savedAt: proj.savedAt || new Date().toISOString() });
    localStorage.setItem(LS_PROJECTS_INDEX, JSON.stringify(index));
  } catch (_) {}
}

function deleteProjectFromStorage(uuid) {
  if (!uuid) return;
  try { localStorage.removeItem(`tc_project_${uuid}`); } catch (_) {}
  try {
    const index = loadProjectsIndex().filter(e => e.uuid !== uuid);
    localStorage.setItem(LS_PROJECTS_INDEX, JSON.stringify(index));
  } catch (_) {}
}

function addToRecents(proj) {
  if (!proj?.projectType) return;
  if (proj.uuid) {
    try {
      localStorage.setItem(`tc_project_${proj.uuid}`, JSON.stringify(proj));
      upsertProjectIndex(proj);
    } catch (_) {}
  } else {
    try {
      const name = getProjectName(proj);
      const entry = { name, type: proj.projectType, savedAt: proj.savedAt || new Date().toISOString(), data: proj };
      let list = [];
      try { list = JSON.parse(localStorage.getItem(LS_RECENTS_KEY) || '[]'); } catch (_) {}
      list = list.filter(r => !(r.name === name && r.type === proj.projectType));
      list.unshift(entry);
      list = list.slice(0, 8);
      localStorage.setItem(LS_RECENTS_KEY, JSON.stringify(list));
    } catch (_) {}
  }
}

function renderHomeRecents() {
  const el = document.getElementById('home-recents');
  if (!el) return;
  const typeLabel = t => t === 'tripgen' ? 'Trip Gen' : t === 'area' ? 'Area Study' : 'Intersection';

  const indexEntries = loadProjectsIndex();
  let legacyList = [];
  try { legacyList = JSON.parse(localStorage.getItem(LS_RECENTS_KEY) || '[]'); } catch (_) {}
  const indexUUIDs = new Set(indexEntries.map(e => e.uuid));
  // Filter legacy: exclude any that have a UUID already in the index
  legacyList = legacyList.filter(r => !r.data?.uuid || !indexUUIDs.has(r.data.uuid));

  if (!indexEntries.length && !legacyList.length) { el.style.display = 'none'; return; }
  el.style.display = '';

  const cardStyle = 'flex-direction:row;align-items:center;gap:12px;cursor:pointer';
  const btnBase = 'flex-shrink:0;width:22px;height:22px;border-radius:50%;border:.5px solid var(--border);background:var(--surface2);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1';

  const indexHtml = indexEntries.map(e => `
    <div class="home-card home-recent-card" data-uuid="${e.uuid}" style="${cardStyle}">
      <div style="flex:1;min-width:0;overflow:hidden">
        <div class="home-card-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}</div>
        <div class="home-card-desc">${typeLabel(e.type)} · ${formatTimeAgo(new Date(e.savedAt))}</div>
      </div>
      <button class="home-project-delete" data-uuid="${e.uuid}" title="Delete project" style="${btnBase};color:var(--danger)">×</button>
    </div>`).join('');

  const legacyHtml = legacyList.map((r, i) => `
    <div class="home-card home-recent-card" data-legacy-idx="${i}" style="${cardStyle}">
      <div style="flex:1;min-width:0;overflow:hidden">
        <div class="home-card-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
        <div class="home-card-desc">${typeLabel(r.type)} · ${formatTimeAgo(new Date(r.savedAt))}</div>
      </div>
      <button class="home-recent-remove" data-legacy-idx="${i}" title="Remove from list" style="${btnBase};color:var(--text3)">×</button>
    </div>`).join('');

  el.innerHTML = `
    <div class="home-section-label" style="margin-bottom:10px">Projects</div>
    <div class="home-cards" style="grid-template-columns:1fr;gap:6px">${indexHtml}${legacyHtml}</div>`;

  el.querySelectorAll('.home-recent-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.home-project-delete') || e.target.closest('.home-recent-remove')) return;
      if (card.dataset.uuid) {
        try {
          const raw = localStorage.getItem(`tc_project_${card.dataset.uuid}`);
          if (raw) { loadProject(JSON.parse(raw)); return; }
        } catch (_) {}
        alert('Project data not found in browser storage.');
        return;
      }
      if (card.dataset.legacyIdx !== undefined) {
        const r = legacyList[+card.dataset.legacyIdx];
        if (r?.data) loadProject(r.data);
      }
    });
  });

  el.querySelectorAll('.home-project-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const entry = indexEntries.find(en => en.uuid === btn.dataset.uuid);
      if (!confirm(`Delete "${entry?.name || 'this project'}" from browser storage? This cannot be undone.`)) return;
      deleteProjectFromStorage(btn.dataset.uuid);
      renderHomeRecents();
    });
  });

  el.querySelectorAll('.home-recent-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      legacyList.splice(+btn.dataset.legacyIdx, 1);
      try { localStorage.setItem(LS_RECENTS_KEY, JSON.stringify(legacyList)); } catch (_) {}
      renderHomeRecents();
    });
  });
}
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
  location: '', countDate: '',
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

  // Sub-line: location, project number, study purpose
  const subParts = [];
  if (projectInfo.location) subParts.push(projectInfo.location);
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
  if (projectInfo.countDate) {
    const [y, m, d] = projectInfo.countDate.split('-').map(Number);
    const formatted = new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    meta.push(`<span>Count date: ${formatted}</span>`);
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
                  'studyPurpose', 'location', 'countDate',
                  'projectManagerName', 'projectManagerTitle',
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
let tripgenDistribution = []; // [{id, name, allocs: {[dayType__peakLabel]: {pctIn, pctOut}}}]
let tripgenDistNextId = 1;

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
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Zoning reference PDF <span style="color:var(--text3)">(optional — site zoning reference)</span></div>
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
  // Zoning reference PDF upload
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

async function renderDistributionScreen() {
  const root = document.getElementById('tripgen-dist-root');
  if (!root) return;
  const hasEntries = tripgenEntries.length > 0;

  if (!hasEntries) {
    root.innerHTML = `<div class="card"><div class="stat-detail">Add at least one location on the Setup screen before using Distribution.</div></div>`;
    return;
  }

  const volumes = await computePeakVolumes(tripgenEntries, tripgenPeakWindows);
  const periodKeys = Object.keys(volumes);

  function fmtPct(v) { return v != null ? String(Math.round(Number(v) || 0)) : '0'; }
  function calcTrips(vol, pct) { return Math.round(vol * (Number(pct) || 0) / 100); }

  // Intersection list editor
  const listHTML = tripgenDistribution.length
    ? tripgenDistribution.map(ix => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <input type="text" data-dist-name="${ix.id}" value="${escapeHtmlMain(ix.name)}"
            placeholder="Intersection name" style="flex:1;font-size:13px" />
          <button data-dist-remove="${ix.id}" style="font-size:11px;flex-shrink:0">× remove</button>
        </div>`).join('')
    : `<div class="stat-detail" style="margin-bottom:8px">No intersections added yet.</div>`;

  // Allocation table — one row per intersection, columns per peak period
  const periodHeads = periodKeys.map(k => `<th style="text-align:center;min-width:110px">${escapeHtmlMain(volumes[k].label)}<br><span style="font-size:10px;font-weight:400;color:var(--text3)">${volumes[k].dayType}</span></th>`).join('');

  const allocRows = tripgenDistribution.map(ix => {
    const cells = periodKeys.map(key => {
      const a = ix.allocs?.[key] || { pctIn: 0, pctOut: 0 };
      return `<td style="text-align:center;vertical-align:top;padding:4px 6px">
        <div style="display:flex;flex-direction:column;gap:3px;align-items:center">
          <label style="font-size:10px;color:var(--text3)">in %</label>
          <input type="number" min="0" max="100" data-dist-alloc="${ix.id}__${key}__pctIn"
            value="${fmtPct(a.pctIn)}" style="width:56px;text-align:center;font-size:12px" />
          <label style="font-size:10px;color:var(--text3)">out %</label>
          <input type="number" min="0" max="100" data-dist-alloc="${ix.id}__${key}__pctOut"
            value="${fmtPct(a.pctOut)}" style="width:56px;text-align:center;font-size:12px" />
        </div>
      </td>`;
    }).join('');
    return `<tr><td style="font-weight:500;padding:6px 10px 6px 0;vertical-align:middle">${escapeHtmlMain(ix.name || '—')}</td>${cells}</tr>`;
  }).join('');

  // Totals row — sum of % per period, color-coded
  const totalRow = periodKeys.map(key => {
    const totalIn = tripgenDistribution.reduce((s, ix) => s + (Number(ix.allocs?.[key]?.pctIn) || 0), 0);
    const totalOut = tripgenDistribution.reduce((s, ix) => s + (Number(ix.allocs?.[key]?.pctOut) || 0), 0);
    const warnIn = totalIn > 100, warnOut = totalOut > 100;
    return `<td style="text-align:center;padding:4px 6px">
      <div style="font-size:11px;color:${warnIn ? 'var(--bad-text,#c0392b)' : 'var(--text2)'}">in: ${totalIn}%</div>
      <div style="font-size:11px;color:${warnOut ? 'var(--bad-text,#c0392b)' : 'var(--text2)'}">out: ${totalOut}%</div>
    </td>`;
  }).join('');

  // Results table — calculated trips
  const hasAllocs = tripgenDistribution.length > 0 && periodKeys.length > 0;
  let resultsHTML = '';
  if (hasAllocs) {
    const resultRows = tripgenDistribution.map(ix => {
      const cells = periodKeys.map(key => {
        const vol = volumes[key];
        const a = ix.allocs?.[key] || { pctIn: 0, pctOut: 0 };
        const trIn = calcTrips(vol.inbound, a.pctIn);
        const trOut = calcTrips(vol.outbound, a.pctOut);
        return `<td style="text-align:center;font-size:12px">+${trIn} in / +${trOut} out</td>`;
      }).join('');
      return `<tr><td style="font-weight:500;padding:6px 10px 6px 0">${escapeHtmlMain(ix.name || '—')}</td>${cells}</tr>`;
    });
    // Unallocated row
    const unallocRow = periodKeys.map(key => {
      const vol = volumes[key];
      const usedIn = tripgenDistribution.reduce((s, ix) => s + (Number(ix.allocs?.[key]?.pctIn) || 0), 0);
      const usedOut = tripgenDistribution.reduce((s, ix) => s + (Number(ix.allocs?.[key]?.pctOut) || 0), 0);
      const remIn = Math.max(0, 100 - usedIn);
      const remOut = Math.max(0, 100 - usedOut);
      const trIn = calcTrips(vol.inbound, remIn);
      const trOut = calcTrips(vol.outbound, remOut);
      return `<td style="text-align:center;font-size:12px;color:var(--text3)">+${trIn} in / +${trOut} out</td>`;
    }).join('');

    // Source volumes row
    const sourceRow = periodKeys.map(key => {
      const vol = volumes[key];
      return `<td style="text-align:center;font-size:11px;color:var(--text3)">${vol.inbound} in / ${vol.outbound} out</td>`;
    }).join('');

    resultsHTML = `
      <div class="card" style="margin-top:20px">
        <h3>Allocated trips by intersection</h3>
        <div class="stat-detail" style="margin-bottom:10px">Generated trips × allocation % — rounded to nearest vehicle.</div>
        <div style="overflow-x:auto">
          <table class="crosswalk-table">
            <thead>
              <tr><th>Intersection</th>${periodHeads}</tr>
              <tr style="background:var(--bg2)"><td style="font-size:11px;color:var(--text3)">Generated (peak hour)</td>${sourceRow}</tr>
            </thead>
            <tbody>
              ${resultRows.join('')}
              <tr style="color:var(--text3);font-style:italic"><td style="padding:6px 10px 6px 0">Unallocated</td>${unallocRow}</tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  root.innerHTML = `
    <h1 style="font-size:22px;font-weight:500;margin-bottom:1.5rem">Distribution
      <span style="font-size:14px;font-weight:400;color:var(--text2);margin-left:10px">allocate generated trips to nearby intersections</span>
    </h1>
    <div class="card" style="margin-bottom:14px">
      <h3>Nearby intersections</h3>
      <div class="stat-detail" style="margin-bottom:10px">Add the intersections that will receive generated trips from this site. Enter the % of inbound and outbound peak-hour trips allocated to each.</div>
      <div id="dist-ix-list">${listHTML}</div>
      <button id="btn-dist-add-ix" style="margin-top:8px;font-size:12px">+ add intersection</button>
    </div>
    ${tripgenDistribution.length > 0 && periodKeys.length > 0 ? `
    <div class="card" style="margin-bottom:14px">
      <h3>% allocation by peak period</h3>
      <div class="stat-detail" style="margin-bottom:10px">Enter the percentage of generated inbound and outbound trips assigned to each intersection per peak period. Columns exceeding 100% are flagged.</div>
      <div style="overflow-x:auto">
        <table class="crosswalk-table">
          <thead><tr><th>Intersection</th>${periodHeads}</tr></thead>
          <tbody>${allocRows}</tbody>
          <tfoot><tr style="font-weight:600"><td>Total allocated</td>${totalRow}</tr></tfoot>
        </table>
      </div>
    </div>` : ''}
    ${resultsHTML}`;

  root.querySelector('#btn-dist-add-ix')?.addEventListener('click', () => {
    tripgenDistribution.push({ id: tripgenDistNextId++, name: '', allocs: {} });
    renderDistributionScreen();
    scheduleAutosave();
  });
  root.querySelectorAll('[data-dist-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.distRemove);
      tripgenDistribution = tripgenDistribution.filter(ix => ix.id !== id);
      renderDistributionScreen();
      scheduleAutosave();
    });
  });
  root.querySelectorAll('[data-dist-name]').forEach(inp => {
    inp.addEventListener('change', () => {
      const id = Number(inp.dataset.distName);
      const ix = tripgenDistribution.find(x => x.id === id);
      if (ix) { ix.name = inp.value; scheduleAutosave(); }
    });
  });
  root.querySelectorAll('[data-dist-alloc]').forEach(inp => {
    inp.addEventListener('change', () => {
      const [idStr, dayType, peakLabel, field] = inp.dataset.distAlloc.split('__');
      const key = `${dayType}__${peakLabel}`;
      const ix = tripgenDistribution.find(x => x.id === Number(idStr));
      if (!ix) return;
      if (!ix.allocs[key]) ix.allocs[key] = { pctIn: 0, pctOut: 0 };
      ix.allocs[key][field] = Math.max(0, Math.min(100, Number(inp.value) || 0));
      renderDistributionScreen();
      scheduleAutosave();
    });
  });
}

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

// checkAutosave() — replaced by renderHomeResumeBanner() called from showHome()

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
