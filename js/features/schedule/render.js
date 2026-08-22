// Public schedule-rendering entry point.
// Keep this file small: implementation lives in schedule-render.js.
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
  createOtTd,
  renderMonthlyCalendar,
  switchViewModeUI
} from './schedule-render.js';