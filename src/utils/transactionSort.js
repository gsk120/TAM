const koreanCollator = new Intl.Collator('ko');

function isCancellation(tx) {
  return tx.isCancel || (tx.type === '지출' && Number(tx.amount) < 0);
}

function sortValue(tx, key) {
  if (key === 'amount') {
    const amount = Math.abs(Number(tx.amount) || 0);
    return tx.type === '지출' && !isCancellation(tx) ? -amount : amount;
  }
  if (key === 'type') return isCancellation(tx) ? '지출취소' : tx.type || '';
  if (key === 'owner') return tx.owner || '가족공동';
  return tx[key] || '';
}

export function sortTransactions(transactions, key = 'date', direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return [...transactions].sort((a, b) => {
    const primary = key === 'amount'
      ? sortValue(a, key) - sortValue(b, key)
      : koreanCollator.compare(String(sortValue(a, key)), String(sortValue(b, key)));
    return primary * sign || koreanCollator.compare(a.date || '', b.date || '');
  });
}
