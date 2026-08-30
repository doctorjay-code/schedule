const assert = require('assert');
const path = require('path');
const fs = require('fs');

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
  const appModule = await import('../js/features/ledger/ledger-app.js');
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
    // 1월 (기업카드 실사용액 80,000원 -> 2월에 청구됨, 1월 토스 실거래는 없음!)
    { id: 'tr-20260112-10-c2e560', date: '2026-01-12', payment: '기업카드', amount: 80000, type: 'expense', category: '식비' },
    // 2월
    { id: 'tr-20260201-10-559a9a', date: '2026-02-01', payment: '토스은행', amount: 98, type: 'income', category: '이자' },
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

  console.log('--- 2. Core Invariant 1: Aggregate Conservation & Dual Income/Expense Matching ---');
  const forecastRes = generateForecastRecords({
    allRecords: mockDataset,
    monthCursor: new Date('2026-08-15')
  });
  const forecastRows = forecastRes.displayRows || [];

  // 1월에는 토스 실거래가 없으므로 1월 토스 생활비 가상행이 없어야 함
  const janTossLiving = forecastRows.find(r => r.id === 'fc-var-toss-2026-01');
  assert.strictEqual(janTossLiving, undefined, '1월에 토스 실거래가 없는데 1월 토스 가상행이 생성되어 잔액이 꼬이는 버그 발견');

  // 2월의 토스 생활비 합산행 검증
  const febTossLiving = forecastRows.find(r => r.id === 'fc-var-toss-2026-02' || (r.item && r.item.includes('토스 생활비') && r.date.startsWith('2026-02')));
  assert.ok(febTossLiving, '2월 토스 생활비 통합 행 누락');
  assert.strictEqual(febTossLiving.date, '2026-02-01', '토스 생활비 통합행은 매월 1일에 배치되어야 함');
  
  // 생활비 행 금액 === subRecords(변동지출 합계 및 변동수입 합계) 이원 일치 검증
  assert.ok(Array.isArray(febTossLiving.subRecords), '토스 생활비 행에 subRecords 누락');
  const sumSubExpenses = febTossLiving.subRecords.filter(r => (r.type || 'expense').toLowerCase() === 'expense').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const sumSubIncome = febTossLiving.subRecords.filter(r => (r.type || 'expense').toLowerCase() === 'income').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  
  assert.strictEqual(febTossLiving.expenseAmount, sumSubExpenses, `통합행 지출(${febTossLiving.expenseAmount}) !== 세부 지출 합계(${sumSubExpenses})`);
  assert.strictEqual(febTossLiving.incomeAmount, sumSubIncome, `통합행 수입(${febTossLiving.incomeAmount}) !== 세부 수입 합계(${sumSubIncome})`);

  console.log('--- 3. Core Invariant 2: Referential Transparency (참조 투명성 & 원본 ID 보존) ---');
  // 잔액전망에 나온 실거래 행들이 원본 DB ID(tr-2026...)를 그대로 유지하는가? (fc-toss- 왜곡 금지)
  const salaryRow = forecastRows.find(r => (r.item || '').includes('월급') || r.category === '월급');
  assert.ok(salaryRow, '월급 실거래 행 누락');
  assert.strictEqual(salaryRow.id, 'tr-20260210-40-79866c', `참조 투명성 위반: 실거래 ID가 접두사로 오염됨 (${salaryRow.id} !== tr-20260210-40-79866c)`);

  console.log('--- 4. Core Invariant 3: Continuous Pure Cashflow Balance (순수 입출금 누적 회계 등식) ---');
  // 모든 거래의 누적 잔액이 ∑(수입) - ∑(지출)과 1원도 틀리지 않고 정확히 일치하는가?
  const calculatedForecast = recalculateRunningBalances(forecastRows, false);
  assert.ok(calculatedForecast.length > 0, '잔액전망 계산 결과가 비어있음');

  // 모든 연속 행 i, i-1에 대해: curBalance === prevBalance + (incAmt - expAmt)
  for (let i = 1; i < calculatedForecast.length; i++) {
    const prev = calculatedForecast[i - 1];
    const cur = calculatedForecast[i];
    const incAmt = Number(cur.incomeAmount !== undefined ? cur.incomeAmount : (cur.type === 'income' ? cur.amount : 0));
    const expAmt = Number(cur.expenseAmount !== undefined ? cur.expenseAmount : (cur.type === 'expense' ? cur.amount : 0));
    const delta = incAmt - expAmt;
    const expected = Number(prev.balance) + delta;
    assert.strictEqual(Number(cur.balance), expected, `연속 회계 등식 위반 at row ${i} (${cur.item}): ${cur.balance} !== ${expected}`);
  }

  // 전체 최종 잔액 === ∑(전체 수입) - ∑(전체 지출)
  let totalNet = 0;
  calculatedForecast.forEach(r => {
    const inc = Number(r.incomeAmount !== undefined ? r.incomeAmount : (r.type === 'income' ? r.amount : 0));
    const exp = Number(r.expenseAmount !== undefined ? r.expenseAmount : (r.type === 'expense' ? r.amount : 0));
    totalNet += (inc - exp);
  });
  const finalBal = Number(calculatedForecast[calculatedForecast.length - 1].balance);
  assert.strictEqual(finalBal, totalNet, `최종 누적잔액(${finalBal}) !== 전체 순현금흐름(${totalNet})`);

  console.log('--- 5. Core Invariant 4: No Legacy ID Regex in Codebase ---');
  const ledgerDir = path.join(__dirname, '../js/features/ledger');
  const allJs = fs.readdirSync(ledgerDir, { withFileTypes: true })
    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.js'))
    .map(dirent => fs.readFileSync(path.join(ledgerDir, dirent.name), 'utf8'))
    .join('\n');
  assert.ok(!allJs.includes('replace(/^fc-'), '코드베이스에 구형 ID 파싱 정규식(replace(/^fc-)) 잔재 발견');

  console.log('--- 6. Core Invariant 5: Pure DB Offset Hydration & Zero localStorage Dependency ---');
  const offsetGroupsModule = await import('../js/features/ledger/ledger-offset-groups.js');
  const { buildOffsetGroupsFromRecords } = offsetGroupsModule;
  const sampleOffsetRecords = [
    { id: 'tr-1', date: '2026-08-25', amount: 1333366, type: 'income', offset_group_id: 'grp-1', offset_title: '8/25 상계' },
    { id: 'tr-2', date: '2026-08-25', amount: 1333366, type: 'expense', offset_group_id: 'grp-1', offset_title: '8/25 상계' }
  ];
  const builtGroups = buildOffsetGroupsFromRecords(sampleOffsetRecords);
  assert.ok(builtGroups['grp-1'], 'DB 레코드로부터 상계 그룹 동적 생성 누락');
  assert.strictEqual(builtGroups['grp-1'].inAmount, 1333366, '상계 그룹 수입 금액 불일치');
  assert.strictEqual(builtGroups['grp-1'].outAmount, 1333366, '상계 그룹 지출 금액 불일치');

  const offsetJs = fs.readFileSync(path.join(ledgerDir, 'ledger-offset-groups.js'), 'utf8');
  assert.ok(!offsetJs.includes('localStorage'), 'ledger-offset-groups.js에 localStorage 레거시 잔재 발견');

  console.log('--- 7. Core Invariant 6: Card Bill Payment Row vs Sub-Records 100% Cross-Matching ---');
  const fcModule = await import('../js/features/ledger/ledger-forecast.js');
  const { generateForecastRecords: genFc } = fcModule;

  const mockDbRecords = [
    // 8월 13일 ~ 9월 12일 카드 사용분 2건: 600,000원 + 398,580원 = 998,580원
    { id: 'card-1', date: '2026-08-15', amount: 600000, type: 'expense', payment_method: '기업카드' },
    { id: 'card-2', date: '2026-09-05', amount: 398580, type: 'expense', payment_method: '기업카드' },
    // 9월 27일 기업은행 결제행: 998,580원
    { id: 'bank-bill-1', date: '2026-09-27', amount: 998580, type: 'expense', payment_method: '기업은행', item: '기업카드', memo: '쥬쥬 기업카드 결제' }
  ];

  const { displayRows: crossCheckRows } = genFc({ allRecords: mockDbRecords, monthCursor: new Date('2026-09-01') });
  const billRow = crossCheckRows.find(r => r.date === '2026-09-27' && r.item === '기업카드');
  assert.ok(billRow, '9월 27일 기업카드 결제행 누락');
  assert.strictEqual(billRow.amount, 998580, '기업카드 결제행 금액 불일치');
  assert.strictEqual(billRow.hasCardAccordion, true, '기업카드 아코디언 미부착');
  assert.strictEqual(billRow.subRecords.length, 2, '기업카드 세부거래 연결 건수 불일치');

  const subTotal = billRow.subRecords.reduce((sum, r) => sum + r.amount, 0);
  assert.strictEqual(billRow.amount, subTotal, '💥 회계 불일치: 결제행 금액과 카드 세부 거래 합계가 1원이라도 다름!');

  console.log('✔ 가계부 6대 본질 불변식 (카드 결제 대사 일치 포함) 100% 검증 완료');
}

runCoreLedgerInvariants().catch(err => {
  console.error('❌ 가계부 본질 불변식 검증 실패:', err.stack || err.message);
  process.exit(1);
});
