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

  if (weekTitleElem) weekTitleElem.textContent = currentWeekObj.title?.split(' (')[0] || '';
  state.weekData = currentWeekObj.items || [];

  state.selectedCells = [];
  if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';

  renderTable();
  updateSummaryCounts();
}

// 2026.08 ~ 2027.04 Statutory Holidays & Substitute Holidays
export const fixedHolidays = [
  '8. 15.', '8. 17.',
  '9. 24.', '9. 25.', '9. 26.', '9. 28.',
  '10. 3.', '10. 5.', '10. 9.',
  '12. 25.',
  '1. 1.',
  '2. 6.', '2. 7.', '2. 8.', '2. 9.',
  '3. 1.'
];

// Helper: Check if date is weekend or holiday
export function isRedDate(item) {
  if (!item || !item.date) return false;
  return item.isHoliday || 
         item.date.includes('토') || 
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
    const matchedRule = state.colorSettings.wordRules.find(r => text.includes(r.word));
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
