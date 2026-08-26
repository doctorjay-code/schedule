// Card transaction filtering responsibility (Multi-Faceted Composite Filter Engine).
export const LEDGER_CARD_SCOPE = Object.freeze({
  name: 'card',
  responsibilities: ['weekly-list', 'monthly-list', 'entry-form', 'edit', 'delete']
});

export function filterLedgerRecords(records, filterTypeOrFilters, filterValue) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // 1. 복합 필터 객체(Multi-faceted Filters) 정규화
  let filters = {
    person: new Set(),
    category: new Set(),
    fixed: 'all'
  };

  if (filterTypeOrFilters && typeof filterTypeOrFilters === 'object' && !Array.isArray(filterTypeOrFilters) && !(filterTypeOrFilters instanceof Set)) {
    // 객체 형태로 전달된 경우
    if (filterTypeOrFilters.person instanceof Set) filters.person = filterTypeOrFilters.person;
    else if (Array.isArray(filterTypeOrFilters.person)) filters.person = new Set(filterTypeOrFilters.person);

    if (filterTypeOrFilters.category instanceof Set) filters.category = filterTypeOrFilters.category;
    else if (Array.isArray(filterTypeOrFilters.category)) filters.category = new Set(filterTypeOrFilters.category);

    if (filterTypeOrFilters.fixed) filters.fixed = filterTypeOrFilters.fixed;
  } else {
    // 기존 하위 호환성 (filterType, filterValue)
    const filterType = filterTypeOrFilters;
    if (filterType === 'all' || !filterType) {
      return records;
    }
    if (filterType === 'fixed') {
      filters.fixed = filterValue || 'fixed';
    } else {
      let selectedSet = new Set();
      if (filterValue instanceof Set) selectedSet = filterValue;
      else if (Array.isArray(filterValue)) selectedSet = new Set(filterValue);
      else if (typeof filterValue === 'string' && filterValue.includes(',')) {
        selectedSet = new Set(filterValue.split(',').map(s => s.trim()).filter(Boolean));
      } else if (filterValue && filterValue !== 'all') {
        selectedSet = new Set([filterValue]);
      }
      if (filterType === 'person') filters.person = selectedSet;
      if (filterType === 'category') filters.category = selectedSet;
    }
  }

  const hasPersonFilter = filters.person && filters.person.size > 0;
  const hasCategoryFilter = filters.category && filters.category.size > 0;
  const hasFixedFilter = filters.fixed && filters.fixed !== 'all';

  // 필터 조건이 하나도 없으면 원본 그대로 반환
  if (!hasPersonFilter && !hasCategoryFilter && !hasFixedFilter) {
    return records;
  }

  const hasJuJu = hasPersonFilter && (filters.person.has('진주') || filters.person.has('쥬쥬'));

  return records.filter(record => {
    // 1. 사용자 조건 (AND)
    if (hasPersonFilter) {
      const p = record.person || record.user_name || '기타';
      const personMatched = (hasJuJu && (p === '진주' || p === '쥬쥬')) || filters.person.has(p);
      if (!personMatched) return false;
    }

    // 2. 사용처 조건 (AND)
    if (hasCategoryFilter) {
      const c = record.category || '';
      if (!filters.category.has(c)) return false;
    }

    // 3. 고정비 조건 (AND)
    if (hasFixedFilter) {
      const fixed = String(record.fixedCost || '').trim();
      const isFixed = fixed === '고정비' || fixed === '고정' || fixed === 'true';
      if (filters.fixed === 'fixed' && !isFixed) return false;
      if (filters.fixed === 'variable' && isFixed) return false;
    }

    return true;
  });
}