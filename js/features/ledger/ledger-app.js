import { state, pastelPalette, saveColorSettings, defaultColorSettings } from '../../services/schedule/schedule-store.js';
import { registerColorUpdateCallback } from '../../services/schedule/schedule-api.js';
import { switchViewModeUI } from '../schedule/render.js';
import { showScheduleView, showLedgerView } from '../../shared/view-coordinator.js';
import { openWeekSelectModal } from '../schedule/modals/week-picker.js';
import { openMonthSelectModal } from '../schedule/modals/month-picker.js';
import { startOfWeek, toIso, escapeHtml, formatMoney, getLedgerTagColor, recalculateRunningBalances, normalizeLedgerDate, compareLedgerRecords, generateLedgerId } from './ledger-utils.js';
import { filterLedgerRecords } from './card.js';
import { normalizeFundplanRows } from './fundplan.js';
import { groupExpenses, renderStatList } from './stats.js';
import { appendLedgerEmptyRow, createLedgerTableHead, formatLedgerScheduleDate, renderTransactionRow } from './transaction-view.js';
import { createLedgerTransactionModal } from './modals/transaction-modal.js';
import { createLedgerColorSettings } from './modals/color-settings.js';
import { bindLedgerListActions } from './ledger-events.js';
import { createFundplanView, createLedgerMonthDividerRow, getRecordMonthGroup } from './fundplan-view.js';
import { fetchLedgerData, upsertLedgerRecord, deleteLedgerRecord, reorderLedgerRecords, reorderForecastRecords, deleteLedgerRecordsBatch, insertLedgerRecordsBatch } from '../../services/ledger/ledger-api.js';
import { registerRealtimeCallbacks } from '../../services/shared/supabase-realtime.js';
import { showLedgerToast, findLedgerRecordById, executeLedgerCopy, executeLedgerDelete, executeLedgerPaste } from './ledger-clipboard.js';
import { generateForecastRecords, isManualCardPayment, saveForecastAggregateOverride, loadForecastAggregateOverrides, syncForecastAggregateOverridesFromDB, syncBankCardBillRecords } from './ledger-forecast.js';
import { createOffsetGroupFromRecords, createOffsetGroupRow, deleteOffsetGroup } from './ledger-offset-groups.js';
import { initAverageBalanceModal } from './modals/average-balance.js';

let ledgerState = {
  active: false,
  source: 'card', // 'card' | 'bank' | 'cash' | 'forecast'
  payment: '토스은행',
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  balanceMode: 'local', // 'local' (기본: 생활비 전용) | 'global' (전체 시계열 일치)
  records: [],
  recordsLoaded: false,
  multiEditMode: false,
  selectedLedgerIds: new Set(),
  copiedRecords: [],
  showOffsetGroups: false,
  filters: {
    person: new Set(),
    category: new Set(),
    fixed: 'all'
  }
};

let ledgerTransactionModal = null;
let ledgerColorSettings = null;
let cachedForecastAggregateRows = []; // Keep cache for click finding
let isSavingForecastOrders = false; // Prevent concurrent drag saves

function ledgerSheetNameForRecord(record = {}) {
  if (record.sheetName) return record.sheetName;
  if (record.payment) return record.payment;
  return ledgerState.payment || '토스은행';
}

function getSelectedLedgerIds() {
  return ledgerState.selectedLedgerIds;
}

function getLedgerTransactionModal() {
  if (!ledgerTransactionModal) {
    ledgerTransactionModal = createLedgerTransactionModal({
      state,
      pastelPalette,
      findRecord: (id) => findLedgerTransaction(id),
      onSave: saveLedgerRecord,
      saveRecord: saveLedgerRecord,
      onDelete: deleteRecord,
      deleteRecord: deleteRecord,
      getCategorySuggestions: () => getLedgerCategoryNames()
    });
  }
  return ledgerTransactionModal;
}

function getLedgerColorSettings() {
  if (!ledgerColorSettings) {
    ledgerColorSettings = createLedgerColorSettings({
      state,
      pastelPalette,
      defaultColorSettings,
      saveColorSettings,
      renderLedgerViews: applyLedgerDataSources
    });
  }
  return ledgerColorSettings;
}

function setMultiEditMode(enabled) {
  ledgerState.multiEditMode = Boolean(enabled);
  if (!ledgerState.multiEditMode) {
    ledgerState.selectedLedgerIds.clear();
    // 🌟 선택 해제 시 기존 선택 행 스타일만 0ms 국소 초기화
    document.querySelectorAll('tr.ledger-row-selected, tr.selected-row').forEach(r => {
      r.classList.remove('ledger-row-selected', 'selected-row');
    });
  }
  updateMultiActionBar();
}

function toggleMultiSelectRow(recordId) {
  if (!ledgerState.multiEditMode) return;
  const sId = String(recordId || '');
  if (!sId) return;

  const isNowSelected = !ledgerState.selectedLedgerIds.has(sId);
  if (isNowSelected) {
    ledgerState.selectedLedgerIds.add(sId);
  } else {
    ledgerState.selectedLedgerIds.delete(sId);
  }

  // 🌟 전체 재렌더링 없이 해당 행 엘리먼트들만 0ms 즉시 토글
  const rows = document.querySelectorAll(`tr[data-ledger-id="${sId}"]`);
  rows.forEach(r => {
    r.classList.toggle('ledger-row-selected', isNowSelected);
    r.classList.toggle('selected-row', isNowSelected);
  });

  updateMultiActionBar();
}

function updateMultiActionBar() {
  const multiActionBar = document.getElementById('ledgerMultiActionBar') || document.getElementById('multiActionBar');
  const selectedCountLabel = document.getElementById('ledgerSelectedCountLabel') || document.getElementById('selectedCountLabel');
  const toggleBtn = document.getElementById('ledgerToggleMultiEditBtn') || document.getElementById('toggleMultiEditBtn');
  const isMulti = ledgerState.multiEditMode;

  if (toggleBtn) {
    if (isMulti) {
      toggleBtn.classList.add('active');
      toggleBtn.textContent = '✕';
    } else {
      toggleBtn.classList.remove('active');
      toggleBtn.textContent = '✏️';
    }
  }

  if (!multiActionBar) return;

  const offsetBtn = document.getElementById('ledgerBulkOffsetBtn');
  const selectedDiffLabel = document.getElementById('ledgerSelectedDiffLabel');

  if (isMulti) {
    multiActionBar.classList.remove('hidden');
    const selCount = ledgerState.selectedLedgerIds.size;
    if (selectedCountLabel) {
      selectedCountLabel.textContent = `${selCount}건 선택됨`;
    }

    // 선택된 거래들의 수입/지출 합계 및 상계 가능 여부 계산
    if (selCount >= 2) {
      const selRecs = Array.from(ledgerState.selectedLedgerIds).map(id => findLedgerRecordById(id, { ledgerState })).filter(Boolean);
      const inSum = selRecs.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const outSum = selRecs.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const diff = inSum - outSum;

      if (selectedDiffLabel) {
        selectedDiffLabel.textContent = `수입 ${formatMoney(inSum)}원 / 지출 ${formatMoney(outSum)}원 (차액: ${formatMoney(diff)}원)`;
      }

      if (offsetBtn) {
        offsetBtn.classList.remove('hidden');
        if (diff === 0 && inSum > 0) {
          offsetBtn.style.opacity = '1';
          offsetBtn.style.pointerEvents = 'auto';
          offsetBtn.title = '수입/지출이 일치하여 0원 상계 가능';
        } else {
          offsetBtn.style.opacity = '0.6';
          offsetBtn.style.pointerEvents = 'auto';
          offsetBtn.title = `차액(${formatMoney(Math.abs(diff))}원) 발생 중`;
        }
      }
    } else {
      if (selectedDiffLabel) selectedDiffLabel.textContent = '';
      if (offsetBtn) offsetBtn.classList.add('hidden');
    }
  } else {
    multiActionBar.classList.add('hidden');
    if (selectedDiffLabel) selectedDiffLabel.textContent = '';
    if (offsetBtn) offsetBtn.classList.add('hidden');
  }
}

function createOffsetGroupFromSelection() {
  if (ledgerState.selectedLedgerIds.size < 2) {
    showLedgerToast('⚠️ 상계 묶음을 만들려면 2개 이상의 거래를 선택해야 합니다.');
    return;
  }
  const selectedRecords = Array.from(ledgerState.selectedLedgerIds)
    .map(id => findLedgerRecordById(id, { ledgerState }))
    .filter(Boolean);

  const res = createOffsetGroupFromRecords(selectedRecords);
  if (!res.ok) {
    showLedgerToast(`⚠️ ${res.message}`);
    return;
  }

  // 선택된 레코드들의 로컬 상태에도 offset_group_id 반영
  selectedRecords.forEach(r => {
    r.offset_group_id = res.group.id;
    r.offset_title = res.group.title;
  });

  setMultiEditMode(false);
  ledgerState.showOffsetGroups = true;
  const offsetFilterBtn = document.getElementById('ledgerOffsetFilterBtn');
  if (offsetFilterBtn) offsetFilterBtn.classList.add('active');

  applyLedgerDataSources();
  showLedgerToast(`🎉 0원 상계 묶음이 생성되었습니다! (${res.group.title})`);
}

function updateCopyBufferBar() {
  const copyBar = document.getElementById('ledgerCopyBufferBar') || document.getElementById('copyBufferBar');
  const copiedItemLabel = document.getElementById('ledgerCopiedItemLabel') || document.getElementById('copiedItemLabel');
  if (!copyBar || !copiedItemLabel) return;

  const count = ledgerState.copiedRecords ? ledgerState.copiedRecords.length : 0;
  if (count > 0) {
    copyBar.classList.remove('hidden');
    const firstItem = ledgerState.copiedRecords[0];
    const previewText = count === 1
      ? `${firstItem.item || '항목'} (${formatMoney(firstItem.amount)}원)`
      : `${firstItem.item || '항목'} 외 ${count - 1}건`;
    copiedItemLabel.textContent = previewText;
  } else {
    copyBar.classList.add('hidden');
  }
}

function showLedgerViewTab() {
  showLedgerView({
    onShow: () => {
      ledgerState.active = true;
      initLedgerApp();
    }
  });
}

function showScheduleViewTab() {
  showScheduleView({
    onShow: () => {
      ledgerState.active = false;
    }
  });
}

function findLedgerTransaction(id) {
  const sId = String(id || '');
  return ledgerState.records.find(item => String(item.id) === sId) || null;
}

function applyOptimisticSave(record) {
  const sId = String(record.id || '');
  const existingIdx = ledgerState.records.findIndex(item => String(item.id) === sId);
  if (existingIdx >= 0) {
    ledgerState.records[existingIdx] = { ...record, updatedAt: Date.now() };
  } else {
    ledgerState.records.push({
      ...record,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  applyLedgerDataSources();
}

function applyOptimisticDelete(record) {
  const sId = String(record.id || '');
  ledgerState.records = ledgerState.records.filter(item => String(item.id) !== sId);
  if (ledgerState.selectedLedgerIds.has(sId)) {
    ledgerState.selectedLedgerIds.delete(sId);
  }
  applyLedgerDataSources();
}

function saveLedgerRecord(form, overrides = {}) {
  const values = { ...Object.fromEntries(new FormData(form).entries()), ...overrides };
  const rawAmountStr = String(values.amount || '').replace(/[^\d]/g, '');
  const amount = rawAmountStr === '' ? 0 : Number(rawAmountStr);
  if (!values.date || !values.item?.trim() || !Number.isFinite(amount) || amount < 0) return;

  const isEdit = Boolean(values.ledgerEditId);
  const existing = ledgerState.records.find(record => record.id === values.ledgerEditId);
  
  // 스마트 사용자 추출 & 비고 중복 방지 (기본값: '기타')
  const rawMemo = String(values.memo || '').trim();
  const personMatch = rawMemo.match(/콩콩|쥬쥬|지니/);
  let finalPerson = String(values.person || (personMatch ? personMatch[0] : '기타')).trim();
  if (!finalPerson) finalPerson = '기타';

  const cleanedDetail = rawMemo.replace(/콩콩|쥬쥬|지니/g, '').trim().replace(/\s{2,}/g, ' ');
  const finalMemo = (finalPerson && finalPerson !== '기타') ? [finalPerson, cleanedDetail].filter(Boolean).join(' ') : cleanedDetail;

  const editId = String(values.ledgerEditId || '');
  const isAggregateEdit = editId.startsWith('fc-est-card-') || editId.startsWith('fc-var-toss-');
  if (isAggregateEdit) {
    const aggregatePerson = (!values.person || values.person === '기타') && !personMatch ? '' : finalPerson;
    saveForecastAggregateOverride(editId, {
      date: values.date,
      item: values.item.trim(),
      person: aggregatePerson,
      category: values.category || '',
      fixedCost: values.fixedCost === '고정비' ? values.fixedCost : '',
      memo: aggregatePerson ? finalMemo : rawMemo
    });
    getLedgerTransactionModal().close();
    showLedgerToast('✏️ 결제 정보가 저장되었습니다.');
    applyLedgerDataSources();
    return;
  }

  const payment = values.payment || ledgerState.payment || '토스은행';
  const record = {
    ...(existing || {}),
    id: values.ledgerEditId || existing?.id || generateLedgerId(values.date, existing?.orderIndex ?? 0),
    date: values.date,
    type: values.type,
    amount,
    payment,
    item: values.item.trim(),
    person: finalPerson,
    category: values.category || '',
    fixedCost: values.fixedCost === '고정비' ? values.fixedCost : '',
    memo: finalMemo,
    createdAt: existing?.createdAt ?? Date.now()
  };
  record.sheetName = ledgerSheetNameForRecord(record);

  applyOptimisticSave(record);
  getLedgerTransactionModal().close();
  showLedgerToast(isEdit ? '✏️ 거래가 수정되었습니다.' : '＋ 거래가 등록되었습니다.');

  upsertLedgerRecord(record).then(res => {
    if (res && res.id && record.id !== res.id) {
      record.id = res.id;
    }
  }).catch(error => {
    console.error('Supabase ledger save error:', error);
    showLedgerToast('⚠️ 저장 지연 중 (로컬 반영 완료)');
  });
}

function deleteRecord(id) {
  const record = findLedgerTransaction(id);
  if (!record) {
    showLedgerToast('⚠️ 삭제할 거래 정보를 찾을 수 없습니다.');
    return;
  }
  if (!confirm('이 거래를 삭제할까요?')) return;

  const deletePayload = {
    ...record,
    sheetName: ledgerSheetNameForRecord(record)
  };

  applyOptimisticDelete(record);
  getLedgerTransactionModal().close();
  showLedgerToast('🗑️ 거래가 삭제되었습니다.');

  if (deletePayload.id) {
    deleteLedgerRecord(deletePayload).catch(error => {
      console.error('Supabase ledger delete error:', error);
    });
  }
}

function toggleLedgerEntry() {
  const modal = getLedgerTransactionModal();
  modal.open({
    isEdit: false,
    defaultPayment: ledgerState.payment || '토스은행'
  });
}

function getLedgerCategoryNames() {
  const defaults = ['식비', '교통', '문화', '생활', '보험', '상환', '이체', '월급', '저축', '이자', '용돈', '입금', '출금', '기타'];
  const userCats = Object.keys(state.colorSettings?.ledgerCategoryColors || {});
  return Array.from(new Set([...defaults, ...userCats]));
}

function openLedgerReportModal() {
  const cur = ledgerState.monthCursor instanceof Date ? ledgerState.monthCursor : new Date();
  const curMonthKey = toIso(cur).slice(0, 7);
  const curYear = cur.getFullYear();
  const curMonth = cur.getMonth() + 1;

  const titleEl = document.getElementById('ledgerReportPeriod');
  if (titleEl) titleEl.textContent = `${curYear}년 ${curMonth}월 리포트`;

  const monthRecords = (ledgerState.records || []).filter(r => {
    const dStr = normalizeLedgerDate(r.date);
    return dStr && dStr.startsWith(curMonthKey);
  });

  let totalIncome = 0;
  let totalExpense = 0;

  monthRecords.forEach(r => {
    const amt = Number(r.amount || 0);
    const isExp = (r.type || 'expense').toLowerCase() === 'expense';
    if (isExp) totalExpense += amt;
    else totalIncome += amt;
  });

  const netBalance = totalIncome - totalExpense;

  const incomeEl = document.getElementById('ledgerReportIncome');
  const expenseEl = document.getElementById('ledgerReportExpense');
  const balanceEl = document.getElementById('ledgerReportBalance');

  if (incomeEl) incomeEl.textContent = formatMoney(totalIncome);
  if (expenseEl) expenseEl.textContent = formatMoney(totalExpense);
  if (balanceEl) balanceEl.textContent = formatMoney(netBalance);

  const categoryStats = groupExpenses(monthRecords, 'category');
  const personStats = groupExpenses(monthRecords, 'person');
  const paymentStats = groupExpenses(monthRecords, 'payment_method');

  renderStatList('ledgerReportCategoryStats', categoryStats);
  renderStatList('ledgerReportPersonStats', personStats);
  renderStatList('ledgerReportPaymentStats', paymentStats);

  document.getElementById('ledgerReportOverlay')?.classList.add('active');
}

let fundplanViewInstance = null;

function getFundplanView() {
  if (!fundplanViewInstance) {
    fundplanViewInstance = createFundplanView({
      ledgerState,
      getColorSettings: () => state.colorSettings || {},
      colorSettings: state.colorSettings || {},
      getActiveSourceRecords: () => {
        if (ledgerState.source === 'forecast') {
          const { displayRows } = generateForecastRecords({
            allRecords: ledgerState.records,
            monthCursor: ledgerState.monthCursor,
            isManualCardPayment
          });
          return filterLedgerRecords(displayRows, {
            person: ledgerState.filters?.person,
            category: ledgerState.filters?.category,
            fixed: ledgerState.filters?.fixed || 'all'
          });
        }
        const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
        const filterPayment = ledgerState.source === 'card' ? ledgerState.payment : (ledgerState.source === 'cash' ? '현금' : '기업은행');
        return filterLedgerRecords(ledgerState.records, {
          source: ledgerState.source,
          payment: filterPayment,
          person: ledgerState.filters?.person,
          category: ledgerState.filters?.category,
          fixed: ledgerState.filters?.fixed || 'all',
          monthCursor: ledgerState.monthCursor,
          isCompanyCard
        });
      },
      clampLedgerDate: (d) => (d instanceof Date ? d : new Date(d || Date.now())),
      minDate: () => '2026-01-01',
      setText: (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      },
      showLedgerToast,
      onRowClick: (record) => {
        if (ledgerState.multiEditMode) {
          toggleMultiSelectRow(record.id);
        } else {
          getLedgerTransactionModal().open({ isEdit: true, record });
        }
      }
    });
  }
  return fundplanViewInstance;
}

function renderMonthlyLedgerTable(container) {
  const targetContainer = container || document.getElementById('ledgerMonthlyTransactionList');
  if (!targetContainer) return;
  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
  const filterPayment = ledgerState.source === 'card' ? ledgerState.payment : (ledgerState.source === 'cash' ? '현금' : '기업은행');
  const curMonthKey = toIso(ledgerState.monthCursor || new Date()).slice(0, 7);

  let recordsToRender = [];
  if (ledgerState.source === 'forecast') {
    const { displayRows } = generateForecastRecords({
      allRecords: ledgerState.records,
      monthCursor: ledgerState.monthCursor,
      isManualCardPayment
    });
    recordsToRender = displayRows.filter(r => String(r.date).startsWith(curMonthKey));
  } else {
    const filtered = filterLedgerRecords(ledgerState.records, {
      source: ledgerState.source,
      payment: filterPayment,
      person: ledgerState.filters?.person,
      category: ledgerState.filters?.category,
      fixed: ledgerState.filters?.fixed || 'all',
      monthCursor: ledgerState.monthCursor,
      isCompanyCard
    });
    filtered.sort(compareLedgerRecords);
    const calculated = recalculateRunningBalances(filtered, isCompanyCard);
    recordsToRender = calculated.filter(r => String(r.date).startsWith(curMonthKey));
  }

  targetContainer.replaceChildren();
  if (recordsToRender.length === 0) {
    appendLedgerEmptyRow(targetContainer, `${curMonthKey}월의 거래 내역이 없습니다.`);
    return;
  }

  recordsToRender.forEach(record => {
    const isSelected = ledgerState.selectedLedgerIds.has(String(record.id));
    const mainRows = renderTransactionRow(record, targetContainer, {
      source: ledgerState.source,
      isCompanyCard,
      colorSettings: state.colorSettings,
      multiEditMode: ledgerState.multiEditMode,
      isSelected,
      onRowClick: (rec) => {
        if (ledgerState.multiEditMode) {
          toggleMultiSelectRow(rec.id);
        } else {
          getLedgerTransactionModal().open({ isEdit: true, record: rec });
        }
      }
    });

    // 🌟 월간 뷰에서도 통합행 아코디언 세부목록 지원
    if (record.isAggregate && Array.isArray(record.subRecords) && record.subRecords.length > 0) {
      const subRows = [];
      record.subRecords.forEach(subItem => {
        const subRecordData = {
          ...subItem,
          isSubDetail: true
        };
        const subEls = renderTransactionRow(subRecordData, targetContainer, {
          source: ledgerState.source,
          isCompanyCard,
          colorSettings: state.colorSettings,
          multiEditMode: false,
          isSelected: false,
          onRowClick: (subRec) => {
            getLedgerTransactionModal().open({ isEdit: true, record: subRec });
          }
        });
        (subEls || []).forEach(subEl => {
          subEl.style.display = 'none';
          subEl.classList.add('ledger-accordion-sub-row');
          subRows.push(subEl);
        });
      });

      let isSubExpanded = false;
      const toggleSubAccordion = (e) => {
        if (e) e.stopPropagation();
        isSubExpanded = !isSubExpanded;
        (mainRows || []).forEach(mr => {
          const iconEl = mr.querySelector('.ledger-accordion-icon');
          if (iconEl) iconEl.textContent = isSubExpanded ? '▼' : '▶';
        });
        subRows.forEach(subEl => {
          subEl.style.display = isSubExpanded ? '' : 'none';
        });
      };

      (mainRows || []).forEach(rowEl => {
        const toggleCells = rowEl.querySelectorAll('.ledger-accordion-toggle-cell, .ledger-accordion-icon');
        toggleCells.forEach(cell => {
          cell.style.cursor = 'pointer';
          cell.title = '클릭하여 세부 거래 내역 펼치기/접기';
          cell.addEventListener('click', toggleSubAccordion);
        });
      });
    }
  });
}

function renderLedgerTable() {
  const allContainer = document.getElementById('fundplanAllTimeList');
  if (!allContainer) return;
  const view = getFundplanView();
  view.render();
}

function updateLedgerPeriodTitle() {
  const periodTitle = document.getElementById('ledgerPeriodTitle');
  if (!periodTitle) return;
  const cursor = ledgerState.monthCursor instanceof Date ? ledgerState.monthCursor : new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  periodTitle.innerHTML = `${year}.${String(month).padStart(2, '0')}<span class="dropdown-arrow">▾</span>`;
}

function applySourceButtonColors() {
  const colorSettings = state.colorSettings || {};
  const sourceButtons = [
    { id: 'ledgerCashSourceBtn', payment: '현금' },
    { id: 'ledgerCompanyCardBtn', payment: '기업카드' },
    { id: 'ledgerTossBankBtn', payment: '토스은행' },
    { id: 'ledgerBankSourceBtn', payment: '기업은행' },
    { id: 'ledgerForecastSourceBtn', payment: '잔액전망' }
  ];

  sourceButtons.forEach(({ id, payment }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const tagColor = getLedgerTagColor(colorSettings, 'payment', payment);
    if (tagColor) {
      btn.style.setProperty('--chip-color', tagColor);
      btn.style.borderColor = tagColor;
      if (btn.classList.contains('active')) {
        btn.style.backgroundColor = tagColor;
        btn.style.color = '#0F172A';
      } else {
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    }
  });

  // 18개 필터 칩(사용자/사용처) 커스텀 색상 실시간 반영
  document.querySelectorAll('#ledgerPersonSwitch .filter-chip[data-ledger-filter-type]').forEach(chip => {
    const fType = chip.dataset.ledgerFilterType;
    const fVal = chip.dataset.ledgerFilterValue;
    if (!fType || !fVal) return;
    const tagColor = getLedgerTagColor(colorSettings, fType, fVal);
    if (tagColor) {
      chip.style.borderColor = tagColor;
      if (chip.classList.contains('active')) {
        chip.style.backgroundColor = tagColor;
        chip.style.color = '#0F172A';
      } else {
        chip.style.backgroundColor = '';
        chip.style.color = '';
      }
    }
  });
}

function applyLedgerDataSources() {
  updateLedgerPeriodTitle();
  applySourceButtonColors();
  renderLedgerTable();
  updateMultiActionBar();
  updateCopyBufferBar();
}

function initLedgerApp() {
  bindLedgerDomEvents();
  initAverageBalanceModal();
  bindLedgerListActions({
    onRowClick: (id) => {
      const rec = findLedgerTransaction(id);
      if (rec) {
        if (ledgerState.multiEditMode) {
          toggleMultiSelectRow(rec.id);
        } else {
          getLedgerTransactionModal().open({ isEdit: true, record: rec });
        }
      }
    },
    onReorder: async (orderedIds) => {
      if (isSavingForecastOrders) return;
      isSavingForecastOrders = true;
      try {
        if (ledgerState.source === 'forecast') {
          saveForecastOrderMap(orderedIds);
          await saveForecastOrders(orderedIds);
        } else {
          const sheetName = ledgerState.source === 'card' ? ledgerState.payment : (ledgerState.source === 'cash' ? '현금' : '기업은행');
          await reorderLedgerRecords(sheetName, orderedIds);
        }
        showLedgerToast('순서가 저장되었습니다.');
      } catch (e) {
        console.error('Error saving orders:', e);
      } finally {
        isSavingForecastOrders = false;
      }
    }
  });

  if (!ledgerState.recordsLoaded) {
    const badge = document.getElementById('ledgerDataBadge');
    if (badge) badge.textContent = 'DB 로딩 중...';

    fetchLedgerData().then(res => {
      ledgerState.records = res.records || [];
      ledgerState.recordsLoaded = true;
      if (badge) badge.textContent = '최신 거래 반영';
      applyLedgerDataSources();
    }).catch(err => {
      console.error('Ledger data load error:', err);
      if (badge) badge.textContent = '오프라인';
    });

    syncForecastAggregateOverridesFromDB();
  } else {
    applyLedgerDataSources();
  }
}

let isDomEventsBound = false;

function bindLedgerDomEvents() {
  if (isDomEventsBound) return;
  isDomEventsBound = true;

  // 1. 전체 / 월간 서브메뉴 전환
  const allViewBtn = document.getElementById('ledgerAllViewBtn');
  const monthlyViewBtn = document.getElementById('ledgerMonthlyViewBtn');
  if (allViewBtn && monthlyViewBtn) {
    allViewBtn.addEventListener('click', () => {
      allViewBtn.classList.add('active');
      monthlyViewBtn.classList.remove('active');
      applyLedgerDataSources();
    });
    monthlyViewBtn.addEventListener('click', () => {
      monthlyViewBtn.classList.add('active');
      allViewBtn.classList.remove('active');
      applyLedgerDataSources();
    });
  }

  // 1-1. 이전 / 다음 / 오늘 버튼 바인딩 (Day 1 고정으로 날짜 오버플로우 100% 방지)
  document.getElementById('ledgerPrevPeriodBtn')?.addEventListener('click', () => {
    const cur = ledgerState.monthCursor instanceof Date ? ledgerState.monthCursor : new Date();
    ledgerState.monthCursor = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
    applyLedgerDataSources();
  });
  document.getElementById('ledgerNextPeriodBtn')?.addEventListener('click', () => {
    const cur = ledgerState.monthCursor instanceof Date ? ledgerState.monthCursor : new Date();
    ledgerState.monthCursor = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    applyLedgerDataSources();
  });
  document.getElementById('ledgerLatestBtn')?.addEventListener('click', () => {
    const now = new Date();
    ledgerState.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    applyLedgerDataSources();
  });

  // 1-2. 거래 입력 버튼 바인딩 (전체 뷰 & 월간 뷰)
  document.getElementById('ledgerToggleEntryBtn')?.addEventListener('click', () => {
    getLedgerTransactionModal().open({ isEdit: false });
  });
  document.getElementById('ledgerMonthlyToggleEntryBtn')?.addEventListener('click', () => {
    getLedgerTransactionModal().open({ isEdit: false });
  });

  // 1-3. 0원 상계 묶음 버튼 바인딩
  document.getElementById('ledgerBulkOffsetBtn')?.addEventListener('click', () => {
    createOffsetGroupFromSelection();
  });

  // 1-4. 필터 토글 버튼 바인딩
  document.getElementById('ledgerPersonFilterToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('ledgerPersonFilterOptions');
    dropdown?.classList.toggle('hidden');
  });
  document.getElementById('ledgerCategoryFilterToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('ledgerCategoryFilterOptions');
    dropdown?.classList.toggle('hidden');
  });

  // 1-5. 평균잔액 계산기 거래 추가 버튼 바인딩
  document.getElementById('ledgerAverageAddTransactionBtn')?.addEventListener('click', () => {
    showLedgerToast('거래 추가');
  });

  // 1-6. 잔액 계산 모드 토글 버튼 바인딩 (기본: 생활비 전용 / 클릭: 전체 시계열 일치)
  const balanceModeBtn = document.getElementById('ledgerBalanceModeToggleBtn');
  if (balanceModeBtn) {
    balanceModeBtn.addEventListener('click', () => {
      balanceModeBtn.classList.toggle('active');
      ledgerState.balanceMode = balanceModeBtn.classList.contains('active') ? 'global' : 'local';
      applyLedgerDataSources();
    });
  }

  // 2. 월/기간 선택 타이틀 클릭 시 월 선택 모달 열기
  const periodTitle = document.getElementById('ledgerPeriodTitle');
  if (periodTitle) {
    periodTitle.addEventListener('click', () => {
      const cur = ledgerState.monthCursor instanceof Date ? ledgerState.monthCursor : new Date();
      openMonthSelectModal({
        selectedYear: cur.getFullYear(),
        selectedMonth: cur.getMonth() + 1,
        onSelect: (year, month) => {
          ledgerState.monthCursor = new Date(year, month - 1, 1);
          applyLedgerDataSources();
        }
      });
    });
  }

  // 3. 지출 리포트 & 색상 설정 모달 버튼
  document.getElementById('ledgerReportBtn')?.addEventListener('click', () => {
    openLedgerReportModal();
  });
  document.getElementById('ledgerReportCloseBtn')?.addEventListener('click', () => {
    document.getElementById('ledgerReportOverlay')?.classList.remove('active');
  });
  document.getElementById('ledgerReportOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'ledgerReportOverlay') e.currentTarget.classList.remove('active');
  });

  document.getElementById('ledgerColorSettingsBtn')?.addEventListener('click', () => {
    getLedgerColorSettings().open();
  });

  const sourceButtons = [
    { id: 'ledgerCashSourceBtn', source: 'cash', payment: '현금' },
    { id: 'ledgerCompanyCardBtn', source: 'card', payment: '기업카드' },
    { id: 'ledgerTossBankBtn', source: 'card', payment: '토스은행' },
    { id: 'ledgerBankSourceBtn', source: 'bank', payment: '기업은행' },
    { id: 'ledgerForecastSourceBtn', source: 'forecast', payment: '' }
  ];

  sourceButtons.forEach(btnInfo => {
    const btn = document.getElementById(btnInfo.id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      sourceButtons.forEach(b => document.getElementById(b.id)?.classList.remove('active'));
      btn.classList.add('active');
      ledgerState.source = btnInfo.source;
      if (btnInfo.payment) ledgerState.payment = btnInfo.payment;
      applyLedgerDataSources();
    });
  });

  const refreshBtn = document.getElementById('ledgerRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const badge = document.getElementById('ledgerDataBadge');
      if (badge) badge.textContent = '동기화 중...';
      fetchLedgerData().then(res => {
        ledgerState.records = res.records || [];
        if (badge) badge.textContent = '최신 거래 반영';
        applyLedgerDataSources();
      }).catch(err => {
        console.error('Ledger refresh error:', err);
        if (badge) badge.textContent = '오프라인';
      });
    });
  }

  const multiToggleBtn = document.getElementById('ledgerToggleMultiEditBtn');
  if (multiToggleBtn) {
    multiToggleBtn.addEventListener('click', () => {
      setMultiEditMode(!ledgerState.multiEditMode);
    });
  }

  const bulkCopyBtn = document.getElementById('ledgerBulkCopyBtn');
  if (bulkCopyBtn) {
    bulkCopyBtn.addEventListener('click', () => {
      executeLedgerCopy({
        selectedLedgerIds: ledgerState.selectedLedgerIds,
        findRecordFn: (id) => findLedgerRecordById(id, { ledgerState }),
        setCopiedRecords: (recs) => { ledgerState.copiedRecords = recs; },
        updateCopyBufferBar
      });
    });
  }

  const bulkDeleteBtn = document.getElementById('ledgerBulkDeleteBtn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
      executeLedgerDelete({
        selectedLedgerIds: ledgerState.selectedLedgerIds,
        findRecordFn: (id) => findLedgerRecordById(id, { ledgerState }),
        applyOptimisticDelete,
        deleteBatchFn: deleteLedgerRecordsBatch,
        setMultiEditMode
      });
    });
  }

  const bulkPasteBtn = document.getElementById('ledgerBulkPasteBtn');
  if (bulkPasteBtn) {
    bulkPasteBtn.addEventListener('click', () => {
      executeLedgerPaste({
        copiedRecords: ledgerState.copiedRecords,
        ledgerState,
        ledgerSheetNameForRecord,
        applyOptimisticSave,
        insertBatchFn: insertLedgerRecordsBatch,
        onComplete: () => {
          setMultiEditMode(false);
          applyLedgerDataSources();
        }
      });
    });
  }

  const clearCopyBtn = document.getElementById('ledgerClearCopyBtn');
  if (clearCopyBtn) {
    clearCopyBtn.addEventListener('click', () => {
      ledgerState.copiedRecords = [];
      updateCopyBufferBar();
      showLedgerToast('복사가 취소되었습니다.');
    });
  }

  const cancelMultiBtn = document.getElementById('ledgerCancelMultiEditBtn');
  if (cancelMultiBtn) {
    cancelMultiBtn.addEventListener('click', () => {
      setMultiEditMode(false);
    });
  }

  const filterAllBtn = document.getElementById('ledgerFilterAllBtn');
  if (filterAllBtn) {
    filterAllBtn.addEventListener('click', () => {
      ledgerState.filters = { person: new Set(), category: new Set(), fixed: 'all' };
      document.querySelectorAll('#ledgerPersonSwitch .filter-chip').forEach(b => b.classList.remove('active'));
      filterAllBtn.classList.add('active');
      applyLedgerDataSources();
    });
  }

  const fixedFilterBtn = document.getElementById('ledgerFixedFilterBtn');
  if (fixedFilterBtn) {
    fixedFilterBtn.addEventListener('click', () => {
      const isFixed = ledgerState.filters?.fixed === 'fixed';
      if (!ledgerState.filters) ledgerState.filters = { person: new Set(), category: new Set(), fixed: 'all' };
      ledgerState.filters.fixed = isFixed ? 'all' : 'fixed';
      fixedFilterBtn.classList.toggle('active', !isFixed);
      applyLedgerDataSources();
    });
  }

  const offsetFilterBtn = document.getElementById('ledgerOffsetFilterBtn');
  if (offsetFilterBtn) {
    offsetFilterBtn.addEventListener('click', () => {
      ledgerState.showOffsetGroups = !ledgerState.showOffsetGroups;
      offsetFilterBtn.classList.toggle('active', ledgerState.showOffsetGroups);
      applyLedgerDataSources();
    });
  }

  // 1-5. 사용자 / 사용처 드롭다운 칩 다중 중복 선택 바인딩 (이벤트 위임)
  const filterSwitchContainer = document.getElementById('ledgerPersonSwitch');
  if (filterSwitchContainer) {
    filterSwitchContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip[data-ledger-filter-type]');
      if (!chip) return;
      e.stopPropagation();

      const filterType = chip.dataset.ledgerFilterType;
      const filterValue = chip.dataset.ledgerFilterValue;
      if (!filterType || !filterValue) return;

      if (!ledgerState.filters) ledgerState.filters = { person: new Set(), category: new Set(), fixed: 'all' };
      if (!ledgerState.filters.person) ledgerState.filters.person = new Set();
      if (!ledgerState.filters.category) ledgerState.filters.category = new Set();

      const targetSet = filterType === 'person' ? ledgerState.filters.person : ledgerState.filters.category;
      if (targetSet.has(filterValue)) {
        targetSet.delete(filterValue);
        chip.classList.remove('active');
      } else {
        targetSet.add(filterValue);
        chip.classList.add('active');
      }

      // 전체 버튼 활성화 상태 동기화
      const hasAnyFilter = ledgerState.filters.person.size > 0 || ledgerState.filters.category.size > 0 || (ledgerState.filters.fixed && ledgerState.filters.fixed !== 'all');
      if (filterAllBtn) filterAllBtn.classList.toggle('active', !hasAnyFilter);

      applyLedgerDataSources();
    });
  }
}

// Global initialization and Realtime subscription
export function initLedgerView() {
  const scheduleMenuBtn = document.getElementById('scheduleMenuBtn');
  const ledgerMenuBtn = document.getElementById('ledgerMenuBtn');

  if (scheduleMenuBtn) scheduleMenuBtn.addEventListener('click', showScheduleViewTab);
  if (ledgerMenuBtn) ledgerMenuBtn.addEventListener('click', showLedgerViewTab);

  bindLedgerDomEvents();

  initAverageBalanceModal({
    getLedgerRecords: () => ledgerState.records,
    getTransactionModal: () => getLedgerTransactionModal()
  });

  registerColorUpdateCallback(() => {
    if (ledgerState.active) applyLedgerDataSources();
  });

  const handleLedgerRealtimeSync = () => {
    fetchLedgerData().then(res => {
      ledgerState.records = res.records || [];
      applyLedgerDataSources();
      syncBankCardBillRecords({ allRecords: ledgerState.records, upsertRecordFn: upsertLedgerRecord });
    });
  };

  registerRealtimeCallbacks({
    onLedgerChange: handleLedgerRealtimeSync
  });

  bindLedgerListActions({
    onRowClick: (id) => {
      const rec = findLedgerTransaction(id);
      if (rec) {
        if (ledgerState.multiEditMode) {
          toggleMultiSelectRow(rec.id);
        } else {
          getLedgerTransactionModal().open({ isEdit: true, record: rec });
        }
      }
    },
    onReorder: async (orderedIds) => {
      if (isSavingForecastOrders) return;
      isSavingForecastOrders = true;
      try {
        if (ledgerState.source === 'forecast') {
          // 🔮 1. 잔액전망 전용: 통장 order_index는 1도 안 건드리고 forecast_order_index만 갱신!
          orderedIds.forEach((id, idx) => {
            const rec = (ledgerState.records || []).find(r => String(r.id) === String(id));
            if (rec) rec.forecast_order_index = (idx + 1) * 10;
          });
          await reorderForecastRecords(orderedIds);
        } else {
          // 🏦 2. 개별 은행 통장 전용: 해당 통장의 order_index만 갱신!
          orderedIds.forEach((id, idx) => {
            const rec = (ledgerState.records || []).find(r => String(r.id) === String(id));
            if (rec) {
              rec.order_index = (idx + 1) * 10;
              rec.orderIndex = (idx + 1) * 10;
            }
          });
          const sheetName = ledgerState.source === 'card' ? ledgerState.payment : (ledgerState.source === 'cash' ? '현금' : '기업은행');
          await reorderLedgerRecords(sheetName, orderedIds);
        }
        showLedgerToast('순서가 저장되었습니다.');
      } catch (e) {
        console.error('Error saving orders:', e);
      } finally {
        isSavingForecastOrders = false;
      }
    }
  });

  return {
    enter: showLedgerViewTab,
    leave: () => { ledgerState.active = false; }
  };
}

export function refreshLedgerData() {
  fetchLedgerData().then(res => {
    ledgerState.records = res.records || [];
    ledgerState.recordsLoaded = true;
    applyLedgerDataSources();
  }).catch(e => console.warn('Auto refreshLedgerData error:', e));
}

/**
 * 백그라운드 가계부 데이터 동시 사전 로드 (로그인 직후 병렬 프리페치)
 */
export function preloadLedgerData() {
  if (ledgerState.recordsLoaded) return;
  fetchLedgerData().then(res => {
    ledgerState.records = res.records || [];
    ledgerState.recordsLoaded = true;
    syncForecastAggregateOverridesFromDB();
    syncBankCardBillRecords({ allRecords: ledgerState.records, upsertRecordFn: upsertLedgerRecord });
  }).catch(e => console.warn('Background ledger prefetch notice:', e));
}

export function setLedgerRecordsForTesting(records) {
  ledgerState.records = records || [];
  applyLedgerDataSources();
}

export { initLedgerApp };
