import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { parseExcelOrCsvFile, detectDuplicates } from '../utils/excelParser';
import { formatKRW } from '../utils/finance';
import { X, UploadCloud, AlertCircle, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function ImportModal({ onClose }) {
  const { db, batchImportTransactions } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [candidates, setCandidates] = useState(null); // 중복 탐지 완료된 거래 항목

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const parsedTxs = await parseExcelOrCsvFile(file);
      if (!parsedTxs || parsedTxs.length === 0) {
        setErrorMsg('파일에서 유효한 거래 내역을 찾을 수 없습니다. 열 구성을 확인하세요.');
        setIsLoading(false);
        return;
      }

      // 중복 탐지 실행
      const evaluated = detectDuplicates(parsedTxs, db.transactions);
      setCandidates(evaluated);
    } catch (err) {
      console.error('File parse error:', err);
      setErrorMsg('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSelect = (id) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const handleSelectAll = (selectVal) => {
    setCandidates(prev => prev.map(c => ({ ...c, selected: selectVal })));
  };

  const handleConfirmImport = () => {
    const selectedTxs = candidates.filter(c => c.selected).map(({ selected, duplicateStatus, duplicateReason, ...tx }) => tx);
    if (selectedTxs.length === 0) {
      alert('가져올 거래 항목을 하나 이상 선택하세요.');
      return;
    }

    batchImportTransactions(selectedTxs);
    alert(`${selectedTxs.length}건의 거래 내역을 가계부에 등록했습니다! (월별 자동 분류됨)`);
    onClose();
  };

  const selectedCount = candidates ? candidates.filter(c => c.selected).length : 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '950px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fff' }}>
              📥 뱅크샐러드 / 엑셀 거래 가져오기 및 중복 검증
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              여러 달(Month)의 거래가 섞여 있어도 일자별로 자동 저장되며 중복 거래는 사전에 차단합니다.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {/* 파일 선택 영역 */}
        {!candidates && (
          <div style={{ border: '2px dashed var(--border-highlight)', borderRadius: 'var(--radius-md)', padding: '40px', textAlign: 'center', background: 'rgba(15, 23, 42, 0.5)', margin: '20px 0' }}>
            <UploadCloud size={48} color="var(--accent-cyan)" style={{ marginBottom: '12px' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>
              뱅크샐러드 또는 가계부 엑셀/CSV 파일 선택
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              A:날짜, B:타입, C:대분류, D:내용, E:금액, F:비고(의료비 보험받음 등) 포맷을 지원합니다.
            </p>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="excel-file-input"
            />
            <label htmlFor="excel-file-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
              파일 탐색기에서 파일 선택
            </label>
            {isLoading && <p style={{ marginTop: '12px', color: 'var(--accent-cyan)' }}>파일 분석 중...</p>}
            {errorMsg && <p style={{ marginTop: '12px', color: 'var(--accent-rose)' }}>⚠️ {errorMsg}</p>}
          </div>
        )}

        {/* 중복 탐지 미리보기 및 최종 확인 표 */}
        {candidates && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30, 41, 59, 0.6)', padding: '12px 16px', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.9rem', color: '#fff' }}>
                총 분석: <strong>{candidates.length}건</strong> | 등록 대상: <strong style={{ color: 'var(--accent-emerald)' }}>{selectedCount}건</strong>
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleSelectAll(true)}>전체 선택</button>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleSelectAll(false)}>전체 해제</button>
              </div>
            </div>

            <div className="data-table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>선택</th>
                    <th>상태 / 중복 사유</th>
                    <th>날짜 (A)</th>
                    <th>타입 (B)</th>
                    <th>대분류 (C)</th>
                    <th>내용 (D)</th>
                    <th>금액 (E)</th>
                    <th>비고 (F) / 보험</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(item => {
                    const isExact = item.duplicateStatus === 'EXACT';
                    const isFuzzy = item.duplicateStatus === 'FUZZY';
                    const isMedical = item.category === '의료비';
                    const isClaimed = (item.memo || '').includes('보험받음');

                    return (
                      <tr key={item.id} style={{ opacity: item.selected ? 1 : 0.5, background: isExact ? 'rgba(244, 63, 94, 0.08)' : isFuzzy ? 'rgba(245, 158, 11, 0.08)' : 'transparent' }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleSelect(item.id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td>
                          {isExact && <span className="badge badge-danger">🛑 완전 중복</span>}
                          {isFuzzy && <span className="badge badge-warning">⚠️ 의심 중복</span>}
                          {!isExact && !isFuzzy && <span className="badge badge-stable">✨ 신규 거래</span>}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>{item.duplicateReason}</div>
                        </td>
                        <td>{item.date}</td>
                        <td>{item.type}</td>
                        <td>{item.category}</td>
                        <td>{item.description}</td>
                        <td style={{ fontWeight: '600' }}>{formatKRW(item.amount)}</td>
                        <td>
                          {isMedical && isClaimed ? (
                            <span className="badge badge-stable" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              <ShieldCheck size={12} /> 보험받음
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.memo || '-'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setCandidates(null)}>전체 취소 및 다시 선택</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={onClose}>닫기</button>
                <button className="btn btn-primary" onClick={handleConfirmImport}>
                  선택한 {selectedCount}건 가계부에 일괄 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
