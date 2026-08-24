import { state, pastelPalette, saveColorSettings, defaultColorSettings } from '../../services/schedule/state.js';
import { switchViewModeUI } from '../schedule/render.js';
import { openWeekSelectModal } from '../schedule/modals/week-picker.js';
import { openMonthSelectModal } from '../schedule/modals/month-picker.js';
import { startOfWeek, toIso, escapeHtml, formatMoney, getLedgerTagColor, recalculateRunningBalances, normalizeLedgerDate } from './ledger-utils.js?v=20260824_33';
import { filterLedgerRecords } from './card.js';
import { normalizeFundplanRows } from './fundplan.js';
import { groupExpenses, renderStatList } from './stats.js';
import { appendLedgerEmptyRow, createLedgerTableHead, formatLedgerScheduleDate, renderTransactionRow } from './transaction-view.js?v=20260824_33';
import { createLedgerTransactionModal } from './modals/transaction-modal.js?v=20260824_33';
import { createLedgerColorSettings } from './modals/color-settings.js?v=20260824_33';
import { bindLedgerListActions } from './ledger-events.js?v=20260824_33';
import { createFundplanView, createLedgerMonthDividerRow } from './fundplan-view.js?v=20260824_33';
import { fetchLedgerSheetData, upsertLedgerSheetRecord, deleteLedgerSheetRecord, reorderLedgerSheetRecords } from '../../services/ledger/ledger-api.js?v=20260824_38';

let importedLedgerRecords = [];
let importedBankRecords = [];
let importedCashRecords = [];
let importedForecastRecords = [];
let fallbackBankRecords = [];
let sheetLedgerRecords = null;
let sheetCashRecords = null;
let sheetBankRecords = null;
let sheetForecastRecords = null;
let ledgerSheetCounts = null;
let ledgerLiveConnected = false;
let ledgerSnapshotFetchedAt = null;
let ledgerDataState = 'loading';
const LEDGER_SHEET_SNAPSHOT_KEY = 'schedule_ledger_last_sheet_snapshot_v1';
const ledgerSyncMessages = {
  loading: '가계부 불러오는 중',
  saved: '최신 내역 반영',
  cached: '마지막 시트 동기화본 표시 중',
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
  '\uAE30\uC5C5\uCE74\uB4DC': '\uAE30\uC5C5\uCE74\uB4DC',
  '\uD1A0\uC2A4\uC740\uD589': '\uD1A0\uC2A4\uC740\uD589',
  '\uD1A0\uC2A4\uCE74\uB4DC': '\uD1A0\uC2A4\uC740\uD589',
  '\uD604\uAE08': '\uD604\uAE08',
  '\uAE30\uC5C5\uC740\uD589': '\uAE30\uC5C5\uC740\uD589'
};
const ledgerState = {
  source: 'card',
  period: 'weekly',
  payment: '\uD1A0\uC2A4\uC740\uD589',
  filterType: 'all',
  filterValue: 'all',
  weekStart: startOfWeek(new Date()),
  monthCursor: new Date(),
  records: [],
  fundplanAutoScrolled: { bank: false, cash: false }
};
function syncLedgerWriteControls() {
  const entryButton = document.getElementById('ledgerToggleEntryBtn');
  const isSheetConnected = ledgerLiveConnected;
  const isWritableTab = ['card', 'cash', 'bank'].includes(ledgerState.source);
  if (!entryButton) return;
  entryButton.disabled = !isSheetConnected || !isWritableTab;
  entryButton.title = !isWritableTab
    ? '잔액전망은 원본 시트 기준 읽기 전용입니다.'
    : isSheetConnected
      ? 'Google Sheets에 새 거래를 저장합니다.'
      : '시트 연결 후 거래를 입력할 수 있습니다.';
}

const LEDGER_CUSTOM_ORDER_KEY = 'ledger_custom_order_map_v2';

function getCustomOrderMap() {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_CUSTOM_ORDER_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCustomOrderMap(orderMap) {
  try {
    localStorage.setItem(LEDGER_CUSTOM_ORDER_KEY, JSON.stringify(orderMap));
  } catch (e) {
    console.warn('saveCustomOrderMap error:', e);
  }
}

function applyCustomOrderToList(records) {
  if (!Array.isArray(records) || records.length === 0) return records;
  const orderMap = getCustomOrderMap();
  if (Object.keys(orderMap).length === 0) return records;

  return [...records].sort((a, b) => {
    const aOrder = orderMap[String(a.id)];
    const bOrder = orderMap[String(b.id)];
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    return 0;
  });
}

function applyLedgerDataSources() {
  importedLedgerRecords = applyCustomOrderToList(sheetLedgerRecords || []);
  importedBankRecords = applyCustomOrderToList(sheetBankRecords || fallbackBankRecords);
  importedCashRecords = applyCustomOrderToList(sheetCashRecords || []);
  importedForecastRecords = sheetForecastRecords || [];
  loadRecords();
  syncLedgerWriteControls();
  renderActiveLedgerPeriod();
}

function loadLedgerSheetSnapshot() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(LEDGER_SHEET_SNAPSHOT_KEY) || 'null');
    if (!snapshot || !Array.isArray(snapshot.ledgerRecords) || !Array.isArray(snapshot.cashRecords)) return false;
    sheetLedgerRecords = snapshot.ledgerRecords;
    sheetCashRecords = snapshot.cashRecords;
    sheetBankRecords = Array.isArray(snapshot.bankRecords) ? snapshot.bankRecords : null;
    sheetForecastRecords = Array.isArray(snapshot.forecastRecords) ? snapshot.forecastRecords : null;
    ledgerSheetCounts = snapshot.counts && typeof snapshot.counts === 'object' ? snapshot.counts : null;
    ledgerSnapshotFetchedAt = snapshot.fetchedAt || null;
    ledgerDataState = 'cached';
    applyLedgerDataSources();
    return true;
  } catch (error) {
    console.warn('마지막 가계부 시트 동기화본을 복원하지 못했습니다:', error);
    return false;
  }
}

function saveLedgerSheetSnapshot(fetchedAt = new Date().toISOString()) {
  const snapshot = {
    version: 1,
    fetchedAt,
    counts: ledgerSheetCounts,
    ledgerRecords: sheetLedgerRecords || [],
    cashRecords: sheetCashRecords || [],
    bankRecords: sheetBankRecords || [],
    forecastRecords: sheetForecastRecords || []
  };
  localStorage.setItem(LEDGER_SHEET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  ledgerSnapshotFetchedAt = fetchedAt;
}

function loadOptionalFundplanRecords() {
  import('../../data/local/fundplan-seed.local.js').then(module => {
    fallbackBankRecords = normalizeFundplanRows(module.importedBankRows, 'bank');
    applyLedgerDataSources();
  }).catch(() => {
    fallbackBankRecords = [];
    applyLedgerDataSources();
  });
}

// === 스마트 보호 큐 및 지능형 상태 병합 (Race-Condition Proof) ===
const pendingCreatedRecords = new Map();
const pendingDeletedIds = new Set();
let ledgerQueuePromise = Promise.resolve();

function enqueueLedgerTask(taskFn) {
  ledgerQueuePromise = ledgerQueuePromise.then(async () => {
    try {
      await taskFn();
    } catch (err) {
      console.error('Ledger background task error:', err);
    }
  });
  return ledgerQueuePromise;
}

function mergeWithPendingRecords(incomingRecords, targetSheets = null) {
  let result = (incomingRecords || []).filter(r => r && !pendingDeletedIds.has(String(r.id)));

  for (const [id, pendingRecord] of pendingCreatedRecords.entries()) {
    if (pendingDeletedIds.has(String(id))) continue;
    const sheetName = pendingRecord.sheetName || ledgerSheetNameForRecord(pendingRecord);
    if (!targetSheets || targetSheets.includes(sheetName)) {
      const idx = result.findIndex(r => String(r.id) === String(id));
      if (idx !== -1) {
        result[idx] = { ...result[idx], ...pendingRecord };
      } else {
        result.push(pendingRecord);
      }
    }
  }

  return result;
}

function getCurrentLedgerSheetName() {
  if (ledgerState.source === 'card') return LEDGER_SHEET_BY_PAYMENT[ledgerState.payment] || '';
  if (ledgerState.source === 'cash') return '현금';
  if (ledgerState.source === 'bank') return '기업은행';
  if (ledgerState.source === 'forecast') return '잔액전망';
  return '';
}
async function refreshLedgerSheetData(sheetName = '') {
  const selectedSheet = String(sheetName || '').trim();
  setLedgerSyncStatus('loading');
  try {
    const { records, counts, fetchedAt } = await fetchLedgerSheetData(fetch, selectedSheet);
    if (selectedSheet) {
      const preservedLedgerRecords = (sheetLedgerRecords || []).filter(record => record.sheetName !== selectedSheet);
      const merged = mergeWithPendingRecords(records, [selectedSheet]);
      if (selectedSheet === '현금') {
        sheetCashRecords = merged;
      } else if (selectedSheet === '기업은행') {
        sheetBankRecords = merged;
      } else if (selectedSheet === '잔액전망') {
        sheetForecastRecords = merged;
      } else {
        sheetLedgerRecords = mergeWithPendingRecords([...preservedLedgerRecords, ...merged]);
      }
      ledgerSheetCounts = { ...(ledgerSheetCounts || {}), ...counts };
    } else {
      sheetLedgerRecords = mergeWithPendingRecords(records.filter(record => ['기업카드', '토스은행'].includes(record.sheetName)), ['기업카드', '토스은행']);
      sheetCashRecords = mergeWithPendingRecords(records.filter(record => record.sheetName === '현금'), ['현금']);
      sheetBankRecords = mergeWithPendingRecords(records.filter(record => record.sheetName === '기업은행'), ['기업은행']);
      sheetForecastRecords = mergeWithPendingRecords(records.filter(record => record.sheetName === '잔액전망'), ['잔액전망']);
      ledgerSheetCounts = counts;
    }
    ledgerDataState = 'fresh';
    ledgerLiveConnected = true;
    applyLedgerDataSources();
    saveLedgerSheetSnapshot(fetchedAt || new Date().toISOString());
    setLedgerSyncStatus('saved');
    return true;
  } catch (error) {
    const hasSnapshot = Boolean((sheetLedgerRecords && sheetLedgerRecords.length) || (sheetCashRecords && sheetCashRecords.length));
    ledgerLiveConnected = false;
    ledgerDataState = hasSnapshot ? 'cached' : 'error';
    if (!hasSnapshot) setText('ledgerDataBadge', '시트 연결 실패');
    syncLedgerWriteControls();
    setLedgerSyncStatus('offline');
    return false;
  }
}

function loadRecords() {
  ledgerState.records = [...importedLedgerRecords, ...importedCashRecords, ...importedBankRecords];
  const sheetTotal = ledgerSheetCounts ? Object.values(ledgerSheetCounts).reduce((sum, count) => sum + count, 0) : 0;
  const snapshotLabel = ledgerSnapshotFetchedAt ? ` · 마지막 동기화 ${new Date(ledgerSnapshotFetchedAt).toLocaleString('ko-KR')}` : '';
  setText('ledgerDataBadge', ledgerSheetCounts ? `시트 ${sheetTotal}건${snapshotLabel}` : '시트 불러오는 중');
  if (ledgerState.source === 'card') {
    setLedgerPayment(ledgerState.payment, false);
  } else {
    syncLedgerCardButtons();
    renderActiveLedgerPeriod();
  }
}


function getSelectedCardRecords() {
  const cardRecords = ledgerState.records.filter(record => record.payment === ledgerState.payment);
  return filterLedgerRecords(cardRecords, ledgerState.filterType, ledgerState.filterValue);
}
function closeLedgerFilterOptions() {
  document.getElementById('ledgerPersonFilterOptions')?.classList.add('hidden');
  document.getElementById('ledgerCategoryFilterOptions')?.classList.add('hidden');
  document.getElementById('ledgerPersonFilterToggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('ledgerCategoryFilterToggle')?.setAttribute('aria-expanded', 'false');
}

function toggleLedgerFilterOptions(type) {
  if (ledgerState.filterType === type) {
    setLedgerFilter('all', 'all');
    return;
  }
  const personOptions = document.getElementById('ledgerPersonFilterOptions');
  const categoryOptions = document.getElementById('ledgerCategoryFilterOptions');
  const target = type === 'person' ? personOptions : categoryOptions;
  const isOpening = Boolean(target?.classList.contains('hidden'));
  closeLedgerFilterOptions();
  if (isOpening) {
    target?.classList.remove('hidden');
    document.getElementById(type === 'person' ? 'ledgerPersonFilterToggle' : 'ledgerCategoryFilterToggle')?.setAttribute('aria-expanded', 'true');
  }
}

function syncLedgerCardButtons() {
  const activePerson = ledgerState.filterType === 'person';
  const activeCategory = ledgerState.filterType === 'category';
  const activeFixed = ledgerState.filterType === 'fixed';
  const allButton = document.getElementById('ledgerFilterAllBtn');
  const personButton = document.getElementById('ledgerPersonFilterToggle');
  const categoryButton = document.getElementById('ledgerCategoryFilterToggle');
  const fixedButton = document.getElementById('ledgerFixedFilterBtn');
  allButton?.classList.toggle('active', ledgerState.filterType === 'all');
  personButton?.classList.toggle('active', activePerson);
  categoryButton?.classList.toggle('active', activeCategory);
  fixedButton?.classList.toggle('active', activeFixed);
  if (personButton) personButton.textContent = '사용자';
  if (categoryButton) categoryButton.textContent = '사용처';
  document.querySelectorAll('[data-ledger-filter-type]').forEach(button => {
    button.classList.toggle('active', button.dataset.ledgerFilterType === ledgerState.filterType && button.dataset.ledgerFilterValue === ledgerState.filterValue);
  });
  document.querySelectorAll('[data-ledger-payment]').forEach(button => {
    button.classList.toggle('active', ledgerState.source === 'card' && button.dataset.ledgerPayment === ledgerState.payment);
  });
}
function setLedgerFilter(type, value) {
  ledgerState.filterType = type;
  ledgerState.filterValue = value;
  if (type === 'person' || type === 'category') {
    const activeOptionsId = type === 'person' ? 'ledgerPersonFilterOptions' : 'ledgerCategoryFilterOptions';
    const inactiveOptionsId = type === 'person' ? 'ledgerCategoryFilterOptions' : 'ledgerPersonFilterOptions';
    const activeToggleId = type === 'person' ? 'ledgerPersonFilterToggle' : 'ledgerCategoryFilterToggle';
    const inactiveToggleId = type === 'person' ? 'ledgerCategoryFilterToggle' : 'ledgerPersonFilterToggle';
    document.getElementById(inactiveOptionsId)?.classList.add('hidden');
    document.getElementById(inactiveToggleId)?.setAttribute('aria-expanded', 'false');
    document.getElementById(activeOptionsId)?.classList.remove('hidden');
    document.getElementById(activeToggleId)?.setAttribute('aria-expanded', 'true');
  } else {
    closeLedgerFilterOptions();
  }
  syncLedgerCardButtons();
  renderActiveLedgerPeriod();
}function getLedgerWeekStartFromPickerItem(wObj) {
  const title = String(wObj?.title || '');
  const match = title.match(/(\d{4})[^0-9]+(\d{1,2})[^0-9]+\d+[^0-9]*\((\d{1,2})\.\s*(\d{1,2})/);
  if (!match) return null;
  const titleYear = Number(match[1]);
  const titleMonth = Number(match[2]);
  const startMonth = Number(match[3]);
  const startDay = Number(match[4]);
  const startYear = startMonth > titleMonth + 1 ? titleYear - 1 : titleYear;
  return startOfWeek(new Date(startYear, startMonth - 1, startDay));
}
function getLedgerPickerWeekIndex() {
  const activeWeek = toIso(ledgerState.weekStart);
  return state.allWeeksData.findIndex(wObj => {
    const weekStart = getLedgerWeekStartFromPickerItem(wObj);
    return weekStart && toIso(weekStart) === activeWeek;
  });
}
function openLedgerPeriodPicker(event) {
  event?.preventDefault();
  if (ledgerState.period === 'monthly') {
    openMonthSelectModal({
      selectedYear: ledgerState.monthCursor.getFullYear(),
      selectedMonth: ledgerState.monthCursor.getMonth() + 1,
      onSelect: (year, month) => {
        ledgerState.monthCursor = new Date(year, month - 1, 1);
        renderActiveLedgerPeriod();
      }
    });
    return;
  }
  if (ledgerState.source !== 'card' || ledgerState.period !== 'weekly') return;
  openWeekSelectModal({
    selectedIndex: getLedgerPickerWeekIndex(),
    onSelect: (_index, wObj) => {
      const weekStart = getLedgerWeekStartFromPickerItem(wObj);
      if (!weekStart) return;
      ledgerState.weekStart = weekStart;
      renderActiveLedgerPeriod();
    }
  });
}
function setLedgerPayment(payment, focusLatest = false) {
  ledgerState.payment = payment;
  if (ledgerState.source !== 'card') setLedgerSource('card');
  if (focusLatest) {
    const latest = [...getSelectedCardRecords()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
    if (latest) {
      const latestDate = new Date(latest.date + 'T12:00:00');
      ledgerState.weekStart = startOfWeek(latestDate);
      ledgerState.monthCursor = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    }
  }
  syncLedgerCardButtons();
  renderActiveLedgerPeriod();
}const LEDGER_MIN_DATE = new Date(2026, 0, 1);
function clampLedgerDate(date) {
  return date < LEDGER_MIN_DATE ? new Date(LEDGER_MIN_DATE) : date;
}
function moveLedgerPeriod(direction) {
  if (ledgerState.period === 'weekly') {
    const next = new Date(ledgerState.weekStart);
    next.setDate(next.getDate() + (direction * 7));
    ledgerState.weekStart = next < LEDGER_MIN_DATE ? new Date(LEDGER_MIN_DATE) : startOfWeek(next);
  } else {
    const cursor = ledgerState.monthCursor;
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
    ledgerState.monthCursor = clampLedgerDate(next);
  }
  renderActiveLedgerPeriod();
}
function focusLedgerLatest() {
  if (ledgerState.source === 'card') {
    setLedgerPayment(ledgerState.payment, true);
    return;
  }
  const today = new Date();
  ledgerState.monthCursor = new Date(today.getFullYear(), today.getMonth(), 1);
  renderActiveLedgerPeriod();
}function getWeekEnd() {
  const d = new Date(ledgerState.weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}
function inCurrentWeek(record) {
  const dStr = normalizeLedgerDate(record.date);
  const startStr = toIso(ledgerState.weekStart);
  const endStr = toIso(getWeekEnd());
  return dStr >= startStr && dStr <= endStr;
}
function getWeeklyRecords() {
  return getSelectedCardRecords()
    .filter(inCurrentWeek)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function renderWeekly() {
  const items = ledgerState.period === 'all' ? [...getSelectedCardRecords()].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) : getWeeklyRecords();
  const income = items.filter(x => x.type === 'income').reduce((sum,x) => sum + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((sum,x) => sum + x.amount, 0);
  const start = ledgerState.weekStart;
  const end = getWeekEnd();
  const formatLedgerDate = date => date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0');
  const endLabel = start.getFullYear() === end.getFullYear()
    ? String(end.getMonth() + 1).padStart(2, '0') + '.' + String(end.getDate()).padStart(2, '0')
    : formatLedgerDate(end);
  setText('ledgerPeriodTitle', ledgerState.period === 'all' ? '\uC804\uCCB4 \uB0B4\uC5ED' : formatLedgerDate(start) + String.fromCharCode(8211) + endLabel);  setText('ledgerWeeklyIncome', formatMoney(income));
  setText('ledgerWeeklyExpense', formatMoney(expense));
  setText('ledgerWeeklyBalance', (income - expense < 0 ? '-' : '') + formatMoney(income - expense));
  setText('ledgerTransactionCount', items.length + '\uAC74');
  const list = document.getElementById('ledgerTransactionList');
  if (!list) return;
  list.replaceChildren();
  if (!items.length) {
    const message = ledgerDataState === 'loading'
      ? '\uAC00\uACC4\uBD80 \uBD88\uB7EC\uC624\uB294 \uC911\u2026'
      : ledgerDataState === 'error'
        ? '\uAC00\uACC4\uBD80\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68\uC744 \uB20C\uB7EC \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.'
        : '\uC774\uBC88 \uC8FC \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.';
    appendLedgerEmptyRow(list, message);
    return;
  }
  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
  const calculatedItems = recalculateRunningBalances(items, isCompanyCard);
  calculatedItems.forEach(item => renderTransactionRow(item, 'ledgerTransactionList', { source: ledgerState.source, colorSettings: state.colorSettings }));
}

function findLedgerTransaction(id) {
  return [...ledgerState.records, ...importedBankRecords, ...importedCashRecords, ...importedForecastRecords].find(record => record.id === id);
}
let ledgerTransactionModal = null;
function getLedgerTransactionModal() {
  if (!ledgerTransactionModal) {
    ledgerTransactionModal = createLedgerTransactionModal({
      ledgerState,
      findRecord: findLedgerTransaction,
      onSave: saveLedgerRecord,
      onDelete: deleteRecord
    });
  }
  return ledgerTransactionModal;
}
function editRecord(id) {
  getLedgerTransactionModal().open(id);
}

function ledgerSheetNameForRecord(record) {
  return String(record?.sheetName || LEDGER_SHEET_BY_PAYMENT[record?.payment] || '');
}

function copyRecordList(records) {
  return Array.isArray(records) ? records.map(record => ({ ...record })) : null;
}

function captureLedgerSheetState() {
  return {
    ledgerRecords: copyRecordList(sheetLedgerRecords),
    cashRecords: copyRecordList(sheetCashRecords),
    bankRecords: copyRecordList(sheetBankRecords),
    forecastRecords: copyRecordList(sheetForecastRecords)
  };
}

function restoreLedgerSheetState(snapshot) {
  sheetLedgerRecords = snapshot.ledgerRecords;
  sheetCashRecords = snapshot.cashRecords;
  sheetBankRecords = snapshot.bankRecords;
  sheetForecastRecords = snapshot.forecastRecords;
  applyLedgerDataSources();
}

function recalculateLedgerBalances(records) {
  if (!Array.isArray(records) || records.length === 0) return records;

  let lastKnownBalance = null;

  return records.map(rec => {
    // 기업카드는 잔액 열을 강제 조작하지 않음
    if (rec.payment === '기업카드' || rec.sheetName === '기업카드') {
      return rec;
    }

    const rawBal = Number(String(rec.balance ?? '').replace(/[^0-9.-]/g, ''));
    const hasValidSheetBalance = Number.isFinite(rawBal) && rec.balance !== '' && rec.balance !== null && rec.balance !== undefined;

    if (hasValidSheetBalance) {
      // 1. 시트 원본에 이미 실제 잔액이 있는 경우 100% 그대로 보존
      lastKnownBalance = rawBal;
      return rec;
    }

    // 2. 신규 추가되었거나 잔액이 없는 행의 경우: 직전 잔액을 기준으로 계산
    if (lastKnownBalance !== null) {
      const amt = Number(rec.amount) || 0;
      const isIncome = rec.type === 'income' || rec.type === '\uC218\uC785';
      const diff = isIncome ? amt : -amt;
      lastKnownBalance = lastKnownBalance + diff;
      return {
        ...rec,
        balance: lastKnownBalance
      };
    }

    return rec;
  });
}

function reorderLedgerRecord(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
  const orderMap = getCustomOrderMap();
  
  const existingOrders = orderedIds
    .map(id => orderMap[String(id)])
    .filter(val => typeof val === 'number')
    .sort((a, b) => a - b);
  
  const baseOrder = existingOrders.length > 0 ? existingOrders[0] : Date.now();
  
  orderedIds.forEach((id, idx) => {
    if (id) {
      orderMap[String(id)] = baseOrder + idx;
    }
  });
  
  saveCustomOrderMap(orderMap);
  
  if (sheetLedgerRecords) sheetLedgerRecords = applyCustomOrderToList(sheetLedgerRecords);
  if (sheetBankRecords) sheetBankRecords = applyCustomOrderToList(sheetBankRecords);
  if (sheetCashRecords) sheetCashRecords = applyCustomOrderToList(sheetCashRecords);
  
  applyLedgerDataSources();
  showLedgerToast('↕️ 거래 순서가 시트에 반영되었습니다.');

  const currentSheetName = getCurrentLedgerSheetName();
  if (currentSheetName && currentSheetName !== '잔액전망') {
    enqueueLedgerTask(async () => {
      try {
        await reorderLedgerSheetRecords(currentSheetName, orderedIds);
        refreshLedgerInBackground({ sheetName: currentSheetName });
      } catch (error) {
        console.error('Background reorder sync error:', error);
      }
    });
  }
}

function upsertLocalRecord(records, record) {
  const nextRecord = { ...record, sheetName: ledgerSheetNameForRecord(record), source: 'google-sheets' };
  const list = records || [];
  const index = list.findIndex(item => String(item.id) === String(nextRecord.id));
  let updatedList;
  if (index !== -1) {
    updatedList = list.map(item => String(item.id) === String(nextRecord.id) ? nextRecord : item);
  } else {
    const nextList = [...list, nextRecord];
    updatedList = nextList.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
  }
  return recalculateLedgerBalances(updatedList);
}

function applyOptimisticSave(record) {
  const isCash = record.payment === '현금' || record.sheetName === '현금';
  const isBank = record.payment === '기업은행' || record.sheetName === '기업은행';
  const isCard = !isCash && !isBank;

  const removeIfOther = (rows, isTarget) => isTarget ? rows : (rows || []).filter(item => String(item.id) !== String(record.id));

  sheetCashRecords = removeIfOther(sheetCashRecords, isCash);
  sheetBankRecords = removeIfOther(sheetBankRecords, isBank);
  sheetLedgerRecords = removeIfOther(sheetLedgerRecords, isCard);

  if (isCash) {
    sheetCashRecords = upsertLocalRecord(sheetCashRecords, record);
  } else if (isBank) {
    sheetBankRecords = upsertLocalRecord(sheetBankRecords, record);
  } else {
    sheetLedgerRecords = upsertLocalRecord(sheetLedgerRecords, record);
  }

  applyLedgerDataSources();
  if (ledgerState.source === 'card') setLedgerPayment(record.payment, false);
}

function applyOptimisticDelete(record) {
  const withoutRecord = rows => (rows || []).filter(item => item.id !== record.id);
  if (record.payment === '현금' || record.sheetName === '현금') {
    sheetCashRecords = withoutRecord(sheetCashRecords);
  } else if (record.payment === '기업은행' || record.sheetName === '기업은행') {
    sheetBankRecords = withoutRecord(sheetBankRecords);
  } else {
    sheetLedgerRecords = withoutRecord(sheetLedgerRecords);
  }
  applyLedgerDataSources();
}

function refreshLedgerInBackground(record) {
  const sheetName = ledgerSheetNameForRecord(record);
  if (sheetName) refreshLedgerSheetData(sheetName).catch(() => {});
}

function saveLedgerRecord(form, overrides = {}) {
  const values = { ...Object.fromEntries(new FormData(form).entries()), ...overrides };
  const amount = Number(values.amount);
  if (!values.date || !values.item?.trim() || !Number.isFinite(amount) || amount <= 0) return;

  const isEdit = Boolean(values.ledgerEditId);
  const existing = ledgerState.records.find(record => record.id === values.ledgerEditId);
  const memo = (values.memo || '').trim();
  const personMatch = memo.match(/콩콩|쥬쥬|지니/);
  const payment = values.payment || ledgerState.payment || '토스은행';
  const record = {
    ...(existing || {}),
    id: values.ledgerEditId || '',
    date: values.date,
    type: values.type,
    amount,
    payment,
    item: values.item.trim(),
    person: personMatch ? personMatch[0] : '',
    category: values.category || '',
    fixedCost: values.fixedCost === '\uACE0\uC815\uBE44' ? values.fixedCost : '',
    memo,
    createdAt: existing?.createdAt ?? Date.now()
  };
  record.sheetName = ledgerSheetNameForRecord(record);

  pendingDeletedIds.delete(String(record.id));
  pendingCreatedRecords.set(String(record.id), record);

  applyOptimisticSave(record);
  getLedgerTransactionModal().close();
  showLedgerToast(isEdit ? '✏️ 거래가 수정되었습니다.' : '＋ 거래가 등록되었습니다.');

  enqueueLedgerTask(async () => {
    try {
      const res = await upsertLedgerSheetRecord(record);
      if (res && res.id) {
        record.id = res.id;
        record.sheetRow = res.sheetRow;
      }
      pendingCreatedRecords.delete(String(record.id));
      refreshLedgerInBackground(record);
    } catch (error) {
      console.error('Background ledger save error:', error);
      showLedgerToast('⚠️ 시트 저장 동기화 지연 중 (로컬 반영 완료)');
    }
  });
}

function deleteRecord(id) {
  const record = findLedgerRecordById(id) || ledgerState.records.find(item => String(item.id) === String(id));
  if (!record) {
    showLedgerToast('⚠️ 삭제할 거래 정보를 찾을 수 없습니다.');
    return;
  }
  if (!confirm('이 거래를 삭제할까요?')) return;

  const deletePayload = {
    ...record,
    sheetName: ledgerSheetNameForRecord(record)
  };

  pendingCreatedRecords.delete(String(record.id));
  pendingDeletedIds.add(String(record.id));

  applyOptimisticDelete(record);
  getLedgerTransactionModal().close();
  showLedgerToast('🗑️ 거래가 삭제되었습니다.');

  enqueueLedgerTask(async () => {
    try {
      if (deletePayload.sheetRow || !String(deletePayload.id || '').startsWith('cp_')) {
        await deleteLedgerSheetRecord(deletePayload);
      }
      refreshLedgerInBackground(deletePayload);
    } catch (error) {
      console.error('Background ledger delete error:', error);
    }
  });
}

function toggleLedgerEntry() {
  if (!ledgerLiveConnected) {
    alert('시트 연결이 확인된 뒤에 거래를 입력할 수 있습니다.');
    return;
  }
  getLedgerTransactionModal().open();
}
let ledgerColorSettings = null;
function getLedgerColorSettings() {
  if (!ledgerColorSettings) {
    ledgerColorSettings = createLedgerColorSettings({
      state,
      pastelPalette,
      defaultColorSettings,
      saveColorSettings,
      renderLedgerViews: () => { renderWeekly(); renderMonthly(); }
    });
  }
  return ledgerColorSettings;
}
let isLedgerMultiEdit = false;
let selectedLedgerIds = new Set();
let copiedLedgerRecords = [];

function updateLedgerSelectionUI() {
  const count = selectedLedgerIds.size;
  const label = document.getElementById('ledgerSelectedCountLabel');
  if (label) label.textContent = `${count}건 선택됨`;

  document.querySelectorAll('tr[data-ledger-id]').forEach(row => {
    const id = row.dataset.ledgerId;
    row.classList.toggle('ledger-row-selected', selectedLedgerIds.has(id));
  });
}

function setLedgerMultiEditMode(active) {
  isLedgerMultiEdit = Boolean(active);
  document.getElementById('ledgerToggleMultiEditBtn')?.classList.toggle('active', isLedgerMultiEdit);
  
  const multiBar = document.getElementById('ledgerMultiActionBar');
  const entryBtn1 = document.getElementById('ledgerToggleEntryBtn');
  const entryBtn2 = document.getElementById('ledgerMonthlyToggleEntryBtn');

  if (isLedgerMultiEdit) {
    multiBar?.classList.remove('hidden');
    entryBtn1?.classList.add('hidden');
    entryBtn2?.classList.add('hidden');
  } else {
    multiBar?.classList.add('hidden');
    selectedLedgerIds.clear();
    updateLedgerSelectionUI();
    if (!copiedLedgerRecords.length) {
      entryBtn1?.classList.remove('hidden');
      entryBtn2?.classList.remove('hidden');
    }
  }
}

function toggleLedgerMultiEdit() {
  setLedgerMultiEditMode(!isLedgerMultiEdit);
}

function handleLedgerRowClick(id, event) {
  if (isLedgerMultiEdit) {
    if (selectedLedgerIds.has(id)) {
      selectedLedgerIds.delete(id);
    } else {
      selectedLedgerIds.add(id);
    }
    updateLedgerSelectionUI();
  } else {
    getLedgerTransactionModal().open(id);
  }
}

function findLedgerRecordById(id) {
  const allPool = [
    ...(ledgerState.records || []),
    ...(sheetLedgerRecords || []),
    ...(sheetCashRecords || []),
    ...(sheetBankRecords || []),
    ...(sheetForecastRecords || []),
    ...(importedLedgerRecords || []),
    ...(importedBankRecords || []),
    ...(importedCashRecords || []),
    ...(importedForecastRecords || [])
  ];
  return allPool.find(item => item && String(item.id) === String(id)) || null;
}

function copySelectedLedgerRecords() {
  if (selectedLedgerIds.size === 0) {
    alert('복사할 거래를 선택해주세요.');
    return;
  }
  copiedLedgerRecords = Array.from(selectedLedgerIds)
    .map(id => findLedgerRecordById(id))
    .filter(Boolean)
    .map(r => JSON.parse(JSON.stringify(r)));
  
  if (copiedLedgerRecords.length === 0) {
    alert('선택된 거래 정보를 찾을 수 없습니다.');
    return;
  }

  const copyBar = document.getElementById('ledgerCopyBufferBar');
  const copyLabel = document.getElementById('ledgerCopiedItemLabel');
  if (copyLabel) copyLabel.textContent = `${copiedLedgerRecords.length}건`;
  copyBar?.classList.remove('hidden');
  
  setLedgerMultiEditMode(false);
}

function deleteSelectedLedgerRecords() {
  if (selectedLedgerIds.size === 0) {
    showLedgerToast('⚠️ 삭제할 거래를 선택해주세요.');
    return;
  }

  const count = selectedLedgerIds.size;
  if (!confirm(`선택한 ${count}건의 거래를 모두 삭제할까요?`)) return;

  const recordsToDelete = Array.from(selectedLedgerIds)
    .map(id => findLedgerRecordById(id))
    .filter(Boolean);

  if (recordsToDelete.length === 0) {
    showLedgerToast('⚠️ 삭제할 거래 정보를 찾을 수 없습니다.');
    return;
  }

  for (const record of recordsToDelete) {
    pendingCreatedRecords.delete(String(record.id));
    pendingDeletedIds.add(String(record.id));
    applyOptimisticDelete(record);
  }

  setLedgerMultiEditMode(false);
  showLedgerToast(`🗑️ ${recordsToDelete.length}건의 거래가 삭제되었습니다.`);

  enqueueLedgerTask(async () => {
    try {
      for (const record of recordsToDelete) {
        const deletePayload = {
          ...record,
          sheetName: ledgerSheetNameForRecord(record)
        };
        if (deletePayload.sheetRow || !String(deletePayload.id || '').startsWith('cp_')) {
          await deleteLedgerSheetRecord(deletePayload);
        }
      }
      if (recordsToDelete.length > 0) {
        refreshLedgerInBackground(recordsToDelete[0]);
      }
    } catch (error) {
      console.error('Background multi-delete error:', error);
    }
  });
}

let toastTimer = null;
function showLedgerToast(message) {
  const toast = document.getElementById('ledgerToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 1800);
}

function pasteCopiedLedgerRecords() {
  if (!copiedLedgerRecords || copiedLedgerRecords.length === 0) {
    showLedgerToast('복사된 거래가 없습니다.');
    return;
  }

  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
  const targetYear = ledgerState.monthCursor.getFullYear();
  const targetMonth = ledgerState.monthCursor.getMonth(); // 0-indexed (0=1월, 7=8월, 8=9월)

  const newRecords = [];
  const recordsToSave = [...copiedLedgerRecords];

  for (let i = 0; i < recordsToSave.length; i++) {
    const item = recordsToSave[i];
    const origParts = String(item.date || '').split('-');
    const origDay = origParts.length === 3 ? parseInt(origParts[2], 10) || 1 : 1;

    let newDate = '';
    if (isCompanyCard) {
      // 기업카드 13일 정산 주기 스마트 계산 (현재 화면의 청구월 targetMonth에 정확히 꽂히도록 계산)
      let calcYear = targetYear;
      let calcMonth = targetMonth; // 0-indexed
      if (targetMonth <= 1) {
        calcMonth = targetMonth;
      } else {
        // 13일 이상이면 전월(targetMonth-1), 12일 이하이면 당월(targetMonth)
        if (origDay >= 13) {
          calcMonth = targetMonth - 1;
        } else {
          calcMonth = targetMonth;
        }
      }
      const maxDays = new Date(calcYear, calcMonth + 1, 0).getDate();
      const clampedDay = Math.min(origDay, maxDays);
      newDate = `${calcYear}-${String(calcMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    } else {
      // 일반 결제수단 (토스/현금/기업은행): 당월 1일~말일
      const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
      const clampedDay = Math.min(origDay, maxDays);
      newDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    }

    const newId = 'cp_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);

    const newRecord = {
      ...item,
      id: newId,
      date: newDate,
      balance: '',
      sheetRow: null,
      createdAt: Date.now() + i
    };
    newRecord.sheetName = ledgerSheetNameForRecord(newRecord);

    pendingDeletedIds.delete(String(newRecord.id));
    pendingCreatedRecords.set(String(newRecord.id), newRecord);

    newRecords.push(newRecord);
    applyOptimisticSave(newRecord);
  }

  clearLedgerCopyBuffer();
  showLedgerToast(`📋 ${newRecords.length}건의 거래가 ${targetMonth + 1}월 화면으로 복사되었습니다.`);

  enqueueLedgerTask(async () => {
    try {
      for (const record of newRecords) {
        const res = await upsertLedgerSheetRecord(record);
        if (res && res.id) {
          record.id = res.id;
          record.sheetRow = res.sheetRow;
        }
        pendingCreatedRecords.delete(String(record.id));
      }
      if (newRecords.length > 0) {
        refreshLedgerInBackground(newRecords[0]);
      }
    } catch (error) {
      console.error('Background paste sync error:', error);
      showLedgerToast('⚠️ 시트 저장 동기화 지연 중 (로컬 반영 완료)');
    }
  });
}

function clearLedgerCopyBuffer() {
  copiedLedgerRecords = [];
  document.getElementById('ledgerCopyBufferBar')?.classList.add('hidden');
  if (!isLedgerMultiEdit) {
    document.getElementById('ledgerToggleEntryBtn')?.classList.remove('hidden');
    document.getElementById('ledgerMonthlyToggleEntryBtn')?.classList.remove('hidden');
  }
}

function bindLedgerEvents() {
  getLedgerTransactionModal().bind();
  document.getElementById('ledgerToggleEntryBtn')?.addEventListener('click', () => toggleLedgerEntry());
  document.getElementById('ledgerFilterAllBtn')?.addEventListener('click', () => setLedgerFilter('all', 'all'));
  document.getElementById('ledgerPersonFilterToggle')?.addEventListener('click', () => toggleLedgerFilterOptions('person'));
  document.getElementById('ledgerCategoryFilterToggle')?.addEventListener('click', () => toggleLedgerFilterOptions('category'));
  document.getElementById('ledgerFixedFilterBtn')?.addEventListener('click', () => {
    setLedgerFilter(ledgerState.filterType === 'fixed' ? 'all' : 'fixed', ledgerState.filterType === 'fixed' ? 'all' : '고정비');
  });
  document.querySelectorAll('[data-ledger-filter-type]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.ledgerFilterType;
      const value = button.dataset.ledgerFilterValue;
      const isSelected = ledgerState.filterType === type && ledgerState.filterValue === value;
      setLedgerFilter(isSelected ? 'all' : type, isSelected ? 'all' : value);
    });
  });
  document.getElementById('ledgerToggleMultiEditBtn')?.addEventListener('click', toggleLedgerMultiEdit);
  document.getElementById('ledgerBulkCopyBtn')?.addEventListener('click', copySelectedLedgerRecords);
  document.getElementById('ledgerBulkDeleteBtn')?.addEventListener('click', deleteSelectedLedgerRecords);
  document.getElementById('ledgerCancelMultiEditBtn')?.addEventListener('click', () => setLedgerMultiEditMode(false));
  document.getElementById('ledgerBulkPasteBtn')?.addEventListener('click', pasteCopiedLedgerRecords);
  document.getElementById('ledgerClearCopyBtn')?.addEventListener('click', clearLedgerCopyBuffer);

  document.getElementById('ledgerCompanyCardBtn')?.addEventListener('click', () => setLedgerPayment('\uAE30\uC5C5\uCE74\uB4DC', true));
  document.getElementById('ledgerTossBankBtn')?.addEventListener('click', () => setLedgerPayment('\uD1A0\uC2A4\uC740\uD589', true));
  document.getElementById('ledgerBankSourceBtn')?.addEventListener('click', () => setLedgerSource('bank'));
  document.getElementById('ledgerCashSourceBtn')?.addEventListener('click', () => setLedgerSource('cash'));
  document.getElementById('ledgerForecastSourceBtn')?.addEventListener('click', () => setLedgerSource('forecast'));
  document.getElementById('ledgerMonthlyToggleEntryBtn')?.addEventListener('click', () => toggleLedgerEntry());
  getLedgerColorSettings().bind();
  document.getElementById('ledgerReportBtn')?.addEventListener('click', () => {
    renderLedgerReport();
    document.getElementById('ledgerReportOverlay')?.classList.add('active');
  });
  document.getElementById('ledgerReportCloseBtn')?.addEventListener('click', () => document.getElementById('ledgerReportOverlay')?.classList.remove('active'));
  document.getElementById('ledgerReportOverlay')?.addEventListener('click', event => {
    if (event.target.id === 'ledgerReportOverlay') event.currentTarget.classList.remove('active');
  });
  const ledgerPeriodTitle = document.getElementById('ledgerPeriodTitle');
  if (ledgerPeriodTitle) {
    ledgerPeriodTitle.addEventListener('pointerup', openLedgerPeriodPicker);
    ledgerPeriodTitle.addEventListener('click', openLedgerPeriodPicker);
    ledgerPeriodTitle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') openLedgerPeriodPicker(event);
    });
  }
  document.getElementById('ledgerPrevPeriodBtn')?.addEventListener('click', () => moveLedgerPeriod(-1));
  document.getElementById('ledgerNextPeriodBtn')?.addEventListener('click', () => moveLedgerPeriod(1));
  document.getElementById('ledgerLatestBtn')?.addEventListener('click', focusLedgerLatest);
  const refreshLedgerFromSheet = async button => {
    button?.classList.add('is-syncing');
    try {
      await refreshLedgerSheetData(getCurrentLedgerSheetName());
    } finally {
      button?.classList.remove('is-syncing');
    }
  };
  document.getElementById('ledgerRefreshBtn')?.addEventListener('click', event => refreshLedgerFromSheet(event.currentTarget));
  document.getElementById('ledgerSyncBtn')?.addEventListener('click', event => refreshLedgerFromSheet(event.currentTarget));
  bindLedgerListActions({
    onRowClick: handleLedgerRowClick,
    onReorder: reorderLedgerRecord
  });
}

let fundplanView = null;
function getFundplanView() {
  if (!fundplanView) {
    fundplanView = createFundplanView({
      ledgerState,
      colorSettings: state.colorSettings,
      getActiveSourceRecords,
      clampLedgerDate,
      minDate: LEDGER_MIN_DATE,
      setText
    });
  }
  return fundplanView;
}

function renderActiveLedgerPeriod() {
  if (ledgerState.period === 'monthly') {
    renderMonthly();
  } else {
    getFundplanView().render();
  }
  if (isLedgerMultiEdit) {
    updateLedgerSelectionUI();
  }
}

function setLedgerSource(source) {
  ledgerState.source = source;
  if (source === 'cash') ledgerState.payment = '\uD604\uAE08';
  if (source === 'bank') ledgerState.payment = '\uAE30\uC5C5\uC740\uD589';
  if (source === 'forecast') ledgerState.payment = '\uC794\uC561\uC804\uB9DD';
  if (ledgerState.period !== 'monthly') ledgerState.period = 'all';

  setText('ledgerAllViewBtn', '\uC804\uCCB4');
  document.getElementById('ledgerSubnav')?.classList.remove('hidden');
  document.getElementById('ledgerCardNavigator')?.classList.remove('hidden');
  document.getElementById('ledgerPersonSwitch')?.classList.remove('hidden');
  document.getElementById('ledgerSyncBtn')?.classList.remove('hidden');
  document.getElementById('ledgerRefreshBtn')?.classList.remove('hidden');
  document.getElementById('ledgerMonthlyWrapper')?.classList.toggle('hidden', ledgerState.period !== 'monthly');
  document.getElementById('fundplanAllTimeWrapper')?.classList.toggle('hidden', ledgerState.period === 'monthly');
  document.getElementById('ledgerCompanyCardBtn')?.classList.toggle('active', source === 'card' && ledgerState.payment === '\uAE30\uC5C5\uCE74\uB4DC');
  document.getElementById('ledgerTossBankBtn')?.classList.toggle('active', source === 'card' && ledgerState.payment === '\uD1A0\uC2A4\uC740\uD589');
  document.getElementById('ledgerBankSourceBtn')?.classList.toggle('active', source === 'bank');
  document.getElementById('ledgerCashSourceBtn')?.classList.toggle('active', source === 'cash');
  document.getElementById('ledgerForecastSourceBtn')?.classList.toggle('active', source === 'forecast');
  document.getElementById('ledgerToggleEntryBtn')?.classList.toggle('hidden', !['card', 'cash', 'bank'].includes(source));
  document.getElementById('ledgerMonthlyToggleEntryBtn')?.classList.toggle('hidden', !['card', 'cash', 'bank'].includes(source));
  syncLedgerWriteControls();
  document.getElementById('ledgerAllViewBtn')?.classList.toggle('active', ledgerState.period !== 'monthly');
  document.getElementById('ledgerMonthlyViewBtn')?.classList.toggle('active', ledgerState.period === 'monthly');
  renderActiveLedgerPeriod();
}

function setLedgerPeriod(period) {
  ledgerState.period = period === 'monthly' ? 'monthly' : 'all';
  document.getElementById('ledgerMonthlyWrapper')?.classList.toggle('hidden', ledgerState.period !== 'monthly');
  document.getElementById('fundplanAllTimeWrapper')?.classList.toggle('hidden', ledgerState.period === 'monthly');
  document.getElementById('ledgerAllViewBtn')?.classList.toggle('active', ledgerState.period !== 'monthly');
  document.getElementById('ledgerMonthlyViewBtn')?.classList.toggle('active', ledgerState.period === 'monthly');
  renderActiveLedgerPeriod();
}

function showLedger() {
  document.querySelector('.app-container')?.classList.add('ledger-active');
  document.getElementById('ledgerViewWrapper')?.classList.remove('hidden');
  document.getElementById('weeklyViewWrapper')?.classList.add('hidden');
  document.getElementById('monthlyViewWrapper')?.classList.add('hidden');
  document.getElementById('scheduleSubnav')?.classList.add('hidden');
  document.getElementById('ledgerSourceSwitch')?.classList.remove('hidden');
  document.getElementById('scheduleMenuBtn')?.classList.remove('active');
  document.getElementById('ledgerMenuBtn')?.classList.add('active');
  setLedgerSource(ledgerState.source);
}

function showSchedule() {
  document.querySelector('.app-container')?.classList.remove('ledger-active');
  document.getElementById('ledgerViewWrapper')?.classList.add('hidden');
  document.getElementById('scheduleSubnav')?.classList.remove('hidden');
  document.getElementById('ledgerSubnav')?.classList.add('hidden');
  document.getElementById('ledgerSourceSwitch')?.classList.add('hidden');
  document.getElementById('ledgerCardNavigator')?.classList.add('hidden');
  document.getElementById('ledgerSyncBtn')?.classList.add('hidden');
  document.getElementById('ledgerRefreshBtn')?.classList.add('hidden');
  document.getElementById('ledgerPersonSwitch')?.classList.add('hidden');
  document.getElementById('scheduleMenuBtn')?.classList.add('active');
  document.getElementById('ledgerMenuBtn')?.classList.remove('active');
  switchViewModeUI(state.currentView);
}
export function initLedgerView() {
  try {
    loadLedgerSheetSnapshot();
    loadOptionalFundplanRecords();
    refreshLedgerSheetData().catch(e => console.warn('refreshLedgerSheetData warn:', e));
  } catch (e) {
    console.warn('initLedgerView data load warn:', e);
  }

  try {
    bindLedgerEvents();
  } catch (e) {
    console.error('bindLedgerEvents err:', e);
  }

  document.getElementById('scheduleMenuBtn')?.addEventListener('click', showSchedule);
  document.getElementById('ledgerMenuBtn')?.addEventListener('click', showLedger);
  document.getElementById('ledgerAllViewBtn')?.addEventListener('click', () => setLedgerPeriod(ledgerState.source === 'card' ? 'weekly' : 'all')); 
  document.getElementById('ledgerMonthlyViewBtn')?.addEventListener('click', () => setLedgerPeriod('monthly'));

  return { enter: showLedger, leave: showSchedule };
}


function getActiveSourceRecords() {
  if (ledgerState.source === 'card') return getSelectedCardRecords();
  const records = ledgerState.source === 'bank'
    ? importedBankRecords
    : ledgerState.source === 'forecast'
      ? importedForecastRecords
      : importedCashRecords;
  return filterLedgerRecords(records, ledgerState.filterType, ledgerState.filterValue);
}
function getMonthlyRecords() {
  const year = ledgerState.monthCursor.getFullYear();
  const month = ledgerState.monthCursor.getMonth();
  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '\uAE30\uC5C5\uCE74\uB4DC';
  let start;
  let end;
  if (isCompanyCard) {
    if (month === 0) {
      start = new Date(year, 0, 1);
      end = new Date(year, 0, 12);
    } else if (month === 1) {
      start = new Date(year, 0, 1);
      end = new Date(year, 1, 12);
    } else {
      start = new Date(year, month - 1, 13);
      end = new Date(year, month, 12);
    }
  } else {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0);
  }
  const startDate = toIso(start);
  const endDate = toIso(end);
  return getActiveSourceRecords().filter(record => {
    const dStr = normalizeLedgerDate(record.date);
    return dStr >= startDate && dStr <= endDate;
  });
}function renderMonthly() {
  const items = getMonthlyRecords();
  const income = items.filter(x => x.type === 'income').reduce((sum,x) => sum + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((sum,x) => sum + x.amount, 0);
  const cursor = ledgerState.monthCursor;
  setText('ledgerPeriodTitle', cursor.getFullYear() + '.' + String(cursor.getMonth() + 1).padStart(2, '0'));  setText('ledgerMonthlyIncome', formatMoney(income));
  setText('ledgerMonthlyExpense', formatMoney(expense));
  setText('ledgerMonthlyBalance', (income - expense < 0 ? '-' : '') + formatMoney(income - expense));
  renderStatList('ledgerCategoryStats', groupExpenses(items, 'category'));
  renderStatList('ledgerPersonStats', groupExpenses(items, 'person'));
  renderStatList('ledgerPaymentStats', groupExpenses(items, 'payment'));
  renderMonthlyList(items);
}





function renderMonthlyList(items) {
  const sorted = [...items].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  setText('ledgerMonthlyTransactionCount', sorted.length + '\uAC74');

  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '\uAE30\uC5C5\uCE74\uB4DC';
  const thead = document.getElementById('ledgerMonthlyTableHead');
  if (thead) {
    const moneyInLabel = isCompanyCard ? '\uC218\uC785' : '\uC785\uAE08';
    const moneyOutLabel = isCompanyCard ? '\uC9C0\uCD9C' : '\uCD9C\uAE08';
    const balanceLabel = isCompanyCard ? '\uC0AC\uC6A9\uC561' : '\uC794\uC561';
    const useMerged = ['card', 'cash', 'bank'].includes(ledgerState.source);
    thead.replaceWith(createLedgerTableHead(moneyInLabel, moneyOutLabel, useMerged, balanceLabel));
    const newThead = document.querySelector('#ledgerMonthlyTable thead');
    if (newThead) newThead.id = 'ledgerMonthlyTableHead';
  }

  const list = document.getElementById('ledgerMonthlyTransactionList');
  if (!list) return;
  list.replaceChildren();
  if (!sorted.length) {
    appendLedgerEmptyRow(list, ledgerState.payment + '\uC758 \uC774\uBC88 \uB2EC \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');
    return;
  }

  const monthKey = `${ledgerState.monthCursor.getFullYear()}-${String(ledgerState.monthCursor.getMonth() + 1).padStart(2, '0')}`;
  let monthlyExpanded = true;
  const monthRowElements = [];

  const dividerRow = createLedgerMonthDividerRow({
    monthKey,
    isCompanyCard,
    isExpanded: true,
    monthRecords: sorted,
    onToggle: toggleIcon => {
      monthlyExpanded = !monthlyExpanded;
      toggleIcon.textContent = monthlyExpanded ? '\u25BC' : '\u25B6';
      monthRowElements.forEach(r => {
        r.style.display = monthlyExpanded ? '' : 'none';
      });
    }
  });
  list.appendChild(dividerRow);

  const calculatedSorted = recalculateRunningBalances(sorted, isCompanyCard);
  calculatedSorted.forEach(item => {
    const prevCount = list.children.length;
    renderTransactionRow(item, 'ledgerMonthlyTransactionList', { source: ledgerState.source, colorSettings: state.colorSettings });
    const newCount = list.children.length;
    for (let i = prevCount; i < newCount; i++) {
      monthRowElements.push(list.children[i]);
    }
  });
}

function getReportRecords() {
  return ledgerState.period === 'monthly' ? getMonthlyRecords() : (ledgerState.source === 'card' ? getWeeklyRecords() : getActiveSourceRecords());
}
function renderLedgerReport() {
  const items = getReportRecords();
  const income = items.filter(x => x.type === 'income').reduce((sum,x) => sum + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((sum,x) => sum + x.amount, 0);
  const period = document.getElementById('ledgerPeriodTitle')?.textContent;
  const sourceLabel = ledgerState.source === 'forecast' ? '잔액전망' : ledgerState.payment;
  setText('ledgerReportPeriod', sourceLabel + '  ' + (period || '\uC120\uD0DD \uAE30\uAC04'));
  setText('ledgerReportIncome', formatMoney(income));
  setText('ledgerReportExpense', formatMoney(expense));
  setText('ledgerReportBalance', (income - expense < 0 ? '-' : '') + formatMoney(income - expense));
  renderStatList('ledgerReportCategoryStats', groupExpenses(items, 'category'));
  renderStatList('ledgerReportPersonStats', groupExpenses(items, 'person'));
  renderStatList('ledgerReportPaymentStats', groupExpenses(items, 'payment'));
}













































