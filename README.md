# Domo

Модульное веб-приложение для дома. Пользователь добавляет и убирает функционал (модули); разные группы людей — например, семья и друзья — видят разные наборы модулей. Приложение доступно из открытого интернета, доступы раздаются вручную (саморегистрации нет).

## Возможности

- **Модульная система.** Простые модули — один файл `manifest.json` без кода; сложные — код (Fastify-плагин + React). Пример простого модуля: график обслуживания вещей в доме.
- **Автогенерация UI.** Простые модули получают CRUD-интерфейс автоматически из манифеста, без пересборки фронтенда.
- **Доступ по группам.** `пользователи → группы → модули`. Права чтения/записи на модуль задаются на уровне группы.
- **Безопасность.** Сессии (httpOnly + Secure), per-session CSRF, bcrypt, rate limiting, security-заголовки.

## Стек

TypeScript (npm workspaces: `apps/`, `packages/`, `modules/`), Fastify 5 + better-sqlite3, React 19 + Vite, Vitest. Прод-деплой — Docker Compose (приложение + Caddy reverse proxy с авто-HTTPS).

## Быстрый старт (локальная разработка)

Требования: Node.js >= 24, npm >= 11.

1. Установить зависимости:

   ```sh
   npm install
   ```

2. Настроить окружение:

   ```sh
   Copy-Item apps/server/.env.example apps/server/.env   # PowerShell
   ```

   В `apps/server/.env` задать `ADMIN_PASSWORD` (8–72 символа) и при желании `ADMIN_USERNAME`. Если пароль не задан, `npm run seed` сгенерирует его и выведет в консоль.

3. Создать администратора и группы по умолчанию («Семья», «Гости»):

   ```sh
   npm run seed
   ```

4. Запустить разработку (сервер на `http://localhost:3000`, фронтенд на `http://localhost:5173`, Vite проксирует `/api`):

   ```sh
   npm run dev
   ```

5. Открыть `http://localhost:5173`, войти как администратор, завести пользователей, распределить по группам и выдать доступы к модулям (см. ниже).

## Управление доступом

- **Админ-панель (`/admin`, модуль `admin`)** — три раздела: пользователи (создание, пароль, права, удаление), группы (создание/удаление, участники) и доступы к модулям (чтение/запись по группам).
- **Группы, членство и доступы к модулям** можно управлять и через admin API (мутации требуют заголовок `x-csrf-token` из ответа `POST /api/auth/login`):
  - `GET /api/admin/groups`, `GET /api/admin/modules` — списки групп и модулей (со статусами);
  - `POST /api/admin/groups/:id/members` `{ "user_id": <id> }` — добавить пользователя в группу;
  - `PUT /api/admin/modules/:moduleId/grants` `{ "group_id": <id>, "can_read": true, "can_write": true }` — выдать доступ к модулю;
  - `DELETE /api/admin/modules/:moduleId/grants/:groupId` — отозвать доступ.

## Модули

### Простой модуль (только `manifest.json`)

Простой модуль — это каталог `modules/<id>/` с манифестом. Эталонный пример — `modules/maintenance/` (график обслуживания вещей).

1. Создать `modules/<id>/manifest.json`:

   ```jsonc
   {
     "id": "maintenance",
     "name": "Обслуживание вещей",
     "description": "График обслуживания вещей в доме",
     "kind": "simple",
     "entities": [
       {
         "name": "item",
         "label": "Вещь",
         "fields": [
           { "name": "title", "label": "Название", "type": "text", "required": true },
           { "name": "nextDue", "label": "Следующее обслуживание", "type": "date" },
           { "name": "cost", "label": "Стоимость", "type": "number" },
           { "name": "done", "label": "Выполнено", "type": "boolean" }
         ],
         "defaultSort": { "field": "nextDue", "direction": "asc" }
       }
     ]
   }
   ```

2. Создать `modules/<id>/package.json`, чтобы каталог был workspace-пакетом:

   ```json
   { "name": "@perepelkin-home/module-<id>", "version": "0.1.0", "private": true, "type": "module" }
   ```

3. `npm install`, затем перезапустить сервер — модуль подхватится на старте.
4. Выдать доступ группе (admin API, см. выше).
5. Модуль появляется у пользователей на главной; CRUD работает на `/m/<id>`.

Правила манифеста:

- Типы полей: `text`, `textarea`, `number`, `date`, `boolean`. `required: true` — поле обязательно при создании записи и не может быть пустым (применимо к любому типу).
- Зарезервированные имена полей: `id`, `created_at`, `updated_at`, `created_by`.
- `defaultSort.field` обязан существовать среди полей сущности.
- Добавление поля к существующей сущности безопасно: версия модуля растёт, колонка добавляется автоматически. Смена типа поля не поддерживается — модуль помечается как `broken`, остальные продолжают работать.
- Валидацию манифеста выполняет `packages/core`; имя сущности/поля — `^[a-z][a-zA-Z0-9_]{0,63}$` (защита от SQL-инъекций).

### Простой модуль со своим интерфейсом

Иногда простому модулю нужен свой экран вместо общего CRUD-UI (например, список дел с прогресс-баром). Тогда модуль остаётся декларативным (`kind: "simple"`, бэкенд — общий CRUD), а в `apps/web/src/modules/registry.tsx` для его id регистрируется собственный React-компонент — он имеет приоритет над общим UI. Пример — `modules/todo/` (страница в пакете модуля, как у `modules/admin/`). Добавление такого модуля требует пересборки фронтенда (`npm run build`).

### Код-модуль

Манифест с `kind: "code"` + Fastify-плагин (`server.ts`) и React-роуты (`ui.tsx`). Роуты регистрируются через `ctx.route({ method, path, action }, handler)` — проверка прав обязательна для каждого роута. Пример — `modules/admin/`. Подробности: [docs/architecture.md](docs/architecture.md).

## Скрипты

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Сборка core/admin/todo + сервер (3000) и фронтенд (5173) одновременно |
| `npm run dev:server` / `npm run dev:web` | Только сервер / только фронтенд |
| `npm run seed` | Создаёт администратора и группы «Семья»/«Гости» |
| `npm run build` | Сборка core, module-admin, module-todo, server, web |
| `npm run typecheck` | Проверка типов во всех workspace-пакетах |
| `npm test` | Vitest: core + server |

## Тесты и проверки

- Юнит/интеграционные тесты: `npm test` (манифест, права, CRUD-генератор, хост модулей, админка, сессии).
- `test/repo-modules.test.ts` — safety-net: реальные манифесты из `modules/` валидны, эталон монтируется и проходит CRUD.
- E2E фронтенда — Playwright-стенд в `.scratch/e2e/` (см. скилл `webapp-testing`): вход, CRUD, сброс сессии, read-only для гостя, админ-UI групп/грантов.

## Продакшен

Деплой — Docker Compose: приложение (`app`) + Caddy reverse proxy (`caddy`) с авто-HTTPS (Let's Encrypt). Файлы: `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `docker-entrypoint.sh`.

1. **Настроить окружение.** Скопировать `.env.example` в `.env` и заполнить: `DOMAIN` (домен, на котором будет доступно приложение; A/AAAA-запись должна указывать на сервер), `ADMIN_PASSWORD` (8–72 символа), при желании `ADMIN_USERNAME`, `ACME_EMAIL`. Хост-порты `HTTP_PORT`/`HTTPS_PORT` по умолчанию 80/443.

2. **Запустить:**

   ```sh
   docker compose up -d --build
   ```

   При первом старте контейнер сам создаёт администратора и группы «Семья»/«Гости» (seed идемпотентен, безопасен на каждом старте). База — named volume `data` (`/app/data/perepelkin-home.db`), данные переживают рестарт и обновление образа.

3. **Добавить модуль** — положить `modules/<id>/manifest.json` на сервере и перезапустить контейнер: `docker compose restart app`. Каталог `modules/` монтируется в контейнер read-only, пересборка образа не нужна.

Прод-настройки: `COOKIE_SECURE=true` и `TRUST_PROXY=true` (по умолчанию так и задано в `docker-compose.yml`, за Caddy). Для локального теста по `http://localhost` задайте `DOMAIN=localhost`, `COOKIE_SECURE=false` и свободные порты, напр. `HTTP_PORT=8080` (Caddy для `localhost` отдаст самоподписанный сертификат на HTTPS-порту).

### Как это устроено

- **Dockerfile** — мультистейдж: `build` (npm ci + сборка core → module-admin → server → web) и `runtime` (только prod-зависимости, артефакты сборки, не-root пользователь `node`). `npm ci` идёт с `--ignore-scripts`: better-sqlite3 и esbuild используют prebuilds/optionalDependencies, компилятор в образе не нужен.
- **`docker-compose.yml`** — сервис `app` (healthcheck через `GET /api/auth/me`), сервис `caddy` (ждёт healthy, раздаёт по `DOMAIN`, авто-HTTPS). Секреты/конфиг — из `.env`.
- **Монтирование модулей.** Код-модуль `admin` импортируется сервером из `node_modules` (не из смонтированного каталога), поэтому хост-маунт `./modules` не ломает импорт.

Переменные окружения сервера: см. `apps/server/.env.example`.
