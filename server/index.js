import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { getDb, getFullDatabase, syncFullDatabase, getIsPostgres, getDbEngineName, findUserByUsername, createUser, getUserById } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'household_asset_management_jwt_secret_2026';

function normalizeTransaction(transaction, fallbackId = String(Date.now())) {
  return {
    id: transaction.id || fallbackId,
    date: transaction.date || '', amount: Number(transaction.amount) || 0,
    category: transaction.category || '', category_id: transaction.category_id || '', subcategory: transaction.subcategory || '',
    type: transaction.type || '지출', description: transaction.description || '', memo: transaction.memo || '',
    account: transaction.account || '', payment_method: transaction.payment_method || '', asset_type: transaction.asset_type || '',
    owner: transaction.owner || '', created_at: transaction.created_at || new Date().toISOString(),
  };
}

function transactionParams(t, userId) {
  return [t.id, userId, t.date, t.amount, t.category, t.category_id, t.subcategory, t.type, t.description, t.memo, t.account, t.payment_method, t.asset_type, t.owner, t.created_at];
}

const insertTransactionSql = `INSERT INTO transactions (id, user_id, date, amount, category, category_id, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth 미들웨어 (JWT 검증)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }
    req.user = user;
    next();
  });
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), dbEngine: getDbEngineName() });
});

// ==================== AUTH API ====================

// 1. 회원가입 API
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, household_name, initial_members, categories, income_categories, initial_budgets } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
    }

    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });
    }

    const newUser = await createUser({
      username,
      password,
      household_name,
      initial_members,
      categories,
      income_categories,
      initial_budgets,
    });
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        householdName: newUser.household_name,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '회원가입 실패: ' + err.message });
  }
});

// 2. 로그인 API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        householdName: user.household_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '로그인 실패: ' + err.message });
  }
});

// 3. 내 세션 검증 API
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    res.json({
      id: user.id,
      username: user.username,
      householdName: user.household_name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 가계부 DB API (인증 필요) ====================

// 1. 전체 데이터베이스 조회 (loadDatabase 연동)
app.get('/api/db', authenticateToken, async (req, res) => {
  try {
    const fullDb = await getFullDatabase(req.user.id);
    res.json(fullDb);
  } catch (err) {
    console.error('Failed to get full DB:', err);
    res.status(500).json({ error: 'Failed to retrieve database', details: err.message });
  }
});

// 2. 전체 데이터베이스 동기화/저장 (saveDatabase 연동)
app.post('/api/db/sync', authenticateToken, async (req, res) => {
  try {
    const fullDb = req.body;
    if (!fullDb || typeof fullDb !== 'object') {
      return res.status(400).json({ error: 'Invalid database payload' });
    }
    await syncFullDatabase(req.user.id, fullDb);
    res.json({ success: true, message: 'Database synchronized successfully' });
  } catch (err) {
    console.error('Failed to sync full DB:', err);
    res.status(500).json({ error: 'Failed to synchronize database', details: err.message });
  }
});

const emptyAssetStructure = { cashItems: [], investItems: [], debtItems: [] };

function isValidBackupPayload(data) {
  return data && typeof data === 'object'
    && Array.isArray(data.transactions)
    && Array.isArray(data.categories)
    && Array.isArray(data.incomeCategories)
    && data.monthlyBudgets && typeof data.monthlyBudgets === 'object'
    && data.monthlyAssetSnapshots && typeof data.monthlyAssetSnapshots === 'object'
    && data.customBudgetPresets && typeof data.customBudgetPresets === 'object'
    && data.assetStructure && ['cashItems', 'investItems', 'debtItems'].every(key => Array.isArray(data.assetStructure[key]));
}

async function replaceUserDatabase(client, userId, source) {
  await client.query('DELETE FROM transactions WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM monthly_budgets WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM monthly_assets WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM custom_budget_presets WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM settings WHERE user_id=$1', [userId]);

  for (const [index, transaction] of (source.transactions || []).entries()) {
    const normalized = normalizeTransaction(transaction, `restore_${Date.now()}_${index}`);
    await client.query(insertTransactionSql, transactionParams(normalized, userId));
  }
  for (const [yearMonth, data] of Object.entries(source.monthlyBudgets || {})) {
    await client.query('INSERT INTO monthly_budgets (year_month, user_id, budget_data, updated_at) VALUES ($1, $2, $3, $4)', [yearMonth, userId, JSON.stringify(data), new Date().toISOString()]);
  }
  for (const [yearMonth, data] of Object.entries(source.monthlyAssetSnapshots || {})) {
    await client.query('INSERT INTO monthly_assets (year_month, user_id, asset_data, updated_at) VALUES ($1, $2, $3, $4)', [yearMonth, userId, JSON.stringify(data), new Date().toISOString()]);
  }
  for (const [id, preset] of Object.entries(source.customBudgetPresets || {})) {
    await client.query('INSERT INTO custom_budget_presets (id, user_id, name, created_at, budgets) VALUES ($1, $2, $3, $4, $5)', [preset.id || id, userId, preset.name || id, preset.createdAt || new Date().toISOString(), JSON.stringify(preset.budgets || {})]);
  }
  const settings = {
    categories: source.categories || [],
    incomeCategories: source.incomeCategories || [],
    accounts: source.accounts || [],
    activeScenario: source.activeScenario || 'basic',
    assetStructure: source.assetStructure || emptyAssetStructure,
  };
  if (Array.isArray(source.familyMembers) && source.familyMembers.length > 0) settings.familyMembers = source.familyMembers;
  for (const [key, value] of Object.entries(settings)) {
    await client.query('INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)', [key, userId, JSON.stringify(value)]);
  }
}

app.post('/api/database/restore', authenticateToken, async (req, res) => {
  const backup = req.body?.backup;
  if (!isValidBackupPayload(backup)) return res.status(400).json({ error: 'Invalid backup file format' });
  const db = await getDb(); const client = await db.connect();
  try {
    await client.query('BEGIN');
    await replaceUserDatabase(client, req.user.id, backup);
    await client.query('COMMIT');
    res.json({ success: true, database: await getFullDatabase(req.user.id) });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

app.post('/api/database/reset', authenticateToken, async (req, res) => {
  const initialState = { transactions: [], categories: [], incomeCategories: [], accounts: [], assetStructure: emptyAssetStructure, monthlyBudgets: {}, monthlyAssetSnapshots: {}, customBudgetPresets: {}, activeScenario: 'basic' };
  const db = await getDb(); const client = await db.connect();
  try {
    await client.query('BEGIN');
    await replaceUserDatabase(client, req.user.id, initialState);
    await client.query('COMMIT');
    res.json({ success: true, database: await getFullDatabase(req.user.id) });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// Budget screen state API. It intentionally owns only budget-related data and
// never performs a whole-database or whole-transaction synchronization.
app.put('/api/budget/state', authenticateToken, async (req, res) => {
  const { categories, monthlyBudgets, customBudgetPresets, activeScenario, categoryRename } = req.body || {};
  if (!Array.isArray(categories) || !monthlyBudgets || !customBudgetPresets || !activeScenario) {
    return res.status(400).json({ error: 'Invalid budget state payload' });
  }

  const names = categories.map(category => String(category?.name || '').trim());
  if (names.some(name => !name) || new Set(names).size !== names.length) {
    return res.status(400).json({ error: 'Budget categories must have unique names' });
  }

  const db = await getDb();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (categoryRename?.from && categoryRename?.to && categoryRename.from !== categoryRename.to) {
      await client.query(
        'UPDATE transactions SET category=$1, category_id=$2 WHERE user_id=$3 AND type=$4 AND category=$5',
        [categoryRename.to, categoryRename.categoryId || '', req.user.id, '수입', categoryRename.from],
      );
    }

    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['categories', req.user.id, JSON.stringify(categories)],
    );
    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['activeScenario', req.user.id, JSON.stringify(activeScenario)],
    );

    await client.query('DELETE FROM monthly_budgets WHERE user_id=$1', [req.user.id]);
    for (const [yearMonth, budgetData] of Object.entries(monthlyBudgets)) {
      await client.query(
        'INSERT INTO monthly_budgets (year_month, user_id, budget_data, updated_at) VALUES ($1, $2, $3, $4)',
        [yearMonth, req.user.id, JSON.stringify(budgetData || {}), new Date().toISOString()],
      );
    }

    await client.query('DELETE FROM custom_budget_presets WHERE user_id=$1', [req.user.id]);
    for (const [presetId, preset] of Object.entries(customBudgetPresets)) {
      await client.query(
        'INSERT INTO custom_budget_presets (id, user_id, name, created_at, budgets) VALUES ($1, $2, $3, $4, $5)',
        [preset.id || presetId, req.user.id, preset.name || presetId, preset.createdAt || new Date().toISOString(), JSON.stringify(preset.budgets || {})],
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put('/api/income/categories', authenticateToken, async (req, res) => {
  const { incomeCategories, categoryRename } = req.body || {};
  if (!Array.isArray(incomeCategories) || !incomeCategories.length) {
    return res.status(400).json({ error: 'At least one income category is required' });
  }
  const names = incomeCategories.map(category => String(category?.name || '').trim());
  if (names.some(name => !name) || new Set(names).size !== names.length) {
    return res.status(400).json({ error: 'Income categories must have unique names' });
  }

  const db = await getDb();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (categoryRename?.from && categoryRename?.to && categoryRename.from !== categoryRename.to) {
      await client.query(
        'UPDATE transactions SET category=$1, category_id=$2 WHERE user_id=$3 AND category=$4',
        [categoryRename.to, categoryRename.categoryId || '', req.user.id, categoryRename.from],
      );
    }
    await client.query(
      `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      ['incomeCategories', req.user.id, JSON.stringify(incomeCategories)],
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Family member settings have their own transaction so owner names never become stale.
app.put('/api/family-members', authenticateToken, async (req, res) => {
  const { familyMembers, ownerRename } = req.body || {};
  if (!Array.isArray(familyMembers) || familyMembers.length < 1) return res.status(400).json({ error: 'At least one family member is required' });
  const names = familyMembers.map(member => String(member?.name || '').trim());
  if (names.some(name => !name) || new Set(names).size !== names.length) return res.status(400).json({ error: 'Family member names must be unique' });

  const db = await getDb(); const client = await db.connect();
  const readSetting = async (key, fallback) => {
    const result = await client.query('SELECT value FROM settings WHERE user_id=$1 AND key=$2', [req.user.id, key]);
    if (!result.rows[0]?.value) return fallback;
    try { return JSON.parse(result.rows[0].value); } catch { return fallback; }
  };
  const saveSetting = (key, value) => client.query(`INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, key) DO UPDATE SET value=EXCLUDED.value`, [key, req.user.id, JSON.stringify(value)]);
  try {
    await client.query('BEGIN');
    const existingMembers = await readSetting('familyMembers', []);
    // A renamed member disappears from the old name list, but must be migrated,
    // not treated as a deletion subject to the in-use guard.
    const renamedFrom = ownerRename?.from && ownerRename?.to && ownerRename.from !== ownerRename.to ? ownerRename.from : null;
    const removedNames = existingMembers.map(member => member.name).filter(name => !names.includes(name) && name !== renamedFrom);
    if (removedNames.length) {
      const txUsage = await client.query('SELECT COUNT(*)::int AS count FROM transactions WHERE user_id=$1 AND owner = ANY($2)', [req.user.id, removedNames]);
      const incomeCategories = await readSetting('incomeCategories', []);
      const assetStructure = await readSetting('assetStructure', { cashItems: [], investItems: [], debtItems: [] });
      const settingsUsage = incomeCategories.some(category => removedNames.includes(category.owner))
        || ['cashItems', 'investItems', 'debtItems'].some(group => (assetStructure[group] || []).some(item => removedNames.includes(item.owner)));
      if (Number(txUsage.rows[0]?.count || 0) > 0 || settingsUsage) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: '사용 중인 가족 구성원은 삭제할 수 없습니다.' });
      }
    }

    let incomeCategories = await readSetting('incomeCategories', []);
    let assetStructure = await readSetting('assetStructure', { cashItems: [], investItems: [], debtItems: [] });
    if (ownerRename?.from && ownerRename?.to && ownerRename.from !== ownerRename.to) {
      await client.query('UPDATE transactions SET owner=$1 WHERE user_id=$2 AND owner=$3', [ownerRename.to, req.user.id, ownerRename.from]);
      incomeCategories = incomeCategories.map(category => category.owner === ownerRename.from ? { ...category, owner: ownerRename.to } : category);
      assetStructure = Object.fromEntries(['cashItems', 'investItems', 'debtItems'].map(group => [group, (assetStructure[group] || []).map(item => item.owner === ownerRename.from ? { ...item, owner: ownerRename.to } : item)]));
      await saveSetting('incomeCategories', incomeCategories);
      await saveSetting('assetStructure', assetStructure);
    }
    await saveSetting('familyMembers', familyMembers.map((member, index) => ({ id: member.id || `member_${Date.now()}_${index}`, name: String(member.name).trim(), color: member.color || '#3b82f6' })));
    await client.query('COMMIT');
    res.json({ success: true, incomeCategories, assetStructure });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

app.put('/api/assets/structure', authenticateToken, async (req, res) => {
  const { assetStructure } = req.body || {};
  if (!assetStructure || !Array.isArray(assetStructure.cashItems) || !Array.isArray(assetStructure.investItems) || !Array.isArray(assetStructure.debtItems)) {
    return res.status(400).json({ error: 'Invalid asset structure payload' });
  }
  try {
    const db = await getDb();
    await db.query(`INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, key) DO UPDATE SET value=EXCLUDED.value`, ['assetStructure', req.user.id, JSON.stringify(assetStructure)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/assets/snapshots/:yearMonth', authenticateToken, async (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.yearMonth) || !req.body?.snapshot) return res.status(400).json({ error: 'Invalid asset snapshot payload' });
  try {
    const db = await getDb();
    await db.query(`INSERT INTO monthly_assets (year_month, user_id, asset_data, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, year_month) DO UPDATE SET asset_data=EXCLUDED.asset_data, updated_at=EXCLUDED.updated_at`, [req.params.yearMonth, req.user.id, JSON.stringify(req.body.snapshot), new Date().toISOString()]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/assets/snapshots/:yearMonth', authenticateToken, async (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.yearMonth)) return res.status(400).json({ error: 'Invalid year month' });
  try {
    const db = await getDb();
    await db.query('DELETE FROM monthly_assets WHERE user_id=$1 AND year_month=$2', [req.user.id, req.params.yearMonth]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/assets/items/:group/:id', authenticateToken, async (req, res) => {
  const { group, id } = req.params;
  const snapshotKey = { cashItems: 'cash', investItems: 'invest', debtItems: 'debt' }[group];
  if (!snapshotKey) return res.status(400).json({ error: 'Invalid asset group' });
  const db = await getDb(); const client = await db.connect();
  try {
    await client.query('BEGIN');
    const setting = await client.query('SELECT value FROM settings WHERE user_id=$1 AND key=$2', [req.user.id, 'assetStructure']);
    const storedStructure = setting.rows[0]?.value;
    const structure = typeof storedStructure === 'string' ? JSON.parse(storedStructure) : (storedStructure || { cashItems: [], investItems: [], debtItems: [] });
    structure[group] = (structure[group] || []).filter(item => item.id !== id);
    await client.query(`INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, key) DO UPDATE SET value=EXCLUDED.value`, ['assetStructure', req.user.id, JSON.stringify(structure)]);
    const snapshots = await client.query('SELECT year_month, asset_data FROM monthly_assets WHERE user_id=$1', [req.user.id]);
    for (const row of snapshots.rows) {
      const snapshot = typeof row.asset_data === 'string' ? JSON.parse(row.asset_data) : (row.asset_data || {});
      if (!snapshot[snapshotKey] || !(id in snapshot[snapshotKey])) continue;
      const values = { ...snapshot[snapshotKey] }; delete values[id];
      await client.query('UPDATE monthly_assets SET asset_data=$1, updated_at=$2 WHERE user_id=$3 AND year_month=$4', [JSON.stringify({ ...snapshot, [snapshotKey]: values }), new Date().toISOString(), req.user.id, row.year_month]);
    }
    await client.query('COMMIT'); res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// 3. 가계부 거래 CRUD API
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const resData = await db.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC', [req.user.id]);
    res.json(resData.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const t = req.body;
    const id = t.id || String(Date.now());
    const params = [
      id,
      req.user.id,
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
    ];

    await db.query(
      `INSERT INTO transactions (id, user_id, date, amount, category, category_id, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      params
    );
    res.json({ success: true, transaction: normalizeTransaction({ ...t, id }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const t = normalizeTransaction({ ...req.body, id: req.params.id });
    const result = await db.query(
      `UPDATE transactions SET date=$1, amount=$2, category=$3, category_id=$4, subcategory=$5, type=$6, description=$7, memo=$8, account=$9, payment_method=$10, asset_type=$11, owner=$12, created_at=$13 WHERE id=$14 AND user_id=$15`,
      [t.date, t.amount, t.category, t.category_id, t.subcategory, t.type, t.description, t.memo, t.account, t.payment_method, t.asset_type, t.owner, t.created_at, req.params.id, req.user.id],
    );
    if (result.rowCount === 0) {
      console.warn('[transactions:update:not-found]', { transactionId: req.params.id, userId: req.user.id });
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true, transaction: t });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/transactions/batch', authenticateToken, async (req, res) => {
  const input = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
  if (!input.length) return res.status(400).json({ error: 'No transactions supplied' });
  const db = await getDb(); const client = await db.connect();
  try {
    const transactions = input.map((item, index) => normalizeTransaction(item, `tx_${Date.now()}_${index}`));
    await client.query('BEGIN');
    for (const t of transactions) await client.query(insertTransactionSql, transactionParams(t, req.user.id));
    await client.query('COMMIT');
    res.json({ success: true, transactions });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

app.post('/api/transactions/:id/split', authenticateToken, async (req, res) => {
  const input = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
  if (input.length < 2) return res.status(400).json({ error: 'At least two split transactions are required' });
  const db = await getDb(); const client = await db.connect();
  try {
    await client.query('BEGIN');
    const originalResult = await client.query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id]);
    const original = originalResult.rows[0];
    if (!original) throw new Error('Transaction not found');
    const transactions = input.map((item, index) => normalizeTransaction({ ...original, ...item, id: item.id || `${req.params.id}_split_${Date.now()}_${index}` }));
    if (transactions.reduce((sum, t) => sum + t.amount, 0) !== Number(original.amount)) throw new Error('Split amounts must equal the original transaction amount');
    await client.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    for (const t of transactions) await client.query(insertTransactionSql, transactionParams(t, req.user.id));
    await client.query('COMMIT');
    res.json({ success: true, transactions });
  } catch (err) { await client.query('ROLLBACK'); res.status(err.message === 'Transaction not found' ? 404 : 400).json({ error: err.message }); }
  finally { client.release(); }
});

app.delete('/api/transactions/month/:yearMonth', authenticateToken, async (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.yearMonth)) return res.status(400).json({ error: 'Invalid year-month' });
  try {
    const db = await getDb();
    const result = await db.query('DELETE FROM transactions WHERE user_id=$1 AND date LIKE $2', [req.user.id, `${req.params.yearMonth}%`]);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. 프론트엔드 정적 파일 서빙 (Production 모드 대응)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Express 5 호환 fallback 미들웨어 (API 외 모든 경로 요청 시 index.html 서빙)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      next();
    }
  });
});

// DB 초기화 및 서버 기동
getDb()
  .then(() => {
    const engineName = getDbEngineName();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Node.js Express API Server (${engineName}) is running on port ${PORT} (0.0.0.0)`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize Database:', err);
  });

