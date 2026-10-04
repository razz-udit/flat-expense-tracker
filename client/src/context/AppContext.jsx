import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [members, setMembers] = useState(() => {
    try {
      const cached = localStorage.getItem('flat_cached_members');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [categories, setCategories] = useState(() => {
    try {
      const cached = localStorage.getItem('flat_cached_categories');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [activeMemberId, setActiveMemberId] = useState(() => {
    const saved = localStorage.getItem('flat_current_user_id') || localStorage.getItem('flat_active_member_id');
    return saved ? parseInt(saved, 10) : null;
  });

  // Only show full-page bootstrap loading on first visit when no cached metadata exists
  const [isLoadingMeta, setIsLoadingMeta] = useState(() => {
    try {
      const cached = localStorage.getItem('flat_cached_members');
      return !(cached && JSON.parse(cached).length > 0);
    } catch {
      return true;
    }
  });

  // Global modals
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [upiModalInfo, setUpiModalInfo] = useState(null); // { toName, toUpi, amount, upiLink, notes, paymentId }

  // PWA Installation State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstallPrompt, setCanInstallPrompt] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  });

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

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

  const refreshMeta = useCallback(async (options = {}) => {
    const shouldShowLoader = options.forceLoading;
    if (shouldShowLoader) {
      setIsLoadingMeta(true);
    }

    try {
      const [membersData, categoriesData] = await Promise.all([
        api.getMembers(),
        api.getCategories()
      ]);
      setMembers(membersData);
      setCategories(categoriesData);

      try {
        localStorage.setItem('flat_cached_members', JSON.stringify(membersData));
        localStorage.setItem('flat_cached_categories', JSON.stringify(categoriesData));
      } catch (_) {}

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
    throw new Error(res.message || 'Signup failed');
  };

  const loginWithGoogle = async (googlePayload) => {
    const res = await api.googleAuth(googlePayload);
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
    throw new Error(res.message || 'Google sign-in failed');
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
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'expense' }, '');
    }
  };

  const closeAddExpense = () => {
    setEditingExpense(null);
    setIsExpenseModalOpen(false);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'expense') {
      window.history.back();
    }
  };

  const openUpiModal = (info) => {
    setUpiModalInfo(info);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'upi' }, '');
    }
  };

  const closeUpiModal = () => {
    setUpiModalInfo(null);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'upi') {
      window.history.back();
    }
  };

  const openInstallModal = () => {
    setIsInstallModalOpen(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'install' }, '');
    }
  };

  const closeInstallModal = () => {
    setIsInstallModalOpen(false);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'install') {
      window.history.back();
    }
  };

  const promptInstall = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          addToast('Thank you for installing FlatMatePay! Launch it from your home screen.', 'success');
        }
        setDeferredPrompt(null);
        setCanInstallPrompt(false);
      } catch (err) {
        console.error('Install prompt error:', err);
        openInstallModal();
      }
    } else {
      openInstallModal();
    }
  };

  // Hardware Back Button Interception for Android / Mobile
  useEffect(() => {
    let lastBackPressTime = 0;

    const handlePopState = () => {
      // 1. If any global modal is open, close it without exiting the app
      if (isExpenseModalOpen) {
        setIsExpenseModalOpen(false);
        setEditingExpense(null);
        return;
      }
      if (upiModalInfo) {
        setUpiModalInfo(null);
        return;
      }
      if (isInstallModalOpen) {
        setIsInstallModalOpen(false);
        return;
      }

      // 2. If on root path '/', prevent accidental exit with double-press confirmation
      if (typeof window !== 'undefined' && window.location.pathname === '/') {
        const now = Date.now();
        if (now - lastBackPressTime < 2500) {
          // Second back press within 2.5s: allow normal browser exit
          return;
        }
        // First back press: keep user in app and prompt
        lastBackPressTime = now;
        window.history.pushState({ app: 'flatmatepay', root: true }, '');
        addToast('Press back again to exit FlatMatePay', 'info');
      }
    };

    // Initialize root history entry so back button doesn't immediately exit
    if (typeof window !== 'undefined' && !window.history.state) {
      window.history.replaceState({ app: 'flatmatepay', root: true }, '');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isExpenseModalOpen, upiModalInfo, isInstallModalOpen, addToast]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPrompt(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstallPrompt(false);
      setDeferredPrompt(null);
      setIsInstallModalOpen(false);
      addToast('FlatMatePay was installed successfully! 📱', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [addToast]);

  const currentUser = React.useMemo(() => {
    return members.find((m) => m.id === activeMemberId) || null;
  }, [members, activeMemberId]);

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
        loginWithGoogle,
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
        isInstallModalOpen,
        openInstallModal,
        closeInstallModal,
        promptInstall,
        canInstallPrompt,
        isInstalled,
        isIOS,
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
