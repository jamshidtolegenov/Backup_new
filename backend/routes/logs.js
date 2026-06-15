const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { sessionId, deviceId, level, search, limit = 200, offset = 0 } = req.query;
    let sql = 'SELECT * FROM backup_logs WHERE 1=1';
    const params = [];
    if (sessionId) { sql += ' AND session_id = ?'; params.push(sessionId); }
    if (deviceId)  { sql += ' AND device_id = ?';  params.push(deviceId); }
    if (level)     { sql += ' AND level = ?';       params.push(level); }
    if (search)    { sql += ' AND message LIKE ?';  params.push('%'+search+'%'); }

    let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as c');
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow ? totalRow.c : 0;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const logs = db.prepare(sql).all(...params);
    res.json({ logs, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export', (req, res) => {
  try {
    const db = getDb();
    const { sessionId } = req.query;
    let sql = 'SELECT * FROM backup_logs';
    const params = [];
    if (sessionId) { sql += ' WHERE session_id = ?'; params.push(sessionId); }
    sql += ' ORDER BY created_at ASC';
    const logs = db.prepare(sql).all(...params);
    const csv = ['id,session_id,device_id,level,message,created_at',
      ...logs.map(l => `${l.id},"${l.session_id||''}","${l.device_id||''}","${l.level}","${(l.message||'').replace(/"/g,'""')}","${l.created_at}"`)
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="backup_logs.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
