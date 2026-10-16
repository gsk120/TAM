# 월별 예산 8월 수정 시 9월 이후 미반영 오류 분석 문서 (`error_v2.md`)

이 문서는 **가족 가계부 및 자산관리 프로그램**의 **월별예산(BudgetView)** 탭에서 8월달 '대출' 카테고리 예산을 300만 원에서 310만 원으로 수정한 뒤 [적용] 버튼을 눌렀을 때, **8월 예산은 정상 변경되었으나 9월 이후 예산이 300만 원으로 유지되던 원인 분석 및 추후 수정 방안**을 정리한 사양서입니다.

> [!NOTE]
> **사용자 요청 사항**: 본 문서는 오류 원인 분석 및 기술적 해결 방안 작성 전용이며, **실제 소스 코드 구현 및 수정 작업은 대기(지연)**합니다.

---

## 1. 현상 및 문제점 요약

1. **상황**:
   - `selectedMonth`가 `2026-08`(8월)인 상태에서 '대출' 카테고리 예산 금액을 300만 원 ➔ 310만 원으로 수정 후 **[적용]** 버튼 클릭.
2. **결과**:
   - 8월(`2026-08`) 화면: 대출 예산 **310만 원** 정상 반영.
   - 9월(`2026-09`) 및 10월 이후 화면: 대출 예산이 **300만 원**(기존 설정값)으로 그대로 유지됨.
3. **UI 가이드와의 불일치**:
   - UI 상단 안내 문구: `8월 및 미래 모든 월에 예산 설정이 '적용'되었습니다!`
   - 실제 동작: 8월 단일 월에만 데이터가 저장되고, 9월 이후의 미래 월에는 변경사항이 전달(Forward Propagation)되지 않음.

---

## 2. 소스 코드 기준 핵심 원인 분석

### 2.1 `src/context/AppContext.jsx` - `setAllCategoryBudgets` 의 단일 월 업데이트 구조
```javascript
// src/context/AppContext.jsx (Line 326 ~ 337)
const setAllCategoryBudgets = (budgetsMap) => {
  setDb(prev => ({
    ...prev,
    monthlyBudgets: {
      ...prev.monthlyBudgets,
      [selectedMonth]: {
        ...(prev.monthlyBudgets[selectedMonth] || {}),
        ...budgetsMap,
      },
    },
  }));
};
```
- **원인 1**: [적용] 버튼 클릭 시 호출되는 `setAllCategoryBudgets` 함수는 현재 선택된 `selectedMonth` (`2026-08`) 단 하나의 키에만 수정된 예산 객체를 기록합니다.
- `db.monthlyBudgets` 객체 내부에서 `2026-09`, `2026-10` 등 미래 월에 해당하는 키를 함께 갱신하거나, 미래 월의 기존 기록을 업데이트해주는 로직이 존재하지 않습니다.

---

### 2.2 `src/context/AppContext.jsx` - `getEffectiveCategoryBudgets` 상속 및 은폐(Shadowing) 현상
```javascript
// src/context/AppContext.jsx (Line 110 ~ 146)
const getEffectiveCategoryBudgets = useCallback((targetMonth) => {
  const scenario = BUDGET_SCENARIOS[activeScenario] || BUDGET_SCENARIOS.basic;
  const result = {};

  // db.monthlyBudgets 중 targetMonth 이하(<= targetMonth)인 월들을 오름차순 정렬
  const recordedMonths = Object.keys(db.monthlyBudgets || {})
    .filter(m => m <= targetMonth)
    .sort();

  db.categories.forEach(cat => {
    // 가장 최근에 수정된 월의 예산 설정값 검색 (최신순 탐색)
    let customVal = undefined;
    for (let i = recordedMonths.length - 1; i >= 0; i--) {
      const mKey = recordedMonths[i];
      if (db.monthlyBudgets[mKey] && db.monthlyBudgets[mKey][cat.name] !== undefined) {
        customVal = db.monthlyBudgets[mKey][cat.name];
        break;
      }
    }
    // ...
  });
  return result;
}, [db.categories, db.monthlyBudgets, db.customBudgetPresets, activeScenario]);
```
- **원인 2 (미래 월의 기존 고정 레코드에 의한 상속 차단)**:
  - 만약 사용자가 이전에 9월(`2026-09`)을 선택하여 조회했거나, 9월 상태에서 시나리오/예산을 저장한 적이 있다면 `db.monthlyBudgets['2026-09']` 객체가 이미 생성되어 기존 예산값(`대출: 300만 원`)이 고정 기록되어 있습니다.
  - 9월의 유효 예산을 계산할 때 `recordedMonths`는 `['2026-08', '2026-09']`가 되며, 배열의 역순(최신순: index 1부터)으로 탐색을 진행합니다.
  - 이 때문에 `2026-09` 레코드의 기존 값 `300만 원`을 먼저 발견하여 즉시 루프를 종료(`break`)합니다.
  - 결과적으로 이전 월인 8월(`2026-08`)에 새롭게 반영된 `310만 원` 변경사항이 9월의 기존 레코드에 가려져(Shadowing) 9월 이후로 상속/전파되지 못하고 300만 원이 유지됩니다.

---

### 2.3 `applyBudgetPreset` 및 시나리오 적용 시 미래 월 레코드 고정 문제
```javascript
// src/context/AppContext.jsx (Line 236 ~ 251)
const applyBudgetPreset = (key) => {
  setActiveScenario(key);
  if (db.customBudgetPresets && db.customBudgetPresets[key]) {
    const presetBudgets = db.customBudgetPresets[key].budgets || {};
    setDb(prev => ({
      ...prev,
      monthlyBudgets: {
        ...prev.monthlyBudgets,
        [selectedMonth]: {
          ...(prev.monthlyBudgets[selectedMonth] || {}),
          ...presetBudgets,
        },
      },
    }));
  }
};
```
- **원인 3**: 특정 월에서 시나리오를 선택하거나 적용할 때마다 `db.monthlyBudgets[selectedMonth]`에 해당 월의 명시적 예산 스냅샷이 생성됩니다.
- 한번 명시적 스냅샷이 생성된 월은 과거 월의 예산이 변경되어도 이전 월의 변경값을 상속받지 않고 자신의 고정 스냅샷 값을 계속 유지하게 됩니다.

---

## 3. 추후 구현 시 해결 방안 (개선 계획)

구현 지시가 내려질 때 아래 2가지 방안 중 하나 또는 조합으로 해결할 예정입니다:

### 방안 A: 당월 수정 시 미래 월의 `monthlyBudgets` 레코드 일괄 갱신/동기화 (추천)
- `setAllCategoryBudgets` 실행 시 `selectedMonth`뿐만 아니라, `db.monthlyBudgets`에 이미 존재하는 미래 모든 월(`mKey >= selectedMonth`)의 해당 카테고리(또는 전체 예산) 값을 일괄 덮어쓰거나 갱신합니다.
- **장점**: UI의 `당월 및 미래 모든 월에 일괄 적용` 안내 문구와 100% 일치하며 직관적입니다.

### 방안 B: 미래 월의 개별 오버라이드 삭제 (Clean-up Propagation)
- `selectedMonth` 예산 수정 시, 미래 월들 중 사용자가 해당 월에서 직접 개별 수정한 내역이 없는 기본/상속 레코드는 삭제하거나 갱신하여 8월의 최신 설정값이 상속 체인(`getEffectiveCategoryBudgets`)을 통해 9월 이후로 자연스럽게 흐르도록 만듭니다.

---

## 4. 대기 상태 안내
- 현재 요청에 따라 **`error_v2.md` 분석 문서 작성을 완료**하였으며, 소스 코드 변경(구현)은 진행하지 않고 대기 중입니다.
- 추후 수정을 진행하고자 하실 때 알려주시면 위 개선안에 따라 빠르고 정확하게 반영하겠습니다.
