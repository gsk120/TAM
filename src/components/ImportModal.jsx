import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { parseExcelOrCsvFile, detectDuplicates } from '../utils/excelParser';
import { formatKRW } from '../utils/finance';
import { X, UploadCloud, ReceiptText, Landmark, CircleCheck, LoaderCircle } from 'lucide-react';
import { initialImportDecisions, importSelectionSummary } from '../../server/asset-import-selection.js';
import AssetImportReview from './AssetImportReview';
import ImportStatus from './ImportStatus';
import './AssetImport.css';

export default function ImportModal({ onClose, targetMonth }) {
  const { db, batchImportTransactions, familyMembers, requestAssetImport } = useApp();
  const [owner, setOwner] = useState(() => familyMembers?.[0]?.name || '가족공동');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [tab, setTab] = useState('transactions');
  const [candidates, setCandidates] = useState(null);
  const [preview, setPreview] = useState(null);
  const [payload, setPayload] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [done, setDone] = useState({});
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});
  const busy = loading || Boolean(saving);
  const summary = importSelectionSummary(preview?.rows || [], decisions);
  const transactionCount = candidates?.filter(c => c.selected).length || 0;
  const newTransactions = candidates?.filter(c => !c.duplicateStatus || c.duplicateStatus === 'NONE').length || 0;

  useEffect(() => {
    if (!busy) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const reset = () => { setCandidates(null); setPreview(null); setPayload(null); setDecisions({}); setDone({}); setResults({}); setErrors({}); setFileName(''); setTab('transactions'); };
  const updateDecision = (key, decision) => {
    setDecisions(prev => ({ ...prev, [key]: decision }));
    setPayload(prev => prev ? { ...prev, requestId: crypto.randomUUID() } : prev);
    setErrors(prev => ({ ...prev, assets: '' }));
  };
  const upload = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const activeOwner = familyMembers.find(m => file.name.includes(m.name))?.name || owner;
    setLoading(true); setOwner(activeOwner); setFileName(file.name); setErrors({}); setDone({}); setResults({}); setPreview(null); setPayload(null); setDecisions({}); setTab('transactions');
    try {
      const parsed = await parseExcelOrCsvFile(file, targetMonth);
      setCandidates(detectDuplicates(parsed.map(tx => ({ ...tx, owner: activeOwner })), db.transactions.filter(tx => tx.date.slice(0, 7) === targetMonth)));
      if (/\.xlsx?$/i.test(file.name)) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        if (buffer.length > 6 * 1024 * 1024) { setPreview({ success: false, message: '6MB를 초과해 자산 분석을 생략합니다.' }); return; }
        let binary = '';
        for (let i = 0; i < buffer.length; i += 32768) binary += String.fromCharCode(...buffer.subarray(i, i + 32768));
        const input = { file: btoa(binary), month: targetMonth, memberId: familyMembers.find(m => m.name === activeOwner)?.id, requestId: crypto.randomUUID(), selectionMode: 'explicit' };
        setPayload(input);
        const response = await requestAssetImport('preview', input);
        setPreview(response);
        if (response.success) setDecisions(initialImportDecisions(response.rows || []));
      }
    } catch (err) { setErrors({ transactions: `파일을 읽지 못했습니다: ${err.message}` }); }
    finally { setLoading(false); }
  };
  const saveTransactions = async () => {
    if (busy || done.transactions || !transactionCount) return;
    setSaving('transactions'); setErrors(prev => ({ ...prev, transactions: '' }));
    try {
      const transactions = candidates.filter(c => c.selected).map(c => {
        const transaction = { ...c }; delete transaction.selected; delete transaction.duplicateStatus; delete transaction.duplicateReason; return transaction;
      });
      const response = await batchImportTransactions(transactions);
      if (!response.success) throw new Error(response.message || '거래 저장에 실패했습니다.');
      setDone(prev => ({ ...prev, transactions: true }));
      setResults(prev => ({ ...prev, transactions: `거래 ${transactions.length}건 등록 완료` }));
    } catch (err) { setErrors(prev => ({ ...prev, transactions: err.message })); }
    finally { setSaving(''); }
  };
  const saveAssets = async () => {
    if (busy || done.assets || !preview?.eligible || (!summary.selected && !summary.settings)) return;
    setSaving('assets'); setErrors(prev => ({ ...prev, assets: '' }));
    try {
      const response = await requestAssetImport('commit', { ...payload, decisions });
      if (!response.success) throw new Error(response.message || '자산 저장에 실패했습니다.');
      setDone(prev => ({ ...prev, assets: true }));
      setResults(prev => ({ ...prev, assets: `${summary.selected ? `선택 자산 ${summary.selected}개 반영 완료` : '잔액 변경 없음'}${summary.deposits ? ` · 예수금 ${summary.deposits}개 포함` : ''}${summary.settings ? ` · 제외 설정 ${summary.settings}개 저장` : ''}${response.result.held.length ? ` · 보류 ${response.result.held.length}개` : ''}` }));
    } catch (err) { setErrors(prev => ({ ...prev, assets: err.message })); }
    finally { setSaving(''); }
  };
  const tabKey = event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 'transactions' : event.key === 'End' ? 'assets' : tab === 'assets' ? 'transactions' : 'assets';
      setTab(next); document.getElementById(`import-tab-${next}`)?.focus();
    }
  };

  return <div className="modal-overlay"><div className="modal-content asset-import-modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
    <header className="import-dialog-header"><div><h3 id="import-dialog-title">엑셀 가져오기</h3><p>{targetMonth} · {owner}{fileName && <> · <span title={fileName}>{fileName}</span></>}</p></div><button type="button" className="import-close" aria-label="가져오기 닫기" disabled={busy} onClick={onClose}><X size={22} /></button></header>
    {candidates === null ? <div className="import-file-panel">
      <label>구성원 <select className="input" aria-label="엑셀 소유 구성원" disabled={busy} value={owner} onChange={e => setOwner(e.target.value)}>{familyMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select></label>
      <div className="import-dropzone"><UploadCloud size={36} /><h4>뱅크샐러드 엑셀을 선택하세요</h4><p>한 번 선택하고 거래와 총자산을 각각 등록합니다.</p><input id="excel-file-input" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={upload} /><label htmlFor="excel-file-input" className="btn btn-primary">파일 선택</label></div>
      {errors.transactions && <p role="alert">{errors.transactions}</p>}
    </div> : <>
      <div className="import-tabs" role="tablist" aria-label="등록 구분" onKeyDown={tabKey}>
        {[['transactions', '거래내역 등록', `신규 ${newTransactions}건`, ReceiptText], ['assets', '총자산 등록', `확인 필요 ${summary.needsReview}개`, Landmark]].map(([id, label, count, Icon]) => <button key={id} type="button" id={`import-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`import-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
          <Icon className="import-tab-icon" size={20} aria-hidden="true" />
          <span className="import-tab-label">{label}</span>
          <span className={`import-tab-count ${done[id] ? 'is-done' : ''}`}>{saving === id ? <><LoaderCircle size={13} className="import-spin" aria-hidden="true" />저장 중</> : done[id] ? <><CircleCheck size={13} aria-hidden="true" />완료</> : count}</span>
        </button>)}
      </div>
      <div className="import-dialog-body">
        <section role="tabpanel" id="import-panel-transactions" aria-labelledby="import-tab-transactions" hidden={tab !== 'transactions'}>
          <div className="import-tab-summary"><span>조회월 거래 <b>{candidates.length}건</b> · 선택 <b>{transactionCount}건</b></span><div><button className="btn btn-secondary" disabled={busy || done.transactions} onClick={() => setCandidates(prev => prev.map(c => ({ ...c, selected: true })))}>전체 선택</button><button className="btn btn-secondary" disabled={busy || done.transactions} onClick={() => setCandidates(prev => prev.map(c => ({ ...c, selected: false })))}>전체 해제</button></div></div>
          <div className="import-table-scroll"><table className="data-table import-transactions-table"><thead><tr><th>선택</th><th>상태</th><th>날짜</th><th>타입</th><th>대분류</th><th>내용</th><th className="import-number">금액</th><th>메모</th></tr></thead><tbody>{candidates.map(item => <tr key={item.id} className={item.selected ? 'import-row-selected' : ''}>
            <td><input type="checkbox" aria-label={`${item.description} 거래 선택`} checked={item.selected} disabled={busy || done.transactions} onChange={() => setCandidates(prev => prev.map(c => c.id === item.id ? { ...c, selected: !c.selected } : c))} /></td>
            <td><ImportStatus tone={item.duplicateStatus === 'EXACT' || item.duplicateStatus === 'FUZZY' ? 'review' : 'new'}>{item.duplicateStatus === 'EXACT' ? '완전 중복' : item.duplicateStatus === 'FUZZY' ? '의심 중복' : '신규'}</ImportStatus>{item.duplicateReason && <small>{item.duplicateReason}</small>}</td><td>{item.date}</td><td>{item.type}</td><td>{item.category}</td><td>{item.description}</td><td className="import-number">{formatKRW(item.amount)}</td><td>{item.memo || '—'}</td>
          </tr>)}{!candidates.length && <tr><td colSpan={8} className="import-empty">{targetMonth} 거래가 없습니다. 다른 월의 거래는 등록하지 않습니다.</td></tr>}</tbody></table></div>
        </section>
        <section role="tabpanel" id="import-panel-assets" aria-labelledby="import-tab-assets" hidden={tab !== 'assets'}>
          <AssetImportReview preview={preview} decisions={decisions} onChange={updateDecision} structure={db.assetStructure} month={targetMonth} owner={owner} disabled={busy || done.assets} />
        </section>
        {loading && <p role="status" className="import-notice">파일을 분석하고 있습니다.</p>}
        {errors[tab] && <p role="alert" className="import-error">{errors[tab]} · 선택을 유지했습니다. 다시 시도하세요.</p>}
        {results[tab] && <p role="status" className="asset-import-result">{results[tab]}</p>}
      </div>
      <footer className="import-dialog-footer"><div>{tab === 'assets' && <><small>선택 자산 {summary.selected}개{summary.deposits ? ` · 예수금 ${summary.deposits}개 포함` : ''}{summary.settings ? ` · 제외 설정 ${summary.settings}개` : ''} · 필터 밖 선택도 반영</small><small>당월 수기 보정값이 변경될 수 있습니다.</small></>}</div><div className="import-footer-actions"><button className="btn btn-secondary" disabled={busy} onClick={reset}>다른 파일</button><button className="btn btn-primary" disabled={busy || done[tab] || (tab === 'transactions' ? !transactionCount : !preview?.eligible || (!summary.selected && !summary.settings))} onClick={tab === 'transactions' ? saveTransactions : saveAssets}>{saving === tab ? '저장 중…' : done[tab] ? '저장 완료' : tab === 'transactions' ? `선택 거래 ${transactionCount}건 등록` : summary.selected ? `선택 자산 ${summary.selected}개 반영` : '제외 설정 저장'}</button></div></footer>
    </>}
  </div></div>;
}
