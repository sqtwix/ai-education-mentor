# Руководство администратора платформы ИОТ

Документ описывает production-развёртывание, конфигурацию, безопасность, мониторинг, резервное копирование и восстановление платформы индивидуальных траекторий обучения.

## 1. Контур и требования

| Сервис | Назначение | Доступ с хоста |
|---|---|---|
| `frontend` | React SPA и nginx reverse proxy | `${FRONTEND_PORT:-80}` на всех интерфейсах |
| `api-core` | ASP.NET Core 9, auth, очередь, данные | `127.0.0.1:${API_HOST_PORT:-5050}` |
| `ai-driver` | FastAPI, LLM-конвейер | `127.0.0.1:8000` |
| `postgres` | PostgreSQL 15 | только Docker network |
| `qwen-local` | опциональный profile `local-ai`: llama.cpp и GGUF | только Docker network |

Минимум: 4 CPU, 8 ГБ RAM, 15 ГБ SSD. Для локальной Qwen: 8 CPU, 16 ГБ RAM и 20 ГБ SSD. Нужны Docker Engine 24+ и Compose v2 либо standalone `docker-compose`.

`docker-compose.yml` не завершает внешний production-периметр: перед публикацией установите TLS reverse proxy/WAF, доменное имя, сетевой ACL и резервное копирование по регламенту организации.

## 2. Первичное развёртывание

### Linux / macOS

```bash
git clone https://github.com/sqtwix/ai-education-mentor.git
cd ai-education-mentor
chmod +x deploy.sh
./deploy.sh
```

### Windows

```cmd
git clone https://github.com/sqtwix/ai-education-mentor.git
cd ai-education-mentor
deploy.bat
```

Deploy выполняет следующие действия:

1. создаёт или безопасно дополняет `.env`;
2. генерирует `DB_PASSWORD` и `JWT_SECRET`;
3. проверяет, что секреты не шаблонные и JWT не короче 32 символов;
4. при `ENABLE_LOCAL_QWEN=true` загружает GGUF и обязательно сверяет SHA-256; при `false` пропускает модель;
5. собирает образы;
6. подготавливает ownership volume Data Protection keys;
7. запускает стек с настроенными healthchecks.

На Unix `.env` получает права `600`. Не запускайте `docker compose down -v`: флаг удаляет PostgreSQL и Data Protection volumes.

Для существующей установки задайте `FRONTEND_PORT=8088` в `.env`. При самом первом запуске можно выполнить:

```bash
FRONTEND_PORT=8088 ./deploy.sh
```

## 3. Конфигурация `.env`

Шаблон находится в `env_example.txt`. Никогда не коммитьте рабочий `.env` и не прикладывайте его к заявкам поддержки.

### Обязательные секреты

```ini
DB_HOST=postgres
DB_PORT=5432
DB_NAME=aichecker
DB_USER=aichecker_user
DB_PASSWORD=<случайный секрет>

JWT_SECRET=<случайный секрет не короче 32 символов>
JWT_ISSUER=AiCheckerApiCore
JWT_AUDIENCE=AiCheckerFrontend
JWT_EXPIRY_MINUTES=1440
```

Смена `DB_PASSWORD` требует согласованной смены пароля существующей роли PostgreSQL. Простая замена значения в `.env` для уже созданного volume нарушит подключение. Смена `JWT_SECRET` завершит все активные сессии.

### Режим без нейросети

Это штатный режим по умолчанию и не требует добавлять переменную вручную. Если `ENABLE_LOCAL_QWEN` отсутствует, deploy трактует её как `false`; новый `.env` уже получает это значение из шаблона. Запускаются `frontend`, `api-core`, `postgres` и `ai-driver`; deploy также останавливает и удаляет контейнер `qwen-local`, если он остался от предыдущего запуска. GGUF-файл при этом не удаляется. Доступны регистрация, вход, каталог, аналитика, история, архив и настройки. Создание новой ИОТ отключено, а прямой запрос получает `503` с кодом `MODEL_UNAVAILABLE` без постановки задачи в очередь. `/health/ready` остаётся успешным, если PostgreSQL и AI Driver исправны.

### Локальная модель

```ini
ENABLE_LOCAL_QWEN=true
QWEN_MODEL_FILE=Qwen3-1.7B-Q4_K_M.gguf
QWEN_MODEL_URL=https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf
QWEN_MODEL_SHA256=d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5
QWEN_LOCAL_MODEL=local-model
QWEN_CONTEXT_SIZE=4096
QWEN_THREADS=4
QWEN_BATCH_SIZE=512
QWEN_PARALLEL=1
```

Checksum обязателен только при `ENABLE_LOCAL_QWEN=true` и должен содержать ровно 64 hex-символа. При несовпадении deploy останавливается. Для air-gapped установки заранее скопируйте проверенный файл в `models/`; автоматическая загрузка тогда не нужна.

Не увеличивайте `QWEN_PARALLEL` без отдельного нагрузочного теста. Текущий профиль `1` выбран для устойчивой пакетной обработки. Контекст `4096`, отключённый prompt cache и `--cache-ram 0` являются частью проверенного профиля.

### Облачные провайдеры

```ini
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
SBERGPT_API_KEY=
SBERGPT_MODEL=GigaChat-Pro
```

Они необязательны. Пустой ключ делает соответствующую модель недоступной в интерфейсе. Перед включением внешнего провайдера согласуйте передачу обезличенных данных, договор, лимиты, журналирование и требования организации.

### Очередь, когорта и загрузка

```ini
ANALYSIS_QUEUE_MAX_ATTEMPTS=5
MIN_COHORT_SIZE=
UPLOAD_MAX_FILE_BYTES=26214400
UPLOAD_MAX_REQUEST_BYTES=52428800
UPLOAD_MAX_FILE_COUNT=20
UPLOAD_MAX_ARCHIVE_ENTRIES=100
UPLOAD_MAX_ARCHIVE_UNCOMPRESSED_BYTES=104857600
UPLOAD_MAX_ARCHIVE_COMPRESSION_RATIO=100
```

`MIN_COHORT_SIZE` — не технический параметр производительности. Его утверждает владелец данных как минимально допустимый размер группы для статистики. Пустое значение отключает когортное ранжирование, сохраняя остальную генерацию.

Очередь хранится в PostgreSQL. Задачи `Queued`, `Processing` и `Retrying` переживают перезапуск; checkpoint сохраняется после каждого профиля. По умолчанию допускается 5 попыток. Штатная остановка worker не расходует попытку.

## 4. Проверка после запуска

```bash
docker compose ps
curl -fsS http://127.0.0.1:5050/health
curl -fsS http://127.0.0.1:5050/health/ready
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/models/availability
docker compose exec -T qwen-local curl -fsS http://127.0.0.1:8080/health
```

Если установлена standalone-версия, замените `docker compose` на `docker-compose`.

- `/health` проверяет сам API Core.
- `/health/ready` проверяет готовность его зависимостей.
- `/models/availability` не раскрывает ключи и показывает реальную доступность провайдеров.
- Swagger доступен только на loopback: `http://127.0.0.1:5050/swagger`.

Сначала проверьте сценарий без модели: регистрация → вход → каталог → аналитика → настройки → история; конструктор должен показать отсутствие провайдеров и заблокировать генерацию. Если включён провайдер, отдельно проверьте: создание одного профиля → завершение → открытие отчёта → PDF/XLSX/JSON → архив → восстановление.

## 5. Мониторинг и журналы

Сводка контейнеров и журналы:

```bash
docker compose ps
docker compose logs --tail=200 api-core
docker compose logs --tail=200 ai-driver
docker compose logs --tail=200 qwen-local
```

Следите за restart count, `unhealthy`, заполнением диска, временем очереди, повторными попытками и числом `CompletedWithLimitations`/`Failed`. Docker-логи ограничены пятью файлами по 10 МБ на сервис.

Административные метрики очереди требуют JWT пользователя с ролью `Admin`:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:5050/api/v1/operations/metrics
```

Не помещайте токен в shell history на общем сервере. Роль `Admin` не выдаётся публичной регистрацией; назначайте её только утверждённым пользователям через контролируемую административную процедуру.

## 6. Резервное копирование и восстановление

Создание дампа без вывода пароля:

```bash
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup.sql
```

Перед восстановлением остановите пользовательский трафик, создайте свежую резервную копию и проверьте целевую БД:

```bash
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup.sql
```

Автоматическая неповреждающая проверка dump→временная БД→сверка→удаление:

```bash
./scripts/backup_restore_smoke.sh
```

Храните backup за пределами Docker host, шифруйте и регулярно проверяйте восстановление. Отдельно сохраняйте `.env` в защищённом хранилище секретов; без корректного DB password база недоступна, а без Data Protection keys часть защищённых данных может потерять расшифровываемость.

## 7. Обновление и откат

Перед обновлением:

1. зафиксируйте текущий commit/image digest;
2. сделайте и проверьте backup;
3. изучите миграции БД;
4. выполните тесты из `RELEASE_GATE.md`;
5. запланируйте окно обслуживания.

Обновление выполняйте штатным `./deploy.sh`. EF Core migrations применяются API при старте. Не откатывайте приложение на схему, несовместимую со старой версией; при необходимости восстанавливайте согласованную пару приложения и backup БД.

Безопасный перезапуск текущей версии:

```bash
docker compose restart
```

## 8. Диагностика

### Qwen не становится healthy

```bash
sha256sum models/Qwen3-1.7B-Q4_K_M.gguf
docker compose logs --tail=300 qwen-local
```

Сверьте имя, checksum, свободную RAM/диск и параметры 4096/4/512/1. Не заменяйте модель файлом с тем же именем без обновления утверждённого hash и повторной приёмки.

### API не ready

Проверьте `postgres`, `ai-driver`, затем `api-core`. Отсутствующая модель сама по себе не делает API неготовым. Частые причины: несогласованный DB password существующего volume, недоступный AI Driver, нехватка диска или ошибочная переменная окружения.

### Задача долго обрабатывается

Локальная CPU-модель работает последовательно. Проверьте stage, queue metrics, restart count и логи. Не меняйте статус напрямую в БД. После рестарта задача должна продолжиться с checkpoint; исчерпавшая попытки задача станет `Failed`.

### Результат завершён с ограничениями

Это штатный защищённый fallback после ошибки LLM. Количественно отслеживайте такие случаи, передавайте результат методисту и устраняйте причину модели. Экспорт заблокирован намеренно.

### Закончился диск

Проверьте Docker images, volumes, backups и системные журналы. Не удаляйте `postgres_data` или `dataprotection_keys`. Очистку неиспользуемых образов выполняйте только после фиксации используемых digest и проверки возможности отката.

## 9. Production checklist

- [ ] Установлены уникальные DB/JWT secrets, `.env` защищён.
- [ ] Выбран и задокументирован режим: без AI, облачный провайдер или `local-ai`.
- [ ] При `ENABLE_LOCAL_QWEN=true` GGUF checksum совпадает, образ llama.cpp закреплён digest.
- [ ] Внешние порты ограничены firewall; настроен TLS.
- [ ] Неиспользуемые облачные ключи пусты.
- [ ] Владелец данных документировал решение по `MIN_COHORT_SIZE`.
- [ ] Все контейнеры healthy, restart count равен нулю после стабилизации.
- [ ] Пройден end-to-end пользовательский сценарий.
- [ ] Пройдены ACL, пакетный runtime и backup/restore smoke.
- [ ] Настроены мониторинг, alerting, retention и внешний backup.
- [ ] Назначены ответственные за доступы, инциденты и экспертную проверку ИОТ.

Границы подтверждённой готовности и команды приёмки находятся в [RELEASE_GATE.md](RELEASE_GATE.md) и [QWEN3_PIPELINE_VALIDATION_REPORT.md](QWEN3_PIPELINE_VALIDATION_REPORT.md).
