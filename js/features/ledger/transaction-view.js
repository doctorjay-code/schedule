import { formatMoney, getLedgerTagColor, normalizeLedgerDate } from './ledger-utils.js';

// Transaction table and row rendering responsibility.
export function appendLedgerEmptyRow(list, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.className = 'ledger-empty-list ledger-empty-table-cell';
  cell.colSpan = 7;
  cell.textContent = message;
  row.appendChild(cell);
  list.appendChild(row);
}

export function createLedgerTableHead(incomeLabel = '\uC218\uC785', expenseLabel = '\uC9C0\uCD9C', useMergedPaymentColumn = true, balanceLabel = '\uC794\uC561') {
  const thead = document.createElement('thead');
  const row = document.createElement('tr');
  const labels = ['\uB0A0\uC9DC/\uC694\uC77C', useMergedPaymentColumn ? '\uC218\uB2E8' : '\uC2DC\uAC04', useMergedPaymentColumn ? '\uC0AC\uC6A9\uC790' : '\uAD6C\uBD84', useMergedPaymentColumn ? '\uC0AC\uC6A9\uCC98' : '\uBD84\uB958', incomeLabel, expenseLabel, balanceLabel];
  const classes = ['col-date', 'col-time', 'col-region', 'col-clinic', 'col-trans', 'col-hr', 'col-ot'];
  labels.forEach((label, index) => {
    const cell = document.createElement('th');
    cell.className = classes[index];
    cell.textContent = label;
    row.appendChild(cell);
  });
  thead.appendChild(row);
  return thead;
}

export function formatLedgerScheduleDate(isoDate) {
  const safeDateStr = normalizeLedgerDate(isoDate);
  const parts = safeDateStr.split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    const dt = new Date(y, m - 1, d);
    const dayNames = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];
    return `${m}. ${d}.(${dayNames[dt.getDay()] || ''})`;
  }
  return safeDateStr;
}

export function renderTransactionRow(item, listTarget = 'fundplanAllTimeList', options = {}) {
  let targetContainer = null;
  let resolvedOptions = options;

  if (listTarget && typeof listTarget === 'object' && !listTarget.nodeType) {
    resolvedOptions = listTarget;
    targetContainer = null;
  } else if (typeof listTarget === 'string') {
    targetContainer = document.getElementById(listTarget) || document.getElementById('fundplanAllTimeList') || document.getElementById('ledgerTransactionList');
  } else if (listTarget && listTarget.nodeType) {
    targetContainer = listTarget;
  }

  const { source = 'card', colorSettings = {}, onRowClick = null, isSelected = false, multiEditMode = false } = resolvedOptions;
  const detailRow = document.createElement('tr');
  detailRow.className = 'schedule-row schedule-row-detail';
  detailRow.dataset.ledgerId = item.id;
  if (isSelected) detailRow.classList.add('selected-row');
  if (typeof onRowClick === 'function') {
    detailRow.addEventListener('click', () => onRowClick(item));
  }
  const tagRow = document.createElement('tr');
  tagRow.className = 'schedule-row schedule-row-tag cell-day-end-border';
  tagRow.dataset.ledgerId = item.id;
  if (isSelected) tagRow.classList.add('selected-row');
  if (typeof onRowClick === 'function') {
    tagRow.addEventListener('click', () => onRowClick(item));
  }

  const isFixed = item.fixedCost === '고정비' || item.fixedCost === '고정' || (item.fixedCost && item.fixedCost !== 'false');
  if (isFixed) {
    detailRow.classList.add('ledger-fixed-row');
    tagRow.classList.add('ledger-fixed-row');
  }
  if (item.isAggregate) {
    detailRow.classList.add('ledger-aggregate-row');
    tagRow.classList.add('ledger-aggregate-row');
    detailRow.dataset.ledgerReadOnly = 'true';
    tagRow.dataset.ledgerReadOnly = 'true';
  }
  if (item.isSubDetail) {
    detailRow.classList.add('ledger-subdetail-row');
    tagRow.classList.add('ledger-subdetail-row');
  }

  const dateCell = document.createElement('td');
  dateCell.className = 'cell-date';
  const dateObject = new Date(item.date + 'T00:00:00');
  if (dateObject.getDay() === 0 || dateObject.getDay() === 6) dateCell.classList.add('cell-holiday');
  dateCell.rowSpan = 2;
  if (item.isSubDetail) {
    dateCell.innerHTML = `<span class="ledger-subdetail-indicator">↳</span>${formatLedgerScheduleDate(item.date)}`;
  } else {
    dateCell.textContent = formatLedgerScheduleDate(item.date);
  }
  detailRow.appendChild(dateCell);
  const useMergedPaymentColumn = ['card', 'cash', 'bank', 'forecast'].includes(source);
  const morningCell = document.createElement('td');
  morningCell.className = 'cell-time';
  if (useMergedPaymentColumn) {
    morningCell.rowSpan = 2;
    morningCell.classList.add('ledger-payment-cell');
    const paymentTag = document.createElement('span');
    paymentTag.className = 'ledger-bottom-tag ledger-payment-tag';
    const paymentText = String(item.payment || '').trim();
    if (paymentText.length >= 4 && !paymentText.includes(' ')) {
      const mid = Math.ceil(paymentText.length / 2);
      paymentTag.innerHTML = `${paymentText.slice(0, mid)}<br>${paymentText.slice(mid)}`;
    } else if (paymentText.includes(' ')) {
      paymentTag.innerHTML = paymentText.split(' ').join('<br>');
    } else {
      paymentTag.textContent = paymentText;
    }
    const paymentColor = getLedgerTagColor(colorSettings, 'payment', paymentText);
    paymentTag.style.backgroundColor = paymentColor;
    paymentTag.style.color = '#0F172A';
    morningCell.appendChild(paymentTag);
  }
  detailRow.appendChild(morningCell);
  const itemCell = document.createElement('td');
  itemCell.colSpan = 2;
  itemCell.style.textAlign = 'left';
  itemCell.style.paddingLeft = item.isSubDetail ? '1.0em' : '0.5em';
  const title = document.createElement('strong');
  if (item.isAggregate || item.hasCardAccordion) {
    itemCell.classList.add('ledger-accordion-toggle-cell');
    itemCell.style.cursor = 'pointer';
    itemCell.title = '클릭하여 세부 거래 내역 펼치기/접기';
    title.innerHTML = `<span class="ledger-accordion-icon" data-ledger-toggle-id="${item.id}" style="margin-right:4px;font-size:10px;color:#6366F1;display:inline-block;cursor:pointer;font-weight:bold;user-select:none;" title="세부내역 펼치기/접기">▶</span>${item.item || ''}`;
  } else if (item.isSubDetail) {
    title.innerHTML = `<span style="color:#6366F1;margin-right:4px;font-weight:900;">↳</span>${item.item || ''}`;
  } else {
    title.textContent = item.item || '';
  }
  itemCell.appendChild(title);
  detailRow.appendChild(itemCell);
  const memoCell = document.createElement('td');
  memoCell.colSpan = 2;
  memoCell.style.textAlign = 'left';
  memoCell.style.paddingLeft = '0.5em';
  memoCell.textContent = item.memo || '';
  if (item.isAggregate || item.hasCardAccordion) {
    memoCell.classList.add('ledger-accordion-toggle-cell');
    memoCell.style.cursor = 'pointer';
    memoCell.title = '클릭하여 세부 거래 내역 펼치기/접기';
  }
  detailRow.appendChild(memoCell);
  const makeTag = value => {
    const text = String(value || '').trim();
    if (!text) return null;
    const tag = document.createElement('span');
    tag.className = 'ledger-bottom-tag';
    tag.textContent = text;
    return tag;
  };
  const regularityCell = document.createElement('td');
  regularityCell.className = 'ledger-regularity-cell';
  const isFixedCost = String(item.fixedCost || '').trim() === '\uACE0\uC815\uBE44';
  if (useMergedPaymentColumn && isFixedCost) {
    const fixedCostTag = makeTag('고정비');
    if (fixedCostTag) {
      fixedCostTag.classList.add('ledger-fixed-tag');
      regularityCell.appendChild(fixedCostTag);
    }
  } else if (!useMergedPaymentColumn) {
    const paymentTag = makeTag(item.payment);
    if (paymentTag) regularityCell.appendChild(paymentTag);
  }
  detailRow.appendChild(regularityCell);
  const makeDayEndCell = () => {
    const cell = document.createElement('td');
    cell.className = 'cell-day-end-border';
    return cell;
  };
  if (!useMergedPaymentColumn) {
    const afternoonCell = makeDayEndCell();
    afternoonCell.classList.add('cell-time');
    afternoonCell.textContent = '';
    tagRow.appendChild(afternoonCell);
  }
  const personCell = makeDayEndCell();
  const rawPerson = item.isAggregate ? (item.person || '') : (item.person || item.user_name || '기타');
  const personText = String(rawPerson).trim();
  const personTag = makeTag(personText);
  if (personTag) {
    personTag.style.backgroundColor = getLedgerTagColor(colorSettings, 'person', personText);
    personTag.style.color = '#0F172A';
    personCell.appendChild(personTag);
  }
  tagRow.appendChild(personCell);

  const categoryCell = makeDayEndCell();
  const categoryText = String(item.category || '').trim();
  const categoryTag = makeTag(categoryText);
  if (categoryTag) {
    categoryTag.style.backgroundColor = getLedgerTagColor(colorSettings, 'category', categoryText);
    categoryTag.style.color = '#0F172A';
    categoryCell.appendChild(categoryTag);
  }
  tagRow.appendChild(categoryCell);
  const incomeCell = makeDayEndCell();
  incomeCell.className += ' ledger-cell-money ledger-cell-income';
  const incVal = item.incomeAmount !== undefined ? item.incomeAmount : (item.type === 'income' ? item.amount : 0);
  incomeCell.textContent = incVal > 0 ? formatMoney(incVal) : '';
  if (incVal > 0) incomeCell.style.color = '#15803D';
  tagRow.appendChild(incomeCell);

  const expenseCell = makeDayEndCell();
  expenseCell.className += ' ledger-cell-money ledger-cell-expense';
  const expVal = item.expenseAmount !== undefined ? item.expenseAmount : (item.type === 'expense' ? item.amount : 0);
  expenseCell.textContent = expVal > 0 ? formatMoney(expVal) : '';
  if (expVal > 0) expenseCell.style.color = '#DC2626';
  tagRow.appendChild(expenseCell);
  const balanceCell = makeDayEndCell();
  balanceCell.className += ' ledger-cell-money ledger-cell-balance';
  if (item.isSubDetail) {
    balanceCell.textContent = '';
  } else {
    const usageAmount = Number(item.balance);
    balanceCell.textContent = Number.isFinite(usageAmount)
      ? `${usageAmount < 0 ? '-' : ''}${formatMoney(usageAmount)}`
      : '';
  }
  if (targetContainer) {
    targetContainer.appendChild(detailRow);
    targetContainer.appendChild(tagRow);
  }
  return [detailRow, tagRow];
}