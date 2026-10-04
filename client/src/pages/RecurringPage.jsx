import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { getLocalDateString } from '../utils/date';
import { 
  Repeat, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  X, 
  Sparkles,
  Receipt
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RecurringPage() {
  const navigate = useNavigate();
  const { members, categories, addToast } = useApp();

  const [recurringList, setRecurringList] = useState(() => {
    try {
      const cached = sessionStorage.getItem('flat_recurring_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => recurringList.length === 0);

  // Template Modal (Add / Edit)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [frequency, setFrequency] = useState('Monthly');
  const [notes, setNotes] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // "Create This Month's Expense" confirmation modal
  const [itemToGenerate, setItemToGenerate] = useState(null);
  const [generateDate, setGenerateDate] = useState('');
  const [generateDesc, setGenerateDesc] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchRecurring = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const data = await api.getRecurring();
      setRecurringList(data);
      try {
        sessionStorage.setItem('flat_recurring_cache', JSON.stringify(data));
      } catch (_) {}
    } catch (err) {
      console.error('Failed to load recurring templates:', err);
      addToast('Failed to load recurring expenses', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    const hasCache = recurringList.length > 0;
    fetchRecurring(hasCache);
  }, [fetchRecurring]);

  const handleOpenTemplateModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setTitle(template.title);
      setCategoryId(template.category_id);
      setAmount(template.amount?.toString() || '');
      setPaidBy(template.paid_by);
      setFrequency(template.frequency || 'Monthly');
      setNotes(template.notes || '');
    } else {
      setEditingTemplate(null);
      setTitle('');
      setCategoryId(categories[0]?.id || '');
      setAmount('');
      setPaidBy(currentUser?.id || members[0]?.id || '');
      setFrequency('Monthly');
      setNotes('');
    }
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      addToast('Please enter a valid amount', 'error');
      return;
    }

    try {
      setIsSavingTemplate(true);
      const payload = {
        title: title.trim(),
        category_id: parseInt(categoryId, 10),
        amount: parsedAmount,
        paid_by: parseInt(paidBy, 10),
        split_type: 'equal',
        split_members: members.map((m) => m.id),
        frequency: frequency,
        notes: notes.trim() || null,
        is_active: true
      };

      if (editingTemplate) {
        await api.updateRecurring(editingTemplate.id, payload);
        addToast('Recurring template updated!', 'success');
      } else {
        await api.createRecurring(payload);
        addToast('New recurring expense template created!', 'success');
      }

      setIsTemplateModalOpen(false);
      fetchRecurring();
    } catch (err) {
      console.error('Error saving template:', err);
      addToast(err.message || 'Failed to save recurring template', 'error');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await api.deleteRecurring(id);
      addToast('Recurring template removed', 'success');
      fetchRecurring();
    } catch (err) {
      console.error('Error deleting template:', err);
      addToast(err.message || 'Failed to delete template', 'error');
    }
  };

  const handleOpenGenerateModal = (item) => {
    setItemToGenerate(item);
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });
    setGenerateDate(todayStr);
    setGenerateDesc(`${item.title} (${monthName})`);
  };

  const handleConfirmGenerateExpense = async () => {
    if (!itemToGenerate) return;
    try {
      setIsGenerating(true);
      await api.createExpenseFromRecurring(itemToGenerate.id, {
        expense_date: generateDate,
        description: generateDesc,
      });
      addToast(`Expense for "${itemToGenerate.title}" created successfully!`, 'success');
      setItemToGenerate(null);
      navigate('/expenses');
    } catch (err) {
      console.error('Generate expense error:', err);
      addToast(err.message || 'Failed to generate expense', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Recurring Expenses</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Predefined regular flat expenses like Rent, Maid, and WiFi that you can post with one click
          </p>
        </div>

        <button
          onClick={() => handleOpenTemplateModal()}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>New Recurring Template</span>
        </button>
      </div>

      {/* Safety Notice */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-900">Duplicate Protection:</span> Recurring expenses are templates and do not
          automatically post to your accounts without confirmation. Whenever a new billing cycle arrives, simply
          click <span className="font-bold text-slate-900">"Create This Month's Expense"</span> below.
        </div>
      </div>

      {/* Templates List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
          <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-slate-500 font-medium">Loading recurring templates...</p>
        </div>
      ) : recurringList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <Repeat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No Recurring Templates Yet</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Set up standard flat expenses like monthly Rent or Cook charges.
          </p>
          <button
            onClick={() => handleOpenTemplateModal()}
            className="px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
          >
            + Create First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {recurringList.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-400/80 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200/60 uppercase">
                      {item.frequency}
                    </span>
                    <h3 className="font-black text-base text-slate-900 mt-1">{item.title}</h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenTemplateModal(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                      title="Edit Template"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                      title="Delete Template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="mt-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Standard Amount</span>
                  <span className="text-xl font-black text-slate-900 tabular-nums">{formatCurrency(item.amount)}</span>
                </div>

                {/* Details */}
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Category:</span>
                    <span className="font-semibold text-slate-800">{item.category?.name || 'Category'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Default Payer:</span>
                    <span className="font-semibold text-slate-800">{item.payer?.name || `Member ${item.paid_by}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Split Between:</span>
                    <span className="font-semibold text-slate-800">
                      All {members.length} Members (Equal)
                    </span>
                  </div>
                  {item.notes && (
                    <div className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100">
                      Note: {item.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleOpenGenerateModal(item)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <span>Create This Month's Expense</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal to Generate Expense */}
      {itemToGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Post This Month's Expense</h3>
              <button
                onClick={() => setItemToGenerate(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              This will create a new real transaction in the expense ledger and automatically distribute the split
              of <span className="font-bold">{formatCurrency(itemToGenerate.amount)}</span> across all members.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Description</label>
                <input
                  type="text"
                  value={generateDesc}
                  onChange={(e) => setGenerateDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Date</label>
                <input
                  type="date"
                  value={generateDate}
                  onChange={(e) => setGenerateDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemToGenerate(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleConfirmGenerateExpense}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? 'Creating...' : 'Confirm & Post Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Template Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {editingTemplate ? 'Edit Recurring Template' : 'New Recurring Template'}
              </h3>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Rent, Maid Service"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="12000.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Frequency *</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Bi-Monthly">Bi-Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="As Required">As Required</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category *</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Default Payer *</label>
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Due on the 1st of every month"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTemplate}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
