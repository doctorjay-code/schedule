// Card transaction filtering responsibility.
export const LEDGER_CARD_SCOPE = Object.freeze({
  name: 'card',
  responsibilities: ['weekly-list', 'monthly-list', 'entry-form', 'edit', 'delete']
});

export function filterLedgerRecords(records, filterType, filterValue) {
  if (filterType === 'all') return records;
  if (filterType === 'fixed') return records.filter(record => String(record.fixedCost || '').trim() === '고정비');
  if (filterType === 'person' && (filterValue === '진주' || filterValue === '쥬쥬')) {
    const jin = ['진주', '쥬쥬'];
    return records.filter(record => jin.includes(record.person));
  }
  return records.filter(record => record[filterType] === filterValue);
}