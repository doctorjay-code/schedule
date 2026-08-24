// Ledger list action event responsibility (Global Event Delegation Engine).
let isEngineBound = false;

export function bindLedgerListActions({ onRowClick, onOpen, onReorder }) {
  if (isEngineBound) return;
  isEngineBound = true;

  const handler = onRowClick || onOpen;
  let globalJustDragged = false;

  let activeContainer = null;
  let draggedId = null;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let draggedRows = [];
  let longTouchTimer = null;
  let hasMoved = false;

  function isLedgerRow(el) {
    if (!el) return null;
    if (el.closest('button, input, select, textarea, a, .color-indicator, .ledger-month-divider-row')) return null;
    const row = el.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return null;
    return row;
  }

  function startDrag(row) {
    if (isDragging || !row) return;
    activeContainer = row.parentNode;
    draggedId = row.dataset.ledgerId;
    if (!draggedId || !activeContainer) return;

    isDragging = true;
    hasMoved = false;
    document.body.classList.add('ledger-dragging-locked');
    draggedRows = Array.from(activeContainer.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`));
    draggedRows.forEach(r => r.classList.add('dragging'));
    if (navigator.vibrate) {
      try { navigator.vibrate(35); } catch {}
    }
  }

  function moveDrag(clientX, clientY) {
    if (!isDragging || !draggedId || !activeContainer) return;

    const allRows = Array.from(activeContainer.querySelectorAll('tr[data-ledger-id]'));
    let targetRow = null;
    for (const r of allRows) {
      if (r.dataset.ledgerId === draggedId) continue;
      const rect = r.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        targetRow = r;
        break;
      }
    }
    if (!targetRow) return;

    const targetId = targetRow.dataset.ledgerId;
    if (!targetId || targetId === draggedId) return;
    const targetRows = Array.from(activeContainer.querySelectorAll(`tr[data-ledger-id="${targetId}"]`));
    if (targetRows.length === 0) return;

    const topRect = targetRows[0].getBoundingClientRect();
    const bottomRect = targetRows[targetRows.length - 1].getBoundingClientRect();
    const targetCenterY = (topRect.top + bottomRect.bottom) / 2;

    if (clientY < targetCenterY) {
      const firstTarget = targetRows[0];
      if (draggedRows[draggedRows.length - 1]?.nextSibling !== firstTarget) {
        draggedRows.forEach(r => activeContainer.insertBefore(r, firstTarget));
        hasMoved = true;
      }
    } else {
      const nextSibling = targetRows[targetRows.length - 1]?.nextSibling;
      if (draggedRows[0] !== nextSibling) {
        draggedRows.forEach(r => activeContainer.insertBefore(r, nextSibling));
        hasMoved = true;
      }
    }
  }

  function endDrag() {
    if (longTouchTimer) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }

    if (isDragging && draggedId && activeContainer) {
      globalJustDragged = true;
      setTimeout(() => { globalJustDragged = false; }, 200);

      if (hasMoved && onReorder) {
        const orderedIds = [];
        const seen = new Set();
        activeContainer.querySelectorAll('tr[data-ledger-id]').forEach(r => {
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
    }

    document.body.classList.remove('ledger-dragging-locked');
    draggedRows.forEach(r => r.classList.remove('dragging'));
    draggedId = null;
    activeContainer = null;
    isDragging = false;
    hasMoved = false;
  }

  // 1. 단일 클릭(Tap) 이벤트 -> 거래 수정 모달 열기
  document.addEventListener('click', event => {
    if (globalJustDragged || isDragging) return;
    const row = isLedgerRow(event.target);
    if (row && handler) {
      handler(row.dataset.ledgerId, event);
    }
  });

  // 2. 모바일 터치 이벤트
  document.addEventListener('touchstart', e => {
    const row = isLedgerRow(e.target);
    if (!row) return;

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging = false;

    longTouchTimer = setTimeout(() => {
      startDrag(row);
    }, 180);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!isDragging && longTouchTimer) {
      const touch = e.touches[0];
      const moveDist = Math.hypot(touch.clientX - startX, touch.clientY - startY);
      if (moveDist > 8) {
        clearTimeout(longTouchTimer);
        longTouchTimer = null;
      }
      return;
    }

    if (isDragging) {
      e.preventDefault();
      const touch = e.touches[0];
      moveDrag(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);

  // 3. PC 마우스 이벤트
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const row = isLedgerRow(e.target);
    if (!row) return;

    startX = e.clientX;
    startY = e.clientY;

    const onMouseMove = ev => {
      const moveDist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!isDragging && moveDist > 3) {
        startDrag(row);
      }
      if (isDragging) {
        ev.preventDefault();
        moveDrag(ev.clientX, ev.clientY);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      endDrag();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}