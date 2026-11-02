import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function PasswordSettings({ disabled = false }) {
  const { token, logout, user } = useApp();
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null), dialogRef = useRef(null), currentRef = useRef(null);
  const doneRef = useRef(done);
  doneRef.current = done;
  const close = () => {
    if (pending.current) return;
    setCurrent(''); setPassword(''); setConfirm(''); setError(''); setOpen(false);
    if (doneRef.current) logout();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    currentRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled):not([hidden])')];
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); trigger?.focus(); };
  }, [open]);
  const submit = async event => {
    event.preventDefault();
    if (pending.current || done) return;
    setError('');
    if (password !== confirm) { setError('새 비밀번호와 확인 값이 일치하지 않습니다.'); return; }
    if (password.length < 12 || new TextEncoder().encode(password).length > 72 || !password.trim()) {
      setError('새 비밀번호는 12자 이상, UTF-8 기준 72바이트 이내로 입력해 주세요.'); return;
    }
    pending.current = true; setSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '비밀번호를 변경하지 못했습니다.');
      setCurrent(''); setPassword(''); setConfirm(''); setDone(true);
    } catch (failure) { setError(failure.message || '비밀번호를 변경하지 못했습니다. 다시 시도해 주세요.'); }
    finally { pending.current = false; setSaving(false); }
  };
  return <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
    <button ref={triggerRef} type="button" className="btn btn-secondary" disabled={disabled} onClick={() => { setDone(false); setError(''); setOpen(true); }}><KeyRound size={16} />비밀번호 변경</button>
    {open && createPortal(<div className="modal-overlay">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="password-settings-title" className="modal-content" style={{ width: 'min(92vw, 480px)', maxHeight: '90dvh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <h3 id="password-settings-title" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}><KeyRound size={22} />비밀번호 변경</h3>
          <button type="button" aria-label="비밀번호 변경 닫기" className="btn btn-secondary" disabled={saving} onClick={close} style={{ padding: 6 }}><X size={20} /></button>
        </header>
        <div style={{ padding: '20px 24px', overflowY: 'auto', minHeight: 0 }}>
    {done ? <p role="status">비밀번호를 변경했습니다. 이 계정의 모든 기기에서 다시 로그인해야 합니다.</p> : <>
      <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginBottom: 16 }}>변경하면 이 계정의 모든 기기에서 로그인이 해제됩니다. 다른 계정에는 영향을 주지 않습니다.</p>
      <form id="password-change-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <input autoComplete="username" value={user?.username || ''} readOnly hidden />
        <label>현재 비밀번호<input ref={currentRef} className="input" style={{ width: '100%', marginTop: 6 }} type="password" autoComplete="current-password" required disabled={saving} value={current} onChange={e => setCurrent(e.target.value)} /></label>
        <label>새 비밀번호<input className="input" style={{ width: '100%', marginTop: 6 }} type="password" autoComplete="new-password" required minLength={12} disabled={saving} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>새 비밀번호 확인<input className="input" style={{ width: '100%', marginTop: 6 }} type="password" autoComplete="new-password" required disabled={saving} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        <small style={{ color: 'var(--text-muted)' }}>12자 이상 · 한글 등 다중 바이트 문자를 포함해 최대 72바이트</small>
        {error && <p role="alert" style={{ color: 'var(--accent-rose, #fda4af)' }}>{error}</p>}
      </form>
    </>}
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          {done ? <button className="btn btn-primary" onClick={close}>다시 로그인</button> : <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={close}>취소</button>
            <button type="submit" form="password-change-form" className="btn btn-primary" disabled={saving}>{saving ? '변경 중…' : '변경하기'}</button>
          </>}
        </footer>
      </section>
    </div>, document.body)}
  </div>;
}
