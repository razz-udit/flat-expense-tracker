import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api, getReceiptFullUrl } from '../services/api';
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
  Lock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Banknote,
  QrCode,
  Image,
  Eye,
  Check,
  Flag,
  X,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

export default function ExpensesPage() {
  const { members, categories, currentUser, openAddExpense, addToast, refreshMeta } = useApp();

  const hasFilters = Boolean(search.trim() || selectedCategory || selectedPaidBy || selectedMemberInSplit || selectedPaymentMethod || selectedVerificationStatus || startDate || endDate);

  const [expenses, setExpenses] = useState(() => {
    try {
      const cached = sessionStorage.getItem('flat_expenses_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => expenses.length === 0);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPaidBy, setSelectedPaidBy] = useState('');
  const [selectedMemberInSplit, setSelectedMemberInSplit] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedVerificationStatus, setSelectedVerificationStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expanded expense for split details view
  const [expandedExpenseId, setExpandedExpenseId] = useState(null);

  // Delete modal state
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Receipt preview modal state
  const [receiptModalUrl, setReceiptModalUrl] = useState(null);

  // Dispute modal state
  const [disputeModalExpense, setDisputeModalExpense] = useState(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);

  const fetchExpenses = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (selectedCategory) params.category_id = selectedCategory;
      if (selectedPaidBy) params.paid_by = selectedPaidBy;
      if (selectedMemberInSplit) params.member_id = selectedMemberInSplit;
      if (selectedPaymentMethod) params.payment_method = selectedPaymentMethod;
      if (selectedVerificationStatus) params.verification_status = selectedVerificationStatus;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const data = await api.getExpenses(params);
      setExpenses(data);

      if (!hasFilters) {
        try {
          sessionStorage.setItem('flat_expenses_cache', JSON.stringify(data));
        } catch (_) {}
      }
    } catch (err) {
      console.error('Error fetching expenses:', err);
      addToast('Failed to load expenses', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory, selectedPaidBy, selectedMemberInSplit, selectedPaymentMethod, selectedVerificationStatus, startDate, endDate, hasFilters, addToast]);

  useEffect(() => {
    const canBeSilent = expenses.length > 0 && !hasFilters;
    fetchExpenses(canBeSilent);
  }, [fetchExpenses]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedPaidBy('');
    setSelectedMemberInSplit('');
    setSelectedPaymentMethod('');
    setSelectedVerificationStatus('');
    setStartDate('');
    setEndDate('');
  };

  const handleConfirmExpense = async (exp) => {
    try {
      setIsSubmittingEvaluation(true);
      await api.evaluateExpense(exp.id, 'confirm', '', currentUser?.id);
      addToast(`Expense verified & confirmed! ✓`, 'success');
      fetchExpenses();
      if (refreshMeta) refreshMeta();
    } catch (err) {
      console.error('Confirmation error:', err);
      addToast(err.message || 'Failed to confirm expense', 'error');
    } finally {
      setIsSubmittingEvaluation(false);
    }
  };

  const handleDisputeExpense = async (e) => {
    e.preventDefault();
    if (!disputeModalExpense) return;
    try {
      setIsSubmittingEvaluation(true);
      const reason = disputeReason.trim() || 'Suspected false expense claim';
      await api.disputeExpense(disputeModalExpense.id, reason);
      addToast('Expense flagged as disputed for roommates review.', 'info');
      setDisputeModalExpense(null);
      setDisputeReason('');
      fetchExpenses();
      if (refreshMeta) refreshMeta();
    } catch (err) {
      console.error('Dispute error:', err);
      addToast(err.message || 'Failed to dispute expense', 'error');
    } finally {
      setIsSubmittingEvaluation(false);
    }
  };

  const handleResolveDispute = async (exp, action) => {
    try {
      setIsSubmittingEvaluation(true);
      if (action === 'cancel') {
        await api.resolveDispute(exp.id, 'cancel', 'Dispute upheld: expense deleted');
        addToast('Dispute resolved: expense removed.', 'info');
      } else {
        await api.resolveDispute(exp.id, 'confirm', 'Dispute cleared: expense verified');
        addToast('Dispute resolved: expense confirmed! ✓', 'success');
      }
      fetchExpenses();
      if (refreshMeta) refreshMeta();
    } catch (err) {
      console.error('Resolve dispute error:', err);
      addToast(err.message || 'Failed to resolve dispute', 'error');
    } finally {
      setIsSubmittingEvaluation(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    try {
      setIsDeleting(true);
      await api.deleteExpense(expenseToDelete.id, currentUser?.id);
      addToast('Expense deleted successfully. Balances recalculated.', 'success');
      setExpenseToDelete(null);
      fetchExpenses();
      if (refreshMeta) refreshMeta();
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

  const getConfirmedMemberNames = (confirmedByStr) => {
    if (!confirmedByStr) return [];
    const ids = confirmedByStr.split(',').map((x) => x.trim()).filter((x) => x && !isNaN(x)).map(Number);
    return ids.map((id) => {
      const m = members.find((mem) => mem.id === id);
      return m ? m.name : `Member ${id}`;
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Expenses Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track, filter, audit proof, and verify roommate expense claims in real-time
          </p>
        </div>

        <button
          onClick={() => openAddExpense()}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Add Expense</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-slate-500" />
            <span>Filters & Search</span>
          </div>
          {(search || selectedCategory || selectedPaidBy || selectedMemberInSplit || selectedPaymentMethod || selectedVerificationStatus || startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-slate-500 hover:text-slate-900 font-semibold cursor-pointer underline underline-offset-2"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {/* Search */}
          <div className="relative xl:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white text-slate-800 transition-colors"
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
              className="w-full px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white text-slate-800 transition-colors"
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
              className="w-full px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white text-slate-800 transition-colors"
            >
              <option value="">Participant: Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white text-slate-800 transition-colors"
            >
              <option value="">Payment: All</option>
              <option value="UPI">Online / UPI</option>
              <option value="Cash">Paid by Cash</option>
            </select>
          </div>

          {/* Verification Status */}
          <div>
            <select
              value={selectedVerificationStatus}
              onChange={(e) => setSelectedVerificationStatus(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white text-slate-800 transition-colors"
            >
              <option value="">Status: All</option>
              <option value="Confirmed">✓ Confirmed</option>
              <option value="Pending Confirmation">⏳ Pending</option>
              <option value="Disputed / Flagged">⚠️ Disputed</option>
            </select>
          </div>

          {/* Date range start */}
          <div>
            <input
              type="date"
              placeholder="From Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-slate-50/50 hover:bg-white text-slate-700 transition-colors"
            />
          </div>
        </div>

        {/* Filter Summary Stats */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span>
            Showing <span className="font-bold text-slate-900">{expenses.length}</span> expenses
          </span>
          <span>
            Total: <span className="font-black text-slate-900 tabular-nums text-sm">{formatCurrency(totalFilteredAmount)}</span>
          </span>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-slate-500 font-medium">Loading expense records...</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-800">No Expenses Match Your Criteria</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search filters or add a new collective expense.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Description & Mode</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4">Paid By & Status</th>
                  <th className="py-3.5 px-4 text-center">Split</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((exp) => {
                  const isExpanded = expandedExpenseId === exp.id;
                  const isPayer = Boolean(currentUser && exp.paid_by === currentUser.id);
                  const isDefaultAdmin = Boolean(currentUser?.is_admin);
                  const canModify = Boolean(currentUser && (isPayer || isDefaultAdmin));

                  const isConfirmed = exp.verification_status === 'Confirmed';
                  const isDisputed = exp.verification_status === 'Disputed / Flagged';
                  const isPending = !isConfirmed && !isDisputed;

                  const confirmedIds = (exp.confirmed_by || '').split(',').map((s) => s.trim()).filter(Boolean);
                  const hasUserConfirmed = Boolean(currentUser && confirmedIds.includes(String(currentUser.id)));
                  const confirmedNames = getConfirmedMemberNames(exp.confirmed_by);

                  return (
                    <React.Fragment key={exp.id}>
                      <tr className={`hover:bg-slate-50/70 transition-colors ${isDisputed ? 'bg-rose-50/30' : ''}`}>
                        {/* Date */}
                        <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                          {exp.expense_date}
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-4">
                          <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200/60 whitespace-nowrap">
                            {exp.category?.name || 'Category'}
                          </span>
                        </td>

                        {/* Description & Payment Mode & Proof */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-bold text-slate-900 truncate">{exp.description}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {/* Payment Mode Tag */}
                            {exp.payment_method === 'Cash' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Banknote className="w-3 h-3 text-amber-600" />
                                <span>Cash</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                <QrCode className="w-3 h-3 text-emerald-600" />
                                <span>UPI</span>
                              </span>
                            )}

                            {/* Attached Screenshot Button */}
                            {exp.receipt_url && (
                              <button
                                type="button"
                                onClick={() => setReceiptModalUrl(getReceiptFullUrl(exp.receipt_url))}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                                title="Click to view payment proof / screenshot"
                              >
                                <Eye className="w-3 h-3 text-emerald-600" />
                                <span>Proof</span>
                              </button>
                            )}

                            {/* Billing Period */}
                            {exp.billing_period_start && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                <CalendarRange className="w-3 h-3 text-slate-400" />
                                <span>{exp.billing_period_start} → {exp.billing_period_end || 'ongoing'}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm whitespace-nowrap tabular-nums">
                          {formatCurrency(exp.amount)}
                        </td>

                        {/* Paid By & Verification Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">
                              {exp.payer?.name || `Member ${exp.paid_by}`}
                            </span>
                            {isPayer && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                You
                              </span>
                            )}
                          </div>

                          {/* Verification Pill */}
                          <div className="mt-1">
                            {isConfirmed ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                title={confirmedNames.length > 0 ? `Confirmed by: ${confirmedNames.join(', ')}` : 'Confirmed by roommates'}
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Confirmed</span>
                              </span>
                            ) : isDisputed ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                title="Flagged or disputed by a roommate"
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>Disputed</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                title={exp.payment_method === 'Cash' ? 'Pending roommate cash confirmation' : 'Awaiting confirmation'}
                              >
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Pending</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Split Count & Type */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => setExpandedExpenseId(isExpanded ? null : exp.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            <Users className="w-3 h-3 text-slate-500" />
                            <span>{exp.splits?.length || 0} members</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>

                        {/* Actions & Roommate Evaluation */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Roommate Evaluation Controls (for non-payers) */}
                            {currentUser && !isPayer && (
                              <>
                                {hasUserConfirmed ? (
                                  <div className="flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                                      <Check className="w-3 h-3" /> Verified
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDisputeModalExpense(exp);
                                        setDisputeReason('');
                                      }}
                                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Dispute or flag this claim"
                                    >
                                      <Flag className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={isSubmittingEvaluation}
                                      onClick={() => handleConfirmExpense(exp)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                                      title={exp.payment_method === 'Cash' ? 'Confirm you received this cash / expense is legitimate' : 'Confirm this expense is genuine'}
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Confirm</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSubmittingEvaluation}
                                      onClick={() => {
                                        setDisputeModalExpense(exp);
                                        setDisputeReason('');
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                                      title="Dispute or flag as false expense"
                                    >
                                      <Flag className="w-3 h-3" />
                                      <span>Dispute</span>
                                    </button>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Payer or Admin Edit/Delete */}
                            {canModify ? (
                              <div className="flex items-center gap-1 ml-1 border-l border-slate-200 pl-1.5">
                                <button
                                  onClick={() => openAddExpense(exp)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Edit Expense"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setExpenseToDelete(exp)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Delete Expense"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : !currentUser ? null : isPayer ? null : null}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Split Details Sub-row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-y border-slate-200/80">
                          <td colSpan={7} className="p-4">
                            <div className="max-w-3xl mx-auto space-y-3">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-900 border-b border-slate-200/60 pb-1.5">
                                <span>Split Details ({exp.split_type === 'equal' ? 'Equal Split' : exp.split_type === 'percentage' ? 'Percentage Split' : exp.split_type === 'shares' ? 'Shares Split' : 'Exact Amount Split'})</span>
                                <span className="tabular-nums">Expense Total: {formatCurrency(exp.amount)}</span>
                              </div>

                              {/* Disputed Alert Banner if Flagged */}
                              {isDisputed && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                  <div className="space-y-1.5 flex-1">
                                    <span className="font-bold">Roommate Dispute Notice:</span>
                                    <p className="text-rose-700 whitespace-pre-line leading-relaxed">
                                      {exp.dispute_reason
                                        ? `Dispute reason: "${exp.dispute_reason}"`
                                        : 'This expense was flagged by a flatmate as potentially false or incorrect. Roommates can review the screenshot proof and adjust if necessary.'}
                                    </p>
                                    {(isPayer || isDefaultAdmin) && (
                                      <div className="flex items-center gap-2 pt-1.5">
                                        <button
                                          type="button"
                                          disabled={isSubmittingEvaluation}
                                          onClick={() => handleResolveDispute(exp, 'confirm')}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs cursor-pointer disabled:opacity-50"
                                        >
                                          Confirm &amp; Resolve
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isSubmittingEvaluation}
                                          onClick={() => handleResolveDispute(exp, 'cancel')}
                                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] shadow-xs cursor-pointer disabled:opacity-50"
                                        >
                                          Delete Disputed Expense
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Split Member Breakdown */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {(exp.splits || []).map((s) => (
                                  <div
                                    key={s.id}
                                    className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between text-xs shadow-2xs"
                                  >
                                    <span className="font-semibold text-slate-800 truncate">
                                      {s.member?.name || `Member ${s.member_id}`}
                                    </span>
                                    <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(s.amount)}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Proof Thumbnail & Verifiers */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60 text-xs">
                                {exp.receipt_url ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setReceiptModalUrl(getReceiptFullUrl(exp.receipt_url, exp.id))}
                                      className="flex items-center gap-2 p-1.5 rounded-xl border border-slate-200 hover:border-slate-400 bg-white cursor-pointer group transition-all"
                                    >
                                      {exp.receipt_url.toLowerCase().endsWith('.pdf') ? (
                                        <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-black text-xs">
                                          PDF
                                        </div>
                                      ) : (
                                        <img
                                          src={getReceiptFullUrl(exp.receipt_url, exp.id)}
                                          alt="Receipt Proof"
                                          className="w-10 h-10 object-cover rounded-lg border border-slate-100"
                                        />
                                      )}
                                      <div className="text-left pr-2">
                                        <div className="text-[11px] font-bold text-slate-800 group-hover:text-emerald-700 flex items-center gap-1">
                                          <Eye className="w-3 h-3" /> View Full Proof Document
                                        </div>
                                        <div className="text-[10px] text-slate-500">Payment receipt verified</div>
                                      </div>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400 italic">
                                    No receipt screenshot attached.
                                  </div>
                                )}

                                {confirmedNames.length > 0 && (
                                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                    <span>Verified by: <strong>{confirmedNames.join(', ')}</strong></span>
                                  </div>
                                )}
                              </div>

                              {/* Notes */}
                              {exp.notes && (
                                <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                                  <span className="font-bold text-slate-700">Notes / Audit Log:</span>
                                  <div className="whitespace-pre-line mt-0.5 text-slate-600">{exp.notes}</div>
                                </div>
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

      {/* Receipt Preview Lightbox Modal */}
      {receiptModalUrl && (
        <div 
          onClick={() => setReceiptModalUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in cursor-zoom-out"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">Payment Screenshot / Receipt Proof</h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModalUrl(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center max-h-[70vh] border border-slate-200 p-2">
              {receiptModalUrl.toLowerCase().includes('.pdf') ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto font-black text-lg">
                    PDF
                  </div>
                  <p className="font-bold text-sm text-slate-800">PDF Receipt Document</p>
                  <a
                    href={receiptModalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs"
                  >
                    <ExternalLink className="w-4 h-4" /> View / Download PDF in New Tab
                  </a>
                </div>
              ) : (
                <img
                  src={receiptModalUrl}
                  alt="Payment proof screenshot"
                  className="object-contain w-full h-auto max-h-[68vh] rounded-xl"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <a
                href={receiptModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-slate-900 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Open in new tab</span>
              </a>
              <button
                type="button"
                onClick={() => setReceiptModalUrl(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModalExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleDisputeExpense}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-600">
                <Flag className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Dispute Expense Claim</h3>
              </div>
              <button
                type="button"
                onClick={() => setDisputeModalExpense(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between font-bold text-slate-900">
                <span>{disputeModalExpense.description}</span>
                <span>{formatCurrency(disputeModalExpense.amount)}</span>
              </div>
              <div className="text-slate-500 flex justify-between">
                <span>Category: {disputeModalExpense.category?.name}</span>
                <span>Paid by: {disputeModalExpense.payer?.name}</span>
              </div>
              <div className="text-slate-500">
                Payment Method: <strong>{disputeModalExpense.payment_method || 'UPI'}</strong>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Flagging this expense alerts all flatmates and marks the record as <strong>Disputed</strong> in the ledger until resolved.
            </p>

            {/* Quick Reason Chips */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Quick Reason:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Cash payment was not received',
                  'Incorrect amount / inflated bill',
                  'False expense claim',
                  'Not part of this purchase'
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDisputeReason(preset)}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Detailed Reason Textarea */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Dispute Reason / Details:
              </label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this expense is incorrect or false..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-900 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmittingEvaluation}
                onClick={() => setDisputeModalExpense(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingEvaluation}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingEvaluation ? 'Flagging...' : 'Flag as Disputed'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
