import { getLedgerTagColor } from '../ledger-utils.js?v=20260824_25';

// Ledger tag-color settings and word-rule UI responsibility.
export function createLedgerColorSettings({ state, pastelPalette, defaultColorSettings, saveColorSettings, renderLedgerViews }) {
  const defaultPersonList = ['쥬쥬', '지니', '콩콩', '기타'];
  const defaultCategoryList = ['식비', '교통', '문화', '생활', '보험', '이자', '상환', '저축', '입금', '기타'];
  let ruleColor = pastelPalette[0];
  let bound = false;

  function uiText(...codes) {
    return String.fromCharCode(...codes);
  }

  function getColorNames(field) {
    const defaults = field === 'person' ? defaultPersonList : defaultCategoryList;
    const settingsKey = field === 'person' ? 'ledgerPersonColors' : 'ledgerCategoryColors';
    const savedKeys = Object.keys(state.colorSettings?.[settingsKey] || {});
    return Array.from(new Set([...defaults, ...savedKeys])).filter(Boolean);
  }

  function getWordRules() {
    if (!Array.isArray(state.colorSettings.ledgerWordRules)) state.colorSettings.ledgerWordRules = [];
    return state.colorSettings.ledgerWordRules;
  }

  function appendColorRow(group, field, key, name) {
    const row = document.createElement('div');
    row.className = 'picker-row';
    const label = document.createElement('span');
    label.className = 'picker-label';
    label.textContent = name;
    const chips = document.createElement('div');
    chips.className = 'palette-chips-row';
    pastelPalette.forEach(hex => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      if (getLedgerTagColor(state.colorSettings, field, name).toLowerCase() === hex.toLowerCase()) chip.classList.add('selected');
      chip.style.backgroundColor = hex;
      chip.addEventListener('click', () => {
        state.colorSettings[key] = { ...(state.colorSettings[key] || {}), [name]: hex };
        saveColorSettings();
        chips.querySelectorAll('.color-chip').forEach(item => item.classList.remove('selected'));
        chip.classList.add('selected');
        renderLedgerViews();
      });
      chips.appendChild(chip);
    });
    row.append(label, chips);
    group.appendChild(row);
  }

  function renderColorSettings() {
    const target = document.getElementById('ledgerColorSettingsContent');
    if (!target) return;
    target.replaceChildren();
    const pin = String.fromCodePoint(0x1F4CD);
    const buttonLabel = uiText(0xBC84, 0xD2BC, 0x20, 0xC0C9, 0xC0C1);
    const unit = uiText(0xC885);
    const groups = [
      [uiText(0xAD6C, 0xBD84), 'person', 'ledgerPersonColors'],
      [uiText(0xBD84, 0xB958), 'category', 'ledgerCategoryColors']
    ];
    groups.forEach(([title, field, key]) => {
      const names = getColorNames(field);
      const section = document.createElement('div');
      section.className = 'color-section-box';
      const heading = document.createElement('h4');
      heading.className = 'section-title';
      heading.textContent = pin + ' ' + title + ' ' + buttonLabel + ' (' + names.length + unit + ')';
      const pickerGroup = document.createElement('div');
      pickerGroup.className = 'color-picker-group';
      names.forEach(name => appendColorRow(pickerGroup, field, key, name));
      section.append(heading, pickerGroup);
      target.appendChild(section);
    });
  }

  function renderNewRuleColorPicker() {
    const container = document.getElementById('ledgerNewRuleColorRow');
    if (!container) return;
    container.replaceChildren();
    pastelPalette.forEach(hex => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      if (ruleColor.toLowerCase() === hex.toLowerCase()) chip.classList.add('selected');
      chip.style.backgroundColor = hex;
      chip.addEventListener('click', () => {
        ruleColor = hex;
        container.querySelectorAll('.color-chip').forEach(item => item.classList.remove('selected'));
        chip.classList.add('selected');
      });
      container.appendChild(chip);
    });
  }

  function renderWordRulesList() {
    const container = document.getElementById('ledgerWordRulesListContainer');
    if (!container) return;
    container.replaceChildren();
    const rules = getWordRules();
    if (!rules.length) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:11px; color:#94A3B8;';
      empty.textContent = uiText(0xB4F1, 0xB85D, 0xB41C, 0x20, 0xADDC, 0xCE59, 0xC774, 0x20, 0xC5C6, 0xC2B5, 0xB2C8, 0xB2E4, 0x2E);
      container.appendChild(empty);
      return;
    }
    rules.forEach(rule => {
      const tag = document.createElement('div');
      tag.className = 'word-rule-tag';
      tag.style.backgroundColor = rule.color || '#F1F5F9';
      tag.style.color = '#1E293B';
      const word = document.createElement('span');
      word.textContent = rule.word;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-rule-btn';
      remove.title = uiText(0xADDC, 0xCE59, 0x20, 0xC0AD, 0xC81C);
      remove.textContent = String.fromCharCode(0x2715);
      remove.addEventListener('click', event => {
        event.stopPropagation();
        state.colorSettings.ledgerWordRules = getWordRules().filter(item => item.id !== rule.id);
        renderWordRulesList();
      });
      tag.append(word, remove);
      container.appendChild(tag);
    });
  }

  function renderModalContent() {
    renderColorSettings();
    renderNewRuleColorPicker();
    renderWordRulesList();
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.getElementById('ledgerColorSettingsBtn')?.addEventListener('click', () => {
      renderModalContent();
      document.getElementById('ledgerColorOverlay')?.classList.add('active');
    });
    document.getElementById('ledgerColorCloseBtn')?.addEventListener('click', () => document.getElementById('ledgerColorOverlay')?.classList.remove('active'));
    document.getElementById('ledgerColorResetBtn')?.addEventListener('click', () => {
      if (!confirm(uiText(0xBAA8, 0xB4E0, 0x20, 0xC0C9, 0xC0C1, 0x20, 0xC124, 0xC815, 0xC744, 0x20, 0xAE30, 0xBCF8, 0xAC12, 0xC73C, 0xB85C, 0x20, 0xCD08, 0xAE30, 0xD654, 0xD558, 0xC2DC, 0xACA0, 0xC2B5, 0xB2C8, 0xAE4C, 0x3F))) return;
      state.colorSettings.ledgerPersonColors = { ...defaultColorSettings.ledgerPersonColors };
      state.colorSettings.ledgerCategoryColors = { ...defaultColorSettings.ledgerCategoryColors };
      state.colorSettings.ledgerWordRules = [];
      saveColorSettings();
      renderModalContent();
      renderLedgerViews();
    });
    document.getElementById('ledgerAddWordRuleBtn')?.addEventListener('click', () => {
      const input = document.getElementById('ledgerNewRuleWordInput');
      const word = input?.value.trim() || '';
      if (!word) return;
      getWordRules().push({ id: Date.now(), word, color: ruleColor });
      input.value = '';
      renderWordRulesList();
    });
    document.getElementById('ledgerColorSaveBtn')?.addEventListener('click', () => {
      saveColorSettings();
      renderLedgerViews();
      document.getElementById('ledgerColorOverlay')?.classList.remove('active');
    });
    document.getElementById('ledgerColorOverlay')?.addEventListener('click', event => {
      if (event.target.id === 'ledgerColorOverlay') event.currentTarget.classList.remove('active');
    });
  }

  return { bind, renderModalContent };
}