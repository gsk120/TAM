// Shared by the review table and the server; no workbook or browser dependencies.
export const rowDecision = (row, decisions) => decisions[row.key] || row.decision;
export const isExcludedRow = (row, decision) => row.name.startsWith('!') || decision.action === 'exclude';
export function importRowReady(row, decision) {
  if (row.blocked || row.amount === null || row.name.startsWith('!')) return false;
  if (row.kind === 'debt' && row.amount < 0) return false;
  if (row.overdraftCandidates && !decision.overdraftKey) return false;
  if (decision.action === 'new') return Boolean(String(decision.name || row.name).trim());
  if (decision.action === 'link') return Boolean(decision.targetId && decision.group) && (!row.overdraftCandidates || Boolean(decision.overdraftKey));
  if (decision.action === 'deposit') return Boolean(decision.brokerageKey);
  return false;
}
export function importRowStatus(row, decision) {
  if (isExcludedRow(row, decision)) return '제외';
  if (row.blocked?.includes('동명')) return '원본 이름 중복';
  if (row.blocked || !importRowReady(row, decision) || row.products?.some(p => p.issue)) return '확인 필요';
  if (row.saved && row.products?.some(p => p.isNew)) return '확인 필요';
  if (row.saved) return '기존 연결';
  if (row.decision.action === 'link') return '연결 후보';
  return '신규';
}
export function initialImportDecisions(rows) {
  const decisions = Object.fromEntries(rows.map(row => {
    const decision = { ...row.decision };
    return [row.key, { ...decision, selected: importRowStatus(row, decision) === '기존 연결', persistExclusion: false }];
  }));
  for (const row of rows) {
    const decision = decisions[row.key];
    if (decision.action === 'deposit' && !decisions[decision.brokerageKey]?.selected) decision.selected = false;
  }
  return decisions;
}
export function effectiveImportSelection(row, decisions, rows) {
  const decision = rowDecision(row, decisions);
  if (decision.selected !== true || !importRowReady(row, decision)) return false;
  if (decision.action === 'deposit') {
    const broker = rows.find(r => r.kind === 'broker' && r.key === decision.brokerageKey);
    return Boolean(broker && effectiveImportSelection(broker, decisions, rows));
  }
  if (row.overdraftCandidates) {
    const debt = rows.find(r => r.kind === 'debt' && r.key === decision.overdraftKey);
    return Boolean(debt && effectiveImportSelection(debt, decisions, rows));
  }
  return true;
}
export function importSelectionSummary(rows, decisions) {
  const selected = rows.filter(row => effectiveImportSelection(row, decisions, rows));
  const effective = explicitImportDecisions(rows, decisions);
  return {
    selected: selected.filter(row => rowDecision(row, decisions).action !== 'deposit').length,
    deposits: selected.filter(row => rowDecision(row, decisions).action === 'deposit').length,
    settings: rows.filter(row => effective[row.key].persistExclusion && effective[row.key].action === 'exclude' && !row.name.startsWith('!')).length,
    needsReview: rows.filter(row => !['기존 연결', '제외'].includes(importRowStatus(row, rowDecision(row, decisions)))).length,
  };
}
export function explicitImportDecisions(rows, decisions) {
  return Object.fromEntries(rows.map(row => {
    const decision = rowDecision(row, decisions);
    if (effectiveImportSelection(row, decisions, rows)) return [row.key, decision];
    const parent = decision.brokerageKey && rows.find(r => r.key === decision.brokerageKey);
    if (decision.persistExclusion && decision.action === 'exclude' && !row.name.startsWith('!') && (!parent || effectiveImportSelection(parent, decisions, rows))) return [row.key, decision];
    return [row.key, { action: 'hold', selected: false }];
  }));
}
