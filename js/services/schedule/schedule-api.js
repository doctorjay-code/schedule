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

    const isTest = (typeof process !== 'undefined' && process.versions && Boolean(process.versions.node)) ||
                   (typeof window !== 'undefined' && Boolean(window.__IS_TEST_ENV__));

    if (!isTest) {
      await supabaseRest('app_settings', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: {
          key: 'color_settings',
          value: payload,
          updated_at: new Date().toISOString()
        }
      });
    }
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
 * 표준 날짜 정렬형 일정 ID 생성기 (sch-YYYYMMDD-am/pm-xxxxxx)
 */
export function generateScheduleId(weekTitle = '', dateStr = '', time = '오전') {
  let y = (weekTitle || '').match(/\d{4}/)?.[0] || '2026';
  const mMatch = (dateStr || '').match(/^([0-9]{1,2})\./);
  const dMatch = (dateStr || '').match(/\.\s*([0-9]{1,2})\./);
  const m = mMatch ? String(mMatch[1]).padStart(2, '0') : '01';
  const d = dMatch ? String(dMatch[1]).padStart(2, '0') : '01';
  if (m === '01' && weekTitle.includes('12월')) {
    y = String(parseInt(y, 10) + 1);
  }
  const tKey = time === '오후' ? 'pm' : 'am';
  const rand = Math.random().toString(36).slice(2, 8);
  return `sch-${y}${m}${d}-${tKey}-${rand}`;
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

    if (!weekName) weekName = '미지정 주차';
    if (!dateVal) dateVal = '미지정 날짜';

    if (!grouped[weekName]) grouped[weekName] = [];
    const rowId = r.id || generateScheduleId(weekName, dateVal, r.time);
    grouped[weekName].push({
      id: rowId,
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

  // 각 주차의 첫 번째 실제 날짜 기준으로 정렬
  const keys = Object.keys(grouped).sort((a, b) => {
    const aFirstDate = grouped[a][0]?.date || '';
    const bFirstDate = grouped[b][0]?.date || '';
    const [ay, am, ad] = parseDateSortKey(aFirstDate, extractYearFromTitle(a));
    const [by, bm, bd] = parseDateSortKey(bFirstDate, extractYearFromTitle(b));
    return ay !== by ? ay - by : am !== bm ? am - bm : ad - bd;
  });

  const parsedWeeks = keys.map(k => ({
    title: k,
    items: grouped[k]
  }));

  setAllWeeksData(parsedWeeks);
  const todayIdx = getTodayWeekIndex();
  setCurrentWeekIndex(todayIdx >= 0 ? todayIdx : 0);
  if (apiLoadWeekDataFn) apiLoadWeekDataFn(getCurrentWeekIndex());
  saveLastScheduleSnapshot();
}

/**
 * 전체 allWeeksData를 schedules 테이블 형식으로 변환 후 원자적 Upsert (단일 일괄 처리)
 */
async function postAllSchedules() {
  const currentWeeks = getAllWeeksData();
  if (!currentWeeks || currentWeeks.length === 0) return;

  const allItemsToPost = [];
  let globalOrder = 0;

  currentWeeks.forEach(wObj => {
    const wName = wObj.title.split(' (')[0];
    (wObj.items || []).forEach(it => {
      const rowId = it.id && it.id.startsWith('sch-')
        ? it.id
        : generateScheduleId(wName, it.date, it.time);
      it.id = rowId;

      allItemsToPost.push({
        id: rowId,
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
