# [P2] Объединить UserRow и SessionUser в единый тип

## Приоритет: Средний
## Оценка: 2/10 (~15 минут)
## Файлы: `apps/server/src/core.ts`, `apps/server/src/db/sessions.ts`

## Проблема

`UserRow` (core.ts:13-20) и `SessionUser` (sessions.ts:10-17) — **структурально идентичные** интерфейсы, описывающие одну и ту же таблицу `users`. Если колонка будет добавлена/удалена, оба типа нужно обновлять синхронно.

После задачи #4 (убрать SELECT *), `UserRow` будет без хешей. `SessionUser` тоже не должен содержать хеши (сессии не должны знать пароли).

## Что сделать

1. **Создать `apps/server/src/types.ts`:**

```typescript
export interface UserRow {
  id: string
  username: string
  is_admin: number
  created_at: string
}
```

2. **В `core.ts`:** импортировать `UserRow` из `types.ts`, удалить локальное определение.

3. **В `sessions.ts`:** импортировать `UserRow`, переименовать `SessionUser` в `UserRow` (или удалить `SessionUser` и использовать `UserRow` напрямую).

4. **В `hooks.ts`, `auth.ts`:** обновить импорты.

## Подводные камни

- После задачи #4, `UserRow` **не будет** содержать `password_hash`. Нужно убедиться что `sessions.ts` SELECT не пытается выбрать хеши (если выберет, query упадёт или вернёт undefined).
- `SessionRow` (сессия, не пользователь) — это другой тип (`id`, `user_id`, `expires_at`). Его не трогать.

## Валидация

- `npm run typecheck`
- `npm test` — auth и admin тесты проходят
