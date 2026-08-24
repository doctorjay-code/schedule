/**
 * 단순 트리거: 시트에서 직접 셀 수정 시 실시간 즉시 실행 (권한 불필요)
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var row = e.range.getRow();
    if (row < 2) return;

    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var index = headerIndex(headers);

    // 1. 비고/항목에 콩콩/쥬쥬/지니가 있으면 사용자 열 자동 입력
    if (index['사용자'] !== undefined && (index['비고'] !== undefined || index['항목'] !== undefined)) {
      var memoVal = index['비고'] !== undefined ? getCellDisplayValue(sheet, row, index['비고']) : '';
      var itemVal = index['항목'] !== undefined ? getCellDisplayValue(sheet, row, index['항목']) : '';
      var personVal = getCellDisplayValue(sheet, row, index['사용자']);
      var match = (memoVal + ' ' + itemVal).match(/콩콩|쥬쥬|지니/);
      if (match && !personVal) {
        sheet.getRange(row, index['사용자'] + 1).setValue(match[0]);
      }
    }

    // 2. 고정비 선택 시 해당 행 전체 노란색 배경색 (#FFF2CC) 자동 적용
    if (index['고정비'] !== undefined) {
      var fixedVal = cleanText(getCellDisplayValue(sheet, row, index['고정비']));
      var rowRange = sheet.getRange(row, 1, 1, lastCol);
      if (fixedVal === '고정비') {
        rowRange.setBackground('#FFF2CC');
      } else {
        var curBg = rowRange.getBackground();
        if (curBg.toLowerCase() === '#fff2cc') {
          rowRange.setBackground(null);
        }
      }
    }
  } catch (err) {
    console.warn('onEdit handler error:', err);
  }
}

/**
 * 전 시트 고정비 조건부 서식 규칙 영구 등록
 */
function applyFixedCostFormattingRules() {
  var ss = getLedgerSpreadsheet();
  var sheets = ['기업카드', '토스은행', '현금', '기업은행', '잔액전망'];
  var yellowBg = '#FFF2CC';

  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;

    var maxRows = Math.max(sheet.getMaxRows(), 100);
    var maxCols = Math.max(sheet.getMaxColumns(), 13);
    var headers = sheet.getRange(1, 1, 1, maxCols).getDisplayValues()[0];
    var index = headerIndex(headers);
    var fixedColIdx = index['고정비'];
    if (fixedColIdx === undefined) return;

    var fixedColLetter = String.fromCharCode(65 + fixedColIdx); // 0=A, 6=G
    var range = sheet.getRange(2, 1, maxRows - 1, maxCols);

    // 기존 서식 규칙 중 고정비 관련 서식 갱신
    var rules = sheet.getConditionalFormatRules();
    var newRules = rules.filter(function(r) {
      var cond = r.getBooleanCondition();
      return !cond || cond.getCriteriaValues().indexOf('고정비') === -1;
    });

    var rule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + fixedColLetter + '2="고정비"')
      .setBackground(yellowBg)
      .setRanges([range])
      .build();

    newRules.push(rule);
    sheet.setConditionalFormatRules(newRules);
  });

  return { ok: true, message: '고정비 조건부 서식 규칙 적용 완료' };
}

function setupLedgerAutomation() {
  applyFixedCostFormattingRules();
  return installLedgerBalanceSyncTrigger();
}

function runLedgerBalanceReconcile() {
  return reconcileBalanceForecast();
}

function runLedgerBalanceFullSync() {
  return syncAllBalanceForecastTransactions();
}
