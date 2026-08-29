import { state, pastelPalette, saveColorSettings, resetColorSettings } from '../../../services/schedule/schedule-store.js';
import { syncColorSettingsToSupabase } from '../../../services/schedule/schedule-api.js';
import { renderTableFn } from './edit.js';
import { renderMonthlyCalendar } from '../render.js';
import { escapeHtml, safeCssColor } from '../../../shared/safe.js';

// ----------------------------------------------------
// Color Settings Modal Functionalities
// ----------------------------------------------------
let tempSelectedNewRuleColor = pastelPalette[0];

export function openColorSettingsModal() {
  const colorSettingsModalOverlay = document.getElementById('colorSettingsModalOverlay');
  if (!colorSettingsModalOverlay) return;

  renderPaletteChipsRows();
  renderNewRuleColorPicker();
  renderWordRulesList();

  colorSettingsModalOverlay.classList.add('active');
}

export function closeColorSettingsModal() {
  const colorSettingsModalOverlay = document.getElementById('colorSettingsModalOverlay');
  if (colorSettingsModalOverlay) colorSettingsModalOverlay.classList.remove('active');
}

export function applyScheduleAlertChipColors() {
  const alertColors = state.colorSettings?.scheduleAlertColors || {};
  const unpaidBtn = document.getElementById('unpaidSummaryBtn');
  const unappliedBtn = document.getElementById('unappliedSummaryBtn');
  const unapprovedBtn = document.getElementById('unapprovedSummaryBtn');

  if (unpaidBtn && alertColors['미결제']) {
    unpaidBtn.style.setProperty('--alert-bg', alertColors['미결제']);
    unpaidBtn.style.backgroundColor = alertColors['미결제'];
    unpaidBtn.style.color = '#DC2626';
    unpaidBtn.style.borderColor = 'rgba(220, 38, 38, 0.3)';
  }
  if (unappliedBtn && alertColors['미신청']) {
    unappliedBtn.style.setProperty('--alert-bg', alertColors['미신청']);
    unappliedBtn.style.backgroundColor = alertColors['미신청'];
    unappliedBtn.style.color = '#D97706';
    unappliedBtn.style.borderColor = 'rgba(217, 119, 6, 0.3)';
  }
  if (unapprovedBtn && alertColors['미승인']) {
    unapprovedBtn.style.setProperty('--alert-bg', alertColors['미승인']);
    unapprovedBtn.style.backgroundColor = alertColors['미승인'];
    unapprovedBtn.style.color = '#15803D';
    unapprovedBtn.style.borderColor = 'rgba(21, 128, 61, 0.3)';
  }
}

export function renderPaletteChipsRows() {
  const chipContainers = document.querySelectorAll('.palette-chips-row[data-target-type]');
  
  chipContainers.forEach(container => {
    container.innerHTML = '';
    const type = container.dataset.targetType; // 'region', 'clinic', 'alert'
    const key = container.dataset.targetKey;

    const currentColor = (type === 'region')
      ? (state.colorSettings.regionColors?.[key] || '#FFEDD5')
      : (type === 'clinic')
        ? (state.colorSettings.clinicColors?.[key] || '#F1F5F9')
        : (state.colorSettings.scheduleAlertColors?.[key] || (key === '미결제' ? '#FEF2F2' : key === '미신청' ? '#FFFBEB' : '#F0FDF4'));

    pastelPalette.forEach(hex => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      if (currentColor.toLowerCase() === hex.toLowerCase()) {
        chip.classList.add('selected');
      }
      chip.style.backgroundColor = hex;

      chip.addEventListener('click', () => {
        if (type === 'region') {
          if (!state.colorSettings.regionColors) state.colorSettings.regionColors = {};
          state.colorSettings.regionColors[key] = hex;
        } else if (type === 'clinic') {
          if (!state.colorSettings.clinicColors) state.colorSettings.clinicColors = {};
          state.colorSettings.clinicColors[key] = hex;
        } else if (type === 'alert') {
          if (!state.colorSettings.scheduleAlertColors) state.colorSettings.scheduleAlertColors = {};
          state.colorSettings.scheduleAlertColors[key] = hex;
          applyScheduleAlertChipColors();
        }

        container.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');

        // 원터치 즉시 로컬 + 클라우드 DB 실시간 영구 자동 저장!
        saveColorSettings();
        syncColorSettingsToSupabase();
        if (renderTableFn) renderTableFn();
        renderMonthlyCalendar();
      });

      container.appendChild(chip);
    });
  });
}

export function renderNewRuleColorPicker() {
  const container = document.getElementById('newRuleColorRow');
  if (!container) return;
  container.innerHTML = '';

  pastelPalette.forEach(hex => {
    const chip = document.createElement('div');
    chip.className = 'color-chip';
    if (tempSelectedNewRuleColor.toLowerCase() === hex.toLowerCase()) {
      chip.classList.add('selected');
    }
    chip.style.backgroundColor = hex;

    chip.addEventListener('click', () => {
      tempSelectedNewRuleColor = hex;
      container.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });

    container.appendChild(chip);
  });
}

export function renderWordRulesList() {
  const container = document.getElementById('wordRulesListContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!state.colorSettings.wordRules || state.colorSettings.wordRules.length === 0) {
    container.innerHTML = `<span style="font-size:11px; color:#94A3B8;">등록된 단어 규칙이 없습니다.</span>`;
    return;
  }

  state.colorSettings.wordRules.forEach(rule => {
    const tag = document.createElement('div');
    tag.className = 'word-rule-tag';
    tag.style.backgroundColor = safeCssColor(rule.color, '#F1F5F9');
    tag.style.color = '#1E293B';

    tag.innerHTML = `
      <span>${escapeHtml(rule.word)}</span>
      <span class="delete-rule-btn" data-rule-id="${rule.id}">✕</span>
    `;

    tag.querySelector('.delete-rule-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.colorSettings.wordRules = state.colorSettings.wordRules.filter(r => r.id !== rule.id);
      renderWordRulesList();
    });

    container.appendChild(tag);
  });
}

export function setupColorSettingsEvents(options = {}) {
  const openBtn = document.getElementById('openColorSettingsBtn');
  const closeBtn = document.getElementById('closeColorSettingsModalBtn');
  const overlay = document.getElementById('colorSettingsModalOverlay');
  const addRuleBtn = document.getElementById('addWordRuleBtn');
  const newRuleWordInput = document.getElementById('newRuleWordInput');
  const resetBtn = document.getElementById('resetColorSettingsBtn');
  const saveBtn = document.getElementById('saveColorSettingsBtn');

  if (options.bindOpen !== false && openBtn) openBtn.addEventListener('click', openColorSettingsModal);
  if (closeBtn) closeBtn.addEventListener('click', closeColorSettingsModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeColorSettingsModal();
    });
  }

  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', () => {
      const word = newRuleWordInput ? newRuleWordInput.value.trim() : '';
      if (!word) {
        alert('규칙으로 등록할 단어를 입력해주세요!');
        return;
      }

      state.colorSettings.wordRules.push({
        id: Date.now(),
        word: word,
        color: tempSelectedNewRuleColor
      });

      if (newRuleWordInput) newRuleWordInput.value = '';
      renderWordRulesList();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('모든 색상 설정을 기본값으로 초기화하시겠습니까?')) {
        resetColorSettings();
        syncColorSettingsToSupabase();
        renderPaletteChipsRows();
        renderWordRulesList();
        applyScheduleAlertChipColors();
        if (renderTableFn) renderTableFn();
        renderMonthlyCalendar();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveColorSettings();
      syncColorSettingsToSupabase();
      applyScheduleAlertChipColors();
      if (renderTableFn) renderTableFn();
      renderMonthlyCalendar();
      closeColorSettingsModal();
    });
  }
}
