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
  let hasMoved = false;

  function shiftDraggedRowsTo(targetId, clientY) {
    if (!draggedId || !targetId || targetId === draggedId) return;

    const draggedRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`));
    const targetRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${targetId}"]`));
    if (draggedRows.length === 0 || targetRows.length === 0) return;

    const topRect = targetRows[0].getBoundingClientRect();
    const bottomRect = targetRows[targetRows.length - 1].getBoundingClientRect();
    const targetCenterY = (topRect.top + bottomRect.bottom) / 2;

    const parent = targetRows[0].parentNode;
    if (!parent) return;

    if (clientY < targetCenterY) {
      // 타겟 묶음 위로 즉시 이동
      const firstTarget = targetRows[0];
      if (draggedRows[draggedRows.length - 1].nextSibling !== firstTarget) {
        draggedRows.forEach(r => parent.insertBefore(r, firstTarget));
        hasMoved = true;
      }
    } else {
      // 타겟 묶음 아래로 즉시 이동
      const nextSibling = targetRows[targetRows.length - 1].nextSibling;
      if (draggedRows[0] !== nextSibling) {
        draggedRows.forEach(r => parent.insertBefore(r, nextSibling));
        hasMoved = true;
      }
    }
  }

  function commitFinalOrder() {
    if (draggedId && hasMoved) {
      const orderedIds = [];
      const seen = new Set();
      listEl.querySelectorAll('tr[data-ledger-id]').forEach(r => {
        const id = r.dataset.ledgerId;
        if (id && !seen.has(id)) {
          seen.add(id);
          orderedIds.push(id);
        }
      });
      if (orderedIds.length > 0) {
        onReorder(orderedIds);
      }
    }
    cleanupDragState(listEl);
    draggedId = null;
    hasMoved = false;
  }

  // 1. PC Drag & Drop
  listEl.addEventListener('dragstart', e => {
    const row = e.target.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return;
    draggedId = row.dataset.ledgerId;
    hasMoved = false;
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

    shiftDraggedRowsTo(targetRow.dataset.ledgerId, e.clientY);
  });

  listEl.addEventListener('drop', e => {
    if (e.preventDefault) e.preventDefault();
    commitFinalOrder();
  });

  listEl.addEventListener('dragend', () => {
    commitFinalOrder();
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
        hasMoved = false;
        listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`).forEach(r => r.classList.add('touch-holding', 'dragging'));
        if (navigator.vibrate) navigator.vibrate(35);
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
      shiftDraggedRowsTo(targetRow.dataset.ledgerId, touchY);
    }
  }, { passive: false });

  listEl.addEventListener('touchend', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    commitFinalOrder();
    touchTargetRow = null;
  });

  listEl.addEventListener('touchcancel', () => {
    if (touchTimer) clearTimeout(touchTimer);
    commitFinalOrder();
    touchTargetRow = null;
  });
}

function cleanupDragState(listEl) {
  listEl.querySelectorAll('.dragging, .touch-holding').forEach(el => {
    el.classList.remove('dragging', 'touch-holding');
  });
}