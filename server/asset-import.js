import * as XLSX from 'xlsx/xlsx.mjs';
import { explicitImportDecisions } from './asset-import-selection.js';

export const emptyImportMappings = () => ({ version: 1, entries: {}, requests: {} });
export const sourceKey = (memberId, kind, name) => JSON.stringify([memberId, kind, name]);
export function currentKstMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
const text = value => String(value ?? '').trim();
const number = value => {
  if (value === null || value === undefined || text(value) === '') return null;
  const n = Number(typeof value === 'string' ? value.replaceAll(',', '').trim() : value);
  return Number.isFinite(n) ? n : null;
};
const label = value => text(value).replace(/\s/g, '');
const active = (item, month) => (!item.startMonth || item.startMonth <= month) && (!item.endMonth || month < item.endMonth);

// Read worksheet coordinates rather than assuming that the used range begins at A1.
export function parseAssetWorkbook(workbook, month) {
  let transactionCount = 0;
  for (const name of [...new Set(['가계부 내역', '내역', ...workbook.SheetNames])]) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    const h = rows.slice(0, 10).findIndex(r => r.some(v => /날짜|일자/.test(text(v))) && r.some(v => /내용|가맹점|사용처/.test(text(v))) && r.some(v => /금액/.test(text(v))));
    if (h < 0) continue;
    const dateCol = rows[h].findIndex(v => /날짜|일자/.test(text(v)));
    const descCol = rows[h].findIndex(v => /내용|가맹점|사용처/.test(text(v)));
    for (const r of rows.slice(h + 1)) {
      if (!text(r[descCol])) continue;
      const d = typeof r[dateCol] === 'number' ? XLSX.SSF.parse_date_code(r[dateCol], { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) }) : null;
      const match = d ? [null, d.y, d.m, d.d] : text(r[dateCol]).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[ T])/);
      if (!match) continue;
      const [y, m, day] = match.slice(1).map(Number), check = new Date(Date.UTC(y, m - 1, day));
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== day) continue;
      if (`${y}-${String(m).padStart(2, '0')}` === month) transactionCount++;
    }
    break;
  }
  const sheet = workbook.Sheets['뱅샐현황'];
  const result = { transactionCount, assets: [], products: [], investmentStatus: 'missing', warnings: [] };
  if (!sheet?.['!ref']) { result.warnings.push('뱅샐현황 시트가 없어 자산을 반영하지 않습니다.'); return result; }
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r > 10000 || range.e.c > 100) throw new Error('지원 범위를 초과하는 현황 시트입니다.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: true, defval: null });
  const findSection = name => rows.findIndex(r => r.some(v => new RegExp(`^\\d+[.．]?${name}$`).test(label(v))));
  const bounds = start => {
    for (let i = start + 1; i < rows.length; i++) if (rows[i].some(v => typeof v === 'string' && /^\d+[.．][가-힣A-Za-z]/.test(label(v)))) return i;
    return rows.length;
  };
  const financial = findSection('재무현황');
  if (financial >= 0) {
    const end = bounds(financial);
    const h = rows.findIndex((r, i) => i > financial && i < end && r.filter(v => label(v) === '상품명').length >= 2);
    if (h >= 0) {
      const cols = rows[h].map((v, i) => label(v) === '상품명' ? i : -1).filter(i => i >= 0);
      for (const [side, col] of cols.entries()) {
        const amountCol = rows[h].findIndex((v, i) => i > col && label(v) === '금액');
        let category = '';
        for (let i = h + 1; i < end; i++) {
          const r = rows[i];
          if (/^(총자산|총부채|순자산|총계)$/.test(label(r[col - 1]))) break;
          if (text(r[col - 1])) category = text(r[col - 1]);
          const name = text(r[col]);
          if (!name) continue;
          result.assets.push({ name, kind: side === 0 ? 'asset' : 'debt', category, amount: number(r[amountCol]), cell: XLSX.utils.encode_cell({ r: i, c: col }), investment: side === 0 && /투자성/.test(category) });
        }
      }
    } else result.warnings.push('재무현황의 상품명·금액 제목을 찾지 못했습니다.');
  } else result.warnings.push('재무현황 영역을 찾지 못했습니다.');
  const investments = findSection('투자현황');
  if (investments >= 0) {
    const end = bounds(investments);
    const h = rows.findIndex((r, i) => i > investments && i < end && r.some(v => label(v) === '평가금액') && r.some(v => label(v) === '금융사'));
    result.investmentStatus = h >= 0 ? 'ok' : 'error';
    if (h >= 0) {
      const headers = rows[h].map(label), bankCol = headers.indexOf('금융사'), nameCol = headers.indexOf('상품명'), valueCol = headers.indexOf('평가금액');
      if (nameCol < 0) result.investmentStatus = 'error';
      else {
        let complete = false;
        for (let i = h + 1; i < end; i++) {
        const r = rows[i];
        if (r.some(v => label(v) === '총계')) { complete = true; break; }
        const name = text(r[nameCol]), bank = text(r[bankCol]);
        if (!name && !bank) continue;
        if (!name || !bank) { result.investmentStatus = 'error'; continue; }
        result.products.push({ name, bank, amount: number(r[valueCol]), cell: XLSX.utils.encode_cell({ r: i, c: nameCol }) });
        }
        if (!complete) result.investmentStatus = 'error';
      }
    }
    if (result.investmentStatus === 'error') result.warnings.push('투자현황 일부를 읽지 못해 투자 평가액을 유지합니다.');
  } else result.warnings.push('투자현황이 없어 기존 투자 평가액을 유지합니다.');
  return result;
}

export function decodeAssetWorkbook(base64, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('대상 연·월을 확인하세요.');
  if (typeof base64 !== 'string' || base64.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('파일 크기는 6MB 이하여야 합니다.');
  const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer', cellDates: false });
  return parseAssetWorkbook(workbook, month);
}

export function buildAssetReview(parsed, member, structure, mappings, month) {
  const entries = mappings?.entries || {}, rows = [];
  const assetNames = new Set(parsed.products.map(p => p.name));
  const counts = new Map();
  for (const a of parsed.assets) if (!a.name.startsWith('!')) {
    const k = `${a.kind}:${a.name}`; counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const a of parsed.assets) {
    // Products are owned by section 5, never treated as cash balances.
    if (a.investment && assetNames.has(a.name)) continue;
    const key = sourceKey(member.id, a.kind, a.name), saved = entries[key];
    const blocked = !a.name.startsWith('!') && ((counts.get(`${a.kind}:${a.name}`) || 0) > 1 ? 'duplicate' : a.amount === null ? 'amount' : '');
    const group = a.kind === 'debt' ? 'debtItems' : /부동산|동산|실물|신탁|보험|연금|투자성/.test(a.category) ? 'investItems' : 'cashItems';
    const candidate = (structure[group] || []).filter(i => i.owner === member.name && i.name === a.name && active(i, month));
    const target = saved?.targetId && (structure[saved.group] || []).find(i => i.id === saved.targetId && i.owner === member.name && active(i, month));
    const decision = saved?.excluded || a.name.startsWith('!') ? { action: 'exclude' } : saved?.brokerageKey ? { action: 'deposit', brokerageKey: saved.brokerageKey } : target ? { action: 'link', targetId: target.id, group: saved.group } : candidate.length === 1 ? { action: 'link', targetId: candidate[0].id, group } : { action: a.investment ? 'hold' : 'new', group, name: a.name };
    if (saved?.targetId && !target && !saved.excluded && !saved.brokerageKey) decision.action = 'hold';
    rows.push({ ...a, key, blocked: blocked ? (blocked === 'duplicate' ? '같은 소유자의 동명 상품입니다. 원본 이름을 구분하세요.' : '금액을 확인할 수 없습니다.') : '', decision, saved: Boolean(saved) });
  }
  const banks = new Set(parsed.investmentStatus === 'ok' ? parsed.products.map(p => p.bank) : []);
  for (const m of Object.values(entries)) if (m.memberId === member.id && m.kind === 'broker') banks.add(m.sourceName);
  for (const bank of banks) {
    const key = sourceKey(member.id, 'broker', bank), saved = entries[key];
    const rawProducts = parsed.products.filter(p => p.bank === bank);
    const products = rawProducts.map(p => ({ ...p, isNew: !(saved?.knownProducts || []).includes(p.name), issue: rawProducts.filter(q => q.name === p.name).length > 1 ? '동일 증권사·동일 상품 중복' : p.amount === null ? '평가금액 확인 필요' : '' }));
    const candidate = (structure.investItems || []).filter(i => i.owner === member.name && i.name === bank && active(i, month));
    const target = (structure.investItems || []).find(i => i.id === saved?.targetId && i.owner === member.name && active(i, month));
    rows.push({ key, name: bank, kind: 'broker', products, amount: products.filter(p => !p.issue).reduce((s, p) => s + p.amount, 0), blocked: parsed.investmentStatus !== 'ok' ? '투자현황을 정상적으로 읽지 못해 기존 평가액을 유지합니다.' : '', saved: Boolean(saved), decision: saved?.excluded ? { action: 'exclude' } : target ? { action: 'link', group: 'investItems', targetId: target.id, excludedProducts: saved.excludedProducts || [] } : saved?.targetId ? { action: 'hold', group: 'investItems' } : candidate.length === 1 ? { action: 'link', group: 'investItems', targetId: candidate[0].id, excludedProducts: [] } : { action: 'new', group: 'investItems', name: bank, excludedProducts: [] } });
  }
  // Same unique name across the asset/debt sides is a corresponding pair, not a duplicate.
  for (const row of rows) if (row.kind === 'asset' && row.amount < 0 && !row.blocked) {
    const peers = rows.filter(r => r.kind === 'debt' && r.name === row.name && !r.blocked);
    row.overdraftCandidates = rows.filter(r => r.kind === 'debt' && !r.blocked).map(r => ({ key: r.key, name: r.name }));
    row.decision.overdraftKey = savedPair(entries[row.key], rows) || (peers.length === 1 ? peers[0].key : '');
  }
  for (const row of rows) row.replacementCandidates = Object.entries(entries).filter(([key, e]) => key !== row.key && e.memberId === member.id && e.kind === row.kind && e.targetId && !e.excluded && (row.kind === 'broker' ? !parsed.products.some(p => p.bank === e.sourceName) : !parsed.assets.some(a => a.kind === e.kind && a.name === e.sourceName))).map(([key, e]) => ({ key, name: e.sourceName, targetId: e.targetId, group: e.group }));
  return rows;
}
function savedPair(saved, rows) { return rows.some(r => r.kind === 'debt' && r.key === saved?.overdraftKey && !r.blocked) ? saved.overdraftKey : ''; }

// Pure merge: existing month and untouched members are never replaced wholesale.
export function applyAssetImport({ parsed, member, structure, snapshot, mappings, decisions, month, now, makeId, selectionMode }) {
  const rows = buildAssetReview(parsed, member, structure, mappings, month);
  if (selectionMode === 'explicit') {
    // Resolve dependencies from server-owned mappings, not just fields supplied by the UI.
    decisions = Object.fromEntries(rows.map(row => [row.key, { brokerageKey: mappings?.entries?.[row.key]?.brokerageKey, ...decisions[row.key] }]));
    decisions = explicitImportDecisions(rows, decisions);
  }
  const nextStructure = structuredClone(structure), next = structuredClone(snapshot || { cash: {}, invest: {}, debt: {} });
  for (const g of ['cash', 'invest', 'debt']) next[g] ||= {};
  const metadata = next.importData ||= { sources: {}, brokerages: {}, lastByMember: {} };
  metadata.sources ||= {}; metadata.brokerages ||= {}; metadata.lastByMember ||= {};
  const config = structuredClone(mappings || emptyImportMappings()); config.entries ||= {};
  const applied = [], held = [], excluded = [], touched = new Set();
  const chosen = new Map();
  const replaced = new Set();
  for (const row of rows) {
    const d = decisions[row.key] || row.decision;
    if (!d.replaceSourceKey || row.blocked || !['link'].includes(d.action)) continue;
    const candidate = row.replacementCandidates.find(c => c.key === d.replaceSourceKey && c.targetId === d.targetId && c.group === d.group);
    if (!candidate || replaced.has(candidate.key)) throw new Error('이름 변경 전 연결을 다시 확인하세요.');
    config.entries[candidate.key].excluded = true;
    config.entries[candidate.key].replacedBy = row.key;
    delete metadata.sources[candidate.key];
    if (row.kind === 'broker') {
      metadata.brokerages[row.key] = metadata.brokerages[candidate.key];
      delete metadata.brokerages[candidate.key];
      for (const s of Object.values(metadata.sources)) if (s.brokerageKey === candidate.key) s.brokerageKey = row.key;
      for (const e of Object.values(config.entries)) if (e.brokerageKey === candidate.key) e.brokerageKey = row.key;
    }
    replaced.add(candidate.key);
  }
  // Resolve brokerage destinations first so cash accounts can refer to them in the same save.
  for (const row of [...rows.filter(r => r.kind === 'broker'), ...rows.filter(r => r.kind !== 'broker')]) {
    if (replaced.has(row.key)) continue;
    const d = decisions[row.key] || row.decision;
    if ((row.blocked && d.action !== 'exclude') || d.action === 'hold') { held.push(row.name); continue; }
    const previous = config.entries[row.key];
    if (d.action === 'exclude' || row.name.startsWith('!')) {
      config.entries[row.key] = { ...previous, memberId: member.id, kind: row.kind, sourceName: row.name, excluded: true };
      if (selectionMode !== 'explicit' && previous?.brokerageKey && metadata.sources[row.key]) {
        touched.add(`${metadata.sources[row.key].group}:${metadata.sources[row.key].targetId}`);
        delete metadata.sources[row.key];
      }
      excluded.push(row.name); continue;
    }
    if (row.amount === null || !['new', 'link', 'deposit'].includes(d.action)) { held.push(row.name); continue; }
    let group = row.kind === 'broker' || d.action === 'deposit' ? 'investItems' : d.group;
    if (!['cashItems', 'investItems', 'debtItems'].includes(group) || (row.kind === 'debt') !== (group === 'debtItems')) throw new Error('자산·부채 분류를 확인하세요.');
    let target;
    if (d.action === 'deposit') {
      const broker = chosen.get(d.brokerageKey) || config.entries[d.brokerageKey];
      if (!broker || broker.excluded || broker.memberId !== member.id || broker.kind !== 'broker') { held.push(row.name); continue; }
      target = nextStructure.investItems.find(i => i.id === broker.targetId);
      if (!target || target.owner !== member.name || !active(target, month)) { held.push(row.name); continue; }
    } else if (d.action === 'link') {
      target = nextStructure[group].find(i => i.id === d.targetId && i.owner === member.name && active(i, month));
      if (!target) throw new Error('연결 대상이 변경되었거나 종료되었습니다. 다시 확인하세요.');
      if (selectionMode === 'explicit' && row.kind !== 'broker' && previous?.targetId !== target.id && !d.replaceSourceKey && Object.entries(config.entries).some(([key, e]) => key !== row.key && !e.excluded && e.group === group && e.targetId === target.id && !e.brokerageKey && e.kind !== 'broker')) throw new Error('이미 다른 원본 항목에 연결된 자산입니다. 이름 변경인 경우 이전 연결을 지정하세요.');
    } else {
      // Replays retain the assigned target instead of creating another item.
      target = nextStructure[group].find(i => i.id === previous?.targetId && i.owner === member.name && active(i, month));
      if (!target) {
        const name = text(d.name || row.name);
        if (!name || name.length > 200) throw new Error('자산 이름은 1~200자로 입력하세요.');
        target = { id: makeId(), name, owner: member.name, defaultBalance: 0, startMonth: month, isRealEstate: /부동산/.test(row.category || '') };
        nextStructure[group].push(target);
      }
    }
    if (row.kind === 'broker' && Object.entries(config.entries).some(([k, e]) => k !== row.key && e.kind === 'broker' && !e.excluded && e.targetId === target.id)) throw new Error('기존 자산 하나를 여러 증권사에 중복 연결할 수 없습니다.');
    const targetBroker = Object.entries(config.entries).find(([k, e]) => k !== row.key && e.kind === 'broker' && !e.excluded && e.targetId === target.id);
    if (row.kind !== 'broker' && d.action !== 'deposit' && targetBroker) throw new Error('증권사 항목에는 예수금 연결 방식을 사용하세요.');
    const entry = { memberId: member.id, kind: row.kind, sourceName: row.name, group, targetId: target.id, excluded: false };
    if (d.action === 'deposit') entry.brokerageKey = d.brokerageKey;
    if (row.kind === 'broker') {
      entry.excludedProducts = Array.isArray(d.excludedProducts) ? d.excludedProducts.filter(n => typeof n === 'string') : [];
      entry.knownProducts = [...new Set([...(previous?.knownProducts || []), ...row.products.filter(p => !p.issue).map(p => p.name)])];
    }
    let amount = row.amount;
    if (row.kind === 'asset' && amount < 0) {
      const debt = rows.find(r => r.key === d.overdraftKey && r.kind === 'debt' && !r.blocked && r.amount >= 0);
      const debtDecision = debt && (decisions[debt.key] || debt.decision);
      if (!debt || !['new', 'link'].includes(debtDecision.action)) { held.push(row.name); if (!previous?.targetId && d.action === 'new') nextStructure[group] = nextStructure[group].filter(i => i.id !== target.id); continue; }
      entry.overdraftKey = debt.key; amount = 0;
    }
    if (row.kind === 'debt' && amount < 0) throw new Error('대출잔액은 양수여야 합니다.');
    if (row.kind === 'broker') {
      const included = row.products.filter(p => !p.name.startsWith('!') && !entry.excludedProducts.includes(p.name));
      const products = included.filter(p => !p.issue);
      for (const name of new Set(included.filter(p => p.issue).map(p => p.name))) {
        const old = metadata.brokerages[row.key]?.products?.find(p => p.name === name);
        if (old) products.push(old);
        held.push(`${row.name} / ${name}`);
      }
      amount = products.reduce((s, p) => s + p.amount, 0);
      metadata.brokerages[row.key] = { memberId: member.id, bank: row.name, targetId: target.id, products, evaluated: amount, updatedAt: now };
    }
    config.entries[row.key] = entry; chosen.set(row.key, entry);
    const oldSource = metadata.sources[row.key];
    if (oldSource && (oldSource.targetId !== target.id || oldSource.group !== group)) {
      touched.add(`${oldSource.group}:${oldSource.targetId}`);
      if (row.kind === 'broker') {
        for (const s of Object.values(metadata.sources)) if (s.brokerageKey === row.key) { touched.add(`${s.group}:${s.targetId}`); s.targetId = target.id; }
        for (const m of Object.values(config.entries)) if (m.brokerageKey === row.key) m.targetId = target.id;
      }
    }
    metadata.sources[row.key] = { memberId: member.id, targetId: target.id, group, kind: row.kind, name: row.name, amount, brokerageKey: entry.brokerageKey, updatedAt: now };
    touched.add(`${group}:${target.id}`); applied.push(row.name);
  }
  for (const key of touched) {
    const [group, id] = key.split(':');
    const values = Object.entries(metadata.sources).filter(([k, s]) => s.group === group && s.targetId === id && !config.entries[k]?.excluded && config.entries[k]?.targetId === id);
    next[{ cashItems: 'cash', investItems: 'invest', debtItems: 'debt' }[group]][id] = values.reduce((sum, [, s]) => sum + s.amount, 0);
  }
  if (applied.length) { metadata.lastImportedAt = now; metadata.lastByMember[member.id] = { name: member.name, at: now }; }
  return { structure: nextStructure, snapshot: next, mappings: config, result: { applied, held, excluded, warnings: parsed.warnings } };
}
