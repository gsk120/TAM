import pg from 'pg';
import bcrypt from 'bcryptjs';

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

    // PostgreSQL 테이블 생성 및 멀티테넌시(user_id) 스키마 업그레이드
    try {
      await pgPoolInstance.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          household_name TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

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
      await pgPoolInstance.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id TEXT;`);

      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS monthly_budgets (year_month TEXT PRIMARY KEY, budget_data TEXT NOT NULL, updated_at TEXT);`);
      await pgPoolInstance.query(`ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS user_id TEXT;`);

      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS monthly_assets (year_month TEXT PRIMARY KEY, asset_data TEXT NOT NULL, updated_at TEXT);`);
      await pgPoolInstance.query(`ALTER TABLE monthly_assets ADD COLUMN IF NOT EXISTS user_id TEXT;`);

      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS custom_budget_presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT, budgets TEXT NOT NULL);`);
      await pgPoolInstance.query(`ALTER TABLE custom_budget_presets ADD COLUMN IF NOT EXISTS user_id TEXT;`);

      await pgPoolInstance.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      await pgPoolInstance.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id TEXT;`);

      // togom 대표 계정 생성 및 기존 NULL 데이터 마이그레이션
      await migrateDefaultUser(pgPoolInstance);

    } catch (err) {
      console.warn('⚠️ Schema check / Migration note:', err.message);
    }
    console.log('✅ Connected to Supabase PostgreSQL Database with Multi-tenancy');
  }
  return pgPoolInstance;
}

// 기본 togom 계정 생성 및 기존 NULL user_id 데이터 자동 이관
async function migrateDefaultUser(pool) {
  const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['togom']);
  let defaultUserId;

  if (userCheck.rows.length === 0) {
    defaultUserId = 'user_togom_' + Date.now();
    const hashedPw = await bcrypt.hash('1122', 10);
    await pool.query(
      `INSERT INTO users (id, username, password_hash, household_name, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [defaultUserId, 'togom', hashedPw, '기석 & 승주 가족 가계부', new Date().toISOString()]
    );
    console.log('✨ Created default user: togom (ID:', defaultUserId, ')');
  } else {
    defaultUserId = userCheck.rows[0].id;
  }

  // 기존 user_id가 NULL인 레코드들을 defaultUserId로 이관
  await pool.query('UPDATE transactions SET user_id = $1 WHERE user_id IS NULL OR user_id = \'\'', [defaultUserId]);
  await pool.query('UPDATE monthly_budgets SET user_id = $1 WHERE user_id IS NULL OR user_id = \'\'', [defaultUserId]);
  await pool.query('UPDATE monthly_assets SET user_id = $1 WHERE user_id IS NULL OR user_id = \'\'', [defaultUserId]);
  await pool.query('UPDATE custom_budget_presets SET user_id = $1 WHERE user_id IS NULL OR user_id = \'\'', [defaultUserId]);
  await pool.query('UPDATE settings SET user_id = $1 WHERE user_id IS NULL OR user_id = \'\'', [defaultUserId]);

  // 기본 가족 구성원 세팅 확인 및 등록 (없으면)
  const familyCheck = await pool.query('SELECT * FROM settings WHERE key = $1 AND user_id = $2', ['familyMembers', defaultUserId]);
  if (familyCheck.rows.length === 0) {
    const defaultMembers = [
      { id: 'm1', name: '기석', color: '#3b82f6' },
      { id: 'm2', name: '승주', color: '#ec4899' },
      { id: 'm3', name: '가족공동', color: '#10b981' },
    ];
    await pool.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, user_id = EXCLUDED.user_id`,
      ['familyMembers', defaultUserId, JSON.stringify(defaultMembers)]
    );
  }
}

// 사용자 관련 DB 헬퍼 함수
export async function findUserByUsername(username) {
  const db = await getDb();
  const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  return res.rows[0] || null;
}

export async function getUserById(id) {
  const db = await getDb();
  const res = await db.query('SELECT id, username, household_name, created_at FROM users WHERE id = $1', [id]);
  return res.rows[0] || null;
}

export async function createUser({ username, password, household_name, initial_members }) {
  const db = await getDb();
  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const hashedPw = await bcrypt.hash(password, 10);
  
  await db.query(
    `INSERT INTO users (id, username, password_hash, household_name, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, username, hashedPw, household_name || `${username}의 가계부`, new Date().toISOString()]
  );

  // 초기 가족 구성원 세팅
  const members = Array.isArray(initial_members) && initial_members.length > 0
    ? initial_members.map((name, idx) => ({ id: `m_${idx}`, name: name.trim(), color: ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5] }))
    : [
        { id: 'm1', name: username, color: '#3b82f6' },
        { id: 'm2', name: '가족공동', color: '#10b981' },
      ];

  await db.query(
    `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)`,
    ['familyMembers', userId, JSON.stringify(members)]
  );

  return { id: userId, username, household_name: household_name || `${username}의 가계부` };
}

// 특정 user_id의 전체 DB 조회
export async function getFullDatabase(userId) {
  const db = await getDb();
  if (!userId) throw new Error('user_id is required to fetch database');

  const tRes = await db.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC', [userId]);
  const bRes = await db.query('SELECT * FROM monthly_budgets WHERE user_id = $1', [userId]);
  const aRes = await db.query('SELECT * FROM monthly_assets WHERE user_id = $1', [userId]);
  const pRes = await db.query('SELECT * FROM custom_budget_presets WHERE user_id = $1', [userId]);
  const sRes = await db.query('SELECT * FROM settings WHERE user_id = $1', [userId]);
  const uRes = await db.query('SELECT id, username, household_name FROM users WHERE id = $1', [userId]);

  const transactionsRows = tRes.rows;
  const budgetRows = bRes.rows;
  const assetRows = aRes.rows;
  const presetRows = pRes.rows;
  const settingRows = sRes.rows;
  const userInfo = uRes.rows[0] || {};

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
    userInfo: {
      id: userInfo.id,
      username: userInfo.username,
      householdName: userInfo.household_name || '우리집 가족 가계부',
    },
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
    familyMembers: settingsMap.familyMembers || [
      { id: 'm1', name: '기석', color: '#3b82f6' },
      { id: 'm2', name: '승주', color: '#ec4899' },
      { id: 'm3', name: '가족공동', color: '#10b981' },
    ],
  };
}

let syncQueue = Promise.resolve();

export function syncFullDatabase(userId, fullDb) {
  syncQueue = syncQueue.then(() => performSync(userId, fullDb)).catch(err => {
    console.error('Sync queue error:', err);
  });
  return syncQueue;
}

async function performSync(userId, fullDb) {
  if (!userId) throw new Error('userId is required to sync database');

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. 거래 데이터 동기화 (해당 userId 레코드만 삭제 후 이관)
    await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    if (Array.isArray(fullDb.transactions)) {
      for (const t of fullDb.transactions) {
        await client.query(
          `INSERT INTO transactions (id, user_id, date, amount, category, category_id, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            t.id || String(Date.now() + Math.random()),
            userId,
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
    await client.query('DELETE FROM monthly_budgets WHERE user_id = $1', [userId]);
    if (fullDb.monthlyBudgets && typeof fullDb.monthlyBudgets === 'object') {
      for (const [ym, bData] of Object.entries(fullDb.monthlyBudgets)) {
        await client.query(
          `INSERT INTO monthly_budgets (year_month, user_id, budget_data, updated_at) VALUES ($1, $2, $3, $4)`,
          [ym, userId, JSON.stringify(bData), new Date().toISOString()]
        );
      }
    }

    // 3. 월별 자산 스냅샷 동기화
    await client.query('DELETE FROM monthly_assets WHERE user_id = $1', [userId]);
    if (fullDb.monthlyAssetSnapshots && typeof fullDb.monthlyAssetSnapshots === 'object') {
      for (const [ym, aData] of Object.entries(fullDb.monthlyAssetSnapshots)) {
        await client.query(
          `INSERT INTO monthly_assets (year_month, user_id, asset_data, updated_at) VALUES ($1, $2, $3, $4)`,
          [ym, userId, JSON.stringify(aData), new Date().toISOString()]
        );
      }
    }

    // 4. 예산 시나리오 프리셋 동기화
    await client.query('DELETE FROM custom_budget_presets WHERE user_id = $1', [userId]);
    if (fullDb.customBudgetPresets && typeof fullDb.customBudgetPresets === 'object') {
      for (const [pId, preset] of Object.entries(fullDb.customBudgetPresets)) {
        await client.query(
          `INSERT INTO custom_budget_presets (id, user_id, name, created_at, budgets) VALUES ($1, $2, $3, $4, $5)`,
          [
            preset.id || pId,
            userId,
            preset.name || pId,
            preset.createdAt || new Date().toISOString(),
            JSON.stringify(preset.budgets || {}),
          ]
        );
      }
    }

    // 5. 설정을 저장 (UPSERT per userId)
    const saveSetting = async (key, val) => {
      await client.query(
        `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, user_id = EXCLUDED.user_id`,
        [key, userId, JSON.stringify(val)]
      );
    };

    if (fullDb.categories) await saveSetting('categories', fullDb.categories);
    if (fullDb.incomeCategories) await saveSetting('incomeCategories', fullDb.incomeCategories);
    if (fullDb.accounts) await saveSetting('accounts', fullDb.accounts);
    if (fullDb.activeScenario) await saveSetting('activeScenario', fullDb.activeScenario);
    if (fullDb.assetStructure) await saveSetting('assetStructure', fullDb.assetStructure);
    if (fullDb.familyMembers) await saveSetting('familyMembers', fullDb.familyMembers);

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error syncing PostgreSQL DB for user:', userId, err);
    throw err;
  } finally {
    client.release();
  }
}

