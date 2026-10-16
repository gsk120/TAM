# 자산 구조(assetStructure) 명칭 변경/분할 롤백 현상 상세 원인 분석 보고서 (error_v8.md)

## 1. 개요 및 증상 요약
- **발생 현상**: 사용자가 총자산 화면에서 기존 기본 항목인 `"부동산"`을 `"길음뉴타운 6단지"` (2.819억) 및 `"종암SK"` (6.7억) 등 2개의 커스텀 자산 항목으로 쪼개고 이름을 변경하였으나, 새로고침/재로드 후 변경한 자산명 구조가 사라지고 다시 기본명인 `"부동산"`으로 롤백됨. (단, 입력한 금액 2.819억 등 잔액 데이터는 보존됨)
- **핵심 원인**: **백엔드 Node.js + SQLite 데이터베이스 연동부 및 프론트엔드 비동기 DB 로더(`loadDatabaseAsync`)에서 사용자의 동적 자산 구조(`assetStructure`) 파라미터 저장 및 병합(Merge) 구문이 누락**되었기 때문.

---

## 2. 상세 원인 추적 및 분석 (Root Cause Analysis)

### 1) 백엔드 DB 저장/동기화 구문 누락 ([server/db.js](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/server/db.js))
- 프론트엔드에서 자산 항목을 추가/수정/삭제하면 `db.assetStructure` 상태가 업데이트되고 `saveDatabase(db)`가 백엔드 서버 `/api/db/sync`로 데이터를 전송함.
- 그러나 `server/db.js`의 `performSync(fullDb)` 함수 내 `settings` 테이블 저장 부문(Lines 238~247)을 확인해 보면:
  ```javascript
  // server/db.js (Line 238~247)
  if (fullDb.categories) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['categories', JSON.stringify(fullDb.categories)]);
  }
  if (fullDb.accounts) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['accounts', JSON.stringify(fullDb.accounts)]);
  }
  if (fullDb.activeScenario) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['activeScenario', JSON.stringify(fullDb.activeScenario)]);
  }
  ```
  `categories`, `accounts`, `activeScenario`는 저장하지만, **`assetStructure`를 SQLite `settings` 테이블에 저장하는 구문이 작성되어 있지 않음**.
- 또한 `getFullDatabase()` (Lines 125~143) 함수에서도 `settingsMap.assetStructure`를 서버에서 읽어와 반환하는 구문이 오미트(Omit)되어 있음.

### 2) 프론트엔드 서버 데이터 로딩 시 병합(Merge) 누락 ([src/utils/storage.js](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/utils/storage.js))
- 프론트엔드 앱 마운트 시 `AppContext.jsx`가 비동기 로더인 `loadDatabaseAsync()`를 실행함.
- `storage.js`의 `loadDatabaseAsync()` (Lines 160~171) 구문을 보면:
  ```javascript
  // src/utils/storage.js (Line 160~171)
  const mergedDb = normalizeDbData({
    categories: serverDb.categories || DEFAULT_CATEGORIES,
    accounts: serverDb.accounts || DEFAULT_ACCOUNTS,
    transactions: serverDb.transactions || [],
    monthlyBudgets: serverDb.monthlyBudgets || {},
    monthlyAssetSnapshots: serverDb.monthlyAssetSnapshots || { '2026-07': getInitialAssetSnapshot() },
    customBudgetPresets: ...,
    activeScenario: serverDb.activeScenario || 'basic',
    // ⚠️ assetStructure: serverDb.assetStructure 항목 누락!
  });
  ```
  서버에서 불러온 데이터를 객체로 합칠 때 `assetStructure` 키를 포함시키지 않아 `mergedDb.assetStructure`가 `undefined`로 처리됨.

### 3) 기본 시드(`DEFAULT_ASSET_STRUCTURE`)로의 강제 덮어쓰기 (Fallback Reset)
- `storage.js` 내의 `normalizeDbData(db)` 함수 (Lines 98~100)는 다음의 방어 코드를 포함하고 있음:
  ```javascript
  // src/utils/storage.js (Line 98~100)
  if (!db.assetStructure || !db.assetStructure.cashItems || db.assetStructure.cashItems.length === 0) {
    db.assetStructure = DEFAULT_ASSET_STRUCTURE;
  }
  ```
- `mergedDb.assetStructure`가 `undefined`이므로 `normalizeDbData`는 사용자가 저장했던 동적 자산 구조를 잃어버리고 코드 하드코딩 기본 시드인 `DEFAULT_ASSET_STRUCTURE`로 강제 초기화(Fallback Reset)를 단행함.
- `DEFAULT_ASSET_STRUCTURE`에는 기존의 기본 항목명인 `"부동산"`(id: `inv_realestate`) 1개만 정의되어 있음.

### 4) 금액은 남고 이름이 롤백된 이유
- 월별 잔액 스냅샷 데이터(`monthlyAssetSnapshots['2026-07']`)는 SQLite `monthly_assets` 테이블에 올바르게 저장되어 2.819억 잔액 자체는 사라지지 않고 유지됨.
- 하지만 이를 표시해 주는 자산 메타데이터/구조(`assetStructure`)가 백엔드 미저장 및 프론트엔드 병합 누락으로 인해 하드코딩 기본 시드(`"부동산"`)로 덮어씌워졌기 때문에, 화면상에서 항목명이 다시 `"부동산"`으로 롤백되어 표출된 것임.

---

## 3. 해결 방안 (수정 요구사항)

1. **`server/db.js` 수정**:
   - `performSync`: `settings` 테이블에 `assetStructure` 저장 구문 추가 (`INSERT OR REPLACE INTO settings (key, value) VALUES ('assetStructure', JSON.stringify(fullDb.assetStructure))`)
   - `getFullDatabase`: 서버 데이터 반환 객체에 `assetStructure: settingsMap.assetStructure || null` 추가.

2. **`src/utils/storage.js` 수정**:
   - `loadDatabaseAsync`: `mergedDb` 생성 시 `assetStructure: serverDb.assetStructure || null` 항목 명시적 전달.

*(※ 사용자 지침에 따라 현재는 분석 보고서 작성 완료 상태이며, 소스코드 수정은 수행하지 않고 대기 중입니다.)*
