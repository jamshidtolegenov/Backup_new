const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', (req, res) => {
  try {
    const db = getDb();
    for (const [k, v] of Object.entries(req.body)) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, String(v));
    }
    const rows = db.prepare('SELECT key, value FROM settings').all();
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
