const testRecords = [
  { date: "2026-08-18", type: "expense", amount: 24800, item: "한국철도공사_테스트", payment: "기업카드" },
  { date: "2026-08-18", type: "expense", amount: 7890, item: "쿠팡_테스트", payment: "기업카드" }
];

async function run() {
  const url = 'https://script.google.com/macros/s/AKfycbwrabwa6r6tuowlOiiewohmSTcESk2OhnwJST6uh50pDBCdx0cWUG8usGJASRqz1UBb/exec';
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      action: 'BATCH_UPSERT_LEDGER_RECORDS',
      records: testRecords
    }),
    redirect: 'follow'
  });
  console.log('Post Status:', res.status);
  const text = await res.text();
  console.log('Post Response:', text);
}

run().catch(console.error);
