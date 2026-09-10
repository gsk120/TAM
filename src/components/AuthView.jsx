import React, { useState } from 'react';
import { Wallet, LogIn, UserPlus, Lock, User, Home, Users, CheckCircle, ArrowRight, ArrowLeft, Plus, Trash2, DollarSign, TrendingUp, CreditCard } from 'lucide-react';
import { STANDARD_TEMPLATE_CATEGORIES, STANDARD_TEMPLATE_INCOME, formatKRW, formatInputNumber, parseInputNumber } from '../utils/finance';

export default function AuthView({ onLogin, onRegister }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpStep, setSignUpStep] = useState(1); // 1: 기본정보, 2: 수입카테고리, 3: 지출/예산
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 로그인 폼
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
  });

  // 회원가입 폼 - Step 1 기본정보
  const [signUpForm, setSignUpForm] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    householdName: '',
    initialMembers: '남편, 아내, 가족공동',
  });

  // 회원가입 폼 - Step 2 수입 카테고리
  const [incomeCategories, setIncomeCategories] = useState(() =>
    STANDARD_TEMPLATE_INCOME.map(i => ({ ...i }))
  );

  // 회원가입 폼 - Step 3 지출 카테고리 및 예산
  const [expenseCategories, setExpenseCategories] = useState(() =>
    STANDARD_TEMPLATE_CATEGORIES.map(c => ({ ...c }))
  );

  // 로그인 제출
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

  // Step 1 -> Step 2 진행
  const handleStep1Next = (e) => {
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

    // 가족 구성원 목록 파싱 후 수입 카테고리 owner 옵션 기본 매핑
    const members = signUpForm.initialMembers
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    if (members.length > 0) {
      // 구성원 이름이 변경되었을 경우 수입 카테고리 기본 소유자도 동기화
      setIncomeCategories(prev => {
        return prev.map((item, idx) => {
          if (idx < members.length) {
            return { ...item, owner: members[idx] };
          }
          return item;
        });
      });
    }

    setSignUpStep(2);
  };

  // Step 2 수입 카테고리 조작
  const handleAddIncome = () => {
    const members = signUpForm.initialMembers.split(',').map(m => m.trim()).filter(Boolean);
    const defaultOwner = members[0] || '가족공동';
    setIncomeCategories(prev => [
      ...prev,
      { id: `inc_custom_${Date.now()}`, name: '', owner: defaultOwner },
    ]);
  };

  const handleUpdateIncome = (idx, field, value) => {
    setIncomeCategories(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleDeleteIncome = (idx) => {
    if (incomeCategories.length <= 1) {
      setErrorMsg('수입 항목은 최소 1개 이상 필요합니다.');
      return;
    }
    setIncomeCategories(prev => prev.filter((_, i) => i !== idx));
  };

  // Step 3 지출 카테고리 조작
  const handleAddExpense = () => {
    setExpenseCategories(prev => [
      ...prev,
      { id: `cat_custom_${Date.now()}`, name: '', defaultBudget: 100000, isFixed: false, type: '지출' },
    ]);
  };

  const handleUpdateExpense = (idx, field, value) => {
    setExpenseCategories(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleDeleteExpense = (idx) => {
    if (expenseCategories.length <= 1) {
      setErrorMsg('지출 카테고리는 최소 1개 이상 필요합니다.');
      return;
    }
    setExpenseCategories(prev => prev.filter((_, i) => i !== idx));
  };

  // 회원가입 최종 완료 제출
  const handleFinalSignUpSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // 수입 카테고리 이름 검증
    const validIncome = incomeCategories
      .map(i => ({ ...i, name: i.name.trim() }))
      .filter(i => i.name.length > 0);

    if (validIncome.length === 0) {
      setErrorMsg('최소 1개 이상의 유효한 수입 카테고리 이름을 입력해 주세요.');
      setSignUpStep(2);
      return;
    }

    // 지출 카테고리 이름 검증
    const validExpense = expenseCategories
      .map(c => ({ ...c, name: c.name.trim(), defaultBudget: Number(c.defaultBudget) || 0 }))
      .filter(c => c.name.length > 0);

    if (validExpense.length === 0) {
      setErrorMsg('최소 1개 이상의 유효한 지출 카테고리 이름을 입력해 주세요.');
      return;
    }

    // 카테고리별 초기 예산 매핑
    const initialBudgets = {};
    validExpense.forEach(c => {
      initialBudgets[c.name] = c.defaultBudget;
    });

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
        categories: validExpense,
        income_categories: validIncome,
        initial_budgets: initialBudgets,
      });
    } catch (err) {
      setErrorMsg(err.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const parsedMembers = signUpForm.initialMembers
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

  const totalStep3Budget = expenseCategories.reduce((sum, c) => sum + (Number(c.defaultBudget) || 0), 0);

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
        maxWidth: isSignUp && signUpStep > 1 ? '640px' : '460px',
        background: 'rgba(30, 41, 59, 0.75)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.15)',
        padding: '36px 32px',
        position: 'relative',
        zIndex: 10,
        transition: 'max-width 0.3s ease',
      }}>
        {/* 상단 브랜딩 로고 */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)',
            marginBottom: '12px',
          }}>
            <Wallet size={30} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            부부 통합 자산관리 가계부
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            가족의 수입, 지출, 예산 및 자산을 스마트하게 공유하세요
          </p>
        </div>

        {/* 탭 전환 (로그인 / 회원가입) */}
        <div style={{
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setErrorMsg(''); setSignUpStep(1); }}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '9px',
              border: 'none',
              background: !isSignUp ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'transparent',
              color: !isSignUp ? '#fff' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: '0.9rem',
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
              fontSize: '0.9rem',
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

        {/* 에러 메시지 알림 박스 */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '0.84rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ================= 로그인 폼 ================= */}
        {!isSignUp ? (
          <form onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
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
                    padding: '11px 14px 11px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.92rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
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
                    padding: '11px 14px 11px 38px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.92rem',
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
                padding: '13px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff',
                fontWeight: '700',
                fontSize: '0.95rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              {isLoading ? '접속 중...' : '가계부 접속하기'}
            </button>
          </form>
        ) : (
          /* ================= 회원가입 3단계 위저드 ================= */
          <div>
            {/* Step 인디케이터 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
              {[
                { step: 1, label: '계정 설정' },
                { step: 2, label: '수입 항목' },
                { step: 3, label: '지출 & 예산' },
              ].map((s, idx) => (
                <React.Fragment key={s.step}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.78rem',
                    fontWeight: signUpStep === s.step ? '700' : '500',
                    color: signUpStep >= s.step ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: signUpStep >= s.step ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                    }}>
                      {s.step}
                    </div>
                    <span>{s.label}</span>
                  </div>
                  {idx < 2 && (
                    <div style={{ width: '18px', height: '1px', background: signUpStep > idx + 1 ? 'var(--accent-primary)' : 'rgba(255,255,255,0.15)' }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Step 1: 기본 정보 */}
            {signUpStep === 1 && (
              <form onSubmit={handleStep1Next}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    아이디 *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="새 아이디 입력"
                      value={signUpForm.username}
                      onChange={e => setSignUpForm({ ...signUpForm, username: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 36px',
                        borderRadius: '9px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '0.88rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      비밀번호 *
                    </label>
                    <input
                      type="password"
                      placeholder="비밀번호"
                      value={signUpForm.password}
                      onChange={e => setSignUpForm({ ...signUpForm, password: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: '9px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '0.88rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      비밀번호 확인 *
                    </label>
                    <input
                      type="password"
                      placeholder="비밀번호 재입력"
                      value={signUpForm.passwordConfirm}
                      onChange={e => setSignUpForm({ ...signUpForm, passwordConfirm: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: '9px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '0.88rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    가계부 명칭
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Home size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="예: 우리 집 가계부"
                      value={signUpForm.householdName}
                      onChange={e => setSignUpForm({ ...signUpForm, householdName: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 36px',
                        borderRadius: '9px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '0.88rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '22px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    가족 구성원 (쉼표로 구분)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Users size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="예: 남편, 아내, 가족공동"
                      value={signUpForm.initialMembers}
                      onChange={e => setSignUpForm({ ...signUpForm, initialMembers: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 36px',
                        borderRadius: '9px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '0.88rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    color: '#fff',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                  }}
                >
                  다음: 수입 카테고리 설정 <ArrowRight size={16} />
                </button>
              </form>
            )}

            {/* Step 2: 수입 카테고리 설정 */}
            {signUpStep === 2 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    가족 구성원에 맞는 수입 항목을 입력하세요:
                  </span>
                  <button
                    type="button"
                    onClick={handleAddIncome}
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      color: 'var(--accent-cyan)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={13} /> 추가
                  </button>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px', paddingRight: '4px' }}>
                  {incomeCategories.map((item, idx) => (
                    <div key={item.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <input
                        type="text"
                        placeholder="수입명 (예: 월급, 상여)"
                        value={item.name}
                        onChange={e => handleUpdateIncome(idx, 'name', e.target.value)}
                        style={{
                          flex: 2,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: 'rgba(30, 41, 59, 0.8)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.85rem',
                        }}
                      />
                      <select
                        value={item.owner || '가족공동'}
                        onChange={e => handleUpdateIncome(idx, 'owner', e.target.value)}
                        style={{
                          flex: 1.5,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: 'rgba(30, 41, 59, 0.8)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.82rem',
                        }}
                      >
                        {parsedMembers.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        {!parsedMembers.includes('가족공동') && (
                          <option value="가족공동">가족공동</option>
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteIncome(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f43f5e',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSignUpStep(1)}
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: 'var(--text-muted)',
                      fontWeight: '600',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <ArrowLeft size={16} /> 이전
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignUpStep(3)}
                    style={{
                      flex: 2,
                      padding: '11px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                      color: '#fff',
                      fontWeight: '700',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    다음: 지출 및 예산 설정 <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: 지출 카테고리 및 월별 예산 직접 입력 */}
            {signUpStep === 3 && (
              <form onSubmit={handleFinalSignUpSubmit}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    지출 카테고리와 월별 목표 예산(원)을 설정하세요:
                  </span>
                  <button
                    type="button"
                    onClick={handleAddExpense}
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      color: 'var(--accent-cyan)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={13} /> 추가
                  </button>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', paddingRight: '4px' }}>
                  {expenseCategories.map((item, idx) => (
                    <div key={item.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <input
                        type="text"
                        placeholder="카테고리명 (예: 식비)"
                        value={item.name}
                        onChange={e => handleUpdateExpense(idx, 'name', e.target.value)}
                        style={{
                          flex: 2,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: 'rgba(30, 41, 59, 0.8)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.85rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateExpense(idx, 'isFixed', !item.isFixed)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: '600',
                          border: 'none',
                          cursor: 'pointer',
                          background: item.isFixed ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.2)',
                          color: item.isFixed ? '#60a5fa' : '#34d399',
                        }}
                      >
                        {item.isFixed ? '고정비' : '실소비'}
                      </button>
                      <div style={{ flex: 2, position: 'relative' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="예산(원)"
                          value={formatInputNumber(item.defaultBudget)}
                          onChange={e => handleUpdateExpense(idx, 'defaultBudget', parseInputNumber(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '6px 20px 6px 8px',
                            textAlign: 'right',
                            borderRadius: '6px',
                            background: 'rgba(30, 41, 59, 0.8)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--accent-cyan)',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                          }}
                        />
                        <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          원
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f43f5e',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* 총 목표 월예산 요약 */}
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>총 목표 월예산:</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>
                    {formatKRW(totalStep3Budget)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSignUpStep(2)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: 'var(--text-muted)',
                      fontWeight: '600',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <ArrowLeft size={16} /> 이전
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      fontWeight: '700',
                      fontSize: '0.95rem',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    {isLoading ? '가계부 생성 중...' : '새 가계부 생성 완료!'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
