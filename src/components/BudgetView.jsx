import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW, formatInputNumber, parseInputNumber } from '../utils/finance';
import { Sliders, PlusCircle, Trash2, Edit3, CheckCircle, Plus, X, AlertTriangle } from 'lucide-react';

export default function BudgetView() {
  const {
    db,
    selectedMonth,
    activeScenario,
    effectiveCategoryBudgets,
    setAllCategoryBudgets,
    saveCustomBudgetPreset,
    deleteCustomBudgetPreset,
    applyBudgetPreset,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useApp();

  // 입력 필드 로컬 Draft 상태 (타자 입력 시 즉시 반영 방지)
  const [draftBudgets, setDraftBudgets] = useState({ ...effectiveCategoryBudgets });

  // 카테고리 추가/수정 모달 상태
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); // null이면 신규 추가, 객체면 수정
  const [catForm, setCatForm] = useState({
    name: '',
    defaultBudget: 0,
    isFixed: false,
  });

  // selectedMonth 또는 activeScenario, effectiveCategoryBudgets 변경 시 로컬 draft 동기화
  useEffect(() => {
    setDraftBudgets({ ...effectiveCategoryBudgets });
  }, [selectedMonth, activeScenario, effectiveCategoryBudgets]);

  const handleInputChange = (catName, val) => {
    const num = Math.max(0, Number(val) || 0);
    setDraftBudgets(prev => ({
      ...prev,
      [catName]: num,
    }));
  };

  // [적용] 버튼 클릭 시 당월 및 미래 월에 일괄 반영
  const handleApply = () => {
    setAllCategoryBudgets(draftBudgets);
    alert(`${selectedMonth}월 및 미래 모든 월에 예산 설정이 '적용'되었습니다!\n(과거 월 예산은 기존 설정대로 보존됩니다)`);
  };

  // [시나리오 저장] 버튼 클릭 시 현재 draftBudgets 저장 또는 덮어쓰기
  const handleSaveScenario = () => {
    const activePreset = db.customBudgetPresets?.[activeScenario];
    const defaultName = activePreset ? activePreset.name : '기본안 (688만원)';
    const inputName = prompt('현재 입력된 예산 현황을 시나리오로 저장합니다.\n기존 시나리오 이름으로 덮어쓰거나, 새로운 시나리오 이름을 입력하세요:', defaultName);
    if (inputName && inputName.trim()) {
      const cleanName = inputName.trim();
      const targetId = (activePreset && cleanName === activePreset.name) ? activeScenario : undefined;
      saveCustomBudgetPreset(cleanName, draftBudgets, targetId);
      alert(`'${cleanName}' 시나리오가 저장되었습니다.`);
    }
  };

  // [시나리오 삭제] 버튼 클릭 ("기본안" 포함 삭제 가능)
  const handleDeleteScenario = () => {
    const activePreset = db.customBudgetPresets?.[activeScenario];
    const presetName = activePreset ? activePreset.name : '선택된 시나리오';
    if (confirm(`'${presetName}' 시나리오를 정말 삭제하시겠습니까?`)) {
      deleteCustomBudgetPreset(activeScenario);
    }
  };

  // 카테고리 추가/수정 모달 열기
  const handleOpenCategoryModal = (cat = null) => {
    if (cat) {
      const isFixedBool = Boolean(cat.isFixed === true || String(cat.isFixed) === 'true' || cat.isFixed === 1);
      setEditingCategory(cat);
      setCatForm({
        name: cat.name,
        defaultBudget: cat.defaultBudget || 0,
        isFixed: isFixedBool,
      });
    } else {
      setEditingCategory(null);
      setCatForm({
        name: '',
        defaultBudget: 0,
        isFixed: false,
      });
    }
    setIsCategoryModalOpen(true);
  };

  // 카테고리 저장 (신규 추가 또는 수정)
  const handleCategorySubmit = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    try {
      if (!catForm.name || !catForm.name.trim()) {
        alert('카테고리 이름을 입력해주세요.');
        return;
      }

      if (editingCategory) {
        const catId = editingCategory.id || editingCategory.name;
        const res = updateCategory(catId, catForm);
        if (!res || !res.success) {
          alert(res?.message || '카테고리 수정 중 오류가 발생했습니다.');
          return;
        }
        alert(`'${catForm.name}' 카테고리 정보가 수정되었습니다.`);
      } else {
        const res = addCategory(catForm);
        if (!res || !res.success) {
          alert(res?.message || '카테고리 추가 중 오류가 발생했습니다.');
          return;
        }
        alert(`신규 카테고리 '${catForm.name}'이(가) 추가되었습니다!`);
      }

      setIsCategoryModalOpen(false);
    } catch (err) {
      console.error('Error submitting category:', err);
      alert(`저장 중 예외가 발생했습니다: ${err.message}`);
    }
  };

  // 카테고리 삭제 실행
  const handleDeleteCategoryClick = (cat) => {
    const res = deleteCategory(cat.id);
    if (!res.success) {
      alert(res.message);
      return;
    }
    alert(`'${cat.name}' 카테고리가 삭제되었습니다.`);
  };

  const categoriesList = db.categories || [];
  const draftTotalBudget = Object.values(draftBudgets).reduce((a, b) => a + b, 0);
  const presetsList = db.customBudgetPresets ? Object.values(db.customBudgetPresets) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 타이틀 및 시나리오 스위처 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>
            📊 {selectedMonth} 카테고리별 예산 및 시나리오 설정
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            수정한 예산은 [적용] 버튼을 눌러야 최종 반영되며, 해당 월부터 앞으로 모든 월에 일괄 적용됩니다. (과거 예산 보존)
          </p>
        </div>

        {/* 예산 시나리오 / 프리셋 선택 조작부 & 카테고리 추가 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          {/* 단일 통합 시나리오 드롭다운 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(30, 41, 59, 0.7)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <Sliders size={18} color="var(--accent-cyan)" />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>시나리오:</span>
            <select
              className="select"
              style={{ width: 'auto', padding: '4px 8px' }}
              value={activeScenario}
              onChange={e => applyBudgetPreset(e.target.value)}
            >
              {presetsList.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({formatKRW(Object.values(preset.budgets || {}).reduce((a, b) => a + b, 0))})
                </option>
              ))}
              {presetsList.length === 0 && (
                <option value="basic">기본안 (688만원)</option>
              )}
            </select>
          </div>

          {/* 신규 카테고리 추가 버튼 */}
          <button
            onClick={() => handleOpenCategoryModal(null)}
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            카테고리 추가
          </button>

          {/* 시나리오 저장 버튼 */}
          <button
            onClick={handleSaveScenario}
            className="btn"
            style={{
              padding: '7px 12px',
              fontSize: '0.85rem',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.4)',
            }}
            title="현재 입력된 예산 설정을 시나리오로 저장 및 덮어씁니다"
          >
            <PlusCircle size={16} />
            시나리오 저장
          </button>

          {/* 시나리오 삭제 버튼 */}
          <button
            onClick={handleDeleteScenario}
            className="btn"
            style={{
              padding: '7px 10px',
              fontSize: '0.85rem',
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              border: '1px solid rgba(244, 63, 94, 0.4)',
            }}
            title="현재 선택된 시나리오를 삭제합니다"
          >
            <Trash2 size={16} />
            삭제
          </button>

          {/* [적용] 버튼 */}
          <button
            onClick={handleApply}
            className="btn btn-primary"
            style={{
              padding: '8px 18px',
              fontSize: '0.9rem',
              fontWeight: '700',
              boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)',
            }}
            title="수정한 카테고리 예산을 당월 및 미래 월에 최종 적용합니다"
          >
            <CheckCircle size={18} />
            적용
          </button>
        </div>
      </div>

      {/* 요약 메트릭 카드 */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>선택된 월 총 예산 합계</span>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--accent-cyan)' }}>
            {formatKRW(draftTotalBudget)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            * 전체 지출 카테고리의 예산 합계액입니다.
          </span>
          <button
            onClick={handleApply}
            className="btn btn-primary"
            style={{ padding: '8px 18px', fontSize: '0.9rem', fontWeight: '700' }}
          >
            <CheckCircle size={18} />
            예산 변경사항 적용
          </button>
        </div>
      </div>

      {/* 카테고리 예산 수정 표 */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>카테고리명</th>
              <th>지출 구분</th>
              <th>기본 예산 (원)</th>
              <th>현재 적용 예산 (원)</th>
              <th>수정 금액 (원)</th>
              <th style={{ textAlign: 'center' }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {categoriesList.map(cat => {
              const currentApplied = effectiveCategoryBudgets[cat.name] ?? (Number(cat.defaultBudget) || 0);
              const draftVal = draftBudgets[cat.name] ?? currentApplied;
              const isFixedGroup = Boolean(cat.isFixed === true || String(cat.isFixed) === 'true' || cat.isFixed === 1);
              return (
                <tr key={cat.id || cat.name}>
                  <td style={{ fontWeight: '600', color: '#fff' }}>{cat.name}</td>
                  <td>
                    <span className={`badge ${isFixedGroup ? 'badge-warning' : 'badge-stable'}`}>
                      {isFixedGroup ? '🔒 고정비' : '🛒 실소비'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatKRW(cat.defaultBudget || 0)}</td>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{formatKRW(currentApplied)}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input"
                      style={{ maxWidth: '180px', padding: '6px 10px' }}
                      value={formatInputNumber(draftVal)}
                      onChange={e => handleInputChange(cat.name, parseInputNumber(e.target.value))}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <button
                        onClick={() => handleOpenCategoryModal(cat)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer' }}
                        title="카테고리 정보 수정"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategoryClick(cat)}
                        style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                        title="카테고리 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 카테고리 추가 / 수정 모달 */}
      {isCategoryModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
                {editingCategory ? '✏️ 지출 카테고리 수정' : '➕ 신규 지출 카테고리 추가'}
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCategorySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  카테고리 명칭 *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="예: 반려동물, 학원비, 쇼핑"
                  value={catForm.name}
                  onChange={e => setCatForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  기본 예산 금액 (원)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input"
                  placeholder="0"
                  value={formatInputNumber(catForm.defaultBudget)}
                  onChange={e => setCatForm(prev => ({ ...prev, defaultBudget: Math.max(0, parseInputNumber(e.target.value)) }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  지출 구분 선택 * (대시보드 KPI 5번/6번 요약 자동 연동)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setCatForm(prev => ({ ...prev, isFixed: true }))}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: catForm.isFixed ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                      background: catForm.isFixed ? 'rgba(245, 158, 11, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                      color: catForm.isFixed ? '#fbbf24' : 'var(--text-muted)',
                      fontWeight: catForm.isFixed ? '700' : '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    🔒 고정비 (5번 KPI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatForm(prev => ({ ...prev, isFixed: false }))}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: !catForm.isFixed ? '2px solid #10b981' : '1px solid var(--border-color)',
                      background: !catForm.isFixed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                      color: !catForm.isFixed ? '#34d399' : 'var(--text-muted)',
                      fontWeight: !catForm.isFixed ? '700' : '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    🛒 실소비 (6번 KPI)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCategoryModalOpen(false)}>
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleCategorySubmit}
                  className="btn btn-primary"
                >
                  {editingCategory ? '수정 완료' : '카테고리 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
