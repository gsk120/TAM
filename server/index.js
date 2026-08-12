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
    const { username, password, household_name, initial_members } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
    }

    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });
    }

    const newUser = await createUser({ username, password, household_name, initial_members });
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
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    await db.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
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

