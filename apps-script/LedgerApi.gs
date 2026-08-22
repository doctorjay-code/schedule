/**
 * 웹 가계부 공개 API 서비스.
 * 이 파일의 응답 구조와 action 이름은 기존 웹 클라이언트와 호환된다.
 */
function handleGetLedgerData(e) {
  var spreadsheet = getLedgerSpreadsheet();
  var requestedSheet = e && e.parameter ? cleanText(e.parameter.sheet) : '';
  if (requestedSheet && !isLedgerReadSheet(requestedSheet)) {
    throw new Error('지원하지 않는 시트입니다: ' + requestedSheet);
  }

  var sheetNames = requestedSheet ? [requestedSheet] : LEDGER_READ_SHEETS;
  var ledgers = {};
  sheetNames.forEach(function(sheetName) {
    ledgers[sheetName] = readSheetRows(getRequiredSheet(spreadsheet, sheetName));
  });

  return {
    ok: true,
    fetchedAt: timestamp(),
    ledgers: ledgers
  };
}

function upsertLedgerRecord(record) {
  var target = getWriteTarget(record);
  var existingRow = findExistingRow(target, record);
  var isNew = !existingRow;
  var sourceRowValues = existingRow
    ? target.sheet.getRange(existingRow, 1, 1, target.headers.length).getValues()[0]
    : blankRow(target.headers.length);

  // 원본 시트의 M열 id 수식이 웹에서 만든 임시 id를 덮어쓰며 자동 id를 생성한다.
  // 따라서 새 행에는 id를 직접 기록하지 않는다.
  if (!isNew && usableRecordId(record && record.id)) {
    setCell(sourceRowValues, target.index, 'id', String(record.id));
  }

  setCell(sourceRowValues, target.index, '날짜', requiredDate(record && record.date));
  setCell(sourceRowValues, target.index, 'type', normalizeType(record && record.type));
  setCell(sourceRowValues, target.index, 'amount', requiredAmount(record && record.amount));
  setCell(sourceRowValues, target.index, '수입', normalizeType(record && record.type) === 'income' ? requiredAmount(record && record.amount) : '');
  setCell(sourceRowValues, target.index, '지출', normalizeType(record && record.type) === 'expense' ? requiredAmount(record && record.amount) : '');
  setCell(sourceRowValues, target.index, '사용처', cleanText(record && record.category));
  setCell(sourceRowValues, target.index, '항목', requiredText(record && record.item, '항목'));
  setCell(sourceRowValues, target.index, '비고', cleanText(record && record.memo));
  setCell(sourceRowValues, target.index, '고정비', cleanText(record && record.fixedCost) === '고정비' ? '고정비' : '');

  if (isNew) {
    existingRow = findFirstBlankTransactionRow(target.sheet, target.index);
  }

  writeLedgerRow(target, existingRow, sourceRowValues, isNew);
  var savedId = waitForGeneratedLedgerId(target, existingRow);

  // 웹 저장으로 생긴 거래는 즉시 잔액전망에 반영한다.
  var syncResult = isBalanceSyncSourceSheet(target.sheetName)
    ? syncBalanceForecastById(savedId, { source: 'web-save' })
    : { status: 'not-applicable' };

  return {
    ok: true,
    action: isNew ? 'created' : 'updated',
    sheetName: target.sheetName,
    sheetRow: existingRow,
    id: savedId,
    balanceSync: syncResult
  };
}

function deleteLedgerRecord(record) {
  var target = getWriteTarget(record);
  var existingRow = findExistingRow(target, record);
  if (!existingRow) throw new Error('삭제할 거래를 찾지 못했습니다.');

  var id = getCellDisplayValue(target.sheet, existingRow, target.index.id);
  if (isBalanceSyncSourceSheet(target.sheetName) && usableRecordId(id)) {
    removeBalanceForecastRowById(id);
  }
  target.sheet.deleteRow(existingRow);
  return { ok: true, action: 'deleted', sheetName: target.sheetName, sheetRow: existingRow, id: id };
}

function getWriteTarget(record) {
  var explicitSheet = cleanText(record && record.sheetName);
  var payment = cleanText(record && record.payment);
  var sheetName = explicitSheet || LEDGER_PAYMENT_TO_SHEET[payment];
  if (!isWebLedgerSheet(sheetName)) {
    throw new Error('기업카드·토스은행·현금 거래만 웹에서 저장할 수 있습니다.');
  }

  var spreadsheet = getLedgerSpreadsheet();
  var sheet = getRequiredSheet(spreadsheet, sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headerIndex(headers);
  ['id', '날짜', 'type', 'amount', '수입', '지출', '사용처', '항목', '비고', '고정비'].forEach(function(name) {
    if (index[name] === undefined) throw new Error(sheetName + ' 탭에 필요한 열이 없습니다: ' + name);
  });
  return { sheetName: sheetName, sheet: sheet, headers: headers, index: index };
}

function writeLedgerRow(target, rowNumber, values, isNew) {
  // 날짜·수단·사용자 열의 수식/서식을 보존하기 위해 셀 단위로 필요한 값만 쓴다.
  var writableHeaders = ['날짜', 'type', 'amount', '수입', '지출', '사용처', '항목', '비고', '고정비'];
  writableHeaders.forEach(function(header) {
    if (target.index[header] !== undefined) {
      target.sheet.getRange(rowNumber, target.index[header] + 1).setValue(values[target.index[header]]);
    }
  });

  if (isNew && target.index['수단'] !== undefined) {
    // 새 웹 거래는 대상 원본 시트명과 같은 수단을 기록한다.
    target.sheet.getRange(rowNumber, target.index['수단'] + 1).setValue(target.sheetName);
  }

  if (target.index.id !== undefined) ensureLedgerIdFormula(target, rowNumber);
}

function ensureLedgerIdFormula(target, rowNumber) {
  var idColumn = target.index.id + 1;
  var idCell = target.sheet.getRange(rowNumber, idColumn);
  if (cleanText(idCell.getFormula())) return;

  // 바로 위 행이 아닌 가장 가까운 정상 id 수식을 찾아 복사한다.
  var maxRows = target.sheet.getMaxRows();
  var templateRow = 0;
  for (var previous = rowNumber - 1; previous >= 2; previous -= 1) {
    if (cleanText(target.sheet.getRange(previous, idColumn).getFormula())) {
      templateRow = previous;
      break;
    }
  }
  if (!templateRow) {
    for (var next = rowNumber + 1; next <= maxRows; next += 1) {
      if (cleanText(target.sheet.getRange(next, idColumn).getFormula())) {
        templateRow = next;
        break;
      }
    }
  }
  if (!templateRow) throw new Error(target.sheetName + ' 시트의 id 수식 템플릿을 찾지 못했습니다.');
  target.sheet.getRange(templateRow, idColumn).copyTo(idCell, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
}

function waitForGeneratedLedgerId(target, rowNumber) {
  var idCell = target.sheet.getRange(rowNumber, target.index.id + 1);
  for (var attempt = 0; attempt < 4; attempt += 1) {
    ensureLedgerIdFormula(target, rowNumber);
    SpreadsheetApp.flush();
    var savedId = cleanText(idCell.getDisplayValue());
    if (usableRecordId(savedId)) return savedId;
    // 수식 계산 지연을 기다린 뒤 다시 읽는다. 임의 id는 절대 생성하지 않는다.
    Utilities.sleep(200);
  }
  throw new Error(target.sheetName + ' 시트 ' + rowNumber + '행의 id 수식이 계산되지 않았습니다.');
}

function findExistingRow(target, record) {
  if (!record) return 0;
  var id = cleanText(record.id);
  if (usableRecordId(id)) {
    var lastRow = target.sheet.getLastRow();
    if (lastRow >= 2) {
      var ids = target.sheet.getRange(2, target.index.id + 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i += 1) {
        if (cleanText(ids[i][0]) === id) return i + 2;
      }
    }
  }

  var sheetRow = Number(record.sheetRow || 0);
  if (sheetRow >= 2 && sheetRow <= target.sheet.getMaxRows()) return sheetRow;
  return 0;
}

function findFirstBlankTransactionRow(sheet, index) {
  var maxRows = sheet.getMaxRows();
  var dates = sheet.getRange(2, index['날짜'] + 1, Math.max(maxRows - 1, 1), 1).getDisplayValues();
  for (var i = 0; i < dates.length; i += 1) {
    if (!cleanText(dates[i][0])) return i + 2;
  }
  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function readSheetRows(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { headers: [], rows: [], rowCount: 0 };
  var headers = values[0].map(function(value) { return cleanText(value); });
  var rows = values.slice(1).filter(function(row) {
    return row.some(function(value) { return cleanText(value) !== ''; });
  });
  return { headers: headers, rows: rows, rowCount: rows.length };
}

function getCellDisplayValue(sheet, row, zeroBasedColumn) {
  return cleanText(sheet.getRange(row, zeroBasedColumn + 1).getDisplayValue());
}
