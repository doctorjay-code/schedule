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
    ledgerLoadPromise = import(getVersionedUrl('../ledger/ledger-app.js'))
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
    statsLoadPromise = import(getVersionedUrl('./modals/stats.js'))
      .then(module => {
        module.setupStatsModalEvents({ bindOpen: false });
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
async function openStatsFeature() {
  try {
    const module = await getStatsFeature();
    module.openStatsModal();
  } catch (error) {
    console.error('Stats feature load failed:', error);
  }
}
async function getColorFeature() {
  if (!colorLoadPromise) {
    colorLoadPromise = import(getVersionedUrl('./modals/color-settings.js'))
      .then(module => {
        module.setupColorSettingsEvents({ bindOpen: false });
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
async function openColorFeature() {
  try {
    const module = await getColorFeature();
    module.openColorSettingsModal();
  } catch (error) {
    console.error('Color feature load failed:', error);
  }
}

export function initializeScheduleApp() {
  loadLastScheduleSnapshot();
  loadColorSettings();
  state.currentWeekIndex = getTodayWeekIndex();
  loadWeekData(state.currentWeekIndex);
  initEvents();
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
      // 🌟 외부(단축어 등) 거래 변경 시 가계부 화면 0.05초 실시간 자동 갱신!
      import(getVersionedUrl('../ledger/ledger-app.js')).then(mod => {
        mod.refreshLedgerData?.();
      }).catch(e => console.warn('Realtime ledger refresh notice:', e));
    }
  });
  preloadLedgerFeature();
}

function initNetworkStatusListener() {
  const updateStatus = () => {
    if (!navigator.onLine) {
      showOfflineBanner();
    } else {
      showOnlineBanner();
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  if (!navigator.onLine) updateStatus();
}

function initEvents() {
  const prevWeekBtn = document.getElementById('prevWeekBtn');
  const nextWeekBtn = document.getElementById('nextWeekBtn');
  const todayBtn = document.getElementById('todayBtn');
  const manualSyncBtn = document.getElementById('manualSyncBtn');

  const regionBtnGroup = document.getElementById('regionBtnGroup');
  const customRegionInput = document.getElementById('customRegionInput');
  const clinicBtnGroup = document.getElementById('clinicBtnGroup');
  const customClinicInput = document.getElementById('customClinicInput');

  const transStatusToggle = document.getElementById('transStatusToggle');
  const hrStatusToggle = document.getElementById('hrStatusToggle');
  const otStatusToggle = document.getElementById('otStatusToggle');

  const transSelectCategory = document.getElementById('transSelectCategory');
  const customTransWrapper = document.getElementById('customTransWrapper');
  const customTransCategoryInput = document.getElementById('customTransCategoryInput');
  const resetTransCategoryBtn = document.getElementById('resetTransCategoryBtn');

  const hrSelectCategory = document.getElementById('hrSelectCategory');
  const customHrWrapper = document.getElementById('customHrWrapper');
  const customHrCategoryInput = document.getElementById('customHrCategoryInput');
  const resetHrCategoryBtn = document.getElementById('resetHrCategoryBtn');

  const otSelectCategory = document.getElementById('otSelectCategory');
  const customOtWrapper = document.getElementById('customOtWrapper');
  const customOtCategoryInput = document.getElementById('customOtCategoryInput');
  const resetOtCategoryBtn = document.getElementById('resetOtCategoryBtn');

  const copyScheduleBtn = document.getElementById('copyScheduleBtn');
  const applyWeekdaysBtn = document.getElementById('applyWeekdaysBtn');
  const saveScheduleBtn = document.getElementById('saveScheduleBtn');

  const copyBufferBar = document.getElementById('copyBufferBar');
  const copiedItemLabel = document.getElementById('copiedItemLabel');
  const clearCopyBtn = document.getElementById('clearCopyBtn');

  const toggleMultiEditBtn = document.getElementById('toggleMultiEditBtn');
  const multiActionBar = document.getElementById('multiActionBar');
  const selectedCountLabel = document.getElementById('selectedCountLabel');
  const bulkCopyBtn = document.getElementById('bulkCopyBtn');
  const bulkPasteBtn = document.getElementById('bulkPasteBtn');

  const modalOverlay = document.getElementById('modalOverlay');
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');

  bindScheduleNavigation({
    state,
    enterLedger: enterLedgerFeature,
    leaveLedger: leaveLedgerFeature,
    openStats: openStatsFeature,
    openColor: openColorFeature,
    switchViewMode: switchViewModeUI,
    renderMonthly: renderMonthlyCalendar,
    openMonthPicker: openMonthSelectModal,
    openWeekPicker: openWeekSelectModal,
    loadWeek: loadWeekData,
    getTodayWeekIndex,
    syncFromSheets: syncScheduleFromSupabase
  });  bindScheduleModalCloseEvents({
    closeModal,
    closeSummaryModal,
    closeWeekSelectModal,
    closeMonthSelectModal
  });
  bindScheduleFilterEvents({ state, renderTable });  setupBtnGroupEvents(regionBtnGroup, customRegionInput);
  setupBtnGroupEvents(clinicBtnGroup, customClinicInput);

  setupToggleEvents(transStatusToggle);
  setupToggleEvents(hrStatusToggle);
  setupToggleEvents(otStatusToggle);

  // Category Select & Reset Event Handlers
  if (transSelectCategory) {
    transSelectCategory.addEventListener('change', () => {
      if (transSelectCategory.value === '기타') {
        transSelectCategory.classList.add('hidden');
        if (customTransWrapper) customTransWrapper.classList.remove('hidden');
        if (customTransCategoryInput) {
          customTransCategoryInput.value = '';
          customTransCategoryInput.focus();
        }
      }
    });
  }
  if (resetTransCategoryBtn) {
    resetTransCategoryBtn.addEventListener('click', () => {
      if (customTransWrapper) customTransWrapper.classList.add('hidden');
      if (transSelectCategory) {
        transSelectCategory.classList.remove('hidden');
        transSelectCategory.value = '';
      }
    });
  }

  if (hrSelectCategory) {
    hrSelectCategory.addEventListener('change', () => {
      if (hrSelectCategory.value === '기타') {
        hrSelectCategory.classList.add('hidden');
        if (customHrWrapper) customHrWrapper.classList.remove('hidden');
        if (customHrCategoryInput) {
          customHrCategoryInput.value = '';
          customHrCategoryInput.focus();
        }
      }
    });
  }
  if (resetHrCategoryBtn) {
    resetHrCategoryBtn.addEventListener('click', () => {
      if (customHrWrapper) customHrWrapper.classList.add('hidden');
      if (hrSelectCategory) {
        hrSelectCategory.classList.remove('hidden');
        hrSelectCategory.value = '';
      }
    });
  }

  if (otSelectCategory) {
    otSelectCategory.addEventListener('change', () => {
      if (otSelectCategory.value === '기타') {
        otSelectCategory.classList.add('hidden');
        if (customOtWrapper) customOtWrapper.classList.remove('hidden');
        if (customOtCategoryInput) {
          customOtCategoryInput.value = '';
          customOtCategoryInput.focus();
        }
      }
    });
  }
  if (resetOtCategoryBtn) {
    resetOtCategoryBtn.addEventListener('click', () => {
      if (customOtWrapper) customOtWrapper.classList.add('hidden');
      if (otSelectCategory) {
        otSelectCategory.classList.remove('hidden');
        otSelectCategory.value = '';
      }
    });
  }

  // Feature 1: Copy Schedule Item inside Modal
  if (copyScheduleBtn) {
    copyScheduleBtn.addEventListener('click', () => {
      if (!state.activeItem) return;
      saveModalToActiveItem();
      
      state.copiedScheduleData = {
        type: 'SINGLE_SLOT',
        data: JSON.parse(JSON.stringify(state.activeItem))
      };
      
      if (copiedItemLabel) copiedItemLabel.textContent = `${state.activeItem.date} ${state.activeItem.time} 일정 전체`;
      if (copyBufferBar) copyBufferBar.classList.remove('hidden');
      closeModal();
    });
  }

  // Clear Copy Buffer Event (✕ button)
  if (clearCopyBtn) {
    clearCopyBtn.addEventListener('click', () => {
      state.copiedScheduleData = null;
      if (copyBufferBar) copyBufferBar.classList.add('hidden');
    });
  }

  // Feature 2: Apply to Weekdays (Tue~Thu)
  if (applyWeekdaysBtn) {
    applyWeekdaysBtn.addEventListener('click', () => {
      if (!state.activeItem) return;
      saveModalToActiveItem();

      state.weekData.forEach(item => {
        if (item.date.includes('화') || item.date.includes('수') || (item.date.includes('목') && item.time === '오전')) {
          item.region = state.activeItem.region;
          item.clinic = state.activeItem.clinic;
        }
      });

      syncScheduleToSupabase();
      renderTable();
      updateSummaryCounts();
      if (state.currentView === 'monthly') renderMonthlyCalendar();
      closeModal();
    });
  }

  // Save Schedule Event
  if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener('click', () => {
      saveModalToActiveItem();
      renderTable();
      updateSummaryCounts();
      statsFeature?.renderStatsReport?.();
      if (state.currentView === 'monthly') renderMonthlyCalendar();
      closeModal();
    });
  }

  // Feature 3: Toggle Multi-Edit Mode
  if (toggleMultiEditBtn) {
    toggleMultiEditBtn.addEventListener('click', () => {
      state.isMultiEditMode = !state.isMultiEditMode;
      toggleMultiEditBtn.classList.toggle('active', state.isMultiEditMode);
      
      if (state.isMultiEditMode) {
        state.selectedCells = [];
        if (multiActionBar) multiActionBar.classList.remove('hidden');
        if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
      } else {
        state.selectedCells = [];
        if (multiActionBar) multiActionBar.classList.add('hidden');
      }
      renderTable();
    });
  }

  // Smart Cell-Level Bulk Copy & Paste Actions (Delegated to schedule-clipboard.js)
  if (bulkCopyBtn) {
    bulkCopyBtn.addEventListener('click', () => executeScheduleCopy({ state, renderTable }));
  }

  if (bulkPasteBtn) {
    bulkPasteBtn.addEventListener('click', () => executeSchedulePaste({
      state,
      renderTable,
      updateSummaryCounts,
      syncToSheets: syncScheduleToSupabase,
      renderMonthlyCalendar
    }));
  }

  // 3 Alert Summary Buttons
  const unpaidSummaryBtn = document.getElementById('unpaidSummaryBtn');
  const unappliedSummaryBtn = document.getElementById('unappliedSummaryBtn');
  const unapprovedSummaryBtn = document.getElementById('unapprovedSummaryBtn');

  if (unpaidSummaryBtn) unpaidSummaryBtn.addEventListener('click', () => openSummaryModal('unpaid'));
  if (unappliedSummaryBtn) unappliedSummaryBtn.addEventListener('click', () => openSummaryModal('unapplied'));
  if (unapprovedSummaryBtn) unapprovedSummaryBtn.addEventListener('click', () => openSummaryModal('unapproved'));
}
