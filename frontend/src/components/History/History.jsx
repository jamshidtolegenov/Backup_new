import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import styles from './History.module.css';

export default function History() {
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const LIMIT = 20;

  useEffect(() => {
    loadHistory();
  }, [page]);

  async function loadHistory() {
    try {
      const res = await api.getHistory({ limit: LIMIT, offset: page * LIMIT });
      setSessions(res.sessions || []);
      setTotal(res.total || 0);
    } catch {}
  }

  async function expand(sessionId) {
    if (expanded === sessionId) { setExpanded(null); setDetail(null); return; }
    setExpanded(sessionId);
    try {
      const res = await api.getHistorySession(sessionId);
      setDetail(res);
    } catch {}
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">История</h1>
        <p className="page-subtitle">Всего сессий: {total}</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Дата начала</th>
                <th>Дата конца</th>
                <th>Устройств</th>
                <th>Успешно</th>
                <th>Ошибки</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>История пуста</td></tr>
              ) : sessions.map(s => (
                <>
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => expand(s.id)}>
                    <td className="mono" style={{ fontSize: 12 }}>{s.started_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.finished_at?.slice(0, 16).replace('T', ' ') || '—'}</td>
                    <td>{s.total_devices}</td>
                    <td className="text-success">{s.success_count}</td>
                    <td className="text-danger">{s.fail_count}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ color: 'var(--text-muted)' }}>{expanded === s.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === s.id && detail && (
                    <tr key={`detail-${s.id}`}>
                      <td colSpan={7} style={{ padding: 0, background: 'var(--bg-elevated)' }}>
                        <div className={styles.detail}>
                          <table>
                            <thead>
                              <tr>
                                <th>Устройство</th>
                                <th>IP</th>
                                <th>Тип</th>
                                <th>Файлов</th>
                                <th>MD5</th>
                                <th>Статус</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(detail.results || []).map(r => (
                                <tr key={r.id}>
                                  <td className="mono" style={{ fontSize: 12 }}>{r.device_name}</td>
                                  <td className="mono" style={{ fontSize: 12 }}>{r.device_ip}</td>
                                  <td>
                                    <span className={`badge ${r.device_type === 'azimuth' ? 'badge-azimuth' : 'badge-olvia'}`} style={{ fontSize: 10 }}>
                                      {r.device_type === 'azimuth' ? 'SSH' : 'FTP'}
                                    </span>
                                  </td>
                                  <td>{r.file_count || 0}</td>
                                  <td>
                                    {r.md5_match === null ? '—' : r.md5_match ? (
                                      <span className="text-success">✓ OK</span>
                                    ) : (
                                      <span className="text-danger">✕ Нет</span>
                                    )}
                                  </td>
                                  <td><StatusBadge status={r.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Назад</button>
            <span className="text-muted mono" style={{ fontSize: 12 }}>{page + 1} / {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    completed: ['badge-success', 'Завершено'],
    running:   ['badge-info',    'Выполняется'],
    failed:    ['badge-danger',  'Ошибка'],
    cancelled: ['badge-warning', 'Отменено'],
    success:   ['badge-success', 'Успешно'],
    pending:   ['badge-muted',   'Ожидание'],
  };
  const [cls, label] = map[status] || ['badge-muted', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
