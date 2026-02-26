# Бот
Бот работает на основе сообщений, заранее в подготовленном формате

# Настройка переменных окружения
```env
PORT=3000
BOT_TOKEN=secret_key
DATABASE_URL=postgresql://user:password@HOST:5432/DB

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_pass

MAIL_FROM="bot@example.com"
MAIL_TO="you@example.com"
```

# Миграции
Таблицы и все запросы настроены только под PostgreSQL

# Запуск
Для запуска бота необходимо ввести в консоль `npm run dev`

Для запуска процесса, который будет отправлять данные на сервер необходимо ввести `npm run worker`
