/**
 * Average Balance Sandbox Simulator Engine
 * Provides a 100% isolated, non-destructive sandbox to simulate average balance
 * using real Bank (기업은행) records with live what-if adjustments.
 */

import { formatMoney, normalizeLedgerDate, compareLedgerRecords, generateLedgerId } from '../ledger-utils.js';

const DAY_MS = 86400000;

let sandboxRecords = [];
let openingBalance = 0;
let mode = 'single'; // 'single' | 'multi'
let selectedStartMonth = '2026-08';
let selectedEndMonth = '2026-08';
let availableMonths = [];
let allBankRecordsCache = [];
let getLedgerTransactionModalFn = null;

function parseNumber(val) {
  const digits = String(val || '').replace(/[^0-9-]/g, '');
  return Number(digits) || 0;
}

function getMonthDateRange(mStr) {
  const [y, m] = mStr.split('-').map(Number);
  const startIso = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endIso = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startIso, endIso, year: y, month: m, lastDay };
}

function getOverallDateRange() {
  const startRange = getMonthDateRange(selectedStartMonth);
  const endRange = getMonthDateRange(selectedEndMonth);
  return {
    startDateIso: startRange.startIso,
    endDateIso: endRange.endIso,
    startYear: startRange.year,
    startMonth: startRange.month,
    endYear: endRange.year,
    endMonth: endRange.month
  };
}

/**
 * 기업은행 실제 거래 데이터 및 시작 잔액 로드 (순수 메모리 복사본)
 */
function loadSandboxFromRealData() {
  const { startDateIso, endDateIso } = getOverallDateRange();

  // 1. 시작일(startDateIso) 이전의 기업은행 누적 잔액 산출
  let initialBal = 0;
  allBankRecordsCache.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    if (dStr < startDateIso) {
      const amt = Number(r.amount || 0);
      const isExp = (r.type || 'expense').toLowerCase() === 'expense';
      initialBal += (isExp ? -amt : amt);
    }
  });

  openingBalance = initialBal;
  const openingInput = document.getElementById('ledgerAverageOpeningBalanceInput');
  if (openingInput) {
    openingInput.value = formatMoney(openingBalance);
  }

  // 2. 해당 기간의 기업은행 거래 추출 (100% 독립된 깊은 복사본)
  const filtered = allBankRecordsCache.filter(r => {
    const dStr = normalizeLedgerDate(r.date);
    return dStr >= startDateIso && dStr <= endDateIso;
  });

  sandboxRecords = filtered.map(r => ({
    ...r,
    id: r.id || generateLedgerId(),
    amount: Number(r.amount || 0),
    payment: '기업은행',
    payment_method: '기업은행'
  }));

  recomputeAndRender();
}

/**
 * 일평잔 및 거래별 잔액 재계산 & 화면 갱신
 */
function recomputeAndRender() {
  const { startDateIso, endDateIso } = getOverallDateRange();

  // 1. 거래 목록 정렬 및 누적 잔액 계산
  sandboxRecords.sort((a, b) => compareLedgerRecords(a, b, false));

  let currentBal = openingBalance;
  sandboxRecords.forEach(r => {
    const amt = Number(r.amount || 0);
    const isExp = (r.type || 'expense').toLowerCase() === 'expense';
    currentBal += (isExp ? -amt : amt);
    r.balance = currentBal;
  });

  // 2. 기간 일평잔 (Daily Balance Method) 계산
  const startUtc = Date.parse(startDateIso + 'T00:00:00Z');
  const endUtc = Date.parse(endDateIso + 'T00:00:00Z');

  // 날짜별 순수 변동액 매핑
  const dailyMovements = new Map();
  sandboxRecords.forEach(r => {
    const dStr = normalizeLedgerDate(r.date);
    const amt = Number(r.amount || 0);
    const isExp = (r.type || 'expense').toLowerCase() === 'expense';
    const delta = (isExp ? -amt : amt);
    dailyMovements.set(dStr, (dailyMovements.get(dStr) || 0) + delta);
  });

  let runningDayBal = openingBalance;
  let sumDailyBalances = 0;
  let totalDays = 0;

  if (Number.isFinite(startUtc) && Number.isFinite(endUtc) && endUtc >= startUtc) {
    for (let cur = startUtc; cur <= endUtc; cur += DAY_MS) {
      const dIso = new Date(cur).toISOString().slice(0, 10);
      const delta = dailyMovements.get(dIso) || 0;
      runningDayBal += delta;
      sumDailyBalances += runningDayBal;
      totalDays += 1;
    }
  }

  const avgBalance = totalDays > 0 ? Math.round(sumDailyBalances / totalDays) : 0;

  // 3. 결과 영역 갱신
  const resVal = document.getElementById('ledgerAverageResultValue');
  const resPeriod = document.getElementById('ledgerAverageResultPeriod');

  if (resVal) {
    resVal.textContent = `${formatMoney(avgBalance)}원`;
  }
  if (resPeriod) {
    resPeriod.textContent = `${startDateIso.replaceAll('-', '.')} ~ ${endDateIso.replaceAll('-', '.')} (${totalDays}일간) · 총 ${sandboxRecords.length}건`;
  }

  // 4. 테이블 렌더링
  renderSandboxTable();
}

/**
 * 가계부 테이블과 100% 동일한 행 UI 렌더링
 */
function renderSandboxTable() {
  const tbody = document.getElementById('ledgerAverageTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (sandboxRecords.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="4" class="ledger-empty-list" style="text-align:center; padding:24px; color:#94A3B8;">선택한 기간에 거래 내역이 없습니다.<br><small style="color:#CBD5E1;">'+ 거래 추가' 버튼으로 가상 거래를 추가해 보세요.</small></td>`;
    tbody.appendChild(emptyRow);
    return;
  }

  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  sandboxRecords.forEach(record => {
    const tr = document.createElement('tr');
    tr.className = 'schedule-row ledger-row-interactive';
    tr.dataset.ledgerId = record.id;
    tr.style.cursor = 'pointer';

    const dStr = normalizeLedgerDate(record.date);
    const dObj = new Date(dStr);
    const dayOfWeek = isNaN(dObj.getTime()) ? '' : DAY_NAMES[dObj.getDay()];
    const [_, m, d] = dStr.split('-');
    const dateLabel = `${m}.${d}(${dayOfWeek})`;

    const isExp = (record.type || 'expense').toLowerCase() === 'expense';
    const amt = Number(record.amount || 0);
    const inText = !isExp && amt > 0 ? formatMoney(amt) : '';
    const outText = isExp && amt > 0 ? formatMoney(amt) : '';
    const balText = Number.isFinite(record.balance) ? `${record.balance < 0 ? '-' : ''}${formatMoney(record.balance)}` : '';

    tr.innerHTML = `
      <td class="col-date" style="font-size:12.5px; font-weight:600; text-align:center; padding:9px 4px; white-space:nowrap;">${dateLabel}</td>
      <td class="col-trans ledger-cell-money" style="font-size:12.5px; color:#15803D; font-weight:700; text-align:right; padding:9px 10px;">${inText}</td>
      <td class="col-hr ledger-cell-money" style="font-size:12.5px; color:#DC2626; font-weight:700; text-align:right; padding:9px 10px;">${outText}</td>
      <td class="col-ot ledger-cell-money" style="font-size:12.5px; color:#1E1B4B; font-weight:700; text-align:right; padding:9px 10px;">${balText}</td>
    `;

    // 행 클릭 시 상세 모달 오픈 (샌드박스 전용 격리)
    tr.addEventListener('click', () => {
      openSandboxDetailModal(record);
    });

    tbody.appendChild(tr);
  });
}

/**
 * 샌드박스 전용 거래 수정/삭제 모달 오픈
 */
function openSandboxDetailModal(record) {
  if (typeof getLedgerTransactionModalFn !== 'function') return;
  const modal = getLedgerTransactionModalFn();
  if (!modal) return;

  modal.open({
    isEdit: true,
    record: { ...record },
    customSave: (updatedRecord) => {
      // 🌟 실제 DB 호출 차단! 샌드박스 배열만 수정
      const idx = sandboxRecords.findIndex(r => r.id === record.id);
      if (idx !== -1) {
        sandboxRecords[idx] = {
          ...sandboxRecords[idx],
          ...updatedRecord,
          amount: Number(updatedRecord.amount || 0)
        };
      }
      recomputeAndRender();
    },
    customDelete: () => {
      // 🌟 실제 DB 호출 차단! 샌드박스 배열에서만 제거
      sandboxRecords = sandboxRecords.filter(r => r.id !== record.id);
      recomputeAndRender();
    }
  });
}

/**
 * 샌드박스 전용 새 거래 추가 모달 오픈
 */
function openSandboxAddModal() {
  if (typeof getLedgerTransactionModalFn !== 'function') return;
  const modal = getLedgerTransactionModalFn();
  if (!modal) return;

  const defaultDate = `${selectedStartMonth}-01`;

  modal.open({
    isEdit: false,
    record: {
      id: generateLedgerId(),
      date: defaultDate,
      payment: '기업은행',
      payment_method: '기업은행',
      person: '쥬쥬',
      type: 'expense',
      amount: '',
      item: '',
      category: '식비'
    },
    customSave: (newRecord) => {
      // 🌟 샌드박스 배열에 가상 거래 추가
      sandboxRecords.push({
        ...newRecord,
        id: generateLedgerId(),
        amount: Number(newRecord.amount || 0),
        payment: '기업은행',
        payment_method: '기업은행'
      });
      recomputeAndRender();
    }
  });
}

/**
 * 월 드롭다운 옵션 초기화
 */
function populateMonthSelects() {
  const singleSel = document.getElementById('ledgerAvgSingleMonthSelect');
  const startSel = document.getElementById('ledgerAvgStartMonthSelect');
  const endSel = document.getElementById('ledgerAvgEndMonthSelect');

  if (!singleSel || !startSel || !endSel) return;

  // 2026-01부터 2026-12까지 기본 생성
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push(`2026-${String(m).padStart(2, '0')}`);
  }
  availableMonths = months;

  const buildOptions = (selected) => {
    return months.map(m => {
      const [y, mm] = m.split('-');
      const isSel = (m === selected) ? 'selected' : '';
      return `<option value="${m}" ${isSel}>${y}년 ${parseInt(mm, 10)}월</option>`;
    }).join('');
  };

  singleSel.innerHTML = buildOptions(selectedStartMonth);
  startSel.innerHTML = buildOptions(selectedStartMonth);
  endSel.innerHTML = buildOptions(selectedEndMonth);
}

export function initAverageBalanceModal({ getLedgerRecords, getTransactionModal } = {}) {
  const overlay = document.getElementById('ledgerAverageBalanceOverlay');
  const closeBtn = document.getElementById('ledgerAverageBalanceCloseBtn');
  const openBtn = document.getElementById('ledgerAverageBalanceBtn');
  const modeSingleBtn = document.getElementById('ledgerAvgModeSingleBtn');
  const modeMultiBtn = document.getElementById('ledgerAvgModeMultiBtn');
  const singlePickerWrap = document.getElementById('ledgerAvgSinglePickerWrap');
  const multiPickerWrap = document.getElementById('ledgerAvgMultiPickerWrap');
  const singleSel = document.getElementById('ledgerAvgSingleMonthSelect');
  const startSel = document.getElementById('ledgerAvgStartMonthSelect');
  const endSel = document.getElementById('ledgerAvgEndMonthSelect');
  const openingInput = document.getElementById('ledgerAverageOpeningBalanceInput');
  const resetBtn = document.getElementById('ledgerAvgResetBankBtn');
  const addBtn = document.getElementById('ledgerAverageAddTransactionBtn');

  if (!overlay || !closeBtn) return;

  if (typeof getTransactionModal === 'function') {
    getLedgerTransactionModalFn = getTransactionModal;
  }

  const close = () => overlay.classList.remove('active');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      // 전체 가계부 데이터에서 기업은행 거래 캐싱
      if (typeof getLedgerRecords === 'function') {
        const all = getLedgerRecords() || [];
        allBankRecordsCache = all.filter(r => {
          const sheet = r.sheetName || r.payment || r.payment_method || '';
          return sheet === '기업은행';
        });
      }

      // 기본 당월 세팅
      const curMonth = new Date().toISOString().slice(0, 7);
      selectedStartMonth = curMonth >= '2026-01' ? curMonth : '2026-08';
      selectedEndMonth = selectedStartMonth;

      populateMonthSelects();
      loadSandboxFromRealData();
      overlay.classList.add('active');
    });
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  // 1. 모드 전환 (한 달 vs 여러 달)
  if (modeSingleBtn && modeMultiBtn) {
    modeSingleBtn.addEventListener('click', () => {
      mode = 'single';
      modeSingleBtn.classList.add('active');
      modeMultiBtn.classList.remove('active');
      singlePickerWrap?.classList.remove('hidden');
      multiPickerWrap?.classList.add('hidden');
      selectedEndMonth = selectedStartMonth;
      loadSandboxFromRealData();
    });

    modeMultiBtn.addEventListener('click', () => {
      mode = 'multi';
      modeMultiBtn.classList.add('active');
      modeSingleBtn.classList.remove('active');
      singlePickerWrap?.classList.add('hidden');
      multiPickerWrap?.classList.remove('hidden');
      if (selectedEndMonth < selectedStartMonth) {
        selectedEndMonth = selectedStartMonth;
      }
      loadSandboxFromRealData();
    });
  }

  // 2. 월 선택 변경 이벤트
  singleSel?.addEventListener('change', e => {
    selectedStartMonth = e.target.value;
    selectedEndMonth = e.target.value;
    loadSandboxFromRealData();
  });

  startSel?.addEventListener('change', e => {
    selectedStartMonth = e.target.value;
    if (selectedEndMonth < selectedStartMonth) {
      selectedEndMonth = selectedStartMonth;
      if (endSel) endSel.value = selectedStartMonth;
    }
    loadSandboxFromRealData();
  });

  endSel?.addEventListener('change', e => {
    selectedEndMonth = e.target.value;
    if (selectedStartMonth > selectedEndMonth) {
      selectedStartMonth = selectedEndMonth;
      if (startSel) startSel.value = selectedEndMonth;
    }
    loadSandboxFromRealData();
  });

  // 3. 시작 잔액 직접 수정 이벤트
  openingInput?.addEventListener('input', e => {
    openingBalance = parseNumber(e.target.value);
    e.target.value = formatMoney(openingBalance);
    recomputeAndRender();
  });

  // 4. 원본 데이터 다시 로드 버튼
  resetBtn?.addEventListener('click', () => {
    loadSandboxFromRealData();
  });

  // 5. 새 거래 추가 버튼
  addBtn?.addEventListener('click', () => {
    openSandboxAddModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      close();
    }
  });
}
