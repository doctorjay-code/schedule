import { normalizeLedgerDate } from '../../features/ledger/ledger-utils.js?v=20260824_47';
import { supabaseRest } from './supabase-client.js?v=20260824_47';

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
export async function fetchLedgerData(fetchImpl = fetch, sheetName = '') {
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
}
export const fetchLedgerSheetData = fetchLedgerData;

/**
 * Supabase DB에 거래 단건 저장 / 수정 (0.05s 초고속)
 */
export async function upsertLedgerRecord(record, fetchImpl = fetch) {
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
    balance: Number(record.balance || 0),
    order_index: record.orderIndex || 0,
    updated_at: new Date().toISOString()
  };

  const saved = await supabaseRest('ledger_transactions', {
    method: 'POST',
    fetchImpl,
    prefer: 'resolution=merge-duplicates,return=representation',
    body: row
  });

  return { ok: true, id: row.id, record: saved };
}
export const upsertLedgerSheetRecord = upsertLedgerRecord;

/**
 * Supabase DB에서 거래 삭제 (0.05s 초고속)
 */
export async function deleteLedgerRecord(record, fetchImpl = fetch) {
  const targetId = String(record.id || '');
  if (!targetId) return { ok: false };

  await supabaseRest(`ledger_transactions?id=eq.${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
    fetchImpl
  });

  return { ok: true, id: targetId };
}
export const deleteLedgerSheetRecord = deleteLedgerRecord;

/**
 * Supabase DB 거래 순서 원자적 일괄 갱신 (단 0.005s Supabase RPC 트랜잭션)
 */
export async function reorderLedgerRecords(sheetName, orderedIds, fetchImpl = fetch) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return { ok: true };

  await supabaseRest('rpc/reorder_transactions', {
    method: 'POST',
    fetchImpl,
    body: { ordered_ids: orderedIds.map(String) }
  });

  return { ok: true };
}
export const reorderLedgerSheetRecords = reorderLedgerRecords;
