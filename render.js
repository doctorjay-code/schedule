import { state, updateSummaryCounts } from './state.js';
import { openModal } from './modal.js';

// Load Specified Week Data
export function loadWeekData(index) {
  if (!state.allWeeksData || state.allWeeksData.length === 0) return;
  if (index < 0) index = 0;
  if (index >= state.allWeeksData.length) index = state.allWeeksData.length - 1;
  state.currentWeekIndex = index;

  const weekTitleElem = document.getElementById('weekTitle');
  const selectedCountLabel = document.getElementById('selectedCountLabel');

  const currentWeekObj = state.allWeeksData[state.currentWeekIndex];
  if (!currentWeekObj) return;

  if (weekTitleElem && state.currentView === 'weekly') {
    const rawTitle = currentWeekObj.title?.split(' (')[0] || '';
    weekTitleElem.innerHTML = `${rawTitle} <span class="dropdown-arrow">▾</span>`;
  }
  state.weekData = currentWeekObj.items || [];

  state.selectedCells = [];
  if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';

  renderTable();
  updateSummaryCounts();
  if (state.currentView === 'monthly') {
    renderMonthlyCalendar();
  }
}

// 2026.08 ~ 2027.04 Statutory Holidays & Substitute Holidays
export const fixedHolidays = [
  '8. 15.', '8. 17.',
  '9. 24.', '9. 25.', '9. 26.', '9. 28.',
  '10. 3.', '10. 5.', '10. 9.',
  '12. 25.',
  '1. 1.',
  '2. 6.', '2. 7.', '2. 8.', '2. 9.',
  '3. 1.',
  '5. 1.', '5. 5.', '5. 25.', '6. 3.', '7. 17.'
];

// Helper: Check if date is weekend or holiday
export function isRedDate(item) {
  if (!item || !item.date) return false;
  return item.date.includes('토') ||
         item.date.includes('일') ||
         fixedHolidays.some(h => item.date.includes(h));
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

// Helper: Check if cell key is selected
export function isCellSelected(key) {
  return state.selectedCells.includes(key);
}

// Helper: Toggle Cell Key Selection
export function toggleCellKey(key) {
  const selectedCountLabel = document.getElementById('selectedCountLabel');
  const idx = state.selectedCells.indexOf(key);
  if (idx >= 0) state.selectedCells.splice(idx, 1);
  else state.selectedCells.push(key);

  if (selectedCountLabel) selectedCountLabel.textContent = `${state.selectedCells.length}개 선택됨`;
  renderTable();
}

// Toggle Full Day Selection (Morning + Afternoon) & Cascading Clean
export function toggleFullDaySelection(mId, aId, dayKey) {
  const selectedCountLabel = document.getElementById('selectedCountLabel');
  const mRowKey = `${mId}_row`;
  const aRowKey = `${aId}_row`;

  const isDaySelected = isCellSelected(dayKey) || isCellSelected(mRowKey) || (aId && isCellSelected(aRowKey));

  if (isDaySelected) {
    state.selectedCells = state.selectedCells.filter(k => {
      const id = parseInt(k.split('_')[0]);
      return id !== mId && id !== aId && k !== dayKey;
    });
  } else {
    state.selectedCells.push(dayKey);
    state.selectedCells.push(mRowKey);
    if (aId) state.selectedCells.push(aRowKey);
  }
  if (selectedCountLabel) selectedCountLabel.textContent = `${state.selectedCells.length}개 선택됨`;
  renderTable();
}

// Toggle Single Time Row Selection & Cascading Sub-Cell Clean
export function toggleRowSelection(id, rowKey) {
  const selectedCountLabel = document.getElementById('selectedCountLabel');
  const hasSubCells = state.selectedCells.some(k => k.startsWith(`${id}_`));

  if (hasSubCells) {
    state.selectedCells = state.selectedCells.filter(k => !k.startsWith(`${id}_`));
  } else {
    state.selectedCells.push(rowKey);
  }

  if (selectedCountLabel) selectedCountLabel.textContent = `${state.selectedCells.length}개 선택됨`;
  renderTable();
}

// Render Table Function with Precision Cell-Level Multi Selection & Smart Visual Cell Merging
export function renderTable() {
  const scheduleBody = document.getElementById('scheduleBody');
  if (!scheduleBody) return;
  scheduleBody.innerHTML = '';

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

export function createTimeTd(item) {
  const td = document.createElement('td');
  td.className = 'cell-time';
  td.textContent = item.time;
  const rowKey = `${item.id}_row`;

  if (state.isMultiEditMode && (isCellSelected(rowKey) || isCellSelected(`${item.id}_time`))) {
    td.classList.add('cell-selected');
  }

  td.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.isMultiEditMode) toggleRowSelection(item.id, rowKey);
    else openModal(item);
  });
  return td;
}

export function attachSmartCellClick(td, mItem, aItem, field) {
  td.addEventListener('click', (e) => {
    e.stopPropagation();
    if (td.rowSpan === 2 && aItem) {
      const rect = td.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const isTopHalf = (clickY < (rect.height / 2));
      
      const targetItem = isTopHalf ? mItem : aItem;
      const targetKey = isTopHalf ? `${mItem.id}_${field}` : `${aItem.id}_${field}`;
      
      if (state.isMultiEditMode) {
        toggleCellKey(targetKey);
      } else {
        openModal(targetItem);
      }
    } else {
      const cellKey = `${mItem.id}_${field}`;
      if (state.isMultiEditMode) {
        toggleCellKey(cellKey);
      } else {
        openModal(mItem);
      }
    }
  });
}

// Helper: Get Custom Color for Region or Clinic Cell
export function applyCustomCellColor(tdElem, text, type) {
  if (!text || text === '-') return;

  // 1. Specific Word Rules Match
  if (state.colorSettings && Array.isArray(state.colorSettings.wordRules)) {
    const matchedRule = state.colorSettings.wordRules.find(r => r.word && text.includes(r.word));
    if (matchedRule) {
      tdElem.style.backgroundColor = matchedRule.color;
      tdElem.style.color = '#1E293B';
      tdElem.style.fontWeight = '700';
      return;
    }
  }

  // 2. Button Category Match
  if (type === 'region' && state.colorSettings && state.colorSettings.regionColors) {
    const rColors = state.colorSettings.regionColors;
    const bg = rColors[text] || rColors['기타'] || '#FFEDD5';
    tdElem.style.backgroundColor = bg;
    tdElem.style.color = '#1E293B';
    tdElem.style.fontWeight = '700';
  } else if (type === 'clinic' && state.colorSettings && state.colorSettings.clinicColors) {
    const cColors = state.colorSettings.clinicColors;
    const bg = cColors[text] || cColors['기타'] || '#F1F5F9';
    tdElem.style.backgroundColor = bg;
    tdElem.style.color = '#1E293B';
    tdElem.style.fontWeight = '700';
  }
}

export function createRegionTd(item, aItem = null, isMerged = false) {
  const tdRegion = document.createElement('td');
  tdRegion.textContent = item.region || '-';
  applyCustomCellColor(tdRegion, item.region, 'region');
  
  const regionKey = `${item.id}_region`;
  if (state.isMultiEditMode && (isCellSelected(regionKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_region`) || isCellSelected(`${aItem.id}_row`))))) {
    tdRegion.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdRegion, item, aItem, 'region');
  } else {
    tdRegion.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(regionKey);
      else openModal(item);
    });
  }
  return tdRegion;
}

export function createClinicTd(item, aItem = null, isMerged = false) {
  const tdClinic = document.createElement('td');
  tdClinic.textContent = item.clinic || '-';
  applyCustomCellColor(tdClinic, item.clinic, 'clinic');

  const clinicKey = `${item.id}_clinic`;
  if (state.isMultiEditMode && (isCellSelected(clinicKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_clinic`) || isCellSelected(`${aItem.id}_row`))))) {
    tdClinic.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdClinic, item, aItem, 'clinic');
  } else {
    tdClinic.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(clinicKey);
      else openModal(item);
    });
  }
  return tdClinic;
}

export function createTransTd(item, aItem = null, isMerged = false) {
  const tdTrans = document.createElement('td');
  if (item.transStatus === '결제O') {
    tdTrans.innerHTML = `<span class="badge-paid-ok">결제O</span>`;
  } else if (item.transStatus === '결제X') {
    tdTrans.innerHTML = `<span class="badge-paid-no">결제X</span>`;
  } else {
    tdTrans.textContent = '-';
  }
  const transKey = `${item.id}_trans`;
  if (state.isMultiEditMode && (isCellSelected(transKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_trans`) || isCellSelected(`${aItem.id}_row`))))) {
    tdTrans.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdTrans, item, aItem, 'trans');
  } else {
    tdTrans.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(transKey);
      else openModal(item);
    });
  }
  return tdTrans;
}

export function createHrTd(item, aItem = null, isMerged = false) {
  const tdHr = document.createElement('td');
  if (item.hrStatus === '승인O') {
    tdHr.innerHTML = `<span class="badge-paid-ok">승인O</span>`;
  } else if (item.hrStatus === '신청O') {
    tdHr.innerHTML = `<span class="badge-apply-ok">신청O</span>`;
  } else if (item.hrStatus === '신청X') {
    tdHr.innerHTML = `<span class="badge-paid-no">신청X</span>`;
  } else {
    tdHr.textContent = '-';
  }
  const hrKey = `${item.id}_hr`;
  if (state.isMultiEditMode && (isCellSelected(hrKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_hr`) || isCellSelected(`${aItem.id}_row`))))) {
    tdHr.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdHr, item, aItem, 'hr');
  } else {
    tdHr.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(hrKey);
      else openModal(item);
    });
  }
  return tdHr;
}

export function createOtTd(item, aItem = null, isMerged = false) {
  const tdOt = document.createElement('td');
  if (item.otStatus === '승인O') {
    tdOt.innerHTML = `<span class="badge-paid-ok">승인O</span>`;
  } else if (item.otStatus === '신청O') {
    tdOt.innerHTML = `<span class="badge-apply-ok">신청O</span>`;
  } else if (item.otStatus === '신청X') {
    tdOt.innerHTML = `<span class="badge-paid-no">신청X</span>`;
  } else {
    tdOt.textContent = '-';
  }
  const otKey = `${item.id}_ot`;
  if (state.isMultiEditMode && (isCellSelected(otKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_ot`) || isCellSelected(`${aItem.id}_row`))))) {
    tdOt.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdOt, item, aItem, 'ot');
  } else {
    tdOt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(otKey);
      else openModal(item);
    });
  }
  return tdOt;
}

// Render Monthly View Calendar & Color Legend
export function renderMonthlyCalendar() {
  const monthLegendBar = document.getElementById('monthColorLegendBar');
  const monthlyDaysGrid = document.getElementById('monthlyDaysGrid');
  const weekTitleElem = document.getElementById('weekTitle');

  if (!monthlyDaysGrid) return;

  // 1. Update Title in Navigator for Monthly View
  const now = new Date();
  const curY = state.currentMonthYear.year || now.getFullYear();
  const curM = state.currentMonthYear.month || (now.getMonth() + 1);
  if (weekTitleElem && state.currentView === 'monthly') {
    weekTitleElem.innerHTML = `${curY}년 ${curM}월 <span class="dropdown-arrow">▾</span>`;
  }

  // 2. Render Region Color Legend Bar
  if (monthLegendBar) {
    monthLegendBar.innerHTML = '';
    const rColors = (state.colorSettings && state.colorSettings.regionColors) ? state.colorSettings.regionColors : {
      '서울': '#E0E7FF',
      '진주': '#FEF3C7',
      '대구': '#DBEAFE',
      '이동': '#D1FAE5',
      '기타': '#FFEDD5'
    };

    Object.keys(rColors).forEach(regionKey => {
      const colorHex = rColors[regionKey];
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="color-dot" style="background-color: ${colorHex}"></span><span>${regionKey}</span>`;
      monthLegendBar.appendChild(item);
    });
  }

  // 3. Calculate Calendar Days
  monthlyDaysGrid.innerHTML = '';

  // Get first day of month (0=Sun, 1=Mon, ...) & total days
  const firstDay = new Date(curY, curM - 1, 1).getDay();
  const totalDays = new Date(curY, curM, 0).getDate();
  const prevMonthTotalDays = new Date(curY, curM - 1, 0).getDate();

  // Helper to get region color dot
  const getRegionColor = (regionName) => {
    if (!regionName) return '#CBD5E1';
    const rColors = (state.colorSettings && state.colorSettings.regionColors) ? state.colorSettings.regionColors : {};
    return rColors[regionName] || rColors['기타'] || '#FFEDD5';
  };

  // Helper to find items for a specific day
  const findItemsForDay = (m, d) => {
    let morning = null;
    let afternoon = null;
    let foundWeekIndex = -1;

    for (let wIdx = 0; wIdx < state.allWeeksData.length; wIdx++) {
      const wObj = state.allWeeksData[wIdx];
      if (wObj.items && Array.isArray(wObj.items)) {
        for (const item of wObj.items) {
          if (!item.date) continue;
          const parts = item.date.match(/(\d+)/g);
          if (parts && parts.length >= 2) {
            const itemM = parseInt(parts[parts.length - 2], 10);
            const itemD = parseInt(parts[parts.length - 1], 10);
            if (itemM === m && itemD === d) {
              foundWeekIndex = wIdx;
              if (item.time === '오전') morning = item;
              else if (item.time === '오후') afternoon = item;
            }
          }
        }
      }
      if (morning || afternoon) break;
    }
    return { morning, afternoon, weekIndex: foundWeekIndex };
  };

  // Today Date Check
  const today = new Date();
  const isCurrentYearMonth = (today.getFullYear() === curY && (today.getMonth() + 1) === curM);

  const prevM = (curM === 1) ? 12 : (curM - 1);
  const nextM = (curM === 12) ? 1 : (curM + 1);

  const createCellNode = (targetM, targetD, isOtherMonth) => {
    const cell = document.createElement('div');
    cell.className = 'monthly-date-cell';
    if (isOtherMonth) cell.classList.add('other-month');

    const dayOfWeek = new Date(curY, targetM - 1, targetD).getDay();
    const isSunday = (dayOfWeek === 0);
    const isToday = !isOtherMonth && isCurrentYearMonth && (today.getDate() === targetD);

    if (isToday) cell.classList.add('today-cell');

    const dayData = findItemsForDay(targetM, targetD);
    const mItem = dayData.morning;
    const aItem = dayData.afternoon;

    // 일정이 있는 날짜는 고정 공휴일/주말 기준 빨간 여부를 사용한다.
    const isHolidayDate = (mItem && isRedDate(mItem)) ||
      (aItem && isRedDate(aItem)) ||
      (!mItem && !aItem && isSunday);

    let dateNumClass = 'monthly-cell-date-num';
    if (isHolidayDate) dateNumClass += ' red-date';

    let mSlotHtml = '';
    if (mItem) {
      const dotBg = getRegionColor(mItem.region);
      const clinicText = mItem.clinic || '-';
      mSlotHtml = `<div class="monthly-cell-slot m-slot"><span class="color-dot" style="background-color: ${dotBg}"></span><span class="slot-clinic">${clinicText}</span></div>`;
    } else {
      mSlotHtml = `<div class="monthly-cell-slot m-slot"><span class="color-dot" style="background-color: #E2E8F0"></span><span class="slot-clinic">-</span></div>`;
    }

    let aSlotHtml = '';
    if (aItem) {
      const dotBg = getRegionColor(aItem.region);
      const clinicText = aItem.clinic || '-';
      aSlotHtml = `<div class="monthly-cell-slot a-slot"><span class="color-dot" style="background-color: ${dotBg}"></span><span class="slot-clinic">${clinicText}</span></div>`;
    } else {
      aSlotHtml = `<div class="monthly-cell-slot a-slot"><span class="color-dot" style="background-color: #E2E8F0"></span><span class="slot-clinic">-</span></div>`;
    }

    cell.innerHTML = `
      <div class="${dateNumClass}">${targetD}</div>
      ${mSlotHtml}
      ${aSlotHtml}
    `;

    const mSlotElem = cell.querySelector('.m-slot');
    const aSlotElem = cell.querySelector('.a-slot');

    if (mSlotElem) {
      mSlotElem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dayData.weekIndex !== -1 && mItem) {
          state.currentWeekIndex = dayData.weekIndex;
          openModal(mItem);
        }
      });
    }

    if (aSlotElem) {
      aSlotElem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dayData.weekIndex !== -1 && aItem) {
          state.currentWeekIndex = dayData.weekIndex;
          openModal(aItem);
        }
      });
    }

    cell.addEventListener('click', (e) => {
      if (dayData.weekIndex !== -1) {
        state.currentWeekIndex = dayData.weekIndex;

        const rect = cell.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const isTopHalf = (clickY < (rect.height / 2));

        if (isTopHalf) {
          if (mItem) openModal(mItem);
          else if (aItem) openModal(aItem);
        } else {
          if (aItem) openModal(aItem);
          else if (mItem) openModal(mItem);
        }
      }
    });

    return cell;
  };

  // Padding cells for Previous Month
  for (let i = firstDay - 1; i >= 0; i--) {
    const prevD = prevMonthTotalDays - i;
    const cellNode = createCellNode(prevM, prevD, true);
    monthlyDaysGrid.appendChild(cellNode);
  }

  // Days of Current Month
  for (let d = 1; d <= totalDays; d++) {
    const cellNode = createCellNode(curM, d, false);
    monthlyDaysGrid.appendChild(cellNode);
  }

  // Padding cells for Next Month
  const totalRendered = firstDay + totalDays;
  const nextMonthPadding = (7 - (totalRendered % 7)) % 7;
  for (let d = 1; d <= nextMonthPadding; d++) {
    const cellNode = createCellNode(nextM, d, true);
    monthlyDaysGrid.appendChild(cellNode);
  }
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
