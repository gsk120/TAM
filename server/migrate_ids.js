import { getDb, getFullDatabase, syncFullDatabase, getIsPostgres } from './db.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🚀 Starting Data Migration: Category ID Mapping & Schema Update...');
  const isPostgres = getIsPostgres();
  const dbData = await getFullDatabase();

  // 1. 사전 원본 데이터 JSON 백업 생성
  const backupDir = path.join(__dirname, '../data/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = path.join(backupDir, `backup_pre_migration_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(dbData, null, 2));
  console.log(`📦 Pre-migration backup saved to: ${backupPath}`);

  // 2. 카테고리 Name -> ID 매핑 맵 생성
  const nameToIdMap = {};
  if (Array.isArray(dbData.categories)) {
    dbData.categories.forEach(c => {
      if (c.name && c.id) nameToIdMap[c.name] = c.id;
    });
  }
  if (Array.isArray(dbData.incomeCategories)) {
    dbData.incomeCategories.forEach(i => {
      if (i.name && i.id) nameToIdMap[i.name] = i.id;
    });
  }

  // 3. 거래 내역 category_id 보장
  let updatedTxsCount = 0;
  const migratedTxs = (dbData.transactions || []).map(t => {
    const inferredId = nameToIdMap[t.category] || t.category_id || '';
    if (t.category_id !== inferredId) {
      updatedTxsCount++;
      return { ...t, category_id: inferredId };
    }
    return t;
  });

  console.log(`🔄 Mapped category_id for ${updatedTxsCount} transactions.`);

  // 4. DB 동기화 저장
  const updatedDb = {
    ...dbData,
    transactions: migratedTxs,
  };
  await syncFullDatabase(updatedDb);

  console.log('✅ Migration completed successfully!');
}

runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
});
