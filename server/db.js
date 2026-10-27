import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'node:crypto';
import { applyAssetImport, buildAssetReview, currentKstMonth, emptyImportMappings } from './asset-import.js';

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

      // 복합 기본키(Composite PK) 마이그레이션 수행
      await migrateCompositeKeys(pgPoolInstance);

      // 카테고리 costType 표준 코드값 마이그레이션 수행
      await migrateCategoryCostTypes(pgPoolInstance);

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
      [defaultUserId, 'togom', hashedPw, '우리 가족 가계부', new Date().toISOString()]
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
      { id: 'm1', name: '남편', color: '#3b82f6' },
      { id: 'm2', name: '아내', color: '#ec4899' },
      { id: 'm3', name: '가족공동', color: '#10b981' },
    ];
    await pool.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['familyMembers', defaultUserId, JSON.stringify(defaultMembers)]
    );
  }
}

// 복합 기본키(Composite PK) 마이그레이션
async function migrateCompositeKeys(pool) {
  try {
    await pool.query(`DELETE FROM settings a USING settings b WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.key = b.key;`);
    await pool.query(`ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;`);
    await pool.query(`ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (user_id, key);`);
  } catch (e) {
    console.warn('settings_pkey migration note:', e.message);
  }

  try {
    await pool.query(`DELETE FROM transactions a USING transactions b WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.id = b.id;`);
    await pool.query(`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_pkey;`);
    await pool.query(`ALTER TABLE transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (user_id, id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);`);
  } catch (e) {
    console.warn('transactions_pkey migration note:', e.message);
  }

  try {
    await pool.query(`DELETE FROM monthly_budgets a USING monthly_budgets b WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.year_month = b.year_month;`);
    await pool.query(`ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_pkey;`);
    await pool.query(`ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_pkey PRIMARY KEY (user_id, year_month);`);
  } catch (e) {
    console.warn('monthly_budgets_pkey migration note:', e.message);
  }

  try {
    await pool.query(`DELETE FROM monthly_assets a USING monthly_assets b WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.year_month = b.year_month;`);
    await pool.query(`ALTER TABLE monthly_assets DROP CONSTRAINT IF EXISTS monthly_assets_pkey;`);
    await pool.query(`ALTER TABLE monthly_assets ADD CONSTRAINT monthly_assets_pkey PRIMARY KEY (user_id, year_month);`);
  } catch (e) {
    console.warn('monthly_assets_pkey migration note:', e.message);
  }

  try {
    await pool.query(`DELETE FROM custom_budget_presets a USING custom_budget_presets b WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.id = b.id;`);
    await pool.query(`ALTER TABLE custom_budget_presets DROP CONSTRAINT IF EXISTS custom_budget_presets_pkey;`);
    await pool.query(`ALTER TABLE custom_budget_presets ADD CONSTRAINT custom_budget_presets_pkey PRIMARY KEY (user_id, id);`);
  } catch (e) {
    console.warn('custom_budget_presets_pkey migration note:', e.message);
  }
}

// 카테고리 costType 표준 코드값(fixed, variable, one_off) 자동 마이그레이션
async function migrateCategoryCostTypes(pool) {
  try {
    const res = await pool.query("SELECT user_id, key, value FROM settings WHERE key = 'categories'");
    for (const row of res.rows) {
      const userId = row.user_id;
      let categories = [];
      try {
        categories = JSON.parse(row.value);
      } catch (e) {
        continue;
      }
      if (!Array.isArray(categories)) continue;

      let modified = false;
      const updatedCategories = categories.map(c => {
        let costType = c.costType;
        if (!costType) {
          if (c.isFixed === true || String(c.isFixed) === 'true' || c.isFixed === 1) {
            costType = 'fixed';
          } else {
            costType = 'variable';
          }
          modified = true;
        } else if (costType === 'one-off') {
          costType = 'one_off';
          modified = true;
        }

        const isFixedBool = (costType === 'fixed');
        if (c.isFixed !== isFixedBool) {
          modified = true;
        }

        return {
          ...c,
          costType,
          isFixed: isFixedBool,
        };
      });

      if (modified) {
        await pool.query(
          "UPDATE settings SET value = $1 WHERE key = 'categories' AND user_id = $2",
          [JSON.stringify(updatedCategories), userId]
        );
        console.log(`✨ Migrated categories costType for user: ${userId}`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Category costType migration note:', err.message);
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

export async function createUser({ username, password, household_name, initial_members, categories, income_categories, initial_budgets }) {
  const pool = await getDb();
  const client = await pool.connect();
  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const hashedPw = await bcrypt.hash(password, 10);
  
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO users (id, username, password_hash, household_name, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, username, hashedPw, household_name || `${username}의 가계부`, now.toISOString()]
    );

    // 1. 초기 가족 구성원 세팅
    const members = Array.isArray(initial_members) && initial_members.length > 0
      ? initial_members.map((name, idx) => ({ id: `m_${idx}`, name: name.trim(), color: ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5] }))
      : [
          { id: 'm1', name: '남편', color: '#3b82f6' },
          { id: 'm2', name: '아내', color: '#ec4899' },
          { id: 'm3', name: '가족공동', color: '#10b981' },
        ];

    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['familyMembers', userId, JSON.stringify(members)]
    );

    // 2. 수입 카테고리 세팅
    const finalIncomeCategories = Array.isArray(income_categories) && income_categories.length > 0
      ? income_categories
      : [
          { id: 'inc_salary', name: '월급', owner: members[0]?.name || '가족공동' },
          { id: 'inc_bonus', name: '상여', owner: members[0]?.name || '가족공동' },
          { id: 'inc_etc', name: '기타수입', owner: '가족공동' },
        ];

    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['incomeCategories', userId, JSON.stringify(finalIncomeCategories)]
    );

    // 3. 지출 카테고리 세팅
    const finalCategories = Array.isArray(categories) && categories.length > 0
      ? categories
      : [
          { id: 'cat_food', name: '식비', defaultBudget: 600000, isFixed: false, type: '지출' },
          { id: 'cat_house', name: '주거비', defaultBudget: 300000, isFixed: true, type: '지출' },
          { id: 'cat_comm', name: '통신비', defaultBudget: 100000, isFixed: true, type: '지출' },
          { id: 'cat_trans', name: '교통', defaultBudget: 150000, isFixed: false, type: '지출' },
          { id: 'cat_life', name: '생활고정비', defaultBudget: 200000, isFixed: true, type: '지출' },
          { id: 'cat_etc', name: '기타생활비', defaultBudget: 200000, isFixed: false, type: '지출' },
        ];

    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['categories', userId, JSON.stringify(finalCategories)]
    );

    // 4. 총자산 구조: 완전한 빈 상태(Empty State)로 초기화 (기존 togom 자산 유입 원천 차단)
    const emptyAssetStructure = { cashItems: [], investItems: [], debtItems: [] };
    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['assetStructure', userId, JSON.stringify(emptyAssetStructure)]
    );

    // 5. 기본 시나리오 키 세팅
    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['activeScenario', userId, JSON.stringify('basic')]
    );

    // 6. 초기 카테고리별 예산 매핑 및 프리셋/월별예산 저장
    const budgetsMap = (initial_budgets && typeof initial_budgets === 'object')
      ? initial_budgets
      : finalCategories.reduce((acc, cat) => {
          acc[cat.name] = Number(cat.defaultBudget) || 0;
          return acc;
        }, {});

    // 첫 기본 시나리오 프리셋 저장
    await client.query(
      `INSERT INTO custom_budget_presets (id, user_id, name, created_at, budgets)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, id) DO UPDATE SET budgets = EXCLUDED.budgets`,
      ['basic', userId, '기본안', now.toISOString(), JSON.stringify(budgetsMap)]
    );

    // 당월 월별 예산 레코드 저장
    await client.query(
      `INSERT INTO monthly_budgets (year_month, user_id, budget_data, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, year_month) DO UPDATE SET budget_data = EXCLUDED.budget_data`,
      [currentYearMonth, userId, JSON.stringify(budgetsMap), now.toISOString()]
    );

    await client.query('COMMIT');
    return { id: userId, username, household_name: household_name || `${username}의 가계부` };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during createUser transaction:', err);
    throw err;
  } finally {
    client.release();
  }
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
    categories: settingsMap.categories !== undefined ? settingsMap.categories : null,
    incomeCategories: settingsMap.incomeCategories !== undefined ? settingsMap.incomeCategories : null,
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
    assetStructure: settingsMap.assetStructure || { cashItems: [], investItems: [], debtItems: [] },
    assetImportMappings: settingsMap.assetImportMappings || emptyImportMappings(),
    familyMembers: settingsMap.familyMembers || [
      { id: 'm1', name: '남편', color: '#3b82f6' },
      { id: 'm2', name: '아내', color: '#ec4899' },
      { id: 'm3', name: '가족공동', color: '#10b981' },
    ],
  };
}

// Serialize import/manual asset mutations for one authenticated account.
export async function lockAssetAccount(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`assets:${userId}`]);
}

export async function withAssetTransaction(pool, userId, task) {
  if (!userId) throw new Error('사용자 인증이 필요합니다.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockAssetAccount(client, userId);
    const result = await task(client);
    await client.query('COMMIT');
    return result;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function readAssetImportState(client, userId, month) {
  const settings = await client.query('SELECT key, value FROM settings WHERE user_id=$1 AND key = ANY($2::text[])', [userId, ['assetStructure', 'assetImportMappings', 'familyMembers']]);
  const values = Object.fromEntries(settings.rows.map(r => [r.key, typeof r.value === 'string' ? JSON.parse(r.value) : r.value]));
  const assets = await client.query('SELECT asset_data FROM monthly_assets WHERE user_id=$1 AND year_month=$2', [userId, month]);
  const raw = assets.rows[0]?.asset_data;
  return { structure: values.assetStructure || { cashItems: [], investItems: [], debtItems: [] }, mappings: values.assetImportMappings || emptyImportMappings(), members: values.familyMembers || [{ id: 'm1', name: '남편' }, { id: 'm2', name: '아내' }, { id: 'm3', name: '가족공동' }], snapshot: typeof raw === 'string' ? JSON.parse(raw) : raw || { cash: {}, invest: {}, debt: {} } };
}

export async function previewAssetImport(userId, month, memberId, parsed, pool) {
  pool ||= await getDb();
  return withAssetTransaction(pool, userId, async client => {
    const state = await readAssetImportState(client, userId, month);
    const member = state.members.find(m => m.id === memberId);
    if (!member) throw new Error('구성원을 다시 선택하세요.');
    const eligible = month === currentKstMonth() && parsed.transactionCount > 0;
    return { eligible, member, rows: eligible ? buildAssetReview(parsed, member, state.structure, state.mappings, month) : [], warnings: parsed.warnings, investmentStatus: parsed.investmentStatus, reason: month !== currentKstMonth() ? '현재 월이 아니므로 자산을 갱신하지 않습니다.' : !parsed.transactionCount ? '해당 월 거래가 없어 자산을 반영하지 않습니다.' : '', snapshot: state.snapshot };
  });
}

export async function commitAssetImport(userId, input, parsed, pool) {
  pool ||= await getDb();
  return withAssetTransaction(pool, userId, async client => {
    const state = await readAssetImportState(client, userId, input.month);
    const member = state.members.find(m => m.id === input.memberId);
    if (!member) throw new Error('구성원을 다시 선택하세요.');
    if (input.month !== currentKstMonth()) throw new Error('월이 변경되었거나 과거 월입니다. 자산은 당월에만 반영할 수 있습니다.');
    if (!parsed.transactionCount) throw new Error('해당 월 거래가 없어 자산을 반영하지 않습니다.');
    if (!input.requestId || typeof input.requestId !== 'string' || input.requestId.length > 100) throw new Error('반영 요청을 다시 시작하세요.');
    const fingerprint = createHash('sha256').update(JSON.stringify([input.memberId, input.month, parsed, input.decisions || {}, input.selectionMode || 'legacy'])).digest('hex');
    const existing = state.mappings.requests?.[input.requestId];
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('이미 반영된 요청의 내용이 바뀌었습니다. 파일을 다시 선택하세요.');
      return { ...existing, assetStructure: state.structure, snapshot: state.snapshot, assetImportMappings: state.mappings, replay: true };
    }
    const merged = applyAssetImport({ ...state, parsed, member, month: input.month, decisions: input.decisions || {}, selectionMode: input.selectionMode, now: new Date().toISOString(), makeId: () => `asset_${randomUUID()}` });
    const snapshotUpdated = merged.result.applied.length > 0;
    merged.mappings.requests ||= {};
    merged.mappings.requests[input.requestId] = { result: merged.result, month: input.month, fingerprint, snapshotUpdated };
    const requests = Object.entries(merged.mappings.requests);
    if (requests.length > 100) merged.mappings.requests = Object.fromEntries(requests.slice(-100));
    for (const [key, value] of [['assetStructure', merged.structure], ['assetImportMappings', merged.mappings]]) await client.query('INSERT INTO settings (key,user_id,value) VALUES ($1,$2,$3) ON CONFLICT (user_id,key) DO UPDATE SET value=EXCLUDED.value', [key, userId, JSON.stringify(value)]);
    if (snapshotUpdated) await client.query('INSERT INTO monthly_assets (year_month,user_id,asset_data,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,year_month) DO UPDATE SET asset_data=EXCLUDED.asset_data,updated_at=EXCLUDED.updated_at', [input.month, userId, JSON.stringify(merged.snapshot), new Date().toISOString()]);
    return { result: merged.result, assetStructure: merged.structure, snapshot: snapshotUpdated ? merged.snapshot : state.snapshot, snapshotUpdated, assetImportMappings: merged.mappings, month: input.month };
  });
}

export async function updateImportMapping(userId, key, excluded, pool) {
  pool ||= await getDb();
  return withAssetTransaction(pool, userId, async client => {
    const r = await client.query('SELECT value FROM settings WHERE user_id=$1 AND key=$2', [userId, 'assetImportMappings']);
    const raw = r.rows[0]?.value, mappings = typeof raw === 'string' ? JSON.parse(raw) : raw || emptyImportMappings();
    if (!mappings.entries?.[key]) throw new Error('연결 정보를 찾을 수 없습니다.');
    mappings.entries[key].excluded = excluded;
    await client.query('UPDATE settings SET value=$1 WHERE user_id=$2 AND key=$3', [JSON.stringify(mappings), userId, 'assetImportMappings']);
    return mappings;
  });
}

export async function saveAssetStructureData(userId, structure, pool) {
  pool ||= await getDb();
  return withAssetTransaction(pool, userId, async client => {
    const state = await readAssetImportState(client, userId, currentKstMonth());
    const importedIds = new Set(Object.values(state.mappings.entries || {}).map(m => m.targetId));
    for (const group of ['cashItems', 'investItems', 'debtItems']) {
      if (!Array.isArray(structure[group]) || structure[group].some(i => !i || typeof i.id !== 'string' || typeof i.name !== 'string' || !i.name.trim())) throw new Error('자산 항목 형식을 확인하세요.');
      if (state.structure[group].some(i => importedIds.has(i.id) && !structure[group].some(n => n.id === i.id))) throw new Error('다른 작업에서 자산이 추가되었습니다. 새로고침 후 다시 저장하세요.');
    }
    await client.query('INSERT INTO settings (key,user_id,value) VALUES ($1,$2,$3) ON CONFLICT (user_id,key) DO UPDATE SET value=EXCLUDED.value', ['assetStructure', userId, JSON.stringify(structure)]);
  });
}

export async function saveManualAssetSnapshot(userId, month, snapshot, pool) {
  pool ||= await getDb();
  return withAssetTransaction(pool, userId, async client => {
    const state = await readAssetImportState(client, userId, month);
    // Import provenance is server-owned; manual inputs only replace numeric groups.
    const result = { ...state.snapshot };
    for (const group of ['cash', 'invest', 'debt']) {
      if (!snapshot[group] || Array.isArray(snapshot[group]) || typeof snapshot[group] !== 'object') throw new Error('잔액 형식을 확인하세요.');
      result[group] = {};
      for (const [id, amount] of Object.entries(snapshot[group])) {
        if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('유효한 숫자를 입력하세요.');
        result[group][id] = amount;
      }
    }
    await client.query('INSERT INTO monthly_assets (year_month,user_id,asset_data,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,year_month) DO UPDATE SET asset_data=EXCLUDED.asset_data,updated_at=EXCLUDED.updated_at', [month, userId, JSON.stringify(result), new Date().toISOString()]);
    return result;
  });
}

export async function removeAssetData(userId, { month, group, id }, pool) {
  pool ||= await getDb();
  return withAssetTransaction(pool, userId, async client => {
    if (month) { await client.query('DELETE FROM monthly_assets WHERE user_id=$1 AND year_month=$2', [userId, month]); return; }
    const state = await readAssetImportState(client, userId, currentKstMonth());
    state.structure[group] = state.structure[group].filter(i => i.id !== id);
    for (const m of Object.values(state.mappings.entries || {})) if (m.targetId === id) m.excluded = true;
    for (const [key, value] of [['assetStructure', state.structure], ['assetImportMappings', state.mappings]]) await client.query('INSERT INTO settings (key,user_id,value) VALUES ($1,$2,$3) ON CONFLICT (user_id,key) DO UPDATE SET value=EXCLUDED.value', [key, userId, JSON.stringify(value)]);
    const snapshots = await client.query('SELECT year_month,asset_data FROM monthly_assets WHERE user_id=$1', [userId]);
    for (const row of snapshots.rows) {
      const data = typeof row.asset_data === 'string' ? JSON.parse(row.asset_data) : row.asset_data;
      delete data[{ cashItems: 'cash', investItems: 'invest', debtItems: 'debt' }[group]]?.[id];
      if (data.importData) {
        for (const [key, source] of Object.entries(data.importData.sources || {})) if (source.targetId === id) delete data.importData.sources[key];
        for (const [key, broker] of Object.entries(data.importData.brokerages || {})) if (broker.targetId === id) delete data.importData.brokerages[key];
      }
      await client.query('UPDATE monthly_assets SET asset_data=$1,updated_at=$2 WHERE user_id=$3 AND year_month=$4', [JSON.stringify(data), new Date().toISOString(), userId, row.year_month]);
    }
    return state.mappings;
  });
}

let syncQueue = Promise.resolve();

export function syncFullDatabase(userId, fullDb) {
  const operation = syncQueue.then(() => performSync(userId, fullDb));
  syncQueue = operation.catch(err => {
    console.error('Sync queue error:', err);
  });
  return operation;
}

async function performSync(userId, fullDb) {
  if (!userId) throw new Error('userId is required to sync database');

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. 거래 데이터 동기화 (해당 userId 레코드만 삭제 후 이관)
    // Transactions are persisted exclusively through their CRUD endpoints.
    // Whole-database sync must not delete or restore transaction snapshots.
    if (process.env.ENABLE_LEGACY_TRANSACTION_FULL_SYNC === 'true' && Array.isArray(fullDb.transactions)) {
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
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
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



// AI storage is independent from full-database replacement.
const AI_KINDS = new Set(['conversation', 'message', 'job', 'device', 'pair']);
let aiSchemaPromise;
export async function initializeAiSchema(pool) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['ai:schema']);
    await client.query(`CREATE TABLE IF NOT EXISTS ai_records (
      user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
      id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY (user_id,kind,id)
    );
    CREATE INDEX IF NOT EXISTS ai_records_credential_idx ON ai_records(kind,id) WHERE kind IN ('device','pair');
    CREATE INDEX IF NOT EXISTS ai_records_conversation_idx ON ai_records(user_id,kind,(data->>'conversationId'));
    CREATE INDEX IF NOT EXISTS ai_records_jobs_idx ON ai_records(kind,(data->>'status'),(data->>'createdAt')) WHERE kind='job';
    CREATE INDEX IF NOT EXISTS ai_records_job_id_idx ON ai_records(id) WHERE kind='job';
    CREATE TABLE IF NOT EXISTS ai_workers (kind TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS ai_migrations (id TEXT PRIMARY KEY);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_paid BOOLEAN NOT NULL DEFAULT FALSE;
`);
    const marker=await client.query('INSERT INTO ai_migrations(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id', ['paid-admin-v1']);
    if(marker.rows.length)await client.query('UPDATE users SET ai_paid=TRUE WHERE username=$1', ['togom']);
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export async function ensureAiSchema() {
  if(!aiSchemaPromise)aiSchemaPromise=getDb().then(initializeAiSchema).catch(error=>{aiSchemaPromise=undefined;throw error;});
  return aiSchemaPromise;
}
export async function aiUserAccess(userId) {
  await ensureAiSchema();
  const pool=await getDb();
  const result=await pool.query('SELECT ai_paid FROM users WHERE id=$1',[userId]);
  return {paid:result.rows[0]?.ai_paid===true};
}
function aiUserStore(client,userId) {
  if(!userId)throw new Error('AI user_id required');
  const check=kind=>{if(!AI_KINDS.has(kind))throw new Error('Invalid AI kind');};
  return {
    async get(kind,id) {
      check(kind);
      const r=await client.query('SELECT data FROM ai_records WHERE user_id=$1 AND kind=$2 AND id=$3',[userId,kind,id]);
      return r.rows[0]?.data||null;
    },
    async list(kind,conversationId=null) {
      check(kind);
      const r=await client.query(`SELECT data FROM ai_records WHERE user_id=$1 AND kind=$2 AND ($3::text IS NULL OR data->>'conversationId'=$3) ORDER BY data->>'createdAt',id`,[userId,kind,conversationId]);
      return r.rows.map(row=>row.data);
    },
    async put(kind,id,data) {
      check(kind);
      await client.query(`INSERT INTO ai_records(user_id,kind,id,data) VALUES($1,$2,$3,$4::jsonb)
        ON CONFLICT(user_id,kind,id) DO UPDATE SET data=EXCLUDED.data`,[userId,kind,id,JSON.stringify(data)]);
      return data;
    },
    async remove(kind,id) {check(kind);await client.query('DELETE FROM ai_records WHERE user_id=$1 AND kind=$2 AND id=$3',[userId,kind,id]);},
  };
}
async function aiTransaction(operation) {
  await ensureAiSchema();
  const client=await (await getDb()).connect();
  try{
    await client.query('BEGIN');
    // Shared by web writes and worker assignment across all AP instances.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ai:shared-workers']);
    const result=await operation(client);
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export const aiWithUser=(userId,operation)=>aiTransaction(client=>operation(aiUserStore(client,userId)));
export const aiWithWorker=operation=>aiTransaction(client=>operation({
  async get(kind,id){const r=await client.query('SELECT data FROM ai_workers WHERE kind=$1 AND id=$2',[kind,id]);return r.rows[0]?.data||null;},
  async list(kind){const r=await client.query("SELECT data FROM ai_workers WHERE kind=$1 ORDER BY data->>'createdAt',id",[kind]);return r.rows.map(row=>row.data);},
  async put(kind,id,data){await client.query('INSERT INTO ai_workers(kind,id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data',[kind,id,JSON.stringify(data)]);},
  async remove(kind,id){await client.query('DELETE FROM ai_workers WHERE kind=$1 AND id=$2',[kind,id]);},
  // Only the authenticated worker path can resolve owners across accounts.
  async listJobs(){const r=await client.query(`SELECT user_id,data FROM ai_records WHERE kind=$1 AND data->>'status'=ANY($2::text[]) AND data->>'provider'=$3 ORDER BY data->>'createdAt',id`,['job',['queued','running'],'local_cli']);return r.rows.map(row=>({userId:row.user_id,job:row.data}));},
  async findJob(id){const r=await client.query('SELECT user_id,data FROM ai_records WHERE kind=$1 AND id=$2',['job',id]);return r.rows[0]?{userId:r.rows[0].user_id,job:r.rows[0].data}:null;},
  async sessionUsed(sessionId,userId,conversationId){const r=await client.query(`SELECT 1 FROM ai_records WHERE kind=$1 AND data->>'sessionId'=$2 AND NOT(user_id=$3 AND id=$4) LIMIT 1`,['conversation',sessionId,userId,conversationId]);return r.rows.length>0;},
  forUser:userId=>aiUserStore(client,userId),
}));
