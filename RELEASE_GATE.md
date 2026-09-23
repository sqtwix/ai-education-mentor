# Release gate для защиты

Проект считается готовым к production-демо только после выполнения всех пунктов на том commit, который передается заказчику. Основной исторический прогон выполнен 23 августа 2026 года; режим запуска без AI повторно проверен 30–31 августа 2026 года, а универсальный managed/external local provider — 31 августа 2026 года. Галочки ниже фиксируют доказательства того baseline и не заменяют повторный прогон после изменения кода.

## Статус текущего worktree — 20 сентября 2026 года

**Технический gate локального production-demo закрыт.** На текущем worktree повторно прошли component-, container-, browser- и LLM-проверки. Пункты, требующие решения владельца данных, внешних API-ключей, TLS/SSO и экспертной разметки, остаются отдельными организационными условиями промышленного запуска и перечислены ниже.

- [x] `dotnet build ApiCore.sln -warnaserror` и contract tests: 0 warnings/0 errors.
- [x] AI Driver: 27/27 tests и `compileall`.
- [x] Frontend: 6/6 tests, oxlint, production build.
- [x] npm production, NuGet и Python dependency audit: известных уязвимостей нет.
- [x] `init_env.sh`: первый запуск, случайные secrets, права `600`, порт и идемпотентность.
- [x] Browser production: login, каталог, аналитика, настройки, очередь, итоговый отчёт и экспорты; viewport 390×844 без горизонтального overflow.
- [x] `docker compose config/build/up`, миграции `ProductionBaseline` и `AddProcessingCheckpoint`, readiness пяти сервисов на текущем worktree.
- [x] `no_ai_runtime_smoke.sh`, `platform_runtime_smoke.sh`, `qa_acl_smoke.sh`, `backup_restore_smoke.sh` на текущем worktree.
- [x] Реальный Qwen E2E, очередь трёх пользователей, maximum batch 15/15 с retry/checkpoint и browser exports на текущем worktree.

Свежие результаты: Qwen single E2E — passed; multi-user — 3 пользователя за 278 с; maximum batch — 15/15 за 2 955 с после принудительного `SIGKILL`, `attempt_count=3`, checkpoint очищен; read load — 300 запросов при concurrency 12, 89,46 req/s, 0 ошибок; ACL — 12/12; backup→restore — совпадение `0|0|0`. Тестовые данные удалены, стенд оставлен healthy на `http://localhost:8088/`.

Полный handoff, сценарий демонстрации и остаточные продуктовые решения: `CUSTOMER_HANDOFF_AND_PRESENTATION_GUIDE.md`.

## Автоматические проверки

- [x] Frontend: unit tests, oxlint и production build проходят без ошибок.
- [x] ASP.NET backend собирается в `Release`: 0 warnings, 0 errors.
- [x] Python unit tests и импорт приложения проходят в образе `ai-driver`.
- [x] Статус трех групп моделей не раскрывает ключи, не помечает отсутствующий ключ как готовый и проверяет health локального сервера.
- [x] `docker-compose config -q` валиден при заданных обязательных secrets.
- [x] Первый запуск создаёт постоянный `.env` со случайными DB/JWT secrets; Unix-файл имеет права `600`, восстановление отсутствующего `.env` сохраняет credentials работающего API.
- [x] Все три production-образа собираются; health endpoints API и AI-driver отвечают `ok`, nginx — HTTP 200.
- [x] OpenAPI API Core помечает защищённые операции Bearer JWT, оставляет login/register/health публичными и публикует multipart upload; AI-driver публикует `TrajectoryRequest` для трёх provider-endpoint.
- [x] Внутренние AI-driver и llama.cpp опубликованы на хосте только через `127.0.0.1`; вызов model-endpoint из локальной сети в обход API Core не открыт.
- [x] Nginx отдаёт CSP, запрет встраивания, `nosniff`, ограничение browser permissions; HTML не кешируется, hashed assets кешируются на год, API-ответы помечены `no-store`.
- [x] Интерфейс не загружает Google Fonts или другие внешние web-ресурсы; локальный/закрытый контур использует Inter при наличии в системе и системный UI fallback.
- [x] Крупный ответ бенчмарков передаётся nginx потоково и не сбрасывается в proxy temporary file при каждом открытии конструктора.
- [x] Nginx не вводит отдельный 1 МБ upload-limit и не буферизует request body на диск; технический предел и ответ определяет API Core.
- [x] Логотип первого экрана не дублируется в bundle: единый PNG 192×192 весит 21 КБ вместо двух загрузок исходного 854 КБ asset.
- [x] Стартовый экран проверен без console errors на desktop и mobile viewport.
- [x] Для доступных runtime-экранов входа, конструктора, fallback-результата, каталога, аналитики, архива и настроек сохранены реальные desktop/tablet/mobile снимки; горизонтального переполнения на проверенных viewport нет.
- [x] DOM-аудит основных экранов не выявил элементов без доступного имени, изображений без `alt` и дублирующихся `id`; иерархия заголовков последовательна, диалог каталога управляется с клавиатуры.
- [x] `VITE_OFFLINE_MODE=false` по умолчанию.
- [x] Обычный deploy не выполняет предварительный `down`/удаление volume, автоматически выбирает Compose v2 или standalone и подтверждён сквозным запуском на порту 8088.
- [x] Deploy не сообщает об успехе до `healthy` всех включённых сервисов; при ошибке указывает сервис и команду для логов.
- [x] Полный `npm audit` (production + dev) — 0 vulnerabilities.
- [x] `pip-audit` внутри production-образа — no known vulnerabilities.
- [x] `dotnet list package --vulnerable --include-transitive` — уязвимых пакетов нет.
- [x] API Core и AI-driver работают от непривилегированных пользователей, с read-only root filesystem и `no-new-privileges`; временные upload-файлы вынесены в ограниченный tmpfs.
- [x] Docker JSON-логи всех сервисов ограничены ротацией `10m × 5`, чтобы длительная эксплуатация не заполняла диск.
- [x] Локальный model endpoint не публикуется на хосте; при включении `local-ai` llama.cpp закреплён immutable digest, а модель и deploy проверяются обязательным SHA256.
- [x] Базовый стек запускается при `ENABLE_LOCAL_LLM=false` без GGUF и облачных ключей; каталог, аналитика, аккаунты, история и настройки доступны, генерация возвращает `MODEL_UNAVAILABLE`.
- [x] `ENABLE_LOCAL_LLM=false` отключает только локальный provider: настроенные DeepSeek/GigaChat остаются независимыми вариантами генерации.
- [x] Локальный provider поддерживает managed GGUF и external OpenAI-compatible endpoint; deploy проверяет `/models` и минимальный chat inference, а старые `QWEN_*` мигрируются без потери значений.
- [x] Managed runtime проверен с эталонной Qwen3 и отдельным файлом `qwen2.5-0.5b-instruct-q8_0.gguf`; имя модели не зашито в pipeline.
- [x] Контракт external-режима проверен реальным OpenAI-compatible chat запросом; external Compose-конфигурация содержит четыре сервиса и не включает managed `local-llm`, адрес host runtime документирован через `host.docker.internal`.
- [x] `./scripts/no_ai_runtime_smoke.sh` подтверждает readiness базового стека, auth/settings/ACL, каталог, аналитику, валидную и невалидную загрузку, `operating_mode=no-ai` и отсутствие новой задачи после отклонённой генерации.
- [x] `./scripts/platform_runtime_smoke.sh` работает и без настроенного провайдера: проверяет metrics/cache/rate-limit и явно пропускает только AI-зависимую идемпотентность.

## Данные и рекомендации

- [x] Один контрольный профиль сохраняет все поля в `.json`, `.xlsx`, `.csv` и `.zip`.
- [x] Неполный профиль и batch более 15 профилей отклоняются.
- [x] Batch с несколькими профилями требует явного выбора профиля в интерфейсе.
- [x] Ни один курс со статусом `Пройден` не попадает в рекомендации.
- [x] Кандидатами для LLM является весь доступный каталог после исключения пройденных курсов.
- [x] Курс вне официального каталога отклоняется; неоднозначный fuzzy-match не используется.
- [x] Для каждой рекомендации есть `evidence_sources`.
- [x] При отсутствии точной когорты `должность + ИОГВ` результат содержит limitation.
- [x] Radar chart не строится без подтвержденных уровней компетенций.
- [x] HTTP smoke: Employee не получает реестр (403), корректная загрузка принята (202), неполная — отклонена (400), неизвестная модель — отклонена (400), fallback помечен `CompletedWithLimitations/degraded`.
- [x] Endpoint бенчмарков API Core и прямой endpoint AI-driver не содержат `users`: только `total_records` и агрегаты по 36 должностям/242 парам; справочник ИОГВ содержит 60 значений без профилей сотрудников.
- [x] Задание с сохраненным входным профилем переживает перезапуск API и после восстановления AI-driver завершается с непустым результатом; остановка worker не расходует попытку.
- [x] ACL smoke для двух Employee: чужие status/rename/archive/unarchive возвращают 404, чужой отчёт отсутствует в history, anonymous получает 401, фикстуры полностью очищаются.

## Модели

- [x] Production-профиль Qwen3-1.7B Q4_K_M зафиксирован: GGUF SHA256 подтверждён, llama.cpp image закреплён digest, context 4096, parallel 1, prompt cache отключён.
- [x] Максимальный пакет 15/15 повторно пройден на финальном профиле: 1488 с, checkpoint/retry после принудительного рестарта, Qwen restarts 0, OOM false.
- [ ] DeepSeek — опциональный provider; для его включения требуется `DEEPSEEK_API_KEY` и отдельная приёмка передачи данных.
- [ ] GigaChat/Sber — опциональный provider; для его включения требуется `SBERGPT_API_KEY` и отдельная приёмка передачи данных.
- [ ] `MIN_COHORT_SIZE` заполнен согласованным владельцем данных значением.
- [ ] Сравнение трех групп моделей выполнено на одном экспертном test set и записано в `MODEL_COMPARISON.md`.

## Что требует внешних входных данных

Эти пункты нельзя честно закрыть кодом без участия владельца данных:

- экспертный test set 15-30 профилей;
- эталонные допустимые/запрещенные курсы по каждому профилю;
- согласованный минимум размера когорты;
- разрешение на использование внешних моделей с ПДн-политикой.
