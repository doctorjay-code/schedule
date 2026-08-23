import { toIso } from './ledger-utils.js';
import { createLedgerTableHead, renderTransactionRow } from './transaction-view.js';

// Bank, cash, and card all-time ledger rendering responsibility.
export function createFundplanView({ ledgerState, colorSettings, getActiveSourceRecords, clampLedgerDate, minDate, setText }) {
  const monthExpandedState = {};

  function render() {
    const source = ledgerState.source;
    const records = getActiveSourceRecords().filter(record => new Date(record.date + 'T00:00:00') >= minDate);
    const titles = {
      cash: '\uD604\uAE08 \uB0B4\uC5ED',
      bank: '\uAE30\uC5C5\uC740\uD589 \uB0B4\uC5ED',
      forecast: '\uC794\uC561\uC804\uB9DD',
      card: ledgerState.payment === '\uAE30\uC5C5\uCE74\uB4DC' ? '\uAE30\uC5C5\uCE74\uB4DC \uB0B4\uC5ED' : '\uD1A0\uC2A4\uC740\uD589 \uB0B4\uC5ED'
    };
    const title = titles[source] || '\uAC00\uACC4\uBD80 \uB0B4\uC5ED';
    setText('fundplanAllTimeTitle', title);
    setText('fundplanAllTimeCount', records.length + '\uAC74');

    const thead = document.getElementById('ledgerAllTableHead');
    if (thead) {
      const moneyInLabel = source === 'bank' || source === 'cash' ? '\uC785\uAE08' : '\uC218\uC785';
      const moneyOutLabel = source === 'bank' || source === 'cash' ? '\uCD9C\uAE08' : '\uC9C0\uCD9C';
      const useMerged = ['card', 'cash', 'bank'].includes(source);
      thead.replaceWith(createLedgerTableHead(moneyInLabel, moneyOutLabel, useMerged));
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

    // Group records by month (YYYY-MM)
    const grouped = records.reduce((map, record) => {
      const month = record.date.slice(0, 7);
      (map[month] ||= []).push(record);
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

      // 1. Clean Month Header Row
      const dividerRow = document.createElement('tr');
      dividerRow.className = 'ledger-month-divider-row';
      dividerRow.dataset.month = month;

      const cell = document.createElement('td');
      cell.colSpan = 7;

      const content = document.createElement('div');
      content.className = 'ledger-month-divider-content';

      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'ledger-month-toggle-icon';
      toggleIcon.textContent = isExpanded ? '\u25BC' : '\u25B6';

      const titleEl = document.createElement('strong');
      titleEl.className = 'ledger-month-title';
      titleEl.textContent = month.replace('-', '\uB144 ') + '\uC6D4';

      const countBadge = document.createElement('span');
      countBadge.className = 'ledger-month-count';
      countBadge.textContent = monthRecords.length + '\uAC74';

      content.append(toggleIcon, titleEl, countBadge);
      cell.appendChild(content);
      dividerRow.appendChild(cell);
      list.appendChild(dividerRow);

      // 2. Month Transaction Rows
      const monthRowElements = [];
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

      // Click to toggle month rows
      dividerRow.addEventListener('click', () => {
        const currentlyExpanded = monthExpandedState[month] !== false;
        const willExpand = !currentlyExpanded;
        monthExpandedState[month] = willExpand;
        toggleIcon.textContent = willExpand ? '\u25BC' : '\u25B6';
        monthRowElements.forEach(r => {
          r.style.display = willExpand ? '' : 'none';
        });
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