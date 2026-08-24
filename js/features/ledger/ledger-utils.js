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

  if (isCompanyCard) {
    // 기업카드: 1번째 행부터 시작하는 정확한 누적 사용액
    let runningUsage = 0;
    return items.map(item => {
      const amt = Number(item.amount) || 0;
      runningUsage += (item.type === 'income' ? -amt : amt);
      return {
        ...item,
        balance: runningUsage
      };
    });
  }

  // 일반 계좌: 첫 번째 행의 잔액으로부터 입출금 누적
  const firstWithBalanceIndex = items.findIndex(item => Number.isFinite(Number(item.balance)) && Number(item.balance) !== 0);
  if (firstWithBalanceIndex === -1) {
    let runningBal = 0;
    return items.map(item => {
      const amt = Number(item.amount) || 0;
      runningBal += (item.type === 'income' ? amt : -amt);
      return { ...item, balance: runningBal };
    });
  }

  const firstItem = items[firstWithBalanceIndex];
  let runningBalance = Number(firstItem.balance);

  return items.map((item, idx) => {
    if (idx < firstWithBalanceIndex) return item;
    if (idx > firstWithBalanceIndex) {
      const amt = Number(item.amount) || 0;
      runningBalance += (item.type === 'income' ? amt : -amt);
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
