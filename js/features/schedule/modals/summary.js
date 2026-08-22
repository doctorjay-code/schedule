import { state, getItemReason } from '../../../services/schedule/state.js';
import { openModal, loadWeekDataFn } from './edit.js';
import { escapeHtml } from '../../../shared/safe.js';

// Open Summary Collector Modal Across All Schedules
export function openSummaryModal(type) {
  const summaryListContainer = document.getElementById('summaryListContainer');
  const summaryModalTitle = document.getElementById('summaryModalTitle');
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');

  if (!summaryListContainer) return;
  summaryListContainer.innerHTML = '';

  const allScheduleItems = [];
  state.allWeeksData.forEach(wObj => {
    if (wObj.items && Array.isArray(wObj.items)) {
      const wName = wObj.title.split(' (')[0];
      wObj.items.forEach(item => {
        allScheduleItems.push({
          ...item,
          weekTitleName: wName,
          _original: item
        });
      });
    }
  });

  let filtered = [];

  if (type === 'unpaid') {
    if (summaryModalTitle) summaryModalTitle.textContent = '🚨 전체 미결제 모아보기';
    filtered = allScheduleItems.filter(d => d.transStatus === '결제X');
  } else if (type === 'unapplied') {
    if (summaryModalTitle) summaryModalTitle.textContent = '📋 전체 미신청 모아보기';
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청X' || d.otStatus === '신청X' || d.hrStatus === '미신청' || d.otStatus === '미신청');
  } else if (type === 'unapproved') {
    if (summaryModalTitle) summaryModalTitle.textContent = '⏳ 전체 미승인 (승인대기) 모아보기';
    filtered = allScheduleItems.filter(d => d.hrStatus === '신청O' || d.otStatus === '신청O' || d.hrStatus === '미승인' || d.otStatus === '미승인');
  }

  if (filtered.length === 0) {
    summaryListContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#64748B; font-size:13px;">해당하는 일정 항목이 없습니다. 🎉</div>`;
  } else {
    if (type === 'unapplied' || type === 'unapproved') {
      const groupedByDateMap = new Map();

      filtered.forEach(item => {
        const reason = getItemReason(item, type);
        const groupKey = `${item.weekTitleName || ''}_${item.date}_${reason}`;
        if (!groupedByDateMap.has(groupKey)) {
          groupedByDateMap.set(groupKey, []);
        }
        groupedByDateMap.get(groupKey).push(item);
      });

      groupedByDateMap.forEach((itemList, groupKey) => {
        const firstItem = itemList[0];
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        let statusBadgeHtml = (type === 'unapplied')
          ? `<span class="badge-paid-no">미신청</span>`
          : `<span class="badge-apply-ok">승인대기</span>`;

        const reasonText = firstItem.hrDetail || firstItem.otDetail || (type === 'unapplied' ? '미신청 건' : '승인 대기 중');
        const timesText = itemList.map(it => it.time).join(', ');
        const descText = `[${timesText}] ${reasonText}`;

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${escapeHtml(firstItem.date)} (${escapeHtml(firstItem.region || '-')})</div>
            <div class="summary-item-desc">${escapeHtml(descText)}</div>
          </div>
          <div>${statusBadgeHtml}</div>
        `;

        card.addEventListener('click', () => {
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === firstItem.id && it.date === firstItem.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(firstItem._original || firstItem);
        });

        summaryListContainer.appendChild(card);
      });
    } else {
      filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        let statusBadgeHtml = `<span class="badge-paid-no">결제X</span>`;
        let descText = item.transDetail || '교통 미결제 건';

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${escapeHtml(item.date)} ${escapeHtml(item.time)} (${escapeHtml(item.region || '-')})</div>
            <div class="summary-item-desc">${escapeHtml(descText)}</div>
          </div>
          <div>${statusBadgeHtml}</div>
        `;

        card.addEventListener('click', () => {
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === item.id && it.date === item.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(item._original || item);
        });

        summaryListContainer.appendChild(card);
      });
    }
  }

  if (summaryModalOverlay) summaryModalOverlay.classList.add('active');
}

export function closeSummaryModal() {
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');
  if (summaryModalOverlay) summaryModalOverlay.classList.remove('active');
}

export function openCustomFilteredSummaryModal(titleText, itemsList, modalCategoryType = '', statsContextRegion = '') {
  const summaryModalTitle = document.getElementById('summaryModalTitle');
  const summaryListContainer = document.getElementById('summaryListContainer');
  const summaryModalOverlay = document.getElementById('summaryModalOverlay');

  if (!summaryListContainer) return;
  summaryListContainer.innerHTML = '';
  if (summaryModalTitle) summaryModalTitle.textContent = titleText;

  if (!itemsList || itemsList.length === 0) {
    summaryListContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#64748B; font-size:13px;">해당하는 일정 항목이 없습니다. 🎉</div>`;
  } else {
    const isFullDayCategory = (
      modalCategoryType === 'vacation' ||
      modalCategoryType === 'petitionLeave' ||
      modalCategoryType === 'wiroLeave' ||
      modalCategoryType === 'dutyOff' ||
      modalCategoryType === 'annualLeave' ||
      modalCategoryType === 'clinic' ||
      modalCategoryType === 'allowance' ||
      modalCategoryType === 'region' ||
      (titleText && ['당직OFF', '청원휴가', '연가', '위로휴가', '휴가', '휴일', '주말', '당직'].some(k => titleText.includes(k)))
    );

    if (isFullDayCategory) {
      const dateGroupMap = new Map();
      itemsList.forEach(entry => {
        const item = entry.item || entry;
        const weekName = entry.wObj ? entry.wObj.title.split(' (')[0] : (item.weekTitleName || '');
        const key = `${weekName}_${item.date}`;
        if (!dateGroupMap.has(key)) {
          dateGroupMap.set(key, { morning: null, afternoon: null, entryList: [], firstItem: item });
        }
        const group = dateGroupMap.get(key);
        group.entryList.push(entry);

        if (item.time && item.time.includes('오후')) {
          group.afternoon = entry;
        } else {
          group.morning = entry;
        }
      });

      const findSessionEntry = (sourceEntry, timeLabel) => {
        const sourceItem = sourceEntry?.item || sourceEntry;
        if (!sourceItem) return null;

        const sourceWeek = sourceEntry?.wObj || state.allWeeksData.find(w =>
          w.items && w.items.some(it => it.id === sourceItem.id && it.date === sourceItem.date)
        );
        const sessionItem = sourceWeek?.items?.find(it =>
          it.date === sourceItem.date && (it.time || '').includes(timeLabel)
        );

        return sessionItem ? { item: sessionItem, wObj: sourceWeek } : null;
      };

      dateGroupMap.forEach(({ morning, afternoon, entryList, firstItem }) => {
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        // 오전/오후에 실제로 해당하는 일정만 활성화한다.
        // 한 세션만 있는 날에는 다른 세션을 대신 열지 않고 비활성화한다.
        const mEntry = morning;
        const aEntry = afternoon;
        // 통계 항목에는 없더라도 실제 해당 시간 일정이 있으면 회색 버튼으로 편집을 허용한다.
        const mEditEntry = mEntry || findSessionEntry(entryList[0], '오전');
        const aEditEntry = aEntry || findSessionEntry(entryList[0], '오후');

        const mItem = mEditEntry ? (mEditEntry.item || mEditEntry) : null;
        const aItem = aEditEntry ? (aEditEntry.item || aEditEntry) : null;

        const getItemDetailText = (it) => {
          if (!it) return '';
          const hr = (it.hrDetail || '').trim();
          const ot = (it.otDetail || '').trim();
          const cl = (it.clinic || '').trim();
          const details = [hr, ot].filter(Boolean);
          if (details.length > 0) return details.join(' / ');
          return (cl && cl !== 'O') ? cl : '';
        };

        const getClinicText = (it) => {
          const clinic = (it?.clinic || '').trim();
          return clinic === 'O' ? '진료' : clinic || '-';
        };
        const isSingleClinicDetail = modalCategoryType === 'vacation' ||
          (modalCategoryType === 'clinic' && ['휴가', '휴일', '주말', '당직'].some(key => titleText.includes(key)));
        const isSplitClinicDetail = modalCategoryType === 'region' ||
          (modalCategoryType === 'clinic' && !isSingleClinicDetail);
        const isLeaveStatusReport = ['annualLeave', 'petitionLeave', 'wiroLeave', 'dutyOff'].includes(modalCategoryType);
        const getMatchedFieldDetails = (fieldName, deduplicate = false) => {
          const details = [mEntry, aEntry]
            .map(entry => (entry?.item || entry)?.[fieldName]?.trim())
            .filter(Boolean);
          return (deduplicate ? [...new Set(details)] : details).join(' / ');
        };

        // 체류 지역과 일반 진료 항목은 오전·오후 진료 구분을 각각 보여준다.
        // 진료 현황의 휴가·휴일/주말·당직은 같은 내용이 반복되는 경우가 많아 한 번만 표시한다.
        let detailText = '';
        if (isSplitClinicDetail) {
          detailText = `${getClinicText(mItem)} / ${getClinicText(aItem)}`;
        } else if (modalCategoryType === 'allowance') {
          detailText = getMatchedFieldDetails('otDetail');
        } else if (isLeaveStatusReport) {
          detailText = getMatchedFieldDetails('hrDetail', true);
        } else if (isSingleClinicDetail) {
          detailText = getItemDetailText(mItem) || getItemDetailText(aItem);
        } else {
          detailText = [getItemDetailText(mItem), getItemDetailText(aItem)].filter(Boolean).join(' / ');
        }
        const regionLabels = [mItem?.region || '-', aItem?.region || '-']
          .map(region => `(${region})`)
          .join(' ');
        const getTravelClass = (item, pairedItem) => {
          if (modalCategoryType !== 'region' || item?.region !== '이동') return '';

          // 이동은 현재 보고 있는 지역을 기준으로 출발(왼쪽)·도착(오른쪽)을 나타낸다.
          const isContextRegion = pairedItem?.region === statsContextRegion;
          const isMorning = (item.time || '').includes('오전');
          const isColorOnLeft = isMorning ? !isContextRegion : isContextRegion;
          return ` summary-session-travel-${isColorOnLeft ? 'left' : 'right'}`;
        };
        const mTravelClass = getTravelClass(mItem, aItem);
        const aTravelClass = getTravelClass(aItem, mItem);

        let descHtml = '';
        if (detailText) {
          descHtml = `<div class="summary-item-desc">${escapeHtml(detailText)}</div>`;
        }

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${escapeHtml(firstItem.date)} ${escapeHtml(regionLabels)}</div>
            ${descHtml}
          </div>
          <div class="summary-item-actions" style="display:flex; gap:6px; align-items:center;">
            <button type="button" class="badge-apply-ok btn-m-edit${mEntry ? '' : ' summary-session-disabled'}${mTravelClass}" ${mEditEntry ? '' : 'disabled'} style="background-color:#3B82F6; border:none; padding:4px 8px; border-radius:4px; color:white; font-size:11px; font-weight:600;">오전</button>
            <button type="button" class="badge-apply-ok btn-a-edit${aEntry ? '' : ' summary-session-disabled'}${aTravelClass}" ${aEditEntry ? '' : 'disabled'} style="background-color:#10B981; border:none; padding:4px 8px; border-radius:4px; color:white; font-size:11px; font-weight:600;">오후</button>
          </div>
        `;

        const handleItemClick = (targetEntry) => {
          if (!targetEntry) return;
          const tItem = targetEntry.item || targetEntry;
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === tItem.id && it.date === tItem.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(tItem);
        };

        const mBtn = card.querySelector('.btn-m-edit');
        const aBtn = card.querySelector('.btn-a-edit');

        if (mBtn && mEditEntry) {
          mBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleItemClick(mEditEntry);
          });
        }

        if (aBtn && aEditEntry) {
          aBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleItemClick(aEditEntry);
          });
        }

        summaryListContainer.appendChild(card);
      });
    } else {
      itemsList.forEach(entry => {
        const item = entry.item || entry;
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        let descHtml = '';
        if (modalCategoryType === 'transport') {
          if (item.transDetail) {
            descHtml = `<div class="summary-item-desc">${escapeHtml(item.transDetail)}</div>`;
          }
        } else if (modalCategoryType === 'allowance') {
          if (item.otDetail) {
            descHtml = `<div class="summary-item-desc">${escapeHtml(item.otDetail)}</div>`;
          }
        }

        card.innerHTML = `
          <div class="summary-item-left">
            <div class="summary-item-date">${escapeHtml(item.date)} ${escapeHtml(item.time)} (${escapeHtml(item.region || '-')})</div>
            ${descHtml}
          </div>
          <div><span class="badge-apply-ok">상세보기</span></div>
        `;

        card.addEventListener('click', () => {
          const targetWeekIdx = state.allWeeksData.findIndex(w => w.items && w.items.some(it => it.id === item.id && it.date === item.date));
          if (targetWeekIdx !== -1 && loadWeekDataFn) {
            loadWeekDataFn(targetWeekIdx);
          }
          openModal(item);
        });

        summaryListContainer.appendChild(card);
      });
    }
  }

  if (summaryModalOverlay) summaryModalOverlay.classList.add('active');
}

