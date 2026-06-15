const express = require('express');
const router = express.Router();
const { startBackupSession, cancelSession, getActiveSessions } = require('../services/backupService');
const { getDb } = require('../utils/database');

router.post('/start', async (req, res) => {
  try {
    const { deviceIds } = req.body;
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({ error: 'deviceIds array is required' });
    }
    const io = req.app.get('io');
    startBackupSession(deviceIds, io).catch(err => console.error('Session error:', err));
    res.json({ started: true, deviceCount: deviceIds.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cancel/:sessionId', (req, res) => {
  const cancelled = cancelSession(req.params.sessionId);
  res.json({ cancelled });
});

router.get('/active', (req, res) => {
  res.json({ sessions: getActiveSessions() });
});

router.get('/session/:sessionId', (req, res) => {
  try {
    const db = getDb();
    const session = db.prepare('SELECT * FROM backup_sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const results = db.prepare('SELECT * FROM backup_results WHERE session_id = ? ORDER BY started_at').all(req.params.sessionId);
    res.json({ session, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
