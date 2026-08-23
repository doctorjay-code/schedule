const testRecord = {
  date: "2026-08-23",
  type: "expense",
  amount: 2000,
  item: "속도테스트",
  payment: "기업카드"
};

async function run() {
  const start = Date.now();
  const res = await fetch('https://script.google.com/macros/s/AKfycbwrabwa6r6tuowlOiiewohmSTcESk2OhnwJST6uh50pDBCdx0cWUG8usGJASRqz1UBb/exec', {
    method: 'POST',
    body: JSON.stringify({
      action: 'BATCH_UPSERT_LEDGER_RECORDS',
      records: [testRecord]
    }),
    redirect: 'follow'
  });
  const dur = (Date.now() - start) / 1000;
  console.log(`GAS WebApp Response Status: ${res.status} | Time: ${dur.toFixed(2)}s`);
  const text = await res.text();
  console.log('Response:', text);
}

run().catch(console.error);
