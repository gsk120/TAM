import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pgPoolInstance = null;
let sqliteDbInstance = null;

// 동적 Postgres 유무 판별
export function getIsPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

// 활성화된 DB 엔진 이름 반환
export function getDbEngineName() {
  return getIsPostgres() ? 'PostgreSQL (Supabase)' : 'SQLite';
}

// 데이터베이스 초기화 및 인스턴스 획득
export async function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  const isPostgres = Boolean(dbUrl);

  if (isPostgres) {
    if (!pgPoolInstance) {
      pgPoolInstance = new Pool({
        connectionString: dbUrl,
        ssl: {
          rejectUnauthorized: false,
        },
      });

      // PostgreSQL 테이블 생성
      await pgPoolInstance.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          amount BIGINT NOT NULL,
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
      console.log('✅ Connected to Supabase PostgreSQL Database');
    }
    return pgPoolInstance;
  } else {
    if (sqliteDbInstance) return sqliteDbInstance;

    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'finance.db');

    sqliteDbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // SQLite 테이블 생성
    await sqliteDbInstance.exec(`
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
    console.log('✅ Connected to SQLite Database');
    return sqliteDbInstance;
  }
}

// 전체 DB 조회 (프론트엔드 loadDatabase 호환)
export async function getFullDatabase() {
  const isPostgres = getIsPostgres();
  const db = await getDb();

  let transactionsRows = [];
  let budgetRows = [];
  let assetRows = [];
  let presetRows = [];
  let settingRows = [];

  if (isPostgres) {
    const tRes = await db.query('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    const bRes = await db.query('SELECT * FROM monthly_budgets');
    const aRes = await db.query('SELECT * FROM monthly_assets');
    const pRes = await db.query('SELECT * FROM custom_budget_presets');
    const sRes = await db.query('SELECT * FROM settings');

    transactionsRows = tRes.rows;
    budgetRows = bRes.rows;
    assetRows = aRes.rows;
    presetRows = pRes.rows;
    settingRows = sRes.rows;
  } else {
    transactionsRows = await db.all('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    budgetRows = await db.all('SELECT * FROM monthly_budgets');
    assetRows = await db.all('SELECT * FROM monthly_assets');
    presetRows = await db.all('SELECT * FROM custom_budget_presets');
    settingRows = await db.all('SELECT * FROM settings');
  }

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
    transactions: transactionsRows.map(t => ({
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

// 전체 DB 일괄 저장/동기화 (프론트엔드 saveDatabase / 마이그레이션 호환)
let syncQueue = Promise.resolve();

export function syncFullDatabase(fullDb) {
  syncQueue = syncQueue.then(() => performSync(fullDb)).catch(err => {
    console.error('Sync queue error:', err);
  });
  return syncQueue;
}

async function performSync(fullDb) {
  const isPostgres = getIsPostgres();
  const db = await getDb();

  if (isPostgres) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. 거래 데이터 동기화
      await client.query('DELETE FROM transactions');
      if (Array.isArray(fullDb.transactions)) {
        for (const t of fullDb.transactions) {
          await client.query(
            `INSERT INTO transactions (id, date, amount, category, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
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
              t.created_at || new Date().toISOString(),
            ]
          );
        }
      }

      // 2. 월별 예산 동기화
      await client.query('DELETE FROM monthly_budgets');
      if (fullDb.monthlyBudgets && typeof fullDb.monthlyBudgets === 'object') {
        for (const [ym, bData] of Object.entries(fullDb.monthlyBudgets)) {
          await client.query(
            `INSERT INTO monthly_budgets (year_month, budget_data, updated_at) VALUES ($1, $2, $3)`,
            [ym, JSON.stringify(bData), new Date().toISOString()]
          );
        }
      }

      // 3. 월별 자산 스냅샷 동기화
      await client.query('DELETE FROM monthly_assets');
      if (fullDb.monthlyAssetSnapshots && typeof fullDb.monthlyAssetSnapshots === 'object') {
        for (const [ym, aData] of Object.entries(fullDb.monthlyAssetSnapshots)) {
          await client.query(
            `INSERT INTO monthly_assets (year_month, asset_data, updated_at) VALUES ($1, $2, $3)`,
            [ym, JSON.stringify(aData), new Date().toISOString()]
          );
        }
      }

      // 4. 예산 시나리오 프리셋 동기화
      await client.query('DELETE FROM custom_budget_presets');
      if (fullDb.customBudgetPresets && typeof fullDb.customBudgetPresets === 'object') {
        for (const [pId, preset] of Object.entries(fullDb.customBudgetPresets)) {
          await client.query(
            `INSERT INTO custom_budget_presets (id, name, created_at, budgets) VALUES ($1, $2, $3, $4)`,
            [
              preset.id || pId,
              preset.name || pId,
              preset.createdAt || new Date().toISOString(),
              JSON.stringify(preset.budgets || {}),
            ]
          );
        }
      }

      // 5. 설정을 저장 (UPSERT)
      const saveSetting = async (key, val) => {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, JSON.stringify(val)]
        );
      };

      if (fullDb.categories) await saveSetting('categories', fullDb.categories);
      if (fullDb.accounts) await saveSetting('accounts', fullDb.accounts);
      if (fullDb.activeScenario) await saveSetting('activeScenario', fullDb.activeScenario);
      if (fullDb.assetStructure) await saveSetting('assetStructure', fullDb.assetStructure);

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error syncing PostgreSQL DB:', err);
      throw err;
    } finally {
      client.release();
    }
  } else {
    // SQLite 마이그레이션 및 동기화 기존 로직
    try {
      await db.exec('BEGIN TRANSACTION');
    } catch (e) {}

    try {
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
      console.error('Error syncing SQLite DB:', err);
      throw err;
    }
  }
}
