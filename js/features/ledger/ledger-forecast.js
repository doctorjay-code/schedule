import { insertLedgerRecordsBatch, upsertLedgerOffsetGroup, fetchForecastAggregateOverrides, saveForecastAggregateOverridesToDB } from '../../services/ledger/ledger-api.js';
import { compareLedgerRecords, normalizeLedgerDate, generateLedgerId, getRecordMonthGroup } from './ledger-utils.js';
import { buildOffsetGroupsFromRecords } from './ledger-offset-groups.js';

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
 * 🌟 기업카드 실사용 내역을 기반으로 기업은행 매월 27일 결제행 자동 계산 및 실시간 동기화
 */
export async function syncBankCardBillRecords({ allRecords = [], upsertRecordFn, onLocalUpdated }) {
  if (!Array.isArray(allRecords) || typeof upsertRecordFn !== 'function') return;

  const cardRecords = allRecords.filter(r => (r.payment_method || r.payment || r.sheetName) === '기업카드');

  // 전체 카드 거래에서 발생한 모든 청구월 + 기업은행에 이미 존재하는 카드 결제행의 월 수집
  const billingMonths = new Set();
  cardRecords.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (!dStr) return;
    const [yStr, mStr, dayStr] = dStr.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10);
    const day = parseInt(dayStr, 10);
    if (day >= 13) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    const billMonthKey = `${y}-${String(m).padStart(2, '0')}`;
    if (billMonthKey >= '2026-08') {
      billingMonths.add(billMonthKey);
    }
  });

  // 기업은행에 이미 존재하는 모든 카드 결제행의 청구월도 포괄
  allRecords.forEach(r => {
    const isBank = (r.payment_method || r.payment || r.sheetName) === '기업은행';
    const isCard = String(r.item || '').includes('기업카드') || String(r.memo || '').includes('기업카드 결제');
    if (isBank && isCard) {
      const d = normalizeLedgerDate(r.date);
      if (d && d.length >= 7 && d >= '2026-08') {
        billingMonths.add(d.slice(0, 7));
      }
    }
  });

  const updates = [];
  for (const billMonthKey of Array.from(billingMonths).sort()) {
    const [yStr, mStr] = billMonthKey.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1; // 0-indexed
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 0) { prevM = 11; prevY -= 1; }

    const cardStart = `${prevY}-${String(prevM + 1).padStart(2, '0')}-13`;
    const cardEnd = `${y}-${String(m + 1).padStart(2, '0')}-12`;

    const cycleCards = cardRecords.filter(r => {
      const d = normalizeLedgerDate(r.date);
      return d >= cardStart && d <= cardEnd;
    });

    const cycleTotal = cycleCards.reduce((sum, r) => sum + (r.type === 'expense' ? Number(r.amount || 0) : -Number(r.amount || 0)), 0);

    const paymentDate = `${billMonthKey}-27`;
    const billId = `tr-${billMonthKey.replace('-', '')}-50-crdauto`;

    const existing = allRecords.find(r => {
      const isBank = (r.payment_method || r.payment || r.sheetName) === '기업은행';
      const isExpense = (r.type || 'expense').toLowerCase() === 'expense';
      const d = normalizeLedgerDate(r.date);
      const isCardMemo = String(r.memo || '').includes('기업카드 결제') || String(r.item || '').includes('기업카드');
      return isBank && isExpense && isCardMemo && d.startsWith(billMonthKey);
    });

    if (existing) {
      if (Number(existing.amount) !== cycleTotal) {
        existing.amount = cycleTotal;
        updates.push({ ...existing });
      }
    } else if (cycleTotal > 0) {
      const newRow = {
        id: billId,
        date: paymentDate,
        payment_method: '기업은행',
        payment: '기업은행',
        sheetName: '기업은행',
        type: 'expense',
        amount: cycleTotal,
        category: '상환',
        item: '기업카드',
        person: '쥬쥬',
        user_name: '쥬쥬',
        memo: '쥬쥬 기업카드 결제',
        fixed_cost: '고정비',
        fixedCost: '고정비',
        order_index: 50,
        orderIndex: 50,
        forecast_order_index: 50,
        source: 'supabase'
      };
      allRecords.push(newRow);
      updates.push(newRow);
    }
  }

  if (typeof onLocalUpdated === 'function' && updates.length > 0) {
    onLocalUpdated();
  }

  for (const row of updates) {
    try {
      await upsertRecordFn(row);
    } catch (e) {
      console.warn('Auto-sync card bill record error:', e);
    }
  }
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

  // 1. 전체 실거래 단 1회 사전 인덱싱 (O(N) 단일 순회)
  const monthMap = new Map();
  const allCardRecords = [];

  allRecords.forEach(r => {
    const sheet = r.payment_method || r.payment || r.sheetName || '';
    const dateStr = normalizeLedgerDate(r.date);
    if (!dateStr) return;

    if (sheet === '기업카드') {
      allCardRecords.push({ ...r, normalizedDate: dateStr });
    }

    const mKey = dateStr.slice(0, 7);
    if (!monthMap.has(mKey)) {
      monthMap.set(mKey, { toss: [], bank: [], manualCard: [] });
    }
    const bucket = monthMap.get(mKey);

    if (isManualCardPayment(r)) {
      bucket.manualCard.push(r);
    } else if (sheet === '토스은행') {
      bucket.toss.push(r);
    } else if (sheet === '기업은행') {
      bucket.bank.push(r);
    }
  });

  sortedMonths.forEach(targetMonthKey => {
    const [tYStr, tMStr] = targetMonthKey.split('-');
    const targetYear = parseInt(tYStr, 10);
    const targetMonth = parseInt(tMStr, 10) - 1; // 0-indexed

    const bucket = monthMap.get(targetMonthKey) || { toss: [], bank: [], manualCard: [] };
    const tossRecords = bucket.toss;
    const bankRecords = bucket.bank;
    const manualCardPayments = bucket.manualCard;

    // 카드 결제주기: 전월 13일 ~ 당월 12일 (단, 2월은 1월 1일 ~ 2월 12일 전체 합산)
    let cardStartYear = targetYear;
    let cardStartMonth = targetMonth - 1;
    if (cardStartMonth < 0) {
      cardStartMonth = 11;
      cardStartYear -= 1;
    }
    const cardStartDate = (targetYear === 2026 && targetMonth + 1 === 2)
      ? `${targetYear}-01-01`
      : `${cardStartYear}-${String(cardStartMonth + 1).padStart(2, '0')}-13`;
    const cardEndDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-12`;

    const cardRecordsForBilling = allCardRecords.filter(r => r.normalizedDate >= cardStartDate && r.normalizedDate <= cardEndDate);

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
        const dynamicCardBillAmount = cardRecordsForBilling.length > 0 ? cardBillingTotal : Number(r.amount || 0);
        displayRows.push({
          ...r,
          id: r.id,
          originalId: r.id,
          amount: dynamicCardBillAmount,
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

    // 3-2. 가상 토스 생활비 합산행 (해당 월에 실제 생활비 대상 거래가 1건이라도 있거나 오버라이드한 경우에만 생성!)
    const tossVarKey = `fc-var-toss-${targetMonthKey}`;
    const tossVarOverride = aggregateOverrides[tossVarKey] || {};
    const shouldCreateTossLiving = tossLivingRecords.length > 0 || tossVarOverride.amount !== undefined;

    if (shouldCreateTossLiving) {
      displayRows.push({
        id: tossVarKey,
        date: tossVarOverride.date || `${targetMonthKey}-01`,
        orderIndex: -999999, // 🌟 해당 월 1일 거래들 중 최상단(1위) 고정
        type: tossVarOverride.type || (tossLivingIncome > tossLivingExpenses ? 'income' : 'expense'),
        amount: tossVarOverride.amount !== undefined ? Number(tossVarOverride.amount) : Math.abs(tossLivingExpenses - tossLivingIncome),
        incomeAmount: tossLivingIncome,
        expenseAmount: tossLivingExpenses,
        balance: 0,
        payment: '토스은행',
        item: '토스 생활비',
        person: '',
        category: '',
        memo: '토스 생활비',
        fixedCost: tossVarOverride.fixedCost || '',
        isAggregate: true,
        isVirtualAggregate: true,
        subRecords: tossLivingRecords,
        sourceSheet: '토스은행'
      });
    }

    // 3-3. 기업카드 결제대금 행: 실제 출금 거래가 없고, 해당 주기에 실제 카드 사용 내역이 있거나 오버라이드한 경우에만 생성!
    const cardEstKey = `fc-est-card-${targetMonthKey}`;
    const cardEstOverride = aggregateOverrides[cardEstKey] || {};
    const shouldCreateCardEst = !hasRealCardBill && (cardRecordsForBilling.length > 0 || cardEstOverride.amount !== undefined);

    if (shouldCreateCardEst && targetMonthKey >= currentCursorKey) {
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
 * 다음 달 고정비 & 상계 묶음 원클릭 복사 엔진 (+1 month push)
 */
export async function copyMonthFixedRecordsToNextMonth(
  sourceMonthKeyOrOptions,
  ledgerDataSources = {},
  options = {}
) {
  let sourceMonthKey = '';
  let allRecords = [];
  let saveRecordsBatchFn = insertLedgerRecordsBatch;
  let saveOffsetGroupFn = upsertLedgerOffsetGroup;
  let currentSource = options.source || 'forecast';
  if (options.saveRecordsBatchFn) saveRecordsBatchFn = options.saveRecordsBatchFn;
  if (options.saveOffsetGroupFn) saveOffsetGroupFn = options.saveOffsetGroupFn;

  if (typeof sourceMonthKeyOrOptions === 'string') {
    sourceMonthKey = sourceMonthKeyOrOptions;
    if (Array.isArray(ledgerDataSources)) {
      if (currentSource === 'forecast' || currentSource === 'all') {
        allRecords = ledgerDataSources;
      } else if (currentSource === 'bank') {
        allRecords = ledgerDataSources.filter(r => (r.payment_method || r.payment || r.sheetName) === '기업은행');
      } else if (currentSource === 'cash') {
        allRecords = ledgerDataSources.filter(r => (r.payment_method || r.payment || r.sheetName) === '현금');
      } else if (currentSource === 'card') {
        const targetPayment = options.payment === '기업카드' ? '기업카드' : '토스은행';
        allRecords = ledgerDataSources.filter(r => (r.payment_method || r.payment || r.sheetName) === targetPayment);
      } else {
        allRecords = ledgerDataSources;
      }
    } else {
      const cardList = ledgerDataSources.card || [];
      const tossRecords = cardList.filter(r => (r.payment === '토스은행' || r.sheetName === '토스은행'));
      const cardRecords = cardList.filter(r => (r.payment === '기업카드' || r.sheetName === '기업카드'));
      const bankRecords = ledgerDataSources.bank || [];
      const cashRecords = ledgerDataSources.cash || [];

      if (currentSource === 'forecast') {
        allRecords = [...tossRecords, ...bankRecords, ...cardRecords];
      } else if (currentSource === 'bank') {
        allRecords = [...bankRecords];
      } else if (currentSource === 'cash') {
        allRecords = [...cashRecords];
      } else if (currentSource === 'card') {
        allRecords = options.payment === '기업카드' ? [...cardRecords] : [...tossRecords];
      } else {
        allRecords = [...tossRecords, ...bankRecords, ...cardRecords, ...cashRecords];
      }
    }
  } else if (sourceMonthKeyOrOptions && typeof sourceMonthKeyOrOptions === 'object') {
    allRecords = sourceMonthKeyOrOptions.allRecords || [];
    if (sourceMonthKeyOrOptions.saveRecordsBatchFn) saveRecordsBatchFn = sourceMonthKeyOrOptions.saveRecordsBatchFn;
    if (sourceMonthKeyOrOptions.saveOffsetGroupFn) saveOffsetGroupFn = sourceMonthKeyOrOptions.saveOffsetGroupFn;
    const cursor = sourceMonthKeyOrOptions.sourceMonthCursor || new Date();
    const sy = typeof cursor.getFullYear === 'function' ? cursor.getFullYear() : new Date().getFullYear();
    const sm = typeof cursor.getMonth === 'function' ? cursor.getMonth() + 1 : new Date().getMonth() + 1;
    sourceMonthKey = `${sy}-${String(sm).padStart(2, '0')}`;
  }

  const [sy, sm] = sourceMonthKey.split('-').map(Number);
  let ty = sy;
  let tm = sm + 1;
  if (tm > 12) {
    tm = 1;
    ty += 1;
  }
  const targetMonthKey = `${ty}-${String(tm).padStart(2, '0')}`;

  // 1. 해당 월의 상계 그룹 및 소속 레코드 ID 추출
  const allOffsetGroups = buildOffsetGroupsFromRecords(allRecords);
  const sourceOffsetRecordIds = new Set();
  const sourceOffsetGroups = [];

  Object.values(allOffsetGroups).forEach(group => {
    const gDate = normalizeLedgerDate(group.date);
    if (gDate && gDate.startsWith(sourceMonthKey) && Array.isArray(group.recordIds)) {
      sourceOffsetGroups.push(group);
      group.recordIds.forEach(id => sourceOffsetRecordIds.add(String(id)));
    }
  });

  // 2. 해당 월(sourceMonthKey)의 고정비 및 상계 거래 추출
  const toCopyBank = [];
  const toCopyCard = [];

  allRecords.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (!dStr) return;
    if (String(r.id || '').startsWith('fc-')) return; // 가상 행은 복사 대상에서 원천 제외

    const isFixed = r.fixed_cost === '고정비' || r.fixedCost === '고정비';
    const sheet = r.payment_method || r.payment || r.sheetName || '토스은행';

    if (sheet === '기업카드') {
      // 🌟 기업카드는 결제월 주기(전월 13일 ~ 당월 12일)를 기준으로 당월(sourceMonthKey)에 귀속된 고정비를 추출!
      const cardMonthGroup = getRecordMonthGroup(r, true);
      if (cardMonthGroup === sourceMonthKey && isFixed) {
        toCopyCard.push(r);
      }
    } else {
      if (!dStr.startsWith(sourceMonthKey)) return;
      const isOffset = Boolean(r.offset_group_id) || sourceOffsetRecordIds.has(String(r.id)) || sourceOffsetRecordIds.has(String(r.originalId));
      if (isFixed || isOffset) toCopyBank.push(r);
    }
  });

  const totalCount = toCopyBank.length + toCopyCard.length;
  if (totalCount === 0) {
    return { ok: false, message: `${sm}월에 복사할 고정비 또는 상계 거래가 없습니다.` };
  }

  // 3. 다음 달(targetMonthKey)에 이미 존재하는 기업은행 카드 결제행 검사 (중복 방지)
  const alreadyHasTargetCardBill = allRecords.some(r => {
    const isBank = (r.payment_method || r.payment || r.sheetName) === '기업은행';
    const isCard = String(r.item || '').includes('기업카드') || String(r.memo || '').includes('기업카드 결제');
    const dStr = normalizeLedgerDate(r.date);
    return isBank && isCard && dStr && dStr.startsWith(targetMonthKey);
  });

  // 3. 새 레코드 매핑 생성
  const newRecordsBySheet = {};
  const idMapping = {}; // oldId -> newId

  // 3-1. 일반 통장/은행 거래 복사 매핑
  toCopyBank.forEach((r, idx) => {
    const sheetName = r.sheetName || (r.payment === '기업은행' ? '기업은행' : r.payment === '현금' ? '현금' : '토스은행');
    const isCardBill = (r.payment === '기업은행' || sheetName === '기업은행') &&
      (String(r.item || '').includes('기업카드') || String(r.memo || '').includes('기업카드 결제'));

    // 🌟 이미 다음 달에 기업카드 결제행이 존재한다면, 또 새 행을 만들어 중복시키지 않고 건너뜀!
    if (isCardBill && alreadyHasTargetCardBill) {
      return;
    }

    const oldDateStr = normalizeLedgerDate(r.date);
    const day = oldDateStr.slice(8);
    const maxDaysInTargetMonth = new Date(ty, tm, 0).getDate();
    const safeDay = Math.min(Number(day), maxDaysInTargetMonth);
    const newDateStr = `${targetMonthKey}-${String(safeDay).padStart(2, '0')}`;

    const newId = generateLedgerId(newDateStr, idx);
    idMapping[String(r.id)] = newId;
    if (r.originalId) idMapping[String(r.originalId)] = newId;

    const isOffset = Boolean(r.offset_group_id) || sourceOffsetRecordIds.has(String(r.id)) || sourceOffsetRecordIds.has(String(r.originalId));

    let finalAmount = Number(r.amount || 0);
    let finalItem = r.item || '';
    let finalMemo = r.memo || '';
    let finalPerson = r.person || r.user_name || '기타';
    let finalCategory = r.category || '';
    let finalFixed = r.fixedCost || r.fixed_cost || '';

    if (isCardBill) {
      finalAmount = 0; // 🌟 기업카드 결제행은 금액 0원으로 비우고 틀 복사!
      finalItem = '기업카드';
      finalMemo = '쥬쥬 기업카드 결제';
      finalPerson = '쥬쥬';
      finalCategory = '상환';
      finalFixed = '고정비';
    }

    const newRecord = {
      id: newId,
      date: newDateStr,
      type: r.type,
      amount: finalAmount,
      balance: 0,
      payment: r.payment || (sheetName === '기업은행' ? '기업은행' : sheetName === '현금' ? '현금' : '토스은행'),
      payment_method: r.payment || (sheetName === '기업은행' ? '기업은행' : sheetName === '현금' ? '현금' : '토스은행'),
      item: finalItem,
      person: finalPerson,
      user_name: finalPerson,
      category: finalCategory,
      memo: finalMemo,
      fixedCost: finalFixed,
      fixed_cost: finalFixed,
      orderIndex: (idx + 1) * 10,
      order_index: (idx + 1) * 10,
      createdAt: (idx + 1) * 10,
      source: 'supabase',
      sheetName,
      offset_group_id: null,
      offset_title: isOffset ? (r.offset_title || '상계 묶음') : null
    };

    (newRecordsBySheet[sheetName] ||= []).push(newRecord);
  });

  // 3-2. 기업카드 고정비 거래 복사 매핑 (+1 month)
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

    // 🌟 대상 날짜에 동일 항목 및 금액의 기업카드 거래가 이미 존재하면 중복 생성 방지
    const alreadyExists = allRecords.some(existing => {
      const eDate = normalizeLedgerDate(existing.date);
      const eSheet = existing.payment_method || existing.payment || existing.sheetName || '';
      return eSheet === '기업카드' &&
        eDate === newDateStr &&
        existing.item === c.item &&
        Math.abs(Number(existing.amount || 0) - Number(c.amount || 0)) < 0.01;
    });
    if (alreadyExists) return;

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
      payment_method: '기업카드',
      item: c.item || '',
      person: c.person || c.user_name || '기타',
      user_name: c.person || c.user_name || '기타',
      category: c.category || '',
      memo: c.memo || '',
      fixedCost: '고정비',
      fixed_cost: '고정비',
      orderIndex: (idx + 1) * 10,
      order_index: (idx + 1) * 10,
      createdAt: (idx + 1) * 10,
      source: 'supabase',
      sheetName: '기업카드'
    };

    (newRecordsBySheet['기업카드'] ||= []).push(newCardRecord);
  });

  // 4. 상계 그룹 복제 및 연결
  let offsetGroupCount = 0;
  const flatRecords = Object.values(newRecordsBySheet).flat();

  for (const group of sourceOffsetGroups) {
    const groupRecordIds = group.recordIds || [];
    const mappedIds = groupRecordIds
      .map(id => idMapping[String(id)])
      .filter(Boolean);

    if (mappedIds.length === groupRecordIds.length && mappedIds.length > 0) {
      const newGroupId = `offset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newGroup = {
        id: newGroupId,
        date: `${targetMonthKey}-01`,
        title: group.title || '상계 묶음',
        recordIds: mappedIds
      };

      mappedIds.forEach(mId => {
        const found = flatRecords.find(r => r.id === mId);
        if (found) {
          found.offset_group_id = newGroupId;
          found.offset_title = newGroup.title;
        }
      });

      await saveOffsetGroupFn(newGroup);
      offsetGroupCount++;
    }
  }

  // 5. 일괄 저장 실행
  if (flatRecords.length === 0) {
    return { ok: false, message: `이미 모든 고정비 및 상계 거래가 ${tm}월에 복사되어 있습니다.` };
  }
  await saveRecordsBatchFn(flatRecords);

  // 6. 기업카드 결제대금 자동 동기화
  syncBankCardBillRecords({
    allRecords: [...allRecords, ...flatRecords],
    upsertRecordFn: async (row) => {
      await saveRecordsBatchFn([row]);
    }
  });

  return {
    ok: true,
    count: flatRecords.length,
    offsetGroupCount,
    sourceMonthKey,
    targetMonthKey,
    targetMonthNum: tm,
    targetYear: ty
  };
}
