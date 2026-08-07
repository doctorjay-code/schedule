import { state, standardTransCategories, standardHrCategories, standardOtCategories, pastelPalette, saveColorSettings, resetColorSettings } from './state.js';
import { syncToGoogleSheets, syncColorSettingsToSheets } from './api.js';

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

  const standardRegions = ['서울', '진주', '이동'];
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

  const standardClinics = ['O', '행정', '휴가'];
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
          weekTitleName: wName
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
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청X' || d.otStatus === '신청X');
  } else if (type === 'unapproved') {
    if (summaryModalTitle) summaryModalTitle.textContent = '⏳ 전체 미승인 (승인대기) 모아보기';
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
        const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === item.id && it.date === item.date));
        if (targetWeekIdx !== -1 && loadWeekDataFn) {
          loadWeekDataFn(targetWeekIdx);
        }
        openModal(item);
      });

      summaryListContainer.appendChild(card);
    });
  }

  if (summaryModalOverlay) summaryModalOverlay.classList.add('active');
}

export function closeSummaryModal() {
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');
  if (summaryModalOverlay) summaryModalOverlay.classList.remove('active');
}

export function updateBtnGroup(groupElem, activeVal) {
  const btns = groupElem.querySelectorAll('.option-btn');
  btns.forEach(btn => {
    if (activeVal && btn.dataset.val === activeVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

export function updateToggleGroup(toggleElem, activeVal) {
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
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveColorSettings();
      syncColorSettingsToSheets();
      if (renderTableFn) renderTableFn();
      closeColorSettingsModal();
    });
  }
}
