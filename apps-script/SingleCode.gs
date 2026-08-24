/**
 * Schedule 가계부 API 완전 통합본 (Single-File Bundle)
 */

// ==========================================
// FILE: LedgerConfig.gs
// ==========================================
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


// ==========================================
// FILE: Utils.gs
// ==========================================
/** 공통 문자열·헤더·응답 유틸리티 (Fail-Safe Universal Helper) */
function headerIndex(headers) {
  var index = {};
  if (!headers || !headers.length) return index;
  headers.forEach(function(header, column) {
    var key = cleanText(header);
    if (key) index[key] = column;
  });
  return index;
}

function setCell(row, index, header, value) {
  if (index[header] !== undefined) row[index[header]] = value;
}

function blankRow(length) {
  return Array.apply(null, Array(Math.max(length || 0, 1))).map(function() { return ''; });
}

function cleanText(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function usableRecordId(id) {
  var text = cleanText(id);
  if (!text || text.indexOf('sheets-') === 0) return false;
  return text.length >= 2;
}

function requiredText(value, label) {
  var text = cleanText(value);
  return text || (label || '항목 없음');
}

function requiredDate(value) {
  return formatIsoDate(value);
}

function normalizeType(value) {
  return cleanText(value).toLowerCase() === 'income' ? 'income' : 'expense';
}

function requiredAmount(value) {
  var amount = Number(String(value || '').replace(/[^0-9.-]+/g, ''));
  return isFinite(amount) ? Math.abs(Math.round(amount)) : 0;
}

function timestamp() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(error) {
  return jsonResponse({
    ok: false,
    error: String(error && error.message ? error.message : error)
  });
}

function formatIsoDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var text = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  var numbers = text.match(/\d+/g);
  if (numbers && numbers.length >= 3) {
    var year = numbers[0].length === 2 ? '20' + numbers[0] : numbers[0];
    return year + '-' + ('0' + numbers[1]).slice(-2) + '-' + ('0' + numbers[2]).slice(-2);
  }
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

function parseIsoDate(value) {
  var iso = formatIsoDate(value);
  var parts = iso.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function valuesEqual(left, right) {
  return cleanText(left) === cleanText(right);
}

function logApiRequest(e, result, error) {
  try {
    var ss = getLedgerSpreadsheet();
    var logSheet = ss.getSheetByName('_API_LOGS');
    if (!logSheet) {
      logSheet = ss.insertSheet('_API_LOGS');
      logSheet.appendRow(['일시', '수신데이터', '처리결과', '오류내용']);
    }
    var raw = e && e.postData ? e.postData.contents : '';
    logSheet.appendRow([
      timestamp(),
      String(raw || '').slice(0, 3000),
      JSON.stringify(result || '').slice(0, 3000),
      error ? String(error.message || error) : ''
    ]);
  } catch (err) {}
}

function parsePostRequest(e) {
  if (!e || !e.postData) throw new Error('POST 본문이 없습니다.');

  var postType = e.postData.type ? cleanText(e.postData.type).toLowerCase() : '';

  // 1. 바이너리 이미지 파일 직접 전송인 경우 (Content-Type: image/...)
  if (postType.indexOf('image/') !== -1) {
    var bytes = e.postData.getBytes ? e.postData.getBytes() : Utilities.newBlob(e.postData.contents).getBytes();
    return {
      action: 'PARSE_SCREENSHOT',
      base64Image: Utilities.base64Encode(bytes),
      mimeType: postType || 'image/jpeg'
    };
  }

  var raw = cleanText(e.postData.contents);
  if (!raw) throw new Error('POST 본문이 비어있습니다.');

  // 2. JSON 파싱 시도 (마크다운 ```json 및 여백 자동 제거)
  var cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    var request = JSON.parse(cleanJson);
    if (request && typeof request === 'object') {
      if (Array.isArray(request)) {
        return { action: 'BATCH_UPSERT_LEDGER_RECORDS', records: request };
      }
      return request;
    }
  } catch (jsonErr) {
    // 3. 만약 Base64 텍스트 자체가 바로 전송된 경우 (또는 data:image/... URL)
    if (raw.length > 200 && !raw.match(/[<>{}\[\]]/)) {
      return {
        action: 'PARSE_SCREENSHOT',
        base64Image: raw.replace(/^data:image\/[a-z]+;base64,/, ''),
        mimeType: 'image/jpeg'
      };
    }
  }

  throw new Error('요청 형식이 올바르지 않습니다.');
}


// ==========================================
// FILE: BalanceSync.gs
// ==========================================
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
    var sheetName = sheet.getName();
    if (LEDGER_SOURCE_SHEETS.indexOf(sheetName) === -1 || e.range.getRow() < 2) return;

    var row = e.range.getRow();
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var index = headerIndex(headers);

    // 날짜가 입력되어 있는데 ID가 없거나 2026 형태인 경우 자동 생성
    var dateVal = index['날짜'] !== undefined ? getCellDisplayValue(sheet, row, index['날짜']) : '';
    var curId = index['id'] !== undefined ? getCellDisplayValue(sheet, row, index['id']) : '';
    var finalId = curId;
    if (dateVal && (!usableRecordId(curId) || curId.indexOf('-2026') !== -1)) {
      var target = { sheet: sheet, sheetName: sheetName, headers: headers, index: index };
      finalId = generateLedgerId(target, { date: dateVal }, row);
      if (index['id'] !== undefined) {
        sheet.getRange(row, index['id'] + 1).setValue(finalId);
      }
    }

    // 날짜순 오름차순 정렬
    sortSheetByDate(sheet, index);

    // 사용액 / 잔액 재계산
    recalculateSheetBalances(sheet, sheetName, headers, index);

    // 행 번호가 아닌 고유 ID로 잔액전망 실시간 동기화
    if (isBalanceSyncSourceSheet(sheetName) && usableRecordId(finalId)) {
      try {
        syncBalanceForecastById(finalId, { source: 'sheet-edit' });
      } catch (syncErr) {
        console.warn('시트 편집 잔액전망 동기화 실패:', syncErr);
      }
    }
  } catch (error) {
    console.error('가계부 시트 직접 편집 동기화/정렬 실패: ' + (error && error.stack ? error.stack : error));
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

  // 1. 모든 원본 시트의 유효 거래 및 ID 수집
  var sourceIdMap = {};
  var allSources = [];
  BALANCE_SYNC_SOURCE_SHEETS.forEach(function(sheetName) {
    readAllSourceTransactions(getRequiredSheet(spreadsheet, sheetName)).forEach(function(source) {
      if (isSourceRowReady(source)) {
        sourceIdMap[source.id] = source;
        allSources.push(source);
      }
    });
  });

  // 2. 잔액전망을 아래에서 위로 스캔하며, 원본 시트에서 삭제된 고아 행(Orphan Row) 삭제
  var lastRow = forecastSheet.getLastRow();
  var deletedOrphans = 0;
  if (lastRow >= 2) {
    var forecastIds = forecastSheet.getRange(2, forecastIndex['원본id'] + 1, lastRow - 1, 1).getDisplayValues();
    for (var r = forecastIds.length - 1; r >= 0; r--) {
      var rowNum = r + 2;
      var origId = cleanText(forecastIds[r][0]);
      if (usableRecordId(origId)) {
        // 원본 ID가 있는데 원본 시트 목록에 없는 경우 삭제
        if (!sourceIdMap[origId]) {
          forecastSheet.deleteRow(rowNum);
          deletedOrphans++;
        }
      }
    }
  }

  // 3. 누락된 원본 거래를 잔액전망에 추가
  var existingIds = getForecastIdRows(forecastSheet, forecastIndex);
  var addedCount = 0;
  allSources.forEach(function(source) {
    if (!existingIds[source.id]) {
      try {
        if (source.sheetName === '기업카드') {
          syncCompanyCardTransaction(spreadsheet, source);
        } else {
          syncStandardTransaction(spreadsheet, source);
        }
        addedCount++;
      } catch (e) {
        console.error('잔액전망 동기화 추가 실패 (' + source.id + '):', e);
      }
    }
  });

  SpreadsheetApp.flush();
  return { ok: true, deletedOrphans: deletedOrphans, addedCount: addedCount };
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


// ==========================================
// FILE: Triggers.gs
// ==========================================
/**
 * 설치형 트리거와 운영용 수동 실행 함수.
 *
 * installLedgerBalanceSyncTrigger를 한 번 실행하면 기업카드·토스은행·기업은행의
 * 직접 편집도 onLedgerSourceEdit를 통해 즉시 잔액전망에 반영된다.
 */
function setupLedgerAutomation() {
  return installLedgerBalanceSyncTrigger();
}

function runLedgerBalanceReconcile() {
  return reconcileBalanceForecast();
}

function runLedgerBalanceFullSync() {
  return syncAllBalanceForecastTransactions();
}


// ==========================================
// FILE: LedgerApi.gs
// ==========================================
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

function repairAllSheetColumns() {
  var spreadsheet = getLedgerSpreadsheet();
  var sheets = ['기업카드', '토스은행', '현금', '기업은행'];
  var results = {};

  sheets.forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var index = headerIndex(headers);
    if (index['amount'] === undefined && index['지출'] === undefined) return;

    var targetHeaders = ['type', 'amount', '수입', '지출'];
    var colMap = {};
    targetHeaders.forEach(function(h) {
      if (index[h] !== undefined) colMap[h] = index[h] + 1;
    });

    var rows = lastRow - 1;
    var dateVals = index['날짜'] !== undefined ? sheet.getRange(2, index['날짜'] + 1, rows, 1).getDisplayValues() : [];
    var itemVals = index['항목'] !== undefined ? sheet.getRange(2, index['항목'] + 1, rows, 1).getDisplayValues() : [];
    var typeVals = colMap['type'] ? sheet.getRange(2, colMap['type'], rows, 1).getDisplayValues() : [];
    var amountVals = colMap['amount'] ? sheet.getRange(2, colMap['amount'], rows, 1).getValues() : [];
    var incomeVals = colMap['수입'] ? sheet.getRange(2, colMap['수입'], rows, 1).getValues() : [];
    var expenseVals = colMap['지출'] ? sheet.getRange(2, colMap['지출'], rows, 1).getValues() : [];

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

      // ID 표준화 (2026 -> 26 등 수정)
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
    if (colMap['수입']) sheet.getRange(2, colMap['수입'], rows, 1).setValues(newIncomes);
    if (colMap['지출']) sheet.getRange(2, colMap['지출'], rows, 1).setValues(newExpenses);
    if (hasIdChange && index['id'] !== undefined) {
      sheet.getRange(2, index['id'] + 1, rows, 1).setValues(newIds);
    }

    // 날짜 오름차순 정렬
    sortSheetByDate(sheet, index);

    // 사용액 / 잔액 계산 및 채우기
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

  var balColName = index['사용액'] !== undefined ? '사용액' : (index['잔액'] !== undefined ? '잔액' : null);
  if (!balColName) return;
  var balCol = index[balColName] + 1;

  var dateVals = index['날짜'] !== undefined ? sheet.getRange(2, index['날짜'] + 1, rows, 1).getDisplayValues() : [];
  var incVals = index['수입'] !== undefined ? sheet.getRange(2, index['수입'] + 1, rows, 1).getValues() : [];
  var expVals = index['지출'] !== undefined ? sheet.getRange(2, index['지출'] + 1, rows, 1).getValues() : [];
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

    if (sheetName === '기업카드') {
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

  // ID가 없거나 2026으로 시작하는 구버전 ID면 올바른 YYMMDD 규격으로 생성
  if (!usableRecordId(savedId) || savedId.indexOf('-2026') !== -1) {
    savedId = generateLedgerId(target, record, existingRow);
  }

  if (target.index.id !== undefined) {
    setCell(sourceRowValues, target.index, 'id', savedId);
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
  sortSheetByDate(target.sheet, target.index);
  recalculateSheetBalances(target.sheet, target.sheetName, target.headers, target.index);

  if (isBalanceSyncSourceSheet(target.sheetName) && usableRecordId(savedId)) {
    try {
      syncBalanceForecastById(savedId, { source: isNew ? 'api-create' : 'api-update' });
    } catch (forecastErr) {
      console.warn('잔액전망 실시간 반영 실패 (' + savedId + '):', forecastErr);
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

function batchUpsertLedgerRecords(records) {
  if (!Array.isArray(records) || !records.length) {
    return { ok: true, action: 'batch_upserted', count: 0, results: [] };
  }

  // 과거순 -> 최신순 정렬
  records = records.slice().reverse().sort(function(a, b) {
    var dateA = cleanText(a && a.date);
    var dateB = cleanText(b && b.date);
    return dateA.localeCompare(dateB);
  });

  var spreadsheet = getLedgerSpreadsheet();
  var groupsBySheet = {};

  records.forEach(function(rec) {
    var explicitSheet = cleanText(rec && rec.sheetName);
    var payment = cleanText(rec && rec.payment);
    var sheetName = explicitSheet || LEDGER_PAYMENT_TO_SHEET[payment] || '토스은행';
    if (!groupsBySheet[sheetName]) groupsBySheet[sheetName] = [];
    groupsBySheet[sheetName].push(rec);
  });

  var allResults = [];

  Object.keys(groupsBySheet).forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;

    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var lastRow = sheet.getLastRow();
    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function(h) { return cleanText(h); });
    var index = {};
    headers.forEach(function(h, idx) { if (h) index[h] = idx; });

    var rowsToAppend = [];
    var appendResults = [];

    groupsBySheet[sheetName].forEach(function(record, idx) {
      var recordId = usableRecordId(record && record.id) ? String(record.id) : ('tx_' + Date.now().toString(36) + '_' + idx + '_' + Math.random().toString(36).slice(2, 5));
      var type = normalizeType(record && record.type);
      var numAmount = requiredAmount(record && record.amount);

      var rowValues = blankRow(headers.length);
      setCell(rowValues, index, 'id', recordId);
      setCell(rowValues, index, '날짜', requiredDate(record && record.date));
      setCell(rowValues, index, 'type', type);
      setCell(rowValues, index, 'amount', numAmount);
      setCell(rowValues, index, '수입', type === 'income' ? numAmount : '');
      setCell(rowValues, index, '지출', type === 'expense' ? numAmount : '');
      setCell(rowValues, index, '수단', sheetName);
      setCell(rowValues, index, '사용자', cleanText(record && record.person) || '기타');
      setCell(rowValues, index, '사용처', cleanText(record && record.category) || '기타');
      setCell(rowValues, index, '항목', requiredText(record && record.item, '항목'));
      setCell(rowValues, index, '비고', cleanText(record && record.memo));
      setCell(rowValues, index, '고정비', cleanText(record && record.fixedCost));

      rowsToAppend.push(rowValues);
      appendResults.push({
        ok: true,
        action: 'created',
        sheetName: sheetName,
        sheetRow: lastRow + rowsToAppend.length,
        id: recordId
      });
    });

    if (rowsToAppend.length > 0) {
      sheet.getRange(lastRow + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    allResults = allResults.concat(appendResults);
  });

  return {
    ok: true,
    action: 'batch_upserted',
    count: allResults.length,
    results: allResults
  };
}
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
  if (isNew && target.index['수단'] !== undefined) {
    values[target.index['수단']] = target.sheetName;
  }

  // 사용액/잔액 열 수식 보존
  var balIdx = target.index['사용액'] !== undefined ? target.index['사용액'] : target.index['잔액'];
  if (balIdx !== undefined && !values[balIdx]) {
    var curFormula = target.sheet.getRange(rowNumber, balIdx + 1).getFormula();
    if (curFormula) {
      values[balIdx] = curFormula;
    }
  }

  // 단 1번의 RPC로 전체 행 일괄 쓰기 (초고속 0.2초)
  target.sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);

  // 신규 행이거나 수식이 비어있는 경우 이전 행에서 수식 자동 복사
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
  // 6자리 YYMMDD (예: 2026-08-20 -> 260820)
  var yymmdd = rawDate.length === 8 ? rawDate.substring(2) : (rawDate.length === 6 ? rawDate : '260101');

  var autoPrefix = 'cash';
  if (target.sheetName === '기업카드') autoPrefix = 'ibkcard';
  else if (target.sheetName === '토스은행') autoPrefix = 'tossbank';
  else if (target.sheetName === '기업은행') autoPrefix = 'ibkbank';

  var basePrefix = autoPrefix + '-' + yymmdd;

  // 해당 일자의 기존 순번(01, 02...) 중 최댓값 조회
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
    if (index && index['날짜'] !== undefined) {
      dateCol = index['날짜'] + 1;
    } else {
      var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
      var idx = headerIndex(headers);
      if (idx['날짜'] !== undefined) dateCol = idx['날짜'] + 1;
    }

    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    range.sort({ column: dateCol, ascending: true });
  } catch (e) {
    console.error('시트 날짜 정렬 실패:', e);
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



// ==========================================
// FILE: Code.gs
// ==========================================
/**
 * Schedule 가계부 API 진입점
 *
 * 기존 웹 계약을 유지한다.
 * - GET_LEDGER_DATA
 * - UPSERT_LEDGER_RECORD
 * - DELETE_LEDGER_RECORD
 *
 * 잔액전망 동기화는 웹 공개 API로 노출하지 않고, 원본 거래 저장 직후와
 * 설치형 편집 트리거에서 내부적으로만 실행한다.
 */
function doGet(e) {
  try {
    var action = getRequestAction(e);
    if (action === 'GET_LEDGER_DATA') {
      return jsonResponse(handleGetLedgerData(e));
    }
    if (action === 'REPAIR_SHEETS') {
      return jsonResponse(repairAllSheetColumns());
    }
    if (action === 'SYNC_BALANCE_FORECAST') {
      return jsonResponse(reconcileBalanceForecast());
    }
    return jsonResponse({
      ok: false,
      error: '지원하지 않는 요청입니다.',
      supportedAction: 'GET_LEDGER_DATA'
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function doPost(e) {
  var response = null;
  try {
    var request = parsePostRequest(e);

    // 1. 삭제 요청
    if (request.action === 'DELETE_LEDGER_RECORD') {
      response = deleteLedgerRecord(request.record);
      logApiRequest(e, response, null);
      return jsonResponse(response);
    }

    // 2. 다중 일괄 등록 요청 (BATCH_UPSERT_LEDGER_RECORDS or records 배열)
    if (request.action === 'BATCH_UPSERT_LEDGER_RECORDS' || Array.isArray(request.records) || Array.isArray(request)) {
      var records = request.records || (Array.isArray(request) ? request : []);
      response = batchUpsertLedgerRecords(records, request.options);
      logApiRequest(e, response, null);
      return jsonResponse(response);
    }

    // 3. 단일 거래 저장 요청 (웹 표준 or 단축어 직접 전송)
    if (request.action === 'UPSERT_LEDGER_RECORD' || request.record || request.amount || request.item) {
      var singleRecord = request.record || normalizeShortcutRecord(request);
      response = upsertLedgerRecord(singleRecord);
      logApiRequest(e, response, null);
      return jsonResponse(response);
    }

    response = { ok: false, error: '지원하지 않는 쓰기 요청입니다.' };
    logApiRequest(e, response, null);
    return jsonResponse(response);
  } catch (error) {
    logApiRequest(e, null, error);
    return errorResponse(error);
  }
}

function normalizeShortcutRecord(req) {
  return {
    id: req.id || '',
    date: req.date || '',
    type: req.type || 'expense',
    amount: req.amount || 0,
    payment: req.payment || req.cardType || '현금',
    category: req.category || req.section || '',
    item: req.item || '',
    memo: req.memo || '',
    fixedCost: req.fixedCost || '',
    person: req.person || ''
  };
}

function getRequestAction(e) {
  return e && e.parameter ? cleanText(e.parameter.action) : '';
}


