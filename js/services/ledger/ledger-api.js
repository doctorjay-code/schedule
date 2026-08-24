import { normalizeLedgerDate } from '../../features/ledger/ledger-utils.js?v=20260824_32';

const LEDGER_API_URL = 'https://script.google.com/macros/s/AKfycbwrabwa6r6tuowlOiiewohmSTcESk2OhnwJST6uh50pDBCdx0cWUG8usGJASRqz1UBb/exec';

const SHEET_PAYMENT = {
  기업카드: '기업카드',
  토스은행: '토스은행',
  현금: '현금',
  기업은행: '기업은행',
  잔액전망: '잔액전망'
};

function normalizedHeader(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function createRowReader(headers, row) {
  const indexByHeader = new Map(headers.map((header, index) => [normalizedHeader(header), index]));
  return (...headerNames) => {
    for (const headerName of headerNames) {
      const index = indexByHeader.get(normalizedHeader(headerName));
      if (index !== undefined) return String(row[index] ?? '').trim();
    }
    return '';
  };
}

function toAmount(value) {
  const amount = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

function normalizeType(value, income, expense) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'income' || type === '수입') return 'income';
  if (type === 'expense' || type === '지출') return 'expense';
  return toAmount(income) > 0 ? 'income' : 'expense';
}

function mapSheetRows(sheetName, sheetData) {
  const headers = Array.isArray(sheetData?.headers) ? sheetData.headers : [];
  const rows = Array.isArray(sheetData?.rows) ? sheetData.rows : [];
  const payment = SHEET_PAYMENT[sheetName];
  if (!payment) return [];

  return rows.map((row, rowIndex) => {
    const read = createRowReader(headers, row);
    const income = read('수입', 'income');
    const expense = read('지출', 'expense');
    const type = normalizeType(read('type', '구분'), income, expense);
    const amount = toAmount(read('amount', '금액')) || toAmount(type === 'income' ? income : expense);
    const fixedCost = read('고정비', '고정비여부');
    const balance = sheetName === '잔액전망'
      ? toAmount(read('총잔액', '잔액'))
      : toAmount(read('잔액', '사용액'));

    return {
      id: read('id', '원본id') || `sheets-${sheetName}-${rowIndex + 2}`,
      date: normalizeLedgerDate(read('날짜', 'date')),
      type,
      amount,
      balance,
      payment,
      item: read('항목', 'item') || '항목 없음',
      person: read('사용자') || '기타',
      category: read('사용처', 'category') || '기타',
      memo: read('비고', 'memo'),
      fixedCost,
      createdAt: rowIndex,
      source: 'google-sheets',
      sheetName,
      sheetRow: rowIndex + 2
    };
  }).filter(record => record.date && (record.amount > 0 || (sheetName === '잔액전망' && record.item !== '항목 없음')));
}

export async function fetchLedgerSheetData(fetchImpl = fetch, sheetName = '') {
  const query = new URLSearchParams({ action: 'GET_LEDGER_DATA', _t: String(Date.now()) });
  const selectedSheet = String(sheetName || '').trim();
  if (selectedSheet) query.set('sheet', selectedSheet);
  const response = await fetchImpl(`${LEDGER_API_URL}?${query.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`가계부 시트 응답 오류 (${response.status})`);

  const payload = await response.json();
  if (!payload?.ok || !payload?.ledgers) {
    throw new Error(payload?.error || '가계부 시트 데이터를 읽지 못했습니다.');
  }

  const records = Object.entries(payload.ledgers)
    .flatMap(([currentSheetName, sheetData]) => mapSheetRows(currentSheetName, sheetData));
  const counts = Object.fromEntries(Object.entries(payload.ledgers)
    .map(([currentSheetName, sheetData]) => [currentSheetName, Number(sheetData?.rowCount || 0)]));

  return {
    records,
    counts,
    fetchedAt: payload.fetchedAt || null
  };
}

async function postLedgerRequest(action, record, fetchImpl = fetch) {
  const response = await fetchImpl(LEDGER_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, record })
  });
  if (!response.ok) throw new Error(`가계부 시트 저장 오류 (${response.status})`);

  const payload = await response.json();
  if (!payload?.ok) throw new Error(payload?.error || '가계부 시트 저장에 실패했습니다.');
  return payload;
}

export function upsertLedgerSheetRecord(record, fetchImpl = fetch) {
  return postLedgerRequest('UPSERT_LEDGER_RECORD', record, fetchImpl);
}

export function deleteLedgerSheetRecord(record, fetchImpl = fetch) {
  return postLedgerRequest('DELETE_LEDGER_RECORD', record, fetchImpl);
}
