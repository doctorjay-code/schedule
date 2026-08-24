import { state, getTodayWeekIndex, loadLastScheduleSheetSnapshot, loadColorSettings, updateSummaryCounts } from '../../services/schedule/state.js';
import { syncFromGoogleSheets, syncToGoogleSheets, setApiLoadWeekDataCallback } from '../../services/schedule/api.js';
import { loadWeekData, renderTable, isCellSelected, renderMonthlyCalendar, switchViewModeUI } from './render.js';
import { initAverageBalanceModal } from '../ledger/modals/average-balance.js';
import { openModal, closeModal, openSummaryModal, closeSummaryModal, openWeekSelectModal, closeWeekSelectModal, saveModalToActiveItem, setupBtnGroupEvents, setupToggleEvents, setModalRenderCallback, setModalLoadWeekDataCallback } from './modals/index.js';
import { openMonthSelectModal, closeMonthSelectModal } from './modals/month-picker.js';
import { bindScheduleNavigation } from './events/navigation.js';
import { bindScheduleModalCloseEvents, bindScheduleFilterEvents } from './events/modal-filter-events.js';

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
    ledgerLoadPromise = import('../ledger/index.js?v=20260824_19')
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
    colorLoadPromise = import('./modals/color-settings.js')
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
  loadLastScheduleSheetSnapshot();
  loadColorSettings();
  state.currentWeekIndex = getTodayWeekIndex();
  loadWeekData(state.currentWeekIndex);
  initEvents();
  initAverageBalanceModal();
  updateSummaryCounts();
  syncFromGoogleSheets();
  preloadLedgerFeature();
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
    syncFromSheets: syncFromGoogleSheets
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

      syncToGoogleSheets();
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

  // Smart Cell-Level Bulk Copy with Multi-Day Support
  if (bulkCopyBtn) {
    bulkCopyBtn.addEventListener('click', () => {
      if (state.selectedCells.length === 0) {
        alert('복사할 날짜, 시간, 또는 세부 셀을 선택해주세요!');
        return;
      }

      // Collect all unique selected dates from selectedCells
      const dayDateSet = new Set();

      for (let i = 0; i < state.weekData.length; i += 2) {
        const mId = state.weekData[i].id;
        const aId = state.weekData[i + 1] ? state.weekData[i + 1].id : null;
        const dKey = `${mId}_${aId ?? ''}_day`;

        if (isCellSelected(dKey) || (isCellSelected(`${mId}_row`) && aId && isCellSelected(`${aId}_row`))) {
          dayDateSet.add(state.weekData[i].date);
        }
      }

      // Case 1: Multi-Day or Single Full Day Copy
      if (dayDateSet.size > 0) {
        const dayArray = Array.from(dayDateSet);
        const daysDataList = [];

        dayArray.forEach(dateStr => {
          const mItem = state.weekData.find(d => d.date === dateStr && d.time === '오전');
          const aItem = state.weekData.find(d => d.date === dateStr && d.time === '오후');
          if (mItem && aItem) {
            daysDataList.push({
              date: dateStr,
              morning: JSON.parse(JSON.stringify(mItem)),
              afternoon: JSON.parse(JSON.stringify(aItem))
            });
          }
        });

        if (daysDataList.length === 1) {
          state.copiedScheduleData = {
            type: 'FULL_DAY',
            dateLabel: daysDataList[0].date,
            morning: daysDataList[0].morning,
            afternoon: daysDataList[0].afternoon
          };
          if (copiedItemLabel) copiedItemLabel.textContent = `${daysDataList[0].date} 하루 전체 일정`;
        } else {
          state.copiedScheduleData = {
            type: 'MULTI_DAYS',
            daysList: daysDataList
          };
          if (copiedItemLabel) copiedItemLabel.textContent = `${daysDataList[0].date} 외 ${daysDataList.length - 1}개 날짜 전체 일정 (${daysDataList.length}개 일괄)`;
        }

        if (copyBufferBar) copyBufferBar.classList.remove('hidden');
        state.selectedCells = [];
        if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
        renderTable();
        return;
      }

      // Case 2: Single Slot / Specific Cell Copy
      const lastKey = state.selectedCells[state.selectedCells.length - 1];
      const parts = lastKey.split('_');
      const itemId = parseInt(parts[0]);
      const field = parts[1]; // 'region', 'clinic', 'trans', 'hr', 'ot', 'row'
      const targetItem = state.weekData.find(d => d.id === itemId);

      if (targetItem) {
        let detailLabel = `${targetItem.date} ${targetItem.time}`;

        if (field === 'region') {
          detailLabel += ` 지역 (${targetItem.region || '-'})`;
        } else if (field === 'clinic') {
          detailLabel += ` 진료 (${targetItem.clinic || '-'})`;
        } else if (field === 'trans') {
          const content = [targetItem.transStatus, targetItem.transDetail].filter(Boolean).join(' ');
          detailLabel += ` 교통 (${content || '-'})`;
        } else if (field === 'hr') {
          const content = [targetItem.hrStatus, targetItem.hrDetail].filter(Boolean).join(' ');
          detailLabel += ` 국인체 (${content || '-'})`;
        } else if (field === 'ot') {
          const content = [targetItem.otStatus, targetItem.otDetail].filter(Boolean).join(' ');
          detailLabel += ` 수당 (${content || '-'})`;
        } else {
          detailLabel += ` 일정 전체`;
        }

        state.copiedScheduleData = {
          type: 'SINGLE_SLOT',
          field: field,
          data: JSON.parse(JSON.stringify(targetItem))
        };

        if (copiedItemLabel) copiedItemLabel.textContent = `${detailLabel}`;
        if (copyBufferBar) copyBufferBar.classList.remove('hidden');

        state.selectedCells = [];
        if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
        renderTable();
      }
    });
  }

  // Smart Bulk Paste Action
  const handleBulkPaste = () => {
    if (!state.copiedScheduleData) {
      alert('복사된 일정이 없습니다. 복사할 항목을 먼저 선택 후 [📋 복사]를 누르세요!');
      return;
    }
    if (state.selectedCells.length === 0) {
      alert('붙여넣을 셀이나 날짜를 선택해주세요!');
      return;
    }

    const targetDates = Array.from(new Set(state.selectedCells.map(key => {
      const id = parseInt(key.split('_')[0]);
      const item = state.weekData.find(d => d.id === id);
      return item ? item.date : null;
    }).filter(Boolean)));

    if (state.copiedScheduleData.type === 'MULTI_DAYS') {
      const srcDays = state.copiedScheduleData.daysList;
      targetDates.forEach((targetDateStr, idx) => {
        const srcDay = srcDays[idx % srcDays.length];
        state.weekData.forEach(item => {
          if (item.date === targetDateStr) {
            const src = (item.time === '오전') ? srcDay.morning : srcDay.afternoon;
            item.region = src.region;
            item.clinic = src.clinic;
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          }
        });
      });
    } else if (state.copiedScheduleData.type === 'FULL_DAY') {
      state.weekData.forEach(item => {
        if (targetDates.includes(item.date)) {
          const src = (item.time === '오전') ? state.copiedScheduleData.morning : state.copiedScheduleData.afternoon;
          item.region = src.region;
          item.clinic = src.clinic;
          item.transStatus = src.transStatus;
          item.transDetail = src.transDetail;
          item.hrStatus = src.hrStatus;
          item.hrDetail = src.hrDetail;
          item.otStatus = src.otStatus;
          item.otDetail = src.otDetail;
        }
      });
    } else {
      const src = state.copiedScheduleData.data;
      const srcField = state.copiedScheduleData.field;

      state.selectedCells.forEach(key => {
        const parts = key.split('_');
        const id = parseInt(parts[0]);
        const targetField = parts[1];
        const item = state.weekData.find(d => d.id === id);

        if (item) {
          if (targetField === 'row' || targetField === 'time' || !srcField || srcField === 'row') {
            item.region = src.region;
            item.clinic = src.clinic;
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          } else if (targetField === 'region') item.region = src.region;
          else if (targetField === 'clinic') item.clinic = src.clinic;
          else if (targetField === 'trans') {
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
          } else if (targetField === 'hr') {
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
          } else if (targetField === 'ot') {
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          } else if (srcField === 'region') item.region = src.region;
          else if (srcField === 'clinic') item.clinic = src.clinic;
          else if (srcField === 'trans') {
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
          } else if (srcField === 'hr') {
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
          } else if (srcField === 'ot') {
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          }
        }
      });
    }

    syncToGoogleSheets();
    state.selectedCells = [];
    if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
    renderTable();
    updateSummaryCounts();
    if (state.currentView === 'monthly') renderMonthlyCalendar();
  };

  if (bulkPasteBtn) bulkPasteBtn.addEventListener('click', handleBulkPaste);

  // 3 Alert Summary Buttons
  const unpaidSummaryBtn = document.getElementById('unpaidSummaryBtn');
  const unappliedSummaryBtn = document.getElementById('unappliedSummaryBtn');
  const unapprovedSummaryBtn = document.getElementById('unapprovedSummaryBtn');

  if (unpaidSummaryBtn) unpaidSummaryBtn.addEventListener('click', () => openSummaryModal('unpaid'));
  if (unappliedSummaryBtn) unappliedSummaryBtn.addEventListener('click', () => openSummaryModal('unapplied'));
  if (unapprovedSummaryBtn) unapprovedSummaryBtn.addEventListener('click', () => openSummaryModal('unapproved'));
}

