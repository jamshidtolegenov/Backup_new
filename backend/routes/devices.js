const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { type, search, enabled } = req.query;
    let sql = 'SELECT id, name, ip, type, username, enabled, created_at, updated_at FROM devices WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (search) { sql += ' AND (name LIKE ? OR ip LIKE ?)'; params.push('%'+search+'%', '%'+search+'%'); }
    if (enabled !== undefined) { sql += ' AND enabled = ?'; params.push(enabled === 'true' ? 1 : 0); }
    sql += ' ORDER BY type, name';
    const devices = db.prepare(sql).all(...params);
    res.json({ devices, total: devices.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const device = db.prepare('SELECT id, name, ip, type, username, enabled, created_at FROM devices WHERE id = ?').get(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, ip, type, username, password } = req.body;
    if (!name || !ip || !type) return res.status(400).json({ error: 'name, ip, type are required' });
    if (!['azimuth', 'olvia'].includes(type)) return res.status(400).json({ error: 'type must be azimuth or olvia' });
    const id = uuidv4();
    db.prepare('INSERT INTO devices (id, name, ip, type, username, password, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)').run(id, name, ip, type, username || null, password || null);
    const device = db.prepare('SELECT id, name, ip, type, username, enabled, created_at FROM devices WHERE id = ?').get(id);
    res.status(201).json(device);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, ip, type, username, password, enabled } = req.body;
    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Device not found' });

    if (name !== undefined) db.prepare('UPDATE devices SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, req.params.id);
    if (ip !== undefined) db.prepare('UPDATE devices SET ip = ?, updated_at = datetime(\'now\') WHERE id = ?').run(ip, req.params.id);
    if (type !== undefined) db.prepare('UPDATE devices SET type = ?, updated_at = datetime(\'now\') WHERE id = ?').run(type, req.params.id);
    if (username !== undefined) db.prepare('UPDATE devices SET username = ?, updated_at = datetime(\'now\') WHERE id = ?').run(username, req.params.id);
    if (password !== undefined && password !== '') db.prepare('UPDATE devices SET password = ?, updated_at = datetime(\'now\') WHERE id = ?').run(password, req.params.id);
    if (enabled !== undefined) db.prepare('UPDATE devices SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(enabled ? 1 : 0, req.params.id);

    const device = db.prepare('SELECT id, name, ip, type, username, enabled, created_at, updated_at FROM devices WHERE id = ?').get(req.params.id);
    res.json(device);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Device not found' });
    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
