import 'dotenv/config';
import { getDb } from './db.js';

async function main() {
  console.log('🚀 Running server DB migration...');
  const pool = await getDb();

  const res = await pool.query("SELECT user_id, key, value FROM settings WHERE key = 'categories'");
  for (const row of res.rows) {
    const cats = JSON.parse(row.value);
    const updated = cats.map(c => {
      if (c.name === '1회성지출' || c.name === '1회성 지출') {
        return { ...c, costType: 'one_off', isFixed: false };
      }
      return c;
    });

    await pool.query(
      "UPDATE settings SET value = $1 WHERE key = 'categories' AND user_id = $2",
      [JSON.stringify(updated), row.user_id]
    );

    console.log(`\n📋 Categories for user: ${row.user_id}`);
    updated.forEach(c => {
      console.log(`  - [${c.costType}] ${c.name} (isFixed: ${c.isFixed}, 예산: ${c.defaultBudget || 0})`);
    });
  }

  console.log('\n✅ DB category update completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
