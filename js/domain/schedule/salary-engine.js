/**
 * Military Salary Calculation Engine (일정 DB 연계 군인 급여 계산 엔진)
 * 
 * Rules:
 * - 2달 전 근무 실적(정액급 일수 + 실적 시간외근무)을 당월 급여에 반영
 * - 공제항목: 일반기여금(고정), 건강보험(총지급-급식비 * 3.595% * 0.8), 장기요양(건보료 * 13.140473%),
 *            소득세(근로소득 간이세액표 2인), 지방소득세(소득세 10%)
 */

// 1. 국세청 근로소득 간이세액표 (소득세법 시행령 [별표 2] 최신 개정본)
// 구간: 3,000,000원 ~ 6,000,000원 (20,000원 단위 150개 구간)
// 원소: [1인 세액, 2인 세액]
const TAX_TABLE_BASE_MIN = 3000000;
const TAX_TABLE_STEP = 20000;
const TAX_TABLE_DATA = [
  [74350, 56850], // 3000000 ~ 3020000
  [76060, 58560], // 3020000 ~ 3040000
  [77770, 60270], // 3040000 ~ 3060000
  [79480, 61980], // 3060000 ~ 3080000
  [81190, 63690], // 3080000 ~ 3100000
  [82900, 65400], // 3100000 ~ 3120000
  [84620, 67120], // 3120000 ~ 3140000
  [86330, 68830], // 3140000 ~ 3160000
  [88040, 70540], // 3160000 ~ 3180000
  [89750, 72250], // 3180000 ~ 3200000
  [91460, 73960], // 3200000 ~ 3220000
  [93170, 75670], // 3220000 ~ 3240000
  [95430, 77380], // 3240000 ~ 3260000
  [97880, 79100], // 3260000 ~ 3280000
  [100320, 80810], // 3280000 ~ 3300000
  [102770, 82520], // 3300000 ~ 3320000
  [105210, 84230], // 3320000 ~ 3340000
  [107660, 85940], // 3340000 ~ 3360000
  [110100, 87650], // 3360000 ~ 3380000
  [112550, 89370], // 3380000 ~ 3400000
  [114990, 91080], // 3400000 ~ 3420000
  [117440, 92790], // 3420000 ~ 3440000
  [119880, 94880], // 3440000 ~ 3460000
  [122330, 97330], // 3460000 ~ 3480000
  [124770, 99770], // 3480000 ~ 3500000
  [127220, 102220], // 3500000 ~ 3520000
  [129660, 104660], // 3520000 ~ 3540000
  [132110, 107110], // 3540000 ~ 3560000
  [134550, 109550], // 3560000 ~ 3580000
  [137000, 112000], // 3580000 ~ 3600000
  [139440, 114440], // 3600000 ~ 3620000
  [141890, 116890], // 3620000 ~ 3640000
  [144330, 119330], // 3640000 ~ 3660000
  [146780, 121780], // 3660000 ~ 3680000
  [149220, 124220], // 3680000 ~ 3700000
  [151670, 126670], // 3700000 ~ 3720000
  [154110, 129110], // 3720000 ~ 3740000
  [156560, 131560], // 3740000 ~ 3760000
  [163920, 136090], // 3760000 ~ 3780000
  [166590, 138740], // 3780000 ~ 3800000
  [169260, 141400], // 3800000 ~ 3820000
  [171930, 144050], // 3820000 ~ 3840000
  [174600, 146710], // 3840000 ~ 3860000
  [177270, 149360], // 3860000 ~ 3880000
  [179940, 152020], // 3880000 ~ 3900000
  [182610, 154670], // 3900000 ~ 3920000
  [185280, 157330], // 3920000 ~ 3940000
  [187950, 159980], // 3940000 ~ 3960000
  [190620, 162640], // 3960000 ~ 3980000
  [193290, 165290], // 3980000 ~ 4000000
  [195960, 167950], // 4000000 ~ 4020000
  [198630, 170600], // 4020000 ~ 4040000
  [201300, 173260], // 4040000 ~ 4060000
  [203970, 175910], // 4060000 ~ 4080000
  [206640, 178570], // 4080000 ~ 4100000
  [209310, 181220], // 4100000 ~ 4120000
  [211980, 183880], // 4120000 ~ 4140000
  [214650, 186530], // 4140000 ~ 4160000
  [217320, 189190], // 4160000 ~ 4180000
  [219990, 191840], // 4180000 ~ 4200000
  [222660, 194500], // 4200000 ~ 4220000
  [225330, 197150], // 4220000 ~ 4240000
  [228000, 199810], // 4240000 ~ 4260000
  [230670, 202460], // 4260000 ~ 4280000
  [233340, 205120], // 4280000 ~ 4300000
  [236010, 207770], // 4300000 ~ 4320000
  [238680, 210430], // 4320000 ~ 4340000
  [241350, 213080], // 4340000 ~ 4360000
  [244020, 215740], // 4360000 ~ 4380000
  [246690, 218390], // 4380000 ~ 4400000
  [249360, 221050], // 4400000 ~ 4420000
  [252030, 223700], // 4420000 ~ 4440000
  [254700, 226360], // 4440000 ~ 4460000
  [257370, 229010], // 4460000 ~ 4480000
  [260040, 231670], // 4480000 ~ 4500000
  [262840, 234460], // 4500000 ~ 4520000
  [265650, 237250], // 4520000 ~ 4540000
  [268450, 240040], // 4540000 ~ 4560000
  [271260, 242830], // 4560000 ~ 4580000
  [276560, 248120], // 4580000 ~ 4600000
  [279370, 250910], // 4600000 ~ 4620000
  [282170, 253700], // 4620000 ~ 4640000
  [284980, 256490], // 4640000 ~ 4660000
  [287780, 259280], // 4660000 ~ 4680000
  [290590, 262070], // 4680000 ~ 4700000
  [293390, 264860], // 4700000 ~ 4720000
  [296200, 267650], // 4720000 ~ 4740000
  [299000, 270440], // 4740000 ~ 4760000
  [301810, 273230], // 4760000 ~ 4780000
  [304610, 276020], // 4780000 ~ 4800000
  [307420, 278810], // 4800000 ~ 4820000
  [310220, 281600], // 4820000 ~ 4840000
  [313030, 284390], // 4840000 ~ 4860000
  [315830, 287180], // 4860000 ~ 4880000
  [318640, 289970], // 4880000 ~ 4900000
  [321440, 292760], // 4900000 ~ 4920000
  [324250, 295550], // 4920000 ~ 4940000
  [327050, 298340], // 4940000 ~ 4960000
  [329860, 301130], // 4960000 ~ 4980000
  [332660, 303920], // 4980000 ~ 5000000
  [335470, 306710], // 5000000 ~ 5020000
  [338270, 309500], // 5020000 ~ 5040000
  [341080, 312290], // 5040000 ~ 5060000
  [343880, 315080], // 5060000 ~ 5080000
  [346690, 317870], // 5080000 ~ 5100000
  [349490, 320660], // 5100000 ~ 5120000
  [352300, 323450], // 5120000 ~ 5140000
  [355100, 326240], // 5140000 ~ 5160000
  [357910, 329030], // 5160000 ~ 5180000
  [360710, 331820], // 5180000 ~ 5200000
  [363520, 334610], // 5200000 ~ 5220000
  [366320, 337400], // 5220000 ~ 5240000
  [369130, 340190], // 5240000 ~ 5260000
  [371930, 342980], // 5260000 ~ 5280000
  [374740, 345770], // 5280000 ~ 5300000
  [377540, 348560], // 5300000 ~ 5320000
  [380350, 351350], // 5320000 ~ 5340000
  [383150, 354140], // 5340000 ~ 5360000
  [385960, 356930], // 5360000 ~ 5380000
  [388760, 359720], // 5380000 ~ 5400000
  [391570, 362510], // 5400000 ~ 5420000
  [394370, 365300], // 5420000 ~ 5440000
  [397180, 368090], // 5440000 ~ 5460000
  [399980, 370880], // 5460000 ~ 5480000
  [402790, 373670], // 5480000 ~ 5500000
  [405590, 376460], // 5500000 ~ 5520000
  [408400, 379250], // 5520000 ~ 5540000
  [411200, 382040], // 5540000 ~ 5560000
  [414010, 384830], // 5560000 ~ 5580000
  [416810, 387620], // 5580000 ~ 5600000
  [419620, 390410], // 5600000 ~ 5620000
  [422420, 393200], // 5620000 ~ 5640000
  [425230, 395990], // 5640000 ~ 5660000
  [428030, 398780], // 5660000 ~ 5680000
  [430840, 401570], // 5680000 ~ 5700000
  [433640, 404360], // 5700000 ~ 5720000
  [436450, 407150], // 5720000 ~ 5740000
  [439250, 409940], // 5740000 ~ 5760000
  [442060, 412730], // 5760000 ~ 5780000
  [444860, 415520], // 5780000 ~ 5800000
  [447670, 418310], // 5800000 ~ 5820000
  [450470, 421100], // 5820000 ~ 5840000
  [470380, 441000], // 5840000 ~ 5860000
  [475720, 446320], // 5860000 ~ 5880000
  [478690, 449140], // 5880000 ~ 5900000
  [483220, 451960], // 5900000 ~ 5920000
  [487760, 454780], // 5920000 ~ 5940000
  [492300, 457600], // 5940000 ~ 5960000
  [496830, 460420], // 5960000 ~ 5980000
  [501370, 463240], // 5980000 ~ 6000000

];

/**
 * 간이세액표 조회 (공제대상 가족수 기준)
 * @param {number} taxableIncome - 월 과세대상 금액 (원)
 * @param {number} familyCount - 공제대상 가족수 (기본 2: 본인 1 + 배우자 1)
 * @returns {number} 소득세액
 */
export function getWithholdingTax(taxableIncome, familyCount = 2) {
  if (!taxableIncome || taxableIncome < 1000000) return 0;

  if (taxableIncome < TAX_TABLE_BASE_MIN) {
    const first = TAX_TABLE_DATA[0];
    return familyCount >= 2 ? first[1] : first[0];
  }

  const index = Math.floor((taxableIncome - TAX_TABLE_BASE_MIN) / TAX_TABLE_STEP);

  if (index >= TAX_TABLE_DATA.length) {
    // 600만원 초과 시 마지막 구간에서 선형 보간 (2만원당 약 2,790원)
    const last = TAX_TABLE_DATA[TAX_TABLE_DATA.length - 1];
    const diff = index - (TAX_TABLE_DATA.length - 1);
    const baseTax = familyCount >= 2 ? last[1] : last[0];
    return Math.round(baseTax + diff * 2790);
  }

  const row = TAX_TABLE_DATA[index];
  return familyCount >= 2 ? row[1] : row[0];
}

/**
 * 10원 미만 절사
 */
export function floor10(val) {
  return Math.floor(Number(val || 0) / 10) * 10;
}

// 시간외수당 단가 (군인 기준 봉급 기준액 기반: 14,856.666...원)
export const OT_HOURLY_RATE = 14856.666666666666; // 18h -> 267,420원, 15h -> 222,850원, 12h -> 178,280원
export const OT_FIXED_HOURS = 10;    // 정액급 기본 10시간 (15일 만근 기준)
export const OT_FIXED_BASE_DAYS = 15;

/**
 * 문자열에서 시간 파싱
 */
export function parseHoursFromDetail(detailStr) {
  if (!detailStr) return 0;
  const detail = String(detailStr);
  let total = 0;
  for (const m of detail.matchAll(/(\d+(?:\.\d+)?)\s*일/g)) total += parseFloat(m[1]) * 8;
  for (const m of detail.matchAll(/(\d+(?:\.\d+)?)\s*시간/g)) total += parseFloat(m[1]);
  for (const m of detail.matchAll(/(\d+(?:\.\d+)?)\s*분/g)) total += parseFloat(m[1]) / 60;
  return Math.round(total * 100) / 100;
}

/**
 * 휴가(연가/조퇴/외출/청원/위로 등) 사용 여부 확인
 */
export function parseHrDuration(detailStr, statusStr) {
  const str = `${statusStr || ''} ${detailStr || ''}`.trim();
  if (!str || str === '-') return 0;

  let total = 0;
  let hasMatch = false;
  for (const m of str.matchAll(/(\d+(?:\.\d+)?)\s*일/g)) { total += parseFloat(m[1]) * 8; hasMatch = true; }
  for (const m of str.matchAll(/(\d+(?:\.\d+)?)\s*시간/g)) { total += parseFloat(m[1]); hasMatch = true; }
  for (const m of str.matchAll(/(\d+(?:\.\d+)?)\s*분/g)) { total += parseFloat(m[1]) / 60; hasMatch = true; }

  if (!hasMatch) {
    if (['연가', '청원휴가', '위로휴가', '포상휴가', '공가', '조퇴', '외출'].some(k => str.includes(k))) {
      return 4; // 오전 or 오후 반일
    }
  }
  return total;
}

// 공휴일 목록 (제헌절 7.17은 공휴일 아님)
const FIXED_HOLIDAYS = [
  '1. 1.', '2. 6.', '3. 1.',
  '5. 1.', '5. 5.', '5. 25.',
  '6. 3.',
  '8. 15.', '8. 17.',
  '9. 24.', '9. 25.', '9. 26.',
  '10. 1.', '10. 3.', '10. 5.', '10. 9.',
  '12. 25.'
];

export function isHolidayDate(dateStr, isHolidayFlag) {
  if (isHolidayFlag) return true;
  return FIXED_HOLIDAYS.some(h => dateStr.includes(h));
}

export function isWeekendDate(dateStr) {
  return dateStr.includes('토') || dateStr.includes('일');
}

/**
 * allWeeksData에서 특정 연/월의 근무 실적(정액일수, 실적시간) 집계
 */
export function calculateOvertimeFromSchedule(allWeeksData, year, month) {
  const dayMap = new Map();

  (allWeeksData || []).forEach(w => {
    const wt = w.title || '';
    if (!wt.includes(`${year}년`)) return;

    (w.items || []).forEach(it => {
      const dStr = it.date || '';
      const match = dStr.match(/(\d{1,2})\.\s*(\d{1,2})\.\((.)\)/);
      if (!match) return;
      const m = parseInt(match[1], 10);
      const d = parseInt(match[2], 10);
      const dayOfWeek = match[3];

      if (m !== month) return;

      const key = `${m}.${d}`;
      if (!dayMap.has(key)) {
        dayMap.set(key, {
          month: m,
          day: d,
          dayOfWeek,
          dateStr: dStr,
          items: []
        });
      }
      dayMap.get(key).items.push(it);
    });
  });

  let fixedDays = 0;
  let totalOtHours = 0;
  const dayDetails = [];

  const sortedDays = Array.from(dayMap.values()).sort((a, b) => a.day - b.day);

  sortedDays.forEach(day => {
    const isWk = !isWeekendDate(day.dateStr);
    const isHol = day.items.some(it => isHolidayDate(day.dateStr, it.isHoliday || it.is_holiday));

    let dayOtHours = 0;
    let hasHr = false;

    day.items.forEach(it => {
      const otDetail = it.otDetail || it.ot_detail || '';
      const otStatus = it.otStatus || it.ot_status || '';
      const hrDetail = it.hrDetail || it.hr_detail || '';
      const hrStatus = it.hrStatus || it.hr_status || '';

      const otH = parseHoursFromDetail(otDetail);
      dayOtHours += otH;

      const hrH = parseHrDuration(hrDetail, hrStatus);
      if (hrH > 0 || ['연가', '휴가', '외출', '조퇴', '반가'].some(k => (hrStatus + hrDetail).includes(k))) {
        hasHr = true;
      }
    });

    totalOtHours += dayOtHours;

    // 평일이고 공휴일이 아니며 휴가를 1시간도 쓰지 않은 날만 정액급 일수로 산정
    const isFixedDay = isWk && !isHol && !hasHr;
    if (isFixedDay) {
      fixedDays++;
    }

    dayDetails.push({
      date: day.dateStr,
      isWeekday: isWk,
      isHoliday: isHol,
      hasHr,
      isFixedDay,
      dayOtHours
    });
  });

  return {
    year,
    month,
    fixedDays,
    totalOtHours: Math.round(totalOtHours * 100) / 100,
    dayDetails
  };
}

// 과거 실제 국방급여포털 확정 명세서 데이터 (5월, 6월, 7월 임관/소급 특수월 전수 보존)
export const HISTORICAL_PAYSTUBS = {
  '2026-05': {
    earnings: [
      { name: '봉급 (기본급)', current: 3185400, past: 475900, total: 3661300, taxable: true },
      { name: '직급보조비', current: 250000, past: 41660, total: 291660, taxable: true },
      { name: '기타수당 (전속파견여비)', current: 0, past: 82870, total: 82870, taxable: false }
    ],
    deductions: [
      { name: '일반기여금 (군인연금)', current: 328410, past: 328410, total: 656820 },
      { name: '건강보험료 (20%감면)', current: 115260, past: 0, total: 115260 },
      { name: '노인장기요양보험', current: 15140, past: 0, total: 15140 },
      { name: '소득세 (간이세액표)', current: 238680, past: 0, total: 238680 },
      { name: '지방소득세 (소득세10%)', current: 23860, past: 0, total: 23860 }
    ],
    totalTaxableStandard: 4178960,
    familyCount: 1,
    fixedDays: 0,
    totalOtHours: 0
  },
  '2026-06': {
    earnings: [
      { name: '봉급 (기본급)', current: 3185400, past: 0, total: 3185400, taxable: true },
      { name: '직급보조비', current: 250000, past: 0, total: 250000, taxable: true },
      { name: '정근수당 (과월)', current: 0, past: 106180, total: 106180, taxable: true },
      { name: '시간외수당 (정액)', current: 0, past: 39610, total: 39610, taxable: true },
      { name: '영외급식비 (정액급식비)', current: 0, past: 22540, total: 22540, taxable: false },
      { name: '기타수당 (전속파견여비)', current: 0, past: 68020, total: 68020, taxable: false }
    ],
    deductions: [
      { name: '일반기여금 (군인연금)', current: 328410, past: 0, total: 328410 },
      { name: '건강보험료 (20%감면)', current: 99940, past: 0, total: 99940 },
      { name: '노인장기요양보험', current: 13130, past: 0, total: 13130 },
      { name: '소득세 (간이세액표)', current: 166590, past: 0, total: 166590 },
      { name: '지방소득세 (소득세10%)', current: 16650, past: 0, total: 16650 }
    ],
    totalTaxableStandard: 3845960,
    familyCount: 1,
    fixedDays: 4,
    totalOtHours: 0
  },
  '2026-07': {
    earnings: [
      { name: '봉급 (기본급)', current: 3185400, past: 0, total: 3185400, taxable: true },
      { name: '직급보조비', current: 250000, past: 0, total: 250000, taxable: true },
      { name: '시간외수당 (정액)', current: 0, past: 118850, total: 118850, taxable: true },
      { name: '시간외수당 (실적)', current: 0, past: 178280, total: 178280, taxable: true },
      { name: '영외급식비 (정액급식비)', current: 0, past: 139770, total: 139770, taxable: false }
    ],
    deductions: [
      { name: '일반기여금 (군인연금)', current: 328410, past: 0, total: 328410 },
      { name: '건강보험료 (20%감면)', current: 110400, past: 0, total: 110400 },
      { name: '노인장기요양보험', current: 14500, past: 0, total: 14500 },
      { name: '소득세 (간이세액표)', current: 209310, past: 0, total: 209310 },
      { name: '지방소득세 (소득세10%)', current: 20930, past: 0, total: 20930 }
    ],
    totalTaxableStandard: 4104160,
    familyCount: 1,
    fixedDays: 12,
    totalOtHours: 12
  }
};

/**
 * 월급 계산 함수
 * @param {Object} params
 * @param {number} params.year - 대상 지급연도 (예: 2026)
 * @param {number} params.month - 대상 지급월 (예: 9)
 * @param {Array} params.allWeeksData - 일정 전체 데이터
 * @param {Object} [params.customOverrides] - 수동 조정값
 */
export function calculateMonthlySalary({ year, month, allWeeksData = [], customOverrides = {} }) {
  // 1. 2개월 전 근무 실적 가져오기 (예: 9월 급여 -> 7월 실적)
  let otYear = year;
  let otMonth = month - 2;
  if (otMonth <= 0) {
    otMonth += 12;
    otYear -= 1;
  }

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // 과거 확정 명세서가 존재하는 경우(5, 6, 7월) 실물 캡처 데이터 완벽 복원
  if (HISTORICAL_PAYSTUBS[monthKey]) {
    const hist = HISTORICAL_PAYSTUBS[monthKey];
    const earnings = hist.earnings.map(e => ({ ...e }));
    const deductions = hist.deductions.map(d => ({ ...d }));

    const extraAllowances = Array.isArray(customOverrides.extraAllowances) ? customOverrides.extraAllowances : [];
    extraAllowances.forEach(item => {
      const amt = Number(item.amount || 0);
      if (amt > 0 && !earnings.some(e => e.name === item.name)) {
        earnings.push({
          name: item.name || '기타수당',
          current: 0,
          past: amt,
          total: amt,
          taxable: Boolean(item.isTaxable)
        });
      }
    });

    const totalEarningsCurrent = earnings.reduce((sum, item) => sum + item.current, 0);
    const totalEarningsPast = earnings.reduce((sum, item) => sum + item.past, 0);
    const totalEarnings = totalEarningsCurrent + totalEarningsPast;

    const totalDeductionsCurrent = deductions.reduce((sum, item) => sum + item.current, 0);
    const totalDeductionsPast = deductions.reduce((sum, item) => sum + item.past, 0);
    const totalDeductions = totalDeductionsCurrent + totalDeductionsPast;

    const netSalary = totalEarnings - totalDeductions;

    return {
      year,
      month,
      otYear,
      otMonth,
      otStats: { fixedDays: hist.fixedDays || 0, totalOtHours: hist.totalOtHours || 0 },
      earnings,
      deductions,
      totalEarnings,
      totalEarningsCurrent,
      totalEarningsPast,
      totalDeductions,
      totalDeductionsCurrent,
      totalDeductionsPast,
      netSalary,
      totalTaxableStandard: hist.totalTaxableStandard,
      familyCount: hist.familyCount
    };
  }

  const otStats = calculateOvertimeFromSchedule(allWeeksData, otYear, otMonth);

  // 시간외수당 금액 산출 (10원 단위 국방부 반올림/절사 기준 적용)
  // 정액급: 14,856 * 10h * (일수 / 15)
  // 실적급: 14,856 * 실적시간
  const jeongAekAmount = customOverrides.jeongAekAmount !== undefined
    ? customOverrides.jeongAekAmount
    : Math.round((148560 * (otStats.fixedDays / OT_FIXED_BASE_DAYS)) / 10) * 10;

  const silJeokAmount = customOverrides.silJeokAmount !== undefined
    ? customOverrides.silJeokAmount
    : Math.round((OT_HOURLY_RATE * otStats.totalOtHours) / 10) * 10;

  // 2. 지급 항목 (기본 봉급 및 수당)
  const baseSalary = customOverrides.baseSalary ?? 3185400; // 본봉
  const positionAllowance = customOverrides.positionAllowance ?? 250000; // 직급보조비
  // 가족수당: 8월 이전은 0원이었으나 8월부터 40,000원 적용 (배우자 1명)
  const familyAllowance = customOverrides.familyAllowance ?? (month >= 8 ? 40000 : 0);
  // 비과세 영외급식비 (식대: 전달 총 일수 * 4,509원)
  let defaultMeal = 139770;
  if (month === 8) defaultMeal = 135270;
  else if (month === 9) defaultMeal = 139770;
  else {
    const daysInOtMonth = new Date(otYear, otMonth, 0).getDate();
    defaultMeal = Math.floor((daysInOtMonth * 4509) / 10) * 10;
  }
  const mealAllowance = customOverrides.mealAllowance ?? defaultMeal;

  // 특수 수당 / 상여금
  let bonusHoliday = 0; // 명절휴가비
  if (customOverrides.bonusHoliday !== undefined) {
    bonusHoliday = customOverrides.bonusHoliday;
  } else if (month === 9) {
    // 9월 추석 명절휴가비: 본봉의 60%
    bonusHoliday = Math.round(baseSalary * 0.6); // 1,911,240원
  }

  let retroactivePay = customOverrides.retroactivePay ?? 0; // 과월 소급분 (8월 가족수당 소급 126,660원 등)
  if (month === 8 && retroactivePay === 0 && customOverrides.retroactivePay === undefined) {
    retroactivePay = 126660; // 8월 명세서 실제 소급분
  }

  // 지급내역 리스트 구성 (영외급식비는 실제 명세서 규격에 맞춰 과월 열에 배치)
  const earnings = [
    { name: '봉급 (기본급)', current: baseSalary, past: 0, total: baseSalary, taxable: true },
    { name: '직급보조비', current: positionAllowance, past: 0, total: positionAllowance, taxable: true },
    { name: '가족수당 (배우자)', current: familyAllowance, past: retroactivePay, total: familyAllowance + retroactivePay, taxable: true },
    { name: '영외급식비 (정액급식비)', current: 0, past: mealAllowance, total: mealAllowance, taxable: false }, // 과월 비과세
    { name: '시간외수당 (정액)', current: 0, past: jeongAekAmount, total: jeongAekAmount, taxable: true },
    { name: '시간외수당 (실적)', current: 0, past: silJeokAmount, total: silJeokAmount, taxable: true }
  ];

  if (bonusHoliday > 0) {
    earnings.push({
      name: '명절휴가비 (추석/설 60%)',
      current: bonusHoliday,
      past: 0,
      total: bonusHoliday,
      taxable: true
    });
  }

  // 기타 수당 / 파견여비 처리
  const extraAllowances = Array.isArray(customOverrides.extraAllowances) ? customOverrides.extraAllowances : [];
  let nonTaxableExtras = 0;
  let taxableExtras = 0;

  extraAllowances.forEach(item => {
    const amt = Number(item.amount || 0);
    if (amt > 0) {
      earnings.push({
        name: item.name || '기타 수당 (파견여비 등)',
        current: amt,
        past: 0,
        total: amt,
        taxable: Boolean(item.isTaxable)
      });
      if (item.isTaxable) {
        taxableExtras += amt;
      } else {
        nonTaxableExtras += amt;
      }
    }
  });

  const totalEarningsCurrent = earnings.reduce((sum, item) => sum + item.current, 0);
  const totalEarningsPast = earnings.reduce((sum, item) => sum + item.past, 0);
  const totalEarnings = totalEarningsCurrent + totalEarningsPast;

  // 3. 공제 항목 산출
  // ① 일반기여금 (연금): 328,410원 완전 고정
  const pension = customOverrides.pension ?? 328410;

  // ② 건강보험료: (총지급액 - 비과세급식비 - 비과세기타수당) * 3.595% * 80% (군인 20% 감면, 10원 미만 절사)
  const healthBase = totalEarnings - mealAllowance - nonTaxableExtras;
  const healthInsurance = customOverrides.healthInsurance !== undefined
    ? customOverrides.healthInsurance
    : floor10(healthBase * 0.03595 * 0.8);

  // ③ 노인장기요양보험: 건강보험료 * 13.140473% (10원 미만 절사)
  const careInsurance = customOverrides.careInsurance !== undefined
    ? customOverrides.careInsurance
    : floor10(healthInsurance * 0.13140473);

  // ④ 소득세 산정
  // 과세표준 = 당월 과세대상 기본급여 + 과월 시간외수당 + 정근수당/6 (53,090원) + 명절비/6 (318,540원)
  const bonusAmortization = customOverrides.bonusAmortization ?? (53090 + 318540); // 371,630원
  const overtimeTaxable = jeongAekAmount + silJeokAmount;
  const monthlyTaxableBase = baseSalary + positionAllowance + familyAllowance;
  // 과월 소급분 및 과세 기타수당 합산
  const totalTaxableStandard = monthlyTaxableBase + overtimeTaxable + retroactivePay + taxableExtras + bonusAmortization;

  const familyCount = month >= 8 ? 2 : 1; // 8월부터 2인 적용
  const incomeTax = customOverrides.incomeTax !== undefined
    ? customOverrides.incomeTax
    : getWithholdingTax(totalTaxableStandard, familyCount);

  // ⑤ 지방소득세: 소득세의 10% (10원 미만 절사)
  const localIncomeTax = customOverrides.localIncomeTax !== undefined
    ? customOverrides.localIncomeTax
    : floor10(incomeTax * 0.1);

  const deductions = [
    { name: '일반기여금 (군인연금)', current: pension, past: 0, total: pension },
    { name: '건강보험료 (20%감면)', current: healthInsurance, past: 0, total: healthInsurance },
    { name: '노인장기요양보험', current: careInsurance, past: 0, total: careInsurance },
    { name: '소득세 (간이세액표)', current: incomeTax, past: 0, total: incomeTax },
    { name: '지방소득세 (소득세10%)', current: localIncomeTax, past: 0, total: localIncomeTax }
  ];

  const totalDeductionsCurrent = deductions.reduce((sum, item) => sum + item.current, 0);
  const totalDeductionsPast = deductions.reduce((sum, item) => sum + item.past, 0);
  const totalDeductions = totalDeductionsCurrent + totalDeductionsPast;

  // 4. 최종 실지급액 (실수령액)
  const netSalary = totalEarnings - totalDeductions;

  return {
    year,
    month,
    otYear,
    otMonth,
    otStats,
    earnings,
    deductions,
    totalEarnings,
    totalEarningsCurrent,
    totalEarningsPast,
    totalDeductions,
    totalDeductionsCurrent,
    totalDeductionsPast,
    netSalary,
    totalTaxableStandard,
    familyCount
  };
}

// 과거 실제 국방급여포털 명세서 및 가계부 실지급액 기록 (검증용)
export const ACTUAL_SALARY_HISTORY = {
  '2026-09': {
    totalEarnings: 5932490,
    totalDeductions: 736680,
    netSalary: 5195810,
    memo: '추석 명절휴가비(1,911,240원) 포함 / 7월 실적(14일, 18h)'
  },
  '2026-08': {
    totalEarnings: 4039410,
    totalDeductions: 678140,
    netSalary: 3361270,
    memo: '가족수당 소급분(126,660원) 포함 / 6월 실적(8일, 15h)'
  },
  '2026-07': {
    totalEarnings: 3872300,
    totalDeductions: 683550,
    netSalary: 3188750,
    memo: '5월 실적(12일, 12h) 반영'
  },
  '2026-06': {
    totalEarnings: 3671750,
    totalDeductions: 624720,
    netSalary: 3047030,
    memo: '본급여(2,940,850원) + 정근수당(106,180원)'
  },
  '2026-05': {
    totalEarnings: 4035830,
    totalDeductions: 1049760,
    netSalary: 2986070,
    memo: '기여금 소급분 등 반영'
  }
};
