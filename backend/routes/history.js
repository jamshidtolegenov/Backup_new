const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const sessions = db.prepare('SELECT * FROM backup_sessions ORDER BY started_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    const totalRow = db.prepare('SELECT COUNT(*) as c FROM backup_sessions').get();
    res.json({ sessions, total: totalRow ? totalRow.c : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:sessionId', (req, res) => {
  try {
    const db = getDb();
    const session = db.prepare('SELECT * FROM backup_sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const results = db.prepare('SELECT * FROM backup_results WHERE session_id = ? ORDER BY started_at').all(req.params.sessionId);
    res.json({ session, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
