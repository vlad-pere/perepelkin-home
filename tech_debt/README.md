# Tech Debt — Индекс задач

> Сгенерировано: 2026-08-25
> Ревью: 1 проход, оценка **7/10** — сильные основы (strict TS, тесты ядра, безопасность), но есть пробелы во фронтенде и дублирование.
> Исправления по ревью: скорректированы описания задач #01, #08, #11 (AppShell → div.shell, корректное описание useEffect cleanup, hooks rules).

## Сводка

| Приоритет | Открыто | Закрыто | Оценка затрат |
|-----------|---------|---------|---------------|
| P0 (Критический) | 0 | 1 | ~5 мин |
| P1 (Высокий) | 7 | 1 | ~8-9 часов |
| P2 (Средний) | 12 | 0 | ~4-5 часов |
| P3 (Низкий) | 6 | 0 | ~2-3 часа |
| **Итого** | **25** | **2** | **~15-18 часов** |

> ✅ Закрыто: **01** Suspense boundary, **02** ErrorBoundary (2026-08-31).

## Порядок выполнения (рекомендуемый)

### Неделя 1: Быстрые победы + критические исправления
1. ~~`01` — Suspense boundary (5 мин)~~ ✅
2. `03` — MAX_FILE_SIZE_MB alignment (5 мин)
3. `10` — params schema validation (10 мин)
4. `11` — me! assertions + main tag (10 мин)
5. `12` — duplicate deps/CSS/globals.d.ts (15 мин)
6. `19` — async wrapper removal (5 мин)
7. ~~`02` — ErrorBoundary (30 мин)~~ ✅
8. `08` — useEffect deps fix (20 мин)
9. `09` — non-atomic file delete (15 мин)
10. `04` — SELECT * security fix (20 мин)

### Неделя 2: Структурные улучшения
11. `06` — dedup types & utils (1-2 часа)
12. `07` — split god components (2-3 часа)
13. `05` — ESLint + Prettier (1 час)
14. `13` — README alignment (20 мин)
15. `15` — frontend tests (3-4 часа)
16. `16` — fix root scripts (15 мин)

### Неделя 3: Остальное
17. `14` — API retry/abort (1 час)
18. `17` — env/config tests (30 мин)
19. `18` — stale types & copy-css (20 мин)
20. `20` — staging modules mount (5 мин)
21. `21` — session type unification (15 мин)
22. Остальное — P3 задачи по мере необходимости

---

## P0 — Критический

| # | Задача | Файл | Оценка |
|---|--------|------|--------|
| ~~01~~ | ~~Suspense boundary~~ ✅ | `apps/web/src/App.tsx` | 1/10 |

## P1 — Высокий

| # | Задача | Файл | Оценка |
|---|--------|------|--------|
| ~~02~~ | ~~ErrorBoundary~~ ✅ | `apps/web/src/App.tsx` | 2/10 |
| 03 | [MAX_FILE_SIZE_MB](03-fix-max-file-size-contradiction.md) | `config.ts`, README | 1/10 |
| 04 | [SELECT * security](04-fix-select-star-leak.md) | `apps/server/src/core.ts` | 2/10 |
| 05 | [ESLint + Prettier](05-setup-eslint-prettier.md) | Весь проект | 3/10 |
| 06 | [Dedup types & utils](06-dedup-types-and-utils.md) | 10+ файлов | 3/10 |
| 07 | [Split god components](07-split-god-components.md) | shopping, admin, diary | 4/10 |
| 08 | [useEffect deps](08-fix-useeffect-deps.md) | admin, Login | 2/10 |
| 15 | [Frontend tests](15-add-frontend-tests.md) | `apps/web/`, modules | 5/10 |

## P2 — Средний

| # | Задача | Файл | Оценка |
|---|--------|------|--------|
| 09 | [Non-atomic file delete](09-non-atomic-file-delete.md) | `files.ts` | 2/10 |
| 10 | [Params schema](10-add-params-schema-validation.md) | `admin.ts` | 1/10 |
| 11 | [me! + main tag](11-add-suspense-and-main-tag.md) | `App.tsx` | 1/10 |
| 12 | [Duplicate deps/CSS](12-fix-duplicate-deps-and-css.md) | package.json, CSS | 1/10 |
| 13 | [README alignment](13-readme-alignment.md) | `README.md` | 2/10 |
| 14 | [API retry/abort](14-api-retry-abort.md) | `apps/web/src/api.ts` | 3/10 |
| 16 | [Root scripts](16-fix-root-scripts.md) | `package.json` | 2/10 |
| 17 | [env/config tests](17-add-env-config-tests.md) | `env.ts`, `config.ts` | 2/10 |
| 18 | [Stale types + copy-css](18-remove-stale-types-and-scripts.md) | package.json, scripts | 2/10 |
| 19 | [async wrapper](19-fix-admin-async-wrapper.md) | `app.ts` | 1/10 |
| 20 | [Staging mount](20-staging-modules-mount.md) | `docker-compose.staging.yml` | 1/10 |
| 21 | [Session type unify](21-session-user-type-unify.md) | `core.ts`, `sessions.ts` | 2/10 |

## P3 — Низкий

| # | Задача | Файл | Оценка |
|---|--------|------|--------|
| 22 | [a11y + alt text](22-unsafe-assertions-and-alt-text.md) | diary, shopping | 1/10 |
| 23 | [Session statement pattern](23-session-statement-pattern.md) | `sessions.ts` | 1/10 |
| 24 | [Security tests](24-security-test-expansion.md) | `security.test.ts` | 2/10 |
| 25 | [Dead code cleanup](25-cleanup-dead-code.md) | Корень проекта | 1/10 |
| 26 | [noUnusedLocals](26-add-noUnusedLocals.md) | `tsconfig.base.json` | 2/10 |
| 27 | [CI caching + rsync](27-ci-caching-and-rsync.md) | workflows | 1/10 |
