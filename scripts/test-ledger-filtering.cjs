const assert = require('assert');
const path = require('path');

async function runTests() {
  const cardModule = await import('../js/features/ledger/card.js');
  const { filterLedgerRecords } = cardModule;
  const utilsModule = await import('../js/features/ledger/ledger-utils.js');
  const { recalculateRunningBalances } = utilsModule;

  const mockRecords = [
    { id: '1', date: '2026-08-10', payment: '토스은행', source: 'card', person: '진주', category: '식비', amount: 10000, type: 'expense' },
    { id: '2', date: '2026-08-11', payment: '기업카드', source: 'card', person: '진주', category: '보험', amount: 50000, type: 'expense' },
    { id: '3', date: '2026-08-12', payment: '현금', source: 'cash', person: '기타', category: '생활', amount: 20000, type: 'expense' },
    { id: '4', date: '2026-08-13', payment: '기업은행', source: 'bank', person: '기타', category: '월급', amount: 3000000, type: 'income' },
    { id: '5', date: '2026-08-14', payment: '토스은행', source: 'card', person: '쥬쥬', category: '교통', amount: 15000, type: 'expense' }
  ];

  // Test 1: 토스은행 결제수단 필터링
  const tossFiltered = filterLedgerRecords(mockRecords, {
    payment: '토스은행',
    source: 'card'
  });
  assert.strictEqual(tossFiltered.length, 2, '토스은행 결제수단 필터링 실패: 2건이어야 함');
  assert.ok(tossFiltered.every(r => r.payment === '토스은행'), '토스은행이 아닌 레코드가 포함됨');

  // Test 2: 기업카드 결제수단 필터링
  const cardFiltered = filterLedgerRecords(mockRecords, {
    payment: '기업카드',
    source: 'card',
    isCompanyCard: true
  });
  assert.strictEqual(cardFiltered.length, 1, '기업카드 결제수단 필터링 실패: 1건이어야 함');
  assert.strictEqual(cardFiltered[0].id, '2');

  // Test 3: 현금 필터링
  const cashFiltered = filterLedgerRecords(mockRecords, {
    payment: '현금',
    source: 'cash'
  });
  assert.strictEqual(cashFiltered.length, 1, '현금 필터링 실패: 1건이어야 함');
  assert.strictEqual(cashFiltered[0].id, '3');

  // Test 4: 기업은행 필터링
  const bankFiltered = filterLedgerRecords(mockRecords, {
    payment: '기업은행',
    source: 'bank'
  });
  assert.strictEqual(bankFiltered.length, 1, '기업은행 필터링 실패: 1건이어야 함');
  assert.strictEqual(bankFiltered[0].id, '4');

  // Test 5: 복합 필터링 (토스은행 + 사용자: 진주/쥬쥬)
  const tossAndPersonFiltered = filterLedgerRecords(mockRecords, {
    payment: '토스은행',
    source: 'card',
    person: new Set(['진주'])
  });
  assert.strictEqual(tossAndPersonFiltered.length, 2, '토스은행 + 진주(쥬쥬동일시) 필터링 실패: 2건이어야 함');

  // Test 6: 누적 잔액 계산 (일반 계좌)
  const bankCalculated = recalculateRunningBalances([
    { id: '1', amount: 100000, type: 'income', balance: 100000 },
    { id: '2', amount: 30000, type: 'expense' },
    { id: '3', amount: 50000, type: 'income' }
  ], false);
  assert.strictEqual(bankCalculated[0].balance, 100000);
  assert.strictEqual(bankCalculated[1].balance, 70000);
  assert.strictEqual(bankCalculated[2].balance, 120000);

  // Test 7: 누적 사용액 계산 (기업카드)
  const cardCalculated = recalculateRunningBalances([
    { id: '1', amount: 10000, type: 'expense' },
    { id: '2', amount: 20000, type: 'expense' },
    { id: '3', amount: 5000, type: 'income' }
  ], true);
  assert.strictEqual(cardCalculated[0].balance, 10000);
  assert.strictEqual(cardCalculated[1].balance, 30000);
  assert.strictEqual(cardCalculated[2].balance, 25000);

  console.log('통과: 가계부 수단별 분리(토스/카드/현금/기업은행), 복합필터, 누적잔액 계산 검증 완료');
}

runTests().catch(err => {
  console.error('가계부 단위 테스트 실패:', err.message);
  process.exit(1);
});
