import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import styles from './Devices.module.css';

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | device object

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (search) params.search = search;
      const res = await api.getDevices(params);
      setDevices(res.devices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  async function toggleEnabled(device) {
    await api.updateDevice(device.id, { enabled: !device.enabled });
    load();
  }

  async function deleteDevice(device) {
    if (!confirm(`Удалить устройство ${device.name}?`)) return;
    await api.deleteDevice(device.id);
    load();
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Устройства</h1>
          <p className="page-subtitle">{devices.length} устройств в системе</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}>
          + Добавить
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          className="input"
          placeholder="Поиск по имени или IP..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <div className={styles.typeButtons}>
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

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Устройство</th>
                <th>IP-адрес</th>
                <th>Тип</th>
                <th>Пользователь</th>
                <th>Статус</th>
                <th style={{ textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Загрузка...</td></tr>
              ) : devices.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Устройства не найдены</td></tr>
              ) : devices.map(d => (
                <tr key={d.id}>
                  <td>
                    <span className={styles.deviceName}>{d.name}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{d.ip}</td>
                  <td>
                    <span className={`badge ${d.type === 'azimuth' ? 'badge-azimuth' : 'badge-olvia'}`}>
                      {d.type === 'azimuth' ? 'SSH/SCP' : 'FTP'}
                    </span>
                  </td>
                  <td className="text-secondary mono" style={{ fontSize: 12 }}>{d.username || '—'}</td>
                  <td>
                    <span className={`badge ${d.enabled ? 'badge-success' : 'badge-muted'}`}>
                      {d.enabled ? 'Активен' : 'Отключён'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal(d)}>✎</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleEnabled(d)} title={d.enabled ? 'Отключить' : 'Включить'}>
                        {d.enabled ? '⊘' : '⊙'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteDevice(d)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <DeviceModal
          device={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

function DeviceModal({ device, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: device?.name || '',
    ip: device?.ip || '',
    type: device?.type || 'azimuth',
    username: device?.username || '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (device) {
        await api.updateDevice(device.id, form);
      } else {
        await api.createDevice(form);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>{device ? 'Редактировать устройство' : 'Добавить устройство'}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <Field label="Название">
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="AZ-UZ00001" />
          </Field>
          <Field label="IP-адрес">
            <input className="input" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} placeholder="10.69.76.114" />
          </Field>
          <Field label="Тип">
            <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="azimuth">AZIMUTH (SSH/SCP)</option>
              <option value="olvia">OLVIA (FTP/lftp)</option>
            </select>
          </Field>
          {form.type === 'azimuth' && (
            <>
              <Field label="Пользователь">
                <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="admin" />
              </Field>
              <Field label="Пароль">
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </Field>
            </>
          )}
          {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}
