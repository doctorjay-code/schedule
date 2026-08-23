// Ledger list action event responsibility.
export function bindLedgerListActions({ onRowClick, onOpen }) {
  const handler = onRowClick || onOpen;
  const handleLedgerListAction = event => {
    const row = event.target.closest('tr[data-ledger-id]');
    if (row && row.dataset.ledgerReadOnly !== 'true') {
      handler(row.dataset.ledgerId, event);
    }
  };

  ['ledgerTransactionList', 'ledgerMonthlyTransactionList', 'fundplanAllTimeList'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', handleLedgerListAction);
  });
}