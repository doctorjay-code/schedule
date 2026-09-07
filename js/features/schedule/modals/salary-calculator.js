/**
 * Military Salary Calculator Modal Controller
 * 일정 DB 연동 군인 급여(월급) 계산기 및 국방급여포털 명세서 렌더러
 */

import { getAllWeeksData } from '../../../services/schedule/schedule-store.js';
import { calculateMonthlySalary, ACTUAL_SALARY_HISTORY, OT_HOURLY_RATE } from '../../../domain/schedule/salary-engine.js';
import { escapeHtml } from '../../../shared/safe.js';

let currentSalaryYear = 2026;
let currentSalaryMonth = 9; // 기본값 9월
const EXTRA_ALLOWANCES_KEY = 'salary_custom_extras_v1';

/**
 * 콤마 포맷팅
 */
function formatNumber(num) {
  return Number(num || 0).toLocaleString('ko-KR');
}

/**
 * 특정 월의 기타 수당/파견여비 목록 조회 (localStorage)
 */
function getExtraAllowancesForMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  try {
    const saved = JSON.parse(localStorage.getItem(EXTRA_ALLOWANCES_KEY) || '{}');
    if (saved[key] && Array.isArray(saved[key])) {
      return saved[key];
    }
    // 초기 기본값: 5월 82,870원, 6월 68,020원 사전 탑재
    if (key === '2026-05') {
      return [{ id: 'init-5', name: '기타수당', amount: 82870, isTaxable: false }];
    }
    if (key === '2026-06') {
      return [{ id: 'init-6', name: '기타수당', amount: 68020, isTaxable: false }];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 특정 월의 기타 수당 목록 저장
 */
function saveExtraAllowancesForMonth(year, month, list) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  try {
    const saved = JSON.parse(localStorage.getItem(EXTRA_ALLOWANCES_KEY) || '{}');
    saved[key] = list;
    localStorage.setItem(EXTRA_ALLOWANCES_KEY, JSON.stringify(saved));
  } catch (e) {
    console.warn('Failed to save extra allowances:', e);
  }
}

/**
 * 급여 계산기 모달 열기
 */
export function openSalaryCalculatorModal(targetMonth) {
  const overlay = document.getElementById('salaryModalOverlay');
  if (!overlay) return;

  if (targetMonth && targetMonth >= 1 && targetMonth <= 12) {
    currentSalaryMonth = targetMonth;
  } else {
    currentSalaryYear = 2026;
    currentSalaryMonth = 9;
  }

  const select = document.getElementById('salaryMonthSelect');
  if (select) {
    select.value = `${currentSalaryYear}-${String(currentSalaryMonth).padStart(2, '0')}`;
  }

  renderSalarySlip();
  overlay.classList.add('active');
}

/**
 * 급여 계산기 모달 닫기
 */
export function closeSalaryCalculatorModal() {
  const overlay = document.getElementById('salaryModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

/**
 * 명세서 화면 렌더링
 */
export function renderSalarySlip() {
  const container = document.getElementById('salarySlipContainer');
  if (!container) return;

  const allWeeks = getAllWeeksData();
  const extraAllowances = getExtraAllowancesForMonth(currentSalaryYear, currentSalaryMonth);

  const salaryData = calculateMonthlySalary({
    year: currentSalaryYear,
    month: currentSalaryMonth,
    allWeeksData: allWeeks,
    customOverrides: {
      extraAllowances
    }
  });

  // 실적 안내 배지 (단가 반올림 정수 표기 및 간소화)
  const otInfoBadge = `
    <div class="salary-ot-summary-card">
      <div class="ot-summary-chips">
        <span class="ot-chip">정액급 : <strong>${salaryData.otStats.fixedDays}일</strong></span>
        <span class="ot-chip">실적급 : <strong>${salaryData.otStats.totalOtHours}시간</strong></span>
        <span class="ot-chip">단가 : <strong>${formatNumber(Math.round(OT_HOURLY_RATE))}원</strong></span>
      </div>
    </div>
  `;

  // 지급내역 테이블 행
  const earningsRows = salaryData.earnings.map(e => `
    <tr>
      <td class="col-name">${escapeHtml(e.name)}</td>
      <td class="col-num">${e.current > 0 ? formatNumber(e.current) : '-'}</td>
      <td class="col-num">${e.past > 0 ? formatNumber(e.past) : '-'}</td>
      <td class="col-num col-subtotal">${formatNumber(e.total)}</td>
    </tr>
  `).join('');

  // 공제내역 테이블 행
  const deductionsRows = salaryData.deductions.map(d => `
    <tr>
      <td class="col-name">${escapeHtml(d.name)}</td>
      <td class="col-num">${d.current > 0 ? formatNumber(d.current) : '-'}</td>
      <td class="col-num">${d.past > 0 ? formatNumber(d.past) : '-'}</td>
      <td class="col-num col-subtotal">${formatNumber(d.total)}</td>
    </tr>
  `).join('');

  // 기타 수당 칩 목록 HTML
  const extraChipsHtml = extraAllowances.map(item => `
    <span class="salary-extra-chip">
      <span class="extra-chip-label">${escapeHtml(item.name)}: +${formatNumber(item.amount)}원 (${item.isTaxable ? '과세' : '비과세'})</span>
      <button type="button" class="extra-chip-delete" data-extra-id="${escapeHtml(item.id)}" title="삭제">✕</button>
    </span>
  `).join('');

  const taxableSum = (salaryData.earnings || []).filter(e => e.taxable).reduce((sum, e) => sum + (e.total || 0), 0);
  const otTotal = (salaryData.earnings || []).filter(e => (e.name || '').includes('시간외')).reduce((sum, e) => sum + (e.total || 0), 0);
  const regularTaxable = taxableSum - otTotal;

  // HTML 조합 (국방급여포털 명세서 스타일)
  container.innerHTML = `
    ${otInfoBadge}

    <div class="salary-tables-grid">
      <!-- 1. 지급내역 테이블 -->
      <div class="salary-section-box earnings-box">
        <div class="section-box-header">
          <h4>💰 지급내역</h4>
        </div>
        <div class="salary-table-wrapper">
          <table class="salary-table">
            <thead>
              <tr>
                <th class="col-name">지급항목</th>
                <th class="col-num">당월(원)</th>
                <th class="col-num">과월(원)</th>
                <th class="col-num">지급계(원)</th>
              </tr>
            </thead>
            <tbody>
              ${earningsRows}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td class="col-name">지급총액</td>
                <td class="col-num">${formatNumber(salaryData.totalEarningsCurrent)}</td>
                <td class="col-num">${formatNumber(salaryData.totalEarningsPast)}</td>
                <td class="col-num col-grand-total">${formatNumber(salaryData.totalEarnings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 2. 공제내역 테이블 -->
      <div class="salary-section-box deductions-box">
        <div class="section-box-header">
          <h4>🧾 공제내역</h4>
        </div>
        <div class="salary-table-wrapper">
          <table class="salary-table">
            <thead>
              <tr>
                <th class="col-name">공제항목</th>
                <th class="col-num">당월(원)</th>
                <th class="col-num">과월(원)</th>
                <th class="col-num">공제계(원)</th>
              </tr>
            </thead>
            <tbody>
              ${deductionsRows}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td class="col-name">공제총액</td>
                <td class="col-num">${formatNumber(salaryData.totalDeductionsCurrent)}</td>
                <td class="col-num">${formatNumber(salaryData.totalDeductionsPast)}</td>
                <td class="col-num col-grand-total">${formatNumber(salaryData.totalDeductions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- 기타 수당 직접 추가 카드 (방법 A) -->
    <div class="salary-extra-card">
      <div class="extra-card-header">
        <div class="extra-header-left">
          <span class="extra-header-title">➕ 기타 수당 직접 추가</span>
          <span class="extra-header-desc">드물게 발생하는 추가 수당, 소급분 등을 입력하면 실수령액에 즉시 반영됩니다.</span>
        </div>
        <button type="button" class="btn-extra-toggle" id="toggleExtraFormBtn">+ 항목 추가</button>
      </div>

      <!-- 추가 입력 폼 (토글) -->
      <div class="extra-form hidden" id="extraForm">
        <div class="extra-inputs-row">
          <input type="text" id="extraNameInput" class="extra-input" placeholder="수당명 (예: 기타수당)" value="기타수당">
          <input type="number" id="extraAmountInput" class="extra-input" placeholder="금액 (원)" step="10">
        </div>
        <div class="extra-options-row">
          <label class="extra-checkbox-label">
            <input type="checkbox" id="extraTaxableCheckbox">
            <span>과세 대상 (체크 해제 시 비과세 실비변상)</span>
          </label>
          <div class="extra-btn-actions">
            <button type="button" class="btn-extra-submit" id="addExtraBtn">적용</button>
            <button type="button" class="btn-extra-cancel" id="cancelExtraBtn">취소</button>
          </div>
        </div>
      </div>

      <!-- 등록된 기타수당 목록 -->
      <div class="extra-chips-container" id="extraChipsContainer">
        ${extraChipsHtml || '<span class="extra-empty-msg">등록된 기타 수당이 없습니다.</span>'}
      </div>
    </div>

    <!-- 3. 실지급액 최종 하이라이트 배너 -->
    <div class="salary-net-card">
      <div class="net-left">
        <div class="net-badge">실지급액 (차인지급액)</div>
        <div class="net-formula">지급총액(${formatNumber(salaryData.totalEarnings)}) - 공제총액(${formatNumber(salaryData.totalDeductions)})</div>
      </div>
      <div class="net-amount">
        <span class="currency">₩</span>
        <span class="amount-val">${formatNumber(salaryData.netSalary)}</span>
        <span class="won">원</span>
      </div>
    </div>

    <!-- 4. 세부 산출 근거 아코디언 -->
    <details class="salary-calc-details">
      <summary class="details-summary">
        <span>🔍 세부 산출 근거 (과세표준 및 세액 계산 공식)</span>
        <span class="summary-arrow">▾</span>
      </summary>
      <div class="details-content">
        <div class="calc-row">
          <span class="calc-label">• 과세대상 총액 (과세표준):</span>
          <span class="calc-val"><strong>${formatNumber(salaryData.totalTaxableStandard)}원</strong></span>
        </div>
        <div class="calc-sub">과세급여(${formatNumber(taxableSum)}원: 기본급여 등 ${formatNumber(regularTaxable)}원 + 시간외수당 ${formatNumber(otTotal)}원) + 상여금 월할안분(371,630원)</div>

        <div class="calc-row">
          <span class="calc-label">• 소득세 산출 기준:</span>
          <span class="calc-val">공제대상 <strong>${salaryData.familyCount}인 가구</strong> ${salaryData.familyCount >= 2 ? '(본인+배우자)' : '(본인 1인)'} 근로소득 간이세액표</span>
        </div>

        <div class="calc-row">
          <span class="calc-label">• 건강보험료 산출:</span>
          <span class="calc-val">(총지급액 - 영외급식비 - 비과세수당) × 3.595% × 80% (군인 20% 감면, 10원 절사)</span>
        </div>

        <div class="calc-row">
          <span class="calc-label">• 노인장기요양보험료:</span>
          <span class="calc-val">건강보험료 × 13.140473% (10원 절사)</span>
        </div>

        <div class="calc-row">
          <span class="calc-label">• 일반기여금:</span>
          <span class="calc-val"><strong>${formatNumber(salaryData.deductions.find(d => d.name.includes('기여금'))?.total || 328410)}원</strong> (공무원연금 기준소득월액 기반)</span>
        </div>
      </div>
    </details>
  `;
}

let isSalaryModalInitialized = false;

/**
 * 이벤트 리스너 설정
 */
export function setupSalaryCalculatorModal() {
  if (isSalaryModalInitialized) return;
  isSalaryModalInitialized = true;

  const openBtn = document.getElementById('openSalaryModalBtn');
  const closeBtn = document.getElementById('closeSalaryModalBtn');
  const overlay = document.getElementById('salaryModalOverlay');
  const monthSelect = document.getElementById('salaryMonthSelect');
  const container = document.getElementById('salarySlipContainer');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      openSalaryCalculatorModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSalaryCalculatorModal);
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeSalaryCalculatorModal();
      }
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', (e) => {
      const val = e.target.value || '';
      const parts = val.split('-');
      if (parts.length === 2) {
        currentSalaryYear = parseInt(parts[0], 10);
        currentSalaryMonth = parseInt(parts[1], 10);
        renderSalarySlip();
      }
    });
  }

  // 동적 기타 수당 폼/삭제 이벤트 위임
  if (container) {
    container.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('#toggleExtraFormBtn');
      if (toggleBtn) {
        const form = document.getElementById('extraForm');
        if (form) {
          form.classList.toggle('hidden');
          if (!form.classList.contains('hidden')) {
            document.getElementById('extraAmountInput')?.focus();
          }
        }
        return;
      }

      const cancelBtn = e.target.closest('#cancelExtraBtn');
      if (cancelBtn) {
        const form = document.getElementById('extraForm');
        if (form) form.classList.add('hidden');
        return;
      }

      const addBtn = e.target.closest('#addExtraBtn');
      if (addBtn) {
        const nameInput = document.getElementById('extraNameInput');
        const amountInput = document.getElementById('extraAmountInput');
        const taxableCheck = document.getElementById('extraTaxableCheckbox');

        const name = (nameInput?.value || '').trim() || '기타수당';
        const amount = parseInt(amountInput?.value || '0', 10);
        const isTaxable = Boolean(taxableCheck?.checked);

        if (!amount || amount <= 0) {
          alert('추가할 수당 금액을 올바르게 입력해 주세요.');
          amountInput?.focus();
          return;
        }

        const currentList = getExtraAllowancesForMonth(currentSalaryYear, currentSalaryMonth);
        currentList.push({
          id: 'extra-' + Date.now(),
          name,
          amount,
          isTaxable
        });

        saveExtraAllowancesForMonth(currentSalaryYear, currentSalaryMonth, currentList);
        renderSalarySlip();
        return;
      }

      const deleteBtn = e.target.closest('.extra-chip-delete');
      if (deleteBtn) {
        const extraId = deleteBtn.dataset.extraId;
        if (!extraId) return;

        let currentList = getExtraAllowancesForMonth(currentSalaryYear, currentSalaryMonth);
        currentList = currentList.filter(item => item.id !== extraId);
        saveExtraAllowancesForMonth(currentSalaryYear, currentSalaryMonth, currentList);
        renderSalarySlip();
      }
    });
  }
}
