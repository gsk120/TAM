import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, getFullDatabase, syncFullDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 1. 전체 데이터베이스 조회 (loadDatabase 연동)
app.get('/api/db', async (req, res) => {
  try {
    const fullDb = await getFullDatabase();
    res.json(fullDb);
  } catch (err) {
    console.error('Failed to get full DB:', err);
    res.status(500).json({ error: 'Failed to retrieve database', details: err.message });
  }
});

// 2. 전체 데이터베이스 동기화/저장 (saveDatabase 연동)
app.post('/api/db/sync', async (req, res) => {
  try {
    const fullDb = req.body;
    if (!fullDb || typeof fullDb !== 'object') {
      return res.status(400).json({ error: 'Invalid database payload' });
    }
    await syncFullDatabase(fullDb);
    res.json({ success: true, message: 'Database synchronized successfully' });
  } catch (err) {
    console.error('Failed to sync full DB:', err);
    res.status(500).json({ error: 'Failed to synchronize database', details: err.message });
  }
});

// 3. LocalStorage 마이그레이션 API
app.post('/api/migrate', async (req, res) => {
  try {
    const localDb = req.body;
    if (!localDb || typeof localDb !== 'object') {
      return res.status(400).json({ error: 'Invalid migration data' });
    }
    await syncFullDatabase(localDb);
    res.json({ success: true, message: 'LocalStorage migrated to SQLite successfully' });
  } catch (err) {
    console.error('Migration failed:', err);
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

// 4. 가계부 거래 CRUD API
app.get('/api/transactions', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const db = await getDb();
    const t = req.body;
    const id = t.id || String(Date.now());
    await db.run(
      `INSERT INTO transactions (id, date, amount, category, subcategory, type, description, memo, account, payment_method, asset_type, owner, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
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
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. 프론트엔드 정적 파일 서빙 (Production 모드 대응)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
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
    app.listen(PORT, () => {
      console.log(`🚀 Node.js Express + SQLite API Server is running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize SQLite DB:', err);
  });
