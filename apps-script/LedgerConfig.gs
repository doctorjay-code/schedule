/**
 * 가계부 시트와 웹 요청의 공통 설정.
 */
var LEDGER_SPREADSHEET_ID = '1OGxGZ-Wp9ivIj8-QohBqkY5VmGidy6R38Di45YtWUXM';
var LEDGER_SOURCE_SHEETS = ['기업카드', '토스은행', '현금', '기업은행'];
var LEDGER_WEB_SHEETS = ['기업카드', '토스은행', '현금', '기업은행'];
var LEDGER_READ_SHEETS = ['현금', '기업카드', '토스은행', '기업은행', '잔액전망', '_API_LOGS'];
var LEDGER_PAYMENT_TO_SHEET = {
  '기업카드': '기업카드',
  'ibk카드': '기업카드',
  'ibk기업카드': '기업카드',
  '비씨카드': '기업카드',
  '신용카드': '기업카드',
  'bliss': '기업카드',
  'bliss카드': '기업카드',
  '카드': '기업카드',
  '토스카드': '토스은행',
  '토스은행': '토스은행',
  '토스': '토스은행',
  '토스뱅크': '토스은행',
  '현금': '현금',
  '기업은행': '기업은행',
  'ibk은행': '기업은행',
  'ibk기업은행': '기업은행'
};
var BALANCE_FORECAST_SHEET_NAME = '잔액전망';
var BALANCE_SYNC_SOURCE_SHEETS = ['기업카드', '토스은행', '기업은행'];
var BALANCE_SYNC_CONFIG = {
  lockWaitMs: 3000,
  currentCardPaymentDueDay: 27,
  cardCycleStartDay: 13,
  cardCycleEndDay: 12,
  futureCardPaymentItem: '기업카드 결제예정'
};

function getLedgerSpreadsheet() {
  return SpreadsheetApp.openById(LEDGER_SPREADSHEET_ID);
}

function getRequiredSheet(spreadsheet, sheetName) {
  var targetName = cleanText(sheetName);
  var sheet = spreadsheet.getSheetByName(targetName);
  if (sheet) return sheet;
  var allSheets = spreadsheet.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    if (cleanText(allSheets[i].getName()).toLowerCase() === targetName.toLowerCase()) {
      return allSheets[i];
    }
  }
  throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
}

function isBalanceSyncSourceSheet(sheetName) {
  return BALANCE_SYNC_SOURCE_SHEETS.indexOf(cleanText(sheetName)) !== -1;
}

function isWebLedgerSheet(sheetName) {
  var name = cleanText(sheetName);
  return Boolean(name && name !== BALANCE_FORECAST_SHEET_NAME);
}

function isLedgerReadSheet(sheetName) {
  return Boolean(cleanText(sheetName));
}
