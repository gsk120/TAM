import React, { useState, useRef, useLayoutEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW, formatInputNumber, parseInputNumber, CASH_ASSET_ITEMS, INVEST_ASSET_ITEMS, DEBT_ITEMS } from '../utils/finance';
import { Landmark, TrendingUp, CreditCard, PiggyBank, BarChart3, LineChart, Trash2, AlertTriangle, Plus, Edit3, X } from 'lucide-react';

function useContainerWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(500);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const measure = () => {
      if (ref.current) {
        const w = ref.current.getBoundingClientRect().width;
        if (w > 0) setWidth(w);
      }
    };
    measure();
    const observer = new ResizeObserver(entries => {
      if (entries[0] && entries[0].contentRect.width > 0) {
        setWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export default function AccountsView() {
  const {
    db,
    selectedMonth,
    updateAssetSnapshot,
    clearMonthlyAssetSnapshot,
    getAssetMetrics,
    yearlyAssetMetrics,
    assetStructure,
    addAssetItem,
    updateAssetItem,
    deleteAssetItem,
  } = useApp();

  const cashItems = assetStructure?.cashItems || CASH_ASSET_ITEMS;
  const investItems = assetStructure?.investItems || INVEST_ASSET_ITEMS;
  const debtItems = assetStructure?.debtItems || DEBT_ITEMS;

  const [showClearModal, setShowClearModal] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState(null);
  const [chart1Ref, chart1Width] = useContainerWidth();
  const [chart2Ref, chart2Width] = useContainerWidth();

  // 세그먼트 탭 상태 ('cash' | 'invest' | 'debt' | 'all')
  const [activeTab, setActiveTab] = useState('cash');

  // 자산 항목 동적 추가 / 수정 모달 상태
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalGroup, setAssetModalGroup] = useState('cashItems'); // 'cashItems' | 'investItems' | 'debtItems'
  const [editingAssetItem, setEditingAssetItem] = useState(null);
  const [assetForm, setAssetForm] = useState({
    name: '',
    owner: '가족공동',
    defaultBalance: 0,
    isRealEstate: false,
  });

  const handleOpenAssetModal = (group, item = null) => {
    setAssetModalGroup(group);
    if (item) {
      setEditingAssetItem(item);
      const snapGroupKey = group === 'cashItems' ? 'cash' : group === 'investItems' ? 'invest' : 'debt';
      const currentSnapVal = snap[snapGroupKey]?.[item.id] ?? item.defaultBalance ?? 0;
      setAssetForm({
        name: item.name,
        owner: item.owner || '가족공동',
        defaultBalance: currentSnapVal,
        isRealEstate: Boolean(item.isRealEstate),
      });
    } else {
      setEditingAssetItem(null);
      setAssetForm({
        name: '',
        owner: '가족공동',
        defaultBalance: 0,
        isRealEstate: false,
      });
    }
    setIsAssetModalOpen(true);
  };

  const handleAssetSubmit = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!assetForm.name || !assetForm.name.trim()) {
      alert('항목 명칭을 입력해 주세요.');
      return;
    }

    const snapGroupKey = assetModalGroup === 'cashItems' ? 'cash' : assetModalGroup === 'investItems' ? 'invest' : 'debt';

    if (editingAssetItem) {
      const res = updateAssetItem(assetModalGroup, editingAssetItem.id, assetForm);
      if (res && !res.success) {
        alert(res.message);
        return;
      }
      // 당월 자산 잔액도 수정된 잔액으로 동시 업데이트
      updateAssetSnapshot(selectedMonth, snapGroupKey, editingAssetItem.id, assetForm.defaultBalance);
      alert(`'${assetForm.name}' 항목 정보가 수정되었습니다.`);
    } else {
      const res = addAssetItem(assetModalGroup, assetForm);
      if (res && !res.success) {
        alert(res.message);
        return;
      }
      alert(`신규 항목 '${assetForm.name}'이(가) 추가되었습니다.`);
    }
    setIsAssetModalOpen(false);
  };

  const handleDeleteAssetItem = (group, item) => {
    if (confirm(`'${item.name}' 항목을 정말 삭제하시겠습니까?`)) {
      const res = deleteAssetItem(group, item.id);
      if (res && !res.success) {
        alert(res.message);
      }
    }
  };

  const {
    cashTotal,
    investTotal,
    assetTotal,
    investRatio,
    debtTotal,
    netAsset,
    snap,
  } = getAssetMetrics(selectedMonth);

  // 직전 월 (MoM) 순자산 지표 연산
  const getPrevYearMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    return `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
  };

  const prevYearMonth = getPrevYearMonth(selectedMonth);
  const prevMetrics = getAssetMetrics(prevYearMonth);
  const prevNetAsset = prevMetrics.netAsset;
  const momDiff = netAsset - prevNetAsset;
  const momRate = prevNetAsset > 0 ? (momDiff / prevNetAsset) * 100 : 0;
  const hasPrevData = Boolean(db?.monthlyAssetSnapshots?.[prevYearMonth]);

  const [yearStr, monthStr] = selectedMonth.split('-');

  const handleConfirmClear = () => {
    clearMonthlyAssetSnapshot(selectedMonth);
    setShowClearModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 화면 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff' }}>
            🏛️ 총 자산 관리 ({yearStr}년 {parseInt(monthStr)}월말 자산 현황)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            매월 말일 기준의 현금 계좌, 투자/자산, 부채 금액을 수기 입력하여 관리합니다.
          </p>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => setShowClearModal(true)}
          style={{ borderColor: 'rgba(244, 63, 94, 0.4)', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Trash2 size={16} /> 당월 자산 초기화
        </button>
      </div>

      {/* 상단 4대 핵심 자산 요약 KPI 카드 */}
      <div className="grid-cards">
        {/* 총자산 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>총 자산</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={20} color="var(--accent-primary)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--accent-cyan)' }}>
            {formatKRW(assetTotal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            현금 {formatKRW(cashTotal)} + 투자 {formatKRW(investTotal)}
          </div>
        </div>

        {/* 총부채 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>총 부채</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={20} color="var(--accent-rose)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--accent-rose)' }}>
            {formatKRW(debtTotal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            주담대 + 마통 잔액
          </div>
        </div>

        {/* 순자산 및 전월 대비 증감률 뱃지 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>순자산</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PiggyBank size={20} color="var(--accent-emerald)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: netAsset >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
            {formatKRW(netAsset)}
          </div>
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {hasPrevData ? (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: momDiff > 0 ? 'rgba(16, 185, 129, 0.2)' : momDiff < 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                  color: momDiff > 0 ? 'var(--accent-emerald)' : momDiff < 0 ? 'var(--accent-rose)' : 'var(--text-muted)',
                  border: `1px solid ${momDiff > 0 ? 'rgba(16, 185, 129, 0.4)' : momDiff < 0 ? 'rgba(244, 63, 94, 0.4)' : 'rgba(148, 163, 184, 0.4)'}`,
                }}
              >
                {momDiff > 0
                  ? `🟢 ▲ +${momRate.toFixed(1)}% (+${formatKRW(momDiff)})`
                  : momDiff < 0
                  ? `🔴 ▼ ${momRate.toFixed(1)}% (${formatKRW(momDiff)})`
                  : `▬ 0.0% (전월 동일)`}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                총 자산 - 총 부채 (전월 데이터 없음)
              </span>
            )}
          </div>
        </div>

        {/* 투자비중 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>금융 투자비중</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#a855f7" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#a855f7' }}>
            {investRatio.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            (투자합계 - 부동산) / 총 자산
          </div>
        </div>
      </div>

      {/* 몰입형 세그먼트 탭 바 (Segmented Tab Control Bar) */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(30, 41, 59, 0.6)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setActiveTab('cash')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'cash' ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'transparent',
            color: activeTab === 'cash' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeTab === 'cash' ? '700' : '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          🏦 현금 · 계좌 ({cashItems.length})
        </button>

        <button
          onClick={() => setActiveTab('invest')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'invest' ? 'linear-gradient(135deg, #a855f7, #7e22ce)' : 'transparent',
            color: activeTab === 'invest' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeTab === 'invest' ? '700' : '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          📈 투자 · 자산 ({investItems.length})
        </button>

        <button
          onClick={() => setActiveTab('debt')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'debt' ? 'linear-gradient(135deg, #f43f5e, #be123c)' : 'transparent',
            color: activeTab === 'debt' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeTab === 'debt' ? '700' : '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          💳 부채 ({debtItems.length})
        </button>

        <button
          onClick={() => setActiveTab('all')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'all' ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'transparent',
            color: activeTab === 'all' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeTab === 'all' ? '700' : '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          📊 전체 한눈에 보기
        </button>
      </div>

      {/* 탭별 100% Full-Width 데이터 테이블 뷰 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {(activeTab === 'cash' || activeTab === 'all') && (
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
                🏦 현금 계좌 ({cashItems.length}개)
              </h3>
              <button
                onClick={() => handleOpenAssetModal('cashItems')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> 계좌 추가
              </button>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>계좌명</th>
                    <th style={{ width: '20%' }}>소유자</th>
                    <th style={{ textAlign: 'right', width: '30%' }}>잔액 (원)</th>
                    <th style={{ textAlign: 'center', width: '10%' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {cashItems.map(item => {
                    const val = snap.cash?.[item.id] ?? 0;
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '600', color: '#fff' }}>{item.name}</td>
                        <td><span className="badge badge-stable">{item.owner}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="input"
                            placeholder="0"
                            style={{ maxWidth: '200px', padding: '6px 10px', textAlign: 'right', fontWeight: '600', width: '100%' }}
                            value={formatInputNumber(val)}
                            onFocus={e => e.target.select()}
                            onChange={e => updateAssetSnapshot(selectedMonth, 'cash', item.id, parseInputNumber(e.target.value))}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenAssetModal('cashItems', item)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '4px' }}
                              title="수정"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteAssetItem('cashItems', item)}
                              style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(59, 130, 246, 0.15)', fontWeight: '700' }}>
                    <td colSpan={2} style={{ color: '#fff', fontSize: '1rem' }}>현금 합계</td>
                    <td colSpan={2} style={{ textAlign: 'right', color: 'var(--accent-emerald)', fontSize: '1.15rem' }}>
                      {formatKRW(cashTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {(activeTab === 'invest' || activeTab === 'all') && (
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
                📈 투자 / 자산 ({investItems.length}개)
              </h3>
              <button
                onClick={() => handleOpenAssetModal('investItems')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> 자산 추가
              </button>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>자산명</th>
                    <th style={{ width: '20%' }}>소유자</th>
                    <th style={{ textAlign: 'right', width: '30%' }}>평가액 (원)</th>
                    <th style={{ textAlign: 'center', width: '10%' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {investItems.map(item => {
                    const val = snap.invest?.[item.id] ?? 0;
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '600', color: '#fff' }}>
                          {item.name} {item.isRealEstate && <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginLeft: '6px' }}>(부동산)</span>}
                        </td>
                        <td><span className="badge badge-stable">{item.owner}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="input"
                            placeholder="0"
                            style={{ maxWidth: '200px', padding: '6px 10px', textAlign: 'right', fontWeight: '600', width: '100%' }}
                            value={formatInputNumber(val)}
                            onFocus={e => e.target.select()}
                            onChange={e => updateAssetSnapshot(selectedMonth, 'invest', item.id, parseInputNumber(e.target.value))}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenAssetModal('investItems', item)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '4px' }}
                              title="수정"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteAssetItem('investItems', item)}
                              style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(168, 85, 247, 0.12)', fontWeight: '600' }}>
                    <td colSpan={2} style={{ color: 'var(--text-muted)' }}>투자 합계</td>
                    <td colSpan={2} style={{ textAlign: 'right', color: '#a855f7', fontSize: '1.05rem' }}>{formatKRW(investTotal)}</td>
                  </tr>
                  <tr style={{ background: 'rgba(59, 130, 246, 0.18)', fontWeight: '700' }}>
                    <td colSpan={2} style={{ color: '#fff', fontSize: '1rem' }}>자산 합계 (현금 + 투자)</td>
                    <td colSpan={2} style={{ textAlign: 'right', color: 'var(--accent-cyan)', fontSize: '1.15rem' }}>
                      {formatKRW(assetTotal)}
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(168, 85, 247, 0.18)', fontWeight: '700' }}>
                    <td colSpan={2} style={{ color: '#a855f7', fontSize: '1rem' }}>투자비중 ((투자-부동산)/자산)</td>
                    <td colSpan={2} style={{ textAlign: 'right', color: '#a855f7', fontSize: '1.15rem' }}>
                      {investRatio.toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {(activeTab === 'debt' || activeTab === 'all') && (
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
                💳 부채 ({debtItems.length}개)
              </h3>
              <button
                onClick={() => handleOpenAssetModal('debtItems')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> 부채 추가
              </button>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>부채 항목명</th>
                    <th style={{ width: '20%' }}>귀속</th>
                    <th style={{ textAlign: 'right', width: '30%' }}>잔액 (원)</th>
                    <th style={{ textAlign: 'center', width: '10%' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {debtItems.map(item => {
                    const val = snap.debt?.[item.id] ?? 0;
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '600', color: '#fff' }}>{item.name}</td>
                        <td><span className="badge badge-stable">{item.owner}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="input"
                            placeholder="0"
                            style={{ maxWidth: '200px', padding: '6px 10px', textAlign: 'right', fontWeight: '600', width: '100%' }}
                            value={formatInputNumber(val)}
                            onFocus={e => e.target.select()}
                            onChange={e => updateAssetSnapshot(selectedMonth, 'debt', item.id, parseInputNumber(e.target.value))}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenAssetModal('debtItems', item)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '4px' }}
                              title="수정"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteAssetItem('debtItems', item)}
                              style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(244, 63, 94, 0.12)', fontWeight: '600' }}>
                    <td colSpan={2} style={{ color: 'var(--text-muted)' }}>부채 합계</td>
                    <td colSpan={2} style={{ textAlign: 'right', color: 'var(--accent-rose)', fontSize: '1.05rem' }}>{formatKRW(debtTotal)}</td>
                  </tr>
                  <tr style={{ background: 'rgba(16, 185, 129, 0.18)', fontWeight: '700' }}>
                    <td colSpan={2} style={{ color: '#fff', fontSize: '1rem' }}>순자산 (자산 합계 - 부채 합계)</td>
                    <td colSpan={2} style={{ textAlign: 'right', color: netAsset >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontSize: '1.15rem' }}>
                      {formatKRW(netAsset)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 월별 자산 추이 요약 표 */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
          🗓️ 연간 월별 자산 / 부채 / 순자산 / 투자비중 추이 표
        </h3>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>조회월</th>
                <th>자산합계</th>
                <th>부채합계</th>
                <th>순자산</th>
                <th>투자비중 (%)</th>
              </tr>
            </thead>
            <tbody>
              {yearlyAssetMetrics.map(m => {
                const isSelected = m.yearMonth === selectedMonth;
                return (
                  <tr key={m.yearMonth} style={{ background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent', fontWeight: isSelected ? '600' : 'normal' }}>
                    <td>{m.month} {isSelected && '👈'}</td>
                    <td style={{ color: 'var(--accent-cyan)' }}>{formatKRW(m.assetTotal)}</td>
                    <td style={{ color: 'var(--accent-rose)' }}>{formatKRW(m.debtTotal)}</td>
                    <td style={{ color: m.netAsset >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                      {formatKRW(m.netAsset)}
                    </td>
                    <td style={{ color: '#a855f7', fontWeight: '600' }}>
                      {m.investRatio.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 시각화 차트 2종 (핀테크 다크 모드 프리미엄 SVG 차트) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        {/* 차트 1: 자산 / 부채 / 순자산 추이 (혼합형 Combo Chart) */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 헤더 및 범례 컨테이너 (우측 차트와 1:1 수직/수평 높이 통일) */}
          <div style={{ minHeight: '68px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 color="var(--accent-cyan)" size={20} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>
                  📊 자산 / 부채 / 순자산 추이 (Combo Chart)
                </h3>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: '600' }}>
                순자산 네온 꺾은선 레이어링
              </span>
            </div>

            {/* 범례 */}
            <div style={{ display: 'flex', gap: '18px', fontSize: '0.88rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'linear-gradient(to top, #0284c7, #38bdf8)' }} /> 자산합계 (막대)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'linear-gradient(to top, #be123c, #f43f5e)' }} /> 부채합계 (막대)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '16px', height: '3px', borderRadius: '2px', background: '#10b981', boxShadow: '0 0 6px #10b981' }} /> 순자산 (네온 라인)
              </div>
            </div>
          </div>

          {/* 혼합형 차트 시각화 영역 */}
          {(() => {
            const comboMax = Math.max(
              1,
              ...yearlyAssetMetrics.map(m => Math.max(m.assetTotal, m.debtTotal, Math.max(0, m.netAsset)))
            );
            const chartHeight = 135;
            const baselineY = 145;
            const svgHeight = 195;
            const activeWidth = chart1Width || 500;

            // 순자산 꺾은선 용 좌표 계산 (실시간 DOM 픽셀 동기화 & MoM 지표 연산)
            const netAssetPoints = yearlyAssetMetrics.map((m, i) => {
              const x = (i + 0.5) * (activeWidth / 12);
              const val = Math.max(0, m.netAsset);
              const y = baselineY - 6 - (val / comboMax) * (chartHeight - 10);

              // 전월 대비 순자산 증감률 연산
              const prevM = i > 0 ? yearlyAssetMetrics[i - 1] : null;
              const pVal = prevM ? prevM.netAsset : 0;
              const diff = prevM ? m.netAsset - pVal : 0;
              const rate = prevM && pVal > 0 ? (diff / pVal) * 100 : 0;
              const momTag = prevM
                ? (diff > 0 ? `▲ +${rate.toFixed(1)}%` : diff < 0 ? `▼ ${rate.toFixed(1)}%` : `0.0%`)
                : '';

              return { x, y, month: m.month, yearMonth: m.yearMonth, val, diff, rate, momTag, prevM };
            });

            const polylinePointsStr = netAssetPoints.map(p => `${p.x},${p.y}`).join(' ');

            return (
              <div ref={chart1Ref} style={{ position: 'relative', width: '100%', height: `${svgHeight}px`, marginTop: '8px' }}>
                {/* 1. 이중 막대 (자산 / 부채) 컨테이너 및 X축 라인 */}
                <div style={{ height: `${baselineY}px`, display: 'flex', alignItems: 'flex-end', width: '100%', borderBottom: '1px solid var(--border-color)' }}>
                  {yearlyAssetMetrics.map((m, i) => {
                    const hAsset = Math.max(2, (m.assetTotal / comboMax) * chartHeight);
                    const hDebt = Math.max(2, (m.debtTotal / comboMax) * chartHeight);
                    const isSelected = m.yearMonth === selectedMonth;
                    const xBarCenter = (i + 0.5) * (activeWidth / 12);

                    return (
                      <div key={m.yearMonth} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flex: 1, height: '100%', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', width: '100%', justifyContent: 'center' }}>
                          {/* 자산 막대 */}
                          <div
                            title={`${m.month} 자산합계: ${formatKRW(m.assetTotal)}`}
                            onMouseEnter={() => setHoverTooltip({ chartId: 'combo', x: xBarCenter - 8, y: baselineY - hAsset, month: m.month, label: '자산', value: formatKRW(m.assetTotal), color: '#38bdf8' })}
                            onMouseLeave={() => setHoverTooltip(null)}
                            style={{
                              width: '32%',
                              height: `${hAsset}px`,
                              background: 'linear-gradient(to top, #0284c7, #38bdf8)',
                              borderRadius: '3px 3px 0 0',
                              opacity: isSelected ? 1 : 0.85,
                              boxShadow: isSelected ? '0 0 8px rgba(56, 189, 248, 0.5)' : 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          />
                          {/* 부채 막대 */}
                          <div
                            title={`${m.month} 부채합계: ${formatKRW(m.debtTotal)}`}
                            onMouseEnter={() => setHoverTooltip({ chartId: 'combo', x: xBarCenter + 8, y: baselineY - hDebt, month: m.month, label: '부채', value: formatKRW(m.debtTotal), color: '#f43f5e' })}
                            onMouseLeave={() => setHoverTooltip(null)}
                            style={{
                              width: '32%',
                              height: `${hDebt}px`,
                              background: 'linear-gradient(to top, #be123c, #f43f5e)',
                              borderRadius: '3px 3px 0 0',
                              opacity: isSelected ? 1 : 0.85,
                              boxShadow: isSelected ? '0 0 8px rgba(244, 63, 94, 0.5)' : 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 하단 월 레이블 12개 균등 분할 라인 */}
                <div style={{ display: 'flex', width: '100%', height: '35px', paddingTop: '10px' }}>
                  {yearlyAssetMetrics.map(m => {
                    const isSelected = m.yearMonth === selectedMonth;
                    return (
                      <div key={m.yearMonth} style={{ flex: 1, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: isSelected ? 'var(--accent-cyan)' : 'var(--text-dim)', fontWeight: isSelected ? '700' : 'normal' }}>
                          {parseInt(m.month)}월
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 2. 순자산 꺾은선 레이어 (SVG Overlay - Dynamic Vector Canvas) */}
                <svg
                  viewBox={`0 0 ${activeWidth} ${svgHeight}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
                >
                  <filter id="neonGlowEmerald" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  {/* 꺾은선 */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePointsStr}
                    filter="url(#neonGlowEmerald)"
                  />

                  {/* 각 월 데이터 노드 포인트 (왜곡 0% 완벽한 정원 circle) */}
                  {netAssetPoints.map(p => {
                    const isSelected = p.yearMonth === selectedMonth;
                    const isHovered = hoverTooltip?.chartId === 'combo' && hoverTooltip?.month === p.month && hoverTooltip?.label === '순자산';
                    const rRadius = isHovered ? 7.5 : (isSelected ? 6 : 4);

                    return (
                      <g key={p.yearMonth} style={{ pointerEvents: 'all', cursor: 'pointer' }}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={rRadius}
                          fill={isHovered ? '#6ee7b7' : (isSelected ? '#34d399' : '#10b981')}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? 3 : (isSelected ? 2.5 : 1.5)}
                          onMouseEnter={() => setHoverTooltip({ chartId: 'combo', x: p.x, y: p.y, month: p.month, label: '순자산', value: `${formatKRW(p.val)}${p.momTag ? ` (${p.momTag})` : ''}`, color: '#10b981' })}
                          onMouseLeave={() => setHoverTooltip(null)}
                          style={{ transition: 'all 0.2s ease' }}
                        />
                      </g>
                    );
                  })}

                  {/* 호버 요소 바로 위 스마트 플로팅 툴팁 (Combo Chart - Dynamic Auto-Scaling Padding) */}
                  {hoverTooltip && hoverTooltip.chartId === 'combo' && (() => {
                    const fullText = `${hoverTooltip.month} ${hoverTooltip.label}: ${hoverTooltip.value}`;
                    const rectWidth = Math.max(140, fullText.length * 7.5 + 24);
                    const halfW = rectWidth / 2;
                    const clampedX = Math.max(halfW + 8, Math.min(activeWidth - (halfW + 8), hoverTooltip.x));

                    return (
                      <g transform={`translate(${clampedX}, ${Math.max(25, hoverTooltip.y - 12)})`} style={{ pointerEvents: 'none' }}>
                        <rect
                          x={-halfW}
                          y="-22"
                          width={rectWidth}
                          height="24"
                          rx="6"
                          fill="rgba(15, 23, 42, 0.95)"
                          stroke={hoverTooltip.color}
                          strokeWidth="1.5"
                          filter="drop-shadow(0 4px 12px rgba(0,0,0,0.85))"
                        />
                        <text x="0" y="-6" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="bold">
                          {fullText}
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            );
          })()}
        </div>

        {/* 차트 2: 금융 투자비중 추이 (%) (Auto-Scaling Area / Line Chart) */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 헤더 및 범례 컨테이너 (좌측 차트와 1:1 수직/수평 높이 통일) */}
          <div style={{ minHeight: '68px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LineChart color="#e879f9" size={20} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>
                  📈 금융 투자비중 추이 (%)
                </h3>
              </div>
              {(() => {
                const maxRatio = Math.max(0.1, ...yearlyAssetMetrics.map(m => Math.max(0, m.investRatio)));
                const yMaxRatio = Math.max(5, Math.ceil(maxRatio * 1.25));
                return (
                  <span style={{ fontSize: '0.75rem', color: '#e879f9', background: 'rgba(232, 121, 249, 0.12)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(232, 121, 249, 0.3)', fontWeight: '600' }}>
                    Auto-Scaled (0%~{yMaxRatio}%)
                  </span>
                );
              })()}
            </div>

            {/* 범례 / 설명 서브 라인 (좌측 범례 행과 수평 일치) */}
            <div style={{ display: 'flex', gap: '18px', fontSize: '0.88rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '16px', height: '3px', borderRadius: '2px', background: '#c084fc', boxShadow: '0 0 6px #c084fc' }} /> 총 자산 대비 금융 투자 비중 (%) (네온 라인)
              </div>
            </div>
          </div>

          {/* 영역형 꺾은선 차트 시각화 영역 */}
          {(() => {
            const maxRatio = Math.max(0.1, ...yearlyAssetMetrics.map(m => Math.max(0, m.investRatio)));
            const yMaxRatio = Math.max(5, Math.ceil(maxRatio * 1.25));

            const svgHeight = 195;
            const chartHeight = 135;
            const baselineY = 145;
            const activeWidth = chart2Width || 500;

            const points = yearlyAssetMetrics.map((m, i) => {
              const ratio = Math.max(0, m.investRatio);
              const x = (i + 0.5) * (activeWidth / 12);
              const y = baselineY - 6 - (ratio / yMaxRatio) * (chartHeight - 10);
              return { x, y, ratio, month: m.month, yearMonth: m.yearMonth };
            });

            const linePathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            const areaPathStr = `${linePathStr} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

            return (
              <div ref={chart2Ref} style={{ position: 'relative', width: '100%', height: `${svgHeight}px`, marginTop: '8px' }}>
                {/* 1. X축 베이스 라인 및 월 레이블 컨테이너 (12개 균등 컬럼) */}
                <div style={{ height: `${baselineY}px`, borderBottom: '1px solid var(--border-color)' }} />
                <div style={{ display: 'flex', width: '100%', height: '35px', paddingTop: '10px' }}>
                  {yearlyAssetMetrics.map(m => {
                    const isSelected = m.yearMonth === selectedMonth;
                    return (
                      <div key={m.yearMonth} style={{ flex: 1, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: isSelected ? '#e879f9' : 'var(--text-dim)', fontWeight: isSelected ? '700' : 'normal' }}>
                          {parseInt(m.month)}월
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 2. SVG 영역 및 꺾은선 레이어 (Dynamic Vector Canvas) */}
                <svg
                  viewBox={`0 0 ${activeWidth} ${svgHeight}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                >
                  <defs>
                    <linearGradient id="purpleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
                    </linearGradient>

                    <filter id="neonGlowPink" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* 그라데이션 영역 채우기 */}
                  <path d={areaPathStr} fill="url(#purpleAreaGrad)" />

                  {/* 꺾은선 (Line) */}
                  <path
                    d={linePathStr}
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#neonGlowPink)"
                  />

                  {/* 데이터 포인트 노드 & 현재 선택월 강렬한 네온 하이라이트 */}
                  {points.map(p => {
                    const isSelected = p.yearMonth === selectedMonth;
                    const isHovered = hoverTooltip?.chartId === 'invest' && hoverTooltip?.month === p.month;
                    const rRadius = isSelected ? 7.5 : (isHovered ? 6 : 4);

                    return (
                      <g key={p.yearMonth} style={{ pointerEvents: 'all', cursor: 'pointer' }}>
                        {/* 현재 선택월 광륜 (Neon Multi-ring Halo) */}
                        {isSelected && (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={14}
                            fill="rgba(232, 121, 249, 0.22)"
                            stroke="#e879f9"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                            filter="url(#neonGlowPink)"
                          />
                        )}

                        {/* 데이터 노드 링 (왜곡 0% 완벽한 정원 circle) */}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={rRadius}
                          fill={isSelected ? '#e879f9' : (isHovered ? '#d8b4fe' : '#a855f7')}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? 3 : 1.5}
                          onMouseEnter={() => setHoverTooltip({ chartId: 'invest', x: p.x, y: p.y, month: p.month, label: '금융 투자비중', value: `${p.ratio.toFixed(1)}%`, color: '#e879f9' })}
                          onMouseLeave={() => setHoverTooltip(null)}
                          style={{ transition: 'all 0.2s ease' }}
                        />

                        {/* 현재 선택월 강렬한 핑크 네온 상단 뱃지 핀 (외곽 잘림 방지 X 클램핑) */}
                        {isSelected && !isHovered && (() => {
                          const badgeX = Math.max(45, Math.min(activeWidth - 45, p.x));
                          return (
                            <g transform={`translate(${badgeX}, ${p.y - 14})`}>
                              <rect x="-40" y="-18" width="80" height="20" rx="5" fill="#e879f9" filter="drop-shadow(0 0 8px rgba(232, 121, 249, 0.9))" />
                              <text x="0" y="-4" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="900">
                                현재 {p.ratio.toFixed(1)}%
                              </text>
                            </g>
                          );
                        })()}
                      </g>
                    );
                  })}

                  {/* 호버 요소 바로 위 스마트 플로팅 툴팁 (Area Chart - Dynamic Auto-Scaling Padding) */}
                  {hoverTooltip && hoverTooltip.chartId === 'invest' && (() => {
                    const fullText = `${hoverTooltip.month} 비중: ${hoverTooltip.value}`;
                    const rectWidth = Math.max(120, fullText.length * 7.5 + 24);
                    const halfW = rectWidth / 2;
                    const clampedX = Math.max(halfW + 8, Math.min(activeWidth - (halfW + 8), hoverTooltip.x));

                    return (
                      <g transform={`translate(${clampedX}, ${Math.max(25, hoverTooltip.y - 14)})`} style={{ pointerEvents: 'none' }}>
                        <rect
                          x={-halfW}
                          y="-22"
                          width={rectWidth}
                          height="24"
                          rx="6"
                          fill="rgba(15, 23, 42, 0.95)"
                          stroke="#e879f9"
                          strokeWidth="1.5"
                          filter="drop-shadow(0 4px 12px rgba(232, 121, 249, 0.6))"
                        />
                        <text x="0" y="-6" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="bold">
                          {fullText}
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 당월 자산 데이터 초기화 확인 모달 */}
      {showClearModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px', borderLeft: '4px solid var(--accent-rose)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <AlertTriangle color="var(--accent-rose)" size={24} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
                당월 자산 데이터 초기화
              </h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
              <strong style={{ color: '#fff' }}>{yearStr}년 {parseInt(monthStr)}월</strong>의 모든 현금 계좌(14개), 투자/자산(8개), 부채(2개) 입력 잔액이 <strong style={{ color: 'var(--accent-rose)' }}>0원</strong>으로 리셋됩니다.
              <br /><br />
              정말 초기화하시겠습니까? (다른 월 데이터에는 영향을 주지 않습니다)
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowClearModal(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                onClick={handleConfirmClear}
              >
                초기화 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 자산/부채 항목 동적 추가 / 수정 모달 */}
      {isAssetModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
                {editingAssetItem ? '✏️ 자산/부채 항목 수정' : '➕ 신규 자산/부채 항목 추가'}
              </h3>
              <button onClick={() => setIsAssetModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  구분 선택
                </label>
                <select
                  className="input"
                  value={assetModalGroup}
                  onChange={e => setAssetModalGroup(e.target.value)}
                  disabled={Boolean(editingAssetItem)}
                  style={{ width: '100%' }}
                >
                  <option value="cashItems">🏦 현금 계좌</option>
                  <option value="investItems">📈 투자 / 자산</option>
                  <option value="debtItems">💳 부채</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  항목 명칭 *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="예: 카카오뱅크, 토스증권, 신용대출"
                  value={assetForm.name}
                  onChange={e => setAssetForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  소유자 (귀속) *
                </label>
                <select
                  className="input"
                  value={assetForm.owner}
                  onChange={e => setAssetForm(prev => ({ ...prev, owner: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  <option value="기석">기석</option>
                  <option value="승주">승주</option>
                  <option value="가족공동">가족공동</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  초기/기본 잔액 (원, 선택 사항)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input"
                  placeholder="0"
                  value={formatInputNumber(assetForm.defaultBalance)}
                  onChange={e => setAssetForm(prev => ({ ...prev, defaultBalance: Math.max(0, parseInputNumber(e.target.value)) }))}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                  * 입력 시 당월 자산 잔액에 자동 세팅됩니다. (미입력 시 0원)
                </span>
              </div>

              {assetModalGroup === 'investItems' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px' }}>
                  <input
                    type="checkbox"
                    id="chkRealEstate"
                    checked={assetForm.isRealEstate}
                    onChange={e => setAssetForm(prev => ({ ...prev, isRealEstate: e.target.checked }))}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chkRealEstate" style={{ fontSize: '0.85rem', color: '#fff', cursor: 'pointer' }}>
                    🏠 부동산 자산 (금융 투자 비율 연산 시 제외)
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAssetModalOpen(false)}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingAssetItem ? '수정 완료' : '항목 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
