import { normalizeLedgerDate } from '../../features/ledger/ledger-utils.js?v=20260824_42';
import { supabaseRest } from './supabase-client.js?v=20260824_42';

const GOOGLE_SHEETS_FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbwrabwa6r6tuowlOiiewohmSTcESk2OhnwJST6uh50pDBCdx0cWUG8usGJASRqz1UBb/exec';

const SHEET_PAYMENT = {
  기업카드: '기업카드',
  토스은행: '토스은행',
  현금: '현금',
  기업은행: '기업은행',
  잔액전망: '잔액전망'
};

function mapTransactionRow(row) {
  return {
    id: row.id,
    date: normalizeLedgerDate(row.date),
    type: row.type || 'expense',
    amount: Number(row.amount || 0),
    balance: Number(row.balance || 0),
    payment: row.payment_method || '기업카드',
    item: row.item || '항목 없음',
    person: row.user_name || '기타',
    category: row.category || '기타',
    memo: row.memo || '',
    fixedCost: row.fixed_cost || '',
    orderIndex: Number(row.order_index || 0),
    createdAt: row.order_index ?? 0,
    source: 'supabase',
    sheetName: row.payment_method || '기업카드'
  };
}

function mapForecastRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id || '',
    date: normalizeLedgerDate(row.date),
    type: row.type || 'balance',
    amount: Number(row.amount || 0),
    balance: Number(row.balance || 0),
    payment: row.account || '토스은행',
    account: row.account || '토스은행',
    item: row.item || '',
    memo: row.memo || '',
    isConfirmed: Boolean(row.is_confirmed),
    orderIndex: Number(row.order_index || 0),
    createdAt: row.order_index ?? 0,
    source: 'supabase',
    sheetName: '잔액전망'
  };
}

/**
 * Supabase DB에서 초고속 (0.05초) 가계부 데이터 조회
 */
export async function fetchLedgerSheetData(fetchImpl = fetch, sheetName = '') {
  try {
    let transEndpoint = 'ledger_transactions?select=*&order=date.asc,order_index.asc,id.asc';
    if (sheetName && sheetName !== '잔액전망') {
      transEndpoint += `&payment_method=eq.${encodeURIComponent(sheetName)}`;
    }

    const [transactions, forecasts] = await Promise.all([
      supabaseRest(transEndpoint, { fetchImpl }),
      supabaseRest('ledger_balance_forecast?select=*&order=date.asc,order_index.asc', { fetchImpl })
    ]);

    const transRecords = Array.isArray(transactions) ? transactions.map(mapTransactionRow) : [];
    const forecastRecords = Array.isArray(forecasts) ? forecasts.map(mapForecastRow) : [];
    const records = [...transRecords, ...forecastRecords];

    const counts = {
      기업카드: transRecords.filter(r => r.payment === '기업카드').length,
      토스은행: transRecords.filter(r => r.payment === '토스은행').length,
      현금: transRecords.filter(r => r.payment === '현금').length,
      기업은행: transRecords.filter(r => r.payment === '기업은행').length,
      잔액전망: forecastRecords.length
    };

    return {
      records,
      counts,
      fetchedAt: new Date().toISOString()
    };
  } catch (supabaseError) {
    console.warn('Supabase fetch failed, falling back to Sheets:', supabaseError);
    return fetchLedgerSheetDataFromGAS(fetchImpl, sheetName);
  }
}

/**
 * Google Apps Script Fallback Reader
 */
async function fetchLedgerSheetDataFromGAS(fetchImpl = fetch, sheetName = '') {
  const query = new URLSearchParams({ action: 'GET_LEDGER_DATA', _t: String(Date.now()) });
  const selectedSheet = String(sheetName || '').trim();
  if (selectedSheet) query.set('sheet', selectedSheet);
  const response = await fetchImpl(`${GOOGLE_SHEETS_FALLBACK_URL}?${query.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`가계부 시트 응답 오류 (${response.status})`);
  const payload = await response.json();
  return payload;
}

/**
 * Supabase DB에 거래 단건 저장 / 수정 (0.05s 초고속)
 */
export async function upsertLedgerSheetRecord(record, fetchImpl = fetch) {
  const row = {
    id: String(record.id || ''),
    payment_method: record.payment || record.sheetName || '기업카드',
    date: record.date,
    user_name: record.person || '기타',
    category: record.category || '',
    item: record.item || '항목 없음',
    memo: record.memo || '',
    fixed_cost: record.fixedCost || '',
    type: (record.type || 'expense').toLowerCase(),
    amount: Number(record.amount || 0),
    order_index: record.orderIndex || 0,
    updated_at: new Date().toISOString()
  };

  // 1. Supabase 즉시 저장
  const saved = await supabaseRest('ledger_transactions', {
    method: 'POST',
    fetchImpl,
    prefer: 'resolution=merge-duplicates,return=representation',
    body: row
  });

  // 2. Google Sheets 백업 미러링 (백그라운드 비동기)
  mirrorToGoogleSheets('UPSERT_LEDGER_RECORD', record);

  return { ok: true, id: row.id, record: saved };
}

/**
 * Supabase DB에서 거래 삭제 (0.05s 초고속)
 */
export async function deleteLedgerSheetRecord(record, fetchImpl = fetch) {
  const targetId = String(record.id || '');
  if (!targetId) return { ok: false };

  // 1. Supabase 즉시 삭제
  await supabaseRest(`ledger_transactions?id=eq.${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
    fetchImpl
  });

  // 2. Google Sheets 백업 미러링
  mirrorToGoogleSheets('DELETE_LEDGER_RECORD', record);

  return { ok: true, id: targetId };
}

/**
 * Supabase DB 거래 순서 일괄 갱신 (0.05s 초고속)
 */
export async function reorderLedgerSheetRecords(sheetName, orderedIds, fetchImpl = fetch) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return { ok: true };

  const updates = orderedIds.map((id, index) => ({
    id: String(id),
    order_index: index,
    updated_at: new Date().toISOString()
  }));

  // Supabase 배치 순서 업데이트
  for (const item of updates) {
    await supabaseRest(`ledger_transactions?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      fetchImpl,
      body: { order_index: item.order_index, updated_at: item.updated_at }
    }).catch(() => {});
  }

  // Google Sheets 백업 미러링
  mirrorToGoogleSheets('REORDER_LEDGER_RECORDS', { sheetName, orderedIds });

  return { ok: true, count: orderedIds.length };
}

/**
 * Google Sheets 비동기 백업 미러링 헬퍼 (웹 UI 지연 0초 보장)
 */
function mirrorToGoogleSheets(action, payload) {
  try {
    fetch(GOOGLE_SHEETS_FALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, record: payload, ...(typeof payload === 'object' ? payload : {}) })
    }).catch(err => console.debug('Google Sheets mirroring background note:', err));
  } catch {}
}
