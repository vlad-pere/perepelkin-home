# Tech Debt — Индекс задач

> Сгенерировано: 2026-08-25 (одно ревью, оценка **7/10**: сильные основы — strict TS, тесты ядра, безопасность; пробелы — фронтенд и дублирование).
> Исправления по ревью: скорректированы описания задач #01, #08, #11.
> **Статусы сверены с кодом 2026-10-05** — после коммитов `72e81ea` (ESLint/Prettier + первые исправления) и `020662f` (строгая валидация тела запроса).
>
> Легенда: ✅ сделано · ◐ частично (в комментарии — что именно осталось) · ○ открыто.
> Задача #28 добавлена позже — её не было в исходном ревью.

## Сводка

| Приоритет | ✅ | ◐ | ○ | Всего |
|-----------|----|----|----|-------|
| P0 (критический) | 1 | 0 | 0 | 1 |
| P1 (высокий) | 3 | 1 | 4 | 8 |
| P2 (средний) | 2 | 3 | 8 | 13 |
| P3 (низкий) | 0 | 2 | 4 | 6 |
| **Итого** | **6** | **6** | **16** | **28** |

## Что делать дальше (рекомендуемый порядок)

1. **Быстрые победы, ~1 час суммарно:** `10` (pattern на params грантов), `19` (убрать `async` из `preHandler`), `16` (root-скрипты через `npm run … -ws`), `21` (единый тип пользователя), `25` (assertion в `seed.ts`).
2. **Закрыть начатое:** `05` (`.prettierignore` + прогон Prettier), `18` (`@types/better-sqlite3`), `26` (`noUnusedLocals`), `12` (остатки дублей CSS и `globals.d.ts`).
3. **Заметно пользователю:** `08` (зависимости `useEffect` в админке и на входе), `22` (alt-тексты фото в дневнике), `14` (retry/abort в API-слое).
4. **Структурное, по 2–5 часов:** `06` (общие типы и утилиты), `07` (разбить god-компоненты), `15` (тесты фронтенда).
5. **Инфраструктура:** `28` (образ без монтирования `modules` неполный).

---

## P0 — Критический

| # | Задача | Оценка | Статус | Комментарий |
|---|--------|--------|--------|-------------|
| 01 | [Suspense boundary](01-suspense-boundary.md) | 1/10 | ✅ | `<Suspense>` вокруг ленивого модуля — `apps/web/src/App.tsx` |

## P1 — Высокий

| # | Задача | Оценка | Статус | Комментарий |
|---|--------|--------|--------|-------------|
| 02 | [ErrorBoundary](02-error-boundary.md) | 2/10 | ✅ | `apps/web/src/components/ErrorBoundary.tsx`, корневой и гранулярный |
| 03 | [MAX_FILE_SIZE_MB](03-fix-max-file-size-contradiction.md) | 1/10 | ✅ | Дефолт 8 МБ и потолок 256 в коде, оба `.env.example`, README |
| 04 | [SELECT * с хешами](04-fix-select-star-leak.md) | 2/10 | ✅ | Явные списки колонок в `core.ts`; хеши только в `UserRowAuth` для входа |
| 05 | [ESLint + Prettier](05-setup-eslint-prettier.md) | 3/10 | ◐ | Конфиги, скрипты и зависимости есть, `lint` — 0 ошибок. Осталось: нет `.prettierignore` (glob задевает `dist/` и `.scratch/`), `prettier --write` по проекту не прогнан, шага lint нет в CI |
| 06 | [Общие типы и утилиты](06-dedup-types-and-utils.md) | 3/10 | ○ | `ApiClient` продублирован в 9 модулях, `formatDate`, `safeUrl`, `UNAUTHENTICATED`/`isMutation` — тоже |
| 07 | [Разбить god-компоненты](07-split-god-components.md) | 4/10 | ○ | `shopping/ui.tsx` 941 строка, `admin/ui.tsx` 802, `diary/ui.tsx` 714 |
| 08 | [useEffect deps](08-fix-useeffect-deps.md) | 2/10 | ○ | `admin/ui.tsx` (3 места) и `Login.tsx` — без зависимостей и без `useCallback` |
| 15 | [Тесты фронтенда](15-add-frontend-tests.md) | 5/10 | ○ | В `apps/web/` нет ни тестов, ни `vitest.config.ts`, ни скрипта `test` |

## P2 — Средний

| # | Задача | Оценка | Статус | Комментарий |
|---|--------|--------|--------|-------------|
| 09 | [Атомарное удаление файлов](09-non-atomic-file-delete.md) | 2/10 | ○ | Сначала удаляется запись в БД, потом объект в хранилище |
| 10 | [Params schema](10-add-params-schema-validation.md) | 1/10 | ○ | У PUT грантов нет params, у DELETE `moduleId` без `pattern` |
| 11 | [`me!` + `<main>`](11-add-suspense-and-main-tag.md) | 1/10 | ○ | `ModulePage` рендерит `div.shell`, assertions `me!` на месте |
| 12 | [Дубли deps/CSS](12-fix-duplicate-deps-and-css.md) | 1/10 | ◐ | Дубликат `@fontsource/spectral` убран. Осталось: дубли `.btn-danger` в `admin/ui.css`, нет `globals.d.ts` в `move` и `shopping` |
| 13 | [README alignment](13-readme-alignment.md) | 2/10 | ✅ | Размер и типы файлов, формулировка про `.scratch/e2e/`, примечание про два `.env.example`, подраздел staging |
| 14 | [API retry/abort](14-api-retry-abort.md) | 3/10 | ○ | `apps/web/src/api.ts` — без `signal`, таймаута и повторов |
| 16 | [Root scripts](16-fix-root-scripts.md) | 2/10 | ○ | Воркспейсы перечислены вручную в `build`, `dev`, `typecheck`, `test` |
| 17 | [env/config tests](17-add-env-config-tests.md) | 2/10 | ○ | Тестов на `config.ts` и `env.ts` нет |
| 18 | [Stale types + copy-css](18-remove-stale-types-and-scripts.md) | 2/10 | ◐ | `copy-css` вынесен в корневой `scripts/copy-css.mjs`. Осталось: в `apps/server/package.json` всё ещё `@types/better-sqlite3: ^7` при `better-sqlite3: ^13` |
| 19 | [async wrapper](19-fix-admin-async-wrapper.md) | 1/10 | ○ | `addHook('preHandler', async …)` вокруг синхронного `resolveSession` |
| 20 | [Staging mount](20-staging-modules-mount.md) | 1/10 | ✅ | `docker-compose.staging.yml` монтирует `./modules:/app/modules:ro`, как прод. Без этого стенд терял код-модули `maintenance` и `wishlist` |
| 21 | [Session type unify](21-session-user-type-unify.md) | 2/10 | ◐ | Хешей в типах сессии нет, формы `UserRow` и `SessionUser` совпадают. Осталось: единого типа нет — оба интерфейса продублированы |
| 28 | Dockerfile: образ неполный без монтирования | 2/10 | ○ | В `Dockerfile` нет `modules/maintenance/package.json` и dist для `maintenance`/`wishlist`; прод работает только потому, что каталог `modules` приходит монтированием с уже собранным `dist` |

## P3 — Низкий

| # | Задача | Оценка | Статус | Комментарий |
|---|--------|--------|--------|-------------|
| 22 | [a11y + alt text](22-unsafe-assertions-and-alt-text.md) | 1/10 | ○ | Три `alt=""` в дневнике (строки 397, 595, 609) и `e.target as Node` в `shopping` |
| 23 | [Session statement pattern](23-session-statement-pattern.md) | 1/10 | ○ | `db.prepare(...)` вызывается на каждый запрос вместо подготовленных заранее |
| 24 | [Security tests](24-security-test-expansion.md) | 2/10 | ○ | В `security.test.ts` только проверка CSP; нет HSTS, cookie-атрибутов, 429 |
| 25 | [Dead code cleanup](25-cleanup-dead-code.md) | 1/10 | ◐ | Мёртвые каталоги удалены. Осталось: verbose assertion в `apps/server/src/seed.ts` |
| 26 | [noUnusedLocals](26-add-noUnusedLocals.md) | 2/10 | ◐ | Неиспользуемые переменные вычищены, правило ESLint включено. Осталось: флаги `noUnusedLocals`/`noUnusedParameters` в `tsconfig.base.json` |
| 27 | [CI caching + rsync](27-ci-caching-and-rsync.md) | 1/10 | ○ | Кэша нет ни в `Deploy`, ни в `Staging`; список excludes в rsync не вычищен |

---

## Открытые наблюдения (не оформлены отдельными задачами)

- **Кодировка `docker-compose.yml` и `docker-compose.staging.yml`.** Русские комментарии и тексты ошибок (`${ADMIN_PASSWORD:?…}`) в обоих файлах — «кракозябры»: выводимое сообщение при незаданной переменной нечитаемо. Функционально не мешает.
- **`typecheck` требует предварительной сборки.** `packages/core` потребляется из `dist`, поэтому `npm run typecheck` на чистом дереве падает с ошибками про `MODULE_ID_PATTERN` и `hidden`; лечится `npm run build` перед проверкой.
- **Прод зависит от собранного `dist` на машине разработки.** `Deploy` синхронизирует рабочую копию целиком, включая gitignore'нутый `dist` модулей. Выкат из чистого клона сломает код-модули (см. #28).
