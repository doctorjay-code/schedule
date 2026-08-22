import { state, pastelPalette, saveColorSettings, resetColorSettings } from '../../../services/schedule/state.js';
import { syncColorSettingsToSheets } from '../../../services/schedule/api.js';
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

export function renderPaletteChipsRows() {
  const chipContainers = document.querySelectorAll('.palette-chips-row[data-target-type]');
  
  chipContainers.forEach(container => {
    container.innerHTML = '';
    const type = container.dataset.targetType; // 'region' or 'clinic'
    const key = container.dataset.targetKey;   // e.g. '진주', 'O'

    const currentColor = (type === 'region')
      ? (state.colorSettings.regionColors[key] || '#FFEDD5')
      : (state.colorSettings.clinicColors[key] || '#F1F5F9');

    pastelPalette.forEach(hex => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      if (currentColor.toLowerCase() === hex.toLowerCase()) {
        chip.classList.add('selected');
      }
      chip.style.backgroundColor = hex;

      chip.addEventListener('click', () => {
        if (type === 'region') state.colorSettings.regionColors[key] = hex;
        else if (type === 'clinic') state.colorSettings.clinicColors[key] = hex;

        container.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
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
      <button class="delete-rule-btn" title="규칙 삭제">✕</button>
    `;

    tag.querySelector('.delete-rule-btn').addEventListener('click', (e) => {
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
        syncColorSettingsToSheets();
        renderPaletteChipsRows();
        renderWordRulesList();
        if (renderTableFn) renderTableFn();
        renderMonthlyCalendar();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveColorSettings();
      syncColorSettingsToSheets();
      if (renderTableFn) renderTableFn();
      renderMonthlyCalendar();
      closeColorSettingsModal();
    });
  }
}

