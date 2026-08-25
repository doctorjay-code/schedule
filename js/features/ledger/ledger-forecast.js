import { compareLedgerRecords, normalizeLedgerDate } from './ledger-utils.js';

export function isFixedRecord(r) {
  if (!r) return false;
  return r.fixedCost === '고정비' || r.fixedCost === '고정' || (r.fixedCost && r.fixedCost !== 'false');
}

/**
 * 기업은행 <-> 토스은행 간의 단순 본인 통장 이동 거래만 핀포인트 제외
 * (일반 송금, 김지은/김민지 등 사람에게 보낸 생활비 이체, 캐시백, 이자, ATM입금 등은 100% 정상 포함!)
 */
export function isInternalTransfer(r) {
  if (!r) return false;
  const item = String(r.item || '').trim();
  const memo = String(r.memo || '').trim();
  const payment = String(r.payment || r.sheetName || '').trim();

  // 1. 기업은행 -> 토스 이체 출금 (모임통장)
  if (payment === '기업은행' && r.type === 'expense' && (item.includes('모임통장') || item.includes('모임통 장') || memo.includes('토스뱅크 이체') || memo.includes('토스 이체'))) {
    return true;
  }

  // 2. 토스은행 -> 기업은행 카드값/대출금 송금 출금 (박주하 본인 계좌 송금)
  if (payment === '토스은행' && r.type === 'expense' && item === '박주하' && (memo.includes('기업카드') || memo.includes('대출이자') || memo.includes('이체'))) {
    return true;
  }

  // 3. 기업은행 <- 토스 송금 입금 (박주하 본인 계좌 송금)
  if (payment === '기업은행' && r.type === 'income' && item === '박주하' && (memo.includes('토스') || memo.includes('이체'))) {
    return true;
  }

  return false;
}

/**
 * 기업은행, 토스은행, 기업카드, 현금의 전체 데이터를 바탕으로
 * 고정비 분리 + 토스 월급 수입 분리 + 이체 제외 + 실시간 가변 생활비/카드값 자동 집계 + 통합 누적 잔액(Running Balance)을 계산한
 * 잔액전망 레코드 목록을 실시간 동적으로 생성합니다.
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

  // 1. 토스은행 월급 수입 항목들 단독 행으로 추가 (이체 제외)
  tossRecords.filter(r => r.type === 'income' && (r.category === '월급' || r.memo?.includes('월급')) && !isInternalTransfer(r)).forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-toss-salary-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '토스은행',
      category: '월급'
    });
  });

  // 2. 토스은행 고정비 항목들 단독 행으로 추가 (월급 및 이체 제외)
  tossRecords.filter(isFixedRecord).filter(r => r.category !== '월급' && !r.memo?.includes('월급') && !isInternalTransfer(r)).forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-toss-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '토스은행'
    });
  });

  // 3. 기업은행 수입/지출 항목들 추가 (수기 카드결제 및 이체 제외)
  bankRecords.forEach(r => {
    const isManualCardPay = r.item && (r.item.includes('비씨카드') || r.item.includes('기업카드출금'));
    if (isManualCardPay) return; // 기업카드(가변/고정)와 중복 방지
    if (isInternalTransfer(r)) return; // 통장 간 내부 이체 제외

    forecastPool.push({
      ...r,
      id: `fc-bank-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '기업은행'
    });
  });

  // 4. 현금 고정비/주요 항목 추가 (이체 제외)
  cashRecords.filter(isFixedRecord).filter(r => !isInternalTransfer(r)).forEach(r => {
    forecastPool.push({
      ...r,
      id: `fc-cash-${r.id}`,
      originalId: r.id,
      source: 'forecast',
      payment: '현금'
    });
  });

  // 5. 월별 가변비 합산 생성 (토스 생활비 & 기업카드 결제액)
  months.forEach(mStr => {
    const [y, m] = mStr.split('-').map(Number);
    const mNum = m;

    // A. 토스은행 생활비(가변) (매월 1일) - 고정비, 월급, 이체 제외한 순수 생활비만 집계!
    const tossMonthVars = tossRecords.filter(r => {
      const d = normalizeLedgerDate(r.date);
      const isSalary = r.type === 'income' && (r.category === '월급' || r.memo?.includes('월급'));
      return d.startsWith(mStr) && !isFixedRecord(r) && !isSalary && !isInternalTransfer(r);
    });
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
        category: '',
        person: '',
        memo: `${mNum}월 토스 생활비 (${tossMonthVars.length}건)`,
        fixedCost: '',
        source: 'forecast',
        isAggregate: true,
        subRecords: [...tossMonthVars].sort(compareLedgerRecords)
      });
    }

    // B. 기업카드 청구분 (매월 27일) - 1월은 결제 없음, 1월 1일~2월 13일 전체가 2월 27일에 결제됨
    let cardStart = null;
    let cardEnd = null;
    if (m === 1) {
      // 1월에는 기업카드 청구가 없음 (2월에 합산)
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

  // 6. 각 계좌(토스은행, 기업은행, 현금)의 2026년 시작 잔액(Opening Balance) 합산
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

  // 7. 통합 시작 잔액에서 출발하여 전체 누적 잔액(Running Balance) 실시간 계산
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
