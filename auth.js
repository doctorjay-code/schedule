import { SECURITY_PASSWORD_HASH, state } from './state.js';
import { syncFromGoogleSheets } from './api.js';

let authSuccessCallbackFn = null;

export function setAuthSuccessCallback(fn) {
  authSuccessCallbackFn = fn;
}

export function initSecurityAuth() {
  const authModalOverlay = document.getElementById('authModalOverlay');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const authSubmitBtn = document.getElementById('authSubmitBtn');

  if (!authModalOverlay || !authPasswordInput || !authSubmitBtn) return;

  const isAuthPassed = sessionStorage.getItem('security_authenticated');
  if (isAuthPassed === 'true') {
    authModalOverlay.classList.remove('active');
  } else {
    authModalOverlay.classList.add('active');
  }

  const now = Date.now();
  if (state.lockoutUntil && now < state.lockoutUntil) {
    startLockoutTimer(state.lockoutUntil);
  }

  authSubmitBtn.addEventListener('click', handleAuthSubmit);
  authPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuthSubmit();
  });
}

export function startLockoutTimer(untilTime) {
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const authLockoutTimer = document.getElementById('authLockoutTimer');

  if (authSubmitBtn) authSubmitBtn.disabled = true;
  if (authPasswordInput) authPasswordInput.disabled = true;
  if (authLockoutTimer) authLockoutTimer.classList.remove('hidden');

  if (state.lockoutInterval) clearInterval(state.lockoutInterval);

  state.lockoutInterval = setInterval(() => {
    const remainingMs = untilTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(state.lockoutInterval);
      state.failedAttempts = 0;
      state.lockoutUntil = 0;
      localStorage.removeItem('security_failed_attempts');
      localStorage.removeItem('security_lockout_until');

      if (authSubmitBtn) authSubmitBtn.disabled = false;
      if (authPasswordInput) authPasswordInput.disabled = false;
      if (authLockoutTimer) authLockoutTimer.classList.add('hidden');
      if (authErrorMsg) {
        authErrorMsg.textContent = '';
        authErrorMsg.classList.add('hidden');
      }
    } else {
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      if (authLockoutTimer) {
        authLockoutTimer.textContent = `🚨 10회 입력 오류로 차단됨! (남은 시간: ${minutes}분 ${seconds}초)`;
      }
    }
  }, 1000);
}

export async function hashString(str) {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleAuthSubmit() {
  const authModalOverlay = document.getElementById('authModalOverlay');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const authErrorMsg = document.getElementById('authErrorMsg');

  if (!authPasswordInput) return;
  const enteredPass = authPasswordInput.value.trim();
  const now = Date.now();

  if (state.lockoutUntil && now < state.lockoutUntil) return;

  const enteredHash = await hashString(enteredPass);

  if (enteredHash === SECURITY_PASSWORD_HASH) {
    sessionStorage.setItem('security_authenticated', 'true');
    if (authModalOverlay) authModalOverlay.classList.remove('active');
    state.failedAttempts = 0;
    localStorage.removeItem('security_failed_attempts');
    authPasswordInput.value = '';
    if (authSuccessCallbackFn) authSuccessCallbackFn();
  } else {
    state.failedAttempts++;
    localStorage.setItem('security_failed_attempts', state.failedAttempts.toString());

    if (state.failedAttempts >= 10) {
      state.lockoutUntil = Date.now() + 5 * 60 * 1000; // 5 Minutes Lockout for this device
      localStorage.setItem('security_lockout_until', state.lockoutUntil.toString());
      if (authErrorMsg) {
        authErrorMsg.textContent = '❌ 10회 연속 오답으로 5분간 접속이 차단됩니다.';
        authErrorMsg.classList.remove('hidden');
      }
      startLockoutTimer(state.lockoutUntil);
    } else {
      if (authErrorMsg) {
        authErrorMsg.textContent = `❌ 비밀번호가 틀렸습니다. (오류: ${state.failedAttempts}/10회)`;
        authErrorMsg.classList.remove('hidden');
      }
    }
  }
}
