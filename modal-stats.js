import { state } from './state.js';
import { openCustomFilteredSummaryModal } from './modal-summary.js';

// ----------------------------------------------------
// Statistics Report Modal Functionalities
// ----------------------------------------------------
let statsCurrentRange = 'all'; // 'all', 'monthly', 'weekly', 'custom'
let statsSelectedSubPeriod = ''; // selected week or month title
let statsCustomStartDate = '';
let statsCustomEndDate = '';

export function openStatsModal() {
  const overlay = document.getElementById('statsModalOverlay');
  if (!overlay) return;

  setupStatsFilterTabs();
  renderStatsReport();
  overlay.classList.add('active');
}

export function closeStatsModal() {
  const overlay = document.getElementById('statsModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

export function setupStatsModalEvents() {
  const openBtn = document.getElementById('openStatsModalBtn');
  const closeBtn = document.getElementById('closeStatsModalBtn');
  const overlay = document.getElementById('statsModalOverlay');
  const applyCustomBtn = document.getElementById('applyStatsCustomRangeBtn');
  const subSelectElem = document.getElementById('statsSubSelectElem');

  if (openBtn) openBtn.addEventListener('click', openStatsModal);
  if (closeBtn) closeBtn.addEventListener('click', closeStatsModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeStatsModal();
    });
  }

  if (subSelectElem) {
    subSelectElem.addEventListener('change', () => {
      statsSelectedSubPeriod = subSelectElem.value;
      renderStatsReport();
    });
  }

  if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', () => {
      const startInput = document.getElementById('statsStartDateInput');
      const endInput = document.getElementById('statsEndDateInput');
      statsCustomStartDate = startInput ? startInput.value : '';
      statsCustomEndDate = endInput ? endInput.value : '';
      renderStatsReport();
    });
  }
}

function setupStatsFilterTabs() {
  const tabs = document.querySelectorAll('.stats-filter-tab');
  const subWrapper = document.getElementById('statsSubSelectWrapper');
  const subSelect = document.getElementById('statsSubSelectElem');
  const customWrapper = document.getElementById('statsCustomRangeWrapper');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      statsCurrentRange = tab.dataset.range;

      if (statsCurrentRange === 'all') {
        if (subWrapper) subWrapper.classList.add('hidden');
        if (customWrapper) customWrapper.classList.add('hidden');
      } else if (statsCurrentRange === 'monthly') {
        if (customWrapper) customWrapper.classList.add('hidden');
        if (subWrapper && subSelect) {
          subWrapper.classList.remove('hidden');
          const monthsMap = new Map();
          const defaultY = state.currentMonthYear.year || new Date().getFullYear();

          state.allWeeksData.forEach(w => {
            if (w.items && w.items[0] && w.items[0].date) {
              const parts = w.items[0].date.match(/(\d+)/g);
              if (parts && parts.length >= 2) {
                const m = parseInt(parts[parts.length - 2], 10);
                const y = (parts.length >= 3) ? parseInt(parts[parts.length - 3], 10) : defaultY;
                const key = `${y}-${m}`;
                const label = `${y}년 ${m}월`;
                monthsMap.set(key, label);
              }
            }
          });

          subSelect.innerHTML = Array.from(monthsMap.entries()).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

          // Auto-select active/current month dynamically
          const curY = state.currentMonthYear.year || new Date().getFullYear();
          const curM = state.currentMonthYear.month || (new Date().getMonth() + 1);
          const currentKey = `${curY}-${curM}`;

          if (monthsMap.has(currentKey)) {
            subSelect.value = currentKey;
          }
          statsSelectedSubPeriod = subSelect.value;
        }
      } else if (statsCurrentRange === 'weekly') {
        if (customWrapper) customWrapper.classList.add('hidden');
        if (subWrapper && subSelect) {
          subWrapper.classList.remove('hidden');
          subSelect.innerHTML = state.allWeeksData.map((w, idx) => {
            const title = w.title.split(' (')[0];
            return `<option value="${idx}">${title}</option>`;
          }).join('');

          // Auto-select active week index dynamically
          if (state.currentWeekIndex !== undefined && state.currentWeekIndex >= 0 && state.currentWeekIndex < state.allWeeksData.length) {
            subSelect.value = state.currentWeekIndex.toString();
          }
          statsSelectedSubPeriod = subSelect.value;
        }
      } else if (statsCurrentRange === 'custom') {
        if (subWrapper) subWrapper.classList.add('hidden');
        if (customWrapper) customWrapper.classList.remove('hidden');
      }
      renderStatsReport();
    });
  });
}

function parseHoursFromDetail(detailStr) {
  if (!detailStr) return 0;
  const m = detailStr.match(/(\d+(\.\d+)?)\s*시간/);
  if (m) return parseFloat(m[1]);
  const d = detailStr.match(/(\d+)\s*일/);
  if (d) return parseFloat(d[1]) * 8;
  return 0;
}

function formatOtHoursString(totalHours) {
  if (!totalHours || totalHours <= 0) return '0시간';
  const rounded = Math.round(totalHours * 10) / 10;
  return `${rounded}시간`;
}

function formatHoursToDaysString(totalHours) {
  if (!totalHours || totalHours <= 0) return '0시간';
  const days = Math.floor(totalHours / 8);
  const hours = Math.round((totalHours % 8) * 10) / 10;

  if (days > 0 && hours > 0) {
    return `${days}일 ${hours}시간`;
  } else if (days > 0 && hours === 0) {
    return `${days}일`;
  } else {
    return `${hours}시간`;
  }
}

// Calculate Required Clinic Sessions for a Weekly Period
function calculateRequiredClinicSessions(weekEntries) {
  let availableSessions = 0;

  const weekdayEntries = weekEntries.filter(e => {
    const dStr = e.item ? (e.item.date || '') : '';
    return !dStr.includes('(토)') && !dStr.includes('(일)');
  });

  weekdayEntries.forEach(e => {
    const item = e.item || {};
    const hrStr = item.hrDetail || '';
    const otStr = item.otDetail || '';
    const combined = `${item.clinic || ''} ${hrStr} ${otStr}`;

    const isPetitionLeave = combined.includes('청원휴가');
    // 시간 단위 연가 (예: "연가 1시간", "연가 2시간" 등)는 세션을 차감하지 않음
    const isHourlyLeave = combined.includes('연가') && /\d+\s*시간/.test(combined);

    // 휴일 조건: '휴무', '공휴일', '휴가', 또는 시간 단위가 아닌 전일/일반 '연가'
    let isHoliday = combined.includes('휴무') || combined.includes('공휴일') || combined.includes('휴가');
    if (combined.includes('연가') && !isHourlyLeave) {
      isHoliday = true;
    }

    if ((!isHoliday || isPetitionLeave) || isHourlyLeave) {
      availableSessions++;
    }
  });

  if (availableSessions >= 9) return 6;
  if (availableSessions === 8) return 5;
  if (availableSessions >= 6) return 4;
  if (availableSessions >= 4) return 3;
  if (availableSessions >= 2) return 2;
  return availableSessions;
}

export function renderStatsReport() {
  const regionContainer = document.getElementById('statsRegionContent');
  const clinicHrContainer = document.getElementById('statsClinicHrContent');
  const transportContainer = document.getElementById('statsTransportContent');

  if (!regionContainer || !clinicHrContainer || !transportContainer) return;

  const filteredItems = [];
  const allItemsFlat = [];

  state.allWeeksData.forEach((wObj, wIdx) => {
    if (wObj.items && Array.isArray(wObj.items)) {
      wObj.items.forEach((item, itemIdx) => {
        allItemsFlat.push({ item, wObj, wIdx, itemIdx });
      });
    }
  });

  allItemsFlat.forEach(entry => {
    const { item, wIdx } = entry;

    if (statsCurrentRange === 'all') {
      filteredItems.push(entry);
    } else if (statsCurrentRange === 'weekly') {
      if (wIdx === parseInt(statsSelectedSubPeriod, 10)) {
        filteredItems.push(entry);
      }
    } else if (statsCurrentRange === 'monthly') {
      const partsKey = (statsSelectedSubPeriod || '').split('-');
      const targetY = parseInt(partsKey[0], 10);
      const targetM = parseInt(partsKey[1], 10);
      const defaultY = state.currentMonthYear.year || new Date().getFullYear();

      if (item.date) {
        const parts = item.date.match(/(\d+)/g);
        if (parts && parts.length >= 2) {
          const itemM = parseInt(parts[parts.length - 2], 10);
          const itemY = (parts.length >= 3) ? parseInt(parts[parts.length - 3], 10) : defaultY;
          if (itemM === targetM && (isNaN(targetY) || itemY === targetY)) {
            filteredItems.push(entry);
          }
        }
      }
    } else if (statsCurrentRange === 'custom') {
      if (statsCustomStartDate && statsCustomEndDate && item.date) {
        const parts = item.date.match(/(\d+)/g);
        if (parts && parts.length >= 2) {
          const m = parseInt(parts[parts.length - 2], 10);
          const d = parseInt(parts[parts.length - 1], 10);
          const curY = state.currentMonthYear.year || new Date().getFullYear();
          const itemDateObj = new Date(curY, m - 1, d);
          const startDateObj = new Date(statsCustomStartDate);
          const endDateObj = new Date(statsCustomEndDate);
          if (itemDateObj >= startDateObj && itemDateObj <= endDateObj) {
            filteredItems.push(entry);
          }
        }
      } else {
        filteredItems.push(entry);
      }
    }
  });

  // ----------------------------------------------------
  // SECTION 1: Region Ratio Calculation
  // ----------------------------------------------------
  const regionCounts = { '진주': 0, '서울': 0 };
  const etcDetailsMap = {};
  let totalSlotValue = 0;

  filteredItems.forEach(entry => {
    const { item } = entry;
    const reg = item.region || '';

    if (reg === '이동') {
      const flatIdx = allItemsFlat.findIndex(e => e.item.id === item.id && e.item.date === item.date && e.item.time === item.time);
      const prevEntry = (flatIdx > 0) ? allItemsFlat[flatIdx - 1] : null;
      const nextEntry = (flatIdx < allItemsFlat.length - 1) ? allItemsFlat[flatIdx + 1] : null;

      const prevReg = (prevEntry && prevEntry.item.region && prevEntry.item.region !== '이동') ? prevEntry.item.region : '진주';
      const nextReg = (nextEntry && nextEntry.item.region && nextEntry.item.region !== '이동') ? nextEntry.item.region : '서울';

      [prevReg, nextReg].forEach(r => {
        if (r === '진주' || r === '서울') {
          regionCounts[r] = (regionCounts[r] || 0) + 0.5;
        } else {
          etcDetailsMap[r] = (etcDetailsMap[r] || 0) + 0.5;
        }
      });
      totalSlotValue += 1;
    } else if (reg === '진주' || reg === '서울') {
      regionCounts[reg] = (regionCounts[reg] || 0) + 1;
      totalSlotValue += 1;
    } else if (reg) {
      etcDetailsMap[reg] = (etcDetailsMap[reg] || 0) + 1;
      totalSlotValue += 1;
    }
  });

  regionContainer.innerHTML = '';
  if (totalSlotValue === 0) {
    regionContainer.innerHTML = `<div class="stats-sub-item">해당 기간의 체류 데이터가 없습니다.</div>`;
  } else {
    Object.keys(regionCounts).forEach(rKey => {
      const count = regionCounts[rKey];
      const pct = ((count / totalSlotValue) * 100).toFixed(1);
      const daysVal = (count / 2).toFixed(1);
      const row = document.createElement('div');
      row.className = 'stats-stat-row clickable';
      row.innerHTML = `<span class="stats-stat-label">• ${rKey}</span><span class="stats-stat-val">${pct}% (${daysVal}일)</span>`;
      
      row.addEventListener('click', () => {
        const matches = filteredItems.filter(e => e.item.region === rKey || (e.item.region === '이동'));
        openCustomFilteredSummaryModal(`📍 ${rKey} 체류 일정 모아보기`, matches, 'region', rKey);
      });

      regionContainer.appendChild(row);
    });

    const etcKeys = Object.keys(etcDetailsMap);
    if (etcKeys.length > 0) {
      etcKeys.forEach(etcKey => {
        const count = etcDetailsMap[etcKey];
        const pct = ((count / totalSlotValue) * 100).toFixed(1);
        const daysVal = (count / 2).toFixed(1);
        const row = document.createElement('div');
        row.className = 'stats-stat-row clickable';
        row.innerHTML = `<span class="stats-stat-label">• ${etcKey}</span><span class="stats-stat-val">${pct}% (${daysVal}일)</span>`;

        row.addEventListener('click', () => {
          const matches = filteredItems.filter(e => e.item.region === etcKey);
          openCustomFilteredSummaryModal(`📍 ${etcKey} 체류 일정 모아보기`, matches, 'region', etcKey);
        });

        regionContainer.appendChild(row);
      });
    }
  }

  // ----------------------------------------------------
  // SECTION 2: Clinic & HR Status Calculation
  // ----------------------------------------------------
  let clinicOCount = 0;
  let clinicAdminCount = 0;

  let filteredAnnualHours = 0;
  let filteredPetitionHours = 0;
  let filteredWiroHours = 0;
  let dutyOffCount = 0;

  let globalAnnualHours = 0;
  let globalPetitionHours = 0;

  // Helper to check if a leave item is approved (excludes '신청X', '신청O', '미신청', '미승인')
  function isApprovedLeaveItem(item, leaveType) {
    if (!item) return false;
    const hrStr = item.hrDetail || '';
    const otStr = item.otDetail || '';
    const combined = `${item.clinic || ''} ${hrStr} ${otStr}`;

    if (leaveType === '당직') {
      const tokens = combined.split(/[\s,+/]+/);
      if (!tokens.includes('당직')) return false;
    } else {
      if (!combined.includes(leaveType)) return false;
    }

    if (hrStr.includes(leaveType)) {
      const st = (item.hrStatus || '').trim();
      if (st === '신청X' || st === '신청O' || st === '미신청' || st === '미승인') {
        return false;
      }
    }
    if (otStr.includes(leaveType)) {
      const st = (item.otStatus || '').trim();
      if (st === '신청X' || st === '신청O' || st === '미신청' || st === '미승인') {
        return false;
      }
    }
    return true;
  }

  // 같은 날짜에 오전·오후 모두 "연가 1일"로 기록된 경우는 하루(8시간) 한 번만 차감한다.
  // 시간 단위 연가는 세션별 실제 시간을 합산한다.
  function calculateAnnualLeaveHours(entries) {
    const dailyHours = new Map();

    entries.forEach(entry => {
      const item = entry.item || entry;
      if (!isApprovedLeaveItem(item, '연가') || !item.date) return;

      const weekTitle = entry.wObj?.title || item.weekTitleName || '';
      const key = `${weekTitle}_${item.date}`;
      const combined = `${item.clinic || ''} ${item.hrDetail || ''} ${item.otDetail || ''}`;
      const hours = parseHoursFromDetail(combined) || 4;
      const isDayUnitLeave = /\d+(\.\d+)?\s*일/.test(combined);
      const totals = dailyHours.get(key) || { dayUnit: 0, hourly: 0 };

      if (isDayUnitLeave) totals.dayUnit = Math.max(totals.dayUnit, hours);
      else totals.hourly += hours;

      dailyHours.set(key, totals);
    });

    return Array.from(dailyHours.values())
      .reduce((sum, totals) => sum + Math.max(totals.dayUnit, totals.hourly), 0);
  }

  // Calculate Global Petition & Annual Leave Hours (Approved Only)
  const globalPetitionDatesMap = new Map();
  globalAnnualHours = calculateAnnualLeaveHours(allItemsFlat);
  allItemsFlat.forEach(entry => {
    const { item } = entry;

    if (isApprovedLeaveItem(item, '청원휴가') && item.date) {
      const key = `${entry.wObj.title}_${item.date}`;
      globalPetitionDatesMap.set(key, (globalPetitionDatesMap.get(key) || 0) + 1);
    }
  });

  globalPetitionDatesMap.forEach(slotCount => {
    globalPetitionHours += (slotCount >= 2) ? 8 : 4;
  });

  // Filtered Leave & Clinic Hours for Selected Period (Approved Only)
  const filteredPetitionDatesMap = new Map();
  const filteredWiroDatesMap = new Map();
  filteredAnnualHours = calculateAnnualLeaveHours(filteredItems);
  
  // 🩺 진료 현황 분류 구조 (1.진료, 2.행정, 3.휴가, 4.휴일, 5.주말, 6.당직, 7.기타)
  const vacationKeys = ['휴가', '당직OFF', '청원휴가', '연가', '위로휴가'];
  const clinicGroup = {
    '진료': { count: 0, rawKeys: ['O', '진료'] },
    '행정': { count: 0, rawKeys: ['행정'] },
    '휴가': { count: 0, rawKeys: [...vacationKeys], subMap: {} },
    '휴일': { count: 0, rawKeys: ['휴일'] },
    '주말': { count: 0, rawKeys: ['주말'] },
    '당직': { count: 0, rawKeys: ['당직'] },
    '기타': { count: 0, subMap: {} }
  };

  filteredItems.forEach(entry => {
    const { item } = entry;

    const rawVal = (item.clinic || '').trim();
    if (rawVal) {
      if (rawVal === 'O' || rawVal === '진료') {
        clinicGroup['진료'].count++;
      } else if (rawVal === '행정') {
        clinicGroup['행정'].count++;
      } else if (vacationKeys.includes(rawVal) || rawVal.includes('휴가') || rawVal.includes('OFF') || rawVal.includes('연가')) {
        clinicGroup['휴가'].count++;
        if (!clinicGroup['휴가'].rawKeys.includes(rawVal)) clinicGroup['휴가'].rawKeys.push(rawVal);
        if (!clinicGroup['휴가'].subMap[rawVal]) {
          clinicGroup['휴가'].subMap[rawVal] = { rawVal, count: 0 };
        }
        clinicGroup['휴가'].subMap[rawVal].count++;
      } else if (rawVal === '휴일') {
        clinicGroup['휴일'].count++;
      } else if (rawVal === '주말') {
        clinicGroup['주말'].count++;
      } else if (rawVal === '당직') {
        clinicGroup['당직'].count++;
      } else {
        clinicGroup['기타'].count++;
        if (!clinicGroup['기타'].subMap[rawVal]) {
          clinicGroup['기타'].subMap[rawVal] = { rawVal, count: 0 };
        }
        clinicGroup['기타'].subMap[rawVal].count++;
      }
    }

    if (isApprovedLeaveItem(item, '청원휴가') && item.date) {
      const key = `${entry.wObj.title}_${item.date}`;
      filteredPetitionDatesMap.set(key, (filteredPetitionDatesMap.get(key) || 0) + 1);
    }
    if (isApprovedLeaveItem(item, '당직OFF')) {
      dutyOffCount++;
    }

    if (isApprovedLeaveItem(item, '위로휴가') && item.date) {
      const key = `${entry.wObj.title}_${item.date}`;
      filteredWiroDatesMap.set(key, (filteredWiroDatesMap.get(key) || 0) + 1);
    }
  });

  filteredPetitionDatesMap.forEach(slotCount => {
    filteredPetitionHours += (slotCount >= 2) ? 8 : 4;
  });

  filteredWiroDatesMap.forEach(slotCount => {
    filteredWiroHours += (slotCount >= 2) ? 8 : 4;
  });

  // SECTION 2-C: Allowance Calculation (Approved Only)
  const otMap = {};
  let totalOtCount = 0;
  let totalOtHours = 0;

  filteredItems.forEach(entry => {
    const { item } = entry;
    const otStr = (item.otDetail || '').trim();
    const st = (item.otStatus || '').trim();

    if (otStr && st !== '신청X' && st !== '신청O' && st !== '미신청' && st !== '미승인') {
      const categories = ['야간', '당직', '휴일', '시간외'];
      let matched = categories.find(c => otStr.includes(c));
      if (!matched) matched = otStr.split(' ')[0] || '기타수당';

      const hours = parseHoursFromDetail(otStr) || 1;
      if (!otMap[matched]) {
        otMap[matched] = { count: 0, hours: 0 };
      }
      otMap[matched].count += 1;
      otMap[matched].hours += hours;

      totalOtCount += 1;
      totalOtHours += hours;
    }
  });

  const curY = state.currentMonthYear.year || new Date().getFullYear();
  const totalGrantedAnnualHours = (curY === 2027) ? 168 : 112;
  const remainingAnnualHours = Math.max(0, totalGrantedAnnualHours - globalAnnualHours);

  const totalGrantedPetitionHours = 240;
  const remainingPetitionHours = Math.max(0, totalGrantedPetitionHours - globalPetitionHours);

  const dutyOffDays = (dutyOffCount / 2);

  let otHtml = `<div style="font-size:12px; font-weight:700; color:#2F5597; margin-top:10px; margin-bottom:4px;">[ 💰 수당 현황 ]</div>`;
  const otKeys = Object.keys(otMap);
  if (otKeys.length === 0) {
    otHtml += `<div class="stats-sub-item">해당 기간의 승인된 수당 데이터가 없습니다.</div>`;
  } else {
    otKeys.forEach(tKey => {
      const { count, hours } = otMap[tKey];
      otHtml += `<div class="stats-stat-row clickable" id="statsRowOt_${tKey}"><span class="stats-stat-label">• ${tKey}</span><span class="stats-stat-val">(${count}회) ${formatOtHoursString(hours)}</span></div>`;
    });
    otHtml += `<div class="stats-stat-row clickable" id="statsRowOt_TOTAL" style="border-top: 1px dashed #CBD5E1; margin-top:4px; padding-top:4px;"><span class="stats-stat-label" style="font-weight:700; color:#1E3A8A;">• 전체</span><span class="stats-stat-val" style="color:#1E3A8A;">(${totalOtCount}회) ${formatOtHoursString(totalOtHours)}</span></div>`;
  }

  // 슬롯(세션) 수를 일수로 변환하는 헬퍼 (예: 1슬롯 -> 0.5일, 2슬롯 -> 1일)
  function formatSlotsToDaysString(slotCount) {
    if (!slotCount || slotCount <= 0) return '0일';
    const days = slotCount / 2;
    return Number.isInteger(days) ? `${days}일` : `${days.toFixed(1)}일`;
  }

  let reqBadgeHtml = '';
  if (statsCurrentRange === 'weekly') {
    const reqCount = calculateRequiredClinicSessions(filteredItems);
    reqBadgeHtml = `<span class="stats-highlight-badge">(필수 ${reqCount} 세션)</span> `;
  }

  // 휴가 서브 항목 HTML (연가 → 청원휴가 → 위로휴가 → 당직OFF 순으로 정렬)
  const vacationOrder = ['연가', '청원휴가', '위로휴가', '당직OFF'];
  const vacationSubKeys = Object.keys(clinicGroup['휴가'].subMap).sort((a, b) => {
    const ia = vacationOrder.indexOf(a);
    const ib = vacationOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  let vacationSubRowsHtml = '';
  if (vacationSubKeys.length > 0) {
    vacationSubKeys.forEach(vKey => {
      const { count } = clinicGroup['휴가'].subMap[vKey];
      const safeId = `statsSubRowVacation_${encodeURIComponent(vKey)}`;
      vacationSubRowsHtml += `<div class="stats-stat-row clickable" id="${safeId}"><span class="stats-stat-label" style="color:#475569;">└ • ${vKey}</span><span class="stats-stat-val" style="color:#475569;">${formatSlotsToDaysString(count)}</span></div>`;
    });
  }

  // 기타 서브 항목 HTML
  const etcSubKeys = Object.keys(clinicGroup['기타'].subMap);
  let etcSubRowsHtml = '';
  if (etcSubKeys.length > 0) {
    etcSubKeys.forEach(sKey => {
      const { count } = clinicGroup['기타'].subMap[sKey];
      const safeId = `statsSubRowClinic_${encodeURIComponent(sKey)}`;
      etcSubRowsHtml += `<div class="stats-stat-row clickable" id="${safeId}"><span class="stats-stat-label" style="color:#475569;">└ • ${sKey}</span><span class="stats-stat-val" style="color:#475569;">${count}회</span></div>`;
    });
  }

  // 7가지 진료 현황 HTML 생성 (0회 항목 숨김)
  let clinicHtml = `<div style="font-size:12px; font-weight:700; color:#2F5597; margin-bottom:4px;">[ 🩺 진료 현황 ]</div>`;
  let clinicRowAdded = false;

  // 1. 진료
  if (clinicGroup['진료'].count > 0 || statsCurrentRange === 'weekly') {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_진료"><span class="stats-stat-label">• 진료</span><span class="stats-stat-val">${reqBadgeHtml}${clinicGroup['진료'].count}회</span></div>`;
    clinicRowAdded = true;
  }
  // 2. 행정
  if (clinicGroup['행정'].count > 0) {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_행정"><span class="stats-stat-label">• 행정</span><span class="stats-stat-val">${clinicGroup['행정'].count}회</span></div>`;
    clinicRowAdded = true;
  }
  // 3. 휴가 (당직OFF, 청원휴가, 연가, 위로휴가 포함 서브 드롭다운)
  if (clinicGroup['휴가'].count > 0) {
    const vacLabel = vacationSubKeys.length > 0 ? `• 휴가 <span style="font-size:10px; color:#64748B;">▾</span>` : `• 휴가`;
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_휴가"><span class="stats-stat-label">${vacLabel}</span><span class="stats-stat-val">${formatSlotsToDaysString(clinicGroup['휴가'].count)}</span></div>`;
    if (vacationSubRowsHtml) {
      clinicHtml += `<div id="statsClinicVacationSubContainer" class="hidden" style="padding-left:10px; background:#F8FAFC; border-radius:6px; margin-top:2px; margin-bottom:6px;">${vacationSubRowsHtml}</div>`;
    }
    clinicRowAdded = true;
  }
  // 4. 휴일/주말 (합산)
  const totalHolidayWeekendCount = clinicGroup['휴일'].count + clinicGroup['주말'].count;
  if (totalHolidayWeekendCount > 0) {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_휴일주말"><span class="stats-stat-label">• 휴일/주말</span><span class="stats-stat-val">${formatSlotsToDaysString(totalHolidayWeekendCount)}</span></div>`;
    clinicRowAdded = true;
  }
  // 5. 당직
  if (clinicGroup['당직'].count > 0) {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_당직"><span class="stats-stat-label">• 당직</span><span class="stats-stat-val">${formatSlotsToDaysString(clinicGroup['당직'].count)}</span></div>`;
    clinicRowAdded = true;
  }
  // 7. 기타
  if (clinicGroup['기타'].count > 0) {
    const etcLabel = etcSubKeys.length > 0 ? `• 기타 <span style="font-size:10px; color:#64748B;">▾</span>` : `• 기타`;
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_기타"><span class="stats-stat-label">${etcLabel}</span><span class="stats-stat-val">${clinicGroup['기타'].count}회</span></div>`;
    if (etcSubRowsHtml) {
      clinicHtml += `<div id="statsClinicEtcSubContainer" class="hidden" style="padding-left:10px; background:#F8FAFC; border-radius:6px; margin-top:2px; margin-bottom:6px;">${etcSubRowsHtml}</div>`;
    }
    clinicRowAdded = true;
  }

  if (!clinicRowAdded) {
    clinicHtml += `<div class="stats-sub-item">해당 기간의 진료 데이터가 없습니다.</div>`;
  }

  clinicHrContainer.innerHTML = `
    ${clinicHtml}
    
    <div style="font-size:12px; font-weight:700; color:#2F5597; margin-top:10px; margin-bottom:4px;">[ 📋 국인체 휴가 현황 ]</div>
    <div class="stats-stat-row clickable" id="statsRowAnnualLeave">
      <span class="stats-stat-label">• 연가</span>
      <span class="stats-stat-val"><span class="stats-highlight-badge">(잔여 연가: ${formatHoursToDaysString(remainingAnnualHours)})</span> ${formatHoursToDaysString(filteredAnnualHours)}</span>
    </div>
    <div class="stats-stat-row clickable" id="statsRowPetitionLeave">
      <span class="stats-stat-label">• 청원휴가</span>
      <span class="stats-stat-val"><span class="stats-highlight-badge">(잔여 청원휴가: ${formatHoursToDaysString(remainingPetitionHours)})</span> ${formatHoursToDaysString(filteredPetitionHours)}</span>
    </div>
    <div class="stats-stat-row clickable" id="statsRowWiroLeave">
      <span class="stats-stat-label">• 위로휴가</span>
      <span class="stats-stat-val">${formatHoursToDaysString(filteredWiroHours)}</span>
    </div>
    <div class="stats-stat-row clickable" id="statsRowDutyOff">
      <span class="stats-stat-label">• 당직OFF</span>
      <span class="stats-stat-val">${dutyOffDays}일</span>
    </div>

    ${otHtml}
  `;

  // 이벤트 바인딩
  const getClinicMatches = (keys) => filteredItems.filter(e => {
    const raw = ((e.item ? e.item.clinic : '') || '').trim();
    return keys.some(k => {
      if (k === '진료') return raw === 'O' || raw === '진료';
      if (k === '휴가') return vacationKeys.includes(raw) || raw.includes('휴가') || raw.includes('OFF') || raw.includes('연가');
      return raw === k;
    });
  });

  if (clinicGroup['진료'].count > 0 || statsCurrentRange === 'weekly') {
    document.getElementById('statsRowClinic_진료')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 진료 일정 모아보기', getClinicMatches(['O', '진료']), 'clinic');
    });
  }
  if (clinicGroup['행정'].count > 0) {
    document.getElementById('statsRowClinic_행정')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 행정 일정 모아보기', getClinicMatches(['행정']), 'clinic');
    });
  }
  if (clinicGroup['휴가'].count > 0) {
    document.getElementById('statsRowClinic_휴가')?.addEventListener('click', () => {
      const subContainer = document.getElementById('statsClinicVacationSubContainer');
      if (subContainer) {
        subContainer.classList.toggle('hidden');
      } else {
        openCustomFilteredSummaryModal('🩺 휴가 일정 모아보기', getClinicMatches(clinicGroup['휴가'].rawKeys), 'vacation');
      }
    });
  }

  if (vacationSubKeys.length > 0) {
    vacationSubKeys.forEach(vKey => {
      const safeId = `statsSubRowVacation_${encodeURIComponent(vKey)}`;
      document.getElementById(safeId)?.addEventListener('click', () => {
        openCustomFilteredSummaryModal(`🩺 ${vKey} 일정 모아보기`, getClinicMatches([vKey]), 'vacation');
      });
    });
  }

  if (totalHolidayWeekendCount > 0) {
    document.getElementById('statsRowClinic_휴일주말')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 휴일/주말 일정 모아보기', getClinicMatches(['휴일', '주말']), 'clinic');
    });
  }
  if (clinicGroup['당직'].count > 0) {
    document.getElementById('statsRowClinic_당직')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 당직 일정 모아보기', getClinicMatches(['당직']), 'clinic');
    });
  }
  if (clinicGroup['기타'].count > 0) {
    document.getElementById('statsRowClinic_기타')?.addEventListener('click', () => {
      const subContainer = document.getElementById('statsClinicEtcSubContainer');
      if (subContainer) {
        subContainer.classList.toggle('hidden');
      }
    });
  }

  if (etcSubKeys.length > 0) {
    etcSubKeys.forEach(sKey => {
      const safeId = `statsSubRowClinic_${encodeURIComponent(sKey)}`;
      document.getElementById(safeId)?.addEventListener('click', () => {
        openCustomFilteredSummaryModal(`🩺 ${sKey} 일정 모아보기`, getClinicMatches([sKey]), 'clinic');
      });
    });
  }

  document.getElementById('statsRowAnnualLeave')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 연가 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '연가')), 'annualLeave');
  });
  document.getElementById('statsRowPetitionLeave')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 청원휴가 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '청원휴가')), 'petitionLeave');
  });
  document.getElementById('statsRowDutyOff')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 당직OFF 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '당직OFF')), 'dutyOff');
  });
  document.getElementById('statsRowWiroLeave')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 위로휴가 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '위로휴가')), 'wiroLeave');
  });

  if (otKeys.length > 0) {
    otKeys.forEach(tKey => {
      document.getElementById(`statsRowOt_${tKey}`)?.addEventListener('click', () => {
        const matches = filteredItems.filter(e => {
          const otStr = (e.item.otDetail || '').trim();
          const st = (e.item.otStatus || '').trim();
          return otStr.includes(tKey) && st !== '신청X' && st !== '신청O' && st !== '미신청' && st !== '미승인';
        });
        openCustomFilteredSummaryModal(`💰 ${tKey} 수당 일정 모아보기`, matches, 'allowance');
      });
    });

    document.getElementById(`statsRowOt_TOTAL`)?.addEventListener('click', () => {
      const matches = filteredItems.filter(e => {
        const otStr = (e.item.otDetail || '').trim();
        const st = (e.item.otStatus || '').trim();
        return otStr && st !== '신청X' && st !== '신청O' && st !== '미신청' && st !== '미승인';
      });
      openCustomFilteredSummaryModal(`💰 전체 수당 일정 모아보기`, matches, 'allowance');
    });
  }

  // ----------------------------------------------------
  // SECTION 3: Transport Usage Calculation
  // ----------------------------------------------------
  const transportMap = {};

  filteredItems.forEach(entry => {
    const { item } = entry;
    const detail = item.transDetail || '';
    if (detail) {
      const categories = ['KTX', '고속버스', '버스', '무궁화호', '신화호'];
      let matched = categories.find(c => detail.includes(c));
      if (!matched) matched = detail.split(' ')[0] || '기타';

      transportMap[matched] = (transportMap[matched] || 0) + 1;
    }
  });

  transportContainer.innerHTML = '';
  const transKeys = Object.keys(transportMap);
  if (transKeys.length === 0) {
    transportContainer.innerHTML = `<div class="stats-sub-item">해당 기간의 교통 이용 데이터가 없습니다.</div>`;
  } else {
    transKeys.forEach(tKey => {
      const count = transportMap[tKey];
      const row = document.createElement('div');
      row.className = 'stats-stat-row clickable';
      row.innerHTML = `<span class="stats-stat-label">• ${tKey}</span><span class="stats-stat-val">${count}건</span>`;

      row.addEventListener('click', () => {
        const matches = filteredItems.filter(e => (e.item.transDetail || '').includes(tKey));
        openCustomFilteredSummaryModal(`🚆 ${tKey} 이용 일정 모아보기`, matches, 'transport');
      });

      transportContainer.appendChild(row);
    });
  }
}
