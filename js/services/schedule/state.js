// Supabase PostgreSQL Realtime Backend
// Standard Preset Categories
export const standardTransCategories = ['KTX', '고속버스'];
export const standardHrCategories = ['연가', '청원휴가', '위로휴가', '당직OFF'];
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
    '서울': '#E0E7FF',
    '진주': '#FEF3C7',
    '대구': '#DBEAFE',
    '이동': '#D1FAE5',
    '기타': '#FFEDD5'
  },
  clinicColors: {
    'O': '#FEF3C7',
    '행정': '#E0F2FE',
    '당직': '#E0E7FF',
    '주말': '#FEE2E2',
    '휴일': '#FFEDD5',
    '연가': '#EDE9FE',
    '청원휴가': '#FCE7F3',
    '위로휴가': '#D1FAE5',
    '당직OFF': '#F3E8FF',
    '기타': '#F1F5F9'
  },
  wordRules: [],
  ledgerPersonColors: {},
  ledgerCategoryColors: {},
  ledgerPaymentColors: {
    '현금': '#D1FAE5',
    '기업카드': '#FFEDD5',
    '토스은행': '#E0F2FE',
    '기업은행': '#E0E7FF',
    '잔액전망': '#FEF3C7'
  },
  scheduleAlertColors: {
    '미결제': '#FEF2F2',
    '미신청': '#FFFBEB',
    '미승인': '#F0FDF4'
  },
  ledgerWordRules: []
};

const initialDate = new Date();
export const SCHEDULE_SHEET_SNAPSHOT_KEY = 'schedule_last_sheet_snapshot_v1';

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
  lockoutInterval: null,
  currentView: 'weekly', // 'weekly' or 'monthly'
  currentMonthYear: { year: initialDate.getFullYear(), month: initialDate.getMonth() + 1 },
  scheduleDataState: 'loading'
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
        wordRules: Array.isArray(parsed.wordRules) ? parsed.wordRules : [],
        ledgerPersonColors: { ...defaultColorSettings.ledgerPersonColors, ...(parsed.ledgerPersonColors || {}) },
        ledgerCategoryColors: { ...defaultColorSettings.ledgerCategoryColors, ...(parsed.ledgerCategoryColors || {}) },
        ledgerPaymentColors: { ...defaultColorSettings.ledgerPaymentColors, ...(parsed.ledgerPaymentColors || {}) },
        scheduleAlertColors: { ...defaultColorSettings.scheduleAlertColors, ...(parsed.scheduleAlertColors || {}) },
        ledgerWordRules: Array.isArray(parsed.ledgerWordRules) ? parsed.ledgerWordRules : []
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

// Reset ONLY Schedule Color Settings (preserves ledger colors!)
export function resetScheduleColorSettings() {
  state.colorSettings.regionColors = { ...defaultColorSettings.regionColors };
  state.colorSettings.clinicColors = { ...defaultColorSettings.clinicColors };
  state.colorSettings.scheduleAlertColors = { ...defaultColorSettings.scheduleAlertColors };
  state.colorSettings.wordRules = [];
  saveColorSettings();
}

// Reset Color Settings to Default
export function resetColorSettings() {
  resetScheduleColorSettings();
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
        // 날짜 형식: "8. 7.(금)" 또는 "2026. 8. 7.(금)" 모두 처리
        const parts = it.date.match(/(\d+)/g);
        if (parts && parts.length >= 2) {
          // 마지막 두 숫자 그룹 = 월, 일 (연도가 있으면 앞에 붙음)
          const m = parseInt(parts[parts.length - 2], 10);
          const d = parseInt(parts[parts.length - 1], 10);
          if (m === todayM && d === todayD) {
            return i;
          }
        }
      }
    }
  }
  return 0;
}

// 마지막으로 Google Sheets에서 정상 수신한 일정만 초기 표시용으로 복원한다.
export function loadLastScheduleSheetSnapshot() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(SCHEDULE_SHEET_SNAPSHOT_KEY) || 'null');
    if (!snapshot || !Array.isArray(snapshot.weeks) || snapshot.weeks.length === 0) return null;
    state.allWeeksData = snapshot.weeks;
    state.currentWeekIndex = getTodayWeekIndex();
    state.scheduleDataState = 'cached';
    return snapshot.fetchedAt || null;
  } catch (error) {
    console.warn('마지막 일정 동기화본을 복원하지 못했습니다:', error);
    return null;
  }
}

export function saveLastScheduleSheetSnapshot(fetchedAt = new Date().toISOString()) {
  const snapshot = { version: 1, fetchedAt, weeks: state.allWeeksData };
  localStorage.setItem(SCHEDULE_SHEET_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

// 기존 기기 전용 저장값은 호환을 위해 유지하되, 초기 표시 원본으로는 사용하지 않는다.
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

// Helper to get normalized reason for summary grouping
export function getItemReason(item, type) {
  if (!item) return '';
  const hr = (item.hrDetail || '').trim();
  const ot = (item.otDetail || '').trim();
  if (hr) return hr;
  if (ot) return ot;
  if (type === 'unapplied') return (item.hrStatus || item.otStatus || '미신청').trim();
  if (type === 'unapproved') return (item.hrStatus || item.otStatus || '미승인').trim();
  return '';
}

// Calculate Dynamic Summary Counts Across All Schedules
export function updateSummaryCounts() {
  const unpaidCountElem = document.getElementById('unpaidCount');
  const unappliedCountElem = document.getElementById('unappliedCount');
  const unapprovedCountElem = document.getElementById('unapprovedCount');

  let unpaid = 0;
  const unappliedKeysSet = new Set();
  const unapprovedKeysSet = new Set();

  state.allWeeksData.forEach(wObj => {
    if (wObj.items && Array.isArray(wObj.items)) {
      wObj.items.forEach(item => {
        if (item.transStatus === '결제X') unpaid++;

        const isUnapplied = (item.hrStatus === '신청X' || item.otStatus === '신청X' || item.hrStatus === '미신청' || item.otStatus === '미신청');
        if (isUnapplied && item.date) {
          const reason = getItemReason(item, 'unapplied');
          unappliedKeysSet.add(`${wObj.title}_${item.date}_${reason}`);
        }

        const isUnapproved = (item.hrStatus === '신청O' || item.otStatus === '신청O' || item.hrStatus === '미승인' || item.otStatus === '미승인');
        if (isUnapproved && item.date) {
          const reason = getItemReason(item, 'unapproved');
          unapprovedKeysSet.add(`${wObj.title}_${item.date}_${reason}`);
        }
      });
    }
  });

  if (unpaidCountElem) unpaidCountElem.textContent = unpaid;
  if (unappliedCountElem) unappliedCountElem.textContent = unappliedKeysSet.size;
  if (unapprovedCountElem) unapprovedCountElem.textContent = unapprovedKeysSet.size;
}

