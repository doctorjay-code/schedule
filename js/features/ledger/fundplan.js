import { toIso } from './ledger-utils.js?v=20260824_33';

// Bank and cash data normalization responsibility.
export const LEDGER_FUNDPLAN_SCOPE = Object.freeze({
  name: 'fundplan',
  responsibilities: ['bank-ledger', 'cash-ledger', 'month-folding', 'imported-records']
});

function excelSerialToIso(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : toIso(parsed);
}

export function normalizeFundplanRows(rows, source) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const values = Array.isArray(row) ? row : (Array.isArray(row?.value) ? row.value : []);
    const date = excelSerialToIso(values[1]);
    const item = String(values[2] || '').trim();
    const income = Number(values[3]) || 0;
    const expense = Number(values[4]) || 0;
    const balanceValue = values[5];
    const balance = balanceValue === null || balanceValue === undefined || balanceValue === '' ? null : Number(balanceValue);
    if (!date || (!item && !income && !expense && !Number.isFinite(balance))) return null;
    const type = income > 0 ? 'income' : expense > 0 ? 'expense' : 'balance';
    return {
      id: source + '-' + (index + 2),
      date,
      item,
      type,
      amount: income || expense,
      balance,
      payment: source === 'bank' ? '\uD1B5\uC7A5' : '\uD604\uAE08',
      person: source === 'bank' ? String(values[6] || '') : '\uD604\uAE08',
      category: source === 'bank' ? String(values[8] || '') : '',
      memo: source === 'bank' ? String(values[7] || '') : String(values[6] || ''),
      personLabel: '\uAD6C\uBD84',
      categoryLabel: '\uBD84\uB958',
      source: 'excel'
    };
  }).filter(Boolean);
}