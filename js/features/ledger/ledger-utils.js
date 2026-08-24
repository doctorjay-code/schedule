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

import { escapeHtml } from '../../shared/safe.js';
export { escapeHtml };

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
  // 각 행에 저장된 실제 유효 잔액(> 0)을 기준으로 유지하며, 0이거나 비어있는 행은 직전 잔액에서 자동 연속 계산!
  let currentBalance = null;

  return items.map((item, idx) => {
    const rawBal = Number(item.balance);
    const hasExplicitPositiveBal = Number.isFinite(rawBal) && rawBal > 0 && item.balance !== '' && item.balance !== null;

    if (hasExplicitPositiveBal) {
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
  let key = 'ledgerCategoryColors';
  if (field === 'person') key = 'ledgerPersonColors';
  else if (field === 'payment') key = 'ledgerPaymentColors';
  const colors = colorSettings?.[key] || {};
  return colors[value] || '#F1F5F9';
}

/**
 * Supabase DB orderIndex를 100% 신뢰하는 표준 정렬 헬퍼
 */
export function compareLedgerRecords(a, b) {
  const dateDiff = (a.date || '').localeCompare(b.date || '');
  if (dateDiff !== 0) return dateDiff;
  const orderDiff = (Number(a.orderIndex ?? 0)) - (Number(b.orderIndex ?? 0));
  if (orderDiff !== 0) return orderDiff;
  const createdDiff = (Number(a.createdAt ?? 0)) - (Number(b.createdAt ?? 0));
  if (createdDiff !== 0) return createdDiff;
  return (a.id || '').localeCompare(b.id || '');
}

