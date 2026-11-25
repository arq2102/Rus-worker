# Rus-worker

SPA с прогнозом погоды на Cloudflare Workers. Общаться с пользователем на русском.

- Сайт: https://rus-worker.arq2102.workers.dev
- Имя Worker: `rus-worker` (задано в `cloudflare.config.ts`, не зависит от имени папки)

## Команды

```powershell
npx cf dev          # локально, http://localhost:5173/
npx cf workers types
npx vp check        # формат, линтер, типы
npx vp test --run
npm run ci:build    # локальная проверка одной командой: типы, линтер, тесты, сборка
npx cf deploy       # публикует сайт; только по просьбе пользователя
npx cf auth whoami  # проверка входа (вход: npx cf auth login)
```

## Устройство

- `index.html`: разметка.
- `client/main.ts`: интерфейс и маршруты (History API). Текст вставляется только через `textContent`.
- `client/weather.ts`: запросы к Open-Meteo и функции без DOM.
- `client/style.css`: стили, светлая и тёмная тема.
- `client/tsconfig.json`: отдельный конфиг с типами DOM; корневой `tsconfig.json` относится к Worker.
- `src/index.ts`: отвечает 404 на запросы, которые не обслужили статические файлы.
- `cloudflare.config.ts`: `assets.notFoundHandling = "single-page-application"`.
- `test/index.test.ts`: тесты функций из `client/weather.ts`.

## Решения

- Браузер обращается к Open-Meteo напрямую, без прокси в Worker и без API-ключа. Атрибуция CC BY 4.0 указана в подвале. Условия бесплатного доступа проверить перед коммерческим использованием.
- Выбранное место хранится в адресе: `/weather?name=…&lat=…&lon=…`. По умолчанию Москва.
- Координаты из геолокации округляются до двух знаков.

## История (ноябрь 2026)

1. Проект создан: `npx cf@latest init Rus-worker --package-manager npm`.
2. Генерация типов падала с access violation в `workerd`; помогла установка свежего Microsoft Visual C++ Redistributable.
3. Выполнен вход в Cloudflare: `npx cf auth login`.
4. Сначала задеплоен шаблон «Hello World!», затем SPA погоды.
5. Проект перенесён из `Desktop\4 урок\Rus-worker` в `Desktop\Rus-worker`. Соседний учебный проект (Telegram-бот) остался в `4 урок`.

## Состояние

- Проверено: типы, линтер, тесты, сборка; в браузере поиск, выбор города, «Назад», прямая ссылка.
- Не проверено: кнопка «Рядом со мной», переход по заголовку «Погода».
- Репозиторий (публичный): https://github.com/arq2102/Rus-worker, ветка `main`.

## CI/CD

Используются только Cloudflare Workers Builds; GitHub Actions не нужны (решение пользователя).

Настройки в панели Cloudflare (Workers & Pages → `rus-worker` → Settings → Builds):

- Production branch: `main`. Push в `main` публикует сайт.
- Build command: `npm run check && npm test` (типы, `vp check`, тесты; при `CI=true` тесты не уходят в режим ожидания).
- Deploy command: `npx cf deploy` (сам собирает проект перед публикацией).
- Сборки других веток включены, команда `npx cf previews deploy` (запуск не проверен).
- API-токен для сборки Cloudflare создаёт сам; в репозитории секретов нет.
- Версия Node.js задана в `.node-version`.
