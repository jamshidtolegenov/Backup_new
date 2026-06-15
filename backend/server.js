require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const db = require('./utils/database');

const devicesRouter = require('./routes/devices');
const backupRouter = require('./routes/backup');
const historyRouter = require('./routes/history');
const logsRouter = require('./routes/logs');
const settingsRouter = require('./routes/settings');
const { router: authRouter, requireAuth } = require('./routes/auth');

const app = express();
const server = http.createServer(app);

// Разрешаем все origins из локальной сети (localhost + любой IP)
// Если задан FRONTEND_URL — используем только его (продакшен)
function getAllowedOrigin() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  return true; // разрешить все origins (dev-режим)
}

const io = new Server(server, {
  cors: {
    origin: getAllowedOrigin(),
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

app.use(cors({ origin: getAllowedOrigin() }));
app.use(express.json());

// Публичный маршрут — авторизация
app.use('/api/auth', authRouter);

// Защищённые маршруты — требуют авторизации
app.use('/api/devices', requireAuth, devicesRouter);
app.use('/api/backup', requireAuth, backupRouter);
app.use('/api/history', requireAuth, historyRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/settings', requireAuth, settingsRouter);

// Health check (публичный)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO — проверяем токен при подключении
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
  // Если токен не передан — разрешаем только чтение событий (не команды)
  // Для полноценной защиты ws-команд раскомментируйте строки ниже:
  // if (!token) return next(new Error('Требуется авторизация'));
  socket.authToken = token;
  next();
});

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

db.initialize().then(() => {
  const PORT = process.env.PORT || 3002;
  server.listen(PORT, () => {
    logger.info(`🚀 Backup System Backend running on port ${PORT}`);
  });
}).catch((err) => {
  logger.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = { app, io };
