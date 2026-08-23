import { formatMoney, getLedgerTagColor } from './ledger-utils.js';

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
  const date = new Date(isoDate + 'T00:00:00');
  const dayNames = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];
  return `${date.getMonth() + 1}. ${date.getDate()}.(${dayNames[date.getDay()]})`;
}

export function renderTransactionRow(item, listId = 'ledgerTransactionList', options = {}) {
  const { source = 'card', colorSettings = {} } = options;
  const list = document.getElementById(listId);
  if (!list) return;
  const detailRow = document.createElement('tr');
  detailRow.dataset.ledgerId = item.id;
  const tagRow = document.createElement('tr');
  tagRow.dataset.ledgerId = item.id;
  const isReadOnlySource = source === 'forecast';
  if (isReadOnlySource) {
    detailRow.dataset.ledgerReadOnly = 'true';
    tagRow.dataset.ledgerReadOnly = 'true';
  }
  const dateCell = document.createElement('td');
  dateCell.className = 'cell-date';
  const dateObject = new Date(item.date + 'T00:00:00');
  if (dateObject.getDay() === 0 || dateObject.getDay() === 6) dateCell.classList.add('cell-holiday');
  dateCell.rowSpan = 2;
  dateCell.textContent = formatLedgerScheduleDate(item.date);
  detailRow.appendChild(dateCell);
  const useMergedPaymentColumn = ['card', 'cash', 'bank'].includes(source);
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
    morningCell.appendChild(paymentTag);
  }
  detailRow.appendChild(morningCell);
  const itemCell = document.createElement('td');
  itemCell.colSpan = 2;
  itemCell.style.textAlign = 'left';
  itemCell.style.paddingLeft = '0.5em';
  const title = document.createElement('strong');
  title.textContent = item.item;
  itemCell.appendChild(title);
  detailRow.appendChild(itemCell);
  const memoCell = document.createElement('td');
  memoCell.colSpan = 2;
  memoCell.style.textAlign = 'left';
  memoCell.style.paddingLeft = '0.5em';
  memoCell.textContent = item.memo || '';
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
    const fixedCostTag = makeTag('\uACE0\uC815\uBE44');
    if (fixedCostTag) regularityCell.appendChild(fixedCostTag);
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
  const personTag = makeTag(item.person);
  if (personTag) {
    personTag.style.backgroundColor = getLedgerTagColor(colorSettings, 'person', item.person);
    personCell.appendChild(personTag);
  }
  tagRow.appendChild(personCell);
  const categoryCell = makeDayEndCell();
  const categoryTag = makeTag(item.category);
  if (categoryTag) {
    categoryTag.style.backgroundColor = getLedgerTagColor(colorSettings, 'category', item.category);
    categoryCell.appendChild(categoryTag);
  }
  tagRow.appendChild(categoryCell);
  const incomeCell = makeDayEndCell();
  incomeCell.className += ' ledger-cell-money ledger-cell-income';
  incomeCell.textContent = item.type === 'income' ? formatMoney(item.amount) : '';
  if (item.type === 'income') incomeCell.style.color = '#15803D';
  tagRow.appendChild(incomeCell);
  const expenseCell = makeDayEndCell();
  expenseCell.className += ' ledger-cell-money ledger-cell-expense';
  expenseCell.textContent = item.type === 'expense' ? formatMoney(item.amount) : '';
  if (item.type === 'expense') expenseCell.style.color = '#DC2626';
  tagRow.appendChild(expenseCell);
  const balanceCell = makeDayEndCell();
  balanceCell.className += ' ledger-cell-money ledger-cell-balance';
  const usageAmount = Number(item.balance);
  balanceCell.textContent = Number.isFinite(usageAmount)
    ? `${usageAmount < 0 ? '-' : ''}${formatMoney(usageAmount)}`
    : '';
  tagRow.appendChild(balanceCell);
  list.appendChild(detailRow);
  list.appendChild(tagRow);
}