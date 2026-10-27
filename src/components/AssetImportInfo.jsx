import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW } from '../utils/finance';
import './AssetImport.css';

const stamp = value => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
export default function AssetImportInfo({ month, snapshot, editingSnapshot }) {
  const { db, familyMembers, setImportMappingExcluded, isSavePending } = useApp();
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const mappings = db.assetImportMappings?.entries || {}, meta = snapshot.importData;
  const members = Object.fromEntries(familyMembers.map(m => [m.id, m.name]));
  const toggle = async (key, value) => { const r = await setImportMappingExcluded(key, value); setError(r.success ? '' : r.message); };
  return <section className="asset-import-review">
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
      <div><strong>엑셀 반영 현황</strong><p>{meta?.lastImportedAt ? `${month} · 마지막 엑셀 반영 ${stamp(meta.lastImportedAt)}` : `${month}에 엑셀로 반영한 기록이 없습니다.`}</p></div>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>연결·제외 설정</button>
    </div>
    {Object.entries(meta?.lastByMember || {}).map(([id, v]) => <small key={id}>{members[id] || v.name} · {stamp(v.at)}　</small>)}
    {Object.entries(meta?.brokerages || {}).map(([key, broker]) => {
      const deposits = Object.values(meta.sources || {}).filter(s => s.brokerageKey === key);
      const cash = deposits.reduce((s, d) => s + d.amount, 0), total = broker.evaluated + cash;
      const current = editingSnapshot?.invest?.[broker.targetId] ?? snapshot.invest?.[broker.targetId];
      const item = db.assetStructure.investItems.find(i => i.id === broker.targetId);
      if (!item) return null;
      return <details key={key}><summary>{members[broker.memberId] || item.owner} · {item.name} · 엑셀 합계 {formatKRW(total)}</summary>
        <p>상품 평가액 {formatKRW(broker.evaluated)} + 예수금 {formatKRW(cash)}</p>
        {current !== undefined && Math.abs(current - total) > 0.001 && <p className="asset-import-warning">현재 입력액 {formatKRW(current)}은 마지막 엑셀 상세 합계와 다릅니다. 수기 조정값은 다음 당월 업로드에서 갱신될 수 있습니다.</p>}
        {broker.products.map((p, i) => <div className="asset-import-product" key={`${p.name}:${i}`}>{p.name}<span>{formatKRW(p.amount)}</span></div>)}
        {deposits.map(d => <div className="asset-import-product" key={d.name}>{d.name} (예수금)<span>{formatKRW(d.amount)}</span></div>)}
      </details>;
    })}
    {open && <div className="modal-overlay"><div className="modal-content asset-import-modal"><h3>엑셀 연결·제외 설정</h3>
      <p>변경은 다음 업로드부터 적용됩니다. 연결 대상 변경과 예수금 재배정은 업로드 확인 화면에서 할 수 있습니다.</p>
      {Object.entries(mappings).map(([key, m]) => <div className="asset-import-row" key={key}>
        <strong>{members[m.memberId] || '삭제된 구성원'} · {m.sourceName}</strong>
        <p>{m.kind === 'broker' ? '증권사' : m.kind === 'debt' ? '부채' : m.brokerageKey ? '예수금' : '자산'} → {m.targetId ? Object.values(db.assetStructure).flat().find(i => i.id === m.targetId)?.name || '연결 대상 없음 · 재확인 필요' : '연결 전'}</p>
        <label><input type="checkbox" disabled={isSavePending('assetImport') || m.sourceName.startsWith('!')} checked={!m.excluded} onChange={e => toggle(key, !e.target.checked)} /> 다음 업로드에 포함{m.sourceName.startsWith('!') ? ' (! 해제는 원본 이름 변경 필요)' : ''}</label>
      </div>)}
      {!Object.keys(mappings).length && <p>저장된 연결이 없습니다. 거래내역에서 엑셀을 업로드해 연결하세요.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="btn btn-secondary" disabled={isSavePending('assetImport')} onClick={() => setOpen(false)}>닫기</button>
    </div></div>}
  </section>;
}
