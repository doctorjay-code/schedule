// Weekly schedule table cell rendering responsibility.
export function createScheduleCellRenderers({ state, isCellSelected, toggleCellKey, toggleRowSelection, openModal }) {function createTimeTd(item) {
  const td = document.createElement('td');
  td.className = 'cell-time';
  td.textContent = item.time;
  const rowKey = `${item.id}_row`;

  if (state.isMultiEditMode && (isCellSelected(rowKey) || isCellSelected(`${item.id}_time`))) {
    td.classList.add('cell-selected');
  }

  td.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.isMultiEditMode) toggleRowSelection(item.id, rowKey);
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
      
      if (state.isMultiEditMode) {
        toggleCellKey(targetKey);
      } else {
        openModal(targetItem);
      }
    } else {
      const cellKey = `${mItem.id}_${field}`;
      if (state.isMultiEditMode) {
        toggleCellKey(cellKey);
      } else {
        openModal(mItem);
      }
    }
  });
}

// Helper: Get Custom Color for Region or Clinic Cell
function applyCustomCellColor(tdElem, text, type) {
  if (!text || text === '-') return;

  // 1. Specific Word Rules Match
  if (state.colorSettings && Array.isArray(state.colorSettings.wordRules)) {
    const matchedRule = state.colorSettings.wordRules.find(r => r.word && text.includes(r.word));
    if (matchedRule) {
      tdElem.style.backgroundColor = matchedRule.color;
      tdElem.style.color = '#1E293B';
      tdElem.style.fontWeight = '700';
      return;
    }
  }

  // 2. Button Category Match
  if (type === 'region' && state.colorSettings && state.colorSettings.regionColors) {
    const rColors = state.colorSettings.regionColors;
    const bg = rColors[text] || rColors['기타'] || '#FFEDD5';
    tdElem.style.backgroundColor = bg;
    tdElem.style.color = '#1E293B';
    tdElem.style.fontWeight = '700';
  } else if (type === 'clinic' && state.colorSettings && state.colorSettings.clinicColors) {
    const cColors = state.colorSettings.clinicColors;
    const bg = cColors[text] || cColors['기타'] || '#F1F5F9';
    tdElem.style.backgroundColor = bg;
    tdElem.style.color = '#1E293B';
    tdElem.style.fontWeight = '700';
  }
}

function createRegionTd(item, aItem = null, isMerged = false) {
  const tdRegion = document.createElement('td');
  tdRegion.textContent = item.region || '-';
  applyCustomCellColor(tdRegion, item.region, 'region');
  
  const regionKey = `${item.id}_region`;
  if (state.isMultiEditMode && (isCellSelected(regionKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_region`) || isCellSelected(`${aItem.id}_row`))))) {
    tdRegion.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdRegion, item, aItem, 'region');
  } else {
    tdRegion.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(regionKey);
      else openModal(item);
    });
  }
  return tdRegion;
}

function createClinicTd(item, aItem = null, isMerged = false) {
  const tdClinic = document.createElement('td');
  tdClinic.textContent = item.clinic || '-';
  applyCustomCellColor(tdClinic, item.clinic, 'clinic');

  const clinicKey = `${item.id}_clinic`;
  if (state.isMultiEditMode && (isCellSelected(clinicKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_clinic`) || isCellSelected(`${aItem.id}_row`))))) {
    tdClinic.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdClinic, item, aItem, 'clinic');
  } else {
    tdClinic.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(clinicKey);
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
  if (state.isMultiEditMode && (isCellSelected(transKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_trans`) || isCellSelected(`${aItem.id}_row`))))) {
    tdTrans.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdTrans, item, aItem, 'trans');
  } else {
    tdTrans.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(transKey);
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
  if (state.isMultiEditMode && (isCellSelected(hrKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_hr`) || isCellSelected(`${aItem.id}_row`))))) {
    tdHr.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdHr, item, aItem, 'hr');
  } else {
    tdHr.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(hrKey);
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
  if (state.isMultiEditMode && (isCellSelected(otKey) || isCellSelected(`${item.id}_row`) ||
      (aItem && (isCellSelected(`${aItem.id}_ot`) || isCellSelected(`${aItem.id}_row`))))) {
    tdOt.classList.add('cell-selected');
  }

  if (isMerged && aItem) {
    attachSmartCellClick(tdOt, item, aItem, 'ot');
  } else {
    tdOt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isMultiEditMode) toggleCellKey(otKey);
      else openModal(item);
    });
  }
  return tdOt;
}

  return {
    createTimeTd,
    attachSmartCellClick,
    applyCustomCellColor,
    createRegionTd,
    createClinicTd,
    createTransTd,
    createHrTd,
    createOtTd
  };
}