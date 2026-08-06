import { GAS_WEB_APP_URL, state, getTodayWeekIndex, saveLocalStorageData } from './state.js';

let apiLoadWeekDataFn = null;

export function setApiLoadWeekDataCallback(fn) {
  apiLoadWeekDataFn = fn;
}

export async function syncFromGoogleSheets() {
  if (!GAS_WEB_APP_URL) return;
  try {
    const freshUrl = GAS_WEB_APP_URL + (GAS_WEB_APP_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
    const res = await fetch(freshUrl, { cache: 'no-store' });
    if (res.ok) {
      const records = await res.json();
      if (Array.isArray(records) && records.length > 0) {
        parseGoogleSheetsRecordsUniversal(records);
      }
    }
  } catch (e) {
    console.log('Google Sheets sync skipped or offline, using local cache:', e);
  }
}

export function parseGoogleSheetsRecordsUniversal(records) {
  if (!Array.isArray(records) || records.length === 0) return;

  const getProp = (obj, propName) => {
    if (!obj) return '';
    const key = Object.keys(obj).find(k => k.toLowerCase() === propName.toLowerCase());
    return key ? String(obj[key] || '').trim() : '';
  };

  const is11Col = records.some(r => (getProp(r, 'week') || getProp(r, '주차')) && (getProp(r, 'date') || getProp(r, '날짜/요일')));
  if (is11Col) {
    const grouped = {};
    records.forEach(r => {
      const weekName = getProp(r, 'week') || getProp(r, '주차') || '';
      const dateVal = getProp(r, 'date') || getProp(r, '날짜/요일') || '';
      const timeVal = getProp(r, 'time') || getProp(r, '시간') || '오전';
      if (!dateVal || !weekName) return;

      if (!grouped[weekName]) grouped[weekName] = [];
      const clinicVal = getProp(r, 'clinic') || getProp(r, '진료') || '';
      const fixedHolidays = ['8. 15.', '8. 17.', '9. 24.', '9. 25.', '9. 26.', '9. 28.', '10. 3.', '10. 5.', '10. 9.', '12. 25.', '1. 1.', '2. 6.', '2. 7.', '2. 8.', '2. 9.', '3. 1.'];
      const isHoliday = (dateVal.includes("토") || dateVal.includes("일") || fixedHolidays.some(h => dateVal.includes(h)));

      grouped[weekName].push({
        id: grouped[weekName].length + 1,
        date: dateVal,
        time: timeVal,
        region: getProp(r, 'region') || getProp(r, '지역') || '',
        clinic: clinicVal,
        transStatus: getProp(r, 'transStatus') || getProp(r, '교통 상태') || '',
        transDetail: getProp(r, 'transDetail') || getProp(r, '교통 상세') || '',
        hrStatus: getProp(r, 'hrStatus') || getProp(r, '국인체 상태') || '',
        hrDetail: getProp(r, 'hrDetail') || getProp(r, '국인체 상세') || '',
        otStatus: getProp(r, 'otStatus') || getProp(r, '수당 상태') || '',
        otDetail: getProp(r, 'otDetail') || getProp(r, '수당 상세') || '',
        isHoliday: isHoliday
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
    return;
  }

  // Format B: Horizontal Format
  let i = 0;
  while (i < records.length) {
    const rowObj = records[i];
    const rowVals = Object.values(rowObj).map(v => String(v).trim());
    const hasDate = rowVals.some(v => v.includes('.') && v.includes('('));

    if (hasDate) {
      const dateRow = rowVals;
      const timeRow = (i + 1 < records.length) ? Object.values(records[i + 1]).map(v => String(v).trim()) : [];
      const clinicRow = (i + 2 < records.length) ? Object.values(records[i + 2]).map(v => String(v).trim()) : [];
      const transRow = (i + 3 < records.length) ? Object.values(records[i + 3]).map(v => String(v).trim()) : [];
      const hrRow = (i + 4 < records.length) ? Object.values(records[i + 4]).map(v => String(v).trim()) : [];
      const otRow = (i + 5 < records.length) ? Object.values(records[i + 5]).map(v => String(v).trim()) : [];

      let weekTarget = null;
      let colIdx = 0;
      let currDate = "";

      while (colIdx < dateRow.length) {
        if (dateRow[colIdx] && dateRow[colIdx].includes('.')) {
          currDate = dateRow[colIdx];
        }

        const timeVal = timeRow[colIdx] || "";
        if (timeVal === "오전" || timeVal === "오후") {
          const clinicVal = clinicRow[colIdx] || "";
          const transVal = transRow[colIdx] || "";
          const hrVal = hrRow[colIdx] || "";
          const otVal = otRow[colIdx] || "";

          if (!weekTarget && currDate) {
            state.allWeeksData.forEach(wObj => {
              const dNum = currDate.substring(0, 4);
              if (wObj.title.includes(dNum) || wObj.items.some(it => it.date === currDate)) {
                weekTarget = wObj;
              }
            });
          }

          let transStatus = "", transDetail = transVal;
          if (transVal.includes('[결제O]')) { transStatus = "결제O"; transDetail = transVal.replace('[결제O]', '').trim(); }
          else if (transVal.includes('[결제X]')) { transStatus = "결제X"; transDetail = transVal.replace('[결제X]', '').trim(); }

          let hrStatus = "", hrDetail = hrVal;
          if (hrVal.includes('[승인O]')) { hrStatus = "승인O"; hrDetail = hrVal.replace('[승인O]', '').trim(); }
          else if (hrVal.includes('[신청O]')) { hrStatus = "신청O"; hrDetail = hrVal.replace('[신청O]', '').trim(); }

          let otStatus = "", otDetail = otVal;
          if (otVal.includes('[승인O]')) { otStatus = "승인O"; otDetail = otVal.replace('[승인O]', '').trim(); }
          else if (otVal.includes('[신청O]')) { otStatus = "신청O"; otDetail = otVal.replace('[신청O]', '').trim(); }

          let region = "진주";
          if (clinicVal.includes("휴가") || transVal.includes("서울")) region = "서울";
          else if (clinicVal.includes("행정") || transVal.includes("이동") || transVal.includes("KTX") || transVal.includes("고속버스")) region = "이동";

          if (weekTarget) {
            const targetItem = weekTarget.items.find(it => it.date === currDate && it.time === timeVal);
            if (targetItem) {
              targetItem.region = region;
              targetItem.clinic = clinicVal;
              targetItem.transStatus = transStatus;
              targetItem.transDetail = transDetail;
              targetItem.hrStatus = hrStatus;
              targetItem.hrDetail = hrDetail;
              targetItem.otStatus = otStatus;
              targetItem.otDetail = otDetail;
            }
          }
        }
        colIdx++;
      }
      i += 6;
    } else {
      i++;
    }
  }

  if (apiLoadWeekDataFn) apiLoadWeekDataFn(state.currentWeekIndex);
  saveLocalStorageData();
}

export async function syncToGoogleSheets() {
  saveLocalStorageData();
  if (!GAS_WEB_APP_URL) return;

  try {
    const allItemsToPost = [];
    state.allWeeksData.forEach(wObj => {
      const wName = wObj.title.split(' (')[0];
      wObj.items.forEach(it => {
        allItemsToPost.push({
          week: wName,
          date: it.date,
          time: it.time,
          region: it.region,
          clinic: it.clinic,
          transStatus: it.transStatus || '',
          transDetail: it.transDetail || '',
          hrStatus: it.hrStatus || '',
          hrDetail: it.hrDetail || '',
          otStatus: it.otStatus || '',
          otDetail: it.otDetail || ''
        });
      });
    });

    await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'UPDATE_ALL',
        items: allItemsToPost
      })
    });
  } catch (e) {
    console.error('Error posting live update to Google Sheets:', e);
  }
}
