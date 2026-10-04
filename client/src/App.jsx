import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import ToastContainer from './components/ToastContainer';
import AddExpenseModal from './components/AddExpenseModal';
import UpiPayModal from './components/UpiPayModal';
import InstallAppModal from './components/InstallAppModal';

// Fast route-level code splitting
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const SettlementsPage = lazy(() => import('./pages/SettlementsPage'));
const MonthlyHistoryPage = lazy(() => import('./pages/MonthlyHistoryPage'));
const RecurringPage = lazy(() => import('./pages/RecurringPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 bg-white border border-slate-200/70 rounded-2xl p-5 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-44 bg-slate-200 rounded-md"></div>
          <div className="h-3 w-64 bg-slate-100 rounded-md"></div>
        </div>
        <div className="h-9 w-24 bg-slate-200 rounded-xl"></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-28 bg-white border border-slate-200/70 rounded-2xl"></div>
        <div className="h-28 bg-white border border-slate-200/70 rounded-2xl"></div>
        <div className="h-28 bg-white border border-slate-200/70 rounded-2xl"></div>
      </div>
      <div className="h-72 bg-white border border-slate-200/70 rounded-2xl"></div>
    </div>
  );
}

function AppContent() {
  const { currentUser, isLoadingMeta, isInstallModalOpen, closeInstallModal } = useApp();

  if (isLoadingMeta) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-3">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-300 tracking-wide">Starting FlatMatePay...</p>
      </div>
    );
  }

  // When not logged in, the landing page is the login page with ID/password authentication
  if (!currentUser) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <LoginPage />
        <InstallAppModal isOpen={isInstallModalOpen} onClose={closeInstallModal} />
        <ToastContainer />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/settlements" element={<SettlementsPage />} />
            <Route path="/history" element={<MonthlyHistoryPage />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
