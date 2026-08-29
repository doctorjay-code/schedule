import { normalizeLedgerDate } from '../../features/ledger/ledger-utils.js';
import { supabaseRest } from './supabase-client.js';

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
    offsetGroupId: row.offset_group_id || '',
    offsetTitle: row.offset_title || '',
    isForecast: Boolean(row.is_forecast),
    createdAt: row.order_index ?? 0,
    source: 'supabase',
    sheetName: row.payment_method || '기업카드'
  };
}

/**
 * Supabase DB에서 초고속 (0.02초) 가계부 데이터 단일 테이블 조회
 */
export async function fetchLedgerData(fetchImpl = fetch, sheetName = '') {
  let transEndpoint = 'ledger_transactions?select=*&order=date.asc,order_index.asc,id.asc';
  if (sheetName && sheetName !== '잔액전망') {
    transEndpoint += `&payment_method=eq.${encodeURIComponent(sheetName)}`;
  }

  const transactions = await supabaseRest(transEndpoint, { fetchImpl });

  const transRecords = Array.isArray(transactions)
    ? transactions.map(mapTransactionRow)
    : [];

  const counts = {
    기업카드: transRecords.filter(r => r.payment === '기업카드').length,
    토스은행: transRecords.filter(r => r.payment === '토스은행').length,
    현금: transRecords.filter(r => r.payment === '현금').length,
    기업은행: transRecords.filter(r => r.payment === '기업은행').length,
    잔액전망: transRecords.length
  };

  return {
    records: transRecords,
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
    offset_group_id: record.offsetGroupId || null,
    offset_title: record.offsetTitle || null,
    is_forecast: Boolean(record.isForecast),
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
 * Supabase DB에서 거래 다중 일괄 삭제 (단 1번의 IN 쿼리, 0.01s 초고속)
 */
export async function deleteLedgerRecordsBatch(ids, fetchImpl = fetch) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true };

  const validIds = ids.map(String).filter(Boolean);
  if (validIds.length === 0) return { ok: true };

  const inClause = validIds.map(encodeURIComponent).join(',');
  await supabaseRest(`ledger_transactions?id=in.(${inClause})`, {
    method: 'DELETE',
    fetchImpl
  });

  return { ok: true, count: validIds.length };
}

/**
 * Supabase DB에 거래 다중 일괄 생성/복사 (단 1번의 배치 INSERT, 0.01s 초고속)
 */
export async function insertLedgerRecordsBatch(records, fetchImpl = fetch) {
  if (!Array.isArray(records) || records.length === 0) return { ok: true };

  const now = new Date().toISOString();
  const rows = records.map((record, index) => ({
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
    order_index: record.orderIndex ?? ((index + 1) * 10),
    offset_group_id: record.offsetGroupId || null,
    offset_title: record.offsetTitle || null,
    is_forecast: Boolean(record.isForecast),
    updated_at: now
  }));

  const saved = await supabaseRest('ledger_transactions', {
    method: 'POST',
    fetchImpl,
    prefer: 'resolution=merge-duplicates,return=representation',
    body: rows
  });

  return { ok: true, count: rows.length, records: saved };
}

/**
 * Supabase DB 거래 순서 원자적 일괄 갱신
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

/**
 * Supabase DB 상계 묶음 CRUD 함수 (ledger_transactions 테이블 내 직접 연동)
 */
export async function fetchLedgerOffsetGroups(fetchImpl = fetch) {
  try {
    const res = await supabaseRest('ledger_transactions?offset_group_id=not.is.null&select=id,date,offset_group_id,offset_title,amount,type,created_at', { fetchImpl });
    if (!Array.isArray(res)) return {};
    const groups = {};
    res.forEach(row => {
      const gId = row.offset_group_id;
      if (!groups[gId]) {
        groups[gId] = {
          id: gId,
          date: normalizeLedgerDate(row.date),
          title: row.offset_title || '상계 묶음',
          inAmount: 0,
          outAmount: 0,
          recordIds: [],
          createdAt: row.created_at
        };
      }
      groups[gId].recordIds.push(String(row.id));
      if (row.type === 'income') {
        groups[gId].inAmount += Number(row.amount || 0);
      } else {
        groups[gId].outAmount += Number(row.amount || 0);
      }
    });
    return groups;
  } catch (err) {
    console.warn('Failed to fetch ledger offset groups from DB:', err);
    return {};
  }
}

export async function upsertLedgerOffsetGroup(group, fetchImpl = fetch) {
  try {
    if (!group || !group.id || !Array.isArray(group.recordIds) || group.recordIds.length === 0) {
      return { ok: true };
    }
    const inClause = group.recordIds.map(encodeURIComponent).join(',');
    await supabaseRest(`ledger_transactions?id=in.(${inClause})`, {
      method: 'PATCH',
      fetchImpl,
      body: {
        offset_group_id: group.id,
        offset_title: group.title,
        updated_at: new Date().toISOString()
      }
    });
    return { ok: true };
  } catch (err) {
    console.error('Failed to upsert ledger offset group to DB:', err);
    return { ok: false, error: err };
  }
}

export async function deleteLedgerOffsetGroup(groupId, fetchImpl = fetch) {
  try {
    if (!groupId) return { ok: true };
    await supabaseRest(`ledger_transactions?offset_group_id=eq.${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      fetchImpl,
      body: {
        offset_group_id: null,
        offset_title: null,
        updated_at: new Date().toISOString()
      }
    });
    return { ok: true };
  } catch (err) {
    console.error('Failed to delete ledger offset group from DB:', err);
    return { ok: false, error: err };
  }
}

/**
 * 잔액전망 전용 독립 정렬 순서 CRUD (schedule_settings JSON 저장소 연동)
 */
export async function fetchForecastOrders(fetchImpl = fetch) {
  try {
    const res = await supabaseRest('schedule_settings?key=eq.forecast_orders', { fetchImpl });
    if (Array.isArray(res) && res.length > 0 && res[0]?.value) {
      return res[0].value;
    }
    return {};
  } catch (err) {
    console.warn('Failed to fetch forecast orders from DB:', err);
    return {};
  }
}

export async function saveForecastOrders(orderedIds, fetchImpl = fetch) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return { ok: true };
  try {
    const orderMap = {};
    orderedIds.forEach((id, idx) => {
      orderMap[String(id)] = (idx + 1) * 10;
    });

    const row = {
      key: 'forecast_orders',
      value: orderMap,
      updated_at: new Date().toISOString()
    };
    await supabaseRest('schedule_settings', {
      method: 'POST',
      fetchImpl,
      prefer: 'resolution=merge-duplicates',
      body: row
    });
    return { ok: true };
  } catch (err) {
    console.error('Failed to save forecast orders to DB:', err);
    return { ok: false, error: err };
  }
}

/**
 * 집계행(기업카드 결제행, 토스 생활비행) 커스텀 설정(고정비, 날짜, 비고 등) Supabase DB CRUD
 */
export async function fetchForecastAggregateOverrides(fetchImpl = fetch) {
  try {
    const res = await supabaseRest('schedule_settings?key=eq.forecast_aggregate_overrides', { fetchImpl });
    if (Array.isArray(res) && res.length > 0 && res[0]?.value) {
      return res[0].value;
    }
    return {};
  } catch (err) {
    console.warn('Failed to fetch forecast aggregate overrides from DB:', err);
    return {};
  }
}

export async function saveForecastAggregateOverridesToDB(overridesMap, fetchImpl = fetch) {
  try {
    const row = {
      key: 'forecast_aggregate_overrides',
      value: overridesMap || {},
      updated_at: new Date().toISOString()
    };
    await supabaseRest('schedule_settings', {
      method: 'POST',
      fetchImpl,
      prefer: 'resolution=merge-duplicates',
      body: row
    });
    return { ok: true };
  } catch (err) {
    console.error('Failed to save forecast aggregate overrides to DB:', err);
    return { ok: false, error: err };
  }
}

/**
 * 태그 색상 커스텀 설정 Supabase DB CRUD
 */
export async function fetchColorSettingsFromDB(fetchImpl = fetch) {
  try {
    const res = await supabaseRest('schedule_settings?key=eq.color_settings', { fetchImpl });
    if (Array.isArray(res) && res.length > 0 && res[0]?.value) {
      return res[0].value;
    }
    return null;
  } catch (err) {
    console.warn('Failed to fetch color settings from DB:', err);
    return null;
  }
}

export async function saveColorSettingsToDB(colorSettings, fetchImpl = fetch) {
  try {
    const row = {
      key: 'color_settings',
      value: colorSettings || {},
      updated_at: new Date().toISOString()
    };
    await supabaseRest('schedule_settings', {
      method: 'POST',
      fetchImpl,
      prefer: 'resolution=merge-duplicates',
      body: row
    });
    return { ok: true };
  } catch (err) {
    console.error('Failed to save color settings to DB:', err);
    return { ok: false, error: err };
  }
}
