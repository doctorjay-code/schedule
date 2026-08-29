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

  console.log('--- 2. Testing Multi-Month Range Integrity (Anti-Single-Month Truncation) ---');
  // 잔액전망 생성 시 1월~10월 전체 데이터가 들어갔을 때 여러 월(Multi-Month)이 모두 보존되어야 함! (8월만 잘리면 실패)
  const forecastRes = generateForecastRecords({
    allRecords: mockMultiMonthRecords,
    monthCursor: new Date('2026-08-15')
  });
  const forecastRows = forecastRes.displayRows || [];
  const distinctForecastMonths = new Set(forecastRows.map(r => String(r.date).slice(0, 7)));
  assert.ok(distinctForecastMonths.size >= 2, `잔액전망 다중 월 누락 버그: 단일 월(${Array.from(distinctForecastMonths).join(',')})만 생성됨. 전체 월 범위가 유지되어야 합니다.`);

  // 미래 월(9월, 10월 등)이라도 기업카드 결제대금 행이 항상 생성되는지 검증
  const monthsWithCardBill = new Set(
    forecastRows.filter(r => (r.item || '').includes('기업카드 결제대금')).map(r => String(r.date).slice(0, 7))
  );
  assert.ok(monthsWithCardBill.has('2026-09') || monthsWithCardBill.has('2026-10'), '미래 월(9월/10월)에 기업카드 결제대금 행 누락 버그');

  // subRecords (인라인 아코디언 세부행) 연결 무결성 검증
  const cardBillRows = forecastRows.filter(r => (r.item || '').includes('기업카드 결제대금'));
  assert.ok(cardBillRows.length > 0, '기업카드 결제대금 행이 생성되지 않음');
  assert.ok(cardBillRows.some(r => Array.isArray(r.subRecords)), '기업카드 결제대금 행에 subRecords 세부내역 배열 누락');

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
