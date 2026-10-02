import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlyMetrics,
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

const expenseCategories = [
  { id: 'cat_med', name: '의료비', costType: 'variable' },
  { id: 'food', name: '식비', costType: 'variable' },
];
const incomeCategories = [
  { id: 'salary', name: '월급' },
  { id: 'inc_med_ref', name: '보험환급' },
];
const transaction = (date, type, category_id, amount) => ({ date, type, category_id, amount });
const monthlyMetrics = (transactions, month = '2026-10') =>
  calculateMonthlyMetrics(transactions, month, {}, expenseCategories, incomeCategories);

test('net income excludes refunds while preserving gross income, net expenses and surplus', () => {
  const metrics = monthlyMetrics([
    transaction('2026-10-01', '수입', 'salary', 4200000),
    transaction('2026-10-02', '수입', 'inc_med_ref', 800000),
    transaction('2026-10-03', '지출', 'cat_med', 1000000),
    transaction('2026-10-04', '지출', 'food', 2000000),
    transaction('2026-10-05', '계좌이체', 'salary', 900000),
  ]);
  assert.equal(metrics.totalIncome, 5000000);
  assert.equal(metrics.medicalRefund, 800000);
  assert.equal(metrics.netIncome, 4200000);
  assert.equal(metrics.incomeMap.inc_med_ref, 800000);
  assert.equal(metrics.totalExpense, 3000000);
  assert.equal(metrics.categoryTotalSpent, 2200000);
  assert.equal(metrics.monthlySurplus, 2000000);
});

test('net income equals gross income without refunds and is zero for an empty month', () => {
  const metrics = monthlyMetrics([transaction('2026-10-01', '수입', 'salary', 4200000)]);
  assert.equal(metrics.netIncome, metrics.totalIncome);
  assert.equal(monthlyMetrics([]).netIncome, 0);
});

test('refunds belong to their receipt month without reducing prior-month medical costs', () => {
  const transactions = [
    transaction('2026-09-01', '지출', 'cat_med', 1000000),
    transaction('2026-10-01', '수입', 'salary', 4200000),
    transaction('2026-10-02', '수입', 'inc_med_ref', 800000),
    transaction('2026-10-03', '지출', 'food', 3000000),
  ];
  const september = monthlyMetrics(transactions, '2026-09');
  const october = monthlyMetrics(transactions);
  assert.equal(september.medicalRefund, 0);
  assert.equal(september.netMedicalExpense, 1000000);
  assert.equal(october.netIncome, 4200000);
  assert.equal(october.netMedicalExpense, 0);
  assert.equal(october.categoryTotalSpent, 3000000);
  assert.equal(october.monthlySurplus, 2000000);
});

test('refunds exceeding medical expenses preserve the zero floor and cash-flow surplus', () => {
  const metrics = monthlyMetrics([
    transaction('2026-10-01', '수입', 'salary', 4200000),
    transaction('2026-10-02', '수입', 'inc_med_ref', 800000),
    transaction('2026-10-03', '지출', 'cat_med', 200000),
    transaction('2026-10-04', '지출', 'food', 2800000),
  ]);
  assert.equal(metrics.netIncome, 4200000);
  assert.equal(metrics.netMedicalExpense, 0);
  assert.equal(metrics.categoryTotalSpent, 2800000);
  assert.equal(metrics.monthlySurplus, 2000000);
});
