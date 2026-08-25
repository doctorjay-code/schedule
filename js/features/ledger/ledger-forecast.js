import { compareLedgerRecords, normalizeLedgerDate } from './ledger-utils.js';

export function isFixedRecord(r) {
  if (!r) return false;
  return r.fixedCost === '고정비' || r.fixedCost === '고정' || (r.fixedCost && r.fixedCost !== 'false');
}

/**
 * 기업은행, 토스은행, 기업카드, 현금의 전체 데이터를 바탕으로
 * 고정비 분리 + 실시간 가변 생활비/카드값 자동 집계 + 통합 누적 잔액(Running Balance)을 계산한
 * 잔액전망 레코드 목록을 실시간 동적으로 생성합니다.
 */
export function generateForecastRecords(ledgerDataSources = {}) {
  const cardList = ledgerDataSources.card || [];
  const tossRecords = cardList.filter(r => r.payment === '토스은행');
  const cardRecords = cardList.filter(r => r.payment === '기업카드');
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

  // 1. 토스은행 고정비 항목들 단독 행으로 추가
  tossRecords.filter(isFixedRecord).forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-toss-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '토스은행'
    });
  });

  // 2. 기업은행 수입/지출 항목들 추가 (수기 카드결제 중복 제외)
  bankRecords.forEach(r => {
    const isManualCardPay = r.item && (r.item.includes('비씨카드') || r.item.includes('기업카드출금'));
    if (isManualCardPay) return; // 기업카드(가변) 및 고정비와 중복 방지

    forecastPool.push({
      ...r,
      id: `fc-bank-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '기업은행'
    });
  });

  // 3. 현금 고정비/주요 항목 추가
  cashRecords.filter(isFixedRecord).forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-cash-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '현금'
    });
  });

  // 4. 월별 가변비 합산 생성 (토스 생활비 & 기업카드 결제액)
  months.forEach(mStr => {
    const [y, m] = mStr.split('-').map(Number);
    const mNum = m;

    // A. 토스은행 생활비(가변) (매월 1일)
    const tossMonthVars = tossRecords.filter(r => normalizeLedgerDate(r.date).startsWith(mStr) && !isFixedRecord(r));
    const tossVarExpense = tossMonthVars.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);
    const tossVarIncome = tossMonthVars.reduce((sum, r) => sum + (r.type === 'income' ? Number(r.amount || 0) : 0), 0);
    const netTossVar = tossVarExpense - tossVarIncome;

    if (tossMonthVars.length > 0) {
      forecastPool.push({
        id: `fc-var-toss-${mStr}`,
        date: `${mStr}-01`,
        item: '생활비(가변)',
        amount: netTossVar >= 0 ? netTossVar : Math.abs(netTossVar),
        type: netTossVar >= 0 ? 'expense' : 'income',
        payment: '토스은행',
        category: '생활',
        person: '기타',
        memo: `${mNum}월 토스 생활비 실시간 합산 (${tossMonthVars.length}건)`,
        fixedCost: '',
        source: 'forecast'
      });
    }

    // B. 기업카드 청구분(가변) (매월 27일)
    // 정산 주기: 전달 14일 ~ 이번달 13일 (1월/2월 예외 포함)
    let cardStart;
    let cardEnd;
    if (m === 1) {
      cardStart = `${y}-01-01`;
      cardEnd = `${y}-01-13`;
    } else if (m === 2) {
      cardStart = `${y}-01-01`;
      cardEnd = `${y}-02-13`;
    } else {
      const prevMonthStr = `${y}-${String(m - 1).padStart(2, '0')}`;
      cardStart = `${prevMonthStr}-14`;
      cardEnd = `${mStr}-13`;
    }

    const cardMonthVars = cardRecords.filter(r => {
      const d = normalizeLedgerDate(r.date);
      return d >= cardStart && d <= cardEnd && !isFixedRecord(r);
    });
    const cardVarTotal = cardMonthVars.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : 0), 0);

    // 기업카드 고정비 항목들도 27일 결제일에 기업은행 출금으로 배치
    const cardMonthFixed = cardRecords.filter(r => {
      const d = normalizeLedgerDate(r.date);
      return d >= cardStart && d <= cardEnd && isFixedRecord(r);
    });
    cardMonthFixed.forEach(r => {
      forecastPool.push({
        ...r,
        id: `fc-card-fix-${r.id}`,
        originalId: r.id,
        date: `${mStr}-27`,
        item: `${r.item}(카드고정)`,
        payment: '기업은행',
        source: 'forecast'
      });
    });

    if (cardMonthVars.length > 0) {
      forecastPool.push({
        id: `fc-var-card-${mStr}`,
        date: `${mStr}-27`,
        item: '기업카드(가변)',
        amount: cardVarTotal,
        type: 'expense',
        payment: '기업은행',
        category: '생활',
        person: '기타',
        memo: `${mNum}월 기업카드 실시간 청구 합산 (${cardMonthVars.length}건)`,
        fixedCost: '',
        source: 'forecast'
      });
    }
  });

  // 5. 날짜순 정렬
  forecastPool.sort(compareLedgerRecords);

  // 6. 통합 누적 잔액(Running Balance) 실시간 일괄 계산
  let runningBalance = 0;
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
