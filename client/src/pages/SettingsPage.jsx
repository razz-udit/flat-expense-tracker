import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { 
  Users, 
  Tags, 
  Database, 
  Edit3, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  AlertTriangle, 
  Lock, 
  KeyRound, 
  ShieldCheck 
} from 'lucide-react';

export default function SettingsPage() {
  const { members, categories, currentUser, refreshMeta, addToast } = useApp();

  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'categories' | 'security' | 'data'

  // Admin access control for flat members
  const isDefaultAdmin = currentUser && members.length > 0 && currentUser.id === members[0].id;
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState('');

  const canManageMembers = isDefaultAdmin || isAdminUnlocked;

  const handleVerifyAdminPin = async (e) => {
    e.preventDefault();
    setAdminPinError('');
    if (!adminPinInput) return;
    try {
      await api.verifyAdmin(adminPinInput);
      setIsAdminUnlocked(true);
      setIsAdminPinModalOpen(false);
      setAdminPinInput('');
      setAdminPinError('');
      addToast('Flat Admin mode unlocked!', 'success');
    } catch (err) {
      setAdminPinError(err.message || 'Incorrect Flat Admin password.');
    }
  };

  // Personal Password Change State
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Admin Roommate Password Reset State
  const [adminResetTargetId, setAdminResetTargetId] = useState('');
  const [adminResetNewPassword, setAdminResetNewPassword] = useState('');
  const [adminPasswordForReset, setAdminPasswordForReset] = useState('');
  const [isAdminResetting, setIsAdminResetting] = useState(false);

  // Member Edit State
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberUpi, setMemberUpi] = useState('');
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberUpi, setNewMemberUpi] = useState('');

  // Category Edit State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDesc, setCategoryDesc] = useState('');

  // Reset confirmation state
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Flat Size Configuration State
  const [isFlatSizeModalOpen, setIsFlatSizeModalOpen] = useState(false);
  const [customFlatSize, setCustomFlatSize] = useState(6);
  const [flatMembersDraft, setFlatMembersDraft] = useState([]);
  const [isSavingFlatSize, setIsSavingFlatSize] = useState(false);

  const handleFlatSizeChange = (newSize) => {
    const size = Math.max(2, Math.min(20, newSize));
    setCustomFlatSize(size);
    setFlatMembersDraft((prev) => {
      const draft = [...prev];
      if (size > draft.length) {
        for (let i = draft.length; i < size; i++) {
          draft.push({
            name: `Member ${i + 1}`,
            upi_id: `member${i + 1}@upi`,
            email: `member${i + 1}@flat.local`,
          });
        }
      } else if (size < draft.length) {
        return draft.slice(0, size);
      }
      return draft;
    });
  };

  const handleSaveFlatSize = async () => {
    try {
      setIsSavingFlatSize(true);
      await api.configureFlatSize({
        count: customFlatSize,
        members: flatMembersDraft,
      });
      addToast(`Flat size set to ${customFlatSize} members successfully!`, 'success');
      setIsFlatSizeModalOpen(false);
      refreshMeta();
    } catch (err) {
      console.error('Error saving flat size:', err);
      addToast(err.message || 'Failed to update flat size', 'error');
    } finally {
      setIsSavingFlatSize(false);
    }
  };

  const startEditMember = (m) => {
    setEditingMemberId(m.id);
    setMemberName(m.name);
    setMemberEmail(m.email || '');
    setMemberUpi(m.upi_id || '');
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setMemberName('');
    setMemberEmail('');
    setMemberUpi('');
  };

  const handleSaveMember = async (id) => {
    if (!memberName.trim()) {
      addToast('Member name cannot be empty', 'error');
      return;
    }

    try {
      await api.updateMember(id, {
        name: memberName.trim(),
        email: memberEmail.trim() || null,
        upi_id: memberUpi.trim() || null,
      });
      addToast('Member updated successfully!', 'success');
      setEditingMemberId(null);
      refreshMeta();
    } catch (err) {
      console.error('Error updating member:', err);
      addToast(err.message || 'Failed to update member', 'error');
    }
  };

  const handleCreateMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    try {
      await api.createMember({
        name: newMemberName.trim(),
        email: newMemberEmail.trim() || null,
        upi_id: newMemberUpi.trim() || null,
      });
      addToast('New member added!', 'success');
      setIsNewMemberModalOpen(false);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberUpi('');
      refreshMeta();
    } catch (err) {
      console.error('Error creating member:', err);
      addToast(err.message || 'Failed to add member', 'error');
    }
  };

  const handleDeleteMember = async (id) => {
    try {
      const res = await api.deleteMember(id);
      addToast(res.message || 'Member removed', 'info');
      refreshMeta();
    } catch (err) {
      console.error('Error deleting member:', err);
      addToast(err.message || 'Failed to remove member', 'error');
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    try {
      if (editingCategoryId) {
        await api.updateCategory(editingCategoryId, {
          name: categoryName.trim(),
          description: categoryDesc.trim() || null,
        });
        addToast('Category updated!', 'success');
      } else {
        await api.createCategory({
          name: categoryName.trim(),
          description: categoryDesc.trim() || null,
        });
        addToast('Custom category created!', 'success');
      }
      setIsCategoryModalOpen(false);
      setEditingCategoryId(null);
      setCategoryName('');
      setCategoryDesc('');
      refreshMeta();
    } catch (err) {
      console.error('Category save error:', err);
      addToast(err.message || 'Failed to save category', 'error');
    }
  };

  const handleDeleteCategory = async (id) => {
    try {
      const res = await api.deleteCategory(id);
      addToast(res.message || 'Category removed', 'info');
      refreshMeta();
    } catch (err) {
      console.error('Error deleting category:', err);
      addToast(err.message || 'Failed to delete category', 'error');
    }
  };

  const handleResetData = async () => {
    try {
      setIsResetting(true);
      await api.resetData();
      addToast('All expenses and payments cleared. Fresh flat state restored.', 'success');
      setIsResetConfirmOpen(false);
      refreshMeta();
    } catch (err) {
      console.error('Reset error:', err);
      addToast(err.message || 'Failed to reset data', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeSuccess('');

    if (!newPasswordInput || newPasswordInput.length < 4) {
      setPasswordChangeError('New password must be at least 4 characters long.');
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      setPasswordChangeError('New passwords do not match.');
      return;
    }

    try {
      setIsChangingPassword(true);
      await api.changePassword(currentUser.id, currentPasswordInput, newPasswordInput);
      setPasswordChangeSuccess('Your password has been changed successfully!');
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      addToast('Password updated!', 'success');
    } catch (err) {
      console.error('Password change error:', err);
      setPasswordChangeError(err.message || 'Failed to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    if (!adminResetTargetId || !adminResetNewPassword) return;

    try {
      setIsAdminResetting(true);
      await api.adminResetPassword(
        currentUser.id,
        adminPasswordForReset,
        parseInt(adminResetTargetId, 10),
        adminResetNewPassword
      );
      addToast('Roommate password reset successfully!', 'success');
      setAdminResetTargetId('');
      setAdminResetNewPassword('');
      setAdminPasswordForReset('');
    } catch (err) {
      console.error('Admin reset password error:', err);
      addToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setIsAdminResetting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Flat Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure flat members, UPI payment IDs, expense categories, and data management
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-2xl">
        <button
          onClick={() => setActiveTab('members')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'members'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Flat Members & UPI IDs ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tags className="w-4 h-4" />
          <span>Expense Categories ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'security'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Account Security</span>
        </button>

        <button
          onClick={() => setActiveTab('data')}
          className={`py-3.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'data'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Data Management</span>
        </button>
      </div>

      {/* Tab 1: Flat Members */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Admin Banner or Restricted Notice */}
          {canManageMembers ? (
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  {members.length}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Flat Members: {members.length} {members.length === 1 ? 'Flatmate' : 'Flatmates'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Manage flatmates dynamically. Roommates can register directly via Sign Up, or you can add them below.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsNewMemberModalOpen(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Roommate</span>
              </button>
            </div>
          ) : (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-amber-900 uppercase tracking-wide">
                    Member Management Restricted to Admin
                  </h3>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Only the Flat Admin can resize the flat or remove members. You can update your own profile details below.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setAdminPinError('');
                  setAdminPinInput('');
                  setIsAdminPinModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Admin Unlock</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Customize member names and UPI IDs for seamless QR code generation and settlements.
            </p>
            {canManageMembers && (
              <button
                onClick={() => setIsNewMemberModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="divide-y divide-slate-100">
              {members.map((m) => {
                const isEditing = editingMemberId === m.id;
                return (
                  <div key={m.id} className="p-4 hover:bg-slate-50 transition-colors">
                    {isEditing ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={memberName}
                            onChange={(e) => setMemberName(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-indigo-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                            UPI ID (for payments)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. member@okhdfcbank"
                            value={memberUpi}
                            onChange={(e) => setMemberUpi(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-4 sm:pt-0">
                          <button
                            onClick={cancelEditMember}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSaveMember(m.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm">
                            {m.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-900">{m.name}</div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              {m.upi_id ? (
                                <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[11px] font-semibold">
                                  {m.upi_id}
                                </span>
                              ) : (
                                <span className="text-amber-600 text-[11px]">No UPI ID configured</span>
                              )}
                              {m.email && <span>• {m.email}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {(canManageMembers || (currentUser && m.id === currentUser.id)) && (
                            <button
                              onClick={() => startEditMember(m)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              title="Edit Member"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canManageMembers && (
                            <button
                              onClick={() => handleDeleteMember(m.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Remove Member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Expense Categories */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Manage initial default categories and create custom categories for your flat.
            </p>
            <button
              onClick={() => {
                setEditingCategoryId(null);
                setCategoryName('');
                setCategoryDesc('');
                setIsCategoryModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Category</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {categories.map((c) => (
              <div
                key={c.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
              >
                <div>
                  <h3 className="font-bold text-xs text-slate-900">{c.name}</h3>
                  {c.description && <p className="text-[11px] text-slate-500 mt-0.5">{c.description}</p>}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingCategoryId(c.id);
                      setCategoryName(c.name);
                      setCategoryDesc(c.description || '');
                      setIsCategoryModalOpen(true);
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(c.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Personal Security & Passwords */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Change My Password */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <KeyRound className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900">Change Your Password</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Update the personal password used to log in to your flatmate account ({currentUser?.name}).
            </p>

            {passwordChangeSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                {passwordChangeSuccess}
              </div>
            )}
            {passwordChangeError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {passwordChangeError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password (if set)
                </label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (min 4 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="Enter new password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="Confirm new password"
                  value={confirmNewPasswordInput}
                  onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isChangingPassword}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isChangingPassword ? 'Updating...' : 'Update My Password'}
              </button>
            </form>
          </div>

          {/* Admin Roommate Password Reset (Only for Admin) */}
          {isDefaultAdmin ? (
            <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-amber-700">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="font-bold text-sm text-slate-900">Admin: Reset Roommate's Password</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                As the Flat Admin, you can set or reset the password for any flatmate if they forgot their credentials.
              </p>

              <form onSubmit={handleAdminResetPassword} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Roommate
                  </label>
                  <select
                    required
                    value={adminResetTargetId}
                    onChange={(e) => setAdminResetTargetId(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="">-- Choose roommate --</option>
                    {members
                      .filter((m) => currentUser && m.id !== currentUser.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.email || `Member ${m.id}`})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password for Roommate
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Enter new password for roommate"
                    value={adminResetNewPassword}
                    onChange={(e) => setAdminResetNewPassword(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Admin Password (to authorize)
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your admin password"
                    value={adminPasswordForReset}
                    onChange={(e) => setAdminPasswordForReset(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAdminResetting || !adminResetTargetId}
                  className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isAdminResetting ? 'Resetting...' : "Reset Roommate's Password"}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-slate-400" />
              <h4 className="font-bold text-xs text-slate-700">Flat Password Administration</h4>
              <p className="text-xs text-slate-500 max-w-xs">
                Need your password reset? Ask your Flat Admin ({members[0]?.name || 'Admin'}) to reset it for you.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Data Management */}
      {activeTab === 'data' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Flat System Overview Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-600">
              <Database className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900">Flat Database Status</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your flat management system is operating with real-time decimal precision calculations.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Active Members</span>
                <span className="text-base font-extrabold text-slate-900">{members.length} Flatmates</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Categories</span>
                <span className="text-base font-extrabold text-slate-900">{categories.length} Categories</span>
              </div>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                <Check className="w-3.5 h-3.5" /> Database Operational
              </span>
            </div>
          </div>

          {/* Reset Database Card */}
          <div className="bg-white p-5 rounded-2xl border border-rose-100 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900">Reset Flat Data</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Wipes all recorded expenses, member splits, and settlements. Resets the database to a completely clean
              slate while preserving your flat members and expense categories.
            </p>
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset to Clean Flat State</span>
            </button>
          </div>
        </div>
      )}

      {/* Category Modal (Add / Edit) */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">
                {editingCategoryId ? 'Edit Category' : 'Add Custom Category'}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Society Club Charges"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Brief description of the category"
                  value={categoryDesc}
                  onChange={(e) => setCategoryDesc(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Member Modal */}
      {isNewMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Add Flat Member</h3>
              <button
                onClick={() => setIsNewMemberModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Member 7 / Rahul"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">UPI ID</label>
                <input
                  type="text"
                  placeholder="e.g. rahul@oksbi"
                  value={newMemberUpi}
                  onChange={(e) => setNewMemberUpi(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email</label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewMemberModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base text-slate-900">Confirm Reset Data?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete all expense transactions, member splits, and settlements. Your 6 flat
              members and 11 categories will be kept intact.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleResetData}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isResetting ? 'Resetting...' : 'Yes, Reset Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flat Size & Members Configuration Modal */}
      {isFlatSizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full my-8 border border-slate-100 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Users className="w-6 h-6" />
                <div>
                  <h3 className="font-bold text-base">Configure Flat Size & Members</h3>
                  <p className="text-xs text-indigo-100">Set how many people share the flat and their details</p>
                </div>
              </div>
              <button
                onClick={() => setIsFlatSizeModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Stepper Control */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    Number of Flatmates
                  </label>
                  <span className="text-xs text-slate-500">Choose between 2 and 20 members</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={customFlatSize <= 2}
                    onClick={() => handleFlatSizeChange(customFlatSize - 1)}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-base flex items-center justify-center cursor-pointer shadow-xs"
                  >
                    -
                  </button>
                  <span className="text-2xl font-black text-indigo-700 w-10 text-center">
                    {customFlatSize}
                  </span>
                  <button
                    type="button"
                    disabled={customFlatSize >= 20}
                    onClick={() => handleFlatSizeChange(customFlatSize + 1)}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-base flex items-center justify-center cursor-pointer shadow-xs"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Members List */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Member Details ({flatMembersDraft.length} People)
                </div>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {flatMembersDraft.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-2.5"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>

                      <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder={`Member ${idx + 1} Name`}
                          value={m.name || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFlatMembersDraft((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], name: val };
                              return next;
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />

                        <input
                          type="text"
                          placeholder="UPI ID (e.g. name@upi)"
                          value={m.upi_id || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFlatMembersDraft((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], upi_id: val };
                              return next;
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setIsFlatSizeModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingFlatSize}
                onClick={handleSaveFlatSize}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingFlatSize ? 'Saving...' : `Apply Flat Size (${customFlatSize} Members)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Unlock Modal */}
      {isAdminPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-100 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-amber-700">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Admin Authentication</h3>
              </div>
              <button
                onClick={() => setIsAdminPinModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Enter the Flat Admin ({members[0]?.name || 'Admin'})'s password to unlock flat resizing and member administration.
            </p>

            {adminPinError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {adminPinError}
              </div>
            )}

            <form onSubmit={handleVerifyAdminPin} className="space-y-4">
              <div>
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Enter Flat Admin password"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  className="w-full text-center text-sm font-semibold py-2.5 px-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdminPinModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Verify & Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
