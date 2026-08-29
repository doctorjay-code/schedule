/**
 * Single UI Writer for Offline Banner, Sync Badges, and Spinner Animations.
 * All modules must call these helpers instead of manipulating banner/badge DOM directly.
 */

const syncMessages = {
  idle: '저장 준비됨',
  loading: '일정 불러오는 중',
  saving: '저장 중',
  saved: '저장 완료',
  offline: '인터넷 연결 확인 필요',
  error: '저장 실패 — 다시 시도 필요'
};

let onlineBannerTimer = null;

export function showOfflineBanner(message = '⚠️ 인터넷 연결 확인 필요 (오프라인 모드)') {
  const banner = document.getElementById('appOfflineBanner');
  if (!banner) return;
  if (onlineBannerTimer) clearTimeout(onlineBannerTimer);
  banner.textContent = message;
  banner.classList.remove('hidden', 'is-online');
}

export function showOnlineBanner(message = '🟢 인터넷이 다시 연결되었습니다!') {
  const banner = document.getElementById('appOfflineBanner');
  if (!banner) return;
  if (onlineBannerTimer) clearTimeout(onlineBannerTimer);
  banner.textContent = message;
  banner.classList.add('is-online');
  banner.classList.remove('hidden');
  onlineBannerTimer = setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('is-online');
  }, 1500);
}

export function setSyncSpinning(isSpinning) {
  const syncBtn = document.getElementById('manualSyncBtn');
  const ledgerSyncBtn = document.getElementById('ledgerRefreshBtn');
  const syncIcon = document.querySelector('#manualSyncBtn .sync-icon');

  if (isSpinning) {
    syncBtn?.classList.add('is-syncing');
    ledgerSyncBtn?.classList.add('is-syncing');
    syncIcon?.classList.add('spin');
  } else {
    syncBtn?.classList.remove('is-syncing');
    ledgerSyncBtn?.classList.remove('is-syncing');
    syncIcon?.classList.remove('spin');
  }
}

export function setScheduleSyncBadge(state, detail = '') {
  const statusElem = document.getElementById('syncStatus');
  if (!statusElem) return;
  statusElem.dataset.state = state;
  statusElem.textContent = detail || syncMessages[state] || syncMessages.saved;
}

export function setLedgerSyncBadge(state, detail = '') {
  const element = document.getElementById('ledgerSyncBtn');
  if (!element) return;
  const ledgerMessages = {
    loading: '가계부 불러오는 중',
    saved: '최신 내역 반영',
    cached: '오프라인 캐시본 표시 중',
    offline: '인터넷 연결 확인 필요',
    error: '가계부 불러오기 실패'
  };
  element.dataset.state = state;
  element.textContent = detail || ledgerMessages[state] || ledgerMessages.saved;
  element.title = element.textContent;
}

export function setSyncStatus(state, detail = '') {
  // 1. 오프라인 / 에러 / 온라인 배너 제어
  if (state === 'offline') {
    showOfflineBanner('⚠️ 인터넷 연결 확인 필요 (오프라인 모드)');
  } else if (state === 'error') {
    showOfflineBanner('⚠️ 저장 실패 — 인터넷 상태를 확인해 주세요');
  } else if (state === 'saved') {
    const banner = document.getElementById('appOfflineBanner');
    if (banner && !banner.classList.contains('hidden') && !banner.classList.contains('is-online')) {
      showOnlineBanner();
    }
  }

  // 2. 동기화 중 스핀 애니메이션 제어
  setSyncSpinning(state === 'saving' || state === 'loading');

  // 3. 뱃지 텍스트 갱신
  setScheduleSyncBadge(state, detail);
}
