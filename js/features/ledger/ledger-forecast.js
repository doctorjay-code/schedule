import { compareLedgerRecords, normalizeLedgerDate } from './ledger-utils.js';

export function isFixedRecord(r) {
  if (!r) return false;
  return r.fixedCost === '고정비' || r.fixedCost === '고정' || (r.fixedCost && r.fixedCost !== 'false');
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
 * 토스은행, 기업은행, 현금의 모든 거래를 온전히 반영하고,
 * 기업은행의 수기 카드결제 중복을 제거한 뒤 27일 결제일에 실시간 기업카드(고정/가변)를 배치하여
 * 실시간 통합 누적 잔액(Total Running Balance)을 계산합니다.
 */
export function generateForecastRecords(ledgerDataSources = {}) {
  const cardList = ledgerDataSources.card || [];
  const tossRecords = cardList.filter(r => r.payment === '토스은행' || r.sheetName === '토스은행');
  const cardRecords = cardList.filter(r => r.payment === '기업카드' || r.sheetName === '기업카드');
  const bankRecords = ledgerDataSources.bank || [];
  const cashRecords = ledgerDataSources.cash || [];

  // 2026-01부터 시작하는 모든 월 목록 추출
  const monthSet = new Set();
  [...tossRecords, ...cardRecords, ...bankRecords, ...cashRecords].forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (dStr >= '2026-01-01') {
      monthSet.add(dStr.slice(0, 7));
    }
  });

  const nowIso = new Date().toISOString().slice(0, 7);
  monthSet.add(nowIso);
  const months = Array.from(monthSet).sort();

  const forecastPool = [];

  // 1. 토스은행의 '모든' 거래 100% 추가
  tossRecords.forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-toss-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '토스은행'
    });
  });

  // 2. 기업은행의 모든 거래 추가 (수기 카드결제 중복만 제외)
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

  // 3. 현금의 '모든' 거래 100% 추가
  cashRecords.forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-cash-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '현금'
    });
  });

  // 4. 매월 27일 기업카드 청구분 실시간 자동 집계 (고정비 / 변동비 분리)
  months.forEach(mStr => {
    const [y, m] = mStr.split('-').map(Number);
    const mNum = m;

    let cardStart = null;
    let cardEnd = null;
    if (m === 1) {
      // 1월에는 결제 없음 (2월에 합산)
      cardStart = null;
      cardEnd = null;
    } else if (m === 2) {
      // 2월 27일 청구: 1월 1일 ~ 2월 13일 전체 거래 합산
      cardStart = `${y}-01-01`;
      cardEnd = `${y}-02-13`;
    } else {
      const prevMonthStr = `${y}-${String(m - 1).padStart(2, '0')}`;
      cardStart = `${prevMonthStr}-14`;
      cardEnd = `${mStr}-13`;
    }

    if (cardStart && cardEnd) {
      // 1) 기업카드 고정비 통합 행 (27일)
      const cardMonthFixed = cardRecords.filter(r => {
        const d = normalizeLedgerDate(r.date);
        return d >= cardStart && d <= cardEnd && isFixedRecord(r);
      });
      const cardFixedTotal = cardMonthFixed.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);

      if (cardMonthFixed.length > 0) {
        forecastPool.push({
          id: `fc-fix-card-${mStr}`,
          date: `${mStr}-27`,
          item: '기업카드(고정)',
          amount: cardFixedTotal,
          type: 'expense',
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
      const cardVarTotal = cardMonthVars.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);

      if (cardMonthVars.length > 0) {
        forecastPool.push({
          id: `fc-var-card-${mStr}`,
          date: `${mStr}-27`,
          item: '기업카드(가변)',
          amount: cardVarTotal,
          type: 'expense',
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

  // 5. 날짜순 정렬
  forecastPool.sort(compareLedgerRecords);

  // 6. 각 계좌의 시작 잔액 합산 (2026년 통합 시작 잔액)
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

  // 7. 통합 시작 잔액에서 출발하여 전체 실시간 연속 누적 잔액(Running Balance) 계산!
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
