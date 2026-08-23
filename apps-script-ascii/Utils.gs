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

function logApiRequest(e, result, error) {
  try {
    var ss = getLedgerSpreadsheet();
    var logSheet = ss.getSheetByName('_API_LOGS');
    if (!logSheet) {
      logSheet = ss.insertSheet('_API_LOGS');
      logSheet.appendRow(['\uC77C\uC2DC', '\uC218\uC2E0\uB370\uC774\uD130', '\uCC98\uB9AC\uACB0\uACFC', '\uC624\uB958\uB0B4\uC6A9']);
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
  if (!e || !e.postData) throw new Error('POST \uBCF8\uBB38\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');

  var postType = e.postData.type ? cleanText(e.postData.type).toLowerCase() : '';

  // 1. \uBC14\uC774\uB108\uB9AC \uC774\uBBF8\uC9C0 \uD30C\uC77C \uC9C1\uC811 \uC804\uC1A1\uC778 \uACBD\uC6B0 (Content-Type: image/...)
  if (postType.indexOf('image/') !== -1) {
    var bytes = e.postData.getBytes ? e.postData.getBytes() : Utilities.newBlob(e.postData.contents).getBytes();
    return {
      action: 'PARSE_SCREENSHOT',
      base64Image: Utilities.base64Encode(bytes),
      mimeType: postType || 'image/jpeg'
    };
  }

  var raw = cleanText(e.postData.contents);
  if (!raw) throw new Error('POST \uBCF8\uBB38\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4.');

  // 2. JSON \uD30C\uC2F1 \uC2DC\uB3C4 (\uB9C8\uD06C\uB2E4\uC6B4 ```json \uBC0F \uC5EC\uBC31 \uC790\uB3D9 \uC81C\uAC70)
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
    // 3. \uB9CC\uC57D Base64 \uD14D\uC2A4\uD2B8 \uC790\uCCB4\uAC00 \uBC14\uB85C \uC804\uC1A1\uB41C \uACBD\uC6B0 (\uB610\uB294 data:image/... URL)
    if (raw.length > 200 && !raw.match(/[<>{}\[\]]/)) {
      return {
        action: 'PARSE_SCREENSHOT',
        base64Image: raw.replace(/^data:image\/[a-z]+;base64,/, ''),
        mimeType: 'image/jpeg'
      };
    }
  }

  throw new Error('\uC694\uCCAD \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.');
}
