const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Client: SshClient } = require('ssh2');
const ftp = require('basic-ftp');
const { getDb } = require('../utils/database');
const logger = require('../utils/logger');

const activeSessions = new Map();

function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function dbLog(sessionId, deviceId, level, message) {
  const db = getDb();
  try {
    db.prepare('INSERT INTO backup_logs (session_id, device_id, level, message) VALUES (?, ?, ?, ?)').run(sessionId, deviceId || null, level, message);
  } catch (_) {}
}

function createSshClient(host, username, password, timeout) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => { conn.destroy(); reject(new Error('SSH timeout to ' + host)); }, timeout * 1000);
    conn.on('ready', () => { clearTimeout(timer); resolve(conn); });
    conn.on('error', (err) => { clearTimeout(timer); reject(new Error('SSH: ' + err.message)); });
    conn.connect({ host, port: 22, username, password, readyTimeout: timeout * 1000 });
  });
}

function sftpDownloadDir(sftp, remoteDir, localDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(localDir, { recursive: true });
    sftp.readdir(remoteDir, (err, list) => {
      if (err) return reject(new Error('readdir ' + remoteDir + ': ' + err.message));
      const tasks = list.map(item => {
        const rPath = remoteDir.replace(/\/+$/, '') + '/' + item.filename;
        const lPath = path.join(localDir, item.filename);
        if (item.attrs.isDirectory()) return sftpDownloadDir(sftp, rPath, lPath);
        return new Promise((res, rej) => sftp.fastGet(rPath, lPath, e => e ? rej(new Error(e.message)) : res()));
      });
      Promise.all(tasks).then(resolve).catch(reject);
    });
  });
}

async function ftpMirror(host, login, password, remoteDir, localDir, timeout) {
  fs.mkdirSync(localDir, { recursive: true });
  const client = new ftp.Client(timeout * 1000);
  client.ftp.verbose = false;
  try {
    await client.access({ host, port: 21, user: login, password, secure: false });
    await client.downloadToDir(localDir, remoteDir);
  } finally { client.close(); }
}

function countFiles(dir) {
  try {
    let count = 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) count += countFiles(path.join(dir, item.name));
      else count++;
    }
    return count;
  } catch { return 0; }
}

// --- AZIMUTH (SSH/SFTP) ---

const AZIMUTH_REMOTE_DIRS = [
  '/mnt/settings/etc/azimuth',
  '/mnt/settings/etc/network',
  '/mnt/azimuth-data/cameras_connect_settings',
  '/mnt/azimuth-data/metrology',
];

function sshExec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => errOut += d);
      stream.on('close', code => {
        if (code === 0) resolve(out.trim());
        else reject(new Error(errOut.trim() || 'Exit ' + code));
      });
    });
  });
}

async function remoteCountFiles(conn, remoteDir) {
  const out = await sshExec(conn,
    `find '${remoteDir}' \\( -type f -o -type l \\) 2>/dev/null | wc -l`
  );
  return parseInt(out) || 0;
}

async function remoteCountDirs(conn, remoteDir) {
  const out = await sshExec(conn,
    `find '${remoteDir}' -mindepth 1 -type d 2>/dev/null | wc -l`
  );
  return parseInt(out) || 0;
}

async function remoteHashDir(conn, remoteDir) {
  const dir = remoteDir.replace(/\/+$/, '');
  const out = await sshExec(conn,
    `find '${dir}' \\( -type f -o -type l \\) -print0 2>/dev/null | LC_ALL=C sort -z | xargs -0 cat 2>/dev/null | md5sum | awk '{print $1}'`
  );
  const trimmed = out.trim();
  if (!trimmed || trimmed === 'd41d8cd98f00b204e9800998ecf8427e') return null;
  return trimmed;
}

function localHashDir(dir) {
  const crypto = require('crypto');
  const allFiles = [];
  const byteCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const item of entries) {
      const full = path.join(d, item.name);
      if (item.isDirectory()) walk(full);
      else allFiles.push(full);
    }
  }
  try { walk(dir); } catch { return null; }
  if (allFiles.length === 0) return null;
  allFiles.sort((a, b) => byteCmp(a, b));
  const hash = crypto.createHash('md5');
  for (const full of allFiles) {
    hash.update(fs.readFileSync(full));
  }
  return hash.digest('hex');
}

function localCountDirs(dir) {
  let count = 0;
  function walk(d) {
    try {
      for (const item of fs.readdirSync(d, { withFileTypes: true })) {
        if (item.isDirectory()) { count++; walk(path.join(d, item.name)); }
      }
    } catch {}
  }
  walk(dir);
  return count;
}

async function backupAzimuthDevice(device, sessionDir, settings, emitProgress) {
  const maxRetries = parseInt(settings.max_retries || '3');
  const timeout = parseInt(settings.ssh_connect_timeout || '10');
  const localDevDir = path.join(sessionDir, device.name + ' ' + device.ip);
  fs.mkdirSync(localDevDir, { recursive: true });

  const log = (msg) => {
    emitProgress({ type: 'log', message: msg });
    logger.info('[' + device.name + '] ' + msg);
  };

  log('Бэкап: ' + device.name + ' (' + device.ip + ')');

  const dirResults = [];

  for (const remoteDir of AZIMUTH_REMOTE_DIRS) {
    log('📂 Директория: ' + remoteDir);

    const localCopy = path.join(localDevDir, path.basename(remoteDir));

    let remoteFileCount = 0;
    let remoteDirCount = 0;
    let remoteHash = null;

    let conn;
    try {
      conn = await createSshClient(device.ip, device.username, device.password, timeout);
    } catch (e) {
      log('❌ Нет подключения к комплексу: ' + e.message);
      dirResults.push({ dir: remoteDir, ok: false, reason: 'ssh_connect_failed' });
      continue;
    }

    try {
      remoteFileCount = await remoteCountFiles(conn, remoteDir);
      remoteDirCount = await remoteCountDirs(conn, remoteDir);
    } catch (e) {
      log('⚠️ Не удалось получить статистику директории: ' + e.message);
      conn.end();
      dirResults.push({ dir: remoteDir, ok: false, reason: 'remote_stat_failed' });
      continue;
    }

    if (remoteFileCount === 0) {
      log('ℹ️ Директория пуста на комплексе — копируется пустой');
      conn.end();
      try { fs.mkdirSync(localCopy, { recursive: true }); } catch {}
      emitProgress({ type: 'dir_empty', dir: remoteDir });
      dirResults.push({ dir: remoteDir, ok: true, skipped: false, empty: true });
      continue;
    }

    log('📊 Файлов на комплексе: ' + remoteFileCount);
    log('🔍 Считаю на комплексе...');

    try {
      remoteHash = await remoteHashDir(conn, remoteDir);
      log('🔒 На комплексе: ' + (remoteHash || '(не удалось вычислить)'));
    } catch (e) {
      log('⚠️ Не удалось вычислить хеш на комплексе: ' + e.message);
    }
    conn.end();

    log('📥 Копирую...');
    let copied = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log('Попытка ' + attempt + '/' + maxRetries + '...');
      emitProgress({ type: 'scp_attempt', dir: remoteDir, attempt, maxRetries });

      try { if (fs.existsSync(localCopy)) fs.rmSync(localCopy, { recursive: true, force: true }); } catch {}

      try {
        const c2 = await createSshClient(device.ip, device.username, device.password, timeout);
        try {
          await new Promise((resolve, reject) => {
            c2.sftp((err, sftp) => {
              if (err) return reject(err);
              sftpDownloadDir(sftp, remoteDir, localCopy).then(resolve).catch(reject);
            });
          });
        } finally { c2.end(); }
        copied = true;
        log('✅ Скопировано');
        break;
      } catch (e) {
        log('⚠️ Ошибка копирования (попытка ' + attempt + '): ' + e.message);
        emitProgress({ type: 'scp_error', dir: remoteDir, attempt, error: e.message });
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (!copied) {
      log('❌ Не удалось скопировать директорию: ' + remoteDir);
      dirResults.push({ dir: remoteDir, ok: false, reason: 'copy_failed' });
      continue;
    }

    const localFileCount = countFiles(localCopy);
    log('📊 Файлов скопировано: ' + localFileCount);

    log('🔍 Считаю локально...');
    const localHash = localHashDir(localCopy);
    log('🔒 Локально: ' + (localHash || '(не удалось вычислить)'));

    const localDirCount = localCountDirs(localCopy);

    const filesMatch = localFileCount === remoteFileCount;
    if (!filesMatch) {
      log('❌ ФАЙЛЫ НЕ СОВПАДАЮТ: на комплексе ' + remoteFileCount + ', скопировано ' + localFileCount);
    }

    const dirsMatch = localDirCount === remoteDirCount;
    if (!dirsMatch) {
      log('❌ ДИРЕКТОРИИ НЕ СОВПАДАЮТ: на комплексе ' + remoteDirCount + ', локально ' + localDirCount);
    }

    let hashMatch = true;
    if (remoteHash !== null && localHash !== null) {
      hashMatch = remoteHash === localHash;
    }
    if (!hashMatch) {
      log('❌ ХЕШИ НЕ СОВПАДАЮТ');
    } else if (remoteHash !== null && localHash !== null) {
      log('✅ ХЕШИ СОВПАДАЮТ');
    }

    const dirOk = filesMatch && dirsMatch && hashMatch;
    dirResults.push({
      dir: remoteDir,
      ok: dirOk,
      remoteFileCount, localFileCount, filesMatch,
      remoteDirCount, localDirCount, dirsMatch,
      remoteHash, localHash, hashMatch,
    });

    emitProgress({
      type: 'dir_verified', dir: remoteDir,
      remoteFileCount, localFileCount, filesMatch,
      remoteDirCount, localDirCount, dirsMatch,
      remoteHash, localHash, hashMatch, ok: dirOk,
    });
  }

  const anyFailed = dirResults.some(r => !r.ok);
  const totalFiles = countFiles(localDevDir);

  if (anyFailed) {
    log('❌ ' + device.name + ' — Резервная копия некорректна');
    const failedDir = path.join(sessionDir, 'Backup_not_correct_' + device.name + ' ' + device.ip);
    try {
      if (fs.existsSync(failedDir)) fs.rmSync(failedDir, { recursive: true, force: true });
      fs.renameSync(localDevDir, failedDir);
    } catch {}
    return { success: false, fileCount: totalFiles, localPath: failedDir };
  }

  log('✅ ' + device.name + ' — Завершено успешно');
  return { success: true, fileCount: totalFiles, localPath: localDevDir };
}

// --- OLVIA (FTP) ---

// Одно FTP-соединение: рекурсивный обход, подсчёт файлов и MD5-хеш.
// Устройства OLVIA поддерживают только одно подключение одновременно —
// два клиента параллельно вызывают 421 Connection timed out.
// Алгоритм хеша идентичен localHashDir / remoteHashDir:
//   файлы сортируются по пути байтово (LC_ALL=C sort),
//   хешируется конкатенация содержимого в этом порядке.
async function ftpStatAndHash(host, login, password, remoteDir, timeout) {
  const crypto = require('crypto');
  const { PassThrough } = require('stream');
  const client = new ftp.Client(timeout * 1000);
  client.ftp.verbose = false;

  const allPaths = [];

  try {
    await client.access({ host, port: 21, user: login, password, secure: false });

    // Шаг 1: рекурсивный обход — собираем пути всех файлов
    async function walkDir(dir) {
      const items = await client.list(dir);
      for (const item of items) {
        const fullPath = dir.replace(/\/+$/, '') + '/' + item.name;
        if (item.type === 2) {
          await walkDir(fullPath);
        } else {
          allPaths.push(fullPath);
        }
      }
    }
    await walkDir(remoteDir);

    const fileCount = allPaths.length;
    if (fileCount === 0) return { fileCount: 0, hash: null };

    // Шаг 2: байтовая сортировка — идентично LC_ALL=C sort
    const byteCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    allPaths.sort(byteCmp);

    // Шаг 3: скачиваем файлы по одному, обновляем хеш потоково
    const hash = crypto.createHash('md5');
    for (const filePath of allPaths) {
      const chunks = [];
      const pt = new PassThrough();
      await client.downloadTo(pt, filePath);
      await new Promise((resolve, reject) => {
        pt.on('data', chunk => chunks.push(chunk));
        pt.on('end', resolve);
        pt.on('error', reject);
      });
      hash.update(Buffer.concat(chunks));
    }

    return { fileCount, hash: hash.digest('hex') };
  } finally {
    client.close();
  }
}

async function backupOlviaDevice(device, sessionDir, settings, emitProgress) {
  const maxRetries = parseInt(settings.max_retries || '3');
  const timeout = parseInt(settings.ftp_net_timeout || '10');
  const login = process.env.OLVIA_FTP_LOGIN || '122333';
  const password = process.env.OLVIA_FTP_PASSWORD || '553721473';
  const remoteDir = '/conf';
  const localDevDir = path.join(sessionDir, device.name + ' ' + device.ip);
  fs.mkdirSync(localDevDir, { recursive: true });

  const log = (msg) => {
    emitProgress({ type: 'log', message: msg });
    logger.info('[' + device.name + '] ' + msg);
  };

  // ── ШАГ 1: подсчёт файлов и хеш на устройстве (одно соединение) ─────────
  let remoteFileCount = 0;
  let remoteHash = null;

  try {
    log('🔍 Считаю на комплексе...');
    const stat = await ftpStatAndHash(device.ip, login, password, remoteDir, timeout);
    remoteFileCount = stat.fileCount;
    remoteHash = stat.hash;
    log('📊 Файлов на комплексе: ' + remoteFileCount);
    log('🔒 На комплексе: ' + (remoteHash || '(не удалось вычислить)'));
  } catch (e) {
    log('⚠️ Не удалось получить данные с комплекса: ' + e.message);
  }

  // ── ШАГ 2: копирование файлов с повторами ────────────────────────────────
  let copied = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    emitProgress({ type: 'ftp_attempt', attempt, maxRetries });
    log('Попытка ' + attempt + '/' + maxRetries + '...');
    log('📥 Копирую...');

    // Очищаем локальную папку перед каждой попыткой
    try {
      if (fs.existsSync(localDevDir)) {
        for (const f of fs.readdirSync(localDevDir)) {
          fs.rmSync(path.join(localDevDir, f), { recursive: true, force: true });
        }
      }
    } catch {}

    try {
      await ftpMirror(device.ip, login, password, remoteDir, localDevDir, timeout);
      copied = true;
      log('✅ Скопировано');
      break;
    } catch (e) {
      log('⚠️ Ошибка копирования (попытка ' + attempt + '): ' + e.message);
      emitProgress({ type: 'ftp_error', attempt, error: e.message });
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!copied) {
    log('❌ Не удалось скопировать файлы с устройства: ' + device.name);
    const failedDir = path.join(sessionDir, 'Backup_not_correct_' + device.name + ' ' + device.ip);
    try { fs.renameSync(localDevDir, failedDir); } catch {}
    return { success: false, fileCount: 0, localPath: failedDir };
  }

  // ── ШАГ 3: проверка целостности ──────────────────────────────────────────
  const localFileCount = countFiles(localDevDir);
  emitProgress({ type: 'ftp_count', fileCount: localFileCount });
  log('📊 Файлов скопировано: ' + localFileCount);

  log('🔍 Считаю локально...');
  const localHash = localHashDir(localDevDir);
  log('🔒 Локально: ' + (localHash || '(не удалось вычислить)'));

  // Сравниваем количество файлов
  const filesMatch = remoteFileCount === 0 || localFileCount === remoteFileCount;
  if (remoteFileCount > 0 && !filesMatch) {
    log('❌ ФАЙЛЫ НЕ СОВПАДАЮТ: на комплексе ' + remoteFileCount + ', скопировано ' + localFileCount);
  }

  // Сравниваем хеши (если оба вычислены)
  let hashMatch = true;
  if (remoteHash !== null && localHash !== null) {
    hashMatch = remoteHash === localHash;
  }
  if (!hashMatch) {
    log('❌ ХЕШИ НЕ СОВПАДАЮТ');
  } else if (remoteHash !== null && localHash !== null) {
    log('✅ ХЕШИ СОВПАДАЮТ');
  }

  const ok = filesMatch && hashMatch;

  emitProgress({
    type: 'dir_verified',
    dir: remoteDir,
    remoteFileCount,
    localFileCount,
    filesMatch,
    remoteHash,
    localHash,
    hashMatch,
    ok,
  });

  if (!ok) {
    log('❌ ' + device.name + ' — Резервная копия некорректна');
    const failedDir = path.join(sessionDir, 'Backup_not_correct_' + device.name + ' ' + device.ip);
    try {
      if (fs.existsSync(failedDir)) fs.rmSync(failedDir, { recursive: true, force: true });
      fs.renameSync(localDevDir, failedDir);
    } catch {}
    return { success: false, fileCount: localFileCount, localPath: failedDir };
  }

  log('✅ ' + device.name + ' — Завершено успешно');
  return { success: true, fileCount: localFileCount, localPath: localDevDir };
}

// --- SESSION ORCHESTRATOR ---

async function startBackupSession(deviceIds, io) {
  const db = getDb();
  const settings = getSettings();
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  const dateStr = now.replace(/[:.]/g, '-').slice(0, 16);

  const defaultDir = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'Downloads')
    : (process.env.HOME || 'C:\\Backups');
  const backupRoot = settings.backup_root_dir || defaultDir;
  const sessionDir = path.join(backupRoot, 'Backup_' + dateStr);
  fs.mkdirSync(sessionDir, { recursive: true });

  const placeholders = deviceIds.map(() => '?').join(',');
  const devices = db.prepare('SELECT * FROM devices WHERE id IN (' + placeholders + ') AND enabled = 1').all(...deviceIds);

  db.prepare("INSERT INTO backup_sessions (id, started_at, status, total_devices, backup_path) VALUES (?, ?, 'running', ?, ?)").run(sessionId, now, devices.length, sessionDir);
  activeSessions.set(sessionId, { cancelled: false });
  logger.info('[Session ' + sessionId + '] Starting backup for ' + devices.length + ' devices');
  dbLog(sessionId, null, 'info', 'Backup session started. Devices: ' + devices.length);
  io.emit('session:start', { sessionId, totalDevices: devices.length, sessionDir });

  let successCount = 0, failCount = 0;

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    if (activeSessions.get(sessionId)?.cancelled) break;

    const resultId = uuidv4();
    const startedAt = new Date().toISOString();

    db.prepare("INSERT INTO backup_results (id, session_id, device_id, device_name, device_ip, device_type, status, started_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?)").run(resultId, sessionId, device.id, device.name, device.ip, device.type, startedAt);
    io.emit('device:start', { sessionId, resultId, deviceId: device.id, deviceName: device.name, deviceIp: device.ip, deviceType: device.type, index: i + 1, total: devices.length });

    const emitProgress = (data) => {
      io.emit('device:progress', { sessionId, resultId, deviceId: device.id, ...data });
      dbLog(sessionId, device.id, 'info', JSON.stringify(data));
    };

    try {
      const result = device.type === 'azimuth'
        ? await backupAzimuthDevice(device, sessionDir, settings, emitProgress)
        : await backupOlviaDevice(device, sessionDir, settings, emitProgress);

      const finishedAt = new Date().toISOString();
      const status = result.success ? 'success' : 'failed';
      if (result.success) successCount++; else failCount++;

      db.prepare('UPDATE backup_results SET status = ?, finished_at = ?, file_count = ?, backup_path = ? WHERE id = ?').run(status, finishedAt, result.fileCount || 0, result.localPath, resultId);
      io.emit('device:done', { sessionId, resultId, deviceId: device.id, status, fileCount: result.fileCount || 0, localPath: result.localPath });
      dbLog(sessionId, device.id, result.success ? 'success' : 'error', 'Backup ' + status + ': ' + result.localPath);

    } catch (err) {
      failCount++;
      const finishedAt = new Date().toISOString();
      db.prepare('UPDATE backup_results SET status = \'failed\', finished_at = ?, error_message = ? WHERE id = ?').run(finishedAt, err.message, resultId);
      io.emit('device:done', { sessionId, resultId, deviceId: device.id, status: 'failed', error: err.message });
      dbLog(sessionId, device.id, 'error', 'Backup failed: ' + err.message);
      logger.error('[Session ' + sessionId + '] Device ' + device.name + ' failed: ' + err.message);
    }
  }

  const finalStatus = activeSessions.get(sessionId)?.cancelled ? 'cancelled' : 'completed';
  const finishedAt = new Date().toISOString();
  db.prepare('UPDATE backup_sessions SET status = ?, finished_at = ?, success_count = ?, fail_count = ? WHERE id = ?').run(finalStatus, finishedAt, successCount, failCount, sessionId);
  activeSessions.delete(sessionId);
  io.emit('session:done', { sessionId, status: finalStatus, successCount, failCount });
  dbLog(sessionId, null, 'info', 'Session ' + finalStatus + '. Success: ' + successCount + ', Failed: ' + failCount);
  return sessionId;
}

function cancelSession(sessionId) {
  if (activeSessions.has(sessionId)) { activeSessions.get(sessionId).cancelled = true; return true; }
  return false;
}

function getActiveSessions() { return [...activeSessions.keys()]; }

module.exports = { startBackupSession, cancelSession, getActiveSessions };
