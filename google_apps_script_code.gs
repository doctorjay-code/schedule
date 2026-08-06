/**
 * 스마트 일정 관리 Google Apps Script (시트2 감지 + 색상 없이 깔끔한 기본 서식 정돈)
 * 스프레드시트 배경 색상을 모두 뺀 깔끔한 흑백 기본 양식 버전입니다.
 */

function getTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('시트2');
  if (!sheet) sheet = ss.getSheets()[0];
  return sheet;
}

function doGet(e) {
  var sheet = getTargetSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;

    var item = {};
    headers.forEach(function(h, colIdx) {
      item[h] = row[colIdx] !== undefined ? String(row[colIdx]) : '';
    });
    result.push(item);
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var sheet = getTargetSheet();

    if (contents.action === 'UPDATE_ALL' && Array.isArray(contents.items)) {
      formatAndWriteAllItems(sheet, contents.items);
    } else if (contents.action === 'FORMAT_SHEET') {
      applySheetFormattingOnly(sheet);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function formatAndWriteAllItems(sheet, items) {
  var headers = [
    "주차", "날짜/요일", "시간", "지역", "진료", 
    "교통 상태", "교통 상세", "국인체 상태", "국인체 상세", "수당 상태", "수당 상세"
  ];

  sheet.clear();
  sheet.appendRow(headers);

  var rows = [];
  items.forEach(function(it) {
    rows.push([
      it.week || '',
      it.date || '',
      it.time || '',
      it.region || '',
      it.clinic || '',
      it.transStatus || '',
      it.transDetail || '',
      it.hrStatus || '',
      it.hrDetail || '',
      it.otStatus || '',
      it.otDetail || ''
    ]);
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 11).setValues(rows);
  }

  applySheetFormattingOnly(sheet);
}

function applySheetFormattingOnly(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return;

  // 전체 색상 초기화 (모두 흰색 배경, 검정 글자)
  var fullRange = sheet.getRange(1, 1, lastRow, 11);
  fullRange.setFontFamily("맑은 고딕");
  fullRange.setFontSize(10);
  fullRange.setFontColor("#000000");
  fullRange.setBackground("#FFFFFF");
  fullRange.setHorizontalAlignment("center");
  fullRange.setVerticalAlignment("middle");

  // 헤더 스타일 (Row 1) - 색상 없이 굵게만 처리
  var headerRange = sheet.getRange(1, 1, 1, 11);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(11);
  headerRange.setBackground("#F1F5F9"); // 아주 옅은 회색 배경만 적용 (또는 완전히 흰색)
  sheet.setRowHeight(1, 36);

  if (lastRow > 1) {
    var dataRange = sheet.getRange(2, 1, lastRow - 1, 11);
    dataRange.setBorder(true, true, true, true, true, true, "#CBD5E1", SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeights(2, lastRow - 1, 30);

    // 컬럼별 가로 너비 설정
    sheet.setColumnWidth(1, 130);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 70);
    sheet.setColumnWidth(4, 80);
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 90);
    sheet.setColumnWidth(7, 180);
    sheet.setColumnWidth(8, 90);
    sheet.setColumnWidth(9, 180);
    sheet.setColumnWidth(10, 90);
    sheet.setColumnWidth(11, 180);

    // A열(주차)만 굵게 지정
    sheet.getRange(2, 1, lastRow - 1, 1).setFontWeight("bold");
  }
}
