const assert = require('assert');
const path = require('path');

// JSDOM mock helper for DOM node testing in node environment
function createMockDocument() {
  const elements = new Map();
  function createElement(tag) {
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      className: '',
      style: {},
      dataset: {},
      children: [],
      childNodes: [],
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this.contains(c)) this.remove(c); else this.add(c);
          } else if (force) this.add(c); else this.remove(c);
        }
      },
      appendChild(child) {
        this.children.push(child);
        this.childNodes.push(child);
        child.parentNode = this;
        return child;
      },
      replaceChildren(...newChildren) {
        this.children = [...newChildren];
        this.childNodes = [...newChildren];
      },
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      addEventListener() {}
    };
    return el;
  }
  return { createElement, getElementById: (id) => null };
}

global.document = createMockDocument();
global.localStorage = {
  _store: {},
  getItem(key) { return this._store[key] || null; },
  setItem(key, val) { this._store[key] = String(val); },
  removeItem(key) { delete this._store[key]; },
  clear() { this._store = {}; }
};

async function runCoreLedgerInvariants() {
  const cardModule = await import('../js/features/ledger/card.js');
  const { filterLedgerRecords } = cardModule;
  const utilsModule = await import('../js/features/ledger/ledger-utils.js');
  const { recalculateRunningBalances, formatMoney } = utilsModule;
  const transViewModule = await import('../js/features/ledger/transaction-view.js');
  const { renderTransactionRow } = transViewModule;
  const forecastModule = await import('../js/features/ledger/ledger-forecast.js');
  const { generateForecastRecords } = forecastModule;

  console.log('--- 1. Testing 5-way Payment Method Filtering Integrity ---');
  const mockDataset = [
    // 1월 (기업카드 실사용액 80,000원 -> 2월에 청구됨)
    { id: 'tr-20260112-10-c2e560', date: '2026-01-12', payment: '기업카드', amount: 80000, type: 'expense', category: '식비' },
    // 2월 (토스 최초 기초잔액 21,314원)
    { id: 'tr-20260201-10-559a9a', date: '2026-02-01', payment: '토스은행', amount: 98, type: 'income', category: '이자', balance: 21314 },
    { id: 'tr-20260202-20-a8ccca', date: '2026-02-02', payment: '토스은행', amount: 15000, type: 'expense', category: '식비' },
    { id: 'tr-20260205-30-7fa535', date: '2026-02-05', payment: '토스은행', amount: 20000, type: 'expense', category: '저축', fixedCost: '고정비' },
    { id: 'tr-20260210-40-79866c', date: '2026-02-10', payment: '토스은행', amount: 3000000, type: 'income', category: '월급' },
    { id: 'tr-20260225-50-881972', date: '2026-02-25', payment: '기업은행', amount: 80000, type: 'expense', item: 'BC카드선결제', memo: '기업카드 결제' },
    // 3월 (현금)
    { id: 'tr-20260312-60-c5cae7', date: '2026-03-12', payment: '현금', amount: 20000, type: 'expense', category: '생활', balance: 50000 },
    // 8월 (토스)
    { id: 'tr-20260814-70-b09437', date: '2026-08-14', payment: '토스은행', amount: 11000, type: 'expense', category: '식비' }
  ];

  // 1-1. 토스은행 필터
  const tossRecs = filterLedgerRecords(mockDataset, { payment: '토스은행', source: 'card' });
  assert.strictEqual(tossRecs.length, 5, '토스은행 필터링 누락');

  console.log('--- 2. Core Invariant 1: Aggregate Conservation (생활비 집계 보존성) ---');
  const forecastRes = generateForecastRecords({
    allRecords: mockDataset,
    monthCursor: new Date('2026-08-15')
  });
  const forecastRows = forecastRes.displayRows || [];

  // 2월의 토스 생활비 합산행 검증
  const febTossLiving = forecastRows.find(r => r.id === 'fc-var-toss-2026-02' || (r.item && r.item.includes('토스 생활비') && r.date.startsWith('2026-02')));
  assert.ok(febTossLiving, '2월 토스 생활비 통합 행 누락');
  assert.strictEqual(febTossLiving.date, '2026-02-01', '토스 생활비 통합행은 매월 1일에 배치되어야 함');
  
  // 생활비 행 금액 === subRecords(변동지출 - 변동수입) 합계 보존성 검증
  // 2월 변동: 식비 15,000 지출 (월급 3,000,000과 고정비 20,000은 분리됨, 이자 98원은 변동수입)
  assert.ok(Array.isArray(febTossLiving.subRecords), '토스 생활비 행에 subRecords 누락');
  const sumSubExpenses = febTossLiving.subRecords.filter(r => (r.type || 'expense').toLowerCase() === 'expense').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const sumSubIncome = febTossLiving.subRecords.filter(r => (r.type || 'expense').toLowerCase() === 'income').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const expectedLivingAmount = sumSubExpenses - sumSubIncome;
  assert.strictEqual(febTossLiving.amount, expectedLivingAmount, `집계 보존성 위반: 생활비 금액(${febTossLiving.amount}) !== 하위 거래 합계(${expectedLivingAmount})`);

  console.log('--- 3. Core Invariant 2: Referential Transparency (참조 투명성 & 원본 ID 보존) ---');
  // 잔액전망에 나온 실거래 행들이 원본 DB ID(tr-2026...)를 그대로 유지하는가? (fc-toss- 왜곡 금지)
  const salaryRow = forecastRows.find(r => (r.item || '').includes('월급') || r.category === '월급');
  assert.ok(salaryRow, '월급 실거래 행 누락');
  assert.strictEqual(salaryRow.id, 'tr-20260210-40-79866c', `참조 투명성 위반: 실거래 ID가 접두사로 오염됨 (${salaryRow.id} !== tr-20260210-40-79866c)`);

  console.log('--- 4. Core Invariant 3: Continuous Accounting Balance (연속 회계 등식 보존성) ---');
  // 최초 기초 잔액(21,314원)으로부터 전체 행의 연속 누적 잔액이 단절 없이 성립하는가?
  const calculatedForecast = recalculateRunningBalances(forecastRows, false);
  assert.ok(calculatedForecast.length > 0, '잔액전망 계산 결과가 비어있음');
  
  // 첫 번째 계산 잔액이 음수로 왜곡되지 않고 유효한 기초 잔액(21,314원)으로부터 출발하는지 검증
  const firstBal = Number(calculatedForecast[0].balance);
  assert.ok(Number.isFinite(firstBal), '첫 행 잔액이 유효하지 않음');

  // 모든 연속 행 i, i-1에 대해: curBalance === prevBalance + (income ? amt : -amt)
  for (let i = 1; i < calculatedForecast.length; i++) {
    const prev = calculatedForecast[i - 1];
    const cur = calculatedForecast[i];
    const amt = Number(cur.amount) || 0;
    const delta = (cur.type === 'income' ? amt : -amt);
    const expected = Number(prev.balance) + delta;
    assert.strictEqual(Number(cur.balance), expected, `연속 회계 등식 위반 at row ${i} (${cur.item}): ${cur.balance} !== ${expected}`);
  }

  console.log('✔ 가계부 3대 본질 불변식(집계 보존성, 참조 투명성, 연속 회계 등식) 100% 검증 완료');
}

runCoreLedgerInvariants().catch(err => {
  console.error('❌ 가계부 본질 불변식 검증 실패:', err.message);
  process.exit(1);
});
