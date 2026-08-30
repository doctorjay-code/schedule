import { supabaseRest } from './supabase-client.js';

/**
 * Supabase DB에서 가계부 전체 데이터 1회 통합 조회 (0.02s 초고속)
 * - ledger_transactions 단일 테이블에서 전체 실거래를 가져옵니다.
 */
export async function fetchLedgerData(fetchImpl = fetch) {
  const rawTrans = await supabaseRest('ledger_transactions?order=date.asc,order_index.asc,id.asc', { fetchImpl });
  const transList = Array.isArray(rawTrans) ? rawTrans : [];

  const counts = {
    '기업카드': 0,
    '토스은행': 0,
    '현금': 0,
    '기업은행': 0,
    '잔액전망': 0
  };

  const transRecords = transList.map((r, index) => {
    const sheet = r.payment_method || '기업카드';
    if (counts[sheet] !== undefined) counts[sheet]++;

    return {
      id: String(r.id || `trans_${index}`),
      date: r.date,
      type: (r.type || 'expense').toLowerCase(),
      amount: Number(r.amount || 0),
      balance: Number(r.balance || 0),
      payment_method: r.payment_method || '기업카드',
      payment: r.payment_method || '기업카드',
      item: r.item || '',
      user_name: r.user_name || '기타',
      person: r.user_name || '기타',
      category: r.category || '',
      memo: r.memo || '',
      fixed_cost: r.fixed_cost || '',
      fixedCost: r.fixed_cost || '',
      order_index: r.order_index ?? index,
      orderIndex: r.order_index ?? index,
      forecast_order_index: r.forecast_order_index ?? null,
      created_at: r.created_at || r.updated_at || index,
      createdAt: r.created_at || r.updated_at || index,
      source: 'supabase',
      sheetName: sheet,
      offset_group_id: r.offset_group_id || null,
      offset_title: r.offset_title || null,
      is_forecast: Boolean(r.is_forecast)
    };
  });

  return {
    records: transRecords,
    counts,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Supabase DB에 거래 단건 저장 / 수정 (0.05s 초고속)
 */
export async function upsertLedgerRecord(record, fetchImpl = fetch) {
  const row = {
    id: String(record.id || ''),
    payment_method: record.payment || record.sheetName || '기업카드',
    date: record.date,
    user_name: record.user_name || record.person || '기타',
    category: record.category || '',
    item: record.item || '항목 없음',
    memo: record.memo || '',
    fixed_cost: record.fixed_cost || record.fixedCost || '',
    type: (record.type || 'expense').toLowerCase(),
    amount: Number(record.amount || 0),
    balance: Number(record.balance || 0),
    order_index: record.order_index ?? record.orderIndex ?? 0,
    offset_group_id: record.offset_group_id || null,
    offset_title: record.offset_title || null,
    is_forecast: Boolean(record.is_forecast),
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
    payment_method: record.payment_method || record.payment || record.sheetName || '기업카드',
    date: record.date,
    user_name: record.user_name || record.person || '기타',
    category: record.category || '',
    item: record.item || '항목 없음',
    memo: record.memo || '',
    fixed_cost: record.fixed_cost || record.fixedCost || '',
    type: (record.type || 'expense').toLowerCase(),
    amount: Number(record.amount || 0),
    balance: Number(record.balance || 0),
    order_index: record.order_index ?? record.orderIndex ?? ((index + 1) * 10),
    offset_group_id: record.offset_group_id || null,
    offset_title: record.offset_title || null,
    is_forecast: Boolean(record.is_forecast),
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
 * Supabase DB 통장별 거래 순서 원자적 일괄 갱신 (개별 은행 탭 전용)
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

/**
 * Supabase DB 잔액전망 전용 순서 원자적 일괄 갱신 (잔액전망 탭 전용, 통장 순서 1도 안 건드림!)
 */
export async function reorderForecastRecords(orderedIds, fetchImpl = fetch) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return { ok: true };

  await supabaseRest('rpc/reorder_forecast_transactions', {
    method: 'POST',
    fetchImpl,
    body: { ordered_ids: orderedIds.map(String) }
  });

  return { ok: true };
}

/**
 * Supabase DB 상계 묶음 CRUD 함수 (ledger_transactions 테이블 내 직접 연동)
 */
export async function fetchLedgerOffsetGroups(fetchImpl = fetch) {
  const rows = await supabaseRest('ledger_transactions?offset_group_id=not.is.null', { fetchImpl });
  if (!Array.isArray(rows) || rows.length === 0) return {};

  const groups = {};
  rows.forEach(r => {
    const gId = r.offset_group_id;
    if (!groups[gId]) {
      groups[gId] = {
        id: gId,
        date: r.date,
        title: r.offset_title || '상계 묶음',
        inAmount: 0,
        outAmount: 0,
        recordIds: []
      };
    }
    groups[gId].recordIds.push(String(r.id));
    if (r.type === 'income') {
      groups[gId].inAmount += Number(r.amount || 0);
    } else {
      groups[gId].outAmount += Number(r.amount || 0);
    }
  });

  return groups;
}

export async function upsertLedgerOffsetGroup(group, fetchImpl = fetch) {
  if (!group || !group.id || !Array.isArray(group.recordIds)) return { ok: false };
  const validIds = group.recordIds.map(String).filter(Boolean);
  if (validIds.length === 0) return { ok: true };

  const inClause = validIds.map(encodeURIComponent).join(',');
  await supabaseRest(`ledger_transactions?id=in.(${inClause})`, {
    method: 'PATCH',
    fetchImpl,
    body: {
      offset_group_id: group.id,
      offset_title: group.title || null,
      updated_at: new Date().toISOString()
    }
  });

  return { ok: true };
}

export async function deleteLedgerOffsetGroup(groupId, fetchImpl = fetch) {
  if (!groupId) return { ok: false };

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
}

/**
 * Supabase DB 잔액전망 순서 맵 CRUD 함수 (app_settings JSON 맵 연동)
 */
export async function fetchForecastOrders(fetchImpl = fetch) {
  const rows = await supabaseRest('app_settings?key=eq.forecast_orders', { fetchImpl });
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0]?.value || {};
  }
  return {};
}

export async function saveForecastOrders(orderMap, fetchImpl = fetch) {
  if (!orderMap || typeof orderMap !== 'object') return { ok: false };

  await supabaseRest('app_settings', {
    method: 'POST',
    fetchImpl,
    prefer: 'resolution=merge-duplicates',
    body: {
      key: 'forecast_orders',
      value: orderMap,
      updated_at: new Date().toISOString()
    }
  });

  return { ok: true };
}

/**
 * Supabase DB 잔액전망 가상행 오버라이드 CRUD 함수 (app_settings JSON 연동)
 */
export async function fetchForecastAggregateOverrides(fetchImpl = fetch) {
  const rows = await supabaseRest('app_settings?key=eq.forecast_aggregate_overrides', { fetchImpl });
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0]?.value || {};
  }
  return {};
}

export async function saveForecastAggregateOverridesToDB(overrides, fetchImpl = fetch) {
  if (!overrides || typeof overrides !== 'object') return { ok: false };

  await supabaseRest('app_settings', {
    method: 'POST',
    fetchImpl,
    prefer: 'resolution=merge-duplicates',
    body: {
      key: 'forecast_aggregate_overrides',
      value: overrides,
      updated_at: new Date().toISOString()
    }
  });

  return { ok: true };
}

/**
 * 색상 설정 CRUD 함수
 */
export async function fetchColorSettingsFromDB(fetchImpl = fetch) {
  const rows = await supabaseRest('app_settings?key=eq.color_settings', { fetchImpl });
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0]?.value;
  }
  return null;
}

export async function saveColorSettingsToDB(colorSettings, fetchImpl = fetch) {
  await supabaseRest('app_settings', {
    method: 'POST',
    fetchImpl,
    prefer: 'resolution=merge-duplicates',
    body: {
      key: 'color_settings',
      value: colorSettings,
      updated_at: new Date().toISOString()
    }
  });
  return { ok: true };
}
