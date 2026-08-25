/**
 * Ledger Clipboard & Multi-Selection Engine
 * Handles batch copying, cross-month pasting with billing cycle calculation, and batch deletions.
 */

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
  const allPool = [
    ...(ledgerState.records || []),
    ...(ledgerDataSources.card || []),
    ...(ledgerDataSources.cash || []),
    ...(ledgerDataSources.bank || []),
    ...(ledgerDataSources.forecast || [])
  ];
  return allPool.find(item => item && String(item.id) === String(id)) || null;
}

export function executeLedgerCopy({
  selectedLedgerIds,
  findRecordFn,
  setMultiEditMode
}) {
  if (!selectedLedgerIds || selectedLedgerIds.size === 0) {
    alert('복사할 거래를 선택해주세요.');
    return [];
  }

  const copied = Array.from(selectedLedgerIds)
    .map(id => findRecordFn(id))
    .filter(Boolean)
    .map(r => JSON.parse(JSON.stringify(r)));

  if (copied.length === 0) {
    alert('선택된 거래 정보를 찾을 수 없습니다.');
    return [];
  }

  const copyBar = document.getElementById('ledgerCopyBufferBar');
  const copyLabel = document.getElementById('ledgerCopiedItemLabel');
  if (copyLabel) copyLabel.textContent = `${copied.length}건`;
  copyBar?.classList.remove('hidden');

  setMultiEditMode(false);
  return copied;
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
      if (targetMonth <= 1) {
        calcMonth = targetMonth;
      } else {
        if (origDay >= 13) calcMonth = targetMonth - 1;
        else calcMonth = targetMonth;
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

    const newId = 'cp_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);

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

  insertBatchFn(newRecords).catch(error => {
    console.error('Paste sync error:', error);
    showLedgerToast('⚠️ DB 저장 동기화 지연 중 (로컬 반영 완료)');
  });
}
