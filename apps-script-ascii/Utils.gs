/** \uACF5\uD1B5 \uBB38\uC790\uC5F4\u00B7\uD5E4\uB354\u00B7\uC751\uB2F5 \uC720\uD2F8\uB9AC\uD2F0 (Fail-Safe Universal Helper) */
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
  return text || (label || '\uD56D\uBAA9 \uC5C6\uC74C');
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

function parsePostRequest(e) {
  var raw = e && e.postData ? cleanText(e.postData.contents) : '';
  if (!raw) throw new Error('POST \uBCF8\uBB38\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');

  try {
    var request = JSON.parse(raw);
    if (!request || typeof request !== 'object') throw new Error('\uC694\uCCAD \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.');
    return request;
  } catch (error) {
    if (error && error.message === '\uC694\uCCAD \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.') throw error;
    throw new Error('POST \uBCF8\uBB38\uC744 JSON\uC73C\uB85C \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
  }
}
