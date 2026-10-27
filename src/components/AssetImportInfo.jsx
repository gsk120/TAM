import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ImportStatus from './ImportStatus';
import './AssetImport.css';

const stamp = value => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
export default function AssetImportInfo({ month, snapshot }) {
  const { db, familyMembers, setImportMappingExcluded, isSavePending } = useApp();
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
  const dialogRef = useRef(null), triggerRef = useRef(null), closeRef = useRef(null);
  const busy = saving || isSavePending('assetImport');
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const mappings = db.assetImportMappings?.entries || {}, meta = snapshot.importData;
  const members = Object.fromEntries(familyMembers.map(m => [m.id, m.name]));
  const targets = Object.values(db.assetStructure).flat();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const toggle = async (key, excluded) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await setImportMappingExcluded(key, excluded);
      if (result.success) setNotice('설정을 저장했습니다. 다음 업로드부터 적용됩니다.');
      else setError(result.message || '설정을 저장하지 못했습니다. 다시 시도해 주세요.');
    } catch {
      setError('설정을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally { setSaving(false); }
  };

  return <section className="asset-import-review asset-import-info" aria-label="엑셀 반영 현황">
    <div className="asset-import-info-heading">
      <div><strong>엑셀 반영 현황</strong><p>{meta?.lastImportedAt ? `${month} · 마지막 엑셀 반영 ${stamp(meta.lastImportedAt)}` : `${month}에 엑셀로 반영한 기록이 없습니다.`}</p></div>
      <button ref={triggerRef} className="btn btn-secondary" onClick={() => { setError(''); setNotice(''); setOpen(true); }}>연결·제외 설정</button>
    </div>
    <div className="asset-import-member-stamps">{Object.entries(meta?.lastByMember || {}).map(([id, value]) => <small key={id}>{members[id] || value.name} · {stamp(value.at)}</small>)}</div>
    {open && <div className="modal-overlay"><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mapping-dialog-title" aria-describedby="mapping-dialog-description" className="modal-content asset-import-modal import-dialog import-mappings-dialog">
      <header className="import-dialog-header">
        <div><h3 id="mapping-dialog-title">엑셀 연결·제외 설정</h3><p id="mapping-dialog-description">변경은 다음 업로드부터 적용됩니다. 연결 대상·예수금 재배정은 업로드 확인 화면에서 변경하세요.</p></div>
        <button ref={closeRef} className="import-close" aria-label="연결·제외 설정 닫기" disabled={busy} onClick={() => setOpen(false)}><X size={22} /></button>
      </header>
      <div className="import-mappings-scroll" tabIndex={0} aria-label="저장된 연결 목록">
        <table className="import-mappings-table">
          <thead><tr><th scope="col">구성원</th><th scope="col">원본 항목명</th><th scope="col">구분</th><th scope="col">연결 대상</th><th scope="col">다음 업로드에 포함</th></tr></thead>
          <tbody>{Object.entries(mappings).map(([key, mapping]) => {
            const member = members[mapping.memberId] || '삭제된 구성원';
            const locked = mapping.sourceName.startsWith('!');
            const excluded = locked || mapping.excluded;
            const target = targets.find(item => item.id === mapping.targetId);
            return <tr key={key} className={excluded ? 'import-mapping-excluded' : ''}>
              <td>{member}</td><td><strong>{mapping.sourceName}</strong></td>
              <td>{mapping.kind === 'broker' ? '증권사' : mapping.kind === 'debt' ? '부채' : mapping.brokerageKey ? '예수금' : '자산'}</td>
              <td>{mapping.targetId ? target?.name || <span className="asset-import-warning">연결 대상 없음 · 재확인 필요</span> : <span className="import-muted">연결 전</span>}</td>
              <td><label className="import-mapping-choice"><input type="checkbox" aria-label={`${member} ${mapping.sourceName} 다음 업로드에 포함`} disabled={busy || locked} checked={!excluded} onChange={event => toggle(key, !event.target.checked)} /><ImportStatus tone={excluded ? 'excluded' : 'connected'}>{excluded ? '제외' : '포함'}</ImportStatus></label>{locked && <small>원본 이름의 ! 제거 후 다시 업로드</small>}</td>
            </tr>;
          })}{!Object.keys(mappings).length && <tr><td colSpan={5} className="import-empty">저장된 연결이 없습니다. 거래내역에서 엑셀을 업로드해 연결하세요.</td></tr>}</tbody>
        </table>
      </div>
      <footer className="import-dialog-footer">
        <div><small>저장된 연결 {Object.keys(mappings).length}개 · 포함 여부는 변경 즉시 저장</small>{error ? <p className="import-mapping-error" role="alert">{error}</p> : <small role="status">{busy ? '설정을 저장하고 있습니다…' : notice}</small>}</div>
        <button className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>닫기</button>
      </footer>
    </div></div>}
  </section>;
}
