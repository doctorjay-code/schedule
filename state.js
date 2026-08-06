// Google Apps Script Live Sync URL & Security Consts
export const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwWDkrKXfT-eKbJS6D5uhvfgmHchGm2WSAfuTKRCvvp-uHrV01nI8nJw6K4qGsm8kEcMQ/exec";
export const SECURITY_PASSWORD_HASH = 'f0fee696ab48d4321ec49b94c7efb48a02da6f9798c3f6afc95c626d028cb7e0'; // Password: 140817!

// Standard Preset Categories
export const standardTransCategories = ['KTX', '고속버스', '버스', '무궁화호', '신화호'];
export const standardHrCategories = ['연가', '당직OFF', '청원휴가'];
export const standardOtCategories = ['야간', '당직', '휴일'];

// Reactive Central State Object
export const state = {
  allWeeksData: [],
  currentWeekIndex: 0,
  weekData: [],
  activeItem: null,
  currentFilter: 'all',
  copiedScheduleData: null,
  isMultiEditMode: false,
  selectedCells: [],
  failedAttempts: parseInt(localStorage.getItem('security_failed_attempts') || '0'),
  lockoutUntil: parseInt(localStorage.getItem('security_lockout_until') || '0'),
  lockoutInterval: null
};

// Return week index corresponding to today's date
export function getTodayWeekIndex() {
  if (state.allWeeksData.length === 0) return 0;
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const todayStr = `${m}. ${d}.`;

  for (let i = 0; i < state.allWeeksData.length; i++) {
    if (state.allWeeksData[i].items && state.allWeeksData[i].items.some(it => it.date.includes(todayStr))) {
      return i;
    }
  }
  return 0;
}

// Load Persistent Local Storage if available
export function loadLocalStorageData() {
  const savedData = localStorage.getItem('user_schedule_data');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (Array.isArray(parsed) && parsed.length === state.allWeeksData.length) {
        parsed.forEach((w, idx) => {
          state.allWeeksData[idx].items = w.items;
        });
      }
    } catch(e) {
      console.error('Error loading saved schedule data:', e);
    }
  }
}

// Save Current State to Local Storage
export function saveLocalStorageData() {
  localStorage.setItem('user_schedule_data', JSON.stringify(state.allWeeksData));
}

// Calculate Dynamic Summary Counts Across All Schedules
export function updateSummaryCounts() {
  const unpaidCountElem = document.getElementById('unpaidCount');
  const unappliedCountElem = document.getElementById('unappliedCount');
  const unapprovedCountElem = document.getElementById('unapprovedCount');

  let unpaid = 0;
  let unapplied = 0;
  let unapproved = 0;

  state.allWeeksData.forEach(wObj => {
    if (wObj.items && Array.isArray(wObj.items)) {
      wObj.items.forEach(item => {
        if (item.transStatus === '결제X') unpaid++;
        if (item.hrStatus === '신청X' || item.otStatus === '신청X') unapplied++;
        if (item.hrStatus === '신청O' || item.otStatus === '신청O') unapproved++;
      });
    }
  });

  if (unpaidCountElem) unpaidCountElem.textContent = unpaid;
  if (unappliedCountElem) unappliedCountElem.textContent = unapplied;
  if (unapprovedCountElem) unapprovedCountElem.textContent = unapproved;
}
