import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW } from '../utils/finance';
import { Plus, Edit2, Trash2, X, ChevronDown, Info } from 'lucide-react';

export default function IncomeView() {
  const { db, currentMetrics, yearlyMetrics, selectedMonth, addIncomeCategory, updateIncomeCategory, deleteIncomeCategory, familyMembers } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [ownerInput, setOwnerInput] = useState('가족공동');
  const [modalMsg, setModalMsg] = useState('');

  const [viewTab, setViewTab] = useState('compact');

  const currentMembers = familyMembers && familyMembers.length > 0
    ? familyMembers
    : [
        { id: 'm1', name: '남편' },
        { id: 'm2', name: '아내' },
        { id: 'm3', name: '가족공동' },
      ];

  const selectedMember = currentMembers.find(m => m.id === viewTab);
  // 드릴다운 팝오버 상태: { month, owner, data }
  const [popover, setPopover] = useState(null);

  const activeIncomeCategories = Array.isArray(db.incomeCategories)
    ? db.incomeCategories
    : [];

  const BENCHMARK_INCOME = 10000000;
  const diffFromBenchmark = currentMetrics.totalIncome - BENCHMARK_INCOME;

  // 소유자별 수입 합계 구하기
  const getOwnerIncomeTotal = (iMap, owner) => {
    let total = 0;
    activeIncomeCategories
      .filter(cat => (cat.owner || '가족공동') === owner)
      .forEach(cat => {
        total += (iMap[cat.name] || iMap[cat.id] || 0);
      });
    return total;
  };

  // 소유자별 세부 항목 리스트
  const getOwnerCategoryBreakdown = (iMap, owner) => {
    return activeIncomeCategories
      .filter(cat => (cat.owner || '가족공동') === owner)
      .map(cat => ({
        name: cat.name,
        amount: iMap[cat.name] || iMap[cat.id] || 0,
      }));
  };

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setNameInput('');
    setOwnerInput('가족공동');
    setModalMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat) => {
    setEditingCategory(cat);
    setNameInput(cat.name);
    setOwnerInput(cat.owner || '가족공동');
    setModalMsg('');
    setIsModalOpen(true);
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    setModalMsg('');

    if (editingCategory) {
      const res = updateIncomeCategory(editingCategory.id, { name: nameInput, owner: ownerInput });
      if (!res.success) {
        setModalMsg(res.message);
        return;
      }
    } else {
      const res = addIncomeCategory({ name: nameInput, owner: ownerInput });
      if (!res.success) {
        setModalMsg(res.message);
        return;
      }
    }
    setIsModalOpen(false);
  };

  const handleDeleteModal = (id) => {
    if (!window.confirm('정말 이 수입 항목을 삭제하시겠습니까?')) return;
    const res = deleteIncomeCategory(id);
    if (!res.success) {
      setModalMsg(res.message);
      return;
    }
    setIsModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 헤더 & 우측 관리 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>
            💰 수입 관리 & 소유자별 수입 집계
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {(familyMembers && familyMembers.length > 0
              ? familyMembers.map(m => m.name).join('/')
              : '가족/공동')} 소유자별 수입 항목을 동적으로 관리하고 가로 팽창 없는 컴팩트 표로 집계합니다.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleOpenAddModal}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> 수입 항목 추가/관리
        </button>
      </div>

      {/* 당월 수입 카드 */}
      <div className="grid-cards">
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>당월 총수입</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--accent-emerald)', marginTop: '4px' }}>
            {formatKRW(currentMetrics.totalIncome)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            보수적 수입 기준(1,000만원) 대비 {diffFromBenchmark >= 0 ? `+${formatKRW(diffFromBenchmark)} 달성` : `${formatKRW(diffFromBenchmark)}`}
          </div>
        </div>

        {/* 소유자별 동적 카드 */}
        {(familyMembers || [{ id: 'm1', name: '남편' }, { id: 'm2', name: '아내' }, { id: 'm3', name: '가족공동' }]).map(m => (
          <div key={m.id} className="glass-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: m.color || '#3b82f6' }} />
              {m.name} 수입 합계
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
              {formatKRW(getOwnerIncomeTotal(currentMetrics.incomeMap || {}, m.name))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              {getOwnerCategoryBreakdown(currentMetrics.incomeMap || {}, m.name)
                .map(b => `${b.name}: ${formatKRW(b.amount)}`)
                .join(' | ') || '내역 없음'}
            </div>
          </div>
        ))}
      </div>

      {/* 연간 수입 표 & 뷰 스위처 */}
      <div className="glass-card" style={{ padding: '24px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
            🗓️ 연간 월별 수입 집계 표
          </h3>

          {/* 뷰 스위처 탭 */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
            <button
              className={`btn btn-sm ${viewTab === 'compact' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewTab('compact')}
            >
              📊 전체 요약
            </button>

            {currentMembers.map(m => (
              <button
                key={m.id}
                className={`btn btn-sm ${viewTab === m.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewTab(m.id)}
              >
                👤 {m.name} 상세
              </button>
            ))}

            <button
              className={`btn btn-sm ${viewTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewTab('all')}
            >
              🔍 카테고리 전체
            </button>
          </div>
        </div>


        {/* 안내 얼럿 */}
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Info size={14} /> 기본 요약 뷰에서는 각 월의 수입 셀을 클릭하시면 세부 카테고리 내역이 팝오버로 표출됩니다.
        </div>

        {/* 표 영역 */}
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              {viewTab === 'compact' && (
                <tr>
                  <th>월</th>
                  {currentMembers.map(mem => (
                    <th key={mem.id}>{mem.name} 수입 합계 💡</th>
                  ))}
                  <th>총 수입</th>
                </tr>
              )}

              {selectedMember && (
                <tr>
                  <th>월</th>
                  {activeIncomeCategories.filter(c => (c.owner || '가족공동') === selectedMember.name).map(c => <th key={c.id}>{c.name}</th>)}
                  <th>{selectedMember.name} 수입 합계</th>
                  <th>총 수입</th>
                </tr>
              )}

              {viewTab === 'all' && (
                <tr>
                  <th>월</th>
                  {activeIncomeCategories.map(c => <th key={c.id}>{c.name} ({c.owner || '공동'})</th>)}
                  <th>총 수입</th>
                </tr>
              )}
            </thead>
            <tbody>
              {yearlyMetrics.map(m => {
                const isSelected = m.yearMonth === selectedMonth;
                const iMap = m.incomeMap || {};

                return (
                  <tr key={m.yearMonth} style={{ background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent', fontWeight: isSelected ? '600' : 'normal' }}>
                    <td>{m.month} {isSelected && '👈'}</td>

                    {/* Compact View */}
                    {viewTab === 'compact' && (
                      <>
                        {currentMembers.map(mem => {
                          const memTotal = getOwnerIncomeTotal(iMap, mem.name);
                          return (
                            <td
                              key={mem.id}
                              style={{ cursor: 'pointer', color: '#fff', textDecoration: 'underline' }}
                              onClick={() => setPopover({ month: m.month, owner: mem.name, items: getOwnerCategoryBreakdown(iMap, mem.name) })}
                            >
                              {formatKRW(memTotal)}
                            </td>
                          );
                        })}
                        <td style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>{formatKRW(m.totalIncome)}</td>
                      </>
                    )}

                    {/* Dynamic Selected Member Detail View */}
                    {selectedMember && (
                      <>
                        {activeIncomeCategories.filter(c => (c.owner || '가족공동') === selectedMember.name).map(c => (
                          <td key={c.id}>{formatKRW(iMap[c.name] || iMap[c.id] || 0)}</td>
                        ))}
                        <td style={{ fontWeight: '600', color: '#fff' }}>{formatKRW(getOwnerIncomeTotal(iMap, selectedMember.name))}</td>
                        <td style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>{formatKRW(m.totalIncome)}</td>
                      </>
                    )}

                    {/* All Categories View */}
                    {viewTab === 'all' && (
                      <>
                        {activeIncomeCategories.map(c => (
                          <td key={c.id}>{formatKRW(iMap[c.name] || iMap[c.id] || 0)}</td>
                        ))}
                        <td style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>{formatKRW(m.totalIncome)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 셀 클릭 드릴다운 팝오버 모달 */}
      {popover && (
        <div className="modal-overlay" onClick={() => setPopover(null)}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>
                🔍 {popover.month} {popover.owner} 수입 세부 내역
              </h3>
              <button onClick={() => setPopover(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {popover.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{item.name}</span>
                  <span style={{ fontWeight: '600', color: '#fff' }}>{formatKRW(item.amount)}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setPopover(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 수입 항목 추가 / 수정 모달 */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
                {editingCategory ? '⚙️ 수입 항목 수정' : '➕ 신규 수입 항목 추가'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            {modalMsg && (
              <div style={{ padding: '10px 14px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '16px' }}>
                {modalMsg}
              </div>
            )}

            <form onSubmit={handleSaveModal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">수입 카테고리 명칭</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="예: 부업, 배당금, 연말정산환급금"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">소유자 귀속 지정</label>
                <select
                  className="form-input"
                  value={ownerInput}
                  onChange={e => setOwnerInput(e.target.value)}
                >
                  {(familyMembers || [{ id: 'm1', name: '남편' }, { id: 'm2', name: '아내' }, { id: 'm3', name: '가족공동' }]).map(m => (
                    <option key={m.id} value={m.name}>{m.name} 수입</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                {editingCategory ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDeleteModal(editingCategory.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={16} /> 삭제
                  </button>
                ) : <div />}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>취소</button>
                  <button type="submit" className="btn btn-primary">저장하기</button>
                </div>
              </div>
            </form>

            {/* 기존 등록 항목 리스트 */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#fff', marginBottom: '12px' }}>
                📋 현재 등록된 수입 항목 목록 ({activeIncomeCategories.length}개)
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {activeIncomeCategories.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => handleOpenEditModal(cat)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      color: '#fff',
                    }}
                  >
                    <span>{cat.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>({cat.owner || '공동'})</span>
                    <Edit2 size={12} color="var(--accent-cyan)" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
