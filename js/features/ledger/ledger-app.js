import { state, pastelPalette, saveColorSettings, defaultColorSettings } from '../../services/schedule/schedule-store.js';
import { registerColorUpdateCallback } from '../../services/schedule/schedule-api.js';
import { switchViewModeUI } from '../schedule/render.js';
import { showScheduleView, showLedgerView } from '../../shared/view-coordinator.js';
import { openWeekSelectModal } from '../schedule/modals/week-picker.js';
import { openMonthSelectModal } from '../schedule/modals/month-picker.js';
import { startOfWeek, toIso, escapeHtml, formatMoney, getLedgerTagColor, recalculateRunningBalances, normalizeLedgerDate, compareLedgerRecords, generateLedgerId } from './ledger-utils.js';
import { filterLedgerRecords } from './card.js';
import { normalizeFundplanRows } from './fundplan.js';
import { groupExpenses, renderStatList } from './stats.js';
import { appendLedgerEmptyRow, createLedgerTableHead, formatLedgerScheduleDate, renderTransactionRow } from './transaction-view.js';
import { createLedgerTransactionModal } from './modals/transaction-modal.js';
import { createLedgerColorSettings } from './modals/color-settings.js';
import { bindLedgerListActions } from './ledger-events.js';
import { createFundplanView, createLedgerMonthDividerRow, getRecordMonthGroup } from './fundplan-view.js';
import { fetchLedgerData, upsertLedgerRecord, deleteLedgerRecord, reorderLedgerRecords, deleteLedgerRecordsBatch, insertLedgerRecordsBatch, saveForecastOrders } from '../../services/ledger/ledger-api.js';
import { registerRealtimeCallbacks } from '../../services/shared/supabase-realtime.js';
import { showLedgerToast, findLedgerRecordById, executeLedgerCopy, executeLedgerDelete, executeLedgerPaste } from './ledger-clipboard.js';
import { generateForecastRecords, loadForecastOrderMap, saveForecastOrderMap, syncForecastOrdersFromDB, isManualCardPayment, saveForecastAggregateOverride, loadForecastAggregateOverrides, syncForecastAggregateOverridesFromDB } from './ledger-forecast.js';
import { createOffsetGroupFromRecords, syncOffsetGroupsFromDB, loadOffsetGroups, createOffsetGroupRow, deleteOffsetGroup } from './ledger-offset-groups.js';

let ledgerState = {
  active: false,
  source: 'card', // 'card' | 'bank' | 'cash' | 'forecast'
  payment: '토스은행',
  monthCursor: new Date(),
  records: [],
  recordsLoaded: false,
  multiEditMode: false,
  selectedLedgerIds: new Set(),
  copiedRecords: []
};

let ledgerTransactionModal = null;
let ledgerColorSettings = null;
let cachedForecastAggregateRows = []; // Keep cache for click finding
let isSavingForecastOrders = false; // Prevent concurrent drag saves

function ledgerSheetNameForRecord(record = {}) {
  if (record.sheetName) return record.sheetName;
  if (record.payment) return record.payment;
  return ledgerState.payment || '토스은행';
}

function getSelectedLedgerIds() {
  return ledgerState.selectedLedgerIds;
}

function getLedgerTransactionModal() {
  if (!ledgerTransactionModal) {
    ledgerTransactionModal = createLedgerTransactionModal({
      state,
      pastelPalette,
      saveRecord: saveLedgerRecord,
      deleteRecord: deleteRecord,
      getCategorySuggestions: () => getLedgerCategoryNames()
    });
  }
  return ledgerTransactionModal;
}

function getLedgerColorSettings() {
  if (!ledgerColorSettings) {
    ledgerColorSettings = createLedgerColorSettings({
      state,
      pastelPalette,
      defaultColorSettings,
      saveColorSettings,
      renderLedgerViews: applyLedgerDataSources
    });
  }
  return ledgerColorSettings;
}

function setMultiEditMode(enabled) {
  ledgerState.multiEditMode = Boolean(enabled);
  if (!ledgerState.multiEditMode) {
    ledgerState.selectedLedgerIds.clear();
  }
  updateMultiActionBar();
  applyLedgerDataSources();
}

function toggleMultiSelectRow(recordId) {
  if (!ledgerState.multiEditMode) return;
  const sId = String(recordId || '');
  if (!sId) return;

  if (ledgerState.selectedLedgerIds.has(sId)) {
    ledgerState.selectedLedgerIds.delete(sId);
  } else {
    ledgerState.selectedLedgerIds.add(sId);
  }
  updateMultiActionBar();
  applyLedgerDataSources();
}

function updateMultiActionBar() {
  const multiActionBar = document.getElementById('multiActionBar');
  const selectedCountLabel = document.getElementById('selectedCountLabel');
  const toggleBtn = document.getElementById('toggleMultiEditBtn');
  const isMulti = ledgerState.multiEditMode;

  if (toggleBtn) {
    if (isMulti) {
      toggleBtn.classList.add('active');
      toggleBtn.textContent = '✕ 선택취소';
    } else {
      toggleBtn.classList.remove('active');
      toggleBtn.textContent = '☑️ 다중선택';
    }
  }

  if (!multiActionBar) return;

  if (isMulti) {
    multiActionBar.classList.remove('hidden');
    if (selectedCountLabel) {
      selectedCountLabel.textContent = `${ledgerState.selectedLedgerIds.size}개 선택됨`;
    }
  } else {
    multiActionBar.classList.add('hidden');
  }
}

function updateCopyBufferBar() {
  const copyBar = document.getElementById('copyBufferBar');
  const copiedItemLabel = document.getElementById('copiedItemLabel');
  if (!copyBar || !copiedItemLabel) return;

  const count = ledgerState.copiedRecords ? ledgerState.copiedRecords.length : 0;
  if (count > 0) {
    copyBar.classList.remove('hidden');
    const firstItem = ledgerState.copiedRecords[0];
    const previewText = count === 1
      ? `${firstItem.item || '항목'} (${formatMoney(firstItem.amount)}원)`
      : `${firstItem.item || '항목'} 외 ${count - 1}건`;
    copiedItemLabel.textContent = previewText;
  } else {
    copyBar.classList.add('hidden');
  }
}

function showLedgerViewTab() {
  showLedgerView({
    onShow: () => {
      ledgerState.active = true;
      initLedgerApp();
    }
  });
}

function showScheduleViewTab() {
  showScheduleView({
    onShow: () => {
      ledgerState.active = false;
    }
  });
}

function findLedgerTransaction(id) {
  const sId = String(id || '');
  return ledgerState.records.find(item => String(item.id) === sId) || null;
}

function applyOptimisticSave(record) {
  const sId = String(record.id || '');
  const existingIdx = ledgerState.records.findIndex(item => String(item.id) === sId);
  if (existingIdx >= 0) {
    ledgerState.records[existingIdx] = { ...record, updatedAt: Date.now() };
  } else {
    ledgerState.records.push({
      ...record,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  applyLedgerDataSources();
}

function applyOptimisticDelete(record) {
  const sId = String(record.id || '');
  ledgerState.records = ledgerState.records.filter(item => String(item.id) !== sId);
  if (ledgerState.selectedLedgerIds.has(sId)) {
    ledgerState.selectedLedgerIds.delete(sId);
  }
  applyLedgerDataSources();
}

function saveLedgerRecord(form, overrides = {}) {
  const values = { ...Object.fromEntries(new FormData(form).entries()), ...overrides };
  const rawAmountStr = String(values.amount || '').replace(/[^\d]/g, '');
  const amount = rawAmountStr === '' ? 0 : Number(rawAmountStr);
  if (!values.date || !values.item?.trim() || !Number.isFinite(amount) || amount < 0) return;

  const isEdit = Boolean(values.ledgerEditId);
  const existing = ledgerState.records.find(record => record.id === values.ledgerEditId);
  
  // 스마트 사용자 추출 & 비고 중복 방지 (기본값: '기타')
  const rawMemo = String(values.memo || '').trim();
  const personMatch = rawMemo.match(/콩콩|쥬쥬|지니/);
  let finalPerson = String(values.person || (personMatch ? personMatch[0] : '기타')).trim();
  if (!finalPerson) finalPerson = '기타';

  const cleanedDetail = rawMemo.replace(/콩콩|쥬쥬|지니/g, '').trim().replace(/\s{2,}/g, ' ');
  const finalMemo = (finalPerson && finalPerson !== '기타') ? [finalPerson, cleanedDetail].filter(Boolean).join(' ') : cleanedDetail;

  const editId = String(values.ledgerEditId || '');
  const isAggregateEdit = editId.startsWith('fc-est-card-') || editId.startsWith('fc-var-toss-');
  if (isAggregateEdit) {
    const aggregatePerson = (!values.person || values.person === '기타') && !personMatch ? '' : finalPerson;
    saveForecastAggregateOverride(editId, {
      date: values.date,
      item: values.item.trim(),
      person: aggregatePerson,
      category: values.category || '',
      fixedCost: values.fixedCost === '고정비' ? values.fixedCost : '',
      memo: aggregatePerson ? finalMemo : rawMemo
    });
    getLedgerTransactionModal().close();
    showLedgerToast('✏️ 결제 정보가 저장되었습니다.');
    applyLedgerDataSources();
    return;
  }

  const payment = values.payment || ledgerState.payment || '토스은행';
  const record = {
    ...(existing || {}),
    id: values.ledgerEditId || existing?.id || generateLedgerId(values.date, existing?.orderIndex ?? 0),
    date: values.date,
    type: values.type,
    amount,
    payment,
    item: values.item.trim(),
    person: finalPerson,
    category: values.category || '',
    fixedCost: values.fixedCost === '고정비' ? values.fixedCost : '',
    memo: finalMemo,
    createdAt: existing?.createdAt ?? Date.now()
  };
  record.sheetName = ledgerSheetNameForRecord(record);

  applyOptimisticSave(record);
  getLedgerTransactionModal().close();
  showLedgerToast(isEdit ? '✏️ 거래가 수정되었습니다.' : '＋ 거래가 등록되었습니다.');

  upsertLedgerRecord(record).then(res => {
    if (res && res.id && record.id !== res.id) {
      record.id = res.id;
    }
  }).catch(error => {
    console.error('Supabase ledger save error:', error);
    showLedgerToast('⚠️ 저장 지연 중 (로컬 반영 완료)');
  });
}

function deleteRecord(id) {
  const record = findLedgerTransaction(id);
  if (!record) {
    showLedgerToast('⚠️ 삭제할 거래 정보를 찾을 수 없습니다.');
    return;
  }
  if (!confirm('이 거래를 삭제할까요?')) return;

  const deletePayload = {
    ...record,
    sheetName: ledgerSheetNameForRecord(record)
  };

  applyOptimisticDelete(record);
  getLedgerTransactionModal().close();
  showLedgerToast('🗑️ 거래가 삭제되었습니다.');

  if (deletePayload.id) {
    deleteLedgerRecord(deletePayload).catch(error => {
      console.error('Supabase ledger delete error:', error);
    });
  }
}

function toggleLedgerEntry() {
  const modal = getLedgerTransactionModal();
  modal.open({
    isEdit: false,
    defaultPayment: ledgerState.payment || '토스은행'
  });
}

function getLedgerCategoryNames() {
  const defaults = ['식비', '교통', '문화', '생활', '보험', '상환', '이체', '월급', '저축', '이자', '용돈', '입금', '출금', '기타'];
  const userCats = Object.keys(state.colorSettings?.ledgerCategoryColors || {});
  return Array.from(new Set([...defaults, ...userCats]));
}

function renderLedgerTable() {
  const container = document.getElementById('fundplanAllTimeList');
  if (!container) return;

  if (ledgerState.source === 'forecast') {
    renderForecastTable(container);
    return;
  }

  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
  const filterPayment = ledgerState.source === 'card' ? ledgerState.payment : (ledgerState.source === 'cash' ? '현금' : '기업은행');

  const filtered = filterLedgerRecords(ledgerState.records, {
    source: ledgerState.source,
    payment: filterPayment,
    monthCursor: ledgerState.monthCursor,
    isCompanyCard
  });

  filtered.sort(compareLedgerRecords);

  const calculated = recalculateRunningBalances(filtered, isCompanyCard);

  container.innerHTML = '';
  if (calculated.length === 0) {
    appendLedgerEmptyRow(container, '해당 월의 거래 내역이 없습니다.');
    return;
  }

  calculated.forEach(record => {
    const isSelected = ledgerState.selectedLedgerIds.has(String(record.id));
    renderTransactionRow(record, container, {
      source: ledgerState.source,
      isCompanyCard,
      colorSettings: state.colorSettings,
      multiEditMode: ledgerState.multiEditMode,
      isSelected,
      onRowClick: (rec) => {
        if (ledgerState.multiEditMode) {
          toggleMultiSelectRow(rec.id);
        } else {
          getLedgerTransactionModal().open({ isEdit: true, record: rec });
        }
      }
    });
  });
}

function renderForecastTable(container) {
  const { displayRows } = generateForecastRecords({
    allRecords: ledgerState.records,
    monthCursor: ledgerState.monthCursor,
    isManualCardPayment
  });

  cachedForecastAggregateRows = displayRows;

  createFundplanView({
    container,
    rows: displayRows,
    colorSettings: state.colorSettings,
    multiEditMode: ledgerState.multiEditMode,
    selectedIds: ledgerState.selectedLedgerIds,
    onRowClick: (row) => {
      if (ledgerState.multiEditMode) {
        toggleMultiSelectRow(row.id);
      } else {
        const modal = getLedgerTransactionModal();
        modal.open({
          isEdit: true,
          record: {
            id: row.id,
            date: row.date,
            type: row.type || 'expense',
            amount: row.amount,
            payment: row.payment || '토스은행',
            item: row.item,
            person: row.person || '기타',
            category: row.category || '',
            fixedCost: row.fixedCost || '',
            memo: row.memo || ''
          }
        });
      }
    },
    onReorder: async (orderedIds) => {
      if (isSavingForecastOrders) return;
      isSavingForecastOrders = true;
      try {
        saveForecastOrderMap(orderedIds);
        await saveForecastOrders(orderedIds);
        showLedgerToast('순서가 저장되었습니다.');
      } catch (e) {
        console.error('Error saving forecast orders:', e);
      } finally {
        isSavingForecastOrders = false;
      }
    }
  });
}

function applyLedgerDataSources() {
  renderLedgerTable();
  updateMultiActionBar();
  updateCopyBufferBar();
}

function initLedgerApp() {
  if (!ledgerState.recordsLoaded) {
    const badge = document.getElementById('ledgerDataBadge');
    if (badge) badge.textContent = 'DB 로딩 중...';

    fetchLedgerData().then(res => {
      ledgerState.records = res.records || [];
      ledgerState.recordsLoaded = true;
      if (badge) badge.textContent = '최신 거래 반영';
      applyLedgerDataSources();
    }).catch(err => {
      console.error('Ledger data load error:', err);
      if (badge) badge.textContent = '오프라인';
    });

    syncForecastOrdersFromDB();
    syncForecastAggregateOverridesFromDB();
  } else {
    applyLedgerDataSources();
  }
}

// Global initialization and Realtime subscription
export function initLedgerView() {
  const scheduleMenuBtn = document.getElementById('scheduleMenuBtn');
  const ledgerMenuBtn = document.getElementById('ledgerMenuBtn');

  if (scheduleMenuBtn) scheduleMenuBtn.addEventListener('click', showScheduleViewTab);
  if (ledgerMenuBtn) ledgerMenuBtn.addEventListener('click', showLedgerViewTab);

  registerColorUpdateCallback(() => {
    if (ledgerState.active) applyLedgerDataSources();
  });

  registerRealtimeCallbacks({
    onLedgerChange: () => {
      fetchLedgerData().then(res => {
        ledgerState.records = res.records || [];
        applyLedgerDataSources();
      });
    }
  });

  bindLedgerListActions({
    ledgerState,
    getModal: getLedgerTransactionModal,
    getColorModal: getLedgerColorSettings,
    setMultiEditMode,
    executeCopy: () => executeLedgerCopy({
      selectedLedgerIds: ledgerState.selectedLedgerIds,
      findRecordFn: (id) => findLedgerRecordById(id, { ledgerState }),
      setCopiedRecords: (recs) => { ledgerState.copiedRecords = recs; },
      updateCopyBufferBar
    }),
    executeDelete: () => executeLedgerDelete({
      selectedLedgerIds: ledgerState.selectedLedgerIds,
      findRecordFn: (id) => findLedgerRecordById(id, { ledgerState }),
      applyOptimisticDelete,
      deleteBatchFn: deleteLedgerRecordsBatch,
      setMultiEditMode
    }),
    executePaste: () => executeLedgerPaste({
      copiedRecords: ledgerState.copiedRecords,
      ledgerState,
      ledgerSheetNameForRecord,
      applyOptimisticSave,
      insertBatchFn: insertLedgerRecordsBatch,
      onComplete: () => {
        setMultiEditMode(false);
        applyLedgerDataSources();
      }
    }),
    onSourceChange: (source, payment) => {
      ledgerState.source = source;
      ledgerState.payment = payment;
      applyLedgerDataSources();
    },
    onMonthChange: (newDate) => {
      ledgerState.monthCursor = newDate;
      applyLedgerDataSources();
    }
  });

  return {
    enter: showLedgerViewTab,
    leave: () => { ledgerState.active = false; }
  };
}
