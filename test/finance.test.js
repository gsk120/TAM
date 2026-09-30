import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCategoryBudgetStatus,
  getInitialAssetSnapshot,
  isFixedCat,
  isOneOffCat,
  isVariableCat,
  parseInputNumber,
} from '../src/utils/finance.js';

test('category cost types are classified consistently', () => {
  assert.equal(isFixedCat({ costType: 'fixed' }), true);
  assert.equal(isOneOffCat({ costType: 'one_off' }), true);
  assert.equal(isVariableCat({ costType: 'variable' }), true);
  assert.equal(isVariableCat({ isFixed: true }), false);
});

test('budget status handles normal, warning, and exceeded budgets', () => {
  assert.equal(getCategoryBudgetStatus('food', 50, 100).status, '안정');
  assert.equal(getCategoryBudgetStatus('food', 80, 100).status, '주의');
  assert.equal(getCategoryBudgetStatus('food', 100, 100).status, '초과');
});

test('asset snapshot initializes every configured asset to zero', () => {
  assert.deepEqual(
    getInitialAssetSnapshot({
      cashItems: [{ id: 'cash-1' }],
      investItems: [{ id: 'invest-1' }],
      debtItems: [{ id: 'debt-1' }],
    }),
    { cash: { 'cash-1': 0 }, invest: { 'invest-1': 0 }, debt: { 'debt-1': 0 } },
  );
});

test('input number parser accepts formatted currency', () => {
  assert.equal(parseInputNumber('1,234,567'), 1234567);
  assert.equal(parseInputNumber('not-a-number'), 0);
});
