import { state } from '../../../services/schedule/schedule-store.js';
import { openModal } from './edit.js';

export function openWeekSelectModal() {
  const weekSelectModalOverlay = document.getElementById('weekSelectModalOverlay');
  const monthGridPicker = document.getElementById('monthGridPicker');
  const weekListPicker = document.getElementById('weekListPicker');
  const weekPickerHeaderYear = document.getElementById('weekPickerHeaderYear');

  if (!weekSelectModalOverlay) return;

  const currentYear = state.currentMonthYear.year || new Date().getFullYear();
  if (weekPickerHeaderYear) weekPickerHeaderYear.textContent = `${currentYear}년`;

  if (monthGridPicker) {
    monthGridPicker.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const btn = document.createElement('button');
      btn.className = 'month-picker-btn';
      btn.textContent = `${m}월`;
      if (m === state.currentMonthYear.month) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.currentMonthYear.month = m;
        // switch to monthly view for selected month
        const monthlyViewBtn = document.getElementById('monthlyViewBtn');
        if (monthlyViewBtn) monthlyViewBtn.click();
        closeWeekSelectModal();
      });
      monthGridPicker.appendChild(btn);
    }
  }

  if (weekListPicker) {
    weekListPicker.innerHTML = '';
    state.allWeeksData.forEach((wObj, idx) => {
      const btn = document.createElement('button');
      btn.className = 'week-picker-item';
      btn.textContent = wObj.title;
      if (idx === state.currentWeekIndex) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.currentWeekIndex = idx;
        const weeklyViewBtn = document.getElementById('weeklyViewBtn');
        if (weeklyViewBtn) weeklyViewBtn.click();
        closeWeekSelectModal();
      });
      weekListPicker.appendChild(btn);
    });
  }

  weekSelectModalOverlay.classList.add('active');
}

export function closeWeekSelectModal() {
  const weekSelectModalOverlay = document.getElementById('weekSelectModalOverlay');
  if (weekSelectModalOverlay) weekSelectModalOverlay.classList.remove('active');
}
