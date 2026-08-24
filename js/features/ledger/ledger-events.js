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
  let placeholderRow = null;
  let longTouchTimer = null;

  function createPlaceholder() {
    const tr = document.createElement('tr');
    tr.className = 'ledger-drag-placeholder';
    const tdDate = document.createElement('td');
    tdDate.className = 'cell-date';
    tdDate.style.width = '74px';
    const tdContent = document.createElement('td');
    tdContent.colSpan = 6;
    tr.appendChild(tdDate);
    tr.appendChild(tdContent);
    return tr;
  }

  function startDrag() {
    if (isDragging || !draggedId) return;
    isDragging = true;
    document.body.classList.add('ledger-is-dragging');
    draggedRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`));
    draggedRows.forEach(r => r.classList.add('dragging', 'touch-holding'));

    placeholderRow = createPlaceholder();
    if (draggedRows.length > 0 && draggedRows[0].parentNode) {
      draggedRows[0].parentNode.insertBefore(placeholderRow, draggedRows[0]);
    }
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

    // 모바일 터치: 220ms 롱터치 안정 타이머
    if (e.pointerType === 'touch') {
      longTouchTimer = setTimeout(() => {
        startDrag();
      }, 220);
    }
  });

  listEl.addEventListener('pointermove', e => {
    if (!draggedId || e.pointerId !== activePointerId) return;

    const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);

    // PC 마우스: 6px 이상 움직이면 즉시 드래그
    if (!isDragging && e.pointerType !== 'touch' && moveDist > 6) {
      startDrag();
    } else if (!isDragging && e.pointerType === 'touch' && moveDist > 12) {
      // 모바일: 롱터치 전 손가락이 많이 움직이면 일반 스크롤로 간주
      if (longTouchTimer) {
        clearTimeout(longTouchTimer);
        longTouchTimer = null;
      }
    }

    if (!isDragging || !placeholderRow) return;

    if (e.cancelable) e.preventDefault();

    // 마우스/터치 지점의 타겟 행 탐색
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
      if (placeholderRow.nextSibling !== firstTarget) {
        parent.insertBefore(placeholderRow, firstTarget);
      }
    } else {
      const nextSibling = targetRows[targetRows.length - 1]?.nextSibling;
      if (placeholderRow !== nextSibling && placeholderRow.nextSibling !== nextSibling) {
        parent.insertBefore(placeholderRow, nextSibling);
      }
    }
  });

  const endDrag = e => {
    if (longTouchTimer) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }
    if (e && e.pointerId !== activePointerId) return;

    if (isDragging && draggedId && placeholderRow && placeholderRow.parentNode) {
      onDragFinished();
      const parent = placeholderRow.parentNode;
      draggedRows.forEach(r => parent.insertBefore(r, placeholderRow));
      placeholderRow.remove();
      placeholderRow = null;

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
    } else if (placeholderRow) {
      placeholderRow.remove();
      placeholderRow = null;
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