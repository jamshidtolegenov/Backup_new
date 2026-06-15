# BackupOS — Система резервного копирования

Веб-интерфейс для резервного копирования сетевых устройств через SSH/SCP (AZIMUTH) и FTP/lftp (OLVIA).

## Структура проекта

```
backup-system/
├── backend/                  # Node.js + Express
│   ├── routes/
│   │   ├── backup.js         # Запуск/отмена бэкапа
│   │   ├── devices.js        # CRUD устройств
│   │   ├── history.js        # История сессий
│   │   ├── logs.js           # Логи + экспорт
│   │   └── settings.js       # Настройки системы
│   ├── services/
│   │   └── backupService.js  # SSH/SCP и FTP/lftp логика
│   ├── utils/
│   │   ├── database.js       # SQLite инициализация + seed
│   │   └── logger.js         # Winston логгер
│   ├── .env.example
│   ├── package.json
│   └── server.js             # Точка входа + Socket.IO
│
├── frontend/                 # React + Vite (SWC)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout/       # Sidebar, навигация
│   │   │   ├── Dashboard/    # Обзор, статистика
│   │   │   ├── Backup/       # Выбор устройств, прогресс
│   │   │   ├── Devices/      # Список, добавить/редактировать
│   │   │   ├── History/      # История сессий с деталями
│   │   │   ├── Logs/         # Лог-вьювер в реальном времени
│   │   │   └── Settings/     # Конфигурация
│   │   ├── store/
│   │   │   └── socketStore.js # Zustand + Socket.IO
│   │   ├── styles/
│   │   │   └── globals.css
│   │   ├── utils/
│   │   │   └── api.js        # Все API-вызовы
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
└── package.json              # Root: concurrently dev
```

## Требования

- **Node.js** v18+
- **sshpass** — для SSH/SCP операций
- **lftp** — для FTP операций

```bash
# Ubuntu/Debian
sudo apt install sshpass lftp

# macOS
brew install hudochenkov/sshpass/sshpass lftp
```

## Установка и запуск

### 1. Клонировать / распаковать проект

### 2. Установить зависимости

```bash
# В корне проекта
npm install          # устанавливает concurrently
cd backend && npm install
cd ../frontend && npm install
```

### 3. Настроить переменные окружения

```bash
cd backend
cp .env.example .env
# Отредактировать .env под свою среду
```

### 4. Запустить в режиме разработки

```bash
# Из корня проекта — запускает backend и frontend одновременно
npm run dev

# Или по отдельности:
npm run dev:backend   # http://localhost:3001
npm run dev:frontend  # http://localhost:5173
```

### 5. Production-сборка

```bash
npm run build        # собирает frontend в frontend/dist/
npm start            # запускает только backend (раздаёт dist статику)
```

## Конфигурация `.env`

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3001` | Порт backend |
| `BACKUP_ROOT_DIR` | `~/Downloads` | Корневая папка бэкапов |
| `MAX_RETRIES` | `3` | Кол-во попыток при ошибке |
| `SSH_CONNECT_TIMEOUT` | `10` | Таймаут SSH (сек) |
| `FTP_NET_TIMEOUT` | `10` | Таймаут FTP (сек) |
| `OLVIA_FTP_LOGIN` | `122333` | Логин FTP для OLVIA |
| `OLVIA_FTP_PASSWORD` | `553721473` | Пароль FTP для OLVIA |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |

> ⚠️ **Никогда не коммитьте `.env` в git!** Файл `.env.example` содержит только заглушки.

## Функционал

- **Dashboard** — статистика устройств и последние сессии
- **Устройства** — список всех устройств, поиск, фильтрация, добавление/редактирование/удаление
- **Бэкап** — выбор устройств (одно/несколько/все), запуск, realtime прогресс, отмена
- **История** — все прошлые сессии с детализацией по каждому устройству и MD5
- **Логи** — потоковый просмотр логов, фильтрация, поиск, экспорт CSV
- **Настройки** — пути сохранения, таймауты, кол-во попыток

## Архитектура Realtime

Backend → Socket.IO → Frontend:

| Событие | Когда |
|---|---|
| `session:start` | Старт сессии |
| `device:start` | Начало бэкапа устройства |
| `device:progress` | Прогресс (попытка, MD5, файлы) |
| `device:done` | Завершение устройства |
| `session:done` | Завершение всей сессии |
"# Backup_new" 
"# Backup_new" 
