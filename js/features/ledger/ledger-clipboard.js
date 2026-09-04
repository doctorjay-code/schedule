/**
 * Ledger Clipboard & Multi-Selection Engine
 * Handles batch copying, cross-month pasting with billing cycle calculation, and batch deletions.
 */

import { generateLedgerId } from './ledger-utils.js';

let toastTimer = null;

export function showLedgerToast(message) {
  const toast = document.getElementById('ledgerToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 1800);
}

export function findLedgerRecordById(id, { ledgerState = {}, ledgerDataSources = {} } = {}) {
  const sId = String(id || '');
  if (!sId) return null;

  // 1. Direct record in primary list
  if (Array.isArray(ledgerState.records)) {
    const found = ledgerState.records.find(r => String(r.id) === sId);
    if (found) return found;
  }

  // 2. Check in all datasources (card, bank, cash, forecast)
  if (ledgerDataSources) {
    for (const key of Object.keys(ledgerDataSources)) {
      const list = ledgerDataSources[key];
      if (Array.isArray(list)) {
        const found = list.find(r => String(r.id) === sId);
        if (found) return found;
      }
    }
  }

  return null;
}

export function executeLedgerCopy({
  selectedLedgerIds,
  findRecordFn,
  setCopiedRecords,
  updateCopyBufferBar
}) {
  if (!selectedLedgerIds || selectedLedgerIds.size === 0) {
    showLedgerToast('⚠️ 복사할 거래를 선택해주세요.');
    return;
  }

  const recordsToCopy = Array.from(selectedLedgerIds)
    .map(id => findRecordFn(id))
    .filter(Boolean);

  if (recordsToCopy.length === 0) {
    showLedgerToast('⚠️ 복사할 거래 정보를 찾을 수 없습니다.');
    return;
  }

  setCopiedRecords(recordsToCopy);
  updateCopyBufferBar();
  showLedgerToast(`📋 ${recordsToCopy.length}건의 거래가 복사되었습니다.`);
}

export function executeLedgerDelete({
  selectedLedgerIds,
  findRecordFn,
  applyOptimisticDelete,
  deleteBatchFn,
  setMultiEditMode
}) {
  if (!selectedLedgerIds || selectedLedgerIds.size === 0) {
    showLedgerToast('⚠️ 삭제할 거래를 선택해주세요.');
    return;
  }

  const count = selectedLedgerIds.size;
  if (!confirm(`선택한 ${count}건의 거래를 모두 삭제할까요?`)) return;

  const recordsToDelete = Array.from(selectedLedgerIds)
    .map(id => findRecordFn(id))
    .filter(Boolean);

  if (recordsToDelete.length === 0) {
    showLedgerToast('⚠️ 삭제할 거래 정보를 찾을 수 없습니다.');
    return;
  }

  for (const record of recordsToDelete) {
    applyOptimisticDelete(record);
  }

  setMultiEditMode(false);
  showLedgerToast(`🗑️ ${recordsToDelete.length}건의 거래가 삭제되었습니다.`);

  const idsToDelete = recordsToDelete.map(r => r.id).filter(Boolean);
  if (idsToDelete.length > 0) {
    deleteBatchFn(idsToDelete).catch(error => {
      console.error('Multi-delete error:', error);
    });
  }
}

export function executeLedgerPaste({
  copiedRecords,
  ledgerState,
  ledgerSheetNameForRecord,
  applyOptimisticSave,
  insertBatchFn,
  onComplete
}) {
  if (!copiedRecords || copiedRecords.length === 0) {
    showLedgerToast('복사된 거래가 없습니다.');
    return;
  }

  const isCompanyCard = ledgerState.source === 'card' && ledgerState.payment === '기업카드';
  const targetYear = ledgerState.monthCursor.getFullYear();
  const targetMonth = ledgerState.monthCursor.getMonth(); // 0-indexed (0=1월, 7=8월, 8=9월)

  const newRecords = [];
  const recordsToSave = [...copiedRecords];

  for (let i = 0; i < recordsToSave.length; i++) {
    const item = recordsToSave[i];
    const origParts = String(item.date || '').split('-');
    const origDay = origParts.length === 3 ? parseInt(origParts[2], 10) || 1 : 1;

    let newDate = '';
    if (isCompanyCard) {
      // 기업카드 13일 정산 주기 스마트 계산
      let calcYear = targetYear;
      let calcMonth = targetMonth;
      if (calcYear === 2026 && targetMonth <= 1) {
        calcMonth = targetMonth;
      } else {
        if (origDay >= 13) {
          calcMonth = targetMonth - 1;
          if (calcMonth < 0) {
            calcMonth = 11;
            calcYear -= 1;
          }
        } else {
          calcMonth = targetMonth;
        }
      }
      const maxDays = new Date(calcYear, calcMonth + 1, 0).getDate();
      const clampedDay = Math.min(origDay, maxDays);
      newDate = `${calcYear}-${String(calcMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    } else {
      // 일반 결제수단 (토스/현금/기업은행): 당월 1일~말일
      const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
      const clampedDay = Math.min(origDay, maxDays);
      newDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    }

    const newId = generateLedgerId(newDate, i);

    const newRecord = {
      ...item,
      id: newId,
      date: newDate,
      balance: '',
      createdAt: Date.now() + i
    };
    newRecord.sheetName = ledgerSheetNameForRecord(newRecord);

    newRecords.push(newRecord);
    applyOptimisticSave(newRecord);
  }

  if (onComplete) onComplete();
  showLedgerToast(`📋 ${newRecords.length}건의 거래가 ${targetMonth + 1}월 화면으로 복사되었습니다.`);

  if (newRecords.length > 0) {
    insertBatchFn(newRecords).catch(error => {
      console.error('Multi-insert paste error:', error);
    });
  }
}
