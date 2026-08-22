import { SECURITY_PASSWORD_HASH } from './auth-config.js';

let authSuccessCallbackFn = null;
const authState = {
  failedAttempts: parseInt(localStorage.getItem('security_failed_attempts') || '0', 10),
  lockoutUntil: parseInt(localStorage.getItem('security_lockout_until') || '0', 10),
  lockoutInterval: null
};

export function setAuthSuccessCallback(fn) {
  authSuccessCallbackFn = typeof fn === 'function' ? fn : null;
}

export function initSecurityAuth() {
  const overlay = document.getElementById('authModalOverlay');
  const input = document.getElementById('authPasswordInput');
  const submit = document.getElementById('authSubmitBtn');
  if (!overlay || !input || !submit) return false;

  if (sessionStorage.getItem('security_authenticated') === 'true') overlay.classList.remove('active');
  else overlay.classList.add('active');

  if (authState.lockoutUntil > Date.now()) startLockoutTimer(authState.lockoutUntil);
  submit.addEventListener('click', handleAuthSubmit);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') handleAuthSubmit();
  });
  return true;
}

export function startLockoutTimer(untilTime) {
  const input = document.getElementById('authPasswordInput');
  const submit = document.getElementById('authSubmitBtn');
  const error = document.getElementById('authErrorMsg');
  const timer = document.getElementById('authLockoutTimer');
  if (input) input.disabled = true;
  if (submit) submit.disabled = true;
  if (timer) timer.classList.remove('hidden');
  if (authState.lockoutInterval) clearInterval(authState.lockoutInterval);
  authState.lockoutInterval = setInterval(() => {
    const remaining = untilTime - Date.now();
    if (remaining <= 0) {
      clearInterval(authState.lockoutInterval);
      authState.failedAttempts = 0;
      authState.lockoutUntil = 0;
      localStorage.removeItem('security_failed_attempts');
      localStorage.removeItem('security_lockout_until');
      if (input) input.disabled = false;
      if (submit) submit.disabled = false;
      if (timer) timer.classList.add('hidden');
      if (error) { error.textContent = ''; error.classList.add('hidden'); }
      return;
    }
    if (timer) {
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      timer.textContent = `접속이 일시 차단되었습니다 (${minutes}분 ${seconds}초 남)`;
    }
  }, 1000);
}
export async function hashString(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleAuthSubmit() {
  const overlay = document.getElementById('authModalOverlay');
  const input = document.getElementById('authPasswordInput');
  const error = document.getElementById('authErrorMsg');
  if (!input || authState.lockoutUntil > Date.now()) return;
  let enteredHash;
  try {
    enteredHash = await hashString(input.value.trim());
  } catch (hashError) {
    console.error('Password verification failed:', hashError);
    if (error) {
      error.textContent = '비밀번호를 확인할 수 없습니다. localhost 또는 HTTPS 주소로 다시 접속해주세요.';
      error.classList.remove('hidden');
    }
    return;
  }
  if (enteredHash === SECURITY_PASSWORD_HASH) {
    sessionStorage.setItem('security_authenticated', 'true');
    authState.failedAttempts = 0;
    localStorage.removeItem('security_failed_attempts');
    input.value = '';
    if (error) { error.textContent = ''; error.classList.add('hidden'); }
    if (overlay) overlay.classList.remove('active');
    try {
      await authSuccessCallbackFn?.();
    } catch (loadError) {
      console.error('Authenticated app failed to start:', loadError);
    }
    return;
  }
  authState.failedAttempts += 1;
  localStorage.setItem('security_failed_attempts', String(authState.failedAttempts));
  if (authState.failedAttempts >= 10) {
    authState.lockoutUntil = Date.now() + 5 * 60 * 1000;
    localStorage.setItem('security_lockout_until', String(authState.lockoutUntil));
    if (error) {
      error.textContent = '입력 오류가 누적되어 5분간 접속이 차단되었습니다';
      error.classList.remove('hidden');
    }
    startLockoutTimer(authState.lockoutUntil);
  } else if (error) {
    error.textContent = `비밀번호가 올바르지 않습니다. (오류: ${authState.failedAttempts}/10)`;
    error.classList.remove('hidden');
  }
}
