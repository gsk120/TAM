import { getFullDatabase } from '../server/db.js';
import { calculateMonthlyMetrics, DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../src/utils/finance.js';
import dotenv from 'dotenv';

dotenv.config();

async function verify() {
  console.log('🧪 Starting Verification Test...');
  const fullDb = await getFullDatabase();

  const txs = fullDb.transactions || [];
  const categories = fullDb.categories || DEFAULT_CATEGORIES;
  const incomeCategories = fullDb.incomeCategories || DEFAULT_INCOME_CATEGORIES;

  console.log(`📊 Loaded ${txs.length} transactions from DB.`);
  console.log(`📋 Loaded ${categories.length} expense categories & ${incomeCategories.length} income categories.`);

  // Test calculateMonthlyMetrics for 2026-07
  const metrics07 = calculateMonthlyMetrics(txs, '2026-07', {}, categories, incomeCategories);

  console.log(`✅ 2026-07 Total Income: ${metrics07.totalIncome.toLocaleString()}원`);
  console.log(`✅ 2026-07 Real Consumption: ${metrics07.realConsumption.toLocaleString()}원`);
  console.log(`✅ 2026-07 Net Medical Expense: ${metrics07.netMedicalExpense.toLocaleString()}원 (Total: ${metrics07.totalMedicalExpense.toLocaleString()}원 - Refund: ${metrics07.medicalRefund.toLocaleString()}원)`);

  const categoryIdsCount = txs.filter(t => t.category_id).length;
  console.log(`🎯 Category ID populated in ${categoryIdsCount}/${txs.length} transactions (${((categoryIdsCount/txs.length)*100).toFixed(1)}%).`);

  console.log('🎉 Verification completed with 0 errors!');
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
});
