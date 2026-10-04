import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { X, AlertCircle, Check, Users, Receipt, CalendarRange, Lock, Equal, Percent, Hash } from 'lucide-react';

export default function AddExpenseModal({ onExpenseSaved }) {
  const {
    members,
    categories,
    currentUser,
    activeMemberId,
    isExpenseModalOpen,
    editingExpense,
    closeAddExpense,
    refreshMeta,
    addToast
  } = useApp();

  const [categoryId, setCategoryId] = useState('');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [hasBillingPeriod, setHasBillingPeriod] = useState(false);
  const [billingStart, setBillingStart] = useState('');
  const [billingEnd, setBillingEnd] = useState('');
  
  // Split Modes: 'equal' | 'exact' | 'percentage' | 'shares'
  const [splitType, setSplitType] = useState('equal');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [customSplits, setCustomSplits] = useState({}); // { [memberId]: string_amount }
  const [percentageSplits, setPercentageSplits] = useState({}); // { [memberId]: string_percent }
  const [sharesSplits, setSharesSplits] = useState({}); // { [memberId]: string_shares }
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Initialize or reset form
  useEffect(() => {
    if (!isExpenseModalOpen) {
      setValidationError('');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (editingExpense) {
      setCategoryId(editingExpense.category_id ? editingExpense.category_id.toString() : '');
      setCustomCategoryInput('');
      setIsCreatingNewCategory(false);
      setAmount(editingExpense.amount?.toString() || '');
      setPaidBy(editingExpense.paid_by || (members[0]?.id || ''));
      setExpenseDate(editingExpense.expense_date || todayStr);
      setDescription(editingExpense.description || '');
      setNotes(editingExpense.notes || '');

      if (editingExpense.billing_period_start || editingExpense.billing_period_end) {
        setHasBillingPeriod(true);
        setBillingStart(editingExpense.billing_period_start || '');
        setBillingEnd(editingExpense.billing_period_end || '');
      } else {
        setHasBillingPeriod(false);
        setBillingStart('');
        setBillingEnd('');
      }

      const st = editingExpense.split_type === 'custom' ? 'exact' : (editingExpense.split_type || 'equal');
      setSplitType(st);

      const splitMids = (editingExpense.splits || []).map((s) => s.member_id);
      const participatingIds = splitMids.length > 0 ? splitMids : members.map((m) => m.id);
      setSelectedMemberIds(participatingIds);

      const customMap = {};
      const pctMap = {};
      const sharesMap = {};
      const totalExpAmt = parseFloat(editingExpense.amount) || 1;

      (editingExpense.splits || []).forEach((s) => {
        const sAmt = parseFloat(s.amount) || 0;
        customMap[s.member_id] = s.amount?.toString() || '';
        pctMap[s.member_id] = ((sAmt / totalExpAmt) * 100).toFixed(1);
        sharesMap[s.member_id] = '1';
      });

      setCustomSplits(customMap);
      setPercentageSplits(pctMap);
      setSharesSplits(sharesMap);
    } else {
      // New expense defaults
      if (categories && categories.length > 0) {
        setCategoryId(categories[0].id.toString());
        setIsCreatingNewCategory(false);
      } else {
        setCategoryId('');
        setIsCreatingNewCategory(true);
      }
      setCustomCategoryInput('');
      setAmount('');
      setPaidBy(activeMemberId || members[0]?.id || '');
      setExpenseDate(todayStr);
      setDescription('');
      setNotes('');
      setHasBillingPeriod(false);
      setBillingStart('');
      setBillingEnd('');
      setSplitType('equal');
      const allMids = members.map((m) => m.id);
      setSelectedMemberIds(allMids);
      setCustomSplits({});
      
      // Initialize default percentages and shares
      const defPct = allMids.length > 0 ? (100 / allMids.length).toFixed(1) : '0';
      const initialPct = {};
      const initialShares = {};
      allMids.forEach((mid) => {
        initialPct[mid] = defPct;
        initialShares[mid] = '1';
      });
      setPercentageSplits(initialPct);
      setSharesSplits(initialShares);
    }
  }, [isExpenseModalOpen, editingExpense, members, categories, activeMemberId]);

  if (!isExpenseModalOpen) return null;

  const parsedAmount = parseFloat(amount) || 0;
  const numSelected = selectedMemberIds.length;

  // 1. Equal split calculation
  const equalSharePerPerson = numSelected > 0 ? (parsedAmount / numSelected).toFixed(2) : '0.00';

  // 2. Exact amount split calculation
  const customTotal = selectedMemberIds.reduce((sum, mid) => {
    const val = parseFloat(customSplits[mid]) || 0;
    return sum + val;
  }, 0);
  const customDifference = parseFloat((parsedAmount - customTotal).toFixed(2));

  // 3. Percentage split calculation
  const totalPercentage = selectedMemberIds.reduce((sum, mid) => {
    const val = parseFloat(percentageSplits[mid]) || 0;
    return sum + val;
  }, 0);
  const pctDifference = parseFloat((100 - totalPercentage).toFixed(2));

  // 4. Shares split calculation
  const totalShares = selectedMemberIds.reduce((sum, mid) => {
    const val = parseFloat(sharesSplits[mid]) || 0;
    return sum + (val > 0 ? val : 1);
  }, 0);
  const amountPerShare = totalShares > 0 ? (parsedAmount / totalShares).toFixed(2) : '0.00';

  const toggleMemberSelection = (mid) => {
    if (selectedMemberIds.includes(mid)) {
      if (selectedMemberIds.length === 1) {
        setValidationError('At least one member must participate in the expense.');
        return;
      }
      const nextMids = selectedMemberIds.filter((id) => id !== mid);
      setSelectedMemberIds(nextMids);

      const nextCustom = { ...customSplits };
      delete nextCustom[mid];
      setCustomSplits(nextCustom);

      const nextPct = { ...percentageSplits };
      delete nextPct[mid];
      setPercentageSplits(nextPct);

      const nextShares = { ...sharesSplits };
      delete nextShares[mid];
      setSharesSplits(nextShares);
    } else {
      setSelectedMemberIds([...selectedMemberIds, mid]);
      setSharesSplits((prev) => ({ ...prev, [mid]: '1' }));
    }
  };

  const handleSelectAll = () => {
    const allMids = members.map((m) => m.id);
    setSelectedMemberIds(allMids);
    const sharesMap = {};
    allMids.forEach((id) => { sharesMap[id] = sharesSplits[id] || '1'; });
    setSharesSplits(sharesMap);
  };

  const handleDistributeEvenlyExact = () => {
    if (selectedMemberIds.length === 0 || parsedAmount <= 0) return;
    const share = (parsedAmount / selectedMemberIds.length).toFixed(2);
    const newSplits = {};
    let runningSum = 0;
    selectedMemberIds.forEach((mid, idx) => {
      if (idx === selectedMemberIds.length - 1) {
        newSplits[mid] = (parsedAmount - runningSum).toFixed(2);
      } else {
        newSplits[mid] = share;
        runningSum += parseFloat(share);
      }
    });
    setCustomSplits(newSplits);
  };

  const handleDistributePercentages = () => {
    if (selectedMemberIds.length === 0) return;
    const n = selectedMemberIds.length;
    const basePct = parseFloat((100 / n).toFixed(1));
    const newPcts = {};
    let sum = 0;
    selectedMemberIds.forEach((mid, idx) => {
      if (idx === n - 1) {
        newPcts[mid] = (100 - sum).toFixed(1);
      } else {
        newPcts[mid] = basePct.toFixed(1);
        sum += basePct;
      }
    });
    setPercentageSplits(newPcts);
  };

  const handleResetShares = () => {
    const newShares = {};
    selectedMemberIds.forEach((mid) => {
      newShares[mid] = '1';
    });
    setSharesSplits(newShares);
  };

  const selectedCategory = categories.find((c) => c.id.toString() === categoryId?.toString());
  const currentCategoryName = (isCreatingNewCategory || categories.length === 0)
    ? customCategoryInput.trim()
    : (selectedCategory?.name || '');

  const isGeneralCategory = (catName) => {
    if (!catName) return false;
    const name = catName.toLowerCase().trim();
    const generalKeywords = ['grocery', 'groceries', 'general', 'supplies', 'provisions', 'other', 'misc', 'food', 'market', 'vegetable', 'items'];
    return generalKeywords.some((k) => name.includes(k));
  };
  const isDescriptionMandatory = isGeneralCategory(currentCategoryName);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (parsedAmount <= 0) {
      setValidationError('Please enter a valid expense amount greater than 0.');
      return;
    }

    let finalCategoryId = undefined;
    let finalCategoryName = undefined;

    if (isCreatingNewCategory || categories.length === 0) {
      const trimmedCat = customCategoryInput.trim();
      if (!trimmedCat) {
        setValidationError('Please enter a category name (e.g. Grocery, WiFi, Snacks, Milk).');
        return;
      }
      const existing = categories.find((c) => c.name.toLowerCase() === trimmedCat.toLowerCase());
      if (existing) {
        finalCategoryId = existing.id;
      } else {
        finalCategoryName = trimmedCat;
      }
    } else {
      if (!categoryId) {
        setValidationError('Please select or create a category.');
        return;
      }
      finalCategoryId = parseInt(categoryId, 10);
    }

    const displayCategoryName = currentCategoryName || 'Shared Expense';
    const trimmedDesc = description.trim();
    if (isDescriptionMandatory && !trimmedDesc) {
      setValidationError(
        `Description is mandatory for "${displayCategoryName}". Please specify what was purchased (e.g. Milk, Vegetables, Cooking Oil).`
      );
      return;
    }

    const finalDescription = trimmedDesc || displayCategoryName;

    if (selectedMemberIds.length === 0) {
      setValidationError('Please select at least one member to participate in the split.');
      return;
    }

    let payloadSplits = undefined;

    if (splitType === 'exact' || splitType === 'custom') {
      if (Math.abs(customDifference) > 0.05) {
        setValidationError(
          `Exact splits total (₹${customTotal.toFixed(2)}) must equal the expense amount (₹${parsedAmount.toFixed(2)}). Difference: ₹${Math.abs(customDifference).toFixed(2)}.`
        );
        return;
      }
      payloadSplits = selectedMemberIds.map((mid) => ({
        member_id: mid,
        amount: parseFloat(customSplits[mid] || 0),
      }));
    } else if (splitType === 'percentage') {
      if (Math.abs(pctDifference) > 0.5) {
        setValidationError(
          `Total percentage must equal 100%. Current total: ${totalPercentage.toFixed(1)}% (difference: ${pctDifference > 0 ? `${pctDifference.toFixed(1)}% remaining` : `${Math.abs(pctDifference).toFixed(1)}% over`}).`
        );
        return;
      }
      // Compute accurate rupee amounts with cents distribution
      const totalCents = Math.round(parsedAmount * 100);
      let sumAllocated = 0;
      const rawSplits = selectedMemberIds.map((mid) => {
        const pct = parseFloat(percentageSplits[mid]) || 0;
        const cents = Math.round(totalCents * (pct / 100));
        sumAllocated += cents;
        return { member_id: mid, percentage: pct, cents };
      });
      const diffCents = totalCents - sumAllocated;
      if (diffCents !== 0 && rawSplits.length > 0) {
        rawSplits[0].cents += diffCents;
      }
      payloadSplits = rawSplits.map((s) => ({
        member_id: s.member_id,
        percentage: s.percentage,
        amount: parseFloat((s.cents / 100).toFixed(2)),
      }));
    } else if (splitType === 'shares') {
      if (totalShares <= 0) {
        setValidationError('Total shares must be greater than 0.');
        return;
      }
      const totalCents = Math.round(parsedAmount * 100);
      let sumAllocated = 0;
      const rawSplits = selectedMemberIds.map((mid) => {
        const sh = parseFloat(sharesSplits[mid]) || 1;
        const cents = Math.round(totalCents * (sh / totalShares));
        sumAllocated += cents;
        return { member_id: mid, shares: sh, cents };
      });
      const diffCents = totalCents - sumAllocated;
      if (diffCents !== 0 && rawSplits.length > 0) {
        rawSplits[0].cents += diffCents;
      }
      payloadSplits = rawSplits.map((s) => ({
        member_id: s.member_id,
        shares: s.shares,
        amount: parseFloat((s.cents / 100).toFixed(2)),
      }));
    }

    const payload = {
      category_id: finalCategoryId,
      category_name: finalCategoryName,
      amount: parsedAmount,
      paid_by: parseInt(paidBy, 10),
      description: finalDescription,
      expense_date: expenseDate,
      billing_period_start: hasBillingPeriod && billingStart ? billingStart : null,
      billing_period_end: hasBillingPeriod && billingEnd ? billingEnd : null,
      split_type: splitType,
      member_ids: splitType === 'equal' ? selectedMemberIds : undefined,
      splits: payloadSplits,
      notes: notes.trim() || null,
    };

    try {
      setIsSubmitting(true);
      if (editingExpense) {
        await api.updateExpense(editingExpense.id, payload, currentUser?.id);
        addToast('Expense updated successfully! Balances recalculated.', 'success');
      } else {
        await api.createExpense(payload);
        addToast('New flat expense added successfully!', 'success');
      }
      await refreshMeta();
      closeAddExpense();
      if (onExpenseSaved) onExpenseSaved();
    } catch (err) {
      console.error('Error saving expense:', err);
      setValidationError(err.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full my-8 border border-slate-100 overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-lg text-white">
              {editingExpense ? 'Edit Flat Expense' : 'Add Collective Expense'}
            </h3>
          </div>
          <button
            onClick={closeAddExpense}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Amount & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="2400.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold text-slate-900 text-sm tabular-nums"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Category *
                </label>
                {categories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNewCategory(!isCreatingNewCategory);
                      if (isCreatingNewCategory) {
                        setCustomCategoryInput('');
                      }
                    }}
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                  >
                    {isCreatingNewCategory ? 'Select from list' : '+ New Category'}
                  </button>
                )}
              </div>

              {isCreatingNewCategory || categories.length === 0 ? (
                <input
                  type="text"
                  required
                  placeholder="e.g. WiFi, Grocery, Maid, Milk"
                  value={customCategoryInput}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-semibold text-slate-900 placeholder:text-slate-400"
                />
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-900 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Paid By & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Paid By *
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 font-semibold text-slate-900 bg-white"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {currentUser && m.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Expense Date *
              </label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>
                Description {isDescriptionMandatory ? (
                  <span className="text-rose-500 font-bold">*</span>
                ) : (
                  <span className="text-slate-400 font-normal lowercase">(optional for {currentCategoryName || 'this item'})</span>
                )}
              </span>
              {!isDescriptionMandatory && !description.trim() && (
                <span className="text-[11px] text-slate-500 font-medium lowercase">
                  defaults to "{currentCategoryName || 'Category'}"
                </span>
              )}
            </label>
            <input
              type="text"
              required={isDescriptionMandatory}
              placeholder={
                isDescriptionMandatory
                  ? `e.g. Vegetables, Milk, Cooking Oil (mandatory for ${currentCategoryName || 'Grocery'})`
                  : `e.g. ${currentCategoryName || 'Details'} (optional - leave blank to use category name)`
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200/90 focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-900"
            />
          </div>

          {/* Billing Period (Optional) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setHasBillingPeriod(!hasBillingPeriod)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <CalendarRange className="w-3.5 h-3.5 text-slate-500" />
              <span>{hasBillingPeriod ? 'Remove Billing Period' : '+ Add Multi-Month Billing Period (e.g. Electricity)'}</span>
            </button>

            {hasBillingPeriod && (
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Period Start</label>
                  <input
                    type="date"
                    value={billingStart}
                    onChange={(e) => setBillingStart(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Period End</label>
                  <input
                    type="date"
                    value={billingEnd}
                    onChange={(e) => setBillingEnd(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Split Section */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Split Between ({selectedMemberIds.length} Members)</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
              >
                Select All ({members.length})
              </button>
            </div>

            {/* Member Toggles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {members.map((m) => {
                const isSelected = selectedMemberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMemberSelection(m.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl text-left border text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{m.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Google Pay-Style Split Mode Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 mb-3 overflow-x-auto gap-1">
              <button
                type="button"
                onClick={() => setSplitType('equal')}
                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                  splitType === 'equal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Equal className="w-3.5 h-3.5" />
                <span>Equally (=)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitType('exact');
                  if (Object.keys(customSplits).length === 0) {
                    handleDistributeEvenlyExact();
                  }
                }}
                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                  splitType === 'exact'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>₹</span>
                <span>Exact (₹)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitType('percentage');
                  handleDistributePercentages();
                }}
                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                  splitType === 'percentage'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Percentage (%)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitType('shares');
                  handleResetShares();
                }}
                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                  splitType === 'shares'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Shares (x)</span>
              </button>
            </div>

            {/* Split Mode Content 1: Equal Split */}
            {splitType === 'equal' && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs mb-3">
                <span className="font-semibold text-slate-700">
                  Equal share among {numSelected} roommates:
                </span>
                <span className="font-black text-slate-900 text-sm tabular-nums">
                  ₹{equalSharePerPerson} / person
                </span>
              </div>
            )}

            {/* Split Mode Content 2: Exact Amounts (₹) */}
            {splitType === 'exact' && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-slate-700">Enter exact amount per person</span>
                  <button
                    type="button"
                    onClick={handleDistributeEvenlyExact}
                    className="text-slate-600 hover:text-slate-900 hover:underline text-[11px] cursor-pointer"
                  >
                    Distribute Evenly
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedMemberIds.map((mid) => {
                    const member = members.find((m) => m.id === mid);
                    return (
                      <div key={mid} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {member?.name || `Member ${mid}`}
                        </span>
                        <div className="relative w-32">
                          <span className="absolute left-2.5 top-1.5 text-xs text-slate-500 font-bold">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={customSplits[mid] || ''}
                            onChange={(e) => setCustomSplits({ ...customSplits, [mid]: e.target.value })}
                            className="w-full pl-6 pr-2 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-900 text-right bg-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600">Total Assigned: ₹{customTotal.toFixed(2)}</span>
                  {Math.abs(customDifference) <= 0.05 ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Balanced (₹{parsedAmount.toFixed(2)})
                    </span>
                  ) : (
                    <span className="text-rose-600">
                      ₹{Math.abs(customDifference).toFixed(2)}{' '}
                      {customDifference > 0 ? 'remaining' : 'over'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Split Mode Content 3: By Percentage (%) */}
            {splitType === 'percentage' && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-slate-700">Enter percentage per person (%)</span>
                  <button
                    type="button"
                    onClick={handleDistributePercentages}
                    className="text-slate-600 hover:text-slate-900 hover:underline text-[11px] cursor-pointer"
                  >
                    Distribute Evenly
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedMemberIds.map((mid) => {
                    const member = members.find((m) => m.id === mid);
                    const pctVal = parseFloat(percentageSplits[mid]) || 0;
                    const calculatedAmt = (parsedAmount * (pctVal / 100)).toFixed(2);
                    return (
                      <div key={mid} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-800 truncate block">
                            {member?.name || `Member ${mid}`}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            ≈ ₹{calculatedAmt}
                          </span>
                        </div>
                        <div className="relative w-24">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            placeholder="0"
                            value={percentageSplits[mid] || ''}
                            onChange={(e) => setPercentageSplits({ ...percentageSplits, [mid]: e.target.value })}
                            className="w-full pr-6 pl-2 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-900 text-right bg-white"
                          />
                          <span className="absolute right-2 top-1 text-xs text-slate-400 font-bold">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600">Total: {totalPercentage.toFixed(1)}%</span>
                  {Math.abs(pctDifference) <= 0.5 ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> 100% Assigned
                    </span>
                  ) : (
                    <span className="text-rose-600">
                      {Math.abs(pctDifference).toFixed(1)}% {pctDifference > 0 ? 'remaining' : 'over'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Split Mode Content 4: By Shares / Parts (x) */}
            {splitType === 'shares' && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-slate-700">Enter parts/shares per person</span>
                  <button
                    type="button"
                    onClick={handleResetShares}
                    className="text-slate-600 hover:text-slate-900 hover:underline text-[11px] cursor-pointer"
                  >
                    Reset to 1 share each
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedMemberIds.map((mid) => {
                    const member = members.find((m) => m.id === mid);
                    const shVal = parseFloat(sharesSplits[mid]) || 1;
                    const calculatedAmt = totalShares > 0 ? (parsedAmount * (shVal / totalShares)).toFixed(2) : '0.00';
                    return (
                      <div key={mid} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-800 truncate block">
                            {member?.name || `Member ${mid}`}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {shVal} of {totalShares} shares (₹{calculatedAmt})
                          </span>
                        </div>
                        <div className="relative w-20">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            placeholder="1"
                            value={sharesSplits[mid] || '1'}
                            onChange={(e) => setSharesSplits({ ...sharesSplits, [mid]: e.target.value })}
                            className="w-full pr-5 pl-2 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-900 text-right bg-white"
                          />
                          <span className="absolute right-2 top-1 text-xs text-slate-400 font-bold">x</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Total Shares: {totalShares}</span>
                  <span className="text-slate-900 font-bold">
                    ≈ ₹{amountPerShare} / share
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeAddExpense}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
