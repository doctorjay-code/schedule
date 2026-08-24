// Ledger list action event responsibility.
export function bindLedgerListActions({ onRowClick, onOpen, onReorder }) {
  const handler = onRowClick || onOpen;
  const listIds = ['ledgerTransactionList', 'ledgerMonthlyTransactionList', 'fundplanAllTimeList'];

  const handleLedgerListAction = event => {
    // 드래그 중 클릭 방지
    if (document.querySelector('.schedule-row.dragging')) return;
    const row = event.target.closest('tr[data-ledger-id]');
    if (row && row.dataset.ledgerReadOnly !== 'true') {
      handler(row.dataset.ledgerId, event);
    }
  };

  listIds.forEach(id => {
    const listEl = document.getElementById(id);
    if (!listEl) return;

    listEl.addEventListener('click', handleLedgerListAction);

    if (onReorder) {
      bindDragAndDropEvents(listEl, onReorder);
    }
  });
}

function bindDragAndDropEvents(listEl, onReorder) {
  let draggedId = null;
  let activeDropTarget = null;
  let insertAfter = false;

  // 1. PC Drag & Drop
  listEl.addEventListener('dragstart', e => {
    const row = e.target.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return;
    draggedId = row.dataset.ledgerId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', draggedId);
      e.dataTransfer.effectAllowed = 'move';
    }
    setTimeout(() => {
      listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`).forEach(r => r.classList.add('dragging'));
    }, 0);
  });

  listEl.addEventListener('dragover', e => {
    if (e.preventDefault) e.preventDefault();
    if (!draggedId) return;
    const targetRow = e.target.closest('tr[data-ledger-id]');
    if (!targetRow || targetRow.dataset.ledgerId === draggedId) return;

    const rect = targetRow.getBoundingClientRect ? targetRow.getBoundingClientRect() : { top: 0, height: 40 };
    insertAfter = e.clientY > rect.top + rect.height / 2;

    listEl.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    const relatedRows = listEl.querySelectorAll(`tr[data-ledger-id="${targetRow.dataset.ledgerId}"]`);
    if (relatedRows.length > 0) {
      const edgeRow = insertAfter ? relatedRows[relatedRows.length - 1] : relatedRows[0];
      edgeRow.classList.add(insertAfter ? 'drag-over-bottom' : 'drag-over-top');
    }
    activeDropTarget = targetRow.dataset.ledgerId;
  });

  listEl.addEventListener('dragleave', e => {
    const related = e.relatedTarget;
    if (!related || !listEl.contains(related)) {
      listEl.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    }
  });

  listEl.addEventListener('drop', e => {
    if (e.preventDefault) e.preventDefault();
    if (draggedId && activeDropTarget && draggedId !== activeDropTarget) {
      onReorder(draggedId, activeDropTarget, insertAfter);
    }
    cleanupDragState(listEl);
  });

  listEl.addEventListener('dragend', () => {
    cleanupDragState(listEl);
  });

  // 2. 모바일 Touch Drag & Drop (롱터치 지원)
  let touchTimer = null;
  let touchTargetRow = null;
  let touchStartY = 0;

  listEl.addEventListener('touchstart', e => {
    const row = e.target.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return;
    touchTargetRow = row;
    touchStartY = e.touches[0].clientY;

    touchTimer = setTimeout(() => {
      if (touchTargetRow) {
        draggedId = touchTargetRow.dataset.ledgerId;
        listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`).forEach(r => r.classList.add('touch-holding', 'dragging'));
        if (navigator.vibrate) navigator.vibrate(40);
      }
    }, 250);
  }, { passive: true });

  listEl.addEventListener('touchmove', e => {
    const touchY = e.touches[0].clientY;
    if (!draggedId) {
      if (Math.abs(touchY - touchStartY) > 10 && touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      return;
    }

    e.preventDefault(); // 드래그 중 스크롤 방지
    const el = document.elementFromPoint(e.touches[0].clientX, touchY);
    const targetRow = el ? el.closest('tr[data-ledger-id]') : null;

    listEl.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));

    if (targetRow && targetRow.dataset.ledgerId !== draggedId) {
      const rect = targetRow.getBoundingClientRect();
      insertAfter = touchY > rect.top + rect.height / 2;
      const relatedRows = listEl.querySelectorAll(`tr[data-ledger-id="${targetRow.dataset.ledgerId}"]`);
      if (relatedRows.length > 0) {
        const edgeRow = insertAfter ? relatedRows[relatedRows.length - 1] : relatedRows[0];
        edgeRow.classList.add(insertAfter ? 'drag-over-bottom' : 'drag-over-top');
      }
      activeDropTarget = targetRow.dataset.ledgerId;
    }
  }, { passive: false });

  listEl.addEventListener('touchend', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    if (draggedId && activeDropTarget && draggedId !== activeDropTarget) {
      onReorder(draggedId, activeDropTarget, insertAfter);
    }
    cleanupDragState(listEl);
    draggedId = null;
    touchTargetRow = null;
  });

  listEl.addEventListener('touchcancel', () => {
    if (touchTimer) clearTimeout(touchTimer);
    cleanupDragState(listEl);
    draggedId = null;
    touchTargetRow = null;
  });
}

function cleanupDragState(listEl) {
  listEl.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom, .touch-holding').forEach(el => {
    el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom', 'touch-holding');
  });
}