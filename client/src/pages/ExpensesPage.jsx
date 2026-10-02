import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { 
  Receipt, 
  Search, 
  Filter, 
  PlusCircle, 
  Trash2, 
  Edit3, 
  CalendarRange, 
  Users, 
  ChevronDown, 
  ChevronUp,
  Lock
} from 'lucide-react';

export default function ExpensesPage() {
  const { members, categories, currentUser, openAddExpense, addToast } = useApp();

  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPaidBy, setSelectedPaidBy] = useState('');
  const [selectedMemberInSplit, setSelectedMemberInSplit] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expanded expense for split details view
  const [expandedExpenseId, setExpandedExpenseId] = useState(null);

  // Delete modal state
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (selectedCategory) params.category_id = selectedCategory;
      if (selectedPaidBy) params.paid_by = selectedPaidBy;
      if (selectedMemberInSplit) params.member_id = selectedMemberInSplit;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const data = await api.getExpenses(params);
      setExpenses(data);
    } catch (err) {
      console.error('Error fetching expenses:', err);
      addToast('Failed to load expenses', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory, selectedPaidBy, selectedMemberInSplit, startDate, endDate, addToast]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedPaidBy('');
    setSelectedMemberInSplit('');
    setStartDate('');
    setEndDate('');
  };

  const isDefaultAdmin = currentUser && members.length > 0 && currentUser.id === members[0].id;

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    const canDelete = currentUser && (expenseToDelete.paid_by === currentUser.id || isDefaultAdmin);
    if (!canDelete) {
      addToast('Permission denied: Only the flatmate who paid for this expense or flat admin can delete it.', 'error');
      setExpenseToDelete(null);
      return;
    }
    try {
      setIsDeleting(true);
      await api.deleteExpense(expenseToDelete.id, currentUser?.id);
      addToast('Expense deleted successfully. Balances recalculated.', 'success');
      setExpenseToDelete(null);
      fetchExpenses();
    } catch (err) {
      console.error('Delete error:', err);
      addToast(err.message || 'Failed to delete expense', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const totalFilteredAmount = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Expenses Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track, filter, edit, and audit all flat expenditures
          </p>
        </div>

        <button
          onClick={() => openAddExpense()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add Expense</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>Filters & Search</span>
          </div>
          {(search || selectedCategory || selectedPaidBy || selectedMemberInSplit || startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            />
          </div>

          {/* Category */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Paid By */}
          <div>
            <select
              value={selectedPaidBy}
              onChange={(e) => setSelectedPaidBy(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
            >
              <option value="">Paid By: Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* In Split */}
          <div>
            <select
              value={selectedMemberInSplit}
              onChange={(e) => setSelectedMemberInSplit(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
            >
              <option value="">Participant: Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date range start */}
          <div>
            <input
              type="date"
              placeholder="From Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-1 text-xs rounded-xl border border-slate-300 bg-white text-slate-700"
            />
          </div>
        </div>

        {/* Filter Summary Stats */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span>
            Showing <span className="font-bold text-slate-800">{expenses.length}</span> expenses
          </span>
          <span>
            Total: <span className="font-extrabold text-indigo-700">{formatCurrency(totalFilteredAmount)}</span>
          </span>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-slate-500">Loading expense records...</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">No Expenses Match Your Criteria</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search filters or add a new collective expense.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Paid By</th>
                  <th className="py-3 px-4 text-center">Split</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((exp) => {
                  const isExpanded = expandedExpenseId === exp.id;
                  const isPayer = currentUser && exp.paid_by === currentUser.id;
                  const canModify = isPayer || isDefaultAdmin;
                  return (
                    <React.Fragment key={exp.id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        {/* Date */}
                        <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                          {exp.expense_date}
                        </td>

                        {/* Category */}
                        <td className="py-3 px-4">
                          <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 whitespace-nowrap">
                            {exp.category?.name || 'Category'}
                          </span>
                        </td>

                        {/* Description & Billing period */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-slate-900 truncate">{exp.description}</div>
                          {exp.billing_period_start && (
                            <div className="flex items-center gap-1 text-[11px] text-violet-700 font-medium mt-0.5">
                              <CalendarRange className="w-3 h-3" />
                              <span>
                                {exp.billing_period_start} → {exp.billing_period_end || 'ongoing'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm whitespace-nowrap">
                          {formatCurrency(exp.amount)}
                        </td>

                        {/* Paid By */}
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {exp.payer?.name || `Member ${exp.paid_by}`}
                          {isPayer && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                              You
                            </span>
                          )}
                        </td>

                        {/* Split Count & Type */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => setExpandedExpenseId(isExpanded ? null : exp.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            <Users className="w-3 h-3 text-indigo-600" />
                            <span>{exp.splits?.length || 0} members</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {canModify ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openAddExpense(exp)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="Edit Expense"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setExpenseToDelete(exp)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Expense"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div
                              className="flex items-center justify-end"
                              title={`Locked: Recorded by ${exp.payer?.name || `Member ${exp.paid_by}`}. Only they or Flat Admin can modify.`}
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400 text-[11px] font-semibold border border-slate-200/60 cursor-not-allowed">
                                <Lock className="w-3 h-3 text-slate-400" />
                                <span>Locked</span>
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Split Details Sub-row */}
                      {isExpanded && (
                        <tr className="bg-indigo-50/40 border-y border-indigo-100">
                          <td colSpan={7} className="p-4">
                            <div className="max-w-2xl mx-auto space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-indigo-900 border-b border-indigo-100 pb-1.5">
                                <span>Split Details ({exp.split_type === 'equal' ? 'Equal Split' : 'Custom Split'})</span>
                                <span>Expense Total: {formatCurrency(exp.amount)}</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {(exp.splits || []).map((s) => (
                                  <div
                                    key={s.id}
                                    className="p-2 rounded-lg bg-white border border-indigo-100 flex items-center justify-between text-xs shadow-xs"
                                  >
                                    <span className="font-semibold text-slate-800">
                                      {s.member?.name || `Member ${s.member_id}`}
                                    </span>
                                    <span className="font-bold text-indigo-700">{formatCurrency(s.amount)}</span>
                                  </div>
                                ))}
                              </div>
                              {exp.notes && (
                                <p className="text-[11px] text-slate-600 italic mt-1">Note: {exp.notes}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Delete Expense?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-bold">"{expenseToDelete.description}"</span> (
              {formatCurrency(expenseToDelete.amount)}) paid by <span className="font-semibold text-slate-900">{expenseToDelete.payer?.name || `Member ${expenseToDelete.paid_by}`}</span>? This will remove all associated member splits and
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
