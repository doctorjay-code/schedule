import { toIso, formatMoney, recalculateRunningBalances, normalizeLedgerDate, compareLedgerRecords } from './ledger-utils.js';
import { createLedgerTableHead, renderTransactionRow } from './transaction-view.js';
import { buildOffsetGroupsFromRecords, deleteOffsetGroup, createOffsetGroupRow } from './ledger-offset-groups.js';
import { copyMonthFixedRecordsToNextMonth } from './ledger-forecast.js';

export function getRecordMonthGroup(record, isCompanyCard) {
  const dStr = normalizeLedgerDate(record.date);
  if (!isCompanyCard) {
    return dStr.slice(0, 7);
  }
  const [yearStr, monthStr, dayStr] = dStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (day >= 13) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  // 기업카드 1월은 2월행에 합침
  if (month === 1) {
    month = 2;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatMonthTitle(monthKey, isCompanyCard) {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!isCompanyCard) {
    return `${year}년 ${month}월`;
  }
  if (month === 2) {
    return `${year}년 2월 (01.01~02.12)`;
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${year}년 ${month}월 (${String(prevMonth).padStart(2, '0')}.13~${String(month).padStart(2, '0')}.12)`;
}

export function createLedgerMonthDividerRow({
  monthKey,
  isCompanyCard = false,
  isExpanded = true,
  monthRecords = [],
  offsetRecordIds = new Set(),
  onToggle = null
}) {
  const monthIncome = monthRecords.reduce((sum, x) => {
    const xId = String(x.id || '');
    if (offsetRecordIds.has(xId)) {
      return sum; // 상계 처리된 거래는 수입 합계에서 제외!
    }
    return sum + (x.incomeAmount !== undefined ? Number(x.incomeAmount || 0) : (x.type === 'income' ? Number(x.amount || 0) : 0));
  }, 0);

  const monthExpense = monthRecords.reduce((sum, x) => {
    const xId = String(x.id || '');
    if (offsetRecordIds.has(xId)) {
      return sum; // 상계 처리된 거래는 지출 합계에서 제외!
    }
    return sum + (x.expenseAmount !== undefined ? Number(x.expenseAmount || 0) : (x.type === 'expense' ? Number(x.amount || 0) : 0));
  }, 0);

  const dividerRow = document.createElement('tr');
  dividerRow.className = 'ledger-month-divider-row';
  dividerRow.dataset.month = monthKey;

  // Column 1~4 (날짜, 수단, 사용자, 사용처)
  const titleCell = document.createElement('td');
  titleCell.colSpan = 4;
  titleCell.className = 'ledger-month-divider-title-cell';

  const content = document.createElement('div');
  content.className = 'ledger-month-divider-content';

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'ledger-month-toggle-icon';
  toggleIcon.textContent = isExpanded ? '\u25BC' : '\u25B6';

  const titleEl = document.createElement('strong');
  titleEl.className = 'ledger-month-title';
  titleEl.textContent = formatMonthTitle(monthKey, isCompanyCard);

  content.appendChild(toggleIcon);
  content.appendChild(titleEl);
  titleCell.appendChild(content);
  dividerRow.appendChild(titleCell);

  // Column 5 (수입 / 입금)
  const incomeCell = document.createElement('td');
  incomeCell.className = 'ledger-month-divider-num-cell ledger-month-income-cell';
  incomeCell.textContent = monthIncome > 0 ? formatMoney(monthIncome) : '';
  dividerRow.appendChild(incomeCell);

  // Column 6 (지출 / 출금)
  const expenseCell = document.createElement('td');
  expenseCell.className = 'ledger-month-divider-num-cell ledger-month-expense-cell';
  expenseCell.textContent = monthExpense > 0 ? formatMoney(monthExpense) : '';
  dividerRow.appendChild(expenseCell);

  // Column 7 (사용액 / 차액 - 당월 순손익 차액: 입금 - 출금)
  const balanceCell = document.createElement('td');
  balanceCell.className = 'ledger-month-divider-num-cell ledger-month-balance-cell';
  if (isCompanyCard) {
    const netUsage = monthExpense - monthIncome;
    balanceCell.textContent = netUsage !== 0 ? `${netUsage < 0 ? '-' : ''}${formatMoney(netUsage)}` : '';
    if (netUsage < 0) balanceCell.style.color = '#15803D';
  } else {
    const netBalance = monthIncome - monthExpense;
    balanceCell.textContent = netBalance !== 0 ? `${netBalance < 0 ? '-' : ''}${formatMoney(netBalance)}` : '0';
    if (netBalance < 0) {
      balanceCell.style.color = '#DC2626';
    } else if (netBalance > 0) {
      balanceCell.style.color = '#15803D';
    }
  }
  dividerRow.appendChild(balanceCell);

  if (onToggle) {
    dividerRow.addEventListener('click', () => {
      onToggle(toggleIcon);
    });
  }

  return dividerRow;
}

// Bank, cash, and card all-time ledger rendering responsibility.
export function createFundplanView({ ledgerState, getColorSettings, colorSettings, getActiveSourceRecords, clampLedgerDate, minDate, setText, ledgerDataSources, getLedgerDataSources, refreshLedgerSheetData, renderActiveLedgerPeriod, showLedgerToast }) {
  const monthExpandedState = {};

  function render() {
    const activeColorSettings = (typeof getColorSettings === 'function' ? getColorSettings() : colorSettings) || {};
    const source = ledgerState.source;
    const isCompanyCard = source === 'card' && ledgerState.payment === '\uAE30\uC5C5\uCE74\uB4DC';
    const records = getActiveSourceRecords().filter(record => {
      const dStr = normalizeLedgerDate(record.date);
      return dStr >= '2026-01-01';
    });
    const titles = {
      cash: '\uD604\uAE08 \uB0B4\uC5ED',
      bank: '\uAE30\uC5C5\uC740\uD589 \uB0B4\uC5ED',
      forecast: '\uC794\uC561\uC804\uB9DD',
      card: isCompanyCard ? '\uAE30\uC5C5\uCE74\uB4DC \uB0B4\uC5ED' : '\uD1A0\uC2A4\uC740\uD589 \uB0B4\uC5ED'
    };
    const title = titles[source] || '\uAC00\uACC4\uBD80 \uB0B4\uC5ED';
    setText('fundplanAllTimeTitle', title);
    setText('fundplanAllTimeCount', records.length + '\uAC74');

    const thead = document.getElementById('ledgerAllTableHead');
    if (thead) {
      const moneyInLabel = isCompanyCard ? '\uC218\uC785' : '\uC785\uAE08';
      const moneyOutLabel = isCompanyCard ? '\uC9C0\uCD9C' : '\uCD9C\uAE08';
      const balanceLabel = isCompanyCard ? '\uC0AC\uC6A9\uC561' : '\uC794\uC561';
      const useMerged = ['card', 'cash', 'bank', 'forecast'].includes(source);
      thead.replaceWith(createLedgerTableHead(moneyInLabel, moneyOutLabel, useMerged, balanceLabel));
      const newThead = document.querySelector('#ledgerAllTable thead');
      if (newThead) newThead.id = 'ledgerAllTableHead';
    }

    const list = document.getElementById('fundplanAllTimeList');
    if (!list) return;
    list.replaceChildren();

    if (!records.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 7;
      emptyCell.className = 'ledger-empty-list ledger-empty-table-cell';
      emptyCell.textContent = title + '\uC5D0 \uD45C\uC2DC\uD560 \uAC70\uB798 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.';
      emptyRow.appendChild(emptyCell);
      list.appendChild(emptyRow);
      return;
    }

    // 1. 전체 레코드를 날짜순으로 정렬하고 실시간 연속 누적 잔액(Running Balance)을 먼저 일괄 계산!
    const sortedAndCalculated = recalculateRunningBalances([...records].sort(compareLedgerRecords), isCompanyCard);

    // 2. Group records by calculated month (YYYY-MM)
    const grouped = sortedAndCalculated.reduce((map, record) => {
      const monthKey = getRecordMonthGroup(record, isCompanyCard);
      (map[monthKey] ||= []).push(record);
      return map;
    }, {});

    const months = Object.keys(grouped).sort();
    const focusMonth = toIso(clampLedgerDate(ledgerState.monthCursor)).slice(0, 7);
    const pivotMonth = months.includes(focusMonth) ? focusMonth : (months.find(month => month >= focusMonth) || months[months.length - 1]);
    setText('ledgerPeriodTitle', focusMonth.replace('-', '.'));

    // Default expanded state: initial view has all months collapsed
    if (Object.keys(monthExpandedState).length === 0) {
      months.forEach(m => {
        monthExpandedState[m] = false;
      });
    }

    months.forEach(month => {
      const monthRecords = (grouped[month] || []).sort(compareLedgerRecords);
      const isExpanded = Boolean(monthExpandedState[month]);
      const monthRowElements = [];

      // 🌟 DB 레코드의 offset_group_id로부터 100% 순수 동적 복원 (전체 월 대상!)
      const offsetGroups = (source === 'forecast') ? buildOffsetGroupsFromRecords(records) : {};
      const offsetRecordIds = new Set();
      if (source === 'forecast') {
        Object.values(offsetGroups).forEach(g => {
          if (Array.isArray(g.recordIds)) {
            g.recordIds.forEach(id => offsetRecordIds.add(String(id)));
          }
        });
      }

      const dividerRow = createLedgerMonthDividerRow({
        monthKey: month,
        isCompanyCard,
        isExpanded,
        monthRecords,
        offsetRecordIds,
        onToggle: toggleIcon => {
          const currentlyExpanded = Boolean(monthExpandedState[month]);
          const willExpand = !currentlyExpanded;
          monthExpandedState[month] = willExpand;
          toggleIcon.textContent = willExpand ? '\u25BC' : '\u25B6';
          monthRowElements.forEach(r => {
            if (r.classList.contains('ledger-subdetail-row') || r.dataset.parentOffsetGroupId || r.dataset.parentAggregateId) {
              r.style.display = 'none'; // 서브 세부행과 상계 묶음 속 거래들은 항상 닫힌 상태 유지
            } else {
              r.style.display = willExpand ? '' : 'none';
            }
          });
          // 통합 행들의 화살표 아이콘도 모두 '▶'(접힘)으로 초기화
          dividerRow.parentElement?.querySelectorAll(`tr.schedule-row[data-month-group="${month}"] .ledger-accordion-icon`).forEach(icon => {
            icon.textContent = '▶';
          });
        }
      });
      list.appendChild(dividerRow);

      // 2. Month Transaction Rows (상계 묶음 그룹핑 지원)
      const handledGroupIds = new Set();

      const calculatedMonthRecords = (source === 'forecast' || !isCompanyCard)
        ? monthRecords
        : recalculateRunningBalances(monthRecords, true);
      calculatedMonthRecords.forEach(record => {
        // 기업은행 탭에서 기업카드 결제대금 행인 경우 카드 세부내역 subRecords 연결
        if (source === 'bank' && !record.hasCardAccordion) {
          const itemText = String(record.item || '');
          const memoText = String(record.memo || '');
          const catText = String(record.category || '');
          if (itemText.includes('기업카드') || itemText.includes('카드대금') || memoText.includes('기업카드') || catText.includes('카드대금')) {
            const [yStr, mStr] = month.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10) - 1;
            let prevY = y;
            let prevM = m - 1;
            if (prevM < 0) { prevM = 11; prevY -= 1; }
            const cardStart = `${prevY}-${String(prevM + 1).padStart(2, '0')}-13`;
            const cardEnd = `${y}-${String(m + 1).padStart(2, '0')}-12`;

            const cardSubs = (ledgerState.records || []).filter(r => {
              const sheet = r.payment_method || r.payment || r.sheetName || '';
              const dStr = normalizeLedgerDate(r.date);
              return sheet === '기업카드' && dStr >= cardStart && dStr <= cardEnd;
            });
            if (cardSubs.length > 0) {
              record.hasCardAccordion = true;
              record.subRecords = cardSubs;
            }
          }
        }
        const recId = String(record.id || '');

        // 상계 묶음에 속한 거래인지 확인
        let matchedGroup = null;
        if (source === 'forecast') {
          for (const gId of Object.keys(offsetGroups)) {
            const g = offsetGroups[gId];
            if (Array.isArray(g.recordIds) && (g.recordIds.includes(recId) || g.recordIds.includes(record.id))) {
              matchedGroup = g;
              break;
            }
          }
        }

        if (matchedGroup) {
          // 이미 이 그룹이 처리되었으면 건너뜀
          if (handledGroupIds.has(matchedGroup.id)) {
            return;
          }
          handledGroupIds.add(matchedGroup.id);

          // 평소(0원 버튼이 꺼져있을 때)에는 0원 상계 묶음 행 자체를 아예 렌더링하지 않음 (완전 투명 숨김!)
          if (!ledgerState?.showOffsetGroups) {
            return;
          }

          // 이 그룹에 속한 이번 달 거래들 모으기
          const groupRecords = calculatedMonthRecords.filter(r => {
            const rId = String(r.id || '');
            return matchedGroup.recordIds.includes(rId);
          });

          // 0원 버튼이 켜져 있을 때: 월별행 스타일의 얇은 1줄 슬림 상계 바 렌더링
          let isGroupExpanded = false;
          const groupRow = createOffsetGroupRow({
            group: matchedGroup,
            isExpanded: isGroupExpanded,
            onToggle: (iconEl) => {
              isGroupExpanded = !isGroupExpanded;
              if (iconEl) iconEl.textContent = isGroupExpanded ? '▼' : '▶';
              subGroupRows.forEach(subEl => {
                subEl.style.display = isGroupExpanded ? '' : 'none';
              });
            },
            onUnlink: (gId) => {
              deleteOffsetGroup(gId);
              render();
            }
          });

          groupRow.dataset.monthGroup = month;
          if (!isExpanded) groupRow.style.display = 'none';
          list.appendChild(groupRow);
          monthRowElements.push(groupRow);

          // 묶인 세부 거래들 렌더링 (기본 접힘: display: none)
          const subGroupRows = [];
          groupRecords.forEach(sub => {
            const subPrev = list.children.length;
            renderTransactionRow({ ...sub, isSubDetail: true }, 'fundplanAllTimeList', { source, colorSettings: activeColorSettings });
            const subNew = list.children.length;
            for (let j = subPrev; j < subNew; j++) {
              const subEl = list.children[j];
              subEl.dataset.monthGroup = month;
              subEl.dataset.parentOffsetGroupId = matchedGroup.id;
              subEl.style.display = 'none'; // 기본 닫힘
              monthRowElements.push(subEl);
              subGroupRows.push(subEl);
            }
          });

          return;
        }

        const prevCount = list.children.length;
        renderTransactionRow(record, 'fundplanAllTimeList', {
          source,
          colorSettings: activeColorSettings,
          isSelected: ledgerState.selectedLedgerIds ? ledgerState.selectedLedgerIds.has(String(record.id)) : false,
          multiEditMode: Boolean(ledgerState.multiEditMode)
        });
        const newCount = list.children.length;
        const mainRows = [];
        for (let i = prevCount; i < newCount; i++) {
          const rowEl = list.children[i];
          rowEl.dataset.monthGroup = month;
          if (!isExpanded) rowEl.style.display = 'none';
          monthRowElements.push(rowEl);
          mainRows.push(rowEl);
        }

        // 만약 통합 가변/고정 아코디언 행(isAggregate) 또는 실제 카드 출금 행(hasCardAccordion)인 경우:
        // 바로 밑에 세부 거래들(subRecords)을 인라인으로 렌더링 (기본 닫힘)
        if ((record.isAggregate || record.hasCardAccordion) && Array.isArray(record.subRecords) && record.subRecords.length > 0) {
          const subRows = [];
          record.subRecords.forEach((sub, sIdx) => {
            const isFirstSub = sIdx === 0;
            const isLastSub = sIdx === record.subRecords.length - 1;
            const subPrev = list.children.length;
            renderTransactionRow({ ...sub, isSubDetail: true }, 'fundplanAllTimeList', { source, colorSettings: activeColorSettings });
            const subNew = list.children.length;
            for (let j = subPrev; j < subNew; j++) {
              const subEl = list.children[j];
              subEl.dataset.monthGroup = month;
              subEl.dataset.parentAggregateId = record.id;
              if (isFirstSub) subEl.dataset.subdetailFirst = 'true';
              if (isLastSub) subEl.dataset.subdetailLast = 'true';
              subEl.style.display = 'none'; // 기본 닫힘
              monthRowElements.push(subEl);
              subRows.push(subEl);
            }
          });

          let isSubExpanded = false;
          const toggleSubAccordion = (e) => {
            if (e) e.stopPropagation();
            isSubExpanded = !isSubExpanded;
            mainRows.forEach(mr => {
              const iconEl = mr.querySelector('.ledger-accordion-icon');
              if (iconEl) iconEl.textContent = isSubExpanded ? '▼' : '▶';
            });
            subRows.forEach(subEl => {
              subEl.style.display = isSubExpanded ? '' : 'none';
            });
          };

          // 항목 및 비고 칸(.ledger-accordion-toggle-cell) 클릭 시 세부내역 아코디언 토글! (나머지 칸은 상세 모달 오픈)
          mainRows.forEach(rowEl => {
            const toggleCells = rowEl.querySelectorAll('.ledger-accordion-toggle-cell, .ledger-accordion-icon');
            toggleCells.forEach(cell => {
              cell.style.cursor = 'pointer';
              cell.title = '클릭하여 세부 거래 내역 펼치기/접기';
              cell.addEventListener('click', toggleSubAccordion);
            });
          });
        }
      });

      // 3. 월별 하단 액션 바: 당월 고정비/상계 거래 다음 달로 넘기기 버튼 (Push 방식!)
      const [y, m] = month.split('-').map(Number);
      const nextMonthNum = m === 12 ? 1 : m + 1;

      const actionRow = document.createElement('tr');
      actionRow.className = 'schedule-row ledger-month-action-row';
      actionRow.dataset.monthGroup = month;
      actionRow.style.display = isExpanded ? '' : 'none';
      actionRow.style.backgroundColor = '#F8FAFC';
      actionRow.style.borderBottom = '2px dashed #CBD5E1';

      const actionTd = document.createElement('td');
      actionTd.colSpan = 7;
      actionTd.style.padding = '8px 12px';
      actionTd.style.textAlign = 'center';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'ledger-copy-month-btn';
      copyBtn.style.backgroundColor = '#FFFFFF';
      copyBtn.style.color = '#2563EB';
      copyBtn.style.border = '1.5px solid #93C5FD';
      copyBtn.style.borderRadius = '6px';
      copyBtn.style.padding = '6px 18px';
      copyBtn.style.fontSize = '0.86em';
      copyBtn.style.fontWeight = 'bold';
      copyBtn.style.cursor = 'pointer';
      copyBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
      const isForecastTab = (source === 'forecast');
      const actionTitle = isForecastTab ? '고정비 & 상계 묶음' : '고정비';
      copyBtn.innerHTML = `🚀 <strong>${m}월</strong> ${actionTitle} <strong>${nextMonthNum}월</strong>로 넘기기`;

      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`${m}월의 ${actionTitle} 거래들을 다음 달(${nextMonthNum}월)로 복사해 넘길까요?`)) {
          copyBtn.disabled = true;
          copyBtn.textContent = '⏳ 복사 중...';
          try {
            const currentSources = (typeof getLedgerDataSources === 'function' ? getLedgerDataSources() : ledgerDataSources) || {};
            const res = await copyMonthFixedRecordsToNextMonth(month, currentSources, { source, payment: ledgerState.payment });
            if (res.ok) {
              if (typeof showLedgerToast === 'function') {
                showLedgerToast(`🎉 ${m}월 ${actionTitle} 거래 (${res.count}건)가 ${res.targetMonthNum}월로 완벽 복사되었습니다!`);
              }
              if (typeof refreshLedgerSheetData === 'function') {
                await refreshLedgerSheetData();
              }
              if (res.targetMonthKey) {
                monthExpandedState[res.targetMonthKey] = true;
              }
              if (typeof renderActiveLedgerPeriod === 'function') {
                renderActiveLedgerPeriod();
              } else {
                render();
              }
            } else {
              alert(res.message || '복사할 거래가 없습니다.');
              copyBtn.disabled = false;
              copyBtn.innerHTML = `🚀 <strong>${m}월</strong> ${actionTitle} <strong>${nextMonthNum}월</strong>로 넘기기`;
            }
          } catch (err) {
            console.error('Failed to copy records to next month:', err);
            alert('복사 중 오류가 발생했습니다: ' + err.message);
            copyBtn.disabled = false;
            copyBtn.innerHTML = `🚀 <strong>${m}월</strong> ${actionTitle} <strong>${nextMonthNum}월</strong>로 넘기기`;
          }
        }
      });

      actionTd.appendChild(copyBtn);
      actionRow.appendChild(actionTd);
      list.appendChild(actionRow);
      monthRowElements.push(actionRow);
    });

    // 4. 전체 목록 맨 밑바닥 최종 요약 바 (Grand Total Footer)
    if (!isCompanyCard) {
      const allValidWithBal = sortedAndCalculated.filter(r => Number.isFinite(Number(r.balance)));
      const currentFinalRecord = allValidWithBal.length > 0 ? allValidWithBal[allValidWithBal.length - 1] : null;
      const currentFinalBalance = currentFinalRecord ? Number(currentFinalRecord.balance) : 0;

      const grandFooterRow = document.createElement('tr');
      grandFooterRow.className = 'ledger-grand-footer-row';
      grandFooterRow.style.backgroundColor = '#EEF2FF';
      grandFooterRow.style.borderTop = '2px solid #6366F1';
      grandFooterRow.style.fontWeight = 'bold';

      const grandTitleCell = document.createElement('td');
      grandTitleCell.colSpan = 4;
      grandTitleCell.style.textAlign = 'left';
      grandTitleCell.style.padding = '10px 16px';
      grandTitleCell.style.color = '#312E81';
      grandTitleCell.innerHTML = `<strong>💰 최종 예상 잔액</strong>`;

      const grandIncomeCell = document.createElement('td');
      const grandExpenseCell = document.createElement('td');

      const grandBalanceCell = document.createElement('td');
      grandBalanceCell.className = 'ledger-cell-money';
      grandBalanceCell.style.color = '#1E1B4B';
      grandBalanceCell.style.fontSize = '1.05em';
      grandBalanceCell.style.padding = '10px 8px';
      grandBalanceCell.textContent = `${currentFinalBalance < 0 ? '-' : ''}${formatMoney(currentFinalBalance)}`;

      grandFooterRow.appendChild(grandTitleCell);
      grandFooterRow.appendChild(grandIncomeCell);
      grandFooterRow.appendChild(grandExpenseCell);
      grandFooterRow.appendChild(grandBalanceCell);

      list.appendChild(grandFooterRow);
    }
  }

  function setAllExpanded(expanded) {
    document.querySelectorAll('.ledger-month-divider-row').forEach(divRow => {
      const month = divRow.dataset.month;
      monthExpandedState[month] = expanded;
      const icon = divRow.querySelector('.ledger-month-toggle-icon');
      if (icon) icon.textContent = expanded ? '\u25BC' : '\u25B6';
    });
    document.querySelectorAll('#fundplanAllTimeList tr[data-month-group]').forEach(row => {
      row.style.display = expanded ? '' : 'none';
    });
  }

  return { render, setAllExpanded };
}