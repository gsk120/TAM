import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW, formatInputNumber, parseInputNumber, DEFAULT_CATEGORIES, INCOME_CATEGORIES } from '../utils/finance';
import { Plus, Upload, Search, Filter, Scissors, Trash2, Edit3, X, Check, ShieldCheck, RotateCcw, AlertTriangle } from 'lucide-react';
import ImportModal from './ImportModal';
import SplitModal from './SplitModal';

export default function TransactionsView() {
  const { db, selectedMonth, addTransaction, updateTransaction, deleteTransaction, deleteMonthTransactions } = useApp();

  // 컬럼별 엑셀 스타일 필터 상태
  const [filterDate, setFilterDate] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOwner, setFilterOwner] = useState('ALL');
  const [filterInsurance, setFilterInsurance] = useState('ALL'); // ALL, CLAIMED (보험받음), UNCLAIMED (미청구/빈칸)

  // 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeleteMonthModalOpen, setIsDeleteMonthModalOpen] = useState(false);
  const [splittingTx, setSplittingTx] = useState(null);
  const [editingTx, setEditingTx] = useState(null);

  const defaultCatName = db.categories?.[0]?.name || '식비';

  // 폼 상태
  const [formTx, setFormTx] = useState({
    date: `${selectedMonth}-01`,
    type: '지출',
    category: defaultCatName,
    description: '',
    amount: '',
    owner: '가족공동',
    memo: '',
    isManual: true,
  });

  // 당월 거래 목록
  const monthTransactions = db.transactions.filter(tx => tx.date.startsWith(selectedMonth));

  // 필터링된 거래 목록 (다중 조건 동적 필터)
  const filteredTransactions = monthTransactions.filter(tx => {
    if (filterDate !== 'ALL' && tx.date !== filterDate) return false;
    if (filterType !== 'ALL' && tx.type !== filterType) return false;
    if (filterCategory !== 'ALL' && tx.category !== filterCategory) return false;
    if (filterOwner !== 'ALL' && tx.owner !== filterOwner) return false;

    // 보험 수령 여부 필터
    if (filterInsurance === 'CLAIMED' && !(tx.memo || '').includes('보험받음')) return false;
    if (filterInsurance === 'UNCLAIMED' && (tx.memo || '').includes('보험받음')) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchDesc = tx.description.toLowerCase().includes(q);
      const matchCat = tx.category.toLowerCase().includes(q);
      const matchMemo = (tx.memo || '').toLowerCase().includes(q);
      if (!matchDesc && !matchCat && !matchMemo) return false;
    }
    return true;
  });

  // 실시간 합계 계산 (tfoot 전용: 결제 취소건 차감/상쇄 처리)
  const filteredSummary = filteredTransactions.reduce(
    (acc, tx) => {
      acc.count += 1;
      const amt = Number(tx.amount) || 0;
      if (tx.type === '지출') {
        // amt가 양수면 일반 결제 가산, 음수면 결제 취소 차감
        acc.totalExpense += amt;
      } else if (tx.type === '수입') {
        acc.totalIncome += Math.abs(amt);
      }
      return acc;
    },
    { count: 0, totalExpense: 0, totalIncome: 0 }
  );

  const netTotal = filteredSummary.totalIncome - filteredSummary.totalExpense;

  // 필터 초기화
  const handleResetFilters = () => {
    setFilterDate('ALL');
    setFilterType('ALL');
    setFilterCategory('ALL');
    setSearchQuery('');
    setFilterOwner('ALL');
    setFilterInsurance('ALL');
  };

  // 당월 내역 일괄 삭제 처리
  const handleConfirmDeleteMonth = () => {
    deleteMonthTransactions(selectedMonth);
    setIsDeleteMonthModalOpen(false);
    alert(`${selectedMonth}월 거래 내역이 모두 삭제되었습니다. 엑셀을 다시 업로드할 수 있습니다.`);
  };

  const handleSaveTransaction = (e) => {
    e.preventDefault();
    if (!formTx.description || !formTx.amount) return;

    if (editingTx) {
      updateTransaction(editingTx.id, {
        ...formTx,
        amount: Math.abs(Number(formTx.amount)),
      });
      setEditingTx(null);
    } else {
      addTransaction({
        id: `tx_manual_${Date.now()}`,
        ...formTx,
        amount: Math.abs(Number(formTx.amount)),
      });
    }
    setIsAddModalOpen(false);
    setFormTx({
      date: `${selectedMonth}-01`,
      type: '지출',
      category: '식비',
      description: '',
      amount: '',
      owner: '가족공동',
      memo: '',
      isManual: true,
    });
  };

  const handleEditClick = (tx) => {
    setEditingTx(tx);
    setFormTx({
      date: tx.date,
      type: tx.type,
      category: tx.category,
      description: tx.description,
      amount: tx.amount,
      owner: tx.owner || '가족공동',
      memo: tx.memo || '',
      isManual: tx.isManual || false,
    });
    setIsAddModalOpen(true);
  };

  // unique dates in month for filter
  const uniqueDates = Array.from(new Set(monthTransactions.map(t => t.date))).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 상단 컨트롤 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>
            📋 {selectedMonth} 거래 내역 (총 {monthTransactions.length}건)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            컬럼별 엑셀 필터링, 실시간 합계 계산 및 당월 일괄 삭제 지원
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* 기 업로드 내역 일괄 삭제 버튼 */}
          <button
            className="btn btn-danger"
            onClick={() => setIsDeleteMonthModalOpen(true)}
            disabled={monthTransactions.length === 0}
            title="잘못 업로드된 당월 거래 전체 삭제"
          >
            <Trash2 size={18} />
            당월 내역 일괄 삭제
          </button>

          <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(true)}>
            <Upload size={18} color="var(--accent-cyan)" />
            뱅샐/엑셀 가져오기
          </button>

          <button className="btn btn-primary" onClick={() => { setEditingTx(null); setIsAddModalOpen(true); }}>
            <Plus size={18} />
            거래 직접 등록
          </button>
        </div>
      </div>

      {/* 필터 조율 바 (필터 초기화 버튼 포함) */}
      <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={18} color="var(--accent-cyan)" />
          <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#fff' }}>
            엑셀 스타일 컬럼 필터 적용 중 ({filteredTransactions.length} / {monthTransactions.length}건)
          </span>
        </div>

        <button className="btn btn-secondary" onClick={handleResetFilters} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
          <RotateCcw size={14} /> 필터 전체 초기화
        </button>
      </div>

      {/* 거래 내역 테이블 (엑셀 컬럼별 필터 + tfoot 실시간 합계 행) */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            {/* 컬럼 헤더 */}
            <tr>
              <th>날짜 (A)</th>
              <th>타입 (B)</th>
              <th>대분류 (C)</th>
              <th>내용 / 가맹점 (D)</th>
              <th>금액 (E)</th>
              <th>귀속 구성원</th>
              <th>비고 (F) / 의료비 보험</th>
              <th>작업</th>
            </tr>

            {/* 엑셀 스타일 컬럼별 드롭다운 필터 행 */}
            <tr style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
              {/* 날짜 필터 */}
              <th>
                <select className="select" style={{ fontSize: '0.75rem', padding: '4px' }} value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                  <option value="ALL">전체 날짜</option>
                  {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </th>

              {/* 타입 필터 */}
              <th>
                <select className="select" style={{ fontSize: '0.75rem', padding: '4px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="ALL">전체 타입</option>
                  <option value="지출">지출</option>
                  <option value="수입">수입</option>
                  <option value="계좌이체">계좌이체</option>
                  <option value="자산증가">자산증가</option>
                  <option value="부채상환">부채상환</option>
                </select>
              </th>

              {/* 대분류 필터 */}
              <th>
                <select className="select" style={{ fontSize: '0.75rem', padding: '4px' }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                  <option value="ALL">전체 카테고리</option>
                  {DEFAULT_CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  {INCOME_CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </th>

              {/* 내용 검색 */}
              <th>
                <input
                  type="text"
                  className="input"
                  placeholder="가맹점 검색..."
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </th>

              {/* 금액열 */}
              <th style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>원 단위</th>

              {/* 귀속 필터 */}
              <th>
                <select className="select" style={{ fontSize: '0.75rem', padding: '4px' }} value={filterOwner} onChange={e => setFilterOwner(e.target.value)}>
                  <option value="ALL">전체 귀속</option>
                  <option value="가족공동">가족공동</option>
                  <option value="기석">기석</option>
                  <option value="승주">승주</option>
                  <option value="서아">서아</option>
                  <option value="서빈">서빈</option>
                </select>
              </th>

              {/* 비고/보험 필터 */}
              <th>
                <select className="select" style={{ fontSize: '0.75rem', padding: '4px' }} value={filterInsurance} onChange={e => setFilterInsurance(e.target.value)}>
                  <option value="ALL">전체 비고</option>
                  <option value="CLAIMED">🛡️ 보험받음</option>
                  <option value="UNCLAIMED">⏳ 미청구 / 일반</option>
                </select>
              </th>

              <th></th>
            </tr>
          </thead>

          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                  해당 월의 거래 내역이 없거나 필터 조건에 부합하는 항목이 없습니다.
                </td>
              </tr>
            ) : (
              filteredTransactions.map(tx => {
                const isExpense = tx.type === '지출';
                const isIncome = tx.type === '수입';
                const isCancel = tx.isCancel || (isExpense && Number(tx.amount) < 0);
                const absAmount = Math.abs(Number(tx.amount) || 0);
                const isMedical = tx.category === '의료비';
                const isClaimed = (tx.memo || '').includes('보험받음');

                return (
                  <tr key={tx.id} style={{ background: isCancel ? 'rgba(6, 182, 212, 0.05)' : 'transparent' }}>
                    <td>{tx.date}</td>
                    <td>
                      <span className={`badge ${isCancel ? 'badge-warning' : isExpense ? 'badge-danger' : isIncome ? 'badge-stable' : 'badge-warning'}`}>
                        {isCancel ? '지출취소' : tx.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600', color: '#fff' }}>{tx.category}</td>
                    <td>
                      {tx.description}
                      {tx.isManual && <span style={{ fontSize: '0.7rem', marginLeft: '6px', color: 'var(--accent-cyan)' }}>(수동)</span>}
                    </td>
                    <td style={{ fontWeight: '700', color: isCancel ? 'var(--accent-cyan)' : isExpense ? 'var(--accent-rose)' : isIncome ? 'var(--accent-emerald)' : '#fff' }}>
                      {isCancel ? `+${formatKRW(absAmount)} (취소)` : isExpense ? `-${formatKRW(absAmount)}` : formatKRW(absAmount)}
                    </td>
                    <td>{tx.owner || '가족공동'}</td>

                    {/* F열 비고 & 의료비 보험 수령 배지 */}
                    <td>
                      {isCancel ? (
                        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          ↩️ 결제취소
                        </span>
                      ) : isMedical && isClaimed ? (
                        <span className="badge badge-stable" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <ShieldCheck size={14} /> 보험받음
                        </span>
                      ) : isMedical ? (
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                          미청구/빈칸
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{tx.memo || '-'}</span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setSplittingTx(tx)}
                          title="거래 분할"
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-amber)', cursor: 'pointer', padding: '4px' }}
                        >
                          <Scissors size={16} />
                        </button>
                        <button
                          onClick={() => handleEditClick(tx)}
                          title="수정"
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px' }}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => deleteTransaction(tx.id)}
                          title="삭제"
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* 테이블 맨 아래 실시간 필터 합계 행 (Total Summary Row) */}
          {filteredTransactions.length > 0 && (
            <tfoot style={{ background: 'rgba(15, 23, 42, 0.95)', borderTop: '2px solid var(--border-highlight)', fontWeight: '700' }}>
              <tr>
                <td colSpan="3" style={{ color: 'var(--accent-cyan)', fontSize: '0.95rem' }}>
                  ∑ 필터 결과 실시간 합계 ({filteredSummary.count}건)
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  지출: <span style={{ color: 'var(--accent-rose)' }}>-{formatKRW(filteredSummary.totalExpense)}</span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  수입: <span style={{ color: 'var(--accent-emerald)' }}>+{formatKRW(filteredSummary.totalIncome)}</span>
                </td>
                <td colSpan="2" style={{ color: '#fff', fontSize: '0.95rem' }}>
                  순합계: <span style={{ color: netTotal >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{formatKRW(netTotal)}</span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 당월 거래 일괄 삭제 확인 모달 */}
      {isDeleteMonthModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(244, 63, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle color="var(--accent-rose)" size={24} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
                {selectedMonth} 거래 일괄 삭제
              </h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.6' }}>
              정말로 <strong>{selectedMonth}</strong>월의 모든 거래 내역(총 <strong>{monthTransactions.length}건</strong>)을 삭제하시겠습니까?
              <br /><br />
              <span style={{ color: 'var(--accent-rose)' }}>⚠️ 삭제 후 엑셀 파일 가져오기를 통해 내역을 깨끗하게 다시 업로드할 수 있습니다.</span>
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setIsDeleteMonthModalOpen(false)}>취소</button>
              <button className="btn btn-danger" onClick={handleConfirmDeleteMonth}>네, 일괄 삭제합니다</button>
            </div>
          </div>
        </div>
      )}

      {/* 수동 등록 / 수정 모달 */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
                {editingTx ? '거래 내역 수정' : '새 거래 등록 (수동 입력)'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>거래 일자 (A열)</label>
                  <input type="date" className="input" value={formTx.date} onChange={e => setFormTx({ ...formTx, date: e.target.value })} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>거래 유형 (B열)</label>
                  <select className="select" value={formTx.type} onChange={e => setFormTx({ ...formTx, type: e.target.value })}>
                    <option value="지출">지출</option>
                    <option value="수입">수입</option>
                    <option value="계좌이체">계좌이체</option>
                    <option value="자산증가">자산증가</option>
                    <option value="부채상환">부채상환</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>카테고리 (C열)</label>
                  <select className="select" value={formTx.category} onChange={e => setFormTx({ ...formTx, category: e.target.value })}>
                    {(db.categories || DEFAULT_CATEGORIES).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    {INCOME_CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>금액 (E열 - 원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input"
                    placeholder="예: 25,000"
                    value={formatInputNumber(formTx.amount)}
                    onChange={e => setFormTx({ ...formTx, amount: parseInputNumber(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>거래내용 / 가맹점명 (D열)</label>
                <input type="text" className="input" placeholder="예: 성북우리아이들병원 또는 쿠팡 장보기" value={formTx.description} onChange={e => setFormTx({ ...formTx, description: e.target.value })} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>귀속 구성원</label>
                  <select className="select" value={formTx.owner} onChange={e => setFormTx({ ...formTx, owner: e.target.value })}>
                    <option value="가족공동">가족공동</option>
                    <option value="기석">기석</option>
                    <option value="승주">승주</option>
                    <option value="서아">서아</option>
                    <option value="서빈">서빈</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>비고 (F열)</label>
                    <button
                      type="button"
                      onClick={() => setFormTx({ ...formTx, memo: '보험받음' })}
                      style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', color: 'var(--accent-emerald)', borderRadius: '4px', fontSize: '0.7rem', padding: '1px 6px', cursor: 'pointer' }}
                    >
                      + 보험받음 퀵 입력
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder="의료비 실비수령 시 '보험받음' 입력"
                    value={formTx.memo}
                    onChange={e => setFormTx({ ...formTx, memo: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>취소</button>
                <button type="submit" className="btn btn-primary">저장 완료</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 뱅샐/엑셀 가져오기 모달 */}
      {isImportModalOpen && <ImportModal onClose={() => setIsImportModalOpen(false)} />}

      {/* 혼합 거래 분할 모달 */}
      {splittingTx && <SplitModal tx={splittingTx} onClose={() => setSplittingTx(null)} />}
    </div>
  );
}
