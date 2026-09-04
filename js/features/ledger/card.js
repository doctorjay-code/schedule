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
    query: '',
    target: 'all'
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
    if (filterTypeOrFilters.target) filters.target = String(filterTypeOrFilters.target).trim();
    if (filterTypeOrFilters.searchTarget) filters.target = String(filterTypeOrFilters.searchTarget).trim();
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

  function matchRecordFilter(r, f, checkJuJu) {
    if (f.payment) {
      const recPayment = r.payment || r.payment_method || r.sheetName || '';
      if (recPayment !== f.payment) return false;
    }
    if (f.person && f.person.size > 0) {
      const p = r.person || r.user_name || '기타';
      const personMatched = (checkJuJu && (p === '진주' || p === '쥬쥬')) || f.person.has(p);
      if (!personMatched) return false;
    }
    if (f.category && f.category.size > 0) {
      const c = r.category || '';
      if (!f.category.has(c)) return false;
    }
    if (f.fixed && f.fixed !== 'all') {
      const fixed = String(r.fixedCost || r.fixed_cost || '').trim();
      const isFixed = fixed === '고정비' || fixed === '고정' || fixed === 'true';
      if (f.fixed === 'fixed' && !isFixed) return false;
      if (f.fixed === 'variable' && isFixed) return false;
    }
    if (f.query) {
      const q = f.query;
      const target = f.target || 'all';
      const item = String(r.item || r.description || '').toLowerCase();
      const memo = String(r.memo || r.note || r.remarks || '').toLowerCase();
      const cat = String(r.category || '').toLowerCase();
      const person = String(r.person || r.user_name || '').toLowerCase();
      const payment = String(r.payment || r.payment_method || '').toLowerCase();

      if (target === 'item') {
        if (!item.includes(q)) return false;
      } else if (target === 'memo') {
        if (!memo.includes(q)) return false;
      } else if (target === 'category') {
        if (!cat.includes(q)) return false;
      } else if (target === 'person') {
        if (!person.includes(q)) return false;
      } else if (target === 'amount') {
        const cleanQ = q.replace(/[,원\s]/g, '');
        if (cleanQ && !isNaN(Number(cleanQ))) {
          const amountStr = String(r.amount ?? '');
          const expenseStr = String(r.expense ?? '');
          const incomeStr = String(r.income ?? '');
          if (!amountStr.includes(cleanQ) && !expenseStr.includes(cleanQ) && !incomeStr.includes(cleanQ)) return false;
        }
      } else {
        const textMatch = item.includes(q) || memo.includes(q) || cat.includes(q) || person.includes(q) || payment.includes(q);
        if (!textMatch) {
          const cleanQ = q.replace(/[,원\s]/g, '');
          if (cleanQ && !isNaN(Number(cleanQ))) {
            const amountStr = String(r.amount ?? '');
            const expenseStr = String(r.expense ?? '');
            const incomeStr = String(r.income ?? '');
            if (!amountStr.includes(cleanQ) && !expenseStr.includes(cleanQ) && !incomeStr.includes(cleanQ)) return false;
          } else {
            return false;
          }
        }
      }
    }
    return true;
  }

  const hasSubFilter = hasPersonFilter || hasCategoryFilter || hasFixedFilter || hasQueryFilter;
  const result = [];

  records.forEach(record => {
    const hasSubRecords = (record.isAggregate || record.hasCardAccordion) && Array.isArray(record.subRecords) && record.subRecords.length > 0;

    if (!hasSubRecords) {
      if (matchRecordFilter(record, filters, hasJuJu)) {
        result.push(record);
      }
      return;
    }

    // 결제수단 조건
    if (hasPaymentFilter) {
      const recPayment = record.payment || record.payment_method || record.sheetName || '';
      if (recPayment !== filters.payment) return;
    }

    if (hasSubFilter) {
      // 🌟 세부 거래들 중 필터 조건에 부합하는 것만 정밀 추출 (그 중에 그것들만!)
      const matchingSubs = record.subRecords.filter(sub => matchRecordFilter(sub, filters, hasJuJu));
      const mainMatchedDirectly = matchRecordFilter(record, filters, hasJuJu);

      if (matchingSubs.length > 0 || mainMatchedDirectly) {
        const subsToKeep = matchingSubs.length > 0 ? matchingSubs : record.subRecords;
        const filteredAmount = matchingSubs.length > 0
          ? matchingSubs.reduce((sum, s) => sum + ((s.type || 'expense').toLowerCase() === 'income' ? -Number(s.amount || 0) : Number(s.amount || 0)), 0)
          : record.amount;

        result.push({
          ...record,
          subRecords: subsToKeep,
          amount: Math.abs(filteredAmount),
          type: filteredAmount < 0 ? 'income' : (record.type || 'expense'),
          isSubFiltered: matchingSubs.length > 0
        });
      }
    } else {
      result.push(record);
    }
  });

  return result;
}