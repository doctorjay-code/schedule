import { state, pastelPalette, saveColorSettings, defaultColorSettings } from '../../services/schedule/state.js';
import { switchViewModeUI } from '../schedule/render.js';
import { openWeekSelectModal } from '../schedule/modals/week-picker.js';
import { openMonthSelectModal } from '../schedule/modals/month-picker.js';
import { startOfWeek, toIso, escapeHtml, formatMoney, getLedgerTagColor, recalculateRunningBalances, normalizeLedgerDate, compareLedgerRecords } from './ledger-utils.js';
import { filterLedgerRecords } from './card.js';
import { normalizeFundplanRows } from './fundplan.js';
import { groupExpenses, renderStatList } from './stats.js';
import { appendLedgerEmptyRow, createLedgerTableHead, formatLedgerScheduleDate, renderTransactionRow } from './transaction-view.js';
import { createLedgerTransactionModal } from './modals/transaction-modal.js';
import { createLedgerColorSettings } from './modals/color-settings.js';
import { bindLedgerListActions } from './ledger-events.js';
import { createFundplanView, createLedgerMonthDividerRow } from './fundplan-view.js';
import { fetchLedgerData, fetchLedgerSheetData, upsertLedgerRecord, upsertLedgerSheetRecord, deleteLedgerRecord, deleteLedgerSheetRecord, reorderLedgerRecords, reorderLedgerSheetRecords, deleteLedgerRecordsBatch, insertLedgerRecordsBatch } from '../../services/ledger/ledger-api.js';
import { registerRealtimeCallbacks } from '../../services/shared/supabase-realtime.js';
import { showLedgerToast, findLedgerRecordById, executeLedgerCopy, executeLedgerDelete, executeLedgerPaste } from './ledger-clipboard.js';

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
  const isWritableTab = ['card', 'cash', 'bank'].includes(ledgerState.source);
  if (!entryButton) return;
  entryButton.disabled = !isWritableTab;
  entryButton.title = isWritableTab ? '새 거래를 등록합니다.' : '잔액전망은 읽기 전용입니다.';
}

function applyLedgerDataSources() {
  loadRecords();
  syncLedgerWriteControls();
  renderActiveLedgerPeriod();
}

function loadLedgerSheetSnapshot() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(LEDGER_SHEET_SNAPSHOT_KEY) || 'null');
    if (!snapshot) return false;
    
    if (snapshot.sources && typeof snapshot.sources === 'object') {
      ledgerDataSources.card = Array.isArray(snapshot.sources.card) ? snapshot.sources.card : [];
      ledgerDataSources.cash = Array.isArray(snapshot.sources.cash) ? snapshot.sources.cash : [];
      ledgerDataSources.bank = Array.isArray(snapshot.sources.bank) ? snapshot.sources.bank : [];
      ledgerDataSources.forecast = Array.isArray(snapshot.sources.forecast) ? snapshot.sources.forecast : [];
    } else {
      ledgerDataSources.card = Array.isArray(snapshot.ledgerRecords) ? snapshot.ledgerRecords : [];
      ledgerDataSources.cash = Array.isArray(snapshot.cashRecords) ? snapshot.cashRecords : [];
      ledgerDataSources.bank = Array.isArray(snapshot.bankRecords) ? snapshot.bankRecords : [];
      ledgerDataSources.forecast = Array.isArray(snapshot.forecastRecords) ? snapshot.forecastRecords : [];
    }

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
    version: 3,
    fetchedAt,
    counts: ledgerSheetCounts,
    sources: ledgerDataSources,
    ledgerRecords: ledgerDataSources.card,
    cashRecords: ledgerDataSources.cash,
    bankRecords: ledgerDataSources.bank,
    forecastRecords: ledgerDataSources.forecast
  };
  localStorage.setItem(LEDGER_SHEET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  ledgerSnapshotFetchedAt = fetchedAt;
}

function getCurrentLedgerSheetName() {
  if (ledgerState.source === 'card') return LEDGER_SHEET_BY_PAYMENT[ledgerState.payment] || '';
  if (ledgerState.source === 'cash') return '현금';
  if (ledgerState.source === 'bank') return '기업은행';
  if (ledgerState.source === 'forecast') return '잔액전망';
  return '';
}

async function refreshLedgerSheetData() {
  setLedgerSyncStatus('loading');
  try {
    const { records, counts, fetchedAt } = await fetchLedgerData(fetch);
    ledgerDataSources.card = records.filter(record => ['기업카드', '토스은행'].includes(record.sheetName));
    ledgerDataSources.cash = records.filter(record => record.sheetName === '현금');
    ledgerDataSources.bank = records.filter(record => record.sheetName === '기업은행');
    ledgerDataSources.forecast = records.filter(record => record.sheetName === '잔액전망');
    ledgerSheetCounts = counts;
    ledgerDataState = 'fresh';
    ledgerLiveConnected = true;
    applyLedgerDataSources();
    saveLedgerSheetSnapshot(fetchedAt || new Date().toISOString());
    setLedgerSyncStatus('saved');
    return true;
  } catch (error) {
    const hasSnapshot = Boolean(ledgerDataSources.card.length || ledgerDataSources.cash.length);
    ledgerLiveConnected = false;
    ledgerDataState = hasSnapshot ? 'cached' : 'error';
    if (!hasSnapshot) setText('ledgerDataBadge', '연결 확인 필요');
    syncLedgerWriteControls();
    setLedgerSyncStatus('offline');
    return false;
  }
}

function loadRecords() {
  ledgerState.records = [...ledgerDataSources.card, ...ledgerDataSources.cash, ...ledgerDataSources.bank];
  const sheetTotal = ledgerSheetCounts ? Object.values(ledgerSheetCounts).reduce((sum, count) => sum + count, 0) : 0;
  const snapshotLabel = ledgerSnapshotFetchedAt ? ` · ${new Date(ledgerSnapshotFetchedAt).toLocaleTimeString('ko-KR')}` : '';
  setText('ledgerDataBadge', ledgerSheetCounts ? `실시간 DB ${sheetTotal}건${snapshotLabel}` : 'DB 연결 중');
  if (ledgerState.source === 'card') {
    setLedgerPayment(ledgerState.payment, false);
  } else {
    syncLedgerCardButtons();
    renderActiveLedgerPeriod();
  }
}

function getSelectedCardRecords() {
  const cardRecords = ledgerDataSources.card.filter(record => record.payment === ledgerState.payment);
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

  if (fixedButton) {
    if (activeFixed) {
      if (ledgerState.filterValue === 'variable') {
        fixedButton.textContent = '변동비만 ⚪';
        fixedButton.classList.add('active', 'variable-active');
      } else {
        fixedButton.textContent = '고정비만 🟡';
        fixedButton.classList.add('active');
        fixedButton.classList.remove('variable-active');
      }
    } else {
      fixedButton.textContent = '고정비';
      fixedButton.classList.remove('active', 'variable-active');
    }
  }

  if (personButton) personButton.textContent = '사용자';
  if (categoryButton) categoryButton.textContent = '사용처';
  document.querySelectorAll('[data-ledger-filter-type]').forEach(button => {
    button.classList.toggle('active', button.dataset.ledgerFilterType === ledgerState.filterType && button.dataset.ledgerFilterValue === ledgerState.filterValue);
  });

  const paymentBtnMap = [
    { id: 'ledgerCashSourceBtn', name: '현금', isActive: ledgerState.source === 'cash' },
    { id: 'ledgerCompanyCardBtn', name: '기업카드', isActive: ledgerState.source === 'card' && ledgerState.payment === '기업카드' },
    { id: 'ledgerTossBankBtn', name: '토스은행', isActive: ledgerState.source === 'card' && ledgerState.payment === '토스은행' },
    { id: 'ledgerBankSourceBtn', name: '기업은행', isActive: ledgerState.source === 'bank' },
    { id: 'ledgerForecastSourceBtn', name: '잔액전망', isActive: ledgerState.source === 'forecast' }
  ];

  paymentBtnMap.forEach(({ id, name, isActive }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', isActive);
    const color = getLedgerTagColor(state.colorSettings, 'payment', name);
    btn.style.setProperty('--source-bg', color);
    btn.style.backgroundColor = color;
    btn.style.color = '#0F172A';
    if (isActive) {
      btn.style.border = '2px solid #0F172A';
      btn.style.fontWeight = '800';
      btn.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.2)';
      btn.style.transform = 'scale(1.02)';
    } else {
      btn.style.border = '1.5px solid rgba(15, 23, 42, 0.15)';
      btn.style.fontWeight = '600';
      btn.style.boxShadow = 'none';
      btn.style.transform = 'scale(1)';
    }
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
    .sort(compareLedgerRecords);
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function renderWeekly() {
  const items = ledgerState.period === 'all' ? [...getSelectedCardRecords()].sort(compareLedgerRecords) : getWeeklyRecords();
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
  return findLedgerRecordById(id, { ledgerState, ledgerDataSources });
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

function reorderLedgerRecord(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;

  const currentSheetName = getCurrentLedgerSheetName();
  showLedgerToast('↕️ 거래 순서가 저장되었습니다.');

  // 1. 현재 결제수단에 속한 모든 거래에 대해 고유한 orderIndex(10, 20, 30...) 부여
  const idMap = new Map();
  orderedIds.forEach((id, idx) => idMap.set(String(id), (idx + 1) * 10));

  const updateOrderInList = (list) => {
    if (!Array.isArray(list)) return list;
    return list.map(item => {
      if (idMap.has(String(item.id))) {
        return { ...item, orderIndex: idMap.get(String(item.id)) };
      }
      return item;
    }).sort(compareLedgerRecords);
  };

  for (const key of Object.keys(ledgerDataSources)) {
    ledgerDataSources[key] = updateOrderInList(ledgerDataSources[key]);
  }

  applyLedgerDataSources();
  saveLedgerSheetSnapshot();

  // 2. Supabase DB 비동기 초고속 일괄 영구 저장
  if (currentSheetName && currentSheetName !== '잔액전망') {
    reorderLedgerSheetRecords(currentSheetName, orderedIds).catch(err => {
      console.error('Supabase reorder sync error:', err);
    });
  }
}

function upsertLocalRecord(records, record) {
  const nextRecord = { ...record, sheetName: ledgerSheetNameForRecord(record), source: 'supabase' };
  const list = records || [];
  const index = list.findIndex(item => String(item.id) === String(nextRecord.id));
  let updatedList;
  if (index !== -1) {
    updatedList = list.map(item => String(item.id) === String(nextRecord.id) ? nextRecord : item);
  } else {
    const nextList = [...list, nextRecord];
    updatedList = nextList.sort(compareLedgerRecords);
  }
  return updatedList;
}

function applyOptimisticSave(record) {
  const isCash = record.payment === '현금' || record.sheetName === '현금';
  const isBank = record.payment === '기업은행' || record.sheetName === '기업은행';
  const isForecast = record.payment === '잔액전망' || record.sheetName === '잔액전망';
  const targetKey = isCash ? 'cash' : isBank ? 'bank' : isForecast ? 'forecast' : 'card';

  for (const key of Object.keys(ledgerDataSources)) {
    if (key !== targetKey) {
      ledgerDataSources[key] = ledgerDataSources[key].filter(item => String(item.id) !== String(record.id));
    }
  }

  ledgerDataSources[targetKey] = upsertLocalRecord(ledgerDataSources[targetKey], record);

  applyLedgerDataSources();
  if (ledgerState.source === 'card') setLedgerPayment(record.payment, false);
}

function applyOptimisticDelete(record) {
  for (const key of Object.keys(ledgerDataSources)) {
    ledgerDataSources[key] = ledgerDataSources[key].filter(item => String(item.id) !== String(record.id));
  }
  applyLedgerDataSources();
}

function saveLedgerRecord(form, overrides = {}) {
  const values = { ...Object.fromEntries(new FormData(form).entries()), ...overrides };
  const amount = Number(values.amount);
  if (!values.date || !values.item?.trim() || !Number.isFinite(amount) || amount <= 0) return;

  const isEdit = Boolean(values.ledgerEditId);
  const existing = ledgerState.records.find(record => record.id === values.ledgerEditId);
  
  // 스마트 사용자 추출 & 비고 중복 방지
  const rawMemo = String(values.memo || '').trim();
  const personMatch = rawMemo.match(/콩콩|쥬쥬|지니/);
  const finalPerson = String(values.person || (personMatch ? personMatch[0] : '')).trim();
  const cleanedDetail = rawMemo.replace(/콩콩|쥬쥬|지니/g, '').trim().replace(/\s{2,}/g, ' ');
  const finalMemo = [finalPerson, cleanedDetail].filter(Boolean).join(' ');

  const payment = values.payment || ledgerState.payment || '토스은행';
  const record = {
    ...(existing || {}),
    id: values.ledgerEditId || '',
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

  upsertLedgerSheetRecord(record).then(res => {
    if (res && res.id && record.id !== res.id) {
      record.id = res.id;
    }
  }).catch(error => {
    console.error('Supabase ledger save error:', error);
    showLedgerToast('⚠️ 저장 지연 중 (로컬 반영 완료)');
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

  applyOptimisticDelete(record);
  getLedgerTransactionModal().close();
  showLedgerToast('🗑️ 거래가 삭제되었습니다.');

  if (deletePayload.id) {
    deleteLedgerSheetRecord(deletePayload).catch(error => {
      console.error('Supabase ledger delete error:', error);
    });
  }
}

function toggleLedgerEntry() {
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
      renderLedgerViews: () => {
        syncLedgerCardButtons();
        renderWeekly();
        renderMonthly();
        getFundplanView().render();
      }
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

function getRecordById(id) {
  return findLedgerRecordById(id, { ledgerState, ledgerDataSources });
}

function copySelectedLedgerRecords() {
  copiedLedgerRecords = executeLedgerCopy({
    selectedLedgerIds,
    findRecordFn: getRecordById,
    setMultiEditMode: setLedgerMultiEditMode
  });
}

function deleteSelectedLedgerRecords() {
  executeLedgerDelete({
    selectedLedgerIds,
    findRecordFn: getRecordById,
    applyOptimisticDelete,
    deleteBatchFn: deleteLedgerRecordsBatch,
    setMultiEditMode: setLedgerMultiEditMode
  });
}

function pasteCopiedLedgerRecords() {
  executeLedgerPaste({
    copiedRecords: copiedLedgerRecords,
    ledgerState,
    ledgerSheetNameForRecord,
    applyOptimisticSave,
    insertBatchFn: insertLedgerRecordsBatch,
    onComplete: clearLedgerCopyBuffer
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
    if (ledgerState.filterType !== 'fixed') {
      setLedgerFilter('fixed', 'fixed');
    } else if (ledgerState.filterValue === 'fixed') {
      setLedgerFilter('fixed', 'variable');
    } else {
      setLedgerFilter('all', 'all');
    }
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
      getColorSettings: () => state.colorSettings,
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
  syncLedgerCardButtons();
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
    refreshLedgerSheetData().catch(e => console.warn('refreshLedgerSheetData warn:', e));
    registerRealtimeCallbacks({
      onLedgerChange: () => {
        refreshLedgerSheetData().catch(e => console.warn('Realtime refresh warn:', e));
      }
    });
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
  const records = ledgerDataSources[ledgerState.source] || [];
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
  const sorted = [...items].sort(compareLedgerRecords);
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













































