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

  function updateSlotFeedback(targetId, clientY) {
    if (!targetId || targetId === draggedId) return;

    const relatedRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${targetId}"]`));
    if (relatedRows.length === 0) return;

    const topRect = relatedRows[0].getBoundingClientRect();
    const bottomRect = relatedRows[relatedRows.length - 1].getBoundingClientRect();
    const groupTop = topRect.top;
    const groupBottom = bottomRect.bottom;
    const groupHeight = Math.max(groupBottom - groupTop, 40);

    const relativeY = (clientY - groupTop) / groupHeight;

    // 35% 상단 / 30% 중앙 완충지대(이전 상태 유지) / 35% 하단
    if (relativeY < 0.4) {
      insertAfter = false;
    } else if (relativeY > 0.6) {
      insertAfter = true;
    }

    listEl.querySelectorAll('.drag-slot-above, .drag-slot-below, .drag-group-active').forEach(el => {
      el.classList.remove('drag-slot-above', 'drag-slot-below', 'drag-group-active');
    });

    relatedRows.forEach(r => r.classList.add('drag-group-active'));
    if (insertAfter) {
      relatedRows[relatedRows.length - 1].classList.add('drag-slot-below');
    } else {
      relatedRows[0].classList.add('drag-slot-above');
    }

    activeDropTarget = targetId;
  }

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

    updateSlotFeedback(targetRow.dataset.ledgerId, e.clientY);
  });

  listEl.addEventListener('dragleave', e => {
    const related = e.relatedTarget;
    if (!related || !listEl.contains(related)) {
      listEl.querySelectorAll('.drag-slot-above, .drag-slot-below, .drag-group-active').forEach(el => {
        el.classList.remove('drag-slot-above', 'drag-slot-below', 'drag-group-active');
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
    }, 220);
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

    e.preventDefault();
    const el = document.elementFromPoint(e.touches[0].clientX, touchY);
    const targetRow = el ? el.closest('tr[data-ledger-id]') : null;

    if (targetRow && targetRow.dataset.ledgerId !== draggedId) {
      updateSlotFeedback(targetRow.dataset.ledgerId, touchY);
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
  listEl.querySelectorAll('.dragging, .drag-slot-above, .drag-slot-below, .drag-group-active, .touch-holding').forEach(el => {
    el.classList.remove('dragging', 'drag-slot-above', 'drag-slot-below', 'drag-group-active', 'touch-holding');
  });
}