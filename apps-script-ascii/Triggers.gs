/**
 * \uC124\uCE58\uD615 \uD2B8\uB9AC\uAC70\uC640 \uC6B4\uC601\uC6A9 \uC218\uB3D9 \uC2E4\uD589 \uD568\uC218.
 *
 * installLedgerBalanceSyncTrigger\uB97C \uD55C \uBC88 \uC2E4\uD589\uD558\uBA74 \uAE30\uC5C5\uCE74\uB4DC\u00B7\uD1A0\uC2A4\uC740\uD589\u00B7\uAE30\uC5C5\uC740\uD589\uC758
 * \uC9C1\uC811 \uD3B8\uC9D1\uB3C4 onLedgerSourceEdit\uB97C \uD1B5\uD574 \uC989\uC2DC \uC794\uC561\uC804\uB9DD\uC5D0 \uBC18\uC601\uB41C\uB2E4.
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
