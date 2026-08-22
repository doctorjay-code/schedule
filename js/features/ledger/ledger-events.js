// Ledger list action event responsibility.
export function bindLedgerListActions({ onOpen }) {
  const handleLedgerListAction = event => {
    const row = event.target.closest('tr[data-ledger-id]');
    if (row && row.dataset.ledgerReadOnly !== 'true') onOpen(row.dataset.ledgerId);
  };

  ['ledgerTransactionList', 'ledgerMonthlyTransactionList', 'fundplanAllTimeList'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', handleLedgerListAction);
  });
}