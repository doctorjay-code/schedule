import { isHolidayDate, isWeekendDate } from '../../../domain/schedule/calendar-rules.js';

function roundToTwoDecimals(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseHoursFromDetail(detailStr) {
  if (!detailStr) return 0;

  const detail = String(detailStr);
  let totalHours = 0;
  let hasTimeValue = false;

  for (const match of detail.matchAll(/(\d+(?:\.\d+)?)\s*일/g)) {
    totalHours += parseFloat(match[1]) * 8;
    hasTimeValue = true;
  }
  for (const match of detail.matchAll(/(\d+(?:\.\d+)?)\s*시간/g)) {
    totalHours += parseFloat(match[1]);
    hasTimeValue = true;
  }
  for (const match of detail.matchAll(/(\d+(?:\.\d+)?)\s*분/g)) {
    totalHours += parseFloat(match[1]) / 60;
    hasTimeValue = true;
  }

  return hasTimeValue ? roundToTwoDecimals(totalHours) : 0;
}

function formatOtHoursString(totalHours) {
  if (!totalHours || totalHours <= 0) return '0.00시간';
  return `${roundToTwoDecimals(totalHours).toFixed(2)}시간`;
}

function formatHoursToDaysString(totalHours) {
  if (!totalHours || totalHours <= 0) return '0.00시간';

  const roundedTotalHours = roundToTwoDecimals(totalHours);
  const days = Math.floor(roundedTotalHours / 8);
  const hours = roundToTwoDecimals(roundedTotalHours % 8);

  if (days > 0 && hours > 0) {
    return `${days}일 ${hours.toFixed(2)}시간`;
  } else if (days > 0 && hours === 0) {
    return `${days}일`;
  } else {
    return `${hours.toFixed(2)}시간`;
  }
}

// Calculate Required Clinic Sessions for a Weekly Period
function calculateRequiredClinicSessions(weekEntries) {
  let availableSessions = 0;

  const weekdayEntries = weekEntries.filter(e => {
    const dStr = e.item ? (e.item.date || '') : '';
    return !isWeekendDate(dStr);
  });

  weekdayEntries.forEach(e => {
    const item = e.item || {};
    const hrStr = item.hrDetail || '';
    const otStr = item.otDetail || '';
    const combined = `${item.clinic || ''} ${hrStr} ${otStr}`;

    const isPetitionLeave = combined.includes('청원휴가');
    // 시간 단위 연가 (예: "연가 1시간", "연가 2시간" 등)는 세션을 차감하지 않음
    const isHourlyLeave = combined.includes('연가') && /\d+\s*시간/.test(combined);

    // 휴일 조건: '휴무', '공휴일', '휴가', 또는 시간 단위가 아닌 전일/일반 '연가'
    const isCalendarHoliday = isHolidayDate(item);
    let isLeaveHoliday = combined.includes('휴무') || combined.includes('공휴일') || combined.includes('휴가');
    if (combined.includes('연가') && !isHourlyLeave) {
      isLeaveHoliday = true;
    }

    if (!isCalendarHoliday && ((!isLeaveHoliday || isPetitionLeave) || isHourlyLeave)) {
      availableSessions++;
    }
  });

  if (availableSessions >= 9) return 6;
  if (availableSessions === 8) return 5;
  if (availableSessions >= 6) return 4;
  if (availableSessions >= 4) return 3;
  if (availableSessions >= 2) return 2;
  return availableSessions;
}


export { parseHoursFromDetail, formatOtHoursString, formatHoursToDaysString, calculateRequiredClinicSessions };
