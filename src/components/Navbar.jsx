import React from 'react';
import { useApp } from '../context/AppContext';
import { LayoutDashboard, ReceiptText, PieChart, Wallet, Landmark, Settings, Calendar, ChevronLeft, ChevronRight, LogOut, User } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const { selectedMonth, setSelectedMonth, user, logout, db } = useApp();

  const householdName = user?.householdName || db?.userInfo?.householdName || '기석 & 승주 가족 가계부';

  const navItems = [
    { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { id: 'transactions', label: '거래내역', icon: ReceiptText },
    { id: 'budget', label: '월별예산', icon: PieChart },
    { id: 'income', label: '수입관리', icon: Wallet },
    { id: 'accounts', label: '총 자산', icon: Landmark },
    { id: 'settings', label: '설정 & 백업', icon: Settings },
  ];

  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [currentYear, currentMonthNum] = (selectedMonth || defaultYM).split('-');
  const yearInt = parseInt(currentYear) || now.getFullYear();

  const handlePrevYear = () => {
    const nextYear = String(yearInt - 1);
    setSelectedMonth(`${nextYear}-${currentMonthNum}`);
  };

  const handleNextYear = () => {
    const nextYear = String(yearInt + 1);
    setSelectedMonth(`${nextYear}-${currentMonthNum}`);
  };

  const handleMonthChange = (mStr) => {
    setSelectedMonth(`${currentYear}-${mStr}`);
  };

  return (
    <header style={{ background: 'var(--bg-glass)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* 로고 및 브랜딩 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-glow)' }}>
            <Wallet size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              {householdName}
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>부부 통합 자산관리 프로그램</span>
          </div>
        </div>

        {/* 다년도 피벗 연도/월 컨트롤 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(30, 41, 59, 0.7)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          <Calendar size={18} color="var(--accent-cyan)" />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(15, 23, 42, 0.6)', padding: '2px 6px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              onClick={handlePrevYear}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
              title="이전 연도로 이동"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fff', padding: '0 4px', minWidth: '55px', textAlign: 'center' }}>
              {currentYear}년
            </span>
            <button
              onClick={handleNextYear}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
              title="다음 연도로 이동"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <select
            value={currentMonthNum}
            onChange={(e) => handleMonthChange(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', outline: 'none' }}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const mVal = String(i + 1).padStart(2, '0');
              return (
                <option key={mVal} value={mVal} style={{ background: '#1e293b', color: '#fff' }}>
                  {i + 1}월
                </option>
              );
            })}
          </select>
        </div>

        {/* 네비게이션 탭 & 사용자 프로필 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <nav style={{ display: 'flex', gap: '6px', background: 'rgba(15,23,42,0.6)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? '600' : '500',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    background: isActive ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'transparent',
                    boxShadow: isActive ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* 프로필 & 로그아웃 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#fff', fontWeight: '600' }}>
              <User size={15} color="var(--accent-cyan)" />
              <span>{user?.username || 'togom'}</span>
            </div>
            <button
              onClick={logout}
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '6px',
                color: '#fda4af',
                padding: '4px 8px',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="로그아웃"
            >
              <LogOut size={13} /> 로그아웃
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

