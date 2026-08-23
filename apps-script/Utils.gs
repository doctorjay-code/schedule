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
