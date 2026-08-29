// Schedule view, period navigation, and feature-launch event responsibility.
export function bindScheduleNavigation({
  state,
  enterLedger,
  leaveLedger,
  openStats,
  openColor,
  switchViewMode,
  renderMonthly,
  openMonthPicker,
  openWeekPicker,
  loadWeek,
  getTodayWeekIndex,
  syncFromSheets
}) {
  document.getElementById('ledgerMenuBtn')?.addEventListener('click', enterLedger);
  document.getElementById('openStatsModalBtn')?.addEventListener('click', openStats);
  document.getElementById('openColorSettingsBtn')?.addEventListener('click', openColor);

  document.getElementById('weeklyViewBtn')?.addEventListener('click', () => {
    leaveLedger();
    switchViewMode('weekly');
  });
  document.getElementById('monthlyViewBtn')?.addEventListener('click', () => {
    leaveLedger();
    switchViewMode('monthly');
  });

  const weekTitleBtn = document.getElementById('weekTitle');
  if (weekTitleBtn) {
    const openSchedulePeriodPicker = event => {
      event?.preventDefault();
      if (state.currentView === 'monthly') {
        openMonthPicker({
          selectedYear: state.currentMonthYear.year,
          selectedMonth: state.currentMonthYear.month,
          onSelect: (year, month) => {
            state.currentMonthYear.year = year;
            state.currentMonthYear.month = month;
            renderMonthly();
          }
        });
        return;
      }
      openWeekPicker();
    };
    document.getElementById('weekTitle')?.addEventListener('click', openSchedulePeriodPicker);
    document.getElementById('weekTitle')?.addEventListener('pointerup', openSchedulePeriodPicker);
    document.getElementById('weekTitle')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') openSchedulePeriodPicker(event);
    });
  }

  document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
    if (state.currentView === 'monthly') {
      if (state.currentMonthYear.month > 1) state.currentMonthYear.month--;
      else {
        state.currentMonthYear.year--;
        state.currentMonthYear.month = 12;
      }
      renderMonthly();
      return;
    }
    if (state.currentWeekIndex > 0) loadWeek(state.currentWeekIndex - 1);
  });

  document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
    if (state.currentView === 'monthly') {
      if (state.currentMonthYear.month < 12) state.currentMonthYear.month++;
      else {
        state.currentMonthYear.year++;
        state.currentMonthYear.month = 1;
      }
      renderMonthly();
      return;
    }
    if (state.currentWeekIndex < state.allWeeksData.length - 1) loadWeek(state.currentWeekIndex + 1);
  });

  document.getElementById('todayBtn')?.addEventListener('click', () => {
    if (state.currentView === 'monthly') {
      const today = new Date();
      state.currentMonthYear.year = today.getFullYear();
      state.currentMonthYear.month = today.getMonth() + 1;
      renderMonthly();
      return;
    }
    loadWeek(getTodayWeekIndex());
  });

  const manualSyncBtn = document.getElementById('manualSyncBtn');
  manualSyncBtn?.addEventListener('click', async () => {
    manualSyncBtn.classList.add('spinning');
    manualSyncBtn.disabled = true;
    try {
      await syncFromSheets();
    } finally {
      setTimeout(() => {
        manualSyncBtn.classList.remove('spinning');
        manualSyncBtn.disabled = false;
      }, 500);
    }
  });
}