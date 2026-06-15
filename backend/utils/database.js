const path = require('path');
const fs = require('fs');
const logger = require('./logger');

let db = null;
let SQL = null;
let dbPath = null;

// sql.js работает полностью в памяти, сохраняем на диск вручную
function saveDb() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (e) {
    logger.error('DB save error: ' + e.message);
  }
}

// Автосохранение каждые 5 секунд
let saveInterval = null;

async function initialize() {
  SQL = await require('sql.js')();

  const dp = process.env.DB_PATH || './data/backup.db';
  dbPath = path.resolve(dp);
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`PRAGMA journal_mode = WAL;`);

  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      type TEXT NOT NULL,
      username TEXT,
      password TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backup_sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT DEFAULT 'running',
      total_devices INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      backup_path TEXT,
      initiated_by TEXT DEFAULT 'web'
    );

    CREATE TABLE IF NOT EXISTS backup_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_ip TEXT NOT NULL,
      device_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      started_at TEXT,
      finished_at TEXT,
      file_count INTEGER DEFAULT 0,
      remote_md5 TEXT,
      local_md5 TEXT,
      md5_match INTEGER,
      error_message TEXT,
      backup_path TEXT
    );

    CREATE TABLE IF NOT EXISTS backup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      device_id TEXT,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default settings
  const defaults = [
    ['backup_root_dir', ''],
    ['max_retries', process.env.MAX_RETRIES || '3'],
    ['ssh_connect_timeout', process.env.SSH_CONNECT_TIMEOUT || '10'],
    ['ftp_net_timeout', process.env.FTP_NET_TIMEOUT || '10'],
  ];
  for (const [k, v] of defaults) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }

  // Seed devices if empty
  const res = db.exec('SELECT COUNT(*) as c FROM devices');
  const count = res[0]?.values[0][0] || 0;
  if (count === 0) seedDevices();

  saveDb();

  // Auto-save every 5s
  saveInterval = setInterval(saveDb, 5000);

  // Save on exit
  process.on('exit', saveDb);
  process.on('SIGINT', () => { saveDb(); process.exit(); });
  process.on('SIGTERM', () => { saveDb(); process.exit(); });

  logger.info('Database initialized');
}

function seedDevices() {
  const { v4: uuidv4 } = require('uuid');

  const azimuthDevices = [
    { name: 'AZ-UZ00001', ip: '10.69.76.114', username: 'admin', password: 'bq9kMcG3' },
    { name: 'AZ-UZ00002', ip: '10.69.76.42',  username: 'admin', password: '0qlkHLnp' },
    { name: 'AZ-UZ00003', ip: '10.69.77.42',  username: 'admin', password: 'SGpg0tjS' },
    { name: 'AZ-UZ00004', ip: '10.69.82.50',  username: 'admin', password: '3GxJHmA0' },
    { name: 'AZ-UZ00005', ip: '10.69.76.187', username: 'admin', password: 'ibkvF4us' },
    { name: 'AZ-UZ00006', ip: '10.69.76.220', username: 'admin', password: 'xTbUMR7J' },
    { name: 'AZ-UZ00007', ip: '10.69.76.243', username: 'admin', password: 'Rm7eSVZM' },
    { name: 'AZ-UZ00008', ip: '10.69.76.214', username: 'admin', password: 'vZ0oLHHp' },
    { name: 'AZ-UZ00009', ip: '10.69.77.30',  username: 'admin', password: 'WEaX57le' },
    { name: 'AZ-UZ00010', ip: '10.69.77.82',  username: 'admin', password: '4gTLRv1R' },
    { name: 'AZ-UZ00011', ip: '10.69.76.186', username: 'admin', password: 'c9nUxqv0' },
    { name: 'AZ-UZ00012', ip: '10.69.77.22',  username: 'admin', password: 'hYm4uPfn' },
    { name: 'AZ-UZ00013', ip: '10.69.76.245', username: 'admin', password: 'lFunmD6s' },
    { name: 'AZ-UZ00014', ip: '10.69.77.66',  username: 'admin', password: 'kuA40tFV' },
    { name: 'AZ-UZ00015', ip: '10.69.76.247', username: 'admin', password: 'enoKUm2H' },
    { name: 'AZ-UZ00016', ip: '10.69.77.58',  username: 'admin', password: 'AHj0zEke' },
    { name: 'AZ-UZ00017', ip: '10.69.76.244', username: 'admin', password: '9KcOCjo7' },
    { name: 'AZ-UZ00018', ip: '10.69.76.246', username: 'admin', password: 'I9bpcBu0' },
    { name: 'AZ-UZ00019', ip: '10.69.76.218', username: 'admin', password: 'nDptEZlB' },
    { name: 'AZ-UZ00020', ip: '10.69.82.42',  username: 'admin', password: 'AfndPIO8' },
    { name: 'AZ-UZ00021', ip: '10.69.77.50',  username: 'admin', password: '80g7IoKa' },
    { name: 'AZ-UZ00022', ip: '10.69.82.66',  username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00023', ip: '10.69.77.10',  username: 'admin', password: 'rwS7y3fW' },
    { name: 'AZ-UZ00024', ip: '10.69.77.146', username: 'admin', password: 'ClNe07eR' },
    { name: 'AZ-UZ00025', ip: '10.69.77.18',  username: 'admin', password: 'hjHN8bmg' },
    { name: 'AZ-UZ00026', ip: '10.69.77.14',  username: 'admin', password: 'lGjL4Vz3' },
    { name: 'AZ-UZ00027', ip: '10.69.77.90',  username: 'admin', password: '9dAcpMYm' },
    { name: 'AZ-UZ00028', ip: '10.69.77.158', username: 'admin', password: 'IVwZeP8E' },
    { name: 'AZ-UZ00029', ip: '10.69.77.170', username: 'admin', password: '092rtPwc' },
    { name: 'AZ-UZ00030', ip: '10.69.77.198', username: 'admin', password: 'T5PurPYT' },
    { name: 'AZ-UZ00031', ip: '10.69.77.162', username: 'admin', password: 'XNBIo8s5' },
    { name: 'AZ-UZ00032', ip: '10.69.82.100', username: 'admin', password: 'y5RV8jZZ' },
    { name: 'AZ-UZ00033', ip: '10.69.77.174', username: 'admin', password: 'M84ZrEi0' },
    { name: 'AZ-UZ00036', ip: '10.69.77.230', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00037', ip: '10.69.77.238', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00044', ip: '10.69.82.58',  username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00045', ip: '10.69.77.226', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00050', ip: '10.69.77.154', username: 'admin', password: 'jR0kRUw0' },
    { name: 'AZ-UZ00051', ip: '10.69.77.166', username: 'admin', password: 'RrBpEW51' },
    { name: 'AZ-UZ00052', ip: '10.69.77.250', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00053', ip: '10.69.76.222', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00054', ip: '10.69.77.202', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00055', ip: '10.69.77.190', username: 'admin', password: 'tqAX2EV0' },
    { name: 'AZ-UZ00056', ip: '10.69.76.188', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00057', ip: '10.69.77.118', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00058', ip: '10.69.77.102', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00059', ip: '10.69.77.186', username: 'admin', password: 'Ent5FfQS' },
    { name: 'AZ-UZ00060', ip: '10.69.77.194', username: 'admin', password: 'pXv8aB4L' },
    { name: 'AZ-UZ00061', ip: '10.69.77.150', username: 'admin', password: '70GDYXsY' },
    { name: 'AZ-UZ00062', ip: '10.69.77.178', username: 'admin', password: 'pdtU4wPh' },
    { name: 'AZ-UZ00064', ip: '10.69.77.122', username: 'admin', password: 'yp8JydG2' },
    { name: 'AZ-UZ00065', ip: '10.69.77.218', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00066', ip: '10.69.77.46',  username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00067', ip: '10.69.77.222', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00068', ip: '10.69.77.214', username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00070', ip: '10.69.77.98',  username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00076', ip: '10.69.82.30',  username: 'admin', password: '2360087'  },
    { name: 'AZ-UZ00089', ip: '10.69.76.248', username: 'admin', password: '2360087'  },
  ];

  const olviaDevices = [
    { name: 'СКАТ-ПП-2207101', ip: '10.69.76.10',  label: 'Сырдарья - Гулистан' },
    { name: 'СКАТ-ПП-2207102', ip: '10.69.76.6',   label: 'Ташкент - Чиназ' },
    { name: 'СКАТ-ПП-2207103', ip: '10.69.76.14',  label: 'Наманган - Исковот' },
    { name: 'СКАТ-ПП-2209100', ip: '10.69.76.202', label: 'Кашкадарья - Бешкент' },
    { name: 'СКАТ-ПП-2209101', ip: '10.69.76.18',  label: 'Наманган - Янгикурган колледж' },
    { name: 'СКАТ-ПП-2209102', ip: '10.69.76.46',  label: 'Бухара - Вобкент ГАИ' },
    { name: 'СКАТ-ПП-2209103', ip: '10.69.76.206', label: 'Кашкадарья - Косон 0,3-Км' },
    { name: 'СКАТ-ПП-2209104', ip: '10.69.76.30',  label: 'Наманган - Мингбулак суд' },
    { name: 'СКАТ-ПП-2209105', ip: '10.69.76.26',  label: 'Наманган - Тошбулок' },
    { name: 'СКАТ-ПП-2209106', ip: '10.69.76.34',  label: 'Наманган - Мингбулак супермаркет' },
    { name: 'СКАТ-ПП-2209107', ip: '10.69.76.58',  label: 'Бухара - Джондор 291-Км' },
    { name: 'СКАТ-ПП-2209108', ip: '10.69.76.22',  label: 'Наманган - Бешкапа' },
    { name: 'СКАТ-ПП-2209109', ip: '10.69.76.50',  label: 'Бухара - Вобкент Газзаправка' },
    { name: 'СКАТ-ПП-2211107', ip: '10.69.76.194', label: 'Ташкент - Дурмень' },
    { name: 'СКАТ-ПП-2211108', ip: '10.69.76.170', label: 'Фергана - Хамзаобод' },
    { name: 'СКАТ-ПП-2211109', ip: '10.69.76.74',  label: 'Бухара - Навгади' },
    { name: 'СКАТ-ПП-2211110', ip: '10.69.76.162', label: 'Фергана - Миндонобод' },
    { name: 'СКАТ-ПП-2211111', ip: '10.69.76.158', label: 'Бухара - Роботохун' },
    { name: 'СКАТ-ПП-2211112', ip: '10.69.76.146', label: 'Фергана - Тошлок' },
    { name: 'СКАТ-ПП-2211113', ip: '10.69.76.138', label: 'Фергана - Коканд' },
    { name: 'СКАТ-ПП-2211114', ip: '10.69.76.178', label: 'Фергана - Логон' },
    { name: 'СКАТ-ПП-2211115', ip: '10.69.76.130', label: 'Джизак - Куев Боши' },
    { name: 'СКАТ-ПП-2211116', ip: '10.69.76.78',  label: 'Бухара - Шофиркон 7,5-Км' },
    { name: 'СКАТ-ПП-2211117', ip: '10.69.76.90',  label: 'Джизак - Кетмончи' },
    { name: 'СКАТ-ПП-2211118', ip: '10.69.76.62',  label: 'Бухара - Шофиркон 9-Км' },
    { name: 'СКАТ-ПП-2211119', ip: '10.69.76.154', label: 'Бухара - Пешку' },
    { name: 'СКАТ-ПП-2211120', ip: '10.69.76.70',  label: 'Бухара - Уба' },
    { name: 'СКАТ-ПП-2211121', ip: '10.69.76.82',  label: 'Ташкент - Уймаут' },
    { name: 'СКАТ-ПП-2211122', ip: '10.69.76.54',  label: 'Бухара - Когон' },
    { name: 'СКАТ-ПП-2211123', ip: '10.69.76.98',  label: 'Джизак - Солокли' },
    { name: 'СКАТ-ПП-2211124', ip: '10.69.76.106', label: 'Сырдарья - Богистон' },
    { name: 'СКАТ-ПП-2211125', ip: '10.69.76.122', label: 'Джизак - Мустакиллик' },
    { name: 'СКАТ-ПП-2211126', ip: '10.69.76.210', label: 'Кашкадарья - Косон 1,2-Км' },
  ];

  for (const d of azimuthDevices) {
    db.run('INSERT INTO devices (id, name, ip, type, username, password, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [uuidv4(), d.name, d.ip, 'azimuth', d.username, d.password]);
  }
  for (const d of olviaDevices) {
    db.run('INSERT INTO devices (id, name, ip, type, username, password, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [uuidv4(), d.name + ' ' + d.label, d.ip, 'olvia', null, null]);
  }
  saveDb();
  logger.info('Seeded ' + azimuthDevices.length + ' AZIMUTH + ' + olviaDevices.length + ' OLVIA devices');
}

// ─── sql.js wrapper — имитирует API better-sqlite3 ────────────────────────────

function sqlRows(stmt, params = []) {
  try {
    const result = db.exec(stmt, params);
    if (!result || result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  } catch (e) {
    logger.error('sqlRows error: ' + e.message + ' | SQL: ' + stmt);
    throw e;
  }
}

function sqlGet(stmt, params = []) {
  const rows = sqlRows(stmt, params);
  return rows[0] || null;
}

function sqlRun(stmt, params = []) {
  db.run(stmt, params);
  saveDb();
}

// Возвращает объект совместимый с better-sqlite3 prepare API
function prepare(sql) {
  return {
    all: (...args) => sqlRows(sql, args.flat()),
    get: (...args) => sqlGet(sql, args.flat()),
    run: (...args) => sqlRun(sql, args.flat()),
  };
}

function exec(sql) {
  db.run(sql);
  saveDb();
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return { prepare, exec };
}

module.exports = { initialize, getDb };
