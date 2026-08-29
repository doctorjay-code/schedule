// Authenticated schedule ledger feature coordinator.
// Pure calculation helpers and table utilities are extracted into separate modules.
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

const ledgerDataSources = {
  card: [],
  cash: [],
  bank: [],
  forecast: []
};
let fallbackBankRecords = [];
let ledgerSheetCounts = null;
let ledgerLiveConnected = false;
let ledgerSnapshotFetchedAt = null;
let ledgerDataState = 'loading';
const LEDGER_SHEET_SNAPSHOT_KEY = 'schedule_ledger_snapshot_v3';
try {
  localStorage.removeItem('schedule_ledger_last_sheet_snapshot_v1');
} catch {}
const ledgerSyncMessages = {
  loading: '가계부 불러오는 중',
  saved: '최신 내역 반영',
  cached: '오프라인 캐시본 표시 중',
  offline: '인터넷 연결 확인 필요',
  error: '가계부 불러오기 실패'
};
function setLedgerSyncStatus(status, detail = '') {
  const element = document.getElementById('ledgerSyncBtn');
  if (!element) return;
  element.dataset.state = status;
  element.textContent = detail || ledgerSyncMessages[status] || ledgerSyncMessages.saved;
  element.title = element.textContent;
}
const LEDGER_SHEET_BY_PAYMENT = {
  '기업카드': '기업카드',
  '토스은행': '토스은행',
  '토스카드': '토스은행',
  '현금': '현금',
  '기업은행': '기업은행'
};
const ledgerState = {
  source: 'card',
  period: 'weekly',
  payment: '토스은행',
  filters: {
    person: new Set(),
    category: new Set(),
    fixed: 'all'
  },
  filterType: 'all',
  filterValue: 'all',
  filterValues: new Set(),
  showOffsetGroups: false,
  multiEditMode: false,
  selectedLedgerIds: new Set(),
  copiedRecords: []
};

function getSelectedLedgerIds() {
  return ledgerState.selectedLedgerIds;
}

function updateMultiActionBar() {
  const bar = document.getElementById('multiActionBar');
  const label = document.getElementById('selectedCountLabel');
  const toggleBtn = document.getElementById('ledgerToggleMultiEditBtn');
  const count = ledgerState.selectedLedgerIds.size;
  if (toggleBtn) {
    toggleBtn.style.background = ledgerState.multiEditMode ? '#4F46E5' : '';
    toggleBtn.style.color = ledgerState.multiEditMode ? '#FFFFFF' : '#4F46E5';
  }
  if (!bar) return;
  if (ledgerState.multiEditMode && count > 0) {
    bar.classList.remove('hidden');
    if (label) label.textContent = `${count}개 선택됨`;
  } else {
    bar.classList.add('hidden');
  }
}

function updateCopyBufferBar() {
  const copyBar = document.getElementById('copyBufferBar');
  const copiedItemLabel = document.getElementById('copiedItemLabel');
  if (!copyBar || !copiedItemLabel) return;
  const count = ledgerState.copiedRecords ? ledgerState.copiedRecords.length : 0;
  if (count > 0) {
    copyBar.classList.remove('hidden');
    const first = ledgerState.copiedRecords[0];
    const preview = count === 1
      ? `${first.item || '항목'} (${formatMoney(first.amount)}원)`
      : `${first.item || '항목'} 외 ${count - 1}건`;
    copiedItemLabel.textContent = preview;
  } else {
    copyBar.classList.add('hidden');
  }
}

function setMultiEditMode(enabled) {
  ledgerState.multiEditMode = Boolean(enabled);
  if (!ledgerState.multiEditMode) {
    ledgerState.selectedLedgerIds.clear();
  }
  updateMultiActionBar();
  renderActiveLedgerPeriod();
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
  renderActiveLedgerPeriod();
}

function loadLedgerSheetSnapshot() {
  try {
    const raw = localStorage.getItem(LEDGER_SHEET_SNAPSHOT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (Array.isArray(parsed.card)) ledgerDataSources.card = parsed.card;
    if (Array.isArray(parsed.cash)) ledgerDataSources.cash = parsed.cash;
    if (Array.isArray(parsed.bank)) ledgerDataSources.bank = parsed.bank;
    if (Array.isArray(parsed.fallbackBank)) fallbackBankRecords = parsed.fallbackBank;
    if (parsed.sheetCounts && typeof parsed.sheetCounts === 'object') ledgerSheetCounts = parsed.sheetCounts;
    ledgerSnapshotFetchedAt = parsed.fetchedAt || null;
    ledgerDataState = 'cached';
    setLedgerSyncStatus('cached');
  } catch (err) {
    console.warn('Failed to load ledger snapshot:', err);
  }
}

function saveLedgerSheetSnapshot() {
  try {
    const payload = {
      card: ledgerDataSources.card || [],
      cash: ledgerDataSources.cash || [],
      bank: ledgerDataSources.bank || [],
      fallbackBank: fallbackBankRecords || [],
      sheetCounts: ledgerSheetCounts || null,
      fetchedAt: ledgerSnapshotFetchedAt || new Date().toISOString()
    };
    localStorage.setItem(LEDGER_SHEET_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save ledger snapshot:', err);
  }
}

async function refreshLedgerSheetData() {
  setLedgerSyncStatus('loading');
  try {
    const res = await fetchLedgerData();
    const rows = res.records || [];
    ledgerDataSources.card = rows.filter(r => r.payment === '기업카드' || r.payment === '토스은행');
    ledgerDataSources.cash = rows.filter(r => r.payment === '현금');
    ledgerDataSources.bank = rows.filter(r => r.payment === '기업은행');
    ledgerDataState = 'saved';
    ledgerSnapshotFetchedAt = new Date().toISOString();
    saveLedgerSheetSnapshot();
    setLedgerSyncStatus('saved');
    renderActiveLedgerPeriod();
  } catch (err) {
    console.error('Ledger refresh error:', err);
    ledgerDataState = 'offline';
    setLedgerSyncStatus('offline');
  }
}

function renderActiveLedgerPeriod() {
  const container = document.getElementById('fundplanAllTimeList');
  if (!container) return;
  const isForecast = ledgerState.source === 'forecast';
  const records = isForecast
    ? generateForecastRecords({ allRecords: getAllRecordsList(), isManualCardPayment }).displayRows
    : (ledgerDataSources[ledgerState.source] || []).filter(r => {
        if (ledgerState.source === 'card') return r.payment === ledgerState.payment;
        return true;
      });

  records.sort(compareLedgerRecords);
  const isCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
  const calculated = recalculateRunningBalances(records, isCard);

  container.innerHTML = '';
  if (calculated.length === 0) {
    appendLedgerEmptyRow(container, '거래 내역이 없습니다.');
    return;
  }

  calculated.forEach(record => {
    const isSelected = ledgerState.selectedLedgerIds.has(String(record.id));
    const tr = renderTransactionRow(record, {
      isCompanyCard: isCard,
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
    container.appendChild(tr);
  });
}

function getAllRecordsList() {
  return [
    ...(ledgerDataSources.card || []),
    ...(ledgerDataSources.cash || []),
    ...(ledgerDataSources.bank || [])
  ];
}

let ledgerTransactionModal = null;
function getLedgerTransactionModal() {
  if (!ledgerTransactionModal) {
    ledgerTransactionModal = createLedgerTransactionModal({
      state,
      pastelPalette,
      saveRecord: async (form, overrides) => {
        const values = { ...Object.fromEntries(new FormData(form).entries()), ...overrides };
        const rawAmount = String(values.amount || '').replace(/[^\d]/g, '');
        const amount = rawAmount === '' ? 0 : Number(rawAmount);
        const record = {
          id: values.ledgerEditId || generateLedgerId(values.date),
          date: values.date,
          type: values.type || 'expense',
          amount,
          payment: values.payment || ledgerState.payment || '토스은행',
          item: values.item.trim(),
          person: values.person || '기타',
          category: values.category || '',
          fixedCost: values.fixedCost === '고정비' ? '고정비' : '',
          memo: values.memo || ''
        };
        await upsertLedgerRecord(record);
        ledgerTransactionModal.close();
        await refreshLedgerSheetData();
      },
      deleteRecord: async (id) => {
        if (!confirm('이 거래를 삭제할까요?')) return;
        await deleteLedgerRecord({ id });
        ledgerTransactionModal.close();
        await refreshLedgerSheetData();
      },
      getCategorySuggestions: () => ['식비', '교통', '문화', '생활', '보험', '상환', '이체', '월급', '저축', '이자', '용돈', '입금', '출금', '기타']
    });
  }
  return ledgerTransactionModal;
}

let ledgerColorSettings = null;
function getLedgerColorSettings() {
  if (!ledgerColorSettings) {
    ledgerColorSettings = createLedgerColorSettings({
      state,
      pastelPalette,
      defaultColorSettings,
      saveColorSettings,
      renderLedgerViews: renderActiveLedgerPeriod
    });
  }
  return ledgerColorSettings;
}

function showLedger() {
  showLedgerView();
  renderActiveLedgerPeriod();
}

function showSchedule() {
  showScheduleView();
  switchViewModeUI(state.currentView);
}

export function initLedgerView() {
  try {
    loadLedgerSheetSnapshot();
    refreshLedgerSheetData().catch(e => console.warn('refreshLedgerSheetData warn:', e));
    registerRealtimeCallbacks({
      onLedgerChange: () => {
        refreshLedgerSheetData().catch(e => console.warn('Realtime refresh warn:', e));
      }
    });
    registerColorUpdateCallback(() => {
      renderActiveLedgerPeriod();
    });
  } catch (e) {
    console.warn('initLedgerView data load warn:', e);
  }

  document.getElementById('scheduleMenuBtn')?.addEventListener('click', showSchedule);
  document.getElementById('ledgerMenuBtn')?.addEventListener('click', showLedger);

  bindLedgerListActions({
    ledgerState,
    getModal: getLedgerTransactionModal,
    getColorModal: getLedgerColorSettings,
    setMultiEditMode,
    executeCopy: () => executeLedgerCopy({
      selectedLedgerIds: ledgerState.selectedLedgerIds,
      findRecordFn: (id) => findLedgerRecordById(id, { ledgerState, ledgerDataSources }),
      setCopiedRecords: (recs) => { ledgerState.copiedRecords = recs; },
      updateCopyBufferBar
    }),
    executeDelete: () => executeLedgerDelete({
      selectedLedgerIds: ledgerState.selectedLedgerIds,
      findRecordFn: (id) => findLedgerRecordById(id, { ledgerState, ledgerDataSources }),
      applyOptimisticDelete: (rec) => {
        ledgerDataSources[ledgerState.source] = (ledgerDataSources[ledgerState.source] || []).filter(r => r.id !== rec.id);
        renderActiveLedgerPeriod();
      },
      deleteBatchFn: deleteLedgerRecordsBatch,
      setMultiEditMode
    }),
    executePaste: () => executeLedgerPaste({
      copiedRecords: ledgerState.copiedRecords,
      ledgerState,
      ledgerSheetNameForRecord: (r) => r.payment || ledgerState.payment || '토스은행',
      applyOptimisticSave: (rec) => {
        (ledgerDataSources[ledgerState.source] ||= []).push(rec);
        renderActiveLedgerPeriod();
      },
      insertBatchFn: insertLedgerRecordsBatch,
      onComplete: () => {
        setMultiEditMode(false);
        renderActiveLedgerPeriod();
      }
    }),
    onSourceChange: (source, payment) => {
      ledgerState.source = source;
      ledgerState.payment = payment;
      renderActiveLedgerPeriod();
    },
    onMonthChange: (newDate) => {
      ledgerState.monthCursor = newDate;
      renderActiveLedgerPeriod();
    }
  });

  return { enter: showLedger, leave: showSchedule };
}
