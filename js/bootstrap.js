import { initSecurityAuth, setAuthSuccessCallback } from './auth/auth.js';

let appLoadPromise = null;

function showAppLoadError() {
  let notice = document.getElementById('appLoadErrorNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'appLoadErrorNotice';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;left:50%;bottom:20px;z-index:10000;max-width:calc(100vw - 32px);transform:translateX(-50%);padding:12px 14px;border:1px solid #FCA5A5;border-radius:10px;background:#FEF2F2;color:#991B1B;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(15,23,42,.16)';
    document.body.appendChild(notice);
  }
  notice.textContent = '로그인은 완료되었지만 일정 화면을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.';
}

async function loadAuthenticatedApp() {
  if (appLoadPromise) return appLoadPromise;
  appLoadPromise = import('./app.js?v=20260825_10')
    .then(async module => {
      const res = module.initializeAppLogic();
      try {
        const { initSupabaseRealtime } = await import('./services/shared/supabase-realtime.js?v=20260825_10');
        initSupabaseRealtime();
      } catch (err) {
        console.warn('Realtime init skipped:', err);
      }
      return res;
    })
    .catch(error => {
      console.error('Authenticated application module failed:', error);
      appLoadPromise = null;
      showAppLoadError();
    });
  return appLoadPromise;
}

function startBootstrap() {
  setAuthSuccessCallback(loadAuthenticatedApp);
  initSecurityAuth();
  if (sessionStorage.getItem('security_authenticated') === 'true') {
    loadAuthenticatedApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startBootstrap);
} else {
  startBootstrap();
}