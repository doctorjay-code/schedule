import {
  getAllWeeksData,
  setAllWeeksData,
  getCurrentWeekIndex,
  setCurrentWeekIndex,
  getColorSettings,
  setColorSettings,
  saveColorSettings,
  setScheduleDataState,
  saveLastScheduleSnapshot,
  getTodayWeekIndex,
  updateSummaryCounts,
  normalizeColorSettings
} from './schedule-store.js';
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
  const currentColors = getColorSettings();
  colorUpdateCallbacks.forEach(fn => {
    try { fn(currentColors); } catch (e) { console.warn('Color callback err:', e); }
  });
}

export function syncScheduleToSupabase() {
  saveLastScheduleSnapshot();
  saveQueued = true;
  setSyncStatus('saving');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushScheduledSave, 300);
}

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
      supabaseRest('schedules?order=week_title.asc,order_index.asc,id.asc'),
      supabaseRest('app_settings?key=eq.color_settings')
    ]);

    if (Array.isArray(scheduleRows) && scheduleRows.length > 0) {
      parseSupabaseScheduleRecords(scheduleRows);
      saveLastScheduleSnapshot();
      setScheduleDataState('saved');
      if (apiLoadWeekDataFn) apiLoadWeekDataFn(getCurrentWeekIndex());
      updateSummaryCounts();
      fetched = true;
    }

    if (Array.isArray(colorSettingRows) && colorSettingRows.length > 0) {
      setColorSettings(colorSettingRows[0]?.value);
      saveColorSettings();
      if (apiLoadWeekDataFn) apiLoadWeekDataFn(getCurrentWeekIndex());
      notifyColorUpdated();
    }

    if (fetched && !saveInProgress && !saveQueued) setSyncStatus('saved', '최신 일정 반영');
  } catch (e) {
    console.warn('Supabase schedule sync error, keeping local cached data:', e);
    const weeks = getAllWeeksData();
    setScheduleDataState(weeks.length ? 'cached' : 'error');
    setSyncStatus('offline');
  }
  return fetched;
}

export async function syncColorSettingsFromSupabase() {
  try {
    const colorSettingRows = await supabaseRest('app_settings?key=eq.color_settings');
    if (Array.isArray(colorSettingRows) && colorSettingRows.length > 0) {
      setColorSettings(colorSettingRows[0]?.value);
      saveColorSettings();
      if (apiLoadWeekDataFn) apiLoadWeekDataFn(getCurrentWeekIndex());
      notifyColorUpdated();
    }
  } catch (e) {
    console.warn('Color settings sync error:', e);
  }
}

export async function syncColorSettingsToSupabase() {
  try {
    const payload = normalizeColorSettings(getColorSettings());
    setColorSettings(payload);
    saveColorSettings();
    notifyColorUpdated();

    await supabaseRest('app_settings', {
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

/**
 * 날짜 정렬 키 추출
 */
function parseDateSortKey(dateStr, titleYear = new Date().getFullYear()) {
  const nums = (dateStr || '').match(/\d+/g);
  if (!nums) return [9999, 99, 99];
  const year  = nums.find(n => n.length === 4) ? parseInt(nums.find(n => n.length === 4), 10) : titleYear;
  const rest  = nums.filter(n => n.length !== 4).map(Number);
  const month = rest[0] ?? 99;
  const day   = rest[1] ?? 99;
  return [year, month, day];
}

function extractYearFromTitle(title) {
  const y = (title || '').match(/\d{4}/);
  return y ? parseInt(y[0], 10) : new Date().getFullYear();
}

/**
 * Supabase DB의 schedules 레코드를 주차별 allWeeksData로 파싱 (무손실 파싱 & 로깅 확보)
 */
export function parseSupabaseScheduleRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return;

  const grouped = {};
  records.forEach((r, index) => {
    let weekName = (r.week_title || '').trim();
    let dateVal = (r.date || '').trim();

    // 빈 값 발생 시 조용히 버리지 않고 기본값 보완 및 로깅 (규칙 #5 준수)
    if (!weekName || !dateVal) {
      console.warn('⚠️ [parseSupabaseScheduleRecords] 불완전 레코드 보완:', r);
      if (!weekName) weekName = '미지정 주차';
      if (!dateVal) dateVal = '미지정 날짜';
    }

    if (!grouped[weekName]) grouped[weekName] = [];
    const stableId = `${weekName}__${dateVal}__${r.time || '오전'}`;
    grouped[weekName].push({
      id: r.id || stableId,
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

  const parsedWeeks = Object.keys(grouped).map(title => {
    const items = grouped[title];
    items.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    return { title, items };
  });

  // 주차 정렬: 각 주차 첫 항목 날짜 기준
  parsedWeeks.sort((wA, wB) => {
    const yA = extractYearFromTitle(wA.title);
    const yB = extractYearFromTitle(wB.title);
    const dateA = wA.items[0]?.date || '';
    const dateB = wB.items[0]?.date || '';
    const [yearA, monthA, dayA] = parseDateSortKey(dateA, yA);
    const [yearB, monthB, dayB] = parseDateSortKey(dateB, yB);
    if (yearA !== yearB) return yearA - yearB;
    if (monthA !== monthB) return monthA - monthB;
    return dayA - dayB;
  });

  setAllWeeksData(parsedWeeks);
  const todayIdx = getTodayWeekIndex();
  setCurrentWeekIndex(todayIdx >= 0 ? todayIdx : 0);
}

/**
 * 전체 allWeeksData를 schedules 테이블 형식으로 변환 후 원자적 Upsert (단일 일괄 처리)
 */
async function postAllSchedules() {
  const currentWeeks = getAllWeeksData();
  if (!currentWeeks || currentWeeks.length === 0) return;

  const flatRows = [];
  const now = new Date().toISOString();

  currentWeeks.forEach((weekObj) => {
    const weekTitle = weekObj.title;
    (weekObj.items || []).forEach((item, index) => {
      flatRows.push({
        id: `${weekTitle}__${item.date}__${item.time}`,
        week_title: weekTitle,
        date: item.date,
        time: item.time,
        region: item.region || '',
        clinic: item.clinic || '',
        trans_status: item.transStatus || '',
        trans_detail: item.transDetail || '',
        hr_status: item.hrStatus || '',
        hr_detail: item.hrDetail || '',
        ot_status: item.otStatus || '',
        ot_detail: item.otDetail || '',
        is_holiday: Boolean(item.isHoliday),
        order_index: index,
        updated_at: now
      });
    });
  });

  // 단 1회의 대량 Upsert 호출로 원자적 동기화 완료
  await supabaseRest('schedules', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: flatRows
  });
}
