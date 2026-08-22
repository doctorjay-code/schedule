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
  try {
    var request = parsePostRequest(e);

    // 1. \uB2E4\uC911 \uC77C\uAD04 \uB4F1\uB85D \uC694\uCCAD (BATCH_UPSERT_LEDGER_RECORDS or records \uBC30\uC5F4)
    if (request.action === 'BATCH_UPSERT_LEDGER_RECORDS' || Array.isArray(request.records)) {
      var records = request.records || (Array.isArray(request) ? request : []);
      return jsonResponse(batchUpsertLedgerRecords(records, request.options));
    }

    // 2. \uB2E8\uC77C \uAC70\uB798 \uC800\uC7A5 \uC694\uCCAD (\uC6F9 \uD45C\uC900 or \uB2E8\uCD95\uC5B4 \uC9C1\uC811 \uC804\uC1A1)
    if (request.action === 'UPSERT_LEDGER_RECORD' || request.record || request.amount || request.item) {
      var singleRecord = request.record || normalizeShortcutRecord(request);
      return jsonResponse(upsertLedgerRecord(singleRecord));
    }

    // 3. \uC0AD\uC81C \uC694\uCCAD
    if (request.action === 'DELETE_LEDGER_RECORD') {
      return jsonResponse(deleteLedgerRecord(request.record));
    }

    return jsonResponse({ ok: false, error: '\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC4F0\uAE30 \uC694\uCCAD\uC785\uB2C8\uB2E4.' });
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
