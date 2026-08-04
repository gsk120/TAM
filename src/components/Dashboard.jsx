import React from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW } from '../utils/finance';
import { TrendingUp, AlertTriangle, DollarSign, HeartPulse, PiggyBank, CreditCard, ShoppingBag, Calendar, Landmark } from 'lucide-react';

export default function Dashboard() {
  const { currentMetrics, yearlyMetrics, selectedMonth } = useApp();

  const totalBudget = currentMetrics.categoryDetails.reduce((acc, curr) => acc + curr.budget, 0);
  const totalSpent = currentMetrics.categoryDetails.reduce((acc, curr) => acc + curr.spent, 0);
  const remainingBudget = totalBudget - totalSpent;
  const overallUsageRate = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const isFixedCat = (c) => Boolean(c.isFixed === true || String(c.isFixed) === 'true' || c.isFixed === 1);

  // 5번 고정비 항목 (isFixed가 true인 카테고리)
  const fixedCostsTotal = currentMetrics.categoryDetails
    .filter(isFixedCat)
    .reduce((acc, c) => acc + c.spent, 0);

  // 6번 실소비 항목 (isFixed가 false인 카테고리)
  const realConsumptionTotal = currentMetrics.categoryDetails
    .filter(c => !isFixedCat(c))
    .reduce((acc, c) => acc + c.spent, 0);

  const realConsumptionBudget = currentMetrics.categoryDetails
    .filter(c => !isFixedCat(c))
    .reduce((acc, c) => acc + c.budget, 0);

  // 7번 실소비 일일 현황 계산
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month;

  const elapsedDays = isCurrentMonth ? Math.min(now.getDate(), totalDaysInMonth) : totalDaysInMonth;
  const remainingDays = isCurrentMonth ? Math.max(0, totalDaysInMonth - elapsedDays) : 0;

  const dailyAverageSpent = elapsedDays > 0 ? realConsumptionTotal / elapsedDays : 0;
  const remainingRealConsumptionBudget = realConsumptionBudget - realConsumptionTotal;
  const dailyRecommendedSpent = remainingDays > 0 ? Math.max(0, remainingRealConsumptionBudget / remainingDays) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 대시보드 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>
            {yearStr}년 {month}월 재무 대시보드
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            현금유출, 실제소비, 고정비/실소비 구분 및 예산 위험 카테고리 실시간 요약
          </p>
        </div>
      </div>

      {/* 8개 주요 KPI 카드 Max 4컬럼 제한 반응형 Media Query Grid */}
      <div className="kpi-grid-container">
        {/* 1번 카드: 당월 총수입 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>당월 총수입</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="var(--accent-emerald)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--accent-emerald)' }}>
            {formatKRW(currentMetrics.totalIncome)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            월급, 상여, 실비환급, 기타수입 포함
          </div>
        </div>

        {/* 2번 카드: 목표 지출 (월예산) */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>목표 지출 (월예산)</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={20} color="var(--accent-primary)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--accent-cyan)' }}>
            {formatKRW(totalBudget)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            16개 카테고리 설정 예산 합계
          </div>
        </div>

        {/* 3번 카드: 당월 총지출 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>당월 총지출</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HeartPulse size={20} color="var(--accent-rose)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--accent-rose)' }}>
            {formatKRW(totalSpent)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            카테고리별 사용합계 (순의료비 반영)
          </div>
        </div>

        {/* 4번 카드: 잔여 예산 [수정 - 총 사용률 % 강조] */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>잔여 예산</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PiggyBank size={20} color="var(--accent-cyan)" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: remainingBudget < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
              {formatKRW(remainingBudget)}
            </span>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '6px',
              background: overallUsageRate > 100 ? 'rgba(244, 63, 94, 0.2)' : (overallUsageRate > 80 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'),
              color: overallUsageRate > 100 ? '#f43f5e' : (overallUsageRate > 80 ? '#f59e0b' : '#10b981'),
              border: `1px solid ${overallUsageRate > 100 ? 'rgba(244, 63, 94, 0.4)' : (overallUsageRate > 80 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)')}`
            }}>
              사용률 {overallUsageRate.toFixed(1)}%
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            사용액: {formatKRW(totalSpent)} (총예산 대비)
          </div>
        </div>

        {/* 5번 카드: 고정비 합계 [개편] */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>고정비 합계</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={20} color="#3b82f6" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#60a5fa' }}>
            {formatKRW(fixedCostsTotal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            대출, 보험, 통신, 주거, 고정비, 교통, 세금
          </div>
        </div>

        {/* 6번 카드: 실소비 합계 [위치 변경/개편] */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>실소비 합계</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingBag size={20} color="#38bdf8" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#38bdf8' }}>
            {formatKRW(realConsumptionTotal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            식비, 육아, 순의료비, 교육, 기타, 이벤트, 용돈2
          </div>
        </div>

        {/* 7번 카드: 실소비 일일 현황 [신규 추가] */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>실소비 일일 현황</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(192, 132, 252, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={20} color="#c084fc" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#c084fc' }}>
              {formatKRW(dailyAverageSpent)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>/일 (경과 {elapsedDays}일)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            {remainingDays > 0
              ? `일 권장: ${formatKRW(dailyRecommendedSpent)} (남은 D-${remainingDays}일)`
              : `당월 완료 (${totalDaysInMonth}일 경과)`}
          </div>
        </div>

        {/* 8번 카드: 월 잉여자금 [유지] */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>월 잉여자금</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={20} color={currentMetrics.monthlySurplus >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: currentMetrics.monthlySurplus >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
            {formatKRW(currentMetrics.monthlySurplus)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            총수입 - 통장 실 현금유출 (마통 상환 여력)
          </div>
        </div>
      </div>

      {/* 위험 TOP 3 지출 하이라이트 박스 (엑셀 템플릿 호환) */}
      <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--accent-amber)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <AlertTriangle color="var(--accent-amber)" size={22} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>
            ⚠️ 이번 달 예산 위험 TOP 3 카테고리
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(다음 주 소비 조절 권장)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {currentMetrics.riskTop3.map((cat, idx) => (
            <div key={cat.id} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', fontWeight: '700', marginRight: '6px' }}>
                  TOP {idx + 1}
                </span>
                <span style={{ fontWeight: '600', color: '#fff' }}>{cat.name}</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {formatKRW(cat.spent)} / {formatKRW(cat.budget)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${cat.badgeClass}`}>
                  {cat.usageRate.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 16개 카테고리 예산 사용률 진행 상태 (메인 그리드) */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
          📊 카테고리별 예산 현황 ({currentMetrics.categoryDetails.length}개 항목)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {currentMetrics.categoryDetails.map(cat => {
            const isMedical = cat.name === '의료비';
            return (
              <div key={cat.id} style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600', fontSize: '0.95rem', color: '#fff' }}>{cat.name}</span>
                  <span className={`badge ${cat.badgeClass}`}>{cat.status} ({cat.usageRate.toFixed(0)}%)</span>
                </div>

                {/* 금액 레전드 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>사용: {formatKRW(cat.spent)} {isMedical && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem' }}>(순의료비)</span>}</span>
                  <span>예산: {formatKRW(cat.budget)}</span>
                </div>

                {/* 의료비 전용 총지출 & 실비환급 서브 설명 */}
                {isMedical && (cat.grossMedicalSpent > 0 || cat.medicalRefund > 0) && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                    * 지출 {formatKRW(cat.grossMedicalSpent)} - 실비 {formatKRW(cat.medicalRefund)}
                  </div>
                )}

                {/* 프로그래스 바 */}
                <div className="progress-bg">
                  <div
                    className={`progress-fill ${cat.barClass}`}
                    style={{ width: `${Math.min(100, cat.usageRate)}%` }}
                  />
                </div>

                <div style={{ fontSize: '0.75rem', color: cat.remaining < 0 ? 'var(--accent-rose)' : 'var(--text-dim)', marginTop: '6px', textAlign: 'right' }}>
                  {cat.remaining < 0 ? `초과액: ${formatKRW(Math.abs(cat.remaining))}` : `남은금액: ${formatKRW(cat.remaining)}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 1월 ~ 12월 연간 수입/지출 추이 요약 표 */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
          🗓️ 연간 월별 수입 / 지출 / 잉여자금 흐름
        </h3>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>조회월</th>
                <th>총 수입</th>
                <th>총 지출</th>
                <th>실 지출(실비 차감)</th>
                <th>월 잉여자금</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {yearlyMetrics.map(m => {
                const isSelected = m.yearMonth === selectedMonth;
                return (
                  <tr key={m.yearMonth} style={{ background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent', fontWeight: isSelected ? '600' : 'normal' }}>
                    <td>{m.month} {isSelected && '👈'}</td>
                    <td style={{ color: 'var(--accent-emerald)' }}>{formatKRW(m.totalIncome)}</td>
                    <td style={{ color: '#fff' }}>{formatKRW(m.totalExpense)}</td>
                    <td style={{ color: 'var(--accent-cyan)' }}>{formatKRW(m.categoryTotalSpent)}</td>
                    <td style={{ color: m.monthlySurplus >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                      {formatKRW(m.monthlySurplus)}
                    </td>
                    <td>
                      {m.monthlySurplus >= 0 ? (
                        <span className="badge badge-stable">흑자</span>
                      ) : (
                        <span className="badge badge-danger">적자</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
