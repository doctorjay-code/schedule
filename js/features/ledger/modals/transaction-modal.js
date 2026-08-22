import {
  bindModalDismiss,
  bindOptionButtonGroup,
  setElementVisible,
  setFormReadOnly,
  setModalOpen,
  setOptionGroupValue
} from '../../../shared/modal-form.js';
import { toIso } from '../ledger-utils.js';
import { formatLedgerScheduleDate } from '../transaction-view.js';

// Transaction input, edit, delete, and modal event responsibility.
export function createLedgerTransactionModal({ ledgerState, findRecord, onSave, onDelete }) {
  let bound = false;

  function modalText(...codes) {
    return String.fromCharCode(...codes);
  }

  function setGroup(groupId, inputId, value) {
    const group = document.getElementById(groupId);
    const input = document.getElementById(inputId);
    setOptionGroupValue(group, value);
    if (input) input.value = value || '';
  }

  function splitMemo(value) {
    const memo = String(value || '').trim();
    const personMatch = memo.match(/콩콩|쥬쥬|지니/);
    const person = personMatch ? personMatch[0] : '';
    const detail = person ? memo.replace(person, '').trim().replace(/\s{2,}/g, ' ') : memo;
    return { person, detail };
  }

  function composeMemo() {
    const person = String(document.getElementById('ledgerModalPerson')?.value || '').trim();
    const detail = String(document.getElementById('ledgerModalMemo')?.value || '').trim();
    return [person, detail].filter(Boolean).join(' ');
  }

  function setReadOnly(readOnly) {
    setFormReadOnly(document.getElementById('ledgerTransactionForm'), readOnly);
    setElementVisible(document.getElementById('ledgerModalSaveBtn'), !readOnly);
    setElementVisible(document.getElementById('ledgerModalDeleteBtn'), !readOnly);
  }

  function close() {
    setModalOpen(document.getElementById('ledgerTransactionModalOverlay'), false);
  }

  function open(id) {
    const record = id ? findRecord(id) : null;
    if (id && !record) return;
    const form = document.getElementById('ledgerTransactionForm');
    const overlay = document.getElementById('ledgerTransactionModalOverlay');
    if (!form || !overlay) return;
    const defaults = {
      id: '',
      date: toIso(new Date()),
      type: 'expense',
      amount: '',
      payment: ledgerState.payment,
      item: '',
      category: modalText(0xC2DD, 0xBE44),
      memo: '',
      fixedCost: ''
    };
    const value = { ...defaults, ...(record || {}) };
    const isReadOnly = Boolean(record && (record.sheetName === '잔액전망' || record.source === 'forecast'));
    document.getElementById('ledgerTransactionModalTitle').textContent = record
      ? formatLedgerScheduleDate(value.date) + ' ' + modalText(0xAC70, 0xB798, 0x20, 0xC0C1, 0xC138)
      : modalText(0xC0C8, 0x20, 0xAC70, 0xB798);
    const memoParts = splitMemo(value.memo);
    const fields = {
      ledgerModalEditId: 'id',
      ledgerModalDate: 'date',
      ledgerModalAmount: 'amount',
      ledgerModalItem: 'item'
    };
    Object.entries(fields).forEach(([elementId, property]) => {
      const element = document.getElementById(elementId);
      if (element) element.value = value[property] ?? '';
    });
    document.getElementById('ledgerModalType').value = value.type || 'expense';
    document.getElementById('ledgerModalPayment').value = value.payment || defaults.payment;
    document.getElementById('ledgerModalPerson').value = memoParts.person;
    document.getElementById('ledgerModalMemo').value = memoParts.detail;
    setGroup('ledgerModalCategoryGroup', 'ledgerModalCategory', value.category);
    setGroup('ledgerModalFixedCostGroup', 'ledgerModalFixedCost', value.fixedCost === '\uACE0\uC815\uBE44' ? value.fixedCost : '');
    setReadOnly(isReadOnly);
    setModalOpen(overlay, true);
  }

  function bindGroup(groupId, inputId) {
    const group = document.getElementById(groupId);
    bindOptionButtonGroup(group, {
      inputElem: document.getElementById(inputId),
      allowEmpty: group?.dataset.allowEmpty === 'true'
    });
  }

  function bind() {
    if (bound) return;
    bound = true;
    const form = document.getElementById('ledgerTransactionForm');
    form?.addEventListener('submit', event => {
      event.preventDefault();
      onSave(form, { memo: composeMemo() });
    });
    bindModalDismiss({
      overlay: document.getElementById('ledgerTransactionModalOverlay'),
      closeButton: document.getElementById('ledgerTransactionModalCloseBtn'),
      onClose: close
    });
    document.getElementById('ledgerModalDeleteBtn')?.addEventListener('click', () => {
      const id = document.getElementById('ledgerModalEditId')?.value;
      if (id) onDelete(id);
    });
    [
      ['ledgerModalCategoryGroup', 'ledgerModalCategory'],
      ['ledgerModalFixedCostGroup', 'ledgerModalFixedCost']
    ].forEach(([groupId, inputId]) => bindGroup(groupId, inputId));
  }

  return { open, close, bind };
}