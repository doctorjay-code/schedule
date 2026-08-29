const messages = {
  idle: '저장 준비됨',
  loading: '일정 불러오는 중',
  saving: '저장 중',
  saved: '저장 완료',
  offline: '인터넷 연결 확인 필요',
  error: '저장 실패 — 다시 시도 필요'
};

export function setSyncStatus(state, detail = '') {
  const banner = document.getElementById('appOfflineBanner');
  const syncBtn = document.getElementById('manualSyncBtn');
  const ledgerSyncBtn = document.getElementById('ledgerRefreshBtn');

  // 1. 오프라인 / 에러 상태 처리
  if (state === 'offline' || state === 'error') {
    if (banner) {
      banner.textContent = state === 'offline' ? '⚠️ 인터넷 연결 확인 필요 (오프라인 모드)' : '⚠️ 저장 실패 — 인터넷 상태를 확인해 주세요';
      banner.classList.remove('hidden', 'is-online');
    }
  } else if (state === 'saved') {
    if (banner && banner.classList && typeof banner.classList.contains === 'function' && !banner.classList.contains('hidden') && !banner.classList.contains('is-online')) {
      banner.textContent = '🟢 인터넷이 다시 연결되었습니다!';
      banner.classList.add('is-online');
      setTimeout(() => {
        banner.classList.add('hidden');
        banner.classList.remove('is-online');
      }, 1500);
    }
  }

  // 2. 동기화 중 스핀 애니메이션 처리
  if (state === 'saving' || state === 'loading') {
    syncBtn?.classList.add('is-syncing');
    ledgerSyncBtn?.classList.add('is-syncing');
  } else {
    syncBtn?.classList.remove('is-syncing');
    ledgerSyncBtn?.classList.remove('is-syncing');
  }
}
