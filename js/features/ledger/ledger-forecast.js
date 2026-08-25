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

  // 2. 기업은행의 모든 거래 추가 (수기 카드결제 중복만 제외하고 이체/급여/대출상환 100% 표시)
  bankRecords.forEach(r => {
    if (isManualCardPayment(r)) return; // 27일 기업카드(고정/가변)로 대체

    forecastPool.push({
      ...r,
      id: `fc-bank-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '기업은행'
    });
  });

  // 3. 월별 가변비 합산 생성 (토스 순수가변 생활비 & 기업카드 27일 청구액)
  months.forEach(mStr => {
    const [y, m] = mStr.split('-').map(Number);
    const mNum = m;

    // A. 토스은행 생활비(가변) (매월 1일) - 고정비도 아니고 이체/월급도 아닌 순수 생활비 지출만 집계!
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
        subRecords: [...tossMonthVars].sort(compareLedgerRecords)
      });
    }

    // B. 기업카드 청구분 (매월 27일) - 1월은 결제 없음, 1월 1일~2월 12일 전체가 2월 27일에 결제됨
    let cardStart = null;
    let cardEnd = null;
    if (m === 1) {
      cardStart = null;
      cardEnd = null;
    } else if (m === 2) {
      cardStart = `${y}-01-01`;
      cardEnd = `${y}-02-12`;
    } else {
      const prevMonthStr = `${y}-${String(m - 1).padStart(2, '0')}`;
      cardStart = `${prevMonthStr}-13`;
      cardEnd = `${mStr}-12`;
    }

    if (cardStart && cardEnd) {
      // 1) 기업카드 고정비 통합 행 (27일)
      const cardMonthFixed = cardRecords.filter(r => {
        const d = normalizeLedgerDate(r.date);
        return d >= cardStart && d <= cardEnd && isFixedRecord(r);
      });
      const cardFixedExp = cardMonthFixed.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);
      const cardFixedInc = cardMonthFixed.reduce((sum, r) => sum + (r.type === 'income' ? Number(r.amount || 0) : 0), 0);

      if (cardMonthFixed.length > 0) {
        forecastPool.push({
          id: `fc-fix-card-${mStr}`,
          date: `${mStr}-27`,
          item: '기업카드(고정)',
          amount: cardFixedExp - cardFixedInc,
          incomeAmount: cardFixedInc,
          expenseAmount: cardFixedExp,
          type: 'aggregate',
          payment: '기업은행',
          category: '',
          person: '',
          memo: `${mNum}월 기업카드 고정비 (${cardMonthFixed.length}건)`,
          fixedCost: '고정비',
          source: 'forecast',
          isAggregate: true,
          subRecords: [...cardMonthFixed].sort(compareLedgerRecords)
        });
      }

      // 2) 기업카드 변동비 통합 행 (27일)
      const cardMonthVars = cardRecords.filter(r => {
        const d = normalizeLedgerDate(r.date);
        return d >= cardStart && d <= cardEnd && !isFixedRecord(r);
      });
      const cardVarExp = cardMonthVars.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);
      const cardVarInc = cardMonthVars.reduce((sum, r) => sum + (r.type === 'income' ? Number(r.amount || 0) : 0), 0);

      if (cardMonthVars.length > 0) {
        forecastPool.push({
          id: `fc-var-card-${mStr}`,
          date: `${mStr}-27`,
          item: '기업카드(가변)',
          amount: cardVarExp - cardVarInc,
          incomeAmount: cardVarInc,
          expenseAmount: cardVarExp,
          type: 'aggregate',
          payment: '기업은행',
          category: '',
          person: '',
          memo: `${mNum}월 기업카드 변동비 (${cardMonthVars.length}건)`,
          fixedCost: '',
          source: 'forecast',
          isAggregate: true,
          subRecords: [...cardMonthVars].sort(compareLedgerRecords)
        });
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
    return rawBal - (first.type === 'income' ? firstAmt : -firstAmt);
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
