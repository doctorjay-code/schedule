# 🛡️ 자동 무결성 검증 규칙 (Automated Integrity Verification Rules)

이 프로젝트(Schedule & Ledger)의 안정성을 보장하기 위해, 모든 AI 에이전트는 코드 수정 후 커밋/푸시 전에 **반드시 아래 자동 검증 엔진을 실행**해야 합니다.

---

## 1. 필수 실행 명령어

```bash
node scripts/verify-integrity.cjs
```

---

## 2. 자동 검증 엔진이 검사하는 9대 핵심 불변식

1. **JS 구문 및 문법 무결성 (`node --check`)**:
   - 49개 모든 모듈의 문법 오류 0건 검증.
2. **정적 & 동적 `import` 404 경로 전수 검사 (No Legacy Adapter Invariant)**:
   - `import ... from '...'` 및 동적 `import('...')` 경로가 실제 물리적 파일로 존재하는지 1:1 대조.
   - 레거시 징검다리 어댑터 우회 참조 0건 강제.
3. **`Named Export/Import` 심볼 100% 일치 검사 (Undefined Function Detection)**:
   - 모든 import 심볼이 대상 모듈의 실제 export 심볼과 1:1로 일치하는지 전수 대조.
4. **DOM ID 1:1 일치성 검사**:
   - JS에서 `document.getElementById`로 호출하는 194개 모든 ID가 `index.html` 또는 템플릿에 존재하는지 전수 검증.
5. **핵심 비즈니스 계산 및 가계부 6대 회계 불변식 단위 테스트**:
   - 시간외 수당, 교통비, 통계 계산 정합성 검증.
   - 가계부 6대 본질 회계 등식 및 기업카드 결제행 vs 세부거래 1원 단위 크로스 대조 100% 일치.
6. **앱 전체 8대 모달 라이프사이클 및 풀-인터랙션 E2E 검증**:
   - 모달 열기 ➡️ 내부 폼/버튼/색상칩 조작 ➡️ DB 저장/삭제 ➡️ 리렌더링 ➡️ 모달 닫기 전수 검증.
7. **N × N 전수 뷰포트 상태 전이 매트릭스 및 포스트 액션 DOM 리렌더링 불변식**:
   - 일정 주간/월간 ↔ 가계부 전체/월간 ↔ 5대 시트 왕복 전환 시 화면 및 내용물 100% 생존성 검증.
   - 저장/수정/삭제/상계/색상변경 후 DOM 실시간 리렌더링 강제 검증.
8. **Zero-Hardcoding 92개 모든 버튼/필터 칩 전수 자동 크롤링 & 가상 클릭 검증**:
   - 16ms(60FPS) 초고속 탭 전환 벤치마크 통과.
9. **버전 및 캐시 버스팅 1:1 일치성 검사 (Rule 1)**:
   - `js/version.js`의 `APP_BUILD_TIME`과 `index.html`의 `style.css?v=` 타임스탬프가 100% 일치하는지 자동 검증.

---

## 3. 배포 차단 조건 (Gatekeeper)

- `scripts/verify-integrity.cjs` 실행 결과 `Failed Checks: 0` (648개+ 전수 100% Pass)이 아닐 경우:
  - ❌ **절대 Git Commit 및 GitHub Push 금지**
  - 오류가 출력된 파일 및 줄 번호를 즉시 수정한 후 재검사를 통과해야만 배포 진행.
