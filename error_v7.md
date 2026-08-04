# error_v7.md - "저장 중 예외가 발생했습니다: updateCategory is not a function" 팝업 오류 원인 분석 보고서

## 1. 발생 증상
월별 예산 화면에서 카테고리(예: '교통', '세금')의 [✏️ 수정] 버튼을 클릭 후 고정비/실소비 그룹을 변경하고 `[수정 완료]` 버튼을 클릭할 때 다음과 같은 브라우저 경고 팝업이 출력되며 저장이 되지 않음:
> `저장 중 예외가 발생했습니다: updateCategory is not a function`

---

## 2. 근본 원인 분석 (Root Cause Analysis)

### `AppContext.jsx` 내 `<AppContext.Provider value={{ ... }}>` 함수 바인딩 누락 (Direct Root Cause)
- `AppContext.jsx` 파일 내부에서 `addCategory`, `updateCategory`, `deleteCategory` 세 가지 함수가 정의되어 있었으나, React Context의 전역 공급자 객체인 **`<AppContext.Provider value={{ ... }}>` 전달 목록에 해당 함수들이 누락**되어 있었음.
- 이로 인해 `BudgetView.jsx` 컴포넌트에서 `const { updateCategory } = useApp()` 구문을 호출할 때 `updateCategory` 변수에 `undefined` 값이 할당됨.
- `[수정 완료]` 버튼을 클릭하여 `updateCategory(...)` 함수를 호출하는 순간 자바스크립트 엔진이 `updateCategory is not a function` TypeError 예외를 발생시키고 예외 핸들러에 포획되어 팝업이 출력되었던 것임.

---

## 3. 해결 구현 계획 (Fix Plan)

### 1. `src/context/AppContext.jsx` Provider value 객체에 함수 명시적 바인딩
- `<AppContext.Provider value={{ ... }}>` 공급자 전달 객체에 `addCategory`, `updateCategory`, `deleteCategory` 함수를 포함시켜 전역에서 사용할 수 있도록 조치:
  ```javascript
  return (
    <AppContext.Provider
      value={{
        db,
        ...
        importFullDatabase,
        addCategory,
        updateCategory,
        deleteCategory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
  ```

### 2. 기능 정상 동작 확인
- `updateCategory`가 정상 함수 객체로 전달되어 '교통', '세금' 카테고리의 고정비/실소비 그룹 변경 시 팝업 안내 메시지와 함께 모달이 정상적으로 닫히고 대시보드 및 표에 즉시 반영됨.
