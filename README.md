# Бот
Бот работает на основе сообщений, заранее в подготовленном формате
Далее воркер проверяет каждые 30 минут БД, если есть новые записи отправляет зашифрованный файл с данными на почту по заданному адресу

# Настройка переменных окружения
```env
PORT=3000
BOT_TOKEN=secret_key
DATABASE_URL=postgresql://user:password@HOST:5432/DB

SMTP_HOST=smtp.example.com
# 587 Gmail || 465 Yandex
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_pass
SMTP_SECURE=true

MAIL_FROM="bot@example.com"
MAIL_TO="you@example.com"

# Ключ для шифрования
REPORT_SECRET=your_secret_key
```

# Миграции
Таблицы и все запросы настроены только под PostgreSQL

# Запуск
Для запуска бота необходимо ввести в консоль `npm run dev`

Для запуска процесса, который будет отправлять данные на сервер необходимо ввести `npm run worker`
