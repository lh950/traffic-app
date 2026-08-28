import './style.css';
import './analysis/style.css';

const LS_KEY = 'traffic-app-autosave';
const LS_RECENTS_KEY = 'tc_recents';
const LS_PROJECTS_INDEX = 'tc_projects_index';

let projectUUID = null;

// ── Read-only shareable link (Item 5) ──
// isViewerMode is true only in a tab that loaded a ?share=<id> URL. It gates every write
// path (autosave/localStorage/Firestore push) structurally, not just "nothing happens to
// call them" — see the guards on window.scheduleAutosave, addToRecents, flushPendingAutosave,
// persistAreaStudySnapshotsOnly, and clearAutosave below.
let isViewerMode = false;
// QA-input mode (separate from isViewerMode) — a second-counter reviewer's browser, reached
// via a distinct `?share=<id>&qa=1` link. Read-only for everything except submitting QA/QC
// recounts (see submitQaRecount() in share.js): structurally incapable of touching a
// location's real count data, since the only Firestore path this mode's writes ever reach is
// a separate append-only sub-collection, never the project document itself. Blocks local
// persistence exactly like isViewerMode (see window.scheduleAutosave's guard) — a QA
// reviewer's own browser must never write to its own localStorage either.
let isQaInputMode = false;
let qaInputShareId = null;
// shareInfo describes THIS project's own shareable link, if sharing is enabled for it.
// Round-trips through serializeCurrentProject()/loadProject() like any other project field.
let shareInfo = { shareId: null, ownerToken: null, enabled: false };
function resetShareInfo() { shareInfo.shareId = null; shareInfo.ownerToken = null; shareInfo.enabled = false; }
// Throttle for the Firestore push piggybacked on autosave — 45s, well inside the 30-60s
// range decided for this feature (avoids hitting Firestore's free-tier daily write cap on
// every 2s autosave tick).
const SHARE_PUSH_INTERVAL_MS = 45000;
let _lastSharePushAt = 0;

import {
  cfg, vPairs, intersection, fnames, vData, pedData, tmcData,
  vManual, pedManual, tmManual, slotLabel, setVPairs, setTmcApproach,
  initVData, initPedData, initTMCData, mode,
  periods, activePeriodIdx, setActivePeriodIdx,
  captureActivePeriod, restoreActivePeriod, initDefaultPeriods,
  resetUndoStacks, updateUndoUI, periodMeta, resetIntersection,
  keybindCfg, setKeybindCfg, resetKeybindCfg,
} from './state.js';
import {
  switchSetupTab, setIntervalLen, updateDerived, updateVCount, applyVPreset,
  checkVKeys, checkPKeys, checkTmcKeys, setLegLabel, toggleLegCrosswalk, toggleLegApproach, toggleLegOneWay, toggleLegOneWayIn,
  updateCrosswalkField, toggleApproachDestUnified, toggleApproachCount, renderLegConfig,
  buildTemplateGrid, renderVPairsList, addBikeToVPairs, addAllVPairsToTmc,
  copyVPairsFromProject, toggleVDescExpand,
  updateTemplateSuboption, setDiagLeg, setMissingLeg, syncTemplateSlotsFromIntersection,
  initApproaches, updateDefaultFilenames, wireSetupFilenameInputs, startCounting, goSetup,
  openLegPopover, closeLegPopover, getOpenLeg, wireLegPopoverDismiss,
  legLabel, setKeybindPreset, setOneHandedMode, setActiveSetupGroup,
} from './setup.js';
import { renderSetupDiagram, updateDiagram, toggleDiagram, toggleTurningDiagram, classifyTurn } from './diagram.js';
import {
  setMode, render, buildKbd, buildCounterUI, updateCfgFields, vGroupPrev, vGroupNext,
  tmcGroupPrev, tmcGroupNext,
} from './counter.js';
import { wireContextMenu } from './record.js';
import {
  toggleFocusMode, cycleFocus, setFocusTarget, undo, redo, wireKeydown,
} from './focus.js';
import { exportCSV, getCSVText, confirmReset } from './export.js';
import { exportXLSX, getXLSXBlob, exportTripgenXLSX } from './exportXlsx.js';
import { exportUTDF } from './exportUtdf.js';
import {
  openHelp, closeHelp, switchHelpTab, openSettings, closeSettings,
  applyMidSettings, checkMsKeys, wireHelpKeydown,
} from './help.js';
import { maybeShowWalkthroughOnce, wireWalkthrough } from './walkthrough.js';

import { parseTmcCsv } from './parseTmcCsv.js';
import { parseRawCountXlsx, buildIntersectionFromMeta } from './parseRawCountXlsx.js';
import { parseDotTmcXlsx, buildTmcIntersectionFromMeta } from './parseDotTmcXlsx.js';
import { parseStreetlightXlsx } from './parseStreetlightXlsx.js';
import { parseCSV, detectColumnsLocally, mapColumnsWithClaude, buildSnapshotFromMapping, saveLearnedMappings, saveImportTemplate, loadImportTemplates, deleteImportTemplate, findMatchingTemplate, LS_API_KEY } from './importCsv.js';
import * as analysisData from './analysis/ui/dataAdapter.js';
import { renderSummary } from './analysis/ui/summary.js';
import { renderStackedBarChart, renderMultiSeriesBarChart, renderComboChart, SERIES_COLOR_VARS } from './analysis/ui/charts.js';
import { renderTmcSection } from './analysis/ui/tmcDiagram.js';
import { openPrintReport } from './printReport.js';
import { runTmcQA, runVehicleQA, renderQASection, tmcStudyTotal, vehStudyTotal } from './qa.js';
import { parseProjectSnapshot, parseCurrentSnapshot, renderComparisonSection, pickComparisonFile } from './compare.js';
import { renderCorridorChart } from './corridorChart.js';
import { exportShareablePage, buildShareableHTML } from './shareReport.js';
import JSZip from 'jszip';
import { printSummaryReport, printIntersectionReport } from './printPedReport.js';
import { buildVolumeProfileSVG, buildCrosswalkBarSVG, buildChartLegend, dirSplitBar, CW_COLORS } from './chartUtils.js';
import { renderTripGenSection, DEFAULT_PEAK_WINDOWS, computePeakVolumes, computeQaqcPeakScore, renderQaqcDetailCardHTML, renderQaqcScoreDetailHTML, passFailBadge, shapeCheckBadge, perClassSummaryBadge, migrateQaqcWindows, qaqcWindowsKey, qaqcPeakKey, tgIncludedDays } from './analysis/ui/tripgenSection.js';
import { weekdayShort, dateLabelWithWeekday } from './analysis/ui/dateUtils.js';
import { intervalBar, pctOfPeakCell } from './analysis/ui/intervalDetail.js';

import {
  addClassification as tgAddClassification, beginCounting as tgBeginCounting,
  wireKeydown as tgWireKeydown, finishLocation as tgFinishLocation,
  captureLiveSnapshot as tgCaptureLiveSnapshot,
  resetClassifications as tgResetClassifications, beginEditing as tgBeginEditing,
  restoreClassifications as tgRestoreClassifications,
  beginRecount as tgBeginRecount, defaultClassificationsFor as tgDefaultClassificationsFor,
  beginFullRecount as tgBeginFullRecount,
  setClassificationsLocked as tgSetClassificationsLocked,
  renderClassificationsList as tgRenderClassificationsList,
  getClassifications as tgGetClassifications,
  getTgKeybindCfg, setTgKeybindCfg, resetTgKeybindCfg,
  getSessionSeq as tgGetSessionSeq,
  tgLiveState,
} from './tripgenCount.js';
import {
  beginIntersectionRecount as ixBeginRecount, wireKeydown as ixQaqcWireKeydown,
  finishIntersectionRecount as ixFinishRecount, assignRecountKeys as ixAssignRecountKeys,
} from './intersectionQaqcCount.js';
import {
  enableSharing as fbEnableSharing, disableSharing as fbDisableSharing,
  fetchSharedProject, pushSharedUpdate, setViewerMode as setShareViewerMode,
  submitQaRecount, fetchQaSubmissions,
} from './share.js';
import { pushBackupSnapshot, listBackups, getBackup } from './backup.js';

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

  nav.innerHTML = `<div class="sidebar-nav-header">Count mode</div>`
    + items.map(item => `
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
        buildCounterSidebar(); // re-render after mode change so active highlight is correct
      }
    });
  });
}

// ── Expose state objects + functions referenced bare in inline HTML handlers ──
window.vPairs = vPairs;
window.intersection = intersection;
Object.assign(window, {
  switchSetupTab, switchTgTab,
  setIntervalLen, updateDerived, updateVCount, applyVPreset,
  checkVKeys, checkPKeys, setLegLabel, toggleLegCrosswalk, toggleLegApproach, toggleLegOneWay, toggleLegOneWayIn,
  updateCrosswalkField, toggleApproachDestUnified, toggleApproachCount, renderLegConfig,
  updateDefaultFilenames,
  checkTmcKeys, addBikeToVPairs, addAllVPairsToTmc, renderVPairsList, toggleVDescExpand,
  setKeybindPreset, setOneHandedMode, setActiveSetupGroup,
  openLegPopover, closeLegPopover, getOpenLeg,
  setDiagLeg, setMissingLeg, updateDiagram, toggleDiagram, toggleTurningDiagram,
  setMode, render, buildKbd, updateCfgFields, vGroupPrev, vGroupNext, tmcGroupPrev, tmcGroupNext,
  toggleFocusMode, cycleFocus, setFocusTarget, undo, redo,
  exportCSV, exportXLSX, exportUTDF, confirmReset,
  exportTripgenXLSX: () => exportTripgenXLSX(tripgenEntries, tripgenSiteInfo, projectInfo),
  openHelp, closeHelp, switchHelpTab, openSettings, closeSettings,
  applyMidSettings, checkMsKeys,
  openContextHelp: () => openHelp(contextualHelpTab()),
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

// Which mode to open the counter in when the currently-active mode isn't one of the
// enabled count types for this project (e.g. a TMC-only project where `mode` is still
// its stale/default 'vehicle' value from a prior project or the module default).
// Priority mirrors buildCounterSidebar()'s own item order (ped, vehicle, turning) so this
// doesn't invent a new precedence — if only one mode is enabled it's the obvious pick;
// if several are, the first enabled one in that order wins.
function pickInitialMode() {
  if (enabledModes.ped) return 'ped';
  if (enabledModes.vehicle) return 'vehicle';
  if (enabledModes.turning) return 'turning';
  return 'vehicle';
}

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
  // BUG: nothing previously picked an initial mode based on enabledModes — `mode` defaults
  // to 'vehicle' (state.js) and nothing here ever called setMode() before opening the
  // workspace, so a TMC-only project (vehicle+ped both disabled) always opened into
  // vehicle/in-out mode with no data to show, forcing a manual click into turning mode
  // every time. Only override when the currently-active mode isn't actually enabled for
  // this project, so a normal vehicle(+ped/turning) project's default is left untouched.
  if (!enabledModes[mode]) setMode(pickInitialMode());
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
wireWalkthrough();
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
updateDerived();
renderLegConfig();
renderSetupDiagram();
updateTemplateSuboption();
initApproaches();

// ═══════════════════════════════════════════
// SCREEN ROUTER
// ═══════════════════════════════════════════
const SCREENS = ['home-screen', 'help-screen', 'area-setup-screen', 'area-import-screen', 'summary-screen', 'area-aggregate-screen', 'export-screen', 'ix-analysis-screen', 'setup-screen', 'counter-screen', 'intersection-qaqc-screen', 'intersection-qaqc-counter-screen', 'streetlight-compare-screen', 'tripgen-setup-screen', 'tripgen-counter-screen', 'tripgen-locations-screen', 'tripgen-qaqc-screen', 'tripgen-qaqc-detail-screen', 'tripgen-distribution-screen', 'analyze-screen', 'parking-setup-screen', 'parking-counter-screen', 'share-viewer-screen'];
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

// wrapEl (optional): defaults to the real #pk-summary-table container inside the parking
// counting screen; the read-only viewer (renderViewerContent()) passes its own container
// instead, so it never has to show the counting screen (with its editable count grid) to
// display the summary table.
function renderParkingSummary(wrapEl = document.getElementById('pk-summary-table'), opts = {}) {
  const wrap = wrapEl;
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

  if (!opts.viewerMode) { wrap.innerHTML = html; return; }

  // Viewer-only chart — the internal parking screen has never had a chart (occupancy is
  // read directly off the interval x zone grid below), so there's no existing chart-building
  // call to reuse here the way the other 3 project types do. Reusing the SAME
  // renderMultiSeriesBarChart primitive the app already uses elsewhere (not inventing a new
  // chart type) to visualize the exact same occupancy-% figures already in the table below —
  // no new metric, just a chart of one that already existed. Table (the detailed
  // interval-by-interval grid) is collapsed by default behind the same <details> pattern
  // used everywhere else in the viewer.
  const labels = [];
  for (let s = 0; s < total; s++) labels.push(pkSlotLabel(s));
  const series = parkingZones.map(z => ({
    label: z.name,
    values: labels.map((_, s) => {
      const occ = (parkingGrid[s] || {})[z.id];
      return (occ != null && z.capacity > 0) ? Math.round((occ / z.capacity) * 100) : 0;
    }),
  }));
  const chartHtml = total > 0 && parkingZones.length
    ? renderMultiSeriesBarChart({ labels, series })
    : '<div class="stat-detail">No occupancy data recorded yet.</div>';

  wrap.innerHTML = `
    <div class="section"><div class="section-head"><h2>Occupancy by interval (% of capacity)</h2></div>${chartHtml}</div>
    <details class="interval-detail">
      <summary class="interval-detail-summary">Show occupancy table (${total} interval${total !== 1 ? 's' : ''})</summary>
      <div class="interval-detail-wrap">${html}</div>
    </details>`;
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
  // btn is omitted when this is called programmatically (e.g. the sidebar's "Location
  // counts" item jumping straight to the locations tab) rather than from the tab bar's own
  // inline onclick= — look the button up by its data-tgtab attribute in that case.
  const activeBtn = btn || screen.querySelector(`.tg-tab[data-tgtab="${name}"]`);
  activeBtn?.classList.add('active');
  document.getElementById('tgp-' + name)?.classList.add('active');
  if (name === 'classifications') {
    // Classifications are project-wide config with their own tab now, reachable before any
    // location exists — refresh the lock state (real count data may exist from a location
    // added earlier this session) and repaint, since this tab's DOM may not have been
    // rendered yet if the user never opened "start a new count" first.
    tgSetClassificationsLocked(hasTripgenCountData());
    tgRenderClassificationsList();
    renderTgCategoryMapEditor();
  }
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
  // Export reminder (layer 3) only makes sense while actually on a live counting screen —
  // hide it (without recording a dismissal) the moment the user navigates away from one, so
  // it doesn't linger over unrelated screens like Setup or Analysis.
  if (_currentScreen !== id) {
    const banner = document.getElementById('export-reminder-banner');
    if (banner) banner.style.display = 'none';
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
  // Area-study child intersections already have their own lat/lng fields on the hub
  // row (areaIntersections[i].lat/lng) — the new intersection.lat/lng setup fields are
  // only meaningful for standalone intersection projects, so hide them for area studies
  // to avoid two disconnected lat/lng entry points for the same intersection.
  document.body.classList.toggle('project-type-area', projectType === 'area');
  document.body.classList.toggle('project-type-intersection', projectType === 'intersection');
  document.body.classList.toggle('project-type-tripgen', projectType === 'tripgen');
  document.body.classList.toggle('project-type-parking', projectType === 'parking');
  renderShareWidgets();
}

// ── Read-only shareable link — "Enable sharing" UI ──
// One render function updates every .share-widget element in the DOM (one per project
// type's Analysis/Summary screen) from the single shareInfo global, so there's one behavior
// to maintain instead of four near-duplicate copies. Called from enterWorkspace() (covers
// every project load/creation) and again after enable/disable so the UI reflects the new
// state immediately without waiting for the next navigation.
function renderShareWidgets() {
  const widgets = document.querySelectorAll('.share-widget');
  widgets.forEach((w) => {
    if (!projectType || isViewerMode) { w.innerHTML = ''; return; }
    if (shareInfo.enabled && shareInfo.shareId) {
      const url = `${location.origin}${location.pathname}?share=${shareInfo.shareId}`;
      const qaUrl = `${url}&qa=1`;
      // QA-input link is Trip Gen-only (enterQaInputMode() itself also refuses any other
      // projectType) — no separate "enable" step, it's the same shared doc, just a second URL
      // that routes into the restricted submit-only screen instead of the read-only viewer.
      w.innerHTML = `
        <span style="font-size:11px;color:var(--text3)">Sharing is on —</span>
        <button class="share-copy-btn" style="font-size:12px" title="${url}">Copy link</button>
        ${projectType === 'tripgen' ? `<button class="share-qa-copy-btn" style="font-size:12px" title="${qaUrl}">Copy QA-input link</button>` : ''}
        <button class="share-disable-btn" style="font-size:12px">Disable sharing</button>`;
      w.querySelector('.share-copy-btn').onclick = () => {
        navigator.clipboard?.writeText(url);
        setSaveState('Link copied', 1500);
      };
      w.querySelector('.share-qa-copy-btn')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(qaUrl);
        setSaveState('QA-input link copied', 1500);
      });
      w.querySelector('.share-disable-btn').onclick = handleDisableSharing;
    } else {
      w.innerHTML = `<button class="share-enable-btn" style="font-size:12px">Enable sharing ↗</button>`;
      w.querySelector('.share-enable-btn').onclick = handleEnableSharing;
    }
  });
}

async function handleEnableSharing() {
  if (isViewerMode) return; // structural guard
  const proj = serializeCurrentProject();
  if (!proj) return;
  setSaveState('Enabling sharing…');
  try {
    const result = await fbEnableSharing(proj);
    shareInfo.shareId = result.shareId;
    shareInfo.ownerToken = result.ownerToken;
    shareInfo.enabled = true;
    _lastSharePushAt = Date.now(); // just pushed a fresh copy — don't re-push immediately
    window.scheduleAutosave?.(); // persist shareInfo into this project's own local data
    setSaveState('Saved', 2000);
    renderShareWidgets();
  } catch (e) {
    setSaveState('', 0);
    alert('Could not enable sharing. Check your connection and try again.\n\n' + (e?.message || e));
  }
}

async function handleDisableSharing() {
  if (isViewerMode || !shareInfo.shareId) return;
  setSaveState('Disabling sharing…');
  try {
    await fbDisableSharing(shareInfo.shareId);
  } catch (_) {
    // Even if the delete fails (e.g. offline), clear the local link — it's already
    // meaningless to this project once the user asked to disable it, and leaving stale
    // shareInfo around risks a later autosave re-pushing to a doc the user meant to kill.
  }
  resetShareInfo();
  window.scheduleAutosave?.();
  setSaveState('Saved', 2000);
  renderShareWidgets();
}

function exitWorkspace() {
  projectUUID = null;
  document.body.classList.remove('workspace-mode');
  // BUG: enterWorkspace() adds one of these four per project type but this function never
  // removed them, so a stale project-type-* class lingered on <body> after leaving a project
  // — style.css's per-project-type --accent custom properties aren't gated on .workspace-mode,
  // so the home screen kept rendering with whichever project's accent color was last active
  // instead of falling back to the neutral default (see the CSS comment above those rules).
  document.body.classList.remove('project-type-area', 'project-type-intersection', 'project-type-tripgen', 'project-type-parking');
  document.getElementById('app-sidebar')?.classList.remove('visible');
}

function showHome() {
  exitWorkspace();
  _sidebarActiveItem = null;
  _navHistory.length = 0;
  showScreen('home-screen');
  renderHomeResumeBanner();
  renderHomeRecents();
  maybeShowWalkthroughOnce();
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
      <button class="sidebar-item" data-ws="qaqc">QA/QC</button>
      <button class="sidebar-item" data-ws="analyze">Analyze</button>
      <button class="sidebar-item" data-ws="streetlight">StreetLight</button>
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
      <button class="sidebar-item" data-ws="area-aggregate">Aggregate</button>
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
      <button class="sidebar-item" data-ws="tg-locations">Location counts</button>
      <button class="sidebar-item" data-ws="tg-qaqc">QA/QC</button>
      <button class="sidebar-item" data-ws="tg-analyze">Analysis</button>
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

// Picks which help-modal tab is most relevant to what's currently on screen, so the
// sidebar "Help" link (and the header "?" buttons) land on useful content instead of
// always defaulting to the same tab. Deliberately simple — falls back to 'general'
// for anything not explicitly mapped (area study, trip gen, parking, QA/QC screens).
function contextualHelpTab() {
  if (projectType === 'intersection') {
    if (_currentScreen === 'setup-screen') return 'setup';
    if (_currentScreen === 'counter-screen') return mode === 'ped' ? 'ped' : mode === 'turning' ? 'tmc' : 'vehicle';
    if (_currentScreen === 'ix-analysis-screen') return 'export';
  }
  // Trip Gen's live counter now defaults to the numpad preset (per-project, not shared with
  // the intersection counter's own keybindCfg) — route Help there directly instead of the
  // generic fallback, since "what do these keys mean" is exactly what a first-time Trip Gen
  // counter would want on open.
  if (projectType === 'tripgen' && _currentScreen === 'tripgen-counter-screen') return 'numpad';
  return 'general';
}

function openWorkspaceTab(tab, idx) {
  _sidebarActiveItem = tab === 'area-ix' ? `area-ix-${idx}` : tab;
  renderAppSidebar();
  switch (tab) {
    case 'setup': showScreen('setup-screen'); renderPlannedPeriods(); break;
    case 'count': showScreen('counter-screen'); window.goToCountMode?.(); break;
    case 'qaqc': showScreen('intersection-qaqc-screen'); renderIntersectionQaqcScreen(); break;
    case 'streetlight': showScreen('streetlight-compare-screen'); renderStreetlightCompareScreen(); break;
    // 'charts' kept as an alias of 'analyze' — the two nav items were consolidated
    // into a single screen (see renderSidebarIntersection); both used to open the
    // same ix-analysis-screen with different default sub-tabs, which no longer exist
    // now that stat cards + chart + data quality + tables all live together.
    case 'analyze':
    case 'charts': {
      showScreen('ix-analysis-screen');
      const isIxCount = projectType === 'intersection';
      const backBtn = document.getElementById('btn-ix-analysis-back');
      const openBtn = document.getElementById('btn-ix-open-counter');
      const qaqcOpenBtn = document.getElementById('btn-ix-qaqc-open');
      const slOpenBtn = document.getElementById('btn-ix-sl-open');
      if (backBtn) {
        backBtn.style.display = '';
        backBtn.textContent = isIxCount ? '← Count' : '← Summary';
      }
      if (openBtn) openBtn.style.display = isIxCount ? 'none' : '';
      // Standalone intersection projects already have a dedicated QA/QC sidebar item
      // (renderSidebarIntersection); this button only exists so area-study children —
      // which have no such sidebar entry — have a way to reach QA/QC for the specific
      // intersection currently drilled into (see showIntersectionQaqc()).
      if (qaqcOpenBtn) qaqcOpenBtn.style.display = isIxCount ? 'none' : '';
      // Same rationale as qaqcOpenBtn immediately above, for the StreetLight comparison
      // screen — standalone intersections reach it via their own sidebar item instead.
      if (slOpenBtn) slOpenBtn.style.display = isIxCount ? 'none' : '';
      // Sharing is a whole-project feature — only meaningful when looking at a standalone
      // intersection project, not a specific child of an area study (that widget lives on
      // the Aggregate screen instead — see share-widget in area-aggregate-screen).
      const ixShareWidget = document.getElementById('ix-share-widget');
      if (ixShareWidget) ixShareWidget.style.display = isIxCount ? '' : 'none';
      if (isIxCount) {
        const titleEl = document.getElementById('ix-analysis-title');
        const subEl = document.getElementById('ix-analysis-sub');
        if (titleEl) titleEl.textContent = [intersection.street1, intersection.street2].filter(Boolean).join(' & ') || projectInfo?.projectName || 'Intersection';
        if (subEl) subEl.textContent = projectInfo?.location || '';
      }
      // Standalone intersection project: render live state directly (full parity
      // with the Count-screen's inline Analyze pane). Area-study children are
      // routed to this screen via showIntersectionAnalysis() instead, which
      // passes a read-only snapshot ctx.
      renderIntersectionAnalysis(document.getElementById('ix-analysis-content'), null);
      break;
    }
    case 'export': showExportScreen(); break;
    case 'help': openHelp(contextualHelpTab()); break;
    case 'area-hub': showAreaSetup(); break;
    case 'area-summary':
      if (typeof showSummaryScreen === 'function') showSummaryScreen();
      break;
    case 'area-aggregate': showAreaAggregateScreen(); break;
    case 'area-import': showImportScreen(); break;
    case 'area-export': showExportScreen(); break;
    case 'area-ix':
      showIntersectionAnalysis(idx ?? activeIntersectionIdx);
      break;
    case 'tg-setup': showScreen('tripgen-setup-screen'); break;
    // "Location counts" — a dedicated, larger browse/manage screen distinct from Setup's
    // compact "locations" tab (which stays focused on adding a new location: upload/paste/
    // begin-counting). This screen shows every location with more detail (address, day(s)
    // counted, classification count, total recorded volume, in-progress status) and lets
    // the user click into any day to edit it via the existing editTripgenDay() flow.
    case 'tg-locations': showScreen('tripgen-locations-screen'); renderTripgenLocationsScreen(); break;
    // BUG-041: both cases previously only called showScreen(), never the matching render —
    // every other case in this switch that needs one calls it (tg-locations, tg-distribution,
    // pk-setup). The QA/QC screen's static header markup (reviewer name/date fields) rendered
    // fine on its own, making it look like the screen "opened" while #tripgen-qaqc-list stayed
    // empty/stale — user-reported live as "QA page is broken." The Analysis gap was already
    // noted as a known finding in DEVLOG's v3.36.0-alpha.4 entry but never fixed until now.
    case 'tg-analyze': showScreen('analyze-screen'); rerenderTripgenAnalysis(); break;
    case 'tg-qaqc': showScreen('tripgen-qaqc-screen'); renderQaqcScreen(); break;
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
  resetShareInfo(); // a genuinely new project must never inherit a previous project's share link
  plannedPeriods.length = 0;
  // BUG-032: this entry point never reset the module-singleton `intersection`/TEMPLATES
  // slots/enabledModes, so a genuinely new project silently inherited whatever template,
  // diagLeg, and enabled count types the previously-open project (in the same tab) left
  // behind — same leakage shape as BUG-027, different trigger (new project vs. load).
  resetIntersection();
  resetKeybindCfg(); // don't let a previous project's keybinding preset/one-handed choice leak into a genuinely new one (same leakage class as BUG-032)
  intersectionCustomWindows = []; intersectionCustomWindowNextId = 1; // same leakage class as BUG-032 — don't inherit a previous project's saved windows
  syncTemplateSlotsFromIntersection();
  enabledModes.ped = true; enabledModes.vehicle = true; enabledModes.turning = true;
  syncCountTypeToggles(); // reflect the reset into the ct-ped/ct-vehicle/ct-turning checkboxes' DOM state, not just the JS object
  enterWorkspace();
  setSidebarMeta('New intersection count', '');
  _sidebarActiveItem = 'setup';
  renderAppSidebar();
  showScreen('setup-screen');
  // Same render-refresh set used by loadProject()/switchIntersection() after restoring
  // `intersection` (main.js ~4939-4941) — without these, stale DOM from whatever project
  // was previously open (e.g. the 5-way diagonal-leg pill selector) survives the reset above
  // even though the underlying `intersection`/TEMPLATES state is correct.
  buildTemplateGrid(); renderVPairsList(); updateDerived(); renderLegConfig(); renderSetupDiagram();
  updateTemplateSuboption(); initApproaches();
  renderPlannedPeriods();
});

document.getElementById('home-btn-area')?.addEventListener('click', () => {
  projectType = 'area';
  resetShareInfo(); // a genuinely new project must never inherit a previous project's share link
  areaIntersections.length = 0;
  enterWorkspace();
  setSidebarMeta('New area study', '');
  _sidebarActiveItem = null;
  renderAppSidebar();
  showScreen('area-setup-screen');
});

document.getElementById('home-btn-tripgen')?.addEventListener('click', () => {
  projectType = 'tripgen';
  resetShareInfo(); // a genuinely new project must never inherit a previous project's share link
  // Classifications are project-wide config now (own tab, no longer wiped per location —
  // see the "start a new count" handler below), so a genuinely new project must clear
  // whatever the previous session's project left behind, or it would silently leak in.
  tgResetClassifications();
  resetTgKeybindCfg();
  enterWorkspace();
  setSidebarMeta('New trip generation', '');
  _sidebarActiveItem = 'tg-setup';
  renderAppSidebar();
  showScreen('tripgen-setup-screen');
});

document.getElementById('home-btn-parking')?.addEventListener('click', () => {
  projectUUID = crypto.randomUUID();
  resetShareInfo(); // a genuinely new project must never inherit a previous project's share link
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

// ── Count-data failsafe, layer 1: restore-from-backup UI ──
async function openBackupsDialog() {
  const modal = document.getElementById('backups-modal');
  const list = document.getElementById('backups-list');
  if (!modal || !list) return;
  modal.classList.add('open');
  list.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:12px 0">Loading…</div>`;
  const backups = await listBackups();
  if (!backups.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:12px 0">No backup snapshots yet — they're taken automatically as you work on a project.</div>`;
    return;
  }
  const typeLabel = t => t === 'tripgen' ? 'Trip Gen' : t === 'area' ? 'Area Study' : t === 'parking' ? 'Parking' : 'Intersection';
  list.innerHTML = backups.map(b => `
    <div class="home-card" style="flex-direction:row;align-items:center;gap:12px;margin-bottom:8px">
      <div style="flex:1;min-width:0;overflow:hidden">
        <div class="home-card-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtmlMain(b.label)}</div>
        <div class="home-card-desc">${typeLabel(b.projectType)} · ${formatTimeAgo(new Date(b.savedAt))} · ${escapeHtmlMain(b.summary || '')}</div>
      </div>
      <button class="btn-primary" data-restore-backup="${b.id}" style="white-space:nowrap;flex-shrink:0">Restore</button>
    </div>`).join('');
  list.querySelectorAll('[data-restore-backup]').forEach((btn) => {
    btn.addEventListener('click', () => restoreBackup(Number(btn.dataset.restoreBackup)));
  });
}

function closeBackupsDialog() {
  document.getElementById('backups-modal')?.classList.remove('open');
}

async function restoreBackup(id) {
  const record = await getBackup(id);
  if (!record?.proj) return;
  const ok = window.confirm(
    `Restore "${record.label}" as it was ${formatTimeAgo(new Date(record.savedAt))}?\n\n` +
    `This replaces whatever is currently open with this backup's data. The current state is not lost — it's still autosaved and its own recent backups remain available — but any changes made since this snapshot won't be in the restored version.`
  );
  if (!ok) return;
  closeBackupsDialog();
  loadProject(record.proj);
  // Lock the recovered state in immediately rather than leaving it dependent on the next
  // debounced autosave tick — a restore is a deliberate save-worthy action on its own.
  commitProjectSave(serializeCurrentProject());
}

document.getElementById('home-btn-backups')?.addEventListener('click', openBackupsDialog);
document.getElementById('backups-modal-close')?.addEventListener('click', closeBackupsDialog);
document.getElementById('backups-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeBackupsDialog();
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
  let countWriteLog = [];
  try { countWriteLog = JSON.parse(localStorage.getItem('tc_count_write_log') || '[]'); } catch (_) {}
  return {
    timestamp: new Date().toISOString(),
    appVersion: document.title,
    description: document.getElementById('bug-desc').value.trim() || '(no description)',
    currentScreen: _currentScreen,
    projectType,
    navHistory: [..._navHistory],
    storage,
    // Count-data write log (BUG-047/BUG-048 follow-up, generalized across every project type)
    // — every project save, plus Trip Gen's own more detailed commitLocationCounts() entries
    // (accepted or rejected) and shrink-detection warnings. Lets a future "this data looks
    // wrong" report be traced to the exact write, rather than narrowed down by hand after the
    // fact.
    countWriteLog,
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

// Read-only shared link (?share=<id>) — intercept before normal boot. Viewer mode never
// shows the home screen, sidebar, or any setup/counting screen; see enterViewerMode().
const _shareId = new URLSearchParams(location.search).get('share');
const _isQaLink = new URLSearchParams(location.search).get('qa') === '1';
if (_shareId && _isQaLink) {
  enterQaInputMode(_shareId);
} else if (_shareId) {
  enterViewerMode(_shareId);
} else {
  showScreen('home-screen');
  renderHomeResumeBanner();
  renderHomeRecents();
  maybeShowWalkthroughOnce();
}

window.openWorkspaceTab = openWorkspaceTab;

window.goToCountMode = function () {
  document.getElementById('btn-count-mode')?.classList.add('active');
  document.getElementById('btn-analyze-mode')?.classList.remove('active');
  document.getElementById('counter-screen')?.classList.remove('analyze-mode');
  buildCounterSidebar();
  if (periods.length) { buildPeriodTabs(); }
};
window.goToAnalyzeMode = async function () {
  document.getElementById('btn-count-mode')?.classList.remove('active');
  document.getElementById('btn-analyze-mode')?.classList.add('active');
  document.getElementById('counter-screen')?.classList.add('analyze-mode');
  buildCounterSidebar();
  await renderIntersectionAnalysis(document.getElementById('counter-analyze-pane'));
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
document.getElementById('btn-share-viewer-print')?.addEventListener('click', () => {
  populatePrintHeader('share-prh');
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
// consumes, so summary.js/tmcDiagram.js are reused unmodified, no CSV round-trip needed.)
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
  return { approaches, types: vPairs.filter(p=>p.includeTmc).map(p => ({ label: p.label, isBike: !!p.isBike, def: p.def || '' })), intervals, legLabels: intersection.legLabels || {}, intervalMin: cfg.intervalMin };
}

// ── Period-stored-data → analysis shapes ─────────────────────────────────────
// Like live*Parsed() but reads from a stored period's .data object, so the
// analyze screen can inspect any period without touching live counting state.
// `ctx` optionally overrides which intersection/vPairs config to read against —
// used so the same function serves both live-state periods (ctx omitted, reads
// the live globals) and read-only snapshot periods from an area-study child
// intersection (ctx = { intersection: snap.intersection, vPairs: snap.vPairs }).
function parsedFromPeriod(pData, ctx = {}) {
  const ix = ctx.intersection || intersection;
  const vp = ctx.vPairs || vPairs;
  const { startMinutes, intervalMin, durationMin } = pData.cfg;
  const slots = Math.floor(durationMin / intervalMin);
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  const slotLabel = (i) => { const s = startMinutes + i * intervalMin; return `${fmt(s)}–${fmt(s + intervalMin)}`; };
  const approaches = ix.approaches.map(a => ({
    leg: a.leg,
    destinations: a.destinations.map(d => ({ leg: d, turnClass: classifyTurn(a.leg, d) })),
  }));
  const vehParsed = {
    types: vp.map(p => p.label),
    intervals: Array.from({ length: slots }, (_, i) => ({
      label: slotLabel(i), start: fmt(startMinutes + i * intervalMin), end: fmt(startMinutes + (i+1) * intervalMin),
      inbound: pData.vData.in[i] || [], outbound: pData.vData.out[i] || [],
    })),
  };
  const pedParsed = {
    crosswalks: ix.crosswalks.map(c => ({ name: c.name, dir0: c.dir0, dir1: c.dir1 })),
    intervals: Array.from({ length: slots }, (_, i) => ({
      label: slotLabel(i), start: fmt(startMinutes + i * intervalMin), end: fmt(startMinutes + (i+1) * intervalMin),
      counts: pData.pedData.map(xw => xw[i] || [0,0]),
    })),
  };
  const tmcParsed = {
    approaches, types: vp.filter(p=>p.includeTmc).map(p => ({ label: p.label, isBike: !!p.isBike, def: p.def || '' })),
    legLabels: ix.legLabels || {}, intervalMin,
    intervals: Array.from({ length: slots }, (_, i) => {
      const counts = {};
      approaches.forEach(a => {
        counts[a.leg] = {};
        a.destinations.forEach(d => { counts[a.leg][d.leg] = pData.tmcData[a.leg]?.[d.leg]?.[i] || vp.map(() => 0); });
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

// weekdayShort() / dateLabelWithWeekday() now live in analysis/ui/dateUtils.js (imported
// above) — shared with Trip Gen's Analyze screen so weekday derivation never drifts between
// the two (see BUGS.md pitfall note preserved there).

// ── Analyze: vehicle-class stacked bar chart ─────────────────────────────────
// New, additive alongside the existing "volume by interval" chart in
// analysis/ui/summary.js (which shows in/out totals, no class breakdown) — this one
// stacks each bar into its vPairs classes (Car/Truck/Bus/Bike/etc). Five groupings:
//   'bin'    — this period's own 15-min intervals (or whatever the native interval is)
//   'hourly' — this period's intervals rolled up to the hour
//   'day'    — across every period on this intersection, one bar per distinct meta.date
//              (only meaningful for multi-day studies; single-day studies just get one bar)
//   'dow'    — across every period on this intersection, one bar per weekday (Mon..Sun),
//              COLLAPSING every date that falls on that weekday — e.g. a study spanning
//              three weeks puts all its Tuesdays in one bar. Distinct from 'day', which
//              keeps every calendar date separate.
//   'period' — across every period on this intersection, one bar per period name
//              (AM Peak / Midday Peak / PM Peak / etc)
// 'bin'/'hourly' only use the currently-viewed period's own vehParsed (adjacent periods
// aren't contiguous in time, so stacking them into one time-of-day axis would be
// misleading); 'day'/'dow'/'period' use `allPeriods`, built by the caller from every period
// on this intersection. All five groupings match vehicle classes BY LABEL, not array
// position — see aggregateVehicleClassTotals()'s header comment and BUG-019/BUG-020 in
// BUGS.md for why: different periods/files can carry different vPairs orderings or sets.

function classSeriesFromVehParsed(vehParsed, mode) {
  const { types, intervals } = vehParsed;
  if (!types.length || !intervals.length) return { labels: [], series: [] };

  if (mode === 'hourly') {
    const order = [];
    const buckets = new Map(); // hour label -> per-class totals array
    intervals.forEach((iv) => {
      const key = `${(iv.start || '00:00').split(':')[0]}:00`;
      if (!buckets.has(key)) { buckets.set(key, types.map(() => 0)); order.push(key); }
      const arr = buckets.get(key);
      types.forEach((_, ci) => { arr[ci] += (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0); });
    });
    return {
      labels: order,
      series: types.map((label, ci) => ({ label, values: order.map((k) => buckets.get(k)[ci]) })),
    };
  }

  return {
    labels: intervals.map((iv) => iv.label || `${iv.start}–${iv.end}`),
    series: types.map((label, ci) => ({
      label,
      values: intervals.map((iv) => (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0)),
    })),
  };
}

// 'day' groups by calendar date (one bar per distinct meta.date — a multi-week study gets
// one bar per day it was counted); 'dow' groups by weekday name instead, COLLAPSING every
// period across the whole study onto 7 buckets (Mon..Sun) regardless of which calendar date
// or week they fall on — useful for spotting a weekday pattern across a study spanning
// several weeks. Both reuse the same by-label class aggregation below (BUG-019/BUG-020
// discipline — see this section's header comment); only the grouping key function differs.
function classSeriesAcrossPeriods(allPeriods, mode) {
  const groupTotals = new Map(); // group key -> Map(class label -> total)
  const groupOrderRaw = [];
  const groupLabels = new Map(); // group key -> display label (may differ from the key itself, e.g. 'day' shows the weekday alongside the date)
  allPeriods.forEach((p, idx) => {
    let key, groupLabel;
    if (mode === 'period') {
      key = p.name || `Period ${idx + 1}`;
      groupLabel = key;
    } else if (mode === 'dow') {
      key = weekdayShort(p.meta?.date) || 'No date';
      groupLabel = key;
    } else { // 'day'
      key = p.meta?.date || 'No date';
      groupLabel = key === 'No date' ? key : dateLabelWithWeekday(key);
    }
    if (!groupTotals.has(key)) { groupTotals.set(key, new Map()); groupOrderRaw.push(key); groupLabels.set(key, groupLabel); }
    const classMap = groupTotals.get(key);
    const { types = [], intervals = [] } = p.vehParsed || {};
    types.forEach((label, ci) => {
      const sum = intervals.reduce((s, iv) => s + (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0), 0);
      classMap.set(label, (classMap.get(label) || 0) + sum);
    });
  });
  let groupOrder;
  if (mode === 'day') {
    groupOrder = [...groupOrderRaw].sort((a, b) => (a === 'No date' ? 1 : b === 'No date' ? -1 : a.localeCompare(b)));
  } else if (mode === 'dow') {
    const dowRank = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6, 'No date': 7 };
    groupOrder = [...groupOrderRaw].sort((a, b) => (dowRank[a] ?? 8) - (dowRank[b] ?? 8));
  } else {
    groupOrder = groupOrderRaw;
  }
  // Union of class labels across every group, matched by label (not index) — see this
  // section's header comment.
  const labelTotals = new Map();
  groupOrder.forEach((key) => {
    for (const [label, val] of groupTotals.get(key)) labelTotals.set(label, (labelTotals.get(label) || 0) + val);
  });
  const classLabels = [...labelTotals.keys()];
  return {
    labels: groupOrder.map((key) => groupLabels.get(key)),
    series: classLabels.map((label) => ({
      label,
      values: groupOrder.map((key) => groupTotals.get(key).get(label) || 0),
    })),
  };
}

const CLASS_CHART_GROUPINGS = [
  { key: 'bin', label: '15-min interval' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'day', label: 'Day' },
  { key: 'dow', label: 'Day of week' },
  { key: 'period', label: 'Study period' },
];

// Sum one already-parsed vehicle dataset over an arbitrary clock-time window, broken down
// by classification — the single-period counterpart to fixedWindowForIntersection() above
// (same by-LABEL matching discipline, BUG-019/020), used by the Analysis screen's "your own
// peak periods" section (customWindowsSectionHtml below) rather than the Area Aggregate's
// cross-intersection fixed-window report.
function fixedWindowForParsed(parsed, startMin, endMin) {
  if (!parsed || !parsed.intervals.length) return { noData: true };
  const intervalMinutes = inferIntervalMinutes(parsed.intervals);
  const dayStartMin = toMinFromLabel(parsed.intervals[0].start);
  const slots = parsed.intervals.length;
  const dayEndMin = dayStartMin + slots * intervalMinutes;
  if (!(dayStartMin <= startMin && dayEndMin >= endMin)) return { noData: true };
  const startIdx = Math.round((startMin - dayStartMin) / intervalMinutes);
  const windowSize = Math.max(1, Math.round((endMin - startMin) / intervalMinutes));
  if (startIdx < 0 || startIdx + windowSize > slots) return { noData: true };

  let total = 0;
  const byLabel = new Map();
  parsed.types.forEach((label, ci) => {
    let sum = 0;
    for (let k = 0; k < windowSize; k++) {
      const iv = parsed.intervals[startIdx + k];
      sum += (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0);
    }
    if (sum) byLabel.set(label, (byLabel.get(label) || 0) + sum);
    total += sum;
  });
  return { noData: false, total, byLabel };
}

function customWindowResultHtml(vehParsed, w) {
  const fmtN = (n) => n.toLocaleString();
  const r = fixedWindowForParsed(vehParsed, w.startMin, w.endMin);
  if (r.noData) {
    return `<div class="stat-detail" style="color:var(--text3)">No data for this window — this period doesn't cover ${minToTimeStr(w.startMin)}–${minToTimeStr(w.endMin)}.</div>`;
  }
  const breakdown = [...r.byLabel.entries()].map(([label, v]) => `${escapeHtmlMain(label)}: ${fmtN(v)}`).join(' · ');
  return `<div class="stat-detail" style="font-weight:600;color:var(--text)">${fmtN(r.total)} vehicles<div style="font-weight:400;font-size:11px;color:var(--text3);margin-top:2px">${breakdown}</div></div>`;
}

// Named/saved custom time windows for THIS period's vehicle data — mirrors Trip Gen's
// customWindowsSectionHtml (analysis/ui/tripgenSection.js) but reads/writes the module-level
// intersectionCustomWindows list declared near fixedWindowStartMin above instead of a
// per-project entries array. Live-project-only (see that declaration's header comment).
function customWindowsSectionHtml(vehParsed) {
  const rows = intersectionCustomWindows.map((w) => `
    <div class="card" style="margin-bottom:10px" data-ixcw="${w.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px">
        <h3 style="margin:0">${escapeHtmlMain(w.label)} (${minToTimeStr(w.startMin)}–${minToTimeStr(w.endMin)})</h3>
        <button type="button" class="no-print" data-ixcw-remove="${w.id}" style="font-size:11px;flex-shrink:0">× remove</button>
      </div>
      ${customWindowResultHtml(vehParsed, w)}
    </div>
  `).join('');
  return `
    <div class="card" style="margin-bottom:14px">
      <h3>Your own peak periods</h3>
      <div class="stat-detail" style="margin-bottom:10px">Name any clock-time window (e.g. "School dismissal") and see this period's vehicle volume for exactly that window — not just the detected peak hour.</div>
      ${rows || '<div class="stat-detail" style="margin-bottom:10px">No custom windows saved yet.</div>'}
      <div class="no-print" style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding-top:12px;margin-top:${intersectionCustomWindows.length ? '4px' : '0'};border-top:.5px dashed var(--border2)">
        <div class="setup-field"><label>name</label><input type="text" id="ixcw-name" placeholder="e.g. Lunch rush" style="width:160px"></div>
        <div class="setup-field"><label>start</label><input type="time" id="ixcw-start" value="08:30"></div>
        <div class="setup-field"><label>end</label><input type="time" id="ixcw-end" value="09:30"></div>
        <button type="button" class="btn-primary" id="ixcw-add" style="height:34px">+ add window</button>
      </div>
    </div>`;
}

// A per-classification stacked-bar + total-volume-line combo chart for this period's vehicle
// data — the intersection counterpart to Trip Gen's mountTgClassComboChart (analysis/ui/
// tripgenSection.js), minus the classification-grouping toggle (that feature stays Trip-Gen-
// only for now — see DEVLOG). Reuses renderComboChart exactly, so the two screens' combo
// charts never drift visually.
function mountIntersectionComboChart(container, { parsed }) {
  const types = parsed.types || [];
  const visible = new Set(types);

  function sumAt(cls, i) {
    const ci = types.indexOf(cls);
    if (ci < 0) return 0;
    const iv = parsed.intervals[i];
    return (iv.inbound[ci] || 0) + (iv.outbound[ci] || 0);
  }

  function computeBarSeries() {
    return types.filter((c) => visible.has(c)).map((c) => ({
      label: c, colorVar: SERIES_COLOR_VARS[types.indexOf(c) % SERIES_COLOR_VARS.length],
      values: parsed.intervals.map((_, i) => sumAt(c, i)),
    }));
  }

  function computeLineSeries() {
    const active = types.filter((c) => visible.has(c));
    return [{
      label: 'Total', colorVar: '--chart-line', dashed: false,
      values: parsed.intervals.map((_, i) => active.reduce((s, c) => s + sumAt(c, i), 0)),
    }];
  }

  function paint() {
    const chartRoot = container.querySelector('.ix-combo-chart-root');
    if (!chartRoot) return;
    if (!types.length) { chartRoot.innerHTML = '<div class="stat-detail">No vehicle-class data available.</div>'; return; }
    if (visible.size === 0) { chartRoot.innerHTML = '<div class="stat-detail">No classifications selected — check at least one above.</div>'; return; }
    const labels = parsed.intervals.map((iv) => iv.label || `${iv.start}–${iv.end}`);
    chartRoot.innerHTML = renderComboChart({ labels, barSeries: computeBarSeries(), lineSeries: computeLineSeries() });
  }

  container.innerHTML = `
    <div class="chart-controls-row no-print viewer-keep">
      <div class="chart-class-checks">
        ${types.map((c) => `<label class="chart-check"><input type="checkbox" data-ix-combo-cls="${escapeHtmlMain(c)}" checked> ${escapeHtmlMain(c)}</label>`).join('')}
      </div>
    </div>
    <div class="ix-combo-chart-root"></div>
  `;
  container.querySelectorAll('[data-ix-combo-cls]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) visible.add(cb.dataset.ixComboCls); else visible.delete(cb.dataset.ixComboCls);
      paint();
    });
  });
  paint();
}

// `container` is scoped to the pane that called renderAnalyzePeriodContent (each analyze
// pane gets its own root, per BUG-017 — no ids shared across simultaneously-mounted
// panes), and this whole section is rebuilt fresh every time that pane repaints, so the
// `grouping` toggle state below lives only as long as this one render call.
function renderVehicleClassStackedSection(container, { vehParsed, allPeriods }) {
  let grouping = 'bin';

  function paint() {
    const chartRoot = container.querySelector('.vcls-chart-root');
    if (!chartRoot) return;
    const { labels, series } = (grouping === 'bin' || grouping === 'hourly')
      ? classSeriesFromVehParsed(vehParsed, grouping)
      : classSeriesAcrossPeriods(allPeriods, grouping);
    if (!labels.length || !series.length) {
      chartRoot.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:10px 0">No vehicle-class data available for this grouping.</div>';
      return;
    }
    chartRoot.innerHTML = renderStackedBarChart({ labels, series });
  }

  container.innerHTML = `
    <div class="vcls-toolbar dataset-tabs no-print viewer-keep" style="margin-bottom:12px">
      ${CLASS_CHART_GROUPINGS.map((g, i) => `<button class="dataset-tab vcls-grp-btn${i === 0 ? ' active' : ''}" data-grp="${g.key}">${g.label}</button>`).join('')}
    </div>
    <div class="vcls-chart-root"></div>
  `;
  container.querySelectorAll('.vcls-grp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.vcls-grp-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      grouping = btn.dataset.grp;
      paint();
    });
  });
  paint();
}

// ── Analyze: single-period content ───────────────────────────────────────────
// `ctx` optionally carries { intersection, vPairs, readOnly } — see parsedFromPeriod
// above. When readOnly (area-study snapshot view), the live-state-only features
// (print report / export page / before-after comparison, which all pull from live
// globals like periodMeta/projectInfo/cfg) are hidden rather than wired to the
// wrong data.
async function renderAnalyzePeriodContent(root, vehParsed, pedParsed, tmcParsed, ctx = {}) {
  const ix = ctx.intersection || intersection;
  const vp = ctx.vPairs || vPairs;
  const readOnly = !!ctx.readOnly;
  const hasTmc = ix.approaches.some((a) => a.destinations.length);
  const _tmcTypes = vp.filter(p=>p.includeTmc);
  const bikeIdx = _tmcTypes.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
  const motorIdx = _tmcTypes.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
  const hasBikes = hasTmc && bikeIdx.length > 0;
  const hasMotor = hasTmc && motorIdx.length > 0;

  root.innerHTML = `
    <div class="dataset-tabs no-print viewer-keep" id="analyze-dataset-tabs" style="display:flex;align-items:center;gap:0">
      <button class="dataset-tab active" data-kind="vehicle">Vehicle</button>
      <button class="dataset-tab" data-kind="ped">Pedestrian</button>
      ${hasTmc ? '<button class="dataset-tab" data-kind="tmc">Turning movements</button>' : ''}
      ${readOnly ? '' : `
      <button class="dataset-tab" style="margin-left:auto;border-left:.5px solid var(--border)" onclick="openPrintReport()">⎙ Print report</button>
      <button class="dataset-tab" id="btn-share-report" style="border-left:.5px solid var(--border)">↓ Export page</button>`}
    </div>
    <div class="section"><div class="section-head"><h2>Summary</h2></div><div id="analyze-summary-root"></div></div>
    <div class="section"><div class="section-head"><h2>Volume by vehicle class</h2></div><div id="analyze-classchart-root"></div></div>
    <div class="section"><div class="section-head"><h2>Classification breakdown over time</h2></div><div id="analyze-combochart-root"></div></div>
    ${readOnly ? '' : '<div class="section"><div class="section-head"><h2>Your own peak periods</h2></div><div id="analyze-customwin-root"></div></div>'}
    <div class="section"><div class="section-head"><h2>Data quality</h2></div><div id="analyze-qa-root"></div></div>
    ${hasMotor ? `<div class="section"><div class="section-head"><h2>Turning movements${hasBikes ? ' — motor vehicles' : ''}</h2></div><div id="analyze-tmc-root"></div></div>` : ''}
    ${hasBikes ? `<div class="section"><div class="section-head"><h2>Turning movements — bicycles</h2></div><div id="analyze-bike-root"></div></div>` : ''}
    ${hasTmc && !hasMotor && !hasBikes ? '<div class="section"><div class="section-head"><h2>Turning movements</h2></div><div id="analyze-tmc-root"></div></div>' : ''}
    <div class="section no-print viewer-keep"><div class="section-head"><h2>Interval detail</h2></div><div id="analyze-interval-root"></div></div>
    ${readOnly ? '' : '<div class="section no-print"><div class="section-head"><h2>Before / After comparison</h2></div><div id="analyze-compare-root"></div></div>'}
  `;

  let activeKind = 'vehicle';
  // renderIntervalDetailSection is async (it awaits analysisData.peakHour for the new
  // "% of peak hour" column) and writes into a container shared across dataset-tab
  // switches — a generation guard stops a slow-resolving stale paint (e.g. rapid
  // vehicle→ped→tmc clicking) from overwriting a newer one's DOM, same discipline as
  // BUG-022's fix. Scoped to this closure/root, not module-level, since a fresh one of
  // these closures is created per renderAnalyzePeriodContent() call anyway.
  let _intervalPaintGen = 0;

  function paintQA() {
    const qaRoot = root.querySelector('#analyze-qa-root');
    if (!qaRoot) return;
    const findings = activeKind === 'vehicle'
      ? runVehicleQA(vehParsed)
      : runTmcQA(hasBikes ? filterTmcParsedByIndices(tmcParsed, motorIdx) : tmcParsed);
    // "Wrong mode" cross-check: turning movements are enabled and approaches are actually
    // configured (so TMC data COULD have been recorded), but essentially none was recorded
    // anywhere in the study while real vehicle in/out volume exists — the fingerprint of a
    // field session counted entirely in vehicle mode instead of turning-movement mode (the
    // user hit this and lost a count to it). Checked across every period (ctx.allPeriods),
    // not just the one in view, so a genuinely wrong-mode session is caught regardless of
    // which period tab happens to be open, and shown on both the Vehicle and Turning
    // movements tabs since either could be the one the user is looking at when they notice.
    // Thresholds: TMC_NEGLIGIBLE is a small ABSOLUTE count (not a % of vehicle volume) —
    // a genuinely low-but-real turning-movement study can still be a small percentage of
    // vehicle volume without being a mode mistake, so this must stay strict/absolute rather
    // than proportional. VEH_NONTRIVIAL keeps this from firing on a barely-started project
    // where neither mode has much data yet (not an error, just not started).
    if (enabledModes.turning && hasTmc) {
      const TMC_NEGLIGIBLE = 3;
      const VEH_NONTRIVIAL = 50;
      const allP = ctx.allPeriods || [];
      const tmcTotalAll = allP.reduce((s, p) => s + tmcStudyTotal(p.tmcParsed), 0);
      const vehTotalAll = allP.reduce((s, p) => s + vehStudyTotal(p.vehParsed), 0);
      if (tmcTotalAll <= TMC_NEGLIGIBLE && vehTotalAll >= VEH_NONTRIVIAL) {
        findings.push({
          severity: 'error',
          code: 'WRONG_MODE',
          message: `Turning-movement data is empty (${tmcTotalAll} recorded) but vehicle in/out counts show ${vehTotalAll.toLocaleString()} vehicles — check you were in Turning Movement mode while counting.`,
        });
      }
    }
    renderQASection(qaRoot, findings, { collapsed: !!ctx.viewerMode });
  }

  async function paintInterval() {
    const gen = ++_intervalPaintGen;
    const intervalRoot = root.querySelector('#analyze-interval-root');
    if (!intervalRoot) return;
    const kind = activeKind;
    const html = await buildIntervalDetailMarkup(kind, vehParsed, pedParsed, tmcParsed);
    if (gen !== _intervalPaintGen) return; // a newer paint started while this one awaited — don't overwrite it
    renderIntervalDetailSection(intervalRoot, kind, html);
  }

  async function paintSummary() {
    const parsed = activeKind === 'vehicle' ? vehParsed : activeKind === 'ped' ? pedParsed : tmcParsed;
    await renderSummary(root.querySelector('#analyze-summary-root'), activeKind, [{ id: 1, dayLabel: 'Current session', parsed }]);
  }
  root.querySelectorAll('.dataset-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.dataset-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeKind = btn.dataset.kind;
      paintSummary();
      paintQA();
      paintInterval();
    });
  });
  await paintSummary();
  paintQA();
  paintInterval();
  const classChartRoot = root.querySelector('#analyze-classchart-root');
  if (classChartRoot) {
    renderVehicleClassStackedSection(classChartRoot, {
      vehParsed,
      allPeriods: ctx.allPeriods && ctx.allPeriods.length ? ctx.allPeriods : [{ name: 'Current session', meta: {}, vehParsed }],
    });
  }
  const comboChartRoot = root.querySelector('#analyze-combochart-root');
  if (comboChartRoot) mountIntersectionComboChart(comboChartRoot, { parsed: vehParsed });

  if (!readOnly) {
    const cwRoot = root.querySelector('#analyze-customwin-root');
    if (cwRoot) {
      const paintCustomWindows = () => {
        cwRoot.innerHTML = customWindowsSectionHtml(vehParsed);
        cwRoot.querySelector('#ixcw-add')?.addEventListener('click', () => {
          const name = cwRoot.querySelector('#ixcw-name').value.trim();
          const startMin = toMinFromLabel(cwRoot.querySelector('#ixcw-start').value || '08:30');
          const endMin = toMinFromLabel(cwRoot.querySelector('#ixcw-end').value || '09:30');
          if (!name) { alert('Name this window first.'); return; }
          if (endMin <= startMin) { alert('End time must be after start time.'); return; }
          intersectionCustomWindows.push({ id: intersectionCustomWindowNextId++, label: name, startMin, endMin });
          paintCustomWindows();
          window.scheduleAutosave?.();
        });
        cwRoot.querySelectorAll('[data-ixcw-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = Number(btn.dataset.ixcwRemove);
            const idx = intersectionCustomWindows.findIndex((w) => w.id === id);
            if (idx >= 0) intersectionCustomWindows.splice(idx, 1);
            paintCustomWindows();
            window.scheduleAutosave?.();
          });
        });
      };
      paintCustomWindows();
    }
  }

  if (hasMotor) {
    await renderTmcSection(root.querySelector('#analyze-tmc-root'), filterTmcParsedByIndices(tmcParsed, motorIdx));
  } else if (hasTmc && !hasBikes) {
    await renderTmcSection(root.querySelector('#analyze-tmc-root'), tmcParsed);
  }
  if (hasBikes) {
    await renderTmcSection(root.querySelector('#analyze-bike-root'), filterTmcParsedByIndices(tmcParsed, bikeIdx));
  }


  const compareRoot = root.querySelector('#analyze-compare-root');
  if (compareRoot && !readOnly) {
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

  if (!readOnly) {
    root.querySelector('#btn-share-report')?.addEventListener('click', () => {
      exportShareablePage(
        { ...projectInfo, date: periodMeta.date || projectInfo.date, weather: periodMeta.weather || projectInfo.weather, counterName: periodMeta.observer || projectInfo.counterName, studyPurpose: periodMeta.notes || projectInfo.studyPurpose, equipment: periodMeta.equipment },
        intersection, vehParsed, pedParsed, tmcParsed, motorIdx, bikeIdx, hasBikes, cfg?.intervalMin || 15
      );
    });
  }
}

// ── Analyze: interval-by-interval detail table (collapsed by default) ────────
// Demoted, secondary view of the raw per-interval numbers — kept out of the main
// visual hierarchy (stat cards → chart → data quality → detail tables) but still
// fully available via the <details> expand toggle. Shared by every analyze
// context (live and snapshot) since it only touches the already-normalized
// vehParsed/pedParsed/tmcParsed shapes, never global/live state directly.
// intervalBar() / pctOfPeakCell() now live in analysis/ui/intervalDetail.js (imported
// above) — shared with Trip Gen's new Interval Detail table so the "% of peak hour" formula
// never drifts between the two.

// Pure — computes the markup string without touching the DOM, so callers can await it
// and check a staleness guard before writing (see paintInterval() in
// renderAnalyzePeriodContent()).
async function buildIntervalDetailMarkup(activeKind, vehParsed, pedParsed, tmcParsed) {
  let headCols, rows, count;

  if (activeKind === 'vehicle') {
    const { intervals } = vehParsed;
    const inTotals = intervals.map(iv => iv.inbound.reduce((a,b) => a+(b||0), 0));
    const outTotals = intervals.map(iv => iv.outbound.reduce((a,b) => a+(b||0), 0));
    const totals = intervals.map((_, i) => inTotals[i] + outTotals[i]);
    const maxT = Math.max(...totals, 1);
    const peakIdx = totals.reduce((bi, v, i) => v > totals[bi] ? i : bi, 0);
    const peak = await analysisData.peakHour(intervals, inferIntervalMinutes(intervals), 'vehicle');
    headCols = '<th class="ix-th">Interval</th><th class="ix-th ix-th-r">In</th><th class="ix-th ix-th-r">Out</th><th class="ix-th ix-th-r">Total</th><th class="ix-th ix-th-r">% of peak hour</th><th class="ix-th"></th>';
    rows = intervals.map((iv, i) => `
      <tr class="ix-tr${i === peakIdx ? ' ix-tr-peak' : ''}">
        <td class="ix-td ix-td-time">${iv.start}–${iv.end}</td>
        <td class="ix-td ix-td-num">${inTotals[i].toLocaleString()}</td>
        <td class="ix-td ix-td-num">${outTotals[i].toLocaleString()}</td>
        <td class="ix-td ix-td-num ix-td-bold">${totals[i].toLocaleString()}</td>
        <td class="ix-td ix-td-num">${pctOfPeakCell(i, totals, peak)}</td>
        <td class="ix-td ix-td-bar">${intervalBar(totals[i], maxT)}</td>
      </tr>`).join('');
    count = intervals.length;
  } else if (activeKind === 'ped') {
    const { intervals, crosswalks } = pedParsed;
    const totals = intervals.map(iv => iv.counts.reduce((s, pair) => s + (pair[0]||0) + (pair[1]||0), 0));
    const maxT = Math.max(...totals, 1);
    const peakIdx = totals.reduce((bi, v, i) => v > totals[bi] ? i : bi, 0);
    const peak = await analysisData.peakHour(intervals, inferIntervalMinutes(intervals), 'ped');
    headCols = `<th class="ix-th">Interval</th>${crosswalks.map(c => `<th class="ix-th ix-th-r">${c.name}</th>`).join('')}<th class="ix-th ix-th-r">Total</th><th class="ix-th ix-th-r">% of peak hour</th><th class="ix-th"></th>`;
    rows = intervals.map((iv, i) => `
      <tr class="ix-tr${i === peakIdx ? ' ix-tr-peak' : ''}">
        <td class="ix-td ix-td-time">${iv.start}–${iv.end}</td>
        ${crosswalks.map((_, xi) => `<td class="ix-td ix-td-num">${((iv.counts[xi]?.[0]||0) + (iv.counts[xi]?.[1]||0)).toLocaleString()}</td>`).join('')}
        <td class="ix-td ix-td-num ix-td-bold">${totals[i].toLocaleString()}</td>
        <td class="ix-td ix-td-num">${pctOfPeakCell(i, totals, peak)}</td>
        <td class="ix-td ix-td-bar">${intervalBar(totals[i], maxT)}</td>
      </tr>`).join('');
    count = intervals.length;
  } else {
    const { intervals, approaches, types = [], legLabels = {} } = tmcParsed;
    const lbl = (leg) => legLabels[leg] || leg;
    const totals = intervals.map(iv => approaches.reduce((s, a) =>
      s + a.destinations.reduce((s2, d) => s2 + (iv.counts[a.leg]?.[d.leg] || []).reduce((x,y) => x+(y||0), 0), 0), 0));
    const maxT = Math.max(...totals, 1);
    const peakIdx = totals.reduce((bi, v, i) => v > totals[bi] ? i : bi, 0);
    const peak = await analysisData.peakHour(intervals, inferIntervalMinutes(intervals), 'tmc');
    headCols = '<th class="ix-th"></th><th class="ix-th">Interval</th><th class="ix-th ix-th-r">Total entering</th><th class="ix-th ix-th-r">% of peak hour</th><th class="ix-th"></th>';

    // Per-class × per-approach breakdown for one interval — entering volume, summed
    // across that approach's movements, for each vehicle class (vPairs row) in tmcParsed.types.
    const classBreakdownTable = (iv) => {
      const perClassPerApproach = types.map((t, ti) =>
        approaches.map(a => a.destinations.reduce((s, d) => s + (iv.counts[a.leg]?.[d.leg]?.[ti] || 0), 0)));
      const approachTotals = approaches.map((_, ai) => perClassPerApproach.reduce((s, row) => s + row[ai], 0));
      const grandTotal = approachTotals.reduce((a, b) => a + b, 0);
      return `
        <table class="data-table ix-detail-table">
          <thead><tr>
            <th>Class</th>
            ${approaches.map(a => `<th style="text-align:right">${escapeHtmlMain(lbl(a.leg))}</th>`).join('')}
            <th style="text-align:right">Total</th>
          </tr></thead>
          <tbody>
            ${types.map((t, ti) => `
              <tr>
                <td${t.def ? ` title="${escapeHtmlMain(t.def)}"` : ''}>${escapeHtmlMain(t.label)}${t.isBike ? ' 🚲' : ''}${t.def ? ' <span style="color:var(--text3);font-size:10px" title="' + escapeHtmlMain(t.def) + '">ⓘ</span>' : ''}</td>
                ${perClassPerApproach[ti].map(v => `<td style="text-align:right">${v.toLocaleString()}</td>`).join('')}
                <td style="text-align:right;font-weight:600">${perClassPerApproach[ti].reduce((a,b)=>a+b,0).toLocaleString()}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td>All classes</td>
            ${approachTotals.map(v => `<td style="text-align:right">${v.toLocaleString()}</td>`).join('')}
            <td style="text-align:right">${grandTotal.toLocaleString()}</td>
          </tr></tfoot>
        </table>`;
    };

    rows = intervals.map((iv, i) => `
      <tr class="ix-tr ix-tr-expandable${i === peakIdx ? ' ix-tr-peak' : ''}" data-ix-expand="${i}">
        <td class="ix-td ix-td-expand"><span class="ix-expand-caret">▸</span></td>
        <td class="ix-td ix-td-time">${iv.start}–${iv.end}</td>
        <td class="ix-td ix-td-num ix-td-bold">${totals[i].toLocaleString()}</td>
        <td class="ix-td ix-td-num">${pctOfPeakCell(i, totals, peak)}</td>
        <td class="ix-td ix-td-bar">${intervalBar(totals[i], maxT)}</td>
      </tr>
      <tr class="ix-detail-row" data-ix-detail="${i}" style="display:none">
        <td class="ix-td ix-td-detail-cell" colspan="5">${types.length ? classBreakdownTable(iv) : '<span style="color:var(--text3);font-size:12px">No vehicle-class detail available for this data.</span>'}</td>
      </tr>`).join('');
    count = intervals.length;
  }

  return `
    <details class="interval-detail">
      <summary class="interval-detail-summary">Show all ${count} interval${count !== 1 ? 's' : ''}</summary>
      <div class="interval-detail-wrap">
        <table class="ix-table">
          <thead><tr>${headCols}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>`;
}

// Writes buildIntervalDetailMarkup()'s output into `container` and wires the tmc
// expand/collapse click handlers. Kept separate from the (pure, awaitable) builder above
// so callers can insert a staleness check between "finished computing" and "write to DOM".
function renderIntervalDetailSection(container, activeKind, html) {
  container.innerHTML = html;
  if (activeKind === 'tmc') {
    container.querySelectorAll('.ix-tr-expandable').forEach(tr => {
      tr.addEventListener('click', () => {
        const idx = tr.dataset.ixExpand;
        const detail = container.querySelector(`.ix-detail-row[data-ix-detail="${idx}"]`);
        if (!detail) return;
        const open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : '';
        tr.classList.toggle('ix-tr-expanded', !open);
      });
    });
  }
}

// ── Analyze: source-of-truth resolver — live counting state vs. read-only snapshot ──
// Both `renderIntersectionAnalysis` and the workspace sidebar's Analyze/Charts screen
// route through the same rendering path below; this is the seam between them. Live
// mode reads/writes the actual global counting state (periods, activePeriodIdx, the
// "currently counting" indicator, captureActivePeriod flush). Snapshot mode (an
// area-study child intersection, or any other read-only serialized snapshot) never
// touches those globals — it only reads the passed-in snapshot object.
function analysisSource(snapshotCtx) {
  if (snapshotCtx) {
    return {
      periods: (snapshotCtx.periods || []).map(p => ({ name: p.name, data: p })),
      activePeriodIdx: -1, // no "currently counting" period in a read-only snapshot
      ctx: { intersection: snapshotCtx.intersection || intersection, vPairs: snapshotCtx.vPairs || vPairs, readOnly: true, viewerMode: !!snapshotCtx.viewerMode },
      captureActive() {}, // no-op — nothing live to flush
    };
  }
  return {
    periods,
    activePeriodIdx,
    ctx: { intersection, vPairs, readOnly: false },
    captureActive() { if (periods.length > 0) periods[activePeriodIdx].data = captureActivePeriod(); },
  };
}

// ── Analyze: all-periods comparison view ─────────────────────────────────────
function renderAllPeriodsView(root, src) {
  const periodsArr = src.periods;
  const ix = src.ctx.intersection;
  const vp = src.ctx.vPairs;
  const motorIdx = vp.filter(p=>p.includeTmc).map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
  const fmt2 = (m) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  const cols = periodsArr.map((p, i) => {
    const pd = (i === src.activePeriodIdx && !src.ctx.readOnly) ? captureActivePeriod() : p.data;
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
    for (const a of ix.approaches) {
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
    ['Date',           cols.map(c => c.date ? dateLabelWithWeekday(c.date) : '—')],
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

  const labels = cols.map(c => c.name);
  const vehicleChart = renderStackedBarChart({
    labels,
    series: [
      { label: 'Vehicle in', values: cols.map(c => c.vehIn) },
      { label: 'Vehicle out', values: cols.map(c => c.vehOut) },
    ],
  });
  // TMC and pedestrian totals are typically an order of magnitude apart (TMC counts every
  // turning movement, pedestrian counts crossings) — sharing one chart axis would flatten
  // the pedestrian bars to nearly nothing, so each gets its own chart rather than one
  // combined multi-series chart.
  const tmcChart = renderMultiSeriesBarChart({
    labels,
    series: [{ label: 'TMC total (motor)', values: cols.map(c => c.tmcTotal) }],
  });
  const pedChart = renderMultiSeriesBarChart({
    labels,
    series: [{ label: 'Pedestrian total', values: cols.map(c => c.pedTotal) }],
  });

  root.innerHTML = `
    <div class="section">
      <div class="section-head"><h2>All periods — summary</h2></div>
      <div class="card" style="margin-bottom:14px">
        <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">Vehicle volume by period</h2></div>
        ${vehicleChart}
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">TMC volume by period</h2></div>
        ${tmcChart}
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">Pedestrian volume by period</h2></div>
        ${pedChart}
      </div>
      <div style="overflow-x:auto">
        <table class="ap-table">${header}${rows}</table>
      </div>
    </div>`;
}

// ── Analyze: main entry point ─────────────────────────────────────────────────
// Consolidated render path for all four analyze/charts contexts in the app:
//  (a) standalone #analyze-screen                — renderIntersectionAnalysis(null)
//  (b) inline Count-screen pane (#counter-analyze-pane) — renderIntersectionAnalysis(pane)
//  (c) workspace sidebar Analyze/Charts, standalone intersection project — renderIntersectionAnalysis(container)
//  (d) workspace sidebar Analyze/Charts, area-study child — renderIntersectionAnalysis(container, snapshotCtx)
// `snapshotCtx` (optional) = { periods, intersection, vPairs } — a read-only serialized
// snapshot (e.g. an area-study child's areaIntersections[i].snapshot). When omitted,
// this reads/writes the live global counting state instead (see analysisSource()).
async function renderIntersectionAnalysis(containerEl = null, snapshotCtx = null) {
  const src = analysisSource(snapshotCtx);
  src.captureActive(); // flush live state into the active period before any reads (no-op for snapshots)

  const pane = containerEl || document.getElementById('analyze-screen');
  if (!pane) return;

  // Period picker bar — find or create inside the pane
  let periodBar = pane.querySelector('.analyze-period-bar');
  if (!periodBar) {
    periodBar = document.createElement('div');
    periodBar.className = 'analyze-period-bar no-print viewer-keep';
    pane.insertBefore(periodBar, pane.firstChild);
  }

  // Track which period/view is selected (independent of active counting period).
  // Callers that switch to a different snapshot (e.g. showIntersectionAnalysis
  // opening a different area-study child) should reset pane._viewPeriodIdx = null
  // first so the view defaults back to period 0 rather than carrying over an
  // index from whichever intersection was viewed previously.
  if (pane._viewPeriodIdx == null) pane._viewPeriodIdx = Math.max(0, src.activePeriodIdx);

  function buildPeriodBar() {
    const vpi = pane._viewPeriodIdx;
    const periodsArr = src.periods;
    periodBar.innerHTML = '';
    if (periodsArr.length <= 1) { periodBar.style.display = 'none'; return; }
    periodBar.style.display = 'flex';
    periodsArr.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.className = 'apb-tab' + (vpi === i ? ' active' : '');
      const pCfg = p.data.cfg;
      const fmt2 = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      const timeRange = pCfg?.startMinutes != null
        ? `${fmt2(pCfg.startMinutes)}–${fmt2(pCfg.startMinutes + pCfg.durationMin)}`
        : '';
      btn.innerHTML = `<span class="apb-tab-name">${p.name}</span>${timeRange ? `<span class="apb-tab-time">${timeRange}</span>` : ''}`;
      btn.title = timeRange;
      if (i === src.activePeriodIdx) {
        const dot = document.createElement('span');
        dot.className = 'apb-active-dot';
        dot.title = 'Currently counting in this period';
        btn.appendChild(dot);
      }
      btn.addEventListener('click', () => {
        pane._viewPeriodIdx = i;
        buildPeriodBar();
        repaintContent();
      });
      periodBar.appendChild(btn);
    });
    if (periodsArr.length >= 2) {
      const allBtn = document.createElement('button');
      allBtn.className = 'apb-tab apb-all' + (vpi === 'all' ? ' active' : '');
      allBtn.textContent = 'All periods';
      allBtn.addEventListener('click', () => {
        pane._viewPeriodIdx = 'all';
        buildPeriodBar();
        repaintContent();
      });
      periodBar.appendChild(allBtn);
    }
  }

  // Content root — use existing #analyze-root for analyze-screen, or create one for other panes
  let root;
  if (!containerEl) {
    root = document.getElementById('analyze-root');
  } else {
    root = pane.querySelector('.analyze-root-inner');
    if (!root) {
      root = document.createElement('div');
      root.className = 'analyze-root-inner';
      pane.appendChild(root);
    }
  }

  async function repaintContent() {
    const vpi = pane._viewPeriodIdx;
    if (vpi === 'all') {
      renderAllPeriodsView(root, src);
      return;
    }
    const pData = src.periods[vpi]?.data;
    let vehParsed, pedParsed, tmcParsed;
    if (pData) {
      ({ vehParsed, pedParsed, tmcParsed } = parsedFromPeriod(pData, src.ctx));
    } else if (src.ctx.readOnly) {
      // A read-only snapshot with no period data must never fall back to live
      // counting state — that would silently show an unrelated session's numbers
      // as if they belonged to this snapshot.
      root.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px 0">No period data available.</div>';
      return;
    } else {
      vehParsed = liveVehicleParsed();
      pedParsed = livePedParsed();
      tmcParsed = liveTmcParsed();
    }
    // Per-period vehicle-class data for every period on this intersection (not just the
    // one currently in view) — needed by the "by day" / "by study period" groupings of
    // the vehicle-class stacked chart below, which compare across periods rather than
    // across intervals within one period. Built from src.periods, which captureActive()
    // already refreshed for the live-counting case at the top of this function.
    const allPeriods = src.periods.map((p) => {
      const pp = p.data ? parsedFromPeriod(p.data, src.ctx) : null;
      return {
        name: p.name,
        meta: p.data?.meta || {},
        vehParsed: pp ? pp.vehParsed : vehParsed,
        // tmcParsed alongside vehParsed (not just for the currently-viewed period) so the
        // "wrong mode" QA cross-check below can see the study's TOTAL turning-movement
        // volume across every period, not just whichever one is in view — a session
        // counted entirely in the wrong mode has zero TMC data in every period, and
        // checking only the viewed one would make the flag flicker on/off as the user
        // clicks between period tabs instead of reporting the real study-wide problem.
        tmcParsed: pp ? pp.tmcParsed : tmcParsed,
      };
    });
    await renderAnalyzePeriodContent(root, vehParsed, pedParsed, tmcParsed, { ...src.ctx, allPeriods });
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
  resetShareInfo();
  showScreen('setup-screen');
});
document.getElementById('btn-new-tripgen')?.addEventListener('click', () => {
  clearAutosave();
  projectType = 'tripgen';
  resetShareInfo();
  tripgenEntries.length = 0;
  tripgenDistribution = [];
  tripgenDistNextId = 1;
  tripgenCustomWindows = [];
  tripgenCustomWindowNextId = 1;
  for (const k in tripgenQaqcWindows) delete tripgenQaqcWindows[k];
  tripgenQaqcWindowNextId = 1;
  for (const k in tripgenQaqc) delete tripgenQaqc[k];
  tripgenMergedQaSubmissionIds = [];
  // See home-btn-tripgen's handler above — classifications are project-wide config now and
  // must be cleared explicitly for a genuinely new project.
  tgResetClassifications();
  showScreen('tripgen-setup-screen');
  renderTripgenLocationsList();
});
document.getElementById('btn-new-area-study')?.addEventListener('click', () => {
  clearAutosave();
  areaIntersections.length = 0;
  activeIntersectionIdx = 0;
  projectType = 'area';
  resetShareInfo();
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
document.getElementById('btn-ix-analysis-back')?.addEventListener('click', () => {
  if (projectType === 'intersection') window.goToCountMode();
  else showSummaryScreen();
});
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
document.getElementById('btn-ix-qaqc-open')?.addEventListener('click', () => {
  showIntersectionQaqc(activeIntersectionIdx);
});
document.getElementById('btn-ix-sl-open')?.addEventListener('click', () => {
  // Unlike showIntersectionQaqc(), this never reassigns activeIntersectionIdx — it's only
  // reachable from ix-analysis-screen, which already has the right intersection loaded as
  // the "currently drilled into" one, so no flushPendingAutosave()/sidebar-highlight
  // bookkeeping is needed here (see showIntersectionQaqc()'s header comment for when that
  // IS needed — an actual idx change).
  _sidebarActiveItem = `area-ix-${activeIntersectionIdx}`;
  showScreen('streetlight-compare-screen');
  renderStreetlightCompareScreen({ areaIdx: activeIntersectionIdx });
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

function migrateVPairsFromLegacyTmc(legacyTmcPairs) {
  vPairs.forEach(p => {
    if (p.tmcKey   === undefined) p.tmcKey   = p.inKey || '';
    if (p.includeTmc === undefined) p.includeTmc = false;
    if (p.isBike   === undefined) p.isBike   = false;
  });
  if (!legacyTmcPairs || !legacyTmcPairs.length) return;
  const matched = new Set();
  legacyTmcPairs.forEach(t => {
    const lbl = (t.label || '').toLowerCase();
    const vp = vPairs.find(p => p.label.toLowerCase() === lbl);
    if (vp) {
      vp.includeTmc = true;
      if (t.key) vp.tmcKey = t.key;
      matched.add(vp);
    } else {
      vPairs.push({ label:t.label||'', def:t.def||'', inKey:'', outKey:'', icon:null,
        tmcKey:t.key||'', includeTmc:true, isBike:!!t.isBike });
    }
  });
}

function loadTmcCsvData(parsed) {
  // ── cfg ──
  Object.assign(cfg, parsed.cfg);

  // ── vehicle types (convert legacy tmcPairs → vPairs with new fields) ──
  if (parsed.tmcPairs && parsed.tmcPairs.length) {
    setVPairs(parsed.tmcPairs.map(t => ({
      label:t.label||'', def:t.def||'', inKey:'', outKey:'', icon:null,
      tmcKey:t.key||'', includeTmc:true, isBike:!!t.isBike,
    })));
  }

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
  const { meta, periods: parsedPeriods, classNames } = sheet;
  const locName = [meta.locationNS, meta.locationEW].filter(Boolean).join(' & ') || sheet.sheetName;
  const newIntersection = buildTmcIntersectionFromMeta(meta);
  // Build one vPairs row per distinct vehicle class the source file actually contains
  // (Car/Truck/Bus/Bike, etc.), preserving the file's own class set and first-seen order —
  // rather than collapsing everything non-bike into a single "Motor" bucket.
  const classes = classNames && classNames.length ? classNames : ['Motor'];
  const usedKeys = new Set();
  const newVPairs = classes.map(name => {
    const key = 'abcdefghijklmnopqrstuvwxyz'.split('').find(c => !usedKeys.has(c)) || '?';
    usedKeys.add(key);
    return {
      label: name, def: '', inKey: '', outKey: '', icon: null,
      tmcKey: key, includeTmc: true, isBike: /^(bike|bicycle)$/i.test(name),
    };
  });
  return {
    version: 2, projectType: 'intersection', mode: 'turning',
    vPairs: newVPairs,
    intersection: newIntersection,
    fnames: { vehicle: locName, ped: locName, tmc: locName },
    activePeriodIdx: 0,
    intersectionQaqc: {},
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

// Reconcile a newly-imported TMC sheet's vehicle classes (vPairs) against an already-imported
// area-study intersection's vPairs before merging periods. Different sheets in the same source
// file (e.g. an AM sheet and a PM sheet) are not guaranteed to report the same class set/order —
// a naive periods.push() would silently misalign tmcData columns against the existing vPairs
// labels (e.g. a period's "Truck" numbers ending up under the "Bus" column). Extends
// existingSnapshot.vPairs with any class the new sheet has that the project doesn't yet
// (zero-padding every already-merged period for that new column), then returns the new sheet's
// periods with their tmcData remapped into the existing vPairs' column order.
function reconcileTmcClasses(existingSnapshot, newSnapshot) {
  const existingVPairs = existingSnapshot.vPairs;
  const labelIndex = new Map(existingVPairs.map((p, i) => [p.label.toLowerCase(), i]));
  const usedKeys = new Set(existingVPairs.map(p => p.tmcKey));

  newSnapshot.vPairs.forEach((np) => {
    const key = np.label.toLowerCase();
    if (!labelIndex.has(key)) {
      const newIdx = existingVPairs.length;
      const freeKey = 'abcdefghijklmnopqrstuvwxyz'.split('').find(c => !usedKeys.has(c)) || '?';
      usedKeys.add(freeKey);
      existingVPairs.push({ ...np, tmcKey: freeKey });
      labelIndex.set(key, newIdx);
      existingSnapshot.periods.forEach((p) => {
        Object.values(p.tmcData || {}).forEach((toMap) => {
          Object.values(toMap).forEach((slotArr) => {
            slotArr.forEach((typeArr) => { typeArr[newIdx] = 0; });
          });
        });
      });
    }
  });

  const remap = newSnapshot.vPairs.map((np) => labelIndex.get(np.label.toLowerCase()));
  const finalLen = existingVPairs.length;

  return newSnapshot.periods.map((p) => {
    const remappedTmcData = {};
    Object.entries(p.tmcData || {}).forEach(([from, toMap]) => {
      remappedTmcData[from] = {};
      Object.entries(toMap).forEach(([to, slotArr]) => {
        remappedTmcData[from][to] = slotArr.map((typeArr) => {
          const out = Array(finalLen).fill(0);
          typeArr.forEach((v, oldIdx) => { out[remap[oldIdx]] = v; });
          return out;
        });
      });
    });
    return { ...p, tmcData: remappedTmcData };
  });
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
      const remappedPeriods = reconcileTmcClasses(existing.snapshot, snapshot);
      const newPeriods = remappedPeriods.filter(
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
    vPairs: [{ label: 'Vehicles', inKey: 'a', outKey: 'z', icon: null, tmcKey: 'a', includeTmc: true, isBike: false }],
    intersection: newIntersection,
    fnames: { vehicle: locName, ped: locName, tmc: locName },
    activePeriodIdx: 0,
    intersectionQaqc: {},
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
  // Preserve any QA/QC recount data already stored for this area-study slot. This
  // function only ever runs in area-study contexts (see call sites) — the standalone
  // live `intersectionQaqc` global is a completely separate store (see the big comment
  // block above its declaration) and must never leak in here. Carrying forward whatever
  // was already on areaIntersections[activeIntersectionIdx].snapshot stops a routine
  // re-serialize (autosave, hub tab switch, new sheet import) from wiping out recount
  // data written directly into that snapshot by the area-study QA/QC screen.
  const existingQaqc = (activeIntersectionIdx >= 0 && areaIntersections[activeIntersectionIdx]?.snapshot?.intersectionQaqc) || {};
  // Same carry-forward rationale as existingQaqc immediately above, for the StreetLight
  // comparison bucket (see streetlightComparison's header comment) — a routine re-serialize
  // must never wipe out an already-imported StreetLight file's data.
  const existingSl = (activeIntersectionIdx >= 0 && areaIntersections[activeIntersectionIdx]?.snapshot?.streetlightComparison) || {};
  return {
    version: 2, projectType: 'intersection', mode,
    keybindCfg: { ...keybindCfg },
    vPairs: JSON.parse(JSON.stringify(vPairs)),
    intersection: JSON.parse(JSON.stringify(intersection)),
    fnames: { ...fnames },
    activePeriodIdx,
    intersectionQaqc: existingQaqc,
    streetlightComparison: existingSl,
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
    cells += '<td class="sum-td"><button class="sum-review-btn" data-idx="' + r.i + '">review →</button> <button class="sum-qaqc-btn" data-idx="' + r.i + '">QA/QC →</button></td>';
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
  container.querySelectorAll('.sum-qaqc-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showIntersectionQaqc(+btn.dataset.idx); });
  });
  container.querySelectorAll('tr.sum-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.sum-review-btn, .sum-qaqc-btn, .sum-check')) return;
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

// ═══════════════════════════════════════════
// AREA-WIDE STUDY AGGREGATE ANALYZE VIEW
// ═══════════════════════════════════════════
// Study-wide roll-up across every intersection in an area study — stat cards, a
// vehicle-class breakdown, and a data-completeness / QA-QC-coverage table, mirroring
// the visual language of the single-intersection Analyze screen (.stat-card / .card-grid,
// defined in analysis/style.css and already used by renderSummary() — NOT a new class
// system) rather than the Summary screen's sortable table. This is explicitly NOT a
// replacement for Summary — Summary is a per-intersection roll-up table + corridor
// chart; this view answers "how did the whole study go" in one glance. Read-only: never
// writes to any snapshot, and any drill-down reuses the existing showIntersectionAnalysis
// / showIntersectionQaqc entry points rather than hand-rolling navigation (see BUG-020's
// header comment for why hand-rolled drill-down navigation is exactly the risky pattern
// to avoid here).
//
// Vehicle-class aggregation is done by matching vPairs[i].LABEL across intersections,
// never by array index — different intersections/imported files can have different
// vPairs orderings or sets (see reconcileTmcClasses()'s header comment and BUG-019 in
// BUGS.md for the exact silent-misalignment failure mode this avoids).

function showAreaAggregateScreen() {
  const titleEl = document.getElementById('area-agg-project-title');
  const subEl = document.getElementById('area-agg-subtitle');
  if (titleEl) titleEl.textContent = projectInfo.projectName || 'Untitled project';
  if (subEl) subEl.textContent = [projectInfo.companyName, projectInfo.studyPurpose].filter(Boolean).join(' · ');
  _sidebarActiveItem = 'area-aggregate';
  renderAppSidebar();
  showScreen('area-aggregate-screen');
  renderAreaAggregateContent();
}
window.showAreaAggregateScreen = showAreaAggregateScreen;

// Per-vPairs-label totals across every intersection's every period. Returns an array of
// { label, isBike, total, intersections: Set<name> }, sorted by caller. Matches BY LABEL,
// not by array position — see this section's header comment.
function aggregateVehicleClassTotals() {
  const byLabel = new Map();
  const touch = (label, isBike, amount, ixName, def) => {
    if (!byLabel.has(label)) byLabel.set(label, { label, isBike: false, def: '', total: 0, intersections: new Set() });
    const entry = byLabel.get(label);
    entry.total += amount;
    if (amount > 0) entry.intersections.add(ixName);
    if (isBike) entry.isBike = true; // sticky — one intersection's row marking it bike is enough
    if (!entry.def && def) entry.def = def; // first non-empty description across intersections wins
  };
  for (const ix of areaIntersections) {
    const snap = ix.snapshot;
    if (!snap) continue;
    const vp = snap.vPairs || [];
    for (const p of (snap.periods || [])) {
      const vehTotal = (p.vData?.in || []).reduce((s, r) => s + r.reduce((a, b) => a + (b || 0), 0), 0)
                      + (p.vData?.out || []).reduce((s, r) => s + r.reduce((a, b) => a + (b || 0), 0), 0);
      if (vehTotal > 0) {
        vp.forEach((cls, i) => {
          const inSum = (p.vData.in || []).reduce((s, r) => s + (r[i] || 0), 0);
          const outSum = (p.vData.out || []).reduce((s, r) => s + (r[i] || 0), 0);
          if (inSum + outSum > 0) touch(cls.label, !!cls.isBike, inSum + outSum, ix.name, cls.def);
        });
      } else {
        // TMC mode — tmcData[from][to][slot] is an array indexed by vPairs position, same
        // shape reconcileTmcClasses() aligns across sheets during import (BUG-019).
        for (const fromLeg of Object.values(p.tmcData || {})) {
          for (const slots of Object.values(fromLeg)) {
            for (const slot of slots) {
              (slot || []).forEach((v, i) => {
                if (!v || !vp[i]) return;
                touch(vp[i].label, !!vp[i].isBike, v, ix.name, vp[i].def);
              });
            }
          }
        }
      }
    }
  }
  return [...byLabel.values()];
}

// Same per-vPairs-label aggregation as aggregateVehicleClassTotals() above, but keeps the
// breakdown PER INTERSECTION instead of collapsing across the whole study — feeds the
// Aggregate view's stacked-by-class chart (x-axis = intersection, segments = vehicle
// class). Same by-label, not by-array-position, discipline; see that function's header
// comment and BUG-019/BUG-020 in BUGS.md.
function aggregateVehicleClassTotalsByIntersection() {
  const perIx = []; // [{ ixName, byLabel: Map(label -> total) }]
  for (const ix of areaIntersections) {
    const snap = ix.snapshot;
    if (!snap) continue;
    const vp = snap.vPairs || [];
    const byLabel = new Map();
    const touch = (label, amount) => { if (amount) byLabel.set(label, (byLabel.get(label) || 0) + amount); };
    for (const p of (snap.periods || [])) {
      const vehTotal = (p.vData?.in || []).reduce((s, r) => s + r.reduce((a, b) => a + (b || 0), 0), 0)
                      + (p.vData?.out || []).reduce((s, r) => s + r.reduce((a, b) => a + (b || 0), 0), 0);
      if (vehTotal > 0) {
        vp.forEach((cls, i) => {
          const inSum = (p.vData.in || []).reduce((s, r) => s + (r[i] || 0), 0);
          const outSum = (p.vData.out || []).reduce((s, r) => s + (r[i] || 0), 0);
          touch(cls.label, inSum + outSum);
        });
      } else {
        for (const fromLeg of Object.values(p.tmcData || {})) {
          for (const slots of Object.values(fromLeg)) {
            for (const slot of slots) {
              (slot || []).forEach((v, i) => { if (v && vp[i]) touch(vp[i].label, v); });
            }
          }
        }
      }
    }
    if (byLabel.size) perIx.push({ ixName: ix.name || 'Intersection', byLabel });
  }
  const labelTotals = new Map();
  perIx.forEach(({ byLabel }) => { for (const [l, v] of byLabel) labelTotals.set(l, (labelTotals.get(l) || 0) + v); });
  const classLabels = [...labelTotals.keys()].sort((a, b) => labelTotals.get(b) - labelTotals.get(a));
  return {
    labels: perIx.map((r) => r.ixName),
    series: classLabels.map((label) => ({ label, values: perIx.map((r) => r.byLabel.get(label) || 0) })),
  };
}

// Lightweight QA/QC coverage rollup for one area-study intersection — NOT a re-run of the
// full per-window peak-detection pipeline renderIntersectionQaqcScreen() uses (that would
// mean re-running async peak search across every period × window × row for every
// intersection just to paint a summary count, which doesn't scale and isn't needed for a
// coverage rollup). Instead it scores exactly the recounts that already exist, reusing
// each recount's own already-resolved cfg.startMinutes (captured once, at recount time)
// as the window instead of re-detecting it, then reuses the same
// analysisData.qaqcPeakHourScore() the standalone QA/QC screen and Trip Gen QA/QC use.
// Read-only — never writes.
async function ixQaqcCoverageForIntersection(ix) {
  const snap = ix.snapshot;
  const store = snap?.intersectionQaqc;
  if (!store || !Object.keys(store).length) return { total: 0, pass: 0, fail: 0, incomplete: 0 };
  let total = 0, pass = 0, fail = 0, incomplete = 0;
  for (const [key, entry] of Object.entries(store)) {
    const recounts = entry?.recounts || [];
    if (!recounts.length) continue;
    const latest = recounts[recounts.length - 1];
    const parts = key.split('__');
    const periodIdx = Number(parts[0]);
    const modeKey = parts[2];
    const rowKey = parts.slice(3).join('__');
    const p = snap.periods?.[periodIdx];
    total++;
    if (!p || !latest?.cfg) { incomplete++; continue; }
    const intervalMin = p.cfg.intervalMin;
    const windowSize = Math.max(1, Math.round((latest.cfg.durationMin || 60) / intervalMin));
    const startIdx = Math.round((latest.cfg.startMinutes - p.cfg.startMinutes) / intervalMin);
    if (startIdx < 0) { incomplete++; continue; }
    const primaryQuarters = ixRowQuarters(
      { vData: p.vData, pedData: p.pedData, tmcData: p.tmcData },
      snap.intersection, modeKey, rowKey, startIdx, windowSize
    );
    const scoreResult = await analysisData.qaqcPeakHourScore(primaryQuarters, latest.quarters);
    if (scoreResult.rating === 'Incomplete') incomplete++;
    else if (scoreResult.overallPass) pass++;
    else fail++;
  }
  return { total, pass, fail, incomplete };
}

// Vehicle-mode-only volume for one intersection snapshot — deliberately NOT sumVehicle()
// (defined above, used by the Summary screen). sumVehicle()'s TMC-mode fallback only reads
// tmcData's class-INDEX-0 slot ("derive motor volume (index 0)"), a leftover from the old
// two-bucket [motor,bike] model that predates v3.28's multi-class TMC import — for a study
// with Car/Truck/Bus/Bike classes it silently counts only Car, undercounting (or, if Car
// itself is zero but other classes have data, wrongly zero-flagging an intersection that
// actually has data). Reusing that here would carry the same undercount into this new
// view's "Total vehicle volume" stat and its zero-count data-quality flag. Fixing
// sumVehicle() itself is out of scope (Summary screen behavior, not touched by this task);
// this aggregate view instead keeps "vehicle volume" strictly to vData (vehicle-mode
// counting) and lets sumTmc() (which already sums every class correctly, no index picking)
// cover turning-movement volume separately — see DEVLOG for the v3.30.0-alpha.1 entry.
function sumVehicleModeOnly(snap) {
  let total = 0;
  for (const p of (snap.periods || [])) {
    if (!p.vData?.in) continue;
    total += (p.vData.in || []).reduce((s, r) => s + r.reduce((a, b) => a + (b || 0), 0), 0)
           + (p.vData.out || []).reduce((s, r) => s + r.reduce((a, b) => a + (b || 0), 0), 0);
  }
  return total;
}

// ═══════════════════════════════════════════
// FIXED-WINDOW REPORT (study-wide, user-chosen clock-time window)
// ═══════════════════════════════════════════
// Different from ixDetectPeakStart()/peakHourInWindow() (which auto-DETECT each
// intersection's own busiest hour independently). Here the window is fixed by the user
// (e.g. "8:30–9:30") and every intersection is reported for exactly that clock-time span —
// fills the gap StreetLight Insight's own TMC tool has no way to answer (a common "network
// peak hour" across a group of intersections). Purely a reporting sum over already-counted
// interval data — no peak/warrant/LOS judgment involved.
//
// Module-level (not persisted — this is a live report control, not project state) so the
// picker survives re-renders of the Aggregate view without resetting to the default.
let fixedWindowStartMin = 8 * 60 + 30;   // 8:30
let fixedWindowEndMin = 9 * 60 + 30;     // 9:30

// Named, saved custom time windows for a standalone intersection project's own Analysis
// screen (renderAnalyzePeriodContent) — same idea as Trip Gen's "your own peak periods"
// section. Scoped to the live project only (persisted via serializeCurrentProject/
// loadProject below), not area-study children — those render through a read-only snapshot
// (see analysisSource()'s ctx.readOnly / renderIntersectionAnalysis's header comment) with
// no live counterpart to write into, same reasoning as the Before/After comparison section
// right above it in renderAnalyzePeriodContent.
let intersectionCustomWindows = []; // [{id, label, startMin, endMin}]
let intersectionCustomWindowNextId = 1;

// Per-intersection sum for [startMin, endMin) — matches by-LABEL (vp[i].label), same
// discipline as aggregateVehicleClassTotalsByIntersection() above (see BUG-019/020).
// Picks whichever of this intersection's periods actually CONTAINS the window; if none do,
// returns { noData: true } rather than a silent zero (multi-period intersections where only
// one period — AM, PM, or a single long period — happens to cover the requested clock time).
// Never assumes vData/pedData/tmcData are populated (BUG-025 lesson from the StreetLight
// comparison feature) — presence is checked per data type before summing.
function fixedWindowForIntersection(snap, startMin, endMin) {
  const vp = snap.vPairs || [];
  const periods = snap.periods || [];
  let period = null;
  for (const p of periods) {
    const cfg = p.cfg;
    if (!cfg || cfg.startMinutes == null || !cfg.intervalMin) continue;
    const slots = Math.max(1, Math.round((cfg.durationMin || 0) / cfg.intervalMin));
    const pEnd = cfg.startMinutes + slots * cfg.intervalMin;
    if (cfg.startMinutes <= startMin && pEnd >= endMin) { period = p; break; }
  }
  if (!period) return { noData: true };

  const cfg = period.cfg;
  const slots = Math.max(1, Math.round((cfg.durationMin || 0) / cfg.intervalMin));
  const startIdx = Math.round((startMin - cfg.startMinutes) / cfg.intervalMin);
  const windowSize = Math.max(1, Math.round((endMin - startMin) / cfg.intervalMin));
  if (startIdx < 0 || startIdx + windowSize > slots) return { noData: true };

  const hasVehData = vp.length > 0 && !!(period.vData?.in?.length);
  let vehTotal = 0;
  const vehByLabel = new Map();
  if (hasVehData) {
    vp.forEach((cls, i) => {
      let sum = 0;
      for (let k = 0; k < windowSize; k++) {
        const slotIdx = startIdx + k;
        sum += (period.vData.in[slotIdx]?.[i] || 0) + (period.vData.out[slotIdx]?.[i] || 0);
      }
      if (sum) vehByLabel.set(cls.label, (vehByLabel.get(cls.label) || 0) + sum);
      vehTotal += sum;
    });
  }

  const hasPedData = !!(period.pedData?.length);
  let pedTotal = 0;
  if (hasPedData) {
    for (const cwSlots of period.pedData) {
      for (let k = 0; k < windowSize; k++) {
        const pair = cwSlots?.[startIdx + k] || [0, 0];
        pedTotal += (pair[0] || 0) + (pair[1] || 0);
      }
    }
  }

  const hasTmcData = !!(period.tmcData && Object.keys(period.tmcData).length);
  let tmcTotal = 0;
  const tmcByLabel = new Map();
  if (hasTmcData) {
    for (const fromLeg in period.tmcData) {
      const legData = period.tmcData[fromLeg];
      for (const destLeg in legData) {
        const slotArr = legData[destLeg] || [];
        for (let k = 0; k < windowSize; k++) {
          const arr = slotArr[startIdx + k] || [];
          arr.forEach((v, i) => {
            if (!v) return;
            tmcTotal += v;
            if (vp[i]) tmcByLabel.set(vp[i].label, (tmcByLabel.get(vp[i].label) || 0) + v);
          });
        }
      }
    }
  }

  return { noData: false, periodName: period.name, hasVehData, hasPedData, hasTmcData, vehTotal, pedTotal, tmcTotal, vehByLabel, tmcByLabel };
}

// Renders just the results table for the current picker values — kept separate from the
// full renderAreaAggregateContent() so changing the window re-sums instantly without
// re-running the (async, per-recount) QA/QC coverage rollup for every intersection.
function fixedWindowTableHtml(startMin, endMin) {
  const fmt = n => n.toLocaleString();
  if (endMin <= startMin) {
    return '<div class="stat-detail" style="color:var(--bad-text)">End time must be after start time.</div>';
  }
  if (!areaIntersections.length) {
    return '<div class="stat-detail">No intersections loaded.</div>';
  }
  const rows = areaIntersections.map((ix, i) => {
    const snap = ix.snapshot;
    const name = escapeHtmlMain(ix.name || `Intersection ${i + 1}`);
    if (!snap) return `<tr><td>${name}</td><td colspan="4" style="color:var(--text3)">No count data.</td></tr>`;
    const r = fixedWindowForIntersection(snap, startMin, endMin);
    if (r.noData) {
      return `<tr><td>${name}</td><td colspan="4" style="color:var(--text3)">No data for this window — no counted period covers ${minToTimeStr(startMin)}–${minToTimeStr(endMin)}.</td></tr>`;
    }
    return `<tr>
      <td>${name}</td>
      <td style="color:var(--text3)">${escapeHtmlMain(r.periodName || '')}</td>
      <td style="text-align:right">${r.hasVehData ? fmt(r.vehTotal) : '—'}</td>
      <td style="text-align:right">${r.hasPedData ? fmt(r.pedTotal) : '—'}</td>
      <td style="text-align:right">${r.hasTmcData ? fmt(r.tmcTotal) : '—'}</td>
    </tr>`;
  }).join('');
  return `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Intersection</th><th>Period used</th><th style="text-align:right">Vehicle</th><th style="text-align:right">Pedestrian</th><th style="text-align:right">TMC</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function fixedWindowSectionHtml() {
  return `
    <div class="card" style="margin-bottom:14px">
      <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">Fixed-window report</h2></div>
      <div class="stat-detail" style="margin-bottom:10px">Pick one clock-time window and see every intersection's volume for exactly that window — not each intersection's own detected peak hour. Useful for a common "network peak hour" across the whole study, something StreetLight Insight's own TMC tool can't produce.</div>
      <div class="setup-grid" style="margin-bottom:10px;grid-template-columns:repeat(2,minmax(120px,160px))">
        <div class="setup-field"><label>window start</label><input type="time" id="fixedwin-start" value="${minToTimeStr(fixedWindowStartMin)}"></div>
        <div class="setup-field"><label>window end</label><input type="time" id="fixedwin-end" value="${minToTimeStr(fixedWindowEndMin)}"></div>
      </div>
      <div id="fixedwin-table-wrap">${fixedWindowTableHtml(fixedWindowStartMin, fixedWindowEndMin)}</div>
    </div>`;
}

function wireFixedWindowInputs() {
  const startEl = document.getElementById('fixedwin-start');
  const endEl = document.getElementById('fixedwin-end');
  const wrap = document.getElementById('fixedwin-table-wrap');
  if (!startEl || !endEl || !wrap) return;
  const refresh = () => {
    fixedWindowStartMin = toMinFromLabel(startEl.value || minToTimeStr(fixedWindowStartMin));
    fixedWindowEndMin = toMinFromLabel(endEl.value || minToTimeStr(fixedWindowEndMin));
    wrap.innerHTML = fixedWindowTableHtml(fixedWindowStartMin, fixedWindowEndMin);
  };
  startEl.addEventListener('input', refresh);
  endEl.addEventListener('input', refresh);
}

// Bumped at the top of every renderAreaAggregateContent() call; each call captures its own
// value and checks it's still current right before writing to the DOM. This render is
// async (ixQaqcCoverageForIntersection above awaits a score per existing recount) and the
// screen can be re-triggered in quick succession (re-opening the sidebar item, or any
// future caller), so a slower, now-superseded call could otherwise win the shared
// #area-aggregate-content container over a newer one — the exact BUG-022 failure mode.
let _areaAggRenderGen = 0;

// containerEl (optional): defaults to the real #area-aggregate-content screen; the read-only
// viewer (renderViewerContent()) passes its own container instead, reusing this same render
// logic without touching the edit-capable area-study screens.
async function renderAreaAggregateContent(containerEl = document.getElementById('area-aggregate-content'), opts = {}) {
  const myGen = ++_areaAggRenderGen;
  const container = containerEl;
  if (!container) return;

  if (!areaIntersections.length) {
    if (myGen === _areaAggRenderGen) container.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px 0">No intersections loaded.</div>';
    return;
  }

  const rowsWithSnap = areaIntersections.map((ix, i) => ({ ix, i, snap: ix.snapshot })).filter(r => r.snap);
  if (!rowsWithSnap.length) {
    if (myGen === _areaAggRenderGen) container.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px 0">No count data yet — add intersections with data to see the study-wide rollup.</div>';
    return;
  }

  const totalPeriods = rowsWithSnap.reduce((s, r) => s + (r.snap.periods?.length || 0), 0);
  const totalVeh = rowsWithSnap.reduce((s, r) => s + sumVehicleModeOnly(r.snap), 0);
  const totalPed = rowsWithSnap.reduce((s, r) => s + sumPed(r.snap), 0);
  const totalTmc = rowsWithSnap.reduce((s, r) => s + sumTmc(r.snap), 0);
  const noDataRows = rowsWithSnap.filter(r => sumVehicleModeOnly(r.snap) + sumPed(r.snap) + sumTmc(r.snap) === 0);
  const missingPeriodRows = noDataRows.filter(r => !(r.snap.periods?.length));
  const zeroButCountedRows = noDataRows.length - missingPeriodRows.length;

  // QA/QC coverage — computed once per intersection, sequentially (small N, bounded by
  // however many recounts actually exist), before the first DOM write below.
  const qaqcCoverage = [];
  for (const r of rowsWithSnap) {
    qaqcCoverage.push({ ...r, coverage: await ixQaqcCoverageForIntersection(r.ix) });
  }
  // Staleness guard — see BUG-022 in BUGS.md and this function's generation-counter
  // comment above. Bail before any DOM write if a newer call already superseded this one.
  if (myGen !== _areaAggRenderGen) return;

  const reviewedRows = qaqcCoverage.filter(r => r.coverage.total > 0);
  const failingRows = qaqcCoverage.filter(r => r.coverage.fail > 0);

  const classTotals = aggregateVehicleClassTotals().sort((a, b) => b.total - a.total);
  const classGrandTotal = classTotals.reduce((a, c) => a + c.total, 0);
  const maxClassTotal = Math.max(1, ...classTotals.map(c => c.total));

  const fmt = n => n.toLocaleString();

  const statCards = `
    <div class="card-grid" style="margin-bottom:14px">
      <div class="stat-card accent">
        <div class="stat-label">Intersections</div>
        <div class="stat-value">${fmt(rowsWithSnap.length)}</div>
        <div class="stat-detail">${fmt(totalPeriods)} period${totalPeriods !== 1 ? 's' : ''} counted total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total vehicle volume</div>
        <div class="stat-value">${fmt(totalVeh)}</div>
        <div class="stat-detail">In + out, all periods</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total pedestrian volume</div>
        <div class="stat-value">${fmt(totalPed)}</div>
        <div class="stat-detail">All crosswalks, all periods</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total TMC volume</div>
        <div class="stat-value">${fmt(totalTmc)}</div>
        <div class="stat-detail">All approaches, all periods</div>
      </div>
    </div>
    <div class="card-grid" style="margin-bottom:14px">
      <div class="stat-card${noDataRows.length ? ' accent' : ''}">
        <div class="stat-label">Data completeness</div>
        <div class="stat-value">${fmt(rowsWithSnap.length - noDataRows.length)}<span class="unit">/ ${fmt(rowsWithSnap.length)}</span></div>
        <div class="stat-detail">${noDataRows.length
          ? [missingPeriodRows.length ? `${fmt(missingPeriodRows.length)} missing periods` : null, zeroButCountedRows ? `${fmt(zeroButCountedRows)} zero counts` : null].filter(Boolean).join(', ')
          : 'All intersections have data'}</div>
      </div>
      <div class="stat-card${failingRows.length ? ' accent' : ''}">
        <div class="stat-label">QA/QC coverage</div>
        <div class="stat-value">${fmt(reviewedRows.length)}<span class="unit">/ ${fmt(rowsWithSnap.length)}</span></div>
        <div class="stat-detail">${failingRows.length
          ? `${fmt(failingRows.length)} intersection${failingRows.length !== 1 ? 's' : ''} with a failing recount`
          : reviewedRows.length ? 'No failing recounts on file' : 'No QA/QC recounts on file yet'}</div>
      </div>
    </div>`;

  const classRows = classTotals.map(c => `
    <tr>
      <td${c.def ? ` title="${escapeHtmlMain(c.def)}"` : ''}>${escapeHtmlMain(c.label)}${c.isBike ? ' 🚲' : ''}${c.def ? ' <span style="color:var(--text3);font-size:10px" title="' + escapeHtmlMain(c.def) + '">ⓘ</span>' : ''}</td>
      <td style="text-align:right">${fmt(c.total)}</td>
      <td style="text-align:right">${classGrandTotal > 0 ? Math.round((c.total / classGrandTotal) * 100) : 0}%</td>
      <td>${intervalBar(c.total, maxClassTotal, 140)}</td>
      <td style="text-align:right">${fmt(c.intersections.size)} / ${fmt(rowsWithSnap.length)}</td>
    </tr>`).join('');

  const classSection = classTotals.length ? `
    <div class="card" style="margin-bottom:14px">
      <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">Vehicle class breakdown</h2></div>
      <div class="stat-detail" style="margin-bottom:10px">Aggregated by class label across every intersection — matched by name, not by position, so intersections with different vehicle-class sets (e.g. one file with just Car/Bike, another with Car/Truck/Bus/Bike) combine correctly.</div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Class</th><th style="text-align:right">Total volume</th><th style="text-align:right">% of total</th><th></th><th style="text-align:right">Intersections</th></tr></thead>
          <tbody>${classRows}</tbody>
        </table>
      </div>
    </div>` : '';

  // Stacked-by-class chart, x-axis = intersection — same source data as classSection
  // above, just kept per-intersection instead of collapsed into study-wide totals.
  const classByIx = aggregateVehicleClassTotalsByIntersection();
  const classChartSection = classByIx.labels.length ? `
    <div class="card" style="margin-bottom:14px">
      <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">Vehicle volume by intersection</h2></div>
      <div class="stat-detail" style="margin-bottom:10px">Each bar is one intersection's total vehicle volume, stacked by class — matched by label across intersections, same as the table above.</div>
      ${renderStackedBarChart({ labels: classByIx.labels, series: classByIx.series })}
    </div>` : '';

  const completenessRows = qaqcCoverage.map(r => {
    const periodsCount = r.snap.periods?.length || 0;
    const vol = sumVehicleModeOnly(r.snap) + sumPed(r.snap) + sumTmc(r.snap);
    const isZero = vol === 0;
    const qaBadge = r.coverage.total === 0
      ? '<span class="tag">Not reviewed</span>'
      : r.coverage.fail > 0
        ? `<span class="tag badge-fail">${r.coverage.fail} failing</span>`
        : r.coverage.incomplete > 0 && r.coverage.pass === 0
          ? '<span class="tag badge-caution">Incomplete</span>'
          : `<span class="tag badge-pass">${r.coverage.pass}/${r.coverage.total} pass</span>`;
    return `
      <tr>
        <td>${escapeHtmlMain(r.ix.name || `Intersection ${r.i + 1}`)}</td>
        <td style="text-align:right">${fmt(periodsCount)}</td>
        <td style="text-align:right${isZero ? ';color:var(--bad-text)' : ''}">${isZero ? 'Zero counts' : fmt(vol)}</td>
        <td>${qaBadge}</td>
        <td><button class="sum-review-btn" data-idx="${r.i}">review →</button> <button class="sum-qaqc-btn" data-idx="${r.i}">QA/QC →</button></td>
      </tr>`;
  }).join('');

  // In viewer mode (opts.viewerMode — see renderViewerContent()) the per-intersection table
  // is tucked behind the same <details> toggle already used for Interval Detail, since the
  // stat cards above already carry the study-wide QA/QC coverage rollup a client/PM needs at
  // a glance — the per-row detail (and the "review →"/"QA/QC →" drill-down buttons, which
  // only make sense for the project owner) stays one click away instead of dominating the
  // page. The internal Aggregate screen (owner-facing) is unchanged — always expanded.
  const completenessTable = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Intersection</th><th style="text-align:right">Periods</th><th style="text-align:right">Total volume</th><th>QA/QC</th><th></th></tr></thead>
        <tbody>${completenessRows}</tbody>
      </table>
    </div>`;
  const completenessSection = `
    <div class="card">
      <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:14px;font-weight:600;margin:0">Data quality by intersection</h2></div>
      <div class="stat-detail" style="margin-bottom:10px">Which intersections have data, and their QA/QC recount status. "review →" opens that intersection's own Analyze screen; "QA/QC →" opens its recount screen — the same drill-down used everywhere else in the app.</div>
      ${opts.viewerMode
        ? `<details class="interval-detail"><summary class="interval-detail-summary">Show table for all ${fmt(rowsWithSnap.length)} intersections</summary>${completenessTable}</details>`
        : completenessTable}
    </div>`;

  const fixedWindowSection = fixedWindowSectionHtml();

  if (myGen !== _areaAggRenderGen) return; // final staleness guard immediately before the DOM write
  container.innerHTML = statCards + classSection + classChartSection + fixedWindowSection + completenessSection;

  container.querySelectorAll('.sum-review-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showIntersectionAnalysis(+btn.dataset.idx); });
  });
  container.querySelectorAll('.sum-qaqc-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showIntersectionQaqc(+btn.dataset.idx); });
  });
  wireFixedWindowInputs();
}
window.renderAreaAggregateContent = renderAreaAggregateContent;

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
    const _tmcT1 = vPairs.filter(p=>p.includeTmc);
    const bikeIdx = _tmcT1.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
    const motorIdx = _tmcT1.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
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
      <div class="stat-detail" style="margin-bottom:14px;max-width:540px">Exports the active period's count data. The shareable HTML page and project package are self-contained — send either to someone without this app and they can still view the data.</div>
      <div class="setup-card" style="max-width:540px">
        <h3 style="margin:0 0 1.2rem;font-size:15px;font-weight:600">Download files</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn-primary" id="btn-ix-export-csv" style="text-align:left">.csv ↓ &nbsp; Count data (active period)</button>
          <button class="btn-primary" id="btn-ix-export-xlsx" style="text-align:left">.xlsx ↓ &nbsp; Count data (active period)</button>
          <button class="btn-primary" id="btn-ix-export-page" style="text-align:left">↓ HTML &nbsp; Shareable report page</button>
          <div style="border-top:1px solid var(--border);margin:4px 0"></div>
          <button class="btn-primary" id="btn-ix-export-utdf" style="text-align:left">.csv ↓ &nbsp; Turning-movement volumes (UTDF for Synchro)</button>
          <p style="margin:0;font-size:12px;color:var(--text3)">Turning-movement volumes for the active period, in Synchro's UTDF layout (best-effort — see DEVLOG for confidence notes; only N/E/S/W legs and motor-vehicle classes are included).</p>
          <div style="border-top:1px solid var(--border);margin:4px 0"></div>
          <button class="btn-primary" id="btn-ix-export-package" style="text-align:left">⬇ Export project package (.zip)</button>
          <p style="margin:0;font-size:12px;color:var(--text3)">ZIP contains the CSV, Excel workbook, shareable HTML page, and a project JSON for re-import.</p>
        </div>
      </div>`;
    document.getElementById('btn-ix-export-csv')?.addEventListener('click', () => exportCSV());
    document.getElementById('btn-ix-export-xlsx')?.addEventListener('click', () => exportXLSX());
    document.getElementById('btn-ix-export-utdf')?.addEventListener('click', () => {
      const warnings = exportUTDF();
      if (warnings && warnings.length) alert('UTDF export finished with warnings:\n\n' + warnings.join('\n'));
    });
    document.getElementById('btn-ix-export-page')?.addEventListener('click', () => {
      exportShareablePage(
        { ...projectInfo, date: periodMeta.date || projectInfo.date, weather: periodMeta.weather || projectInfo.weather, counterName: periodMeta.observer || projectInfo.counterName, studyPurpose: periodMeta.notes || projectInfo.studyPurpose, equipment: periodMeta.equipment },
        intersection, ...(() => {
          const pData = captureActivePeriod();
          const { vehParsed, pedParsed, tmcParsed } = parsedFromPeriod(pData);
          const _tmcT2 = vPairs.filter(p=>p.includeTmc);
          const bikeIdx = _tmcT2.map((p, i) => p.isBike ? i : -1).filter(i => i >= 0);
          const motorIdx = _tmcT2.map((p, i) => !p.isBike ? i : -1).filter(i => i >= 0);
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

  container.innerHTML = '<div class="stat-detail" style="margin-bottom:14px">Builds one CSV across every intersection in this study. Choose a layout, then check which fields to include — the column preview and row count below update live as you pick.</div>'
    + layoutCards
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

// ── Intersection detail analysis (workspace sidebar Analyze/Charts screen) ──
// Both the standalone-project path and the area-study child path now render
// through the same consolidated renderIntersectionAnalysis() used by the
// standalone #analyze-screen and the inline Count-screen pane — see that
// function's header comment for the full list of contexts. Area-study children
// are read-only snapshots (areaIntersections[idx].snapshot); a standalone
// intersection project reviewed from its own workspace sidebar reads live state
// directly, giving it full parity with the Count-screen's inline Analyze pane
// (Export page, Before/After comparison, "currently counting" period marker, etc).
function showIntersectionAnalysis(idx) {
  flushPendingAutosave(); // see flushPendingAutosave()'s header comment — must run before activeIntersectionIdx changes
  activeIntersectionIdx = idx;
  const ix = areaIntersections[idx];
  if (!ix?.snapshot) return;
  document.getElementById('ix-analysis-title').textContent = ix.name;
  const parts = [];
  if (ix.counterName) parts.push(`Counter: ${ix.counterName}`);
  if (projectInfo.projectName) parts.push(projectInfo.projectName);
  document.getElementById('ix-analysis-sub').textContent = parts.join(' · ');
  const container = document.getElementById('ix-analysis-content');
  if (container) container._viewPeriodIdx = null; // reset to period 0 for the newly opened intersection
  _sidebarActiveItem = `area-ix-${idx}`;
  renderAppSidebar();
  showScreen('ix-analysis-screen');
  renderIntersectionAnalysis(container, {
    periods: ix.snapshot.periods,
    intersection: ix.snapshot.intersection,
    vPairs: ix.snapshot.vPairs,
  });
}
window.showIntersectionAnalysis = showIntersectionAnalysis;

// ── Intersection QA/QC, area-study child entry point ──
// Mirrors showIntersectionAnalysis() immediately above (same activeIntersectionIdx /
// sidebar-highlight bookkeeping), but routes into intersection-qaqc-screen with a
// { areaIdx } snapshotCtx instead of a read-only snapshot literal — QA/QC needs to write
// new recount data back, not just read, so ixQaqcSource() re-resolves the live
// areaIntersections[idx].snapshot object on every call rather than working from a copy.
function showIntersectionQaqc(idx) {
  flushPendingAutosave(); // see flushPendingAutosave()'s header comment — must run before activeIntersectionIdx changes
  activeIntersectionIdx = idx;
  const ix = areaIntersections[idx];
  if (!ix?.snapshot) return;
  _sidebarActiveItem = `area-ix-${idx}`;
  renderAppSidebar();
  showScreen('intersection-qaqc-screen');
  renderIntersectionQaqcScreen({ areaIdx: idx });
}
window.showIntersectionQaqc = showIntersectionQaqc;

function loadIntersectionIntoView(snap) {
  setVPairs(snap.vPairs || []);
  if (snap.tmcPairs) migrateVPairsFromLegacyTmc(snap.tmcPairs);
  else vPairs.forEach((p, i) => {
    if (p.tmcKey   === undefined) p.tmcKey   = p.inKey || '';
    if (p.includeTmc === undefined) p.includeTmc = true;
    if (p.isBike   === undefined) p.isBike   = false;
    if (p.group === undefined) p.group = Math.floor(i / 4);
  });
  resetKeybindCfg();
  if (snap.keybindCfg) setKeybindCfg(snap.keybindCfg);
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
  syncTemplateSlotsFromIntersection();
  buildTemplateGrid(); renderVPairsList(); updateDerived(); renderLegConfig(); renderSetupDiagram();
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

// opts.viewerMode (default false): populate live state exactly as a normal load does, but
// skip every UI-side-effecting tail (enterWorkspace/sidebar/setup/counter screens) and route
// into the read-only viewer render instead — see renderViewerContent(). Keeping restoration
// in this single function (rather than a second, hand-built viewer hydrator) avoids the
// dual-serializer drift risk this file already flags elsewhere (see serializeCurrentProject's
// 'area' branch comment).
function loadProject(proj, opts = {}) {
  const viewerMode = !!opts.viewerMode;
  const qaInputMode = !!opts.qaInputMode; // Trip Gen only — see enterQaInputMode()
  projectUUID = proj.uuid || crypto.randomUUID();
  // Reset-before-restore (BUG-027 pattern) — a project with no share of its own must never
  // inherit whatever shareInfo the previously loaded project left in memory.
  resetShareInfo();
  if (proj.shareInfo) Object.assign(shareInfo, proj.shareInfo);
  if (proj.projectInfo) {
    Object.assign(projectInfo, proj.projectInfo);
    if (!viewerMode) wireProjectInfoFields(); // re-sync all input values from restored state
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
    if (viewerMode) { renderViewerContent(proj); return; }
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
    // Reset first — Object.assign alone only overwrites keys present in proj.qaqc, so loading a
    // project with no/fewer recount keys than whatever was already loaded left stale entries
    // from the PREVIOUS project visible on this one's QA/QC screen (BUG-027-class leak, same
    // fix shape as intersectionQaqc's own reset-before-restore).
    for (const k in tripgenQaqc) delete tripgenQaqc[k];
    Object.assign(tripgenQaqc, proj.qaqc || {});
    tripgenMergedQaSubmissionIds = [...(proj.qaqcMergedSubmissionIds || [])];
    tripgenEntries.length = 0;
    tripgenEntries.push(...(proj.entries || []));
    // BUG-042: without this resync, tripgenNextId stays at its module-init value of 1 on every
    // load, so any location added after loading a project collides with entry id 1 (whichever
    // entry happened to load first) — same class of bug tripgenDistNextId already guards
    // against just below. The collision lets tripgenQaqc's `${entryId}__...` keys (and any
    // future per-entry-id lookup) silently address the wrong location's data.
    tripgenNextId = tripgenEntries.reduce((mx, e) => Math.max(mx, e.id + 1), 1);
    // BUG-035: classifications are real project-wide config (labels/keys/descriptions the
    // user configured), not disposable "whatever's queued for the next location" staging
    // state — the previous design treated it as the latter and unconditionally reset it on
    // every load, silently dropping it even when serializeCurrentProject() now DOES persist
    // it (see the classifications field there). Restore what was saved; only reset to empty
    // when the loaded project genuinely has none, still avoiding the BUG-027-style leak of
    // one project's classifications bleeding into another that has its own (or none).
    tgRestoreClassifications(proj.classifications || []);
    resetTgKeybindCfg();
    if (proj.tgKeybindCfg) setTgKeybindCfg(proj.tgKeybindCfg);
    tripgenDistribution = JSON.parse(JSON.stringify(proj.distribution || []));
    tripgenDistNextId = tripgenDistribution.reduce((mx, ix) => Math.max(mx, ix.id + 1), 1);
    tripgenCustomWindows = JSON.parse(JSON.stringify(proj.customWindows || []));
    tripgenCustomWindowNextId = tripgenCustomWindows.reduce((mx, w) => Math.max(mx, w.id + 1), 1);
    for (const k in tripgenQaqcWindows) delete tripgenQaqcWindows[k];
    if (proj.qaqcWindows) {
      Object.assign(tripgenQaqcWindows, proj.qaqcWindows);
      tripgenQaqcWindowNextId = Object.values(tripgenQaqcWindows).flat().reduce((mx, w) => Math.max(mx, w.id + 1), 1);
    } else if (tripgenEntries.length) {
      // Legacy project (saved before QA/QC windows became fully custom) — migrate the fixed
      // defaults it already had, preserving any recount data already on file. See
      // migrateQaqcWindows' own header comment (tripgenSection.js) for why this runs async
      // without blocking the rest of loadProject — windows just aren't visible for the few ms
      // until it resolves, a one-time cost since the project re-saves with qaqcWindows set.
      migrateQaqcWindows(tripgenEntries, tripgenQaqc).then(({ qaqcWindows, qaqc, nextId }) => {
        Object.assign(tripgenQaqcWindows, qaqcWindows);
        for (const k in tripgenQaqc) delete tripgenQaqc[k];
        Object.assign(tripgenQaqc, qaqc);
        tripgenQaqcWindowNextId = nextId;
        // Real bug, not just "a few ms": if the user reaches QA/QC or Analysis before this
        // promise settles, renderQaqcScreen()/rerenderTripgenAnalysis() already ran against
        // the still-empty tripgenQaqcWindows and nothing re-renders afterward -- the screen
        // stays showing "no time periods" forever, with real recount data sitting unreachable
        // right there in tripgenQaqc. Re-render whichever of the two is currently on screen.
        if (_currentScreen === 'tripgen-qaqc-screen') renderQaqcScreen();
        else if (_currentScreen === 'analyze-screen') rerenderTripgenAnalysis();
      });
    }
    if (proj.qaqcReviewerName) { const el = document.getElementById('qaqc-reviewer-name'); if (el) el.value = proj.qaqcReviewerName; }
    if (proj.qaqcReviewDate) { const el = document.getElementById('qaqc-review-date'); if (el) el.value = proj.qaqcReviewDate; }
    projectType = 'tripgen';
    // Checked BEFORE viewerMode — a QA-input link also sets viewerMode:true (blocks local
    // persistence the same way a plain viewer does) but routes to the restricted QA/QC screen
    // instead of the read-only viewer.
    if (qaInputMode) {
      // Defense in depth: the real boot-time entry point (enterQaInputMode, called before any
      // owner project ever loads) never triggers enterWorkspace() in the first place, so this
      // is normally a no-op. But nothing here structurally prevents loadProject from being
      // called with qaInputMode:true in a tab that already has an owner session's sidebar
      // showing, so strip it explicitly rather than rely on call-order alone.
      document.body.classList.remove('workspace-mode');
      document.getElementById('app-sidebar')?.classList.remove('visible');
      // Neither button leads anywhere safe for a QA reviewer: "back to setup" reaches the
      // real locations list (edit/delete/recount controls over primary count data) and
      // "view analysis" reaches the full project's analysis tables — both far beyond what a
      // QA-input link is supposed to expose. Hide them outright rather than trust the
      // isQaInputMode write-guards alone to make wandering there harmless.
      const toSetupBtn = document.getElementById('btn-qaqc-to-setup');
      const toAnalyzeBtn = document.getElementById('btn-qaqc-to-analyze');
      const checkSubmissionsBtn = document.getElementById('btn-qaqc-check-submissions');
      if (toSetupBtn) toSetupBtn.style.display = 'none';
      if (toAnalyzeBtn) toAnalyzeBtn.style.display = 'none';
      if (checkSubmissionsBtn) checkSubmissionsBtn.style.display = 'none';
      showScreen('tripgen-qaqc-screen');
      renderQaqcScreen();
      return;
    }
    if (viewerMode) { renderViewerContent(proj); return; }
    enterWorkspace();
    setSidebarMeta(proj.projectInfo?.projectName || 'Trip generation', proj.siteInfo?.location || '');
    _sidebarActiveItem = 'tg-setup';
    renderAppSidebar();
    wireSiteInfoFields();
    renderTripgenLocationsList();
    // BUG-034: resume straight into the counter with the in-progress count intact, rather
    // than landing on the setup screen and leaving the user to notice (or not) that an
    // unfinished count is sitting unreachable. Note: this restores the count DATA exactly
    // (every interval's in/out values) but not the exact interval the user had scrolled to —
    // tgBeginEditing() always starts a resumed session at interval 0, same as reopening any
    // finished location for edit; nothing is lost, you just may need to scroll back down.
    if (proj.pendingLocation) {
      const pl = proj.pendingLocation;
      tgPendingLocation = { kind: pl.kind, address: pl.address, date: pl.date, dayType: pl.dayType, entryId: pl.entryId, dayIdx: pl.dayIdx };
      tgCounterBackTarget = 'tripgen-setup-screen';
      setTgCounterHeaderLabel(pl.kind === 'edit' ? (tripgenEntries.find((e) => e.id === pl.entryId)?.locationLabel || '') : pl.address);
      showScreen('tripgen-counter-screen');
      if (pl.kind === 'edit') {
        tgBeginEditing(pl.editSnapshot, pl.parsed, (parsed, editSnapshot, seq) => {
          commitLocationCounts(pl.entryId, pl.dayIdx, parsed, editSnapshot, seq, 'resume-edit-finish');
          tgPendingLocation = null;
          renderTripgenLocationsList();
          goToTripgenAnalyze();
          window.scheduleAutosave?.();
        });
        tgPendingLocation.seq = tgGetSessionSeq();
      } else {
        document.getElementById('tg-location-address').value = pl.address || '';
        document.getElementById('tg-location-date').value = pl.date || '';
        let resumeEntryId = null;
        tgBeginEditing(pl.editSnapshot, pl.parsed, (parsed, editSnapshot, seq) => {
          commitLocationCounts(resumeEntryId, 0, parsed, editSnapshot, seq, 'resume-new-finish');
          tgPendingLocation = null;
          clearLocationContext();
          renderTripgenLocationsList();
          goToTripgenAnalyze();
          window.scheduleAutosave?.();
        });
        resumeEntryId = tripgenNextId++;
        tripgenEntries.push({
          id: resumeEntryId, filename: '(live count)', locationLabel: pl.address,
          meta: {}, days: [{ sheetName: formatDateLong(pl.date), dayType: pl.dayType, date: pl.date, parsed: null, editSnapshot: null }],
        });
        tgPendingLocation = { kind: 'edit', entryId: resumeEntryId, dayIdx: 0, seq: tgGetSessionSeq() };
        commitLocationCounts(resumeEntryId, 0, pl.parsed, pl.editSnapshot, tgGetSessionSeq(), 'resume-new-initial');
      }
    } else {
      showScreen('tripgen-setup-screen');
    }
    return;
  }
  if (proj.projectType === 'area') {
    areaIntersections.length = 0;
    areaIntersections.push(...(proj.intersections || []).map(ix => ({ name: ix.name, snapshot: ix.snapshot, street1: ix.street1 || '', street2: ix.street2 || '', corridor: ix.corridor || '', counterName: ix.counterName || '', lat: ix.lat || '', lng: ix.lng || '' })));
    activeIntersectionIdx = Math.min(proj.activeIntersectionIdx ?? 0, Math.max(0, areaIntersections.length - 1));
    projectType = 'area';
    if (viewerMode) { renderViewerContent(proj); return; }
    enterWorkspace();
    setSidebarMeta(proj.projectInfo?.projectName || 'Area study', '');
    _sidebarActiveItem = null;
    renderAppSidebar();
    showAreaSetup();
    return;
  }
  // intersection project — structural (shared across all periods)
  if (proj.enabledModes) { Object.assign(enabledModes, proj.enabledModes); syncCountTypeToggles(); }
  resetKeybindCfg();
  if (proj.keybindCfg) setKeybindCfg(proj.keybindCfg);
  setVPairs(proj.vPairs || []);
  if (proj.tmcPairs) migrateVPairsFromLegacyTmc(proj.tmcPairs);
  else vPairs.forEach((p, i) => {
    if (p.tmcKey   === undefined) p.tmcKey   = p.inKey || '';
    if (p.includeTmc === undefined) p.includeTmc = true;
    if (p.isBike   === undefined) p.isBike   = false;
    // Older saved projects predate the `group` field (configurable keybinding groups) — back-
    // fill the same floor(index/4) grouping that was previously implicit, so a pre-existing
    // 8-type project loads into the same two groups it always behaved as, rather than
    // collapsing into one oversized group-0 with false key conflicts.
    if (p.group === undefined) p.group = Math.floor(i / 4);
  });
  Object.assign(intersection, proj.intersection);
  Object.assign(fnames, proj.fnames);
  // Reset first — Object.assign alone only overwrites keys present in proj.intersectionQaqc,
  // so loading a project with no QA/QC data of its own (or fewer recount keys than whatever
  // was already loaded) left stale recount entries from the PREVIOUS project visible on this
  // one's QA/QC screen. Found during audit (BUG-027): loaded a project with a recount, then a
  // second project with none, and the second project's QA/QC screen still showed the first
  // project's recount total. Same fix shape as streetlightComparison below, which already
  // did this correctly when it was added.
  for (const k in intersectionQaqc) delete intersectionQaqc[k];
  Object.assign(intersectionQaqc, proj.intersectionQaqc || {});
  streetlightComparison.blocks = {}; streetlightComparison.sourceFileName = null; streetlightComparison.importedAt = null;
  Object.assign(streetlightComparison, proj.streetlightComparison || {});
  const ixQaqcReviewerEl = document.getElementById('ix-qaqc-reviewer-name');
  const ixQaqcDateEl = document.getElementById('ix-qaqc-review-date');
  if (ixQaqcReviewerEl) ixQaqcReviewerEl.value = proj.intersectionQaqcReviewerName || '';
  if (ixQaqcDateEl) ixQaqcDateEl.value = proj.intersectionQaqcReviewDate || '';
  intersectionCustomWindows = JSON.parse(JSON.stringify(proj.intersectionCustomWindows || []));
  intersectionCustomWindowNextId = intersectionCustomWindows.reduce((mx, w) => Math.max(mx, w.id + 1), 1);

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
  if (viewerMode) { renderViewerContent(proj); return; }
  enterWorkspace();
  setSidebarMeta(proj.projectInfo?.projectName || 'Intersection count', '');
  _sidebarActiveItem = 'count';
  renderAppSidebar();
  syncTemplateSlotsFromIntersection();
  buildTemplateGrid(); renderVPairsList(); updateDerived(); renderLegConfig(); renderSetupDiagram();
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
// READ-ONLY SHARED VIEWER (?share=<id>)
// ═══════════════════════════════════════════
// Boot-time entry point (called from the top-level ?share= check near the start of this
// file) — fetches the shared doc and, if found, hydrates live state via loadProject's
// viewerMode path. isViewerMode is set FIRST, before any state changes, so every write-path
// guard is active for the rest of this tab's lifetime, no matter what fails below.
async function enterViewerMode(shareId) {
  isViewerMode = true;
  document.body.classList.add('shared-view-mode'); // see style.css's print block for why
  setShareViewerMode(true);
  showScreen('share-viewer-screen');
  const content = document.getElementById('share-viewer-content');
  if (content) content.innerHTML = '<div class="stat-detail">Loading shared project…</div>';
  let data = null;
  try {
    data = await fetchSharedProject(shareId);
  } catch (_) {
    if (content) content.innerHTML = '<div class="stat-detail">Could not load this shared link. Check your connection and try again.</div>';
    return;
  }
  if (!data) {
    if (content) content.innerHTML = '<div class="stat-detail">This shared link is no longer available. The owner may have disabled sharing.</div>';
    return;
  }
  try {
    loadProject(data, { viewerMode: true });
  } catch (_) {
    if (content) content.innerHTML = '<div class="stat-detail">Could not display this shared project.</div>';
  }
}

// ═══════════════════════════════════════════
// QA-INPUT LINK (?share=<id>&qa=1) — Trip Gen only
// ═══════════════════════════════════════════
// A second-counter reviewer's entry point — distinct from enterViewerMode() above. Fetches
// the same shared doc (no separate document type — a QA-input link and a read-only viewer
// link both point at the SAME sharedProjects/{shareId}, just rendered differently) and
// hydrates via loadProject's qaInputMode path, which routes straight into the restricted
// QA/QC screen instead of the read-only viewer. isQaInputMode is set FIRST, before any state
// changes, same reasoning as isViewerMode above. Also sets isViewerMode's own structural
// no-local-write guard (setShareViewerMode(true) in share.js) — a QA reviewer's browser must
// never push a full-project update or enable/disable sharing either, only ever
// submitQaRecount(), which isn't gated on that flag at all (see share.js's own comment on it).
async function enterQaInputMode(shareId) {
  isQaInputMode = true;
  qaInputShareId = shareId;
  document.body.classList.add('shared-view-mode'); // see style.css's print block for why
  setShareViewerMode(true);
  showScreen('share-viewer-screen');
  const content = document.getElementById('share-viewer-content');
  if (content) content.innerHTML = '<div class="stat-detail">Loading shared project…</div>';
  let data = null;
  try {
    data = await fetchSharedProject(shareId);
  } catch (_) {
    if (content) content.innerHTML = '<div class="stat-detail">Could not load this shared link. Check your connection and try again.</div>';
    return;
  }
  if (!data) {
    if (content) content.innerHTML = '<div class="stat-detail">This shared link is no longer available. The owner may have disabled sharing.</div>';
    return;
  }
  if (data.projectType !== 'tripgen') {
    if (content) content.innerHTML = '<div class="stat-detail">QA-input links are only available for Trip Gen projects.</div>';
    return;
  }
  try {
    loadProject(data, { viewerMode: true, qaInputMode: true });
  } catch (_) {
    if (content) content.innerHTML = '<div class="stat-detail">Could not display this shared project.</div>';
  }
}

// Renders the read-only analysis view for whichever project type was just hydrated into
// live state by loadProject(proj, {viewerMode:true}) — reusing each type's own real
// analysis-rendering entry point rather than a parallel bespoke summary layout (decision #3).
async function renderViewerContent(proj) {
  const titleEl = document.getElementById('share-viewer-title');
  const content = document.getElementById('share-viewer-content');
  if (!content) return;
  if (titleEl) titleEl.textContent = getProjectName(proj);
  content.innerHTML = '';
  if (proj.projectType === 'intersection') {
    // Same read-only snapshotCtx mechanism area-study children already use (see
    // analysisSource()) — passing it hides every edit/print-report-adjacent control this
    // render tree gates on `readOnly`. viewerMode is a separate flag layered on top (see
    // analysisSource()) — it only affects presentation (QA list collapsed behind its badge,
    // interval detail stays reachable via .viewer-keep) and must NOT also apply to the
    // internal area-study drill-down, which reuses this same readOnly path for the project
    // owner and should keep showing everything expanded.
    await renderIntersectionAnalysis(content, { periods: proj.periods, intersection: proj.intersection, vPairs: proj.vPairs, viewerMode: true });
  } else if (proj.projectType === 'tripgen') {
    // No-op change callbacks (this ctx object has no readOnly flag of its own) — keeps the
    // form fields from throwing if clicked, without wiring them to mutate anything.
    // viewerMode additionally hides the owner-only edit forms (site info, classification
    // grouping, peak-window controls — already marked .no-print, see style.css's
    // .viewer-mode rule) and collapses the detailed tables behind <details> toggles (see
    // wrapViewerDetail() in tripgenSection.js).
    await renderTripGenSection(content, tripgenEntries, {
      siteInfo: tripgenSiteInfo, categoryMap: tripgenCategoryMap, peakWindows: tripgenPeakWindows,
      qaqc: tripgenQaqc, qaqcWindows: tripgenQaqcWindows, dataView: tripgenDataView, customWindows: tripgenCustomWindows,
      onSiteInfoChange: () => {}, onPeakWindowChange: () => {},
      onPeakManualToggle: () => {}, onDataViewChange: () => {}, onFixedWindowChange: () => {},
      fixedWindowStartMin: tripgenFixedWindowStartMin, fixedWindowEndMin: tripgenFixedWindowEndMin,
      viewerMode: true,
      // Deliberately omitting onGotoQaqc — that link goes to the owner-only QA/QC EDIT screen,
      // which a viewer has no business reaching. The score-detail view is pure read-only
      // (no edit controls at all), so it's safe and useful to expose here too.
      onGotoQaqcDetail: (key) => showTgQaqcDetail(key, 'share-viewer-screen'),
    });
  } else if (proj.projectType === 'area') {
    // Study-wide rollup (decision: conservative pick over per-intersection drill-down —
    // see DEVLOG) — reuses the same render function the real Aggregate screen uses.
    // viewerMode collapses the per-intersection table (the stat cards above it already carry
    // the study-wide QA/QC coverage rollup a client/PM needs at a glance).
    await renderAreaAggregateContent(content, { viewerMode: true });
  } else if (proj.projectType === 'parking') {
    renderParkingSummary(content, { viewerMode: true });
  } else {
    content.innerHTML = '<div class="stat-detail">This shared project type is not supported.</div>';
  }
}

// ═══════════════════════════════════════════
// AUTOSAVE — localStorage
// ═══════════════════════════════════════════
// LS_KEY moved to top of file — see const declaration near imports

function serializeCurrentProject() {
  if (projectType === 'area') {
    // NOTE: persistAreaStudySnapshotsOnly() (below) hand-builds this exact same field set as
    // a deliberate parallel path (it can't call this function — see its own comment for why).
    // If you add/change a field here, update that function too, or it will silently drift out
    // of sync — this is exactly the bug class BUG-038 turned out to be (a second, unmaintained
    // hand-built serializer for Trip Gen quietly missing fields this one gained over time).
    areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot();
    return {
      version: 2, projectType: 'area', savedAt: new Date().toISOString(), uuid: projectUUID,
      projectInfo: { ...projectInfo },
      activeIntersectionIdx,
      intersections: areaIntersections.map(ix => ({ name: ix.name, snapshot: ix.snapshot, street1: ix.street1 || '', street2: ix.street2 || '', corridor: ix.corridor || '', counterName: ix.counterName || '', lat: ix.lat || '', lng: ix.lng || '' })),
      shareInfo: { ...shareInfo },
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
      keybindCfg: { ...keybindCfg },
      vPairs: JSON.parse(JSON.stringify(vPairs)),
      intersection: JSON.parse(JSON.stringify(intersection)),
      fnames: { ...fnames },
      intersectionQaqc: { ...intersectionQaqc },
      streetlightComparison: { ...streetlightComparison },
      intersectionQaqcReviewerName: document.getElementById('ix-qaqc-reviewer-name')?.value || '',
      intersectionQaqcReviewDate: document.getElementById('ix-qaqc-review-date')?.value || '',
      intersectionCustomWindows: JSON.parse(JSON.stringify(intersectionCustomWindows)),
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
      shareInfo: { ...shareInfo },
    };
  }
  if (projectType === 'parking') {
    return {
      version: 1, projectType: 'parking', savedAt: new Date().toISOString(), uuid: projectUUID,
      parkingProjectInfo: { ...parkingProjectInfo },
      zones: JSON.parse(JSON.stringify(parkingZones)),
      cfg: { ...parkingCfg },
      grid: JSON.parse(JSON.stringify(parkingGrid)),
      shareInfo: { ...shareInfo },
    };
  }
  if (projectType === 'tripgen') {
    // BUG-034: capture whatever's currently on the board if a count is in progress and not
    // yet finished, so it round-trips through autosave/save-project instead of vanishing the
    // moment the user leaves the counter screen. tgPendingLocation is the authority on
    // whether there's a real in-progress location (not tripgenCount.js's internal onFinish
    // alone, which also goes truthy for QA/QC recounts — a different, unrelated flow).
    const pendingSnap = tgPendingLocation ? tgCaptureLiveSnapshot() : null;
    return {
      version: 1, projectType: 'tripgen', savedAt: new Date().toISOString(), uuid: projectUUID,
      projectInfo: { ...projectInfo },
      siteInfo: { ...tripgenSiteInfo }, categoryMap: { ...tripgenCategoryMap },
      // BUG-035: classifications (labels/keys/descriptions) are project-wide config, not
      // count data — must always be captured regardless of whether any count exists yet.
      classifications: tgGetClassifications(),
      tgKeybindCfg: getTgKeybindCfg(),
      peakWindows: JSON.parse(JSON.stringify(tripgenPeakWindows)),
      customWindows: JSON.parse(JSON.stringify(tripgenCustomWindows)),
      qaqc: { ...tripgenQaqc },
      qaqcMergedSubmissionIds: [...tripgenMergedQaSubmissionIds],
      qaqcWindows: JSON.parse(JSON.stringify(tripgenQaqcWindows)),
      qaqcReviewerName: document.getElementById('qaqc-reviewer-name')?.value || '',
      qaqcReviewDate: document.getElementById('qaqc-review-date')?.value || '',
      entries: JSON.parse(JSON.stringify(tripgenEntries)),
      distribution: JSON.parse(JSON.stringify(tripgenDistribution)),
      pendingLocation: pendingSnap ? { ...tgPendingLocation, ...pendingSnap } : null,
      shareInfo: { ...shareInfo },
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

// ── Count-data failsafe, layer 2: "data just got smaller" detection ──
// Generic guard against the BUG-047 class of bug (a background action silently overwrites a
// finished location's real count with a much smaller one) — not a re-fix of BUG-047 itself
// (already fixed by clearing tgPendingLocation at recount-begin), but a safety net that would
// also catch a DIFFERENT, not-yet-found bug shaped the same way. Compares each Trip Gen
// location/day's interval coverage in the incoming save against the last-known-good save.
//
// Distinguishing an intentional overwrite from an accidental one: tgPendingLocation is the
// SAME marker editTripgenDay()/BUG-034's live-edit tracking already uses for "the user is
// deliberately counting/recounting THIS exact location+day right now" — see BUG-047's own
// writeup. Exactly one entry+day is allowed to shrink at a time: whichever one is the live
// pending edit target. Any OTHER location/day shrinking is exactly the shape BUG-047 took
// (an unrelated background write silently clobbering a location nobody was actively editing).
const SHRINK_MIN_PREV_INTERVALS = 8; // below this, "shrink" is noise (e.g. a short QA window)
const SHRINK_RATIO = 0.4; // new coverage must drop below 40% of previous to flag
// BUG-048's own shape doesn't reduce interval COUNT at all (a day keeps all 96 slots — they
// just go quiet) — the interval-count check above cannot see it. This second, parallel check
// looks at total counted volume (every inbound/outbound count added up) for the same day
// instead. Same exemption, same ratio; a separate minimum because a real volume can
// legitimately be small (a short access point) where 8 whole INTERVALS would already be a lot.
const SHRINK_MIN_PREV_VOLUME = 8;

function tgDayVolume(day) {
  return (day?.parsed?.intervals || []).reduce(
    (s, iv) => s + (iv.inbound || []).reduce((a, b) => a + b, 0) + (iv.outbound || []).reduce((a, b) => a + b, 0), 0);
}

function detectTripgenShrink(prevProj, newProj) {
  if (!prevProj || prevProj.projectType !== 'tripgen' || !prevProj.entries?.length) return null;
  const exemptEntryId = tgPendingLocation?.kind === 'edit' ? tgPendingLocation.entryId : null;
  const exemptDayIdx = tgPendingLocation?.dayIdx ?? null;
  for (const prevEntry of prevProj.entries) {
    const newEntry = (newProj.entries || []).find((e) => e.id === prevEntry.id);
    if (!newEntry) continue; // entry removed entirely — a deliberate delete, not this check's concern
    const days = prevEntry.days || [];
    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      if (prevEntry.id === exemptEntryId && dayIdx === exemptDayIdx) continue; // live edit target — expected to change
      const prevDay = days[dayIdx];
      const newDay = newEntry.days?.[dayIdx];
      const prevCount = prevDay?.parsed?.intervals?.length || 0;
      const newCount = newDay?.parsed?.intervals?.length || 0;
      if (prevCount >= SHRINK_MIN_PREV_INTERVALS && newCount < prevCount * SHRINK_RATIO) {
        return { label: prevEntry.locationLabel || '(unlabeled location)', prevCount, newCount, kind: 'intervals' };
      }
      const prevVol = tgDayVolume(prevDay);
      const newVol = tgDayVolume(newDay);
      if (prevVol >= SHRINK_MIN_PREV_VOLUME && newVol < prevVol * SHRINK_RATIO) {
        return { label: prevEntry.locationLabel || '(unlabeled location)', prevCount: prevVol, newCount: newVol, kind: 'volume' };
      }
    }
  }
  return null;
}

// ── Count-data failsafe, layer 4: "read-only outside the counter" (BUG-047/BUG-048 follow-up)
// ──
// Both BUG-047 and BUG-048 were the same root shape: a write site trusted that tripgenCount.js's
// shared live-counting state (tgData/classifications/cfg) still belonged to the session
// tgPendingLocation claims is active, with no way to actually verify that. commitLocationCounts()
// is now the ONLY function in this file allowed to write a location's real day.parsed/
// editSnapshot — every write site (project-load resume, scheduleAutosave's debounced flush,
// QA/QC recount-begin's pre-reset flush, "begin counting"'s finish callback, editTripgenDay's
// finish callback) calls this instead of assigning day.parsed directly. `seq` is
// tripgenCount.js's own session sequence number (see its "Session identity" comment) —
// minted fresh by every beginCounting/beginEditing call and threaded through
// captureLiveSnapshot()/finishLocation()'s callback. A write is only applied if `seq` still
// matches the seq recorded on tgPendingLocation when THIS entryId/dayIdx's session began; a
// mismatch means the shared module state has moved on to a different session since then
// (exactly what happened in both prior bugs) and the write is rejected instead of silently
// landing on the wrong location.
const tgLastGoodByKey = new Map(); // `${entryId}:${dayIdx}` -> {parsed, editSnapshot, ts} — live in-memory mirror, independent of the periodic IndexedDB rolling backups (layer 1)
const COUNT_WRITE_LOG_KEY = 'tc_count_write_log';
const COUNT_WRITE_LOG_MAX = 500;
// Diagnostics (user request following BUG-048: a full day of work happened before the bug was
// even noticed — a downloadable trail of every count-data write, including rejected ones,
// lets a future incident be pinpointed to the exact write instead of narrowed down by hand
// days later). Persisted to localStorage (not just in-memory) so it survives reloads across a
// multi-day field session; folded into the existing "Report a bug" JSON download
// (_bugReportPayload() below) rather than a new UI surface. Generic across every project
// type (not just Trip Gen, which is where this started) — see DEVLOG's cross-count-type
// parity entry: commitProjectSave() itself logs a generic entry for every save regardless of
// projectType, alongside Trip Gen's own more detailed commitLocationCounts()-level entries.
function tgLogWrite(entry) {
  try {
    const log = JSON.parse(localStorage.getItem(COUNT_WRITE_LOG_KEY) || '[]');
    log.push({ t: new Date().toISOString(), ...entry });
    if (log.length > COUNT_WRITE_LOG_MAX) log.splice(0, log.length - COUNT_WRITE_LOG_MAX);
    localStorage.setItem(COUNT_WRITE_LOG_KEY, JSON.stringify(log));
  } catch (_) {}
}
// One-line "what's in this save" summary per project type, for the generic save-log entry
// below — deliberately shallow (counts, not full data) since this is a diagnostics trail, not
// a backup (layer 1's rolling IndexedDB snapshots already cover full-data recovery).
function projectSaveSummary(proj) {
  if (proj.projectType === 'tripgen') {
    return { entries: (proj.entries || []).length, days: (proj.entries || []).reduce((s, e) => s + (e.days || []).length, 0) };
  }
  if (proj.projectType === 'area') {
    return { intersections: (proj.intersections || []).length };
  }
  if (proj.projectType === 'intersection') {
    return { periods: (proj.periods || []).length };
  }
  if (proj.projectType === 'parking') {
    return { zones: (proj.zones || []).length };
  }
  return {};
}
function tgIntervalStats(parsed) {
  const intervals = parsed?.intervals || [];
  const volume = intervals.reduce((s, iv) => s + (iv.inbound || []).reduce((a, b) => a + b, 0) + (iv.outbound || []).reduce((a, b) => a + b, 0), 0);
  return { intervalCount: intervals.length, volume };
}
function commitLocationCounts(entryId, dayIdx, parsed, editSnapshot, seq, source) {
  const pending = tgPendingLocation;
  const stats = tgIntervalStats(parsed);
  const mismatch = !pending || pending.kind !== 'edit' || pending.entryId !== entryId || (pending.dayIdx ?? 0) !== (dayIdx ?? 0) || pending.seq !== seq;
  if (mismatch) {
    tgLogWrite({ outcome: 'rejected', source, entryId, dayIdx, seq, pending: pending ? { ...pending } : null, ...stats });
    console.warn(`[commitLocationCounts] rejected mismatched write from "${source}" — entryId=${entryId} dayIdx=${dayIdx} seq=${seq}`, pending);
    return false;
  }
  const entry = tripgenEntries.find((e) => e.id === entryId);
  const day = entry?.days?.[dayIdx];
  if (!day) {
    tgLogWrite({ outcome: 'rejected-no-day', source, entryId, dayIdx, seq, ...stats });
    return false;
  }
  day.parsed = parsed;
  day.editSnapshot = editSnapshot;
  // If this day is a non-destructive recount of another day (startTripgenRecount() sets
  // supersedesDayIdx when it creates the new day), exclude the superseded day from analysis
  // on every successful commit to THIS day — not just the first one. Checked here, in the
  // single write path every finish route goes through (a direct finish, an abandon-then-
  // resume via editTripgenDay's generic "resume count", or any future path), rather than in
  // startTripgenRecount()'s own one-shot finish closure, which a resumed session bypasses
  // entirely (real gap found by a pre-v1.0.0 stress test: abandoning a recount and resuming
  // it via editTripgenDay left both the original and the recount active/counted).
  const supersedesDayIdx = day.supersedesDayIdx;
  if (supersedesDayIdx != null && entry.days[supersedesDayIdx]) {
    entry.days[supersedesDayIdx].includeInAnalysis = false;
  }
  tgLastGoodByKey.set(`${entryId}:${dayIdx}`, { parsed, editSnapshot, ts: Date.now() });
  tgLogWrite({ outcome: 'committed', source, entryId, dayIdx, seq, ...stats });
  return true;
}

// Single write path for every autosave write site (window.scheduleAutosave's debounced
// callback, flushPendingAutosave, persistAreaStudySnapshotsOnly) — see DEVLOG "count-data
// failsafe" entry. Runs the shrink check (layer 2) before committing, then writes to
// localStorage as before, then fires a rolling backup snapshot (layer 1) on top.
function commitProjectSave(proj) {
  if (!proj) return;
  if (proj.projectType === 'tripgen') {
    let prevProj = null;
    try { prevProj = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) {}
    const shrink = detectTripgenShrink(prevProj, proj);
    if (shrink) {
      const measure = shrink.kind === 'volume' ? 'counted vehicles' : 'counted intervals';
      const ok = window.confirm(
        `Warning: "${shrink.label}" appears to have LOST data.\n\n` +
        `It had ${shrink.prevCount} ${measure} in the last save — this save only has ${shrink.newCount}.\n\n` +
        `This is exactly what happens when a background action (like a QA/QC recount) accidentally overwrites a location's real count.\n\n` +
        `Click Cancel to keep the previous save and NOT overwrite this data (safest if you didn't mean to change this location). Click OK only if you intentionally cleared or are redoing this location's count.`
      );
      tgLogWrite({ outcome: ok ? 'shrink-warning-proceeded' : 'shrink-warning-cancelled', source: 'commitProjectSave', ...shrink });
      if (!ok) { setSaveState('', 0); return; }
    }
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(proj));
    addToRecents(proj);
    tgLogWrite({ outcome: 'project-saved', source: 'commitProjectSave', projectType: proj.projectType, ...projectSaveSummary(proj) });
    setSaveState('Saved', 2000);
  } catch (_) {
    // Most likely a quota-exceeded write failure — itself a save-failure scenario this
    // failsafe needs to survive, not introduce. The rolling backup below is a separate
    // IndexedDB store with its own much larger quota, so still attempt it even if the
    // localStorage write itself failed — a snapshot that made it into backup history is
    // strictly better than one that didn't, especially in exactly this failure mode.
    setSaveState('Save failed — device storage may be full', 5000);
  }
  pushBackupSnapshot(proj, getProjectName(proj)).catch(() => {});
  maybeShowExportReminder();
}

// ── Count-data failsafe, layer 3: export reminder ──
// localStorage/IndexedDB are themselves a single point of failure independent of any app bug
// — an OS storage-pressure eviction, a browser extension, or a "clear browsing data" click can
// wipe them regardless of how good layers 1/2 are. A gentle, dismissible nudge to export a
// real file (an independent copy outside the browser entirely) during a long live count is
// the cheapest defense against that. Deliberately not naggy: only checked while actually on a
// live counting screen, at most once per REMINDER_INTERVAL_MS per project (tracked in
// localStorage so a dismissal or an export sticks across reloads, not just this tab session).
const LIVE_COUNT_SCREENS = new Set(['counter-screen', 'tripgen-counter-screen', 'intersection-qaqc-counter-screen', 'parking-counter-screen']);
const EXPORT_REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function maybeShowExportReminder() {
  if (isViewerMode || !projectType || !projectUUID) return;
  if (!LIVE_COUNT_SCREENS.has(_currentScreen)) return;
  const banner = document.getElementById('export-reminder-banner');
  if (!banner || banner.style.display !== 'none') return; // already showing (or missing from DOM)
  const key = `tc_export_reminder_${projectUUID}`;
  let last = 0;
  try { last = Number(localStorage.getItem(key)) || 0; } catch (_) {}
  if (Date.now() - last < EXPORT_REMINDER_INTERVAL_MS) return;
  banner.style.display = 'flex';
}

function dismissExportReminder() {
  const banner = document.getElementById('export-reminder-banner');
  if (banner) banner.style.display = 'none';
  if (!projectUUID) return;
  try { localStorage.setItem(`tc_export_reminder_${projectUUID}`, String(Date.now())); } catch (_) {}
}

document.getElementById('export-reminder-dismiss')?.addEventListener('click', dismissExportReminder);
document.getElementById('export-reminder-export')?.addEventListener('click', () => {
  dismissExportReminder();
  window.exportAnalyzeXLSX?.();
});

window.scheduleAutosave = function () {
  if (isViewerMode || isQaInputMode) return; // structural guard — neither a viewer's nor a QA reviewer's browser may write locally
  if (!projectType) return;
  setSaveState('Saving…');
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    try {
      // Keep an in-progress Trip Gen location's OWN entry current in the Locations list
      // itself (not just the separate pendingLocation reload-resume side-channel BUG-034
      // already established) — see DEVLOG "Trip Gen begin-counting entry-first fix": the
      // entry is now created the moment counting starts, so it needs its data refreshed on
      // the same cadence as everything else, or it would sit visibly stale/zeroed in the
      // Locations list while a real count is happening.
      if (projectType === 'tripgen' && tgPendingLocation && tgPendingLocation.kind === 'edit' && tgPendingLocation.entryId != null) {
        const live = tgCaptureLiveSnapshot();
        if (live) commitLocationCounts(tgPendingLocation.entryId, tgPendingLocation.dayIdx ?? 0, live.parsed, live.editSnapshot, live.seq, 'autosave-flush');
      }
      const proj = serializeCurrentProject();
      commitProjectSave(proj);
      maybePushSharedUpdate(proj);
    } catch (_) { setSaveState('', 0); }
  }, 2000);
};

// Piggybacks on the autosave path (decision #7) but throttled much harder — only fires a
// Firestore write if this project currently has sharing enabled, and at most once per
// SHARE_PUSH_INTERVAL_MS regardless of how often autosave itself ticks.
function maybePushSharedUpdate(proj) {
  if (isViewerMode) return; // structural guard — never push from a viewer's browser
  if (!proj || !shareInfo.enabled || !shareInfo.shareId || !shareInfo.ownerToken) return;
  const now = Date.now();
  if (now - _lastSharePushAt < SHARE_PUSH_INTERVAL_MS) return;
  _lastSharePushAt = now;
  pushSharedUpdate(shareInfo.shareId, shareInfo.ownerToken, proj).catch(() => {});
}

// Flushes any pending debounced autosave immediately and synchronously. Call this BEFORE
// reassigning activeIntersectionIdx to point at a different area-study intersection than
// whatever is actually loaded live in the counter (showIntersectionAnalysis and
// showIntersectionQaqc both do this — see their comments).
//
// Why this matters (found while verifying QA/QC's area-study write path — see BUGS.md):
// counter.js schedules a 2-second debounced window.scheduleAutosave() on every keystroke.
// If a user counts intersection A, then within that 2-second window drills into a DIFFERENT
// area-study intersection B's Analyze or QA/QC screen (which only reassign
// activeIntersectionIdx for sidebar-highlight bookkeeping — they never reload B's data into
// the live counter globals), the still-pending timer fires AFTER activeIntersectionIdx has
// changed to B, using A's live data. serializeCurrentProject()'s area branch then does
// `areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot()` —
// silently overwriting B's snapshot with A's live counter state. Flushing the pending timer
// synchronously (against the CORRECT, still-matching activeIntersectionIdx) before it
// changes closes that race.
function flushPendingAutosave() {
  if (isViewerMode) return; // structural guard — a viewer's browser must never write locally
  if (!_autosaveTimer) return;
  clearTimeout(_autosaveTimer);
  _autosaveTimer = null;
  try {
    const proj = serializeCurrentProject();
    commitProjectSave(proj);
  } catch (_) { setSaveState('', 0); }
}

// Persists the area-study project as-is, WITHOUT re-deriving
// areaIntersections[activeIntersectionIdx].snapshot from the live counter globals the way
// window.scheduleAutosave()/serializeCurrentProject() always does for area projects.
//
// Why this exists (found while wiring QA/QC's area-study write path — see BUGS.md): both
// showIntersectionAnalysis() and showIntersectionQaqc() set activeIntersectionIdx purely for
// sidebar-highlight bookkeeping when a user drills into a specific area-study intersection —
// neither one loads that intersection's data into the live counter globals (periods/vPairs/
// intersection stay whatever was last loaded via loadIntersectionIntoView/switchIntersection,
// which can easily be a DIFFERENT intersection, or none at all). Analyze never wrote
// anything, so this mismatch was harmless there. QA/QC does write — a recount finish needs to
// persist — and naively calling window.scheduleAutosave() here would let its blind
// `areaIntersections[activeIntersectionIdx].snapshot = serializeIntersectionSnapshot()` step
// silently clobber a DIFFERENT (or the same, but stale) intersection's snapshot with whatever
// unrelated intersection happens to be live in the counter. A QA/QC recount already writes its
// result directly into the correct areaIntersections[idx].snapshot.intersectionQaqc object in
// place (see ixQaqcSource()), so nothing here needs re-deriving from live state — this just
// flushes the areaIntersections array exactly as it stands to localStorage.
function persistAreaStudySnapshotsOnly() {
  if (isViewerMode) return; // structural guard — a viewer's browser must never write locally
  if (projectType !== 'area') { window.scheduleAutosave?.(); return; }
  setSaveState('Saving…');
  try {
    // Field set here must stay in sync with serializeCurrentProject()'s own 'area' branch —
    // see the warning comment there. Checked during the BUG-038 audit (2026-08-19): currently
    // identical, field-for-field.
    const proj = {
      version: 2, projectType: 'area', savedAt: new Date().toISOString(), uuid: projectUUID,
      projectInfo: { ...projectInfo },
      activeIntersectionIdx,
      intersections: areaIntersections.map(ix => ({ name: ix.name, snapshot: ix.snapshot, street1: ix.street1 || '', street2: ix.street2 || '', corridor: ix.corridor || '', counterName: ix.counterName || '', lat: ix.lat || '', lng: ix.lng || '' })),
      shareInfo: { ...shareInfo },
    };
    commitProjectSave(proj);
    maybePushSharedUpdate(proj);
  } catch (_) { setSaveState('', 0); }
}

function clearAutosave() { if (isViewerMode) return; localStorage.removeItem(LS_KEY); }

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
  if (isViewerMode) return; // structural guard — a viewer's browser must never write locally
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

// BUG-044: this was the one write path that DIDN'T check isViewerMode — every other
// autosave call site in the file guards it (see the "structural guard" comments above), but
// this beforeunload handler wrote unconditionally. loadProject(proj, {viewerMode:true})
// still populates the live globals so renderIntersectionAnalysis()/etc. have data to read —
// which means serializeCurrentProject() here would happily serialize the SHARED project and
// silently overwrite the viewer's own local traffic-app-autosave slot the moment they closed
// the tab or navigated away, corrupting whatever they were working on locally with someone
// else's shared data. Found via live testing (this task's required "re-verify localStorage
// stays untouched" check), not by inspection.
window.addEventListener('beforeunload', () => {
  if (!projectType || isViewerMode) return;
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
// Exposed on window so modules that can't import this file's non-exported const directly
// (exportUtdf.js's getUTDFFilename(), setup.js's updateDefaultFilenames()) can read the
// current project name without a circular import. (Previously only exportUtdf.js referenced
// window.projectInfo, but nothing ever assigned it — this line makes that read actually work.)
window.projectInfo = projectInfo;

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

// idPrefix lets the same field-computation logic drive two separate print-header DOM
// instances (the owner Analysis screen's #prh-* and the shared viewer's #share-prh-*) without
// duplicating any of the actual field logic — both read from the same live globals
// (projectInfo/tripgenSiteInfo/intersection/cfg), which loadProject() populates in viewer mode
// exactly the same way it does for the owner.
function populatePrintHeader(idPrefix = 'prh') {
  const isTripgen = projectType === 'tripgen';
  // Title: project name or intersection streets
  const title = projectInfo.projectName ||
    (isTripgen ? (tripgenSiteInfo.location || 'Trip Generation Study') :
      ((intersection.street1 && intersection.street2)
        ? `${intersection.street1} & ${intersection.street2}`
        : intersection.street1 || 'Intersection Count'));
  document.getElementById(`${idPrefix}-title`).textContent = title;

  // Sub-line: location, project number, study purpose
  const subParts = [];
  if (projectInfo.location) subParts.push(projectInfo.location);
  if (projectInfo.projectNumber) subParts.push(`Project #${projectInfo.projectNumber}`);
  if (projectInfo.studyPurpose) subParts.push(projectInfo.studyPurpose);
  document.getElementById(`${idPrefix}-sub`).textContent = subParts.join(' · ');

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
  document.getElementById(`${idPrefix}-meta`).innerHTML = meta.join('');

  // Logo
  const logoEl = document.getElementById(`${idPrefix}-logo`);
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

// gsf = "Facility square footage" (building/leasable floor area) — feeds tripRate()
// unchanged, exactly as before. lotSf = the site/parcel's total land area — additive
// context, never fed into the trip-rate calculation. Together they compute FAR (see
// computeFar() in tripgenSection.js) — that's the "calculation" the two values combine for.
// zolaScreenshotUrl = project-wide ZOLA (NYC zoning-lookup) screenshot, a data: URL read via
// FileReader.readAsDataURL() — same technique as entry.zolaPdfData (per-location zoning PDF,
// unrelated) and entry.days[i].cameraImageUrl (per-day camera view). Shown near the top of
// the Analysis screen's summary, not buried per-day/per-location, since it's shared project
// context rather than something tied to one count location.
const tripgenSiteInfo = { location: '', landUseType: '', gsf: '', lotSf: '', parking: '', units: '', studyDates: '', notes: '', zolaScreenshotUrl: '' };
const tripgenCategoryMap = {};
const tripgenPeakWindows = { weekday: DEFAULT_PEAK_WINDOWS.weekday.map((w) => ({ ...w })), weekend: DEFAULT_PEAK_WINDOWS.weekend.map((w) => ({ ...w })) };
const tripgenQaqc = {};
// Ids of qaSubmissions docs (share.js) already pulled into tripgenQaqc via "check for QA
// submissions" — persisted so re-checking later doesn't re-import the same recount twice.
let tripgenMergedQaSubmissionIds = [];
// QA/QC's own time periods to recount — fully user-defined (v3.47-alpha.4), decoupled from
// tripgenPeakWindows above (which stays fixed AM/Midday/PM for the separate "Peak periods"
// chart). Keyed by qaqcWindowsKey(entryId, sheetName) -> [{id, label, startMin, endMin}].
const tripgenQaqcWindows = {};
let tripgenQaqcWindowNextId = 1;
const tripgenEntries = [];
let tripgenDataView = 'raw';
let tripgenNextId = 1;
// BUG-034: tracks the not-yet-finished live count currently on the board, if any, so
// serializeCurrentProject() can persist it (autosave + explicit save) and a reload can
// resume straight back into the counter instead of silently discarding in-progress work.
// kind:'new' -> not yet in tripgenEntries at all; kind:'edit' -> re-editing an existing
// entry's day, whose ALREADY-SAVED data must not be touched until finish is clicked again.
let tgPendingLocation = null; // { kind:'new', address, date, dayType } | { kind:'edit', entryId, dayIdx }
// Fixed-window report state for Trip Gen's combined view (item 4 — mirrors
// fixedWindowStartMin/fixedWindowEndMin below, which are the intersection/area-study
// equivalent). Not persisted across save/load, matching that side's own behavior.
let tripgenFixedWindowStartMin = 8 * 60;   // 8:00
let tripgenFixedWindowEndMin = 9 * 60;     // 9:00
// Named, saved fixed windows (build brief item 2b — "a second section where the user can add
// in their own peak periods to measure") — unlike the ad-hoc fixedWindowStartMin/EndMin above
// (a single, ephemeral "what am I looking at right now" view), these ARE persisted with the
// project, same as tripgenPeakWindows, since the whole point is measuring the same named
// window (e.g. "school dismissal") consistently across sessions. Reuses fixedWindowForEntry's
// exact windowed-sum logic (tripgenSection.js) — a fixed window is just that computation, run
// once per saved entry instead of once for the current ad-hoc start/end.
let tripgenCustomWindows = []; // [{id, label, startMin, endMin}]
let tripgenCustomWindowNextId = 1;
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
  const map = { 'tg-site-address': 'location', 'tg-site-landuse': 'landUseType', 'tg-site-gsf': 'gsf', 'tg-site-lotsf': 'lotSf', 'tg-site-parking': 'parking', 'tg-site-units': 'units', 'tg-site-studydates': 'studyDates', 'tg-site-notes': 'notes' };
  Object.entries(map).forEach(([id, field]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = tripgenSiteInfo[field] || '';
    el.addEventListener('change', () => { tripgenSiteInfo[field] = el.value; });
  });
  renderTgSiteZolaWrap();
}

// Project-wide ZOLA screenshot control on the setup screen's static site-info card
// (id="tg-site-zola-wrap"). Distinct from renderSiteInfoForm()'s own upload control in
// tripgenSection.js (Analysis screen) — same tripgenSiteInfo.zolaScreenshotUrl field,
// two independent editors, same dual-location pattern as gsf/lotSf (BUG-017: separate ids
// here vs. data-site-field on the Analysis side, so the two never collide).
function renderTgSiteZolaWrap() {
  const wrap = document.getElementById('tg-site-zola-wrap');
  if (!wrap) return;
  wrap.innerHTML = tripgenSiteInfo.zolaScreenshotUrl
    ? `<div>
         <img src="${tripgenSiteInfo.zolaScreenshotUrl}" alt="ZOLA screenshot" style="max-width:100%;max-height:400px;width:auto;height:auto;display:block;border-radius:4px;border:1px solid var(--border);margin-bottom:6px">
         <button type="button" id="tg-site-zola-clear" style="font-size:12px">&times; remove</button>
       </div>`
    : `<label style="display:inline-block;cursor:pointer;font-size:12px;color:var(--blue-text)">
         upload screenshot&hellip; <input type="file" accept="image/*" id="tg-site-zola-upload" style="display:none">
       </label>`;
  document.getElementById('tg-site-zola-upload')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      tripgenSiteInfo.zolaScreenshotUrl = evt.target.result;
      renderTgSiteZolaWrap();
      window.scheduleAutosave?.();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('tg-site-zola-clear')?.addEventListener('click', () => {
    tripgenSiteInfo.zolaScreenshotUrl = '';
    renderTgSiteZolaWrap();
    window.scheduleAutosave?.();
  });
}
wireSiteInfoFields();

function renderTripgenLocationsList() {
  const root = document.getElementById('tripgen-locations-list');
  if (!tripgenEntries.length) {
    root.innerHTML = '<div class="stat-detail">No locations added yet.</div>';
    syncTripgenLocationsScreenIfVisible();
    return;
  }

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
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Access-point reference document <span style="color:var(--text3)">(optional PDF — e.g. a curb-cut permit or site plan specific to THIS location; not the same as the project-wide ZOLA screenshot in Project Info, which applies to the whole site)</span></div>
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
            ${d.inProgress ? `<span class="in-progress-badge" title="Count in progress — not finished yet. Click Resume count to continue.">&#9679; in progress</span>` : ''}
            ${d.includeInAnalysis === false ? `<span class="in-progress-badge" title="Superseded by a recount — not included in QA/QC or Analysis. Still saved and can be brought back.">excluded from analysis</span>` : ''}
            ${d.editSnapshot ? `<button data-tg-edit-entry="${e.id}" data-tg-edit-day="${i}" style="font-size:11px;margin-left:8px">${d.inProgress ? 'resume count' : 'edit counts'}</button>` : ''}
            ${d.parsed && !d.inProgress ? `<button data-tg-recount-entry="${e.id}" data-tg-recount-day="${i}" title="Start a new count for this location, added as its own day — for when QA/QC finds the original count needs a full redo, not just a spot-check" style="font-size:11px;margin-left:6px">↻ recount</button>` : ''}
            ${d.parsed && !d.inProgress ? `<button data-tg-toggle-analysis-entry="${e.id}" data-tg-toggle-analysis-day="${i}" style="font-size:11px;margin-left:6px">${d.includeInAnalysis === false ? '✓ include in analysis' : '✕ exclude from analysis'}</button>` : ''}
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
  root.querySelectorAll('[data-tg-recount-entry]').forEach((el) => {
    el.addEventListener('click', () => {
      startTripgenRecount(Number(el.dataset.tgRecountEntry), Number(el.dataset.tgRecountDay));
    });
  });
  root.querySelectorAll('[data-tg-toggle-analysis-entry]').forEach((el) => {
    el.addEventListener('click', () => {
      const entry = tripgenEntries.find((e) => e.id === Number(el.dataset.tgToggleAnalysisEntry));
      const day = entry?.days?.[Number(el.dataset.tgToggleAnalysisDay)];
      if (!day) return;
      day.includeInAnalysis = day.includeInAnalysis === false ? true : false;
      renderTripgenLocationsList();
      window.scheduleAutosave?.();
    });
  });
  // Access-point reference document upload (relabeled from "Zoning reference PDF" — see
  // BUGS.md for the perceived-duplication writeup against the project-wide ZOLA screenshot;
  // field name kept as zolaPdfData/zolaPdfName to avoid a save/load migration)
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
  syncTripgenLocationsScreenIfVisible();
}

// Item 13 (build brief): the "add a location" form now also lives on the Location Counts
// screen (renderTripgenLocationsScreen's own #tripgen-locations-screen-root), not just
// Setup's compact tab — so every existing call site above that already refreshes Setup's
// #tripgen-locations-list (many, scattered through add/remove/relabel/upload handlers) needs
// the OTHER screen refreshed too, whichever is actually visible right now. Centralized here
// once rather than touching every call site individually.
function syncTripgenLocationsScreenIfVisible() {
  if (document.getElementById('tripgen-locations-screen')?.style.display !== 'none') renderTripgenLocationsScreen();
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
// Trip Gen equivalent of setup.js's hasCountData() — true once at least one location in
// this project carries real (nonzero) interval data, at which point the classification
// list's drag-to-reorder locks (see BUGS.md discipline: reordering after data exists would
// silently scramble which historical column means what). A location with only zeroed
// intervals (e.g. an XLSX import whose sheet turned out empty) doesn't count as "has data."
function hasTripgenCountData() {
  return tripgenEntries.some((e) => (e.days || []).some((d) => {
    const p = d.parsed;
    if (!p || !p.intervals) return false;
    return p.intervals.some((iv) => (iv.inbound || []).some((v) => v) || (iv.outbound || []).some((v) => v));
  }));
}
// Renders the read-only classifications summary shown on the locations tab's "start a new
// count" panel, now that the actual editor lives on its own "classifications" tab (see
// switchTgTab). Called whenever that panel is opened so it reflects whatever's currently
// configured, without needing a live two-way binding to the other tab's DOM.
function updateTgClassificationsSummary() {
  const el = document.getElementById('tg-classifications-summary');
  if (!el) return;
  const list = tgGetClassifications();
  el.textContent = list.length
    ? `${list.length} classification${list.length === 1 ? '' : 's'} defined: ${list.map((c) => c.label).join(', ')}`
    : 'No classifications defined yet — click "Edit classifications →" to add some.';
}
document.getElementById('btn-tripgen-start-new')?.addEventListener('click', () => {
  const area = document.getElementById('tripgen-new-count-area');
  const isHidden = area.style.display === 'none';
  area.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    tgSetClassificationsLocked(hasTripgenCountData());
    // Classifications are project-wide config now (their own tab), not reset per location —
    // only seed one blank starter row the very first time this project has none at all, so a
    // brand-new project isn't left with an empty, unusable list. Anything already configured
    // (here or on an earlier location) carries forward unchanged.
    if (tgGetClassifications().length === 0) tgAddClassification();
    tgRenderClassificationsList();
    updateTgClassificationsSummary();
  }
});
document.getElementById('btn-tg-add-classification')?.addEventListener('click', () => { tgAddClassification(); renderTgCategoryMapEditor(); });

// Classification grouping — moved to Setup's classifications tab from the Analysis screen per
// direct user request ("classification grouping should be an option in classification
// setup... a link at the top of the summary section to take the user there to edit"). Reads
// the live classification list (not "every type ever seen in an entry," which the old
// Analysis-page form used — that reads before any location exists, and classifications are
// project-wide config now anyway) and backfills a starting suggestion via the same
// categoryFor() heuristic the Analysis screen's grouping already relied on, so a freshly
// added classification isn't left ungrouped until someone visits Analysis first.
async function renderTgCategoryMapEditor() {
  const tbody = document.querySelector('#tg-category-map-table tbody');
  if (!tbody) return;
  const labels = tgGetClassifications().map((c) => c.label).filter(Boolean);
  await Promise.all(labels.map(async (label) => {
    if (!(label in tripgenCategoryMap)) tripgenCategoryMap[label] = await analysisData.categoryFor(label);
  }));
  tbody.innerHTML = labels.map((label) => `
    <tr><td>${escapeHtmlMain(label)}</td><td><input type="text" data-tg-category-field="${escapeHtmlMain(label)}" value="${escapeHtmlMain(tripgenCategoryMap[label] || '')}" style="width:160px" /></td></tr>
  `).join('') || '<tr><td colspan="2" style="color:var(--text3)">Add a classification above first.</td></tr>';
  tbody.querySelectorAll('[data-tg-category-field]').forEach((input) => {
    input.addEventListener('change', () => {
      tripgenCategoryMap[input.dataset.tgCategoryField] = input.value.trim() || input.dataset.tgCategoryField;
      window.scheduleAutosave?.();
    });
  });
}
document.getElementById('btn-tg-jump-classifications')?.addEventListener('click', () => {
  // Item 13: this button now lives on the Location Counts screen too (the add-a-location
  // panel moved there), not only inside Setup itself — switchTgTab() only toggles internal
  // tab state, it doesn't show the Setup screen, so navigate there first (openWorkspaceTab
  // handles both the screen switch and the sidebar highlight) or the tab switch would happen
  // invisibly behind whichever screen is currently on top.
  openWorkspaceTab('tg-setup');
  const btn = document.querySelector('#tripgen-setup-screen .tg-tab[data-tgtab="classifications"]');
  switchTgTab('classifications', btn);
});
// Build brief item 1: the counter header should identify which location is being counted
// whenever a site has more than one — a single-location site has nothing to disambiguate, so
// the header stays plain in that case rather than always showing a label nobody needs to read.
// Deliberately checked at call time (not cached), since tripgenEntries.length can cross the
// 1->2 threshold mid-session (e.g. this call happens right after the 2nd location's entry is
// pushed, in the same click handler).
function setTgCounterHeaderLabel(locationLabel) {
  const el = document.getElementById('tg-counter-sub');
  if (el) el.textContent = tripgenEntries.length > 1 ? `— ${locationLabel}` : '';
}
// Set by the "+ add another day" button on an existing location's card (below) — a genuinely
// independent additional calendar day for a location that already has data (e.g. a weekday AND
// a weekend count), NOT a QA redo of an existing day (that's "↻ recount", which supersedes the
// day it replaces). Consumed once by btn-tg-begin-counting's handler and reset immediately, so
// the very next "begin counting" click (from anywhere else) goes back to creating a brand-new
// location as normal.
let tgAddDayTargetEntryId = null;
document.getElementById('btn-tg-begin-counting')?.addEventListener('click', () => {
  const ctx = requireLocationContext();
  if (!ctx) return;
  const dayType = dayTypeFromDate(ctx.date);
  const targetEntryId = tgAddDayTargetEntryId;
  tgAddDayTargetEntryId = null;
  const targetEntry = targetEntryId != null ? tripgenEntries.find((e) => e.id === targetEntryId) : null;
  // Item 13: the add-a-location form (and this "begin counting" button) now lives only on
  // the Location Counts screen, not Setup — so "save and exit" from the counter should
  // return there, not to Setup (which no longer has this form to come back to).
  tgCounterBackTarget = 'tripgen-locations-screen';
  // entryId/dayIdx are assigned AFTER tgBeginCounting succeeds (below) but the finish callback
  // closes over these outer variables, so it sees the real values once counting actually starts.
  let entryId = null, dayIdx = 0;
  const started = tgBeginCounting((parsed, editSnapshot, seq) => {
    commitLocationCounts(entryId, dayIdx, parsed, editSnapshot, seq, 'begin-counting-finish');
    const entry = tripgenEntries.find((e) => e.id === entryId);
    const day = entry?.days?.[dayIdx];
    if (day) day.inProgress = false;
    tgPendingLocation = null;
    renderTripgenLocationsList();
    // "finish location" takes you straight into the data view, not back to a bare list.
    goToTripgenAnalyze();
    window.scheduleAutosave?.();
  });
  if (!started) return;
  // BUG fix: create the location's entry in the Locations list IMMEDIATELY (zeroed data),
  // rather than waiting for "finish location" to create it. Previously an in-progress count
  // was invisible in the list until finished (tracked only via the separate tgPendingLocation
  // side-channel) — a user who stepped away mid-count (e.g. back to setup to fix a
  // classification, without finishing) saw no evidence anything had started, and re-clicking
  // "begin counting" silently re-zeroed the live in-progress state out from under them. Now
  // the entry shows up immediately as an "in progress" card they can click straight back into
  // (via the same editTripgenDay resume path finished entries already use) instead of
  // accidentally starting a second, conflicting session.
  const snap = tgCaptureLiveSnapshot(); // tgData is freshly zeroed at this point — safe placeholder
  const newDay = { sheetName: formatDateLong(ctx.date), dayType, date: ctx.date, parsed: null, editSnapshot: null, inProgress: true };
  if (targetEntry) {
    // "+ add another day" — append to the EXISTING location's entry rather than creating a new
    // one. A plain new day, no supersedesDayIdx/includeInAnalysis link to any other day — this
    // is a genuinely separate calendar day's count, included in analysis like any other.
    entryId = targetEntry.id;
    dayIdx = targetEntry.days.length;
    targetEntry.days.push(newDay);
  } else {
    entryId = tripgenNextId++;
    tripgenEntries.push({ id: entryId, filename: '(live count)', locationLabel: ctx.address, meta: {}, days: [newDay] });
  }
  // Reuse the exact same pending shape editTripgenDay() already uses to resume a finished
  // entry for editing — an in-progress entry is now just a special case of "editing an
  // existing entry," not a separate code path.
  tgPendingLocation = { kind: 'edit', entryId, dayIdx, seq: tgGetSessionSeq() };
  if (snap) commitLocationCounts(entryId, dayIdx, snap.parsed, snap.editSnapshot, snap.seq, 'begin-counting-placeholder');
  clearLocationContext();
  renderTripgenLocationsList();
  setTgCounterHeaderLabel(ctx.address);
  showScreen('tripgen-counter-screen');
});

// Re-opens a previously-finished live count for editing (only entries that were live-counted
// carry the entry-key/cfg snapshot needed to reconstruct the keyboard counter — uploaded/
// pasted entries have no live-count step to return to).
// backTarget: which screen the counter's own "save and exit" button should return to —
// defaults to Setup (the historical caller) but the Location Counts screen passes itself
// so editing from there returns there, not back into Setup.
function editTripgenDay(entryId, dayIdx, backTarget) {
  const entry = tripgenEntries.find((e) => e.id === entryId);
  const day = entry?.days[dayIdx];
  if (!day?.editSnapshot) return;
  tgCounterBackTarget = backTarget || 'tripgen-setup-screen';
  setTgCounterHeaderLabel(entry.locationLabel);
  showScreen('tripgen-counter-screen');
  tgPendingLocation = { kind: 'edit', entryId, dayIdx };
  tgBeginEditing(day.editSnapshot, day.parsed, (parsed, editSnapshot, seq) => {
    commitLocationCounts(entryId, dayIdx, parsed, editSnapshot, seq, 'edit-day-finish');
    day.inProgress = false; // clears the "in progress" badge if this was the begin-counting placeholder entry
    tgPendingLocation = null;
    renderTripgenLocationsList();
    goToTripgenAnalyze();
    window.scheduleAutosave?.();
  });
  tgPendingLocation.seq = tgGetSessionSeq();
}
window.editTripgenDay = editTripgenDay;

// Infers a recount cfg (start time, interval length, duration) from a day's already-parsed
// intervals — used only when the day has no editSnapshot (an uploaded/pasted day never had a
// live-count cfg to begin with) so a full recount still has sensible defaults to start from.
function tgInferCfgFromParsed(parsed) {
  const intervals = parsed?.intervals || [];
  if (!intervals.length) return { startMinutes: 0, intervalMin: 15, durationMin: 1440 };
  const intervalMin = inferIntervalMinutes(intervals);
  return { startMinutes: toMinFromLabel(intervals[0].start), intervalMin, durationMin: intervals.length * intervalMin };
}

// A QA/QC recount (data-qaqc-begin above) is a bounded spot-check that never touches the
// location's own real data. This is the other case: QA/QC found the ORIGINAL count itself is
// bad enough that it needs to be fully redone, not just verified against a sample window —
// added at the user's request after confirming no such path existed (only "edit counts",
// which adds to/adjusts existing data with no bulk-clear, or deleting the whole location
// entry and starting over from nothing, losing its camera image/reference PDF/label).
//
// Deliberately NON-destructive (revised per user request: "keep the first count, add the
// recount as its own new count") — rather than overwriting the source day, this pushes a
// BRAND NEW day onto the same entry and counts into that, using the source day's own
// classifications/timing (or, for an uploaded/pasted day with no live-count snapshot, timing
// inferred from its parsed intervals). The original day's data is never touched — on finish,
// only its `includeInAnalysis` flag flips to false (see below), which is fully reversible via
// the Locations list's own toggle, not a destructive edit. Routes through
// commitLocationCounts() on finish, the same gated write path BUG-047/048 established, so this
// gets the same session-identity check and diagnostics logging as every other count-data write,
// not a separate bespoke path.
function startTripgenRecount(entryId, sourceDayIdx, backTarget) {
  const entry = tripgenEntries.find((e) => e.id === entryId);
  const sourceDay = entry?.days?.[sourceDayIdx];
  if (!sourceDay?.parsed) return;
  const sourceLabel = sourceDay.date ? formatDateLong(sourceDay.date) : sourceDay.sheetName;
  const ok = window.confirm(
    `Start a new recount for "${entry.locationLabel}" — ${sourceLabel}?\n\n` +
    `This adds a brand-new count as its own day, alongside the existing one — nothing is deleted. As soon as the recount has real data (even before you click finish), the original day is automatically excluded from QA/QC and Analysis in its place — but it stays visible in the Locations list and can be switched back in at any time.`
  );
  if (!ok) return;
  const classificationList = sourceDay.editSnapshot?.classifications || tgDefaultClassificationsFor(sourceDay.parsed.types);
  const recountCfg = sourceDay.editSnapshot?.cfg || tgInferCfgFromParsed(sourceDay.parsed);
  tgCounterBackTarget = backTarget || 'tripgen-setup-screen';
  setTgCounterHeaderLabel(entry.locationLabel);
  showScreen('tripgen-counter-screen');
  const newDayIdx = entry.days.length;
  entry.days.push({
    sheetName: `${sourceLabel} (recount)`, dayType: sourceDay.dayType, date: sourceDay.date,
    parsed: null, editSnapshot: null, inProgress: true,
    // Persisted on the DAY itself, not just captured in this closure (stress-test finding:
    // abandoning this recount before finishing and later resuming it via the generic
    // editTripgenDay() "resume count" path bypasses this closure entirely — with the
    // supersede-source-day step living only here, that path silently left both the original
    // and the recount active, double-counting the location). commitLocationCounts() below
    // checks this field on every commit regardless of which finish path reaches it.
    supersedesDayIdx: sourceDayIdx,
  });
  tgPendingLocation = { kind: 'edit', entryId, dayIdx: newDayIdx };
  const started = tgBeginFullRecount(classificationList, recountCfg, (parsed, editSnapshot, seq) => {
    commitLocationCounts(entryId, newDayIdx, parsed, editSnapshot, seq, 'recount-finish');
    entry.days[newDayIdx].inProgress = false;
    tgPendingLocation = null;
    renderTripgenLocationsList();
    goToTripgenAnalyze();
    window.scheduleAutosave?.();
  });
  if (!started) { entry.days.splice(newDayIdx, 1); tgPendingLocation = null; return; }
  tgPendingLocation.seq = tgGetSessionSeq();
}
window.startTripgenRecount = startTripgenRecount;

// ── Location Counts screen (sidebar "Location counts") — a larger, more detailed browse/
// manage view of every location in the current Trip Gen project, distinct from Setup's
// compact "locations" tab (which stays focused on adding a new location). Editing a day
// reuses editTripgenDay() — no separate edit path.
function tgLocationDayStats(day) {
  if (!day.parsed) return { classCount: 0, totalVolume: null };
  const classCount = (day.parsed.types || []).length;
  const totalVolume = (day.parsed.intervals || []).reduce(
    (s, iv) => s + iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0), 0);
  return { classCount, totalVolume };
}

function renderTripgenLocationsScreen() {
  const root = document.getElementById('tripgen-locations-screen-root');
  if (!root) return;
  if (!tripgenEntries.length) {
    root.innerHTML = `<div class="setup-card"><div class="stat-detail">No locations added yet. Use "+ add a location" above to upload a file, paste a table, or start a live count.</div></div>`;
    return;
  }

  const cards = tripgenEntries.map((entry) => {
    const dayRows = entry.days.map((d, i) => {
      const { classCount, totalVolume } = tgLocationDayStats(d);
      const canEdit = !!d.editSnapshot;
      const dateLabel = d.date ? formatDateLong(d.date) : escapeHtmlMain(d.sheetName);
      const dayTypeLabel = d.dayType ? `<span class="stat-detail" style="text-transform:capitalize">${escapeHtmlMain(d.dayType)}</span>` : '';
      return `
        <div class="stat-card"${canEdit ? ` data-tg-loc-edit-entry="${entry.id}" data-tg-loc-edit-day="${i}" style="cursor:pointer"` : ''} title="${canEdit ? 'Click to open this day for editing' : 'No live-count snapshot to edit (uploaded/pasted data)'}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-size:13px;font-weight:500">${dateLabel}</span>
            ${d.inProgress ? `<span class="in-progress-badge">&#9679; in progress</span>` : ''}
            ${d.includeInAnalysis === false ? `<span class="in-progress-badge" title="Superseded by a recount — not included in QA/QC or Analysis">excluded</span>` : ''}
          </div>
          ${dayTypeLabel}
          <div style="display:flex;gap:14px;margin-top:6px">
            <div>
              <div class="stat-value" style="font-size:18px">${totalVolume === null ? '—' : totalVolume.toLocaleString()}</div>
              <div class="stat-detail">total volume (in+out)</div>
            </div>
            <div>
              <div class="stat-value" style="font-size:18px">${classCount || '—'}</div>
              <div class="stat-detail">classifications</div>
            </div>
          </div>
          ${canEdit ? `<div style="font-size:11px;color:var(--blue-text);margin-top:6px">${d.inProgress ? 'resume count →' : 'edit counts →'}</div>` : ''}
          ${d.parsed && !d.inProgress ? `<button data-tg-loc-recount-entry="${entry.id}" data-tg-loc-recount-day="${i}" title="Start a new count for this location, added as its own day — for when QA/QC finds the original count needs a full redo" style="font-size:11px;margin-top:4px">↻ recount</button>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="setup-card" style="margin-bottom:16px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:4px">
          <h2 style="margin-bottom:0">${escapeHtmlMain(entry.locationLabel) || '(unlabeled location)'}</h2>
          <span class="stat-detail" style="white-space:nowrap">${entry.days.length} day${entry.days.length === 1 ? '' : 's'} counted</span>
        </div>
        <div class="stat-detail" style="margin-bottom:12px">source: ${escapeHtmlMain(entry.filename)}</div>
        <div class="card-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
          ${dayRows}
        </div>
        <button type="button" class="no-print" data-tg-loc-add-day="${entry.id}" title="Count this same location on a different calendar day (e.g. a weekend in addition to a weekday) — a genuinely separate day, not a QA redo of an existing one" style="font-size:11px;margin-top:10px">+ add another day</button>
      </div>`;
  }).join('');

  root.innerHTML = cards;

  root.querySelectorAll('[data-tg-loc-edit-entry]').forEach((el) => {
    el.addEventListener('click', () => {
      editTripgenDay(Number(el.dataset.tgLocEditEntry), Number(el.dataset.tgLocEditDay), 'tripgen-locations-screen');
    });
  });
  root.querySelectorAll('[data-tg-loc-recount-entry]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // nested inside the whole-card click-to-edit handler above
      startTripgenRecount(Number(el.dataset.tgLocRecountEntry), Number(el.dataset.tgLocRecountDay), 'tripgen-locations-screen');
    });
  });
  root.querySelectorAll('[data-tg-loc-add-day]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      startTripgenAddDay(Number(el.dataset.tgLocAddDay));
    });
  });
}

// "+ add another day" (user request) — a genuinely independent additional calendar day for a
// location that already has data (e.g. a weekday AND a weekend count of the same driveway),
// distinct from "↻ recount" (which supersedes the day it redoes for QA purposes). Pre-fills
// the add-location form with this location's own address so the resulting count appends to
// the SAME entry (see btn-tg-begin-counting's tgAddDayTargetEntryId handling) instead of
// creating a new one, and just needs a date before "Start a new count…".
function startTripgenAddDay(entryId) {
  const entry = tripgenEntries.find((e) => e.id === entryId);
  if (!entry) return;
  tgAddDayTargetEntryId = entryId;
  document.getElementById('tg-location-address').value = entry.locationLabel;
  document.getElementById('tg-location-date').value = '';
  const panel = document.getElementById('tg-loc-add-panel');
  if (panel) { panel.style.display = ''; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  document.getElementById('tg-location-date')?.focus();
}
document.getElementById('btn-tg-locations-back')?.addEventListener('click', () => showScreen('tripgen-setup-screen'));
// Item 13: "+ add a location" used to bounce back to Setup's own copy of this form — now the
// form lives directly on this screen (see index.html's #tg-loc-add-panel), so this just
// reveals it in place instead of navigating away.
document.getElementById('btn-tg-locations-add')?.addEventListener('click', () => {
  const panel = document.getElementById('tg-loc-add-panel');
  if (!panel) return;
  const showing = panel.style.display !== 'none';
  panel.style.display = showing ? 'none' : '';
  if (!showing) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('btn-tgp-goto-locations')?.addEventListener('click', () => openWorkspaceTab('tg-locations'));
// The counter screen is reused for both "count a new location" and "QA/QC recount" flows —
// each begin* call sets this so the back button returns to the right place rather than
// always assuming the location-setup flow.
let tgCounterBackTarget = 'tripgen-setup-screen';
document.getElementById('tg-btn-finish')?.addEventListener('click', () => tgFinishLocation());
document.getElementById('tg-btn-to-setup')?.addEventListener('click', () => showScreen(tgCounterBackTarget));
// Per-table CSV download for the live counter (user request) — exports exactly what's on
// screen right now (every interval, every classification's in/out, running as typed so far),
// not the project-wide export elsewhere. Uses tgLiveState() (tripgenCount.js) rather than
// waiting for finish, so it works mid-count too.
document.getElementById('tg-btn-export-csv')?.addEventListener('click', () => {
  const { classifications, tgData, cfg } = tgLiveState();
  if (!classifications.length) return;
  const slots = Math.max(1, Math.round(cfg.durationMin / cfg.intervalMin));
  const header = ['Time', ...classifications.flatMap((c) => [`${c.label} In`, `${c.label} Out`]), 'Total', 'Note'];
  const rows = [header];
  for (let i = 0; i < slots; i++) {
    const start = cfg.startMinutes + i * cfg.intervalMin;
    const label = `${minToTimeStr(start)}–${minToTimeStr(start + cfg.intervalMin)}`;
    let rowTotal = 0;
    const cells = classifications.flatMap((_, ci) => {
      const inV = tgData.in[i]?.[ci] || 0, outV = tgData.out[i]?.[ci] || 0;
      rowTotal += inV + outV;
      return [inV, outV];
    });
    rows.push([label, ...cells, rowTotal, tgData.notes?.[i] || '']);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const label = (document.getElementById('tg-counter-sub')?.textContent || 'trip-gen-count').replace(/^—\s*/, '');
  a.download = `${label.replace(/[^a-z0-9]/gi, '-') || 'trip-gen-count'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
tgWireKeydown();
ixQaqcWireKeydown();

// ═══════════════════════════════════════════
// QA/QC — standalone recount flow (separate from Analysis so data entry isn't competing
// with site info / category grouping / charts for screen space). Recounts use the SAME
// classifications as the original count (never a single aggregate number) so a recount
// can't be transcribed against the wrong category. Multiple recounts per peak are
// supported via "+ add count" — qaqc[peakKey].recounts is an array, not a single value.
// ═══════════════════════════════════════════
function inferIntervalMinutes(intervals) {
  if (intervals.length < 2) return 15;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return Math.max(1, toMin(intervals[1].start) - toMin(intervals[0].start));
}
let tgQaqcNextId = 1;

// Owner-side pull for the QA-input link (share.js's submitQaRecount/fetchQaSubmissions):
// remote submissions land in Firestore only, never in this browser's tripgenQaqc, until the
// owner explicitly asks to check. Dedups against tripgenMergedQaSubmissionIds so re-checking
// never double-imports the same recount, and tags each imported recount with
// `source: 'remote-qa'` so it's visually distinguishable from one entered locally.
async function handleCheckQaSubmissions() {
  if (!shareInfo.shareId) { alert('Enable sharing first to get a QA-input link.'); return; }
  const btn = document.getElementById('btn-qaqc-check-submissions');
  if (btn) { btn.disabled = true; btn.textContent = 'checking…'; }
  try {
    const submissions = await fetchQaSubmissions(shareInfo.shareId);
    const fresh = submissions.filter((s) => !tripgenMergedQaSubmissionIds.includes(s.id));
    for (const s of fresh) {
      const key = qaqcPeakKey(s.entryId, s.sheetName, s.windowId);
      tripgenQaqc[key] = tripgenQaqc[key] || { recounts: [] };
      tripgenQaqc[key].recounts.push({
        id: tgQaqcNextId++, classifications: s.classifications, cfg: s.cfg, parsed: s.parsed,
        enteredAt: s.enteredAt, source: 'remote-qa',
      });
      tripgenMergedQaSubmissionIds.push(s.id);
    }
    if (fresh.length) {
      window.scheduleAutosave?.();
      renderQaqcScreen();
    }
    setSaveState(fresh.length ? `Imported ${fresh.length} QA submission${fresh.length === 1 ? '' : 's'}` : 'No new QA submissions', 2500);
  } catch (e) {
    alert('Could not check for QA submissions. Check your connection and try again.\n\n' + (e?.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'check for QA submissions'; }
  }
}
document.getElementById('btn-qaqc-check-submissions')?.addEventListener('click', handleCheckQaSubmissions);
document.getElementById('btn-qaqc-to-setup')?.addEventListener('click', () => showScreen('tripgen-setup-screen'));
document.getElementById('btn-qaqc-to-analyze')?.addEventListener('click', () => goToTripgenAnalyze());
document.getElementById('btn-analyze-to-qaqc')?.addEventListener('click', () => { showScreen('tripgen-qaqc-screen'); renderQaqcScreen(); });

// Build brief item 2a: scrolls to and briefly highlights one QA/QC card, used by the
// Analysis page's summary-row "QA/QC →" links. renderQaqcScreen() is async and
// openWorkspaceTab('tg-qaqc') doesn't await it (its own switch-case signature is sync, and
// changing that ripples through every other case), so the target card may not exist in the
// DOM yet the instant this runs — polls briefly rather than assuming the render already
// finished.
// "explain this score →" detail screen — reached from a QA/QC card's Score detail section and
// from the Analysis page's QA/QC summary table (both pass the same qaqcPeakKey-format key).
let tgQaqcDetailBackTarget = 'tripgen-qaqc-screen';
async function showTgQaqcDetail(key, backTarget) {
  tgQaqcDetailBackTarget = backTarget || 'tripgen-qaqc-screen';
  const parts = key.split('__');
  const entryId = Number(parts[0]);
  const windowId = Number(parts[parts.length - 1]);
  const sheetName = parts.slice(1, -1).join('__');
  const entry = tripgenEntries.find((e) => e.id === entryId);
  const day = entry?.days.find((d) => d.sheetName === sheetName);
  const w = tripgenQaqcWindows[qaqcWindowsKey(entryId, sheetName)]?.find((win) => win.id === windowId);
  const root = document.getElementById('tripgen-qaqc-detail-root');
  showScreen('tripgen-qaqc-detail-screen');
  if (!entry || !day || !w) { root.innerHTML = '<div class="stat-detail">This QA/QC window no longer exists.</div>'; return; }
  root.innerHTML = '<div class="stat-detail">Loading…</div>';
  const computed = await computeQaqcPeakScore(entry, day, w, tripgenQaqc);
  const dayLabel = day.date ? formatDateLong(day.date) : day.sheetName;
  root.innerHTML = await renderQaqcScoreDetailHTML(entry.locationLabel, dayLabel, w.label, computed);
}
document.getElementById('btn-qaqc-detail-back')?.addEventListener('click', () => showScreen(tgQaqcDetailBackTarget));

function scrollToQaqcCard(key, attemptsLeft = 20) {
  const el = document.querySelector(`[data-qaqc-card="${CSS.escape(key)}"]`);
  if (!el) {
    if (attemptsLeft > 0) setTimeout(() => scrollToQaqcCard(key, attemptsLeft - 1), 50);
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('qaqc-card-highlight');
  setTimeout(() => el.classList.remove('qaqc-card-highlight'), 1600);
}

// Read-only classification reference (user request) — the reviewer doing a QA/QC recount
// needs to know exactly what each classification means (its label and any description) to
// count consistently with the original, but that list otherwise only lives on Setup's
// classifications tab. Rather than sending the reviewer to go find it, show it right here.
// Project-wide (tgGetClassifications(), not per-location/day) — matches how classifications
// are stored (BUG-035: project-wide config, not per-count data).
function renderQaqcClassificationRef() {
  const root = document.getElementById('qaqc-classification-ref');
  if (!root) return;
  const list = tgGetClassifications();
  if (!list.length) { root.innerHTML = ''; return; }
  root.innerHTML = `
    <div style="font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Classifications (reference)</div>
    <table class="crosswalk-table">
      <thead><tr><th>Label</th><th>Description</th></tr></thead>
      <tbody>${list.map((c) => `<tr><td>${escapeHtmlMain(c.label)}</td><td style="color:var(--text2)">${c.def ? escapeHtmlMain(c.def) : '<span style="color:var(--text3)">—</span>'}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

async function renderQaqcScreen() {
  const root = document.getElementById('tripgen-qaqc-list');
  renderQaqcClassificationRef();
  if (!tripgenEntries.length) { root.innerHTML = '<div class="stat-detail">No locations counted yet — add one from setup first.</div>'; return; }
  // This function awaits a real per-window peak-score computation (computeQaqcPeakScore) for
  // every location/day/window before it has anything to show — on a real project (several
  // locations, a full day's intervals, QA/QC on more than one location) that's long enough to
  // look broken with nothing on screen. Callers don't await this (openWorkspaceTab's switch is
  // sync), so paint a loading state before the async work starts — but only on a genuinely
  // fresh/empty render (a first navigation here), not on the several in-place re-render calls
  // below (add/remove a recount or window) where the root already has real content and
  // flashing "Loading…" over it on every small edit would be worse than the delay itself.
  if (!root.innerHTML) root.innerHTML = '<div class="stat-detail">Loading QA/QC…</div>';
  const locGroups = [];
  for (const entry of tripgenEntries) {
    const dayBlocks = [];
    for (const day of tgIncludedDays(entry)) {
      const intervalMinutes = inferIntervalMinutes(day.parsed.intervals);
      const winKey = qaqcWindowsKey(entry.id, day.sheetName);
      const windows = tripgenQaqcWindows[winKey] || [];
      const windowCards = [];
      for (const w of windows) {
        const key = qaqcPeakKey(entry.id, day.sheetName, w.id);
        // Single source of truth (build brief item 2a): the peak lookup AND the
        // interval-by-interval score comparison both come from computeQaqcPeakScore, the
        // exact same function the Analysis page's summary row uses — this screen's "Hour
        // found" line and score can never disagree with what the summary table shows.
        const computed = await computeQaqcPeakScore(entry, day, w, tripgenQaqc);
        const { peak, alignedRecounts, perClassResults } = computed;
        const recounts = tripgenQaqc[key]?.recounts || [];
        const hasHour = peak.startIdx >= 0;
        const defaultStart = hasHour ? peak.startIdx * intervalMinutes + toMinFromLabel(day.parsed.intervals[0].start) : w.startMin;
        const alignedIds = new Set(alignedRecounts.map((r) => r.id));
        const avgNote = recounts.length > 1
          ? `<div class="stat-detail" style="margin-bottom:6px;color:var(--text2)">${recounts.length} recounts on file — ${alignedRecounts.length > 1 ? `the ${alignedRecounts.length} that line up with this window are averaged per interval for the score below` : alignedRecounts.length === 1 ? 'only 1 lines up with this window and is used as-is' : 'none of them line up with this window’s time range/interval length'}.</div>`
          : '';
        windowCards.push(`
          <div class="card" style="margin-bottom:14px" data-qaqc-card="${key}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px">
              <h3 style="margin:0">${escapeHtmlMain(w.label)} <span style="font-weight:400;color:var(--text3);font-size:12px">(${minToTimeStr(w.startMin)}–${minToTimeStr(w.endMin)})</span> ${!isQaInputMode && alignedRecounts.length ? perClassSummaryBadge(perClassResults) : ''}</h3>
              ${isQaInputMode ? '' : `<button type="button" class="no-print" data-qaqc-remove-window="${winKey}" data-qaqc-remove-window-id="${w.id}" style="font-size:11px;flex-shrink:0">× remove window</button>`}
            </div>
            <div class="stat-detail" style="margin-bottom:8px">${hasHour ? `Hour found: ${peak.label} · volume ${peak.volume}` : 'This window doesn’t fit this day’s counted time range — you can still recount below, but it won’t score.'}</div>
            ${isQaInputMode ? '' : avgNote}
            ${isQaInputMode ? '' : `
            <table class="crosswalk-table" style="margin-bottom:10px">
              <thead><tr><th>#</th><th>Time range</th><th>Classifications</th><th>Total</th><th>Entered</th><th>In score?</th><th></th></tr></thead>
              <tbody>
                ${recounts.length ? recounts.map((r, ri) => {
                  const total = r.parsed.intervals.reduce((s, iv) => s + iv.inbound.reduce((a, b) => a + b, 0) + iv.outbound.reduce((a, b) => a + b, 0), 0);
                  const range = `${r.parsed.intervals[0]?.start || ''} – ${r.parsed.intervals[r.parsed.intervals.length - 1]?.end || ''}`;
                  const entered = (r.enteredAt ? new Date(r.enteredAt).toLocaleString() : '—') + (r.source === 'remote-qa' ? ' <span style="color:var(--text3)" title="Submitted via QA-input link">(remote)</span>' : '');
                  const inScore = alignedIds.has(r.id) ? '✓' : '<span style="color:var(--text3)" title="Time range/interval length doesn’t match this window">—</span>';
                  return `<tr><td>${ri + 1}</td><td>${escapeHtmlMain(range)}</td><td>${r.classifications.length}</td><td>${total}</td><td>${entered}</td><td>${inScore}</td><td><button data-qaqc-remove-key="${key}" data-qaqc-remove-id="${r.id}">×</button></td></tr>`;
                }).join('') : '<tr><td colspan="7" style="color:var(--text3)">No recounts yet.</td></tr>'}
              </tbody>
            </table>`}
            ${!isQaInputMode && hasHour && recounts.length ? `
            <div style="border-top:.5px solid var(--border);padding-top:10px;margin-bottom:10px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
                <div style="font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text2)">Score detail ${shapeCheckBadge(computed.shapeCheck)}</div>
                ${computed.scoreResult.score != null ? `<button type="button" class="no-print" data-qaqc-detail-open="${key}" style="font-size:11px">explain this score →</button>` : ''}
              </div>
              ${renderQaqcDetailCardHTML(computed)}
            </div>` : ''}
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
                <div class="setup-field"><label>duration (minutes)</label><input type="number" min="1" data-qaqc-duration="${key}" value="${Math.max(1, w.endMin - w.startMin)}"></div>
              </div>
              <button class="btn-primary" data-qaqc-begin="${key}">begin recount →</button>
            </div>
            <button data-qaqc-toggle-form="${key}">+ add count</button>
          </div>
        `);
      }
      dayBlocks.push(`
        <div style="margin-bottom:10px">
          <div class="stat-detail" style="font-weight:600;color:var(--text);margin:10px 0 8px">${escapeHtmlMain(day.sheetName)}</div>
          ${windowCards.join('') || `<div class="stat-detail" style="margin-bottom:10px">${isQaInputMode ? 'No time periods have been set up for this day yet — check back once the project owner adds one.' : 'No time periods added yet — add one below.'}</div>`}
          ${isQaInputMode ? '' : `
          <div class="no-print" style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:10px 0 4px;border-top:.5px dashed var(--border2)">
            <div class="setup-field"><label>name</label><input type="text" data-qaqc-window-name="${winKey}" placeholder="e.g. AM peak" style="width:140px"></div>
            <div class="setup-field"><label>start</label><input type="time" data-qaqc-window-start="${winKey}"></div>
            <div class="setup-field"><label>end</label><input type="time" data-qaqc-window-end="${winKey}"></div>
            <button type="button" class="btn-primary" data-qaqc-add-window="${winKey}" style="height:34px">+ add time period</button>
          </div>`}
        </div>
      `);
    }
    locGroups.push(`
      <details class="interval-detail" open style="margin-bottom:16px">
        <summary class="interval-detail-summary" style="font-size:14px;font-weight:600">${escapeHtmlMain(entry.locationLabel)}</summary>
        ${dayBlocks.join('')}
      </details>
    `);
  }
  root.innerHTML = locGroups.join('');

  root.querySelectorAll('[data-qaqc-detail-open]').forEach((el) => {
    el.addEventListener('click', () => showTgQaqcDetail(el.dataset.qaqcDetailOpen, 'tripgen-qaqc-screen'));
  });
  root.querySelectorAll('[data-qaqc-add-window]').forEach((el) => {
    el.addEventListener('click', () => {
      const winKey = el.dataset.qaqcAddWindow;
      const nameEl = root.querySelector(`[data-qaqc-window-name="${winKey}"]`);
      const startEl = root.querySelector(`[data-qaqc-window-start="${winKey}"]`);
      const endEl = root.querySelector(`[data-qaqc-window-end="${winKey}"]`);
      const label = nameEl.value.trim();
      const startMin = toMinFromLabel(startEl.value || '00:00');
      const endMin = toMinFromLabel(endEl.value || '00:00');
      if (!label) { alert('Name this time period first.'); return; }
      if (endMin <= startMin) { alert('End time must be after start time.'); return; }
      tripgenQaqcWindows[winKey] = tripgenQaqcWindows[winKey] || [];
      tripgenQaqcWindows[winKey].push({ id: tripgenQaqcWindowNextId++, label, startMin, endMin });
      renderQaqcScreen();
      window.scheduleAutosave?.();
    });
  });
  root.querySelectorAll('[data-qaqc-remove-window]').forEach((el) => {
    el.addEventListener('click', () => {
      const winKey = el.dataset.qaqcRemoveWindow;
      const id = Number(el.dataset.qaqcRemoveWindowId);
      if (!tripgenQaqcWindows[winKey]) return;
      tripgenQaqcWindows[winKey] = tripgenQaqcWindows[winKey].filter((w) => w.id !== id);
      // Also drop any recount data stored under the removed window's key — otherwise it's
      // orphaned state that persists forever with no window left to display it against.
      const [entryIdStr, sheetName] = winKey.split('__');
      delete tripgenQaqc[qaqcPeakKey(Number(entryIdStr), sheetName, id)];
      renderQaqcScreen();
      window.scheduleAutosave?.();
    });
  });
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
        window.scheduleAutosave?.();
      }
    });
  });
  root.querySelectorAll('[data-qaqc-begin]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.qaqcBegin;
      const [entryIdStr, sheetName, windowId] = key.split('__');
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
      // BUG-047 (Critical, real data corruption): a recount reuses the same shared live-count
      // module state (tgData/classifications/cfg in tripgenCount.js) as a genuine location
      // edit, but never touched tgPendingLocation. If a PREVIOUS edit session on some location
      // was left unfinished (tgPendingLocation only clears on finish, by design -- navigating
      // away leaves it set, per BUG-034), the periodic autosave's "keep the pending edit's
      // entry current" step (main.js, scheduleAutosave) kept trusting that stale reference
      // with no check that the live session was still actually that edit -- so once a recount
      // started, its own narrow one-hour data got captured and written into the STALE pending
      // location's day.parsed, silently replacing its real full-day dataset. Confirmed against
      // a real corrupted save: a location's count was overwritten with exactly one QA/QC
      // recount's own narrow time window. Clearing it here (a recount is never a location
      // edit) closes the hole at its source rather than trying to make the autosave capture
      // smarter about detecting a session it has no reliable way to identify.
      //
      // BUG-048 (Critical, real data loss, found chasing a follow-up report on BUG-047 itself):
      // clearing tgPendingLocation above is correct, but doing it with no flush first opened a
      // SECOND hole. Whatever is currently live in tgData for a genuinely open edit session
      // (a brand-new count in progress, or a finished location reopened via "edit counts") only
      // ever reaches its entry's day.parsed via scheduleAutosave's debounced 2-second timer
      // (see its own "keep pending edit's entry current" step above). If a QA/QC recount is
      // started -- on ANY location, not necessarily the one being edited -- less than 2 seconds
      // after the last keystroke, tgBeginRecount() below resets the shared tgData for its own
      // use BEFORE that timer ever fires, so whatever was just typed is silently discarded --
      // the location is left exactly as it was before those keystrokes, with no error and no
      // warning. Reproduced live: a location with a single freshly-typed non-zero interval
      // (2 keystrokes, entered under 100ms earlier) read back as entirely zero, every interval,
      // immediately after starting and finishing an unrelated recount. Fix: flush the pending
      // edit's live snapshot into its own entry/day -- the exact same capture scheduleAutosave
      // already does -- synchronously, right here, before the marker is cleared and tgData is
      // reset out from under it.
      if (tgPendingLocation && tgPendingLocation.kind === 'edit' && tgPendingLocation.entryId != null) {
        const live = tgCaptureLiveSnapshot();
        if (live) commitLocationCounts(tgPendingLocation.entryId, tgPendingLocation.dayIdx ?? 0, live.parsed, live.editSnapshot, live.seq, 'qaqc-recount-begin-flush');
      }
      tgPendingLocation = null;
      tgCounterBackTarget = 'tripgen-qaqc-screen';
      document.getElementById('tg-btn-finish').textContent = '✓ finish recount';
      document.getElementById('tg-counter-sub').textContent = `— QA/QC recount: ${entry.locationLabel} / ${day.sheetName}`;
      const started = tgBeginRecount(classificationList, recountCfg, async (parsed) => {
        if (isQaInputMode) {
          const finishBtn = document.getElementById('tg-btn-finish');
          finishBtn.textContent = 'submitting…';
          finishBtn.disabled = true;
          document.getElementById('tg-counter-sub').textContent = '';
          try {
            await submitQaRecount(qaInputShareId, {
              entryId: entry.id,
              sheetName: day.sheetName,
              windowId,
              classifications: classificationList,
              cfg: recountCfg,
              parsed,
              enteredAt: new Date().toISOString(),
            });
          } catch (e) {
            finishBtn.textContent = '✓ finish recount';
            finishBtn.disabled = false;
            document.getElementById('tg-counter-sub').textContent = 'Could not submit — check your connection and try again.';
            alert('Could not submit this recount. Check your connection and try again.\n\n' + (e?.message || e));
            return;
          }
          finishBtn.disabled = false;
          showScreen('tripgen-qaqc-screen');
          await renderQaqcScreen();
          // setSaveState() targets the sidebar's save indicator, which is hidden for the
          // whole rest of a QA-input session (no sidebar at all — see loadProject's
          // qaInputMode branch) — a QA reviewer would never see it. Show the confirmation
          // directly on the screen they're looking at instead.
          const list = document.getElementById('tripgen-qaqc-list');
          if (list) {
            const banner = document.createElement('div');
            banner.className = 'stat-detail';
            banner.style.cssText = 'margin-bottom:14px;padding:10px;border:.5px solid var(--border);border-radius:6px;color:var(--text)';
            banner.textContent = '✓ Recount submitted — thank you.';
            list.prepend(banner);
          }
          return;
        }
        tripgenQaqc[key] = tripgenQaqc[key] || { recounts: [] };
        tripgenQaqc[key].recounts.push({ id: tgQaqcNextId++, classifications: classificationList, cfg: recountCfg, parsed, enteredAt: new Date().toISOString() });
        document.getElementById('tg-btn-finish').textContent = '✓ save location and exit';
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

// ═══════════════════════════════════════════
// INTERSECTION QA/QC — standalone recount flow, parallel to Trip Gen's QA/QC section above
// but adapted for intersection-project structure: periods instead of days, vPairs rows /
// crosswalks / TMC approaches instead of trip-gen classifications. See
// src/intersectionQaqcCount.js for why the recount session is a standalone engine rather
// than a reuse of the live intersection counter (counter.js) — short version: counter.js
// autosaves on every keystroke and always renders the full matrix, neither of which fits a
// bounded scratch recount.
//
// Key shape: `${periodIdx}__${windowLabel}__${modeKey}__${rowKey}` — modeKey is
// 'vehicle'|'ped'|'tmc'; rowKey is the vPairs array index (vehicle), the crosswalk's
// `assign` leg letter (ped), or the approach's `leg` letter (tmc). Each key's value is
// { recounts: [{id, cfg, quarters}] } — quarters is an array of per-interval totals for
// JUST that one row (vehicle/ped: in+out combined; tmc: the row's approach-total). One
// recount SESSION counts every active row together in one bounded hour (never separate
// sessions per type), then the result gets fanned out into one intersectionQaqc[key] entry
// per row below.
// ═══════════════════════════════════════════
const intersectionQaqc = {};
let ixQaqcNextId = 1;

function ixQaqcKey(periodIdx, windowLabel, modeKey, rowKey) {
  return `${periodIdx}__${windowLabel}__${modeKey}__${rowKey}`;
}

// Mirrors analyze.js's qaqcThresholdPct exactly — duplicated locally (not imported) because
// dataAdapter.js only re-wraps qaqcPeakHourScore/threePeakHourRating as async, not this one;
// it's a pure 3-line band lookup so a local copy is simpler than adding a new async wrapper
// just to display the threshold number in the report table.
function ixQaqcThresholdPct(volume) {
  if (volume >= 75) return 5;
  if (volume >= 50) return 7.5;
  return 10;
}

// Standard AM/Midday/PM search ranges (same convention DEFAULT_PEAK_WINDOWS.weekday uses for
// trip gen) plus one optional manual-only "Additional hour" — matches the source Excel
// workbook's 3 official peaks + 1 optional bonus hour. The bonus hour is deliberately left
// out of the Three Peak Hour rollup below (threePeakHourRating expects exactly 3 scores).
const IX_QAQC_WINDOWS = [
  { label: 'AM Peak', searchStartMin: 7 * 60, searchEndMin: 11 * 60, autoSearch: true },
  { label: 'Midday Peak', searchStartMin: 11 * 60, searchEndMin: 15 * 60, autoSearch: true },
  { label: 'PM Peak', searchStartMin: 15 * 60, searchEndMin: 19 * 60, autoSearch: true },
  { label: 'Additional hour', searchStartMin: 0, searchEndMin: 24 * 60, autoSearch: false },
];

// Resolves QA/QC's read/write target — mirrors analysisSource()'s shape (see that
// function's header comment for the general pattern) but adds a `qaqcStore` (the mutable
// {key: {recounts:[]}} object a recount session writes into) since, unlike Analyze,
// QA/QC needs to persist new data, not just read it.
//
// snapshotCtx here is deliberately just `{ areaIdx }` rather than a detached data copy —
// QA/QC has to write back into the SAME live areaIntersections[areaIdx].snapshot object
// (both its periods, read-only, and its intersectionQaqc store, read+write), so we always
// re-resolve from the live array rather than caching a snapshot by value.
function ixQaqcSource(snapshotCtx) {
  if (snapshotCtx) {
    const ix = areaIntersections[snapshotCtx.areaIdx];
    const snap = ix?.snapshot;
    if (!snap) return null;
    if (!snap.intersectionQaqc) snap.intersectionQaqc = {};
    return {
      periods: (snap.periods || []).map(p => ({ name: p.name, data: p })),
      activePeriodIdx: -1, // no "currently counting" period in a read-only snapshot
      ctx: { intersection: snap.intersection || intersection, vPairs: snap.vPairs || vPairs, readOnly: true },
      qaqcStore: snap.intersectionQaqc,
      // NOT window.scheduleAutosave() — see persistAreaStudySnapshotsOnly()'s header
      // comment for why that would risk clobbering a different intersection's snapshot.
      persist() { persistAreaStudySnapshotsOnly(); },
    };
  }
  return {
    periods,
    activePeriodIdx,
    ctx: { intersection, vPairs, readOnly: false },
    qaqcStore: intersectionQaqc,
    persist() { window.scheduleAutosave?.(); },
  };
}

// Returns the {cfg, vData, pedData, tmcData} snapshot for a given period index — the LIVE
// globals if it's the currently-active period (periods[activePeriodIdx].data is stale until
// the next switchPeriod/save/serialize), otherwise the period's own stored snapshot.
function ixPeriodSnapshot(src, periodIdx) {
  if (!src.ctx.readOnly && periodIdx === src.activePeriodIdx) {
    const slots = Math.max(1, Math.round(cfg.durationMin / cfg.intervalMin));
    return { cfg: { startMinutes: cfg.startMinutes, intervalMin: cfg.intervalMin, durationMin: cfg.durationMin, slots }, vData, pedData, tmcData };
  }
  const p = src.periods[periodIdx]?.data;
  if (!p) return null;
  const slots = Math.max(1, Math.round(p.cfg.durationMin / p.cfg.intervalMin));
  return { cfg: { ...p.cfg, slots }, vData: p.vData, pedData: p.pedData, tmcData: p.tmcData };
}

function ixQaqcVehicleIntervals(snap) {
  return Array.from({ length: snap.cfg.slots }, (_, i) => {
    const startMin = snap.cfg.startMinutes + i * snap.cfg.intervalMin;
    const endMin = startMin + snap.cfg.intervalMin;
    return { start: minToTimeStr(startMin), end: minToTimeStr(endMin), inbound: (snap.vData.in[i] || []).slice(), outbound: (snap.vData.out[i] || []).slice() };
  });
}

// Per-row quarter totals (combined in+out for vehicle/ped; approach-total for tmc) for the
// slot range [startIdx, startIdx+windowSize).
function ixRowQuarters(snap, ctxIntersection, modeKey, rowKey, startIdx, windowSize) {
  const out = [];
  for (let k = 0; k < windowSize; k++) {
    const slotIdx = startIdx + k;
    if (modeKey === 'vehicle') {
      const i = Number(rowKey);
      out.push((snap.vData.in[slotIdx]?.[i] || 0) + (snap.vData.out[slotIdx]?.[i] || 0));
    } else if (modeKey === 'ped') {
      const xi = ctxIntersection.crosswalks.findIndex((cw, idx) => (cw.assign || String(idx)) === rowKey);
      const pair = (xi >= 0 ? snap.pedData[xi]?.[slotIdx] : null) || [0, 0];
      out.push((pair[0] || 0) + (pair[1] || 0));
    } else if (modeKey === 'tmc') {
      // TMC per-approach-total assumption (v1, unconfirmed against real methodology — no
      // source-file precedent existed for this, per the task this was built from). Sums
      // every movement (all destinations, all vehicle types) FROM this one approach leg
      // into a single total per quarter, rather than scoring movement-by-movement.
      const legData = (snap.tmcData || {})[rowKey] || {};
      let total = 0;
      for (const dest in legData) {
        const arr = legData[dest][slotIdx] || [];
        total += arr.reduce((a, b) => a + b, 0);
      }
      out.push(total);
    }
  }
  return out;
}

// Auto-detects which one-hour window within [searchStartMin, searchEndMin) is busiest,
// preferring vehicle volume (if vehicle mode is active) as the basis — same "primary count's
// own volume decides everything" principle qaqcThresholdPct already uses for its band.
async function ixDetectPeakStart(snap, ctxVPairs, searchStartMin, searchEndMin) {
  if (enabledModes.vehicle && ctxVPairs.length) {
    const intervals = ixQaqcVehicleIntervals(snap);
    const peak = await analysisData.peakHourInWindow(intervals, snap.cfg.intervalMin, searchStartMin, searchEndMin, 'vehicle');
    if (peak.startIdx >= 0) return snap.cfg.startMinutes + peak.startIdx * snap.cfg.intervalMin;
  }
  return searchStartMin;
}

// Builds the active row groups (one per active count type) for a project — reused by both
// the report table and the recount-launch flow so they never drift out of sync. `ctx` is
// ixQaqcSource()'s .ctx ({ intersection, vPairs }) — enabledModes stays a plain global read
// since it's a whole-project setting shared across every area-study intersection uniformly
// (saved once at the project level, not per intersection snapshot).
function ixQaqcActiveRowGroups(ctx) {
  const groups = [];
  if (enabledModes.vehicle && ctx.vPairs.length) {
    groups.push({ modeKey: 'vehicle', modeLabel: '🚗 Vehicle', rows: ctx.vPairs.map((p, i) => ({ rowKey: String(i), label: p.label })) });
  }
  if (enabledModes.ped && ctx.intersection.crosswalks.length) {
    groups.push({ modeKey: 'ped', modeLabel: '🚶 Pedestrian', rows: ctx.intersection.crosswalks.map((cw, i) => ({ rowKey: cw.assign || String(i), label: cw.name || `${legLabel(cw.assign)} crosswalk` })) });
  }
  if (enabledModes.turning) {
    const counted = ctx.intersection.approaches.filter((a) => a.count !== false);
    if (counted.length) groups.push({ modeKey: 'tmc', modeLabel: '↻ Turning movement', rows: counted.map((a) => ({ rowKey: a.leg, label: `${legLabel(a.leg)} approach` })) });
  }
  return groups;
}

// Which snapshotCtx (null = live/standalone, { areaIdx } = a specific area-study
// intersection) the QA/QC screen is currently showing — set at the top of every
// renderIntersectionQaqcScreen() call. Needed by the static top-level button handlers
// below (registered once, outside any render) and by the recount-finish callback, which
// re-renders the SAME shared screen after a recount rather than opening a new one.
let ixQaqcActiveCtx = null;
// Bumped at the top of every renderIntersectionQaqcScreen() call; each call captures its own
// value and checks it's still current right before writing to the DOM (see that function's
// final root.innerHTML write). Needed because the function is async (awaits ixDetectPeakStart
// per window) and the screen has multiple ways to trigger a fresh render in quick succession —
// switching straight to another area-study intersection's QA/QC, or finishing a recount (which
// re-renders the same screen). Two overlapping calls racing on the same #intersection-qaqc-list
// container would otherwise let whichever one resolves LAST win the DOM, even if it started
// first and is showing a now-superseded intersection/context.
let _ixQaqcRenderGen = 0;

document.getElementById('btn-ix-qaqc-to-count')?.addEventListener('click', () => {
  if (ixQaqcActiveCtx) { showIntersectionAnalysis(ixQaqcActiveCtx.areaIdx); return; }
  showScreen('counter-screen'); window.goToCountMode?.();
});
document.getElementById('btn-ix-qaqc-to-analyze')?.addEventListener('click', () => {
  if (ixQaqcActiveCtx) { showIntersectionAnalysis(ixQaqcActiveCtx.areaIdx); return; }
  openWorkspaceTab('analyze');
});
document.getElementById('ixqaqc-btn-to-qaqc')?.addEventListener('click', () => showScreen('intersection-qaqc-screen'));
document.getElementById('ixqaqc-btn-finish')?.addEventListener('click', () => ixFinishRecount());

async function beginIxQaqcRecount(cardId, src) {
  const sep = cardId.indexOf('__');
  const periodIdx = Number(cardId.slice(0, sep));
  const windowLabel = cardId.slice(sep + 2);
  const w = IX_QAQC_WINDOWS.find((x) => x.label === windowLabel);
  const period = src.periods[periodIdx];
  const snap = ixPeriodSnapshot(src, periodIdx);
  if (!w || !period || !snap) return;
  const windowSize = Math.max(1, Math.round(60 / snap.cfg.intervalMin));
  const manualInput = document.querySelector(`[data-ixqaqc-manual-start="${cardId}"]`);
  const startMin = w.autoSearch
    ? await ixDetectPeakStart(snap, src.ctx.vPairs, w.searchStartMin, w.searchEndMin)
    : toMinFromLabel(manualInput?.value || minToTimeStr(snap.cfg.startMinutes));
  const startIdx = Math.round((startMin - snap.cfg.startMinutes) / snap.cfg.intervalMin);
  if (startIdx < 0 || startIdx + windowSize > snap.cfg.slots) {
    alert('This window falls outside the period’s counted time range.');
    return;
  }

  const rowGroups = ixQaqcActiveRowGroups(src.ctx);
  const rowsSpecRaw = { vehicle: [], ped: [], tmc: [] };
  rowGroups.forEach((grp) => { rowsSpecRaw[grp.modeKey] = grp.rows.map((r) => ({ key: r.rowKey, label: r.label })); });
  const rowsSpec = ixAssignRecountKeys(rowsSpecRaw);

  const recountCfg = { startMinutes: startMin, intervalMin: snap.cfg.intervalMin, durationMin: 60 };
  const subEl = document.getElementById('ixqaqc-counter-sub');
  if (subEl) subEl.textContent = `— ${period.name} / ${windowLabel}`;
  const started = ixBeginRecount(rowsSpec, recountCfg, (result) => {
    // Write into whichever store src resolved to — the live standalone `intersectionQaqc`
    // global, or the specific area-study intersection's own snapshot.intersectionQaqc
    // (mutated in place; src.persist() below then schedules the autosave that flushes
    // areaIntersections to localStorage the same way any other area-study edit does).
    ['vehicle', 'ped', 'tmc'].forEach((modeKey) => {
      Object.entries(result[modeKey] || {}).forEach(([rowKey, quarters]) => {
        const key = ixQaqcKey(periodIdx, windowLabel, modeKey, rowKey);
        src.qaqcStore[key] = src.qaqcStore[key] || { recounts: [] };
        src.qaqcStore[key].recounts.push({ id: ixQaqcNextId++, cfg: recountCfg, quarters });
      });
    });
    showScreen('intersection-qaqc-screen');
    renderIntersectionQaqcScreen(ixQaqcActiveCtx);
    src.persist();
  });
  if (started) showScreen('intersection-qaqc-counter-screen');
}
window.beginIxQaqcRecount = beginIxQaqcRecount;

// snapshotCtx: null (default) renders live/standalone state; { areaIdx } renders (and, on
// a recount, writes into) that specific area-study intersection's own stored QA/QC data —
// see ixQaqcSource()'s header comment. Every lookup below is scoped to the freshly-resolved
// `src`/`root` rather than any cached reference, and this whole function re-derives `src`
// from scratch on every call (never reuses one from a previous render), so viewing
// intersection A then B then A again in the same session can never show stale data from
// a different intersection (the failure mode BUG-017 was caused by).
async function renderIntersectionQaqcScreen(snapshotCtx = null) {
  ixQaqcActiveCtx = snapshotCtx;
  const myGen = ++_ixQaqcRenderGen;
  const root = document.getElementById('intersection-qaqc-list');
  if (!root) return;
  const src = ixQaqcSource(snapshotCtx);
  if (!src || !src.periods.length) { if (myGen === _ixQaqcRenderGen) root.innerHTML = '<div class="stat-detail">No periods counted yet — start a count from Setup first.</div>'; return; }
  const rowGroups = ixQaqcActiveRowGroups(src.ctx);
  if (!rowGroups.length) { if (myGen === _ixQaqcRenderGen) root.innerHTML = '<div class="stat-detail">No active count types to QA/QC — enable vehicle, pedestrian, or turning movement counting first.</div>'; return; }

  const cards = [];
  for (let periodIdx = 0; periodIdx < src.periods.length; periodIdx++) {
    const period = src.periods[periodIdx];
    const snap = ixPeriodSnapshot(src, periodIdx);
    if (!snap) continue;
    const windowSize = Math.max(1, Math.round(60 / snap.cfg.intervalMin));

    // rowKey -> { AM: score|null, MD: score|null, PM: score|null } for the Three Peak Hour rollup below.
    const threePeakScores = {}; // `${modeKey}__${rowKey}` -> [scoreOrNull, scoreOrNull, scoreOrNull] (AM/MD/PM order)

    for (const w of IX_QAQC_WINDOWS) {
      const startMin = w.autoSearch ? await ixDetectPeakStart(snap, src.ctx.vPairs, w.searchStartMin, w.searchEndMin) : snap.cfg.startMinutes;
      const startIdx = Math.round((startMin - snap.cfg.startMinutes) / snap.cfg.intervalMin);
      const inRange = startIdx >= 0 && startIdx + windowSize <= snap.cfg.slots;
      const cardId = `${periodIdx}__${w.label}`;

      const sectionsHtml = [];
      for (const grp of rowGroups) {
        const rowHtml = [];
        for (const r of grp.rows) {
          const key = ixQaqcKey(periodIdx, w.label, grp.modeKey, r.rowKey);
          const recounts = src.qaqcStore[key]?.recounts || [];
          const latest = recounts[recounts.length - 1];
          const primaryQuarters = inRange ? ixRowQuarters(snap, src.ctx.intersection, grp.modeKey, r.rowKey, startIdx, windowSize) : [];
          const primaryTotal = primaryQuarters.reduce((a, b) => a + b, 0);
          let scoreResult = null;
          if (latest && inRange) scoreResult = await analysisData.qaqcPeakHourScore(primaryQuarters, latest.quarters);

          if (w.label !== 'Additional hour') {
            const scoreKey = `${grp.modeKey}__${r.rowKey}`;
            threePeakScores[scoreKey] = threePeakScores[scoreKey] || [];
            threePeakScores[scoreKey].push(scoreResult && scoreResult.rating !== 'Incomplete' ? scoreResult.score : null);
          }

          const recountTotal = latest ? latest.quarters.reduce((a, b) => a + b, 0) : null;
          const diff = recountTotal != null ? recountTotal - primaryTotal : null;
          const diffPct = recountTotal != null && primaryTotal > 0 ? Math.abs(diff / primaryTotal) * 100 : (recountTotal === 0 && primaryTotal === 0 ? 0 : null);
          const thresh = ixQaqcThresholdPct(primaryTotal);
          const resultLabel = !latest
            ? '<span class="tag" style="color:var(--text3)">no recount</span>'
            : passFailBadge(!inRange || scoreResult?.rating === 'Incomplete' ? null : scoreResult?.overallPass);
          rowHtml.push(`<tr>
            <td>${escapeHtmlMain(r.label)}</td>
            <td>${primaryTotal}</td>
            <td>${recountTotal != null ? recountTotal : '—'}</td>
            <td>${diff != null ? (diff > 0 ? '+' : '') + diff + (diffPct != null ? ` (${diffPct.toFixed(1)}%)` : '') : '—'}</td>
            <td>${thresh}%</td>
            <td>${resultLabel}</td>
          </tr>`);
        }
        sectionsHtml.push(`
          <div style="margin-bottom:10px">
            <div style="font-size:12px;font-weight:600;margin-bottom:4px">${grp.modeLabel}${grp.modeKey === 'tmc' ? ' <span style="font-weight:400;color:var(--text3)">(per-approach total — see note below)</span>' : ''}</div>
            <table class="crosswalk-table" style="margin-bottom:6px">
              <thead><tr><th>row</th><th>primary total</th><th>recount total</th><th>diff</th><th>threshold</th><th>result</th></tr></thead>
              <tbody>${rowHtml.join('')}</tbody>
            </table>
          </div>`);
      }

      cards.push(`
        <div class="card" style="margin-bottom:14px" data-ixqaqc-card="${cardId}">
          <h3>${escapeHtmlMain(period.name)} — ${escapeHtmlMain(w.label)}</h3>
          <div class="stat-detail" style="margin-bottom:8px">${inRange ? `Hour: ${minToTimeStr(startMin)} – ${minToTimeStr(startMin + 60)}` : 'This window falls outside this period’s counted time range.'}</div>
          ${!w.autoSearch ? `<div class="setup-grid" style="margin-bottom:10px;grid-template-columns:1fr"><div class="setup-field"><label>additional-hour start time</label><input type="time" data-ixqaqc-manual-start="${cardId}" value="${minToTimeStr(startMin)}"></div></div>` : ''}
          ${sectionsHtml.join('')}
          <button class="btn-primary" data-ixqaqc-begin="${cardId}" ${inRange ? '' : 'disabled'}>begin recount →</button>
        </div>
      `);
    }

    // Three Peak Hour rollup — one 0-15 Good/Borderline/Failed rating per row, per period.
    const rollupRows = [];
    for (const grp of rowGroups) {
      for (const r of grp.rows) {
        const scoreKey = `${grp.modeKey}__${r.rowKey}`;
        const scores = threePeakScores[scoreKey] || [null, null, null];
        const rating = await analysisData.threePeakHourRating(scores);
        rollupRows.push(`<tr><td>${grp.modeLabel} — ${escapeHtmlMain(r.label)}</td><td>${scores.map((s) => s ?? '—').join(' / ')}</td><td>${rating.total ?? '—'}</td><td>${rating.rating}</td></tr>`);
      }
    }
    if (rollupRows.length) {
      cards.push(`
        <div class="card" style="margin-bottom:20px">
          <h3>${escapeHtmlMain(period.name)} — Three Peak Hour rating</h3>
          <div class="stat-detail" style="margin-bottom:8px">Rolls up AM / Midday / PM scores (0-5 each) into a 0-15 rating per row. The Additional hour (if recounted) isn't part of this rollup.</div>
          <table class="crosswalk-table">
            <thead><tr><th>row</th><th>AM / MD / PM score</th><th>total (0-15)</th><th>rating</th></tr></thead>
            <tbody>${rollupRows.join('')}</tbody>
          </table>
        </div>`);
    }
  }

  if (myGen !== _ixQaqcRenderGen) return; // a newer render superseded this one while we were awaiting — don't clobber its DOM

  root.innerHTML = cards.join('') + '<div class="stat-detail" style="margin-top:6px">Turning-movement QA/QC scores each APPROACH as one combined total (summing all its movements and vehicle types together) rather than movement-by-movement — no confirmed source-methodology precedent existed for finer TMC granularity, so this is a reasonable v1 default, not a verified standard.</div>';

  root.querySelectorAll('[data-ixqaqc-begin]:not([disabled])').forEach((el) => {
    el.addEventListener('click', () => beginIxQaqcRecount(el.dataset.ixqaqcBegin, src));
  });
}

// ═══════════════════════════════════════════
// STREETLIGHT COMPARISON — read-only import of a StreetLight Insight TMC peak-hour-table
// export (`*_tmc_peak_hour_table.xlsx`, parsed by parseStreetlightXlsx.js), shown side by
// side with the manual count's own closest-matching peak hour.
//
// StreetLight sells GPS-derived traffic-volume PROJECTIONS, not real counts — the user's
// own framing is that individual movement volumes can be off by "a hundred" even after
// movements are correctly identified. This bucket is therefore never read by, merged into,
// or used to auto-correct tmcData / the primary count. It exists purely so a reviewer can
// see where StreetLight's projection and the field count diverge, same cross-check spirit
// as intersectionQaqc's role (see that section's header comment above) but informational
// only — there's no pass/fail threshold here, just a visible delta.
//
// Storage mirrors intersectionQaqc's dual-source pattern exactly: a standalone/live
// `streetlightComparison` global for standalone intersection projects, and a
// `snapshot.streetlightComparison` bucket for area-study children — see
// slCompareSource()/ixQaqcSource() for the shared shape.
// ═══════════════════════════════════════════
const streetlightComparison = { blocks: {}, sourceFileName: null, importedAt: null };

// AM/Midday/PM search ranges — same convention IX_QAQC_WINDOWS/DEFAULT_PEAK_WINDOWS use —
// for locating the manual count's own peak hour within the day-part StreetLight's block
// claims to represent.
const SL_SEARCH_WINDOWS = { AM: [7 * 60, 11 * 60], MD: [11 * 60, 15 * 60], PM: [15 * 60, 19 * 60] };

function slCompareSource(snapshotCtx) {
  if (snapshotCtx) {
    const ix = areaIntersections[snapshotCtx.areaIdx];
    const snap = ix?.snapshot;
    if (!snap) return null;
    if (!snap.streetlightComparison) snap.streetlightComparison = { blocks: {}, sourceFileName: null, importedAt: null };
    return {
      periods: (snap.periods || []).map(p => ({ name: p.name, data: p })),
      activePeriodIdx: -1,
      ctx: { intersection: snap.intersection || intersection, vPairs: snap.vPairs || vPairs, readOnly: true },
      slStore: snap.streetlightComparison,
      persist() { persistAreaStudySnapshotsOnly(); },
    };
  }
  return {
    periods,
    activePeriodIdx,
    ctx: { intersection, vPairs, readOnly: false },
    slStore: streetlightComparison,
    persist() { window.scheduleAutosave?.(); },
  };
}

async function importStreetlightFile(file, src) {
  const buf = await file.arrayBuffer();
  const { blocks } = parseStreetlightXlsx(buf);
  if (!src.slStore.blocks) src.slStore.blocks = {};
  blocks.forEach((b) => { src.slStore.blocks[b.key] = b; });
  src.slStore.sourceFileName = file.name;
  src.slStore.importedAt = new Date().toISOString();
  src.persist();
}

// Total turning-movement volume (every approach, every destination, every vehicle class)
// at one interval slot — used by slDetectPeakStart()'s TMC-based fallback below.
function slTmcVolumeAtSlot(snap, slotIdx) {
  let total = 0;
  const td = snap.tmcData || {};
  for (const from in td) {
    for (const to in td[from]) {
      const arr = td[from][to][slotIdx] || [];
      total += arr.reduce((a, b) => a + (Number(b) || 0), 0);
    }
  }
  return total;
}

// ixDetectPeakStart() (defined above, in the QA/QC section) only searches VEHICLE in/out
// volume (vData) — it silently falls back to returning searchStartMin verbatim whenever
// vehicle mode isn't active, which is exactly the case for a turning-movement-only project
// (no vData to search). Confirmed live: a TMC-only test project always matched the search
// window's literal start time (e.g. "AM Peak" always resolving to 7:00, the window's floor)
// instead of the intersection's actual busiest hour. Since StreetLight's own export IS
// turning-movement data, this local wrapper adds a TMC-volume-based peak search as the
// fallback when vehicle mode/data isn't usable, keeping the two sides' "peak hour" based on
// the same underlying count type instead of defaulting to a meaningless window boundary.
async function slDetectPeakStart(snap, ctxVPairs, searchStartMin, searchEndMin) {
  if (enabledModes.vehicle && ctxVPairs.length) {
    return ixDetectPeakStart(snap, ctxVPairs, searchStartMin, searchEndMin);
  }
  const windowSize = Math.max(1, Math.round(60 / snap.cfg.intervalMin));
  const startIdxForMin = (m) => Math.round((m - snap.cfg.startMinutes) / snap.cfg.intervalMin);
  const lo = Math.max(0, startIdxForMin(searchStartMin));
  const hi = Math.min(snap.cfg.slots - windowSize, startIdxForMin(searchEndMin) - windowSize);
  if (hi < lo) return searchStartMin;
  let bestIdx = lo, bestVol = -1;
  for (let idx = lo; idx <= hi; idx++) {
    let vol = 0;
    for (let k = 0; k < windowSize; k++) vol += slTmcVolumeAtSlot(snap, idx + k);
    if (vol > bestVol) { bestVol = vol; bestIdx = idx; }
  }
  return snap.cfg.startMinutes + bestIdx * snap.cfg.intervalMin;
}

// Picks which manual period + one-hour window best represents the same real-world hour a
// StreetLight block claims to be (its dayType/peakPeriod) — reuses ixPeriodSnapshot() (the
// QA/QC section's shared helper) and slDetectPeakStart() immediately above (which itself
// reuses ixDetectPeakStart() when vehicle data is usable) rather than re-deriving period
// resolution from scratch.
// Day-of-week matching is a best-effort heuristic (falls back to period 0 when a period's
// stored date is missing or doesn't match any weekday) — StreetLight's "Tuesday"/"Wednesday"
// blocks don't carry an exact calendar date to key off of, only a weekday name.
async function slMatchManualPeriod(src, block) {
  if (!src.periods.length) return null;
  let periodIdx = 0;
  if (block.dayType !== 'All Days' && src.periods.length > 1) {
    const found = src.periods.findIndex((p) => {
      const dateStr = p.data?.meta?.date;
      if (!dateStr) return false;
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return false;
      return d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() === block.dayType.toLowerCase();
    });
    if (found >= 0) periodIdx = found;
  }
  const snap = ixPeriodSnapshot(src, periodIdx);
  if (!snap) return null;
  const [searchStart, searchEnd] = SL_SEARCH_WINDOWS[block.peakPeriod] || [0, 24 * 60];
  const startMin = await slDetectPeakStart(snap, src.ctx.vPairs, searchStart, searchEnd);
  const windowSize = Math.max(1, Math.round(60 / snap.cfg.intervalMin));
  const startIdx = Math.round((startMin - snap.cfg.startMinutes) / snap.cfg.intervalMin);
  const inRange = startIdx >= 0 && startIdx + windowSize <= snap.cfg.slots;
  return { periodIdx, period: src.periods[periodIdx], snap, startMin, startIdx, windowSize, inRange };
}

// Sums the manual count's own L/T/R totals for one physical approach leg, over
// [startIdx, startIdx+windowSize) — all vehicle classes combined (StreetLight's table has
// no per-class breakdown, so this reads the manual side's grand total to match). Reuses
// classifyTurn() (this app's own, already-audited L/T/R classification — see BUG-023) and
// looks the movement up BY LABEL (destLeg), never by array position (see BUG-019/020).
function manualLegMovementTotals(snap, legLetter, startIdx, windowSize) {
  const totals = { L: 0, T: 0, R: 0 };
  const legData = (snap.tmcData || {})[legLetter] || {};
  for (const destLeg in legData) {
    const cls = classifyTurn(legLetter, destLeg);
    if (cls !== 'L' && cls !== 'T' && cls !== 'R') continue; // U-turns have no StreetLight counterpart column
    const slotArr = legData[destLeg] || [];
    for (let k = 0; k < windowSize; k++) {
      const arr = slotArr[startIdx + k] || [];
      totals[cls] += arr.reduce((a, b) => a + (Number(b) || 0), 0);
    }
  }
  return totals;
}

function slDiffCell(slVal, manualVal) {
  if (manualVal == null) return '<span style="color:var(--text3)">—</span>';
  const diff = slVal - manualVal;
  const sign = diff > 0 ? '+' : '';
  const color = diff === 0 ? 'var(--text3)' : (diff > 0 ? '#b58900' : '#3a7fc9');
  return `<span style="color:${color}">${sign}${diff}</span>`;
}

// Which snapshotCtx the comparison screen is currently showing, and a BUG-022-style
// generation guard on the shared #streetlight-compare-content container — this render is
// async (awaits slMatchManualPeriod's peak-hour detection per block) and the screen can be
// re-entered in quick succession (switching intersections, or right after a fresh import),
// so a superseded render must never win a stale write over a newer one.
let slActiveCtx = null;
let _slCompareRenderGen = 0;

async function renderStreetlightCompareScreen(snapshotCtx = null) {
  slActiveCtx = snapshotCtx;
  const myGen = ++_slCompareRenderGen;
  const root = document.getElementById('streetlight-compare-content');
  if (!root) return;
  const src = slCompareSource(snapshotCtx);
  const fileLabel = document.getElementById('sl-compare-file-label');
  if (fileLabel) {
    fileLabel.textContent = src?.slStore?.sourceFileName
      ? `Imported: ${src.slStore.sourceFileName} (${new Date(src.slStore.importedAt).toLocaleString()})`
      : 'No StreetLight file imported yet.';
  }
  if (!src) { if (myGen === _slCompareRenderGen) root.innerHTML = '<div class="stat-detail">No project loaded.</div>'; return; }
  const blocks = Object.values(src.slStore.blocks || {});
  if (!blocks.length) {
    if (myGen === _slCompareRenderGen) root.innerHTML = '<div class="stat-detail">No StreetLight file imported yet — use "Import StreetLight file" above to load a <code>*_tmc_peak_hour_table.xlsx</code> export.</div>';
    return;
  }

  const picker = document.getElementById('sl-compare-block-picker');
  if (picker) {
    picker.style.display = blocks.length > 1 ? '' : 'none';
    const prevVal = picker.value;
    picker.innerHTML = blocks.map((b) => `<option value="${escapeHtmlMain(b.key)}">${escapeHtmlMain(b.dayType)} — ${escapeHtmlMain(b.peakPeriod)} Peak</option>`).join('');
    if (blocks.some((b) => b.key === prevVal)) picker.value = prevVal;
  }
  const selectedKey = picker && blocks.some((b) => b.key === picker.value) ? picker.value : blocks[0].key;
  const block = src.slStore.blocks[selectedKey];
  if (!block) { if (myGen === _slCompareRenderGen) root.innerHTML = '<div class="stat-detail">Block not found.</div>'; return; }

  const match = await slMatchManualPeriod(src, block);
  if (myGen !== _slCompareRenderGen) return; // a newer render superseded this one — don't clobber its DOM

  const SL_BADGE = '<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.03em;color:#8a5a00;background:#fff3d6;border:1px solid #e8c877;border-radius:3px;padding:1px 5px;margin-right:4px">SL PROJECTION</span>';

  const legRows = block.legs.map((leg) => {
    const stName = leg.streetName ? ` — ${escapeHtmlMain(leg.streetName)}` : '';
    const legHeader = `${leg.legLetter ? legLabel(leg.legLetter) : escapeHtmlMain(leg.streetName || leg.key)}${leg.travelDir ? ` (${escapeHtmlMain(leg.travelDir)})` : ''}${stName}`;
    const iv0 = block.intervals[0];
    const slVals = block.hourlyTotal?.byLeg?.[leg.key] || iv0.byLeg[leg.key] || { L: 0, T: 0, R: 0 };
    const slTotal = (slVals.L || 0) + (slVals.T || 0) + (slVals.R || 0);
    // PHF is StreetLight's own per-MOVEMENT figure (one per L/T/R column), not a single
    // per-leg number — displaying it as a scalar (an earlier version of this code did) threw
    // at render time and was also just wrong: each movement can have its own PHF.
    const slPhfVals = block.phf?.byLeg?.[leg.key] || null;
    const phfCell = (v) => (v != null && v > 0 ? Number(v).toFixed(2) : '—');
    const manualVals = (match && match.inRange && leg.legLetter)
      ? manualLegMovementTotals(match.snap, leg.legLetter, match.startIdx, match.windowSize)
      : null;
    const manualTotal = manualVals ? manualVals.L + manualVals.T + manualVals.R : null;
    const noMatch = !leg.legLetter
      ? '<div class="stat-detail" style="margin-top:2px">Could not resolve this leg to one of this intersection\'s own approaches — shown as StreetLight-only.</div>'
      : (!match || !match.inRange ? '<div class="stat-detail" style="margin-top:2px">No matching manual peak hour found in range for this leg.</div>' : '');

    return `
      <div class="card" style="margin-bottom:14px">
        <h3 style="font-size:14px">${legHeader}</h3>
        <table class="crosswalk-table" style="margin-top:6px">
          <thead><tr><th></th><th>Left</th><th>Thru</th><th>Right</th><th>Total</th></tr></thead>
          <tbody>
            <tr>
              <td>${SL_BADGE}StreetLight (est.)</td>
              <td style="font-style:italic;color:#8a5a00">${slVals.L ?? 0}</td>
              <td style="font-style:italic;color:#8a5a00">${slVals.T ?? 0}</td>
              <td style="font-style:italic;color:#8a5a00">${slVals.R ?? 0}</td>
              <td style="font-style:italic;color:#8a5a00">${slTotal}</td>
            </tr>
            <tr>
              <td>Manual count</td>
              <td>${manualVals ? manualVals.L : '—'}</td>
              <td>${manualVals ? manualVals.T : '—'}</td>
              <td>${manualVals ? manualVals.R : '—'}</td>
              <td>${manualTotal != null ? manualTotal : '—'}</td>
            </tr>
            <tr>
              <td style="color:var(--text3)">diff (SL − manual)</td>
              <td>${slDiffCell(slVals.L || 0, manualVals?.L)}</td>
              <td>${slDiffCell(slVals.T || 0, manualVals?.T)}</td>
              <td>${slDiffCell(slVals.R || 0, manualVals?.R)}</td>
              <td>${slDiffCell(slTotal, manualTotal)}</td>
            </tr>
          </tbody>
        </table>
        ${slPhfVals ? `<div class="stat-detail" style="margin-top:6px">${SL_BADGE}PHF (StreetLight, per movement) — Left: ${phfCell(slPhfVals.L)} · Thru: ${phfCell(slPhfVals.T)} · Right: ${phfCell(slPhfVals.R)}</div>` : ''}
        ${noMatch}
      </div>`;
  }).join('');

  const matchSummary = match
    ? (match.inRange
      ? `Manual comparison hour: <strong>${escapeHtmlMain(match.period.name)}</strong>, ${minToTimeStr(match.startMin)} – ${minToTimeStr(match.startMin + 60)}${block.dayType !== 'All Days' ? ` (closest match to "${escapeHtmlMain(block.dayType)}")` : ''}.`
      : `No manual peak hour found within the ${escapeHtmlMain(block.peakPeriod)} search window for "${escapeHtmlMain(match.period.name)}" — every leg above is shown StreetLight-only.`)
    : 'No manual count periods available to compare against.';

  if (myGen !== _slCompareRenderGen) return;
  root.innerHTML = `
    <div class="stat-detail" style="margin-bottom:10px;padding:8px 10px;background:#fff3d6;border:1px solid #e8c877;border-radius:4px;color:#6b4d00">
      ${SL_BADGE}<strong>All StreetLight numbers on this screen are a GPS-derived statistical projection, not a real count.</strong>
      StreetLight's own accuracy caveat: individual movement volumes can be off by a significant margin even when the movement itself is correctly identified. Use this only as an informational cross-check against the manual count below — never as a substitute for it.
    </div>
    <div class="stat-detail" style="margin-bottom:12px">${matchSummary}</div>
    ${legRows}
  `;
}
window.renderStreetlightCompareScreen = renderStreetlightCompareScreen;

document.getElementById('sl-compare-block-picker')?.addEventListener('change', () => renderStreetlightCompareScreen(slActiveCtx));
document.getElementById('btn-sl-compare-import')?.addEventListener('click', () => {
  document.getElementById('sl-compare-file-input')?.click();
});
document.getElementById('sl-compare-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const errEl = document.getElementById('sl-compare-error');
  if (errEl) errEl.textContent = '';
  try {
    const src = slCompareSource(slActiveCtx);
    if (!src) throw new Error('No project loaded.');
    await importStreetlightFile(file, src);
    await renderStreetlightCompareScreen(slActiveCtx);
  } catch (err) {
    console.error('StreetLight import failed:', err);
    if (errEl) errEl.textContent = `Import failed: ${err.message}`;
  }
});
document.getElementById('btn-sl-compare-to-analyze')?.addEventListener('click', () => {
  if (slActiveCtx) { showIntersectionAnalysis(slActiveCtx.areaIdx); return; }
  openWorkspaceTab('analyze');
});

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
    <div class="stat-detail" style="margin-bottom:14px">Generated peak-hour volumes come from the AM/Midday/PM windows found in Analysis. Add the intersections that will absorb this site's traffic below, then split each peak period's inbound and outbound trips between them by percentage.</div>
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
  // Same rationale as renderQaqcScreen()'s loading state, immediately above this function's
  // sibling in the file: renderTripGenSection() is real async work (peak-score computation,
  // QA/QC scoring per location/day), and callers here don't await this function either — paint
  // something before starting rather than leaving analyze-root looking blank while it runs.
  const analyzeRoot = document.getElementById('analyze-root');
  if (analyzeRoot && !analyzeRoot.innerHTML) analyzeRoot.innerHTML = '<div class="stat-detail">Loading analysis…</div>';
  await renderTripGenSection(document.getElementById('analyze-root'), tripgenEntries, {
    siteInfo: tripgenSiteInfo, categoryMap: tripgenCategoryMap, peakWindows: tripgenPeakWindows,
    qaqc: tripgenQaqc, qaqcWindows: tripgenQaqcWindows, dataView: tripgenDataView, customWindows: tripgenCustomWindows,
    onSiteInfoChange: (field, value) => { tripgenSiteInfo[field] = value; rerenderTripgenAnalysis(); },
    onAddCustomWindow: (label, startMin, endMin) => {
      tripgenCustomWindows.push({ id: tripgenCustomWindowNextId++, label, startMin, endMin });
      rerenderTripgenAnalysis();
      window.scheduleAutosave?.();
    },
    onRemoveCustomWindow: (id) => {
      const idx = tripgenCustomWindows.findIndex((w) => w.id === id);
      if (idx >= 0) tripgenCustomWindows.splice(idx, 1);
      rerenderTripgenAnalysis();
      window.scheduleAutosave?.();
    },
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
    onGotoQaqc: (key) => { openWorkspaceTab('tg-qaqc'); scrollToQaqcCard(key); },
    onGotoQaqcDetail: (key) => showTgQaqcDetail(key, 'analyze-screen'),
    onEditGroups: () => {
      openWorkspaceTab('tg-setup');
      const btn = document.querySelector('#tripgen-setup-screen .tg-tab[data-tgtab="classifications"]');
      switchTgTab('classifications', btn);
    },
    fixedWindowStartMin: tripgenFixedWindowStartMin,
    fixedWindowEndMin: tripgenFixedWindowEndMin,
    onFixedWindowChange: (startMin, endMin) => {
      tripgenFixedWindowStartMin = startMin;
      tripgenFixedWindowEndMin = endMin;
      rerenderTripgenAnalysis();
    },
  });
}

// checkAutosave() — replaced by renderHomeResumeBanner() called from showHome()

// BUG-038: this used to hand-build its own project object — a second, independent
// serialization of a Trip Gen project alongside serializeCurrentProject(), which drifted out
// of sync with it (missing classifications entirely — including their group assignments —
// plus distribution, pendingLocation, and uuid) the moment BUG-034/035/036 added those fields
// to serializeCurrentProject() but nobody updated this duplicate. Reuse the single source of
// truth instead, matching window.saveProject()'s own pattern just above in this file.
window.saveTripgenProject = function () {
  const proj = serializeCurrentProject();
  if (!proj) return;
  downloadJSON(proj, `${tripgenSiteInfo.location || 'tripgen'}.tcproject`);
};
