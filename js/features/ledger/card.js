// Card transaction filtering responsibility (Multi-Faceted Composite Filter Engine).
export const LEDGER_CARD_SCOPE = Object.freeze({
  name: 'card',
  responsibilities: ['weekly-list', 'monthly-list', 'entry-form', 'edit', 'delete']
});

export function filterLedgerRecords(records, filterTypeOrFilters, filterValue) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // 1. 복합 필터 객체(Multi-faceted Filters) 정규화
  let filters = {
    payment: null,
    source: null,
    person: new Set(),
    category: new Set(),
    fixed: 'all',
    query: ''
  };

  if (filterTypeOrFilters && typeof filterTypeOrFilters === 'object' && !Array.isArray(filterTypeOrFilters) && !(filterTypeOrFilters instanceof Set)) {
    // 객체 형태로 전달된 경우
    if (filterTypeOrFilters.payment) filters.payment = filterTypeOrFilters.payment;
    if (filterTypeOrFilters.source) filters.source = filterTypeOrFilters.source;

    if (filterTypeOrFilters.person instanceof Set) filters.person = filterTypeOrFilters.person;
    else if (Array.isArray(filterTypeOrFilters.person)) filters.person = new Set(filterTypeOrFilters.person);

    if (filterTypeOrFilters.category instanceof Set) filters.category = filterTypeOrFilters.category;
    else if (Array.isArray(filterTypeOrFilters.category)) filters.category = new Set(filterTypeOrFilters.category);

    if (filterTypeOrFilters.fixed) filters.fixed = filterTypeOrFilters.fixed;
    if (filterTypeOrFilters.query) filters.query = String(filterTypeOrFilters.query).trim().toLowerCase();
    if (filterTypeOrFilters.searchQuery) filters.query = String(filterTypeOrFilters.searchQuery).trim().toLowerCase();
  } else {
    // 기존 하위 호환성 (filterType, filterValue)
    const filterType = filterTypeOrFilters;
    if (filterType === 'all' || !filterType) {
      return records;
    }
    if (filterType === 'payment') {
      filters.payment = filterValue;
    } else if (filterType === 'source') {
      filters.source = filterValue;
    } else if (filterType === 'fixed') {
      filters.fixed = filterValue || 'fixed';
    } else if (filterType === 'query' || filterType === 'search') {
      filters.query = String(filterValue || '').trim().toLowerCase();
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

  const hasPaymentFilter = Boolean(filters.payment);
  const hasSourceFilter = Boolean(filters.source && filters.source !== 'all');
  const hasPersonFilter = filters.person && filters.person.size > 0;
  const hasCategoryFilter = filters.category && filters.category.size > 0;
  const hasFixedFilter = filters.fixed && filters.fixed !== 'all';
  const hasQueryFilter = Boolean(filters.query);

  // 필터 조건이 하나도 없으면 원본 그대로 반환
  if (!hasPaymentFilter && !hasSourceFilter && !hasPersonFilter && !hasCategoryFilter && !hasFixedFilter && !hasQueryFilter) {
    return records;
  }

  const hasJuJu = hasPersonFilter && (filters.person.has('진주') || filters.person.has('쥬쥬'));

  return records.filter(record => {
    // 1. 결제수단 / 시트 조건 (AND)
    if (hasPaymentFilter) {
      const recPayment = record.payment || record.payment_method || record.sheetName || '';
      if (recPayment !== filters.payment) return false;
    }

    // 2. 사용자 조건 (AND)
    if (hasPersonFilter) {
      const p = record.person || record.user_name || '기타';
      const personMatched = (hasJuJu && (p === '진주' || p === '쥬쥬')) || filters.person.has(p);
      if (!personMatched) return false;
    }

    // 3. 사용처 조건 (AND)
    if (hasCategoryFilter) {
      const c = record.category || '';
      if (!filters.category.has(c)) return false;
    }

    // 4. 고정비 조건 (AND)
    if (hasFixedFilter) {
      const fixed = String(record.fixedCost || record.fixed_cost || '').trim();
      const isFixed = fixed === '고정비' || fixed === '고정' || fixed === 'true';
      if (filters.fixed === 'fixed' && !isFixed) return false;
      if (filters.fixed === 'variable' && isFixed) return false;
    }

    // 5. 검색어(query) 조건 (항목, 비고, 사용처, 사용자, 금액 매칭)
    if (hasQueryFilter) {
      const q = filters.query;
      const item = String(record.item || record.description || '').toLowerCase();
      const memo = String(record.memo || record.note || record.remarks || '').toLowerCase();
      const cat = String(record.category || '').toLowerCase();
      const person = String(record.person || record.user_name || '').toLowerCase();
      const payment = String(record.payment || record.payment_method || '').toLowerCase();

      let matchText = item.includes(q) || memo.includes(q) || cat.includes(q) || person.includes(q) || payment.includes(q);
      if (!matchText && Array.isArray(record.subRecords)) {
        matchText = record.subRecords.some(sub => {
          const sItem = String(sub.item || sub.description || '').toLowerCase();
          const sMemo = String(sub.memo || sub.note || sub.remarks || '').toLowerCase();
          const sCat = String(sub.category || '').toLowerCase();
          const sPerson = String(sub.person || sub.user_name || '').toLowerCase();
          return sItem.includes(q) || sMemo.includes(q) || sCat.includes(q) || sPerson.includes(q);
        });
      }
      if (!matchText) {
        const cleanQ = q.replace(/[,원\s]/g, '');
        if (cleanQ && !isNaN(Number(cleanQ))) {
          const amountStr = String(record.amount ?? '');
          const expenseStr = String(record.expense ?? '');
          const incomeStr = String(record.income ?? '');
          if (amountStr.includes(cleanQ) || expenseStr.includes(cleanQ) || incomeStr.includes(cleanQ)) {
            matchText = true;
          }
        }
      }
      if (!matchText) return false;
    }

    return true;
  });
}