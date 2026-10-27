import React, { Fragment, useState } from 'react';
import { formatKRW } from '../utils/finance';
import { effectiveImportSelection, importRowReady, importRowStatus, importSelectionSummary, isExcludedRow, rowDecision } from '../../server/asset-import-selection.js';
import { Ban, TriangleAlert, List, CircleCheck, CircleSlash, ArrowRight, LockKeyhole } from 'lucide-react';
import ImportStatus from './ImportStatus';

export default function AssetImportReview({ preview, decisions, onChange, structure, month, owner, disabled }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [showExcluded, setShowExcluded] = useState(false);
  const [editing, setEditing] = useState({});
  if (!preview) return <p className="import-empty">자산 현황이 없는 파일입니다. 거래내역만 등록할 수 있습니다.</p>;
  if (!preview.success) return <p role="alert" className="import-notice">자산 분석 실패: {preview.message}</p>;
  if (!preview.eligible) return <p className="import-notice">{preview.reason || '이 파일의 자산은 반영할 수 없습니다.'}</p>;
  const rows = preview.rows || [], banks = rows.filter(r => r.kind === 'broker');
  const choice = row => rowDecision(row, decisions);
  const set = (row, patch) => onChange(row.key, { ...choice(row), ...patch });
  const selected = row => effectiveImportSelection(row, decisions, rows);
  const excluded = row => isExcludedRow(row, choice(row));
  const needsReview = row => !['기존 연결', '제외'].includes(importRowStatus(row, choice(row)));
  const blockedRows = rows.filter(row => row.blocked && !excluded(row));
  const duplicateOnly = blockedRows.length > 0 && blockedRows.every(row => row.blocked.includes('동명'));
  const groups = new Map();
  for (const row of rows) if (row.blocked?.includes('동명') && !groups.has(row.key)) groups.set(row.key, groups.size + 1);
  const bucket = row => excluded(row) ? 2 : needsReview(row) ? 0 : 1;
  const sorted = [...rows].sort((a, b) => bucket(a) - bucket(b) || (groups.has(a.key) && groups.has(b.key) ? groups.get(a.key) - groups.get(b.key) : groups.has(a.key) ? -1 : groups.has(b.key) ? 1 : 0));
  const visible = sorted.filter(row => filter === 'excluded' ? excluded(row) : filter === 'review' ? needsReview(row) : filter === 'selected' ? selected(row) : !excluded(row) || showExcluded);
  const action = (row, value) => set(row, { action: value, selected: false, persistExclusion: value === 'exclude', targetId: '', replaceSourceKey: '', group: row.kind === 'broker' || value === 'deposit' ? 'investItems' : choice(row).group || (row.kind === 'debt' ? 'debtItems' : 'cashItems') });
  const bankTotals = row => {
    const d = choice(row), old = preview.snapshot?.importData || {}, seen = new Set();
    let evaluated = 0;
    for (const p of row.products) {
      if (seen.has(p.name) || p.name.startsWith('!') || (d.excludedProducts || []).includes(p.name)) continue;
      seen.add(p.name);
      evaluated += p.issue ? old.brokerages?.[row.key]?.products?.find(q => q.name === p.name)?.amount || 0 : p.amount || 0;
    }
    const balances = new Map(Object.entries(old.sources || {}).filter(([, s]) => s.brokerageKey === row.key).map(([key, s]) => [key, s.amount]));
    for (const r of rows) {
      const c = choice(r);
      if (c.brokerageKey === row.key && c.persistExclusion && c.action === 'exclude') balances.delete(r.key);
      else if (c.action === 'deposit' && c.brokerageKey === row.key && selected(r)) balances.set(r.key, r.amount);
      else if (selected(r) && balances.has(r.key) && (c.action !== 'deposit' || c.brokerageKey !== row.key)) balances.delete(r.key);
    }
    const deposits = [...balances.values()].reduce((sum, n) => sum + n, 0);
    return { evaluated, deposits, total: evaluated + deposits };
  };
  const targetEditor = (row, d) => {
    const group = d.group || (row.kind === 'broker' ? 'investItems' : row.kind === 'debt' ? 'debtItems' : 'cashItems');
    const items = (structure?.[group] || []).filter(i => i.owner === owner && (!i.startMonth || i.startMonth <= month) && (!i.endMonth || month < i.endMonth));
    if (row.blocked) return <span className="import-blocked-target"><LockKeyhole size={14} aria-hidden="true" />{row.blocked.includes('동명') ? '원본 수정 필요' : '정보 확인 필요'}</span>;
    if (row.saved && !editing[row.key] && (d.action === 'link' || d.action === 'deposit')) {
      const name = d.action === 'deposit' ? banks.find(b => b.key === d.brokerageKey)?.name : items.find(i => i.id === d.targetId)?.name;
      if (name) return <div className="import-linked-target"><span>{name}</span><button type="button" disabled={disabled} aria-label={`${row.name} 연결 변경`} onClick={() => setEditing(prev => ({ ...prev, [row.key]: true }))}>변경</button></div>;
    }
    return <div className="import-target">
      <select className="input" aria-label={`${row.name} 처리`} value={d.action} disabled={disabled || row.name.startsWith('!') || Boolean(row.blocked)} onChange={e => action(row, e.target.value)}>
        <option value="new">새로 등록</option><option value="link">기존 자산 연결</option>
        {row.kind === 'asset' && !row.overdraftCandidates && banks.length > 0 && <option value="deposit">증권사 예수금 연결</option>}
        <option value="hold">연결 필요 · 이번 보류</option><option value="exclude">계속 제외</option>
      </select>
      {d.action === 'new' && !row.blocked && <input className="input" aria-label={`${row.name} 표시 이름`} value={d.name ?? row.name} maxLength={200} disabled={disabled} onChange={e => set(row, { name: e.target.value })} />}
      {d.action === 'link' && !row.blocked && <select className="input" aria-label={`${row.name} 기존 항목`} value={d.targetId || ''} disabled={disabled} onChange={e => set(row, { targetId: e.target.value, replaceSourceKey: '' })}><option value="">등록 대상 선택</option>{items.map(i => {
        const used = row.kind !== 'broker' && rows.some(other => other.key !== row.key && choice(other).targetId === i.id && other.kind !== 'broker' && choice(other).action !== 'deposit' && (other.saved || selected(other)));
        return <option key={i.id} value={i.id} disabled={used && !(row.saved && row.decision.targetId === i.id)}>{i.name}{used && !row.saved ? ' · 다른 항목에 연결됨' : ''}</option>;
      })}</select>}
      {d.action === 'deposit' && <select className="input" aria-label={`${row.name} 소속 증권사`} value={d.brokerageKey || ''} disabled={disabled} onChange={e => set(row, { brokerageKey: e.target.value, selected: false })}><option value="">소속 증권사 선택</option>{banks.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}</select>}
      {row.name.startsWith('!') && <small>원본의 ! 표시를 해제하면 다시 포함할 수 있습니다.</small>}
    </div>;
  };
  return <section className="import-asset-panel" aria-label="자산·부채 연결 확인">
    {blockedRows.length > 0 && <div className="import-blocked-notice">
      <span className="import-notice-symbol"><Ban size={20} aria-hidden="true" /></span>
      <div><strong>반영 불가 {blockedRows.length}개</strong><p>{duplicateOnly ? '같은 이름의 자산을 구분할 수 없습니다. 원본 이름을 바꾼 뒤 다시 올려주세요.' : '원본 정보 확인이 필요합니다. 해당 항목을 제외한 나머지는 반영할 수 있습니다.'}</p></div>
      <button type="button" onClick={() => setFilter('review')}>확인할 항목 보기<ArrowRight size={14} aria-hidden="true" /></button>
    </div>}
    <div className="import-filters" role="group" aria-label="자산 상태 필터">
      {[['all', '전체', rows.length, List], ['review', '확인 필요', rows.filter(needsReview).length, TriangleAlert], ['selected', '반영 대상', importSelectionSummary(rows, decisions).selected, CircleCheck], ['excluded', '제외', rows.filter(excluded).length, CircleSlash]].map(([id, title, count, Icon]) => <button key={id} type="button" className={`import-filter import-filter-${id} ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}><Icon size={14} aria-hidden="true" />{title} <span>{count}</span></button>)}
      <button className="btn btn-secondary import-bulk" type="button" disabled={disabled} onClick={() => rows.forEach(row => { const d = choice(row); if (!row.saved && importRowStatus(row, d) === '신규' && importRowReady(row, d)) set(row, { selected: true }); })}>전체 신규 선택</button>
    </div>
    {preview.warnings?.length > 0 && <details className="import-notice"><summary>분석 안내 {preview.warnings.length}개</summary>{preview.warnings.map(w => <p key={w}>{w}</p>)}</details>}
    <div className="import-table-scroll"><table className="data-table import-asset-table"><thead><tr><th>반영</th><th>원본 자산명</th><th>구분</th><th className="import-number">금액 (원)</th><th>연결 상태</th><th>등록 대상</th></tr></thead><tbody>
      {visible.map((row, index) => {
        const d = choice(row), status = importRowStatus(row, d), id = `${row.key}:${row.cell || (row.kind === 'broker' ? 'broker' : index)}`;
        const parent = d.action === 'deposit' && banks.find(b => b.key === d.brokerageKey), bank = row.kind === 'broker' ? bankTotals(row) : null;
        const debt = row.overdraftCandidates && rows.find(r => r.key === d.overdraftKey && r.kind === 'debt');
        const target = (structure?.[d.group] || []).find(i => i.id === d.targetId);
        const ready = importRowReady(row, d) && (!parent || selected(parent)) && (!row.overdraftCandidates || (debt && selected(debt)));
        const tone = status === '제외' ? 'excluded' : row.blocked ? 'blocked' : status === '신규' ? 'new' : status === '기존 연결' ? 'connected' : status === '연결 후보' ? 'candidate' : 'review';
        return <Fragment key={id}><tr className={`import-tone-${tone} ${row.blocked ? 'import-row-blocked' : ''} ${selected(row) ? 'import-row-selected' : ''}`}>
          <td><input type="checkbox" aria-label={`${row.name} 반영${row.cell ? ` ${row.cell}` : ''}`} checked={selected(row)} disabled={disabled || !ready} onChange={e => set(row, { selected: e.target.checked })} /></td>
          <td><button type="button" className="import-row-title" aria-expanded={Boolean(expanded[id])} onClick={() => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}>{expanded[id] ? '▾' : '▸'} {row.name}</button>{groups.has(row.key) && <small className="import-duplicate">중복 그룹 {groups.get(row.key)}</small>}{row.kind === 'broker' && <small>상품 {row.products.length}개{row.products.some(p => p.isNew || p.issue) ? ` · 확인 ${row.products.filter(p => p.isNew || p.issue).length}개` : ''}</small>}</td>
          <td>{row.kind === 'debt' ? '부채' : row.kind === 'broker' ? '투자·자산' : d.action === 'deposit' ? '예수금' : d.group === 'investItems' ? '투자·자산' : '현금·계좌'}{parent && <small>{parent.name}{!selected(parent) ? ' · 증권사 선택 필요' : ''}</small>}</td>
          <td className="import-number">{row.amount === null ? '확인 필요' : formatKRW(bank ? bank.total : row.amount)}</td>
          <td><ImportStatus tone={tone} description={row.blocked ? status : undefined}>{row.blocked ? '반영 불가' : status}</ImportStatus>{row.blocked && <small className="import-blocked-reason">{row.blocked.includes('동명') ? '원본 이름 중복' : row.blocked}</small>}{row.overdraftCandidates && !ready && <small>대응 대출 확인·선택 필요</small>}</td>
          <td>{disabled && target ? target.name : targetEditor(row, d)}</td>
        </tr>
        {expanded[id] && <tr className="import-detail-row"><td colSpan={6}><div className="import-detail">
          {row.kind === 'broker' && <>
            <div className="import-broker-totals"><span>상품 평가액 <b>{formatKRW(bank.evaluated)}</b></span><span>예수금 합계 <b>{formatKRW(bank.deposits)}</b></span><span>반영 총액 <b>{formatKRW(bank.total)}</b></span></div>
            <div className="import-product-list">{row.products.map((p, i) => <label key={`${p.name}:${i}`}><input type="checkbox" disabled={disabled || p.name.startsWith('!')} checked={!p.name.startsWith('!') && !(d.excludedProducts || []).includes(p.name)} onChange={e => set(row, { excludedProducts: e.target.checked ? (d.excludedProducts || []).filter(n => n !== p.name) : [...(d.excludedProducts || []), p.name] })} /><span>{p.name}{p.isNew && <em>신규</em>}{p.issue && <small className="asset-import-warning">{p.issue} · 이전값 유지</small>}</span><b>{p.amount === null ? '확인 필요' : formatKRW(p.amount)}</b></label>)}</div>
            {!row.products.length && <p>보유상품이 없어 선택 시 평가액은 0원으로 갱신합니다.</p>}
            <details><summary>예수금 계좌 연결 · 여러 계좌 선택 가능</summary>{rows.filter(r => r.kind === 'asset' && !r.overdraftCandidates && !r.blocked && !r.name.startsWith('!')).map(r => {
              const c = choice(r), linked = c.action === 'deposit' && c.brokerageKey === row.key;
              return <label className="import-deposit-choice" key={r.key}><input type="checkbox" disabled={disabled || !selected(row) || (c.action === 'deposit' && !linked)} checked={linked} onChange={e => onChange(r.key, { ...c, action: e.target.checked ? 'deposit' : 'hold', group: 'investItems', brokerageKey: e.target.checked ? row.key : '', selected: e.target.checked, persistExclusion: false })} />{r.name}<span>{formatKRW(r.amount)}</span></label>;
            })}</details>
          </>}
          {row.kind === 'asset' && ['new', 'link'].includes(d.action) && <label>등록 분류 <select className="input" aria-label={`${row.name} 분류`} disabled={disabled} value={d.group || 'cashItems'} onChange={e => set(row, { group: e.target.value, targetId: '', selected: false })}><option value="cashItems">현금·계좌</option><option value="investItems">투자·자산</option></select></label>}
          {row.overdraftCandidates && <label>마이너스통장 대응 대출 <select className="input" aria-label={`${row.name} 대응 대출`} disabled={disabled} value={d.overdraftKey || ''} onChange={e => set(row, { overdraftKey: e.target.value, selected: false })}><option value="">대출 선택 전 반영 보류</option>{row.overdraftCandidates.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>}
          {d.action === 'link' && row.replacementCandidates?.some(c => c.targetId === d.targetId && c.group === d.group) && <label>원본 이름 변경 <select className="input" disabled={disabled} value={d.replaceSourceKey || ''} onChange={e => set(row, { replaceSourceKey: e.target.value })}><option value="">해당 없음</option>{row.replacementCandidates.filter(c => c.targetId === d.targetId && c.group === d.group).map(c => <option key={c.key} value={c.key}>{c.name}의 새 이름</option>)}</select></label>}
          <small>체크 해제는 이번만 보류합니다. 다음에도 제외하려면 ‘계속 제외’를 선택하세요.</small>
        </div></td></tr>}
        </Fragment>;
      })}
      {!visible.length && <tr><td colSpan={6} className="import-empty">해당 항목이 없습니다.</td></tr>}
    </tbody></table></div>
    {filter === 'all' && rows.some(excluded) && <button type="button" className="import-excluded-toggle" aria-expanded={showExcluded} onClick={() => setShowExcluded(v => !v)}>{showExcluded ? '▾' : '▸'} 제외 {rows.filter(excluded).length}개 {showExcluded ? '접기' : '펼치기'}</button>}
  </section>;
}
