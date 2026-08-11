import pg from 'pg';

const { Pool } = pg;

let pgPoolInstance = null;

export function getIsPostgres() {
  return true;
}

export function getDbEngineName() {
  return 'PostgreSQL (Supabase)';
}

// Supabase PostgreSQL 데이터베이스 초기화 및 풀 인스턴스 획득
export async function getDb() {
  const dbUrl = process.env.DATABASE_URL;

  if (!pgPoolInstance) {
    pgPoolInstance = new Pool({
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    // PostgreSQL 테이블 생성 (pgBouncer 호환 개별 처리)
    try {
      await pgPoolInstance.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          amount BIGINT NOT NULL,
          category TEXT NOT NULL,
          category_id TEXT,
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
      `);
      await pgPoolInstance.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_id TEXT;`);
      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS monthly_budgets (year_month TEXT PRIMARY KEY, budget_data TEXT NOT NULL, updated_at TEXT);`);
      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS monthly_assets (year_month TEXT PRIMARY KEY, asset_data TEXT NOT NULL, updated_at TEXT);`);
      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS custom_budget_presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT, budgets TEXT NOT NULL);`);
      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    } catch (err) {
      console.warn('⚠️ Schema check note:', err.message);
    }
    console.log('✅ Connected to Supabase PostgreSQL Database');
  }
  return pgPoolInstance;
}

// 전체 DB 조회 (Supabase PostgreSQL 단일 엔진)
export async function getFullDatabase() {
  const db = await getDb();

  const tRes = await db.query('SELECT * FROM transactions ORDER BY date DESC, id DESC');
  const bRes = await db.query('SELECT * FROM monthly_budgets');
  const aRes = await db.query('SELECT * FROM monthly_assets');
  const pRes = await db.query('SELECT * FROM custom_budget_presets');
  const sRes = await db.query('SELECT * FROM settings');

  const transactionsRows = tRes.rows;
  const budgetRows = bRes.rows;
  const assetRows = aRes.rows;
  const presetRows = pRes.rows;
  const settingRows = sRes.rows;

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
    incomeCategories: settingsMap.incomeCategories || null,
    accounts: settingsMap.accounts || null,
    transactions: transactionsRows.map(t => ({
      ...t,
      amount: Number(t.amount) || 0,
      category_id: t.category_id || '',
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

let syncQueue = Promise.resolve();

export function syncFullDatabase(fullDb) {
  syncQueue = syncQueue.then(() => performSync(fullDb)).catch(err => {
    console.error('Sync queue error:', err);
  });
  return syncQueue;
}

async function performSync(fullDb) {
  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. 거래 데이터 동기화
    await client.query('DELETE FROM transactions');
    if (Array.isArray(fullDb.transactions)) {
      for (const t of fullDb.transactions) {
        await client.query(
          `INSERT INTO transactions (id, date, amount, category, category_id, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            t.id || String(Date.now() + Math.random()),
            t.date || '',
            Number(t.amount) || 0,
            t.category || '',
            t.category_id || '',
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
    if (fullDb.incomeCategories) await saveSetting('incomeCategories', fullDb.incomeCategories);
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
}
