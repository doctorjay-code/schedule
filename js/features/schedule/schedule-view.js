import { state, updateSummaryCounts } from '../../services/schedule/schedule-store.js';
import { openModal } from './modals/edit.js';
import { escapeHtml, safeCssColor } from '../../shared/safe.js';
import { isHolidayDate } from '../../domain/schedule/calendar-rules.js';
import { renderMonthlyCalendarView } from './monthly-view.js';
import { createScheduleCellRenderers } from './cell-renderers.js';
import { createScheduleSelection } from './selection.js';

// Load Specified Week Data
export function loadWeekData(index) {
  if (!state.allWeeksData || state.allWeeksData.length === 0) {
    state.weekData = [];
    renderTable();
    updateSummaryCounts();
    return;
  }
  if (index < 0) index = 0;
  if (index >= state.allWeeksData.length) index = state.allWeeksData.length - 1;
  state.currentWeekIndex = index;

  const weekTitleElem = document.getElementById('weekTitle');
  const selectedCountLabel = document.getElementById('selectedCountLabel');

  const currentWeekObj = state.allWeeksData[state.currentWeekIndex];
  if (!currentWeekObj) return;

  if (weekTitleElem && state.currentView === 'weekly') {
    const titleNumbers = currentWeekObj.title?.match(/\d+/g) || [];
    const periodNumbers = currentWeekObj.title?.match(/\(([^)]*)\)/)?.[1]?.match(/\d+/g) || [];
    const year = titleNumbers.find(value => value.length === 4) || new Date().getFullYear();
    const rawTitle = periodNumbers.length >= 4
      ? year + '.' + periodNumbers[0].padStart(2, '0') + '.' + periodNumbers[1].padStart(2, '0') + String.fromCharCode(8211) + periodNumbers[2].padStart(2, '0') + '.' + periodNumbers[3].padStart(2, '0')
      : currentWeekObj.title;
    weekTitleElem.innerHTML = escapeHtml(rawTitle) + ' <span class="dropdown-arrow">' + String.fromCharCode(9662) + '</span>';  }
  // 주가 실제로 바뀔 때만 선택 초기화 (복사 직후 재렌더링에서 selectedCells가 날아가는 버그 방지)
  const prevWeekData = state.weekData;
  state.weekData = currentWeekObj.items || [];

  if (prevWeekData !== state.weekData) {
    state.selectedCells = [];
    if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
  }

  renderTable();
  updateSummaryCounts();
  if (state.currentView === 'monthly') {
    renderMonthlyCalendar();
  }
}

// Helper: Check if date is weekend or holiday
export function isRedDate(item) {
  return isHolidayDate(item);
}

// Helper: Check filter match
export function checkFilterMatch(item) {
  if (state.currentFilter === 'jinju' && item.region !== '진주') return false;
  if (state.currentFilter === 'seoul' && item.region !== '서울') return false;
  if (state.currentFilter === 'transport' && !item.transStatus) return false;
  if (state.currentFilter === 'unpaid' && item.transStatus !== '결제X') return false;
  if (state.currentFilter === 'unapplied' && (item.hrStatus !== '신청X' && item.otStatus !== '신청X')) return false;
  if (state.currentFilter === 'unapproved' && (item.hrStatus !== '신청O' && item.otStatus !== '신청O')) return false;
  return true;
}

let scheduleSelection = null;
function getScheduleSelection() {
  if (!scheduleSelection) scheduleSelection = createScheduleSelection({ state, onChange: renderTable });
  return scheduleSelection;
}
export function isCellSelected(key) {
  return getScheduleSelection().isSelected(key);
}
export function toggleCellKey(key) {
  getScheduleSelection().toggleCell(key);
}
export function toggleFullDaySelection(mId, aId, dayKey) {
  getScheduleSelection().toggleFullDay(mId, aId, dayKey);
}
export function toggleRowSelection(id, rowKey) {
  getScheduleSelection().toggleRow(id, rowKey);
}
// Render Table Function with Precision Cell-Level Multi Selection & Smart Visual Cell Merging
export function renderTable() {
  const scheduleBody = document.getElementById('scheduleBody');
  if (!scheduleBody) return;
  scheduleBody.innerHTML = '';
  if (!state.weekData || state.weekData.length === 0) {
    const emptyRow = document.createElement('tr');
    const message = state.scheduleDataState === 'loading'
      ? '일정 불러오는 중…'
      : state.scheduleDataState === 'error'
        ? '일정을 불러오지 못했습니다. 새로고침 버튼을 눌러 다시 시도해 주세요.'
        : '일정이 없습니다.';
    emptyRow.innerHTML = `<td class="schedule-empty-state" colspan="7">${message}</td>`;
    scheduleBody.appendChild(emptyRow);
    return;
  }

  for (let i = 0; i < state.weekData.length; i += 2) {
    const mItem = state.weekData[i];       // Morning Item
    const aItem = state.weekData[i + 1];   // Afternoon Item

    const mTr = document.createElement('tr');
    mTr.dataset.id = mItem.id;

    const aTr = document.createElement('tr');
    if (aItem) {
      aTr.dataset.id = aItem.id;
      aTr.classList.add('row-day-end');
    }

    // Filter Logic
    let mMatched = checkFilterMatch(mItem);
    let aMatched = aItem ? checkFilterMatch(aItem) : false;

    mTr.style.opacity = mMatched ? '1' : '0.35';
    if (aTr) aTr.style.opacity = aMatched ? '1' : '0.35';

    // 1. Date Cell (날짜/요일): Always Merged!
    const tdDate = document.createElement('td');
    tdDate.rowSpan = 2;
    tdDate.className = 'cell-date';

    const dayKey = `${mItem.id}_${aItem ? aItem.id : ''}_day`;
    const mSubCount = state.selectedCells.filter(k => k.startsWith(`${mItem.id}_`)).length;
    const aSubCount = aItem ? state.selectedCells.filter(k => k.startsWith(`${aItem.id}_`)).length : 0;
    const isFullDaySelected = isCellSelected(dayKey) || 
                               (isCellSelected(`${mItem.id}_row`) && aItem && isCellSelected(`${aItem.id}_row`)) ||
                               (mSubCount >= 3 && aSubCount >= 3);

    if (state.isMultiEditMode && isFullDaySelected) {
      tdDate.classList.add('cell-date-selected');
    }

    if (isRedDate(mItem)) {
      tdDate.classList.add('cell-holiday');
    }
    tdDate.textContent = mItem.date;

    tdDate.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) {
        toggleFullDaySelection(mItem.id, aItem ? aItem.id : null, dayKey);
      } else {
        openModal(mItem);
      }
    });
    mTr.appendChild(tdDate);

    // 2. Time Cells (시간): Morning & Afternoon Rows
    const mTime = createTimeTd(mItem);
    mTr.appendChild(mTime);

    let aTime = null;
    if (aItem) {
      aTime = createTimeTd(aItem);
      aTr.appendChild(aTime);
    }

    // Helper Functions for Merging
    const isSameRegion = aItem && (mItem.region === aItem.region) && (mItem.region !== '');
    const isSameClinic = aItem && (mItem.clinic === aItem.clinic) && (mItem.clinic !== '');
    const isSameTrans = aItem && (mItem.transStatus === aItem.transStatus) && (mItem.transDetail === aItem.transDetail) && (mItem.transStatus || mItem.transDetail);
    const isSameHr = aItem && (mItem.hrStatus === aItem.hrStatus) && (mItem.hrDetail === aItem.hrDetail) && (mItem.hrStatus || mItem.hrDetail);
    const isSameOt = aItem && (mItem.otStatus === aItem.otStatus) && (mItem.otDetail === aItem.otDetail) && (mItem.otStatus || mItem.otDetail);

    // 3. Region Cells
    if (isSameRegion) {
      const tdReg = createRegionTd(mItem, aItem, true);
      tdReg.rowSpan = 2;
      tdReg.classList.add('cell-day-end-border');
      mTr.appendChild(tdReg);
    } else {
      mTr.appendChild(createRegionTd(mItem));
      if (aItem) aTr.appendChild(createRegionTd(aItem));
    }

    // 4. Clinic Cells
    if (isSameClinic) {
      const tdClin = createClinicTd(mItem, aItem, true);
      tdClin.rowSpan = 2;
      tdClin.classList.add('cell-day-end-border');
      mTr.appendChild(tdClin);
    } else {
      mTr.appendChild(createClinicTd(mItem));
      if (aItem) aTr.appendChild(createClinicTd(aItem));
    }

    // 5. Transport Cells
    if (isSameTrans) {
      const tdTrn = createTransTd(mItem, aItem, true);
      tdTrn.rowSpan = 2;
      tdTrn.classList.add('cell-day-end-border');
      mTr.appendChild(tdTrn);
    } else {
      mTr.appendChild(createTransTd(mItem));
      if (aItem) aTr.appendChild(createTransTd(aItem));
    }

    // 6. HR Cells
    if (isSameHr) {
      const tdH = createHrTd(mItem, aItem, true);
      tdH.rowSpan = 2;
      tdH.classList.add('cell-day-end-border');
      mTr.appendChild(tdH);
    } else {
      mTr.appendChild(createHrTd(mItem));
      if (aItem) aTr.appendChild(createHrTd(aItem));
    }

    // 7. Overtime Cells
    if (isSameOt) {
      const tdO = createOtTd(mItem, aItem, true);
      tdO.rowSpan = 2;
      tdO.classList.add('cell-day-end-border');
      mTr.appendChild(tdO);
    } else {
      mTr.appendChild(createOtTd(mItem));
      if (aItem) aTr.appendChild(createOtTd(aItem));
    }

    scheduleBody.appendChild(mTr);
    if (aItem) scheduleBody.appendChild(aTr);
  }
}

let scheduleCellRenderers = null;
function getScheduleCellRenderers() {
  if (!scheduleCellRenderers) {
    scheduleCellRenderers = createScheduleCellRenderers({
      state,
      isCellSelected,
      toggleCellKey,
      toggleRowSelection,
      openModal
    });
  }
  return scheduleCellRenderers;
}
export function createTimeTd(...args) { return getScheduleCellRenderers().createTimeTd(...args); }
export function attachSmartCellClick(...args) { return getScheduleCellRenderers().attachSmartCellClick(...args); }
export function applyCustomCellColor(...args) { return getScheduleCellRenderers().applyCustomCellColor(...args); }
export function createRegionTd(...args) { return getScheduleCellRenderers().createRegionTd(...args); }
export function createClinicTd(...args) { return getScheduleCellRenderers().createClinicTd(...args); }
export function createTransTd(...args) { return getScheduleCellRenderers().createTransTd(...args); }
export function createHrTd(...args) { return getScheduleCellRenderers().createHrTd(...args); }
export function createOtTd(...args) { return getScheduleCellRenderers().createOtTd(...args); }
// Render Monthly View Calendar & Color Legend
export function renderMonthlyCalendar() {
  return renderMonthlyCalendarView({ state, isRedDate });
}
export function switchViewModeUI(mode) {
  state.currentView = mode;
  const weeklyBtn = document.getElementById('weeklyViewBtn');
  const monthlyBtn = document.getElementById('monthlyViewBtn');
  const weeklyWrapper = document.getElementById('weeklyViewWrapper');
  const monthlyWrapper = document.getElementById('monthlyViewWrapper');

  if (mode === 'weekly') {
    if (weeklyBtn) weeklyBtn.classList.add('active');
    if (monthlyBtn) monthlyBtn.classList.remove('active');
    if (weeklyWrapper) weeklyWrapper.classList.remove('hidden');
    if (monthlyWrapper) monthlyWrapper.classList.add('hidden');
    loadWeekData(state.currentWeekIndex);
  } else {
    if (monthlyBtn) monthlyBtn.classList.add('active');
    if (weeklyBtn) weeklyBtn.classList.remove('active');
    if (monthlyWrapper) monthlyWrapper.classList.remove('hidden');
    if (weeklyWrapper) weeklyWrapper.classList.add('hidden');

    // Update current Month/Year state from active week object title
    if (state.allWeeksData && state.allWeeksData[state.currentWeekIndex]) {
      const currentWeekObj = state.allWeeksData[state.currentWeekIndex];
      const titleStr = currentWeekObj.title || '';
      const numbers = titleStr.match(/(\d+)/g);
      if (numbers && numbers.length >= 2) {
        state.currentMonthYear.year = parseInt(numbers[0], 10);
        state.currentMonthYear.month = parseInt(numbers[1], 10);
      }
    }
    renderMonthlyCalendar();
  }
}






