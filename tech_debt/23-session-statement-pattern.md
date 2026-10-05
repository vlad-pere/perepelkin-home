# [P3] Привести sessions.ts к паттерну prepared statements

## Приоритет: Низкий
## Оценка: 1/10 (~10 минут)
## Файл: `apps/server/src/db/sessions.ts`

## Проблема

`sessions.ts` создаёт prepared statements **при каждом вызове** функции:

```typescript
// sessions.ts:35-48
export function insertSession(db: Database, ...) {
  const stmt = db.prepare('INSERT INTO sessions ...')  // ← создаётся каждый раз
  stmt.run(...)
}
```

В contrast, `core.ts` предварительно подготавливает все statements в `buildCore()`. Это inconsistency.

## Что сделать

Преобразовать в factory pattern:

```typescript
export function buildSessionStore(db: Database) {
  const insert = db.prepare('INSERT INTO sessions ...')
  const select = db.prepare('SELECT ... FROM sessions ...')
  const remove = db.prepare('DELETE FROM sessions ...')
  const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at < ?')

  return {
    create(userId: string, ttlMs: number) { return insert.run(...) },
    get(token: string) { return select.get(token) as SessionRow | undefined },
    invalidate(token: string) { remove.run(token) },
    cleanup() { deleteExpired.run(Date.now()) },
  }
}
```

Вызов в `app.ts`:

```typescript
const sessions = buildSessionStore(db)
// передаётся в resolveSession, auth routes
```

## Подводные камни

- `better-sqlite3` кеширует prepared statements внутренне, так что пересоздание — это не performance problem, а code smell.
- Изменение API `sessions.ts` затронет `app.ts`, `auth.ts`, `sessions.ts` (resolveSession). Нужно обновить все call sites.
- Не стоит делать это до задачи #21 (unify UserRow) — иначе два изменения в одном файле одновременно.

## Валидация

- `npm run typecheck`
- `npm test` — auth тесты проходят
