/**
 * Central View Coordinator (Single Feature Interface for View Switching)
 * Manages transitions between Schedule view and Ledger view, and weekly/monthly modes.
 * Prevents feature modules (like ledger-app.js) from directly toggling each other's DOM.
 */

let currentMainTab = 'schedule'; // 'schedule' | 'ledger'
let onMainTabChangeCallback = null;

export function setMainTabChangeCallback(fn) {
  onMainTabChangeCallback = fn;
}

export function getActiveMainTab() {
  return currentMainTab;
}

export function showScheduleView(options = {}) {
  currentMainTab = 'schedule';
  const container = document.querySelector('.app-container');
  container?.classList.remove('ledger-active');

  // Main menu buttons
  document.getElementById('scheduleMenuBtn')?.classList.add('active');
  document.getElementById('ledgerMenuBtn')?.classList.remove('active');

  // Subnav & navigators
  document.getElementById('scheduleSubnav')?.classList.remove('hidden');
  document.getElementById('ledgerSubnav')?.classList.add('hidden');
  document.getElementById('ledgerCardNavigator')?.classList.add('hidden');
  document.getElementById('ledgerSyncBtn')?.classList.add('hidden');
  document.getElementById('ledgerRefreshBtn')?.classList.add('hidden');
  document.getElementById('ledgerSourceSwitch')?.classList.add('hidden');
  document.getElementById('ledgerPersonSwitch')?.classList.add('hidden');
  document.getElementById('ledgerViewWrapper')?.classList.add('hidden');

  // Show schedule elements
  document.querySelectorAll('.schedule-only').forEach(el => el.classList.remove('hidden'));

  if (typeof onMainTabChangeCallback === 'function') {
    onMainTabChangeCallback('schedule', options);
  }
  options.onShow?.();
}

export function showLedgerView(options = {}) {
  currentMainTab = 'ledger';
  const container = document.querySelector('.app-container');
  container?.classList.add('ledger-active');

  // Main menu buttons
  document.getElementById('scheduleMenuBtn')?.classList.remove('active');
  document.getElementById('ledgerMenuBtn')?.classList.add('active');

  // Hide schedule elements
  document.querySelectorAll('.schedule-only').forEach(el => el.classList.add('hidden'));
  document.getElementById('scheduleSubnav')?.classList.add('hidden');
  document.getElementById('weeklyViewWrapper')?.classList.add('hidden');
  document.getElementById('monthlyViewWrapper')?.classList.add('hidden');

  // Show ledger elements
  document.getElementById('ledgerViewWrapper')?.classList.remove('hidden');
  document.getElementById('ledgerSubnav')?.classList.remove('hidden');
  document.getElementById('ledgerRefreshBtn')?.classList.remove('hidden');
  document.getElementById('ledgerSyncBtn')?.classList.remove('hidden');
  document.getElementById('ledgerSourceSwitch')?.classList.remove('hidden');
  document.getElementById('ledgerCardNavigator')?.classList.remove('hidden');

  if (typeof onMainTabChangeCallback === 'function') {
    onMainTabChangeCallback('ledger', options);
  }
  options.onShow?.();
}

export function initViewCoordinator({ onScheduleSelect, onLedgerSelect } = {}) {
  const scheduleBtn = document.getElementById('scheduleMenuBtn');
  const ledgerBtn = document.getElementById('ledgerMenuBtn');

  scheduleBtn?.addEventListener('click', () => {
    showScheduleView();
    onScheduleSelect?.();
  });

  ledgerBtn?.addEventListener('click', () => {
    showLedgerView();
    onLedgerSelect?.();
  });
}
