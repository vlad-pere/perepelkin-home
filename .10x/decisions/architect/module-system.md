# module-system — модульный механизм Domo

## Контекст и требования

- Домашнее веб-приложение, открытый интернет, ручная выдача доступа (~10 пользователей).
- Владелец добавляет простые модули **конфиг-файлом без кода**; сложные — кодом (Fastify-плагин + React).
- Данные модулей: и простые списки, и связанные записи/вычисления.
- Стек зафиксирован: TypeScript, npm workspaces, Fastify 5, React 19 + Vite, SQLite (better-sqlite3), один инстанс.

## Текущее состояние кода (до изменений)

- Модуль = только метаданные `ModuleInfo`. Нет плагинного хоста, гарда прав для модульных роутов, декларативного CRUD, per-module таблиц, фронт-реестра.
- `core.*` (users/groups/grants) реализован в `apps/server/src/core.ts`; в `packages/core` только registry/can/store — контракт «модуль ↔ ядро» не формализован.
- Сессии не инвалидируются при сбросе пароля / снятии админа.
- Фронт: статический импорт `AdminPage`, хардкод `MODULE_ROUTES` в `Home.tsx`.

## Решение (Вариант A — модульный монолит, согласован)

### Компоненты и границы

- `packages/core` (чистое): `manifest.ts` (типы+валидация манифеста), `api.ts` (интерфейс `CoreApi` — контракт модуль↔ядро), registry/permissions/store/types как сейчас.
- `apps/server`: `src/modules/host.ts` — монтаж модулей под `/api/modules/<id>`, гард `requireModule(moduleId, action)`, CRUD-генератор из манифеста, `ctx.route(action, …)` для код-модулей, изоляция сбоя регистрации (`status='broken'`); `db/db.ts` схема v2; `db/sessions.ts` + `deleteSessionsForUser`.
- `apps/web`: `src/modules/registry.tsx` (ленивый резолвер UI), `src/modules/CrudModule.tsx` (автоген UI из манифеста), маршрут `/m/:moduleId/*`, сгенерированная карта импортов код-модулей.
- `modules/<id>/`: простые — только `manifest.json`; код — манифест + `server.ts` + `ui.tsx`.

### Манифест (контракт простого модуля)

```jsonc
{
  "id": "maintenance",
  "name": "Обслуживание вещей",
  "kind": "simple",                // "simple" | "code"
  "entities": [{
    "name": "item",
    "label": "Вещь",
    "fields": [
      { "name": "title", "label": "Название", "type": "text", "required": true },
      { "name": "nextDue", "label": "Следующее обслуживание", "type": "date" }
    ],
    "defaultSort": { "field": "nextDue", "direction": "asc" }
  }]
}
```

Типы полей: `text`, `textarea`, `number`, `date`, `boolean`. Валидация в `packages/core`; имена таблиц/сущностей `^[a-z0-9_]+$` (защита от SQL-инъекций). Добавление поля → `version`+1 → автоген `ALTER TABLE ADD COLUMN`.

### Модель данных (схема v2)

```sql
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY, kind TEXT CHECK (kind IN ('simple','code')),
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  manifest_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active', error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS module_migrations (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY (module_id, version)
);
-- entity-таблицы: module_<id>_<entity> (id PK, поля по манифесту, created_by, created_at, updated_at)
```

KV-таблица `module_data` остаётся для мелких нужд код-модулей.

### API-контракты

- Платформенные: `/api/auth/*`, `/api/admin/*` (без изменений семантики).
- `/me` + поля `kind`, `route` (источник реестра на фронте).
- Модульные под `/api/modules/<id>`: `GET /manifest` (read); `GET/POST/PATCH/DELETE /<entity>[/:rowId]` (read/write) — генерируются из манифеста; произвольные роуты код-модуля через `ctx.route(action, …)`.
- Ошибки: конверт `{ error: { code, message } }` (как сейчас).

### Потоки данных

- Простой модуль: `manifest.json` → регистрация на старте (upsert в `modules` + миграции) → UI берёт модуль из `/me`, грузит манифест, рендерит CRUD → запросы в `/api/modules/<id>/<entity>` с гардом.
- Код-модуль: манифест + плагин (сервер), `ui.tsx` через карту импортов (фронт).
- Запрос: Caddy(HTTPS) → Fastify → resolveSession → requireModule(can) → обработчик → БД → JSON.

### Failure modes

- Битый манифест / упавший код-модуль при регистрации → `status='broken'`, ядро живо, остальные модули работают; видно в админ-панели.
- Отзыв гранта в сессии → 403 на следующем запросе → фронт перезапрашивает `/me`.
- Упавший chunk UI код-модуля → lazy-import + error boundary; оболочка жива.
- Несовместимый манифест (смена типа поля) → падение миграции, `status='broken'` с понятным текстом.

### Путь масштабирования

- Модули растут линейно (манифесты/пакеты), ядро не меняется.
- До ~100 пользователей — один процесс и SQLite без изменений.
- Многоинстансность — не раньше «10x пользователей»; сейчас не закладывается ничего, что бы ей мешало (сессии уже в БД).

### Миграция кода (порядок)

1. `packages/core`: типы манифеста + валидация + `CoreApi`.
2. Схема v2: `modules`, `module_migrations` (идемпотентно).
3. Хост: гард, монтаж `/api/modules/<id>`, CRUD-генератор, `ctx.route`. Старые роуты не трогаем.
4. Фронт: реестр + `/m/:moduleId/*` + `CrudModule` + генератор карты импортов.
5. Инвалидация сессий + тест.
6. Эталонный простой модуль `maintenance`.
7. README + docs/architecture.md + выровнять AGENTS.md.

### Acceptance contract

1. Простой модуль появляется одним `manifest.json` без правки кода ядра/оболочки; CRUD работает на `/m/<id>`.
2. Эндпоинт модуля без `core.can(moduleId, action)` невозможен (тест 403 без гранта / успех с грантом для simple и code).
3. Права из `/me` режут UI и API (read-only: нет кнопок, 403 на write).
4. Сброс пароля и снятие админа инвалидируют все сессии (тест).
5. CRUD-генератор валидирует поля (типы, required) — тест.
6. Старые тесты зелёные + `npm run typecheck`.

## Не входит в объём

- Docker/Compose/Caddy/README — отдельный этап (согласовано: приоритет — модульный механизм).
- Аудит-лог админ-действий, бэкапы — follow-up.
- Отложено: `core.bus`/события (без переделки).
