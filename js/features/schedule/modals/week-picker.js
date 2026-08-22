import { state } from '../../../services/schedule/state.js';
import { loadWeekDataFn } from './edit.js';
import { escapeHtml } from '../../../shared/safe.js';

// Open Week Selector Modal
export function openWeekSelectModal(options = {}) {
  const selectedIndex = Number.isInteger(options.selectedIndex) ? options.selectedIndex : state.currentWeekIndex;
  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
  const container = document.getElementById('weekSelectListContainer');
  const overlay = document.getElementById('weekSelectModalOverlay');

  if (!container || !overlay) return;
  container.innerHTML = '';
  if (!state.allWeeksData || state.allWeeksData.length === 0) {
    container.innerHTML = '<div class="ledger-empty-list">주차 목록을 불러오는 중입니다. 잠시 후 다시 선택해 주세요.</div>';
    overlay.classList.add('active');
    return;
  }

  state.allWeeksData.forEach((wObj, index) => {
    const card = document.createElement('div');
    card.className = 'week-select-card';
    if (index === selectedIndex) {
      card.classList.add('active');
    }

    const fullTitle = wObj.title || '';
    const parts = fullTitle.split(' (');
    const weekName = parts[0] || '';
    const dateRange = parts[1] ? `(${parts[1]}` : '';

    const isCurrentBadge = (index === selectedIndex) ? `<span class="week-select-badge">현재 선택</span>` : '';

    card.innerHTML = `
      <div class="week-select-left">
        <div class="week-select-title">${escapeHtml(weekName)}</div>
        <div class="week-select-date">${escapeHtml(dateRange)}</div>
      </div>
      <div>${isCurrentBadge}</div>
    `;

    card.addEventListener('click', () => {
      closeWeekSelectModal();
      if (onSelect) {
        onSelect(index, wObj);
      } else if (loadWeekDataFn) {
        loadWeekDataFn(index);
      }
    });

    container.appendChild(card);
  });

  if (overlay) {
    overlay.classList.add('active');

    // 바깥 화면(window) 이동 없이 모달 내부만 중앙으로 스크롤 계산
    const sheet = document.getElementById('weekSelectBottomSheet');
    requestAnimationFrame(() => {
      setTimeout(() => {
        const activeCard = container.querySelector('.week-select-card.active');
        if (activeCard && sheet) {
          const cardTop = activeCard.offsetTop;
          const cardHeight = activeCard.offsetHeight;
          const sheetHeight = sheet.clientHeight;
          sheet.scrollTop = cardTop - (sheetHeight / 2) + (cardHeight / 2);
        }
      }, 50);
    });
  }
}

export function closeWeekSelectModal() {
  const overlay = document.getElementById('weekSelectModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

