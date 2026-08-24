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
      bindUnifiedTouchDragEngine(listEl, onReorder, () => {
        globalJustDragged = true;
        setTimeout(() => { globalJustDragged = false; }, 150);
      });
    }
  });
}

function bindUnifiedTouchDragEngine(listEl, onReorder, onDragFinished) {
  let draggedId = null;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let draggedRows = [];
  let longTouchTimer = null;
  let hasMoved = false;

  function startDrag(id) {
    if (isDragging || !id) return;
    isDragging = true;
    hasMoved = false;
    draggedId = id;
    document.body.classList.add('ledger-dragging-locked');
    draggedRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${draggedId}"]`));
    draggedRows.forEach(r => r.classList.add('dragging'));
    if (navigator.vibrate) navigator.vibrate(35);
  }

  function moveDrag(clientX, clientY) {
    if (!isDragging || !draggedId) return;

    const allRows = Array.from(listEl.querySelectorAll('tr[data-ledger-id]'));
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
    const targetRows = Array.from(listEl.querySelectorAll(`tr[data-ledger-id="${targetId}"]`));
    if (targetRows.length === 0) return;

    const topRect = targetRows[0].getBoundingClientRect();
    const bottomRect = targetRows[targetRows.length - 1].getBoundingClientRect();
    const targetCenterY = (topRect.top + bottomRect.bottom) / 2;
    const parent = targetRows[0].parentNode;
    if (!parent) return;

    if (clientY < targetCenterY) {
      const firstTarget = targetRows[0];
      if (draggedRows[draggedRows.length - 1]?.nextSibling !== firstTarget) {
        draggedRows.forEach(r => parent.insertBefore(r, firstTarget));
        hasMoved = true;
      }
    } else {
      const nextSibling = targetRows[targetRows.length - 1]?.nextSibling;
      if (draggedRows[0] !== nextSibling) {
        draggedRows.forEach(r => parent.insertBefore(r, nextSibling));
        hasMoved = true;
      }
    }
  }

  function endDrag() {
    if (longTouchTimer) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }

    if (isDragging && draggedId) {
      onDragFinished();
      if (hasMoved) {
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
    }

    document.body.classList.remove('ledger-dragging-locked');
    draggedRows.forEach(r => r.classList.remove('dragging'));
    draggedId = null;
    isDragging = false;
    hasMoved = false;
  }

  // 1. 모바일 터치 이벤트 (Passive: false로 스크롤 완벽 잠금)
  listEl.addEventListener('touchstart', e => {
    if (e.target.closest('button, input, select, textarea, a, .color-indicator')) return;
    const row = e.target.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return;

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging = false;
    const targetId = row.dataset.ledgerId;

    longTouchTimer = setTimeout(() => {
      startDrag(targetId);
    }, 220);
  }, { passive: true });

  listEl.addEventListener('touchmove', e => {
    const touch = e.touches[0];
    const moveDist = Math.hypot(touch.clientX - startX, touch.clientY - startY);

    if (!isDragging) {
      if (moveDist > 10 && longTouchTimer) {
        clearTimeout(longTouchTimer);
        longTouchTimer = null;
      }
      return;
    }

    // 드래그 중 스마트폰 화면 스크롤 100% 차단!
    e.preventDefault();
    moveDrag(touch.clientX, touch.clientY);
  }, { passive: false });

  listEl.addEventListener('touchend', endDrag);
  listEl.addEventListener('touchcancel', endDrag);

  // 2. PC 마우스 이벤트
  listEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a, .color-indicator')) return;
    const row = e.target.closest('tr[data-ledger-id]');
    if (!row || row.dataset.ledgerReadOnly === 'true') return;

    startX = e.clientX;
    startY = e.clientY;
    const targetId = row.dataset.ledgerId;

    const onMouseMove = ev => {
      const moveDist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!isDragging && moveDist > 5) {
        startDrag(targetId);
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