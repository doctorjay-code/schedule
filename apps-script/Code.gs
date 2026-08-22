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
  try {
    var request = parsePostRequest(e);

    // 0. 스크린샷 이미지 직접 전송 (Gemini Vision AI 자동 분석 및 시트 저장)
    if (request.action === 'PARSE_SCREENSHOT' || request.base64Image || request.image) {
      var base64 = request.base64Image || request.image;
      var mimeType = request.mimeType || 'image/jpeg';
      var geminiKey = getGeminiApiKey(request, e);
      return jsonResponse(parseScreenshotWithGemini(base64, mimeType, geminiKey));
    }

    // 1. 다중 일괄 등록 요청 (BATCH_UPSERT_LEDGER_RECORDS or records 배열)
    if (request.action === 'BATCH_UPSERT_LEDGER_RECORDS' || Array.isArray(request.records)) {
      var records = request.records || (Array.isArray(request) ? request : []);
      return jsonResponse(batchUpsertLedgerRecords(records, request.options));
    }

    // 2. 단일 거래 저장 요청 (웹 표준 or 단축어 직접 전송)
    if (request.action === 'UPSERT_LEDGER_RECORD' || request.record || request.amount || request.item) {
      var singleRecord = request.record || normalizeShortcutRecord(request);
      return jsonResponse(upsertLedgerRecord(singleRecord));
    }

    // 3. 삭제 요청
    if (request.action === 'DELETE_LEDGER_RECORD') {
      return jsonResponse(deleteLedgerRecord(request.record));
    }

    return jsonResponse({ ok: false, error: '지원하지 않는 쓰기 요청입니다.' });
  } catch (error) {
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

function testGeminiApi() {
  var key = getGeminiApiKey();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key;
  var payload = { contents: [{ parts: [{ text: 'Hello' }] }] };
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  Logger.log('Gemini Test Response: ' + res.getResponseCode() + ' Body: ' + res.getContentText().slice(0, 100));
}

function getRequestAction(e) {
  return e && e.parameter ? cleanText(e.parameter.action) : '';
}
