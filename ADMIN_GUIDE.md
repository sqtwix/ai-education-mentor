# Инструкция администратора: ИИ-Агент индивидуальной траектории обучения (ИОТ)

Руководство по развертыванию, настройке, безопасности и мониторингу платформы «ИИ-агент индивидуальной траектории обучения».

---

## 1. Архитектура и системные требования

Платформа представляет собой микросервисный комплекс из 5 Docker-контейнеров:
1. **`api-core`**: основной бэкенд на ASP.NET Core 9 (порт `5000`).
2. **`ai-driver`**: микросервис мультиагентной системы на FastAPI / Python 3.13 (диагностический порт `127.0.0.1:8000`).
3. **`frontend`**: веб-интерфейс на Nginx + React 19 SPA (порт `80`).
4. **`postgres`**: база данных PostgreSQL 15 с поддержкой JSONB (порт `5432`).
5. **`qwen-local`**: внутренний сервер инференса локальной модели на базе `llama.cpp`; порт модели не публикуется на хосте.

### Минимальные требования к серверу:
- **ОС**: Ubuntu 22.04 LTS / Debian 12 / Windows Server 2022
- **CPU**: 4–8 ядер (x86_64 или ARM64)
- **RAM**: 8 ГБ (16 ГБ при использовании локальной модели на CPU)
- **Диск**: 15–20 ГБ свободного места на SSD
- **Docker**: Docker Engine 24+ и Docker Compose v2+ либо standalone `docker-compose`

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

При первом запуске `.env` создаётся из `env_example.txt`; `DB_PASSWORD` и `JWT_SECRET` генерируются криптографически стойким генератором. На Linux/macOS файл получает права `600`. Если `.env` отсутствует, но стек уже работает, скрипт сохраняет credentials действующего API-контейнера, чтобы не потерять доступ к существующему PostgreSQL volume.

Основные параметры:

```ini
# База данных PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=aichecker
DB_USER=aichecker_user
DB_PASSWORD=<генерируется при первом запуске>

# JWT Аутентификация
JWT_SECRET=<генерируется при первом запуске>
JWT_ISSUER=AiCheckerApiCore
JWT_AUDIENCE=AiCheckerFrontend
JWT_EXPIRY_MINUTES=1440

# Ключи внешних облачных моделей (Опционально)
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
SBERGPT_API_KEY=your-gigachat-auth-key-here

# Режим работы фронтенда (false для реального бэкенда)
VITE_OFFLINE_MODE=false
FRONTEND_PORT=80
ASPNETCORE_ENVIRONMENT=Production
ANALYSIS_QUEUE_MAX_ATTEMPTS=5

# Локальная модель Qwen
QWEN_MODEL_FILE=Qwen3-1.7B-Q4_K_M.gguf
QWEN_MODEL_URL=https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf
QWEN_MODEL_SHA256=d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5
QWEN_LOCAL_MODEL=local-model
QWEN_CONTEXT_SIZE=4096
QWEN_THREADS=4
QWEN_BATCH_SIZE=512
QWEN_PARALLEL=1

# Минимальный размер когорты; оставьте пустым до решения владельца данных
MIN_COHORT_SIZE=
```

Не переносите `.env` в репозиторий и не публикуйте его содержимое. Если файл создан вручную из шаблона, замените оба значения `CHANGE_ME_*`: deploy-скрипты останавливаются при шаблонном пароле или JWT-секрете короче 32 символов. Порт можно задать до первого запуска, например `FRONTEND_PORT=8088 ./deploy.sh`.

Порты AI-driver и Qwen привязаны только к loopback-интерфейсу хоста. Это сохраняет локальную диагностику через `localhost`, но не позволяет обращаться к внутренним model-endpoint из локальной сети в обход JWT-защищённого API Core. Межконтейнерные запросы продолжают идти по сети `saas-network`.

`MIN_COHORT_SIZE` нельзя подбирать технически: значение утверждает владелец данных. Пока оно пустое, AI-driver возвращает явное ограничение и не использует когортную статистику в ранжировании.

`ANALYSIS_QUEUE_MAX_ATTEMPTS` задает число попыток стойкой очереди PostgreSQL (по умолчанию 5). Входной профиль сохраняется в JSONB до обработки; задания в `Queued`, `Processing` и `Retrying` не теряются при перезапуске API. Штатная остановка worker не расходует попытку.

---

## 4. Локальная модель Qwen3-1.7B Q4_K_M (Air-Gapped контур)

Скрипт развертывания скачивает GGUF-файл из `QWEN_MODEL_URL`, если файла `QWEN_MODEL_FILE` еще нет. Для закрытого контура заранее поместите проверенный совместимый GGUF-файл в `./models/`; требуемые ресурсы зависят от выбранного файла.

Перед финальной приемкой заполните `QWEN_MODEL_SHA256` в `.env`. Если hash не задан, deploy-скрипт запустится, но явно сообщит, что проверка целостности модели пропущена.

Контейнер `qwen-local` запускает сервер `llama.cpp`:
```bash
-m /models/Qwen3-1.7B-Q4_K_M.gguf --host 0.0.0.0 --port 8080 -c 4096 --threads 4 -b 512 -np 1 --cache-ram 0 --no-cache-prompt --no-cache-idle-slots --metrics --alias local-model
```

Для текущего профиля ресурсов обязателен `QWEN_PARALLEL=1`: задания сериализует стойкая очередь API, а параллельные слоты локальной модели повышают расход памяти и в runtime-тесте привели к рестарту `qwen-local`.
Prompt cache отключён: профили различаются, поэтому повторное использование кеша минимально, а стандартный лимит llama.cpp в 8192 MiB создавал накопительное давление памяти при пакете из 15 сотрудников.

---

## 5. Проверка работоспособности (Healthchecks)

После запуска убедитесь, что контейнеры работают, а сервисы с настроенными healthcheck находятся в состоянии `healthy`:

```bash
docker compose ps
```

Deploy-скрипт автоматически выбирает доступную команду. В ручных командах ниже замените `docker compose` на `docker-compose`, если установлен standalone Compose.

### Проверка API эндпоинтов:
- **API Core Swagger**: `http://127.0.0.1:5050/swagger`
- **AI-Driver FastAPI Docs**: `http://localhost:8000/docs`
- **Каталог программ (AI-Driver)**:
  ```bash
  curl http://localhost:8000/agents/catalog
  ```
- **Бенчмарки по должностям**:
  ```bash
  curl http://localhost:8000/agents/benchmarks
  ```
- **Фактическая конфигурация моделей (без раскрытия ключей)**:
  ```bash
  curl http://localhost:8000/models/availability
  ```
- **Локальная модель Qwen Health**:
  ```bash
  docker-compose exec -T qwen-local curl -fsS http://localhost:8080/health
  ```

- **Готовность API Core и его зависимостей**:
  ```bash
  curl http://127.0.0.1:5050/health/ready
  ```
- **Метрики очереди и обработки** (требуется JWT администратора):
  ```bash
  curl -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:5050/api/v1/operations/metrics
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

### Автоматическая проверка backup → restore:
```bash
./scripts/backup_restore_smoke.sh
```
Скрипт создаёт dump работающей базы, восстанавливает его в изолированную временную БД,
сверяет количество пользователей, отчётов и сохранённых результатов, затем удаляет временную БД.

### Перезапуск без потери данных:
```bash
docker compose restart
```
*(Не используйте флаг `-v` при остановке, чтобы сохранить данные в томах PostgreSQL)*.
