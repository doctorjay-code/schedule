import { toIso } from './ledger-utils.js';
import { createLedgerTableHead, renderTransactionRow } from './transaction-view.js';

// Bank and cash all-time ledger rendering responsibility.
export function createFundplanView({ ledgerState, colorSettings, getActiveSourceRecords, clampLedgerDate, minDate, setText }) {
  function render() {
    const source = ledgerState.source;
    const records = getActiveSourceRecords().filter(record => new Date(record.date + 'T00:00:00') >= minDate);
    const titles = {
      cash: '\uD604\uAE08 \uB0B4\uC5ED',
      bank: '\uAE30\uC5C5\uC740\uD589 \uB0B4\uC5ED',
      forecast: '\uC794\uC561\uC804\uB9DD'
    };
    const title = titles[source] || '\uAC00\uACC4\uBD80 \uB0B4\uC5ED';
    setText('fundplanAllTimeTitle', title);
    setText('fundplanAllTimeCount', records.length + '\uAC74');
    const list = document.getElementById('fundplanAllTimeList');
    if (!list) return;
    list.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'ledger-empty-list';
      empty.textContent = title + '\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.';
      list.appendChild(empty);
      return;
    }
    const grouped = records.reduce((map, record) => {
      const month = record.date.slice(0, 7);
      (map[month] ||= []).push(record);
      return map;
    }, {});
    const months = Object.keys(grouped).sort();
    const focusMonth = toIso(clampLedgerDate(ledgerState.monthCursor)).slice(0, 7);
    const pivotMonth = months.includes(focusMonth) ? focusMonth : (months.find(month => month >= focusMonth) || months[months.length - 1]);
    setText('ledgerPeriodTitle', focusMonth.replace('-', '.'));
    let pivotGroup = null;
    months.forEach(month => {
      const group = document.createElement('details');
      group.className = 'fundplan-month-group';
      group.id = 'fundplan-month-group-' + source + '-' + month;
      group.open = month === pivotMonth;
      const summary = document.createElement('summary');
      const label = document.createElement('strong');
      label.textContent = month.replace('-', '\uB144') + '\uC6D4';
      const count = document.createElement('span');
      count.textContent = grouped[month].length + '\uAC74';
      summary.append(label, count);
      const tableWrap = document.createElement('div');
      tableWrap.className = 'ledger-table-scroll fundplan-table-scroll';
      const table = document.createElement('table');
      table.className = 'schedule-table fundplan-month-table';
      const monthList = document.createElement('tbody');
      const monthListId = 'fundplan-month-' + source + '-' + month;
      monthList.id = monthListId;
      monthList.className = 'fundplan-month-list';
      const moneyInLabel = source === 'bank' || source === 'cash' ? '\uC785\uAE08' : '\uC218\uC785';
      const moneyOutLabel = source === 'bank' || source === 'cash' ? '\uCD9C\uAE08' : '\uC9C0\uCD9C';
      table.append(createLedgerTableHead(moneyInLabel, moneyOutLabel, true), monthList);
      tableWrap.appendChild(table);
      group.append(summary, tableWrap);
      list.appendChild(group);
      grouped[month].forEach(record => renderTransactionRow(record, monthListId, { source, colorSettings }));
      if (month === pivotMonth) pivotGroup = group;
    });
    if (pivotGroup && !ledgerState.fundplanAutoScrolled[source]) ledgerState.fundplanAutoScrolled[source] = true;
  }

  function setAllExpanded(expanded) {
    document.querySelectorAll('#fundplanAllTimeList .fundplan-month-group').forEach(group => { group.open = expanded; });
  }

  return { render, setAllExpanded };
}