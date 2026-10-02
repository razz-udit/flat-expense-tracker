import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import ToastContainer from './components/ToastContainer';
import AddExpenseModal from './components/AddExpenseModal';
import UpiPayModal from './components/UpiPayModal';
import InstallAppModal from './components/InstallAppModal';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import SettlementsPage from './pages/SettlementsPage';
import MonthlyHistoryPage from './pages/MonthlyHistoryPage';
import RecurringPage from './pages/RecurringPage';
import SettingsPage from './pages/SettingsPage';

function AppContent() {
  const { currentUser, isLoadingMeta, isInstallModalOpen, closeInstallModal } = useApp();

  if (isLoadingMeta) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-3">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-300">Loading FlatMatePay...</p>
      </div>
    );
  }

  // When not logged in, the landing page is the login page with ID/password authentication
  if (!currentUser) {
    return (
      <>
        <LoginPage />
        <InstallAppModal isOpen={isInstallModalOpen} onClose={closeInstallModal} />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/settlements" element={<SettlementsPage />} />
          <Route path="/history" element={<MonthlyHistoryPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Modals & Notifications */}
      <AddExpenseModal />
      <UpiPayModal />
      <InstallAppModal isOpen={isInstallModalOpen} onClose={closeInstallModal} />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  );
}
