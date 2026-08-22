/** 공통 문자열·헤더·응답 유틸리티 */
function headerIndex(headers) {
  var index = {};
  headers.forEach(function(header, column) {
    index[cleanText(header)] = column;
  });
  return index;
}

function setCell(row, index, header, value) {
  if (index[header] !== undefined) row[index[header]] = value;
}

function blankRow(length) {
  return Array.apply(null, Array(length)).map(function() { return ''; });
}

function cleanText(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function usableRecordId(id) {
  return /^(ibkcard|tossbank|ibkbank)-\d{8}$/.test(cleanText(id));
}

function requiredText(value, label) {
  var text = cleanText(value);
  if (!text) throw new Error(label + '을(를) 입력해 주세요.');
  return text;
}

function requiredDate(value) {
  var date = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('날짜 형식은 YYYY-MM-DD여야 합니다.');
  }
  return date;
}

function normalizeType(value) {
  return cleanText(value).toLowerCase() === 'income' ? 'income' : 'expense';
}

function requiredAmount(value) {
  var amount = Number(value);
  if (!isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) {
    throw new Error('금액은 1원 이상의 정수여야 합니다.');
  }
  return amount;
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
  if (/^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/.test(text)) {
    var numbers = text.match(/\d+/g);
    return numbers[0] + '-' + ('0' + numbers[1]).slice(-2) + '-' + ('0' + numbers[2]).slice(-2);
  }
  throw new Error('날짜를 해석할 수 없습니다: ' + text);
}

function parseIsoDate(value) {
  var iso = formatIsoDate(value);
  var parts = iso.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function valuesEqual(left, right) {
  return cleanText(left) === cleanText(right);
}

function parsePostRequest(e) {
  var raw = e && e.postData ? cleanText(e.postData.contents) : '';
  if (!raw) throw new Error('POST 본문이 없습니다.');

  try {
    var request = JSON.parse(raw);
    if (!request || typeof request !== 'object') throw new Error('요청 형식이 올바르지 않습니다.');
    return request;
  } catch (error) {
    if (error && error.message === '요청 형식이 올바르지 않습니다.') throw error;
    throw new Error('POST 본문을 JSON으로 해석하지 못했습니다.');
  }
}
