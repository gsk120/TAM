# error_v5.md - 교통비 등 카테고리 고정비/실소비 그룹 변경 미반영 상세 원인 분석 보고서

## 1. 개요
'교통' 카테고리를 기존 실소비 그룹(`isFixed: false`)에서 **고정비 그룹(`isFixed: true`)**으로 변경하고 `[수정 완료]` 버튼을 눌렀음에도 불구하고, 화면 표의 배지 및 대시보드 5번/6번 KPI 요약 카드로 지출 그룹이 변경되지 않고 기존 실소비 그룹으로 유지되는 현상에 대한 원인 분석 보고서입니다.

---

## 2. 상세 원인 분석 (Technical Breakdown)

### ① DB 저장/파싱 과정의 `isFixed` 데이터 타입 불일치 (Strict Equality Failure)
- SQLite 백엔드 DB (`settings` 테이블) 또는 LocalStorage에 JSON 형태로 카테고리 데이터를 동기화/복원할 때, `isFixed` 값이 순수 불리언(`true`/`false`)이 아닌 **문자열(`"true"`/`"false"`)** 또는 **숫자(`1`/`0`)**로 직렬화되어 저장되는 경우가 발생함.
- `BudgetView.jsx` 및 `Dashboard.jsx`에서 `cat.isFixed ? '🔒 고정비' : '🛒 실소비'` 또는 `c.isFixed === true` 조건으로 엄격한 동등성 비교(`===`)를 수행하여, DB에서 복원된 `"true"` 또는 `1` 값이 `true`로 인정받지 못하고 실소비 그룹(`false`)으로 오처리됨.

### ② `updateCategory` 내부의 대상 카테고리 탐지 조건 불완전 (`AppContext.jsx`)
- `updateCategory(id, { name, defaultBudget, isFixed })` 실행 시:
  ```javascript
  const targetIndex = db.categories.findIndex(c => (id && c.id === id) || c.name === trimmedName);
  ```
- 카테고리 명칭(`'교통'`)을 변경하지 않고 `isFixed` 그룹만 변경할 경우, `targetId` 및 `oldName`이 기존 매핑 조건과 어긋나거나 `prev.categories.map` 순회 조건인 `(c.id === targetId || c.name === oldName)`에서 식별자 일치 실패로 인해 기존 객체가 수정되지 않고 원본 그대로 리턴되는 취약점 존재.

### ③ 폼 상태(`catForm`) 불리언 캐스팅 누락 및 렌더링 동기화 딜레이 (`BudgetView.jsx`)
- 카테고리 수정 모달이 열릴 때 `setCatForm({ isFixed: Boolean(cat.isFixed) })` 형태로 명확한 불리언 변환 없이 원본 데이터가 전달되어, 고정비 토글 버튼 클릭 시 `catForm.isFixed`가 `Boolean` 타입으로 확실하게 갱신되지 못함.
- 수정 완료 후 `setDb`로 전역 상태가 업데이트되더라도 `BudgetView` 표 렌더링에 사용되는 `db.categories` 배열 내 `isFixed` 값이 렌더링 트리에 즉시 불리언으로 전달되지 않아 UI 갱신이 누락됨.

---

## 3. 해결을 위한 구현 계획 (Proposed Fix Plan)

### 1. `src/utils/finance.js` & `src/context/AppContext.jsx` 불리언 타입 정제
- 카테고리 객체 처리 시 `isFixed` 값을 항상 불리언으로 강제 캐스팅:
  ```javascript
  isFixed: String(cat.isFixed) === 'true' || cat.isFixed === true || cat.isFixed === 1
  ```
- `updateCategory`에서 식별자(`id`) 또는 명칭(`name`) 기반 대상 카테고리를 정확히 찾아 해당 카테고리의 `isFixed` 불리언 속성을 확실히 업데이트.

### 2. `src/components/BudgetView.jsx` 고정비/실소비 토글 및 표 렌더링 강화
- 토글 버튼 클릭 시 `Boolean(true)` / `Boolean(false)`로 명시적 상태 저장.
- 표의 배지 렌더링 시에도 타입 안전 판별식(`(c.isFixed === true || String(c.isFixed) === 'true')`)을 적용하여 고정비 배지(`🔒 고정비 그룹`)가 선명히 표출되도록 조치.

### 3. `src/components/Dashboard.jsx` 대시보드 5번/6번 KPI 카드 합산 수식 보완
- 고정비 합산 수식 필터를 `c.isFixed === true || String(c.isFixed) === 'true'`로 보완하여 교통비 등 그룹 변경 건이 대시보드 5번(고정비 요약)으로 100% 즉시 합산되도록 처리.
