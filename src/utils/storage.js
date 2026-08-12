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
    '기석용돈': 200000,
    '승주용돈': 200000,
  },
};

export function getInitialDbStructure() {
  return {
    categories: DEFAULT_CATEGORIES,
    incomeCategories: DEFAULT_INCOME_CATEGORIES,
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

  // 5. 자산 구조(assetStructure) 기본값 및 복원 보장
  let baseStruct = db.assetStructure || DEFAULT_ASSET_STRUCTURE;
  if (!baseStruct || !baseStruct.cashItems || baseStruct.cashItems.length === 0) {
    baseStruct = DEFAULT_ASSET_STRUCTURE;
  }

  let investItems = Array.isArray(baseStruct.investItems) ? [...baseStruct.investItems] : [...INVEST_ASSET_ITEMS];
  investItems = investItems.map(item => {
    if (item.id === 'inv_realestate' && (item.name === '부동산' || !item.name)) {
      return { ...item, name: '길음뉴타운 6단지', isRealEstate: true };
    }
    return item;
  });

  const knownIds = new Set(investItems.map(i => i.id));
  if (db.monthlyAssetSnapshots && typeof db.monthlyAssetSnapshots === 'object') {
    Object.values(db.monthlyAssetSnapshots).forEach(snap => {
      if (snap && snap.invest && typeof snap.invest === 'object') {
        Object.keys(snap.invest).forEach(k => {
          if (!knownIds.has(k) && k.startsWith('inv_user_')) {
            knownIds.add(k);
            investItems.push({
              id: k,
              name: '종암 SK',
              owner: '가족공동',
              defaultBalance: 0,
              isRealEstate: true,
            });
          }
        });
      }
    });
  }

  db.assetStructure = {
    cashItems: baseStruct.cashItems || CASH_ASSET_ITEMS,
    investItems: investItems,
    debtItems: baseStruct.debtItems || DEBT_ITEMS,
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
      categories: (Array.isArray(serverDb.categories) && serverDb.categories.length > 0) ? serverDb.categories : DEFAULT_CATEGORIES,
      incomeCategories: (Array.isArray(serverDb.incomeCategories) && serverDb.incomeCategories.length > 0) ? serverDb.incomeCategories : DEFAULT_INCOME_CATEGORIES,
      accounts: serverDb.accounts || DEFAULT_ACCOUNTS,
      transactions: serverDb.transactions || [],
      monthlyBudgets: serverDb.monthlyBudgets || {},
      monthlyAssetSnapshots: serverDb.monthlyAssetSnapshots || { '2026-07': getInitialAssetSnapshot(DEFAULT_ASSET_STRUCTURE) },
      customBudgetPresets: (serverDb.customBudgetPresets && Object.keys(serverDb.customBudgetPresets).length > 0)
        ? serverDb.customBudgetPresets
        : { basic: DEFAULT_BASIC_PRESET },
      activeScenario: serverDb.activeScenario || 'basic',
      assetStructure: serverDb.assetStructure || null,
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

