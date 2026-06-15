import { useEffect, useState, useRef } from 'react';
import { api } from '../../utils/api';
import { useSocketStore } from '../../store/socketStore';
import styles from './Backup.module.css';

export default function Backup() {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState(false);
  const activeSessions = useSocketStore((s) => s.activeSessions);

  useEffect(() => { loadDevices(); }, []);

  async function loadDevices() {
    try {
      const res = await api.getDevices({ enabled: 'true' });
      setDevices(res.devices || []);
    } catch {}
  }

  const filtered = devices.filter(d => {
    if (typeFilter && d.type !== typeFilter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.ip.includes(search)) return false;
    return true;
  });

  function toggleDevice(id) {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map(d => d.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function startBackup() {
    if (selected.size === 0) return;
    setStarting(true);
    try {
      await api.startBackup([...selected]);
    } catch (e) {
      alert('Ошибка запуска: ' + e.message);
    } finally {
      setStarting(false);
    }
  }

  const runningSessions = Object.entries(activeSessions).filter(([, s]) => s.status === 'running');
  const doneSessions = Object.entries(activeSessions).filter(([, s]) => s.status !== 'running');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Резервное копирование</h1>
        <p className="page-subtitle">Выберите устройства и запустите бэкап</p>
      </div>

      {/* Active sessions */}
      {runningSessions.map(([id, session]) => (
        <SessionProgress key={id} sessionId={id} session={session} />
      ))}

      {/* Completed sessions */}
      {doneSessions.map(([id, session]) => (
        <SessionSummary key={id} sessionId={id} session={session} />
      ))}

      {/* Device selection */}
      <div className={`card ${styles.selectionCard}`}>
        <div className={styles.selectionHeader}>
          <div className={styles.selectionTitle}>
            Выбрано: <span className="text-accent">{selected.size}</span> / {filtered.length}
          </div>
          <div className={styles.selectionActions}>
            <div className={styles.filters}>
              <input
                className="input"
                placeholder="Поиск..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: 180 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {['', 'azimuth', 'olvia'].map(t => (
                  <button
                    key={t}
                    className={`btn btn-ghost btn-sm ${typeFilter === t ? styles.activeFilter : ''}`}
                    onClick={() => setTypeFilter(t)}
                  >
                    {t === '' ? 'Все' : t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>Выбрать все</button>
              <button className="btn btn-ghost btn-sm" onClick={selectNone}>Снять выбор</button>
            </div>
          </div>
        </div>

        <div className={styles.deviceGrid}>
          {filtered.map(d => (
            <DeviceCard
              key={d.id}
              device={d}
              selected={selected.has(d.id)}
              onToggle={() => toggleDevice(d.id)}
            />
          ))}
        </div>

        <div className={styles.launchBar}>
          <span className="text-secondary" style={{ fontSize: 13 }}>
            {selected.size === 0 ? 'Выберите устройства для бэкапа' : `${selected.size} устройств выбрано`}
          </span>
          <button
            className="btn btn-primary btn-lg"
            disabled={selected.size === 0 || starting || runningSessions.length > 0}
            onClick={startBackup}
          >
            {starting ? (
              <><span className="animate-spin">◌</span> Запуск...</>
            ) : runningSessions.length > 0 ? (
              '⏸ Бэкап выполняется'
            ) : (
              '▶ Запустить бэкап'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ device, selected, onToggle }) {
  return (
    <div
      className={`${styles.deviceCard} ${selected ? styles.deviceSelected : ''}`}
      onClick={onToggle}
    >
      <div className={styles.deviceCheckbox}>
        {selected ? '☑' : '☐'}
      </div>
      <div className={styles.deviceInfo}>
        <div className={styles.deviceCardName}>{device.name}</div>
        <div className={styles.deviceCardIp}>{device.ip}</div>
      </div>
      <span className={`badge ${device.type === 'azimuth' ? 'badge-azimuth' : 'badge-olvia'}`} style={{ fontSize: 10 }}>
        {device.type === 'azimuth' ? 'SSH' : 'FTP'}
      </span>
    </div>
  );
}

function SessionProgress({ sessionId, session }) {
  const done = session.done || 0;
  const total = session.totalDevices || 1;
  const pct = Math.round((done / total) * 100);
  const devices = Object.values(session.devices || {});

  async function cancel() {
    await api.cancelBackup(sessionId);
  }

  return (
    <div className={styles.sessionCard}>
      <div className={styles.sessionHeader}>
        <div className={styles.sessionTitle}>
          <span className={styles.activeDot} />
          Бэкап выполняется
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono text-secondary" style={{ fontSize: 12 }}>{done}/{total}</span>
          <button className="btn btn-danger btn-sm" onClick={cancel}>Отмена</button>
        </div>
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.devicesList}>
        {devices.slice(-8).map((dev) => (
          <DeviceRow key={dev.deviceId} dev={dev} />
        ))}
      </div>
    </div>
  );
}

function DeviceRow({ dev }) {
  const icons = { running: '⟳', success: '✓', failed: '✕', pending: '○' };
  const colors = { running: 'var(--accent)', success: 'var(--success)', failed: 'var(--danger)', pending: 'var(--text-muted)' };
  const lastLog = dev.logs?.[dev.logs.length - 1];

  return (
    <div className={styles.deviceRow}>
      <span style={{ color: colors[dev.status], fontSize: 13, animation: dev.status === 'running' ? 'spin 0.8s linear infinite' : undefined, display: 'inline-block' }}>
        {icons[dev.status] || '○'}
      </span>
      <span className="mono" style={{ fontSize: 12, flex: 1 }}>{dev.deviceName}</span>
      <span className="mono text-muted" style={{ fontSize: 11 }}>{dev.deviceIp}</span>
      {lastLog && (
        <span className="text-muted" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastLog.message || lastLog.type}
        </span>
      )}
    </div>
  );
}

function SessionSummary({ sessionId, session }) {
  return (
    <div className={`${styles.sessionCard} ${styles.doneCard}`}>
      <div className={styles.sessionHeader}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: session.failCount > 0 ? 'var(--warning)' : 'var(--success)', fontSize: 16 }}>
            {session.failCount > 0 ? '⚠' : '✓'}
          </span>
          <span style={{ fontWeight: 700 }}>Бэкап завершён</span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <span className="text-success">✓ {session.successCount}</span>
          <span className="text-danger">✕ {session.failCount}</span>
        </div>
      </div>
    </div>
  );
}
