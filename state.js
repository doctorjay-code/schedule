// Google Apps Script Live Sync URL & Security Consts
export const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwWDkrKXfT-eKbJS6D5uhvfgmHchGm2WSAfuTKRCvvp-uHrV01nI8nJw6K4qGsm8kEcMQ/exec";
export const SECURITY_PASSWORD_HASH = 'f0fee696ab48d4321ec49b94c7efb48a02da6f9798c3f6afc95c626d028cb7e0'; // Password: 140817!

// Standard Preset Categories
export const standardTransCategories = ['KTX', '고속버스', '버스', '무궁화호', '신화호'];
export const standardHrCategories = ['연가', '당직OFF', '청원휴가'];
export const standardOtCategories = ['야간', '당직', '휴일'];

// 10 Pastel Palette Colors (color.png)
export const pastelPalette = [
  '#FCE4D6', // 1. Peach
  '#FCE7F3', // 2. Pink
  '#FFEDD5', // 3. Orange
  '#FEF3C7', // 4. Yellow
  '#D1FAE5', // 5. Mint/Green
  '#E0F2FE', // 6. Sky Blue
  '#E0E7FF', // 7. Indigo/Purple
  '#D9E1F2', // 8. Light Blue
  '#EFE5FD', // 9. Lavender
  '#F3E8FF'  // 10. Violet
];

export const defaultColorSettings = {
  regionColors: {
    '진주': '#FEF3C7',
    '서울': '#E0E7FF',
    '이동': '#D1FAE5',
    '기타': '#FFEDD5'
  },
  clinicColors: {
    'O': '#FEF3C7',
    '행정': '#E0F2FE',
    '휴가': '#FCE7F3',
    '기타': '#F1F5F9'
  },
  wordRules: []
};

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
  colorSettings: JSON.parse(JSON.stringify(defaultColorSettings)),
  failedAttempts: parseInt(localStorage.getItem('security_failed_attempts') || '0'),
  lockoutUntil: parseInt(localStorage.getItem('security_lockout_until') || '0'),
  lockoutInterval: null
};

// Load Color Settings from Local Storage
export function loadColorSettings() {
  const saved = localStorage.getItem('user_color_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.colorSettings = {
        regionColors: { ...defaultColorSettings.regionColors, ...(parsed.regionColors || {}) },
        clinicColors: { ...defaultColorSettings.clinicColors, ...(parsed.clinicColors || {}) },
        wordRules: Array.isArray(parsed.wordRules) ? parsed.wordRules : []
      };
    } catch (e) {
      console.error('Error loading color settings:', e);
      state.colorSettings = JSON.parse(JSON.stringify(defaultColorSettings));
    }
  }
}

// Save Color Settings to Local Storage
export function saveColorSettings() {
  localStorage.setItem('user_color_settings', JSON.stringify(state.colorSettings));
}

// Reset Color Settings to Default
export function resetColorSettings() {
  state.colorSettings = JSON.parse(JSON.stringify(defaultColorSettings));
  saveColorSettings();
}

// Return week index corresponding to today's date
export function getTodayWeekIndex() {
  if (state.allWeeksData.length === 0) return 0;
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  for (let i = 0; i < state.allWeeksData.length; i++) {
    if (state.allWeeksData[i].items) {
      for (const it of state.allWeeksData[i].items) {
        if (!it.date) continue;
        const match = it.date.match(/(\d+)\.\s*(\d+)\./);
        if (match) {
          const m = parseInt(match[1], 10);
          const d = parseInt(match[2], 10);
          if (m === todayM && d === todayD) {
            return i;
          }
        }
      }
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.allWeeksData = parsed;
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
