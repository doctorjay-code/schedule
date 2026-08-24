import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../ledger/supabase-client.js';

let realtimeClient = null;
let ledgerRefreshCallback = null;
let scheduleRefreshCallback = null;
let ledgerDebounceTimer = null;
let scheduleDebounceTimer = null;

export function registerRealtimeCallbacks({ onLedgerChange, onScheduleChange }) {
  if (onLedgerChange) ledgerRefreshCallback = onLedgerChange;
  if (onScheduleChange) scheduleRefreshCallback = onScheduleChange;
}

export function initSupabaseRealtime() {
  if (realtimeClient) return;

  try {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    const channel = realtimeClient.channel('db_realtime_sync');

    // 1. 가계부 거래 및 잔액전망 실시간 감지
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_transactions' }, payload => {
        console.log('⚡ [Realtime] 가계부 거래 실시간 변경 감지:', payload.eventType);
        if (ledgerRefreshCallback) {
          if (ledgerDebounceTimer) clearTimeout(ledgerDebounceTimer);
          ledgerDebounceTimer = setTimeout(() => {
            ledgerRefreshCallback();
          }, 100);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_balance_forecast' }, payload => {
        console.log('⚡ [Realtime] 잔액전망 실시간 변경 감지:', payload.eventType);
        if (ledgerRefreshCallback) {
          if (ledgerDebounceTimer) clearTimeout(ledgerDebounceTimer);
          ledgerDebounceTimer = setTimeout(() => {
            ledgerRefreshCallback();
          }, 100);
        }
      })
      // 2. 일정 및 색상 설정 실시간 감지
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, payload => {
        console.log('⚡ [Realtime] 일정 실시간 변경 감지:', payload.eventType);
        if (scheduleRefreshCallback) {
          if (scheduleDebounceTimer) clearTimeout(scheduleDebounceTimer);
          scheduleDebounceTimer = setTimeout(() => {
            scheduleRefreshCallback();
          }, 100);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_settings' }, payload => {
        console.log('⚡ [Realtime] 일정 설정 실시간 변경 감지:', payload.eventType);
        if (scheduleRefreshCallback) {
          if (scheduleDebounceTimer) clearTimeout(scheduleDebounceTimer);
          scheduleDebounceTimer = setTimeout(() => {
            scheduleRefreshCallback();
          }, 100);
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 [Realtime] Supabase 실시간 동기화 채널 연결 완료!');
        }
      });
  } catch (error) {
    console.warn('Realtime 초기화 실패 (오프라인/CDN 차단):', error);
  }
}
