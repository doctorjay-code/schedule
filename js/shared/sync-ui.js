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

/**
 * 길게 누르기(Long-Press, 약 650ms) 시 웹앱/브라우저 전체를 최신 코드로 강제 새로고침하는 헬퍼
 * - 일반 클릭 시: 기존 데이터 동기화 정상 수행
 * - 650ms 이상 길게 누를 시: 진동 피드백 + 토스트 안내 후 캐시 우회 강제 리로드(URL timestamp param)
 */
export function attachHardReloadLongPress(element) {
  if (!element) return;

  let timer = null;
  let isLongPress = false;
  let startX = 0;
  let startY = 0;

  function executeHardReload() {
    isLongPress = true;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([40, 60, 40]); } catch {}
    }
    const toast = typeof document !== 'undefined' ? document.getElementById('ledgerToast') : null;
    if (toast) {
      toast.textContent = '🔄 최신 코드로 새로고침합니다...';
      toast.classList.remove('hidden');
    }
    setTimeout(() => {
      try {
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('t', Date.now().toString());
          window.location.replace(url.toString());
        }
      } catch {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    }, 250);
  }

  function startPress(clientX, clientY) {
    isLongPress = false;
    startX = clientX;
    startY = clientY;
    if (timer) clearTimeout(timer);
    timer = setTimeout(executeHardReload, 650);
  }

  function cancelPress() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  // Touch Events (모바일 웹앱/PWA)
  element.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) {
      startPress(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  element.addEventListener('touchmove', (e) => {
    if (timer && e.touches && e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 10 || dy > 10) {
        cancelPress();
      }
    }
  }, { passive: true });

  element.addEventListener('touchend', cancelPress, { passive: true });
  element.addEventListener('touchcancel', cancelPress, { passive: true });

  // Mouse Events (데스크탑 마우스 롱클릭 지원)
  element.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      startPress(e.clientX, e.clientY);
    }
  });

  element.addEventListener('mousemove', (e) => {
    if (timer) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 10 || dy > 10) {
        cancelPress();
      }
    }
  });

  element.addEventListener('mouseup', cancelPress);
  element.addEventListener('mouseleave', cancelPress);

  // Click Event Interceptor: 롱프레스 발동 시 기존 데이터 동기화 click 발동 차단
  element.addEventListener('click', (e) => {
    if (isLongPress) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      e.stopPropagation?.();
      setTimeout(() => { isLongPress = false; }, 400);
    }
  }, true);
}
