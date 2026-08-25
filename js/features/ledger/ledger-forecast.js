import { fetchForecastOrders, saveForecastOrders } from '../../services/ledger/ledger-api.js';
import { compareLedgerRecords, normalizeLedgerDate } from './ledger-utils.js';

const FORECAST_ORDER_STORAGE_KEY = 'LEDGER_FORECAST_ORDER_MAP_V1';

export function loadForecastOrderMap() {
  try {
    const raw = localStorage.getItem(FORECAST_ORDER_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    return {};
  }
}

export function saveForecastOrderMap(map) {
  try {
    localStorage.setItem(FORECAST_ORDER_STORAGE_KEY, JSON.stringify(map || {}));
  } catch (err) {}
}

export async function syncForecastOrdersFromDB() {
  try {
    const dbOrders = await fetchForecastOrders();
    if (dbOrders && typeof dbOrders === 'object' && Object.keys(dbOrders).length > 0) {
      const local = loadForecastOrderMap();
      const merged = { ...local, ...dbOrders };
      saveForecastOrderMap(merged);
      return merged;
    }
  } catch (err) {}
  return loadForecastOrderMap();
}

export function isFixedRecord(r) {
  if (!r) return false;
  return r.fixedCost === '고정비' || r.fixedCost === '고정' || (r.fixedCost && r.fixedCost !== 'false');
}

/**
 * 이체 / 월급 카테고리 거래인지 확인 (오직 카테고리 필드만 기준!)
 */
export function isTransferOrSalaryRecord(r) {
  if (!r) return false;
  const category = String(r.category || '').trim();
  return category === '이체' || category === '월급';
}

/**
 * 기업은행 시트에 적힌 수기 카드 결제/선결제 출금 건 여부 확인
 * (잔액전망에서는 27일에 실시간 집계되는 기업카드(고정/가변)로 대체되므로 중복 방지를 위해 제외)
 */
export function isManualCardPayment(r) {
  if (!r || r.type !== 'expense') return false;
  const item = String(r.item || '').trim();
  const memo = String(r.memo || '').trim();
  return item.includes('비씨카드') || item.includes('BC카드') || item.includes('기업카드출금') || memo.includes('기업카드 결제') || memo.includes('카드선결제') || memo.includes('BC카드선결제') || item.includes('카드선결제');
}

/**
 * 토스은행 + 기업은행 통합 잔액전망 엔진:
 * - 3대 통합 아코디언 행: 매월 1일 [생활비(가변)], 매월 27일 [기업카드(고정)], [기업카드(가변)]
 * - 단독 중요 거래: 모든 고정비, 모든 이체/송금/급여/월급/대출원리금상환 풀 코스 100% 표시!
 * - 현금: 완전 제외
 */
export function generateForecastRecords(ledgerDataSources = {}) {
  const cardList = ledgerDataSources.card || [];
  const tossRecords = cardList.filter(r => r.payment === '토스은행' || r.sheetName === '토스은행');
  const cardRecords = cardList.filter(r => r.payment === '기업카드' || r.sheetName === '기업카드');
  const bankRecords = ledgerDataSources.bank || [];

  // 2026-01부터 시작하는 모든 월 목록 추출 (기업카드의 13일~12일 결제월 기준까지 완벽 포함!)
  const monthSet = new Set();
  [...tossRecords, ...bankRecords].forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (dStr >= '2026-01-01') {
      monthSet.add(dStr.slice(0, 7));
    }
  });

  cardRecords.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (dStr >= '2026-01-01') {
      const [y, m, d] = dStr.split('-').map(Number);
      let billingMonth = m;
      let billingYear = y;
      if (d >= 13) {
        billingMonth += 1;
        if (billingMonth > 12) {
          billingMonth = 1;
          billingYear += 1;
        }
      }
      if (billingMonth === 1) billingMonth = 2;
      monthSet.add(`${billingYear}-${String(billingMonth).padStart(2, '0')}`);
    }
  });

  const nowIso = new Date().toISOString().slice(0, 7);
  monthSet.add(nowIso);
  const months = Array.from(monthSet).sort();

  const forecastPool = [];

  // 1. 토스은행 고정비 및 모든 이체/송금/월급 거래들 단독 행으로 100% 추가
  tossRecords.forEach(r => {
    const isFixed = isFixedRecord(r);
    const isTransOrSal = isTransferOrSalaryRecord(r);

    if (isFixed || isTransOrSal) {
      forecastPool.push({
        ...r,
        id: `fc-toss-${r.id}`,
        originalId: r.id,
        source: 'forecast',
        payment: '토스은행'
      });
    }
  });

  // 2. 기업은행 통장의 모든 실제 거래 추가 & 실제 카드 출금 거래에 카드 세부내역 바인딩!
  const monthsWithActualCardPayment = new Set();

  bankRecords.forEach(r => {
    const isCardPay = isManualCardPayment(r);
    const dStr = normalizeLedgerDate(r.date);
    const mStr = dStr.slice(0, 7);

    let subRecords = null;
    let hasCardAccordion = false;

    if (isCardPay) {
      monthsWithActualCardPayment.add(mStr);
      const [y, m] = mStr.split('-').map(Number);
      let cardStart = null, cardEnd = null;
      if (m === 2) {
        cardStart = `${y}-01-01`;
        cardEnd = `${y}-02-12`;
      } else {
        const pStr = `${y}-${String(m - 1).padStart(2, '0')}`;
        cardStart = `${pStr}-13`;
        cardEnd = `${mStr}-12`;
      }

      if (cardStart && cardEnd) {
        const monthCards = cardRecords.filter(c => {
          const cd = normalizeLedgerDate(c.date);
          return cd >= cardStart && cd <= cardEnd;
        });
        if (monthCards.length > 0) {
          subRecords = [...monthCards].sort(compareLedgerRecords);
          hasCardAccordion = true;
        }
      }
    }

    forecastPool.push({
      ...r,
      id: `fc-bank-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '기업은행',
      hasCardAccordion,
      subRecords
    });
  });

  // 3. 월별 가변비 합산 생성 (토스 순수가변 생활비 & 실제 출금 없는 미래 월의 27일 예상 청구액)
  months.forEach(mStr => {
    const [y, m] = mStr.split('-').map(Number);
    const mNum = m;

    // A. 토스은행 생활비(가변) (매월 1일)
    const tossMonthVars = tossRecords.filter(r => {
      const d = normalizeLedgerDate(r.date);
      const isFixed = isFixedRecord(r);
      const isTransOrSal = isTransferOrSalaryRecord(r);
      return d.startsWith(mStr) && !isFixed && !isTransOrSal;
    });

    const tossVarExpense = tossMonthVars.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);
    const tossVarIncome = tossMonthVars.reduce((sum, r) => sum + (r.type === 'income' ? Number(r.amount || 0) : 0), 0);

    if (tossMonthVars.length > 0) {
      forecastPool.push({
        id: `fc-var-toss-${mStr}`,
        date: `${mStr}-01`,
        item: '생활비(가변)',
        amount: tossVarExpense - tossVarIncome,
        incomeAmount: tossVarIncome,
        expenseAmount: tossVarExpense,
        type: 'aggregate',
        payment: '토스은행',
        category: '',
        person: '',
        memo: `${mNum}월 토스 생활비 (${tossMonthVars.length}건)`,
        fixedCost: '',
        source: 'forecast',
        isAggregate: true,
        hasCardAccordion: false,
        subRecords: [...tossMonthVars].sort(compareLedgerRecords)
      });
    }

    // B. 미래 월 기업카드 예상 청구분 (실제 통장 출금이 없는 월에만 27일 가상행으로 생성)
    if (!monthsWithActualCardPayment.has(mStr)) {
      let cardStart = null, cardEnd = null;
      if (m === 2) {
        cardStart = `${y}-01-01`;
        cardEnd = `${y}-02-12`;
      } else {
        const pStr = `${y}-${String(m - 1).padStart(2, '0')}`;
        cardStart = `${pStr}-13`;
        cardEnd = `${mStr}-12`;
      }

      if (cardStart && cardEnd) {
        const monthCards = cardRecords.filter(c => {
          const cd = normalizeLedgerDate(c.date);
          return cd >= cardStart && cd <= cardEnd;
        });

        if (monthCards.length > 0) {
          const cardExp = monthCards.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);
          const cardInc = monthCards.reduce((sum, r) => sum + (r.type === 'income' ? Number(r.amount || 0) : 0), 0);
          const fixCount = monthCards.filter(isFixedRecord).length;
          const varCount = monthCards.length - fixCount;

          forecastPool.push({
            id: `fc-est-card-${mStr}`,
            date: `${mStr}-27`,
            item: '기업카드(예상결제)',
            amount: cardExp - cardInc,
            incomeAmount: cardInc,
            expenseAmount: cardExp,
            type: 'aggregate',
            payment: '기업은행',
            category: '카드대금',
            person: '',
            memo: `${mNum}월 기업카드 청구예상 (고정 ${fixCount}건, 가변 ${varCount}건)`,
            fixedCost: '',
            source: 'forecast',
            isAggregate: true,
            hasCardAccordion: true,
            subRecords: [...monthCards].sort(compareLedgerRecords)
          });
        }
      }
    }
  });

  // 4. 잔액전망 전용 독립 순서 매핑 적용 후 날짜순 정렬
  const forecastOrderMap = loadForecastOrderMap();
  forecastPool.forEach(r => {
    const rawId = String(r.id || '').replace(/^fc-(toss|bank)-/, '');
    const origId = String(r.originalId || '');
    if (forecastOrderMap[rawId] !== undefined) {
      r.orderIndex = forecastOrderMap[rawId];
    } else if (forecastOrderMap[origId] !== undefined) {
      r.orderIndex = forecastOrderMap[origId];
    } else if (forecastOrderMap[r.id] !== undefined) {
      r.orderIndex = forecastOrderMap[r.id];
    }
  });

  forecastPool.sort(compareLedgerRecords);

  // 5. 각 계좌의 시작 잔액 합산 (2026년 통합 시작 잔액 - 토스 + 기업)
  const getAccountOpeningBalance = (records) => {
    if (!Array.isArray(records) || records.length === 0) return 0;
    const sorted = [...records].filter(r => normalizeLedgerDate(r.date) >= '2026-01-01').sort(compareLedgerRecords);
    if (sorted.length === 0) return 0;
    const first = sorted[0];
    const rawBal = Number(first.balance);
    if (!Number.isFinite(rawBal)) return 0;
    const firstAmt = Number(first.amount || 0);
    const opening = rawBal - (first.type === 'income' ? firstAmt : -firstAmt);
    return Math.max(0, opening);
  };

  const tossOpening = getAccountOpeningBalance(tossRecords);
  const bankOpening = getAccountOpeningBalance(bankRecords);
  const totalOpeningBalance = tossOpening + bankOpening;

  // 6. 통합 시작 잔액에서 출발하여 전체 실시간 연속 누적 잔액(Running Balance) 계산!
  let runningBalance = totalOpeningBalance;
  forecastPool.forEach(r => {
    if (r.incomeAmount !== undefined || r.expenseAmount !== undefined) {
      runningBalance += Number(r.incomeAmount || 0) - Number(r.expenseAmount || 0);
    } else {
      const amt = Number(r.amount || 0);
      if (r.type === 'income') {
        runningBalance += amt;
      } else {
        runningBalance -= amt;
      }
    }
    r.balance = runningBalance;
  });

  return forecastPool;
}
