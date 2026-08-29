import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../ledger/supabase-client.js';

let realtimeSocket = null;
let heartbeatTimer = null;
let ledgerRefreshCallback = null;
let scheduleRefreshCallback = null;
let ledgerDebounceTimer = null;
let scheduleDebounceTimer = null;
let reconnectTimer = null;

export function registerRealtimeCallbacks({ onLedgerChange, onScheduleChange }) {
  if (onLedgerChange) ledgerRefreshCallback = onLedgerChange;
  if (onScheduleChange) scheduleRefreshCallback = onScheduleChange;
}

export function initSupabaseRealtime() {
  if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) return;
  if (typeof WebSocket === 'undefined') return;

  try {
    const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
    realtimeSocket = new WebSocket(wsUrl);

    realtimeSocket.onopen = () => {
      console.log('📡 [Realtime] Supabase WebSocket 연결 성공');
      // 1. Join Realtime Topic
      const joinMsg = {
        topic: 'realtime:public',
        event: 'phx_join',
        payload: {
          config: {
            postgres_changes: [
              { event: '*', schema: 'public', table: 'ledger_transactions' },
              { event: '*', schema: 'public', table: 'schedules' },
              { event: '*', schema: 'public', table: 'app_settings' }
            ]
          }
        },
        ref: '1'
      };
      realtimeSocket.send(JSON.stringify(joinMsg));

      // 2. Heartbeat Ping every 25s
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
          realtimeSocket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
        }
      }, 25000);
    };

    realtimeSocket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'postgres_changes') {
          const table = data.payload?.data?.table || data.payload?.table;
          console.log('⚡ [Realtime] 실시간 DB 변경 수신:', table);
          if (table === 'ledger_transactions') {
            if (ledgerRefreshCallback) {
              if (ledgerDebounceTimer) clearTimeout(ledgerDebounceTimer);
              ledgerDebounceTimer = setTimeout(() => ledgerRefreshCallback(), 100);
            }
          } else if (table === 'schedules' || table === 'app_settings') {
            if (scheduleRefreshCallback) {
              if (scheduleDebounceTimer) clearTimeout(scheduleDebounceTimer);
              scheduleDebounceTimer = setTimeout(() => scheduleRefreshCallback(), 100);
            }
          }
        }
      } catch (err) {
        // ignore parse error
      }
    };

    realtimeSocket.onclose = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(initSupabaseRealtime, 5000);
    };

    realtimeSocket.onerror = () => {
      realtimeSocket?.close?.();
    };
  } catch (err) {
    console.warn('Realtime socket init failed:', err);
  }
}
