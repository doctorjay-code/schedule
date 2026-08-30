const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'js', 'features', 'schedule', 'modals', 'stats-calculations.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/^import .*?;\r?\n/m, '')
  .replace(/export \{.*?\};\r?\n?$/m, '');

const exportsFromModule = new Function(`${source}\nreturn { parseHoursFromDetail, formatOtHoursString, formatHoursToDaysString };`)();
const { parseHoursFromDetail, formatOtHoursString, formatHoursToDaysString } = exportsFromModule;

const parsingCases = [
  ['0.25시간', 0.25],
  ['0.8시간', 0.8],
  ['30분', 0.5],
  ['90분', 1.5],
  ['1시간 30분', 1.5],
  ['1일 1시간 30분', 9.5],
];

for (const [input, expected] of parsingCases) {
  assert.equal(parseHoursFromDetail(input), expected, `${input} 파싱 결과`);
}

const total = parseHoursFromDetail('0.25시간') + parseHoursFromDetail('0.8시간');
assert.equal(total, 1.05, '0.25시간 + 0.8시간 합산값');
assert.equal(formatOtHoursString(total), '1.05시간', '시간외수당 리포트 합계 표시');
assert.equal(formatOtHoursString(parseHoursFromDetail('30분')), '0.50시간', '분 단위 표시');
assert.equal(formatHoursToDaysString(parseHoursFromDetail('0.25시간')), '0.25시간', '소수 둘째 자리 범용 표시');

console.log('✔ 통과: 시간외수당 시간/분 파싱 및 리포트 표시 포맷터 무결점 검증 완료');
