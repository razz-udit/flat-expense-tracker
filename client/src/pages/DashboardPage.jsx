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
  Plus, 
  Calendar,
  Receipt,
  ArrowRight,
  TrendingUp,
  Users,
  Check,
  CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { 
    members, 
    currentUser, 
    activeMemberId,
    openAddExpense, 
    openUpiModal, 
    addToast
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
        <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-500">Loading Flat Ledger...</p>
      </div>
    );
  }

  const {
    current_month_name = 'Current Month',
    month_expenses_total = 0,
    viewer_paid = 0,
    viewer_owes_to = [],
    viewer_receivable_from = [],
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
  const netDifference = totalOwedToYou - totalYouOwe;
  const hasExpenses = recent_expenses.length > 0;

  // Filter expenses: "Your Activity" vs "All Flat"
  const userExpenses = recent_expenses.filter((e) => {
    if (!currentUser) return true;
    const isPayer = e.paid_by === currentUser.id;
    const isInSplit = (e.splits || []).some((s) => s.member_id === currentUser.id);
    return isPayer || isInSplit;
  });

  const displayedExpenses = (currentUser && expenseFilterTab === 'user') ? userExpenses : recent_expenses;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header / Greeting Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{current_month_name} • {members.length} {members.length === 1 ? 'Roommate' : 'Roommates'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            {currentUser ? `Welcome back, ${currentUser.name}` : 'Flat Overview'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {!currentUser ? (
            <Link
              to="/login"
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Log In with Google</span>
            </Link>
          ) : (
            <button
              onClick={() => openAddExpense()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Add Expense</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Net Balance Hero Widget */}
      {currentUser ? (
        <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-800 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Your Net Flat Balance
              </span>
              <div className="flex items-baseline gap-3">
                <span className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  netDifference > 0.01 
                    ? 'text-emerald-400' 
                    : netDifference < -0.01 
                    ? 'text-rose-400' 
                    : 'text-slate-200'
                }`}>
                  {netDifference > 0.01 ? `+${formatCurrency(netDifference)}` : formatCurrency(Math.abs(netDifference))}
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  {netDifference > 0.01 
                    ? 'you get back in total' 
                    : netDifference < -0.01 
                    ? 'you owe in total' 
                    : 'all debts are settled'}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-3 pt-1">
                <span>Owed to you: <strong className="text-emerald-300">{formatCurrency(totalOwedToYou)}</strong></span>
                <span>•</span>
                <span>You need to pay: <strong className="text-rose-300">{formatCurrency(totalYouOwe)}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => openAddExpense()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Expense</span>
              </button>
              <Link
                to="/settlements"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-slate-300" />
                <span>Settle Up</span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* 3 Metric Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Flat Spend */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>{current_month_name} Flat Spend</span>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(month_expenses_total)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Total expenditures across all roommates
          </div>
        </div>

        {/* Card 2: You Paid */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>{currentUser ? 'You Paid This Month' : 'Per Person Average'}</span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {currentUser 
              ? formatCurrency(viewer_paid) 
              : formatCurrency(members.length > 0 ? parseFloat(month_expenses_total) / members.length : 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {currentUser ? 'Fronted directly from your pocket' : `Split evenly across ${members.length} flatmates`}
          </div>
        </div>

        {/* Card 3: Roommates Sharing */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>Active Flatmates</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {members.length} Members
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Sharing rent, food, and flat bills
          </div>
        </div>
      </div>

      {/* Action Center: Dues you owe & Dues owed to you */}
      {currentUser && (viewer_owes_to.length > 0 || viewer_receivable_from.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Debts You Owe */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                <h2 className="font-bold text-sm text-slate-900">
                  You Need to Pay ({viewer_owes_to.length})
                </h2>
              </div>
              <Link to="/settlements" className="text-xs text-slate-600 font-semibold hover:text-slate-900 hover:underline">
                Settlements →
              </Link>
            </div>

            {viewer_owes_to.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                <div className="text-xs font-bold text-slate-800">You don't owe anyone right now</div>
                <p className="text-[11px] text-slate-500 mt-0.5">All your dues to flatmates are settled.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {viewer_owes_to.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">
                        Pay <strong className="text-slate-900">{s.to_member_name}</strong>
                      </div>
                      <div className="text-sm font-extrabold text-rose-600 mt-0.5">
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
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5 text-emerald-400" />
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
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-sm text-slate-900">
                  Flatmates Who Owe You ({viewer_receivable_from.length})
                </h2>
              </div>
              <Link to="/settlements" className="text-xs text-slate-600 font-semibold hover:text-slate-900 hover:underline">
                Settlements →
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
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">
                        <strong className="text-slate-900">{s.from_member_name}</strong> owes you
                      </div>
                      <div className="text-sm font-extrabold text-emerald-600 mt-0.5">
                        {formatCurrency(s.amount)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        to="/settlements"
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Recent Expenses & Who Pays Whom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Expenses (Left 2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Expenses</h2>
              <p className="text-xs text-slate-500">Shared expenditures recorded in the flat</p>
            </div>

            {/* Clean Segmented Tab Filter */}
            {currentUser && (
              <div className="flex rounded-xl bg-slate-100 p-1 self-start sm:self-auto border border-slate-200/60">
                <button
                  onClick={() => setExpenseFilterTab('user')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    expenseFilterTab === 'user'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Your Activity ({userExpenses.length})
                </button>
                <button
                  onClick={() => setExpenseFilterTab('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    expenseFilterTab === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
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
              <div className="text-sm font-bold text-slate-700">No Expenses Recorded Yet</div>
              <p className="text-xs text-slate-500 mt-1 mb-3">Add grocery, WiFi, or rent to start tracking.</p>
              <button
                onClick={() => openAddExpense()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
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
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200">
                        {exp.category?.name?.slice(0, 2).toUpperCase() || 'EX'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{exp.description}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">{exp.category?.name}</span>
                          <span>•</span>
                          <span>Paid by {isPayer ? <strong className="text-slate-900">You</strong> : exp.payer?.name}</span>
                          <span>•</span>
                          <span>{exp.expense_date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-slate-900">{formatCurrency(exp.amount)}</div>
                      {userSplit && (
                        <div className="text-[11px] text-slate-600 font-semibold">
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
            <span className="text-xs text-slate-400">Showing recent items</span>
            <Link to="/expenses" className="text-xs font-bold text-slate-900 hover:underline">
              View All Expenses →
            </Link>
          </div>
        </div>

        {/* Right Column: Suggested Transfers & Category Breakdown */}
        <div className="space-y-5">
          {/* Who Pays Whom / Settlement Transfers */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Who Pays Whom</h2>
                <p className="text-xs text-slate-500">Direct debt clearing</p>
              </div>
              <Link to="/settlements" className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline">
                Ledger →
              </Link>
            </div>

            {suggested_settlements.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                <div className="text-xs font-bold text-slate-800">All Settled Up! 🎉</div>
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
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-slate-900 truncate">
                            {isViewerPayer ? 'You' : s.from_member_name}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900 truncate">
                            {isViewerReceiver ? 'You' : s.to_member_name}
                          </span>
                        </div>
                        <div className="text-xs font-extrabold text-slate-900 mt-0.5">
                          {formatCurrency(s.amount)}
                        </div>
                      </div>

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
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] shrink-0"
                        >
                          Pay
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Spending by Category */}
          {category_breakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
              <h2 className="text-base font-bold text-slate-900">Spending Breakdown</h2>
              <div className="space-y-2.5">
                {category_breakdown.map((c) => (
                  <div key={c.category_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{c.category_name}</span>
                      <span className="font-bold text-slate-900">{formatCurrency(c.total_amount)} ({c.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-slate-800 h-1.5 rounded-full" 
                        style={{ width: `${Math.min(100, Math.max(5, parseFloat(c.percentage)))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
