/**
 * 원본 거래 → 잔액전망 동기화 서비스.
 *
 * 원칙
 * 1. id가 이미 있으면 같은 행을 갱신하고, 없으면 한 번만 추가한다.
 * 2. 기업은행·토스은행은 날짜와 같은 날짜 내 이체 방향 우선순서로 상위 행에 배치한다.
 * 3. 기업카드는 결제기간(전월 13일~당월 12일)별 결제예정 행 아래에 상세로 묶는다.
 * 4. 원본id가 없는 예정 행은 자동 생성하되, 실제 원본 거래와 1대1 연결 대상으로 세지 않는다.
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
    console.error('잔액전망 편집 동기화 실패: ' + (error && error.stack ? error.stack : error));
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
  if (!usableRecordId(id)) throw new Error('동기화할 원본 id가 올바르지 않습니다: ' + id);

  // 독립형 웹앱 실행에서는 문서 잠금이 없을 수 있으므로 스크립트 잠금으로 대체한다.
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(BALANCE_SYNC_CONFIG.lockWaitMs)) {
    throw new Error('다른 동기화가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  }

  try {
    var spreadsheet = getLedgerSpreadsheet();
    var source = findSourceTransactionById(spreadsheet, id);
    if (!source) throw new Error('원본 거래를 찾지 못했습니다: ' + id);
    if (!isSourceRowReady(source)) {
      return { ok: true, id: id, status: 'waiting-for-required-fields' };
    }

    var result = source.sheetName === '기업카드'
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
    throw new Error('잔액전망에 같은 원본id가 중복되어 있습니다: ' + source.id);
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
    throw new Error('잔액전망에 같은 원본id가 중복되어 있습니다: ' + source.id);
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
  if (rows.length > 1) throw new Error('삭제 대상 원본id가 잔액전망에 중복되어 있습니다: ' + id);
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
    date: formatIsoDate(row[index['날짜']]),
    method: cleanText(row[index['수단']]),
    user: cleanText(row[index['사용자']]),
    merchant: cleanText(row[index['사용처']]),
    item: cleanText(row[index['항목']]),
    memo: cleanText(row[index['비고']]),
    fixed: cleanText(row[index['고정비']]),
    type: cleanText(row[index.type]),
    amount: Number(row[index.amount] || 0),
    income: Number(row[index['수입']] || 0),
    expense: Number(row[index['지출']] || 0)
  };
}

function isSourceRowReady(source) {
  return Boolean(source && usableRecordId(source.id) && source.date && source.item && source.amount > 0 && (source.type === 'income' || source.type === 'expense'));
}

function getBalanceHeaderIndex(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headerIndex(headers);
  ['날짜', '수단', '사용자', '사용처', '항목', '비고', '고정비', 'type', 'amount', '수입', '지출', '원본시트', '원본id'].forEach(function(name) {
    if (index[name] === undefined) throw new Error('잔액전망 탭에 필요한 열이 없습니다: ' + name);
  });
  return index;
}

function getForecastIdRows(sheet, index) {
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var ids = sheet.getRange(2, index['원본id'] + 1, lastRow - 1, 1).getDisplayValues();
  ids.forEach(function(row, offset) {
    var id = cleanText(row[0]);
    if (usableRecordId(id)) map[id] = offset + 2;
  });
  return map;
}

function findForecastRowsById(sheet, index, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var ids = sheet.getRange(2, index['원본id'] + 1, lastRow - 1, 1).getDisplayValues();
  var rows = [];
  ids.forEach(function(value, offset) {
    if (cleanText(value[0]) === id) rows.push(offset + 2);
  });
  return rows;
}

function writeBalanceSourceFields(sheet, index, row, source) {
  var leadingHeaders = ['날짜', '수단', '사용자', '사용처', '항목', '비고', '고정비', 'type', 'amount', '수입', '지출'];
  var fields = {
    '날짜': parseIsoDate(source.date),
    '수단': source.method || source.sheetName,
    '사용자': source.user,
    '사용처': source.merchant,
    '항목': source.item,
    '비고': source.memo,
    '고정비': source.fixed,
    'type': source.type,
    'amount': source.amount,
    '수입': source.income || '',
    '지출': source.expense || '',
    '원본시트': source.sheetName,
    '원본id': source.id
  };

  // 표준 A:K, P:Q 구조에서는 두 번의 일괄 쓰기로 끝내 웹 저장 지연을 줄인다.
  var leadingIsContiguous = leadingHeaders.every(function(header, offset) {
    return index[header] === offset;
  });
  var sourceIdsAreContiguous = index['원본id'] === index['원본시트'] + 1;
  if (leadingIsContiguous && sourceIdsAreContiguous) {
    sheet.getRange(row, 1, 1, leadingHeaders.length).setValues([
      leadingHeaders.map(function(header) { return fields[header]; })
    ]);
    sheet.getRange(row, index['원본시트'] + 1, 1, 2).setValues([[
      fields['원본시트'], fields['원본id']
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
    // 그룹 상세는 기업카드 원본 id를 가진 행뿐이므로, 행별 그룹 깊이 API 호출 없이 제외한다.
    if (cleanText(values[i][index['원본id']]).indexOf('ibkcard-') === 0) continue;
    var rowDate = values[i][index['날짜']];
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
    date: formatIsoDate(row[index['날짜']]),
    sheetName: cleanText(row[index['원본시트']]),
    method: cleanText(row[index['수단']]),
    type: cleanText(row[index.type]),
    amount: Number(row[index.amount] || 0),
    item: cleanText(row[index['항목']]),
    memo: cleanText(row[index['비고']]),
    id: cleanText(row[index['원본id']]) || 'zz-planned'
  };
  return getBalanceSortKey(source);
}

function getTransactionPriority(source) {
  var text = [source.item, source.memo, source.method, source.sheetName].join(' ');
  var isTransfer = /토스|기업은행|이체|송금/.test(text);
  if (isTransfer && source.type === 'expense') return 10;
  if (isTransfer && source.type === 'income') return 20;
  if (source.sheetName === '기업은행') return 30;
  if (source.sheetName === '토스은행') return 40;
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
    if (formatIsoDate(row[index['날짜']]) === cycle.dueIso && cleanText(row[index['항목']]) === BALANCE_SYNC_CONFIG.futureCardPaymentItem) {
      return { row: i + 2, created: false };
    }
  }

  var anchorSource = {
    id: '',
    sheetName: '기업은행',
    date: cycle.dueIso,
    method: '기업은행',
    user: '기타',
    merchant: '카드결제',
    item: BALANCE_SYNC_CONFIG.futureCardPaymentItem,
    memo: '기업카드 결제',
    fixed: '고정비',
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
    '날짜': parseIsoDate(source.date),
    '수단': source.method,
    '사용자': source.user,
    '사용처': source.merchant,
    '항목': source.item,
    '비고': source.memo,
    '고정비': source.fixed,
    'type': source.type,
    'amount': source.amount,
    '수입': '',
    '지출': source.expense || '',
    '원본시트': source.sheetName,
    '원본id': ''
  };
  Object.keys(fields).forEach(function(header) {
    sheet.getRange(row, index[header] + 1).setValue(fields[header]);
  });
}

function findCardDetailEndRow(sheet, index, anchorRow) {
  var lastRow = sheet.getLastRow();
  var ids = sheet.getRange(anchorRow + 1, index['원본id'] + 1, Math.max(lastRow - anchorRow, 1), 1).getDisplayValues();
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
      var date = formatIsoDate(row[index['날짜']]);
      if (date >= cycle.startIso && date <= cycle.endIso) {
        total += Number(row[index['지출']] || row[index.amount] || 0);
      }
    });
  }
  sheet.getRange(anchorRow, index.amount + 1).setValue(total);
  sheet.getRange(anchorRow, index['수입'] + 1).setValue('');
  sheet.getRange(anchorRow, index['지출'] + 1).setValue(total || '');
}
