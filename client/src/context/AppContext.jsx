import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeMemberId, setActiveMemberId] = useState(() => {
    const saved = localStorage.getItem('flat_current_user_id') || localStorage.getItem('flat_active_member_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);

  // Global modals
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [upiModalInfo, setUpiModalInfo] = useState(null); // { toName, toUpi, amount, upiLink, notes, paymentId }

  // Toast notification state
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      setIsLoadingMeta(true);
      const [membersData, categoriesData] = await Promise.all([
        api.getMembers(),
        api.getCategories()
      ]);
      setMembers(membersData);
      setCategories(categoriesData);

      // Verify that activeMemberId still exists in membersData
      const savedId = localStorage.getItem('flat_current_user_id') || localStorage.getItem('flat_active_member_id');
      if (savedId) {
        const parsedId = parseInt(savedId, 10);
        const exists = membersData.some((m) => m.id === parsedId);
        if (exists) {
          setActiveMemberId(parsedId);
        } else {
          setActiveMemberId(null);
          localStorage.removeItem('flat_current_user_id');
          localStorage.removeItem('flat_active_member_id');
        }
      }
    } catch (err) {
      console.error('Failed to load initial metadata:', err);
      addToast('Could not load flat members and categories. Is the backend running?', 'error');
    } finally {
      setIsLoadingMeta(false);
    }
  }, [addToast]);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  const login = (memberId) => {
    const id = parseInt(memberId, 10);
    setActiveMemberId(id);
    localStorage.setItem('flat_current_user_id', id);
    localStorage.setItem('flat_active_member_id', id);
  };

  const loginWithCredentials = async (identifier, password) => {
    const res = await api.login(identifier, password);
    if (res.success && res.member) {
      setActiveMemberId(res.member.id);
      localStorage.setItem('flat_current_user_id', res.member.id);
      localStorage.setItem('flat_active_member_id', res.member.id);
      if (res.token) {
        localStorage.setItem('flat_auth_token', res.token);
      }
      return res.member;
    }
    throw new Error(res.message || 'Login failed');
  };

  const setPasswordAndLogin = async (identifier, newPassword) => {
    const res = await api.setPassword(identifier, newPassword);
    if (res.success && res.member) {
      setActiveMemberId(res.member.id);
      localStorage.setItem('flat_current_user_id', res.member.id);
      localStorage.setItem('flat_active_member_id', res.member.id);
      if (res.token) {
        localStorage.setItem('flat_auth_token', res.token);
      }
      return res.member;
    }
    throw new Error(res.message || 'Failed to set password');
  };

  const signupAndLogin = async (data) => {
    const res = await api.signup(data);
    if (res.success && res.member) {
      await refreshMeta();
      setActiveMemberId(res.member.id);
      localStorage.setItem('flat_current_user_id', res.member.id);
      localStorage.setItem('flat_active_member_id', res.member.id);
      if (res.token) {
        localStorage.setItem('flat_auth_token', res.token);
      }
      return res.member;
    }
    throw new Error(res.message || 'Sign up failed');
  };

  const logout = () => {
    setActiveMemberId(null);
    localStorage.removeItem('flat_current_user_id');
    localStorage.removeItem('flat_active_member_id');
    localStorage.removeItem('flat_auth_token');
  };

  const openAddExpense = (expenseToEdit = null) => {
    setEditingExpense(expenseToEdit);
    setIsExpenseModalOpen(true);
  };

  const closeAddExpense = () => {
    setEditingExpense(null);
    setIsExpenseModalOpen(false);
  };

  const openUpiModal = (info) => {
    setUpiModalInfo(info);
  };

  const closeUpiModal = () => {
    setUpiModalInfo(null);
  };

  const currentUser = members.find((m) => m.id === activeMemberId) || null;

  return (
    <AppContext.Provider
      value={{
        members,
        categories,
        currentUser,
        currentMemberId: activeMemberId,
        activeMemberId,
        activeMember: currentUser,
        login,
        loginWithCredentials,
        setPasswordAndLogin,
        signupAndLogin,
        logout,
        switchUser: login,
        setActiveMemberId: login,
        refreshMeta,
        isLoadingMeta,
        isExpenseModalOpen,
        editingExpense,
        openAddExpense,
        closeAddExpense,
        upiModalInfo,
        openUpiModal,
        closeUpiModal,
        toasts,
        addToast,
        removeToast
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
