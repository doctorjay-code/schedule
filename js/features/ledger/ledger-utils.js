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

  // 🏦 일반 계좌 (토스은행 / 현금 / 기업은행 / 잔액전망):
  // 순수 현금흐름 연속 누적 회계: currentBalance += (incAmt - expAmt)
  let currentBalance = 0;

  return items.map((item) => {
    const incAmt = Number(item.incomeAmount !== undefined ? item.incomeAmount : (item.type === 'income' ? item.amount : 0));
    const expAmt = Number(item.expenseAmount !== undefined ? item.expenseAmount : (item.type === 'expense' ? item.amount : 0));
    const delta = incAmt - expAmt;

    currentBalance += delta;

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

/**
 * 표준 날짜 정렬형 가계부 ID 생성기 (tr-YYYYMMDD-xx-xxxxxx)
 */
export function generateLedgerId(dateStr = '', orderIndex = 0) {
  let dKey = '';
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dKey = dateStr.replace(/-/g, '');
  } else {
    const now = new Date();
    dKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }
  const oKey = String(Math.abs(orderIndex || 0)).padStart(2, '0').slice(-2);
  const rand = Math.random().toString(36).slice(2, 8);
  return `tr-${dKey}-${oKey}-${rand}`;
}
