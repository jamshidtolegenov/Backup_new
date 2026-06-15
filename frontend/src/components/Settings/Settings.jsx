import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import styles from './Settings.module.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.getSettings();
      setSettings(res);
    } catch {}
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function set(key, value) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Конфигурация системы резервного копирования</p>
      </div>

      <div className={styles.sections}>
        {/* Paths */}
        <section className="card">
          <h2 className={styles.sectionTitle}>Пути сохранения</h2>
          <Field label="Корневая папка для бэкапов">
            <input
              className="input"
              value={settings.backup_root_dir || ''}
              onChange={e => set('backup_root_dir', e.target.value)}
              placeholder="/home/user/Downloads"
            />
            <p className={styles.hint}>Папки бэкапов будут создаваться внутри этой директории</p>
          </Field>
        </section>

        {/* Connection */}
        <section className="card">
          <h2 className={styles.sectionTitle}>Параметры подключения</h2>
          <div className={styles.grid2}>
            <Field label="Макс. попыток">
              <input
                className="input"
                type="number"
                min="1"
                max="10"
                value={settings.max_retries || '3'}
                onChange={e => set('max_retries', e.target.value)}
              />
            </Field>
            <Field label="SSH таймаут (сек)">
              <input
                className="input"
                type="number"
                min="5"
                max="60"
                value={settings.ssh_connect_timeout || '10'}
                onChange={e => set('ssh_connect_timeout', e.target.value)}
              />
            </Field>
            <Field label="FTP таймаут (сек)">
              <input
                className="input"
                type="number"
                min="5"
                max="60"
                value={settings.ftp_net_timeout || '10'}
                onChange={e => set('ftp_net_timeout', e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* Info */}
        <section className="card">
          <h2 className={styles.sectionTitle}>Информация о системе</h2>
          <div className={styles.infoGrid}>
            <InfoRow label="Backend" value="Node.js + Express" />
            <InfoRow label="Frontend" value="React + Vite (SWC)" />
            <InfoRow label="База данных" value="SQLite (better-sqlite3)" />
            <InfoRow label="Realtime" value="Socket.IO" />
            <InfoRow label="SSH/SCP" value="sshpass + scp" />
            <InfoRow label="FTP" value="lftp" />
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить настройки'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className={styles.infoRow}>
      <span className="text-muted">{label}</span>
      <span className="mono" style={{ fontSize: 12 }}>{value}</span>
    </div>
  );
}
