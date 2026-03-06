# Бот

Бот работает на основе сообщений, заранее в подготовленном формате
Далее воркер проверяет каждые 30 минут БД, если есть новые записи отправляет зашифрованный файл с данными на почту по заданному адресу

# Настройка переменных окружения

Нужно создать `.env` файл на основе `.env.example`.

# Миграции

Таблицы и все запросы настроены только под PostgreSQL. `init/migration.sql` запустится при первом запуске БД.

# Запуск

## start dev

```bash
sudo docker compose -f compose.dev.yaml up --build
# add -d to detach from console

# В другом терминале
cd bot
npm run dev

# В другом терминале
cd scheduler
npm run dev
```

## start prod

```bash
sudo docker compose up --build -d
```
