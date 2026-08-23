import { state, pastelPalette, saveColorSettings, defaultColorSettings } from '../../services/schedule/state.js';
import { switchViewModeUI } from '../schedule/render.js';
import { openWeekSelectModal } from '../schedule/modals/week-picker.js';
import { openMonthSelectModal } from '../schedule/modals/month-picker.js';
import { startOfWeek, toIso, escapeHtml, formatMoney, getLedgerTagColor } from './ledger-utils.js';
import { filterLedgerRecords } from './card.js';
import { normalizeFundplanRows } from './fundplan.js';
import { groupExpenses, renderStatList } from './stats.js';
import { appendLedgerEmptyRow, createLedgerTableHead, formatLedgerScheduleDate, renderTransactionRow } from './transaction-view.js';
import { createLedgerTransactionModal } from './modals/transaction-modal.js';
import { createLedgerColorSettings } from './modals/color-settings.js';
import { bindLedgerListActions } from './ledger-events.js';
import { createFundplanView, createLedgerMonthDividerRow } from './fundplan-view.js?v=20260823_7';
import { fetchLedgerSheetData, upsertLedgerSheetRecord, deleteLedgerSheetRecord } from '../../services/ledger/ledger-api.js?v=20260823_7';

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

function applyLedgerDataSources() {
  importedLedgerRecords = sheetLedgerRecords || [];
  importedBankRecords = sheetBankRecords || fallbackBankRecords;
  importedCashRecords = sheetCashRecords || [];
  importedForecastRecords = sheetForecastRecords || [];
  loadRecords();
  syncLedgerWriteControls();
  if (ledgerState.source !== 'card') renderActiveLedgerPeriod();
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
      if (selectedSheet === '현금') {
        sheetCashRecords = records;
      } else if (selectedSheet === '기업은행') {
        sheetBankRecords = records;
      } else if (selectedSheet === '잔액전망') {
        sheetForecastRecords = records;
      } else {
        sheetLedgerRecords = [...preservedLedgerRecords, ...records];
      }
      ledgerSheetCounts = { ...(ledgerSheetCounts || {}), ...counts };
    } else {
      sheetLedgerRecords = records.filter(record => ['기업카드', '토스은행'].includes(record.sheetName));
      sheetCashRecords = records.filter(record => record.sheetName === '현금');
      sheetBankRecords = records.filter(record => record.sheetName === '기업은행');
      sheetForecastRecords = records.filter(record => record.sheetName === '잔액전망');
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
  const date = new Date(record.date + 'T00:00:00');
  return date >= ledgerState.weekStart && date <= getWeekEnd();
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
  items.forEach(item => renderTransactionRow(item, 'ledgerTransactionList', { source: ledgerState.source, colorSettings: state.colorSettings }));
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

function upsertLocalRecord(records, record) {
  const nextRecord = { ...record, sheetName: ledgerSheetNameForRecord(record), source: 'google-sheets' };
  const index = records.findIndex(item => item.id === nextRecord.id);
  return index === -1
    ? [...records, nextRecord]
    : records.map(item => item.id === nextRecord.id ? nextRecord : item);
}

function applyOptimisticSave(record) {
  const withoutRecord = rows => (rows || []).filter(item => item.id !== record.id);
  sheetLedgerRecords = withoutRecord(sheetLedgerRecords);
  sheetCashRecords = withoutRecord(sheetCashRecords);
  sheetBankRecords = withoutRecord(sheetBankRecords);
  if (record.payment === '현금' || record.sheetName === '현금') {
    sheetCashRecords = upsertLocalRecord(sheetCashRecords, record);
  } else if (record.payment === '기업은행' || record.sheetName === '기업은행') {
    sheetBankRecords = upsertLocalRecord(sheetBankRecords, record);
  } else {
    sheetLedgerRecords = upsertLocalRecord(sheetLedgerRecords, record);
  }
  applyLedgerDataSources();
  if (ledgerState.source === 'card') setLedgerPayment(record.payment, true);
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
  refreshLedgerSheetData(ledgerSheetNameForRecord(record)).catch(() => {});
}
async function saveLedgerRecord(form, overrides = {}) {
  const values = { ...Object.fromEntries(new FormData(form).entries()), ...overrides };
  const amount = Number(values.amount);
  if (!values.date || !values.item?.trim() || !Number.isFinite(amount) || amount <= 0) return;
  if (!ledgerLiveConnected) {
    alert('시트 연결이 확인된 뒤에 거래를 저장할 수 있습니다.');
    return;
  }

  const existing = ledgerState.records.find(record => record.id === values.ledgerEditId);
  const memo = (values.memo || '').trim();
  const personMatch = memo.match(/콩콩|쥬쥬|지니/);
  const record = {
    ...(existing || {}),
    id: values.ledgerEditId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
    date: values.date,
    type: values.type,
    amount,
    payment: values.payment,
    item: values.item.trim(),
    person: personMatch ? personMatch[0] : '기타',
    category: values.category,
    fixedCost: values.fixedCost === '\uACE0\uC815\uBE44' ? values.fixedCost : '',
    memo,
    createdAt: existing?.createdAt ?? Date.now()
  };
  const snapshot = captureLedgerSheetState();

  applyOptimisticSave(record);
  getLedgerTransactionModal().close();
  try {
    await upsertLedgerSheetRecord(record);
    refreshLedgerInBackground(record);
  } catch (error) {
    restoreLedgerSheetState(snapshot);
    alert(error?.message || '거래를 시트에 저장하지 못했습니다.');
  }
}

async function deleteRecord(id) {
  const record = ledgerState.records.find(item => item.id === id);
  if (!record || !confirm('\uC774 \uAC70\uB798\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?')) return;
  if (!ledgerLiveConnected) {
    alert('시트 연결이 확인된 뒤에 거래를 삭제할 수 있습니다.');
    return;
  }
  const snapshot = captureLedgerSheetState();

  applyOptimisticDelete(record);
  getLedgerTransactionModal().close();
  try {
    await deleteLedgerSheetRecord(record);
    refreshLedgerInBackground(record);
  } catch (error) {
    restoreLedgerSheetState(snapshot);
    alert(error?.message || '거래를 시트에서 삭제하지 못했습니다.');
  }
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
    onOpen: id => getLedgerTransactionModal().open(id)
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
    return;
  }
  getFundplanView().render();
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
  loadLedgerSheetSnapshot();
  loadOptionalFundplanRecords();
  refreshLedgerSheetData();
  bindLedgerEvents();
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
  const start = isCompanyCard ? new Date(year, month - 1, 13) : new Date(year, month, 1);
  const end = isCompanyCard ? new Date(year, month, 12) : new Date(year, month + 1, 0);
  const startDate = toIso(start);
  const endDate = toIso(end);
  return getActiveSourceRecords().filter(record => record.date >= startDate && record.date <= endDate);
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

  sorted.forEach(item => {
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













































