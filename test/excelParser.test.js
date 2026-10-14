import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseTransactionWorkbook, detectDuplicates } from '../src/utils/excelParser.js';

const headers = ['날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모'];
function workbook(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['고객정보'], ['금액 현황']]), '뱅샐현황');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), '가계부 내역');
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellDates: false });
}
const row = (date, type = '지출', amount = -1000, memo = '') => [date, '09:00', type, '식비', '미분류', '샘플 거래', amount, 'KRW', '테스트 카드', memo];

test('original workbook selects transaction sheet and filters both year and month', () => {
  const wb = workbook([row(new Date(2026, 9, 1)), row('2026-10-31'), row('2026-09-30'), row('2026-11-01'), row('2025-10-01')]);
  const txs = parseTransactionWorkbook(wb, 'original.xlsx', '2026-10');
  assert.deepEqual(txs.map(t => t.date), ['2026-10-01', '2026-10-31']);
  assert.ok(txs.every(t => t.rawSource === 'original.xlsx' && t.amount === 1000 && t.memo === ''));
  assert.equal(parseTransactionWorkbook(wb, 'original.xlsx', '2025-10').length, 1);
  assert.deepEqual(parseTransactionWorkbook(wb, 'original.xlsx', '2027-01'), []);
});

test('income, transfer, cancellation and duplicate handling remain intact', () => {
  const txs = parseTransactionWorkbook(workbook([row('2026-10-01'), row('2026-10-02', '지출', 1000), row('2026-10-03', '수입', 2000), row('2026-10-04', '이체', -3000), row('2026-10-05', '지출', -4000, '환급')]), 'test.xlsx', '2026-10');
  assert.deepEqual(txs.map(t => [t.type, t.amount, t.isCancel]), [['지출', 1000, false], ['지출', -1000, true], ['수입', 2000, false], ['계좌이체', 3000, false], ['지출', -4000, true]]);
  assert.equal(txs[4].memo, '환급 (결제취소)');
  assert.ok(detectDuplicates(txs, txs).every(t => t.duplicateStatus === 'EXACT' && !t.selected));
});

test('legacy six-column workbook and reordered CSV use the same month scope', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['날짜', '타입', '대분류', '내용', '금액', '메모'], ['2026-10-01', '지출', '식비', '샘플', -1234, '기록'], ['2026-09-01', '지출', '식비', '이전월', -1, '']]), '내역');
  const legacy = parseTransactionWorkbook(wb, 'legacy.xlsx', '2026-10');
  const csv = XLSX.read('내용,금액,메모,날짜,대분류,타입\n샘플,-1234,기록,2026-10-01,식비,지출\n이전월,-1,,2026-09-01,식비,지출', { type: 'string' });
  const csvTxs = parseTransactionWorkbook(csv, 'test.csv', '2026-10');
  const fields = txs => txs.map(({ date, type, category, description, amount, memo }) => ({ date, type, category, description, amount, memo }));
  assert.deepEqual(fields(legacy), fields(csvTxs));
  assert.equal(legacy.length, 1);
});

test('missing month or missing transaction headers cannot import the full period', () => {
  const wb = workbook([row('2026-10-01')]);
  for (const month of [undefined, '', '2026-13']) assert.throws(() => parseTransactionWorkbook(wb, 'test.xlsx', month), /연·월/);
  const invalid = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(invalid, XLSX.utils.aoa_to_sheet([['현황'], [123]]), '현황');
  assert.throws(() => parseTransactionWorkbook(invalid, 'test.xlsx', '2026-10'), /거래 시트/);
});
