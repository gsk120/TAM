# 자산 데이터 표출 오류 및 자산 구조 정의 적절성 분석 보고서 (report.md)

---

## 1. 개요 (Overview)

본 보고서는 사용자가 제시한 다음 2가지 질문에 대해 소스코드 구조, Supabase DB 저장 방식, State 데이터 흐름을 바탕으로 명확하고 깊이 있게 분석한 결과를 담고 있습니다.

1. **질문 1**: 화면상에서 `길음뉴타운 6단지`와 `종암 SK` 두 부동산 항목이 **0원**으로 세팅되어 표출되는 원인 분석 (실제 Supabase DB 내에는 JSON 형태로 데이터가 존재함에도 불구하고 발생 현상)
2. **질문 2**: [src/utils/finance.js](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/utils/finance.js) 파일 내 하드코딩된 총자산 항목 정의(`id`, `name`, `owner`, `defaultBalance`)의 적절성 검토 및 건축적 개선 방향

---

## 2. [질문 1] `길음뉴타운 6단지` / `종암 SK` 0원 표출 현상 명확 분석

### 2.1 데이터 매핑 메커니즘 분석

현재 가계부 앱에서 화면에 자산 평가액을 표출하는 메커니즘은 다음과 같습니다.

```mermaid
graph TD
    A["Supabase DB (monthly_assets)"] -->|JSON parsing| B["db.monthlyAssetSnapshots['2026-07']"]
    C["db.assetStructure.investItems"] -->|item.id 탐색| D["AccountsView.jsx (렌더링)"]
    B -->|snap.invest[item.id] 조회| D
    D -->|매칭 실패시| E["0원 표출 (fallback)"]
```

- [AccountsView.jsx](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/components/AccountsView.jsx#L466-L485) 렌더링 코드:
  ```javascript
  {investItems.map(item => {
    // snap.invest 객체에서 item.id 키 값으로 금액을 조회함 (없으면 0)
    const val = snap.invest?.[item.id] ?? 0;
    return (
      <tr key={item.id}>
        <td>{item.name}</td>
        <td>{formatInputNumber(val)}</td>
      </tr>
    );
  })}
  ```

---

### 2.2 원인 분석 (Root Causes)

Supabase DB 내에 데이터(JSON)가 분명히 존재함에도 불구하고 화면에서 0원으로 나오는 원인은 **4가지 핵심 mismatch 및 고아 키(Orphan Key) 문제** 때문입니다.

#### ① **자산 항목 ID (`item.id`)와 DB Snapshot JSON 키 간의 불일치 (Key Mismatch)**
- **기존 DB에 저장된 JSON 구조**:
  사용자가 과거 기본 자산인 `"부동산"`을 이용할 때 Supabase `monthly_assets` 테이블 `asset_data` JSON에는 아래와 같이 기본 키인 **`"inv_realestate"`**로 금액이 기록되어 있습니다.
  ```json
  {
    "invest": {
      "inv_toss_gk": 1376916,
      "inv_mirae_gk": 1990176,
      "inv_upbit_gk": 1418819,
      "inv_nh_sj": 7658034,
      "inv_toss_sj": 152946,
      "inv_pension_gk": 27198885,
      "inv_pension_sj": 16000000,
      "inv_realestate": 951900000
    }
  }
  ```
- **신규 항목 생성 시 발행된 ID**:
  사용자가 화면에서 자산을 추가/수정하여 `"길음뉴타운 6단지"`와 `"종암 SK"`를 만들면 [AppContext.jsx](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/context/AppContext.jsx#L107)의 `addAssetItem` 함수가 고유 타임스탬프 ID를 생성합니다.
  - `길음뉴타운 6단지` ID: `inv_user_1723381000000`
  - `종암 SK` ID: `inv_user_1723382000000`
- **결과**: `AccountsView.jsx`는 `snap.invest["inv_user_1723381000000"]`을 찾지만, DB JSON 내부에는 `"inv_realestate"`라는 옛날 키만 들어있으므로 `undefined`가 반환되어 **0원**으로 세팅됩니다.

---

#### ② **기존 자산 삭제 (`deleteAssetItem`) 시 잔액 스냅샷 고아 키 삭제 로직 동작**
- 사용자가 기존 `"부동산"` 항목을 삭제하고 새로 2개로 나누어 등록했다면, [AppContext.jsx](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/context/AppContext.jsx#L199)의 `deleteAssetItem` 로직이 실행됩니다.
  ```javascript
  // AppContext.jsx line 199
  delete snapCopy[id]; // 'inv_realestate' 키를 monthlyAssetSnapshots에서 제거
  ```
- 이로 인해 기존 9.5억 원(또는 기존 입력 금액)이 들어있던 `"inv_realestate"` 키가 삭제되었고, 새로 생성된 2개 항목(`inv_user_xxx`)은 신규 등록 월 외의 다른 월 또는 초기화 상태에서 **0원**으로 남아있게 됩니다.

---

#### ③ **월 키(`year_month`) 불일치**
- 상단 선택 달이 **`2026년 7월` (`2026-07`)**로 설정되어 있으나, 만약 Supabase DB의 `monthly_assets` 테이블에 저장된 `year_month` 값이 `'2026-8'` 또는 다른 날짜 키이거나, DB에 `'2026-07'` 스냅샷이 저장되기 전이라면 `getInitialAssetSnapshot()`이 호출되어 모든 항목이 **0원**으로 초기화됩니다.

---

#### ④ **Supabase DB 동기화 시점 레이스 조건 (Race Condition)**
- 앞서 `error_v9.md`에서 분석된 것처럼, 프론트엔드의 `saveDatabase`는 300ms 디바운스로 서버에 저장합니다.
- 자산 항목 구조(`assetStructure`)가 Supabase `settings` 테이블에 완전 동기화되기 전에 새로고침(F5)되거나 페이지 이동 시, 서버는 옛날/기본 자산 구조를 반환하여 ID 매핑이 끊어지고 금액 조회가 실패(0원)하게 됩니다.

---

## 3. [질문 2] `finance.js` 자산 정의(`CASH_ASSET_ITEMS` 등)의 적절성 분석

### 3.1 질문의 요지
> "`finance.js`를 보면 총자산 항목별로 id, name, owner, defaultBalance 4가지로 미리 정의되어 있는데, 이거 Supabase에서 값을 가져오는 것으로 알고 있거든. 항목도 직접 추가 가능한데, 이 정의를 내리는 게 맞는 걸까?"

---

### 3.2 결론 및 핵심 분석

> **결론**: `finance.js`에 특정 사용자의 개별 계좌명과 실제 잔액 수치(`36,493,386원` 등)까지 하드코딩해 두는 방식은 **바람직하지 않으며(Bad Practice), 역할 분리가 명확히 이루어지지 않은 설계적 결함**입니다.

#### **왜 현재 구조가 문제가 되는가?**

1. **단일 진실 출처 (Single Source of Truth, SSOT) 위반**
   - 사용자 자산 데이터(계좌명, 소유자, 잔액)의 단일 진실 출처는 **Supabase 데이터베이스**이어야 합니다.
   - 하지만 `finance.js`에 `acc_cma (미래에셋CMA: 36,493,386원)`, `acc_house_gk (주택청약: 16,520,000원)` 같은 개인 실데이터가 고정 상수(`export const CASH_ASSET_ITEMS`)로 정의되어 있습니다.
   - DB에 연결되지 않거나 초기화 시, 하드코딩된 이 금액들이 DB 데이터를 덮어쓰거나 롤백을 유발하는 원인이 됩니다.

2. **동적 추가/수정 기능과의 충돌**
   - 사용자는 화면에서 자유롭게 항목을 **추가/수정/삭제**할 수 있습니다.
   - 그러나 소스코드에 상수로 고정된 목록(`CASH_ASSET_ITEMS`, `INVEST_ASSET_ITEMS`)이 존재하고, 코드 곳곳에서 `assetStructure.cashItems || CASH_ASSET_ITEMS`와 같이 폴백(Fallback)으로 참조하고 있어 DB 데이터와 코드 상수가 서로 지위(Priority)를 다투는 구조적 혼선이 발생합니다.

3. **초기 시드(Initial Seed)와 도메인 데이터의 혼재**
   - 개발 초기 시연(Demo) 및 DB 미연결 시 사용할 기본 시드 데이터가 필요한 것은 맞습니다.
   - 하지만 시드 데이터는 **최초 앱 구동 시 1회만 DB에 주입(Seed)**되는 용도여야 하며, 코드 파일 내에 상시 고정 프로덕션 데이터처럼 남아있어서는 안 됩니다.

---

### 3.3 올바른 설계 방향 (Architectural Best Practice)

```mermaid
graph LR
    subgraph "소스코드 (finance.js / storage.js)"
        Seed["최초 1회용 기본 템플릿/시드 Schema (빈 껍데기 또는 기본 샘플)"]
    end

    subgraph "Supabase DB (Database)"
        SSOT["동적 자산 구조 (assetStructure)\n+ 월별 잔액 스냅샷 (monthly_assets)"]
    end

    subgraph "React App (Frontend)"
        UI["AccountsView (화면 표출)"]
    end

    SSOT -->|1순위 로드 (Primary SSOT)| UI
    Seed -.->|DB 비어있을 때만 최초 1회 생성| SSOT
```

#### **개선 방안**:
1. **`finance.js` 역할 축소 (Schema Definition & Minimal Seed Only)**
   - `CASH_ASSET_ITEMS`, `INVEST_ASSET_ITEMS`에서 **개인 실제 잔액(`defaultBalance: 36493386` 등)과 특정 개인 계좌 정보를 제거**합니다.
   - 대신 신규 유저 등록 시 사용할 **최소한의 표준 범용 카테고리 틀(Minimal Initial Seed Schema)**만 남깁니다.

2. **Supabase DB를 전적으로 SSOT로 전환**
   - 자산 항목의 추가/수정/삭제 내역은 Supabase `settings` 테이블의 `assetStructure` 행에 완전하게 보존합니다.
   - `finance.js` 상수를 직접 참조하지 않고 항상 `db.assetStructure`를 참조하도록 프론트엔드 파이프라인을 일원화합니다.

3. **이름/ID 변경 시 스냅샷 데이터 마이그레이션(Migration) 구현**
   - 기존 항목을 수정하거나 분할할 때 DB `monthly_assets` 내부 JSON 키도 함께 변경/이관되도록 처리하여, `길음뉴타운 6단지`와 같이 새로 만든 항목이 옛날 JSON 데이터와 매핑되지 못해 **0원으로 붕 뜨는 현상**을 근본적으로 방지합니다.

---

## 4. 최종 요약 및 추천 조치 사항 (Action Items)

| 구분 | 현상 및 원인 | 해결 및 개선 권장 조치 |
| :--- | :--- | :--- |
| **Q1. 0원 표출 문제** | Supabase DB JSON의 키(`"inv_realestate"`)와 화면의 신규 항목 ID(`"inv_user_xxx"`) 불일치 | DB `monthly_assets` 스냅샷 JSON 키를 신규 항목 ID로 마이그레이션하거나, `item.name` 기반 매핑 보완 로직 적용 |
| **Q2. `finance.js` 정의** | 코드 내 개인 실데이터 하드코딩으로 DB와의 충돌 및 SSOT 위반 | `finance.js` 내 실데이터 제거, 최소 시드 스키마만 유지하고 Supabase DB를 단일 진실 출처로 완전 일원화 |

---
*본 분석 보고서는 가계부 프로젝트 소스코드([src/utils/finance.js](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/utils/finance.js), [src/context/AppContext.jsx](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/src/context/AppContext.jsx), [server/db.js](file:///c:/Users/gsk12/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8/server/db.js)) 분석을 바탕으로 작성되었습니다.*
