const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Простая авторизация без внешних зависимостей.
// Учётные данные берутся из .env (AUTH_USERNAME / AUTH_PASSWORD).
// В продакшене замените на bcrypt + хранилище пользователей в БД.

const ADMIN_USER = process.env.AUTH_USERNAME || 'admin';
const ADMIN_PASS = process.env.AUTH_PASSWORD || 'admin123';

// Активные сессии: token -> { username, createdAt }
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 часов

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Удаляем протухшие сессии
function cleanSessions() {
  const now = Date.now();
  for (const [token, data] of sessions) {
    if (now - data.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  cleanSessions();
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Укажите логин и пароль' });
  }
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = generateToken();
  sessions.set(token, { username, createdAt: Date.now() });
  res.json({ token, username });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// GET /api/auth/me — проверка текущей сессии
router.get('/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  const session = token && sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Не авторизован' });
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Сессия истекла' });
  }
  res.json({ username: session.username });
});

// Middleware для защиты маршрутов — экспортируем отдельно
function requireAuth(req, res, next) {
  cleanSessions();
  const token = req.headers['x-auth-token'];
  const session = token && sessions.get(token);
  if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
    if (session) sessions.delete(token);
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  req.user = { username: session.username };
  next();
}

module.exports = { router, requireAuth };
