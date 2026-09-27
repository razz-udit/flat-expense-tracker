import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { 
  ArrowLeftRight, 
  QrCode, 
  CheckCircle2, 
  Clock, 
  PlusCircle, 
  Trash2, 
  Check, 
  ArrowRight,
  Scale,
  X,
  SlidersHorizontal,
  ShieldCheck,
  CreditCard,
  Banknote,
  Building,
  AlertCircle,
  Edit2,
  Info,
  Sparkles
} from 'lucide-react';

export default function SettlementsPage() {
  const { members, currentUser, openUpiModal, addToast } = useApp();

  const [activeTab, setActiveTab] = useState('planner'); // 'planner' | 'budgets' | 'balances' | 'history'
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [paymentsHistory, setPaymentsHistory] = useState([]);
  const [categoryBudgets, setCategoryBudgets] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Record Payment Modal State
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [fromMember, setFromMember] = useState('');
  const [toMember, setToMember] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [status, setStatus] = useState('Paid'); // Default to Paid when recording manually
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' | 'Cash' | 'Bank Transfer'
  const [transactionReference, setTransactionReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category Budget Adjustment Modal State
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [budgetPerMemberInput, setBudgetPerMemberInput] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [equalizingTransferId, setEqualizingTransferId] = useState(null);

  const fetchSettlementData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [balancesData, settlementsData, paymentsData, budgetsData, catsData] = await Promise.all([
        api.getBalances(),
        api.getSettlements(),
        api.getPayments(),
        api.getCategoryBudgets(),
        api.getCategories()
      ]);
      setBalances(balancesData);
      setSettlements(settlementsData);
      setPaymentsHistory(paymentsData);
      setCategoryBudgets(budgetsData);
      setCategoriesList(catsData);
    } catch (err) {
      console.error('Error fetching settlement data:', err);
      addToast('Failed to load settlements and balances', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchSettlementData();
  }, [fetchSettlementData]);

  const handleOpenRecordModal = (prefill = null) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (prefill) {
      setFromMember(prefill.from_member_id || members[0]?.id || '');
      setToMember(prefill.to_member_id || members[1]?.id || '');
      setAmount(prefill.amount?.toString() || '');
      setPaymentDate(todayStr);
      setStatus(prefill.status || 'Paid');
      setPaymentMethod(prefill.payment_method || 'UPI');
      setTransactionReference(prefill.transaction_reference || '');
      setNotes(prefill.notes || '');
    } else {
      setFromMember(members[0]?.id || '');
      setToMember(members[1]?.id || '');
      setAmount('');
      setPaymentDate(todayStr);
      setStatus('Paid');
      setPaymentMethod('UPI');
      setTransactionReference('');
      setNotes('');
    }
    setIsRecordModalOpen(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'record-payment' }, '');
    }
  };

  const handleCloseRecordModal = () => {
    setIsRecordModalOpen(false);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'record-payment') {
      window.history.back();
    }
  };

  const handleCloseBudgetModal = () => {
    setIsBudgetModalOpen(false);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'budget-modal') {
      window.history.back();
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      if (isRecordModalOpen) setIsRecordModalOpen(false);
      if (isBudgetModalOpen) setIsBudgetModalOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isRecordModalOpen, isBudgetModalOpen]);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (fromMember === toMember) {
      addToast('Sender and receiver cannot be the same member.', 'error');
      return;
    }
    const parsedAmt = parseFloat(amount);
    if (!parsedAmt || parsedAmt <= 0) {
      addToast('Please enter a valid payment amount.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.createPayment({
        from_member: parseInt(fromMember, 10),
        to_member: parseInt(toMember, 10),
        amount: parsedAmt,
        payment_date: paymentDate,
        status: status,
        payment_method: paymentMethod,
        transaction_reference: transactionReference.trim() || null,
        notes: notes.trim() || null
      });
      addToast('Payment recorded successfully!', 'success');
      handleCloseRecordModal();
      fetchSettlementData();
    } catch (err) {
      console.error('Error recording payment:', err);
      addToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyPayment = async (paymentId) => {
    try {
      await api.verifyPayment(paymentId);
      addToast('Settlement verified and confirmed as received!', 'success');
      fetchSettlementData();
    } catch (err) {
      console.error('Error verifying payment:', err);
      addToast(err.message || 'Failed to verify payment', 'error');
    }
  };

  const handleUpdatePaymentStatus = async (paymentId, newStatus) => {
    try {
      await api.updatePayment(paymentId, { status: newStatus });
      addToast(`Payment marked as ${newStatus}! Balances recalculated.`, 'success');
      fetchSettlementData();
    } catch (err) {
      console.error('Error updating payment:', err);
      addToast(err.message || 'Failed to update payment status', 'error');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await api.deletePayment(paymentId);
      addToast('Payment record removed. Balances recalculated.', 'success');
      fetchSettlementData();
    } catch (err) {
      console.error('Error deleting payment:', err);
      addToast(err.message || 'Failed to delete payment record', 'error');
    }
  };

  const handleOpenBudgetModal = (category = null) => {
    if (category) {
      setSelectedCategoryId(category.category_id || category.id);
      setBudgetPerMemberInput(
        category.monthly_budget_per_member !== null && category.monthly_budget_per_member !== undefined
          ? category.monthly_budget_per_member.toString()
          : ''
      );
    } else {
      setSelectedCategoryId(categoriesList[0]?.id || '');
      setBudgetPerMemberInput('');
    }
    setIsBudgetModalOpen(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'budget-modal' }, '');
    }
  };

  const handleSaveCategoryBudget = async (e) => {
    e.preventDefault();
    if (!selectedCategoryId) {
      addToast('Please select a category.', 'error');
      return;
    }
    try {
      setIsSavingBudget(true);
      const trimmed = budgetPerMemberInput.trim();
      const val = trimmed === '' ? null : parseFloat(trimmed);
      if (val !== null && (isNaN(val) || val < 0)) {
        addToast('Please enter a valid positive budget or leave blank to remove.', 'error');
        return;
      }
      await api.updateCategory(selectedCategoryId, {
        monthly_budget_per_member: val
      });
      addToast('Category monthly budget per member updated successfully!', 'success');
      handleCloseBudgetModal();
      fetchSettlementData();
    } catch (err) {
      console.error('Error updating category budget:', err);
      addToast(err.message || 'Failed to update category budget', 'error');
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleEqualizeCategoryBudget = async (transfer, categoryId) => {
    const transferKey = `${categoryId}-${transfer.from_member_id}-${transfer.to_member_id}`;
    try {
      setEqualizingTransferId(transferKey);
      await api.equalizeBudget({
        category_id: categoryId,
        from_member_id: transfer.from_member_id,
        to_member_id: transfer.to_member_id,
        amount: parseFloat(transfer.amount),
        payment_method: 'UPI',
        notes: transfer.reason
      });
      addToast(`Budget equalized! Settlement of ₹${parseFloat(transfer.amount).toLocaleString('en-IN')} recorded.`, 'success');
      fetchSettlementData();
    } catch (err) {
      console.error('Error equalizing budget:', err);
      addToast(err.message || 'Failed to equalize budget', 'error');
    } finally {
      setEqualizingTransferId(null);
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading && !balances.length && !paymentsHistory.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-medium">Calculating settlements, budgets & balances...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Settlements & Payment Tracking
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automatic debt simplification, UPI deep links, manual receipts, and Category Budget Equalizer
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenBudgetModal()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 shadow-xs transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Set Category Budget</span>
          </button>
          <button
            onClick={() => handleOpenRecordModal()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Record Settlement</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('planner')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'planner'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>Who Owes Whom ({settlements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('budgets')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'budgets'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Category Budgets & Equalizer</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Settlements History ({paymentsHistory.length})</span>
        </button>
      </div>

      {/* Tab Content 1: Who Owes Whom (Planner) */}
      {activeTab === 'planner' && (
        <div className="space-y-4">
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-900 leading-relaxed">
            <span className="font-bold">Debt Simplification Algorithm:</span> Transactions are minimized so flat
            members do not need to make redundant cross-payments. For example, if A owes B, and B owes C, the
            system calculates direct settlements between debtors and creditors.
          </div>

          {settlements.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">All Debts Are Settled!</h3>
              <p className="text-xs text-slate-500 mt-1">
                There are no pending amounts between any flat members.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {settlements.map((s, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between space-y-4 hover:border-indigo-200 transition-all"
                >
                  <div>
                    {/* From -> To */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {s.from_member_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Sender</span>
                          <span className="text-xs font-bold text-slate-800 truncate block">
                            {s.from_member_name}
                          </span>
                        </div>
                      </div>

                      <ArrowRight className="w-4 h-4 text-indigo-500 shrink-0" />

                      <div className="flex items-center gap-2 min-w-0 text-right">
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Receiver</span>
                          <span className="text-xs font-bold text-indigo-700 truncate block">
                            {s.to_member_name}
                          </span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {s.to_member_name.charAt(0)}
                        </div>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-center py-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Amount to Pay
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-0.5">
                        {formatCurrency(s.amount)}
                      </div>
                      {s.to_member_upi && (
                        <div className="text-[11px] text-slate-500 font-mono mt-1">
                          UPI: {s.to_member_upi}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
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
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Pay UPI / Mode</span>
                    </button>

                    <button
                      onClick={() =>
                        handleOpenRecordModal({
                          from_member_id: s.from_member_id,
                          to_member_id: s.to_member_id,
                          amount: s.amount,
                          notes: `Settlement from ${s.from_member_name} to ${s.to_member_name}`,
                        })
                      }
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Mark Paid</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: Category Budgets & Equalizer */}
      {activeTab === 'budgets' && (
        <div className="space-y-6">
          {/* Explanation Banner */}
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-100 rounded-2xl p-5 text-indigo-950 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-sm text-indigo-950 flex items-center gap-2">
                  <span>Category Budget Equalization System</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-200/60 text-indigo-800 text-[10px] font-bold">
                    Automatic Fair Splitting
                  </span>
                </h3>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  Set a monthly spending target per flatmate for any category (e.g., <strong>₹1,500/member for Groceries</strong>). 
                  If <strong>Member A pays ₹1,700</strong> (+₹200 surplus) and <strong>Member B pays ₹1,300</strong> (-₹200 deficit), 
                  the Equalizer automatically schedules a <strong>₹200 transfer from Member B to Member A</strong> so all roommates share the exact ₹1,500 budget!
                </p>
              </div>
            </div>
          </div>

          {/* Category Cards */}
          {categoryBudgets.length === 0 ? (
            <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <SlidersHorizontal className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-slate-800">No Categories Created Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Categories are completely dynamic. Create custom categories when recording an expense or in Settings to set monthly member budgets.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {categoryBudgets.map((cat) => {
              const hasBudget = cat.monthly_budget_per_member !== null && cat.monthly_budget_per_member !== undefined;
              const targetPerMember = hasBudget ? parseFloat(cat.monthly_budget_per_member) : 0;
              const totalBudget = hasBudget && cat.total_budget ? parseFloat(cat.total_budget) : 0;
              const totalSpent = parseFloat(cat.total_spent) || 0;
              const budgetProgress = totalBudget > 0 ? Math.min(Math.round((totalSpent / totalBudget) * 100), 100) : 0;
              const hasTransfers = cat.equalization_transfers && cat.equalization_transfers.length > 0;

              return (
                <div
                  key={cat.category_id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-indigo-200 transition-all space-y-5"
                >
                  <div className="space-y-4">
                    {/* Header: Name, Budget Badge, Edit button */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-extrabold text-slate-900">{cat.category_name}</h2>
                          {hasBudget ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                              Target: {formatCurrency(targetPerMember)} / member
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                              No Budget Target Set
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {cat.members_count} active flatmates in split pool
                        </p>
                      </div>

                      <button
                        onClick={() => handleOpenBudgetModal(cat)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Set or Adjust Monthly Budget"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>

                    {/* Spend vs Budget Summary */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600">Total Spent This Month:</span>
                        <span className="font-black text-slate-900">{formatCurrency(totalSpent)}</span>
                      </div>
                      {hasBudget && (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-600">Flat Target Budget:</span>
                            <span className="font-bold text-indigo-700">
                              {formatCurrency(totalBudget)} ({formatCurrency(targetPerMember)} × {cat.members_count})
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mt-1">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                totalSpent > totalBudget
                                  ? 'bg-rose-500'
                                  : totalSpent >= totalBudget * 0.9
                                  ? 'bg-amber-500'
                                  : 'bg-indigo-600'
                              }`}
                              style={{ width: `${Math.min((totalSpent / (totalBudget || 1)) * 100, 100)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Member Contributions Breakdown */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Flatmate Contributions vs Target
                      </div>
                      <div className="space-y-2">
                        {cat.member_contributions.map((m) => {
                          const diff = parseFloat(m.diff_from_target) || 0;
                          const paid = parseFloat(m.amount_paid) || 0;

                          return (
                            <div
                              key={m.member_id}
                              className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/60 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  {m.member_name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 truncate">
                                    {m.member_name}
                                    {currentUser?.id === m.member_id && (
                                      <span className="ml-1 text-[10px] text-indigo-600 font-semibold">(You)</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {m.upi_id ? `UPI: ${m.upi_id}` : 'No UPI'}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-xs font-bold text-slate-800">
                                  Paid: {formatCurrency(paid)}
                                </div>
                                {hasBudget ? (
                                  <div className="mt-0.5">
                                    {diff > 0.01 ? (
                                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                                        +{formatCurrency(diff)} (Surplus)
                                      </span>
                                    ) : diff < -0.01 ? (
                                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                                        -{formatCurrency(Math.abs(diff))} (Deficit)
                                      </span>
                                    ) : (
                                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                        ✓ On Target ({formatCurrency(targetPerMember)})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-slate-400">
                                    No budget set
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Proposed Equalization Transfers */}
                    {hasTransfers ? (
                      <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
                          <Sparkles className="w-4 h-4 text-amber-600" />
                          <span>Equalization Transfers Needed ({cat.equalization_transfers.length})</span>
                        </div>
                        <div className="space-y-2">
                          {cat.equalization_transfers.map((t, tIdx) => {
                            const transferKey = `${cat.category_id}-${t.from_member_id}-${t.to_member_id}`;
                            const isTransferLoading = equalizingTransferId === transferKey;

                            return (
                              <div
                                key={tIdx}
                                className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <div className="text-xs font-bold text-slate-900">
                                    <span className="text-rose-700">{t.from_member_name}</span> pays{' '}
                                    <span className="text-emerald-700">{t.to_member_name}</span>
                                  </div>
                                  <div className="text-sm font-extrabold text-indigo-700">
                                    {formatCurrency(t.amount)}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Equalizes {cat.category_name} budget to {formatCurrency(targetPerMember)}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                                  <button
                                    onClick={() =>
                                      openUpiModal({
                                        fromMemberId: t.from_member_id,
                                        fromMemberName: t.from_member_name,
                                        toMemberId: t.to_member_id,
                                        toMemberName: t.to_member_name,
                                        toMemberUpi: t.to_member_upi,
                                        amount: t.amount,
                                        upiLink: t.upi_link,
                                        categoryName: cat.category_name,
                                      })
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    <QrCode className="w-3.5 h-3.5" />
                                    <span>UPI Gateway</span>
                                  </button>

                                  <button
                                    onClick={() => handleEqualizeCategoryBudget(t, cat.category_id)}
                                    disabled={isTransferLoading}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{isTransferLoading ? 'Equalizing...' : '1-Click Settle'}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : hasBudget ? (
                      <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-center">
                        <div className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>All flatmates are currently equalized for {cat.category_name}!</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                        <button
                          onClick={() => handleOpenBudgetModal(cat)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                        >
                          + Set a monthly budget to enable equalization
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}


      {/* Tab Content 4: Settlements History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recorded Settlements & Payments History</h2>
              <p className="text-xs text-slate-500">Every peer-to-peer transfer, payment mode, and receiver verification logged</p>
            </div>
          </div>

          {paymentsHistory.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">No Settlements Recorded Yet</div>
              <p className="text-xs text-slate-500">When members pay each other via UPI, Cash, or Bank, log the settlement here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">From (Payer)</th>
                    <th className="py-3 px-4">To (Receiver)</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Method & Reference</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentsHistory.map((p) => {
                    const isCurrentUserReceiver = currentUser && currentUser.id === p.to_member;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                          {p.payment_date}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                          {p.payer?.name || `Member ${p.from_member}`}
                        </td>
                        <td className="py-3 px-4 font-semibold text-indigo-700 whitespace-nowrap">
                          {p.receiver?.name || `Member ${p.to_member}`}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm whitespace-nowrap">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {p.payment_method === 'Cash' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                                <Banknote className="w-3 h-3" />
                                <span>Cash</span>
                              </span>
                            ) : p.payment_method === 'Bank Transfer' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                                <Building className="w-3 h-3" />
                                <span>Bank/NEFT</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                                <QrCode className="w-3 h-3" />
                                <span>UPI</span>
                              </span>
                            )}
                          </div>
                          {p.transaction_reference && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Ref: {p.transaction_reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                          {p.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {p.status === 'Paid' ? (
                            p.verified_at ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800" title={`Verified on ${p.verified_at}`}>
                                <ShieldCheck className="w-3 h-3" />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Paid
                              </span>
                            )
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {p.status === 'Pending' ? (
                              <button
                                onClick={() => handleVerifyPayment(p.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                                title="Confirm you received this payment"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Verify</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdatePaymentStatus(p.id, 'Pending')}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-semibold cursor-pointer"
                                title="Revert to Pending"
                              >
                                Revert
                              </button>
                            )}
                            <button
                              onClick={() => handleDeletePayment(p.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Record Custom Payment Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Record Settlement Payment</h3>
              <button
                onClick={handleCloseRecordModal}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    From (Sender) *
                  </label>
                  <select
                    value={fromMember}
                    onChange={(e) => setFromMember(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    To (Receiver) *
                  </label>
                  <select
                    value={toMember}
                    onChange={(e) => setToMember(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="500.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Payment Method *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'UPI', label: 'UPI App', icon: QrCode },
                    { id: 'Cash', label: 'Cash', icon: Banknote },
                    { id: 'Bank Transfer', label: 'Bank/NEFT', icon: Building }
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          paymentMethod === m.id
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transaction Reference / UTR */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Transaction Reference / UTR (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12-digit UPI UTR or Cheque / Ref ID"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Settlement Status *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('Paid')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      status === 'Paid'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    ✓ Paid (Already Transferred)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('Pending')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      status === 'Pending'
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    ⏳ Pending Receiver Verification
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid via PhonePe / Cash handover"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseRecordModal}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set / Edit Category Budget Modal */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Set Monthly Category Budget</h3>
              <button
                onClick={handleCloseBudgetModal}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Category *
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  {categoriesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.monthly_budget_per_member ? `(Current: ₹${c.monthly_budget_per_member}/member)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Monthly Target Budget Per Member (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 1500.00 (Leave empty to remove budget)"
                  value={budgetPerMemberInput}
                  onChange={(e) => setBudgetPerMemberInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Example: Enter <strong>1500</strong> for Grocery so each flatmate's target share is ₹1,500/month.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseBudgetModal}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBudget}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingBudget ? 'Saving...' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
