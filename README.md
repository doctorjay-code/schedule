# 📅 스마트 일정 관리 시스템 (Smart Schedule Management)

구글 시트(Google Sheets)와 실시간으로 연동되는 **반응형 웹 기반 스마트 일정 관리 애플리케이션**입니다.  
주차별 일정 조회, 체류 지역/진료/교통/국인체/시간외수당 관리, 다중 선택 일괄 편집, 보안 인증 및 모아보기 기능을 제공합니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: HTML5, Vanilla CSS3 (Modern Glassmorphism Design System), Vanilla JavaScript (ES Modules)
- **Backend Sync**: Google Apps Script (GAS) Web App API Engine
- **Storage**: Browser LocalStorage & Google Sheets Real-time Synchronization

---

## 📂 프로젝트 구조 및 모듈 역할 (Architecture)

프로젝트는 유지보수성과 확장성을 위해 **ES Modules (`import` / `export`)** 기반으로 역할별 분리되어 있습니다:

```text
├── index.html                  # 메인 레이아웃 및 ES Module 진입점 연결
├── style.css                   # 반응형 디자인 시스템 & 테마 스타일
├── state.js                    # 전역 반응형 데이터 상태(state), 카테고리 프리셋, LocalStorage & 요약 계산
├── auth.js                     # 패스워드 SHA-256 인증 & 10회 실패 락아웃 타이머
├── api.js                      # 구글 시트 GET/POST 실시간 연동 & Universal Dual-Format 파서
├── render.js                   # 일정 Grid 테이블 렌더링, TD 셀 생성, 다중 선택 클릭 로직
├── modal.js                    # 일정 상세 편집 바텀시트 & 모아보기 모달 UI
├── app.js                      # 애플리케이션 메인 엔트리 포인트 및 이벤트 리스너 통합
└── google_apps_script_code.gs  # 구글 웹 앱 서비스용 Apps Script 백엔드 코드
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
- **테이블 표기/디스플레이 수정 시**: [`render.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/render.js)에서 관련 셀 생성 함수(`create...Td`) 수정.
- **새 팝업/모달이 필요할 때**: [`modal.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/modal.js)에 모달 열기/닫기/이벤트 제어 함수 작성.
- **구글 시트 데이터 전송 항목 변경 시**: [`api.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/api.js)의 `parseGoogleSheetsRecordsUniversal` 및 `syncToGoogleSheets` 수정.

### 2. 전역 상태 관리 패턴 (`state` 객체 사용)
- 변수가 파편화되지 않도록 모든 데이터는 `state` 객체 단일 출처(Single Source of Truth)로 관리합니다.
  ```javascript
  import { state } from './state.js';
  
  // 상태 변경 예시
  state.currentFilter = 'seoul';
  ```
- 상태 변경 후 화면 갱신이 필요한 경우 `renderTable()`과 `updateSummaryCounts()`를 호출합니다.

### 3. 모듈 간 참조 & 콜백 패턴
- 순환 참조(Circular Dependency)를 방지하기 위해 상위 레벨 함수(`loadWeekData` 등)는 메인 진입점([`app.js`](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/app.js))에서 `setAuthLoadWeekDataCallback` 패턴을 사용하여 주입(Dependency Injection)합니다.

### 4. 데이터 저장 및 실시간 동기화
- 사용자가 일정을 수정할 때는 항상 다음 세 단계를 거치도록 작성합니다:
  1. `state` 데이터 업데이트
  2. `saveLocalStorageData()` 호출 (로컬 캐시 저장)
  3. `syncToGoogleSheets()` 호출 (구글 시트 백엔드 POST 전송)

### 5. UI 이벤트 바인딩 규칙
- 새로운 버튼이나 컨트롤 요소를 [index.html](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/index.html)에 추가한 경우, 이벤트 리스너 등록은 [app.js](file:///c:/Users/hyo02/Downloads/GitHub/Schedule/app.js)의 `initEvents()` 함수 내부에서 일괄 처리합니다.

---

## 🔒 보안 정책 (Security)

- 기본 접속 비밀번호: `140817!` (SHA-256 암호화 검증)
- 10회 연속 실패 시 해당 단말기에서 5분간 접속이 자동 차단됩니다. (`localStorage` 기반 타이머 유지)
