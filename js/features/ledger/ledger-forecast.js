import { fetchForecastOrders, saveForecastOrders, insertLedgerRecordsBatch, upsertLedgerOffsetGroup } from '../../services/ledger/ledger-api.js';
import { loadOffsetGroups, saveOffsetGroups } from './ledger-offset-groups.js';
import { compareLedgerRecords, normalizeLedgerDate } from './ledger-utils.js';

const FORECAST_ORDER_STORAGE_KEY = 'LEDGER_FORECAST_ORDER_MAP_V1';
const FORECAST_AGGREGATE_OVERRIDES_KEY = 'LEDGER_FORECAST_AGGREGATE_OVERRIDES_V1';

export function loadForecastAggregateOverrides() {
  try {
    const raw = localStorage.getItem(FORECAST_AGGREGATE_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    return {};
  }
}

export function saveForecastAggregateOverride(idOrMonth, overrideData) {
  try {
    const map = loadForecastAggregateOverrides();
    const cleanKey = String(idOrMonth || '').replace(/^fc-est-card-bank-/, '').replace(/^fc-est-card-/, '');
    map[cleanKey] = { ...(map[cleanKey] || {}), ...overrideData };
    map[idOrMonth] = { ...(map[idOrMonth] || {}), ...overrideData };
    localStorage.setItem(FORECAST_AGGREGATE_OVERRIDES_KEY, JSON.stringify(map));
  } catch (err) {}
}

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
 */
export function isManualCardPayment(r) {
  if (!r || r.type !== 'expense') return false;
  const item = String(r.item || '').trim();
  const memo = String(r.memo || '').trim();
  return item.includes('비씨카드') || item.includes('BC카드') || item.includes('기업카드출금') || memo.includes('기업카드 결제') || memo.includes('카드선결제') || memo.includes('BC카드선결제') || item.includes('카드선결제');
}

/**
 * 토스은행 + 기업은행 통합 잔액전망 엔진
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
        item: '생활비',
        amount: tossVarExpense - tossVarIncome,
        incomeAmount: tossVarIncome,
        expenseAmount: tossVarExpense,
        type: 'aggregate',
        payment: '토스은행',
        category: '생활',
        person: '쥬쥬',
        memo: '쥬쥬 토스 생활비',
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
          const overrides = loadForecastAggregateOverrides();
          const ov = overrides[mStr] || overrides[`fc-est-card-${mStr}`] || overrides[`fc-est-card-bank-${mStr}`] || {};

          forecastPool.push({
            id: `fc-est-card-${mStr}`,
            date: ov.date || `${mStr}-27`,
            item: ov.item || '기업카드',
            amount: cardExp - cardInc,
            incomeAmount: cardInc,
            expenseAmount: cardExp,
            type: 'aggregate',
            payment: ov.payment || '기업은행',
            category: ov.category || '상환',
            person: ov.person || '쥬쥬',
            memo: ov.memo || '쥬쥬 기업카드 결제',
            fixedCost: ov.fixedCost !== undefined ? ov.fixedCost : '',
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

/**
 * 고정비 항목의 핵심 키워드를 정규화하여 추출 (예: 'SKT-자동납부-713178' -> 'SKT')
 */
export function normalizeFixedCostItemKey(item = '') {
  return String(item)
    .replace(/\([^)]*\)/g, '') // 괄호 안 텍스트 제거 (예: (주), (로켓와우클럽) 등)
    .replace(/[㈜주식회사\-_\s]/g, '') // 특수문자, 주식회사, 대시, 공백 제거
    .replace(/자동납부|자동이체|이체용/g, '') // 부가 수식어 제거
    .toLowerCase()
    .trim();
}

/**
 * 다음 달 기존 거래 풀(existingList) 중에 candidate와 동일한 고정비가 이미 존재하는지 검사
 */
export function findMatchingExistingFixedRecord(candidate, existingList) {
  if (!Array.isArray(existingList) || existingList.length === 0) return null;

  const candKey = normalizeFixedCostItemKey(candidate.item);
  const candAmt = Number(candidate.amount || 0);
  const candMemo = (candidate.memo || '').trim();

  // 1단계: 핵심 키워드가 일치하는 기존 거래들 필터링
  const keyMatches = existingList.filter(ex => {
    const exKey = normalizeFixedCostItemKey(ex.item);
    if (!candKey || !exKey) return false;
    return exKey.includes(candKey) || candKey.includes(exKey);
  });

  if (keyMatches.length === 0) return null;

  // 2단계: 키워드 일치 항목이 1건뿐인 경우
  if (keyMatches.length === 1) {
    const single = keyMatches[0];
    const sameAmount = Number(single.amount || 0) === candAmt;
    const isBothFixed = isFixedRecord(single) && isFixedRecord(candidate);
    if (sameAmount || isBothFixed) {
      return single;
    }
  }

  // 3단계: 동일 키워드가 2건 이상인 경우 (예: 메리츠보험 2건 등 다건 고정비)
  const exactMatch = keyMatches.find(ex => {
    const sameAmount = Number(ex.amount || 0) === candAmt;
    const sameMemo = candMemo && ex.memo && ex.memo.trim() === candMemo;
    return sameAmount || sameMemo;
  });

  return exactMatch || null;
}

/**
 * 이번 달의 고정비 및 상계 묶음을 다음 달로 넘기는 원클릭 Push 엔진
 * (기업카드 13일~12일 결제주기 고정비 자동 연동 및 스마트 중복 방지 포함!)
 */
export async function copyMonthFixedRecordsToNextMonth(sourceMonthKey, ledgerDataSources = {}, options = {}) {
  const [sy, sm] = sourceMonthKey.split('-').map(Number);
  const targetMonthKey = sm === 12
    ? `${sy + 1}-01`
    : `${sy}-${String(sm + 1).padStart(2, '0')}`;
  const [ty, tm] = targetMonthKey.split('-').map(Number);

  const currentSource = options.source || 'forecast';

  // 1. 데이터 소스 분류
  const cardList = ledgerDataSources.card || [];
  const tossRecords = cardList.filter(r => r.payment === '토스은행' || r.sheetName === '토스은행');
  const cardRecords = cardList.filter(r => r.payment === '기업카드' || r.sheetName === '기업카드');
  const bankRecords = ledgerDataSources.bank || [];
  const cashRecords = ledgerDataSources.cash || [];

  // A. 일반 통장 거래 풀 (토스은행, 기업은행, 현금)
  let bankCandidates = [];
  if (currentSource === 'forecast') {
    bankCandidates = [...tossRecords, ...bankRecords];
  } else if (currentSource === 'bank') {
    bankCandidates = [...bankRecords];
  } else if (currentSource === 'cash') {
    bankCandidates = [...cashRecords];
  } else if (currentSource === 'card' && options.payment !== '기업카드') {
    bankCandidates = [...tossRecords];
  }

  const sourceBankCandidates = bankCandidates.filter(r => {
    const d = normalizeLedgerDate(r.date);
    return d.startsWith(sourceMonthKey) && !r.id.startsWith('fc-');
  });

  // 대상 월(targetMonthKey)에 이미 존재하는 통장 거래 풀 (중복 방지용)
  const targetBankExisting = bankCandidates.filter(r => {
    const d = normalizeLedgerDate(r.date);
    return d.startsWith(targetMonthKey) && !r.id.startsWith('fc-');
  });

  const offsetGroups = loadOffsetGroups();
  const sourceOffsetGroupIds = new Set();
  const sourceOffsetRecordIds = new Set();

  Object.values(offsetGroups).forEach(g => {
    if (g.date && g.date.startsWith(sourceMonthKey) && Array.isArray(g.recordIds)) {
      sourceOffsetGroupIds.add(g.id);
      g.recordIds.forEach(id => sourceOffsetRecordIds.add(String(id)));
    }
  });

  // 복사 대상 1차 필터링
  let toCopyBank = sourceBankCandidates.filter(r => {
    if (isManualCardPayment(r)) return false; // 수기 통장 카드출금은 제외하여 9/27 자동집계 보호
    const isFixed = isFixedRecord(r);
    const isOffset = sourceOffsetRecordIds.has(String(r.id)) || sourceOffsetRecordIds.has(String(r.originalId));
    const isSalaryOrTransfer = isTransferOrSalaryRecord(r);
    return isFixed || isOffset || isSalaryOrTransfer;
  });

  // 통장 스마트 중복 방지 (이미 대상 월에 등록된 고정비/급여/상계 거래는 제외)
  const usedTargetBankIds = new Set();
  toCopyBank = toCopyBank.filter(candidate => {
    const existing = findMatchingExistingFixedRecord(
      candidate,
      targetBankExisting.filter(ex => !usedTargetBankIds.has(ex.id))
    );
    if (existing) {
      usedTargetBankIds.add(existing.id);
      return false; // 이미 존재하므로 복사 스킵!
    }
    return true;
  });

  // B. 기업카드 고정비 거래 풀 (결제주기 13일~12일 기반!)
  let toCopyCard = [];
  if (currentSource === 'forecast' || currentSource === 'bank' || (currentSource === 'card' && options.payment === '기업카드')) {
    let cardStart = null, cardEnd = null;
    let targetCardStart = null, targetCardEnd = null;

    if (sm === 2) {
      cardStart = `${sy}-01-01`;
      cardEnd = `${sy}-02-12`;
    } else {
      const pStr = `${sy}-${String(sm - 1).padStart(2, '0')}`;
      cardStart = `${pStr}-13`;
      cardEnd = `${sourceMonthKey}-12`;
    }

    if (tm === 2) {
      targetCardStart = `${ty}-01-01`;
      targetCardEnd = `${ty}-02-12`;
    } else {
      const tpStr = `${ty}-${String(tm - 1).padStart(2, '0')}`;
      targetCardStart = `${tpStr}-13`;
      targetCardEnd = `${targetMonthKey}-12`;
    }

    if (cardStart && cardEnd) {
      const cycleCards = cardRecords.filter(c => {
        const cd = normalizeLedgerDate(c.date);
        return cd >= cardStart && cd <= cardEnd && !c.id.startsWith('fc-');
      });
      toCopyCard = cycleCards.filter(isFixedRecord);

      // 대상 월 결제주기에 이미 등록되어 있는 실제 카드 거래 목록
      const targetCardExisting = cardRecords.filter(c => {
        const cd = normalizeLedgerDate(c.date);
        return cd >= targetCardStart && cd <= targetCardEnd && !c.id.startsWith('fc-');
      });

      // 카드 스마트 중복 방지 (이미 9월 주기에 긁힌 SKT, 쿠팡 등은 제외!)
      const usedTargetCardIds = new Set();
      toCopyCard = toCopyCard.filter(candidate => {
        const existing = findMatchingExistingFixedRecord(
          candidate,
          targetCardExisting.filter(ex => !usedTargetCardIds.has(ex.id))
        );
        if (existing) {
          usedTargetCardIds.add(existing.id);
          return false; // 이미 존재하므로 복사 스킵!
        }
        return true;
      });
    }
  }

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

    const newId = `cp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
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

    const newId = `cp_card_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
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

  // 3. Supabase DB 일괄 삽입
  for (const sheetName of Object.keys(newRecordsBySheet)) {
    const list = newRecordsBySheet[sheetName];
    await insertLedgerRecordsBatch(list);
  }

  // 4. 상계 묶음 다음 달 버전 자동 복제 (금액 0원 버전으로 안전 생성!)
  for (const gId of sourceOffsetGroupIds) {
    const oldGroup = offsetGroups[gId];
    if (!oldGroup || !Array.isArray(oldGroup.recordIds)) continue;

    const newMappedIds = oldGroup.recordIds.map(oldId => idMapping[String(oldId)]).filter(Boolean);
    if (newMappedIds.length === oldGroup.recordIds.length) {
      const oldDay = (oldGroup.date || '').slice(8) || '10';
      const newGroupDate = `${targetMonthKey}-${oldDay}`;
      const newGroupId = `og_${newGroupDate}_${Math.random().toString(36).slice(2, 7)}`;

      const newGroup = {
        id: newGroupId,
        date: newGroupDate,
        title: oldGroup.title.replace(new RegExp(`${sm}월|${sm}\\.`), `${tm}월`),
        inAmount: 0,
        outAmount: 0,
        recordIds: newMappedIds,
        createdAt: new Date().toISOString()
      };

      offsetGroups[newGroupId] = newGroup;
      upsertLedgerOffsetGroup(newGroup).catch(e => console.warn('upsertOffsetGroup warn:', e));
    }
  }
  saveOffsetGroups(offsetGroups);

  return { ok: true, count: totalCount, sourceMonthKey, targetMonthKey, targetMonthNum: tm, sourceMonthNum: sm };
}
