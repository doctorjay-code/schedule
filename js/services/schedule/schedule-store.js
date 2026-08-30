/**
 * Schedule Store (Single Source of Truth for Schedule State)
 * Encapsulates reactive state and provides explicit getter/setter/action methods.
 */

import { fetchColorSettingsFromDB, saveColorSettingsToDB } from '../ledger/ledger-api.js';

// Standard Preset Categories
export const standardTransCategories = ['KTX', '고속버스'];
export const standardHrCategories = ['연가', '청원휴가', '위로휴가', '당직OFF'];
export const standardOtCategories = ['야간', '당직', '휴일'];

// 10 Pastel Palette Colors
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
    '대구': '#D9E1F2',
    '이동': '#D1FAE5',
    '기타': '#FFEDD5'
  },
  clinicColors: {
    'O': '#FEF3C7',
    '행정': '#E0F2FE',
    '당직': '#E0E7FF',
    '주말': '#FCE4D6',
    '휴일': '#FFEDD5',
    '연가': '#EFE5FD',
    '청원휴가': '#FCE7F3',
    '위로휴가': '#D1FAE5',
    '당직OFF': '#F3E8FF',
    '기타': '#D9E1F2'
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
    '미결제': '#FCE4D6',
    '미신청': '#FEF3C7',
    '미승인': '#D1FAE5'
  },
  ledgerWordRules: []
};

const initialDate = new Date();
export const SCHEDULE_CACHE_KEY = 'schedule_cache_v2';
export const USER_COLOR_SETTINGS_KEY = 'user_color_settings';

// Central Internal State Object
const _state = {
  allWeeksData: [],
  currentWeekIndex: 0,
  weekData: [],
  activeItem: null,
  currentFilter: 'all',
  copiedScheduleData: null,
  isMultiEditMode: false,
  selectedCells: [],
  colorSettings: JSON.parse(JSON.stringify(defaultColorSettings)),
  failedAttempts: parseInt(localStorage.getItem('security_failed_attempts') || '0', 10),
  lockoutUntil: parseInt(localStorage.getItem('security_lockout_until') || '0', 10),
  lockoutInterval: null,
  currentView: 'weekly', // 'weekly' or 'monthly'
  currentMonthYear: { year: initialDate.getFullYear(), month: initialDate.getMonth() + 1 },
  scheduleDataState: 'loading'
};

// Backward-compatibility Proxy for existing callers of 'state'
export const state = _state;

function sanitizeColorMap(savedMap, defaultMap = {}) {
  const result = { ...defaultMap };
  Object.entries(savedMap || {}).forEach(([k, v]) => {
    if (v && pastelPalette.some(p => p.toLowerCase() === String(v || '').toLowerCase())) {
      result[k] = v;
    }
  });
  return result;
}

export function normalizeColorSettings(raw = {}) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  return {
    regionColors: sanitizeColorMap(safe.regionColors, defaultColorSettings.regionColors),
    clinicColors: sanitizeColorMap(safe.clinicColors, defaultColorSettings.clinicColors),
    wordRules: Array.isArray(safe.wordRules) ? safe.wordRules : [],
    ledgerPersonColors: sanitizeColorMap(safe.ledgerPersonColors, {}),
    ledgerCategoryColors: sanitizeColorMap(safe.ledgerCategoryColors, {}),
    ledgerPaymentColors: sanitizeColorMap(safe.ledgerPaymentColors, defaultColorSettings.ledgerPaymentColors),
    scheduleAlertColors: sanitizeColorMap(safe.scheduleAlertColors, defaultColorSettings.scheduleAlertColors),
    ledgerWordRules: Array.isArray(safe.ledgerWordRules) ? safe.ledgerWordRules : []
  };
}

// Getters & Setters
export function getAllWeeksData() {
  return _state.allWeeksData;
}

export function setAllWeeksData(weeks) {
  _state.allWeeksData = Array.isArray(weeks) ? weeks : [];
}

export function getCurrentWeekIndex() {
  return _state.currentWeekIndex;
}

export function setCurrentWeekIndex(index) {
  _state.currentWeekIndex = typeof index === 'number' && index >= 0 ? index : 0;
  if (_state.allWeeksData[_state.currentWeekIndex]) {
    _state.weekData = _state.allWeeksData[_state.currentWeekIndex].items || [];
  }
}

export function getCurrentWeekData() {
  return _state.weekData;
}

export function setCurrentWeekData(items) {
  _state.weekData = Array.isArray(items) ? items : [];
  if (_state.allWeeksData[_state.currentWeekIndex]) {
    _state.allWeeksData[_state.currentWeekIndex].items = _state.weekData;
  }
}

export function getActiveItem() {
  return _state.activeItem;
}

export function setActiveItem(item) {
  _state.activeItem = item;
}

export function getCurrentFilter() {
  return _state.currentFilter;
}

export function setCurrentFilter(filter) {
  _state.currentFilter = filter || 'all';
}

export function getCopiedScheduleData() {
  return _state.copiedScheduleData;
}

export function setCopiedScheduleData(data) {
  _state.copiedScheduleData = data;
}

export function isMultiEditMode() {
  return _state.isMultiEditMode;
}

export function setMultiEditMode(enabled) {
  _state.isMultiEditMode = Boolean(enabled);
  if (!_state.isMultiEditMode) {
    _state.selectedCells = [];
  }
}

export function getSelectedCells() {
  return _state.selectedCells;
}

export function setSelectedCells(cells) {
  _state.selectedCells = Array.isArray(cells) ? cells : [];
}

export function getColorSettings() {
  return _state.colorSettings;
}

export function setColorSettings(settings) {
  _state.colorSettings = normalizeColorSettings(settings);
}

export function getCurrentView() {
  return _state.currentView;
}

export function setCurrentView(view) {
  _state.currentView = view === 'monthly' ? 'monthly' : 'weekly';
}

export function getCurrentMonthYear() {
  return { ..._state.currentMonthYear };
}

export function setCurrentMonthYear(my) {
  if (my && typeof my.year === 'number' && typeof my.month === 'number') {
    _state.currentMonthYear = { year: my.year, month: my.month };
  }
}

export function getScheduleDataState() {
  return _state.scheduleDataState;
}

export function setScheduleDataState(status) {
  _state.scheduleDataState = status;
}

// Today's Week Index Calculation
export function getTodayWeekIndex() {
  if (_state.allWeeksData.length === 0) return 0;
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  for (let i = 0; i < _state.allWeeksData.length; i++) {
    if (_state.allWeeksData[i].items) {
      for (const it of _state.allWeeksData[i].items) {
        if (!it.date) continue;
        const parts = it.date.match(/(\d+)/g);
        if (parts && parts.length >= 2) {
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

// Color Settings Local Storage & DB Sync
export function loadColorSettings() {
  const saved = localStorage.getItem(USER_COLOR_SETTINGS_KEY);
  if (saved) {
    try {
      _state.colorSettings = normalizeColorSettings(JSON.parse(saved));
    } catch (e) {
      console.error('Error loading color settings:', e);
      _state.colorSettings = normalizeColorSettings();
    }
  }
}

export async function syncColorSettingsFromDB() {
  try {
    const dbColors = await fetchColorSettingsFromDB();
    if (dbColors && typeof dbColors === 'object') {
      _state.colorSettings = normalizeColorSettings(dbColors);
      localStorage.setItem(USER_COLOR_SETTINGS_KEY, JSON.stringify(_state.colorSettings));
      return _state.colorSettings;
    }
  } catch (err) {
    console.warn('syncColorSettingsFromDB fallback:', err);
  }
  return _state.colorSettings;
}

export function saveColorSettings() {
  _state.colorSettings = normalizeColorSettings(_state.colorSettings);
  if (typeof localStorage !== 'undefined' && localStorage.setItem) {
    try {
      localStorage.setItem(USER_COLOR_SETTINGS_KEY, JSON.stringify(_state.colorSettings));
    } catch (e) {
      console.warn('localStorage saveColorSettings error:', e);
    }
  }
  const isTest = (typeof process !== 'undefined' && process.versions && Boolean(process.versions.node)) ||
                 (typeof window !== 'undefined' && Boolean(window.__IS_TEST_ENV__));
  if (!isTest) {
    saveColorSettingsToDB(_state.colorSettings).catch(e => console.warn('saveColorSettingsToDB warn:', e));
  }
}

export function resetScheduleColorSettings() {
  _state.colorSettings = normalizeColorSettings({
    ..._state.colorSettings,
    regionColors: defaultColorSettings.regionColors,
    clinicColors: defaultColorSettings.clinicColors,
    scheduleAlertColors: defaultColorSettings.scheduleAlertColors,
    wordRules: []
  });
  saveColorSettings();
}

export function resetLedgerColorSettings() {
  _state.colorSettings = normalizeColorSettings({
    ..._state.colorSettings,
    ledgerPersonColors: defaultColorSettings.ledgerPersonColors,
    ledgerCategoryColors: defaultColorSettings.ledgerCategoryColors,
    ledgerPaymentColors: defaultColorSettings.ledgerPaymentColors,
    ledgerWordRules: []
  });
  saveColorSettings();
}

export function resetColorSettings() {
  resetScheduleColorSettings();
}

// Local Storage Schedule Cache Helpers
export function loadLastScheduleSnapshot() {
  try {
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY) || localStorage.getItem('schedule_last_sheet_snapshot_v1');
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || !Array.isArray(snapshot.weeks) || snapshot.weeks.length === 0) return null;
    _state.allWeeksData = snapshot.weeks;
    _state.currentWeekIndex = getTodayWeekIndex();
    _state.scheduleDataState = 'cached';
    return snapshot.fetchedAt || null;
  } catch (error) {
    console.warn('Failed to restore schedule snapshot:', error);
    return null;
  }
}
export const loadLastScheduleSheetSnapshot = loadLastScheduleSnapshot;

export function saveLastScheduleSnapshot(fetchedAt = new Date().toISOString()) {
  const snapshot = { version: 2, fetchedAt, weeks: _state.allWeeksData };
  localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(snapshot));
}
export const saveLastScheduleSheetSnapshot = saveLastScheduleSnapshot;

export function loadLocalStorageData() {
  return loadLastScheduleSnapshot();
}

export function saveLocalStorageData() {
  saveLastScheduleSnapshot();
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

// Pure calculation of Summary Counts (No direct DOM manipulation)
export function calculateSummaryCounts() {
  let unpaid = 0;
  const unappliedKeysSet = new Set();
  const unapprovedKeysSet = new Set();

  _state.allWeeksData.forEach(wObj => {
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

  return {
    unpaid,
    unapplied: unappliedKeysSet.size,
    unapproved: unapprovedKeysSet.size
  };
}

// UI Updater for Summary Counts (Single UI Writer helper)
export function updateSummaryCounts() {
  const counts = calculateSummaryCounts();
  const unpaidCountElem = document.getElementById('unpaidCount');
  const unappliedCountElem = document.getElementById('unappliedCount');
  const unapprovedCountElem = document.getElementById('unapprovedCount');

  if (unpaidCountElem) unpaidCountElem.textContent = counts.unpaid;
  if (unappliedCountElem) unappliedCountElem.textContent = counts.unapplied;
  if (unapprovedCountElem) unapprovedCountElem.textContent = counts.unapproved;
}
