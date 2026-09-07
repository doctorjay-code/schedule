/**
 * Military Salary Calculator Modal Controller
 * 일정 DB 연동 군인 급여(월급) 계산기 및 국방급여포털 명세서 렌더러
 */

import { getAllWeeksData } from '../../../services/schedule/schedule-store.js';
import { calculateMonthlySalary, ACTUAL_SALARY_HISTORY, OT_HOURLY_RATE } from '../../../domain/schedule/salary-engine.js';
import { escapeHtml } from '../../../shared/safe.js';

let currentSalaryYear = 2026;
let currentSalaryMonth = 9; // 기본값 9월
let activeInlineAdd = null; // null | 'earnings' | 'deductions'
let isSalaryModalInitialized = false;

const CUSTOM_ITEMS_KEY = 'salary_custom_items_v2';
const LEGACY_EXTRA_KEY = 'salary_custom_extras_v1';

/**
 * 콤마 포맷팅
 */
function formatNumber(num) {
  return Number(num || 0).toLocaleString('ko-KR');
}

/**
 * 특정 월의 사용자 추가 항목(지급/공제) 조회
 */
function getCustomItemsForMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  try {
    const v2Raw = localStorage.getItem(CUSTOM_ITEMS_KEY);
    if (v2Raw) {
      const parsed = JSON.parse(v2Raw);
      if (parsed[key]) {
        return {
          earnings: Array.isArray(parsed[key].earnings) ? parsed[key].earnings : [],
          deductions: Array.isArray(parsed[key].deductions) ? parsed[key].deductions : []
        };
      }
    }
    // 하위 호환성 (기존 v1 데이터 연동)
    const v1Raw = localStorage.getItem(LEGACY_EXTRA_KEY);
    if (v1Raw) {
      const parsed = JSON.parse(v1Raw);
      if (parsed[key] && Array.isArray(parsed[key])) {
        return {
          earnings: parsed[key].map(item => ({
            id: item.id || `extra-${Date.now()}`,
            name: item.name || '기타수당',
            current: 0,
            past: Number(item.amount || 0),
            isTaxable: Boolean(item.isTaxable)
          })),
          deductions: []
        };
      }
    }
    // 기본 탑재분 (5월 82,870원, 6월 68,020원 전속파견여비)
    if (key === '2026-05') {
      return {
        earnings: [{ id: 'init-5', name: '기타수당', current: 0, past: 82870, isTaxable: false }],
        deductions: []
      };
    }
    if (key === '2026-06') {
      return {
        earnings: [{ id: 'init-6', name: '기타수당', current: 0, past: 68020, isTaxable: false }],
        deductions: []
      };
    }
    return { earnings: [], deductions: [] };
  } catch {
    return { earnings: [], deductions: [] };
  }
}

/**
 * 특정 월의 사용자 추가 항목 저장
 */
function saveCustomItemsForMonth(year, month, data) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || '{}');
    saved[key] = {
      earnings: Array.isArray(data.earnings) ? data.earnings : [],
      deductions: Array.isArray(data.deductions) ? data.deductions : []
    };
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(saved));
  } catch (e) {
    console.warn('Failed to save custom items:', e);
  }
}

/**
 * 항목별 세부 법적 근거 및 산출 공식 사전
 */
const ITEM_EXPLANATIONS = {
  '봉급': (data) => {
    const item = data.earnings.find(e => e.name === '봉급');
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '봉급 (기본급)',
      amount: `${formatNumber(item?.total || 3185400)}원`,
      rule: '공무원보수규정 제4조 및 [별표 13] 군인의 봉급표 적용',
      formula: `
        • 계급: 대위 (호봉별 기본급여 기준)<br>
        • 당월 지급액: <strong>${formatNumber(item?.current || 3185400)}원</strong><br>
        ${item?.past > 0 ? `• 소급 지급액: <strong>${formatNumber(item.past)}원</strong><br>` : ''}
        • 매월 10일 정기 지급되는 순수 본봉입니다.
      `
    };
  },
  '정근수당': (data) => {
    const item = data.earnings.find(e => e.name === '정근수당');
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '정근수당',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '공무원수당 등에 관한 규정 제6조 (정근수당)',
      formula: `
        • 지급 시기: 매년 1월과 7월 보수지급일<br>
        • 지급 기준: 근무연수에 따라 월봉급액의 0%~50% 차등 지급<br>
        • 실지급액: <strong>${formatNumber(item?.total || 0)}원</strong>
      `
    };
  },
  '가족수당': (data) => {
    const item = data.earnings.find(e => e.name === '가족수당');
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '가족수당',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '공무원수당 등에 관한 규정 제10조 (가족수당)',
      formula: `
        • 부양가족 기준: 배우자 1명 (월 40,000원)<br>
        • 당월 수당: <strong>${formatNumber(item?.current || 40000)}원</strong><br>
        ${item?.past > 0 ? `• 과월 소급분: <strong>${formatNumber(item.past)}원</strong> (혼인신고 등록 소급)<br>` : ''}
        • 부양가족 신고 및 인사명령에 따라 매월 본봉과 함께 지급됩니다.
      `
    };
  },
  '시간외수당(정액급)': (data) => {
    const item = data.earnings.find(e => e.name.includes('정액'));
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '시간외수당 (정액급)',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '공무원수당 등에 관한 규정 제15조 및 군인 시간외근무수당 지급 지침',
      formula: `
        • 산정 기간: 2달 전(<strong>${data.otMonth}월</strong>) 근무 실적 반영<br>
        • 만근 기준: 월 출근근무일수 <strong>15일</strong> 이상 시 10시간분(148,560원) 전액 지급<br>
        • 15일 미만 시 산출식: <code>148,560원 × (실근무일수 / 15)</code><br>
        • <strong>${data.otMonth}월 실제 출근일수</strong>: <strong>${data.otStats.fixedDays}일</strong> (평일 중 연가·조퇴·외출 등 휴가 미사용 순수 근무일)<br>
        • 계산 결과: <code>148,560원 × (${Math.min(15, data.otStats.fixedDays)} / 15) = <strong>${formatNumber(item?.total || 0)}원</strong></code>
      `
    };
  },
  '시간외수당(실적급)': (data) => {
    const item = data.earnings.find(e => e.name.includes('실적'));
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '시간외수당 (실적급)',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '공무원수당 등에 관한 규정 제15조 (시간외근무수당 실적지급분)',
      formula: `
        • 산정 기간: 2달 전(<strong>${data.otMonth}월</strong>) 야간 및 당직 실적 반영<br>
        • 시간당 적용 단가: <strong>14,857원</strong> (기준호봉 봉급액 기반)<br>
        • 산출 공식: <code>인정시간 × 14,857원</code> (10원 단위 반올림)<br>
        • <strong>${data.otMonth}월 실제 인정시간</strong>: <strong>${data.otStats.totalOtHours}시간</strong><br>
        • 계산 결과: <code>${data.otStats.totalOtHours}h × 14,857원 = <strong>${formatNumber(item?.total || 0)}원</strong></code>
      `
    };
  },
  '명절휴가비': (data) => {
    const item = data.earnings.find(e => e.name === '명절휴가비');
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '명절휴가비',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '공무원수당 등에 관한 규정 제18조의3 (명절휴가비)',
      formula: `
        • 지급 대상: 설날 및 추석날 현재 재직 중인 군인<br>
        • 지급 기준: 지급기준일 현재의 <strong>월봉급액의 60%</strong><br>
        • 계산 공식: <code>3,185,400원 × 60% = <strong>${formatNumber(item?.total || 1911240)}원</strong></code>
      `
    };
  },
  '직급보조비': (data) => {
    const item = data.earnings.find(e => e.name === '직급보조비');
    return {
      badge: '지급항목',
      type: 'earnings',
      title: '직급보조비',
      amount: `${formatNumber(item?.total || 250000)}원`,
      rule: '공무원수당 등에 관한 규정 제18조의6 (직급보조비) [별표 15]',
      formula: `
        • 지급 기준: 직무수행 경비 보조를 위해 계급별 정액 지급<br>
        • 대위 계급 기준: <strong>월 250,000원</strong> 전액 과세 지급<br>
        ${item?.past > 0 ? `• 소급 지급액: <strong>${formatNumber(item.past)}원</strong><br>` : ''}
        • 실지급액: <strong>${formatNumber(item?.total || 250000)}원</strong>
      `
    };
  },
  '영외급식비': (data) => {
    const item = data.earnings.find(e => e.name === '영외급식비');
    return {
      badge: '지급항목 (비과세)',
      type: 'earnings',
      title: '영외급식비',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '군인 영외급식비 지급 훈령 및 소득세법 시행령 (실비변상 비과세)',
      formula: `
        • 지급 대상: 영외에 거주하는 간부 (장교, 부사관)<br>
        • 단가 기준: 1일 <strong>4,509원</strong> (실비변상 비과세 급여)<br>
        • 산정 일수: 전월 역일수 (30일 or 31일)<br>
        • 계산 공식: <code>전월 일수 × 4,509원 = <strong>${formatNumber(item?.total || 0)}원</strong></code>
      `
    };
  },
  '소득세': (data) => {
    const item = data.deductions.find(d => d.name === '소득세');
    return {
      badge: '공제항목',
      type: 'deductions',
      title: '소득세',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '소득세법 제134조 및 근로소득 간이세액표 (소득세법 시행령 [별표 2])',
      formula: `
        • 과세대상 표준액: <strong>${formatNumber(data.totalTaxableStandard)}원</strong><br>
        • 과세표준 구성: 당월 과세급여 + 과월 시간외수당 + 상여금 월할안분(371,630원)<br>
        • 공제대상 가족수: <strong>${data.familyCount}인 가구</strong> ${data.familyCount >= 2 ? '(본인+배우자)' : '(본인 1인)'}<br>
        • 간이세액표 해당 구간 세액: <strong>${formatNumber(item?.total || 0)}원</strong> 원천징수
      `
    };
  },
  '지방소득세': (data) => {
    const item = data.deductions.find(d => d.name === '지방소득세');
    const incomeTaxItem = data.deductions.find(d => d.name === '소득세');
    return {
      badge: '공제항목',
      type: 'deductions',
      title: '지방소득세',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '지방세법 제89조 (개인지방소득세의 세율)',
      formula: `
        • 산정 기준: 당월 소득세액의 <strong>10%</strong> 부과<br>
        • 소득세: ${formatNumber(incomeTaxItem?.total || 0)}원<br>
        • 계산 공식: <code>${formatNumber(incomeTaxItem?.total || 0)}원 × 10% = <strong>${formatNumber(item?.total || 0)}원</strong></code> (10원 미만 절사)
      `
    };
  },
  '일반기여금': (data) => {
    const item = data.deductions.find(d => d.name === '일반기여금');
    return {
      badge: '공제항목',
      type: 'deductions',
      title: '일반기여금 (군인연금)',
      amount: `${formatNumber(item?.total || 328410)}원`,
      rule: '공무원연금법 제67조 및 군인연금법 (기여금의 납부)',
      formula: `
        • 산정 기준: 공무원연금공단 고시 기준소득월액의 <strong>9.0%</strong><br>
        • 기여금 특성: 당해 연도 동안 매월 <strong>328,410원</strong> 완전 고정<br>
        ${item?.past > 0 ? `• 과월 소급 공제: <strong>${formatNumber(item.past)}원</strong><br>` : ''}
        • 납부 총액: <strong>${formatNumber(item?.total || 328410)}원</strong> (퇴직 시 군인연금 수급 재원)
      `
    };
  },
  '건강보험료': (data) => {
    const item = data.deductions.find(d => d.name === '건강보험료');
    return {
      badge: '공제항목',
      type: 'deductions',
      title: '건강보험료',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '국민건강보험법 제75조 및 군인 건강보험료 20% 법정 감면 규정',
      formula: `
        • 건강보험 보수월액: 총지급액 중 과세대상 보수 (비과세 영외급식비 제외)<br>
        • 법정 근로자 부담 요율: <strong>3.595%</strong><br>
        • <strong>군인 특례 감면</strong>: 군 의료시설 이용 특성으로 본인부담금의 <strong>20% 감면</strong> (80%만 부과)<br>
        • 산출 공식: <code>보수월액 × 3.595% × 80% = <strong>${formatNumber(item?.total || 0)}원</strong></code> (10원 미만 절사)
      `
    };
  },
  '노인장기요양보험료': (data) => {
    const item = data.deductions.find(d => d.name === '노인장기요양보험료');
    const healthItem = data.deductions.find(d => d.name === '건강보험료');
    return {
      badge: '공제항목',
      type: 'deductions',
      title: '노인장기요양보험료',
      amount: `${formatNumber(item?.total || 0)}원`,
      rule: '노인장기요양보험법 제9조 (장기요양보험료율 고시)',
      formula: `
        • 산정 기준: 당월 건강보험료액의 <strong>13.140473%</strong> (2026년도 법정 요율)<br>
        • 건강보험료: ${formatNumber(healthItem?.total || 0)}원<br>
        • 산출 공식: <code>${formatNumber(healthItem?.total || 0)}원 × 13.140473% = <strong>${formatNumber(item?.total || 0)}원</strong></code> (10원 미만 절사)
      `
    };
  }
};

/**
 * 항목 설명 정보 추출
 */
function getExplanationForItem(itemName, salaryData) {
  if (ITEM_EXPLANATIONS[itemName]) {
    return ITEM_EXPLANATIONS[itemName](salaryData);
  }
  for (const key of Object.keys(ITEM_EXPLANATIONS)) {
    if (itemName.includes(key)) {
      return ITEM_EXPLANATIONS[key](salaryData);
    }
  }
  // 직접 추가한 사용자 정의 항목
  const isDeduction = salaryData.deductions.some(d => d.name === itemName);
  const found = isDeduction
    ? salaryData.deductions.find(d => d.name === itemName)
    : salaryData.earnings.find(e => e.name === itemName);

  return {
    badge: isDeduction ? '공제항목' : (found?.taxable ? '지급항목' : '지급항목 (비과세)'),
    type: isDeduction ? 'deductions' : 'earnings',
    title: itemName,
    amount: `${formatNumber(found?.total || 0)}원`,
    rule: '직접 추가된 수당/공제 항목 (전속파견여비, 기타 소급분 등)',
    formula: `
      • 사용자 직접 입력 항목<br>
      • 당월 금액: <strong>${formatNumber(found?.current || 0)}원</strong><br>
      • 과월 금액: <strong>${formatNumber(found?.past || 0)}원</strong><br>
      • 합계 금액: <strong>${formatNumber(found?.total || 0)}원</strong>
    `
  };
}

/**
 * 항목 세부 설명 모달 열기
 */
export function openSalaryItemDetailModal(itemName, salaryData) {
  const overlay = document.getElementById('salaryItemModalOverlay');
  if (!overlay) return;

  const badgeEl = document.getElementById('salaryItemModalBadge');
  const titleEl = document.getElementById('salaryItemModalTitle');
  const amountEl = document.getElementById('salaryItemModalAmount');
  const ruleEl = document.getElementById('salaryItemModalRule');
  const formulaEl = document.getElementById('salaryItemModalFormula');

  const exp = getExplanationForItem(itemName, salaryData);

  if (badgeEl) {
    badgeEl.textContent = exp.badge;
    badgeEl.className = 'item-modal-badge' + (exp.type === 'deductions' ? ' badge-deduction' : '');
  }
  if (titleEl) titleEl.textContent = exp.title;
  if (amountEl) amountEl.textContent = exp.amount;
  if (ruleEl) ruleEl.innerHTML = exp.rule;
  if (formulaEl) formulaEl.innerHTML = exp.formula;

  overlay.classList.add('active');
}

/**
 * 항목 세부 설명 모달 닫기
 */
export function closeSalaryItemDetailModal() {
  const overlay = document.getElementById('salaryItemModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
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

let lastCalculatedSalaryData = null;

/**
 * 명세서 화면 렌더링
 */
export function renderSalarySlip() {
  const container = document.getElementById('salarySlipContainer');
  if (!container) return;

  const allWeeks = getAllWeeksData();
  const customItems = getCustomItemsForMonth(currentSalaryYear, currentSalaryMonth);

  const salaryData = calculateMonthlySalary({
    year: currentSalaryYear,
    month: currentSalaryMonth,
    allWeeksData: allWeeks,
    customOverrides: {
      extraAllowances: customItems.earnings,
      extraDeductions: customItems.deductions
    }
  });
  lastCalculatedSalaryData = salaryData;

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
  let earningsRows = salaryData.earnings.map(e => `
    <tr>
      <td class="col-name">
        ${e.isCustom ? `
          <span class="custom-col-name">
            <button type="button" class="btn-item-detail" data-item-name="${escapeHtml(e.name)}" data-item-type="earnings">${escapeHtml(e.name)}</button>
            <button type="button" class="btn-del-custom" data-del-type="earnings" data-del-id="${escapeHtml(e.id)}" title="항목 삭제">✕</button>
          </span>
        ` : `
          <button type="button" class="btn-item-detail" data-item-name="${escapeHtml(e.name)}" data-item-type="earnings">${escapeHtml(e.name)}</button>
        `}
      </td>
      <td class="col-num">${e.current > 0 ? formatNumber(e.current) : '-'}</td>
      <td class="col-num">${e.past > 0 ? formatNumber(e.past) : '-'}</td>
      <td class="col-num col-subtotal">${formatNumber(e.total)}</td>
    </tr>
  `).join('');

  if (activeInlineAdd === 'earnings') {
    earningsRows += `
      <tr class="inline-add-row" id="inlineAddEarningsRow">
        <td class="col-name">
          <input type="text" id="inlineAddName" class="inline-table-input inline-name" placeholder="항목명 (예: 기타수당)" value="기타수당">
        </td>
        <td class="col-num">
          <input type="number" id="inlineAddCurrent" class="inline-table-input inline-num" placeholder="0" step="10">
        </td>
        <td class="col-num">
          <input type="number" id="inlineAddPast" class="inline-table-input inline-num" placeholder="0" step="10">
        </td>
        <td class="col-num inline-add-actions">
          <button type="button" class="btn-inline-confirm" data-add-type="earnings" title="저장">✓</button>
          <button type="button" class="btn-inline-cancel" title="취소">✕</button>
        </td>
      </tr>
    `;
  }

  // 공제내역 테이블 행
  let deductionsRows = salaryData.deductions.map(d => `
    <tr>
      <td class="col-name">
        ${d.isCustom ? `
          <span class="custom-col-name">
            <button type="button" class="btn-item-detail" data-item-name="${escapeHtml(d.name)}" data-item-type="deductions">${escapeHtml(d.name)}</button>
            <button type="button" class="btn-del-custom" data-del-type="deductions" data-del-id="${escapeHtml(d.id)}" title="항목 삭제">✕</button>
          </span>
        ` : `
          <button type="button" class="btn-item-detail" data-item-name="${escapeHtml(d.name)}" data-item-type="deductions">${escapeHtml(d.name)}</button>
        `}
      </td>
      <td class="col-num">${d.current > 0 ? formatNumber(d.current) : '-'}</td>
      <td class="col-num">${d.past > 0 ? formatNumber(d.past) : '-'}</td>
      <td class="col-num col-subtotal">${formatNumber(d.total)}</td>
    </tr>
  `).join('');

  if (activeInlineAdd === 'deductions') {
    deductionsRows += `
      <tr class="inline-add-row" id="inlineAddDeductionsRow">
        <td class="col-name">
          <input type="text" id="inlineAddName" class="inline-table-input inline-name" placeholder="항목명 (예: 기타공제)" value="기타공제">
        </td>
        <td class="col-num">
          <input type="number" id="inlineAddCurrent" class="inline-table-input inline-num" placeholder="0" step="10">
        </td>
        <td class="col-num">
          <input type="number" id="inlineAddPast" class="inline-table-input inline-num" placeholder="0" step="10">
        </td>
        <td class="col-num inline-add-actions">
          <button type="button" class="btn-inline-confirm" data-add-type="deductions" title="저장">✓</button>
          <button type="button" class="btn-inline-cancel" title="취소">✕</button>
        </td>
      </tr>
    `;
  }

  // HTML 조합 (국방급여포털 명세서 스타일)
  container.innerHTML = `
    ${otInfoBadge}

    <div class="salary-tables-grid">
      <!-- 1. 지급내역 테이블 -->
      <div class="salary-section-box earnings-box">
        <div class="section-box-header">
          <h4>💰 지급내역</h4>
          <button type="button" class="btn-add-table-item" data-table-type="earnings">+ 항목 추가</button>
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
          <button type="button" class="btn-add-table-item" data-table-type="deductions">+ 항목 추가</button>
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

    <!-- 3. 실지급액 최종 하이라이트 카드 (동일 화이트 카드 테마) -->
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
  `;

  // 인라인 입력 열린 경우 포커스
  if (activeInlineAdd) {
    setTimeout(() => {
      const nameInp = document.getElementById('inlineAddName');
      if (nameInp) nameInp.focus();
    }, 50);
  }
}

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

  // 상세 설명 모달 버튼 & 오버레이
  const closeItemModalBtn = document.getElementById('closeSalaryItemModalBtn');
  const confirmItemModalBtn = document.getElementById('confirmSalaryItemModalBtn');
  const itemModalOverlay = document.getElementById('salaryItemModalOverlay');

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

  if (closeItemModalBtn) {
    closeItemModalBtn.addEventListener('click', closeSalaryItemDetailModal);
  }

  if (confirmItemModalBtn) {
    confirmItemModalBtn.addEventListener('click', closeSalaryItemDetailModal);
  }

  if (itemModalOverlay) {
    itemModalOverlay.addEventListener('click', (e) => {
      if (e.target === itemModalOverlay) {
        closeSalaryItemDetailModal();
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
        activeInlineAdd = null; // 월 변경 시 인라인 입력 초기화
        renderSalarySlip();
      }
    });
  }

  // 컨테이너 내 위임 이벤트 처리
  if (container) {
    container.addEventListener('click', (e) => {
      // 1. 항목 클릭 -> 세부 산출 근거 팝업 모달 열기
      const itemBtn = e.target.closest('.btn-item-detail');
      if (itemBtn) {
        const itemName = itemBtn.dataset.itemName;
        if (itemName && lastCalculatedSalaryData) {
          openSalaryItemDetailModal(itemName, lastCalculatedSalaryData);
        }
        return;
      }

      // 2. 테이블 헤더 "+ 항목 추가" 버튼 클릭
      const addTableBtn = e.target.closest('.btn-add-table-item');
      if (addTableBtn) {
        const tableType = addTableBtn.dataset.tableType; // 'earnings' | 'deductions'
        activeInlineAdd = (activeInlineAdd === tableType) ? null : tableType;
        renderSalarySlip();
        return;
      }

      // 3. 인라인 입력 취소 버튼
      const cancelInlineBtn = e.target.closest('.btn-inline-cancel');
      if (cancelInlineBtn) {
        activeInlineAdd = null;
        renderSalarySlip();
        return;
      }

      // 4. 인라인 입력 저장(확인) 버튼
      const confirmInlineBtn = e.target.closest('.btn-inline-confirm');
      if (confirmInlineBtn) {
        const addType = confirmInlineBtn.dataset.addType; // 'earnings' | 'deductions'
        const nameInput = document.getElementById('inlineAddName');
        const curInput = document.getElementById('inlineAddCurrent');
        const pastInput = document.getElementById('inlineAddPast');

        const name = (nameInput?.value || '').trim() || (addType === 'earnings' ? '기타수당' : '기타공제');
        const curVal = parseInt(curInput?.value || '0', 10) || 0;
        const pastVal = parseInt(pastInput?.value || '0', 10) || 0;

        if (curVal === 0 && pastVal === 0) {
          alert('당월 또는 과월 금액을 0원보다 크게 입력해 주세요.');
          (curInput || pastInput)?.focus();
          return;
        }

        const customData = getCustomItemsForMonth(currentSalaryYear, currentSalaryMonth);
        const newItem = {
          id: 'custom-' + Date.now(),
          name,
          current: curVal,
          past: pastVal,
          isTaxable: false
        };

        if (addType === 'earnings') {
          customData.earnings.push(newItem);
        } else {
          customData.deductions.push(newItem);
        }

        saveCustomItemsForMonth(currentSalaryYear, currentSalaryMonth, customData);
        activeInlineAdd = null;
        renderSalarySlip();
        return;
      }

      // 5. 직접 추가된 항목 개별 삭제(✕) 버튼
      const delCustomBtn = e.target.closest('.btn-del-custom');
      if (delCustomBtn) {
        const delType = delCustomBtn.dataset.delType; // 'earnings' | 'deductions'
        const delId = delCustomBtn.dataset.delId;
        if (!delId) return;

        const customData = getCustomItemsForMonth(currentSalaryYear, currentSalaryMonth);
        if (delType === 'earnings') {
          customData.earnings = customData.earnings.filter(item => item.id !== delId);
        } else {
          customData.deductions = customData.deductions.filter(item => item.id !== delId);
        }

        saveCustomItemsForMonth(currentSalaryYear, currentSalaryMonth, customData);
        renderSalarySlip();
        return;
      }
    });

    // Enter키로 인라인 저장, Escape로 취소
    container.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('inline-table-input')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const confirmBtn = container.querySelector('.btn-inline-confirm');
          if (confirmBtn) confirmBtn.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          activeInlineAdd = null;
          renderSalarySlip();
        }
      }
    });
  }
}
