import { compareLedgerRecords, normalizeLedgerDate } from './ledger-utils.js';

export function isFixedRecord(r) {
  if (!r) return false;
  return r.fixedCost === '고정비' || r.fixedCost === '고정' || (r.fixedCost && r.fixedCost !== 'false');
}

/**
 * 토스은행, 기업은행, 현금의 모든 거래를 단 한 건도 생략 없이 100% 전수 취합하여
 * 통합 시작 잔액에서 출발하는 실시간 통합 누적 잔액(Total Running Balance)을 계산합니다.
 */
export function generateForecastRecords(ledgerDataSources = {}) {
  const cardList = ledgerDataSources.card || [];
  const tossRecords = cardList.filter(r => r.payment === '토스은행' || r.sheetName === '토스은행');
  const cardRecords = cardList.filter(r => r.payment === '기업카드' || r.sheetName === '기업카드');
  const bankRecords = ledgerDataSources.bank || [];
  const cashRecords = ledgerDataSources.cash || [];

  const forecastPool = [];

  // 1. 토스은행의 '모든' 거래 100% 추가 (생략 없음!)
  tossRecords.forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-toss-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '토스은행'
    });
  });

  // 2. 기업은행의 '모든' 거래 100% 추가 (생략 없음!)
  bankRecords.forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-bank-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '기업은행'
    });
  });

  // 3. 현금의 '모든' 거래 100% 추가 (생략 없음!)
  cashRecords.forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-cash-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '현금'
    });
  });

  // 4. 날짜순 정렬
  forecastPool.sort(compareLedgerRecords);

  // 5. 각 계좌의 시작 잔액 합산 (2026년 통합 시작 잔액)
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
  const cashOpening = getAccountOpeningBalance(cashRecords);
  const totalOpeningBalance = tossOpening + bankOpening + cashOpening;

  // 6. 통합 시작 잔액에서 출발하여 전체 실시간 연속 누적 잔액(Running Balance) 계산!
  let runningBalance = totalOpeningBalance;
  forecastPool.forEach(r => {
    const amt = Number(r.amount || 0);
    if (r.type === 'income') {
      runningBalance += amt;
    } else {
      runningBalance -= amt;
    }
    r.balance = runningBalance;
  });

  return forecastPool;
}
