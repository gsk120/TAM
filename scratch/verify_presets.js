import { getFullDatabase, syncFullDatabase } from '../server/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function verifyPresets() {
  console.log('🧪 Testing Scenario Presets & isFixed Persistence in Supabase PostgreSQL...');

  const dbData = await getFullDatabase();

  // 1. Test updating '세금' category to isFixed: true
  const updatedCategories = (dbData.categories || []).map(c => {
    if (c.name === '세금' || c.id === 'cat_tax') {
      return { ...c, isFixed: true };
    }
    return c;
  });

  // 2. Test adding a custom budget preset
  const testPresetId = `preset_test_${Date.now()}`;
  const testPreset = {
    id: testPresetId,
    name: '2026 하반기 공격형 예산안',
    createdAt: '2026-08-11',
    budgets: { '식비': 900000, '대출': 2900000 },
  };

  const updatedPresets = {
    ...(dbData.customBudgetPresets || {}),
    [testPresetId]: testPreset,
  };

  const updatedDb = {
    ...dbData,
    categories: updatedCategories,
    customBudgetPresets: updatedPresets,
    activeScenario: testPresetId,
  };

  console.log('💾 Syncing test data to Supabase PostgreSQL...');
  await syncFullDatabase(updatedDb);

  // 3. Read back from Supabase PostgreSQL
  console.log('📖 Reading back from Supabase PostgreSQL...');
  const reloadedDb = await getFullDatabase();

  const taxCat = (reloadedDb.categories || []).find(c => c.name === '세금' || c.id === 'cat_tax');
  console.log('✅ Tax Category isFixed in DB:', taxCat ? taxCat.isFixed : 'not found');

  const loadedPresetsCount = Object.keys(reloadedDb.customBudgetPresets || {}).length;
  console.log('✅ Presets Count in DB:', loadedPresetsCount);
  console.log('✅ Active Scenario in DB:', reloadedDb.activeScenario);

  if (taxCat && taxCat.isFixed === true && loadedPresetsCount >= 2 && reloadedDb.activeScenario === testPresetId) {
    console.log('🎉 PERSISTENCE TEST PASSED WITH 100% SUCCESS!');
  } else {
    console.error('❌ PERSISTENCE TEST FAILED!');
  }
}

verifyPresets().catch(err => console.error('❌ Test failed:', err));
