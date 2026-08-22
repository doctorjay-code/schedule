/**
 * 설치형 트리거와 운영용 수동 실행 함수.
 *
 * installLedgerBalanceSyncTrigger를 한 번 실행하면 기업카드·토스은행·기업은행의
 * 직접 편집도 onLedgerSourceEdit를 통해 즉시 잔액전망에 반영된다.
 */
function setupLedgerAutomation() {
  return installLedgerBalanceSyncTrigger();
}

function runLedgerBalanceReconcile() {
  return reconcileBalanceForecast();
}

function runLedgerBalanceFullSync() {
  return syncAllBalanceForecastTransactions();
}
