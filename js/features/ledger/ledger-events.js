// Ledger list action event responsibility.
export function bindLedgerListActions({ onRowClick, onOpen, onReorder }) {
  const handler = onRowClick || onOpen;
  const listIds = ['ledgerTransactionList', 'ledgerMonthlyTransactionList', 'fundplanAllTimeList'];
  let globalJustDragged = false;

  listIds.forEach(id => {
    const listEl = document.getElementById(id);
    if (!listEl) return;

    listEl.addEventListener('click', event => {
      if (globalJustDragged) return;
      const row = event.target.closest('tr[data-ledger-id]');
      if (row && row.dataset.ledgerReadOnly !== 'true') {
        handler(row.dataset.ledgerId, event);
      }
    });

    if (onReorder) {
      bindPointerDragEngine(listEl, onReorder, () => {
        globalJustDragged = true;
        setTimeout(() => { globalJustDragged = false; }, 100);
      });
    }
  });
}

function bindPointerDragEngine(listEl, onReorder, onDragFinished) {
  let activePointerId = null;
  let draggedId = null;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let draggedRows = [];
  let longTouchTimer = null;

  function startDrag() {
    if (isDragging || !draggedId) return;
    isDragging = true;
    document.body.classList.add('ledger-is-dragging');
    draggedRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`));
    draggedRows.forEach(r => r.classList.add('dragging', 'touch-holding'));
    if (navigator.vibrate) navigator.vibrate(35);
  }

  listEl.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, select, textarea, a, .color-indicator')) return;
    const row = e.target.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return;

    activePointerId = e.pointerId;
    draggedId = row.dataset.ledgerId;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
    draggedRows = [];

    // 모바일 터치 시 180ms 롱터치 타이머
    if (e.pointerType === 'touch') {
      longTouchTimer = setTimeout(() => {
        startDrag();
      }, 180);
    }
  });

  listEl.addEventListener('pointermove', e => {
    if (!draggedId || e.pointerId !== activePointerId) return;

    const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);

    // PC 마우스는 5px 움직이면 즉시 드래그 시작
    if (!isDragging && e.pointerType !== 'touch' && moveDist > 5) {
      startDrag();
    } else if (!isDragging && e.pointerType === 'touch' && moveDist > 10) {
      // 터치 중 손가락이 많이 움직이면 스크롤로 간주하여 롱터치 취소
      if (longTouchTimer) {
        clearTimeout(longTouchTimer);
        longTouchTimer = null;
      }
    }

    if (!isDragging) return;

    if (e.cancelable) e.preventDefault();

    // 실시간 자리 비켜주기 (Live DOM Displacement)
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetRow = el ? el.closest('tr[data-ledger-id]') : null;
    if (!targetRow || targetRow.dataset.ledgerId === draggedId) return;

    const targetId = targetRow.dataset.ledgerId;
    const targetRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${targetId}"]`));
    if (targetRows.length === 0) return;

    const topRect = targetRows[0].getBoundingClientRect();
    const bottomRect = targetRows[targetRows.length - 1].getBoundingClientRect();
    const targetCenterY = (topRect.top + bottomRect.bottom) / 2;
    const parent = targetRows[0].parentNode;
    if (!parent) return;

    if (e.clientY < targetCenterY) {
      const firstTarget = targetRows[0];
      if (draggedRows[draggedRows.length - 1]?.nextSibling !== firstTarget) {
        draggedRows.forEach(r => parent.insertBefore(r, firstTarget));
      }
    } else {
      const nextSibling = targetRows[targetRows.length - 1]?.nextSibling;
      if (draggedRows[0] !== nextSibling) {
        draggedRows.forEach(r => parent.insertBefore(r, nextSibling));
      }
    }
  });

  const endDrag = e => {
    if (longTouchTimer) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }
    if (e && e.pointerId !== activePointerId) return;

    if (isDragging && draggedId) {
      onDragFinished();
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

    document.body.classList.remove('ledger-is-dragging');
    draggedRows.forEach(r => r.classList.remove('dragging', 'touch-holding'));
    draggedId = null;
    activePointerId = null;
    isDragging = false;
  };

  listEl.addEventListener('pointerup', endDrag);
  listEl.addEventListener('pointercancel', endDrag);
}