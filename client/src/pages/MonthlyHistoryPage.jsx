import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { 
  CalendarClock, 
  ChevronRight, 
  PieChart, 
  Receipt,
  Trash2,
  Edit3
} from 'lucide-react';

export default function MonthlyHistoryPage() {
  const { addToast, openAddExpense, currentUser, members, refreshMeta } = useApp();

  const [monthsList, setMonthsList] = useState(() => {
    try {
      const cached = sessionStorage.getItem('flat_months_history');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (monthsList.length > 0) {
      return { year: monthsList[0].year, month: monthsList[0].month };
    }
    return null;
  });

  const [monthDetail, setMonthDetail] = useState(() => {
    try {
      if (monthsList.length > 0) {
        const cached = sessionStorage.getItem(`flat_month_detail_${monthsList[0].year}_${monthsList[0].month}`);
        if (cached) return JSON.parse(cached);
      }
      return null;
    } catch {
      return null;
    }
  });

  const [isLoadingMonths, setIsLoadingMonths] = useState(() => monthsList.length === 0);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMonths = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoadingMonths(true);
      const months = await api.getMonthlyHistory();
      setMonthsList(months);
      setSelectedMonth((prev) => prev || (months.length > 0 ? { year: months[0].year, month: months[0].month } : null));

      try {
        sessionStorage.setItem('flat_months_history', JSON.stringify(months));
      } catch (_) {}
    } catch (err) {
      console.error('Error fetching monthly history:', err);
      addToast('Failed to load monthly history', 'error');
    } finally {
      setIsLoadingMonths(false);
    }
  }, [addToast]);

  useEffect(() => {
    const hasCache = monthsList.length > 0;
    fetchMonths(hasCache);
  }, [fetchMonths]);

  // Fetch month detail whenever selectedMonth changes
  useEffect(() => {
    if (!selectedMonth) return;
    const fetchDetail = async () => {
      const cacheKey = `flat_month_detail_${selectedMonth.year}_${selectedMonth.month}`;
      let hadCachedDetail = false;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setMonthDetail(JSON.parse(cached));
          hadCachedDetail = true;
        }
      } catch (_) {}

      try {
        if (!hadCachedDetail) setIsLoadingDetail(true);
        const data = await api.getMonthlySummary(selectedMonth.year, selectedMonth.month);
        setMonthDetail(data);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {}
      } catch (err) {
        console.error('Error loading month detail:', err);
        addToast('Failed to load monthly summary details', 'error');
      } finally {
        setIsLoadingDetail(false);
      }
    };
    fetchDetail();
  }, [selectedMonth?.year, selectedMonth?.month, addToast]);

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    try {
      setIsDeleting(true);
      await api.deleteExpense(expenseToDelete.id, currentUser?.id);
      addToast('Historical expense deleted successfully! Balances recalculated.', 'success');
      setExpenseToDelete(null);
      fetchMonths();
      if (selectedMonth) {
        const data = await api.getMonthlySummary(selectedMonth.year, selectedMonth.month);
        setMonthDetail(data);
      }
      if (refreshMeta) refreshMeta();
    } catch (err) {
      console.error('Delete expense error:', err);
      addToast(err.message || 'Failed to delete expense', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Monthly Expense History</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Archive and category breakdown for every month
        </p>
      </div>

      {isLoadingMonths ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
          <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-slate-500 font-medium">Loading historical records...</p>
        </div>
      ) : monthsList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Monthly Records Yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Expenses added in the application will automatically appear in this historical archive.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Months Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              Recorded Months ({monthsList.length})
            </h2>

            <div className="space-y-2">
              {monthsList.map((m) => {
                const isSelected = selectedMonth?.year === m.year && selectedMonth?.month === m.month;
                return (
                  <button
                    key={`${m.year}-${m.month}`}
                    onClick={() => setSelectedMonth({ year: m.year, month: m.month })}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : 'bg-white border-slate-200/80 text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-extrabold text-sm">{m.month_name}</div>
                      <div className={`text-xs mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {m.expense_count} expenses recorded
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-sm tabular-nums">{formatCurrency(m.total_amount)}</div>
                      <ChevronRight
                        className={`w-4 h-4 ml-auto mt-1 ${isSelected ? 'text-white' : 'text-slate-400'}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Month Detail View (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {isLoadingDetail ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
                <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-slate-500 font-medium">Loading breakdown for selected month...</p>
              </div>
            ) : monthDetail ? (
              <>
                {/* Month Summary Card */}
                <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm flex items-center justify-between border border-slate-800">
                  <div>
                    <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                      Month Overview
                    </span>
                    <h2 className="text-2xl font-black mt-1 text-white">{monthDetail.month_name}</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      {monthDetail.expense_count} total shared transactions
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs uppercase font-bold text-slate-400">Total Spent</span>
                    <div className="text-3xl font-black text-emerald-400 mt-1 tabular-nums">
                      {formatCurrency(monthDetail.total_amount)}
                    </div>
                  </div>
                </div>

                {/* Category Spending Breakdown */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-900">Category Breakdown</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {monthDetail.categories.map((c) => (
                      <div
                        key={c.category_id}
                        className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{c.category_name}</span>
                          <span className="font-black text-slate-900 tabular-nums">{formatCurrency(c.total_amount)}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(parseFloat(c.percentage), 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{c.expense_count} bills</span>
                          <span>{c.percentage}% of month</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Member Contributions & Shares */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Contributions (Who Paid) */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Who Paid (Out of Pocket)
                    </h3>
                    <div className="space-y-2">
                      {monthDetail.contributions.map((m) => (
                        <div
                          key={m.member_id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 text-xs"
                        >
                          <span className="font-semibold text-slate-800">{m.member_name}</span>
                          <span className="font-bold text-slate-900 tabular-nums">
                            {formatCurrency(m.amount_paid)}{' '}
                            <span className="text-slate-400 font-normal">({m.percentage}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shares (Who Owed) */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Member Shares (Consumption)
                    </h3>
                    <div className="space-y-2">
                      {monthDetail.shares.map((m) => (
                        <div
                          key={m.member_id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 text-xs"
                        >
                          <span className="font-semibold text-slate-800">{m.member_name}</span>
                          <span className="font-bold text-slate-900 tabular-nums">
                            {formatCurrency(m.amount_owed)}{' '}
                            <span className="text-slate-400 font-normal">({m.percentage}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Month Expenses List */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-slate-500" />
                      <h3 className="text-sm font-bold text-slate-900">Expenses for {monthDetail.month_name}</h3>
                    </div>
                    <span className="text-xs text-slate-500 font-semibold">
                      {monthDetail.expenses.length} Records
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {monthDetail.expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200/60">
                              {exp.category?.name}
                            </span>
                            <span className="font-bold text-xs text-slate-900">{exp.description}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>Paid by {exp.payer?.name}</span>
                            <span>•</span>
                            <span>{exp.expense_date}</span>
                            {exp.billing_period_start && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-medium">
                                  Billing: {exp.billing_period_start} to {exp.billing_period_end || 'ongoing'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="font-black text-sm text-slate-900 tabular-nums">
                              {formatCurrency(exp.amount)}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium">
                              Split by {exp.splits?.length || 0} members
                            </div>
                          </div>

                          {currentUser && (
                            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                              <button
                                type="button"
                                onClick={() => openAddExpense(exp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit Expense"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setExpenseToDelete(exp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Expense"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Delete Historical Expense?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-bold">"{expenseToDelete.description}"</span> (
              {formatCurrency(expenseToDelete.amount)}) from {monthDetail?.month_name}? This will remove all associated member splits and
              automatically recalculate the balances for all flat members.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setExpenseToDelete(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteExpense}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
