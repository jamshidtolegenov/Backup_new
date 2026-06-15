import { create } from 'zustand';

const TOKEN_KEY = 'backup_auth_token';

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  username: null,
  checked: false,

  async checkAuth() {
    const token = get().token;
    if (!token) {
      set({ checked: true });
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'x-auth-token': token },
      });
      if (res.ok) {
        const { username } = await res.json();
        set({ username, checked: true });
      } else {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: null, username: null, checked: true });
      }
    } catch {
      // Сеть недоступна или бэкенд не отвечает — сбрасываем сессию
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, username: null, checked: true });
    }
  },

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка входа');
    localStorage.setItem(TOKEN_KEY, data.token);
    set({ token: data.token, username: data.username, checked: true });
    return data;
  },

  async logout() {
    const token = get().token;
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-auth-token': token },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, username: null });
  },

  getToken() { return get().token; },
}));
