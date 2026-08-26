# Frontend ИИ-агента ИОТ

React/Vite-интерфейс для формирования индивидуальной образовательной траектории: выбор профиля ГГС, история обучения, каталог программ, интерактивный roadmap и выгрузки PDF/XLSX/JSON.

## Production-режим

По умолчанию frontend работает с backend API. Не включайте offline/demo для приемки или защиты.

```bash
npm test
npm run lint
npm run build
```

`VITE_API_URL` можно указать на этапе сборки, если API находится не на стандартном `/api/v1`.

## Offline/demo только для разработки

Offline-режим нужен для локальной проверки UI без backend. В этом режиме авторизация и история сохраняются в `localStorage`, а результат не является доказательством работы ИИ-агентов.

```bash
VITE_OFFLINE_MODE=true npm run dev
```

Важно: переменные `VITE_*` встраиваются Vite во время build. Для production-сборки оставляйте `VITE_OFFLINE_MODE=false`.
