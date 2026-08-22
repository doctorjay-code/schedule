# Schedule 프로젝트 구조 안내

## 1. 문서 목적

이 문서는 **Schedule** 프로젝트의 현재 디렉터리 구조, 기능별 책임, 실행·검증 절차 및 안전한 변경 원칙을 설명합니다. 이 프로젝트는 번들러나 프레임워크 없이 브라우저의 ES Module을 사용하는 정적 HTML·CSS·JavaScript 애플리케이션입니다.

> **핵심 원칙:** 인증은 일정·가계부·모달 기능과 분리합니다. 기능 코드를 수정할 때는 파일 수를 늘리는 것보다, 필요한 코드를 빠르게 찾고 안전하게 수정할 수 있는 책임 경계를 지키는 것이 우선입니다.

## 2. 시작 및 인증 흐름

```text
index.html
  └─ js/bootstrap.js
       ├─ js/auth/auth.js
       │    └─ js/auth/auth-config.js
       └─ 인증 성공 후 js/app.js 로드
            ├─ 일정 기능 초기화
            └─ 가계부 기능 지연 로드
```

`bootstrap.js`는 인증 시작만 담당합니다. 일정·가계부·동기화 모듈 오류가 있어도 인증 UI가 함께 멈추지 않도록, 앱 기능은 인증이 성공한 뒤에만 `app.js`에서 시작합니다.

| 파일 | 책임 | 수정 시 주의사항 |
|---|---|---|
| `index.html` | 전체 화면 마크업과 모듈 시작점 | 시작 스크립트 경로를 임의로 바꾸지 않습니다. |
| `js/bootstrap.js` | 인증 시작 및 인증 후 앱 로드 | 일정·가계부 구현을 직접 넣지 않습니다. |
| `js/auth/auth.js` | 비밀번호·잠금·인증 UI 흐름 | 일정·가계부·동기화 모듈을 가져오지 않습니다. |
| `js/auth/auth-config.js` | 인증 설정 | 평문 비밀번호를 저장하지 않습니다. |
| `js/app.js` | 인증 후 전체 기능 시작 | 인증 검증 로직을 넣지 않습니다. |

## 3. 최상위 구조

```text
Schedule/
├─ index.html                     # 전체 화면 마크업
├─ style.css                      # 일정·가계부·모달 공통 스타일
├─ README.md                      # 사용자·기능 중심 안내
├─ PROJECT_STRUCTURE.md           # 현재 문서
├─ js/                            # 브라우저 JavaScript 모듈
├─ scripts/                       # 점검·진단 보조 스크립트
├─ backup/                        # 프로젝트 내부 보조 백업
└─ .agents/                       # 작업 시 따라야 할 프로젝트 규칙
```

큰 구조 변경 전 생성하는 전체 프로젝트 백업은 프로젝트 폴더의 상위 경로에 보관합니다. 예를 들어 `..\Schedule-backup-before-monthly-view-split`은 월간 화면 분리 직전의 복원 지점입니다.

## 4. JavaScript 전체 구조

```text
js/
├─ bootstrap.js                   # 인증 이후 앱 시작 흐름의 최상위 진입점
├─ app.js                         # 인증된 앱 기능을 시작하는 호환용 진입점
│
├─ auth/
│  ├─ auth.js                     # 잠금 해제·로그인 UI 및 인증 흐름
│  └─ auth-config.js              # 인증 관련 설정
│
├─ data/local/
│  ├─ ledger-seed.local.js        # 가계부 로컬 기본 데이터
│  └─ fundplan-seed.local.js      # 은행·현금 자금계획 로컬 기본 데이터
│
├─ domain/schedule/
│  └─ calendar-rules.js           # 주말·휴일 일정 규칙
│
├─ shared/
│  ├─ safe.js                     # HTML 이스케이프·안전한 색상값 등 공통 유틸
│  └─ sync-ui.js                  # 동기화 상태 UI 보조 함수
│
├─ services/schedule/
│  ├─ state.js                    # 일정 공용 상태, localStorage 및 색상 설정
│  └─ api.js                      # Google Sheets 동기화와 원본 데이터 변환
│
└─ features/
   ├─ schedule/                   # 일정표 기능
   └─ ledger/                     # 가계부 기능
```

`data/local` 파일은 실행 로직이 아닌 기본 데이터입니다. 가계부 기능을 수정할 때는 시드 데이터를 직접 고치기보다, 데이터를 읽고 변환하는 `features/ledger/fundplan.js` 또는 해당 화면 모듈을 먼저 검토합니다.

## 5. 일정 기능 구조

```text
js/features/schedule/
├─ schedule-events.js             # 일정 초기화 및 남은 편집·복사·대량 편집 연결
├─ schedule-view.js               # 주간 데이터 선택, 주간 표 행 배치, 화면 전환 조정
├─ selection.js                   # 다중 선택 상태와 셀·행·하루 선택 처리
├─ cell-renderers.js              # 주간 표 셀 생성, 클릭 처리, 선택 표시, 셀 색상
├─ monthly-view.js                # 월간 달력, 색상 범례, 날짜별 일정 표시
├─ render.js                      # 일정 화면 공개 API를 제공하는 호환용 진입점
├─ schedule-app.js                # 일정 기능 초기화 호환용 진입점
├─ schedule-render.js             # 기존 일정 렌더링 경로 호환용 진입점
├─ schedule-weekly.js             # 기존 주간 API 경로 호환용 진입점
├─ schedule-monthly.js            # 기존 월간 API 경로 호환용 진입점
│
├─ events/
│  ├─ navigation.js               # 주간·월간 전환, 기간 이동, 기능 실행, 수동 동기화
│  └─ modal-filter-events.js      # 모달 닫기 및 필터 칩 이벤트
│
└─ modals/
   ├─ index.js                    # 일정 모달 공개 API 묶음
   ├─ edit.js                     # 일정 입력·수정 모달과 저장
   ├─ summary.js                  # 요약 모달과 맞춤 필터 요약
   ├─ stats.js                    # 통계 기간 선택, 데이터 집계, 통계 화면 출력
   ├─ stats-calculations.js       # 통계 시간·휴가·진료 횟수 계산
   ├─ color-settings.js           # 일정 색상·단어 규칙 설정
   ├─ week-picker.js              # 주 선택 모달
   └─ month-picker.js             # 월 선택 모달
```

### 5.1 일정 모듈 책임 기준

| 책임 | 기본 위치 | 설명 |
|---|---|---|
| 공용 상태·저장 | `services/schedule/state.js` | 여러 일정 화면이 공유하는 데이터와 설정을 관리합니다. |
| 외부 동기화 | `services/schedule/api.js` | Google Sheets 읽기·쓰기와 입력 데이터 해석을 담당합니다. |
| 주간 화면 | `schedule-view.js`, `cell-renderers.js` | 표의 행 배치와 반복 셀 UI를 분리합니다. |
| 월간 화면 | `monthly-view.js` | 월간 달력의 범례·날짜·오전/오후 슬롯을 담당합니다. |
| 선택 상태 | `selection.js` | 다중 편집을 위한 선택 상태와 선택 규칙을 담당합니다. |
| 버튼 이벤트 | `events/` | 화면 이동·필터·모달 닫기처럼 사용자 흐름별 이벤트를 담당합니다. |
| 모달 | `modals/` | 일정 입력, 통계, 요약, 색상 설정, 기간 선택을 담당합니다. |
| 통계 계산 | `modals/stats-calculations.js` | DOM을 직접 다루지 않는 시간·휴가·진료 횟수 계산을 담당합니다. |

`edit.js`, `summary.js`, `stats.js`는 현재 각각의 화면 흐름이 응집되어 있습니다. 단순히 파일이 크다는 이유만으로 추가 분리하지 않고, 새 화면이나 새 계산 규칙이 추가될 때만 해당 책임을 분리합니다.

## 6. 가계부 기능 구조

```text
js/features/ledger/
├─ index.js                       # 가계부 기능 공개 진입점
├─ ledger-app.js                  # 가계부 상태·화면 전환·각 하위 모듈 연결
├─ ledger-utils.js                # 날짜, 금액, 안전한 텍스트 처리 등 공통 함수
├─ card.js                        # 카드 거래 필터 규칙
├─ fundplan.js                    # 은행·현금 시드 데이터를 거래 레코드로 변환
├─ fundplan-view.js               # 은행·현금 자금계획 전체 보기
├─ stats.js                       # 가계부 통계 집계와 통계 목록 출력
├─ transaction-view.js            # 거래 표, 거래 행, 빈 목록 렌더링
├─ ledger-events.js               # 거래 목록 클릭·수정·삭제 이벤트
│
└─ modals/
   ├─ transaction-modal.js        # 거래 추가·수정·삭제 모달
   ├─ color-settings.js           # 가계부 색상·단어 규칙 설정
   └─ average-balance.js           # 평균 잔액 모달
```

가계부는 현재 추가 분리가 급하지 않습니다. `ledger-app.js`에는 전체 상태와 화면 전환처럼 가계부의 중심 흐름을 남기고, 거래 표·입력 모달·통계·색상 설정·자금계획처럼 독립적으로 수정되는 기능만 하위 모듈로 분리했습니다.

## 7. 모듈 연결 흐름

```text
index.html
  └─ js/bootstrap.js
       ├─ js/auth/auth.js
       └─ js/app.js
            ├─ features/schedule/schedule-events.js
            │    ├─ events/
            │    ├─ schedule-view.js
            │    └─ modals/
            └─ features/ledger/index.js   # 가계부 버튼 클릭 시 지연 로드
```

일정은 앱 시작 후 초기화됩니다. 가계부·통계·색상 설정처럼 초기 화면에 항상 필요하지 않은 기능은 필요할 때 지연 로드합니다.

## 8. 안전한 변경 원칙

| 원칙 | 설명 |
|---|---|
| 기능 단위로 분리 | 함께 수정되지 않는 책임만 별도 파일로 분리합니다. |
| 상태는 한곳에서 관리 | 화면 간 공유 상태를 여러 UI 파일에 복제하지 않습니다. |
| 공개 함수명 유지 | 파일 이동 시 export 이름은 가급적 유지하고 import 경로만 바꿉니다. |
| 호환용 파일 보존 | `app.js`, `render.js`, `schedule-render.js` 같은 진입 파일은 기존 연결 호환성을 위해 가볍게 유지합니다. |
| 한 단계씩 검증 | 파일 이동·분리 후에는 즉시 import, 구문, 주요 버튼 동작을 확인합니다. |
| 데이터와 로직 분리 | 시드 데이터 파일에는 UI나 동기화 로직을 추가하지 않습니다. |

새 모듈을 만들기 전에는 다음을 확인합니다.

1. 이 코드가 다른 이유로 수정되는가?
2. 이 코드가 DOM 화면 출력 없이 계산·변환만 수행하는가?
3. 이 기능이 커졌을 때 별도로 테스트하거나 교체할 가능성이 있는가?

세 질문 중 하나라도 명확하지 않으면 기존 기능 모듈 안에 두는 편이 낫습니다.

## 9. 로컬 실행

프로젝트 폴더에서 아래 명령으로 정적 웹 서버를 실행합니다.

```powershell
Set-Location 'C:\Users\hyo02\Downloads\GitHub\Schedule'
py -3 -m http.server 8080 --bind 127.0.0.1
```

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:8080/
```

서버가 이미 실행 중이면 새 서버를 중복 실행하지 않고 기존 `localhost:8080`을 사용합니다.

## 10. 변경 후 점검 순서

```powershell
# 모든 JavaScript 모듈의 구문 확인
Get-ChildItem .\js -Recurse -File -Filter *.js | ForEach-Object {
  node --check $_.FullName
}

# 프로젝트 보조 점검 스크립트 실행
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-core.ps1
```

그다음 브라우저에서 `Ctrl + F5`로 새로고침하고 아래 흐름을 수동 확인합니다.

| 기능 | 최소 확인 항목 |
|---|---|
| 인증 | 잠금 해제 후 일정 화면 진입 |
| 일정 | 주간·월간 전환, 이전·다음 이동, 일정 편집 |
| 일정 모달 | 통계, 요약, 색상 설정, 주·월 선택 |
| 가계부 | 가계부 열기, 카드·은행·현금 전환, 거래 추가·수정·삭제 |
| 동기화 | 수동 동기화 버튼과 화면 상태 표시 |

## 11. 백업 및 복구 원칙

큰 구조 변경 전에는 프로젝트 전체를 상위 폴더에 복사합니다.

```powershell
Copy-Item -LiteralPath . -Destination ..\Schedule-backup-before-<작업이름> -Recurse -Force
```

문제가 생기면 전체 프로젝트를 무조건 되돌리기보다, 먼저 해당 작업에서 변경한 파일만 백업본에서 복원하고 import·구문·브라우저 동작을 다시 확인합니다. 이 방식은 최근 변경을 불필요하게 잃지 않으면서도 안전하게 복구할 수 있습니다.

## 12. 다음 구조 개선은 언제 하는가

현재는 추가 분리가 급하지 않습니다. 아래 변화가 생길 때만 해당 영역을 다시 검토합니다.

| 변화 | 검토할 위치 |
|---|---|
| 새로운 일정 화면 또는 달력 표시 방식 추가 | `features/schedule/` 하위 화면 모듈 |
| 복사·대량 편집 기능이 더 복잡해짐 | `schedule-events.js`에서 전용 이벤트 모듈 분리 |
| 새로운 통계 종류·계산식 추가 | `modals/stats-calculations.js` 또는 새 통계 계산 모듈 |
| 새로운 가계부 보고서·차트 추가 | `features/ledger/stats.js` 또는 전용 보고서 모듈 |
| 새 저장소·외부 동기화 채널 추가 | `services/schedule/api.js`에서 변환·전송 책임 분리 |

> 프로젝트 구조의 목표는 파일 수를 늘리는 것이 아니라, 필요한 코드를 빠르게 찾고 안전하게 고칠 수 있게 만드는 것입니다.
