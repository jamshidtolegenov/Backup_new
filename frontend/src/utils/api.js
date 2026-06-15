const BASE = '/api';

// Получаем токен из localStorage (authStore синхронизирует его туда)
function getToken() {
  return localStorage.getItem('backup_auth_token') || '';
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': getToken(),
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    // Токен протух — сбрасываем и перезагружаем страницу
    localStorage.removeItem('backup_auth_token');
    window.location.reload();
    throw new Error('Сессия истекла');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Devices
  getDevices: (params = {}) => apiFetch('/devices?' + new URLSearchParams(params)),
  getDevice: (id) => apiFetch(`/devices/${id}`),
  createDevice: (data) => apiFetch('/devices', { method: 'POST', body: data }),
  updateDevice: (id, data) => apiFetch(`/devices/${id}`, { method: 'PUT', body: data }),
  deleteDevice: (id) => apiFetch(`/devices/${id}`, { method: 'DELETE' }),

  // Backup
  startBackup: (deviceIds) => apiFetch('/backup/start', { method: 'POST', body: { deviceIds } }),
  cancelBackup: (sessionId) => apiFetch(`/backup/cancel/${sessionId}`, { method: 'POST' }),
  getActiveSessions: () => apiFetch('/backup/active'),
  getSession: (sessionId) => apiFetch(`/backup/session/${sessionId}`),

  // History
  getHistory: (params = {}) => apiFetch('/history?' + new URLSearchParams(params)),
  getHistorySession: (sessionId) => apiFetch(`/history/${sessionId}`),

  // Logs
  getLogs: (params = {}) => apiFetch('/logs?' + new URLSearchParams(params)),
  exportLogs: (params = {}) => `${BASE}/logs/export?` + new URLSearchParams(params),

  // Settings
  getSettings: () => apiFetch('/settings'),
  updateSettings: (data) => apiFetch('/settings', { method: 'PUT', body: data }),
};
