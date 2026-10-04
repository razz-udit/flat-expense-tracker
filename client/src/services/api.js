const API_BASE = (import.meta.env?.VITE_API_URL ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api` : '') || '/api';

function getActiveUserId() {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('flat_current_user_id') || localStorage.getItem('flat_active_member_id');
  return saved ? parseInt(saved, 10) : null;
}

function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('flat_auth_token') || null;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
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
    console.error(`API Request failed [${options.method || 'GET'} ${endpoint}]:`, err);
    throw err;
  }
}

export const api = {
  // Members
  getMembers: (includeInactive = false) => request(`/members?include_inactive=${includeInactive}`),
  getMember: (id) => request(`/members/${id}`),
  createMember: (data) => request('/members', { method: 'POST', body: JSON.stringify(data) }),
  updateMember: (id, data) => request(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),
  configureFlatSize: (data) => request('/members/configure-size', { method: 'POST', body: JSON.stringify(data) }),

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
  createPayment: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
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
