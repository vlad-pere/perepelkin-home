# [P1] Убрать SELECT * с users — password_hash в внутренних типах

## Приоритет: Высокий
## Оценка: 2/10 (~20 минут)
## Файл: `apps/server/src/core.ts`

## Проблема

`core.ts` делает `SELECT * FROM users` (строки 67-69, 89, 113), что тянет `password_hash` и `pin_hash` в тип `UserRow`. Эти хеши затем доступны через `req.user` в хуках (`hooks.ts:29`), `auth.ts:113`, и `sessions.ts` (`SessionUser` включает `password_hash`, `pin_hash`).

Любой код, который случайно сделает `console.log(req.user)` или `JSON.stringify(req.user)`, утечёт хеши паролей.

## Текущий код

```typescript
// core.ts:67-69
const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
// UserRow включает password_hash, pin_hash
```

## Что сделать

1. **В `buildCore()`** — для основных запросов (getById, list) использовать явный список колонок:

```typescript
const USER_COLS = 'id, username, is_admin, created_at'

// Запросы без хешей:
db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`)
db.prepare(`SELECT ${USER_COLS} FROM users`)
```

2. **Для login-запроса** (`getByUsername`) — оставить `SELECT *` или `SELECT id, username, password_hash, pin_hash, is_admin, created_at` (нужен password_hash для сверки).

3. **Тип `UserRow`** — убрать `password_hash` и `pin_hash` из основного типа. Создать отдельный `UserRowAuth` (или `UserAuth`) для login-запроса:

```typescript
type UserRow = { id: string; username: string; is_admin: number; created_at: string }
type UserRowAuth = UserRow & { password_hash: string; pin_hash: string | null }
```

4. **Обновить `SessionUser`** в `sessions.ts` — убрать `password_hash` и `pin_hash` (сессии не должны хранить хеши).

## Подводные камни

- `getByUsername` используется **только** в `auth.ts` для логина. Там нужен `password_hash`. Остальные запросы — нет.
- `resolveSession` в `sessions.ts` читает `SessionUser` из БД — нужно убедиться, что `users` SELECT в `resolveSession` тоже не тянет хеши.
- `toUser()` уже фильтрует хеши для API-ответов, но проблема в том, что хеши **попадают в память** на уровне типов.

## Валидация

- `npm run typecheck`
- `npm test` — все тесты auth/admin должны пройти
- Проверить что `req.user` в хуках не содержит `password_hash`
