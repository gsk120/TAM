import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as XLSX from 'xlsx';
import { Download, Upload, RotateCcw, ShieldCheck, Users, Plus, Trash2, Edit3, Check } from 'lucide-react';

export default function SettingsView() {
  const { db, handleReset, importFullDatabase, familyMembers, updateFamilyMembers } = useApp();

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberColor, setNewMemberColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');

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

  // JSON 데이터베이스 복원
  const handleImportJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (importedData && typeof importedData === 'object' && (Array.isArray(importedData.transactions) || importedData.monthlyAssetSnapshots || importedData.categories)) {
          importFullDatabase(importedData);
          alert('✅ 백업 데이터가 성공적으로 복원되었습니다!');
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

  // 가족 구성원 추가
  const handleAddMember = (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    const newMember = {
      id: `m_${Date.now()}`,
      name: newMemberName.trim(),
      color: newMemberColor,
    };
    updateFamilyMembers([...familyMembers, newMember]);
    setNewMemberName('');
    setNewMemberColor('#3b82f6');
  };

  // 가족 구성원 삭제
  const handleDeleteMember = (id) => {
    if (familyMembers.length <= 1) {
      alert('최소 1명의 가족 구성원이 등록되어 있어야 합니다.');
      return;
    }
    if (window.confirm('해당 가족 구성원을 삭제하시겠습니까?')) {
      updateFamilyMembers(familyMembers.filter(m => m.id !== id));
    }
  };

  // 편집 시작
  const handleStartEdit = (member) => {
    setEditingId(member.id);
    setEditingName(member.name);
    setEditingColor(member.color || '#3b82f6');
  };

  // 편집 저장
  const handleSaveEdit = (id) => {
    if (!editingName.trim()) return;
    updateFamilyMembers(familyMembers.map(m => m.id === id ? { ...m, name: editingName.trim(), color: editingColor } : m));
    setEditingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>
          ⚙️ 백업, 환경설정 및 가족 정보 관리
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          모든 데이터는 서버(Supabase PostgreSQL DB)에 안전하게 중앙 관리됩니다.
        </p>
      </div>

      {/* 가족 구성원 관리 카드 */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Users size={24} color="var(--accent-cyan)" />
          <div>
            <h3 style={{ fontSize: '1.17rem', fontWeight: '700', color: '#fff' }}>가족/구성원 소유자 관리</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              가계부 내 수입, 자산, 거래 내역에서 사용되는 소유자(Owner) 배지 이름과 색상을 지정합니다.
            </p>
          </div>
        </div>

        {/* 구성원 리스트 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {familyMembers.map(m => {
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                {!isEditing ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: m.color || '#3b82f6',
                          display: 'inline-block',
                          boxShadow: `0 0 8px ${m.color || '#3b82f6'}`,
                        }}
                      />
                      <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#fff' }}>{m.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                        title="수정"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMember(m.id)}
                        style={{ background: 'transparent', border: 'none', color: '#fda4af', cursor: 'pointer', padding: '4px' }}
                        title="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <input
                        type="color"
                        value={editingColor}
                        onChange={e => setEditingColor(e.target.value)}
                        style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: '#0f172a',
                          border: '1px solid var(--border-color)',
                          color: '#fff',
                          fontSize: '0.9rem',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(m.id)}
                      style={{ background: 'var(--accent-emerald)', border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 10px', cursor: 'pointer' }}
                    >
                      <Check size={16} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* 새 구성원 추가 폼 */}
        <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="color"
            value={newMemberColor}
            onChange={e => setNewMemberColor(e.target.value)}
            style={{ width: '38px', height: '38px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            title="대표 대표 색상 선택"
          />
          <input
            type="text"
            placeholder="새 구성원 이름 (예: 서아, 서빈)"
            value={newMemberName}
            onChange={e => setNewMemberName(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
          <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> 구성원 추가
          </button>
        </form>
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

