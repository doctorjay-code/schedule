/**
 * \uC6F9 \uAC00\uACC4\uBD80 \uACF5\uAC1C API \uC11C\uBE44\uC2A4.
 * \uC774 \uD30C\uC77C\uC758 \uC751\uB2F5 \uAD6C\uC870\uC640 action \uC774\uB984\uC740 \uAE30\uC874 \uC6F9 \uD074\uB77C\uC774\uC5B8\uD2B8\uC640 \uD638\uD658\uB41C\uB2E4.
 */
function handleGetLedgerData(e) {
  var spreadsheet = getLedgerSpreadsheet();
  var requestedSheet = e && e.parameter ? cleanText(e.parameter.sheet) : '';
  if (requestedSheet && !isLedgerReadSheet(requestedSheet)) {
    throw new Error('\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC2DC\uD2B8\uC785\uB2C8\uB2E4: ' + requestedSheet);
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

  // \uC6D0\uBCF8 \uC2DC\uD2B8\uC758 M\uC5F4 id \uC218\uC2DD\uC774 \uC6F9\uC5D0\uC11C \uB9CC\uB4E0 \uC784\uC2DC id\uB97C \uB36E\uC5B4\uC4F0\uBA70 \uC790\uB3D9 id\uB97C \uC0DD\uC131\uD55C\uB2E4.
  // \uB530\uB77C\uC11C \uC0C8 \uD589\uC5D0\uB294 id\uB97C \uC9C1\uC811 \uAE30\uB85D\uD558\uC9C0 \uC54A\uB294\uB2E4.
  if (!isNew && usableRecordId(record && record.id)) {
    setCell(sourceRowValues, target.index, 'id', String(record.id));
  }

  setCell(sourceRowValues, target.index, '\uB0A0\uC9DC', requiredDate(record && record.date));
  setCell(sourceRowValues, target.index, 'type', normalizeType(record && record.type));
  setCell(sourceRowValues, target.index, 'amount', requiredAmount(record && record.amount));
  setCell(sourceRowValues, target.index, '\uC218\uC785', normalizeType(record && record.type) === 'income' ? requiredAmount(record && record.amount) : '');
  setCell(sourceRowValues, target.index, '\uC9C0\uCD9C', normalizeType(record && record.type) === 'expense' ? requiredAmount(record && record.amount) : '');
  setCell(sourceRowValues, target.index, '\uC0AC\uC6A9\uCC98', cleanText(record && record.category));
  setCell(sourceRowValues, target.index, '\uD56D\uBAA9', requiredText(record && record.item, '\uD56D\uBAA9'));
  setCell(sourceRowValues, target.index, '\uBE44\uACE0', cleanText(record && record.memo));
  setCell(sourceRowValues, target.index, '\uACE0\uC815\uBE44', cleanText(record && record.fixedCost) === '\uACE0\uC815\uBE44' ? '\uACE0\uC815\uBE44' : '');

  if (isNew) {
    existingRow = findFirstBlankTransactionRow(target.sheet, target.index);
  }

  writeLedgerRow(target, existingRow, sourceRowValues, isNew);
  var savedId = waitForGeneratedLedgerId(target, existingRow);

  // \uC6F9 \uC800\uC7A5\uC73C\uB85C \uC0DD\uAE34 \uAC70\uB798\uB294 \uC989\uC2DC \uC794\uC561\uC804\uB9DD\uC5D0 \uBC18\uC601\uD55C\uB2E4.
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
  if (!existingRow) throw new Error('\uC0AD\uC81C\uD560 \uAC70\uB798\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');

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
    throw new Error('\uAE30\uC5C5\uCE74\uB4DC\u00B7\uD1A0\uC2A4\uC740\uD589\u00B7\uD604\uAE08 \uAC70\uB798\uB9CC \uC6F9\uC5D0\uC11C \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
  }

  var spreadsheet = getLedgerSpreadsheet();
  var sheet = getRequiredSheet(spreadsheet, sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headerIndex(headers);
  ['id', '\uB0A0\uC9DC', 'type', 'amount', '\uC218\uC785', '\uC9C0\uCD9C', '\uC0AC\uC6A9\uCC98', '\uD56D\uBAA9', '\uBE44\uACE0', '\uACE0\uC815\uBE44'].forEach(function(name) {
    if (index[name] === undefined) throw new Error(sheetName + ' \uD0ED\uC5D0 \uD544\uC694\uD55C \uC5F4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ' + name);
  });
  return { sheetName: sheetName, sheet: sheet, headers: headers, index: index };
}

function writeLedgerRow(target, rowNumber, values, isNew) {
  // \uB0A0\uC9DC\u00B7\uC218\uB2E8\u00B7\uC0AC\uC6A9\uC790 \uC5F4\uC758 \uC218\uC2DD/\uC11C\uC2DD\uC744 \uBCF4\uC874\uD558\uAE30 \uC704\uD574 \uC140 \uB2E8\uC704\uB85C \uD544\uC694\uD55C \uAC12\uB9CC \uC4F4\uB2E4.
  var writableHeaders = ['\uB0A0\uC9DC', 'type', 'amount', '\uC218\uC785', '\uC9C0\uCD9C', '\uC0AC\uC6A9\uCC98', '\uD56D\uBAA9', '\uBE44\uACE0', '\uACE0\uC815\uBE44'];
  writableHeaders.forEach(function(header) {
    if (target.index[header] !== undefined) {
      target.sheet.getRange(rowNumber, target.index[header] + 1).setValue(values[target.index[header]]);
    }
  });

  if (isNew && target.index['\uC218\uB2E8'] !== undefined) {
    // \uC0C8 \uC6F9 \uAC70\uB798\uB294 \uB300\uC0C1 \uC6D0\uBCF8 \uC2DC\uD2B8\uBA85\uACFC \uAC19\uC740 \uC218\uB2E8\uC744 \uAE30\uB85D\uD55C\uB2E4.
    target.sheet.getRange(rowNumber, target.index['\uC218\uB2E8'] + 1).setValue(target.sheetName);
  }

  if (target.index.id !== undefined) ensureLedgerIdFormula(target, rowNumber);
}

function ensureLedgerIdFormula(target, rowNumber) {
  var idColumn = target.index.id + 1;
  var idCell = target.sheet.getRange(rowNumber, idColumn);
  if (cleanText(idCell.getFormula())) return;

  // \uBC14\uB85C \uC704 \uD589\uC774 \uC544\uB2CC \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uC815\uC0C1 id \uC218\uC2DD\uC744 \uCC3E\uC544 \uBCF5\uC0AC\uD55C\uB2E4.
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
  if (!templateRow) throw new Error(target.sheetName + ' \uC2DC\uD2B8\uC758 id \uC218\uC2DD \uD15C\uD50C\uB9BF\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
  target.sheet.getRange(templateRow, idColumn).copyTo(idCell, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
}

function waitForGeneratedLedgerId(target, rowNumber) {
  var idCell = target.sheet.getRange(rowNumber, target.index.id + 1);
  for (var attempt = 0; attempt < 4; attempt += 1) {
    ensureLedgerIdFormula(target, rowNumber);
    SpreadsheetApp.flush();
    var savedId = cleanText(idCell.getDisplayValue());
    if (usableRecordId(savedId)) return savedId;
    // \uC218\uC2DD \uACC4\uC0B0 \uC9C0\uC5F0\uC744 \uAE30\uB2E4\uB9B0 \uB4A4 \uB2E4\uC2DC \uC77D\uB294\uB2E4. \uC784\uC758 id\uB294 \uC808\uB300 \uC0DD\uC131\uD558\uC9C0 \uC54A\uB294\uB2E4.
    Utilities.sleep(200);
  }
  throw new Error(target.sheetName + ' \uC2DC\uD2B8 ' + rowNumber + '\uD589\uC758 id \uC218\uC2DD\uC774 \uACC4\uC0B0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.');
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
  var dates = sheet.getRange(2, index['\uB0A0\uC9DC'] + 1, Math.max(maxRows - 1, 1), 1).getDisplayValues();
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
