import { state, standardTransCategories, standardHrCategories, standardOtCategories } from '../../../services/schedule/state.js';
import { bindOptionButtonGroup, setModalOpen, setOptionGroupValue } from '../../../shared/modal-form.js';
import { syncToGoogleSheets } from '../../../services/schedule/api.js';

// ----------------------------------------------------
// 일정 상세 편집 모달 + 공용 헬퍼 + 공유 렌더 콜백 상태
// ----------------------------------------------------
export let renderTableFn = null;
export function setModalRenderCallback(fn) { renderTableFn = fn; }
export let loadWeekDataFn = null;
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

  // Section Parsings
  parseSectionField(item.transDetail, standardTransCategories, transSelectCategory, customTransWrapper, customTransCategoryInput, transDetailInput);
  parseSectionField(item.hrDetail, standardHrCategories, hrSelectCategory, customHrWrapper, customHrCategoryInput, hrDetailInput);
  parseSectionField(item.otDetail, standardOtCategories, otSelectCategory, customOtWrapper, customOtCategoryInput, otDetailInput);

  setModalOpen(modalOverlay, true);
}

export function closeModal() {
  setModalOpen(document.getElementById('modalOverlay'), false);
}

export function updateBtnGroup(groupElem, activeVal) {
  setOptionGroupValue(groupElem, activeVal);
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

  syncToGoogleSheets();
}

export function setupBtnGroupEvents(groupElem, customInputElem) {
  bindOptionButtonGroup(groupElem, {
    allowEmpty: true,
    onChange: nextValue => {
      if (!customInputElem) return;
      const useCustomValue = nextValue === '기타';
      customInputElem.classList.toggle('hidden', !useCustomValue);
      if (useCustomValue) customInputElem.focus();
    }
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
