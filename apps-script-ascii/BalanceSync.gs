/**
 * \uC6D0\uBCF8 \uAC70\uB798 \u2192 \uC794\uC561\uC804\uB9DD \uB3D9\uAE30\uD654 \uC11C\uBE44\uC2A4.
 *
 * \uC6D0\uCE59
 * 1. id\uAC00 \uC774\uBBF8 \uC788\uC73C\uBA74 \uAC19\uC740 \uD589\uC744 \uAC31\uC2E0\uD558\uACE0, \uC5C6\uC73C\uBA74 \uD55C \uBC88\uB9CC \uCD94\uAC00\uD55C\uB2E4.
 * 2. \uAE30\uC5C5\uC740\uD589\u00B7\uD1A0\uC2A4\uC740\uD589\uC740 \uB0A0\uC9DC\uC640 \uAC19\uC740 \uB0A0\uC9DC \uB0B4 \uC774\uCCB4 \uBC29\uD5A5 \uC6B0\uC120\uC21C\uC11C\uB85C \uC0C1\uC704 \uD589\uC5D0 \uBC30\uCE58\uD55C\uB2E4.
 * 3. \uAE30\uC5C5\uCE74\uB4DC\uB294 \uACB0\uC81C\uAE30\uAC04(\uC804\uC6D4 13\uC77C~\uB2F9\uC6D4 12\uC77C)\uBCC4 \uACB0\uC81C\uC608\uC815 \uD589 \uC544\uB798\uC5D0 \uC0C1\uC138\uB85C \uBB36\uB294\uB2E4.
 * 4. \uC6D0\uBCF8id\uAC00 \uC5C6\uB294 \uC608\uC815 \uD589\uC740 \uC790\uB3D9 \uC0DD\uC131\uD558\uB418, \uC2E4\uC81C \uC6D0\uBCF8 \uAC70\uB798\uC640 1\uB3001 \uC5F0\uACB0 \uB300\uC0C1\uC73C\uB85C \uC138\uC9C0 \uC54A\uB294\uB2E4.
 */
function onLedgerSourceEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getParent().getId() !== LEDGER_SPREADSHEET_ID) return;
    if (!isBalanceSyncSourceSheet(sheet.getName()) || e.range.getRow() < 2) return;

    var source = readSourceRow(sheet, e.range.getRow());
    if (!source || !isSourceRowReady(source)) return;
    syncBalanceForecastById(source.id, { source: 'sheet-edit' });
  } catch (error) {
    console.error('\uC794\uC561\uC804\uB9DD \uD3B8\uC9D1 \uB3D9\uAE30\uD654 \uC2E4\uD328: ' + (error && error.stack ? error.stack : error));
  }
}

function installLedgerBalanceSyncTrigger() {
  var spreadsheet = getLedgerSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onLedgerSourceEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('onLedgerSourceEdit').forSpreadsheet(spreadsheet).onEdit().create();
  return { ok: true, handler: 'onLedgerSourceEdit', trigger: 'installed' };
}

function removeLedgerBalanceSyncTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onLedgerSourceEdit') {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return { ok: true, removed: removed };
}

function syncBalanceForecastById(id, options) {
  id = cleanText(id);
  if (!usableRecordId(id)) throw new Error('\uB3D9\uAE30\uD654\uD560 \uC6D0\uBCF8 id\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4: ' + id);

  // \uB3C5\uB9BD\uD615 \uC6F9\uC571 \uC2E4\uD589\uC5D0\uC11C\uB294 \uBB38\uC11C \uC7A0\uAE08\uC774 \uC5C6\uC744 \uC218 \uC788\uC73C\uBBC0\uB85C \uC2A4\uD06C\uB9BD\uD2B8 \uC7A0\uAE08\uC73C\uB85C \uB300\uCCB4\uD55C\uB2E4.
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(BALANCE_SYNC_CONFIG.lockWaitMs)) {
    throw new Error('\uB2E4\uB978 \uB3D9\uAE30\uD654\uAC00 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.');
  }

  try {
    var spreadsheet = getLedgerSpreadsheet();
    var source = findSourceTransactionById(spreadsheet, id);
    if (!source) throw new Error('\uC6D0\uBCF8 \uAC70\uB798\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ' + id);
    if (!isSourceRowReady(source)) {
      return { ok: true, id: id, status: 'waiting-for-required-fields' };
    }

    var result = source.sheetName === '\uAE30\uC5C5\uCE74\uB4DC'
      ? syncCompanyCardTransaction(spreadsheet, source)
      : syncStandardTransaction(spreadsheet, source);
    SpreadsheetApp.flush();
    return { ok: true, id: id, source: options && options.source ? options.source : 'manual', result: result };
  } finally {
    lock.releaseLock();
  }
}

function syncAllBalanceForecastTransactions() {
  var spreadsheet = getLedgerSpreadsheet();
  var results = [];
  BALANCE_SYNC_SOURCE_SHEETS.forEach(function(sheetName) {
    var sourceSheet = getRequiredSheet(spreadsheet, sheetName);
    var rows = readAllSourceTransactions(sourceSheet);
    rows.forEach(function(source) {
      if (isSourceRowReady(source)) {
        results.push(syncBalanceForecastById(source.id, { source: 'manual-full-sync' }));
      }
    });
  });
  return { ok: true, synced: results.length, results: results };
}

function reconcileBalanceForecast() {
  var spreadsheet = getLedgerSpreadsheet();
  var forecastSheet = getRequiredSheet(spreadsheet, BALANCE_FORECAST_SHEET_NAME);
  var forecastIndex = getBalanceHeaderIndex(forecastSheet);
  var existingIds = getForecastIdRows(forecastSheet, forecastIndex);
  var missing = [];

  BALANCE_SYNC_SOURCE_SHEETS.forEach(function(sheetName) {
    readAllSourceTransactions(getRequiredSheet(spreadsheet, sheetName)).forEach(function(source) {
      if (isSourceRowReady(source) && !existingIds[source.id]) missing.push(source.id);
    });
  });
  return { ok: true, missingCount: missing.length, missingIds: missing };
}

function syncStandardTransaction(spreadsheet, source) {
  var forecastSheet = getRequiredSheet(spreadsheet, BALANCE_FORECAST_SHEET_NAME);
  var forecastIndex = getBalanceHeaderIndex(forecastSheet);
  var existingRows = findForecastRowsById(forecastSheet, forecastIndex, source.id);
  if (existingRows.length > 1) {
    throw new Error('\uC794\uC561\uC804\uB9DD\uC5D0 \uAC19\uC740 \uC6D0\uBCF8id\uAC00 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4: ' + source.id);
  }

  if (existingRows.length === 1) {
    writeBalanceSourceFields(forecastSheet, forecastIndex, existingRows[0], source);
    return { status: 'updated', forecastRow: existingRows[0] };
  }

  var insertRow = findStandardInsertRow(forecastSheet, forecastIndex, source);
  forecastSheet.insertRowBefore(insertRow);
  copyBalanceRowTemplate(forecastSheet, insertRow);
  writeBalanceSourceFields(forecastSheet, forecastIndex, insertRow, source);
  return { status: 'created', forecastRow: insertRow };
}

function syncCompanyCardTransaction(spreadsheet, source) {
  var forecastSheet = getRequiredSheet(spreadsheet, BALANCE_FORECAST_SHEET_NAME);
  var forecastIndex = getBalanceHeaderIndex(forecastSheet);
  var existingRows = findForecastRowsById(forecastSheet, forecastIndex, source.id);
  if (existingRows.length > 1) {
    throw new Error('\uC794\uC561\uC804\uB9DD\uC5D0 \uAC19\uC740 \uC6D0\uBCF8id\uAC00 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4: ' + source.id);
  }

  var cycle = getCardBillingCycle(source.date);
  var anchor = ensureCardPaymentAnchor(forecastSheet, forecastIndex, cycle);

  if (existingRows.length === 1) {
    writeBalanceSourceFields(forecastSheet, forecastIndex, existingRows[0], source);
    updateCardPaymentAnchor(forecastSheet, forecastIndex, anchor.row, cycle);
    return { status: 'updated', forecastRow: existingRows[0], paymentAnchorRow: anchor.row };
  }

  var detailEnd = findCardDetailEndRow(forecastSheet, forecastIndex, anchor.row);
  var insertRow = detailEnd + 1;
  forecastSheet.insertRowBefore(insertRow);
  copyBalanceRowTemplate(forecastSheet, insertRow);
  writeBalanceSourceFields(forecastSheet, forecastIndex, insertRow, source);
  resetCardDetailGroup(forecastSheet, anchor.row, insertRow);
  updateCardPaymentAnchor(forecastSheet, forecastIndex, anchor.row, cycle);
  return { status: 'created', forecastRow: insertRow, paymentAnchorRow: anchor.row };
}

function removeBalanceForecastRowById(id) {
  var spreadsheet = getLedgerSpreadsheet();
  var forecastSheet = getRequiredSheet(spreadsheet, BALANCE_FORECAST_SHEET_NAME);
  var forecastIndex = getBalanceHeaderIndex(forecastSheet);
  var rows = findForecastRowsById(forecastSheet, forecastIndex, id);
  if (rows.length > 1) throw new Error('\uC0AD\uC81C \uB300\uC0C1 \uC6D0\uBCF8id\uAC00 \uC794\uC561\uC804\uB9DD\uC5D0 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4: ' + id);
  if (!rows.length) return { ok: true, status: 'not-found', id: id };
  forecastSheet.deleteRow(rows[0]);
  return { ok: true, status: 'deleted', id: id, forecastRow: rows[0] };
}

function findSourceTransactionById(spreadsheet, id) {
  for (var i = 0; i < BALANCE_SYNC_SOURCE_SHEETS.length; i += 1) {
    var sheet = getRequiredSheet(spreadsheet, BALANCE_SYNC_SOURCE_SHEETS[i]);
    var rows = readAllSourceTransactions(sheet);
    for (var j = 0; j < rows.length; j += 1) {
      if (rows[j].id === id) return rows[j];
    }
  }
  return null;
}

function readAllSourceTransactions(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headerIndex(headers);
  return values.slice(1).map(function(row, offset) {
    return buildSourceTransaction(sheet.getName(), offset + 2, row, index);
  }).filter(function(source) {
    return source && usableRecordId(source.id);
  });
}

function readSourceRow(sheet, rowNumber) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headerIndex(headers);
  var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  return buildSourceTransaction(sheet.getName(), rowNumber, row, index);
}

function buildSourceTransaction(sheetName, rowNumber, row, index) {
  if (!row || index.id === undefined || !usableRecordId(row[index.id])) return null;
  return {
    id: cleanText(row[index.id]),
    sheetName: sheetName,
    sourceRow: rowNumber,
    date: formatIsoDate(row[index['\uB0A0\uC9DC']]),
    method: cleanText(row[index['\uC218\uB2E8']]),
    user: cleanText(row[index['\uC0AC\uC6A9\uC790']]),
    merchant: cleanText(row[index['\uC0AC\uC6A9\uCC98']]),
    item: cleanText(row[index['\uD56D\uBAA9']]),
    memo: cleanText(row[index['\uBE44\uACE0']]),
    fixed: cleanText(row[index['\uACE0\uC815\uBE44']]),
    type: cleanText(row[index.type]),
    amount: Number(row[index.amount] || 0),
    income: Number(row[index['\uC218\uC785']] || 0),
    expense: Number(row[index['\uC9C0\uCD9C']] || 0)
  };
}

function isSourceRowReady(source) {
  return Boolean(source && usableRecordId(source.id) && source.date && source.item && source.amount > 0 && (source.type === 'income' || source.type === 'expense'));
}

function getBalanceHeaderIndex(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headerIndex(headers);
  ['\uB0A0\uC9DC', '\uC218\uB2E8', '\uC0AC\uC6A9\uC790', '\uC0AC\uC6A9\uCC98', '\uD56D\uBAA9', '\uBE44\uACE0', '\uACE0\uC815\uBE44', 'type', 'amount', '\uC218\uC785', '\uC9C0\uCD9C', '\uC6D0\uBCF8\uC2DC\uD2B8', '\uC6D0\uBCF8id'].forEach(function(name) {
    if (index[name] === undefined) throw new Error('\uC794\uC561\uC804\uB9DD \uD0ED\uC5D0 \uD544\uC694\uD55C \uC5F4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ' + name);
  });
  return index;
}

function getForecastIdRows(sheet, index) {
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var ids = sheet.getRange(2, index['\uC6D0\uBCF8id'] + 1, lastRow - 1, 1).getDisplayValues();
  ids.forEach(function(row, offset) {
    var id = cleanText(row[0]);
    if (usableRecordId(id)) map[id] = offset + 2;
  });
  return map;
}

function findForecastRowsById(sheet, index, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var ids = sheet.getRange(2, index['\uC6D0\uBCF8id'] + 1, lastRow - 1, 1).getDisplayValues();
  var rows = [];
  ids.forEach(function(value, offset) {
    if (cleanText(value[0]) === id) rows.push(offset + 2);
  });
  return rows;
}

function writeBalanceSourceFields(sheet, index, row, source) {
  var leadingHeaders = ['\uB0A0\uC9DC', '\uC218\uB2E8', '\uC0AC\uC6A9\uC790', '\uC0AC\uC6A9\uCC98', '\uD56D\uBAA9', '\uBE44\uACE0', '\uACE0\uC815\uBE44', 'type', 'amount', '\uC218\uC785', '\uC9C0\uCD9C'];
  var fields = {
    '\uB0A0\uC9DC': parseIsoDate(source.date),
    '\uC218\uB2E8': source.method || source.sheetName,
    '\uC0AC\uC6A9\uC790': source.user,
    '\uC0AC\uC6A9\uCC98': source.merchant,
    '\uD56D\uBAA9': source.item,
    '\uBE44\uACE0': source.memo,
    '\uACE0\uC815\uBE44': source.fixed,
    'type': source.type,
    'amount': source.amount,
    '\uC218\uC785': source.income || '',
    '\uC9C0\uCD9C': source.expense || '',
    '\uC6D0\uBCF8\uC2DC\uD2B8': source.sheetName,
    '\uC6D0\uBCF8id': source.id
  };

  // \uD45C\uC900 A:K, P:Q \uAD6C\uC870\uC5D0\uC11C\uB294 \uB450 \uBC88\uC758 \uC77C\uAD04 \uC4F0\uAE30\uB85C \uB05D\uB0B4 \uC6F9 \uC800\uC7A5 \uC9C0\uC5F0\uC744 \uC904\uC778\uB2E4.
  var leadingIsContiguous = leadingHeaders.every(function(header, offset) {
    return index[header] === offset;
  });
  var sourceIdsAreContiguous = index['\uC6D0\uBCF8id'] === index['\uC6D0\uBCF8\uC2DC\uD2B8'] + 1;
  if (leadingIsContiguous && sourceIdsAreContiguous) {
    sheet.getRange(row, 1, 1, leadingHeaders.length).setValues([
      leadingHeaders.map(function(header) { return fields[header]; })
    ]);
    sheet.getRange(row, index['\uC6D0\uBCF8\uC2DC\uD2B8'] + 1, 1, 2).setValues([[
      fields['\uC6D0\uBCF8\uC2DC\uD2B8'], fields['\uC6D0\uBCF8id']
    ]]);
    return;
  }

  Object.keys(fields).forEach(function(header) {
    sheet.getRange(row, index[header] + 1).setValue(fields[header]);
  });
}

function copyBalanceRowTemplate(sheet, row) {
  var templateRow = row > 2 ? row - 1 : Math.min(sheet.getLastRow(), row + 1);
  sheet.getRange(templateRow, 1, 1, sheet.getLastColumn()).copyTo(
    sheet.getRange(row, 1, 1, sheet.getLastColumn()),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
  sheet.getRange(templateRow, 12, 1, 4).copyTo(
    sheet.getRange(row, 12, 1, 4),
    SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
    false
  );
}

function findStandardInsertRow(sheet, index, source) {
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 1), sheet.getLastColumn()).getValues();
  var targetKey = getBalanceSortKey(source);
  for (var i = 0; i < values.length; i += 1) {
    var rowNumber = i + 2;
    // \uADF8\uB8F9 \uC0C1\uC138\uB294 \uAE30\uC5C5\uCE74\uB4DC \uC6D0\uBCF8 id\uB97C \uAC00\uC9C4 \uD589\uBFD0\uC774\uBBC0\uB85C, \uD589\uBCC4 \uADF8\uB8F9 \uAE4A\uC774 API \uD638\uCD9C \uC5C6\uC774 \uC81C\uC678\uD55C\uB2E4.
    if (cleanText(values[i][index['\uC6D0\uBCF8id']]).indexOf('ibkcard-') === 0) continue;
    var rowDate = values[i][index['\uB0A0\uC9DC']];
    if (!rowDate) continue;
    var rowKey = getExistingBalanceSortKey(values[i], index);
    if (rowKey > targetKey) return rowNumber;
  }
  return lastRow + 1;
}

function getBalanceSortKey(source) {
  return source.date + '|' + ('0' + getTransactionPriority(source)).slice(-2) + '|' + source.id;
}

function getExistingBalanceSortKey(row, index) {
  var source = {
    date: formatIsoDate(row[index['\uB0A0\uC9DC']]),
    sheetName: cleanText(row[index['\uC6D0\uBCF8\uC2DC\uD2B8']]),
    method: cleanText(row[index['\uC218\uB2E8']]),
    type: cleanText(row[index.type]),
    amount: Number(row[index.amount] || 0),
    item: cleanText(row[index['\uD56D\uBAA9']]),
    memo: cleanText(row[index['\uBE44\uACE0']]),
    id: cleanText(row[index['\uC6D0\uBCF8id']]) || 'zz-planned'
  };
  return getBalanceSortKey(source);
}

function getTransactionPriority(source) {
  var text = [source.item, source.memo, source.method, source.sheetName].join(' ');
  var isTransfer = /\uD1A0\uC2A4|\uAE30\uC5C5\uC740\uD589|\uC774\uCCB4|\uC1A1\uAE08/.test(text);
  if (isTransfer && source.type === 'expense') return 10;
  if (isTransfer && source.type === 'income') return 20;
  if (source.sheetName === '\uAE30\uC5C5\uC740\uD589') return 30;
  if (source.sheetName === '\uD1A0\uC2A4\uC740\uD589') return 40;
  return 50;
}

function getCardBillingCycle(isoDate) {
  var transactionDate = parseIsoDate(isoDate);
  var start;
  if (transactionDate.getDate() >= BALANCE_SYNC_CONFIG.cardCycleStartDay) {
    start = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), BALANCE_SYNC_CONFIG.cardCycleStartDay, 12);
  } else {
    start = new Date(transactionDate.getFullYear(), transactionDate.getMonth() - 1, BALANCE_SYNC_CONFIG.cardCycleStartDay, 12);
  }
  var end = new Date(start.getFullYear(), start.getMonth() + 1, BALANCE_SYNC_CONFIG.cardCycleEndDay, 12);
  var due = new Date(end.getFullYear(), end.getMonth(), BALANCE_SYNC_CONFIG.currentCardPaymentDueDay, 12);
  return {
    start: start,
    end: end,
    due: due,
    startIso: formatIsoDate(start),
    endIso: formatIsoDate(end),
    dueIso: formatIsoDate(due)
  };
}

function ensureCardPaymentAnchor(sheet, index, cycle) {
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 1), sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i += 1) {
    var row = values[i];
    if (sheet.getRowGroupDepth(i + 2) > 0) continue;
    if (formatIsoDate(row[index['\uB0A0\uC9DC']]) === cycle.dueIso && cleanText(row[index['\uD56D\uBAA9']]) === BALANCE_SYNC_CONFIG.futureCardPaymentItem) {
      return { row: i + 2, created: false };
    }
  }

  var anchorSource = {
    id: '',
    sheetName: '\uAE30\uC5C5\uC740\uD589',
    date: cycle.dueIso,
    method: '\uAE30\uC5C5\uC740\uD589',
    user: '\uAE30\uD0C0',
    merchant: '\uCE74\uB4DC\uACB0\uC81C',
    item: BALANCE_SYNC_CONFIG.futureCardPaymentItem,
    memo: '\uAE30\uC5C5\uCE74\uB4DC \uACB0\uC81C',
    fixed: '\uACE0\uC815\uBE44',
    type: 'expense',
    amount: 0,
    income: 0,
    expense: 0
  };
  var rowNumber = findStandardInsertRow(sheet, index, anchorSource);
  sheet.insertRowBefore(rowNumber);
  copyBalanceRowTemplate(sheet, rowNumber);
  writeBalancePlannedAnchorFields(sheet, index, rowNumber, anchorSource);
  return { row: rowNumber, created: true };
}

function writeBalancePlannedAnchorFields(sheet, index, row, source) {
  var fields = {
    '\uB0A0\uC9DC': parseIsoDate(source.date),
    '\uC218\uB2E8': source.method,
    '\uC0AC\uC6A9\uC790': source.user,
    '\uC0AC\uC6A9\uCC98': source.merchant,
    '\uD56D\uBAA9': source.item,
    '\uBE44\uACE0': source.memo,
    '\uACE0\uC815\uBE44': source.fixed,
    'type': source.type,
    'amount': source.amount,
    '\uC218\uC785': '',
    '\uC9C0\uCD9C': source.expense || '',
    '\uC6D0\uBCF8\uC2DC\uD2B8': source.sheetName,
    '\uC6D0\uBCF8id': ''
  };
  Object.keys(fields).forEach(function(header) {
    sheet.getRange(row, index[header] + 1).setValue(fields[header]);
  });
}

function findCardDetailEndRow(sheet, index, anchorRow) {
  var lastRow = sheet.getLastRow();
  var ids = sheet.getRange(anchorRow + 1, index['\uC6D0\uBCF8id'] + 1, Math.max(lastRow - anchorRow, 1), 1).getDisplayValues();
  var endRow = anchorRow;
  for (var i = 0; i < ids.length; i += 1) {
    if (cleanText(ids[i][0]).indexOf('ibkcard-') === 0) {
      endRow = anchorRow + i + 1;
    } else {
      break;
    }
  }
  return endRow;
}

function resetCardDetailGroup(sheet, anchorRow, lastDetailRow) {
  if (lastDetailRow <= anchorRow) return;
  var firstDetailRow = anchorRow + 1;
  var detailRange = sheet.getRange(firstDetailRow, 1, lastDetailRow - anchorRow, 1);
  if (sheet.getRowGroupDepth(firstDetailRow) > 0) {
    detailRange.shiftRowGroupDepth(-1);
  }
  detailRange.shiftRowGroupDepth(1);
  var group = sheet.getRowGroup(firstDetailRow, 1);
  if (group) group.collapse();
}

function updateCardPaymentAnchor(sheet, index, anchorRow, cycle) {
  var endRow = findCardDetailEndRow(sheet, index, anchorRow);
  var total = 0;
  if (endRow > anchorRow) {
    var details = sheet.getRange(anchorRow + 1, 1, endRow - anchorRow, sheet.getLastColumn()).getValues();
    details.forEach(function(row) {
      var date = formatIsoDate(row[index['\uB0A0\uC9DC']]);
      if (date >= cycle.startIso && date <= cycle.endIso) {
        total += Number(row[index['\uC9C0\uCD9C']] || row[index.amount] || 0);
      }
    });
  }
  sheet.getRange(anchorRow, index.amount + 1).setValue(total);
  sheet.getRange(anchorRow, index['\uC218\uC785'] + 1).setValue('');
  sheet.getRange(anchorRow, index['\uC9C0\uCD9C'] + 1).setValue(total || '');
}
