import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { 
  Building2, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Scale, 
  QrCode, 
  CheckCircle2, 
  PlusCircle, 
  Calendar,
  Receipt,
  ArrowRight,
  TrendingUp,
  Users,
  Check,
  SlidersHorizontal,
  Download,
  Smartphone
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { 
    members, 
    currentUser, 
    activeMemberId,
    openAddExpense, 
    openUpiModal, 
    addToast,
    promptInstall,
    isInstalled
  } = useApp();

  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expenseFilterTab, setExpenseFilterTab] = useState('user'); // 'user' | 'all'

  const fetchDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getDashboard({ viewer_id: currentUser?.id || activeMemberId });
      setDashboardData(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      addToast('Failed to load dashboard data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, activeMemberId, addToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleQuickMarkPaid = async (settlement) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await api.createPayment({
        from_member: settlement.from_member_id,
        to_member: settlement.to_member_id,
        amount: parseFloat(settlement.amount),
        payment_date: todayStr,
        status: 'Paid',
        notes: `Settlement from ${settlement.from_member_name} to ${settlement.to_member_name}`
      });
      addToast(`Payment of ₹${parseFloat(settlement.amount).toLocaleString('en-IN')} recorded as Paid!`, 'success');
      fetchDashboard();
    } catch (err) {
      console.error('Quick mark paid error:', err);
      addToast(err.message || 'Failed to record settlement', 'error');
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading && !dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-slate-500">Loading Flat Dashboard...</p>
      </div>
    );
  }

  const {
    current_month_name = 'Current Month',
    month_expenses_total = 0,
    viewer_paid = 0,
    viewer_share = 0,
    viewer_net_balance = 0,
    viewer_owes_to = [],
    viewer_receivable_from = [],
    balances = [],
    suggested_settlements = [],
    recent_expenses = [],
    category_breakdown = []
  } = dashboardData || {};

  const totalYouOwe = (viewer_owes_to || []).reduce(
    (sum, s) => sum + (parseFloat(s.amount) || 0),
    0
  );
  const totalOwedToYou = (viewer_receivable_from || []).reduce(
    (sum, s) => sum + (parseFloat(s.amount) || 0),
    0
  );
  const hasExpenses = recent_expenses.length > 0;

  // Filter expenses: "Your Expenses" vs "All Flat Expenses"
  const userExpenses = recent_expenses.filter((e) => {
    if (!currentUser) return true;
    const isPayer = e.paid_by === currentUser.id;
    const isInSplit = (e.splits || []).some((s) => s.member_id === currentUser.id);
    return isPayer || isInSplit;
  });

  const displayedExpenses = (currentUser && expenseFilterTab === 'user') ? userExpenses : recent_expenses;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner (Personalized or Landing Overview) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
            <Calendar className="w-4 h-4" />
            <span>{current_month_name} • {members.length} {members.length === 1 ? 'Flatmate' : 'Flatmates'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            {currentUser ? `Hello, ${currentUser.name}! 👋` : 'Flat Household Overview 🏠'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {currentUser 
              ? 'Your personal flat expense and settlement balance sheet'
              : 'Shared expenses, roommate balances, and automated settlements'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!currentUser ? (
            <Link
              to="/login"
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Log In to Your Profile →</span>
            </Link>
          ) : (
            <button
              onClick={() => openAddExpense()}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Add Expense</span>
            </button>
          )}
        </div>
      </div>

      {/* Install Mobile App Banner (if not installed) */}
      {!isInstalled && (
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-xs border border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-600/80 border border-indigo-400/30 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-900">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                  Install FlatMatePay App
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-[10px] font-extrabold uppercase tracking-wide">
                  Mobile Ready
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5 max-w-xl">
                Add FlatMatePay to your phone's home screen for fast 1-tap launch, full-screen view, and instant UPI settlements.
              </p>
            </div>
          </div>

          <button
            onClick={promptInstall}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-indigo-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Install App on Device</span>
          </button>
        </div>
      )}

      {/* Clean Zero-State Alert if no expenses exist yet */}
      {!hasExpenses && (
        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-md shadow-indigo-200">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="font-extrabold text-lg text-slate-900">Your Flat Manager is Ready!</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Currently no expenses have been recorded for your flat. Add your collective grocery, rent, WiFi, or maid bills to start tracking settlements automatically.
          </p>
          <button
            onClick={() => openAddExpense()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Record First Expense</span>
          </button>
        </div>
      )}

      {/* Primary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {currentUser ? (
          <>
            {/* 1. You Need to Pay */}
            <div
              className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden transition-all ${
                totalYouOwe > 0.01
                  ? 'bg-rose-50/70 border-rose-200'
                  : 'bg-emerald-50/60 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  You Need to Pay
                </span>
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    totalYouOwe > 0.01
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {totalYouOwe > 0.01 ? (
                    <ArrowDownLeft className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight ${
                  totalYouOwe > 0.01 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatCurrency(totalYouOwe)}
              </div>
              <div className="text-xs font-semibold mt-1">
                {totalYouOwe > 0.01 ? (
                  <span className="text-rose-800 font-bold">
                    Pending to {viewer_owes_to.length} {viewer_owes_to.length === 1 ? 'roommate' : 'roommates'}
                  </span>
                ) : (
                  <span className="text-emerald-800 font-medium">No pending dues! 🎉</span>
                )}
              </div>
            </div>

            {/* 2. Flatmates Owe You */}
            <div
              className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden transition-all ${
                totalOwedToYou > 0.01
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Flatmates Owe You
                </span>
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    totalOwedToYou > 0.01
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight ${
                  totalOwedToYou > 0.01 ? 'text-emerald-700' : 'text-slate-900'
                }`}
              >
                {formatCurrency(totalOwedToYou)}
              </div>
              <div className="text-xs font-semibold mt-1">
                {totalOwedToYou > 0.01 ? (
                  <span className="text-emerald-800 font-bold">
                    Receivable from {viewer_receivable_from.length} {viewer_receivable_from.length === 1 ? 'roommate' : 'roommates'}
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">All receivables collected</span>
                )}
              </div>
            </div>

            {/* 3. You Paid This Month */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  You Paid This Month
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {formatCurrency(viewer_paid)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Fronted for flat expenses
              </div>
            </div>

            {/* 4. Total Flat Expenses */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Flat Spending
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {formatCurrency(month_expenses_total)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Across {members.length} flatmates in {current_month_name}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Landing Mode Card 1: Total Flat Spending */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {current_month_name} Spending
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {formatCurrency(month_expenses_total)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Combined shared flat expenditures
              </div>
            </div>

            {/* Landing Mode Card 2: Average Per Person */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Per Person Average
                </span>
                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {formatCurrency(
                  members.length > 0 ? parseFloat(month_expenses_total) / members.length : 0
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Divided equally among {members.length} roommates
              </div>
            </div>

            {/* Landing Mode Card 3: Flat Members */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Flat Members
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {members.length} Roommates
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Active flat participants
              </div>
            </div>

            {/* Landing Mode Card 4: Settlements Needed */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Suggested Settlements
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {suggested_settlements.length} Transfers
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Minimized debt clearing transactions
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Center or Landing Login Prompt */}
      {currentUser ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Debts You Owe */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                <h2 className="font-bold text-sm text-slate-900">
                  You Need to Pay ({viewer_owes_to.length})
                </h2>
              </div>
              <Link to="/settlements" className="text-xs text-indigo-600 font-semibold hover:underline">
                Full Ledger →
              </Link>
            </div>

            {viewer_owes_to.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                <div className="text-xs font-bold text-slate-800">You don't owe anyone right now!</div>
                <p className="text-[11px] text-slate-500 mt-0.5">All your dues to flatmates are settled.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {viewer_owes_to.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-rose-50/40 border border-rose-100 hover:bg-rose-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800">
                        Pay <span className="font-bold text-indigo-700">{s.to_member_name}</span>
                      </div>
                      <div className="text-sm font-extrabold text-rose-700 mt-0.5">
                        {formatCurrency(s.amount)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() =>
                          openUpiModal({
                            fromMemberId: s.from_member_id,
                            fromMemberName: s.from_member_name,
                            toMemberId: s.to_member_id,
                            toMemberName: s.to_member_name,
                            toMemberUpi: s.to_member_upi,
                            amount: s.amount,
                            upiLink: s.upi_link,
                          })
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Pay UPI</span>
                      </button>
                      <button
                        onClick={() => handleQuickMarkPaid(s)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                        title="Mark Paid"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Debts Owed to You */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-sm text-slate-900">
                  People Who Owe You ({viewer_receivable_from.length})
                </h2>
              </div>
              <Link to="/settlements" className="text-xs text-indigo-600 font-semibold hover:underline">
                Full Ledger →
              </Link>
            </div>

            {viewer_receivable_from.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs font-bold text-slate-700">No one owes you right now</div>
                <p className="text-[11px] text-slate-500 mt-0.5">When you front flat bills, amounts owed will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {viewer_receivable_from.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/40 border border-emerald-100 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800">
                        <span className="font-bold text-emerald-800">{s.from_member_name}</span> owes you
                      </div>
                      <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                        {formatCurrency(s.amount)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleQuickMarkPaid(s)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Received</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold">
              <Users className="w-3.5 h-3.5" />
              <span>Roommate Personal Dashboards</span>
            </div>
            <h3 className="font-extrabold text-lg text-white">Log in to view your personal flat dues & settlements</h3>
            <p className="text-xs text-slate-300 max-w-xl">
              Each flatmate has their own personal dashboard. Select your profile to view what you owe, pay via UPI QR code, and track your expense splits.
            </p>
          </div>
          <Link
            to="/login"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all shrink-0 text-center"
          >
            Select Your Profile →
          </Link>
        </div>
      )}

      {/* Main Grid: Balances & Recent Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Expenses (Left 2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Flat Expenses</h2>
              <p className="text-xs text-slate-500">Expenditures recorded in the flat</p>
            </div>

            {/* Tab Filter if logged in */}
            {currentUser && (
              <div className="flex rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
                <button
                  onClick={() => setExpenseFilterTab('user')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    expenseFilterTab === 'user'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Your Activity ({userExpenses.length})
                </button>
                <button
                  onClick={() => setExpenseFilterTab('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    expenseFilterTab === 'all'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Flat ({recent_expenses.length})
                </button>
              </div>
            )}
          </div>

          {displayedExpenses.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-100">
              <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">No Expenses Recorded Here Yet</div>
              <p className="text-xs text-slate-500 mt-1 mb-3">Record a real expense to populate the feed.</p>
              <button
                onClick={() => openAddExpense()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                + Add Expense
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {displayedExpenses.slice(0, 6).map((exp) => {
                const userSplit = (exp.splits || []).find((s) => s.member_id === currentUser?.id);
                const isPayer = exp.paid_by === currentUser?.id;

                return (
                  <div
                    key={exp.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {exp.category?.name?.slice(0, 2).toUpperCase() || 'EX'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{exp.description}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-indigo-600">{exp.category?.name}</span>
                          <span>•</span>
                          <span>Paid by {isPayer ? <strong className="text-slate-800">You</strong> : exp.payer?.name}</span>
                          <span>•</span>
                          <span>{exp.expense_date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-slate-900">{formatCurrency(exp.amount)}</div>
                      {userSplit && (
                        <div className="text-[11px] text-indigo-600 font-semibold">
                          Your share: {formatCurrency(userSplit.amount)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Showing latest transactions</span>
            <Link to="/expenses" className="text-xs font-bold text-indigo-600 hover:underline">
              View All Expenses →
            </Link>
          </div>
        </div>

        {/* Right Column: Settlement Transfers & Spending by Category */}
        <div className="space-y-5">
          {/* Who Pays Whom / Settlement Transfers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Who Pays Whom</h2>
                <p className="text-xs text-slate-500">Debt clearing transactions</p>
              </div>
              <Link to="/settlements" className="text-xs font-semibold text-indigo-600 hover:underline">
                Full Ledger →
              </Link>
            </div>

            {suggested_settlements.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                <div className="text-xs font-bold text-slate-800">All Flat Dues are Settled! 🎉</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Every flatmate is even. No transfers needed.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {suggested_settlements.map((s, idx) => {
                  const isViewerPayer = currentUser && s.from_member_id === currentUser.id;
                  const isViewerReceiver = currentUser && s.to_member_id === currentUser.id;

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                        isViewerPayer
                          ? 'bg-rose-50/50 border-rose-200'
                          : isViewerReceiver
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-slate-50/80 border-slate-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-slate-800 truncate">
                            {isViewerPayer ? 'You' : s.from_member_name}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-bold text-indigo-700 truncate">
                            {isViewerReceiver ? 'You' : s.to_member_name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {isViewerPayer ? 'You owe' : isViewerReceiver ? 'Owes you' : 'Transfer'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-slate-900 text-xs">
                          {formatCurrency(s.amount)}
                        </span>
                        {isViewerPayer && (
                          <button
                            onClick={() =>
                              openUpiModal({
                                fromMemberId: s.from_member_id,
                                fromMemberName: s.from_member_name,
                                toMemberId: s.to_member_id,
                                toMemberName: s.to_member_name,
                                toMemberUpi: s.to_member_upi,
                                amount: s.amount,
                                upiLink: s.upi_link,
                              })
                            }
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer shadow-2xs"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Spending Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Spending by Category</h2>
                <p className="text-xs text-slate-500">Categories this month</p>
              </div>
              <Link to="/expenses" className="text-xs font-semibold text-indigo-600 hover:underline">
                Expenses →
              </Link>
            </div>

            {category_breakdown.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                <Receipt className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <div className="text-xs font-bold text-slate-700">No Category Spending Yet</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Dynamic categories will show here once added.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {category_breakdown.map((cat) => (
                  <div key={cat.category_id} className="text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-800 font-semibold">{cat.category_name}</span>
                      <span className="font-extrabold text-slate-900">{formatCurrency(cat.total_amount)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full"
                        style={{ width: `${Math.min(parseFloat(cat.percentage), 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
