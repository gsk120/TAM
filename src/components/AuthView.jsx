import React, { useState } from 'react';
import { Wallet, LogIn, UserPlus, Lock, User, Home, Users, CheckCircle } from 'lucide-react';

export default function AuthView({ onLogin, onRegister }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 로그인 폼
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
  });

  // 회원가입 폼
  const [signUpForm, setSignUpForm] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    householdName: '',
    initialMembers: '남편, 아내, 가족공동',
  });

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      setErrorMsg('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    try {
      await onLogin(loginForm.username.trim(), loginForm.password.trim());
    } catch (err) {
      setErrorMsg(err.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!signUpForm.username.trim()) {
      setErrorMsg('사용할 아이디를 입력해 주세요.');
      return;
    }
    if (!signUpForm.password) {
      setErrorMsg('비밀번호를 입력해 주세요.');
      return;
    }
    if (signUpForm.password !== signUpForm.passwordConfirm) {
      setErrorMsg('비밀번호가 일치하지 않습니다.');
      return;
    }

    const members = signUpForm.initialMembers
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    setIsLoading(true);
    try {
      await onRegister({
        username: signUpForm.username.trim(),
        password: signUpForm.password,
        household_name: signUpForm.householdName.trim() || `${signUpForm.username}의 가계부`,
        initial_members: members.length > 0 ? members : ['남편', '아내', '가족공동'],
      });
    } catch (err) {
      setErrorMsg(err.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, #1e1b4b 0%, #0f172a 70%, #020617 100%)',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 배경 은은한 발광 레이어 */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'rgba(30, 41, 59, 0.75)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.15)',
        padding: '36px 32px',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* 상단 브랜딩 로고 */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)',
            marginBottom: '14px',
          }}>
            <Wallet size={32} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            부부 통합 자산관리 가계부
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            가족의 수입, 지출, 예산 및 자산을 스마트하게 공유하세요
          </p>
        </div>

        {/* 탭 전환 (로그인 / 회원가입) */}
        <div style={{
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setErrorMsg(''); }}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '9px',
              border: 'none',
              background: !isSignUp ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'transparent',
              color: !isSignUp ? '#fff' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: '0.92rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <LogIn size={16} /> 로그인
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setErrorMsg(''); }}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '9px',
              border: 'none',
              background: isSignUp ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'transparent',
              color: isSignUp ? '#fff' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: '0.92rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <UserPlus size={16} /> 회원가입
          </button>
        </div>

        {/* 에러 메시지 표출 */}
        {errorMsg && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '18px',
            color: '#fda4af',
            fontSize: '0.85rem',
            textAlign: 'center',
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* 폼 메인 */}
        {!isSignUp ? (
          /* 로그인 폼 */
          <form onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                아이디
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="아이디를 입력하세요"
                  value={loginForm.username}
                  onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                비밀번호
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={loginForm.password}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              {isLoading ? '인증 처리 중...' : '가계부 접속하기'}
            </button>
          </form>
        ) : (
          /* 회원가입 폼 */
          <form onSubmit={handleSignUpSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                아이디 *
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="새 아이디 입력"
                  value={signUpForm.username}
                  onChange={e => setSignUpForm({ ...signUpForm, username: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  비밀번호 *
                </label>
                <input
                  type="password"
                  placeholder="비밀번호"
                  value={signUpForm.password}
                  onChange={e => setSignUpForm({ ...signUpForm, password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  비밀번호 확인 *
                </label>
                <input
                  type="password"
                  placeholder="비밀번호 재입력"
                  value={signUpForm.passwordConfirm}
                  onChange={e => setSignUpForm({ ...signUpForm, passwordConfirm: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                가계부 명칭 (브랜딩 타이틀)
              </label>
              <div style={{ position: 'relative' }}>
                <Home size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="예: 우리 집 가계부"
                  value={signUpForm.householdName}
                  onChange={e => setSignUpForm({ ...signUpForm, householdName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                가족 구성원 목록 (쉼표 구분)
              </label>
              <div style={{ position: 'relative' }}>
                <Users size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="예: 남편, 아내, 가족공동"
                  value={signUpForm.initialMembers}
                  onChange={e => setSignUpForm({ ...signUpForm, initialMembers: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              {isLoading ? '가계부 생성 중...' : '새 가계부 생성 완료'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
