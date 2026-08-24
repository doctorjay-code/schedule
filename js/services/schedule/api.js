import { state, getTodayWeekIndex, saveLocalStorageData, saveLastScheduleSheetSnapshot, saveColorSettings, defaultColorSettings, updateSummaryCounts } from './state.js';
import { setSyncStatus } from '../../shared/sync-ui.js';
import { supabaseRest } from '../ledger/supabase-client.js';

let apiLoadWeekDataFn = null;
let saveTimer = null;
let saveInProgress = false;
let saveQueued = false;

export function setApiLoadWeekDataCallback(fn) {
  apiLoadWeekDataFn = fn;
}

export function syncScheduleToSupabase() {
  saveLocalStorageData();
  saveQueued = true;
  setSyncStatus('saving');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushScheduledSave, 300);
}
export const syncToGoogleSheets = syncScheduleToSupabase;

async function flushScheduledSave() {
  if (saveInProgress || !saveQueued) return;
  saveQueued = false;
  saveInProgress = true;
  try {
    await postAllSchedules();
    if (!saveQueued) setSyncStatus('saved', '최신 일정 반영');
  } catch (e) {
    console.error('Supabase 일정 저장 오류:', e);
    setSyncStatus('error');
  } finally {
    saveInProgress = false;
    if (saveQueued) flushScheduledSave();
  }
}

/**
 * Supabase DB에서 초고속 (0.05초) 일정 및 색상 설정 동기화
 */
export async function syncScheduleFromSupabase() {
  let fetched = false;
  setSyncStatus('loading');
  try {
    const [scheduleRows, colorSettingRows] = await Promise.all([
      supabaseRest('schedules?select=*&order=order_index.asc'),
      supabaseRest('schedule_settings?key=eq.color_settings')
    ]);

    if (Array.isArray(scheduleRows) && scheduleRows.length > 0) {
      parseSupabaseScheduleRecords(scheduleRows);
      saveLastScheduleSheetSnapshot();
      state.scheduleDataState = 'fresh';
      updateSummaryCounts();
      fetched = true;
    }

    if (Array.isArray(colorSettingRows) && colorSettingRows.length > 0) {
      const parsed = colorSettingRows[0].value;
      if (parsed && typeof parsed === 'object') {
        state.colorSettings = {
          regionColors: { ...defaultColorSettings.regionColors, ...(parsed.regionColors || {}) },
          clinicColors: { ...defaultColorSettings.clinicColors, ...(parsed.clinicColors || {}) },
          wordRules: Array.isArray(parsed.wordRules) ? parsed.wordRules : [],
          ledgerPersonColors: { ...defaultColorSettings.ledgerPersonColors, ...(parsed.ledgerPersonColors || {}) },
          ledgerCategoryColors: { ...defaultColorSettings.ledgerCategoryColors, ...(parsed.ledgerCategoryColors || {}) },
          ledgerPaymentColors: { ...defaultColorSettings.ledgerPaymentColors, ...(parsed.ledgerPaymentColors || {}) },
          ledgerWordRules: Array.isArray(parsed.ledgerWordRules) ? parsed.ledgerWordRules : []
        };
        saveColorSettings();
        if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
      }
    }

    if (fetched && !saveInProgress && !saveQueued) setSyncStatus('saved', '최신 일정 반영');
  } catch (e) {
    console.warn('Supabase schedule sync error, keeping local cached data:', e);
    state.scheduleDataState = state.allWeeksData.length ? 'cached' : 'error';
    setSyncStatus('offline');
  }
  return fetched;
}
export const syncFromGoogleSheets = syncScheduleFromSupabase;

export async function syncColorSettingsFromSupabase() {
  try {
    const colorSettingRows = await supabaseRest('schedule_settings?key=eq.color_settings');
    if (Array.isArray(colorSettingRows) && colorSettingRows.length > 0) {
      const parsed = colorSettingRows[0].value;
      if (parsed && typeof parsed === 'object') {
        state.colorSettings = {
          regionColors: { ...defaultColorSettings.regionColors, ...(parsed.regionColors || {}) },
          clinicColors: { ...defaultColorSettings.clinicColors, ...(parsed.clinicColors || {}) },
          wordRules: Array.isArray(parsed.wordRules) ? parsed.wordRules : [],
          ledgerPersonColors: { ...defaultColorSettings.ledgerPersonColors, ...(parsed.ledgerPersonColors || {}) },
          ledgerCategoryColors: { ...defaultColorSettings.ledgerCategoryColors, ...(parsed.ledgerCategoryColors || {}) },
          ledgerPaymentColors: { ...defaultColorSettings.ledgerPaymentColors, ...(parsed.ledgerPaymentColors || {}) },
          ledgerWordRules: Array.isArray(parsed.ledgerWordRules) ? parsed.ledgerWordRules : []
        };
        saveColorSettings();
        if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
      }
    }
  } catch (e) {
    console.warn('Color settings sync error:', e);
  }
}
export const syncColorSettingsFromSheets = syncColorSettingsFromSupabase;

export async function syncColorSettingsToSupabase() {
  setSyncStatus('saving');
  try {
    await supabaseRest('schedule_settings', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: {
        key: 'color_settings',
        value: state.colorSettings,
        updated_at: new Date().toISOString()
      }
    });
    setSyncStatus('saved', '색상 설정 저장 완료');
  } catch (e) {
    console.error('Supabase 색상 저장 오류:', e);
    setSyncStatus('error');
  }
}
export const syncColorSettingsToSheets = syncColorSettingsToSupabase;

/**
 * Supabase DB의 schedules 레코드를 주차별 allWeeksData로 파싱
 */
export function parseSupabaseScheduleRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return;

  const grouped = {};
  records.forEach((r, index) => {
    const weekName = r.week_title || '';
    const dateVal = r.date || '';
    if (!dateVal || !weekName) return;

    if (!grouped[weekName]) grouped[weekName] = [];
    grouped[weekName].push({
      id: r.id || (index + 1),
      date: dateVal,
      time: r.time || '오전',
      region: r.region || '',
      clinic: r.clinic || '',
      transStatus: r.trans_status || '',
      transDetail: r.trans_detail || '',
      hrStatus: r.hr_status || '',
      hrDetail: r.hr_detail || '',
      otStatus: r.ot_status || '',
      otDetail: r.ot_detail || '',
      isHoliday: Boolean(r.is_holiday),
      orderIndex: r.order_index ?? index
    });
  });

  const keys = Object.keys(grouped);
  if (keys.length > 0) {
    state.allWeeksData.length = 0;
    keys.forEach(wTitle => {
      const items = grouped[wTitle];
      const firstDate = items[0].date ? items[0].date.split('(')[0].trim() : '';
      const lastDate = items[items.length - 1].date ? items[items.length - 1].date.split('(')[0].trim() : '';
      state.allWeeksData.push({
        title: `${wTitle} (${firstDate} ~ ${lastDate})`,
        items: items
      });
    });
  }

  state.currentWeekIndex = getTodayWeekIndex();
  if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
  saveLocalStorageData();
}

/**
 * 전체 일정을 Supabase DB에 초고속 (0.05초) 일괄 저장
 */
async function postAllSchedules() {
  const allItemsToPost = [];
  let globalOrder = 0;

  state.allWeeksData.forEach(wObj => {
    const wName = wObj.title.split(' (')[0];
    wObj.items.forEach(it => {
      const id = String(it.id || `sched_${globalOrder + 1}`);
      allItemsToPost.push({
        id: id,
        week_title: wName,
        date: it.date,
        time: it.time,
        region: it.region || '',
        clinic: it.clinic || '',
        trans_status: it.transStatus || '',
        trans_detail: it.transDetail || '',
        hr_status: it.hrStatus || '',
        hr_detail: it.hrDetail || '',
        ot_status: it.otStatus || '',
        ot_detail: it.otDetail || '',
        is_holiday: Boolean(it.isHoliday),
        order_index: globalOrder++,
        updated_at: new Date().toISOString()
      });
    });
  });

  if (allItemsToPost.length === 0) return;

  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < allItemsToPost.length; i += chunkSize) {
    chunks.push(allItemsToPost.slice(i, i + chunkSize));
  }

  await Promise.all(chunks.map(chunk =>
    supabaseRest('schedules', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: chunk
    })
  ));
}
