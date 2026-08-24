// Authenticated schedule application core.
// Event binding and schedule behavior live in schedule-events.js.
import { initializeScheduleApp } from './schedule-events.js?v=20260824_09';

export function initializeAppLogic() {
  return initializeScheduleApp();
}