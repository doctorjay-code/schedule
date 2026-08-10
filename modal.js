import { state, standardTransCategories, standardHrCategories, standardOtCategories, pastelPalette, saveColorSettings, resetColorSettings, getItemReason } from './state.js';
import { syncToGoogleSheets, syncColorSettingsToSheets } from './api.js';
import { renderMonthlyCalendar, isRedDate } from './render.js';

let renderTableFn = null;
export function setModalRenderCallback(fn) { renderTableFn = fn; }

let loadWeekDataFn = null;
export function setModalLoadWeekDataCallback(fn) { loadWeekDataFn = fn; }

// Helper to parse detail string into category & sub-detail
export function parseSectionField(fullStr, standardList, selectElem, wrapperElem, customInputElem, detailInputElem) {
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
    if (selectElem) {
      selectElem.value = matchedCat;
      selectElem.classList.remove('hidden');
    }
    if (wrapperElem) wrapperElem.classList.add('hidden');
    if (customInputElem) customInputElem.value = '';
    if (detailInputElem) detailInputElem.value = subText;
  } else if (subText) {
    if (selectElem) selectElem.classList.add('hidden');
    if (wrapperElem) wrapperElem.classList.remove('hidden');
    
    const spaceIdx = subText.indexOf(' ');
    if (spaceIdx > 0) {
      if (customInputElem) customInputElem.value = subText.substring(0, spaceIdx);
      if (detailInputElem) detailInputElem.value = subText.substring(spaceIdx + 1);
    } else {
      if (customInputElem) customInputElem.value = subText;
      if (detailInputElem) detailInputElem.value = '';
    }
  } else {
    if (selectElem) {
      selectElem.value = '';
      selectElem.classList.remove('hidden');
    }
    if (wrapperElem) wrapperElem.classList.add('hidden');
    if (customInputElem) customInputElem.value = '';
    if (detailInputElem) detailInputElem.value = '';
  }
}

// Helper to assemble category & detail
export function assembleSectionField(selectElem, wrapperElem, customInputElem, detailInputElem) {
  let catVal = '';
  if (selectElem && !selectElem.classList.contains('hidden')) {
    catVal = selectElem.value;
  } else if (customInputElem) {
    catVal = customInputElem.value.trim() || '기타';
  }

  const subVal = detailInputElem ? detailInputElem.value.trim() : '';
  if (catVal && subVal) return `${catVal} ${subVal}`;
  if (catVal) return catVal;
  return subVal;
}

// Open Edit Modal
export function openModal(item) {
  state.activeItem = item;
  const modalDateTitle = document.getElementById('modalDateTitle');
  const regionBtnGroup = document.getElementById('regionBtnGroup');
  const customRegionInput = document.getElementById('customRegionInput');
  const clinicBtnGroup = document.getElementById('clinicBtnGroup');
  const customClinicInput = document.getElementById('customClinicInput');
  const transStatusToggle = document.getElementById('transStatusToggle');
  const hrStatusToggle = document.getElementById('hrStatusToggle');
  const otStatusToggle = document.getElementById('otStatusToggle');
  const modalOverlay = document.getElementById('modalOverlay');

  const transSelectCategory = document.getElementById('transSelectCategory');
  const customTransWrapper = document.getElementById('customTransWrapper');
  const customTransCategoryInput = document.getElementById('customTransCategoryInput');
  const transDetailInput = document.getElementById('transDetailInput');

  const hrSelectCategory = document.getElementById('hrSelectCategory');
  const customHrWrapper = document.getElementById('customHrWrapper');
  const customHrCategoryInput = document.getElementById('customHrCategoryInput');
  const hrDetailInput = document.getElementById('hrDetailInput');

  const otSelectCategory = document.getElementById('otSelectCategory');
  const customOtWrapper = document.getElementById('customOtWrapper');
  const customOtCategoryInput = document.getElementById('customOtCategoryInput');
  const otDetailInput = document.getElementById('otDetailInput');

  if (modalDateTitle) modalDateTitle.textContent = `${item.date} ${item.time} 일정 상세`;

  const standardRegions = ['서울', '진주', '대구', '이동'];
  if (standardRegions.includes(item.region)) {
    if (regionBtnGroup) updateBtnGroup(regionBtnGroup, item.region);
    if (customRegionInput) {
      customRegionInput.classList.add('hidden');
      customRegionInput.value = '';
    }
  } else {
    if (regionBtnGroup) updateBtnGroup(regionBtnGroup, '기타');
    if (customRegionInput) {
      customRegionInput.classList.remove('hidden');
      customRegionInput.value = item.region || '';
    }
  }

  const standardClinics = ['O', '행정', '당직', '주말', '휴일', '당직OFF', '청원휴가', '연가', '위로휴가'];
  if (standardClinics.includes(item.clinic)) {
    if (clinicBtnGroup) updateBtnGroup(clinicBtnGroup, item.clinic);
    if (customClinicInput) {
      customClinicInput.classList.add('hidden');
      customClinicInput.value = '';
    }
  } else {
    if (clinicBtnGroup) updateBtnGroup(clinicBtnGroup, '기타');
    if (customClinicInput) {
      customClinicInput.classList.remove('hidden');
      customClinicInput.value = item.clinic || '';
    }
  }

  if (transStatusToggle) updateToggleGroup(transStatusToggle, item.transStatus || '');
  if (hrStatusToggle) updateToggleGroup(hrStatusToggle, item.hrStatus || '');
  if (otStatusToggle) updateToggleGroup(otStatusToggle, item.otStatus || '');

  const holidayStatusToggle = document.getElementById('holidayStatusToggle');
  const isHoliday = isRedDate(item);
  if (holidayStatusToggle) updateToggleGroup(holidayStatusToggle, isHoliday ? 'ON' : 'OFF');

  // Section Parsings
  parseSectionField(item.transDetail, standardTransCategories, transSelectCategory, customTransWrapper, customTransCategoryInput, transDetailInput);
  parseSectionField(item.hrDetail, standardHrCategories, hrSelectCategory, customHrWrapper, customHrCategoryInput, hrDetailInput);
  parseSectionField(item.otDetail, standardOtCategories, otSelectCategory, customOtWrapper, customOtCategoryInput, otDetailInput);

  if (modalOverlay) modalOverlay.classList.add('active');
}

export function closeModal() {
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) modalOverlay.classList.remove('active');
}

// Open Summary Collector Modal Across All Schedules
export function openSummaryModal(type) {
  const summaryListContainer = document.getElementById('summaryListContainer');
  const summaryModalTitle = document.getElementById('summaryModalTitle');
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');

  if (!summaryListContainer) return;
  summaryListContainer.innerHTML = '';

  const allScheduleItems = [];
  state.allWeeksData.forEach(wObj => {
    if (wObj.items && Array.isArray(wObj.items)) {
      const wName = wObj.title.split(' (')[0];
      wObj.items.forEach(item => {
        allScheduleItems.push({
          ...item,
          weekTitleName: wName,
          _original: item
        });
      });
    }
  });

  let filtered = [];

  if (type === 'unpaid') {
    if (summaryModalTitle) summaryModalTitle.textContent = '🚨 전체 미결제 모아보기';
    filtered = allScheduleItems.filter(d => d.transStatus === '결제X');
  } else if (type === 'unapplied') {
    if (summaryModalTitle) summaryModalTitle.textContent = '📋 전체 미신청 모아보기';
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청X' || d.otStatus === '신청X' || d.hrStatus === '미신청' || d.otStatus === '미신청');
  } else if (type === 'unapproved') {
    if (summaryModalTitle) summaryModalTitle.textContent = '⏳ 전체 미승인 (승인대기) 모아보기';
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청O' || d.otStatus === '신청O' || d.hrStatus === '미승인' || d.otStatus === '미승인');
  }

  if (filtered.length === 0) {
    summaryListContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#64748B; font-size:13px;">해당하는 일정 항목이 없습니다. 🎉</div>`;
  } else {
    if (type === 'unapplied' || type === 'unapproved') {
      const groupedByDateMap = new Map();

      filtered.forEach(item => {
        const reason = getItemReason(item, type);
        const groupKey = `${item.weekTitleName || ''}_${item.date}_${reason}`;
        if (!groupedByDateMap.has(groupKey)) {
          groupedByDateMap.set(groupKey, []);
        }
        groupedByDateMap.get(groupKey).push(item);
      });

      groupedByDateMap.forEach((itemList, groupKey) => {
        const firstItem = itemList[0];
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        let statusBadgeHtml = (type === 'unapplied')
          ? `<span class="badge-paid-no">미신청</span>`
          : `<span class="badge-apply-ok">승인대기</span>`;

        const reasonText = firstItem.hrDetail || firstItem.otDetail || (type === 'unapplied' ? '미신청 건' : '승인 대기 중');
        const timesText = itemList.map(it => it.time).join(', ');
        const descText = `[${timesText}] ${reasonText}`;

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${firstItem.date} (${firstItem.region || '-'})</div>
            <div class="summary-item-desc">${descText}</div>
          </div>
          <div>${statusBadgeHtml}</div>
        `;

        card.addEventListener('click', () => {
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === firstItem.id && it.date === firstItem.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(firstItem._original || firstItem);
        });

        summaryListContainer.appendChild(card);
      });
    } else {
      filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        let statusBadgeHtml = `<span class="badge-paid-no">결제X</span>`;
        let descText = item.transDetail || '교통 미결제 건';

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${item.date} ${item.time} (${item.region || '-'})</div>
            <div class="summary-item-desc">${descText}</div>
          </div>
          <div>${statusBadgeHtml}</div>
        `;

        card.addEventListener('click', () => {
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === item.id && it.date === item.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(item._original || item);
        });

        summaryListContainer.appendChild(card);
      });
    }
  }

  if (summaryModalOverlay) summaryModalOverlay.classList.add('active');
}

export function closeSummaryModal() {
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');
  if (summaryModalOverlay) summaryModalOverlay.classList.remove('active');
}

// Open Week Selector Modal
export function openWeekSelectModal() {
  const container = document.getElementById('weekSelectListContainer');
  const overlay = document.getElementById('weekSelectModalOverlay');

  if (!container || !state.allWeeksData || state.allWeeksData.length === 0) return;
  container.innerHTML = '';

  state.allWeeksData.forEach((wObj, index) => {
    const card = document.createElement('div');
    card.className = 'week-select-card';
    if (index === state.currentWeekIndex) {
      card.classList.add('active');
    }

    const fullTitle = wObj.title || '';
    const parts = fullTitle.split(' (');
    const weekName = parts[0] || '';
    const dateRange = parts[1] ? `(${parts[1]}` : '';

    const isCurrentBadge = (index === state.currentWeekIndex) ? `<span class="week-select-badge">현재 선택</span>` : '';

    card.innerHTML = `
      <div class="week-select-left">
        <div class="week-select-title">${weekName}</div>
        <div class="week-select-date">${dateRange}</div>
      </div>
      <div>${isCurrentBadge}</div>
    `;

    card.addEventListener('click', () => {
      closeWeekSelectModal();
      if (loadWeekDataFn) {
        loadWeekDataFn(index);
      }
    });

    container.appendChild(card);
  });

  if (overlay) {
    overlay.classList.add('active');

    // 바깥 화면(window) 이동 없이 모달 내부만 중앙으로 스크롤 계산
    const sheet = document.getElementById('weekSelectBottomSheet');
    requestAnimationFrame(() => {
      setTimeout(() => {
        const activeCard = container.querySelector('.week-select-card.active');
        if (activeCard && sheet) {
          const cardTop = activeCard.offsetTop;
          const cardHeight = activeCard.offsetHeight;
          const sheetHeight = sheet.clientHeight;
          sheet.scrollTop = cardTop - (sheetHeight / 2) + (cardHeight / 2);
        }
      }, 50);
    });
  }
}

export function closeWeekSelectModal() {
  const overlay = document.getElementById('weekSelectModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

export function updateBtnGroup(groupElem, activeVal) {
  const btns = groupElem.querySelectorAll('.option-btn');
  btns.forEach(btn => {
    if (activeVal && btn.dataset.val === activeVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

export function updateToggleGroup(toggleElem, activeVal) {
  if (toggleElem.classList.contains('single-status-toggle')) {
    const isOn = activeVal === 'ON';
    toggleElem.dataset.val = isOn ? 'ON' : 'OFF';
    toggleElem.textContent = isOn ? 'ON' : 'OFF';
    toggleElem.classList.toggle('active', isOn);
    toggleElem.setAttribute('aria-pressed', String(isOn));
    return;
  }

  const btns = toggleElem.querySelectorAll('.status-toggle-btn');
  btns.forEach(btn => {
    if (activeVal && btn.dataset.val === activeVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

export function saveModalToActiveItem() {
  if (!state.activeItem) return;

  const regionBtnGroup = document.getElementById('regionBtnGroup');
  const customRegionInput = document.getElementById('customRegionInput');
  const clinicBtnGroup = document.getElementById('clinicBtnGroup');
  const customClinicInput = document.getElementById('customClinicInput');

  const transStatusToggle = document.getElementById('transStatusToggle');
  const transSelectCategory = document.getElementById('transSelectCategory');
  const customTransWrapper = document.getElementById('customTransWrapper');
  const customTransCategoryInput = document.getElementById('customTransCategoryInput');
  const transDetailInput = document.getElementById('transDetailInput');

  const hrStatusToggle = document.getElementById('hrStatusToggle');
  const hrSelectCategory = document.getElementById('hrSelectCategory');
  const customHrWrapper = document.getElementById('customHrWrapper');
  const customHrCategoryInput = document.getElementById('customHrCategoryInput');
  const hrDetailInput = document.getElementById('hrDetailInput');

  const otStatusToggle = document.getElementById('otStatusToggle');
  const otSelectCategory = document.getElementById('otSelectCategory');
  const customOtWrapper = document.getElementById('customOtWrapper');
  const customOtCategoryInput = document.getElementById('customOtCategoryInput');
  const otDetailInput = document.getElementById('otDetailInput');

  if (regionBtnGroup) {
    const activeRegionBtn = regionBtnGroup.querySelector('.option-btn.active');
    if (activeRegionBtn) {
      if (activeRegionBtn.dataset.val === '기타' && customRegionInput) {
        state.activeItem.region = customRegionInput.value.trim() || '기타';
      } else {
        state.activeItem.region = activeRegionBtn.dataset.val;
      }
    } else {
      state.activeItem.region = '';
    }
  }

  if (clinicBtnGroup) {
    const activeClinicBtn = clinicBtnGroup.querySelector('.option-btn.active');
    if (activeClinicBtn) {
      if (activeClinicBtn.dataset.val === '기타' && customClinicInput) {
        state.activeItem.clinic = customClinicInput.value.trim() || '기타';
      } else {
        state.activeItem.clinic = activeClinicBtn.dataset.val;
      }
    } else {
      state.activeItem.clinic = '';
    }
  }

  if (transStatusToggle) {
    state.activeItem.transStatus = transStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || '';
  }
  state.activeItem.transDetail = assembleSectionField(transSelectCategory, customTransWrapper, customTransCategoryInput, transDetailInput);

  if (hrStatusToggle) {
    state.activeItem.hrStatus = hrStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || '';
  }
  state.activeItem.hrDetail = assembleSectionField(hrSelectCategory, customHrWrapper, customHrCategoryInput, hrDetailInput);

  if (otStatusToggle) {
    state.activeItem.otStatus = otStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || '';
  }
  state.activeItem.otDetail = assembleSectionField(otSelectCategory, customOtWrapper, customOtCategoryInput, otDetailInput);

  const holidayStatusToggle = document.getElementById('holidayStatusToggle');
  if (holidayStatusToggle) {
    const activeVal = holidayStatusToggle.classList.contains('single-status-toggle')
      ? holidayStatusToggle.dataset.val
      : holidayStatusToggle.querySelector('.status-toggle-btn.active')?.dataset.val || 'OFF';
    const isHolidayVal = (activeVal === 'ON');
    state.activeItem.isHoliday = isHolidayVal;

    const targetDate = state.activeItem.date;
    if (targetDate) {
      state.allWeeksData.forEach(wObj => {
        if (wObj.items && Array.isArray(wObj.items)) {
          wObj.items.forEach(item => {
            if (item.date === targetDate) {
              item.isHoliday = isHolidayVal;
              item.holidayOverride = isHolidayVal;
            }
          });
        }
      });
    }
  }

  syncToGoogleSheets();
}

export function setupBtnGroupEvents(groupElem, customInputElem) {
  if (!groupElem) return;
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

export function setupToggleEvents(toggleElem) {
  if (!toggleElem) return;
  if (toggleElem.classList.contains('single-status-toggle')) {
    toggleElem.addEventListener('click', () => {
      const nextVal = toggleElem.dataset.val === 'ON' ? 'OFF' : 'ON';
      updateToggleGroup(toggleElem, nextVal);
    });
    return;
  }

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

// ----------------------------------------------------
// Color Settings Modal Functionalities
// ----------------------------------------------------
let tempSelectedNewRuleColor = pastelPalette[0];

export function openColorSettingsModal() {
  const colorSettingsModalOverlay = document.getElementById('colorSettingsModalOverlay');
  if (!colorSettingsModalOverlay) return;

  renderPaletteChipsRows();
  renderNewRuleColorPicker();
  renderWordRulesList();

  colorSettingsModalOverlay.classList.add('active');
}

export function closeColorSettingsModal() {
  const colorSettingsModalOverlay = document.getElementById('colorSettingsModalOverlay');
  if (colorSettingsModalOverlay) colorSettingsModalOverlay.classList.remove('active');
}

export function renderPaletteChipsRows() {
  const chipContainers = document.querySelectorAll('.palette-chips-row[data-target-type]');
  
  chipContainers.forEach(container => {
    container.innerHTML = '';
    const type = container.dataset.targetType; // 'region' or 'clinic'
    const key = container.dataset.targetKey;   // e.g. '진주', 'O'

    const currentColor = (type === 'region')
      ? (state.colorSettings.regionColors[key] || '#FFEDD5')
      : (state.colorSettings.clinicColors[key] || '#F1F5F9');

    pastelPalette.forEach(hex => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      if (currentColor.toLowerCase() === hex.toLowerCase()) {
        chip.classList.add('selected');
      }
      chip.style.backgroundColor = hex;

      chip.addEventListener('click', () => {
        if (type === 'region') state.colorSettings.regionColors[key] = hex;
        else if (type === 'clinic') state.colorSettings.clinicColors[key] = hex;

        container.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });

      container.appendChild(chip);
    });
  });
}

export function renderNewRuleColorPicker() {
  const container = document.getElementById('newRuleColorRow');
  if (!container) return;
  container.innerHTML = '';

  pastelPalette.forEach(hex => {
    const chip = document.createElement('div');
    chip.className = 'color-chip';
    if (tempSelectedNewRuleColor.toLowerCase() === hex.toLowerCase()) {
      chip.classList.add('selected');
    }
    chip.style.backgroundColor = hex;

    chip.addEventListener('click', () => {
      tempSelectedNewRuleColor = hex;
      container.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });

    container.appendChild(chip);
  });
}

export function renderWordRulesList() {
  const container = document.getElementById('wordRulesListContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!state.colorSettings.wordRules || state.colorSettings.wordRules.length === 0) {
    container.innerHTML = `<span style="font-size:11px; color:#94A3B8;">등록된 단어 규칙이 없습니다.</span>`;
    return;
  }

  state.colorSettings.wordRules.forEach(rule => {
    const tag = document.createElement('div');
    tag.className = 'word-rule-tag';
    tag.style.backgroundColor = rule.color;
    tag.style.color = '#1E293B';

    tag.innerHTML = `
      <span>${rule.word}</span>
      <button class="delete-rule-btn" title="규칙 삭제">✕</button>
    `;

    tag.querySelector('.delete-rule-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.colorSettings.wordRules = state.colorSettings.wordRules.filter(r => r.id !== rule.id);
      renderWordRulesList();
    });

    container.appendChild(tag);
  });
}

export function setupColorSettingsEvents() {
  const openBtn = document.getElementById('openColorSettingsBtn');
  const closeBtn = document.getElementById('closeColorSettingsModalBtn');
  const overlay = document.getElementById('colorSettingsModalOverlay');
  const addRuleBtn = document.getElementById('addWordRuleBtn');
  const newRuleWordInput = document.getElementById('newRuleWordInput');
  const resetBtn = document.getElementById('resetColorSettingsBtn');
  const saveBtn = document.getElementById('saveColorSettingsBtn');

  if (openBtn) openBtn.addEventListener('click', openColorSettingsModal);
  if (closeBtn) closeBtn.addEventListener('click', closeColorSettingsModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeColorSettingsModal();
    });
  }

  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', () => {
      const word = newRuleWordInput ? newRuleWordInput.value.trim() : '';
      if (!word) {
        alert('규칙으로 등록할 단어를 입력해주세요!');
        return;
      }

      state.colorSettings.wordRules.push({
        id: Date.now(),
        word: word,
        color: tempSelectedNewRuleColor
      });

      if (newRuleWordInput) newRuleWordInput.value = '';
      renderWordRulesList();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('모든 색상 설정을 기본값으로 초기화하시겠습니까?')) {
        resetColorSettings();
        syncColorSettingsToSheets();
        renderPaletteChipsRows();
        renderWordRulesList();
        if (renderTableFn) renderTableFn();
        renderMonthlyCalendar();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveColorSettings();
      syncColorSettingsToSheets();
      if (renderTableFn) renderTableFn();
      renderMonthlyCalendar();
      closeColorSettingsModal();
    });
  }
}

// ----------------------------------------------------
// Statistics Report Modal Functionalities
// ----------------------------------------------------
let statsCurrentRange = 'all'; // 'all', 'monthly', 'weekly', 'custom'
let statsSelectedSubPeriod = ''; // selected week or month title
let statsCustomStartDate = '';
let statsCustomEndDate = '';

export function openStatsModal() {
  const overlay = document.getElementById('statsModalOverlay');
  if (!overlay) return;

  setupStatsFilterTabs();
  renderStatsReport();
  overlay.classList.add('active');
}

export function closeStatsModal() {
  const overlay = document.getElementById('statsModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

export function setupStatsModalEvents() {
  const openBtn = document.getElementById('openStatsModalBtn');
  const closeBtn = document.getElementById('closeStatsModalBtn');
  const overlay = document.getElementById('statsModalOverlay');
  const applyCustomBtn = document.getElementById('applyStatsCustomRangeBtn');
  const subSelectElem = document.getElementById('statsSubSelectElem');

  if (openBtn) openBtn.addEventListener('click', openStatsModal);
  if (closeBtn) closeBtn.addEventListener('click', closeStatsModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeStatsModal();
    });
  }

  if (subSelectElem) {
    subSelectElem.addEventListener('change', () => {
      statsSelectedSubPeriod = subSelectElem.value;
      renderStatsReport();
    });
  }

  if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', () => {
      const startInput = document.getElementById('statsStartDateInput');
      const endInput = document.getElementById('statsEndDateInput');
      statsCustomStartDate = startInput ? startInput.value : '';
      statsCustomEndDate = endInput ? endInput.value : '';
      renderStatsReport();
    });
  }
}

function setupStatsFilterTabs() {
  const tabs = document.querySelectorAll('.stats-filter-tab');
  const subWrapper = document.getElementById('statsSubSelectWrapper');
  const subSelect = document.getElementById('statsSubSelectElem');
  const customWrapper = document.getElementById('statsCustomRangeWrapper');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      statsCurrentRange = tab.dataset.range;

      if (statsCurrentRange === 'all') {
        if (subWrapper) subWrapper.classList.add('hidden');
        if (customWrapper) customWrapper.classList.add('hidden');
      } else if (statsCurrentRange === 'monthly') {
        if (customWrapper) customWrapper.classList.add('hidden');
        if (subWrapper && subSelect) {
          subWrapper.classList.remove('hidden');
          const monthsMap = new Map();
          const defaultY = state.currentMonthYear.year || new Date().getFullYear();

          state.allWeeksData.forEach(w => {
            if (w.items && w.items[0] && w.items[0].date) {
              const parts = w.items[0].date.match(/(\d+)/g);
              if (parts && parts.length >= 2) {
                const m = parseInt(parts[parts.length - 2], 10);
                const y = (parts.length >= 3) ? parseInt(parts[parts.length - 3], 10) : defaultY;
                const key = `${y}-${m}`;
                const label = `${y}년 ${m}월`;
                monthsMap.set(key, label);
              }
            }
          });

          subSelect.innerHTML = Array.from(monthsMap.entries()).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

          // Auto-select active/current month dynamically
          const curY = state.currentMonthYear.year || new Date().getFullYear();
          const curM = state.currentMonthYear.month || (new Date().getMonth() + 1);
          const currentKey = `${curY}-${curM}`;

          if (monthsMap.has(currentKey)) {
            subSelect.value = currentKey;
          }
          statsSelectedSubPeriod = subSelect.value;
        }
      } else if (statsCurrentRange === 'weekly') {
        if (customWrapper) customWrapper.classList.add('hidden');
        if (subWrapper && subSelect) {
          subWrapper.classList.remove('hidden');
          subSelect.innerHTML = state.allWeeksData.map((w, idx) => {
            const title = w.title.split(' (')[0];
            return `<option value="${idx}">${title}</option>`;
          }).join('');

          // Auto-select active week index dynamically
          if (state.currentWeekIndex !== undefined && state.currentWeekIndex >= 0 && state.currentWeekIndex < state.allWeeksData.length) {
            subSelect.value = state.currentWeekIndex.toString();
          }
          statsSelectedSubPeriod = subSelect.value;
        }
      } else if (statsCurrentRange === 'custom') {
        if (subWrapper) subWrapper.classList.add('hidden');
        if (customWrapper) customWrapper.classList.remove('hidden');
      }
      renderStatsReport();
    });
  });
}

function parseHoursFromDetail(detailStr) {
  if (!detailStr) return 0;
  const m = detailStr.match(/(\d+(\.\d+)?)\s*시간/);
  if (m) return parseFloat(m[1]);
  const d = detailStr.match(/(\d+)\s*일/);
  if (d) return parseFloat(d[1]) * 8;
  return 0;
}

function formatOtHoursString(totalHours) {
  if (!totalHours || totalHours <= 0) return '0시간';
  const rounded = Math.round(totalHours * 10) / 10;
  return `${rounded}시간`;
}

function formatHoursToDaysString(totalHours) {
  if (!totalHours || totalHours <= 0) return '0시간';
  const days = Math.floor(totalHours / 8);
  const hours = Math.round((totalHours % 8) * 10) / 10;

  if (days > 0 && hours > 0) {
    return `${days}일 ${hours}시간`;
  } else if (days > 0 && hours === 0) {
    return `${days}일`;
  } else {
    return `${hours}시간`;
  }
}

// Calculate Required Clinic Sessions for a Weekly Period
function calculateRequiredClinicSessions(weekEntries) {
  let availableSessions = 0;

  const weekdayEntries = weekEntries.filter(e => {
    const dStr = e.item ? (e.item.date || '') : '';
    return !dStr.includes('(토)') && !dStr.includes('(일)');
  });

  weekdayEntries.forEach(e => {
    const item = e.item || {};
    const hrStr = item.hrDetail || '';
    const otStr = item.otDetail || '';
    const combined = `${item.clinic || ''} ${hrStr} ${otStr}`;

    const isPetitionLeave = combined.includes('청원휴가');
    // 시간 단위 연가 (예: "연가 1시간", "연가 2시간" 등)는 세션을 차감하지 않음
    const isHourlyLeave = combined.includes('연가') && /\d+\s*시간/.test(combined);

    // 휴일 조건: '휴무', '공휴일', '휴가', 또는 시간 단위가 아닌 전일/일반 '연가'
    let isHoliday = combined.includes('휴무') || combined.includes('공휴일') || combined.includes('휴가');
    if (combined.includes('연가') && !isHourlyLeave) {
      isHoliday = true;
    }

    if ((!isHoliday || isPetitionLeave) || isHourlyLeave) {
      availableSessions++;
    }
  });

  if (availableSessions >= 9) return 6;
  if (availableSessions === 8) return 5;
  if (availableSessions >= 6) return 4;
  if (availableSessions >= 4) return 3;
  if (availableSessions >= 2) return 2;
  return availableSessions;
}

export function renderStatsReport() {
  const regionContainer = document.getElementById('statsRegionContent');
  const clinicHrContainer = document.getElementById('statsClinicHrContent');
  const transportContainer = document.getElementById('statsTransportContent');

  if (!regionContainer || !clinicHrContainer || !transportContainer) return;

  const filteredItems = [];
  const allItemsFlat = [];

  state.allWeeksData.forEach((wObj, wIdx) => {
    if (wObj.items && Array.isArray(wObj.items)) {
      wObj.items.forEach((item, itemIdx) => {
        allItemsFlat.push({ item, wObj, wIdx, itemIdx });
      });
    }
  });

  allItemsFlat.forEach(entry => {
    const { item, wIdx } = entry;

    if (statsCurrentRange === 'all') {
      filteredItems.push(entry);
    } else if (statsCurrentRange === 'weekly') {
      if (wIdx === parseInt(statsSelectedSubPeriod, 10)) {
        filteredItems.push(entry);
      }
    } else if (statsCurrentRange === 'monthly') {
      const partsKey = (statsSelectedSubPeriod || '').split('-');
      const targetY = parseInt(partsKey[0], 10);
      const targetM = parseInt(partsKey[1], 10);
      const defaultY = state.currentMonthYear.year || new Date().getFullYear();

      if (item.date) {
        const parts = item.date.match(/(\d+)/g);
        if (parts && parts.length >= 2) {
          const itemM = parseInt(parts[parts.length - 2], 10);
          const itemY = (parts.length >= 3) ? parseInt(parts[parts.length - 3], 10) : defaultY;
          if (itemM === targetM && (isNaN(targetY) || itemY === targetY)) {
            filteredItems.push(entry);
          }
        }
      }
    } else if (statsCurrentRange === 'custom') {
      if (statsCustomStartDate && statsCustomEndDate && item.date) {
        const parts = item.date.match(/(\d+)/g);
        if (parts && parts.length >= 2) {
          const m = parseInt(parts[parts.length - 2], 10);
          const d = parseInt(parts[parts.length - 1], 10);
          const curY = state.currentMonthYear.year || new Date().getFullYear();
          const itemDateObj = new Date(curY, m - 1, d);
          const startDateObj = new Date(statsCustomStartDate);
          const endDateObj = new Date(statsCustomEndDate);
          if (itemDateObj >= startDateObj && itemDateObj <= endDateObj) {
            filteredItems.push(entry);
          }
        }
      } else {
        filteredItems.push(entry);
      }
    }
  });

  // ----------------------------------------------------
  // SECTION 1: Region Ratio Calculation
  // ----------------------------------------------------
  const regionCounts = { '진주': 0, '서울': 0 };
  const etcDetailsMap = {};
  let totalSlotValue = 0;

  filteredItems.forEach(entry => {
    const { item } = entry;
    const reg = item.region || '';

    if (reg === '이동') {
      const flatIdx = allItemsFlat.findIndex(e => e.item.id === item.id && e.item.date === item.date && e.item.time === item.time);
      const prevEntry = (flatIdx > 0) ? allItemsFlat[flatIdx - 1] : null;
      const nextEntry = (flatIdx < allItemsFlat.length - 1) ? allItemsFlat[flatIdx + 1] : null;

      const prevReg = (prevEntry && prevEntry.item.region && prevEntry.item.region !== '이동') ? prevEntry.item.region : '진주';
      const nextReg = (nextEntry && nextEntry.item.region && nextEntry.item.region !== '이동') ? nextEntry.item.region : '서울';

      [prevReg, nextReg].forEach(r => {
        if (r === '진주' || r === '서울') {
          regionCounts[r] = (regionCounts[r] || 0) + 0.5;
        } else {
          etcDetailsMap[r] = (etcDetailsMap[r] || 0) + 0.5;
        }
      });
      totalSlotValue += 1;
    } else if (reg === '진주' || reg === '서울') {
      regionCounts[reg] = (regionCounts[reg] || 0) + 1;
      totalSlotValue += 1;
    } else if (reg) {
      etcDetailsMap[reg] = (etcDetailsMap[reg] || 0) + 1;
      totalSlotValue += 1;
    }
  });

  regionContainer.innerHTML = '';
  if (totalSlotValue === 0) {
    regionContainer.innerHTML = `<div class="stats-sub-item">해당 기간의 체류 데이터가 없습니다.</div>`;
  } else {
    Object.keys(regionCounts).forEach(rKey => {
      const count = regionCounts[rKey];
      const pct = ((count / totalSlotValue) * 100).toFixed(1);
      const daysVal = (count / 2).toFixed(1);
      const row = document.createElement('div');
      row.className = 'stats-stat-row clickable';
      row.innerHTML = `<span class="stats-stat-label">• ${rKey}</span><span class="stats-stat-val">${pct}% (${daysVal}일)</span>`;
      
      row.addEventListener('click', () => {
        const matches = filteredItems.filter(e => e.item.region === rKey || (e.item.region === '이동'));
        openCustomFilteredSummaryModal(`📍 ${rKey} 체류 일정 모아보기`, matches, 'region', rKey);
      });

      regionContainer.appendChild(row);
    });

    const etcKeys = Object.keys(etcDetailsMap);
    if (etcKeys.length > 0) {
      etcKeys.forEach(etcKey => {
        const count = etcDetailsMap[etcKey];
        const pct = ((count / totalSlotValue) * 100).toFixed(1);
        const daysVal = (count / 2).toFixed(1);
        const row = document.createElement('div');
        row.className = 'stats-stat-row clickable';
        row.innerHTML = `<span class="stats-stat-label">• ${etcKey}</span><span class="stats-stat-val">${pct}% (${daysVal}일)</span>`;

        row.addEventListener('click', () => {
          const matches = filteredItems.filter(e => e.item.region === etcKey);
          openCustomFilteredSummaryModal(`📍 ${etcKey} 체류 일정 모아보기`, matches, 'region', etcKey);
        });

        regionContainer.appendChild(row);
      });
    }
  }

  // ----------------------------------------------------
  // SECTION 2: Clinic & HR Status Calculation
  // ----------------------------------------------------
  let clinicOCount = 0;
  let clinicAdminCount = 0;

  let filteredAnnualHours = 0;
  let filteredPetitionHours = 0;
  let dutyOffCount = 0;

  let globalAnnualHours = 0;
  let globalPetitionHours = 0;

  // Helper to check if a leave item is approved (excludes '신청X', '신청O', '미신청', '미승인')
  function isApprovedLeaveItem(item, leaveType) {
    if (!item) return false;
    const hrStr = item.hrDetail || '';
    const otStr = item.otDetail || '';
    const combined = `${item.clinic || ''} ${hrStr} ${otStr}`;

    if (leaveType === '당직') {
      const tokens = combined.split(/[\s,+/]+/);
      if (!tokens.includes('당직')) return false;
    } else {
      if (!combined.includes(leaveType)) return false;
    }

    if (hrStr.includes(leaveType)) {
      const st = (item.hrStatus || '').trim();
      if (st === '신청X' || st === '신청O' || st === '미신청' || st === '미승인') {
        return false;
      }
    }
    if (otStr.includes(leaveType)) {
      const st = (item.otStatus || '').trim();
      if (st === '신청X' || st === '신청O' || st === '미신청' || st === '미승인') {
        return false;
      }
    }
    return true;
  }

  // 같은 날짜에 오전·오후 모두 "연가 1일"로 기록된 경우는 하루(8시간) 한 번만 차감한다.
  // 시간 단위 연가는 세션별 실제 시간을 합산한다.
  function calculateAnnualLeaveHours(entries) {
    const dailyHours = new Map();

    entries.forEach(entry => {
      const item = entry.item || entry;
      if (!isApprovedLeaveItem(item, '연가') || !item.date) return;

      const weekTitle = entry.wObj?.title || item.weekTitleName || '';
      const key = `${weekTitle}_${item.date}`;
      const combined = `${item.clinic || ''} ${item.hrDetail || ''} ${item.otDetail || ''}`;
      const hours = parseHoursFromDetail(combined) || 4;
      const isDayUnitLeave = /\d+(\.\d+)?\s*일/.test(combined);
      const totals = dailyHours.get(key) || { dayUnit: 0, hourly: 0 };

      if (isDayUnitLeave) totals.dayUnit = Math.max(totals.dayUnit, hours);
      else totals.hourly += hours;

      dailyHours.set(key, totals);
    });

    return Array.from(dailyHours.values())
      .reduce((sum, totals) => sum + Math.max(totals.dayUnit, totals.hourly), 0);
  }

  // Calculate Global Petition & Annual Leave Hours (Approved Only)
  const globalPetitionDatesMap = new Map();
  globalAnnualHours = calculateAnnualLeaveHours(allItemsFlat);
  allItemsFlat.forEach(entry => {
    const { item } = entry;

    if (isApprovedLeaveItem(item, '청원휴가') && item.date) {
      const key = `${entry.wObj.title}_${item.date}`;
      globalPetitionDatesMap.set(key, (globalPetitionDatesMap.get(key) || 0) + 1);
    }
  });

  globalPetitionDatesMap.forEach(slotCount => {
    globalPetitionHours += (slotCount >= 2) ? 8 : 4;
  });

  // Filtered Leave & Clinic Hours for Selected Period (Approved Only)
  const filteredPetitionDatesMap = new Map();
  filteredAnnualHours = calculateAnnualLeaveHours(filteredItems);
  
  // 🩺 진료 현황 분류 구조 (1.진료, 2.행정, 3.휴가, 4.휴일, 5.주말, 6.당직, 7.기타)
  const vacationKeys = ['휴가', '당직OFF', '청원휴가', '연가', '위로휴가'];
  const clinicGroup = {
    '진료': { count: 0, rawKeys: ['O', '진료'] },
    '행정': { count: 0, rawKeys: ['행정'] },
    '휴가': { count: 0, rawKeys: [...vacationKeys], subMap: {} },
    '휴일': { count: 0, rawKeys: ['휴일'] },
    '주말': { count: 0, rawKeys: ['주말'] },
    '당직': { count: 0, rawKeys: ['당직'] },
    '기타': { count: 0, subMap: {} }
  };

  filteredItems.forEach(entry => {
    const { item } = entry;

    const rawVal = (item.clinic || '').trim();
    if (rawVal) {
      if (rawVal === 'O' || rawVal === '진료') {
        clinicGroup['진료'].count++;
      } else if (rawVal === '행정') {
        clinicGroup['행정'].count++;
      } else if (vacationKeys.includes(rawVal) || rawVal.includes('휴가') || rawVal.includes('OFF') || rawVal.includes('연가')) {
        clinicGroup['휴가'].count++;
        if (!clinicGroup['휴가'].rawKeys.includes(rawVal)) clinicGroup['휴가'].rawKeys.push(rawVal);
        if (!clinicGroup['휴가'].subMap[rawVal]) {
          clinicGroup['휴가'].subMap[rawVal] = { rawVal, count: 0 };
        }
        clinicGroup['휴가'].subMap[rawVal].count++;
      } else if (rawVal === '휴일') {
        clinicGroup['휴일'].count++;
      } else if (rawVal === '주말') {
        clinicGroup['주말'].count++;
      } else if (rawVal === '당직') {
        clinicGroup['당직'].count++;
      } else {
        clinicGroup['기타'].count++;
        if (!clinicGroup['기타'].subMap[rawVal]) {
          clinicGroup['기타'].subMap[rawVal] = { rawVal, count: 0 };
        }
        clinicGroup['기타'].subMap[rawVal].count++;
      }
    }

    if (isApprovedLeaveItem(item, '청원휴가') && item.date) {
      const key = `${entry.wObj.title}_${item.date}`;
      filteredPetitionDatesMap.set(key, (filteredPetitionDatesMap.get(key) || 0) + 1);
    }
    if (isApprovedLeaveItem(item, '당직OFF')) {
      dutyOffCount++;
    }
  });

  filteredPetitionDatesMap.forEach(slotCount => {
    filteredPetitionHours += (slotCount >= 2) ? 8 : 4;
  });

  // SECTION 2-C: Allowance Calculation (Approved Only)
  const otMap = {};
  let totalOtCount = 0;
  let totalOtHours = 0;

  filteredItems.forEach(entry => {
    const { item } = entry;
    const otStr = (item.otDetail || '').trim();
    const st = (item.otStatus || '').trim();

    if (otStr && st !== '신청X' && st !== '신청O' && st !== '미신청' && st !== '미승인') {
      const categories = ['야간', '당직', '휴일', '시간외'];
      let matched = categories.find(c => otStr.includes(c));
      if (!matched) matched = otStr.split(' ')[0] || '기타수당';

      const hours = parseHoursFromDetail(otStr) || 1;
      if (!otMap[matched]) {
        otMap[matched] = { count: 0, hours: 0 };
      }
      otMap[matched].count += 1;
      otMap[matched].hours += hours;

      totalOtCount += 1;
      totalOtHours += hours;
    }
  });

  const curY = state.currentMonthYear.year || new Date().getFullYear();
  const totalGrantedAnnualHours = (curY === 2027) ? 168 : 112;
  const remainingAnnualHours = Math.max(0, totalGrantedAnnualHours - globalAnnualHours);

  const totalGrantedPetitionHours = 240;
  const remainingPetitionHours = Math.max(0, totalGrantedPetitionHours - globalPetitionHours);

  const dutyOffDays = (dutyOffCount / 2);

  let otHtml = `<div style="font-size:12px; font-weight:700; color:#2F5597; margin-top:10px; margin-bottom:4px;">[ 💰 수당 현황 ]</div>`;
  const otKeys = Object.keys(otMap);
  if (otKeys.length === 0) {
    otHtml += `<div class="stats-sub-item">해당 기간의 승인된 수당 데이터가 없습니다.</div>`;
  } else {
    otKeys.forEach(tKey => {
      const { count, hours } = otMap[tKey];
      otHtml += `<div class="stats-stat-row clickable" id="statsRowOt_${tKey}"><span class="stats-stat-label">• ${tKey}</span><span class="stats-stat-val">(${count}회) ${formatOtHoursString(hours)}</span></div>`;
    });
    otHtml += `<div class="stats-stat-row clickable" id="statsRowOt_TOTAL" style="border-top: 1px dashed #CBD5E1; margin-top:4px; padding-top:4px;"><span class="stats-stat-label" style="font-weight:700; color:#1E3A8A;">• 전체</span><span class="stats-stat-val" style="color:#1E3A8A;">(${totalOtCount}회) ${formatOtHoursString(totalOtHours)}</span></div>`;
  }

  // 슬롯(세션) 수를 일수로 변환하는 헬퍼 (예: 1슬롯 -> 0.5일, 2슬롯 -> 1일)
  function formatSlotsToDaysString(slotCount) {
    if (!slotCount || slotCount <= 0) return '0일';
    const days = slotCount / 2;
    return Number.isInteger(days) ? `${days}일` : `${days.toFixed(1)}일`;
  }

  let reqBadgeHtml = '';
  if (statsCurrentRange === 'weekly') {
    const reqCount = calculateRequiredClinicSessions(filteredItems);
    reqBadgeHtml = `<span class="stats-highlight-badge">(필수 ${reqCount} 세션)</span> `;
  }

  // 휴가 서브 항목 HTML
  const vacationSubKeys = Object.keys(clinicGroup['휴가'].subMap);
  let vacationSubRowsHtml = '';
  if (vacationSubKeys.length > 0) {
    vacationSubKeys.forEach(vKey => {
      const { count } = clinicGroup['휴가'].subMap[vKey];
      const safeId = `statsSubRowVacation_${encodeURIComponent(vKey)}`;
      vacationSubRowsHtml += `<div class="stats-stat-row clickable" id="${safeId}"><span class="stats-stat-label" style="color:#475569;">└ • ${vKey}</span><span class="stats-stat-val" style="color:#475569;">${formatSlotsToDaysString(count)}</span></div>`;
    });
  }

  // 기타 서브 항목 HTML
  const etcSubKeys = Object.keys(clinicGroup['기타'].subMap);
  let etcSubRowsHtml = '';
  if (etcSubKeys.length > 0) {
    etcSubKeys.forEach(sKey => {
      const { count } = clinicGroup['기타'].subMap[sKey];
      const safeId = `statsSubRowClinic_${encodeURIComponent(sKey)}`;
      etcSubRowsHtml += `<div class="stats-stat-row clickable" id="${safeId}"><span class="stats-stat-label" style="color:#475569;">└ • ${sKey}</span><span class="stats-stat-val" style="color:#475569;">${count}회</span></div>`;
    });
  }

  // 7가지 진료 현황 HTML 생성 (0회 항목 숨김)
  let clinicHtml = `<div style="font-size:12px; font-weight:700; color:#2F5597; margin-bottom:4px;">[ 🩺 진료 현황 ]</div>`;
  let clinicRowAdded = false;

  // 1. 진료
  if (clinicGroup['진료'].count > 0 || statsCurrentRange === 'weekly') {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_진료"><span class="stats-stat-label">• 진료</span><span class="stats-stat-val">${reqBadgeHtml}${clinicGroup['진료'].count}회</span></div>`;
    clinicRowAdded = true;
  }
  // 2. 행정
  if (clinicGroup['행정'].count > 0) {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_행정"><span class="stats-stat-label">• 행정</span><span class="stats-stat-val">${clinicGroup['행정'].count}회</span></div>`;
    clinicRowAdded = true;
  }
  // 3. 휴가 (당직OFF, 청원휴가, 연가, 위로휴가 포함 서브 드롭다운)
  if (clinicGroup['휴가'].count > 0) {
    const vacLabel = vacationSubKeys.length > 0 ? `• 휴가 <span style="font-size:10px; color:#64748B;">▾</span>` : `• 휴가`;
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_휴가"><span class="stats-stat-label">${vacLabel}</span><span class="stats-stat-val">${formatSlotsToDaysString(clinicGroup['휴가'].count)}</span></div>`;
    if (vacationSubRowsHtml) {
      clinicHtml += `<div id="statsClinicVacationSubContainer" class="hidden" style="padding-left:10px; background:#F8FAFC; border-radius:6px; margin-top:2px; margin-bottom:6px;">${vacationSubRowsHtml}</div>`;
    }
    clinicRowAdded = true;
  }
  // 4. 휴일/주말 (합산)
  const totalHolidayWeekendCount = clinicGroup['휴일'].count + clinicGroup['주말'].count;
  if (totalHolidayWeekendCount > 0) {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_휴일주말"><span class="stats-stat-label">• 휴일/주말</span><span class="stats-stat-val">${formatSlotsToDaysString(totalHolidayWeekendCount)}</span></div>`;
    clinicRowAdded = true;
  }
  // 5. 당직
  if (clinicGroup['당직'].count > 0) {
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_당직"><span class="stats-stat-label">• 당직</span><span class="stats-stat-val">${formatSlotsToDaysString(clinicGroup['당직'].count)}</span></div>`;
    clinicRowAdded = true;
  }
  // 7. 기타
  if (clinicGroup['기타'].count > 0) {
    const etcLabel = etcSubKeys.length > 0 ? `• 기타 <span style="font-size:10px; color:#64748B;">▾</span>` : `• 기타`;
    clinicHtml += `<div class="stats-stat-row clickable" id="statsRowClinic_기타"><span class="stats-stat-label">${etcLabel}</span><span class="stats-stat-val">${clinicGroup['기타'].count}회</span></div>`;
    if (etcSubRowsHtml) {
      clinicHtml += `<div id="statsClinicEtcSubContainer" class="hidden" style="padding-left:10px; background:#F8FAFC; border-radius:6px; margin-top:2px; margin-bottom:6px;">${etcSubRowsHtml}</div>`;
    }
    clinicRowAdded = true;
  }

  if (!clinicRowAdded) {
    clinicHtml += `<div class="stats-sub-item">해당 기간의 진료 데이터가 없습니다.</div>`;
  }

  clinicHrContainer.innerHTML = `
    ${clinicHtml}
    
    <div style="font-size:12px; font-weight:700; color:#2F5597; margin-top:10px; margin-bottom:4px;">[ 📋 휴가 현황 ]</div>
    <div class="stats-stat-row clickable" id="statsRowAnnualLeave">
      <span class="stats-stat-label">• 연가</span>
      <span class="stats-stat-val"><span class="stats-highlight-badge">(잔여 연가: ${formatHoursToDaysString(remainingAnnualHours)})</span> ${formatHoursToDaysString(filteredAnnualHours)}</span>
    </div>
    <div class="stats-stat-row clickable" id="statsRowPetitionLeave">
      <span class="stats-stat-label">• 청원휴가</span>
      <span class="stats-stat-val"><span class="stats-highlight-badge">(잔여 청원휴가: ${formatHoursToDaysString(remainingPetitionHours)})</span> ${formatHoursToDaysString(filteredPetitionHours)}</span>
    </div>
    <div class="stats-stat-row clickable" id="statsRowDutyOff">
      <span class="stats-stat-label">• 당직OFF</span>
      <span class="stats-stat-val">${dutyOffDays}일</span>
    </div>

    ${otHtml}
  `;

  // 이벤트 바인딩
  const getClinicMatches = (keys) => filteredItems.filter(e => {
    const raw = ((e.item ? e.item.clinic : '') || '').trim();
    return keys.some(k => {
      if (k === '진료') return raw === 'O' || raw === '진료';
      if (k === '휴가') return vacationKeys.includes(raw) || raw.includes('휴가') || raw.includes('OFF') || raw.includes('연가');
      return raw === k;
    });
  });

  if (clinicGroup['진료'].count > 0 || statsCurrentRange === 'weekly') {
    document.getElementById('statsRowClinic_진료')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 진료 일정 모아보기', getClinicMatches(['O', '진료']), 'clinic');
    });
  }
  if (clinicGroup['행정'].count > 0) {
    document.getElementById('statsRowClinic_행정')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 행정 일정 모아보기', getClinicMatches(['행정']), 'clinic');
    });
  }
  if (clinicGroup['휴가'].count > 0) {
    document.getElementById('statsRowClinic_휴가')?.addEventListener('click', () => {
      const subContainer = document.getElementById('statsClinicVacationSubContainer');
      if (subContainer) {
        subContainer.classList.toggle('hidden');
      } else {
        openCustomFilteredSummaryModal('🩺 휴가 일정 모아보기', getClinicMatches(clinicGroup['휴가'].rawKeys), 'vacation');
      }
    });
  }

  if (vacationSubKeys.length > 0) {
    vacationSubKeys.forEach(vKey => {
      const safeId = `statsSubRowVacation_${encodeURIComponent(vKey)}`;
      document.getElementById(safeId)?.addEventListener('click', () => {
        openCustomFilteredSummaryModal(`🩺 ${vKey} 일정 모아보기`, getClinicMatches([vKey]), 'vacation');
      });
    });
  }

  if (totalHolidayWeekendCount > 0) {
    document.getElementById('statsRowClinic_휴일주말')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 휴일/주말 일정 모아보기', getClinicMatches(['휴일', '주말']), 'clinic');
    });
  }
  if (clinicGroup['당직'].count > 0) {
    document.getElementById('statsRowClinic_당직')?.addEventListener('click', () => {
      openCustomFilteredSummaryModal('🩺 당직 일정 모아보기', getClinicMatches(['당직']), 'clinic');
    });
  }
  if (clinicGroup['기타'].count > 0) {
    document.getElementById('statsRowClinic_기타')?.addEventListener('click', () => {
      const subContainer = document.getElementById('statsClinicEtcSubContainer');
      if (subContainer) {
        subContainer.classList.toggle('hidden');
      }
    });
  }

  if (etcSubKeys.length > 0) {
    etcSubKeys.forEach(sKey => {
      const safeId = `statsSubRowClinic_${encodeURIComponent(sKey)}`;
      document.getElementById(safeId)?.addEventListener('click', () => {
        openCustomFilteredSummaryModal(`🩺 ${sKey} 일정 모아보기`, getClinicMatches([sKey]), 'clinic');
      });
    });
  }

  document.getElementById('statsRowAnnualLeave')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 연가 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '연가')), 'annualLeave');
  });
  document.getElementById('statsRowPetitionLeave')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 청원휴가 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '청원휴가')), 'petitionLeave');
  });
  document.getElementById('statsRowDutyOff')?.addEventListener('click', () => {
    openCustomFilteredSummaryModal('📋 당직OFF 일정 모아보기', filteredItems.filter(e => isApprovedLeaveItem(e.item, '당직OFF')), 'dutyOff');
  });

  if (otKeys.length > 0) {
    otKeys.forEach(tKey => {
      document.getElementById(`statsRowOt_${tKey}`)?.addEventListener('click', () => {
        const matches = filteredItems.filter(e => {
          const otStr = (e.item.otDetail || '').trim();
          const st = (e.item.otStatus || '').trim();
          return otStr.includes(tKey) && st !== '신청X' && st !== '신청O' && st !== '미신청' && st !== '미승인';
        });
        openCustomFilteredSummaryModal(`💰 ${tKey} 수당 일정 모아보기`, matches, 'allowance');
      });
    });

    document.getElementById(`statsRowOt_TOTAL`)?.addEventListener('click', () => {
      const matches = filteredItems.filter(e => {
        const otStr = (e.item.otDetail || '').trim();
        const st = (e.item.otStatus || '').trim();
        return otStr && st !== '신청X' && st !== '신청O' && st !== '미신청' && st !== '미승인';
      });
      openCustomFilteredSummaryModal(`💰 전체 수당 일정 모아보기`, matches, 'allowance');
    });
  }

  // ----------------------------------------------------
  // SECTION 3: Transport Usage Calculation
  // ----------------------------------------------------
  const transportMap = {};

  filteredItems.forEach(entry => {
    const { item } = entry;
    const detail = item.transDetail || '';
    if (detail) {
      const categories = ['KTX', '고속버스', '버스', '무궁화호', '신화호'];
      let matched = categories.find(c => detail.includes(c));
      if (!matched) matched = detail.split(' ')[0] || '기타';

      transportMap[matched] = (transportMap[matched] || 0) + 1;
    }
  });

  transportContainer.innerHTML = '';
  const transKeys = Object.keys(transportMap);
  if (transKeys.length === 0) {
    transportContainer.innerHTML = `<div class="stats-sub-item">해당 기간의 교통 이용 데이터가 없습니다.</div>`;
  } else {
    transKeys.forEach(tKey => {
      const count = transportMap[tKey];
      const row = document.createElement('div');
      row.className = 'stats-stat-row clickable';
      row.innerHTML = `<span class="stats-stat-label">• ${tKey}</span><span class="stats-stat-val">${count}건</span>`;

      row.addEventListener('click', () => {
        const matches = filteredItems.filter(e => (e.item.transDetail || '').includes(tKey));
        openCustomFilteredSummaryModal(`🚆 ${tKey} 이용 일정 모아보기`, matches, 'transport');
      });

      transportContainer.appendChild(row);
    });
  }
}

function openCustomFilteredSummaryModal(titleText, itemsList, modalCategoryType = '', statsContextRegion = '') {
  const summaryModalTitle = document.getElementById('summaryModalTitle');
  const summaryListContainer = document.getElementById('summaryListContainer');
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');

  if (!summaryListContainer) return;
  summaryListContainer.innerHTML = '';
  if (summaryModalTitle) summaryModalTitle.textContent = titleText;

  if (!itemsList || itemsList.length === 0) {
    summaryListContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#64748B; font-size:13px;">해당하는 일정 항목이 없습니다. 🎉</div>`;
  } else {
    const isFullDayCategory = (
      modalCategoryType === 'vacation' ||
      modalCategoryType === 'petitionLeave' ||
      modalCategoryType === 'dutyOff' ||
      modalCategoryType === 'annualLeave' ||
      modalCategoryType === 'clinic' ||
      modalCategoryType === 'allowance' ||
      modalCategoryType === 'region' ||
      (titleText && ['당직OFF', '청원휴가', '연가', '위로휴가', '휴가', '휴일', '주말', '당직'].some(k => titleText.includes(k)))
    );

    if (isFullDayCategory) {
      const dateGroupMap = new Map();
      itemsList.forEach(entry => {
        const item = entry.item || entry;
        const weekName = entry.wObj ? entry.wObj.title.split(' (')[0] : (item.weekTitleName || '');
        const key = `${weekName}_${item.date}`;
        if (!dateGroupMap.has(key)) {
          dateGroupMap.set(key, { morning: null, afternoon: null, entryList: [], firstItem: item });
        }
        const group = dateGroupMap.get(key);
        group.entryList.push(entry);

        if (item.time && item.time.includes('오후')) {
          group.afternoon = entry;
        } else {
          group.morning = entry;
        }
      });

      const findSessionEntry = (sourceEntry, timeLabel) => {
        const sourceItem = sourceEntry?.item || sourceEntry;
        if (!sourceItem) return null;

        const sourceWeek = sourceEntry?.wObj || state.allWeeksData.find(w =>
          w.items && w.items.some(it => it.id === sourceItem.id && it.date === sourceItem.date)
        );
        const sessionItem = sourceWeek?.items?.find(it =>
          it.date === sourceItem.date && (it.time || '').includes(timeLabel)
        );

        return sessionItem ? { item: sessionItem, wObj: sourceWeek } : null;
      };

      dateGroupMap.forEach(({ morning, afternoon, entryList, firstItem }) => {
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        // 오전/오후에 실제로 해당하는 일정만 활성화한다.
        // 한 세션만 있는 날에는 다른 세션을 대신 열지 않고 비활성화한다.
        const mEntry = morning;
        const aEntry = afternoon;
        // 통계 항목에는 없더라도 실제 해당 시간 일정이 있으면 회색 버튼으로 편집을 허용한다.
        const mEditEntry = mEntry || findSessionEntry(entryList[0], '오전');
        const aEditEntry = aEntry || findSessionEntry(entryList[0], '오후');

        const mItem = mEditEntry ? (mEditEntry.item || mEditEntry) : null;
        const aItem = aEditEntry ? (aEditEntry.item || aEditEntry) : null;

        const getItemDetailText = (it) => {
          if (!it) return '';
          const hr = (it.hrDetail || '').trim();
          const ot = (it.otDetail || '').trim();
          const cl = (it.clinic || '').trim();
          const details = [hr, ot].filter(Boolean);
          if (details.length > 0) return details.join(' / ');
          return (cl && cl !== 'O') ? cl : '';
        };

        const getClinicText = (it) => {
          const clinic = (it?.clinic || '').trim();
          return clinic === 'O' ? '진료' : clinic || '-';
        };
        const isSingleClinicDetail = modalCategoryType === 'vacation' ||
          (modalCategoryType === 'clinic' && ['휴가', '휴일', '주말', '당직'].some(key => titleText.includes(key)));
        const isSplitClinicDetail = modalCategoryType === 'region' ||
          (modalCategoryType === 'clinic' && !isSingleClinicDetail);
        const isLeaveStatusReport = ['annualLeave', 'petitionLeave', 'dutyOff'].includes(modalCategoryType);
        const getMatchedFieldDetails = (fieldName, deduplicate = false) => {
          const details = [mEntry, aEntry]
            .map(entry => (entry?.item || entry)?.[fieldName]?.trim())
            .filter(Boolean);
          return (deduplicate ? [...new Set(details)] : details).join(' / ');
        };

        // 체류 지역과 일반 진료 항목은 오전·오후 진료 구분을 각각 보여준다.
        // 진료 현황의 휴가·휴일/주말·당직은 같은 내용이 반복되는 경우가 많아 한 번만 표시한다.
        let detailText = '';
        if (isSplitClinicDetail) {
          detailText = `${getClinicText(mItem)} / ${getClinicText(aItem)}`;
        } else if (modalCategoryType === 'allowance') {
          detailText = getMatchedFieldDetails('otDetail');
        } else if (isLeaveStatusReport) {
          detailText = getMatchedFieldDetails('hrDetail', true);
        } else if (isSingleClinicDetail) {
          detailText = getItemDetailText(mItem) || getItemDetailText(aItem);
        } else {
          detailText = [getItemDetailText(mItem), getItemDetailText(aItem)].filter(Boolean).join(' / ');
        }
        const regionLabels = [mItem?.region || '-', aItem?.region || '-']
          .map(region => `(${region})`)
          .join(' ');
        const getTravelClass = (item, pairedItem) => {
          if (modalCategoryType !== 'region' || item?.region !== '이동') return '';

          // 이동은 현재 보고 있는 지역을 기준으로 출발(왼쪽)·도착(오른쪽)을 나타낸다.
          const isContextRegion = pairedItem?.region === statsContextRegion;
          const isMorning = (item.time || '').includes('오전');
          const isColorOnLeft = isMorning ? !isContextRegion : isContextRegion;
          return ` summary-session-travel-${isColorOnLeft ? 'left' : 'right'}`;
        };
        const mTravelClass = getTravelClass(mItem, aItem);
        const aTravelClass = getTravelClass(aItem, mItem);

        let descHtml = '';
        if (detailText) {
          descHtml = `<div class="summary-item-desc">${detailText}</div>`;
        }

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${firstItem.date} ${regionLabels}</div>
            ${descHtml}
          </div>
          <div class="summary-item-actions" style="display:flex; gap:6px; align-items:center;">
            <button type="button" class="badge-apply-ok btn-m-edit${mEntry ? '' : ' summary-session-disabled'}${mTravelClass}" ${mEditEntry ? '' : 'disabled'} style="background-color:#3B82F6; border:none; padding:4px 8px; border-radius:4px; color:white; font-size:11px; font-weight:600;">오전</button>
            <button type="button" class="badge-apply-ok btn-a-edit${aEntry ? '' : ' summary-session-disabled'}${aTravelClass}" ${aEditEntry ? '' : 'disabled'} style="background-color:#10B981; border:none; padding:4px 8px; border-radius:4px; color:white; font-size:11px; font-weight:600;">오후</button>
          </div>
        `;

        const handleItemClick = (targetEntry) => {
          if (!targetEntry) return;
          const tItem = targetEntry.item || targetEntry;
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === tItem.id && it.date === tItem.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(tItem);
        };

        const mBtn = card.querySelector('.btn-m-edit');
        const aBtn = card.querySelector('.btn-a-edit');

        if (mBtn && mEditEntry) {
          mBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleItemClick(mEditEntry);
          });
        }

        if (aBtn && aEditEntry) {
          aBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleItemClick(aEditEntry);
          });
        }

        summaryListContainer.appendChild(card);
      });
    } else {
      itemsList.forEach(entry => {
        const item = entry.item || entry;
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        let descHtml = '';
        if (modalCategoryType === 'transport') {
          if (item.transDetail) {
            descHtml = `<div class="summary-item-desc">${item.transDetail}</div>`;
          }
        } else if (modalCategoryType === 'allowance') {
          if (item.otDetail) {
            descHtml = `<div class="summary-item-desc">${item.otDetail}</div>`;
          }
        }

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${item.date} ${item.time} (${item.region || '-'})</div>
            ${descHtml}
          </div>
          <div><span class="badge-apply-ok">상세보기</span></div>
        `;

        card.addEventListener('click', () => {
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === item.id && it.date === item.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(item);
        });

        summaryListContainer.appendChild(card);
      });
    }
  }

  if (summaryModalOverlay) summaryModalOverlay.classList.add('active');
}
