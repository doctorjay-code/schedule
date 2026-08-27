/**
 * Schedule Clipboard & Multi-Selection Paste Engine
 * Handles single-slot, full-day, and multi-day schedule copy/paste operations cleanly.
 */

export function executeScheduleCopy({ state, renderTable }) {
  if (!state.selectedCells || state.selectedCells.length === 0) {
    alert('복사할 셀 또는 날짜를 먼저 선택해주세요!');
    return;
  }

  const copiedItemLabel = document.getElementById('copiedItemLabel');
  const copyBufferBar = document.getElementById('copyBufferBar');
  const selectedCountLabel = document.getElementById('selectedCountLabel');

  const dayKeys = state.selectedCells.filter(k => k.endsWith('_day'));
  if (dayKeys.length > 0) {
    const daysData = dayKeys.map(dayKey => {
      const [mIdStr, aIdStr] = dayKey.split('_');
      const mId = parseInt(mIdStr);
      const aId = aIdStr ? parseInt(aIdStr) : null;
      const mItem = state.weekData.find(d => d.id === mId) || {};
      const aItem = aId ? state.weekData.find(d => d.id === aId) || {} : {};
      return {
        date: mItem.date,
        morning: JSON.parse(JSON.stringify(mItem)),
        afternoon: JSON.parse(JSON.stringify(aItem))
      };
    });

    if (daysData.length === 1) {
      state.copiedScheduleData = {
        type: 'FULL_DAY',
        date: daysData[0].date,
        morning: daysData[0].morning,
        afternoon: daysData[0].afternoon
      };
      if (copiedItemLabel) copiedItemLabel.textContent = `[${daysData[0].date}] 하루 일정 전체`;
    } else {
      state.copiedScheduleData = {
        type: 'MULTI_DAYS',
        daysList: daysData
      };
      if (copiedItemLabel) copiedItemLabel.textContent = `[${daysData[0].date} 외 ${daysData.length - 1}일] 선택 일정 (${daysData.length}일치)`;
    }

    if (copyBufferBar) copyBufferBar.classList.remove('hidden');
    state.selectedCells = [];
    if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
    renderTable();
    return;
  }

  // Single cell copy
  const firstKey = state.selectedCells[0];
  const parts = firstKey.split('_');
  const id = parseInt(parts[0]);
  const field = parts[1];
  const targetItem = state.weekData.find(d => d.id === id);

  if (targetItem) {
    let detailLabel = `[${targetItem.date} ${targetItem.time}]`;
    if (field === 'region') detailLabel += ` 지역 (${targetItem.region || '-'})`;
    else if (field === 'clinic') detailLabel += ` 진료 (${targetItem.clinic || '-'})`;
    else if (field === 'trans') {
      const content = [targetItem.transStatus, targetItem.transDetail].filter(Boolean).join(' ');
      detailLabel += ` 교통비 (${content || '-'})`;
    } else if (field === 'hr') {
      const content = [targetItem.hrStatus, targetItem.hrDetail].filter(Boolean).join(' ');
      detailLabel += ` 국인체 (${content || '-'})`;
    } else if (field === 'ot') {
      const content = [targetItem.otStatus, targetItem.otDetail].filter(Boolean).join(' ');
      detailLabel += ` 수당 (${content || '-'})`;
    } else {
      detailLabel += ` 일정 전체`;
    }

    state.copiedScheduleData = {
      type: 'SINGLE_SLOT',
      field: field,
      data: JSON.parse(JSON.stringify(targetItem))
    };

    if (copiedItemLabel) copiedItemLabel.textContent = `${detailLabel}`;
    if (copyBufferBar) copyBufferBar.classList.remove('hidden');

    state.selectedCells = [];
    if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
    renderTable();
  }
}

export function executeSchedulePaste({ state, renderTable, updateSummaryCounts, syncToSheets, renderMonthlyCalendar }) {
  if (!state.copiedScheduleData) {
    alert('복사된 일정이 없습니다. 복사할 항목을 먼저 선택 후 [📋 복사]를 누르세요!');
    return;
  }
  if (!state.selectedCells || state.selectedCells.length === 0) {
    alert('붙여넣을 셀이나 날짜를 선택해주세요!');
    return;
  }

  const selectedCountLabel = document.getElementById('selectedCountLabel');
  const targetDates = Array.from(new Set(state.selectedCells.map(key => {
    const id = parseInt(key.split('_')[0]);
    const item = state.weekData.find(d => d.id === id);
    return item ? item.date : null;
  }).filter(Boolean)));

  if (state.copiedScheduleData.type === 'MULTI_DAYS') {
    const srcDays = state.copiedScheduleData.daysList;
    targetDates.forEach((targetDateStr, idx) => {
      const srcDay = srcDays[idx % srcDays.length];
      state.weekData.forEach(item => {
        if (item.date === targetDateStr) {
          const src = (item.time === '오전') ? srcDay.morning : srcDay.afternoon;
          copyFields(item, src);
        }
      });
    });
  } else if (state.copiedScheduleData.type === 'FULL_DAY') {
    state.weekData.forEach(item => {
      if (targetDates.includes(item.date)) {
        const src = (item.time === '오전') ? state.copiedScheduleData.morning : state.copiedScheduleData.afternoon;
        copyFields(item, src);
      }
    });
  } else {
    const src = state.copiedScheduleData.data;
    const srcField = state.copiedScheduleData.field;

    state.selectedCells.forEach(key => {
      const parts = key.split('_');
      const id = parseInt(parts[0]);
      const targetField = parts[1];
      const item = state.weekData.find(d => d.id === id);

      if (item) {
        // _day 키는 날짜 헤더 셀이므로 스킵
        if (targetField === 'day') return;

        if (targetField === 'row' || targetField === 'time' || !srcField || srcField === 'row') {
          // 전체 행 붙여넣기: id/date/time은 타겟 유지, 내용 필드만 복사
          copyFields(item, src);
        } else if (targetField === 'region' || srcField === 'region') {
          item.region = src.region;
        } else if (targetField === 'clinic' || srcField === 'clinic') {
          item.clinic = src.clinic;
        } else if (targetField === 'trans' || srcField === 'trans') {
          item.transStatus = src.transStatus;
          item.transDetail = src.transDetail;
        } else if (targetField === 'hr' || srcField === 'hr') {
          item.hrStatus = src.hrStatus;
          item.hrDetail = src.hrDetail;
        } else if (targetField === 'ot' || srcField === 'ot') {
          item.otStatus = src.otStatus;
          item.otDetail = src.otDetail;
        } else {
          // field가 서로 달라도 전체 내용 필드 복사
          copyFields(item, src);
        }
      }
    });
  }

  syncToSheets();
  state.selectedCells = [];
  if (selectedCountLabel) selectedCountLabel.textContent = '0개 선택됨';
  renderTable();
  updateSummaryCounts();
  if (state.currentView === 'monthly') renderMonthlyCalendar();
}

// 내용 필드만 복사 - id, date, time은 절대 덮어쓰지 않음
function copyFields(target, src) {
  if (!src) return;
  target.region = src.region;
  target.clinic = src.clinic;
  target.transStatus = src.transStatus;
  target.transDetail = src.transDetail;
  target.hrStatus = src.hrStatus;
  target.hrDetail = src.hrDetail;
  target.otStatus = src.otStatus;
  target.otDetail = src.otDetail;
  // target.id / target.date / target.time 은 절대 덮어쓰지 않음
}
