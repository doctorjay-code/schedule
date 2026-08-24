// Shared pure helpers for the ledger feature.
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function toIso(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
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
