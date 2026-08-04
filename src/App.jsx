import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import TransactionsView from './components/TransactionsView';
import BudgetView from './components/BudgetView';
import IncomeView from './components/IncomeView';
import AccountsView from './components/AccountsView';
import SettingsView from './components/SettingsView';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');

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
        가족 가계부 및 자산관리 프로그램 P0 MVP v1.0 | PRD 및 엑셀 템플릿(2026 승주 기석 가계부) 100% 반영
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
