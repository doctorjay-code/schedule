# 📅 스마트 일정 관리 시스템 (Smart Schedule Management)

구글 시트(Google Sheets)와 실시간으로 연동되는 **반응형 웹 기반 스마트 일정 관리 애플리케이션**입니다.  
주차별 일정 조회, 7열 월간 달력 조망, 체류 지역/진료/교통/국인체/시간외수당 관리, 커스텀 색상 및 키워드 규칙 설정, 다중 선택 기반 스마트 일괄 복사·붙여넣기, 보안 인증 및 3종 미결제/미신청/미승인 모아보기 기능을 제공합니다.

---

## ✨ 주요 기능 (Key Features)

- **🗓️ 주차별 일정 조회 & 원클릭 주차 선택 바텀시트**:
  - 오전/오후 2행 일정 관리 및 법정공휴일/주말 자동 감지 (빨간색 강조).
  - 상단 주차 제목(`2026년 8월 2주차 ▾`) 클릭 시 전체 주차 목록을 한눈에 보고 원클릭 이동할 수 있는 **주차 선택 바텀시트 모달** 제공 (현재 주차 스크롤 중앙 자동 포커싱).
  - 동일한 지역, 진료, 교통, 국인체, 수당 데이터 보유 시 시각적 셀 자동 병합 (`rowSpan=2`).
- **🗓️ 월간 달력 뷰 (Monthly Calendar Grid View)**:
  - 최상단 **`[ 📅 주간 | 🗓️ 월간 ]`** 세그먼트 스위치로 원클릭 뷰 전환.
  - 7열 달력 그리드로 한 달 전체 일정을 한눈에 조망 및 `◀ YYYY년 M월 ▶` 월 단위 이동 지원.
  - **이전 달/다음 달 연결 칸(연속성 패딩 셀)**을 연한 회색 배경으로 구별하되, 날짜 숫자 및 **지역 색상 닷, 진료 텍스트, 클릭 편집 기능**을 그대로 유지하여 일정의 높은 연속성 제공.
  - 지역명 대신 **지역별 커스텀 색상 닷(Dot)**으로 공간 효율을 대폭 높이고, 그 옆에 **진료 구분 텍스트("O", "행정", "휴가" 등)**를 오전/오후 2줄 분리로 디스플레이.
  - 달력 상단 **지역 색상 안내 범례(Color Legend Bar)** 실시간 표시 (`🟡 진주  🔵 서울  🟢 이동  🟠 기타`).
  - 월간 달력의 특정 날짜 또는 오전/오후 줄 클릭 시 **월간 뷰 화면을 그대로 유지**한 채로 해당 (오전/오후) 일정 상세 편집 모달 팝업.
  - 모달에서 일정 수정/저장 시 **월간 달력의 동그라미 색상과 내용이 즉시 실시간 양방향 갱신**.
- **📊 대화형 통계 요약 리포트 & 대시보드 (Interactive Analytics Dashboard)**:
  - 헤더의 **`📊` 버튼** 클릭 시 4가지 기간 범위(`전체` / `월별: YYYY년 M월` / `주별` / `특정기간`)별 실시간 상세 통계 제공.
  - **행정 승인완결건 정밀 필터링**: 미신청(`신청X`) 및 미승인(`신청O`/`승인대기`) 건은 전면 제외하고, 오직 **최종 승인 완료된 확정 휴가 및 수당 건만 실시간 정확히 카운팅**.
  - **대화형 드릴다운(Interactive Drill-down)**: 체류 지역(진주, 서울, 대구 등), 진료/행정, 연가, 청원휴가, 당직OFF, 수당(야간, 당직 등), 교통 항목 터치 시 **선택된 기간 내의 해당 일정만 쏙 모아서 보여주는 모아보기 바텀시트 모달** 팝업.
  - **[ 💰 수당 현황 ] 파트 신설**: 승인 완료된 `야간`, `당직`, `휴일` 수당 횟수 및 **순수 총 누적 시간(`X시간`, 날짜 환산 없이 시간 표기)** 집계 및 맨 밑줄 **`• 전체 : (총 횟수) 총시간`** 합계 행 지원.
  - **체류 지역 분포**: '이동' 슬롯(0.5)은 직전/직후 체류지로 반반 분할 합산하고, 기타 장소(일본, 대구 등)는 개별 카운트 및 % 산출.
  - **잔여 휴가 고정 표시**: 2026년(14일/112h), 2027년(21일/168h) 발생 연가 및 청원휴가(30일/240h) 대비 전체 고정 잔여 수치 `(잔여 연가: O일 O시간)` 실시간 차감 계산.
  - **연속 모달 레이어링 (Z-index Stack)**: `#statsModalOverlay`(150) ➔ `#summaryModalOverlay`(200) ➔ `#modalOverlay`(300) 3단계 Z-index 레이어링을 적용하여, 상세보기로 일정 편집 후 나가더라도 **보던 모아보기 및 통계 모달이 닫히지 않고 그대로 스무스하게 유지**.
- **🚨 3종 요약 알림 칩 & 사유 정제 모아보기**:
  - 전체 주차 대상 **전체 미결제**, **전체 미신청**, **전체 미승인** 건수 실시간 집계.
  - 사유 정제 헬퍼(`getItemReason`)를 도입하여 상단 알림 칩의 숫자 건수와 모달 카드 개수가 **100% 1:1 정확히 일치**.
  - 하루 통째로 쓴 풀 연가(오전+오후) 및 청원휴가, 당직OFF는 모아보기 모달에서 **동일 날짜 1개의 통합 카드**로 깔끔히 병합 출력.
  - `0일 4시간` ➔ `4시간`, `1일 0시간` ➔ `1일` 과 같이 어색한 `0일`/`0시간` 문구를 제거한 깔끔한 포맷팅 적용.
  - 색상 설정은 브라우저 LocalStorage 및 구글 시트 백엔드(`GET_COLORS` / `SET_COLORS`)와 양방향 자동 동기화.
- **✏️ 다중 선택 & 스마트 일괄 편집/복사/붙여넣기**:
  - 셀 단위, 시간 행 단위, 하루 전체, 다중 날짜 선택 지원.
  - 선택한 셀/일정을 일괄 복사하여 복사 버퍼 툴바에서 확인 후 다른 셀/날짜에 일괄 붙여넣기.
  - 일정 상세 편집 모달 내 **"평일 전체(화~목) 동일 적용"** 퀵 버튼 제공.
  - 전체 주차 대상 **전체 미결제**, **전체 미신청**, **전체 미승인** 건수 실시간 집계.
  - 미신청 및 미승인은 **동일 날짜(하루 단위) 1건**으로 합산 집계하여 표시.
  - 요약 칩 클릭 시 전 주차 통합 데이터 모아보기 바텀시트 모달 출력 (미신청/미승인은 같은 날짜 오전/오후 항목을 1개 카드로 통합 렌더링) 및 클릭 시 해당 일정으로 즉시 이동/편집.
- **🔄 실시간 구글 시트 양방향 동기화**:
  - 앱 시작 시 최신 일정 및 색상 설정 자동 불러오기 (`syncFromGoogleSheets`).
  - 헤더의 **🔄 동기화** 버튼으로 원클릭 수동 동기화 지원.
  - 일정 수정 시 LocalStorage 우선 저장 후 구글 시트 백엔드로 실시간 POST 전송.
- **🔒 보안 인증 & 락아웃 시스템**:
  - 접속 시 SHA-256 암호화 비밀번호 인증.
  - 10회 연속 실패 시 해당 단말기 5분간 접속 자동 차단 타이머 가동.

---

## 🩺 진료 세션 산출 및 배정 규칙 (Clinic Session Rules)

주차별 평일(월~금) 진료 세션 수 산출 및 업무 배정 기준입니다:

1. **세션 단위**: 오전 1세션 / 오후 1세션 (하루 2세션, 평일 5일 = 총 10세션).
2. **가능 세션 기준**:
   - **휴일(가능 세션 차감)**: 법정공휴일, 주말, 일반 휴가(연가 등), **'휴무' 키워드(대체휴무 등)**.
   - **행정 및 예외 취급(가능 세션 유지)**:
     - **청원휴가**: 가능 세션 차감 없이 '행정'으로 유지 포함.
     - **시간 단위 연가 (예: 연가 1시간, 연가 2시간 등)**: 세션 통째 차감 없이 **가능 세션에 그대로 유지**.
3. **가능 세션 대비 필수 진료 세션 구간표**:
   - **9 ~ 10 세션**: 진료 **6 세션** (잔여 3~4 세션 행정 등)
   - **8 세션**: 진료 **5 세션** (잔여 3 세션 행정 등)
   - **6 ~ 7 세션**: 진료 **4 세션** (잔여 2~3 세션 행정 등)
   - **4 ~ 5 세션**: 진료 **3 세션** (잔여 1~2 세션 행정 등)
   - **2 ~ 3 세션**: 진료 **2 세션** (잔여 0~1 세션 행정 등)
4. **배치 순서**: 필수 진료 세션을 우선 배치 후, 남은 세션은 '행정' 및 기타 업무 배치.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: HTML5, Vanilla CSS3 (Modern Glassmorphism & Dynamic Color System), Vanilla JavaScript (ES Modules)
- **Backend Sync**: Google Apps Script (GAS) Web App API Engine
- **Storage**: Browser LocalStorage & Google Sheets Real-time Synchronization

---

## 📂 프로젝트 구조 및 모듈 역할 (Architecture)

프로젝트는 유지보수성과 확장성을 위해 **ES Modules (`import` / `export`)** 기반으로 역할별 분리되어 있습니다:

```text
├── index.html         # 메인 레이아웃, 뷰 스위치 탭, 모달/바텀시트 & 커스텀 색상 설정 UI
├── style.css          # 반응형 디자인 시스템, 월간/주간 그리드, 파스텔 팔레트 & Glassmorphic 테마
├── state.js           # 전역 반응형 데이터 상태(state), currentView/currentMonthYear, 커스텀 색상/단어 규칙, LocalStorage
├── auth.js            # 패스워드 SHA-256 인증 & 10회 실패 락아웃 타이머
├── api.js             # 구글 시트 GET/POST 실시간 연동 & 색상 설정(GET_COLORS/SET_COLORS) 동기화
├── render.js          # 주간 Grid 테이블 및 월간 7열 달력(renderMonthlyCalendar) 렌더링, 뷰 스위칭(switchViewModeUI), 셀 병합 & 클릭 로직
├── modal.js           # 일정 상세 편집, 요약 모아보기, 주차 선택 바텀시트, 커스텀 색상 설정 모달 UI & 이벤트
├── app.js             # 애플리케이션 메인 엔트리 포인트, 주간/월간 통합 네비게이션 & 이벤트 바인딩
├── apple-touch-icon.png # 애플 홈 화면 파비콘 아이콘
└── color.png          # 파스텔 팔레트 참고 자산 이미지
```

---

## 🚀 로컬 실행 방법 (Local Development)

ES Modules 규격(`type="module"`)을 사용하므로 브라우저 보안 정책에 따라 **로컬 웹 서버 환경**에서 실행하셔야 합니다:

1. **VS Code에서 실행 (추천)**:
   - VS Code 확장 프로그램 **`Live Server`** 설치
   - `index.html` 우클릭 ➡️ **`Open with Live Server`** 클릭 (`http://localhost:5500`)
   - *코드 수정 및 저장 시 브라우저가 자동 새로고침(Hot Reload)됩니다.*

2. **웹 배포 환경 (Vercel / GitHub Pages)**:
   - 배포된 최신 웹 링크 접속 시 제약 없이 100% 정상 작동합니다.

---

## 📜 향후 개발 & 기능 추가 가이드라인 (Development Rules)

새로운 기능을 추가하거나 기존 코드를 수정할 때 아래 규칙을 반드시 준수해 주세요.

### 1. 모듈별 역할 분담 준수 (Single Responsibility Principle)
- **새 데이터/상태가 필요할 때**: [`state.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/state.js)의 `state` 객체에 속성을 추가하고 조작 함수 작성.
- **테이블/달력 표기/색상/셀 병합 수정 시**: [`render.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/render.js)에서 주간 셀 생성 함수(`create...Td`) 및 월간 달력(`renderMonthlyCalendar`) 수정.
- **새 팝업/모달/바텀시트 제어가 필요할 때**: [`modal.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/modal.js)에 모달 열기/닫기/이벤트 제어 함수 작성.
- **구글 시트 데이터 전송/색상 동기화 항목 변경 시**: [`api.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/api.js)의 API 통신 함수(`syncToGoogleSheets`, `syncColorSettingsToSheets` 등) 수정.
- **UI 이벤트 바인딩 추가 시**: [`app.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/app.js)의 `initEvents()` 내에 추가.

### 2. 전역 상태 관리 패턴 (`state` 객체 사용)
- 변수가 파편화되지 않도록 모든 데이터는 `state` 객체 단일 출처(Single Source of Truth)로 관리합니다.
  ```javascript
  import { state } from './state.js';

  // 상태 변경 예시
  state.currentFilter = 'seoul';
  state.currentView = 'monthly';
  ```
- 상태 변경 후 화면 갱신이 필요한 경우 `renderTable()` 및 `renderMonthlyCalendar()`와 `updateSummaryCounts()`를 호출합니다.

### 3. 모듈 간 참조 & 콜백 패턴
- 순환 참조(Circular Dependency)를 방지하기 위해 상위 레벨 함수(`loadWeekData` 등)는 메인 진입점([`app.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/app.js))에서 `setAuthSuccessCallback`, `setApiLoadWeekDataCallback`, `setModalRenderCallback` 패턴을 사용하여 주입(Dependency Injection)합니다.

### 4. 데이터 저장 및 실시간 동기화
- 사용자가 일정을 수정할 때는 항상 다음 세 단계를 거치도록 작성합니다:
  1. `state` 데이터 또는 `state.colorSettings` 업데이트
  2. `saveLocalStorageData()` 또는 `saveColorSettings()` 호출 (로컬 캐시 저장)
  3. `syncToGoogleSheets()` 또는 `syncColorSettingsToSheets()` 호출 (구글 시트 백엔드 POST 전송)

---

## 🔒 보안 정책 (Security)

- 기본 접속 비밀번호: `140817!` (SHA-256 암호화 검증)
- 10회 연속 실패 시 해당 단말기에서 5분간 접속이 자동 차단됩니다. (`localStorage` 기반 타이머 유지)
