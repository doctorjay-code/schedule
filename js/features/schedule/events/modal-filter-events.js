// Modal close controls and schedule filter chip event responsibility.
import { bindModalDismiss } from '../../../shared/modal-form.js';

export function bindScheduleModalCloseEvents({ closeModal, closeSummaryModal, closeWeekSelectModal, closeMonthSelectModal }) {
  bindModalDismiss({
    overlay: document.getElementById('modalOverlay'),
    closeButton: document.getElementById('closeModalBtn'),
    onClose: closeModal
  });

  const summaryOverlay = document.getElementById('summaryModalOverlay');
  document.getElementById('closeSummaryModalBtn')?.addEventListener('click', closeSummaryModal);
  summaryOverlay?.addEventListener('click', event => {
    if (event.target === summaryOverlay) closeSummaryModal();
  });

  const weekOverlay = document.getElementById('weekSelectModalOverlay');
  document.getElementById('closeWeekSelectModalBtn')?.addEventListener('click', closeWeekSelectModal);
  weekOverlay?.addEventListener('click', event => {
    if (event.target === weekOverlay) closeWeekSelectModal();
  });

  const monthOverlay = document.getElementById('monthSelectModalOverlay');
  document.getElementById('closeMonthSelectModalBtn')?.addEventListener('click', closeMonthSelectModal);
  monthOverlay?.addEventListener('click', event => {
    if (event.target === monthOverlay) closeMonthSelectModal();
  });
}

export function bindScheduleFilterEvents({ state, renderTable }) {
  const filterChips = document.querySelectorAll('.filter-bar.schedule-only .filter-chip:not(#toggleMultiEditBtn)');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(item => item.classList.remove('active'));
      chip.classList.add('active');
      state.currentFilter = chip.dataset.filter;
      renderTable();
    });
  });
}