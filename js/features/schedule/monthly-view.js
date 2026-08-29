import { escapeHtml, safeCssColor } from '../../shared/safe.js';
import { state as defaultState } from '../../services/schedule/schedule-store.js';
import { openModal } from './modals/edit.js';

function defaultIsRedDate(item) {
  if (!item) return false;
  if (item.isHoliday) return true;
  const clinic = String(item.clinic || '').trim();
  return ['주말', '휴일', '연가', '청원휴가', '위로휴가', '당직OFF'].includes(clinic);
}

function extractYearFromTitle(title, fallbackYear = new Date().getFullYear()) {
  const m = (title || '').match(/\d{4}/);
  return m ? parseInt(m[0], 10) : fallbackYear;
}

// Monthly calendar rendering responsibility.
export function renderMonthlyCalendarView({ state: passedState, isRedDate = defaultIsRedDate } = {}) {
  const state = passedState || defaultState;
  const monthLegendBar = document.getElementById('monthColorLegendBar');
  const monthlyDaysGrid = document.getElementById('monthlyDaysGrid');
  const weekTitleElem = document.getElementById('weekTitle');
  if (!monthlyDaysGrid || !state) return;

  const now = new Date();
  const curY = state.currentMonthYear?.year || now.getFullYear();
  const curM = state.currentMonthYear?.month || (now.getMonth() + 1);
  if (weekTitleElem && state.currentView === 'monthly') {
    weekTitleElem.innerHTML = curY + '.' + String(curM).padStart(2, '0') + ' <span class="dropdown-arrow">' + String.fromCharCode(9662) + '</span>';
  }

  if (monthLegendBar) {
    monthLegendBar.innerHTML = '';
    const rColors = state.colorSettings?.regionColors || {
      '서울': '#E0E7FF',
      '진주': '#FEF3C7',
      '대구': '#DBEAFE',
      '이동': '#D1FAE5',
      '기타': '#FFEDD5'
    };
    Object.keys(rColors).forEach(regionKey => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="color-dot" style="background-color: ${safeCssColor(rColors[regionKey])}"></span><span>${escapeHtml(regionKey)}</span>`;
      monthLegendBar.appendChild(item);
    });
  }

  monthlyDaysGrid.innerHTML = '';
  const firstDay = new Date(curY, curM - 1, 1).getDay();
  const totalDays = new Date(curY, curM, 0).getDate();
  const prevMonthTotalDays = new Date(curY, curM - 1, 0).getDate();
  const getRegionColor = regionName => {
    if (!regionName) return '#CBD5E1';
    const rColors = state.colorSettings?.regionColors || {};
    return rColors[regionName] || rColors['기타'] || '#FFEDD5';
  };

  const findItemsForDay = (targetYear, month, day) => {
    let morning = null;
    let afternoon = null;
    let foundWeekIndex = -1;
    const allWeeks = state.allWeeksData || [];

    for (let weekIndex = 0; weekIndex < allWeeks.length; weekIndex++) {
      const week = allWeeks[weekIndex];
      const weekYear = extractYearFromTitle(week.title, curY);
      if (weekYear !== targetYear) continue;

      if (week.items && Array.isArray(week.items)) {
        for (const item of week.items) {
          if (!item.date) continue;
          const parts = item.date.match(/(\d+)/g);
          if (parts && parts.length >= 2) {
            const itemMonth = parseInt(parts[parts.length - 2], 10);
            const itemDay = parseInt(parts[parts.length - 1], 10);
            if (itemMonth === month && itemDay === day) {
              foundWeekIndex = weekIndex;
              if (item.time === '오전' && !morning) morning = item;
              else if (item.time === '오후' && !afternoon) afternoon = item;
            }
          }
        }
      }
      if (morning && afternoon) break;
    }
    return { morning, afternoon, weekIndex: foundWeekIndex };
  };

  const today = new Date();
  const isCurrentYearMonth = today.getFullYear() === curY && (today.getMonth() + 1) === curM;
  const prevY = curM === 1 ? curY - 1 : curY;
  const prevM = curM === 1 ? 12 : curM - 1;
  const nextY = curM === 12 ? curY + 1 : curY;
  const nextM = curM === 12 ? 1 : curM + 1;

  const createCellNode = (targetYear, targetMonth, targetDay, isOtherMonth) => {
    const cell = document.createElement('div');
    cell.className = 'monthly-date-cell';
    if (isOtherMonth) cell.classList.add('other-month');
    const dayOfWeek = new Date(targetYear, targetMonth - 1, targetDay).getDay();
    const isSunday = dayOfWeek === 0;
    const isToday = !isOtherMonth && isCurrentYearMonth && today.getDate() === targetDay;
    if (isToday) cell.classList.add('today-cell');
    
    const dayData = findItemsForDay(targetYear, targetMonth, targetDay);
    const morningItem = dayData.morning;
    const afternoonItem = dayData.afternoon;
    const isHoliday = (morningItem && isRedDate(morningItem)) || (afternoonItem && isRedDate(afternoonItem)) || (!morningItem && !afternoonItem && isSunday);
    let dateNumClass = 'monthly-cell-date-num';
    if (isHoliday) dateNumClass += ' red-date';

    const slotHtml = (item, className) => {
      if (!item) return `<div class="monthly-cell-slot ${className}"><span class="color-dot" style="background-color: #E2E8F0"></span><span class="slot-clinic">-</span></div>`;
      const color = safeCssColor(getRegionColor(item.region));
      const clinicText = escapeHtml(item.clinic || '-');
      return `<div class="monthly-cell-slot ${className}"><span class="color-dot" style="background-color: ${color}"></span><span class="slot-clinic">${clinicText}</span></div>`;
    };

    cell.innerHTML = `<div class="${dateNumClass}">${targetDay}</div>${slotHtml(morningItem, 'm-slot')}${slotHtml(afternoonItem, 'a-slot')}`;
    
    const openItem = item => {
      if (dayData.weekIndex !== -1 && item) {
        state.currentWeekIndex = dayData.weekIndex;
        openModal(item);
      }
    };
    cell.querySelector('.m-slot')?.addEventListener('click', event => { event.stopPropagation(); openItem(morningItem); });
    cell.querySelector('.a-slot')?.addEventListener('click', event => { event.stopPropagation(); openItem(afternoonItem); });
    cell.addEventListener('click', event => {
      if (dayData.weekIndex === -1) return;
      state.currentWeekIndex = dayData.weekIndex;
      const rect = cell.getBoundingClientRect();
      const isTopHalf = (event.clientY - rect.top) < rect.height / 2;
      openItem(isTopHalf ? (morningItem || afternoonItem) : (afternoonItem || morningItem));
    });
    return cell;
  };

  for (let index = firstDay - 1; index >= 0; index--) monthlyDaysGrid.appendChild(createCellNode(prevY, prevM, prevMonthTotalDays - index, true));
  for (let day = 1; day <= totalDays; day++) monthlyDaysGrid.appendChild(createCellNode(curY, curM, day, false));
  const totalRendered = firstDay + totalDays;
  const nextMonthPadding = (7 - (totalRendered % 7)) % 7;
  for (let day = 1; day <= nextMonthPadding; day++) monthlyDaysGrid.appendChild(createCellNode(nextY, nextM, day, true));
}

export { renderMonthlyCalendarView as renderMonthlyCalendar };
