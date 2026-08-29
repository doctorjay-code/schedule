import { getVersionedUrl } from '../../version.js';
import { state, getTodayWeekIndex, loadLastScheduleSnapshot, loadColorSettings, updateSummaryCounts } from '../../services/schedule/schedule-store.js';
import { syncScheduleFromSupabase, syncScheduleToSupabase, syncColorSettingsFromSupabase, setApiLoadWeekDataCallback, registerColorUpdateCallback } from '../../services/schedule/schedule-api.js';
import { loadWeekData, renderTable, isCellSelected, renderMonthlyCalendar, switchViewModeUI } from './render.js';
import { initAverageBalanceModal } from '../ledger/modals/average-balance.js';
import { openModal, closeModal, saveModalToActiveItem, setupBtnGroupEvents, setupToggleEvents, setModalRenderCallback, setModalLoadWeekDataCallback } from './modals/edit.js';
import { openSummaryModal, closeSummaryModal } from './modals/summary.js';
import { openWeekSelectModal, closeWeekSelectModal } from './modals/week-picker.js';
import { applyScheduleAlertChipColors, renderPaletteChipsRows } from './modals/color-settings.js';
import { openMonthSelectModal, closeMonthSelectModal } from './modals/month-picker.js';
import { bindScheduleNavigation } from './events/navigation.js';
import { bindScheduleModalCloseEvents, bindScheduleFilterEvents } from './events/modal-filter-events.js';
import { registerRealtimeCallbacks } from '../../services/shared/supabase-realtime.js';
import { executeScheduleCopy, executeSchedulePaste } from './schedule-clipboard.js';
import { showOfflineBanner, showOnlineBanner, setSyncSpinning } from '../../shared/sync-ui.js';
import { showScheduleView, showLedgerView, initViewCoordinator } from '../../shared/view-coordinator.js';

// App-core callbacks are registered only after authentication succeeds.
setApiLoadWeekDataCallback(loadWeekData);
setModalRenderCallback(renderTable);
setModalLoadWeekDataCallback(loadWeekData);
let ledgerLifecycle = null;
let ledgerLoadPromise = null;
let statsFeature = null;
let statsLoadPromise = null;
let colorFeature = null;
let colorLoadPromise = null;

function loadLedgerFeature() {
  if (!ledgerLoadPromise) {
    ledgerLoadPromise = import(getVersionedUrl('./js/features/ledger/ledger-app.js'))
      .then(module => {
        ledgerLifecycle = module.initLedgerView();
        return ledgerLifecycle;
      })
      .catch(error => {
        ledgerLoadPromise = null;
        throw error;
      });
  }
  return ledgerLoadPromise;
}
function preloadLedgerFeature() {
  loadLedgerFeature().catch(error => console.error('Ledger feature preload failed:', error));
}
async function enterLedgerFeature() {
  try {
    const lifecycle = await loadLedgerFeature();
    if (lifecycle && typeof lifecycle.enter === 'function') {
      lifecycle.enter();
    }
  } catch (error) {
    console.error('Ledger feature load failed:', error);
    alert('가계부 화면을 불러오지 못했습니다: ' + (error?.message || error));
  }
}
function leaveLedgerFeature() {
  ledgerLifecycle?.leave?.();
}
async function getStatsFeature() {
  if (!statsLoadPromise) {
    statsLoadPromise = import('./modals/stats.js')
      .then(module => {
        statsFeature = module;
        return module;
      })
      .catch(error => {
        statsLoadPromise = null;
        throw error;
      });
  }
  return statsLoadPromise;
}
function openStatsModal() {
  getStatsFeature().then(feature => {
    feature.openStatsModal();
  }).catch(error => {
    console.error('Stats feature load failed:', error);
    alert('통계 화면을 불러오지 못했습니다. 네트워크 연결을 확인해주세요.');
  });
}
function closeStatsModal() {
  if (statsFeature) statsFeature.closeStatsModal();
}
async function getColorFeature() {
  if (!colorLoadPromise) {
    colorLoadPromise = import('./modals/color-settings.js')
      .then(module => {
        colorFeature = module;
        return module;
      })
      .catch(error => {
        colorLoadPromise = null;
        throw error;
      });
  }
  return colorLoadPromise;
}
function openColorSettingsModal() {
  getColorFeature().then(feature => {
    feature.openColorSettingsModal();
  }).catch(error => {
    console.error('Color feature load failed:', error);
    alert('색상 설정 화면을 불러오지 못했습니다. 네트워크 연결을 확인해주세요.');
  });
}
function closeColorSettingsModal() {
  if (colorFeature) colorFeature.closeColorSettingsModal();
}

function initNetworkStatusListener() {
  window.addEventListener('online', () => {
    showOnlineBanner();
    syncScheduleFromSupabase();
  });
  window.addEventListener('offline', () => {
    showOfflineBanner();
  });
}

export function initializeScheduleApp() {
  loadLastScheduleSnapshot();
  loadColorSettings();
  state.currentWeekIndex = getTodayWeekIndex();
  loadWeekData(state.currentWeekIndex);
  initEvents();
  initAverageBalanceModal();
  initNetworkStatusListener();
  updateSummaryCounts();
  registerColorUpdateCallback(() => {
    applyScheduleAlertChipColors();
    renderPaletteChipsRows();
  });
  syncScheduleFromSupabase();
  registerRealtimeCallbacks({
    onScheduleChange: () => {
      setSyncSpinning(true);
      syncScheduleFromSupabase().finally(() => {
        applyScheduleAlertChipColors();
        setSyncSpinning(false);
      });
    },
    onLedgerChange: () => {
      syncColorSettingsFromSupabase().then(() => {
        applyScheduleAlertChipColors();
      });
    }
  });
  preloadLedgerFeature();
}

function initEvents() {
  initViewCoordinator({
    onEnterSchedule: leaveLedgerFeature,
    onEnterLedger: enterLedgerFeature
  });
  bindScheduleNavigation({
    loadWeek: loadWeekData,
    renderMonthlyCalendar,
    switchViewModeUI,
    openWeekSelectModal,
    openMonthSelectModal
  });
  bindScheduleModalCloseEvents({
    closeModal,
    closeSummaryModal,
    closeWeekSelectModal,
    closeMonthSelectModal,
    closeColorSettingsModal,
    closeStatsModal
  });
  bindScheduleFilterEvents({
    renderTable
  });

  const manualSyncBtn = document.getElementById('manualSyncBtn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', () => {
      setSyncSpinning(true);
      syncScheduleFromSupabase().finally(() => {
        applyScheduleAlertChipColors();
        setSyncSpinning(false);
      });
    });
  }

  const openColorSettingsBtn = document.getElementById('openColorSettingsBtn');
  if (openColorSettingsBtn) {
    openColorSettingsBtn.addEventListener('click', openColorSettingsModal);
  }

  const openStatsModalBtn = document.getElementById('openStatsModalBtn');
  if (openStatsModalBtn) {
    openStatsModalBtn.addEventListener('click', openStatsModal);
  }

  const unpaidSummaryBtn = document.getElementById('unpaidSummaryBtn');
  if (unpaidSummaryBtn) {
    unpaidSummaryBtn.addEventListener('click', () => openSummaryModal('unpaid'));
  }

  const unappliedSummaryBtn = document.getElementById('unappliedSummaryBtn');
  if (unappliedSummaryBtn) {
    unappliedSummaryBtn.addEventListener('click', () => openSummaryModal('unapplied'));
  }

  const unapprovedSummaryBtn = document.getElementById('unapprovedSummaryBtn');
  if (unapprovedSummaryBtn) {
    unapprovedSummaryBtn.addEventListener('click', () => openSummaryModal('unapproved'));
  }

  const toggleMultiEditBtn = document.getElementById('toggleMultiEditBtn');
  if (toggleMultiEditBtn) {
    toggleMultiEditBtn.addEventListener('click', () => {
      state.isMultiEditMode = !state.isMultiEditMode;
      toggleMultiEditBtn.classList.toggle('active', state.isMultiEditMode);
      const multiActionBar = document.getElementById('multiActionBar');
      if (multiActionBar) {
        multiActionBar.classList.toggle('hidden', !state.isMultiEditMode);
      }
      renderTable();
    });
  }

  const bulkCopyBtn = document.getElementById('bulkCopyBtn');
  if (bulkCopyBtn) {
    bulkCopyBtn.addEventListener('click', executeScheduleCopy);
  }

  const bulkPasteBtn = document.getElementById('bulkPasteBtn');
  if (bulkPasteBtn) {
    bulkPasteBtn.addEventListener('click', executeSchedulePaste);
  }

  setupBtnGroupEvents('regionBtnGroup');
  setupBtnGroupEvents('clinicBtnGroup');
  setupBtnGroupEvents('transStatusBtnGroup');
  setupBtnGroupEvents('hrStatusBtnGroup');
  setupBtnGroupEvents('otStatusBtnGroup');
  setupToggleEvents();

  const modalSaveBtn = document.getElementById('modalSaveBtn');
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', () => {
      saveModalToActiveItem();
      syncScheduleToSupabase();
    });
  }
}
