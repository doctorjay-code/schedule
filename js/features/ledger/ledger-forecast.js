import { insertLedgerRecordsBatch, upsertLedgerOffsetGroup, fetchForecastAggregateOverrides, saveForecastAggregateOverridesToDB } from '../../services/ledger/ledger-api.js';
import { compareLedgerRecords, normalizeLedgerDate, generateLedgerId } from './ledger-utils.js';

// 🌟 Zero-localStorage: 순수 메모리 상태 & Supabase DB 영구 저장 직결
let inMemoryAggregateOverrides = {};

export function loadForecastAggregateOverrides() {
  return inMemoryAggregateOverrides;
}

export function saveForecastAggregateOverride(aggregateKey, overrideObj) {
  if (!aggregateKey || typeof aggregateKey !== 'string') return;
  inMemoryAggregateOverrides[aggregateKey] = {
    ...(inMemoryAggregateOverrides[aggregateKey] || {}),
    ...overrideObj,
    updatedAt: Date.now()
  };
  try {
    saveForecastAggregateOverridesToDB(inMemoryAggregateOverrides);
  } catch (err) {
    console.warn('Failed to save aggregate override:', err);
  }
}

export async function syncForecastAggregateOverridesFromDB() {
  try {
    const remote = await fetchForecastAggregateOverrides();
    if (remote && typeof remote === 'object') {
      inMemoryAggregateOverrides = { ...inMemoryAggregateOverrides, ...remote };
    }
  } catch (err) {
    console.warn('Failed to sync forecast aggregate overrides from DB:', err);
  }
}

export function isManualCardPayment(record) {
  if (!record) return false;
  const isCard = (record.payment_method || record.payment || record.sheetName) === '기업카드';
  if (!isCard) return false;
  const item = String(record.item || '').trim();
  const memo = String(record.memo || '').trim();
  return item.includes('기업카드 결제') || item.includes('카드대금') || memo.includes('기업카드 결제') || memo.includes('카드대금');
}

/**
 * 잔액전망 통합 엔진
 */
export function generateForecastRecords({
  allRecords = [],
  monthCursor = new Date(),
  isManualCardPayment = () => false
}) {
  const aggregateOverrides = loadForecastAggregateOverrides();

  // 1. 전체 레코드에서 존재하는 모든 월(YYYY-MM) 수집
  const monthKeysSet = new Set();
  allRecords.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (dStr && dStr.length >= 7 && dStr >= '2026-01') {
      monthKeysSet.add(dStr.slice(0, 7));
    }
  });

  const curYear = monthCursor.getFullYear();
  const curMonth = monthCursor.getMonth() + 1;
  const currentCursorKey = `${curYear}-${String(curMonth).padStart(2, '0')}`;
  monthKeysSet.add(currentCursorKey);

  const sortedMonths = Array.from(monthKeysSet).sort();
  const displayRows = [];

  sortedMonths.forEach(targetMonthKey => {
    const [tYStr, tMStr] = targetMonthKey.split('-');
    const targetYear = parseInt(tYStr, 10);
    const targetMonth = parseInt(tMStr, 10) - 1; // 0-indexed

    const tossRecords = [];
    const bankRecords = [];
    const cardRecordsForBilling = [];
    const manualCardPayments = [];

    // 카드 결제주기: 전월 13일 ~ 당월 12일
    let cardStartYear = targetYear;
    let cardStartMonth = targetMonth - 1;
    if (cardStartMonth < 0) {
      cardStartMonth = 11;
      cardStartYear -= 1;
    }
    const cardStartDate = `${cardStartYear}-${String(cardStartMonth + 1).padStart(2, '0')}-13`;
    const cardEndDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-12`;

    // 1. 전체 실거래 순회 및 분류
    allRecords.forEach(r => {
      const sheet = r.payment_method || r.payment || r.sheetName || '';
      const dateStr = normalizeLedgerDate(r.date);
      if (!dateStr) return;

      if (isManualCardPayment(r)) {
        if (dateStr.startsWith(targetMonthKey)) {
          manualCardPayments.push(r);
        }
        return;
      }

      if (sheet === '기업카드') {
        if (dateStr >= cardStartDate && dateStr <= cardEndDate) {
          cardRecordsForBilling.push(r);
        }
      } else if (sheet === '토스은행') {
        if (dateStr.startsWith(targetMonthKey)) {
          tossRecords.push(r);
        }
      } else if (sheet === '기업은행') {
        if (dateStr.startsWith(targetMonthKey)) {
          bankRecords.push(r);
        }
      }
    });

    // 2. 가상 행(토스 생활비 지출 & 기업카드 결제대금) 산출
    // [분류 규칙]: 토스은행 중 '월급', '고정비', '이체' 3종 세트만 개별 독립 행으로 분리, 나머지는 모두 토스 생활비로 집계
    let tossLivingExpenses = 0;
    let tossLivingIncome = 0;
    const tossLivingRecords = [];

    tossRecords.forEach(r => {
      const isFixed = r.fixed_cost === '고정비' || r.fixedCost === '고정비';
      const isSalary = (r.category || '').includes('월급') || (r.item || '').includes('월급');
      const isTransfer = (r.category || '').includes('이체') || (r.item || '').includes('이체');
      const isStandalone = isFixed || isSalary || isTransfer;

      if (isStandalone) {
        displayRows.push({
          ...r,
          id: r.id,
          originalId: r.id,
          isForecastItem: true,
          sourceSheet: '토스은행'
        });
      } else {
        const amt = Number(r.amount || 0);
        const isExp = (r.type || 'expense').toLowerCase() === 'expense';
        if (isExp) {
          tossLivingExpenses += amt;
        } else {
          tossLivingIncome += amt;
        }
        tossLivingRecords.push(r);
      }
    });

    let cardBillingTotal = 0;
    cardRecordsForBilling.forEach(r => {
      const amt = Number(r.amount || 0);
      cardBillingTotal += ((r.type || 'expense').toLowerCase() === 'income' ? -amt : amt);
    });

    // 3-1. 기업은행 레코드 (실제 카드 결제 출금 거래 포함)
    let hasRealCardBill = false;
    bankRecords.forEach(r => {
      const isExpense = (r.type || 'expense').toLowerCase() === 'expense';
      const itemText = String(r.item || '');
      const memoText = String(r.memo || '');
      const catText = String(r.category || '');
      const isCardBill = isExpense && (itemText.includes('기업카드') || itemText.includes('카드대금') || itemText.includes('비씨카드') || itemText.includes('BC카드') || memoText.includes('기업카드') || catText.includes('카드대금'));

      if (isCardBill) {
        hasRealCardBill = true;
        displayRows.push({
          ...r,
          id: r.id,
          originalId: r.id,
          isForecastItem: true,
          hasCardAccordion: true,
          subRecords: cardRecordsForBilling,
          sourceSheet: '기업은행'
        });
      } else {
        displayRows.push({
          ...r,
          id: r.id,
          originalId: r.id,
          isForecastItem: true,
          sourceSheet: '기업은행'
        });
      }
    });

    // 3-2. 가상 토스 생활비 합산행 (토스 실제 데이터가 존재하는 월부터만 생성)
    const tossMonths = allRecords.filter(r => (r.payment_method || r.payment || r.sheetName) === '토스은행').map(r => normalizeLedgerDate(r.date).slice(0, 7)).filter(Boolean).sort();
    const minTossMonth = tossMonths[0] || '2026-02';

    if (targetMonthKey >= minTossMonth) {
      const tossVarKey = `fc-var-toss-${targetMonthKey}`;
      const tossVarOverride = aggregateOverrides[tossVarKey] || {};
      displayRows.push({
        id: tossVarKey,
        date: tossVarOverride.date || `${targetMonthKey}-01`,
        orderIndex: -999999, // 🌟 해당 월 1일 거래들 중 최상단(1위) 고정
        type: 'expense',
        amount: tossVarOverride.amount !== undefined ? Number(tossVarOverride.amount) : Math.max(0, tossLivingExpenses - tossLivingIncome),
        incomeAmount: tossLivingIncome,
        expenseAmount: tossLivingExpenses,
        balance: 0,
        payment: '토스은행',
        item: tossVarOverride.item || '토스 생활비 (변동비 합계)',
        person: tossVarOverride.person || '',
        category: tossVarOverride.category || '생활',
        memo: tossVarOverride.memo || '토스 계좌 실시간 변동지출 자동 합산',
        fixedCost: tossVarOverride.fixedCost || '',
        isAggregate: true,
        isVirtualAggregate: true,
        subRecords: tossLivingRecords,
        sourceSheet: '토스은행'
      });
    }

    // 3-3. 기업카드 결제대금 행: 실제 출금 거래가 없는 현재/미래 월에만 가상 예상행 생성!
    if (!hasRealCardBill && targetMonthKey >= currentCursorKey) {
      const cardEstKey = `fc-est-card-${targetMonthKey}`;
      const cardEstOverride = aggregateOverrides[cardEstKey] || {};
      displayRows.push({
        id: cardEstKey,
        date: cardEstOverride.date || `${targetMonthKey}-23`,
        type: 'expense',
        amount: cardEstOverride.amount !== undefined ? Number(cardEstOverride.amount) : Math.max(0, cardBillingTotal),
        balance: 0,
        payment: '토스은행',
        item: cardEstOverride.item || '기업카드 결제대금',
        person: cardEstOverride.person || '',
        category: cardEstOverride.category || '카드대금',
        memo: cardEstOverride.memo || `${cardStartDate.slice(5)} ~ ${cardEndDate.slice(5)} 실사용 합산`,
        fixedCost: cardEstOverride.fixedCost || '고정비',
        isAggregate: true,
        hasCardAccordion: true,
        isVirtualAggregate: true,
        subRecords: cardRecordsForBilling,
        sourceSheet: '기업카드'
      });
    }
  });

  // 4. 잔액전망 순서 정렬 적용 (forecast_order_index 기준 100% 순수 DB 정렬)
  displayRows.sort((a, b) => compareLedgerRecords(a, b, true));

  return {
    displayRows
  };
}

/**
 * 다음 달 고정비 원클릭 복사 엔진 (+1 month copy)
 */
export async function copyMonthFixedRecordsToNextMonth({
  allRecords = [],
  sourceMonthCursor = new Date(),
  saveRecordsBatchFn = insertLedgerRecordsBatch,
  saveOffsetGroupFn = upsertLedgerOffsetGroup
}) {
  const sy = sourceMonthCursor.getFullYear();
  const sm = sourceMonthCursor.getMonth() + 1; // 1-indexed
  const sourceMonthKey = `${sy}-${String(sm).padStart(2, '0')}`;

  let ty = sy;
  let tm = sm + 1;
  if (tm > 12) {
    tm = 1;
    ty += 1;
  }
  const targetMonthKey = `${ty}-${String(tm).padStart(2, '0')}`;

  // 1. 해당 월(sourceMonth)의 고정비 및 상계 거래 추출
  const toCopyBank = [];
  const toCopyCard = [];

  allRecords.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (!dStr || !dStr.startsWith(sourceMonthKey)) return;

    const isFixed = r.fixed_cost === '고정비' || r.fixedCost === '고정비';
    const isOffset = Boolean(r.offset_group_id);
    const sheet = r.payment_method || r.payment || r.sheetName || '토스은행';

    if (sheet === '기업카드') {
      if (isFixed) toCopyCard.push(r);
    } else {
      if (isFixed || isOffset) toCopyBank.push(r);
    }
  });

  const totalCount = toCopyBank.length + toCopyCard.length;
  if (totalCount === 0) {
    return { ok: false, message: `${sm}월 고정비가 이미 ${tm}월에 모두 등록되어 있어 추가로 복사할 거래가 없습니다 (중복 방지 완료).` };
  }

  // 2. 새 레코드 매핑 생성
  const newRecordsBySheet = {};
  const idMapping = {}; // oldId -> newId

  // 2-1. 일반 통장 거래 복사 매핑
  toCopyBank.forEach((r, idx) => {
    const oldDateStr = normalizeLedgerDate(r.date);
    const day = oldDateStr.slice(8);
    const maxDaysInTargetMonth = new Date(ty, tm, 0).getDate();
    const safeDay = Math.min(Number(day), maxDaysInTargetMonth);
    const newDateStr = `${targetMonthKey}-${String(safeDay).padStart(2, '0')}`;

    const newId = generateLedgerId(newDateStr, idx);
    idMapping[String(r.id)] = newId;
    if (r.originalId) idMapping[String(r.originalId)] = newId;

    const sheetName = r.sheetName || (r.payment === '기업은행' ? '기업은행' : r.payment === '현금' ? '현금' : '토스은행');

    const isOffset = sourceOffsetRecordIds.has(String(r.id)) || sourceOffsetRecordIds.has(String(r.originalId));
    const newAmount = isOffset ? 0 : Number(r.amount || 0);

    const newRecord = {
      id: newId,
      date: newDateStr,
      type: r.type,
      amount: newAmount,
      balance: 0,
      payment: r.payment || (sheetName === '기업은행' ? '기업은행' : sheetName === '현금' ? '현금' : '토스은행'),
      item: r.item || '',
      person: r.person || r.user_name || '기타',
      category: r.category || '',
      memo: r.memo || '',
      fixedCost: r.fixedCost || '', // 원래 고정비였던 것만 고정비 유지!
      orderIndex: (idx + 1) * 10,
      createdAt: (idx + 1) * 10,
      source: 'supabase',
      sheetName
    };

    (newRecordsBySheet[sheetName] ||= []).push(newRecord);
  });

  // 2-2. 기업카드 고정비 거래 복사 매핑 (+1 month)
  toCopyCard.forEach((c, idx) => {
    const oldDateStr = normalizeLedgerDate(c.date);
    const [cy, cm, cd] = oldDateStr.split('-').map(Number);
    let nextY = cy;
    let nextM = cm + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    const maxDays = new Date(nextY, nextM, 0).getDate();
    const safeDay = Math.min(cd, maxDays);
    const newDateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

    const newId = generateLedgerId(newDateStr, idx);
    idMapping[String(c.id)] = newId;
    if (c.originalId) idMapping[String(c.originalId)] = newId;

    const newCardRecord = {
      id: newId,
      date: newDateStr,
      type: c.type || 'expense',
      amount: Number(c.amount || 0),
      balance: 0,
      payment: '기업카드',
      item: c.item || '',
      person: c.person || c.user_name || '기타',
      category: c.category || '',
      memo: c.memo || '',
      fixedCost: '고정비',
      orderIndex: (idx + 1) * 10,
      createdAt: (idx + 1) * 10,
      source: 'supabase',
      sheetName: '기업카드'
    };

    (newRecordsBySheet['기업카드'] ||= []).push(newCardRecord);
  });

  // 3. 일괄 저장 실행
  const flatToInsert = Object.values(newRecordsBySheet).flat();
  if (flatToInsert.length > 0) {
    await saveRecordsBatchFn(flatToInsert);
  }

  // 4. 상계 그룹 복제 및 연결
  let offsetGroupCount = 0;
  for (const group of Object.values(allOffsetGroups)) {
    const groupRecordIds = group.recordIds || [];
    const mappedIds = groupRecordIds
      .map(id => idMapping[String(id)])
      .filter(Boolean);

    if (mappedIds.length === groupRecordIds.length && mappedIds.length > 0) {
      const newGroupId = `offset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newGroup = {
        id: newGroupId,
        title: group.title || '상계 묶음',
        recordIds: mappedIds
      };
      await saveOffsetGroupFn(newGroup);
      offsetGroupCount++;
    }
  }

  return {
    ok: true,
    count: flatToInsert.length,
    offsetGroupCount,
    targetMonth: tm,
    targetYear: ty
  };
}
