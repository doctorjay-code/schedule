# 🛡️ 자동 무결성 검증 규칙 (Automated Integrity Verification Rules)

이 프로젝트(Schedule & Ledger)의 안정성을 보장하기 위해, 모든 AI 에이전트는 코드 수정 후 커밋/푸시 전에 **반드시 아래 자동 검증 엔진을 실행**해야 합니다.

---

## 1. 필수 실행 명령어

```bash
node scripts/verify-integrity.cjs
```

---

## 2. 자동 검증 엔진이 검사하는 4대 항목

1. **JS 구문 및 문법 무결성 (`node --check`)**:
   - 51개 모든 모듈의 문법 오류 0건 검증.
2. **정적 & 동적 `import` 404 경로 전수 검사**:
   - `import ... from '...'` 및 동적 `import('...')` 경로가 실제 물리적 파일로 존재하는지 1:1 대조 (HTML Base URL 기준 정합성 포함).
3. **DOM ID 1:1 일치성 검사**:
   - JS에서 `document.getElementById`로 호출하는 158개 모든 ID가 `index.html` 또는 템플릿에 존재하는지 전수 검증.
4. **핵심 비즈니스 계산 단위 테스트**:
   - 시간외 수당, 교통비, 통계 계산 정합성 검증.

---

## 3. 배포 차단 조건 (Gatekeeper)

- `scripts/verify-integrity.cjs` 실행 결과 `Failed Checks: 0` (100% Pass)이 아닐 경우:
  - ❌ **절대 Git Commit 및 GitHub Push 금지**
  - 오류가 출력된 파일 및 줄 번호를 즉시 수정한 후 재검사를 통과해야만 배포 진행.
