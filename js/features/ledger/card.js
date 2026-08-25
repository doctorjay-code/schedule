// Card transaction filtering responsibility.
export const LEDGER_CARD_SCOPE = Object.freeze({
  name: 'card',
  responsibilities: ['weekly-list', 'monthly-list', 'entry-form', 'edit', 'delete']
});

export function filterLedgerRecords(records, filterType, filterValue) {
  if (filterType === 'all') return records;
  if (filterType === 'fixed') {
    if (filterValue === 'variable') {
      // ⚪ 변동비만 (고정비 제외)
      return records.filter(record => {
        const fixed = String(record.fixedCost || '').trim();
        return fixed !== '고정비' && fixed !== '고정' && fixed !== 'true';
      });
    }
    // 🟡 고정비만
    return records.filter(record => {
      const fixed = String(record.fixedCost || '').trim();
      return fixed === '고정비' || fixed === '고정' || fixed === 'true';
    });
  }

  // 다중 선택(Multi-select) Set / Array / 쉼표 구분 문자열 정규화
  let selectedSet = new Set();
  if (filterValue instanceof Set) {
    selectedSet = filterValue;
  } else if (Array.isArray(filterValue)) {
    selectedSet = new Set(filterValue);
  } else if (typeof filterValue === 'string' && filterValue.includes(',')) {
    selectedSet = new Set(filterValue.split(',').map(s => s.trim()).filter(Boolean));
  } else if (filterValue && filterValue !== 'all') {
    selectedSet = new Set([filterValue]);
  }

  if (selectedSet.size === 0) return records;

  if (filterType === 'person') {
    const hasJuJu = selectedSet.has('진주') || selectedSet.has('쥬쥬');
    return records.filter(record => {
      const p = record.person || record.user_name || '기타';
      if (hasJuJu && (p === '진주' || p === '쥬쥬')) return true;
      return selectedSet.has(p);
    });
  }

  return records.filter(record => selectedSet.has(record[filterType]));
}