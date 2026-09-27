import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { 
  CalendarClock, 
  ChevronRight, 
  Calendar, 
  PieChart, 
  Users, 
  Receipt, 
  ArrowLeft,
  CalendarRange,
  Building2
} from 'lucide-react';

export default function MonthlyHistoryPage() {
  const { addToast } = useApp();

  const [monthsList, setMonthsList] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null); // { year, month }
  const [monthDetail, setMonthDetail] = useState(null);
  const [isLoadingMonths, setIsLoadingMonths] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchMonths = useCallback(async () => {
    try {
      setIsLoadingMonths(true);
      const months = await api.getMonthlyHistory();
      setMonthsList(months);
      if (months.length > 0 && !selectedMonth) {
        // Automatically select the latest month
        setSelectedMonth({ year: months[0].year, month: months[0].month });
      }
    } catch (err) {
      console.error('Error fetching monthly history:', err);
      addToast('Failed to load monthly history', 'error');
    } finally {
      setIsLoadingMonths(false);
    }
  }, [selectedMonth, addToast]);

  useEffect(() => {
    fetchMonths();
  }, [fetchMonths]);

  // Fetch month detail whenever selectedMonth changes
  useEffect(() => {
    if (!selectedMonth) return;
    const fetchDetail = async () => {
      try {
        setIsLoadingDetail(true);
        const data = await api.getMonthlySummary(selectedMonth.year, selectedMonth.month);
        setMonthDetail(data);
      } catch (err) {
        console.error('Error loading month detail:', err);
        addToast('Failed to load monthly summary details', 'error');
      } finally {
        setIsLoadingDetail(false);
      }
    };
    fetchDetail();
  }, [selectedMonth, addToast]);

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-slate-500">Loading historical records...</p>
        </div>
      ) : monthsList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
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
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
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
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100 scale-[1.01]'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm">{m.month_name}</div>
                      <div className={`text-xs mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                        {m.expense_count} expenses recorded
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-extrabold text-sm">{formatCurrency(m.total_amount)}</div>
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
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-slate-500">Loading breakdown for selected month...</p>
              </div>
            ) : monthDetail ? (
              <>
                {/* Month Summary Card */}
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold text-indigo-300 tracking-wider">
                      Month Overview
                    </span>
                    <h2 className="text-2xl font-black mt-1">{monthDetail.month_name}</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      {monthDetail.expense_count} total shared transactions
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs uppercase font-bold text-slate-400">Total Spent</span>
                    <div className="text-3xl font-black text-emerald-400 mt-1">
                      {formatCurrency(monthDetail.total_amount)}
                    </div>
                  </div>
                </div>

                {/* Category Spending Breakdown */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Category Breakdown</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {monthDetail.categories.map((c) => (
                      <div
                        key={c.category_id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{c.category_name}</span>
                          <span className="font-extrabold text-slate-900">{formatCurrency(c.total_amount)}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-1.5 rounded-full"
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
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Who Paid (Out of Pocket)
                    </h3>
                    <div className="space-y-2">
                      {monthDetail.contributions.map((m) => (
                        <div
                          key={m.member_id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs"
                        >
                          <span className="font-semibold text-slate-800">{m.member_name}</span>
                          <span className="font-bold text-slate-900">
                            {formatCurrency(m.amount_paid)}{' '}
                            <span className="text-slate-400 font-normal">({m.percentage}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shares (Who Owed) */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Member Shares (Consumption)
                    </h3>
                    <div className="space-y-2">
                      {monthDetail.shares.map((m) => (
                        <div
                          key={m.member_id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs"
                        >
                          <span className="font-semibold text-slate-800">{m.member_name}</span>
                          <span className="font-bold text-slate-900">
                            {formatCurrency(m.amount_owed)}{' '}
                            <span className="text-slate-400 font-normal">({m.percentage}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Month Expenses List */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-indigo-600" />
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
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
                                <span className="text-violet-600 font-medium">
                                  Billing: {exp.billing_period_start} to {exp.billing_period_end || 'ongoing'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-extrabold text-sm text-slate-900">
                            {formatCurrency(exp.amount)}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            Split by {exp.splits?.length || 0} members
                          </div>
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
    </div>
  );
}
