# 🚀 버전 관리 및 캐시 버스팅 규칙 (Version & Cache-Busting Rules)

이 프로젝트(Schedule & Ledger)는 순수 바닐라 JavaScript/HTML/CSS 기반 웹 애플리케이션으로, 브라우저 캐시로 인한 구버전 코드 실행 문제를 방지하기 위해 **수동 버전 쿼리(Cache-Busting)** 방식을 사용합니다.

모든 AI 에이전트는 코드(JS, CSS, HTML)를 수정하거나 배포/커밋할 때 **반드시 아래 버전 갱신 규칙을 준수**해야 합니다.

---

## 1. 버전 갱신 대상 파일 및 위치

### ① 자바스크립트(JS) 모듈 버전
* **파일**: `js/version.js`
* **수정 위치**: `APP_BUILD_TIME` 변수
* **규칙**: 현재 날짜와 시간(포맷: `YYYYMMDD_HHmm`, 예: `'20260828_1815'`)으로 갱신
```javascript
// js/version.js
export const APP_BUILD_TIME = '20260828_1815';
```
> 이 값이 갱신되면 `getVersionedUrl()`을 통해 동적으로 불러오는 모든 하위 ES Module(`import(...)`)에 최신 버전 쿼리가 붙어 브라우저가 최신 JS를 로드합니다.

### ② 스타일시트(CSS) 버전
* **파일**: `index.html` (상단 `<head>` 내부)
* **수정 위치**: `<link rel="stylesheet" href="style.css?v=...">` 태그
* **규칙**: CSS 수정이 있거나 전체 배포 시 `?v=` 뒤의 값을 동일하게 최신 타임스탬프로 갱신
```html
<link rel="stylesheet" href="style.css?v=20260828_1815">
```

---

## 2. 작업 및 배포 절차 (AI 행동 지침)

1. **기능 수정 및 스타일 작업 완료**
2. **버전 갱신**: `js/version.js`의 `APP_BUILD_TIME` 및 `index.html`의 `style.css?v=`를 현재 시간으로 업데이트
3. **Git 커밋 & 푸시**: 변경 사항 커밋 후 `main` 브랜치에 푸시
