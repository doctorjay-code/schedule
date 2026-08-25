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

  function splitMemo(memoValue, personValue) {
    const rawMemo = String(memoValue || '').trim();
    let person = String(personValue || '').trim();
    const personMatch = rawMemo.match(/콩콩|쥬쥬|지니/);
    if (!person || person === '기타') {
      person = personMatch ? personMatch[0] : (person || '기타');
    }
    const detail = rawMemo.replace(/콩콩|쥬쥬|지니/g, '').trim().replace(/\s{2,}/g, ' ');
    return { person, detail };
  }

  function composeMemoAndPerson() {
    const selectedPerson = String(document.getElementById('ledgerModalPerson')?.value || '').trim();
    const rawDetail = String(document.getElementById('ledgerModalMemo')?.value || '').trim();
    const personMatch = rawDetail.match(/콩콩|쥬쥬|지니/);
    
    let finalPerson = '기타';
    if (selectedPerson && selectedPerson !== '기타') {
      finalPerson = selectedPerson;
    } else if (personMatch) {
      finalPerson = personMatch[0];
    } else if (selectedPerson === '기타') {
      finalPerson = '기타';
    }

    const cleanedDetail = rawDetail.replace(/콩콩|쥬쥬|지니/g, '').trim().replace(/\s{2,}/g, ' ');
    const finalMemo = (finalPerson && finalPerson !== '기타') ? [finalPerson, cleanedDetail].filter(Boolean).join(' ') : cleanedDetail;
    return { person: finalPerson, memo: finalMemo, detail: cleanedDetail };
  }

  function setReadOnly(readOnly, isExistingRecord = false) {
    setFormReadOnly(document.getElementById('ledgerTransactionForm'), readOnly);
    setElementVisible(document.getElementById('ledgerModalSaveBtn'), !readOnly);
    setElementVisible(document.getElementById('ledgerModalDeleteBtn'), Boolean(isExistingRecord && !readOnly));
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
      category: '식비',
      memo: '',
      fixedCost: ''
    };
    const value = { ...defaults, ...(record || {}) };
    const isExisting = Boolean(record && record.id);
    const isReadOnly = Boolean(record && (record.sheetName === '잔액전망' || record.source === 'forecast'));
    document.getElementById('ledgerTransactionModalTitle').textContent = record
      ? formatLedgerScheduleDate(value.date) + ' ' + modalText(0xAC70, 0xB798, 0x20, 0xC0C1, 0xC138)
      : modalText(0xC0C8, 0x20, 0xAC70, 0xB798);
    const memoParts = splitMemo(value.memo, value.person);
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
    let selectedPayment = String(value.payment || defaults.payment || '').trim();
    if (selectedPayment === '토스' || selectedPayment === '토스카드' || selectedPayment === '토스뱅크') selectedPayment = '토스은행';
    if (selectedPayment === '기업' || selectedPayment === '신용카드' || selectedPayment === '카드') selectedPayment = '기업카드';
    if (selectedPayment === '통장' || selectedPayment === '은행') selectedPayment = '기업은행';
    document.getElementById('ledgerModalPayment').value = selectedPayment || '현금';
    document.getElementById('ledgerModalPerson').value = memoParts.person || '';
    document.getElementById('ledgerModalMemo').value = memoParts.detail || '';
    setGroup('ledgerModalCategoryGroup', 'ledgerModalCategory', value.category);
    setGroup('ledgerModalFixedCostGroup', 'ledgerModalFixedCost', value.fixedCost === '\uACE0\uC815\uBE44' ? value.fixedCost : '');
    setReadOnly(isReadOnly, isExisting);
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
      const { person, memo } = composeMemoAndPerson();
      onSave(form, { memo, person });
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