// Public schedule-rendering entry point.
// Weekly and monthly APIs are intentionally exposed through separate boundaries.
export {
  loadWeekData,
  isRedDate,
  checkFilterMatch,
  isCellSelected,
  toggleCellKey,
  toggleFullDaySelection,
  toggleRowSelection,
  renderTable,
  createTimeTd,
  attachSmartCellClick,
  applyCustomCellColor,
  createRegionTd,
  createClinicTd,
  createTransTd,
  createHrTd,
  createOtTd
} from './schedule-weekly.js';
export { renderMonthlyCalendar, switchViewModeUI } from './schedule-monthly.js';