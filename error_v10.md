# 총자산 화면 백화(White-screen) 렌더링 예외 에러 상세 분석 보고서 (error_v10.md)

## 1. 개요 및 증상 요약
- **발생 현상**: 총자산 관리 화면(`AccountsView.jsx`)으로 이동하면 화면에 아무것도 나타나지 않고 흰색 화면(White Screen)이 출력되는 런타임 렌더링 붕괴 현상 발생.
- **핵심 원인**: **전월 대비 순자산 증감률(MoM %) 지표 연산 구문에서 `useApp()` 컨텍스트로부터 `db` 변수를 구조 분해 할당(Destructuring)하지 않은 채 `db.monthlyAssetSnapshots`에 접근하여 자바스크립트 `ReferenceError: db is not defined` 미포획 예외가 발생**했기 때문.

---

## 2. 상세 원인 추적 및 분석 (Empirical Stack Trace)

### 1) 브라우저 런타임 에러 스택 트레이스 (Vite Server Log)
```text
[Unhandled error] ReferenceError: db is not defined
 > AccountsView src/components/AccountsView.jsx:151:30
    149 |    const momDiff = netAsset - prevNetAsset;
    150 |    const momRate = prevNetAsset > 0 ? (momDiff / prevNetAsset) * 100 : 0;
    151 |    const hasPrevData = Boolean(db.monthlyAssetSnapshots && db.monthlyAssetSnapshots[prevYearMonth]);
        |                                ^
```

### 2) 발생 메커니즘
- [AccountsView.jsx](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/components/AccountsView.jsx) 상단에서 `useApp()`을 호출할 때 다음과 같이 상태를 가져왔습니다:
  ```javascript
  const {
    selectedMonth,
    updateAssetSnapshot,
    clearMonthlyAssetSnapshot,
    getAssetMetrics,
    yearlyAssetMetrics,
    assetStructure,
    addAssetItem,
    updateAssetItem,
    deleteAssetItem,
    // ⚠️ db 가 추출되지 않음!
  } = useApp();
  ```
- 이후 전월 데이터 존재 여부를 판별하기 위해 151번 라인에서 `Boolean(db.monthlyAssetSnapshots && ...)` 구문을 실행했습니다.
- 선언되지 않은 `db` 식별자를 참조함에 따라 자바스크립트 엔진이 `ReferenceError: db is not defined` 예외를 즉시 발생시켰고, React 렌더링 트리가 붕괴되면서 화면 전체가 빈 상태(White Screen)로 변한 것입니다.

---

## 3. 해결 방안 (Solution Architecture)

1. **[AccountsView.jsx](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/components/AccountsView.jsx) 수정**:
   - `useApp()` 구조 분해 할당 파라미터에 `db` 변수 추가:
     ```javascript
     const {
       db, // 🟢 db 추가
       selectedMonth,
       updateAssetSnapshot,
       ...
     } = useApp();
     ```
   - 전월 데이터 판별 방어 코드 강화:
     ```javascript
     const hasPrevData = Boolean(db?.monthlyAssetSnapshots?.[prevYearMonth]);
     ```

*(※ 지침에 따라 원인 분석 보고서만 작성하였으며, 소스코드 수정은 수행하지 않고 대기 중입니다.)*
