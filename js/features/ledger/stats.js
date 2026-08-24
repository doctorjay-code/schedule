import { formatMoney } from './ledger-utils.js?v=20260824_33';

// Ledger statistics and report display responsibility.
export const LEDGER_STATS_SCOPE = Object.freeze({
  name: 'stats',
  responsibilities: ['monthly-summary', 'expense-groups', 'report']
});

export function groupExpenses(records, field) {
  return records.filter(x => x.type === 'expense').reduce((map, item) => {
    const key = item[field] || '\uAE30\uD0C0';
    map[key] = (map[key] || 0) + item.amount;
    return map;
  }, {});
}

export function renderStatList(id, values) {
  const target = document.getElementById(id);
  if (!target) return;
  target.replaceChildren();
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    target.textContent = '\uC774\uBC88 \uB2EC \uC9C0\uCD9C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.';
    return;
  }
  entries.forEach(([name, amount]) => {
    const row = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = name;
    const value = document.createElement('b');
    value.textContent = formatMoney(amount);
    row.append(label, value);
    target.appendChild(row);
  });
}