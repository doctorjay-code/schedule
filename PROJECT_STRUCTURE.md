# Schedule 프로젝트 구조 안내

## 1. 문서 목적

이 문서는 **Schedule** 프로젝트의 현재 디렉터리 구조, 기능별 책임, Google Apps Script 백엔드 연동, 실행·검증 절차 및 안전한 변경 원칙을 설명합니다. 이 프로젝트는 번들러나 무거운 프레임워크 없이 브라우저의 순수 ES Module을 사용하는 정적 HTML·CSS·JavaScript 웹 애플리케이션과 Google Apps Script 클라우드 백엔드로 구성되어 있습니다.

> **핵심 원칙:** 
> 1. 보안 인증은 일정·가계부·모달 비즈니스 로직과 철저히 격리합니다.
> 2. 가계부 백엔드는 클라이언트의 유연성을 지원하는 Fail-Safe 저장소 원칙을 따릅니다.
> 3. 기능 코드를 수정할 때는 불필요한 파일 수 증가보다 명확한 책임 경계와 안전한 검증을 우선합니다.

---

## 2. 시작 및 인증 흐름

```text
index.html
  └─ js/bootstrap.js?v=...
       ├─ js/auth/auth.js
       │    └─ js/auth/auth-config.js
       └─ [인증 성공 시] js/app.js 로드
            ├─ js/features/schedule/ (일정 기능 초기화)
            └─ js/features/ledger/   (가계부 탭 전환 시 지연 로드)
```

`bootstrap.js`는 인증 진입점 역할만 수행합니다. 비즈니스 모듈(일정/가계부/동기화)에 오류가 발생하더라도 잠금 해제 화면이 멈추지 않도록 설계되었습니다.

| 파일 | 책임 | 수정 시 주의사항 |
|---|---|---|
| `index.html` | 전체 화면 UI 마크업 및 모듈 진입점 | 중복 ID 방지 및 모듈 캐시 버스터(`?v=...`) 유지 |
| `js/bootstrap.js` | 인증 초기화 및 인증 성공 후 `app.js` 동적 로드 | 비즈니스 로직을 직접 포함하지 않음 |
| `js/auth/auth.js` | 비밀번호 검증, 잠금 타이머, 인증 상태 관리 | 일정·가계부 모듈을 직접 import하지 않음 |
| `js/auth/auth-config.js` | 인증 해시 및 보안 설정 | 평문 비밀번호를 저장하지 않음 |
| `js/app.js` | 인증 완료 후 애플리케이션 초기화 | 인증 검증 코드를 포함하지 않음 |

---

## 3. 최상위 디렉터리 구조

```text
Schedule/
├─ index.html                     # 웹 전체 화면 마크업
├─ style.css                      # 일정·가계부·모달 통합 스타일 (COMMON_FIXED_APP_FRAME)
├─ README.md                      # 사용자 및 기능 안내
├─ PROJECT_STRUCTURE.md           # 프로젝트 구조 및 아키텍처 가이드 (본 문서)
├─ LEDGER_WEB_ROADMAP.md          # 가계부 개발 로드맵 및 백엔드 프로토콜
├─ .clasp.json                    # Google Apps Script CLI 배포 설정
├─ js/                            # 브라우저 JavaScript ES 모듈
├─ apps-script/                   # 구글 시트 Apps Script 원본 소스 (UTF-8)
├─ apps-script-ascii/             # 웹 에디터 복사용 ASCII 이스케이프 소스
├─ scripts/                       # 무결성 검증, 인코딩 가드 및 단위 테스트
├─ .agents/                       # 개발 에이전트 전용 규칙 및 가이드
└─ apple-touch-icon.png           # 웹앱 아이콘
```

---

## 4. 프론트엔드 JavaScript 모듈 구조 (`js/`)

```text
js/
├─ bootstrap.js                   # 인증 후 동적 로딩 진입점
├─ app.js                         # 애플리케이션 시작 브릿지
│
├─ auth/                          # 🔒 보안 및 인증
│  ├─ auth.js                     # 잠금 해제 및 세션 관리
│  └─ auth-config.js              # 인증 해시 설정
│
├─ domain/schedule/               # 📅 일정 비즈니스 규칙
│  └─ calendar-rules.js           # 주말, 공휴일, 진료 규칙
│
├─ shared/                        # 🛠️ 공통 유틸리티
│  ├─ safe.js                     # HTML 이스케이프 및 안전한 데이터 처리
│  ├─ modal-form.js               # 바텀시트 모달 열기/닫기 및 옵션 그룹 바인딩
│  └─ sync-ui.js                  # 동기화 상태 뱃지 메시지 관리
│
├─ services/                      # 🌐 외부 API 및 상태 관리
│  ├─ schedule/
│  │  ├─ state.js                 # 일정 전역 상태, 색상 설정, 로컬 스토리지
│  │  └─ api.js                   # 일정 구글 시트 동기화 API
│  └─ ledger/
│     └─ ledger-api.js            # 가계부 구글 시트 Web App API 통신 및 데이터 매핑
│
└─ features/                      # 🎨 화면 및 UI 기능
   ├─ schedule/                   # 일정표 기능군
   │  ├─ schedule-app.js          # 일정 초기화 진입점
   │  ├─ schedule-events.js       # 일정 이벤트 바인딩 및 가계부 지연 로드
   │  ├─ schedule-view.js         # 주간 화면 렌더링
   │  ├─ monthly-view.js          # 월간 달력 렌더링
   │  ├─ selection.js             # 다중 선택 및 셀렉션 관리
   │  ├─ cell-renderers.js        # 표 셀 생성 및 색상 적용
   │  ├─ render.js                # 화면 렌더링 호환 계층
   │  ├─ events/                  # 네비게이션, 모달 이벤트
   │  └─ modals/                  # 일정 편집, 통계, 요약, 색상 설정 모달
   │
   └─ ledger/                     # 가계부 기능군
      ├─ index.js                 # 가계부 공개 진입점
      ├─ ledger-app.js            # 가계부 상태, 탭 전환, 실시간 CRUD 조율
      ├─ ledger-utils.js          # 날짜/통화 포맷팅, 태그 색상 유틸
      ├─ card.js                  # 카드/통장 내역 필터링
      ├─ fundplan.js              # 은행·현금 데이터 레코드 정규화
      ├─ fundplan-view.js         # 은행·현금 자금계획 전체보기 렌더링
      ├─ stats.js                 # 수입/지출 통계 집계 및 리포트 렌더링
      ├─ transaction-view.js      # 거래 내역 표 및 행 렌더링 (클릭 이벤트 포함)
      ├─ ledger-events.js         # 거래 목록 클릭 액션 바인딩
      └─ modals/
         ├─ transaction-modal.js  # 거래 추가/수정/삭제 모달 (기업카드, 토스, 현금, 기업은행 지원)
         ├─ color-settings.js     # 태그 및 단어 색상 설정 모달
         └─ average-balance.js    # 평균 잔액 모달
```

---

## 5. 백엔드 구조 (`apps-script/`)

Google Apps Script 기반의 서버리스 백엔드로, 클라이언트의 변경에 유연하게 대응하는 **Fail-Safe Universal Router** 구조를 갖추고 있습니다.

```text
apps-script/
├─ appsscript.json                # Apps Script 프로젝트 설정 매니페스트 (V8 런타임)
├─ Code.gs                        # Web App 요청 진입점 (`doGet`, `doPost`)
├─ LedgerApi.gs                   # 가계부 범용 CRUD 핸들러 및 자가 치유 ID 생성
├─ LedgerConfig.gs                # 스프레드시트 ID 및 동적 시트 해석 설정
├─ Utils.gs                       # 데이터 파서, 날짜 포맷터, 유연한 ID 검증기
├─ BalanceSync.gs                 # 잔액전망 시트 동기화 및 락(Lock) 제어
├─ Triggers.gs                    # 스프레드시트 트리거 설치 유틸
└─ README.md                      # Apps Script 배포 및 설정 가이드
```

### 5.1 백엔드 핵심 원칙
1. **자가 치유 ID (Self-Healing ID)**: 새 행 추가 시 시트 내 수식 지연이 발생하더라도 에러를 던지지 않고 날짜 기반 대체 ID를 즉시 생성하여 저장을 100% 보장합니다.
2. **시트 동적 수용**: `기업카드`, `토스은행`, `현금`, `기업은행` 등 어떤 시트든 안전하게 기록 및 조회합니다.
3. **오류 격리**: 잔액전망 자동 동기화 과정에서 지연이나 경고가 발생해도 원본 가계부 데이터 저장은 결코 실패하지 않도록 보호합니다.

---

## 6. 빌드 및 배포 도구

### 6.1 `clasp` (Google Apps Script CLI)
프로젝트 루트의 `.clasp.json`을 통해 로컬 `apps-script/` 코드를 Google Cloud의 Apps Script 프로젝트와 직접 동기화합니다.

```powershell
# Apps Script 상태 확인
npx @google/clasp status

# 로컬 코드를 Google Apps Script로 업로드
npx @google/clasp push -f

# 새 버전 배포
npx @google/clasp deploy --description "배포 설명"
```

### 6.2 검증 스크립트 (`scripts/`)
* **`scripts/check-encoding.ps1`**: 전체 프로젝트 58개 파일의 UTF-8 인코딩 및 BOM 무결성 검증
* **`scripts/test-stats-calculations.cjs`**: 시간외 수당, 휴가 일수, 진료 횟수 등 통계 계산식 단위 테스트

```powershell
# 인코딩 무결성 검증
powershell -ExecutionPolicy Bypass -File .\scripts\check-encoding.ps1

# 통계 계산 단위 테스트
node .\scripts\test-stats-calculations.cjs
```

---

## 7. 로컬 개발 및 실행

정적 웹 서버를 실행하여 브라우저에서 테스트합니다.

```powershell
# Python 정적 서버 실행
py -3 -m http.server 8080 --bind 127.0.0.1
```

접속 주소: `http://localhost:8080/`

