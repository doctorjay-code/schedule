const messages = {
  idle: '저장 준비됨',
  loading: '일정 불러오는 중',
  saving: '저장 중',
  saved: '저장 완료',
  offline: '인터넷 연결 확인 필요',
  error: '저장 실패 — 다시 시도 필요'
};

export function setSyncStatus(state, detail = '') {
  const elem = document.getElementById('syncStatus');
  if (!elem) return;
  elem.dataset.state = state;
  elem.textContent = detail || messages[state] || messages.idle;
  elem.title = elem.textContent;
}
