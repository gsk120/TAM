# D컬럼(가맹점명) 유실 및 JSON 백업 파일 복원 실패 원인 분석 및 수정 사양서 (`error_v4.md`)

이 문서는 **1) 거래내역의 D컬럼(내용/가맹점, `description`) 데이터가 계속 보이지 않는 현상**과 **2) 전체 데이터 JSON 백업 후 업로드 복구가 되지 않는 현상**에 대한 정밀한 근본 원인 분석(Root Cause Analysis) 및 해결 방안을 기술합니다.

---

## 1. 문제 현상 요약

1. **현상 1**: SQLite 백엔드 적용 후 `내용 / 가맹점 (D)` 열에 백업 데이터나 원본 데이터의 가맹점 정보가 나타나지 않고 계속 빈값으로 표시됨.
2. **현상 2**: `설정 & 백업` 메뉴에서 "JSON 백업 다운로드" 후 "백업 파일 선택 및 복원"을 수행하면 복원이 성공하지 않고 이전 데이터가 그대로 남아있거나 변화가 없음.

---

## 2. 근본 원인 분석 (Root Cause Analysis)

### 2.1 [문제 1 원인] D컬럼(`description`) 데이터가 계속 빈값인 이유

1. **LocalStorage 데이터 역오염 발생**:
   - `server/db.js`의 `transactions` 테이블 DDL 및 SQL INSERT 문에 `description` 컬럼이 누락되어 있던 초기 상태에서 `loadDatabaseAsync()`가 첫 기동되었습니다.
   - 이때 LocalStorage의 온전한 데이터가 SQLite로 전송되었으나, SQLite가 `description`을 제외한 채 DB에 저장했습니다.
   - 직후 `loadDatabaseAsync()` (storage.js 117라인)가 **SQLite에서 응답받은 `description`이 삭제된 DB 상태를 브라우저 `LocalStorage(family_finance_db_v2)` 키에 역으로 덮어씌워 보관**했습니다.
   - 결과적으로 원본 브라우저 저장소의 가맹점 데이터까지 빈값으로 훼손되었습니다.

2. **백엔드 DB 삭제 후에도 훼손된 데이터가 재마이그레이션됨**:
   - `server/db.js` 코드를 수정하고 `data/finance.db` 파일을 삭제했으나, 마이그레이션 대상인 브라우저 LocalStorage(`family_finance_db_v2`)의 데이터가 이미 훼손(역오염)된 상태였기 때문에, 복구 마이그레이션 시에도 빈값이 들어갈 수밖에 없었습니다.

---

### 2.2 [문제 2 원인] JSON 백업 파일 업로드(복원) 실패 이유

1. **`SettingsView.jsx` 구버전 LocalStorage 키 하드코딩 오류**:
   - `src/components/SettingsView.jsx` 38라인의 `handleImportJSON` 함수가 다음과 같이 작성되어 있었습니다:
     ```javascript
     // SettingsView.jsx 기존 코드 (오류)
     localStorage.setItem('family_finance_db_v1', JSON.stringify(importedData));
     window.location.reload();
     ```
   - 현재 시스템의 표준 키는 `family_finance_db_v2`인데, 존재하지 않는 구버전 키 `family_finance_db_v1`에 데이터를 저장하고 있었습니다.

2. **Node.js + SQLite 백엔드 DB 동기화 누락**:
   - JSON 복원 파일 선택 시, 백엔드 API (`/api/db/sync`) 호출이나 `AppContext`의 `setDb` 상태 업데이트 없이 단순 브라우저 새로고침(`window.location.reload()`)만 수행했습니다.
   - 페이지가 새로고침되면 `loadDatabaseAsync()`가 백엔드 SQLite DB에 저장된 기존 데이터를 다시 로드하므로, 복원 시도한 JSON 데이터가 완전히 무시되고 기존 백엔드 데이터로 덮어씌워졌습니다.

---

## 3. 수정 및 해결 계획 (Action Plan)

### 3.1 `src/components/SettingsView.jsx` 백업 복원 로직 개편
- `handleImportJSON` 함수를 수정하여 구버전 키(`v1`) 저장을 제거하고:
  1. `AppContext`의 `importFullDatabase(importedData)` 또는 `saveDatabase(importedData)`를 호출하여 `family_finance_db_v2`와 백엔드 SQLite API (`/api/db/sync`)에 동시에 비동기로 저장/동기화합니다.
  2. 동기화 성공 후 사용자에게 알려주고 화면을 리프레시하거나 상태를 즉시 반영합니다.

### 3.2 `src/context/AppContext.jsx`에 전체 DB 복원 함수 추가
- JSON 파일 업로드 시 `setDb(importedData)` 및 `saveDatabase(importedData)`를 실행해 즉시 SQLite DB와 LocalStorage를 동시에 갱신하는 `importFullDatabase` 함수 제공.

### 3.3 백업 JSON 업로드를 통한 가맹점(D컬럼) 데이터 온전한 복구
- 사용자가 소지하고 계시거나 백업된 올바른 JSON 파일(D컬럼 가맹점 데이터가 포함된 파일)을 업로드하면, `SettingsView.jsx` -> `saveDatabase()` -> Express `/api/db/sync` -> SQLite `transactions` 테이블로 온전히 반영되어 D컬럼 복구가 완료됩니다.

---

## 4. 검증 계획

1. `src/components/SettingsView.jsx` 및 `AppContext.jsx` 수정 후 `npm run dev` 기동.
2. `설정 & 백업` 메뉴에서 가맹점 정보(`description`)가 포함된 JSON 백업 파일 업로드 실행.
3. 업로드 즉시 SQLite DB(`data/finance.db`) 및 화면의 `내역 & 가져오기` 메뉴에서 `내용 / 가맹점 (D)` 열이 복구되었는지 확인.
4. 백업 다운로드 후 재복원하여 데이터 일치성 확인.
