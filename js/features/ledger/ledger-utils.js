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
    // 💳 기업카드: 1번째 행부터 시작하는 정확한 누적 사용액
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

  // 🏦 일반 계좌 (토스은행 / 현금 / 기업은행):
  // 각 행에 저장된 실제 잔액을 100% 보존하며, 비어있는 행만 직전 행 잔액에서 입출금 계산!
  let currentBalance = null;

  return items.map((item, idx) => {
    const rawBal = Number(item.balance);
    const hasValidBal = Number.isFinite(rawBal) && item.balance !== '' && item.balance !== null;

    if (hasValidBal) {
      currentBalance = rawBal;
      return item;
    }

    if (currentBalance !== null) {
      const amt = Number(item.amount) || 0;
      currentBalance += (item.type === 'income' ? amt : -amt);
      return {
        ...item,
        balance: currentBalance
      };
    }

    const amt = Number(item.amount) || 0;
    currentBalance = (item.type === 'income' ? amt : -amt);
    return {
      ...item,
      balance: currentBalance
    };
  });
}

export function getLedgerTagColor(colorSettings, field, value) {
  const key = field === 'person' ? 'ledgerPersonColors' : 'ledgerCategoryColors';
  const colors = colorSettings?.[key] || {};
  return colors[value] || '#F1F5F9';
}
