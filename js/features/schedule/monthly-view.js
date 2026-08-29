import { escapeHtml, safeCssColor } from '../../shared/safe.js';
import { openModal } from './modals/edit.js';

// Monthly calendar rendering responsibility.
export function renderMonthlyCalendarView({ state, isRedDate }) {
  const monthLegendBar = document.getElementById('monthColorLegendBar');
  const monthlyDaysGrid = document.getElementById('monthlyDaysGrid');
  const weekTitleElem = document.getElementById('weekTitle');
  if (!monthlyDaysGrid) return;

  const now = new Date();
  const curY = state.currentMonthYear.year || now.getFullYear();
  const curM = state.currentMonthYear.month || (now.getMonth() + 1);
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
  const findItemsForDay = (month, day) => {
    let morning = null;
    let afternoon = null;
    let foundWeekIndex = -1;
    for (let weekIndex = 0; weekIndex < state.allWeeksData.length; weekIndex++) {
      const week = state.allWeeksData[weekIndex];
      if (week.items && Array.isArray(week.items)) {
        for (const item of week.items) {
          if (!item.date) continue;
          const parts = item.date.match(/(\d+)/g);
          if (parts && parts.length >= 2) {
            const itemMonth = parseInt(parts[parts.length - 2], 10);
            const itemDay = parseInt(parts[parts.length - 1], 10);
            if (itemMonth === month && itemDay === day) {
              foundWeekIndex = weekIndex;
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

  const today = new Date();
  const isCurrentYearMonth = today.getFullYear() === curY && (today.getMonth() + 1) === curM;
  const prevM = curM === 1 ? 12 : curM - 1;
  const nextM = curM === 12 ? 1 : curM + 1;
  const createCellNode = (targetMonth, targetDay, isOtherMonth) => {
    const cell = document.createElement('div');
    cell.className = 'monthly-date-cell';
    if (isOtherMonth) cell.classList.add('other-month');
    const dayOfWeek = new Date(curY, targetMonth - 1, targetDay).getDay();
    const isSunday = dayOfWeek === 0;
    const isToday = !isOtherMonth && isCurrentYearMonth && today.getDate() === targetDay;
    if (isToday) cell.classList.add('today-cell');
    const dayData = findItemsForDay(targetMonth, targetDay);
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

  for (let index = firstDay - 1; index >= 0; index--) monthlyDaysGrid.appendChild(createCellNode(prevM, prevMonthTotalDays - index, true));
  for (let day = 1; day <= totalDays; day++) monthlyDaysGrid.appendChild(createCellNode(curM, day, false));
  const totalRendered = firstDay + totalDays;
  const nextMonthPadding = (7 - (totalRendered % 7)) % 7;
  for (let day = 1; day <= nextMonthPadding; day++) monthlyDaysGrid.appendChild(createCellNode(nextM, day, true));
}

export { renderMonthlyCalendarView as renderMonthlyCalendar };
