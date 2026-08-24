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
    var action = request.action || '';

    // 1. 삭제 요청 (최우선 정확 판정!)
    if (action === 'DELETE_LEDGER_RECORD') {
      response = deleteLedgerRecord(request.record || request);
      return jsonResponse(response);
    }

    // 2. 다중 일괄 등록 요청 (BATCH_UPSERT_LEDGER_RECORDS or records 배열)
    if (action === 'BATCH_UPSERT_LEDGER_RECORDS' || Array.isArray(request.records) || Array.isArray(request)) {
      var records = request.records || (Array.isArray(request) ? request : []);
      response = batchUpsertLedgerRecords(records, request.options);
      return jsonResponse(response);
    }

    // 3. 단일 거래 저장/수정 요청
    if (action === 'UPSERT_LEDGER_RECORD' || request.record || request.amount || request.item) {
      var singleRecord = request.record || normalizeShortcutRecord(request);
      response = upsertLedgerRecord(singleRecord);
      return jsonResponse(response);
    }

    response = { ok: false, error: '지원하지 않는 쓰기 요청입니다.' };
    return jsonResponse(response);
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

function getRequestAction(e) {
  return e && e.parameter ? cleanText(e.parameter.action) : '';
}
