import { state, pastelPalette, saveColorSettings, defaultColorSettings } from './state.js';
import { switchViewModeUI } from './render.js';

let importedLedgerRecords = [];

const LEDGER_STORAGE_KEY = 'schedule_ledger_transactions_v1';
const ledgerState = { period: 'weekly', payment: '토스카드', weekStart: startOfWeek(new Date()), monthCursor: new Date(), records: [] };

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function toIso(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function formatMoney(value) {
  return `₩${Math.abs(Number(value) || 0).toLocaleString('ko-KR')}`;
}

function getLedgerTagColor(field, value) {
  const key = field === 'person' ? 'ledgerPersonColors' : 'ledgerCategoryColors';
  const colors = state.colorSettings?.[key] || {};
  return colors[value] || colors['기타'] || '#F1F5F9';
}

function loadOptionalImportedRecords() {
  import('./ledger-seed.local.js').then(module => {
    importedLedgerRecords = Array.isArray(module.importedLedgerRecords) ? module.importedLedgerRecords : [];
    loadRecords();
  }).catch(() => {
    importedLedgerRecords = [];
  });
}

function loadRecords() {
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEDGER_STORAGE_KEY) || '[]');
    saved = Array.isArray(parsed) ? parsed : [];
  } catch { saved = []; }
  const merged = new Map(importedLedgerRecords.map(record => [record.id, record]));
  saved.forEach(record => merged.set(record.id, record));
  ledgerState.records = Array.from(merged.values());
  setText('ledgerDataBadge', '엑셀 ' + importedLedgerRecords.length + '건 불러옴');
  setLedgerPayment(ledgerState.payment, true);
}

function saveRecords() {
  localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledgerState.records.filter(record => record.source !== 'excel')));
}

function getSelectedCardRecords() {
  return ledgerState.records.filter(record => record.payment === ledgerState.payment);
}

function syncLedgerCardButtons() {
  document.getElementById('ledgerTossCardBtn')?.classList.toggle('active', ledgerState.payment === '토스카드');
  document.getElementById('ledgerCompanyCardBtn')?.classList.toggle('active', ledgerState.payment === '기업카드');
  const payment = document.getElementById('ledgerPayment');
  if (payment) payment.value = ledgerState.payment;
}

function setLedgerPayment(payment, focusLatest = false) {
  ledgerState.payment = payment;
  if (focusLatest) {
    const latest = [...getSelectedCardRecords()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
    if (latest) {
      const latestDate = new Date(latest.date + 'T12:00:00');
      ledgerState.weekStart = startOfWeek(latestDate);
      ledgerState.monthCursor = latestDate;
    }
  }
  syncLedgerCardButtons();
  renderWeekly();
  renderMonthly();
}

function getWeekEnd() {
  const d = new Date(ledgerState.weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}
function inCurrentWeek(record) {
  const date = new Date(record.date + 'T00:00:00');
  return date >= ledgerState.weekStart && date <= getWeekEnd();
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function getWeeklyRecords() {
  return getSelectedCardRecords().filter(inCurrentWeek).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function renderWeekly() {
  const items = getWeeklyRecords();
  const income = items.filter(x => x.type === 'income').reduce((sum,x) => sum + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((sum,x) => sum + x.amount, 0);
  const start = ledgerState.weekStart;
  const end = getWeekEnd();
  const weekNumber = Math.ceil((start.getDate() + new Date(start.getFullYear(), start.getMonth(), 1).getDay()) / 7);
  setText('ledgerPeriodTitle', start.getFullYear() + '년 ' + (start.getMonth() + 1) + '월 ' + weekNumber + '주차');
  setText('ledgerWeeklyIncome', formatMoney(income));
  setText('ledgerWeeklyExpense', formatMoney(expense));
  setText('ledgerWeeklyBalance', (income - expense < 0 ? '-' : '') + formatMoney(income - expense));
  setText('ledgerTransactionCount', items.length + '건');
  const list = document.getElementById('ledgerTransactionList');
  if (!list) return;
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'ledger-empty-list';
    empty.textContent = '이번 주 거래가 없습니다. 위에서 첫 거래를 기록해보세요.';
    list.appendChild(empty);
    return;
  }
  items.forEach(item => renderTransactionRow(item, 'ledgerTransactionList'));
}

function renderTransactionRow(item, listId = 'ledgerTransactionList') {
  const list = document.getElementById(listId);
  if (!list) return;
  const row = document.createElement('article');
  row.className = 'ledger-transaction ' + item.type;
  const main = document.createElement('div');
  main.className = 'ledger-transaction-main';
  const title = document.createElement('strong');
  title.textContent = item.date.slice(5).replace('-', '.') + '  ' + item.item;
  const meta = document.createElement('div');
  meta.className = 'ledger-transaction-meta';
  [['구분', item.person, 'person'], ['분류', item.category, 'category']].filter(([, value]) => Boolean(value)).forEach(([label, value, field]) => {
    const tag = document.createElement('span');
    tag.textContent = label + ' ' + value;
    tag.style.backgroundColor = getLedgerTagColor(field, value);
    meta.appendChild(tag);
  });
  main.append(title, meta);
  if (item.memo) {
    const memo = document.createElement('p');
    memo.className = 'ledger-transaction-memo';
    memo.textContent = item.memo;
    main.appendChild(memo);
  }
  if (Number.isFinite(item.balance)) {
    const balance = document.createElement('strong');
    balance.className = 'ledger-transaction-balance';
    balance.textContent = '엑셀 원본 잔액 ' + (item.balance < 0 ? '-' : '') + formatMoney(item.balance);
    main.appendChild(balance);
  }
  const side = document.createElement('div');
  side.className = 'ledger-transaction-side';
  const amount = document.createElement('b');
  amount.textContent = (item.type === 'income' ? '+' : '-') + formatMoney(item.amount);
  const actions = document.createElement('div');
  if (item.source !== 'excel') {
    ['edit', 'delete'].forEach(action => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.ledgerAction = action; button.dataset.ledgerId = item.id;
      button.textContent = action === 'edit' ? '수정' : '삭제';
      actions.appendChild(button);
    });
  }
  side.append(amount, actions);
  row.append(main, side);
  list.appendChild(row);
}

function resetLedgerForm() {
  const form = document.getElementById('ledgerEntryForm');
  if (form) form.reset();
  const payment = document.getElementById('ledgerPayment');
  if (payment) payment.value = ledgerState.payment;
  setText('ledgerFormState', '새 거래');
  const editId = document.getElementById('ledgerEditId');
  if (editId) editId.value = '';
  const date = document.getElementById('ledgerDate');
  if (date) date.value = toIso(new Date());
  document.getElementById('ledgerSaveBtn')?.classList.remove('editing');
  document.getElementById('ledgerCancelEditBtn')?.classList.add('hidden');
}
function editRecord(id) {
  const record = ledgerState.records.find(x => x.id === id);
  if (!record) return;
  const fields = { ledgerEditId: 'id', ledgerDate: 'date', ledgerType: 'type', ledgerAmount: 'amount', ledgerPayment: 'payment', ledgerItem: 'item', ledgerPerson: 'person', ledgerCategory: 'category', ledgerMemo: 'memo' };
  Object.entries(fields).forEach(([elementId, property]) => {
    const el = document.getElementById(elementId);
    if (el) el.value = record[property] ?? '';
  });
  toggleLedgerEntry(true);
  setText('ledgerFormState', '거래 수정');
  document.getElementById('ledgerSaveBtn')?.classList.add('editing');
  document.getElementById('ledgerCancelEditBtn')?.classList.remove('hidden');
  document.getElementById('ledgerEntryForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveLedgerRecord(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const amount = Number(values.amount);
  if (!values.date || !values.item?.trim() || !Number.isFinite(amount) || amount <= 0) return;
  const record = {
    id: values.ledgerEditId || (Date.now().toString(36) + Math.random().toString(36).slice(2,7)),
    date: values.date, type: values.type, amount, payment: values.payment,
    item: values.item.trim(), person: values.person, category: values.category,
    memo: (values.memo || '').trim(), createdAt: Date.now()
  };
  const index = ledgerState.records.findIndex(x => x.id === record.id);
  if (index >= 0) ledgerState.records[index] = { ...ledgerState.records[index], ...record };
  else ledgerState.records.push(record);
  saveRecords();
  resetLedgerForm();
  renderWeekly();
  renderMonthly();
}
function deleteRecord(id) {
  const record = ledgerState.records.find(x => x.id === id);
  if (!record || !confirm('이 거래를 삭제할까요?')) return;
  ledgerState.records = ledgerState.records.filter(x => x.id !== id);
  saveRecords();
  renderWeekly();
  renderMonthly();
}

function toggleLedgerEntry(forceOpen) {
  const panel = document.getElementById('ledgerEntryPanel');
  const button = document.getElementById('ledgerToggleEntryBtn');
  if (!panel || !button) return;
  const open = forceOpen === true || (forceOpen !== false && panel.classList.contains('hidden'));
  panel.classList.toggle('hidden', !open);
  button.textContent = open ? '− 직접 거래 입력 닫기' : '＋ 직접 거래 입력';
}

function getLedgerColorNames(field) {
  return [...new Set(ledgerState.records.map(record => record[field]).filter(Boolean))].sort();
}

function appendLedgerColorRow(group, field, key, name) {
  const row = document.createElement('div'); row.className = 'ledger-color-row';
  const label = document.createElement('strong'); label.textContent = name;
  const chips = document.createElement('div'); chips.className = 'ledger-color-chips';
  pastelPalette.forEach(color => {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ledger-color-chip'; chip.style.backgroundColor = color;
    chip.setAttribute('aria-label', name + ' 색상');
    if (getLedgerTagColor(field, name) === color) chip.classList.add('active');
    chip.addEventListener('click', () => { state.colorSettings[key] = { ...(state.colorSettings[key] || {}), [name]: color }; saveColorSettings(); renderLedgerColorSettings(); renderWeekly(); renderMonthly(); });
    chips.appendChild(chip);
  });
  row.append(label, chips); group.appendChild(row);
}

function renderLedgerColorSettings() {
  const target = document.getElementById('ledgerColorSettingsContent'); if (!target) return; target.replaceChildren();
  [['구분', 'person', 'ledgerPersonColors'], ['분류', 'category', 'ledgerCategoryColors']].forEach(([title, field, key]) => {
    const group = document.createElement('section'); group.className = 'ledger-color-group';
    const heading = document.createElement('h4'); heading.textContent = title; group.appendChild(heading);
    getLedgerColorNames(field).forEach(name => appendLedgerColorRow(group, field, key, name));
    target.appendChild(group);
  });
}

function bindLedgerEvents() {
  const form = document.getElementById('ledgerEntryForm');
  form?.addEventListener('submit', event => { event.preventDefault(); saveLedgerRecord(form); });
  document.getElementById('ledgerCancelEditBtn')?.addEventListener('click', resetLedgerForm);
  document.getElementById('ledgerToggleEntryBtn')?.addEventListener('click', () => toggleLedgerEntry());
  document.getElementById('ledgerTossCardBtn')?.addEventListener('click', () => setLedgerPayment('토스카드', true));
  document.getElementById('ledgerCompanyCardBtn')?.addEventListener('click', () => setLedgerPayment('기업카드', true));
  document.getElementById('ledgerColorSettingsBtn')?.addEventListener('click', () => { renderLedgerColorSettings(); document.getElementById('ledgerColorOverlay')?.classList.remove('hidden'); });
  document.getElementById('ledgerColorCloseBtn')?.addEventListener('click', () => document.getElementById('ledgerColorOverlay')?.classList.add('hidden'));
  document.getElementById('ledgerColorResetBtn')?.addEventListener('click', () => { state.colorSettings.ledgerPersonColors = { ...defaultColorSettings.ledgerPersonColors }; state.colorSettings.ledgerCategoryColors = { ...defaultColorSettings.ledgerCategoryColors }; saveColorSettings(); renderLedgerColorSettings(); renderWeekly(); renderMonthly(); });
  document.getElementById('ledgerColorOverlay')?.addEventListener('click', event => { if (event.target.id === 'ledgerColorOverlay') event.currentTarget.classList.add('hidden'); });
  document.getElementById('ledgerReportBtn')?.addEventListener('click', () => {
    renderLedgerReport();
    document.getElementById('ledgerReportOverlay')?.classList.remove('hidden');
  });
  document.getElementById('ledgerReportCloseBtn')?.addEventListener('click', () => document.getElementById('ledgerReportOverlay')?.classList.add('hidden'));
  document.getElementById('ledgerReportOverlay')?.addEventListener('click', event => {
    if (event.target.id === 'ledgerReportOverlay') event.currentTarget.classList.add('hidden');
  });
  document.getElementById('ledgerPrevWeekBtn')?.addEventListener('click', () => { ledgerState.weekStart.setDate(ledgerState.weekStart.getDate() - 7); renderWeekly(); });
  document.getElementById('ledgerNextWeekBtn')?.addEventListener('click', () => { ledgerState.weekStart.setDate(ledgerState.weekStart.getDate() + 7); renderWeekly(); });
  document.getElementById('ledgerLatestWeekBtn')?.addEventListener('click', () => setLedgerPayment(ledgerState.payment, true));
  document.getElementById('ledgerPrevMonthBtn')?.addEventListener('click', () => { ledgerState.monthCursor.setMonth(ledgerState.monthCursor.getMonth() - 1); renderMonthly(); });
  document.getElementById('ledgerNextMonthBtn')?.addEventListener('click', () => { ledgerState.monthCursor.setMonth(ledgerState.monthCursor.getMonth() + 1); renderMonthly(); });
  document.getElementById('ledgerLatestMonthBtn')?.addEventListener('click', () => setLedgerPayment(ledgerState.payment, true));
  document.getElementById('ledgerPrevPeriodBtn')?.addEventListener('click', () => { if (ledgerState.period === 'weekly') { ledgerState.weekStart.setDate(ledgerState.weekStart.getDate() - 7); renderWeekly(); } else { ledgerState.monthCursor.setMonth(ledgerState.monthCursor.getMonth() - 1); renderMonthly(); } });
  document.getElementById('ledgerNextPeriodBtn')?.addEventListener('click', () => { if (ledgerState.period === 'weekly') { ledgerState.weekStart.setDate(ledgerState.weekStart.getDate() + 7); renderWeekly(); } else { ledgerState.monthCursor.setMonth(ledgerState.monthCursor.getMonth() + 1); renderMonthly(); } });
  document.getElementById('ledgerLatestBtn')?.addEventListener('click', () => setLedgerPayment(ledgerState.payment, true));
  document.getElementById('ledgerSyncBtn')?.addEventListener('click', () => setLedgerPayment(ledgerState.payment, true));
  document.getElementById('ledgerTransactionList')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-ledger-action]');
    if (!button) return;
    if (button.dataset.ledgerAction === 'edit') editRecord(button.dataset.ledgerId);
    if (button.dataset.ledgerAction === 'delete') deleteRecord(button.dataset.ledgerId);
  });
}

function setLedgerPeriod(period) {
  ledgerState.period = period;
  const weekly = document.getElementById('ledgerWeeklyWrapper');
  const monthly = document.getElementById('ledgerMonthlyWrapper');
  weekly?.classList.toggle('hidden', period !== 'weekly');
  monthly?.classList.toggle('hidden', period !== 'monthly');
  document.getElementById('ledgerWeeklyViewBtn')?.classList.toggle('active', period === 'weekly');
  document.getElementById('ledgerMonthlyViewBtn')?.classList.toggle('active', period === 'monthly');
  if (period === 'weekly') renderWeekly();
  if (period === 'monthly') renderMonthly();
}
function showLedger() {
  document.querySelector('.app-container')?.classList.add('ledger-active');
  document.getElementById('ledgerViewWrapper')?.classList.remove('hidden');
  document.getElementById('weeklyViewWrapper')?.classList.add('hidden');
  document.getElementById('monthlyViewWrapper')?.classList.add('hidden');
  document.getElementById('scheduleSubnav')?.classList.add('hidden');
  document.getElementById('ledgerSubnav')?.classList.remove('hidden');
  document.getElementById('scheduleMenuBtn')?.classList.remove('active');
  document.getElementById('ledgerMenuBtn')?.classList.add('active');
  setLedgerPeriod(ledgerState.period);
}

function showSchedule() {
  document.querySelector('.app-container')?.classList.remove('ledger-active');
  document.getElementById('ledgerViewWrapper')?.classList.add('hidden');
  document.getElementById('scheduleSubnav')?.classList.remove('hidden');
  document.getElementById('ledgerSubnav')?.classList.add('hidden');
  document.getElementById('scheduleMenuBtn')?.classList.add('active');
  document.getElementById('ledgerMenuBtn')?.classList.remove('active');
  switchViewModeUI(state.currentView);
}
export function initLedgerView() {
  loadRecords();
  loadOptionalImportedRecords();
  resetLedgerForm();
  bindLedgerEvents();
  document.getElementById('scheduleMenuBtn')?.addEventListener('click', showSchedule);
  document.getElementById('ledgerMenuBtn')?.addEventListener('click', showLedger);
  document.getElementById('ledgerWeeklyViewBtn')?.addEventListener('click', () => setLedgerPeriod('weekly'));
  document.getElementById('ledgerMonthlyViewBtn')?.addEventListener('click', () => setLedgerPeriod('monthly'));
  return showSchedule;
}


function getMonthlyRecords() {
  const year = ledgerState.monthCursor.getFullYear();
  const month = ledgerState.monthCursor.getMonth();
  return getSelectedCardRecords().filter(record => {
    const date = new Date(record.date + 'T00:00:00');
    return date.getFullYear() === year && date.getMonth() === month;
  });
}
function groupExpenses(records, field) {
  return records.filter(x => x.type === 'expense').reduce((map, item) => {
    const key = item[field] || '기타';
    map[key] = (map[key] || 0) + item.amount;
    return map;
  }, {});
}
function renderStatList(id, values) {
  const target = document.getElementById(id);
  if (!target) return;
  target.replaceChildren();
  const entries = Object.entries(values).sort((a,b) => b[1] - a[1]);
  if (!entries.length) { target.textContent = '이번 달 지출 내역이 없습니다.'; return; }
  entries.forEach(([name, amount]) => {
    const row = document.createElement('div');
    const label = document.createElement('span'); label.textContent = name;
    const value = document.createElement('b'); value.textContent = formatMoney(amount);
    row.append(label, value); target.appendChild(row);
  });
}

function renderMonthly() {
  const items = getMonthlyRecords();
  const income = items.filter(x => x.type === 'income').reduce((sum,x) => sum + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((sum,x) => sum + x.amount, 0);
  const cursor = ledgerState.monthCursor;
  setText('ledgerPeriodTitle', cursor.getFullYear() + '년 ' + (cursor.getMonth()+1) + '월');
  setText('ledgerMonthlyIncome', formatMoney(income));
  setText('ledgerMonthlyExpense', formatMoney(expense));
  setText('ledgerMonthlyBalance', (income - expense < 0 ? '-' : '') + formatMoney(income - expense));
  renderStatList('ledgerCategoryStats', groupExpenses(items, 'category'));
  renderStatList('ledgerPersonStats', groupExpenses(items, 'person'));
  renderStatList('ledgerPaymentStats', groupExpenses(items, 'payment'));
  renderMonthlyList(items);
}





function renderMonthlyList(items) {
  const sorted = [...items].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  setText('ledgerMonthlyTransactionCount', sorted.length + '건');
  const list = document.getElementById('ledgerMonthlyTransactionList');
  if (!list) return;
  list.replaceChildren();
  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'ledger-empty-list';
    empty.textContent = ledgerState.payment + '의 이번 달 거래가 없습니다.';
    list.appendChild(empty);
    return;
  }
  sorted.forEach(item => renderTransactionRow(item, 'ledgerMonthlyTransactionList'));
}

function getReportRecords() {
  return ledgerState.period === 'weekly' ? getWeeklyRecords() : getMonthlyRecords();
}
function renderLedgerReport() {
  const items = getReportRecords();
  const income = items.filter(x => x.type === 'income').reduce((sum,x) => sum + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((sum,x) => sum + x.amount, 0);
  const period = document.getElementById('ledgerPeriodTitle')?.textContent;
  setText('ledgerReportPeriod', ledgerState.payment + '  ' + (period || '선택 기간'));
  setText('ledgerReportIncome', formatMoney(income));
  setText('ledgerReportExpense', formatMoney(expense));
  setText('ledgerReportBalance', (income - expense < 0 ? '-' : '') + formatMoney(income - expense));
  renderStatList('ledgerReportCategoryStats', groupExpenses(items, 'category'));
  renderStatList('ledgerReportPersonStats', groupExpenses(items, 'person'));
  renderStatList('ledgerReportPaymentStats', groupExpenses(items, 'payment'));
}

























