/**
 * \uAC00\uACC4\uBD80 \uC2DC\uD2B8\uC640 \uC6F9 \uC694\uCCAD\uC758 \uACF5\uD1B5 \uC124\uC815.
 * \uC2DC\uD2B8\uBA85\uC774 \uBC14\uB00C\uBA74 \uC774 \uD30C\uC77C\uB9CC \uC218\uC815\uD55C\uB2E4.
 */
var LEDGER_SPREADSHEET_ID = '1OGxGZ-Wp9ivIj8-QohBqkY5VmGidy6R38Di45YtWUXM';
var LEDGER_SOURCE_SHEETS = ['\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uD604\uAE08', '\uAE30\uC5C5\uC740\uD589'];
// \uC800\uC7A5\u00B7\uC218\uC815\uC740 \uAE30\uC874 \uC6F9 \uC785\uB825 \uB300\uC0C1 3\uAC1C \uC2DC\uD2B8\uB85C\uB9CC \uC81C\uD55C\uD55C\uB2E4.
var LEDGER_WEB_SHEETS = ['\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uD604\uAE08'];
// \uC870\uD68C \uD654\uBA74\uC740 \uC6D0\uBCF8 4\uAC1C \uC2DC\uD2B8\uC640 \uC794\uC561\uC804\uB9DD\uC744 \uBAA8\uB450 \uC81C\uACF5\uD55C\uB2E4.
var LEDGER_READ_SHEETS = ['\uD604\uAE08', '\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uAE30\uC5C5\uC740\uD589', '\uC794\uC561\uC804\uB9DD'];
var LEDGER_PAYMENT_TO_SHEET = {
  '\uAE30\uC5C5\uCE74\uB4DC': '\uAE30\uC5C5\uCE74\uB4DC',
  '\uD1A0\uC2A4\uCE74\uB4DC': '\uD1A0\uC2A4\uC740\uD589',
  '\uD1A0\uC2A4\uC740\uD589': '\uD1A0\uC2A4\uC740\uD589',
  '\uD604\uAE08': '\uD604\uAE08'
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
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('\uC2DC\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ' + sheetName);
  return sheet;
}

function isBalanceSyncSourceSheet(sheetName) {
  return BALANCE_SYNC_SOURCE_SHEETS.indexOf(cleanText(sheetName)) !== -1;
}

function isWebLedgerSheet(sheetName) {
  return LEDGER_WEB_SHEETS.indexOf(cleanText(sheetName)) !== -1;
}

function isLedgerReadSheet(sheetName) {
  return LEDGER_READ_SHEETS.indexOf(cleanText(sheetName)) !== -1;
}
