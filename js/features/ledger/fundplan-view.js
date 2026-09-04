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

export function createLedgerMonthSummaryRow({
  monthKey,
  isCompanyCard,
  finalBalance,
  isExpanded,
  source
}) {
  const [yearStr, monthStr] = monthKey.split('-');
  const month = parseInt(monthStr, 10);

  const summaryRow = document.createElement('tr');
  summaryRow.className = 'ledger-month-summary-row';
  summaryRow.dataset.monthGroup = monthKey;
  summaryRow.style.backgroundColor = '#EEF2FF';
  summaryRow.style.borderTop = '2px solid #6366F1';
  summaryRow.style.fontWeight = 'bold';
  if (!isExpanded) summaryRow.style.display = 'none';

  // 1~4열 통합 라벨 셀
  const titleCell = document.createElement('td');
  titleCell.colSpan = 4;
  titleCell.style.textAlign = 'left';
  titleCell.style.padding = '10px 16px';
  titleCell.style.color = '#312E81';

  const labelText = isCompanyCard
    ? `${month}월 최종 결제액`
    : `${month}월 최종 잔액`;

  titleCell.innerHTML = `<strong>${labelText}</strong>`;
  summaryRow.appendChild(titleCell);

  // 5열: 수입/입금 (공란)
  const inCell = document.createElement('td');
  summaryRow.appendChild(inCell);

  // 6열: 지출/출금 (공란)
  const outCell = document.createElement('td');
  summaryRow.appendChild(outCell);

  // 7열: 최종 잔액 셀
  const balCell = document.createElement('td');
  balCell.className = 'ledger-cell-money';
  balCell.style.color = '#1E1B4B';
  balCell.style.fontSize = '1.05em';
  balCell.style.padding = '10px 8px';
  balCell.style.fontWeight = 'bold';
  const numVal = Number(finalBalance || 0);
  balCell.textContent = `${numVal < 0 ? '-' : ''}${formatMoney(numVal)}`;
  summaryRow.appendChild(balCell);

  return summaryRow;
}

// Bank, cash, and card all-time ledger rendering responsibility.
export function createFundplanView({ ledgerState, getColorSettings, colorSettings, getActiveSourceRecords, clampLedgerDate, minDate, setText, ledgerDataSources, getLedgerDataSources, refreshLedgerSheetData, renderActiveLedgerPeriod, showLedgerToast, onRowClick }) {
  const monthExpandedState = {};
  const subAccordionExpandedState = {};

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

    if (!records.length) {
      list.replaceChildren();
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 7;
      emptyCell.className = 'ledger-empty-list ledger-empty-table-cell';
      emptyCell.textContent = title + '\uC5D0 \uD45C\uC2DC\uD560 \uAC70\uB798 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.';
      emptyRow.appendChild(emptyCell);
      list.appendChild(emptyRow);
      return;
    }

    const fragment = document.createDocumentFragment();

    const isForecast = (source === 'forecast');

    // 1. 전체 레코드를 날짜순으로 정렬하고 실시간 연속 누적 잔액(Running Balance)을 먼저 일괄 계산!
    const sortedAndCalculated = recalculateRunningBalances(
      [...records].sort((a, b) => compareLedgerRecords(a, b, isForecast)),
      isCompanyCard
    );

    // 2. Group records by calculated month (YYYY-MM)
    const grouped = sortedAndCalculated.reduce((map, record) => {
      const monthKey = getRecordMonthGroup(record, isCompanyCard);
      (map[monthKey] ||= []).push(record);
      return map;
    }, {});

    const months = Object.keys(grouped).sort();
    const focusMonth = toIso(clampLedgerDate(ledgerState.monthCursor)).slice(0, 7);
    setText('ledgerPeriodTitle', focusMonth.replace('-', '.'));

    const isMonthlyMode = Boolean(document.getElementById('ledgerMonthlyViewBtn')?.classList.contains('active'));
    const monthsToRender = isMonthlyMode
      ? (grouped[focusMonth] ? [focusMonth] : [focusMonth])
      : months;

    // Default expanded state: initial view has all months collapsed, but monthly mode is 100% expanded
    if (isMonthlyMode) {
      monthExpandedState[focusMonth] = true;
    } else if (Object.keys(monthExpandedState).length === 0) {
      months.forEach(m => {
        monthExpandedState[m] = false;
      });
    }

    // 🌟 DB 레코드의 offset_group_id로부터 100% 순수 동적 복원 (루프 밖에서 1번만 계산!)
    const offsetGroups = (source === 'forecast') ? buildOffsetGroupsFromRecords(records) : {};
    const offsetRecordIds = new Set();
    if (source === 'forecast') {
      Object.values(offsetGroups).forEach(g => {
        if (Array.isArray(g.recordIds)) {
          g.recordIds.forEach(id => offsetRecordIds.add(String(id)));
        }
      });
    }

    monthsToRender.forEach(month => {
      const monthRecords = (grouped[month] || []).sort((a, b) => compareLedgerRecords(a, b, isForecast));
      if (isMonthlyMode && monthRecords.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 7;
        emptyCell.className = 'ledger-empty-list ledger-empty-table-cell';
        emptyCell.textContent = `${month.replace('-', '.')}월에 표시할 거래 내역이 없습니다.`;
        emptyRow.appendChild(emptyCell);
        fragment.appendChild(emptyRow);
        return;
      }
      const isExpanded = Boolean(monthExpandedState[month]);
      const monthRowElements = [];

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
      fragment.appendChild(dividerRow);

      // 2. Month Transaction Rows (상계 묶음 그룹핑 지원)
      const handledGroupIds = new Set();

      const calculatedMonthRecords = (source === 'forecast' || !isCompanyCard)
        ? monthRecords
        : recalculateRunningBalances(monthRecords, true);

      const isGlobalBalance = (ledgerState.balanceMode === 'global');
      let monthFinalComputedBalance = 0;

      // 🌟 [잔액 모드 1 & 2 정밀 연산 엔진]
      if (isForecast && isGlobalBalance) {
        // 🌟 [잔액] 클릭 상태: 전체 시계열(바깥 거래 + 세부 거래) 중 가장 늦은 마지막 거래의 잔액을 당월 최종 잔액으로 산출!
        const tossAgg = calculatedMonthRecords.find(r => r.isAggregate && String(r.item || '').includes('토스 생활비'));
        const tossSubs = (tossAgg && Array.isArray(tossAgg.subRecords)) ? tossAgg.subRecords : [];
        if (tossSubs.length > 0) {
          const allEvents = [];
          calculatedMonthRecords.forEach(r => {
            if (r.id !== tossAgg.id) {
              allEvents.push({ ...r, isSub: false, originalRef: r });
            }
          });
          tossSubs.forEach(sub => {
            allEvents.push({ ...sub, isSub: true, originalRef: sub });
          });

          // 🌟 핵심 정렬 규칙:
          // 1) date 오름차순 (날짜순)
          // 2) 같은 날짜일 때: 토스 생활비 세부 거래(isSub: true)가 먼저 (1순위), 바깥 고정비/기업은행(isSub: false)이 나중 (2순위)!
          allEvents.sort((a, b) => {
            const dateA = normalizeLedgerDate(a.date);
            const dateB = normalizeLedgerDate(b.date);
            if (dateA !== dateB) return dateA.localeCompare(dateB);

            if (a.isSub && !b.isSub) return -1;
            if (!a.isSub && b.isSub) return 1;

            return compareLedgerRecords(a, b, true);
          });

          // 시작 잔액: 1일 토스 생활비 통합행 직전 잔액
          let running = Number(tossAgg.balance || 0) + (tossAgg.type === 'expense' ? Number(tossAgg.amount || 0) : -Number(tossAgg.amount || 0));
          allEvents.forEach(ev => {
            const amt = Number(ev.amount || 0);
            const isExp = (ev.type || 'expense').toLowerCase() === 'expense';
            running += (isExp ? -amt : amt);
            if (ev.originalRef) {
              ev.originalRef.balance = running;
            }
          });
          monthFinalComputedBalance = running; // 🌟 시간상 가장 늦은 거래 직후의 최종 잔액!
        } else {
          const lastRec = calculatedMonthRecords.length > 0 ? calculatedMonthRecords[calculatedMonthRecords.length - 1] : null;
          monthFinalComputedBalance = lastRec ? Number(lastRec.balance || 0) : 0;
        }
      } else if (isForecast && !isGlobalBalance) {
        // 🌟 [잔액] 미클릭 상태: 바깥 거래들의 맨 마지막 행 잔액을 당월 최종 잔액으로 산출!
        const tossAgg = calculatedMonthRecords.find(r => r.isAggregate && String(r.item || '').includes('토스 생활비'));
        const tossSubs = (tossAgg && Array.isArray(tossAgg.subRecords)) ? tossAgg.subRecords : [];
        if (tossSubs.length > 0) {
          tossSubs.forEach(sub => {
            sub.balance = undefined;
          });
        }
        const lastRec = calculatedMonthRecords.length > 0 ? calculatedMonthRecords[calculatedMonthRecords.length - 1] : null;
        monthFinalComputedBalance = lastRec ? Number(lastRec.balance || 0) : 0;
      } else {
        const lastRec = calculatedMonthRecords.length > 0 ? calculatedMonthRecords[calculatedMonthRecords.length - 1] : null;
        monthFinalComputedBalance = lastRec ? Number(lastRec.balance || 0) : 0;
      }

      calculatedMonthRecords.forEach(record => {
        // 기업은행 탭에서 기업카드 결제대금 행인 경우 카드 세부내역 subRecords 연결 (오직 출금 거래만!)
        if (source === 'bank' && !record.hasCardAccordion) {
          const isExpense = (record.type || 'expense').toLowerCase() === 'expense';
          const itemText = String(record.item || '');
          const memoText = String(record.memo || '');
          const catText = String(record.category || '');
          if (isExpense && (itemText.includes('기업카드') || itemText.includes('카드대금') || memoText.includes('기업카드') || catText.includes('카드대금'))) {
            const [yStr, mStr] = month.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10) - 1;
            let prevY = y;
            let prevM = m - 1;
            if (prevM < 0) { prevM = 11; prevY -= 1; }
            const cardStart = (m === 1)
              ? `${y}-01-01`
              : `${prevY}-${String(prevM + 1).padStart(2, '0')}-13`;
            const cardEnd = `${y}-${String(m + 1).padStart(2, '0')}-12`;

            const cardSubs = (ledgerState.records || []).filter(r => {
              const sheet = r.payment_method || r.payment || r.sheetName || '';
              const dStr = normalizeLedgerDate(r.date);
              return sheet === '기업카드' && dStr >= cardStart && dStr <= cardEnd;
            });
            if (cardSubs.length > 0) {
              record.hasCardAccordion = true;
              record.subRecords = cardSubs;
              const dynamicCardTotal = cardSubs.reduce((sum, r) => sum + ((r.type || 'expense').toLowerCase() === 'income' ? -Number(r.amount || 0) : Number(r.amount || 0)), 0);
              record.amount = dynamicCardTotal;
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
          fragment.appendChild(groupRow);
          monthRowElements.push(groupRow);

          // 묶인 세부 거래들 렌더링 (기본 접힘: display: none)
          const subGroupRows = [];
          groupRecords.forEach(sub => {
            const subRows = renderTransactionRow({ ...sub, isSubDetail: true }, fragment, {
              source,
              colorSettings: activeColorSettings,
              searchQuery: ledgerState.searchQuery || '',
              onRowClick: onRowClick ? () => onRowClick(sub) : null
            });
            (subRows || []).forEach(subEl => {
              subEl.dataset.monthGroup = month;
              subEl.dataset.parentOffsetGroupId = matchedGroup.id;
              subEl.style.display = 'none'; // 기본 닫힘
              monthRowElements.push(subEl);
              subGroupRows.push(subEl);
            });
          });

          return;
        }

        const mainRows = renderTransactionRow(record, fragment, {
          source,
          colorSettings: activeColorSettings,
          searchQuery: ledgerState.searchQuery || '',
          isSelected: ledgerState.selectedLedgerIds ? ledgerState.selectedLedgerIds.has(String(record.id)) : false,
          multiEditMode: Boolean(ledgerState.multiEditMode),
          onRowClick: onRowClick ? () => onRowClick(record) : null
        });
        (mainRows || []).forEach(rowEl => {
          rowEl.dataset.monthGroup = month;
          if (!isExpanded) rowEl.style.display = 'none';
          monthRowElements.push(rowEl);
        });

        // 만약 통합 가변/고정 아코디언 행(isAggregate) 또는 실제 카드 출금 행(hasCardAccordion)인 경우:
        // 바로 밑에 세부 거래들(subRecords)을 인라인으로 렌더링 (기본 닫힘)
        if ((record.isAggregate || record.hasCardAccordion) && Array.isArray(record.subRecords) && record.subRecords.length > 0) {
          const subRows = [];
          const isSubExpanded = Boolean(subAccordionExpandedState[record.id]);

          record.subRecords.forEach((sub, sIdx) => {
            const isFirstSub = sIdx === 0;
            const isLastSub = sIdx === record.subRecords.length - 1;
            const subCreated = renderTransactionRow({ ...sub, isSubDetail: true }, fragment, {
              source,
              colorSettings: activeColorSettings,
              searchQuery: ledgerState.searchQuery || '',
              onRowClick: onRowClick ? () => onRowClick(sub) : null
            });
            (subCreated || []).forEach(subEl => {
              subEl.dataset.monthGroup = month;
              subEl.dataset.parentAggregateId = record.id;
              if (isFirstSub) subEl.dataset.subdetailFirst = 'true';
              if (isLastSub) subEl.dataset.subdetailLast = 'true';
              subEl.style.display = isSubExpanded ? '' : 'none'; // 🌟 상태 보존!
              monthRowElements.push(subEl);
              subRows.push(subEl);
            });
          });

          // 메인 행의 화살표 아이콘 상태 복원
          mainRows.forEach(mr => {
            const iconEl = mr.querySelector('.ledger-accordion-icon');
            if (iconEl) iconEl.textContent = isSubExpanded ? '▼' : '▶';
          });

          const toggleSubAccordion = (e) => {
            if (e) e.stopPropagation();
            const nextState = !Boolean(subAccordionExpandedState[record.id]);
            subAccordionExpandedState[record.id] = nextState;
            mainRows.forEach(mr => {
              const iconEl = mr.querySelector('.ledger-accordion-icon');
              if (iconEl) iconEl.textContent = nextState ? '▼' : '▶';
            });
            subRows.forEach(subEl => {
              subEl.style.display = nextState ? '' : 'none';
            });
          };

          // 항목 및 비고 칸(.ledger-accordion-toggle-cell) 클릭 시 세부내역 아코디언 토글!
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

      // 🌟 [월말 최종 마감/예상 잔액 요약행] 렌더링
      const finalMonthBal = monthFinalComputedBalance;

      const summaryRow = createLedgerMonthSummaryRow({
        monthKey: month,
        isCompanyCard,
        finalBalance: finalMonthBal,
        isExpanded,
        source
      });
      fragment.appendChild(summaryRow);
      monthRowElements.push(summaryRow);

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
            const allRecords = (ledgerState && Array.isArray(ledgerState.records)) ? ledgerState.records : [];
            const res = await copyMonthFixedRecordsToNextMonth(month, allRecords, { source, payment: ledgerState.payment });
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
      fragment.appendChild(actionRow);
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

      fragment.appendChild(grandFooterRow);
    }

    // 🌟 500개 행을 브라우저에 단 1번(1 reflow)에 초고속 주입!
    list.replaceChildren(fragment);
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