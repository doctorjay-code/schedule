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
  var savedId = !isNew && usableRecordId(record && record.id)
    ? cleanText(record.id)
    : waitForGeneratedLedgerId(target, existingRow, record);

  // \uC6F9 \uC800\uC7A5\uC73C\uB85C \uC0DD\uAE34 \uAC70\uB798\uB294 \uC794\uC561\uC804\uB9DD\uC5D0 \uC548\uC804\uD558\uAC8C \uBC18\uC601 (\uC624\uB958 \uC2DC\uC5D0\uB3C4 \uC800\uC7A5\uC740 \uC131\uACF5 \uBCF4\uC7A5)
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
    throw new Error('\uC800\uC7A5\uD560 \uAC70\uB798 \uBAA9\uB85D\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4.');
  }

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

    var checkRows = Math.min(lastRow - 1, 80);
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

function parseScreenshotWithGemini(base64Image, mimeType, optionalKey) {
  var apiKey = optionalKey || getGeminiApiKey();
  if (!apiKey) throw new Error('Gemini API \uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E8\uCD95\uC5B4 URL \uB4A4\uC5D0 ?geminiKey=... \uB97C \uCD94\uAC00\uD558\uAC70\uB098 Apps Script \uD504\uB85C\uC81D\uD2B8 \uC18D\uC131\uC5D0 GEMINI_API_KEY\uB97C \uC124\uC815\uD574 \uC8FC\uC138\uC694.');
  if (!base64Image) throw new Error('\uBD84\uC11D\uD560 \uC774\uBBF8\uC9C0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');

  var promptText = 
    "You are a precise financial assistant. Extract all financial transactions from this screenshot (Toss Bank, IBK Card, IBK Bank, etc.).\n" +
    "Rules:\n" +
    "1. Ignore cancelled or failed transactions (marked with '\uCDE8\uC18C' or strike-through).\n" +
    "2. Current year is 2026. If year is missing (e.g. '7\uC6D4 31\uC77C' or '08.18'), format as 2026-MM-DD.\n" +
    "3. Amount must be a positive integer without commas.\n" +
    "4. Type:\n" +
    "   - If deposit, incoming transfer, cashback (+ sign or blue color) -> 'income'\n" +
    "   - If payment, outgoing transfer, withdrawal (- sign or black color) -> 'expense'\n" +
    "5. Payment Detection:\n" +
    "   - Toss card / \uCCB4\uD06C\uCE74\uB4DC\uACB0\uC81C -> '\uD1A0\uC2A4\uCE74\uB4DC'\n" +
    "   - Toss bank / \uC790\uB3D9\uC774\uCCB4 / \uC785\uAE08 / \uCE90\uC2DC\uBC31 -> '\uD1A0\uC2A4\uC740\uD589'\n" +
    "   - IBK Card / BLISS card / \uB9E4\uCD9C\uC804\uD45C -> '\uAE30\uC5C5\uCE74\uB4DC'\n" +
    "   - IBK Bank / \uAE30\uC5C5\uC740\uD589 \uAC70\uB798\uB0B4\uC5ED\uC870\uD68C -> '\uAE30\uC5C5\uC740\uD589'\n" +
    "   - Otherwise -> '\uD604\uAE08'\n" +
    "6. Item: The store, merchant, or payee name (e.g. '\uC8FC\uC2DD\uD68C\uC0AC \uC6B0\uC544\uD55C\uD615\uC81C\uB4E4', '\uD55C\uAD6D\uCCA0\uB3C4\uACF5\uC0AC', '\uC784\uB300\uB8CC_\uC815\uCC3D\uC601').\n" +
    "7. Category: Choose from '\uC2DD\uBE44', '\uAD50\uD1B5', '\uBB38\uD654', '\uC0DD\uD65C', '\uBCF4\uD5D8', '\uC774\uC790', '\uC0C1\uD658', '\uC800\uCD95', '\uC785\uAE08', '\uAE30\uD0C0'.\n" +
    "Return ONLY a JSON object with this structure: { \"records\": [ { \"date\": \"YYYY-MM-DD\", \"type\": \"expense\"|\"income\", \"amount\": 10000, \"item\": \"...\", \"payment\": \"...\", \"category\": \"...\" } ] }";

  var payload = {
    contents: [{
      parts: [
        { text: promptText },
        {
          inline_data: {
            mime_type: mimeType || 'image/jpeg',
            data: base64Image
          }
        }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  var models = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-2.5-pro', 'gemini-flash-latest'];
  var lastError = null;

  for (var m = 0; m < models.length; m++) {
    try {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + models[m] + ':generateContent?key=' + apiKey;
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = response.getResponseCode();
      var responseText = response.getContentText();
      if (code !== 200) {
        throw new Error('Gemini API (' + models[m] + ') \uC624\uB958 (' + code + '): ' + responseText);
      }

      var resJson = JSON.parse(responseText);
      var textCandidate = resJson && resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts && resJson.candidates[0].content.parts[0] && resJson.candidates[0].content.parts[0].text;
      if (!textCandidate) throw new Error('Gemini\uC5D0\uC11C \uD14D\uC2A4\uD2B8 \uC751\uB2F5\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');

      var cleanJsonStr = textCandidate.replace(/```json/gi, '').replace(/```/g, '').trim();
      var parsed = JSON.parse(cleanJsonStr);
      var records = Array.isArray(parsed) ? parsed : (parsed.records || []);
      if (!records.length) throw new Error('\uC774\uBBF8\uC9C0\uC5D0\uC11C \uAC70\uB798 \uB0B4\uC5ED\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');

      return batchUpsertLedgerRecords(records);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Gemini Vision \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
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
  var sheetName = explicitSheet || LEDGER_PAYMENT_TO_SHEET[payment] || payment || '\uD604\uAE08';

  var spreadsheet = getLedgerSpreadsheet();
  var sheet = getRequiredSheet(spreadsheet, sheetName);
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var index = headerIndex(headers);
  return { sheetName: sheetName, sheet: sheet, headers: headers, index: index };
}

function writeLedgerRow(target, rowNumber, values, isNew) {
  var writableHeaders = ['\uB0A0\uC9DC', 'type', 'amount', '\uC218\uC785', '\uC9C0\uCD9C', '\uC0AC\uC6A9\uCC98', '\uD56D\uBAA9', '\uBE44\uACE0', '\uACE0\uC815\uBE44', '\uC0AC\uC6A9\uC790'];
  writableHeaders.forEach(function(header) {
    if (target.index[header] !== undefined) {
      target.sheet.getRange(rowNumber, target.index[header] + 1).setValue(values[target.index[header]]);
    }
  });

  if (isNew && target.index['\uC218\uB2E8'] !== undefined) {
    target.sheet.getRange(rowNumber, target.index['\uC218\uB2E8'] + 1).setValue(target.sheetName);
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
  var autoPrefix = target.sheetName === '\uAE30\uC5C5\uCE74\uB4DC' ? 'ibkcard' : (target.sheetName === '\uD1A0\uC2A4\uC740\uD589' ? 'tossbank' : (target.sheetName === '\uAE30\uC5C5\uC740\uD589' ? 'ibkbank' : 'cash'));
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

