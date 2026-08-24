// Authenticated schedule application core.
// Event binding and schedule behavior live in schedule-events.js.
import { initializeScheduleApp } from './schedule-events.js?v=20260824_20';

export function initializeAppLogic() {
  return initializeScheduleApp();
}