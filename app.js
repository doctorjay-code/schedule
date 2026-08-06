// Google Apps Script Live Sync URL
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwWDkrKXfT-eKbJS6D5uhvfgmHchGm2WSAfuTKRCvvp-uHrV01nI8nJw6K4qGsm8kEcMQ/exec";

// Master Schedule Database (7 Weeks loaded)
// Dynamic Schedule Database (Loaded from Google Sheets API)
const allWeeksData = [];

function getTodayWeekIndex() {
  if (allWeeksData.length === 0) return 0;
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const todayStr = `${m}. ${d}.`;

  for (let i = 0; i < allWeeksData.length; i++) {
    if (allWeeksData[i].items && allWeeksData[i].items.some(it => it.date.includes(todayStr))) {
      return i;
    }
  }
  return 0;
}

let currentWeekIndex = 0;
let weekData = [];

let activeItem = null;
let currentFilter = 'all';
let copiedScheduleData = null;
let isMultiEditMode = false;
let selectedCells = [];

// Security & Lockout State
const SECURITY_PASSWORD_HASH = 'f0fee696ab48d4321ec49b94c7efb48a02da6f9798c3f6afc95c626d028cb7e0'; // Password: 140817!
const authModalOverlay = document.getElementById('authModalOverlay');
const authPasswordInput = document.getElementById('authPasswordInput');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authErrorMsg = document.getElementById('authErrorMsg');
const authLockoutTimer = document.getElementById('authLockoutTimer');

let failedAttempts = parseInt(localStorage.getItem('security_failed_attempts') || '0');
let lockoutUntil = parseInt(localStorage.getItem('security_lockout_until') || '0');
let lockoutInterval = null;

// DOM Elements
const weekTitleElem = document.getElementById('weekTitle');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const todayBtn = document.getElementById('todayBtn');

const scheduleBody = document.getElementById('scheduleBody');
const modalOverlay = document.getElementById('modalOverlay');
const modalDateTitle = document.getElementById('modalDateTitle');

const regionBtnGroup = document.getElementById('regionBtnGroup');
const customRegionInput = document.getElementById('customRegionInput');

const clinicBtnGroup = document.getElementById('clinicBtnGroup');
const customClinicInput = document.getElementById('customClinicInput');

const transStatusToggle = document.getElementById('transStatusToggle');
const hrStatusToggle = document.getElementById('hrStatusToggle');
const otStatusToggle = document.getElementById('otStatusToggle');

// Category Select & Custom Wrappers
const transSelectCategory = document.getElementById('transSelectCategory');
const customTransWrapper = document.getElementById('customTransWrapper');
const customTransCategoryInput = document.getElementById('customTransCategoryInput');
const resetTransCategoryBtn = document.getElementById('resetTransCategoryBtn');

const hrSelectCategory = document.getElementById('hrSelectCategory');
const customHrWrapper = document.getElementById('customHrWrapper');
const customHrCategoryInput = document.getElementById('customHrCategoryInput');
const resetHrCategoryBtn = document.getElementById('resetHrCategoryBtn');

const otSelectCategory = document.getElementById('otSelectCategory');
const customOtWrapper = document.getElementById('customOtWrapper');
const customOtCategoryInput = document.getElementById('customOtCategoryInput');
const resetOtCategoryBtn = document.getElementById('resetOtCategoryBtn');

// Detail Inputs
const transDetailInput = document.getElementById('transDetailInput');
const hrDetailInput = document.getElementById('hrDetailInput');
const otDetailInput = document.getElementById('otDetailInput');

// Summary & Tools Elements
const unpaidCountElem = document.getElementById('unpaidCount');
const unappliedCountElem = document.getElementById('unappliedCount');
const unapprovedCountElem = document.getElementById('unapprovedCount');

const toggleMultiEditBtn = document.getElementById('toggleMultiEditBtn');
const copyBufferBar = document.getElementById('copyBufferBar');
const copiedItemLabel = document.getElementById('copiedItemLabel');
const clearCopyBtn = document.getElementById('clearCopyBtn');

const multiActionBar = document.getElementById('multiActionBar');
const selectedCountLabel = document.getElementById('selectedCountLabel');
const bulkCopyBtn = document.getElementById('bulkCopyBtn');
const bulkPasteBtn = document.getElementById('bulkPasteBtn');
const bulkJinjuBtn = document.getElementById('bulkJinjuBtn');

const copyScheduleBtn = document.getElementById('copyScheduleBtn');
const applyWeekdaysBtn = document.getElementById('applyWeekdaysBtn');

const summaryModalOverlay = document.getElementById('summaryModalOverlay');
const summaryModalTitle = document.getElementById('summaryModalTitle');
const summaryListContainer = document.getElementById('summaryListContainer');

// Standard Preset Categories
const standardTransCategories = ['KTX', '고속버스', '버스', '무궁화호', '신화호'];
const standardHrCategories = ['연가', '당직OFF', '청원휴가'];
const standardOtCategories = ['야간', '당직', '휴일'];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initSecurityAuth();
  loadLocalStorageData();
  loadWeekData(currentWeekIndex);
  initEvents();
  syncFromGoogleSheets();
});

// Security Authentication & Lockout System Initialization
function initSecurityAuth() {
  const isAuthPassed = sessionStorage.getItem('security_authenticated');
  if (isAuthPassed === 'true') {
    authModalOverlay.classList.remove('active');
  } else {
    authModalOverlay.classList.add('active');
  }

  const now = Date.now();
  if (lockoutUntil && now < lockoutUntil) {
    startLockoutTimer(lockoutUntil);
  }

  authSubmitBtn.addEventListener('click', handleAuthSubmit);
  authPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuthSubmit();
  });
}

function startLockoutTimer(untilTime) {
  authSubmitBtn.disabled = true;
  authPasswordInput.disabled = true;
  authLockoutTimer.classList.remove('hidden');

  if (lockoutInterval) clearInterval(lockoutInterval);

  lockoutInterval = setInterval(() => {
    const remainingMs = untilTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(lockoutInterval);
      failedAttempts = 0;
      lockoutUntil = 0;
      localStorage.removeItem('security_failed_attempts');
      localStorage.removeItem('security_lockout_until');

      authSubmitBtn.disabled = false;
      authPasswordInput.disabled = false;
      authLockoutTimer.classList.add('hidden');
      authErrorMsg.textContent = '';
      authErrorMsg.classList.add('hidden');
    } else {
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      authLockoutTimer.textContent = `🚨 10회 입력 오류로 차단됨! (남은 시간: ${minutes}분 ${seconds}초)`;
    }
  }, 1000);
}

async function hashString(str) {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleAuthSubmit() {
  const enteredPass = authPasswordInput.value.trim();
  const now = Date.now();

  if (lockoutUntil && now < lockoutUntil) return;

  const enteredHash = await hashString(enteredPass);

  if (enteredHash === SECURITY_PASSWORD_HASH) {
    sessionStorage.setItem('security_authenticated', 'true');
    authModalOverlay.classList.remove('active');
    failedAttempts = 0;
    localStorage.removeItem('security_failed_attempts');
    authPasswordInput.value = '';
    if (allWeeksData && allWeeksData.length > 0) {
      loadWeekData(currentWeekIndex);
    } else {
      syncFromGoogleSheets();
    }
  } else {
    failedAttempts++;
    localStorage.setItem('security_failed_attempts', failedAttempts.toString());

    if (failedAttempts >= 10) {
      lockoutUntil = Date.now() + 5 * 60 * 1000; // 5 Minutes Lockout for this device
      localStorage.setItem('security_lockout_until', lockoutUntil.toString());
      authErrorMsg.textContent = '❌ 10회 연속 오답으로 5분간 접속이 차단됩니다.';
      authErrorMsg.classList.remove('hidden');
      startLockoutTimer(lockoutUntil);
    } else {
      authErrorMsg.textContent = `❌ 비밀번호가 틀렸습니다. (오류: ${failedAttempts}/10회)`;
      authErrorMsg.classList.remove('hidden');
    }
  }
}

// Sync Data from Google Sheets API with Universal Dual-Format Parser
async function syncFromGoogleSheets() {
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

// Universal Dual-Format Parser
function parseGoogleSheetsRecordsUniversal(records) {
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
      const isHoliday = (dateVal.includes("토") || dateVal.includes("일") || clinicVal.includes("광복절") || clinicVal.includes("휴무"));

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
      allWeeksData.length = 0;
      keys.forEach(wTitle => {
        const items = grouped[wTitle];
        const firstDate = items[0].date ? items[0].date.split('(')[0].trim() : '';
        const lastDate = items[items.length - 1].date ? items[items.length - 1].date.split('(')[0].trim() : '';
        allWeeksData.push({
          title: `${wTitle} (${firstDate} ~ ${lastDate})`,
          items: items
        });
      });
    }

    currentWeekIndex = getTodayWeekIndex();
    loadWeekData(currentWeekIndex);
    saveLocalStorageData();
    return;
  }

  // Format B: Original Horizontal Sheet Format
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
            allWeeksData.forEach(wObj => {
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

  loadWeekData(currentWeekIndex);
  saveLocalStorageData();
}

// Sync Current State to Google Sheets API (POST Update)
async function syncToGoogleSheets() {
  saveLocalStorageData();
  if (!GAS_WEB_APP_URL) return;

  try {
    const allItemsToPost = [];
    allWeeksData.forEach(wObj => {
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

// Load Persistent Local Storage if available
function loadLocalStorageData() {
  const savedData = localStorage.getItem('user_schedule_data');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (Array.isArray(parsed) && parsed.length === allWeeksData.length) {
        parsed.forEach((w, idx) => {
          allWeeksData[idx].items = w.items;
        });
      }
    } catch(e) {
      console.error('Error loading saved schedule data:', e);
    }
  }
}

// Save Current State to Local Storage
function saveLocalStorageData() {
  localStorage.setItem('user_schedule_data', JSON.stringify(allWeeksData));
}

// Load Specified Week Data
function loadWeekData(index) {
  if (!allWeeksData || allWeeksData.length === 0) return;
  if (index < 0) index = 0;
  if (index >= allWeeksData.length) index = allWeeksData.length - 1;
  currentWeekIndex = index;

  const currentWeekObj = allWeeksData[currentWeekIndex];
  weekTitleElem.textContent = currentWeekObj.title.split(' (')[0];
  weekData = currentWeekObj.items;

  selectedCells = [];
  selectedCountLabel.textContent = '0개 선택됨';
  
  renderTable();
  updateSummaryCounts();
}

// Calculate Dynamic Summary Counts Across Current Week
// Calculate Dynamic Summary Counts Across All 1-Year Schedules
function updateSummaryCounts() {
  let unpaid = 0;
  let unapplied = 0;
  let unapproved = 0;

  allWeeksData.forEach(wObj => {
    if (wObj.items && Array.isArray(wObj.items)) {
      wObj.items.forEach(item => {
        if (item.transStatus === '결제X') unpaid++;
        if (item.hrStatus === '신청X' || item.otStatus === '신청X') unapplied++;
        if (item.hrStatus === '신청O' || item.otStatus === '신청O') unapproved++;
      });
    }
  });

  unpaidCountElem.textContent = unpaid;
  unappliedCountElem.textContent = unapplied;
  unapprovedCountElem.textContent = unapproved;
}

// Helper: Check if date is weekend or holiday
function isRedDate(item) {
  return item.isHoliday || 
         item.date.includes('토') || 
         item.date.includes('일') || 
         item.clinic.includes('공휴일') || 
         item.clinic.includes('대체휴무') || 
         item.clinic.includes('광복절') ||
         item.clinic.includes('휴무');
}

// Helper to parse detail string into category & sub-detail
function parseSectionField(fullStr, standardList, selectElem, wrapperElem, customInputElem, detailInputElem) {
  let matchedCat = '';
  let subText = fullStr || '';

  for (let cat of standardList) {
    if (subText.startsWith(cat)) {
      matchedCat = cat;
      subText = subText.replace(cat, '').trim();
      break;
    }
  }

  if (matchedCat) {
    selectElem.value = matchedCat;
    selectElem.classList.remove('hidden');
    wrapperElem.classList.add('hidden');
    customInputElem.value = '';
    detailInputElem.value = subText;
  } else if (subText) {
    selectElem.classList.add('hidden');
    wrapperElem.classList.remove('hidden');
    
    const spaceIdx = subText.indexOf(' ');
    if (spaceIdx > 0) {
      customInputElem.value = subText.substring(0, spaceIdx);
      detailInputElem.value = subText.substring(spaceIdx + 1);
    } else {
      customInputElem.value = subText;
      detailInputElem.value = '';
    }
  } else {
    selectElem.value = '';
    selectElem.classList.remove('hidden');
    wrapperElem.classList.add('hidden');
    customInputElem.value = '';
    detailInputElem.value = '';
  }
}

// Helper to assemble category & detail
function assembleSectionField(selectElem, wrapperElem, customInputElem, detailInputElem) {
  let catVal = '';
  if (!selectElem.classList.contains('hidden')) {
    catVal = selectElem.value;
  } else {
    catVal = customInputElem.value.trim() || '기타';
  }

  const subVal = detailInputElem.value.trim();
  if (catVal && subVal) return `${catVal} ${subVal}`;
  if (catVal) return catVal;
  return subVal;
}

// Helper: Check if cell key is selected
function isCellSelected(key) {
  return selectedCells.includes(key);
}

// Helper: Toggle Cell Key Selection
function toggleCellKey(key) {
  const idx = selectedCells.indexOf(key);
  if (idx >= 0) selectedCells.splice(idx, 1);
  else selectedCells.push(key);

  selectedCountLabel.textContent = `${selectedCells.length}개 선택됨`;
  renderTable();
}

// Render Table Function with Precision Cell-Level Multi Selection & Smart Visual Cell Merging
function renderTable() {
  scheduleBody.innerHTML = '';

  for (let i = 0; i < weekData.length; i += 2) {
    const mItem = weekData[i];       // Morning Item
    const aItem = weekData[i + 1];   // Afternoon Item

    const mTr = document.createElement('tr');
    mTr.dataset.id = mItem.id;

    const aTr = document.createElement('tr');
    if (aItem) {
      aTr.dataset.id = aItem.id;
      aTr.classList.add('row-day-end');
    }

    // Filter Logic
    let mMatched = checkFilterMatch(mItem);
    let aMatched = aItem ? checkFilterMatch(aItem) : false;

    mTr.style.opacity = mMatched ? '1' : '0.35';
    if (aTr) aTr.style.opacity = aMatched ? '1' : '0.35';

    // 1. Date Cell (날짜/요일): Always Merged!
    const tdDate = document.createElement('td');
    tdDate.rowSpan = 2;
    tdDate.className = 'cell-date';

    const dayKey = `${mItem.id}_${aItem ? aItem.id : ''}_day`;
    const mSubCount = selectedCells.filter(k => k.startsWith(`${mItem.id}_`)).length;
    const aSubCount = aItem ? selectedCells.filter(k => k.startsWith(`${aItem.id}_`)).length : 0;
    const isFullDaySelected = isCellSelected(dayKey) || 
                              (isCellSelected(`${mItem.id}_row`) && aItem && isCellSelected(`${aItem.id}_row`)) ||
                              (mSubCount >= 3 && aSubCount >= 3);

    if (isMultiEditMode && isFullDaySelected) {
      tdDate.classList.add('cell-date-selected');
    }

    if (isRedDate(mItem)) {
      tdDate.classList.add('cell-holiday');
    }
    tdDate.textContent = mItem.date;

    tdDate.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiEditMode) {
        toggleFullDaySelection(mItem.id, aItem ? aItem.id : null, dayKey);
      } else {
        openModal(mItem);
      }
    });
    mTr.appendChild(tdDate);

    // 2. Time Cells (시간): Morning & Afternoon Rows
    const mTime = createTimeTd(mItem);
    mTr.appendChild(mTime);

    let aTime = null;
    if (aItem) {
      aTime = createTimeTd(aItem);
      aTr.appendChild(aTime);
    }

    // Helper Functions for Merging
    const isSameRegion = aItem && (mItem.region === aItem.region) && (mItem.region !== '');
    const isSameClinic = aItem && (mItem.clinic === aItem.clinic) && (mItem.clinic !== '');
    const isSameTrans = aItem && (mItem.transStatus === aItem.transStatus) && (mItem.transDetail === aItem.transDetail) && (mItem.transStatus || mItem.transDetail);
    const isSameHr = aItem && (mItem.hrStatus === aItem.hrStatus) && (mItem.hrDetail === aItem.hrDetail) && (mItem.hrStatus || mItem.hrDetail);
    const isSameOt = aItem && (mItem.otStatus === aItem.otStatus) && (mItem.otDetail === aItem.otDetail) && (mItem.otStatus || mItem.otDetail);

    // 3. Region Cells
    if (isSameRegion) {
      const tdReg = createRegionTd(mItem, aItem, true);
      tdReg.rowSpan = 2;
      tdReg.classList.add('cell-day-end-border');
      mTr.appendChild(tdReg);
    } else {
      mTr.appendChild(createRegionTd(mItem));
      if (aItem) aTr.appendChild(createRegionTd(aItem));
    }

    // 4. Clinic Cells
    if (isSameClinic) {
      const tdClin = createClinicTd(mItem, aItem, true);
      tdClin.rowSpan = 2;
      tdClin.classList.add('cell-day-end-border');
      mTr.appendChild(tdClin);
    } else {
      mTr.appendChild(createClinicTd(mItem));
      if (aItem) aTr.appendChild(createClinicTd(aItem));
    }

    // 5. Transport Cells
    if (isSameTrans) {
      const tdTrn = createTransTd(mItem, aItem, true);
      tdTrn.rowSpan = 2;
      tdTrn.classList.add('cell-day-end-border');
      mTr.appendChild(tdTrn);
    } else {
      mTr.appendChild(createTransTd(mItem));
      if (aItem) aTr.appendChild(createTransTd(aItem));
    }

    // 6. HR Cells
    if (isSameHr) {
      const tdH = createHrTd(mItem, aItem, true);
      tdH.rowSpan = 2;
      tdH.classList.add('cell-day-end-border');
      mTr.appendChild(tdH);
    } else {
      mTr.appendChild(createHrTd(mItem));
      if (aItem) aTr.appendChild(createHrTd(aItem));
    }

    // 7. Overtime Cells
    if (isSameOt) {
      const tdO = createOtTd(mItem, aItem, true);
      tdO.rowSpan = 2;
      tdO.classList.add('cell-day-end-border');
      mTr.appendChild(tdO);
    } else {
      mTr.appendChild(createOtTd(mItem));
      if (aItem) aTr.appendChild(createOtTd(aItem));
    }

    scheduleBody.appendChild(mTr);
    if (aItem) scheduleBody.appendChild(aTr);
  }
}

function checkFilterMatch(item) {
  if (currentFilter === 'jinju' && item.region !== '진주') return false;
  if (currentFilter === 'seoul' && item.region !== '서울') return false;
  if (currentFilter === 'transport' && !item.transStatus) return false;
  if (currentFilter === 'unpaid' && item.transStatus !== '결제X') return false;
  if (currentFilter === 'unapplied' && (item.hrStatus !== '신청X' && item.otStatus !== '신청X')) return false;
  if (currentFilter === 'unapproved' && (item.hrStatus !== '신청O' && item.otStatus !== '신청O')) return false;
  return true;
}

function createTimeTd(item) {
  const td = document.createElement('td');
  td.className = 'cell-time';
  td.textContent = item.time;
  const rowKey = `${item.id}_row`;

  if (isMultiEditMode && (isCellSelected(rowKey) || isCellSelected(`${item.id}_time`))) {
    td.classList.add('cell-selected');
  }

  td.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMultiEditMode) toggleRowSelection(item.id, rowKey);
    else openModal(item);
  });
  return td;
}

function attachSmartCellClick(td, mItem, aItem, field) {
  td.addEventListener('click', (e) => {
    e.stopPropagation();
    if (td.rowSpan === 2 && aItem) {
      const rect = td.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const isTopHalf = (clickY < (rect.height / 2));
      
      const targetItem = isTopHalf ? mItem : aItem;
      const targetKey = isTopHalf ? `${mItem.id}_${field}` : `${aItem.id}_${field}`;
      
      if (isMultiEditMode) {
        toggleCellKey(targetKey);
      } else {
        openModal(targetItem);
      }
    } else {
      const cellKey = `${mItem.id}_${field}`;
      if (isMultiEditMode) {
        toggleCellKey(cellKey);
      } else {
        openModal(mItem);
      }
    }
  });
}

function createRegionTd(item, aItem = null, isMerged = false) {
  const tdRegion = document.createElement('td');
  tdRegion.textContent = item.region || '-';
  if (item.region === '진주') tdRegion.className = 'region-jinju';
  else if (item.region === '서울') tdRegion.className = 'region-seoul';
  else if (item.region === '이동') tdRegion.className = 'region-move';
  else if (item.region) tdRegion.className = 'region-etc';
  
  const regionKey = `${item.id}_region`;
  if (isMultiEditMode && (isCellSelected(regionKey) || isCellSelected(`${item.id}_row`))) {
    tdRegion.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdRegion, item, aItem, 'region');
  } else {
    tdRegion.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiEditMode) toggleCellKey(regionKey);
      else openModal(item);
    });
  }
  return tdRegion;
}

function createClinicTd(item, aItem = null, isMerged = false) {
  const tdClinic = document.createElement('td');
  tdClinic.textContent = item.clinic || '-';
  if (item.clinic === 'O') tdClinic.className = 'clinic-o';
  else if (item.clinic === '행정') tdClinic.className = 'clinic-admin';
  else if (item.clinic === '휴가') tdClinic.className = 'clinic-vacation';
  else if (item.clinic && (item.clinic.includes('휴무') || item.clinic.includes('광복절') || item.clinic.includes('공휴일'))) tdClinic.className = 'clinic-holiday';
  else if (item.clinic && item.clinic !== '-') tdClinic.className = 'clinic-etc';

  const clinicKey = `${item.id}_clinic`;
  if (isMultiEditMode && (isCellSelected(clinicKey) || isCellSelected(`${item.id}_row`))) {
    tdClinic.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdClinic, item, aItem, 'clinic');
  } else {
    tdClinic.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiEditMode) toggleCellKey(clinicKey);
      else openModal(item);
    });
  }
  return tdClinic;
}

function createTransTd(item, aItem = null, isMerged = false) {
  const tdTrans = document.createElement('td');
  if (item.transStatus === '결제O') {
    tdTrans.innerHTML = `<span class="badge-paid-ok">결제O</span>`;
  } else if (item.transStatus === '결제X') {
    tdTrans.innerHTML = `<span class="badge-paid-no">결제X</span>`;
  } else {
    tdTrans.textContent = '-';
  }
  const transKey = `${item.id}_trans`;
  if (isMultiEditMode && (isCellSelected(transKey) || isCellSelected(`${item.id}_row`))) {
    tdTrans.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdTrans, item, aItem, 'trans');
  } else {
    tdTrans.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiEditMode) toggleCellKey(transKey);
      else openModal(item);
    });
  }
  return tdTrans;
}

function createHrTd(item, aItem = null, isMerged = false) {
  const tdHr = document.createElement('td');
  if (item.hrStatus === '승인O') {
    tdHr.innerHTML = `<span class="badge-paid-ok">승인O</span>`;
  } else if (item.hrStatus === '신청O') {
    tdHr.innerHTML = `<span class="badge-apply-ok">신청O</span>`;
  } else if (item.hrStatus === '신청X') {
    tdHr.innerHTML = `<span class="badge-paid-no">신청X</span>`;
  } else {
    tdHr.textContent = '-';
  }
  const hrKey = `${item.id}_hr`;
  if (isMultiEditMode && (isCellSelected(hrKey) || isCellSelected(`${item.id}_row`))) {
    tdHr.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdHr, item, aItem, 'hr');
  } else {
    tdHr.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiEditMode) toggleCellKey(hrKey);
      else openModal(item);
    });
  }
  return tdHr;
}

function createOtTd(item, aItem = null, isMerged = false) {
  const tdOt = document.createElement('td');
  if (item.otStatus === '승인O') {
    tdOt.innerHTML = `<span class="badge-paid-ok">승인O</span>`;
  } else if (item.otStatus === '신청O') {
    tdOt.innerHTML = `<span class="badge-apply-ok">신청O</span>`;
  } else if (item.otStatus === '신청X') {
    tdOt.innerHTML = `<span class="badge-paid-no">신청X</span>`;
  } else {
    tdOt.textContent = '-';
  }
  const otKey = `${item.id}_ot`;
  if (isMultiEditMode && (isCellSelected(otKey) || isCellSelected(`${item.id}_row`))) {
    tdOt.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdOt, item, aItem, 'ot');
  } else {
    tdOt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMultiEditMode) toggleCellKey(otKey);
      else openModal(item);
    });
  }
  return tdOt;
}

// Toggle Full Day Selection (Morning + Afternoon) & Cascading Clean
function toggleFullDaySelection(mId, aId, dayKey) {
  const mRowKey = `${mId}_row`;
  const aRowKey = `${aId}_row`;

  const isDaySelected = isCellSelected(dayKey) || isCellSelected(mRowKey) || (aId && isCellSelected(aRowKey));

  if (isDaySelected) {
    selectedCells = selectedCells.filter(k => {
      const id = parseInt(k.split('_')[0]);
      return id !== mId && id !== aId && k !== dayKey;
    });
  } else {
    selectedCells.push(dayKey);
    selectedCells.push(mRowKey);
    if (aId) selectedCells.push(aRowKey);
  }
  selectedCountLabel.textContent = `${selectedCells.length}개 선택됨`;
  renderTable();
}

// Toggle Single Time Row Selection & Cascading Sub-Cell Clean
function toggleRowSelection(id, rowKey) {
  const hasSubCells = selectedCells.some(k => k.startsWith(`${id}_`));

  if (hasSubCells) {
    selectedCells = selectedCells.filter(k => !k.startsWith(`${id}_`));
  } else {
    selectedCells.push(rowKey);
  }

  selectedCountLabel.textContent = `${selectedCells.length}개 선택됨`;
  renderTable();
}

// Open Edit Modal
function openModal(item) {
  activeItem = item;
  modalDateTitle.textContent = `${item.date} ${item.time} 일정 상세`;

  const standardRegions = ['서울', '진주', '이동'];
  if (standardRegions.includes(item.region)) {
    updateBtnGroup(regionBtnGroup, item.region);
    customRegionInput.classList.add('hidden');
    customRegionInput.value = '';
  } else {
    updateBtnGroup(regionBtnGroup, '기타');
    customRegionInput.classList.remove('hidden');
    customRegionInput.value = item.region || '';
  }

  const standardClinics = ['O', '행정', '휴가'];
  if (standardClinics.includes(item.clinic)) {
    updateBtnGroup(clinicBtnGroup, item.clinic);
    customClinicInput.classList.add('hidden');
    customClinicInput.value = '';
  } else {
    updateBtnGroup(clinicBtnGroup, '기타');
    customClinicInput.classList.remove('hidden');
    customClinicInput.value = item.clinic || '';
  }

  updateToggleGroup(transStatusToggle, item.transStatus || '');
  updateToggleGroup(hrStatusToggle, item.hrStatus || '');
  updateToggleGroup(otStatusToggle, item.otStatus || '');

  // Section Parsings
  parseSectionField(item.transDetail, standardTransCategories, transSelectCategory, customTransWrapper, customTransCategoryInput, transDetailInput);
  parseSectionField(item.hrDetail, standardHrCategories, hrSelectCategory, customHrWrapper, customHrCategoryInput, hrDetailInput);
  parseSectionField(item.otDetail, standardOtCategories, otSelectCategory, customOtWrapper, customOtCategoryInput, otDetailInput);

  modalOverlay.classList.add('active');
}

function closeModal() {
  modalOverlay.classList.remove('active');
}

// Open Summary Collector Modal
// Open Summary Collector Modal Across All 1-Year Schedules
function openSummaryModal(type) {
  summaryListContainer.innerHTML = '';

  const allScheduleItems = [];
  allWeeksData.forEach(wObj => {
    if (wObj.items && Array.isArray(wObj.items)) {
      const wName = wObj.title.split(' (')[0];
      wObj.items.forEach(item => {
        allScheduleItems.push({
          ...item,
          weekTitleName: wName
        });
      });
    }
  });

  let filtered = [];

  if (type === 'unpaid') {
    summaryModalTitle.textContent = '🚨 전체 미결제 모아보기';
    filtered = allScheduleItems.filter(d => d.transStatus === '결제X');
  } else if (type === 'unapplied') {
    summaryModalTitle.textContent = '📋 전체 미신청 모아보기';
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청X' || d.otStatus === '신청X');
  } else if (type === 'unapproved') {
    summaryModalTitle.textContent = '⏳ 전체 미승인 (승인대기) 모아보기';
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청O' || d.otStatus === '신청O');
  }

  if (filtered.length === 0) {
    summaryListContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#64748B; font-size:13px;">해당하는 일정 항목이 없습니다. 🎉</div>`;
  } else {
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'summary-item-card';

      let statusBadgeHtml = '';
      let descText = '';

      if (type === 'unpaid') {
        statusBadgeHtml = `<span class="badge-paid-no">결제X</span>`;
        descText = item.transDetail || '교통 미결제 건';
      } else if (type === 'unapplied') {
        statusBadgeHtml = `<span class="badge-paid-no">신청X</span>`;
        descText = item.hrDetail || item.otDetail || '국인체/수당 미신청';
      } else if (type === 'unapproved') {
        statusBadgeHtml = `<span class="badge-apply-ok">신청O</span>`;
        descText = item.hrDetail || item.otDetail || '승인 대기 중';
      }

      card.innerHTML = `
        <div class="summary-item-left">
          <div class="summary-item-date">${item.weekTitleName} ${item.date} ${item.time} (${item.region || '-'})</div>
          <div class="summary-item-desc">${descText}</div>
        </div>
        <div>${statusBadgeHtml}</div>
      `;

      card.addEventListener('click', () => {
        closeSummaryModal();
        const targetWeekIdx = allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === item.id && it.date === item.date));
        if (targetWeekIdx !== -1) {
          loadWeekData(targetWeekIdx);
        }
        openModal(item);
      });

      summaryListContainer.appendChild(card);
    });
  }

  summaryModalOverlay.classList.add('active');
}

function closeSummaryModal() {
  summaryModalOverlay.classList.remove('active');
}

function updateBtnGroup(groupElem, activeVal) {
  const btns = groupElem.querySelectorAll('.option-btn');
  btns.forEach(btn => {
    if (activeVal && btn.dataset.val === activeVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function updateToggleGroup(toggleElem, activeVal) {
  const btns = toggleElem.querySelectorAll('.status-toggle-btn');
  btns.forEach(btn => {
    if (activeVal && btn.dataset.val === activeVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function saveModalToActiveItem() {
  if (!activeItem) return;

  const activeRegionBtn = regionBtnGroup.querySelector('.option-btn.active');
  if (activeRegionBtn) {
    if (activeRegionBtn.dataset.val === '기타') {
      activeItem.region = customRegionInput.value.trim() || '기타';
    } else {
      activeItem.region = activeRegionBtn.dataset.val;
    }
  }

  const activeClinicBtn = clinicBtnGroup.querySelector('.option-btn.active');
  if (activeClinicBtn) {
    if (activeClinicBtn.dataset.val === '기타') {
      activeItem.clinic = customClinicInput.value.trim() || '기타';
    } else {
      activeItem.clinic = activeClinicBtn.dataset.val;
    }
  }

  activeItem.transStatus = transStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || '';
  activeItem.transDetail = assembleSectionField(transSelectCategory, customTransWrapper, customTransCategoryInput, transDetailInput);

  activeItem.hrStatus = hrStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || '';
  activeItem.hrDetail = assembleSectionField(hrSelectCategory, customHrWrapper, customHrCategoryInput, hrDetailInput);

  activeItem.otStatus = otStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || '';
  activeItem.otDetail = assembleSectionField(otSelectCategory, customOtWrapper, customOtCategoryInput, otDetailInput);

  syncToGoogleSheets();
}

function initEvents() {
  // Week Navigation Events
  prevWeekBtn.addEventListener('click', () => {
    if (currentWeekIndex > 0) loadWeekData(currentWeekIndex - 1);
  });
  nextWeekBtn.addEventListener('click', () => {
    if (currentWeekIndex < allWeeksData.length - 1) loadWeekData(currentWeekIndex + 1);
  });
  todayBtn.addEventListener('click', () => {
    loadWeekData(getTodayWeekIndex()); // Auto return to actual Today's Week!
  });

  const manualSyncBtn = document.getElementById('manualSyncBtn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      manualSyncBtn.classList.add('spinning');
      manualSyncBtn.disabled = true;
      try {
        await syncFromGoogleSheets();
      } finally {
        setTimeout(() => {
          manualSyncBtn.classList.remove('spinning');
          manualSyncBtn.disabled = false;
        }, 500);
      }
    });
  }

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  document.getElementById('closeSummaryModalBtn').addEventListener('click', closeSummaryModal);
  summaryModalOverlay.addEventListener('click', (e) => {
    if (e.target === summaryModalOverlay) closeSummaryModal();
  });

  setupBtnGroupEvents(regionBtnGroup, customRegionInput);
  setupBtnGroupEvents(clinicBtnGroup, customClinicInput);

  setupToggleEvents(transStatusToggle);
  setupToggleEvents(hrStatusToggle);
  setupToggleEvents(otStatusToggle);

  // Category Select & Reset Event Handlers
  transSelectCategory.addEventListener('change', () => {
    if (transSelectCategory.value === '기타') {
      transSelectCategory.classList.add('hidden');
      customTransWrapper.classList.remove('hidden');
      customTransCategoryInput.value = '';
      customTransCategoryInput.focus();
    }
  });
  resetTransCategoryBtn.addEventListener('click', () => {
    customTransWrapper.classList.add('hidden');
    transSelectCategory.classList.remove('hidden');
    transSelectCategory.value = '';
  });

  hrSelectCategory.addEventListener('change', () => {
    if (hrSelectCategory.value === '기타') {
      hrSelectCategory.classList.add('hidden');
      customHrWrapper.classList.remove('hidden');
      customHrCategoryInput.value = '';
      customHrCategoryInput.focus();
    }
  });
  resetHrCategoryBtn.addEventListener('click', () => {
    customHrWrapper.classList.add('hidden');
    hrSelectCategory.classList.remove('hidden');
    hrSelectCategory.value = '';
  });

  otSelectCategory.addEventListener('change', () => {
    if (otSelectCategory.value === '기타') {
      otSelectCategory.classList.add('hidden');
      customOtWrapper.classList.remove('hidden');
      customOtCategoryInput.value = '';
      customOtCategoryInput.focus();
    }
  });
  resetOtCategoryBtn.addEventListener('click', () => {
    customOtWrapper.classList.add('hidden');
    otSelectCategory.classList.remove('hidden');
    otSelectCategory.value = '';
  });

  // Feature 1: Copy Schedule Item inside Modal
  copyScheduleBtn.addEventListener('click', () => {
    if (!activeItem) return;
    saveModalToActiveItem();
    
    copiedScheduleData = {
      type: 'SINGLE_SLOT',
      data: JSON.parse(JSON.stringify(activeItem))
    };
    
    copiedItemLabel.textContent = `${activeItem.date} ${activeItem.time} 일정 전체`;
    copyBufferBar.classList.remove('hidden');
    closeModal();
  });

  // Clear Copy Buffer Event (✕ button)
  clearCopyBtn.addEventListener('click', () => {
    copiedScheduleData = null;
    copyBufferBar.classList.add('hidden');
  });

  // Feature 2: Apply to Weekdays (Tue~Thu)
  applyWeekdaysBtn.addEventListener('click', () => {
    if (!activeItem) return;
    saveModalToActiveItem();

    weekData.forEach(item => {
      if (item.date.includes('화') || item.date.includes('수') || (item.date.includes('목') && item.time === '오전')) {
        item.region = activeItem.region;
        item.clinic = activeItem.clinic;
      }
    });

    syncToGoogleSheets();
    renderTable();
    updateSummaryCounts();
    closeModal();
  });

  // Save Schedule Event
  document.getElementById('saveScheduleBtn').addEventListener('click', () => {
    saveModalToActiveItem();
    renderTable();
    updateSummaryCounts();
    closeModal();
  });

  // Feature 3: Toggle Multi-Edit Mode
  toggleMultiEditBtn.addEventListener('click', () => {
    isMultiEditMode = !isMultiEditMode;
    toggleMultiEditBtn.classList.toggle('active', isMultiEditMode);
    
    if (isMultiEditMode) {
      selectedCells = [];
      multiActionBar.classList.remove('hidden');
      selectedCountLabel.textContent = '0개 선택됨';
    } else {
      selectedCells = [];
      multiActionBar.classList.add('hidden');
    }
    renderTable();
  });

  // Smart Cell-Level Bulk Copy with Multi-Day Support
  bulkCopyBtn.addEventListener('click', () => {
    if (selectedCells.length === 0) {
      alert('복사할 날짜, 시간, 또는 세부 셀을 선택해주세요!');
      return;
    }

    // Collect all unique selected dates from selectedCells
    const selectedDayKeys = selectedCells.filter(k => k.endsWith('_day'));
    const dayDateSet = new Set();

    // Also collect dates where both morning and afternoon rows are selected
    for (let i = 0; i < weekData.length; i += 2) {
      const mId = weekData[i].id;
      const aId = weekData[i + 1] ? weekData[i + 1].id : null;
      const dKey = `${mId}_${aId}_day`;

      if (isCellSelected(dKey) || (isCellSelected(`${mId}_row`) && aId && isCellSelected(`${aId}_row`))) {
        dayDateSet.add(weekData[i].date);
      }
    }

    // Case 1: Multi-Day or Single Full Day Copy
    if (dayDateSet.size > 0) {
      const dayArray = Array.from(dayDateSet);
      const daysDataList = [];

      dayArray.forEach(dateStr => {
        const mItem = weekData.find(d => d.date === dateStr && d.time === '오전');
        const aItem = weekData.find(d => d.date === dateStr && d.time === '오후');
        if (mItem && aItem) {
          daysDataList.push({
            date: dateStr,
            morning: JSON.parse(JSON.stringify(mItem)),
            afternoon: JSON.parse(JSON.stringify(aItem))
          });
        }
      });

      if (daysDataList.length === 1) {
        copiedScheduleData = {
          type: 'FULL_DAY',
          dateLabel: daysDataList[0].date,
          morning: daysDataList[0].morning,
          afternoon: daysDataList[0].afternoon
        };
        copiedItemLabel.textContent = `${daysDataList[0].date} 하루 전체 일정`;
      } else {
        copiedScheduleData = {
          type: 'MULTI_DAYS',
          daysList: daysDataList
        };
        copiedItemLabel.textContent = `${daysDataList[0].date} 외 ${daysDataList.length - 1}개 날짜 전체 일정 (${daysDataList.length}개 일괄)`;
      }

      copyBufferBar.classList.remove('hidden');
      selectedCells = [];
      selectedCountLabel.textContent = '0개 선택됨';
      renderTable();
      return;
    }

    // Case 2: Single Slot / Specific Cell Copy
    const lastKey = selectedCells[selectedCells.length - 1];
    const parts = lastKey.split('_');
    const itemId = parseInt(parts[0]);
    const field = parts[1]; // 'region', 'clinic', 'trans', 'hr', 'ot', 'row'
    const targetItem = weekData.find(d => d.id === itemId);

    if (targetItem) {
      let detailLabel = `${targetItem.date} ${targetItem.time}`;

      if (field === 'region') {
        detailLabel += ` 지역 (${targetItem.region || '-'})`;
      } else if (field === 'clinic') {
        detailLabel += ` 진료 (${targetItem.clinic || '-'})`;
      } else if (field === 'trans') {
        const content = [targetItem.transStatus, targetItem.transDetail].filter(Boolean).join(' ');
        detailLabel += ` 교통 (${content || '-'})`;
      } else if (field === 'hr') {
        const content = [targetItem.hrStatus, targetItem.hrDetail].filter(Boolean).join(' ');
        detailLabel += ` 국인체 (${content || '-'})`;
      } else if (field === 'ot') {
        const content = [targetItem.otStatus, targetItem.otDetail].filter(Boolean).join(' ');
        detailLabel += ` 수당 (${content || '-'})`;
      } else {
        detailLabel += ` 일정 전체`;
      }

      copiedScheduleData = {
        type: 'SINGLE_SLOT',
        field: field,
        data: JSON.parse(JSON.stringify(targetItem))
      };

      copiedItemLabel.textContent = `${detailLabel}`;
      copyBufferBar.classList.remove('hidden');

      selectedCells = [];
      selectedCountLabel.textContent = '0개 선택됨';
      renderTable();
    }
  });

  // Smart Bulk Paste Action to Selected Cells (Supports Multi-Days)
  const handleBulkPaste = () => {
    if (!copiedScheduleData) {
      alert('복사된 일정이 없습니다. 복사할 항목을 먼저 선택 후 [📋 복사]를 누르세요!');
      return;
    }
    if (selectedCells.length === 0) {
      alert('붙여넣을 셀이나 날짜를 선택해주세요!');
      return;
    }

    // Collect target unique dates selected for paste
    const targetDates = Array.from(new Set(selectedCells.map(key => {
      const id = parseInt(key.split('_')[0]);
      const item = weekData.find(d => d.id === id);
      return item ? item.date : null;
    }).filter(Boolean)));

    if (copiedScheduleData.type === 'MULTI_DAYS') {
      const srcDays = copiedScheduleData.daysList;
      targetDates.forEach((targetDateStr, idx) => {
        const srcDay = srcDays[idx % srcDays.length]; // Cyclic mapping if target dates count differs
        weekData.forEach(item => {
          if (item.date === targetDateStr) {
            const src = (item.time === '오전') ? srcDay.morning : srcDay.afternoon;
            item.region = src.region;
            item.clinic = src.clinic;
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          }
        });
      });
    } else if (copiedScheduleData.type === 'FULL_DAY') {
      weekData.forEach(item => {
        if (targetDates.includes(item.date)) {
          const src = (item.time === '오전') ? copiedScheduleData.morning : copiedScheduleData.afternoon;
          item.region = src.region;
          item.clinic = src.clinic;
          item.transStatus = src.transStatus;
          item.transDetail = src.transDetail;
          item.hrStatus = src.hrStatus;
          item.hrDetail = src.hrDetail;
          item.otStatus = src.otStatus;
          item.otDetail = src.otDetail;
        }
      });
    } else {
      const src = copiedScheduleData.data;
      const srcField = copiedScheduleData.field;

      selectedCells.forEach(key => {
        const parts = key.split('_');
        const id = parseInt(parts[0]);
        const targetField = parts[1];
        const item = weekData.find(d => d.id === id);

        if (item) {
          if (targetField === 'row' || targetField === 'time' || !srcField || srcField === 'row') {
            item.region = src.region;
            item.clinic = src.clinic;
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          } else if (targetField === 'region' || srcField === 'region') item.region = src.region;
          else if (targetField === 'clinic' || srcField === 'clinic') item.clinic = src.clinic;
          else if (targetField === 'trans' || srcField === 'trans') {
            item.transStatus = src.transStatus;
            item.transDetail = src.transDetail;
          } else if (targetField === 'hr' || srcField === 'hr') {
            item.hrStatus = src.hrStatus;
            item.hrDetail = src.hrDetail;
          } else if (targetField === 'ot' || srcField === 'ot') {
            item.otStatus = src.otStatus;
            item.otDetail = src.otDetail;
          }
        }
      });
    }

    syncToGoogleSheets();
    selectedCells = [];
    selectedCountLabel.textContent = '0개 선택됨';
    renderTable();
    updateSummaryCounts();
  };

  bulkPasteBtn.addEventListener('click', handleBulkPaste);

  // Filter Bar Chips
  const filterChips = document.querySelectorAll('.filter-chip:not(#toggleMultiEditBtn)');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderTable();
    });
  });

  // 3 Alert Summary Buttons
  document.getElementById('unpaidSummaryBtn').addEventListener('click', () => openSummaryModal('unpaid'));
  document.getElementById('unappliedSummaryBtn').addEventListener('click', () => openSummaryModal('unapplied'));
  document.getElementById('unapprovedSummaryBtn').addEventListener('click', () => openSummaryModal('unapproved'));
}

function setupBtnGroupEvents(groupElem, customInputElem) {
  const btns = groupElem.querySelectorAll('.option-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        if (customInputElem) customInputElem.classList.add('hidden');
      } else {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.val === '기타' && customInputElem) {
          customInputElem.classList.remove('hidden');
          customInputElem.focus();
        } else if (customInputElem) {
          customInputElem.classList.add('hidden');
        }
      }
    });
  });
}

function setupToggleEvents(toggleElem) {
  const btns = toggleElem.querySelectorAll('.status-toggle-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
      } else {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
}
