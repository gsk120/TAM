import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, DEFAULT_ASSET_STRUCTURE, getInitialAssetSnapshot } from './finance';

const STORAGE_KEY = 'family_finance_db_v2';

export const INITIAL_DEMO_TRANSACTIONS = [];

export const DEFAULT_BASIC_PRESET = {
  id: 'basic',
  name: '기본안 (688만원)',
  createdAt: '2026-07-29',
  budgets: {
    '대출': 2900000,
    '보험': 550000,
    '통신비': 140000,
    '주거비': 210000,
    '생활고정비': 260000,
    '금융고정비': 420000,
    '교통': 150000,
    '식비': 800000,
    '육아': 500000,
    '의료비': 150000,
    '교육비': 0,
    '기타생활비': 300000,
    '이벤트': 100000,
    '세금': 0,
    '기석용돈': 200000,
    '승주용돈': 200000,
  },
};

export function getInitialDbStructure() {
  return {
    categories: DEFAULT_CATEGORIES,
    accounts: DEFAULT_ACCOUNTS,
    assetStructure: DEFAULT_ASSET_STRUCTURE,
    transactions: [],
    monthlyBudgets: {},
    monthlyAssetSnapshots: {
      '2026-07': getInitialAssetSnapshot(DEFAULT_ASSET_STRUCTURE),
    },
    customBudgetPresets: {
      basic: DEFAULT_BASIC_PRESET,
    },
    activeScenario: 'basic',
  };
}

function normalizeDbData(db) {
  if (!db) return db;

  // 1. 카테고리 '통신' -> '통신비' 마이그레이션
  if (Array.isArray(db.categories)) {
    db.categories = db.categories.map(c => {
      if (c.name === '통신' || c.id === 'cat_comm') {
        return { ...c, id: 'cat_comm', name: '통신비', defaultBudget: c.defaultBudget || 140000 };
      }
      return c;
    });
  }

  // 2. 거래 내역 '통신' -> '통신비' 마이그레이션
  if (Array.isArray(db.transactions)) {
    db.transactions = db.transactions.map(t => {
      if (t.category === '통신') {
        return { ...t, category: '통신비' };
      }
      return t;
    });
  }

  // 3. 월별 예산 키 '통신' -> '통신비' 마이그레이션
  if (db.monthlyBudgets && typeof db.monthlyBudgets === 'object') {
    Object.keys(db.monthlyBudgets).forEach(mKey => {
      if (db.monthlyBudgets[mKey] && db.monthlyBudgets[mKey]['통신'] !== undefined) {
        const val = db.monthlyBudgets[mKey]['통신'];
        delete db.monthlyBudgets[mKey]['통신'];
        if (db.monthlyBudgets[mKey]['통신비'] === undefined) {
          db.monthlyBudgets[mKey]['통신비'] = val;
        }
      }
    });
  }

  // 4. 예산 시나리오 프리셋 '통신' -> '통신비' 마이그레이션
  if (db.customBudgetPresets && typeof db.customBudgetPresets === 'object') {
    Object.keys(db.customBudgetPresets).forEach(pKey => {
      if (db.customBudgetPresets[pKey] && db.customBudgetPresets[pKey].budgets && db.customBudgetPresets[pKey].budgets['통신'] !== undefined) {
        const val = db.customBudgetPresets[pKey].budgets['통신'];
        delete db.customBudgetPresets[pKey].budgets['통신'];
        if (db.customBudgetPresets[pKey].budgets['통신비'] === undefined) {
          db.customBudgetPresets[pKey].budgets['통신비'] = val;
        }
      }
    });
  }

  // 5. 자산 구조(assetStructure) 기본값 보장
  if (!db.assetStructure || !db.assetStructure.cashItems || db.assetStructure.cashItems.length === 0) {
    db.assetStructure = DEFAULT_ASSET_STRUCTURE;
  }

  return db;
}

// 동기식 동네 LocalStorage 읽기 (초기 React state용)
export function loadDatabase() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initialDb = normalizeDbData(getInitialDbStructure());
      saveDatabase(initialDb);
      return initialDb;
    }
    const db = normalizeDbData(JSON.parse(raw));
    if (!db.categories) db.categories = DEFAULT_CATEGORIES;
    if (!db.accounts) db.accounts = DEFAULT_ACCOUNTS;
    if (!db.monthlyAssetSnapshots) {
      db.monthlyAssetSnapshots = { '2026-07': getInitialAssetSnapshot() };
    }
    if (!db.customBudgetPresets || Object.keys(db.customBudgetPresets).length === 0) {
      db.customBudgetPresets = { basic: DEFAULT_BASIC_PRESET };
    }
    return db;
  } catch (err) {
    console.error('Failed to load storage, initializing fallback:', err);
    return normalizeDbData(getInitialDbStructure());
  }
}

// 비동기 백엔드 API (Node.js Express + SQLite) 데이터 로드 및 마이그레이션
export async function loadDatabaseAsync() {
  try {
    const res = await fetch('/api/db');
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const serverDb = await res.json();

    // 서버 DB 데이터 유무 검사
    const hasServerData =
      (serverDb.transactions && serverDb.transactions.length > 0) ||
      (serverDb.monthlyAssetSnapshots && Object.keys(serverDb.monthlyAssetSnapshots).length > 0) ||
      (serverDb.monthlyBudgets && Object.keys(serverDb.monthlyBudgets).length > 0);

    // 서버 DB가 비어있는 경우, 기존 LocalStorage 데이터 마이그레이션 확인
    if (!hasServerData) {
      const localDb = loadDatabase();
      const hasLocalData =
        (localDb.transactions && localDb.transactions.length > 0) ||
        (localDb.monthlyAssetSnapshots && Object.keys(localDb.monthlyAssetSnapshots).length > 0);

      if (hasLocalData) {
        console.log('📦 Migrating LocalStorage data to SQLite server...');
        await saveDatabaseToServer(localDb);
        return localDb;
      }
    }

    // 서버 데이터를 기본 구조로 병합
    const mergedDb = normalizeDbData({
      categories: serverDb.categories || DEFAULT_CATEGORIES,
      accounts: serverDb.accounts || DEFAULT_ACCOUNTS,
      transactions: serverDb.transactions || [],
      monthlyBudgets: serverDb.monthlyBudgets || {},
      monthlyAssetSnapshots: serverDb.monthlyAssetSnapshots || { '2026-07': getInitialAssetSnapshot() },
      customBudgetPresets:
        serverDb.customBudgetPresets && Object.keys(serverDb.customBudgetPresets).length > 0
          ? serverDb.customBudgetPresets
          : { basic: DEFAULT_BASIC_PRESET },
      activeScenario: serverDb.activeScenario || 'basic',
      assetStructure: serverDb.assetStructure || null,
    });

    // LocalStorage도 최신으로 동기화
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedDb));
    } catch (e) {}

    return mergedDb;
  } catch (err) {
    console.warn('⚠️ Server unavailable or error, falling back to LocalStorage:', err);
    return loadDatabase();
  }
}

// 서버 DB에 동기화 요청
async function saveDatabaseToServer(db) {
  try {
    await fetch('/api/db/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(db),
    });
  } catch (err) {
    console.error('Failed to sync database to server:', err);
  }
}

let syncTimeout = null;

export function saveDatabase(db) {
  // 1. LocalStorage 즉시 저장
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }

  // 2. 백엔드 SQLite DB 디바운스 디스크 동기화 (300ms)
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    saveDatabaseToServer(db);
  }, 300);
}

export function resetDatabase() {
  localStorage.removeItem(STORAGE_KEY);
  const initialDb = getInitialDbStructure();
  saveDatabase(initialDb);
  return initialDb;
}
