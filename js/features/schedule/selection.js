// Schedule cell-selection state and interaction responsibility.
export function createScheduleSelection({ state, onChange }) {
  function updateSelectedCount() {
    const label = document.getElementById('selectedCountLabel');
    if (label) label.textContent = String(state.selectedCells.length) + '\uAC74 \uC120\uD0DD';
  }

  function isSelected(key) {
    return state.selectedCells.includes(key);
  }

  function toggleCell(key) {
    const index = state.selectedCells.indexOf(key);
    if (index >= 0) state.selectedCells.splice(index, 1);
    else state.selectedCells.push(key);
    updateSelectedCount();
    onChange();
  }

  function toggleFullDay(morningId, afternoonId, dayKey) {
    const morningRowKey = `${morningId}_row`;
    const afternoonRowKey = `${afternoonId}_row`;
    const isDaySelected = isSelected(dayKey) || isSelected(morningRowKey) || (afternoonId && isSelected(afternoonRowKey));
    if (isDaySelected) {
      state.selectedCells = state.selectedCells.filter(key => {
        const lu = key.lastIndexOf('_');
        const kid = lu >= 0 ? key.slice(0, lu) : key;
        return String(kid) !== String(morningId) && String(kid) !== String(afternoonId) && key !== dayKey;
      });
    } else {
      state.selectedCells.push(dayKey);
      state.selectedCells.push(morningRowKey);
      if (afternoonId) state.selectedCells.push(afternoonRowKey);
    }
    updateSelectedCount();
    onChange();
  }

  function toggleRow(id, rowKey) {
    const hasSubCells = state.selectedCells.some(key => key.startsWith(`${id}_`));
    if (hasSubCells) state.selectedCells = state.selectedCells.filter(key => !key.startsWith(`${id}_`));
    else state.selectedCells.push(rowKey);
    updateSelectedCount();
    onChange();
  }

  return { isSelected, toggleCell, toggleFullDay, toggleRow };
}