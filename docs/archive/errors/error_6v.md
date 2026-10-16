# error_6v.md - 월별예산 카테고리 수정 모달 '고정비/실소비'만 변경 후 [수정 완료] 클릭 시 무반응(모달 미닫힘 및 팝업 부재) 원인 분석 보고서

## 1. 문제 증상 재정의
월별 예산 화면에서 카테고리(예: '교통')의 [✏️ 수정] 버튼을 눌러 모달을 띄운 후, 카테고리 이름이나 금액은 수정하지 않고 **'고정비/실소비' 그룹만 변경한 채 `[수정 완료]` 버튼을 클릭**할 경우:
- 알림 팝업 메시지("수정되었습니다")가 전혀 나타나지 않음.
- 모달 창이 닫히지 않고 그대로 열려있음.
- 아무런 기능적/시각적 반응이 발생하지 않음.

---

## 2. 근본 원인 분석 (Root Cause Analysis)

### ① `handleCategorySubmit` 이벤트 객체(`e`) 처리 예외로 인한 자바스크립트 실행 중단 (Primary Cause)
- `BudgetView.jsx`의 `handleCategorySubmit(e)` 최상단에서 `e.preventDefault()`가 호출됨.
- `[수정 완료]` 버튼을 `type="button"`으로 지정하고 `onClick={handleCategorySubmit}`을 직접 바인딩하였을 때, 브라우저/React의 합성 이벤트(SyntheticEvent) 전달 구조상 `e` 객체 조작 시 자바스크립트 런타임 예외(`Uncaught TypeError: Cannot read properties of undefined`)가 발생함.
- 자바스크립트 예외가 발생하면 그 시점에서 **코드 실행이 즉시 중단**되므로, 하단의 `updateCategory` 호출, `alert()` 팝업 표출, 그리고 `setIsCategoryModalOpen(false)` (모달 닫기) 코드까지 도달하지 못하고 아무런 반응 없이 모달이 열린 채 멈추게 됨.

### ② `updateCategory` 함수 내 예외 포획(Try-Catch) 부재
- `AppContext.jsx`의 `updateCategory` 함수 내부에 `try-catch` 예외 포획 구문이 구현되어 있지 않아, 만약 `db.categories` 탐색 과정이나 `setDb` 전역 상태 업데이트 도중 미세한 참조 에러가 발생할 경우 이를 안전하게 처리하지 못하고 상위 컴포넌트로 예외를 던져 모달 닫기 흐름이 차단됨.

### ③ 이름/금액 미변경 시 (`oldName === trimmedName`) 리턴 상태 검증 부족
- 이름과 금액을 변경하지 않고 `isFixed` (고정비/실소비) 그룹만 변경하는 경우, `oldName === trimmedName` 조건으로 인해 데이터베이스 키 갱신 구문이 스킵됨.
- 이 과정에서 `updateCategory` 함수가 정상 종료되더라도, 예외 핸들러가 없으면 모달 닫기(`setIsCategoryModalOpen(false)`) 구문이 호출되지 않는 구조적 허점이 존재함.

---

## 3. 해결 대책 및 구현 계획 (Fix Plan)

### 1. `BudgetView.jsx` 이벤트 방어 코드 및 예외 처리(Try-Catch) 적용
- `handleCategorySubmit` 함수 상단에 이벤트 객체 안전 검사 적용:
  ```javascript
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  ```
- 전체 제출 과정을 `try { ... } catch (err) { ... }` 구문으로 감싸 예외가 발생하더라도 사용자에게 안내 알림을 띄우고 모달을 닫도록 방어.

### 2. `AppContext.jsx` `updateCategory` 구조적 예외 포획 및 확실한 결과 반환
- `updateCategory` 함수 내부 전체를 `try-catch` 구문으로 포획하여 정상 완료 시 `{ success: true }`, 에러 발생 시 `{ success: false, message: err.message }`를 명확하게 반환하도록 개편.

### 3. 모달 닫기 순서 보장 및 폼 이벤트 분리
- `[수정 완료]` 버튼 클릭 시 폼 제출 이벤트와 독립적으로 `updateCategory` -> `alert()` -> `setIsCategoryModalOpen(false)`가 순차적으로 100% 실행되도록 보장.
