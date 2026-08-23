/**
 * \uC6F9 \uAC00\uACC4\uBD80 \uACF5\uAC1C API \uC11C\uBE44\uC2A4 (Fail-Safe Universal Router)
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

function repairAllSheetColumns() {
  var spreadsheet = getLedgerSpreadsheet();
  var sheets = ['\uAE30\uC5C5\uCE74\uB4DC', '\uD1A0\uC2A4\uC740\uD589', '\uD604\uAE08', '\uAE30\uC5C5\uC740\uD589'];
  var results = {};

  sheets.forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var index = headerIndex(headers);
    if (index['amount'] === undefined && index['\uC9C0\uCD9C'] === undefined) return;

    var targetHeaders = ['type', 'amount', '\uC218\uC785', '\uC9C0\uCD9C'];
    var colMap = {};
    targetHeaders.forEach(function(h) {
      if (index[h] !== undefined) colMap[h] = index[h] + 1;
    });

    var rows = lastRow - 1;
    var dateVals = index['\uB0A0\uC9DC'] !== undefined ? sheet.getRange(2, index['\uB0A0\uC9DC'] + 1, rows, 1).getDisplayValues() : [];
    var itemVals = index['\uD56D\uBAA9'] !== undefined ? sheet.getRange(2, index['\uD56D\uBAA9'] + 1, rows, 1).getDisplayValues() : [];
    var typeVals = colMap['type'] ? sheet.getRange(2, colMap['type'], rows, 1).getDisplayValues() : [];
    var amountVals = colMap['amount'] ? sheet.getRange(2, colMap['amount'], rows, 1).getValues() : [];
    var incomeVals = colMap['\uC218\uC785'] ? sheet.getRange(2, colMap['\uC218\uC785'], rows, 1).getValues() : [];
    var expenseVals = colMap['\uC9C0\uCD9C'] ? sheet.getRange(2, colMap['\uC9C0\uCD9C'], rows, 1).getValues() : [];

    var idVals = index['id'] !== undefined ? sheet.getRange(2, index['id'] + 1, rows, 1).getDisplayValues() : [];

    var newTypes = [];
    var newAmounts = [];
    var newIncomes = [];
    var newExpenses = [];
    var newIds = [];
    var hasIdChange = false;

    for (var r = 0; r < rows; r++) {
      var d = dateVals[r] ? cleanText(dateVals[r][0]) : '';
      var it = itemVals[r] ? cleanText(itemVals[r][0]) : '';
      var t = typeVals[r] ? cleanText(typeVals[r][0]).toLowerCase() : '';
      var a = amountVals[r] ? amountVals[r][0] : 0;
      var inc = incomeVals[r] ? incomeVals[r][0] : '';
      var exp = expenseVals[r] ? expenseVals[r][0] : '';
      var curId = idVals[r] ? cleanText(idVals[r][0]) : '';

      var num = requiredAmount(a || inc || exp);
      if (!d && !it && num === 0) {
        newTypes.push(['']);
        newAmounts.push(['']);
        newIncomes.push(['']);
        newExpenses.push(['']);
        newIds.push([curId]);
        continue;
      }

      if (!t) {
        if (cleanText(inc)) t = 'income';
        else if (cleanText(exp)) t = 'expense';
        else t = 'expense';
      }

      // ID \uD45C\uC900\uD654 (2026 -> 26 \uB4F1 \uC218\uC815)
      var fixedId = curId;
      if (fixedId.indexOf('-2026') !== -1) {
        fixedId = fixedId.replace('-2026', '-26');
        hasIdChange = true;
      }
      newIds.push([fixedId]);

      newTypes.push([t]);
      newAmounts.push([num]);
      newIncomes.push([t === 'income' ? num : '']);
      newExpenses.push([t === 'expense' ? num : '']);
    }

    if (colMap['type']) sheet.getRange(2, colMap['type'], rows, 1).setValues(newTypes);
    if (colMap['amount']) sheet.getRange(2, colMap['amount'], rows, 1).setValues(newAmounts);
    if (colMap['\uC218\uC785']) sheet.getRange(2, colMap['\uC218\uC785'], rows, 1).setValues(newIncomes);
    if (colMap['\uC9C0\uCD9C']) sheet.getRange(2, colMap['\uC9C0\uCD9C'], rows, 1).setValues(newExpenses);
    if (hasIdChange && index['id'] !== undefined) {
      sheet.getRange(2, index['id'] + 1, rows, 1).setValues(newIds);
    }

    // \uB0A0\uC9DC \uC624\uB984\uCC28\uC21C \uC815\uB82C
    sortSheetByDate(sheet, index);

    // \uC0AC\uC6A9\uC561 / \uC794\uC561 \uACC4\uC0B0 \uBC0F \uCC44\uC6B0\uAE30
    recalculateSheetBalances(sheet, sheetName, headers, index);

    results[sheetName] = rows;
  });

  var forecastReconcile = reconcileBalanceForecast();

  return { ok: true, results: results, forecastReconcile: forecastReconcile };
}

function getCardCycleKey(isoDate) {
  if (!isoDate) return '';
  var parts = String(isoDate).split('-');
  if (parts.length < 3) return '';
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return '';
  if (d >= 13) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return y + '-' + (m < 10 ? '0' + m : String(m));
}

function recalculateSheetBalances(sheet, sheetName, headers, index) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var rows = lastRow - 1;

  var balColName = index['\uC0AC\uC6A9\uC561'] !== undefined ? '\uC0AC\uC6A9\uC561' : (index['\uC794\uC561'] !== undefined ? '\uC794\uC561' : null);
  if (!balColName) return;
  var balCol = index[balColName] + 1;

  var dateVals = index['\uB0A0\uC9DC'] !== undefined ? sheet.getRange(2, index['\uB0A0\uC9DC'] + 1, rows, 1).getDisplayValues() : [];
  var incVals = index['\uC218\uC785'] !== undefined ? sheet.getRange(2, index['\uC218\uC785'] + 1, rows, 1).getValues() : [];
  var expVals = index['\uC9C0\uCD9C'] !== undefined ? sheet.getRange(2, index['\uC9C0\uCD9C'] + 1, rows, 1).getValues() : [];
  var existingBal = sheet.getRange(2, balCol, rows, 1).getValues();

  var newBalances = [];
  var runningBalance = 0;
  var prevCycle = '';

  for (var r = 0; r < rows; r++) {
    var d = dateVals[r] ? cleanText(dateVals[r][0]) : '';
    var inc = Number(incVals[r] ? incVals[r][0] : 0) || 0;
    var exp = Number(expVals[r] ? expVals[r][0] : 0) || 0;

    if (!d && inc === 0 && exp === 0) {
      newBalances.push(['']);
      continue;
    }

    if (sheetName === '\uAE30\uC5C5\uCE74\uB4DC') {
      var cycle = getCardCycleKey(d);
      if (cycle !== prevCycle) {
        runningBalance = 0;
        prevCycle = cycle;
      }
      runningBalance += (exp - inc);
      newBalances.push([runningBalance]);
    } else {
      if (r === 0 && existingBal[0] && Number(existingBal[0][0])) {
        runningBalance = Number(existingBal[0][0]);
      } else {
        runningBalance += (inc - exp);
      }
      newBalances.push([runningBalance]);
    }
  }

  sheet.getRange(2, balCol, rows, 1).setValues(newBalances);
}

function upsertLedgerRecord(record) {
  var target = getWriteTarget(record);
  var existingRow = findExistingRow(target, record);
  var isNew = !existingRow;
  var colCount = Math.max(target.headers.length, target.sheet.getLastColumn(), 1);
  var sourceRowValues = existingRow
    ? target.sheet.getRange(existingRow, 1, 1, colCount).getValues()[0]
    : blankRow(colCount);

  var savedId = '';
  if (!isNew && usableRecordId(record && record.id)) {
    savedId = cleanText(record.id);
  } else if (!isNew && usableRecordId(sourceRowValues[target.index.id])) {
    savedId = cleanText(sourceRowValues[target.index.id]);
  }

  // ID\uAC00 \uC5C6\uAC70\uB098 2026\uC73C\uB85C \uC2DC\uC791\uD558\uB294 \uAD6C\uBC84\uC804 ID\uBA74 \uC62C\uBC14\uB978 YYMMDD \uADDC\uACA9\uC73C\uB85C \uC0DD\uC131
  if (!usableRecordId(savedId) || savedId.indexOf('-2026') !== -1) {
    savedId = generateLedgerId(target, record, existingRow);
  }

  if (target.index.id !== undefined) {
    setCell(sourceRowValues, target.index, 'id', savedId);
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
  if (record && record.person) setCell(sourceRowValues, target.index, '\uC0AC\uC6A9\uC790', cleanText(record.person));

  if (isNew) {
    existingRow = findFirstBlankTransactionRow(target.sheet, target.index);
  }

  writeLedgerRow(target, existingRow, sourceRowValues, isNew);
  sortSheetByDate(target.sheet, target.index);
  recalculateSheetBalances(target.sheet, target.sheetName, target.headers, target.index);

  if (isBalanceSyncSourceSheet(target.sheetName) && usableRecordId(savedId)) {
    try {
      syncBalanceForecastById(savedId, { source: isNew ? 'api-create' : 'api-update' });
    } catch (forecastErr) {
      console.warn('\uC794\uC561\uC804\uB9DD \uC2E4\uC2DC\uAC04 \uBC18\uC601 \uC2E4\uD328 (' + savedId + '):', forecastErr);
    }
  }

  return {
    ok: true,
    action: isNew ? 'created' : 'updated',
    sheetName: target.sheetName,
    sheetRow: existingRow,
    id: savedId
  };
}

function batchUpsertLedgerRecords(records, options) {
  if (!Array.isArray(records) || !records.length) {
    throw new Error('\uC800\uC7A5\uD560 \uAC70\uB798 \uBAA9\uB85D\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4.');
  }

  // \uCEA1\uCC98 \uBAA9\uB85D(\uCD5C\uC2E0\uC21C)\uC744 \uAC00\uACC4\uBD80 \uC21C\uC11C(\uACFC\uAC70\uC21C -> \uCD5C\uC2E0\uC21C)\uB85C \uC815\uB82C
  // 1) \uCEA1\uCC98 \uC704(\uCD5C\uC2E0)->\uC544\uB798(\uACFC\uAC70) \uC21C\uC11C\uB97C \uB4A4\uC9D1\uACE0, 2) \uB0A0\uC9DC\uC21C \uC624\uB984\uCC28\uC21C \uC548\uC815 \uC815\uB82C
  records = records.slice().reverse().sort(function(a, b) {
    var dateA = formatIsoDate(a && a.date);
    var dateB = formatIsoDate(b && b.date);
    return dateA.localeCompare(dateB);
  });

  var allowDuplicates = Boolean(options && options.allowDuplicates);
  var results = [];
  var savedCount = 0;
  var skippedCount = 0;

  for (var i = 0; i < records.length; i++) {
    var item = records[i];
    if (!item || typeof item !== 'object') continue;

    // \uC911\uBCF5 \uAC80\uC0AC: allowDuplicates\uAC00 false\uC778 \uACBD\uC6B0 \uAC19\uC740 \uB0A0\uC9DC/\uD56D\uBAA9/\uAE08\uC561\uC774 \uCD5C\uADFC \uD589\uC5D0 \uC774\uBBF8 \uC874\uC7AC\uD558\uB294\uC9C0 \uAC80\uC0AC
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

    var checkRows = Math.min(lastRow - 1, 15);
    var startRow = Math.max(2, lastRow - checkRows + 1);
    var values = target.sheet.getRange(startRow, 1, checkRows, target.headers.length).getDisplayValues();

    var targetDate = formatIsoDate(record.date);
    var targetAmount = String(requiredAmount(record.amount));
    var targetItem = cleanText(record.item);

    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var rDate = target.index['\uB0A0\uC9DC'] !== undefined ? formatIsoDate(row[target.index['\uB0A0\uC9DC']]) : '';
      var rAmount = target.index['amount'] !== undefined ? String(requiredAmount(row[target.index['amount']])) : '';
      var rItem = target.index['\uD56D\uBAA9'] !== undefined ? cleanText(row[target.index['\uD56D\uBAA9']]) : '';

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
  if (!existingRow) throw new Error('\uC0AD\uC81C\uD560 \uAC70\uB798\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');

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
      if (p.indexOf('\uAE30\uC5C5\uCE74\uB4DC') !== -1 || p.indexOf('ibk\uCE74\uB4DC') !== -1 || p.indexOf('\uBE44\uC528') !== -1 || p.indexOf('bliss') !== -1 || p.indexOf('\uC2E0\uC6A9') !== -1 || p.indexOf('\uCE74\uB4DC') !== -1) {
        sheetName = '\uAE30\uC5C5\uCE74\uB4DC';
      } else if (p.indexOf('\uD1A0\uC2A4') !== -1 || p.indexOf('toss') !== -1) {
        sheetName = '\uD1A0\uC2A4\uC740\uD589';
      } else if (p.indexOf('\uAE30\uC5C5\uC740\uD589') !== -1 || p.indexOf('ibk') !== -1) {
        sheetName = '\uAE30\uC5C5\uC740\uD589';
      } else {
        sheetName = '\uD604\uAE08';
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
  if (isNew && target.index['\uC218\uB2E8'] !== undefined) {
    values[target.index['\uC218\uB2E8']] = target.sheetName;
  }

  // \uC0AC\uC6A9\uC561/\uC794\uC561 \uC5F4 \uC218\uC2DD \uBCF4\uC874
  var balIdx = target.index['\uC0AC\uC6A9\uC561'] !== undefined ? target.index['\uC0AC\uC6A9\uC561'] : target.index['\uC794\uC561'];
  if (balIdx !== undefined && !values[balIdx]) {
    var curFormula = target.sheet.getRange(rowNumber, balIdx + 1).getFormula();
    if (curFormula) {
      values[balIdx] = curFormula;
    }
  }

  // \uB2E8 1\uBC88\uC758 RPC\uB85C \uC804\uCCB4 \uD589 \uC77C\uAD04 \uC4F0\uAE30 (\uCD08\uACE0\uC18D 0.2\uCD08)
  target.sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);

  // \uC2E0\uADDC \uD589\uC774\uAC70\uB098 \uC218\uC2DD\uC774 \uBE44\uC5B4\uC788\uB294 \uACBD\uC6B0 \uC774\uC804 \uD589\uC5D0\uC11C \uC218\uC2DD \uC790\uB3D9 \uBCF5\uC0AC
  if (balIdx !== undefined && rowNumber > 2) {
    var balCell = target.sheet.getRange(rowNumber, balIdx + 1);
    if (!balCell.getFormula() && !balCell.getValue()) {
      try {
        target.sheet.getRange(rowNumber - 1, balIdx + 1).copyTo(balCell, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      } catch (e) {}
    }
  }
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

function generateLedgerId(target, record, rowNumber) {
  var dateIso = formatIsoDate(record && record.date);
  var rawDate = dateIso.replace(/[^0-9]/g, '');
  // 6\uC790\uB9AC YYMMDD (\uC608: 2026-08-20 -> 260820)
  var yymmdd = rawDate.length === 8 ? rawDate.substring(2) : (rawDate.length === 6 ? rawDate : '260101');

  var autoPrefix = 'cash';
  if (target.sheetName === '\uAE30\uC5C5\uCE74\uB4DC') autoPrefix = 'ibkcard';
  else if (target.sheetName === '\uD1A0\uC2A4\uC740\uD589') autoPrefix = 'tossbank';
  else if (target.sheetName === '\uAE30\uC5C5\uC740\uD589') autoPrefix = 'ibkbank';

  var basePrefix = autoPrefix + '-' + yymmdd;

  // \uD574\uB2F9 \uC77C\uC790\uC758 \uAE30\uC874 \uC21C\uBC88(01, 02...) \uC911 \uCD5C\uB313\uAC12 \uC870\uD68C
  var lastRow = target.sheet.getLastRow();
  var maxSeq = 0;
  if (lastRow >= 2 && target.index.id !== undefined) {
    var existingIds = target.sheet.getRange(2, target.index.id + 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < existingIds.length; i++) {
      if (rowNumber && (i + 2 === rowNumber)) continue;
      var idVal = cleanText(existingIds[i][0]);
      if (idVal.indexOf(basePrefix) === 0) {
        var numPart = parseInt(idVal.substring(basePrefix.length), 10);
        if (!isNaN(numPart) && numPart > maxSeq) {
          maxSeq = numPart;
        }
      }
    }
  }
  var nextSeq = maxSeq + 1;
  var seqStr = (nextSeq < 10 ? '0' : '') + nextSeq;
  return basePrefix + seqStr;
}

function sortSheetByDate(sheet, index) {
  try {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 2 || lastCol < 1) return;

    var dateCol = 1;
    if (index && index['\uB0A0\uC9DC'] !== undefined) {
      dateCol = index['\uB0A0\uC9DC'] + 1;
    } else {
      var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
      var idx = headerIndex(headers);
      if (idx['\uB0A0\uC9DC'] !== undefined) dateCol = idx['\uB0A0\uC9DC'] + 1;
    }

    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    range.sort({ column: dateCol, ascending: true });
  } catch (e) {
    console.error('\uC2DC\uD2B8 \uB0A0\uC9DC \uC815\uB82C \uC2E4\uD328:', e);
  }
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
  var dateCol = index['\uB0A0\uC9DC'] !== undefined ? index['\uB0A0\uC9DC'] + 1 : 1;
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

