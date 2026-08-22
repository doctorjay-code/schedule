/**
 * 일정·가계부 상세 모달에서 공통으로 사용하는 폼 컴포넌트 프리미티브입니다.
 * HTML 구조는 각 기능이 유지하되, 선택 버튼·읽기 전용·오버레이 제어를 한 곳에서 처리합니다.
 */

export function setOptionGroupValue(groupElem, value) {
  if (!groupElem) return;
  groupElem.querySelectorAll('.option-btn').forEach(button => {
    button.classList.toggle('active', Boolean(value) && button.dataset.val === value);
  });
}

export function getOptionGroupValue(groupElem) {
  return groupElem?.querySelector('.option-btn.active')?.dataset.val || '';
}

export function bindOptionButtonGroup(groupElem, options = {}) {
  if (!groupElem || groupElem.dataset.optionGroupBound === 'true') return;

  const {
    inputElem = null,
    allowEmpty = false,
    onChange = null
  } = options;

  groupElem.dataset.optionGroupBound = 'true';
  groupElem.querySelectorAll('.option-btn').forEach(button => {
    button.addEventListener('click', () => {
      const currentValue = inputElem?.value || getOptionGroupValue(groupElem);
      const nextValue = allowEmpty && currentValue === button.dataset.val ? '' : button.dataset.val;
      setOptionGroupValue(groupElem, nextValue);
      if (inputElem) inputElem.value = nextValue;
      onChange?.(nextValue, button, groupElem);
    });
  });
}

export function setFormReadOnly(formElem, readOnly) {
  formElem?.querySelectorAll('input, button, select, textarea').forEach(control => {
    control.disabled = readOnly;
  });
}

export function setElementVisible(element, visible) {
  element?.classList.toggle('hidden', !visible);
}

export function setModalOpen(overlay, isOpen) {
  overlay?.classList.toggle('active', isOpen);
}

export function bindModalDismiss({ overlay, closeButton, onClose }) {
  closeButton?.addEventListener('click', onClose);
  overlay?.addEventListener('click', event => {
    if (event.target === overlay) onClose();
  });
}
