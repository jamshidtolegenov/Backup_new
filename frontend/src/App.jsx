import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSocketStore } from './store/socketStore';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout/Layout';
import Login from './components/Login/Login';
import Dashboard from './components/Dashboard/Dashboard';
import Devices from './components/Devices/Devices';
import Backup from './components/Backup/Backup';
import History from './components/History/History';
import Logs from './components/Logs/Logs';
import Settings from './components/Settings/Settings';

// Защищённый маршрут: если не авторизован — редирект на /login
function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  const checked = useAuthStore((s) => s.checked);
  if (!checked) return null; // ожидаем проверку сессии
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const init = useSocketStore((s) => s.init);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    checkAuth();
  }, []);

  // Инициализируем сокет только после авторизации
  useEffect(() => {
    if (token) init();
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="devices" element={<Devices />} />
          <Route path="backup" element={<Backup />} />
          <Route path="history" element={<History />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
