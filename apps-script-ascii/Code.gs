/**
 * Schedule \uAC00\uACC4\uBD80 API \uC9C4\uC785\uC810
 *
 * \uAE30\uC874 \uC6F9 \uACC4\uC57D\uC744 \uC720\uC9C0\uD55C\uB2E4.
 * - GET_LEDGER_DATA
 * - UPSERT_LEDGER_RECORD
 * - DELETE_LEDGER_RECORD
 *
 * \uC794\uC561\uC804\uB9DD \uB3D9\uAE30\uD654\uB294 \uC6F9 \uACF5\uAC1C API\uB85C \uB178\uCD9C\uD558\uC9C0 \uC54A\uACE0, \uC6D0\uBCF8 \uAC70\uB798 \uC800\uC7A5 \uC9C1\uD6C4\uC640
 * \uC124\uCE58\uD615 \uD3B8\uC9D1 \uD2B8\uB9AC\uAC70\uC5D0\uC11C \uB0B4\uBD80\uC801\uC73C\uB85C\uB9CC \uC2E4\uD589\uD55C\uB2E4.
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
      error: '\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC694\uCCAD\uC785\uB2C8\uB2E4.',
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
    payment: req.payment || req.cardType || '\uD604\uAE08',
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
