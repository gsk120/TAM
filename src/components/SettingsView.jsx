import React from 'react';
import { useApp } from '../context/AppContext';
import * as XLSX from 'xlsx';
import { Download, Upload, RotateCcw, ShieldCheck } from 'lucide-react';

export default function SettingsView() {
  const { db, handleReset, importFullDatabase } = useApp();

  // CSV/Excel 거래 내역 내보내기
  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(db.transactions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '전체거래내역');
    XLSX.writeFile(wb, `가족가계부_전체내역_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // JSON 데이터베이스 백업 다운로드
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `가족가계부_DB백업_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // JSON 데이터베이스 복원 (Express 백엔드 SQLite DB 및 LocalStorage 통합 동기화)
  const handleImportJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (importedData && typeof importedData === 'object' && (Array.isArray(importedData.transactions) || importedData.monthlyAssetSnapshots || importedData.categories)) {
          importFullDatabase(importedData);
          alert('✅ 백업 데이터가 성공적으로 복원되고 SQLite 데이터베이스에 동기화되었습니다!');
        } else {
          alert('⚠️ 유효하지 않은 백업 파일 형식입니다.');
        }
      } catch (err) {
        alert('파일 파싱 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>
          ⚙️ 백업, 내보내기 및 데이터 관리
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          모든 데이터는 브라우저 내부(LocalStorage)에 안전하게 보관되며, 언제든지 파일로 백업할 수 있습니다.
        </p>
      </div>

      <div className="grid-cards">
        {/* 엑셀 내보내기 */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Download size={24} color="var(--accent-cyan)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>전체 내역 Excel 내보내기</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            가계부의 모든 거래 내역을 .xlsx 엑셀 파일로 다운로드합니다.
          </p>
          <button className="btn btn-primary" onClick={handleExportExcel} style={{ marginTop: 'auto' }}>
            Excel 파일 내보내기
          </button>
        </div>

        {/* JSON 백업 파일 다운로드 */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={24} color="var(--accent-emerald)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>전체 데이터 JSON 백업</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            카테고리, 예산, 계좌, 거래 내역 전체를 안전한 백업 파일로 저장합니다.
          </p>
          <button className="btn btn-secondary" onClick={handleExportJSON} style={{ marginTop: 'auto' }}>
            JSON 백업 다운로드
          </button>
        </div>

        {/* 백업 파일 복원 */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Upload size={24} color="var(--accent-purple)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>백업 파일에서 복원</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            저장해둔 JSON 백업 파일을 업로드하여 가계부 데이터를 원상 복구합니다.
          </p>
          <input
            type="file"
            accept=".json"
            id="json-import-input"
            style={{ display: 'none' }}
            onChange={handleImportJSON}
          />
          <label htmlFor="json-import-input" className="btn btn-secondary" style={{ marginTop: 'auto', cursor: 'pointer', textAlign: 'center' }}>
            백업 파일 선택 및 복원
          </label>
        </div>

        {/* 데이터 초기화 */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', borderBorder: 'var(--accent-rose)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RotateCcw size={24} color="var(--accent-rose)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>데이터 초기화</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            데이터베이스를 초기화하고 기본 카테고리 및 설정 상태로 리셋합니다.
          </p>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('정말로 모든 데이터를 초기화하고 기본 설정 상태로 되돌리시겠습니까?')) {
                handleReset();
                alert('초기화되었습니다.');
              }
            }}
            style={{ marginTop: 'auto' }}
          >
            데이터 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
