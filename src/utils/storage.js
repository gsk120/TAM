import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, DEFAULT_ASSET_STRUCTURE, getInitialAssetSnapshot, DEFAULT_INCOME_CATEGORIES } from './finance';

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
    '남편용돈': 200000,
    '아내용돈': 200000,
  },
};

export function getInitialDbStructure() {
  return {
    categories: [],
    incomeCategories: [],
    accounts: [],
    assetStructure: { cashItems: [], investItems: [], debtItems: [] },
    transactions: [],
    monthlyBudgets: {},
    monthlyAssetSnapshots: {},
    customBudgetPresets: {},
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

  // 5. 자산 구조(assetStructure) 안전 보장
  const baseStruct = db.assetStructure || { cashItems: [], investItems: [], debtItems: [] };
  db.assetStructure = {
    cashItems: Array.isArray(baseStruct.cashItems) ? baseStruct.cashItems : [],
    investItems: Array.isArray(baseStruct.investItems) ? baseStruct.investItems : [],
    debtItems: Array.isArray(baseStruct.debtItems) ? baseStruct.debtItems : [],
  };

  return db;
}

// 기본 DB 데이터 구조 반환 (초기 React state용)
export function loadDatabase() {
  return normalizeDbData(getInitialDbStructure());
}

// 비동기 Supabase PostgreSQL 데이터 로드
export async function loadDatabaseAsync(token) {
  try {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      const storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('finance_app_token') : null;
      if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;
    }

    const res = await fetch('/api/db', { headers });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const serverDb = await res.json();

    const mergedDb = normalizeDbData({
      userInfo: serverDb.userInfo || null,
      familyMembers: serverDb.familyMembers || null,
      categories: Array.isArray(serverDb.categories)
        ? serverDb.categories
        : (serverDb.userInfo?.username === 'togom' ? DEFAULT_CATEGORIES : []),
      incomeCategories: Array.isArray(serverDb.incomeCategories)
        ? serverDb.incomeCategories
        : (serverDb.userInfo?.username === 'togom' ? DEFAULT_INCOME_CATEGORIES : []),
      accounts: serverDb.accounts || [],
      transactions: serverDb.transactions || [],
      monthlyBudgets: serverDb.monthlyBudgets || {},
      monthlyAssetSnapshots: serverDb.monthlyAssetSnapshots || {},
      customBudgetPresets: (serverDb.customBudgetPresets && Object.keys(serverDb.customBudgetPresets).length > 0)
        ? serverDb.customBudgetPresets
        : (serverDb.userInfo?.username === 'togom' ? { basic: DEFAULT_BASIC_PRESET } : {}),
      activeScenario: serverDb.activeScenario || 'basic',
      assetStructure: serverDb.assetStructure || { cashItems: [], investItems: [], debtItems: [] },
    });

    return mergedDb;
  } catch (err) {
    console.warn('⚠️ Server unavailable or error, falling back to default structure:', err);
    return loadDatabase();
  }
}

// 서버 DB에 동기화 요청
async function saveDatabaseToServer(db, token) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('finance_app_token') : null);
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    await fetch('/api/db/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify(db),
    });
  } catch (err) {
    console.error('Failed to sync database to server:', err);
  }
}

let syncTimeout = null;
let pendingDbToSync = null;

export function flushDatabaseSync(token) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (pendingDbToSync) {
    const dataToSync = pendingDbToSync;
    pendingDbToSync = null;
    try {
      saveDatabaseToServer(dataToSync, token);
    } catch (e) {
      console.error('Flush sync failed:', e);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushDatabaseSync();
  });
}

// Supabase DB 저장 (300ms 디바운스 백엔드 디스크 동기화)
export function saveDatabase(db, token) {
  pendingDbToSync = db;

  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    saveDatabaseToServer(db, token);
    pendingDbToSync = null;
  }, 300);
}

export function resetDatabase() {
  localStorage.removeItem(STORAGE_KEY);
  const initialDb = getInitialDbStructure();
  saveDatabase(initialDb);
  return initialDb;
}

