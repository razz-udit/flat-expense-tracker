const API_BASE = (() => {
  if (import.meta.env?.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`;
  }
  return '/api';
})();

function getActiveUserId() {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('flat_current_user_id') || localStorage.getItem('flat_active_member_id');
  return saved ? parseInt(saved, 10) : null;
}

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('flat_auth_token') || null;
}

export function clearAppCache() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('flat_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch (_) {}
}

const inFlightRequests = new Map();

async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${API_BASE}${endpoint}`;

  // If this is a mutation, clear cached responses
  if (method !== 'GET') {
    clearAppCache();
  }

  // Deduplicate identical in-flight GET requests
  const flightKey = `${method}:${url}`;
  if (method === 'GET' && inFlightRequests.has(flightKey)) {
    return inFlightRequests.get(flightKey);
  }

  const reqPromise = (async () => {
    const activeUserId = getActiveUserId();
    const authToken = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(activeUserId ? { 'X-User-Id': String(activeUserId) } : {}),
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('flat_auth_token');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('flat_unauthorized'));
          }
        }
        let errorDetail = 'An error occurred';
        try {
          const errJson = await response.json();
          errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
        } catch (e) {
          errorDetail = await response.text();
        }
        throw new Error(errorDetail || `HTTP error ${response.status}`);
      }
      if (response.status === 204) return null;
      return await response.json();
    } catch (err) {
      console.error(`API Request failed [${method} ${endpoint}]:`, err);
      throw err;
    } finally {
      inFlightRequests.delete(flightKey);
    }
  })();

  if (method === 'GET') {
    inFlightRequests.set(flightKey, reqPromise);
  }

  return reqPromise;
}

export const api = {
  // Members
  getMembers: (includeInactive = false) => request(`/members?include_inactive=${includeInactive}`),
  getMember: (id) => request(`/members/${id}`),
  createMember: (data) => request('/members', { method: 'POST', body: JSON.stringify(data) }),
  updateMember: (id, data) => request(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),
  configureFlatSize: (data) => request('/members/configure-size', { method: 'POST', body: JSON.stringify(data) }),
  generateInvite: (memberId) => request(`/members/${memberId}/generate-invite`, { method: 'POST' }),
  getLeavePreview: (memberId) => request(`/members/${memberId}/leave-preview`),
  leaveFlat: (memberId) => request(`/members/${memberId}/leave`, { method: 'POST' }),

  // Categories
  getCategories: (includeInactive = false) => request(`/categories?include_inactive=${includeInactive}`),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  getCategoryBudgets: (params = {}) => {
    const query = new URLSearchParams();
    if (params.year) query.append('year', params.year);
    if (params.month) query.append('month', params.month);
    const qs = query.toString();
    return request(`/categories/budget-status${qs ? `?${qs}` : ''}`);
  },
  equalizeBudget: (data) => request('/categories/equalize-budget', { method: 'POST', body: JSON.stringify(data) }),

  // Expenses
  getExpenses: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const qs = query.toString();
    return request(`/expenses${qs ? `?${qs}` : ''}`);
  },
  getExpense: (id) => request(`/expenses/${id}`),
  createExpense: (data) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id, data, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/expenses/${id}${qs}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteExpense: (id, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/expenses/${id}${qs}`, { method: 'DELETE' });
  },
  evaluateExpense: (id, action, notes, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/expenses/${id}/evaluate${qs}`, {
      method: 'POST',
      body: JSON.stringify({ action, notes })
    });
  },
  uploadReceipt: async (file) => {
    const activeUserId = getActiveUserId();
    const authToken = getAuthToken();
    const formData = new FormData();
    formData.append('file', file);
    const headers = {
      ...(activeUserId ? { 'X-User-Id': String(activeUserId) } : {}),
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    };
    const response = await fetch(`${API_BASE}/expenses/upload-receipt`, {
      method: 'POST',
      body: formData,
      headers
    });
    if (!response.ok) {
      throw new Error('Failed to upload receipt screenshot');
    }
    return await response.json();
  },
  disputeExpense: (id, reason) =>
    request(`/expenses/${id}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  resolveDispute: (id, action, resolutionNotes = '') =>
    request(`/expenses/${id}/resolve-dispute`, {
      method: 'POST',
      body: JSON.stringify({ action, resolution_notes: resolutionNotes }),
    }),
  getExpenseReceiptUrl: (id) => {
    const token = getAuthToken();
    return `${API_BASE}/expenses/${id}/receipt${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // Payments / Settlements
  getPayments: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const qs = query.toString();
    return request(`/payments${qs ? `?${qs}` : ''}`);
  },
  createPayment: (data, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/payments${qs}`, { method: 'POST', body: JSON.stringify(data) });
  },
  updatePayment: (id, data, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/payments/${id}${qs}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deletePayment: (id, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/payments/${id}${qs}`, { method: 'DELETE' });
  },
  verifyPayment: (id, userId) => {
    const uid = userId || getActiveUserId();
    const qs = uid ? `?user_id=${uid}` : '';
    return request(`/payments/${id}/verify${qs}`, { method: 'POST' });
  },

  // Recurring
  getRecurring: () => request('/recurring'),
  createRecurring: (data) => request('/recurring', { method: 'POST', body: JSON.stringify(data) }),
  updateRecurring: (id, data) => request(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecurring: (id) => request(`/recurring/${id}`, { method: 'DELETE' }),
  createExpenseFromRecurring: (id, payload) =>
    request(`/recurring/${id}/create-expense`, { method: 'POST', body: JSON.stringify(payload || {}) }),

  // Dashboard & Analytics
  getDashboard: (params = {}) => {
    const query = new URLSearchParams();
    if (params.viewer_id) query.append('viewer_id', params.viewer_id);
    if (params.year) query.append('year', params.year);
    if (params.month) query.append('month', params.month);
    const qs = query.toString();
    return request(`/dashboard${qs ? `?${qs}` : ''}`);
  },
  getBalances: () => request('/balances'),
  getSettlements: () => request('/settlements'),
  getMonthlyHistory: () => request('/monthly-history'),
  getMonthlySummary: (year, month) => request(`/monthly-summary/${year}/${month}`),
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit);
    if (params.offset) query.append('offset', params.offset);
    const qs = query.toString();
    return request(`/audit-logs${qs ? `?${qs}` : ''}`);
  },
  getExportExpensesCsvUrl: (params = {}) => {
    const query = new URLSearchParams();
    const token = getAuthToken();
    if (token) query.append('token', token);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString();
    return `${API_BASE}/export/expenses/csv${qs ? `?${qs}` : ''}`;
  },
  getAdminBackupUrl: () => {
    const token = getAuthToken();
    return `${API_BASE}/admin/backup${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // Authentication
  googleAuth: (payload) =>
    request('/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  signup: (data) =>
    request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (identifier, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  claimAccount: (token, password) =>
    request('/auth/claim', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  setPassword: (identifier, newPassword) =>
    request('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ identifier, new_password: newPassword }),
    }),
  changePassword: (memberId, currentPassword, newPassword) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        member_id: memberId,
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),
  verifyAdmin: (adminPassword) =>
    request('/auth/verify-admin', {
      method: 'POST',
      body: JSON.stringify({ admin_password: adminPassword }),
    }),
  adminResetPassword: (adminMemberId, adminPassword, targetMemberId, newPassword) =>
    request('/auth/admin-reset-password', {
      method: 'POST',
      body: JSON.stringify({
        admin_member_id: adminMemberId,
        admin_password: adminPassword,
        target_member_id: targetMemberId,
        new_password: newPassword,
      }),
    }),

  // Database Reset
  resetData: () => request('/reset-data', { method: 'POST' }),
};

export function getReceiptFullUrl(url, expenseId) {
  const token = getAuthToken();
  if (expenseId) {
    return `${API_BASE}/expenses/${expenseId}/receipt${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (import.meta.env?.VITE_API_URL) {
    const base = import.meta.env.VITE_API_URL.replace(/\/$/, '').replace(/\/api$/, '');
    return `${base}${url}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  return `${url}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
