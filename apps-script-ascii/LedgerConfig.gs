/**
 * \uAC00\uACC4\uBD80 \uC2DC\uD2B8\uC640 \uC6F9 \uC694\uCCAD\uC758 \uACF5\uD1B5 \uC124\uC815.
 */
var LEDGER_SPREADSHEET_ID = '1OGxGZ-Wp9ivIj8-QohBqkY5VmGidy6R38Di45YtWUXM';
var LEDGER_SOURCE_SHEETS = ['\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uD604\uAE08', '\uAE30\uC5C5\uC740\uD589'];
var LEDGER_WEB_SHEETS = ['\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uD604\uAE08', '\uAE30\uC5C5\uC740\uD589'];
var LEDGER_READ_SHEETS = ['\uD604\uAE08', '\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uAE30\uC5C5\uC740\uD589', '\uC794\uC561\uC804\uB9DD'];
var LEDGER_PAYMENT_TO_SHEET = {
  '\uAE30\uC5C5\uCE74\uB4DC': '\uAE30\uC5C5\uCE74\uB4DC',
  '\uD1A0\uC2A4\uCE74\uB4DC': '\uD1A0\uC2A4\uC740\uD589',
  '\uD1A0\uC2A4\uC740\uD589': '\uD1A0\uC2A4\uC740\uD589',
  '\uD604\uAE08': '\uD604\uAE08',
  '\uAE30\uC5C5\uC740\uD589': '\uAE30\uC5C5\uC740\uD589'
};
var BALANCE_FORECAST_SHEET_NAME = '\uC794\uC561\uC804\uB9DD';
var BALANCE_SYNC_SOURCE_SHEETS = ['\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uAE30\uC5C5\uC740\uD589'];
var BALANCE_SYNC_CONFIG = {
  lockWaitMs: 20000,
  currentCardPaymentDueDay: 27,
  cardCycleStartDay: 13,
  cardCycleEndDay: 12,
  futureCardPaymentItem: '\uAE30\uC5C5\uCE74\uB4DC \uACB0\uC81C\uC608\uC815'
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
  throw new Error('\uC2DC\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ' + sheetName);
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
