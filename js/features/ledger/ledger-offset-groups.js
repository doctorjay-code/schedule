import { formatMoney, normalizeLedgerDate } from './ledger-utils.js';
import { upsertLedgerOffsetGroup, deleteLedgerOffsetGroup as deleteOffsetGroupFromDB } from '../../services/ledger/ledger-api.js';

/**
 * 🌟 DB 거래 목록(records)에서 offset_group_id를 가진 거래들을 모아 100% 순수 객체 맵으로 생성
 */
export function buildOffsetGroupsFromRecords(records = []) {
  const groups = {};
  if (!Array.isArray(records)) return groups;

  records.forEach(r => {
    if (r && r.offset_group_id) {
      const gId = r.offset_group_id;
      if (!groups[gId]) {
        groups[gId] = {
          id: gId,
          date: r.date,
          title: r.offset_title || '상계 묶음',
          inAmount: 0,
          outAmount: 0,
          recordIds: []
        };
      }
      const sId = String(r.id);
      if (!groups[gId].recordIds.includes(sId)) {
        groups[gId].recordIds.push(sId);
      }
      if (r.type === 'income') {
        groups[gId].inAmount += Number(r.amount || 0);
      } else {
        groups[gId].outAmount += Number(r.amount || 0);
      }
    }
  });

  return groups;
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

  // ID 정규화 (원본 DB ID로 일치)
  const recordIds = records.map(r => String(r.id || ''));
  const title = `${m}/${d} 상계 묶음`;

  const group = {
    id: groupId,
    date: firstDate,
    title,
    inAmount: inSum,
    outAmount: outSum,
    recordIds,
    createdAt: Date.now()
  };

  // Supabase DB에 비동기 영구 저장 (ledger_transactions 테이블 내 직접 UPDATE)
  upsertLedgerOffsetGroup(group).catch(err => {
    console.error('Supabase offset group save error:', err);
  });

  return { ok: true, group };
}

export function deleteOffsetGroup(groupId) {
  if (!groupId) return false;

  // Supabase DB에서 영구 삭제 (ledger_transactions 테이블 내 null 처리)
  deleteOffsetGroupFromDB(groupId).catch(err => {
    console.error('Supabase offset group delete error:', err);
  });

  return true;
}

/**
 * 0원 상계 묶음 가상 행(TR) 렌더링 생성기 (일반 행들과 100% 동일한 그리드 & 높이)
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
  tr.style.borderBottom = '1px solid #CBD5E1';
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
  wrap.style.width = '100%';

  const leftBox = document.createElement('div');
  leftBox.style.display = 'flex';
  leftBox.style.alignItems = 'center';
  leftBox.gap = '6px';

  const icon = document.createElement('span');
  icon.className = 'ledger-offset-toggle-icon';
  icon.style.color = '#6366F1';
  icon.style.fontSize = '0.85em';
  icon.textContent = isExpanded ? '▼' : '▶';

  const cleanTitle = (group.title || '').replace(/\s*\([^)]*\)/g, '');
  const titleText = document.createElement('span');
  titleText.textContent = cleanTitle;

  leftBox.appendChild(icon);
  leftBox.appendChild(titleText);

  // 우측 상계 풀기 버튼 (명확하고 예쁜 버튼)
  const unlinkBtn = document.createElement('button');
  unlinkBtn.type = 'button';
  unlinkBtn.title = '이 상계 묶음을 해제하여 원래 개별 거래들로 되돌립니다';
  unlinkBtn.style.backgroundColor = '#FFFFFF';
  unlinkBtn.style.border = '1px solid #CBD5E1';
  unlinkBtn.style.borderRadius = '4px';
  unlinkBtn.style.padding = '2px 8px';
  unlinkBtn.style.fontSize = '0.75em';
  unlinkBtn.style.color = '#475569';
  unlinkBtn.style.cursor = 'pointer';
  unlinkBtn.style.fontWeight = 'bold';
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
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      onToggle(icon);
    });
  }

  return tr;
}
