# Инструкция администратора: ИИ-Агент индивидуальной траектории обучения (ИОТ)

Руководство по развертыванию, настройке, безопасности и мониторингу платформы «ИИ-агент индивидуальной траектории обучения».

---

## 1. Архитектура и системные требования

Платформа представляет собой микросервисный комплекс из 5 Docker-контейнеров:
1. **`api-core`**: основной бэкенд на ASP.NET Core 9 (порт `5000`).
2. **`ai-driver`**: микросервис мультиагентной системы на FastAPI / Python 3.11 (порт `8000`).
3. **`frontend`**: веб-интерфейс на Nginx + React 19 SPA (порт `80`).
4. **`postgres`**: база данных PostgreSQL 15 с поддержкой JSONB (порт `5432`).
5. **`qwen-local`**: сервер инференса локальной модели на базе `llama.cpp` (порт `8001`).

### Минимальные требования к серверу:
- **ОС**: Ubuntu 22.04 LTS / Debian 12 / Windows Server 2022
- **CPU**: 4–8 ядер (x86_64 или ARM64)
- **RAM**: 8 ГБ (16 ГБ при использовании локальной модели на CPU)
- **Диск**: 15–20 ГБ свободного места на SSD
- **Docker**: Docker Engine 24+ и Docker Compose v2+

---

## 2. Быстрое развертывание

### Развертывание в Linux / macOS:
```bash
git clone https://github.com/sqtwix/ai-education-mentor.git
cd ai-education-mentor
chmod +x deploy.sh
./deploy.sh
```

### Развертывание в Windows:
```cmd
git clone https://github.com/sqtwix/ai-education-mentor.git
cd ai-education-mentor
deploy.bat
```

---

## 3. Конфигурация переменных окружения (`.env`)

Файл `.env` создается автоматически из `env_example.txt`. Основные параметры:

```ini
# База данных PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=aichecker
DB_USER=aichecker_user
DB_PASSWORD=aichecker_password

# JWT Аутентификация
JWT_SECRET=SUPER_SECRET_KEY_MUST_BE_VERY_LONG_MIN_32_CHARS_123456
JWT_ISSUER=AiCheckerApiCore
JWT_AUDIENCE=AiCheckerFrontend
JWT_EXPIRY_MINUTES=1440

# Ключи внешних облачных моделей (Опционально)
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
SBERGPT_API_KEY=your-gigachat-auth-key-here

# Режим работы фронтенда (false для реального бэкенда)
VITE_OFFLINE_MODE=false
```

---

## 4. Локальная модель Qwen2.5 (Air-Gapped контур)

Для работы в 100% закрытом контуре без выхода в интернет скрипт автоматически скачивает GGUF-модель `qwen2.5-0.5b-instruct-q8_0.gguf` (или вы можете поместить любую модель семейства Qwen2.5 7B/14B в папку `./models/`).

Контейнер `qwen-local` запускает сервер `llama.cpp`:
```bash
-m /models/qwen2.5-0.5b-instruct-q8_0.gguf --host 0.0.0.0 --port 8080 -c 8192 --threads 4 -b 512 --alias local-model
```

---

## 5. Проверка работоспособности (Healthchecks)

После запуска убедитесь, что все сервисы находятся в состоянии `healthy`:

```bash
docker compose ps
```

### Проверка API эндпоинтов:
- **API Core Swagger**: `http://localhost:5000/swagger`
- **AI-Driver FastAPI Docs**: `http://localhost:8000/docs`
- **Каталог программ (AI-Driver)**:
  ```bash
  curl http://localhost:8000/agents/catalog
  ```
- **Бенчмарки по должностям**:
  ```bash
  curl http://localhost:8000/agents/benchmarks
  ```
- **Локальная модель Qwen Health**:
  ```bash
  curl http://localhost:8001/health
  ```

---

## 6. Резервное копирование и обслуживание

### Дамп базы данных PostgreSQL:
```bash
docker compose exec postgres pg_dump -U aichecker_user aichecker > backup_$(date +%Y%m%d).sql
```

### Восстановление из дампа:
```bash
cat backup_20260821.sql | docker compose exec -T postgres psql -U aichecker_user aichecker
```

### Перезапуск без потери данных:
```bash
docker compose restart
```
*(Не используйте флаг `-v` при остановке, чтобы сохранить данные в томах PostgreSQL)*.
