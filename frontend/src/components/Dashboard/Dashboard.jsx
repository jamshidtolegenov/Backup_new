import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useSocketStore } from '../../store/socketStore';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const activeSessions = useSocketStore((s) => s.activeSessions);

  useEffect(() => {
    loadStats();
    loadHistory();
  }, []);

  async function loadStats() {
    try {
      const [devRes, histRes] = await Promise.all([
        api.getDevices(),
        api.getHistory({ limit: 100 }),
      ]);
      const azimuth = devRes.devices.filter(d => d.type === 'azimuth').length;
      const olvia = devRes.devices.filter(d => d.type === 'olvia').length;
      const sessions = histRes.sessions || [];
      const success = sessions.filter(s => s.status === 'completed').length;
      const failed = sessions.filter(s => s.status === 'failed' || s.fail_count > 0).length;
      setStats({ total: devRes.total, azimuth, olvia, sessions: sessions.length, success, failed });
    } catch {}
  }

  async function loadHistory() {
    try {
      const res = await api.getHistory({ limit: 5 });
      setRecentSessions(res.sessions || []);
    } catch {}
  }

  const runningList = Object.values(activeSessions).filter(s => s.status === 'running');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Обзор системы резервного копирования</p>
      </div>

      {/* Active sessions */}
      {runningList.length > 0 && (
        <div className={styles.activeCard}>
          <div className={styles.activeHeader}>
            <span className={styles.activeDot} />
            <span>Активное резервное копирование</span>
          </div>
          {runningList.map((session, i) => {
            const done = session.done || 0;
            const total = session.totalDevices || 1;
            const pct = Math.round((done / total) * 100);
            return (
              <div key={i} className={styles.activeProgress}>
                <div className={styles.progressMeta}>
                  <span>{done}/{total} устройств</span>
                  <span className="mono">{pct}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/backup')}>
            Перейти к бэкапу →
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className={styles.statsGrid}>
          <StatCard label="Всего устройств" value={stats.total} accent="accent" />
          <StatCard label="AZIMUTH (SSH)" value={stats.azimuth} accent="azimuth" />
          <StatCard label="OLVIA (FTP)" value={stats.olvia} accent="olvia" />
          <StatCard label="Сессий" value={stats.sessions} accent="info" />
          <StatCard label="Успешных" value={stats.success} accent="success" />
          <StatCard label="С ошибками" value={stats.failed} accent="danger" />
        </div>
      )}

      {/* Recent history */}
      <div className={`card ${styles.historyCard}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Последние сессии</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
            Все →
          </button>
        </div>
        {recentSessions.length === 0 ? (
          <p className="text-muted" style={{ padding: '20px 0', textAlign: 'center' }}>
            История пуста
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Устройств</th>
                  <th>Успешно</th>
                  <th>Ошибки</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/history')}>
                    <td className="mono" style={{ fontSize: 12 }}>{s.started_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td>{s.total_devices}</td>
                    <td className="text-success">{s.success_count}</td>
                    <td className="text-danger">{s.fail_count}</td>
                    <td><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  const colors = {
    accent: 'var(--accent)',
    azimuth: 'var(--azimuth)',
    olvia: 'var(--olvia)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    info: 'var(--info)',
  };
  return (
    <div className={`card ${styles.statCard}`} style={{ borderTopColor: colors[accent] }}>
      <div className={styles.statValue} style={{ color: colors[accent] }}>{value ?? '—'}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    completed: ['badge-success', 'Завершено'],
    running: ['badge-info', 'Выполняется'],
    failed: ['badge-danger', 'Ошибка'],
    cancelled: ['badge-warning', 'Отменено'],
  };
  const [cls, label] = map[status] || ['badge-muted', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
