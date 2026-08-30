const DAY_MS = 86400000;
const parseAmount = value => Number(String(value || '').replace(/[^0-9]/g, '')) || 0;
const formatAmount = value => new Intl.NumberFormat('ko-KR').format(Math.round(value || 0));
const dateToUtc = value => value ? Date.parse(value + 'T00:00:00Z') : NaN;
function setDefaultDates(){const start=document.getElementById('ledgerAverageStartDateInput');const end=document.getElementById('ledgerAverageEndDateInput');if(!start||!end||start.value||end.value)return;const today=new Date();const monthStart=new Date(today.getFullYear(),today.getMonth(),1);const toInputValue=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');start.value=toInputValue(monthStart);end.value=toInputValue(today)}
function createRow(){const row=document.createElement('div');row.className='ledger-average-transaction-row';row.innerHTML=`<div class="ledger-average-transaction-fields">
  <div class="form-group"><label>날짜</label><input type="date" class="ledger-average-transaction-date" aria-label="거래 날짜"></div>
  <div class="form-group"><label>입출금</label><button type="button" class="ledger-average-kind-toggle option-btn active" data-kind="income">입금</button></div>
  <div class="form-group"><label>금액</label><input class="input-text ledger-average-transaction-amount" inputmode="numeric" placeholder="0" aria-label="거래 금액"></div>
  <div class="form-group"><label>메모</label><input class="input-text ledger-average-transaction-memo" placeholder="메모" aria-label="거래 메모"></div>
  <button type="button" class="ledger-average-delete-btn" aria-label="거래 행 삭제">삭제</button>
</div>`;return row}
function getTransactions(){return [...document.querySelectorAll('#ledgerAverageTransactionRows .ledger-average-transaction-row')].map(row=>({date:row.querySelector('.ledger-average-transaction-date')?.value||'',kind:row.querySelector('.ledger-average-kind-toggle .active')?.dataset.kind||'income',amount:parseAmount(row.querySelector('.ledger-average-transaction-amount')?.value)})).filter(item=>item.date&&item.amount>0)}
function calculate(){const startValue=document.getElementById('ledgerAverageStartDateInput')?.value||'';const endValue=document.getElementById('ledgerAverageEndDateInput')?.value||'';const opening=parseAmount(document.getElementById('ledgerAverageOpeningBalanceInput')?.value);const result=document.getElementById('ledgerAverageResultValue');const period=document.getElementById('ledgerAverageResultPeriod');const openingResult=document.getElementById('ledgerAverageOpeningResult');const ending=document.getElementById('ledgerAverageEndingResult');const count=document.getElementById('ledgerAverageTransactionCount');if(!result||!period||!openingResult||!ending||!count)return;const start=dateToUtc(startValue),end=dateToUtc(endValue),transactions=getTransactions();openingResult.textContent=formatAmount(opening)+'원';count.textContent=transactions.length+'건';if(!Number.isFinite(start)||!Number.isFinite(end)||end<start){result.textContent='0원';period.textContent='시작일과 종료일을 확인해 주세요.';ending.textContent=formatAmount(opening)+'원';return}const movements=new Map();transactions.forEach(item=>{const value=item.kind==='income'?item.amount:-item.amount;movements.set(item.date,(movements.get(item.date)||0)+value)});let balance=opening,total=0,days=0;for(let current=start;current<=end;current+=DAY_MS){balance+=movements.get(new Date(current).toISOString().slice(0,10))||0;total+=balance;days+=1}result.textContent=formatAmount(total/days)+'원';period.textContent=startValue.replaceAll('-','.')+' ~ '+endValue.replaceAll('-','.')+' · '+days+'일';ending.textContent=formatAmount(balance)+'원'}
export function initAverageBalanceModal() {
  const overlay = document.getElementById('ledgerAverageBalanceOverlay');
  const closeButton = document.getElementById('ledgerAverageBalanceCloseBtn');
  const rows = document.getElementById('ledgerAverageTransactionRows');
  const add = document.getElementById('ledgerAverageAddTransactionBtn');
  const open = document.getElementById('ledgerAverageBalanceBtn');

  if (!overlay || !closeButton || !rows || !add) return;

  const addRow = () => { rows.appendChild(createRow()); calculate(); };
  const close = () => overlay.classList.remove('active');

  if (open) {
    open.addEventListener('click', () => {
      setDefaultDates();
      if (!rows.children.length) addRow();
      calculate();
      overlay.classList.add('active');
    });
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  add.addEventListener('click', addRow);
  rows.addEventListener('click', event => {
    const toggle = event.target.closest('.ledger-average-kind-toggle[data-kind]');
    if (toggle) {
      const next = toggle.dataset.kind === 'income' ? 'expense' : 'income';
      toggle.dataset.kind = next;
      toggle.textContent = next === 'income' ? '입금' : '출금';
      toggle.classList.toggle('active', next === 'income');
      calculate();
    }
    const remove = event.target.closest('.ledger-average-delete-btn');
    if (remove && rows.children.length > 1) {
      remove.closest('.ledger-average-transaction-row')?.remove();
      calculate();
    }
  });
  overlay.addEventListener('input', event => {
    if (event.target.matches('#ledgerAverageOpeningBalanceInput,.ledger-average-transaction-amount')) {
      const digits = event.target.value.replace(/[^0-9]/g, '');
      event.target.value = digits ? formatAmount(digits) : '';
    }
    calculate();
  });
  overlay.addEventListener('change', calculate);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay.classList.contains('active')) close();
  });
}
