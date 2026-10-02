import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { X, AlertCircle, Check, Users, Receipt, CalendarRange, Lock } from 'lucide-react';

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
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom'
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [customSplits, setCustomSplits] = useState({}); // { [memberId]: string_amount }
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
      // Editing existing expense
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

      setSplitType(editingExpense.split_type || 'equal');

      const splitMids = (editingExpense.splits || []).map((s) => s.member_id);
      setSelectedMemberIds(splitMids.length > 0 ? splitMids : members.map((m) => m.id));

      const customMap = {};
      (editingExpense.splits || []).forEach((s) => {
        customMap[s.member_id] = s.amount?.toString() || '';
      });
      setCustomSplits(customMap);
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
      setSelectedMemberIds(members.map((m) => m.id));
      setCustomSplits({});
    }
  }, [isExpenseModalOpen, editingExpense, members, categories, activeMemberId]);

  if (!isExpenseModalOpen) return null;

  // Calculate live equal share preview
  const parsedAmount = parseFloat(amount) || 0;
  const numSelected = selectedMemberIds.length;
  const equalSharePerPerson = numSelected > 0 ? (parsedAmount / numSelected).toFixed(2) : '0.00';

  // Calculate live custom total
  const customTotal = selectedMemberIds.reduce((sum, mid) => {
    const val = parseFloat(customSplits[mid]) || 0;
    return sum + val;
  }, 0);
  const customDifference = parseFloat((parsedAmount - customTotal).toFixed(2));

  const toggleMemberSelection = (mid) => {
    if (selectedMemberIds.includes(mid)) {
      if (selectedMemberIds.length === 1) {
        setValidationError('At least one member must participate in the expense.');
        return;
      }
      setSelectedMemberIds(selectedMemberIds.filter((id) => id !== mid));
      const nextCustom = { ...customSplits };
      delete nextCustom[mid];
      setCustomSplits(nextCustom);
    } else {
      setSelectedMemberIds([...selectedMemberIds, mid]);
    }
  };

  const handleSelectAll = () => {
    setSelectedMemberIds(members.map((m) => m.id));
  };

  const handleCustomSplitChange = (mid, val) => {
    setCustomSplits((prev) => ({
      ...prev,
      [mid]: val,
    }));
  };

  const handleDistributeRemaining = () => {
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
  const isDefaultAdmin = Boolean(currentUser && members && members.length > 0 && currentUser.id === members[0]?.id);
  const canEdit = !editingExpense || Boolean(currentUser && (editingExpense.paid_by === currentUser.id || isDefaultAdmin));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (editingExpense && !canEdit) {
      setValidationError(
        `Permission denied: Only ${editingExpense.payer?.name || 'the payer'} or Flat Admin can edit this expense.`
      );
      return;
    }

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

    // Specific product categories (like LPG Gas, Electricity, WiFi, Maid) default to category name if empty
    const finalDescription = trimmedDesc || displayCategoryName;

    if (selectedMemberIds.length === 0) {
      setValidationError('Please select at least one member to participate in the split.');
      return;
    }

    let payloadSplits = undefined;
    if (splitType === 'custom') {
      if (Math.abs(customDifference) > 0.01) {
        setValidationError(
          `Custom splits total (₹${customTotal.toFixed(2)}) must equal the expense amount (₹${parsedAmount.toFixed(
            2
          )}). Difference: ₹${Math.abs(customDifference).toFixed(2)}.`
        );
        return;
      }

      payloadSplits = selectedMemberIds.map((mid) => ({
        member_id: mid,
        amount: parseFloat(customSplits[mid] || 0),
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
        addToast('Expense updated successfully!', 'success');
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
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-6 h-6" />
            <h3 className="font-bold text-lg">
              {editingExpense ? 'Edit Flat Expense' : 'Add Collective Expense'}
            </h3>
          </div>
          <button
            onClick={closeAddExpense}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
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

        {/* Read-Only Mode Banner */}
        {editingExpense && !canEdit && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Read-Only Mode:</strong> This expense was recorded by{' '}
              <strong>{editingExpense.payer?.name || `Member ${editingExpense.paid_by}`}</strong>. Only they or the Flat Admin can edit or delete it.
            </span>
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
                <span className="absolute left-3 top-2.5 text-slate-500 font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="2400.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900"
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
                        setCategoryId(categories[0]?.id.toString() || '');
                      }
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    {isCreatingNewCategory ? '← Choose Existing' : '+ New Category'}
                  </button>
                )}
              </div>

              {isCreatingNewCategory || categories.length === 0 ? (
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Enter category (e.g. Grocery, WiFi, Electricity, Snacks)..."
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 bg-indigo-50/20"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Categories are completely dynamic. Type any category and it will be saved for your flat.
                  </p>
                </div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsCreatingNewCategory(true);
                      setCustomCategoryInput('');
                    } else {
                      setCategoryId(e.target.value);
                    }
                  }}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__NEW__" className="text-indigo-600 font-bold">
                    + Create New Category...
                  </option>
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
                disabled={Boolean(editingExpense && !isDefaultAdmin)}
                required
                className={`w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900 ${
                  editingExpense && !isDefaultAdmin ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                }`}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.upi_id ? `(${m.upi_id})` : ''}
                  </option>
                ))}
              </select>
              {editingExpense && !isDefaultAdmin && (
                <p className="text-[10px] text-slate-400 mt-1">Only Flat Admin can reassign the payer of a saved expense.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Expense Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                />
              </div>
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
                <span className="text-[11px] text-indigo-600 font-medium lowercase">
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
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
            />
          </div>

          {/* Billing Period (Optional e.g. for Electricity / Multi-Month) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setHasBillingPeriod(!hasBillingPeriod)}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>{hasBillingPeriod ? 'Remove Billing Period' : '+ Add Multi-Month Billing Period (e.g. Electricity)'}</span>
            </button>

            {hasBillingPeriod && (
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Period Start</label>
                  <input
                    type="date"
                    value={billingStart}
                    onChange={(e) => setBillingStart(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Period End</label>
                  <input
                    type="date"
                    value={billingEnd}
                    onChange={(e) => setBillingEnd(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Split Section */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Split Between ({selectedMemberIds.length} Members)</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
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
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
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

            {/* Split Type Selector */}
            <div className="flex rounded-xl bg-slate-100 p-1 mb-3">
              <button
                type="button"
                onClick={() => setSplitType('equal')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  splitType === 'equal'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Equal Split ({numSelected > 0 ? `₹${equalSharePerPerson}/person` : '₹0'})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSplitType('custom');
                  if (Object.keys(customSplits).length === 0) {
                    handleDistributeRemaining();
                  }
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  splitType === 'custom'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Amount Split
              </button>
            </div>

            {/* Custom Split Inputs */}
            {splitType === 'custom' && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-slate-700">Member Custom Shares</span>
                  <button
                    type="button"
                    onClick={handleDistributeRemaining}
                    className="text-indigo-600 hover:underline text-[11px]"
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
                            onChange={(e) => handleCustomSplitChange(mid, e.target.value)}
                            className="w-full pl-6 pr-2 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right bg-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom split validation indicator */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600">Total Custom: ₹{customTotal.toFixed(2)}</span>
                  {Math.abs(customDifference) < 0.01 ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Matches Target (₹{parsedAmount.toFixed(2)})
                    </span>
                  ) : (
                    <span className="text-rose-600">
                      Difference: ₹{Math.abs(customDifference).toFixed(2)}{' '}
                      {customDifference > 0 ? 'under' : 'over'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeAddExpense}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (editingExpense && !canEdit)}
              className={`px-5 py-2 rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer ${
                editingExpense && !canEdit
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
              }`}
            >
              {isSubmitting ? 'Saving...' : editingExpense ? (canEdit ? 'Update Expense' : 'Read Only') : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
