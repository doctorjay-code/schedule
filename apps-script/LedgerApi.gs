/**
 * 웹 가계부 공개 API 서비스 (Fail-Safe Universal Router)
 */
function handleGetLedgerData(e) {
  var spreadsheet = getLedgerSpreadsheet();
  var requestedSheet = e && e.parameter ? cleanText(e.parameter.sheet) : '';
  var sheetNames = requestedSheet ? [requestedSheet] : LEDGER_READ_SHEETS;
  var ledgers = {};
  sheetNames.forEach(function(sheetName) {
    try {
      var sheet = spreadsheet.getSheetByName(sheetName);
      if (sheet) {
        ledgers[sheetName] = readSheetRows(sheet);
      }
    } catch (readError) {
      ledgers[sheetName] = { headers: [], rows: [], rowCount: 0, error: String(readError) };
    }
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
  var colCount = Math.max(target.headers.length, target.sheet.getLastColumn(), 1);
  var sourceRowValues = existingRow
    ? target.sheet.getRange(existingRow, 1, 1, colCount).getValues()[0]
    : blankRow(colCount);

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
  if (record && record.person) setCell(sourceRowValues, target.index, '사용자', cleanText(record.person));

  if (isNew) {
    existingRow = findFirstBlankTransactionRow(target.sheet, target.index);
  }

  writeLedgerRow(target, existingRow, sourceRowValues, isNew);
  var savedId = !isNew && usableRecordId(record && record.id)
    ? cleanText(record.id)
    : waitForGeneratedLedgerId(target, existingRow, record);

  // 웹 저장으로 생긴 거래는 잔액전망에 안전하게 반영 (오류 시에도 저장은 성공 보장)
  var syncResult = { status: 'not-applicable' };
  try {
    if (isBalanceSyncSourceSheet(target.sheetName) && usableRecordId(savedId)) {
      syncResult = syncBalanceForecastById(savedId, { source: 'web-save' });
    }
  } catch (syncError) {
    syncResult = { status: 'sync-deferred', warning: String(syncError && syncError.message ? syncError.message : syncError) };
  }

  return {
    ok: true,
    action: isNew ? 'created' : 'updated',
    sheetName: target.sheetName,
    sheetRow: existingRow,
    id: savedId,
    balanceSync: syncResult
  };
}

function batchUpsertLedgerRecords(records, options) {
  if (!Array.isArray(records) || !records.length) {
    throw new Error('저장할 거래 목록이 비어있습니다.');
  }

  var allowDuplicates = Boolean(options && options.allowDuplicates);
  var results = [];
  var savedCount = 0;
  var skippedCount = 0;

  for (var i = 0; i < records.length; i++) {
    var item = records[i];
    if (!item || typeof item !== 'object') continue;

    // 중복 검사: allowDuplicates가 false인 경우 같은 날짜/항목/금액이 최근 행에 이미 존재하는지 검사
    if (!allowDuplicates && !item.id && isDuplicateRecord(item)) {
      results.push({ ok: true, action: 'skipped-duplicate', item: item.item, amount: item.amount, date: item.date });
      skippedCount++;
      continue;
    }

    try {
      var res = upsertLedgerRecord(item);
      results.push(res);
      savedCount++;
    } catch (saveError) {
      results.push({ ok: false, error: String(saveError && saveError.message ? saveError.message : saveError), item: item.item });
    }
  }

  return {
    ok: true,
    action: 'batch_upserted',
    total: records.length,
    savedCount: savedCount,
    skippedCount: skippedCount,
    results: results
  };
}

function isDuplicateRecord(record) {
  try {
    var target = getWriteTarget(record);
    var lastRow = target.sheet.getLastRow();
    if (lastRow < 2) return false;

    var checkRows = Math.min(lastRow - 1, 80);
    var startRow = Math.max(2, lastRow - checkRows + 1);
    var values = target.sheet.getRange(startRow, 1, checkRows, target.headers.length).getDisplayValues();

    var targetDate = formatIsoDate(record.date);
    var targetAmount = String(requiredAmount(record.amount));
    var targetItem = cleanText(record.item);

    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var rDate = target.index['날짜'] !== undefined ? formatIsoDate(row[target.index['날짜']]) : '';
      var rAmount = target.index['amount'] !== undefined ? String(requiredAmount(row[target.index['amount']])) : '';
      var rItem = target.index['항목'] !== undefined ? cleanText(row[target.index['항목']]) : '';

      if (rDate === targetDate && rAmount === targetAmount && rItem === targetItem) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

function deleteLedgerRecord(record) {
  var target = getWriteTarget(record);
  var existingRow = findExistingRow(target, record);
  if (!existingRow) throw new Error('삭제할 거래를 찾지 못했습니다.');

  var id = getCellDisplayValue(target.sheet, existingRow, target.index.id);
  if (isBalanceSyncSourceSheet(target.sheetName) && usableRecordId(id)) {
    try {
      removeBalanceForecastRowById(id);
    } catch (e) {}
  }
  target.sheet.deleteRow(existingRow);
  return { ok: true, action: 'deleted', sheetName: target.sheetName, sheetRow: existingRow, id: id };
}

function getWriteTarget(record) {
  var explicitSheet = cleanText(record && record.sheetName);
  var payment = cleanText(record && record.payment);
  var sheetName = explicitSheet;

  if (!sheetName) {
    if (LEDGER_PAYMENT_TO_SHEET[payment]) {
      sheetName = LEDGER_PAYMENT_TO_SHEET[payment];
    } else {
      var p = payment.toLowerCase().replace(/[\s_\-]/g, '');
      if (p.indexOf('기업카드') !== -1 || p.indexOf('ibk카드') !== -1 || p.indexOf('비씨') !== -1 || p.indexOf('bliss') !== -1 || p.indexOf('신용') !== -1 || p.indexOf('카드') !== -1) {
        sheetName = '기업카드';
      } else if (p.indexOf('토스') !== -1 || p.indexOf('toss') !== -1) {
        sheetName = '토스은행';
      } else if (p.indexOf('기업은행') !== -1 || p.indexOf('ibk') !== -1) {
        sheetName = '기업은행';
      } else {
        sheetName = '현금';
      }
    }
  }

  var spreadsheet = getLedgerSpreadsheet();
  var sheet = getRequiredSheet(spreadsheet, sheetName);
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var index = headerIndex(headers);
  return { sheetName: sheetName, sheet: sheet, headers: headers, index: index };
}

function writeLedgerRow(target, rowNumber, values, isNew) {
  var writableHeaders = ['날짜', 'type', 'amount', '수입', '지출', '사용처', '항목', '비고', '고정비', '사용자'];
  writableHeaders.forEach(function(header) {
    if (target.index[header] !== undefined) {
      target.sheet.getRange(rowNumber, target.index[header] + 1).setValue(values[target.index[header]]);
    }
  });

  if (isNew && target.index['수단'] !== undefined) {
    target.sheet.getRange(rowNumber, target.index['수단'] + 1).setValue(target.sheetName);
  }

  if (target.index.id !== undefined) ensureLedgerIdFormula(target, rowNumber);
}

function ensureLedgerIdFormula(target, rowNumber) {
  if (target.index.id === undefined) return;
  var idColumn = target.index.id + 1;
  var idCell = target.sheet.getRange(rowNumber, idColumn);
  if (cleanText(idCell.getFormula())) return;

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
  if (templateRow) {
    try {
      target.sheet.getRange(templateRow, idColumn).copyTo(idCell, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    } catch (e) {}
  }
}

function waitForGeneratedLedgerId(target, rowNumber, record) {
  if (target.index.id === undefined) {
    return cleanText(record && record.id) || (target.sheetName + '-' + rowNumber);
  }
  var idCell = target.sheet.getRange(rowNumber, target.index.id + 1);
  for (var attempt = 0; attempt < 3; attempt += 1) {
    ensureLedgerIdFormula(target, rowNumber);
    SpreadsheetApp.flush();
    var savedId = cleanText(idCell.getDisplayValue());
    if (usableRecordId(savedId)) return savedId;
    Utilities.sleep(150);
  }

  var currentDisplay = cleanText(idCell.getDisplayValue());
  if (currentDisplay && currentDisplay.indexOf('sheets-') === -1) return currentDisplay;

  var dateStr = formatIsoDate(record && record.date).replace(/[^0-9]/g, '');
  var autoPrefix = target.sheetName === '기업카드' ? 'ibkcard' : (target.sheetName === '토스은행' ? 'tossbank' : (target.sheetName === '기업은행' ? 'ibkbank' : 'cash'));
  var autoId = autoPrefix + '-' + (dateStr || '20260101') + ('0' + (rowNumber % 100)).slice(-2);
  try {
    idCell.setValue(autoId);
  } catch (e) {}
  return autoId;
}

function findExistingRow(target, record) {
  if (!record) return 0;
  var id = cleanText(record.id);
  if (usableRecordId(id) && target.index.id !== undefined) {
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
  var dateCol = index['날짜'] !== undefined ? index['날짜'] + 1 : 1;
  var dates = sheet.getRange(2, dateCol, Math.max(maxRows - 1, 1), 1).getDisplayValues();
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
  if (zeroBasedColumn === undefined || zeroBasedColumn < 0) return '';
  return cleanText(sheet.getRange(row, zeroBasedColumn + 1).getDisplayValue());
}

