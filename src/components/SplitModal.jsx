import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_CATEGORIES, formatKRW, formatInputNumber, parseInputNumber } from '../utils/finance';
import { X, Plus, Trash2 } from 'lucide-react';

export default function SplitModal({ tx, onClose }) {
  const { db, splitTransaction } = useApp();
  const categoriesList = db.categories || DEFAULT_CATEGORIES;
  const defaultSubCat = categoriesList[1]?.name || categoriesList[0]?.name || '미분류';

  const [splitItems, setSplitItems] = useState([
    { category: tx.category, amount: tx.amount, memo: '주목적 거래' },
    { category: defaultSubCat, amount: 0, memo: '세부 항목' },
  ]);

  const handleItemChange = (idx, field, val) => {
    setSplitItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const handleAddItem = () => {
    setSplitItems(prev => [...prev, { category: categoriesList[0]?.name || '미분류', amount: 0, memo: '' }]);
  };

  const handleRemoveItem = (idx) => {
    if (splitItems.length <= 1) return;
    setSplitItems(prev => prev.filter((_, i) => i !== idx));
  };

  const currentTotal = splitItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const diff = tx.amount - currentTotal;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (diff !== 0) {
      alert(`분할 금액의 합계(${formatKRW(currentTotal)})가 원거래 금액(${formatKRW(tx.amount)})과 일치해야 합니다. (차이: ${formatKRW(diff)})`);
      return;
    }

    splitTransaction(tx.id, splitItems);
    alert('거래가 정상적으로 분할되었습니다!');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
              ✂️ 혼합 영수증 거래 분할
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              원거래: {tx.description} ({formatKRW(tx.amount)})
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {splitItems.map((item, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 30px', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.5)', padding: '10px', borderRadius: '8px' }}>
              <select className="select" value={item.category} onChange={e => handleItemChange(idx, 'category', e.target.value)}>
                {categoriesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input
                type="text"
                inputMode="numeric"
                className="input"
                placeholder="금액(원)"
                value={formatInputNumber(item.amount)}
                onChange={e => handleItemChange(idx, 'amount', parseInputNumber(e.target.value))}
              />
              <input
                type="text"
                className="input"
                placeholder="메모 (선택)"
                value={item.memo}
                onChange={e => handleItemChange(idx, 'memo', e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <button type="button" className="btn btn-secondary" onClick={handleAddItem} style={{ alignSelf: 'flex-start' }}>
            <Plus size={16} /> 항목 추가
          </button>

          {/* 합계 검증 바 */}
          <div style={{ background: diff === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', padding: '12px', borderRadius: '8px', border: `1px solid ${diff === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span>분할 금액 합계: <strong>{formatKRW(currentTotal)}</strong></span>
            <span style={{ color: diff === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: '700' }}>
              {diff === 0 ? '✅ 원거래 금액과 일치함' : `⚠️ 차이: ${formatKRW(diff)}`}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={diff !== 0}>분할 완료</button>
          </div>
        </form>
      </div>
    </div>
  );
}
