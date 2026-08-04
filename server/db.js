import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// data 디렉토리 자동 생성
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'finance.db');

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // 테이블 생성
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      type TEXT NOT NULL,
      description TEXT,
      memo TEXT,
      account TEXT,
      payment_method TEXT,
      asset_type TEXT,
      owner TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS monthly_budgets (
      year_month TEXT PRIMARY KEY,
      budget_data TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS monthly_assets (
      year_month TEXT PRIMARY KEY,
      asset_data TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS custom_budget_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT,
      budgets TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return dbInstance;
}

// 전체 DB 조회 (프론트엔드 loadDatabase 호환)
export async function getFullDatabase() {
  const db = await getDb();

  const transactions = await db.all('SELECT * FROM transactions ORDER BY date DESC, id DESC');
  const budgetRows = await db.all('SELECT * FROM monthly_budgets');
  const assetRows = await db.all('SELECT * FROM monthly_assets');
  const presetRows = await db.all('SELECT * FROM custom_budget_presets');
  const settingRows = await db.all('SELECT * FROM settings');

  const monthlyBudgets = {};
  budgetRows.forEach(row => {
    try {
      monthlyBudgets[row.year_month] = JSON.parse(row.budget_data);
    } catch (e) {
      console.error('Failed to parse budget data for', row.year_month, e);
    }
  });

  const monthlyAssetSnapshots = {};
  assetRows.forEach(row => {
    try {
      monthlyAssetSnapshots[row.year_month] = JSON.parse(row.asset_data);
    } catch (e) {
      console.error('Failed to parse asset data for', row.year_month, e);
    }
  });

  const customBudgetPresets = {};
  presetRows.forEach(row => {
    try {
      customBudgetPresets[row.id] = {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        budgets: JSON.parse(row.budgets),
      };
    } catch (e) {
      console.error('Failed to parse preset for', row.id, e);
    }
  });

  const settingsMap = {};
  settingRows.forEach(row => {
    try {
      settingsMap[row.key] = JSON.parse(row.value);
    } catch (e) {
      settingsMap[row.key] = row.value;
    }
  });

  return {
    categories: settingsMap.categories || null,
    accounts: settingsMap.accounts || null,
    transactions: transactions.map(t => ({
      ...t,
      amount: Number(t.amount) || 0,
      subcategory: t.subcategory || '',
      description: t.description || '',
      memo: t.memo || '',
      account: t.account || '',
      payment_method: t.payment_method || '',
      asset_type: t.asset_type || '',
      owner: t.owner || '',
    })),
    monthlyBudgets,
    monthlyAssetSnapshots,
    customBudgetPresets,
    activeScenario: settingsMap.activeScenario || 'basic',
    assetStructure: settingsMap.assetStructure || null,
  };
}

// 전체 DB 일괄 저장/동기화 (프론트엔드 saveDatabase / 마이그레이션 호환) - 동시성 큐 적용
let syncQueue = Promise.resolve();

export function syncFullDatabase(fullDb) {
  syncQueue = syncQueue.then(() => performSync(fullDb)).catch(err => {
    console.error('Sync queue error:', err);
  });
  return syncQueue;
}

async function performSync(fullDb) {
  const db = await getDb();

  try {
    await db.exec('BEGIN TRANSACTION');
  } catch (e) {
    // 이미 트랜잭션 진행 중일 경우 무시하고 진행
  }

  try {
    // 1. 거래 데이터 동기화
    await db.run('DELETE FROM transactions');
    if (Array.isArray(fullDb.transactions)) {
      const stmt = await db.prepare(`
        INSERT INTO transactions (id, date, amount, category, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const t of fullDb.transactions) {
        await stmt.run(
          t.id || String(Date.now() + Math.random()),
          t.date || '',
          Number(t.amount) || 0,
          t.category || '',
          t.subcategory || '',
          t.type || '소비',
          t.description || '',
          t.memo || '',
          t.account || '',
          t.payment_method || '',
          t.asset_type || '',
          t.owner || '',
          t.created_at || new Date().toISOString()
        );
      }
      await stmt.finalize();
    }

    // 2. 월별 예산 동기화
    await db.run('DELETE FROM monthly_budgets');
    if (fullDb.monthlyBudgets && typeof fullDb.monthlyBudgets === 'object') {
      const stmt = await db.prepare(`
        INSERT INTO monthly_budgets (year_month, budget_data, updated_at)
        VALUES (?, ?, ?)
      `);
      for (const [ym, bData] of Object.entries(fullDb.monthlyBudgets)) {
        await stmt.run(ym, JSON.stringify(bData), new Date().toISOString());
      }
      await stmt.finalize();
    }

    // 3. 월별 자산 스냅샷 동기화
    await db.run('DELETE FROM monthly_assets');
    if (fullDb.monthlyAssetSnapshots && typeof fullDb.monthlyAssetSnapshots === 'object') {
      const stmt = await db.prepare(`
        INSERT INTO monthly_assets (year_month, asset_data, updated_at)
        VALUES (?, ?, ?)
      `);
      for (const [ym, aData] of Object.entries(fullDb.monthlyAssetSnapshots)) {
        await stmt.run(ym, JSON.stringify(aData), new Date().toISOString());
      }
      await stmt.finalize();
    }

    // 4. 예산 시나리오 프리셋 동기화
    await db.run('DELETE FROM custom_budget_presets');
    if (fullDb.customBudgetPresets && typeof fullDb.customBudgetPresets === 'object') {
      const stmt = await db.prepare(`
        INSERT INTO custom_budget_presets (id, name, created_at, budgets)
        VALUES (?, ?, ?, ?)
      `);
      for (const [pId, preset] of Object.entries(fullDb.customBudgetPresets)) {
        await stmt.run(
          preset.id || pId,
          preset.name || pId,
          preset.createdAt || new Date().toISOString(),
          JSON.stringify(preset.budgets || {})
        );
      }
      await stmt.finalize();
    }

    // 5. 설정을 저장
    if (fullDb.categories) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['categories', JSON.stringify(fullDb.categories)]);
    }
    if (fullDb.accounts) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['accounts', JSON.stringify(fullDb.accounts)]);
    }
    if (fullDb.activeScenario) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['activeScenario', JSON.stringify(fullDb.activeScenario)]);
    }
    if (fullDb.assetStructure) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['assetStructure', JSON.stringify(fullDb.assetStructure)]);
    }

    await db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (_) {}
    console.error('Error syncing full DB:', err);
    throw err;
  }
}

