import { toIso, formatMoney } from './ledger-utils.js';
import { createLedgerTableHead, renderTransactionRow } from './transaction-view.js?v=20260823_22';

export function getRecordMonthGroup(record, isCompanyCard) {
  if (!isCompanyCard) {
    return record.date.slice(0, 7);
  }
  const [yearStr, monthStr, dayStr] = record.date.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (day >= 13) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  // 기업카드 1월은 2월행에 합침
  if (month === 1) {
    month = 2;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatMonthTitle(monthKey, isCompanyCard) {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!isCompanyCard) {
    return `${year}년 ${month}월`;
  }
  if (month === 2) {
    return `${year}년 2월 (01.01~02.12)`;
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${year}년 ${month}월 (${String(prevMonth).padStart(2, '0')}.13~${String(month).padStart(2, '0')}.12)`;
}

export function createLedgerMonthDividerRow({
  monthKey,
  isCompanyCard = false,
  isExpanded = true,
  monthRecords = [],
  onToggle = null
}) {
  const monthIncome = monthRecords.filter(x => x.type === 'income').reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const monthExpense = monthRecords.filter(x => x.type === 'expense').reduce((sum, x) => sum + (Number(x.amount) || 0), 0);

  const dividerRow = document.createElement('tr');
  dividerRow.className = 'ledger-month-divider-row';
  dividerRow.dataset.month = monthKey;

  // Column 1~4 (날짜, 수단, 사용자, 사용처)
  const titleCell = document.createElement('td');
  titleCell.colSpan = 4;
  titleCell.className = 'ledger-month-divider-title-cell';

  const content = document.createElement('div');
  content.className = 'ledger-month-divider-content';

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'ledger-month-toggle-icon';
  toggleIcon.textContent = isExpanded ? '\u25BC' : '\u25B6';

  const titleEl = document.createElement('strong');
  titleEl.className = 'ledger-month-title';
  titleEl.textContent = formatMonthTitle(monthKey, isCompanyCard);

  content.appendChild(toggleIcon);
  content.appendChild(titleEl);
  titleCell.appendChild(content);
  dividerRow.appendChild(titleCell);

  // Column 5 (수입 / 입금)
  const incomeCell = document.createElement('td');
  incomeCell.className = 'ledger-month-divider-num-cell ledger-month-income-cell';
  incomeCell.textContent = monthIncome > 0 ? formatMoney(monthIncome) : '';
  dividerRow.appendChild(incomeCell);

  // Column 6 (지출 / 출금)
  const expenseCell = document.createElement('td');
  expenseCell.className = 'ledger-month-divider-num-cell ledger-month-expense-cell';
  expenseCell.textContent = monthExpense > 0 ? formatMoney(monthExpense) : '';
  dividerRow.appendChild(expenseCell);

  // Column 7 (사용액 / 잔액 - 옵션 B: 월별 입출금 차액/순사용액)
  const balanceCell = document.createElement('td');
  balanceCell.className = 'ledger-month-divider-num-cell ledger-month-balance-cell';
  if (isCompanyCard) {
    const netUsage = monthExpense - monthIncome;
    balanceCell.textContent = netUsage !== 0 ? `${netUsage < 0 ? '-' : ''}${formatMoney(netUsage)}` : '';
    if (netUsage < 0) balanceCell.style.color = '#15803D';
  } else {
    const netBalance = monthIncome - monthExpense;
    balanceCell.textContent = netBalance !== 0 ? `${netBalance < 0 ? '-' : ''}${formatMoney(netBalance)}` : '';
    if (netBalance < 0) {
      balanceCell.style.color = '#DC2626';
    } else if (netBalance > 0) {
      balanceCell.style.color = '#15803D';
    }
  }
  dividerRow.appendChild(balanceCell);

  if (onToggle) {
    dividerRow.addEventListener('click', () => {
      onToggle(toggleIcon);
    });
  }

  return dividerRow;
}

// Bank, cash, and card all-time ledger rendering responsibility.
export function createFundplanView({ ledgerState, colorSettings, getActiveSourceRecords, clampLedgerDate, minDate, setText }) {
  const monthExpandedState = {};

  function render() {
    const source = ledgerState.source;
    const isCompanyCard = source === 'card' && ledgerState.payment === '\uAE30\uC5C5\uCE74\uB4DC';
    const records = getActiveSourceRecords().filter(record => new Date(record.date + 'T00:00:00') >= minDate);
    const titles = {
      cash: '\uD604\uAE08 \uB0B4\uC5ED',
      bank: '\uAE30\uC5C5\uC740\uD589 \uB0B4\uC5ED',
      forecast: '\uC794\uC561\uC804\uB9DD',
      card: isCompanyCard ? '\uAE30\uC5C5\uCE74\uB4DC \uB0B4\uC5ED' : '\uD1A0\uC2A4\uC740\uD589 \uB0B4\uC5ED'
    };
    const title = titles[source] || '\uAC00\uACC4\uBD80 \uB0B4\uC5ED';
    setText('fundplanAllTimeTitle', title);
    setText('fundplanAllTimeCount', records.length + '\uAC74');

    const thead = document.getElementById('ledgerAllTableHead');
    if (thead) {
      const moneyInLabel = isCompanyCard ? '\uC218\uC785' : '\uC785\uAE08';
      const moneyOutLabel = isCompanyCard ? '\uC9C0\uCD9C' : '\uCD9C\uAE08';
      const balanceLabel = isCompanyCard ? '\uC0AC\uC6A9\uC561' : '\uC794\uC561';
      const useMerged = ['card', 'cash', 'bank'].includes(source);
      thead.replaceWith(createLedgerTableHead(moneyInLabel, moneyOutLabel, useMerged, balanceLabel));
      const newThead = document.querySelector('#ledgerAllTable thead');
      if (newThead) newThead.id = 'ledgerAllTableHead';
    }

    const list = document.getElementById('fundplanAllTimeList');
    if (!list) return;
    list.replaceChildren();

    if (!records.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 7;
      emptyCell.className = 'ledger-empty-list ledger-empty-table-cell';
      emptyCell.textContent = title + '\uC5D0 \uD45C\uC2DC\uD560 \uAC70\uB798 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.';
      emptyRow.appendChild(emptyCell);
      list.appendChild(emptyRow);
      return;
    }

    // Group records by calculated month (YYYY-MM)
    const grouped = records.reduce((map, record) => {
      const monthKey = getRecordMonthGroup(record, isCompanyCard);
      (map[monthKey] ||= []).push(record);
      return map;
    }, {});

    const months = Object.keys(grouped).sort();
    const focusMonth = toIso(clampLedgerDate(ledgerState.monthCursor)).slice(0, 7);
    const pivotMonth = months.includes(focusMonth) ? focusMonth : (months.find(month => month >= focusMonth) || months[months.length - 1]);
    setText('ledgerPeriodTitle', focusMonth.replace('-', '.'));

    // Default expanded state: if empty for this source, set pivot month to true
    if (Object.keys(monthExpandedState).length === 0) {
      months.forEach(m => {
        monthExpandedState[m] = (m === pivotMonth);
      });
    }

    months.forEach(month => {
      const monthRecords = grouped[month];
      const isExpanded = monthExpandedState[month] !== false;
      const monthRowElements = [];

      const dividerRow = createLedgerMonthDividerRow({
        monthKey: month,
        isCompanyCard,
        isExpanded,
        monthRecords,
        onToggle: toggleIcon => {
          const currentlyExpanded = monthExpandedState[month] !== false;
          const willExpand = !currentlyExpanded;
          monthExpandedState[month] = willExpand;
          toggleIcon.textContent = willExpand ? '\u25BC' : '\u25B6';
          monthRowElements.forEach(r => {
            r.style.display = willExpand ? '' : 'none';
          });
        }
      });
      list.appendChild(dividerRow);

      // 2. Month Transaction Rows
      monthRecords.forEach(record => {
        const prevCount = list.children.length;
        renderTransactionRow(record, 'fundplanAllTimeList', { source, colorSettings });
        const newCount = list.children.length;
        for (let i = prevCount; i < newCount; i++) {
          const rowEl = list.children[i];
          rowEl.dataset.monthGroup = month;
          if (!isExpanded) rowEl.style.display = 'none';
          monthRowElements.push(rowEl);
        }
      });
    });
  }

  function setAllExpanded(expanded) {
    document.querySelectorAll('.ledger-month-divider-row').forEach(divRow => {
      const month = divRow.dataset.month;
      monthExpandedState[month] = expanded;
      const icon = divRow.querySelector('.ledger-month-toggle-icon');
      if (icon) icon.textContent = expanded ? '\u25BC' : '\u25B6';
    });
    document.querySelectorAll('#fundplanAllTimeList tr[data-month-group]').forEach(row => {
      row.style.display = expanded ? '' : 'none';
    });
  }

  return { render, setAllExpanded };
}