# 새로고침 시 자산 구조(assetStructure) 초기화 덮어쓰기 현상 상세 분석 보고서 (error_v9.md)

## 1. 개요 및 증상 요약
- **발생 현상**: 사용자가 "부동산" -> "길음뉴타운 6단지"로 명칭을 수정하고 "종암SK" 6.7억 자산을 추가한 직후, 브라우저 새로고침(F5)을 실행하면 수정된 항목과 신규 추가한 자산이 모두 사라지고 초기 기본 상태로 다시 리셋됨.
- **핵심 원인**: **백엔드 서버 저장 비동기 디바운스(300ms) 타이머 레이스 조건** 및 **프론트엔드 비동기 DB 로더(`loadDatabaseAsync`)가 서버의 미동기화/null 상태 데이터를 가져와 LocalStorage에 보존된 유효한 자산 구조까지 덮어씌워 멸실시키는 오버라이트(Overwrite) 결함** 때문.

---

## 2. 상세 원인 추적 및 분석 (Step-by-Step Root Cause)

### Step 1: 디바운스 타이머(300ms)와 새로고침(F5) 레이스 조건 ([src/utils/storage.js](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/utils/storage.js))
- 사용자가 항목을 수정/추가하면 `saveDatabase(db)`가 호출됩니다.
- `saveDatabase(db)`는 LocalStorage에는 동기식으로 즉시 저장하지만, 백엔드 SQLite 서버 전송(`saveDatabaseToServer`)은 **`300ms` 디바운스(`setTimeout`)**를 거쳐 지연 실행됩니다.
  ```javascript
  // src/utils/storage.js (Line 210~215)
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    saveDatabaseToServer(db);
  }, 300);
  ```
- 만약 사용자가 항목 추가/수정 후 300ms 이내에 새로고침(F5)을 누르거나, 서버 전송 HTTP 요청이 완료되기 전에 페이지가 이탈되면 **서버 저장 전송(`saveDatabaseToServer`)이 브라우저에 의해 강제 취소(Canceled)**됩니다.
- 결과적으로 백엔드 SQLite DB에는 새로 변경된 `assetStructure`가 저장되지 못하고 이전의 `null` 또는 과거 데이터 상태로 남게 됩니다.

### Step 2: `loadDatabaseAsync()`의 LocalStorage 데이터 덮어쓰기 결함
- 새로고침(F5) 직후 앱이 켜질 때:
  1. 초기 React State(`useState`)는 동기식 `loadDatabase()`를 실행하여 LocalStorage에 저장된 **유효한 `assetStructure`("길음뉴타운 6단지", "종암SK")**를 가져옵니다.
  2. 직후 `useEffect`가 실행되며 비동기 백엔드 로더인 `loadDatabaseAsync()`가 백엔드 API(`/api/db`)를 호출합니다.
  3. Step 1에서 서버 동기화가 취소되었기 때문에 서버는 `serverDb.assetStructure = null`을 반환합니다.
  4. `loadDatabaseAsync()` (Line 171)는 서버의 `null` 값을 받고 아래와 같이 `mergedDb`를 생성합니다:
     ```javascript
     // src/utils/storage.js (Line 171)
     assetStructure: serverDb.assetStructure || null, // ⚠️ LocalStorage의 기존 유효 데이터를 참조하지 않고 null로 지워버림!
     ```
  5. `normalizeDbData({ assetStructure: null })`는 `assetStructure`가 `null`이므로 하드코딩 기본 시드(`DEFAULT_ASSET_STRUCTURE`)로 강제 리셋을 단행합니다.
  6. 그리고 `loadDatabaseAsync()` (Line 176)는 이 **리셋된 `mergedDb`를 LocalStorage에 덮어써서 기존에 보존되어 있던 LocalStorage의 사용자 수정 데이터까지 완전히 파기**합니다!
     ```javascript
     // src/utils/storage.js (Line 176)
     localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedDb)); // ⚠️ 오버라이트 멸실!
     ```
  7. 마지막으로 `setDb(mergedDb)`가 실행되며 화면상에서 "길음뉴타운 6단지"와 "종암SK"가 깨끗이 지워지게 된 것입니다.

---

## 3. 근본적 해결 방안 (Solution Architecture)

1. **`loadDatabaseAsync` 폴백(Fallback) 방어 로직 강화**:
   - `serverDb.assetStructure`가 `null`이거나 비어있는 경우, 무작정 `null`을 넘겨 리셋시키지 않고 **기존 LocalStorage에 저장되어 있는 유효한 `localDb.assetStructure`를 1순위로 유지/병합**하도록 수정.
   - 코드: `assetStructure: serverDb.assetStructure || localDb.assetStructure || DEFAULT_ASSET_STRUCTURE`

2. **백엔드 서버 동기화 즉시성 보장**:
   - 자산 구조 변경(`addAssetItem`, `updateAssetItem`, `deleteAssetItem`) 등 구조적 변경 이벤트 발생 시 300ms 지연 없이 `saveDatabaseToServer(db)`를 **즉시(Synchronously/Immediate Fetch)** 실행하거나, `beforeunload` 이벤트 발생 시 펜딩 중인 디바운스를 즉시 플러시(Flush)하도록 처리.

*(※ 사용자 요청에 따라 원인 분석 보고서만 작성하였으며, 기존 코드는 일절 건드리지 않았습니다.)*
