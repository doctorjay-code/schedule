import { formatMoney, normalizeLedgerDate } from './ledger-utils.js';

const OFFSET_GROUPS_STORAGE_KEY = 'LEDGER_OFFSET_GROUPS_V1';

export function loadOffsetGroups() {
  try {
    const raw = localStorage.getItem(OFFSET_GROUPS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    console.warn('Failed to load offset groups:', err);
    return {};
  }
}

export function saveOffsetGroups(groups) {
  try {
    localStorage.setItem(OFFSET_GROUPS_STORAGE_KEY, JSON.stringify(groups || {}));
  } catch (err) {
    console.warn('Failed to save offset groups:', err);
  }
}

export function createOffsetGroupFromRecords(records) {
  if (!Array.isArray(records) || records.length < 2) {
    return { ok: false, message: '상계 묶음을 만들려면 2개 이상의 거래를 선택해야 합니다.' };
  }

  const inSum = records.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const outSum = records.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);

  if (inSum !== outSum) {
    return {
      ok: false,
      message: `수입 합계(${formatMoney(inSum)}원)와 지출 합계(${formatMoney(outSum)}원)가 일치하지 않아 상계할 수 없습니다. (차액: ${formatMoney(Math.abs(inSum - outSum))}원)`
    };
  }

  const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const firstDate = normalizeLedgerDate(sorted[0].date);
  const [y, m, d] = firstDate.split('-').map(Number);
  const groupId = `offset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recordIds = records.map(r => String(r.id || r.originalId));

  const itemsSummary = records.map(r => r.item || '항목').slice(0, 2).join(', ');
  const etcCount = records.length > 2 ? ` 외 ${records.length - 2}건` : '';
  const title = `${m}/${d} 상계 묶음 (${itemsSummary}${etcCount})`;

  const group = {
    id: groupId,
    date: firstDate,
    title,
    inAmount: inSum,
    outAmount: outSum,
    recordIds,
    createdAt: Date.now()
  };

  const groups = loadOffsetGroups();
  groups[groupId] = group;
  saveOffsetGroups(groups);

  return { ok: true, group };
}

export function deleteOffsetGroup(groupId) {
  const groups = loadOffsetGroups();
  if (groups[groupId]) {
    delete groups[groupId];
    saveOffsetGroups(groups);
    return true;
  }
  return false;
}

/**
 * 월별행 스타일의 얇은 1줄 슬림 상계 묶음 접힘 행 생성 (1 row divider style)
 */
export function createOffsetGroupRow({
  group,
  isExpanded = false,
  onToggle = null,
  onUnlink = null
}) {
  const tr = document.createElement('tr');
  tr.className = 'schedule-row ledger-offset-group-row';
  tr.dataset.offsetGroupId = group.id;
  tr.style.backgroundColor = '#F8FAFC';
  tr.style.borderLeft = '3.5px solid #6366F1';
  tr.style.borderBottom = '1px solid #E2E8F0';
  tr.style.cursor = 'pointer';
  tr.style.fontWeight = '600';
  tr.style.height = '32px';

  // Column 1~4 (colSpan=4): 토글 아이콘 + 날짜 + 타이틀 + 묶음 풀기 버튼
  const titleCell = document.createElement('td');
  titleCell.colSpan = 4;
  titleCell.style.padding = '5px 10px';
  titleCell.style.verticalAlign = 'middle';
  titleCell.style.fontSize = '0.9em';
  titleCell.style.color = '#334155';

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'space-between';

  const leftBox = document.createElement('div');
  leftBox.style.display = 'flex';
  leftBox.style.alignItems = 'center';
  leftBox.style.gap = '6px';

  const icon = document.createElement('span');
  icon.className = 'ledger-offset-toggle-icon';
  icon.style.color = '#6366F1';
  icon.style.fontSize = '0.85em';
  icon.textContent = isExpanded ? '▼' : '▶';

  const tagBadge = document.createElement('span');
  tagBadge.style.backgroundColor = '#EEF2FF';
  tagBadge.style.color = '#4F46E5';
  tagBadge.style.fontSize = '0.75em';
  tagBadge.style.padding = '1px 5px';
  tagBadge.style.borderRadius = '4px';
  tagBadge.style.fontWeight = 'bold';
  tagBadge.textContent = '상계';

  const titleText = document.createElement('span');
  titleText.textContent = group.title;

  leftBox.appendChild(icon);
  leftBox.appendChild(tagBadge);
  leftBox.appendChild(titleText);

  const unlinkBtn = document.createElement('button');
  unlinkBtn.type = 'button';
  unlinkBtn.title = '이 상계 묶음을 해제하여 원래 개별 거래들로 되돌립니다';
  unlinkBtn.style.background = 'transparent';
  unlinkBtn.style.border = '1px solid #CBD5E1';
  unlinkBtn.style.borderRadius = '4px';
  unlinkBtn.style.padding = '1px 6px';
  unlinkBtn.style.fontSize = '0.75em';
  unlinkBtn.style.color = '#64748B';
  unlinkBtn.style.cursor = 'pointer';
  unlinkBtn.textContent = '🔓 묶음 풀기';
  unlinkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('이 상계 묶음을 해제할까요? (원래 개별 거래들로 돌아갑니다)')) {
      if (onUnlink) onUnlink(group.id);
    }
  });

  wrap.appendChild(leftBox);
  wrap.appendChild(unlinkBtn);
  titleCell.appendChild(wrap);
  tr.appendChild(titleCell);

  // Column 5 (수입)
  const incomeCell = document.createElement('td');
  incomeCell.className = 'ledger-cell-money';
  incomeCell.style.color = '#15803D';
  incomeCell.style.fontSize = '0.9em';
  incomeCell.style.padding = '5px 8px';
  incomeCell.style.verticalAlign = 'middle';
  incomeCell.textContent = group.inAmount > 0 ? formatMoney(group.inAmount) : '';
  tr.appendChild(incomeCell);

  // Column 6 (지출)
  const expenseCell = document.createElement('td');
  expenseCell.className = 'ledger-cell-money';
  expenseCell.style.color = '#DC2626';
  expenseCell.style.fontSize = '0.9em';
  expenseCell.style.padding = '5px 8px';
  expenseCell.style.verticalAlign = 'middle';
  expenseCell.textContent = group.outAmount > 0 ? formatMoney(group.outAmount) : '';
  tr.appendChild(expenseCell);

  // Column 7 (잔액 / 차액)
  const balCell = document.createElement('td');
  balCell.className = 'ledger-cell-money';
  balCell.style.color = '#64748B';
  balCell.style.fontSize = '0.9em';
  balCell.style.padding = '5px 8px';
  balCell.style.verticalAlign = 'middle';
  balCell.textContent = '0';
  tr.appendChild(balCell);

  if (onToggle) {
    tr.addEventListener('click', () => onToggle(icon));
  }

  return tr;
}
