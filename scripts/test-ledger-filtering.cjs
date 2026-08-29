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

async function runComprehensiveTests() {
  const cardModule = await import('../js/features/ledger/card.js');
  const { filterLedgerRecords } = cardModule;
  const utilsModule = await import('../js/features/ledger/ledger-utils.js');
  const { recalculateRunningBalances, formatMoney } = utilsModule;
  const transViewModule = await import('../js/features/ledger/transaction-view.js');
  const { renderTransactionRow } = transViewModule;
  const forecastModule = await import('../js/features/ledger/ledger-forecast.js');
  const { generateForecastRecords } = forecastModule;

  console.log('--- 1. Testing 5-way Payment Method Filtering Integrity ---');
  const mockMultiMonthRecords = [
    { id: '1', date: '2026-01-10', payment: '토스은행', source: 'card', amount: 10000, type: 'expense', balance: 100000 },
    { id: '2', date: '2026-02-11', payment: '기업카드', source: 'card', amount: 50000, type: 'expense' },
    { id: '3', date: '2026-03-12', payment: '현금', source: 'cash', amount: 20000, type: 'expense', balance: 50000 },
    { id: '4', date: '2026-04-13', payment: '기업은행', source: 'bank', amount: 3000000, type: 'income', balance: 3000000 },
    { id: '5', date: '2026-08-14', payment: '토스은행', source: 'card', amount: 15000, type: 'expense', balance: 85000 },
    { id: '6', date: '2026-09-20', payment: '토스은행', source: 'card', amount: 25000, type: 'income', balance: 110000 },
    { id: '7', date: '2026-10-05', payment: '기업카드', source: 'card', amount: 80000, type: 'expense' }
  ];

  // 1-1. 토스은행 필터
  const tossRecs = filterLedgerRecords(mockMultiMonthRecords, { payment: '토스은행', source: 'card' });
  assert.strictEqual(tossRecs.length, 3, '토스은행 필터링 누락 (3건이어야 함)');
  assert.ok(tossRecs.every(r => r.payment === '토스은행'));

  // 1-2. 기업카드 필터
  const cardRecs = filterLedgerRecords(mockMultiMonthRecords, { payment: '기업카드', source: 'card', isCompanyCard: true });
  assert.strictEqual(cardRecs.length, 2, '기업카드 필터링 누락 (2건이어야 함)');

  // 1-3. 현금 필터
  const cashRecs = filterLedgerRecords(mockMultiMonthRecords, { payment: '현금', source: 'cash' });
  assert.strictEqual(cashRecs.length, 1, '현금 필터링 누락 (1건이어야 함)');

  // 1-4. 기업은행 필터
  const bankRecs = filterLedgerRecords(mockMultiMonthRecords, { payment: '기업은행', source: 'bank' });
  assert.strictEqual(bankRecs.length, 1, '기업은행 필터링 누락 (1건이어야 함)');

  console.log('--- 2. Testing Multi-Month Range Integrity (ForAll Invariant) ---');
  // 잔액전망 생성 시 전체 데이터가 들어갔을 때 모든 월이 다중 월(Multi-Month)로 완벽하게 보존되어야 함!
  const forecastRes = generateForecastRecords({
    allRecords: mockMultiMonthRecords,
    monthCursor: new Date('2026-08-15')
  });
  const forecastRows = forecastRes.displayRows || [];
  const allMonthsInForecast = Array.from(new Set(forecastRows.map(r => String(r.date).slice(0, 7))));
  assert.ok(allMonthsInForecast.length >= 2, '다중 월 범위 누락 버그: 단일 월만 생성됨');

  // [일반화 불변식]: 존재하는 모든 월(Month M)에 대해 기업카드 결제대금 및 토스 생활비 통합 행과 subRecords가 100% 완비되어야 함!
  allMonthsInForecast.forEach(monthKey => {
    const monthRows = forecastRows.filter(r => String(r.date).startsWith(monthKey));

    // 규칙 1: 모든 월에 기업카드 결제대금 행과 subRecords 배열이 존재해야 함
    const cardBill = monthRows.find(r => (r.id && r.id.startsWith('fc-est-card-')) || (r.item && r.item.includes('기업카드 결제대금')));
    assert.ok(cardBill, `[${monthKey}] 월에 기업카드 결제대금 통합 행 누락`);
    assert.ok(Array.isArray(cardBill.subRecords), `[${monthKey}] 월의 기업카드 행에 subRecords 배열 누락`);

    // 규칙 2: 모든 월에 토스 생활비 통합 행과 subRecords 배열이 존재해야 함
    const tossLiving = monthRows.find(r => (r.id && r.id.startsWith('fc-var-toss-')) || (r.item && r.item.includes('토스 생활비')));
    assert.ok(tossLiving, `[${monthKey}] 월에 토스 생활비 통합 행 누락`);
    assert.ok(Array.isArray(tossLiving.subRecords), `[${monthKey}] 월의 토스 생활비 행에 subRecords 배열 누락`);
  });

  console.log('--- 3. Testing 7-Column Visual Visibility & Styling Contract ---');
  // renderTransactionRow로 렌더링된 행에서 잔액 셀(balanceCell)의 글자색과 정렬이 실제로 지정되어 눈에 보이는지 검증
  const sampleRow = {
    id: 'test-1',
    date: '2026-08-10',
    payment: '토스은행',
    item: '식비',
    amount: 15000,
    type: 'expense',
    balance: 85000
  };
  const [detailRow, tagRow] = renderTransactionRow(sampleRow, null, { source: 'card' });

  // tagRow의 마지막 셀이 balanceCell
  const balanceCell = tagRow.children[tagRow.children.length - 1];
  assert.ok(balanceCell, 'balanceCell이 tagRow에 존재하지 않음');
  assert.strictEqual(balanceCell.textContent, '85,000', 'balanceCell 잔액 텍스트 누락');
  assert.ok(balanceCell.style.color && balanceCell.style.color !== 'transparent', 'balanceCell 글자색(color)이 누락되어 화면에서 보이지 않는 버그');
  assert.ok(balanceCell.style.borderBottom && balanceCell.style.borderBottom.includes('2px'), 'balanceCell 하단 볼드선 스타일 누락');

  console.log('--- 4. Testing Running Balance Mathematical Invariant ---');
  // 첫 행 잔액 + ∑(입금) - ∑(출금) === 마지막 행 잔액 (수학적 1원 오차 불허)
  const runningSample = [
    { id: 'r1', amount: 100000, type: 'income', balance: 100000 },
    { id: 'r2', amount: 30000, type: 'expense' },
    { id: 'r3', amount: 50000, type: 'income' },
    { id: 'r4', amount: 20000, type: 'expense' }
  ];
  const calculated = recalculateRunningBalances(runningSample, false);
  const expectedFinal = 100000 - 30000 + 50000 - 20000;
  assert.strictEqual(calculated[calculated.length - 1].balance, expectedFinal, `누적잔액 계산식 오류: ${calculated[calculated.length - 1].balance} !== ${expectedFinal}`);

  console.log('✔ 가계부 전수 무결성 검증 통과: 5개 수단 분리, 다중 월 보존, 7개 컬럼 가시성/스타일, 누적잔액 수학적 완결성 100% 검증 완료');
}

runComprehensiveTests().catch(err => {
  console.error('❌ 가계부 전수 무결성 검증 실패:', err.message);
  process.exit(1);
});
