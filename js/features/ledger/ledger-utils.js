// Shared pure helpers for the ledger feature.
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function normalizeLedgerDate(rawDate) {
  if (!rawDate) return '';
  const str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (Number.isFinite(d.getTime())) {
    const kst = new Date(d.getTime() + (9 * 60 - d.getTimezoneOffset()) * 60000);
    const y = kst.getFullYear();
    const m = String(kst.getMonth() + 1).padStart(2, '0');
    const day = String(kst.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return str.slice(0, 10);
}

export function toIso(date) {
  return normalizeLedgerDate(date);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function formatMoney(value) {
  return Math.abs(Number(value) || 0).toLocaleString('ko-KR');
}

export function recalculateRunningBalances(items, isCompanyCard = false) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const firstWithBalanceIndex = items.findIndex(item => Number.isFinite(Number(item.balance)));
  if (firstWithBalanceIndex === -1) return items;

  const firstItem = items[firstWithBalanceIndex];
  const firstBal = Number(firstItem.balance);

  let runningBalance = isCompanyCard
    ? firstBal - (firstItem.type === 'expense' ? firstItem.amount : -firstItem.amount)
    : firstBal - (firstItem.type === 'income' ? firstItem.amount : -firstItem.amount);

  return items.map((item, idx) => {
    if (idx < firstWithBalanceIndex) return item;
    if (isCompanyCard) {
      runningBalance += (item.type === 'expense' ? item.amount : -item.amount);
    } else {
      runningBalance += (item.type === 'income' ? item.amount : -item.amount);
    }
    return {
      ...item,
      balance: runningBalance
    };
  });
}

export function getLedgerTagColor(colorSettings, field, value) {
  const key = field === 'person' ? 'ledgerPersonColors' : 'ledgerCategoryColors';
  const colors = colorSettings?.[key] || {};
  return colors[value] || '#F1F5F9';
}
