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
    if (request.action === 'UPSERT_LEDGER_RECORD') {
      return jsonResponse(upsertLedgerRecord(request.record));
    }
    if (request.action === 'DELETE_LEDGER_RECORD') {
      return jsonResponse(deleteLedgerRecord(request.record));
    }
    return jsonResponse({ ok: false, error: '지원하지 않는 쓰기 요청입니다.' });
  } catch (error) {
    return errorResponse(error);
  }
}

function getRequestAction(e) {
  return e && e.parameter ? cleanText(e.parameter.action) : '';
}
