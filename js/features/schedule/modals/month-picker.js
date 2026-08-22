let pickerYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth() + 1;
let selectMonthCallback = null;

function renderMonthGrid() {
  const yearLabel = document.getElementById('monthSelectYearLabel');
  const grid = document.getElementById('monthSelectGrid');
  if (!yearLabel || !grid) return;
  yearLabel.textContent = String(pickerYear);
  grid.replaceChildren();
  for (let month = 1; month <= 12; month += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'month-select-month';
    button.textContent = month + '\uC6D4';
    button.classList.toggle('active', month === selectedMonth);
    button.addEventListener('click', () => {
      closeMonthSelectModal();
      selectMonthCallback?.(pickerYear, month);
    });
    grid.appendChild(button);
  }
}

export function openMonthSelectModal(options = {}) {
  const overlay = document.getElementById('monthSelectModalOverlay');
  if (!overlay) return;
  pickerYear = Number.isInteger(options.selectedYear) ? options.selectedYear : new Date().getFullYear();
  selectedMonth = Number.isInteger(options.selectedMonth) ? options.selectedMonth : new Date().getMonth() + 1;
  selectMonthCallback = typeof options.onSelect === 'function' ? options.onSelect : null;
  document.getElementById('monthSelectPrevYearBtn').onclick = () => { pickerYear -= 1; renderMonthGrid(); };
  document.getElementById('monthSelectNextYearBtn').onclick = () => { pickerYear += 1; renderMonthGrid(); };
  renderMonthGrid();
  overlay.classList.add('active');
}

export function closeMonthSelectModal() {
  document.getElementById('monthSelectModalOverlay')?.classList.remove('active');
}
