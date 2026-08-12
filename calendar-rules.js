// Calendar rules shared by sync, rendering, and statistics.
export const fixedHolidays = [
  '8. 15.', '8. 17.',
  '9. 24.', '9. 25.', '9. 26.', '9. 28.',
  '10. 3.', '10. 5.', '10. 9.',
  '12. 25.',
  '1. 1.',
  '2. 6.', '2. 7.', '2. 8.', '2. 9.',
  '3. 1.',
  '5. 1.', '5. 5.', '5. 25.', '6. 3.', '7. 17.'
];

export function isWeekendDate(dateText) {
  const text = String(dateText || '');
  return text.includes('토') || text.includes('일');
}

export function isHolidayDate(item) {
  if (!item) return false;
  const dateText = String(item.date || '');
  return Boolean(item.isHoliday) || isWeekendDate(dateText) || fixedHolidays.some(day => dateText.includes(day));
}
