import { create } from 'zustand';
import { io } from 'socket.io-client';

let socket = null;

function getSocket() {
  if (!socket) {
    const token = localStorage.getItem('backup_auth_token') || '';
    socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });
  }
  return socket;
}

// Сброс сокета при выходе (вызывается из authStore через logout)
export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export const useSocketStore = create((set, get) => ({
  connected: false,
  activeSessions: {},   // sessionId -> { totalDevices, devices: {}, status }

  init() {
    const s = getSocket();
    s.on('connect', () => set({ connected: true }));
    s.on('disconnect', () => set({ connected: false }));

    s.on('session:start', ({ sessionId, totalDevices }) => {
      set((state) => ({
        activeSessions: {
          ...state.activeSessions,
          [sessionId]: { totalDevices, done: 0, successCount: 0, failCount: 0, devices: {}, status: 'running' },
        },
      }));
    });

    s.on('device:start', ({ sessionId, resultId, deviceId, deviceName, deviceIp, deviceType, index, total }) => {
      set((state) => {
        const session = state.activeSessions[sessionId];
        if (!session) return state;
        return {
          activeSessions: {
            ...state.activeSessions,
            [sessionId]: {
              ...session,
              devices: {
                ...session.devices,
                [deviceId]: { resultId, deviceId, deviceName, deviceIp, deviceType, status: 'running', index, total, logs: [] },
              },
            },
          },
        };
      });
    });

    s.on('device:progress', ({ sessionId, deviceId, ...data }) => {
      set((state) => {
        const session = state.activeSessions[sessionId];
        if (!session) return state;
        const dev = session.devices[deviceId];
        if (!dev) return state;
        return {
          activeSessions: {
            ...state.activeSessions,
            [sessionId]: {
              ...session,
              devices: {
                ...session.devices,
                [deviceId]: { ...dev, logs: [...(dev.logs || []).slice(-49), data] },
              },
            },
          },
        };
      });
    });

    s.on('device:done', ({ sessionId, deviceId, status, fileCount, error }) => {
      set((state) => {
        const session = state.activeSessions[sessionId];
        if (!session) return state;
        const dev = session.devices[deviceId];
        return {
          activeSessions: {
            ...state.activeSessions,
            [sessionId]: {
              ...session,
              done: session.done + 1,
              successCount: session.successCount + (status === 'success' ? 1 : 0),
              failCount: session.failCount + (status === 'failed' ? 1 : 0),
              devices: {
                ...session.devices,
                [deviceId]: { ...dev, status, fileCount, error },
              },
            },
          },
        };
      });
    });

    s.on('session:done', ({ sessionId, status, successCount, failCount }) => {
      set((state) => {
        const session = state.activeSessions[sessionId];
        if (!session) return state;
        return {
          activeSessions: {
            ...state.activeSessions,
            [sessionId]: { ...session, status, successCount, failCount },
          },
        };
      });
    });
  },

  getSocket,
}));
