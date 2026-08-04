# 거래 내역 가맹점(D열) 컬럼 이관 유실 오류 분석 및 수정 계획서 (`error_v3.md`)

이 문서는 LocalStorage 기반 브라우저 저장소 데이터를 **Node.js (Express) + SQLite** 백엔드 데이터베이스로 이관하는 과정에서 거래 내역의 **"내용 / 가맹점 (D)" 컬럼 (`t.description`)** 이 빈값(`""`)으로 유실되던 원인을 분석하고, 이를 복구 및 방지하기 위한 수정 계획을 작성한 사양서입니다.

---

## 1. 지적된 현상 및 문제점

- **현상**: 기존 브라우저 LocalStorage 기반 가계부에서는 거래 내역의 `내용 / 가맹점 (D)` 열에 `(주)중앙에너비스 종암지점`, `티머니 버스`, `코스트코코리아` 등의 가맹점명이 정상적으로 표시되었으나, **Node.js (Express) + SQLite DB로 전환 후 해당 컬럼이 모두 빈값**으로 표시되는 현상 발생.
- **영향**: 가계부 사용자가 각 지출 및 수입 거래가 어디서 일어났는지(사용처/가맹점) 식별할 수 없는 데이터 훼손 문제 발생.

---

## 2. 소스 코드 기준 원인 분석

### 2.1 SQLite 테이블 스키마 내 `description` 컬럼 누락 (`server/db.js`)

**기존 코드 (`server/db.js` 30~43라인):**
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  type TEXT NOT NULL,
  memo TEXT,
  account TEXT,
  payment_method TEXT,
  asset_type TEXT,
  owner TEXT,
  created_at TEXT
);
```
- **원인**: SQLite DB 테이블을 생성할 때, 프론트엔드 거래 데이터 구조(`t.description`)를 저장할 **`description TEXT` 컬럼이 정의되지 않고 누락**되었습니다.

### 2.2 DB 동기화/저장 SQL 쿼리 내 파라미터 바인딩 누락 (`server/db.js`)

**기존 코드 (`server/db.js` 150~157라인):**
```javascript
const stmt = await db.prepare(`
  INSERT INTO transactions (id, date, amount, category, subcategory, type, memo, account, payment_method, asset_type, owner, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
```
- **원인**: `syncFullDatabase()` 실행 시 LocalStorage에서 읽은 거래 객체(`t`)의 `t.description` 값을 SQL 바인딩 파라미터로 전달하지 않았습니다. 이로 인해 마이그레이션 과정에서 `description` 정보가 완전히 버려진 채 DB에 저장되었습니다.

### 2.3 DB 조회 쿼리 매핑 및 개별 등록 API 누락 (`server/db.js`, `server/index.js`)

- `getFullDatabase()`에서 SQLite 테이블을 조회해 프론트엔드로 전달할 때 `description: t.description || ''` 매핑이 빠져 있었습니다.
- `POST /api/transactions` 단일 거래 추가 API에서도 `description` 컬럼 바인딩이 누락되어 있었습니다.

---

## 3. 수정 로직 및 구현 계획

### 3.1 SQLite DB 스키마 및 API 수정
1. **`server/db.js`**: `transactions` 테이블 DDL에 `description TEXT` 컬럼 추가.
2. **`server/db.js`**: `syncFullDatabase()` INSERT 바인딩 파라미터에 `t.description || ''` 추가.
3. **`server/db.js`**: `getFullDatabase()` 반환 객체 매핑에 `description: t.description || ''` 명시.
4. **`server/index.js`**: `POST /api/transactions` API 바인딩 파라미터에 `description` 추가.

### 3.2 기존 DB 마이그레이션 재실행 (데이터 복구)
- 이미 빈값으로 저장된 `data/finance.db` SQLite 파일 및 테이블을 초기화(또는 재생성)합니다.
- 서버 재기동 시, 브라우저 LocalStorage에 보존되어 있는 온전한 원본 거래 데이터(`description` 포함)를 SQLite DB로 다시 1회 자동 마이그레이션(`loadDatabaseAsync()`)하여 훼손된 가맹점 데이터를 원복합니다.

---

## 4. 검증 계획

1. `server/data/finance.db` 초기화 후 통합 서버(`npm run dev`) 기동.
2. 백엔드 REST API (`GET /api/db`) 호출 시 `transactions` 배열 각 요소에 `description` 값이 정상적으로 포함되는지 확인.
3. 프론트엔드 화면의 `내용 / 가맹점 (D)` 테이블 컬럼에 가맹점명이 빈값 없이 정상 출력되는지 확인.
