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
    var dateSeqMap = {};

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

      var autoPrefix = 'cash';
      if (sheetName === '기업카드') autoPrefix = 'ibkcard';
      else if (sheetName === '토스은행') autoPrefix = 'tossbank';
      else if (sheetName === '기업은행') autoPrefix = 'ibkbank';

      var dateDigits = formatIsoDate(d).replace(/[^0-9]/g, '').slice(2);
      if (dateDigits.length === 6) {
        if (!dateSeqMap[dateDigits]) {
          dateSeqMap[dateDigits] = 1;
        } else {
          dateSeqMap[dateDigits]++;
        }
        var seq = dateSeqMap[dateDigits];
        var fixedId = autoPrefix + '-' + dateDigits + (seq < 10 ? '0' + seq : String(seq));
        if (fixedId !== curId) hasIdChange = true;
        newIds.push([fixedId]);
      } else {
        newIds.push([curId]);
      }

      newTypes.push([t]);
      newAmounts.push([num]);
      newIncomes.push([t === 'income' ? num : '']);
      newExpenses.push([t === 'expense' ? num : '']);
    }

    if (colMap['type']) sheet.getRange(2, colMap['type'], rows, 1).setValues(newTypes);
    if (colMap['amount']) sheet.getRange(2, colMap['amount'], rows, 1).setValues(newAmounts);
    if (colMap['수입']) sheet.getRange(2, colMap['수입'], rows, 1).setValues(newIncomes);
    if (colMap['지출']) sheet.getRange(2, colMap['지출'], rows, 1).setValues(newExpenses);
    if (index['id'] !== undefined) {
      sheet.getRange(2, index['id'] + 1, rows, 1).setValues(newIds);
    }

    // 날짜 오름차순 정렬
    sortSheetByDate(sheet, index);

    // 사용액 / 잔액 계산 및 채우기
    recalculateSheetBalances(sheet, sheetName, headers, index);

    results[sheetName] = rows;
  });

  SpreadsheetApp.flush();
  return { ok: true, results: results };
}

/**
 * 1,2월 등 기존 작성된 동일 항목을 기반으로 다른 월의 사용처, 비고, 고정비, 사용자, 노란색 배경색 일괄 자동 완성
 */
function autoFillKnownMetadata() {
  var spreadsheet = getLedgerSpreadsheet();
  var sheets = ['기업카드', '토스은행', '현금', '기업은행'];
  var totalUpdated = 0;
  var details = {};

  sheets.forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var index = headerIndex(headers);
    if (index['항목'] === undefined) return;

    var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    // 1. 룰북 수집 (항목 -> { category, memo, fixedCost })
    var ruleBook = {};
    for (var r = 0; r < allData.length; r++) {
      var row = allData[r];
      var item = cleanText(row[index['항목']]);
      var cat = index['사용처'] !== undefined ? cleanText(row[index['사용처']]) : '';
      var memo = index['비고'] !== undefined ? cleanText(row[index['비고']]) : '';
      var fixed = index['고정비'] !== undefined ? cleanText(row[index['고정비']]) : '';

      if (item && (cat || memo || fixed)) {
        if (!ruleBook[item]) {
          ruleBook[item] = { category: cat, memo: memo, fixedCost: fixed };
        } else {
          if ((!ruleBook[item].category || ruleBook[item].category === '기타') && cat && cat !== '기타') {
            ruleBook[item].category = cat;
          }
          if (!ruleBook[item].memo && memo) ruleBook[item].memo = memo;
          if (!ruleBook[item].fixedCost && fixed) ruleBook[item].fixedCost = fixed;
        }
      }
    }

    // 2. 빈칸 채우기 및 사용자/노란색 서식 적용
    var sheetUpdated = 0;
    for (var i = 0; i < allData.length; i++) {
      var curRow = allData[i];
      var curItem = cleanText(curRow[index['항목']]);
      var rule = ruleBook[curItem];

      // 정확 일치가 없으면 주요 키워드(SKT, 쿠팡, 관리비, 넷플릭스, 예스코, 메리츠)로 2차 탐색
      if (!rule) {
        for (var key in ruleBook) {
          if (curItem.indexOf(key) !== -1 || key.indexOf(curItem) !== -1 || (curItem.indexOf('SKT') !== -1 && key.indexOf('SKT') !== -1) || (curItem.indexOf('쿠팡') !== -1 && key.indexOf('쿠팡') !== -1)) {
            rule = ruleBook[key];
            break;
          }
        }
      }

      var changed = false;
      if (rule) {
        var curCat = index['사용처'] !== undefined ? cleanText(curRow[index['사용처']]) : '';
        if (index['사용처'] !== undefined && (!curCat || curCat === '기타') && rule.category && rule.category !== '기타') {
          curRow[index['사용처']] = rule.category;
          changed = true;
        }
        if (index['비고'] !== undefined && !cleanText(curRow[index['비고']]) && rule.memo) {
          curRow[index['비고']] = rule.memo;
          changed = true;
        }
        if (index['고정비'] !== undefined && !cleanText(curRow[index['고정비']]) && rule.fixedCost) {
          curRow[index['고정비']] = rule.fixedCost;
          changed = true;
        }
      }

      // 비고에 콩콩/쥬쥬/지니가 있으면 사용자 자동 기입 (유효성 검사: 콩콩, 쥬쥬, 지니, 기타)
      if (index['사용자'] !== undefined) {
        var curMemo = index['비고'] !== undefined ? cleanText(curRow[index['비고']]) : '';
        var curItm = cleanText(curRow[index['항목']]);
        var curPerson = cleanText(curRow[index['사용자']]);
        var match = (curMemo + ' ' + curItm).match(/콩콩|쥬쥬|지니/);
        var finalPerson = match ? match[0] : (curPerson || '기타');
        if (['콩콩', '쥬쥬', '지니', '기타'].indexOf(finalPerson) === -1) {
          finalPerson = '기타';
        }
        if (curPerson !== finalPerson) {
          curRow[index['사용자']] = finalPerson;
          changed = true;
        }
      }

      // 고정비 노란색 배경색 (#FFF2CC) 적용
      if (index['고정비'] !== undefined) {
        var isFixed = cleanText(curRow[index['고정비']]) === '고정비';
        var rowNum = i + 2;
        if (isFixed) {
          sheet.getRange(rowNum, 1, 1, lastCol).setBackground('#FFF2CC');
        }
      }

      if (changed) {
        sheetUpdated++;
        totalUpdated++;
      }
    }

    if (sheetUpdated > 0) {
      sheet.getRange(2, 1, allData.length, lastCol).setValues(allData);
    }
    details[sheetName] = { updatedRows: sheetUpdated };
  });

  SpreadsheetApp.flush();
  return { ok: true, totalUpdated: totalUpdated, details: details };
}

/**
 * 웹 드래그앤드롭 순서 변경을 시트 행 순서에 즉시 물리적 반영 및 잔액/사용액 재계산
 */
function reorderLedgerRows(sheetName, orderedIds) {
  if (!sheetName || !Array.isArray(orderedIds) || !orderedIds.length) {
    throw new Error('순서 변경 파라미터가 올바르지 않습니다.');
  }

  var spreadsheet = getLedgerSpreadsheet();
  var sheet = getRequiredSheet(spreadsheet, sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { ok: true, message: '데이터가 없습니다.' };

  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var index = headerIndex(headers);
  if (index['id'] === undefined) throw new Error('시트에 ID 열이 없습니다.');

  var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var rowById = {};
  var idColIdx = index['id'];
  var targetPositions = [];

  for (var r = 0; r < allData.length; r++) {
    var row = allData[r];
    var rowId = cleanText(row[idColIdx]);
    if (rowId && orderedIds.indexOf(rowId) !== -1) {
      rowById[rowId] = row;
      targetPositions.push(r);
    }
  }

  var reorderedRows = [];
  for (var i = 0; i < orderedIds.length; i++) {
    var targetId = cleanText(orderedIds[i]);
    if (rowById[targetId]) {
      reorderedRows.push(rowById[targetId]);
    }
  }

  // 원래 차지하고 있던 행 위치들에 새로운 순서대로 1:1 슬롯 교체 (다른 월 영향 0%)
  for (var k = 0; k < targetPositions.length && k < reorderedRows.length; k++) {
    allData[targetPositions[k]] = reorderedRows[k];
  }

  // ⭐ 날짜별 ID 순번(01, 02, 03...) 위에서부터 순서대로 자동 재부여!
  var autoPrefix = 'cash';
  if (sheetName === '기업카드') autoPrefix = 'ibkcard';
  else if (sheetName === '토스은행') autoPrefix = 'tossbank';
  else if (sheetName === '기업은행') autoPrefix = 'ibkbank';

  var dateSeqMap = {};
  var dateColIdx = index['날짜'];

  for (var j = 0; j < allData.length; j++) {
    var dRow = allData[j];
    var rawDate = dateColIdx !== undefined ? formatIsoDate(dRow[dateColIdx]) : '';
    if (rawDate) {
      var dateDigits = rawDate.replace(/[^0-9]/g, '').slice(2);
      if (dateDigits.length === 6) {
        if (!dateSeqMap[dateDigits]) {
          dateSeqMap[dateDigits] = 1;
        } else {
          dateSeqMap[dateDigits]++;
        }
        var seq = dateSeqMap[dateDigits];
        var newId = autoPrefix + '-' + dateDigits + (seq < 10 ? '0' + seq : String(seq));
        dRow[idColIdx] = newId;
      }
    }
  }

  sheet.getRange(2, 1, allData.length, lastCol).setValues(allData);

  // 누적 잔액/사용액 실시간 재계산
  recalculateSheetBalances(sheet, sheetName, headers, index);
  SpreadsheetApp.flush();

  return { ok: true, action: 'reordered', sheetName: sheetName, count: orderedIds.length };
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
    var d = dateVals[r] ? formatIsoDate(dateVals[r][0]) : '';
    var inc = Number(incVals[r] ? incVals[r][0] : 0) || 0;
    var exp = Number(expVals[r] ? expVals[r][0] : 0) || 0;

    if (!d && inc === 0 && exp === 0) {
      newBalances.push(['']);
      continue;
    }

    if (sheetName === '기업카드') {
      var cycle = getCardCycleKey(d);
      if (prevCycle && cycle !== prevCycle) {
        runningBalance = 0;
      }
      prevCycle = cycle;
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

  SpreadsheetApp.flush();

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
    throw new Error('저장할 거래 목록이 비어있습니다.');
  }

  // 1. 캡처 위(최신)->아래(과거) 순서 뒤집고 날짜 오름차순 안정 정렬
  records = records.slice().reverse().sort(function(a, b) {
    var dateA = formatIsoDate(a && a.date);
    var dateB = formatIsoDate(b && b.date);
    return dateA.localeCompare(dateB);
  });

  var allowDuplicates = Boolean(options && options.allowDuplicates);
  var recordsBySheet = {};
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (!rec || typeof rec !== 'object') continue;
    var target = getWriteTarget(rec);
    var sName = target.sheetName;
    if (!recordsBySheet[sName]) recordsBySheet[sName] = { target: target, items: [] };
    recordsBySheet[sName].items.push(rec);
  }

  var results = [];
  var savedCount = 0;
  var skippedCount = 0;
  var savedIdsToSync = [];

  for (var sName in recordsBySheet) {
    var group = recordsBySheet[sName];
    var target = group.target;
    var items = group.items;
    var sheet = target.sheet;
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), target.headers.length, 13);
    var headers = target.headers;
    var index = target.index;

    // 기존 데이터 읽기 (중복 검사용)
    var existingKeys = {};
    var existingIds = {};
    if (lastRow >= 2) {
      var checkCount = Math.min(lastRow - 1, 100);
      var startCheck = Math.max(2, lastRow - checkCount + 1);
      var recentData = sheet.getRange(startCheck, 1, checkCount, lastCol).getValues();
      for (var r = 0; r < recentData.length; r++) {
        var row = recentData[r];
        var rDate = index['날짜'] !== undefined ? formatIsoDate(row[index['날짜']]) : '';
        var rAmt = index['amount'] !== undefined ? requiredAmount(row[index['amount']]) : (index['지출'] !== undefined ? requiredAmount(row[index['지출']]) : requiredAmount(row[index['수입']]));
        var rItem = index['항목'] !== undefined ? cleanText(row[index['항목']]).toLowerCase().replace(/\\s+/g, '') : '';
        var rId = index['id'] !== undefined ? cleanText(row[index['id']]) : '';
        if (rId) existingIds[rId] = true;
        if (rDate && rAmt) existingKeys[rDate + '_' + rAmt + '_' + rItem] = true;
      }
    }

    // 직전 마지막 행의 사용액 및 결제 주기 읽기 (0.05초)
    var lastBal = 0;
    var lastDate = '';
    var balColIdx = index['사용액'] !== undefined ? index['사용액'] : (index['잔액'] !== undefined ? index['잔액'] : index['총잔액']);
    if (lastRow >= 2 && balColIdx !== undefined) {
      var prevRowData = sheet.getRange(lastRow, 1, 1, lastCol).getValues()[0];
      lastBal = Number(prevRowData[balColIdx]) || 0;
      lastDate = index['날짜'] !== undefined ? formatIsoDate(prevRowData[index['날짜']]) : '';
    }

    var runningBal = lastBal;
    var prevCycle = lastDate ? getCardCycleKey(lastDate) : '';

    var rowsToInsert = [];

    for (var k = 0; k < items.length; k++) {
      var item = items[k];
      var numAmount = requiredAmount(item.amount);
      var itemText = requiredText(item.item || item.detail, '항목 없음');
      var rawDate = formatIsoDate(item.date);
      var isIncome = normalizeType(item.type) === 'income';

      // 사용액/잔액 즉시 메모리 계산
      if (sName === '기업카드') {
        var cycle = getCardCycleKey(rawDate);
        if (prevCycle && cycle !== prevCycle) {
          runningBal = 0; // 새 주기 리셋
        }
        prevCycle = cycle;
        runningBal = isIncome ? (runningBal - numAmount) : (runningBal + numAmount);
      } else {
        runningBal = isIncome ? (runningBal + numAmount) : (runningBal - numAmount);
      }

      var nextRowNum = lastRow + rowsToInsert.length + 1;
      var savedId = usableRecordId(item.id) ? cleanText(item.id) : generateLedgerId(target, item, nextRowNum);

      var newRow = blankRow(lastCol);
      if (index['날짜'] !== undefined) setCell(newRow, index, '날짜', rawDate);
      if (index['수단'] !== undefined) setCell(newRow, index, '수단', sName);
      if (index['사용자'] !== undefined) setCell(newRow, index, '사용자', cleanText(item.person));
      if (index['사용처'] !== undefined) setCell(newRow, index, '사용처', cleanText(item.category || item.usage));
      if (index['항목'] !== undefined) setCell(newRow, index, '항목', itemText);
      if (index['비고'] !== undefined) setCell(newRow, index, '비고', cleanText(item.memo));
      if (index['고정비'] !== undefined) setCell(newRow, index, '고정비', cleanText(item.fixedCost) === '고정비' ? '고정비' : '');
      if (index['type'] !== undefined) setCell(newRow, index, 'type', isIncome ? 'income' : 'expense');
      if (index['amount'] !== undefined) setCell(newRow, index, 'amount', numAmount);
      if (index['수입'] !== undefined) setCell(newRow, index, '수입', isIncome ? numAmount : '');
      if (index['지출'] !== undefined) setCell(newRow, index, '지출', isIncome ? '' : numAmount);
      if (balColIdx !== undefined) newRow[balColIdx] = runningBal;
      if (index['id'] !== undefined) setCell(newRow, index, 'id', savedId);

      rowsToInsert.push(newRow);
      savedCount++;
      savedIdsToSync.push({ id: savedId, sheetName: sName });
      results.push({ ok: true, action: 'created', sheetName: sName, sheetRow: nextRowNum, id: savedId });
    }

    // ⚡ 단 1번의 RPC로 전체 일괄 삽입! (0.2초)
    if (rowsToInsert.length > 0) {
      sheet.getRange(lastRow + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
    }
  }

  SpreadsheetApp.flush();

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
  recalculateSheetBalances(target.sheet, target.sheetName, target.headers, target.index);
  SpreadsheetApp.flush();
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
  var lastRow = target.sheet.getLastRow();
  if (lastRow < 2) return 0;

  // 1. 고유 ID로 1차 탐색
  if (usableRecordId(id) && target.index.id !== undefined) {
    var ids = target.sheet.getRange(2, target.index.id + 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i += 1) {
      if (cleanText(ids[i][0]) === id) return i + 2;
    }
  }

  // 2. sheetRow가 있으면 유효성 검사
  var sheetRow = Number(record.sheetRow || 0);
  if (sheetRow >= 2 && sheetRow <= lastRow) return sheetRow;

  // 3. 임시 ID(cp_ 등)이거나 ID 매칭 실패 시: 날짜 + 금액 + 항목으로 2차 정밀 탐색
  var targetDate = formatIsoDate(record.date);
  var targetAmount = requiredAmount(record.amount);
  var targetItem = cleanText(record.item || record.detail).toLowerCase().replace(/\s+/g, '');

  if (targetDate && targetAmount) {
    var lastCol = Math.max(target.headers.length, target.sheet.getLastColumn(), 13);
    var data = target.sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var rDate = target.index['날짜'] !== undefined ? formatIsoDate(row[target.index['날짜']]) : '';
      var rAmt = target.index['amount'] !== undefined ? requiredAmount(row[target.index['amount']]) : (target.index['지출'] !== undefined ? requiredAmount(row[target.index['지출']]) : requiredAmount(row[target.index['수입']]));
      var rItm = target.index['항목'] !== undefined ? cleanText(row[target.index['항목']]).toLowerCase().replace(/\s+/g, '') : '';
      if (rDate === targetDate && rAmt === targetAmount && (!targetItem || rItm.indexOf(targetItem) !== -1 || targetItem.indexOf(rItm) !== -1)) {
        return r + 2;
      }
    }
  }

  return 0;
}

function findFirstBlankTransactionRow(sheet, index) {
  var lastRow = sheet.getLastRow();
  var maxRows = sheet.getMaxRows();
  var dateCol = index['날짜'] !== undefined ? index['날짜'] + 1 : 1;

  if (lastRow >= 2) {
    var dates = sheet.getRange(2, dateCol, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < dates.length; i += 1) {
      if (!cleanText(dates[i][0])) return i + 2;
    }
  }

  var nextRow = lastRow + 1;
  if (nextRow > maxRows) {
    sheet.insertRowAfter(maxRows);
  }
  return nextRow;
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

