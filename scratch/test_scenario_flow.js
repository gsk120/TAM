import { getFullDatabase, syncFullDatabase } from '../server/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function testScenarioFlow() {
  console.log('🧪 Testing Full Scenario Dropdown Load Flow...');

  const dbData = await getFullDatabase();

  const newPresetId = `preset_user_${Date.now()}`;
  const newPreset = {
    id: newPresetId,
    name: '2026 하반기 절약형 예산안',
    createdAt: '2026-08-11',
    budgets: { '식비': 750000, '대출': 2900000 },
  };

  const updatedDb = {
    ...dbData,
    customBudgetPresets: {
      ...(dbData.customBudgetPresets || {}),
      [newPresetId]: newPreset,
    },
    activeScenario: newPresetId,
  };

  console.log('💾 1. Syncing new preset to Supabase PostgreSQL...');
  await syncFullDatabase(updatedDb);

  console.log('📖 2. Fetching getFullDatabase() from server...');
  const reloadedDb = await getFullDatabase();

  const presetKeys = Object.keys(reloadedDb.customBudgetPresets || {});
  console.log('📋 Presets in DB:', presetKeys);
  console.log('🎯 Active Scenario in DB:', reloadedDb.activeScenario);

  if (presetKeys.includes(newPresetId) && reloadedDb.activeScenario === newPresetId) {
    console.log('🎉 SUCCESS: New scenario successfully persisted and loaded!');
  } else {
    console.error('❌ FAILED: New scenario missing from loaded presets!');
  }
}

testScenarioFlow().catch(err => console.error('❌ Error:', err));
