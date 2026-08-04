import React from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW } from '../utils/finance';

export default function IncomeView() {
  const { currentMetrics, yearlyMetrics, selectedMonth } = useApp();

  const BENCHMARK_INCOME = 10000000; // 1,000만원 보수적 기준 (기석 700만 + 승주 육아휴직 300만)
  const diffFromBenchmark = currentMetrics.totalIncome - BENCHMARK_INCOME;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 타이틀 */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>
          💰 수입 관리 & 보수적 수입 기준 비교
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          기석/승주 월급·상여, 실비환급 및 기타수입 5개 항목의 거래내역 기반 정확한 집계
        </p>
      </div>

      {/* 당월 수입 카드 */}
      <div className="grid-cards">
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>당월 총수입</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--accent-emerald)', marginTop: '4px' }}>
            {formatKRW(currentMetrics.totalIncome)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            보수적 가구 수입 기준(1,000만원) 대비 {diffFromBenchmark >= 0 ? `+${formatKRW(diffFromBenchmark)} 달성` : `${formatKRW(diffFromBenchmark)}`}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>기석 수입 합계</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
            {formatKRW((currentMetrics.incomeMap['기석월급'] || 0) + (currentMetrics.incomeMap['기석상여'] || 0))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            월급: {formatKRW(currentMetrics.incomeMap['기석월급'] || 0)} | 상여: {formatKRW(currentMetrics.incomeMap['기석상여'] || 0)}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>승주 수입 합계</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
            {formatKRW((currentMetrics.incomeMap['승주월급'] || 0) + (currentMetrics.incomeMap['승주상여'] || 0))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            월급/육아휴직: {formatKRW(currentMetrics.incomeMap['승주월급'] || 0)} | 상여: {formatKRW(currentMetrics.incomeMap['승주상여'] || 0)}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>실비 / 기타 수입</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-cyan)', marginTop: '4px' }}>
            {formatKRW((currentMetrics.incomeMap['실비'] || 0) + (currentMetrics.incomeMap['기타수입'] || 0))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            실비환급: {formatKRW(currentMetrics.incomeMap['실비'] || 0)} | 기타: {formatKRW(currentMetrics.incomeMap['기타수입'] || 0)}
          </div>
        </div>
      </div>

      {/* 엑셀 수입관리 시트 호환 테이블 (실제 수입 데이터 100% 매핑) */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
          🗓️ 연간 월별 수입 항목별 상세 집계 표 (거래내역 원본 100% 자동 연동)
        </h3>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>월</th>
                <th>기석 월급</th>
                <th>기석 상여</th>
                <th>기석 수입합계</th>
                <th>승주 월급/육아휴직</th>
                <th>승주 상여</th>
                <th>승주 수입합계</th>
                <th>기타/실비 수입</th>
                <th>총 수입</th>
              </tr>
            </thead>
            <tbody>
              {yearlyMetrics.map(m => {
                const isSelected = m.yearMonth === selectedMonth;
                const iMap = m.incomeMap || {};
                const gkSal = iMap['기석월급'] || 0;
                const gkBon = iMap['기석상여'] || 0;
                const gkTotal = gkSal + gkBon;

                const sjSal = iMap['승주월급'] || 0;
                const sjBon = iMap['승주상여'] || 0;
                const sjTotal = sjSal + sjBon;

                const etcTotal = (iMap['기타수입'] || 0) + (iMap['실비'] || 0);
                const calcTotalIncome = m.totalIncome;

                return (
                  <tr key={m.yearMonth} style={{ background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent', fontWeight: isSelected ? '600' : 'normal' }}>
                    <td>{m.month} {isSelected && '👈'}</td>
                    <td>{formatKRW(gkSal)}</td>
                    <td>{formatKRW(gkBon)}</td>
                    <td style={{ fontWeight: '600', color: '#fff' }}>{formatKRW(gkTotal)}</td>
                    <td>{formatKRW(sjSal)}</td>
                    <td>{formatKRW(sjBon)}</td>
                    <td style={{ fontWeight: '600', color: '#fff' }}>{formatKRW(sjTotal)}</td>
                    <td>{formatKRW(etcTotal)}</td>
                    <td style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>{formatKRW(calcTotalIncome)}</td>
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
