import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import TransactionsView from './components/TransactionsView';
import BudgetView from './components/BudgetView';
import IncomeView from './components/IncomeView';
import AccountsView from './components/AccountsView';
import SettingsView from './components/SettingsView';
import AuthView from './components/AuthView';

function MainApp() {
  const { isAuthenticated, user, db, login, register } = useApp();
  const [activeTab, setActiveTab] = useState('dashboard');
  const householdName = user?.householdName || db?.userInfo?.householdName;

  useEffect(() => {
    document.title = isAuthenticated && householdName?.trim()
      ? householdName.trim()
      : '가족 가계부 및 자산관리';
  }, [isAuthenticated, householdName]);

  if (!isAuthenticated) {
    return <AuthView onLogin={login} onRegister={register} />;
  }

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'budget' && <BudgetView />}
        {activeTab === 'income' && <IncomeView />}
        {activeTab === 'accounts' && <AccountsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '20px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-dim)', background: 'rgba(15, 23, 42, 0.8)' }}>
        부부 통합 자산관리 프로그램 | 다중 계정 및 가구 구성원 동적 관리 지원
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

