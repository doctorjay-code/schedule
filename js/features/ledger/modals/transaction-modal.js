import {
  bindModalDismiss,
  bindOptionButtonGroup,
  setElementVisible,
  setFormReadOnly,
  setModalOpen,
  setOptionGroupValue
} from '../../../shared/modal-form.js';
import { toIso, formatMoney } from '../ledger-utils.js';
import { formatLedgerScheduleDate } from '../transaction-view.js';

// Transaction input, edit, delete, and modal event responsibility.
export function createLedgerTransactionModal(options = {}) {
  const { ledgerState, findRecord } = options;
  const onSave = options.onSave || options.saveRecord;
  const onDelete = options.onDelete || options.deleteRecord;
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

  function setReadOnly(readOnly, isExistingRecord = false, isAggregate = false) {
    const amountInput = document.getElementById('ledgerModalAmount');
    const typeSelect = document.getElementById('ledgerModalType');

    const itemInput = document.getElementById('ledgerModalItem');
    const memoInput = document.getElementById('ledgerModalMemo');
    const paymentSelect = document.getElementById('ledgerModalPayment');
    const personInput = document.getElementById('ledgerModalPerson');
    const categoryGroup = document.getElementById('ledgerModalCategoryGroup');

    if (isAggregate) {
      // 🌟 가상 집계행(기업카드 결제행, 토스 생활비 등):
      // [날짜] 및 [구분(고정비)] 2개만 수정 가능하게 열어두고, 나머지는 모두 픽스(readOnly/disabled) 잠금!
      setFormReadOnly(document.getElementById('ledgerTransactionForm'), false);
      if (amountInput) {
        amountInput.readOnly = true;
        amountInput.style.backgroundColor = '#F1F5F9';
        amountInput.style.cursor = 'not-allowed';
        amountInput.title = '금액은 세부내역 합계로 자동 계산됩니다.';
      }
      if (typeSelect) {
        typeSelect.disabled = true;
        typeSelect.title = '수입/지출은 세부내역 정산 흐름에 따라 자동 결정됩니다.';
      }
      if (itemInput) {
        itemInput.readOnly = true;
        itemInput.style.backgroundColor = '#F8FAFC';
      }
      if (memoInput) {
        memoInput.readOnly = true;
        memoInput.style.backgroundColor = '#F8FAFC';
      }
      if (paymentSelect) {
        paymentSelect.disabled = true;
      }
      if (personInput) {
        personInput.readOnly = true;
      }
      if (categoryGroup) {
        categoryGroup.style.pointerEvents = 'none';
        categoryGroup.style.opacity = '0.6';
      }
      setElementVisible(document.getElementById('ledgerModalSaveBtn'), true);
      setElementVisible(document.getElementById('ledgerModalDeleteBtn'), false);
      return;
    }

    if (itemInput) {
      itemInput.readOnly = false;
      itemInput.style.backgroundColor = '';
    }
    if (memoInput) {
      memoInput.readOnly = false;
      memoInput.style.backgroundColor = '';
    }
    if (paymentSelect) {
      paymentSelect.disabled = false;
    }
    if (personInput) {
      personInput.readOnly = false;
    }
    if (categoryGroup) {
      categoryGroup.style.pointerEvents = '';
      categoryGroup.style.opacity = '';
    }

    if (amountInput) {
      amountInput.readOnly = false;
      amountInput.style.backgroundColor = '';
      amountInput.style.cursor = '';
      amountInput.title = '';
    }
    if (typeSelect) {
      typeSelect.disabled = false;
    }

    setFormReadOnly(document.getElementById('ledgerTransactionForm'), readOnly);
    setElementVisible(document.getElementById('ledgerModalSaveBtn'), !readOnly);
    setElementVisible(document.getElementById('ledgerModalDeleteBtn'), Boolean(isExistingRecord && !readOnly));
  }

  function close() {
    setModalOpen(document.getElementById('ledgerTransactionModalOverlay'), false);
  }

  function open(arg = {}) {
    bind();
    let record = null;
    let id = null;

    if (typeof arg === 'string') {
      id = arg;
      record = typeof findRecord === 'function' ? findRecord(id) : null;
    } else if (arg && typeof arg === 'object') {
      record = arg.record || (arg.id && typeof findRecord === 'function' ? findRecord(arg.id) : null);
      id = arg.id || record?.id || null;
    }

    const form = document.getElementById('ledgerTransactionForm');
    const overlay = document.getElementById('ledgerTransactionModalOverlay');
    if (!form || !overlay) return;

    const activeState = (typeof options.getLedgerState === 'function' ? options.getLedgerState() : options.ledgerState) || arg?.ledgerState;
    let defaultPayment = '토스은행';
    if (activeState) {
      const src = activeState.source;
      if (src === 'cash') {
        defaultPayment = '현금';
      } else if (src === 'bank') {
        defaultPayment = '기업은행';
      } else if (src === 'card') {
        defaultPayment = activeState.payment === '기업카드' ? '기업카드' : '토스은행';
      } else if (src === 'forecast') {
        defaultPayment = '토스은행';
      }
    }
    const defaults = {
      id: '',
      date: toIso(new Date()),
      type: 'expense',
      amount: '',
      payment: defaultPayment,
      item: '',
      category: '식비',
      memo: '',
      fixedCost: ''
    };
    const value = { ...defaults, ...(record || {}) };
    const isExisting = Boolean(record && record.id);
    const isAggregate = Boolean(record && (record.isAggregate || record.id?.startsWith('fc-est-') || record.id?.startsWith('fc-var-')));
    const isReadOnly = Boolean(record && (record.sheetName === '잔액전망' && !isAggregate));
    document.getElementById('ledgerTransactionModalTitle').textContent = record
      ? formatLedgerScheduleDate(value.date) + ' ' + modalText(0xAC70, 0xB798, 0x20, 0xC0C1, 0xC138)
      : modalText(0xC0C8, 0x20, 0xAC70, 0xB798);
    const memoParts = splitMemo(value.memo, value.person);
    const fields = {
      ledgerModalEditId: 'id',
      ledgerModalDate: 'date',
      ledgerModalItem: 'item'
    };
    Object.entries(fields).forEach(([elementId, property]) => {
      const element = document.getElementById(elementId);
      if (element) element.value = value[property] ?? '';
    });

    const amountInput = document.getElementById('ledgerModalAmount');
    if (amountInput) {
      const numAmt = Number(value.amount);
      if (Number.isFinite(numAmt)) {
        amountInput.value = Math.abs(numAmt).toLocaleString('ko-KR');
      } else {
        amountInput.value = '';
      }
    }

    document.getElementById('ledgerModalType').value = value.type || 'expense';
    let selectedPayment = String(value.payment || value.payment_method || defaults.payment || '').trim();
    if (selectedPayment === '토스' || selectedPayment === '토스카드' || selectedPayment === '토스뱅크') selectedPayment = '토스은행';
    if (selectedPayment === '기업' || selectedPayment === '신용카드' || selectedPayment === '카드') selectedPayment = '기업카드';
    if (selectedPayment === '통장' || selectedPayment === '은행') selectedPayment = '기업은행';
    if (selectedPayment === '잔액전망') selectedPayment = '토스은행';
    document.getElementById('ledgerModalPayment').value = selectedPayment || defaultPayment;
    document.getElementById('ledgerModalPerson').value = memoParts.person || '';
    document.getElementById('ledgerModalMemo').value = memoParts.detail || '';
    setGroup('ledgerModalCategoryGroup', 'ledgerModalCategory', value.category);
    setGroup('ledgerModalFixedCostGroup', 'ledgerModalFixedCost', value.fixedCost === '\uACE0\uC815\uBE44' ? value.fixedCost : '');
    setReadOnly(isReadOnly, isExisting, isAggregate);
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

    // 🌟 실시간 금액 3자리 콤마(,) 자동 포맷터 바인딩
    const amountInput = document.getElementById('ledgerModalAmount');
    amountInput?.addEventListener('input', e => {
      const raw = e.target.value.replace(/[^\d]/g, '');
      if (!raw) {
        e.target.value = '';
        return;
      }
      e.target.value = Number(raw).toLocaleString('ko-KR');
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