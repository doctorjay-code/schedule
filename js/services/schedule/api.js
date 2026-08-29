import { state, getTodayWeekIndex, saveLocalStorageData, saveLastScheduleSheetSnapshot, saveColorSettings, defaultColorSettings, updateSummaryCounts, normalizeColorSettings } from './state.js';
import { setSyncStatus } from '../../shared/sync-ui.js';
import { supabaseRest } from '../ledger/supabase-client.js';

let apiLoadWeekDataFn = null;
let colorUpdateCallbacks = new Set();
let saveTimer = null;
let saveInProgress = false;
let saveQueued = false;

export function setApiLoadWeekDataCallback(fn) {
  apiLoadWeekDataFn = fn;
}

export function registerColorUpdateCallback(fn) {
  if (typeof fn === 'function') colorUpdateCallbacks.add(fn);
}

function notifyColorUpdated() {
  colorUpdateCallbacks.forEach(fn => {
    try { fn(state.colorSettings); } catch (e) { console.warn('Color callback err:', e); }
  });
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
 * Supabase DB에서 schedules 및 color_settings 동기화
 */
export async function syncScheduleFromSupabase() {
  setSyncStatus('loading');
  let fetched = false;

  try {
    const [scheduleRows, colorSettingRows] = await Promise.all([
      supabaseRest('schedules?order=week_title.asc,id.asc'),
      supabaseRest('schedule_settings?key=eq.color_settings')
    ]);

    if (Array.isArray(scheduleRows) && scheduleRows.length > 0) {
      parseSupabaseScheduleRecords(scheduleRows);
      saveLocalStorageData();
      saveLastScheduleSheetSnapshot(state.allWeeksData);
      state.scheduleDataState = 'saved';
      if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
      updateSummaryCounts();
      fetched = true;
    }

    if (Array.isArray(colorSettingRows) && colorSettingRows.length > 0) {
      state.colorSettings = normalizeColorSettings(colorSettingRows[0]?.value);
      saveColorSettings();
      if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
      notifyColorUpdated();
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
      state.colorSettings = normalizeColorSettings(colorSettingRows[0]?.value);
      saveColorSettings();
      if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
      notifyColorUpdated();
    }
  } catch (e) {
    console.warn('Color settings sync error:', e);
  }
}
export const syncColorSettingsFromSheets = syncColorSettingsFromSupabase;

export async function syncColorSettingsToSupabase() {
  try {
    const payload = normalizeColorSettings(state.colorSettings);
    state.colorSettings = payload;
    saveColorSettings();
    notifyColorUpdated();

    await supabaseRest('schedule_settings', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: {
        key: 'color_settings',
        value: payload,
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
// 날짜 문자열에서 정렬 키 추출 (예: "4. 7.(화)" → [titleYear, 4, 7] / "2026. 4. 7.(화)" → [2026, 4, 7])
// titleYear: 날짜에 연도가 없을 때 주차 제목에서 가져온 연도를 fallback으로 사용
function parseDateSortKey(dateStr, titleYear = new Date().getFullYear()) {
  const nums = (dateStr || '').match(/\d+/g);
  if (!nums) return [9999, 99, 99];
  const year  = nums.find(n => n.length === 4) ? parseInt(nums.find(n => n.length === 4), 10) : titleYear;
  const rest  = nums.filter(n => n.length !== 4).map(Number);
  const month = rest[0] ?? 99;
  const day   = rest[1] ?? 99;
  return [year, month, day];
}

// 주차 제목에서 연도(4자리) 추출
function extractYearFromTitle(title) {
  const y = (title || '').match(/\d{4}/);
  return y ? parseInt(y[0], 10) : new Date().getFullYear();
}

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

  // 수정 1: 각 주차의 첫 번째 실제 날짜 기준으로 정렬 (날짜에 연도 없으면 주차 제목에서 보완)
  const keys = Object.keys(grouped).sort((a, b) => {
    const aFirstDate = grouped[a][0]?.date || '';
    const bFirstDate = grouped[b][0]?.date || '';
    const [ay, am, ad] = parseDateSortKey(aFirstDate, extractYearFromTitle(a));
    const [by, bm, bd] = parseDateSortKey(bFirstDate, extractYearFromTitle(b));
    return ay !== by ? ay - by : am !== bm ? am - bm : ad - bd;
  });

  if (keys.length > 0) {
    state.allWeeksData.length = 0;
    keys.forEach(wTitle => {
      // 수정 2: (date + time) 조합 기준 중복 제거 + orderIndex 오름차순 정렬
      const seenKeys = new Set();
      const items = grouped[wTitle]
        .filter(item => {
          const key = `${item.date}_${item.time}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        })
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const firstDate = items[0]?.date ? items[0].date.split('(')[0].trim() : '';
      const lastDate  = items[items.length - 1]?.date ? items[items.length - 1].date.split('(')[0].trim() : '';
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
      // 수정 3: 내용 기반 안정 id (주차+날짜+시간 조합 → 매 저장마다 동일 보장)
      const stableId = `${wName}__${it.date}__${it.time}`;
      const id = String(it.id && !String(it.id).startsWith('sched_') ? it.id : stableId);

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
