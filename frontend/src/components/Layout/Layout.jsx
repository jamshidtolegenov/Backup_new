import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useSocketStore } from '../../store/socketStore';
import { useAuthStore } from '../../store/authStore';
import styles from './Layout.module.css';

const NAV = [
  { to: '/dashboard', icon: '⬡', label: 'Dashboard' },
  { to: '/devices',   icon: '◈', label: 'Устройства' },
  { to: '/backup',    icon: '▶', label: 'Бэкап' },
  { to: '/history',   icon: '◷', label: 'История' },
  { to: '/logs',      icon: '≡', label: 'Логи' },
  { to: '/settings',  icon: '⚙', label: 'Настройки' },
];

export default function Layout() {
  const connected = useSocketStore((s) => s.connected);
  const activeSessions = useSocketStore((s) => s.activeSessions);
  const runningCount = Object.values(activeSessions).filter(s => s.status === 'running').length;
  const logout = useAuthStore((s) => s.logout);
  const username = useAuthStore((s) => s.username);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>◈</span>
          <span className={styles.logoText}>BackupOS</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.navLabel}>{label}</span>
              {to === '/backup' && runningCount > 0 && (
                <span className={styles.badge}>{runningCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          {username && (
            <div className={styles.userInfo}>
              <span className={styles.userIcon}>◉</span>
              <span className={styles.userName}>{username}</span>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={handleLogout} title="Выйти">
            ⏻
          </button>
        </div>

        <div className={styles.statusBar}>
          <span className={`${styles.dot} ${connected ? styles.dotOn : styles.dotOff}`} />
          <span className={styles.statusText}>
            {connected ? 'Подключено' : 'Нет связи'}
          </span>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
