# [P1] Вынести дублированные типы и утилиты в общий пакет

## Приоритет: Высокий
## Оценка: 3/10 (~1-2 часа)
## Скоуп: 10+ файлов

## Проблема

Критический объём дублированного кода в модулях:

| Что | Копий | Файлы |
|-----|-------|-------|
| `ApiClient` interface | 6 | todo, wishlist, diary, move, admin, shopping (+ `ModuleApiClient` в registry) |
| `ManifestInfo` interface | 5 | todo, wishlist, diary, move, shopping |
| `formatDate()` | 4 | todo, shopping, admin, CrudModule |
| `safeHttpUrl()`/`safeUrl()` | 3 | shopping, CrudModule, wishlist |
| Error constants (`UNAUTHENTICATED`, `FORBIDDEN`, `CSRF_FAILED`) | 2 | hooks.ts, host.ts |
| `isMutation()` helper | 2 | hooks.ts, host.ts |
| `UserRow` / `SessionUser` | 2 | core.ts, sessions.ts |

Если контракт API изменится, нужно править 6+ файлов вручную.

## Что сделать

### Шаг 1: Создать `packages/shared/src/types.ts`

```typescript
// Общий ApiClient
export interface ApiClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  put<T>(path: string, body?: unknown): Promise<T>
  patch<T>(path: string, body?: unknown): Promise<T>
  del<T>(path: string): Promise<T>
}

// Общий ManifestInfo
export interface ManifestInfo {
  name: string
  description: string
}
```

### Шаг 2: Создать `packages/shared/src/format.ts`

```typescript
export function formatDate(iso: string | unknown): string { ... }
export function safeHttpUrl(raw: string): string | null { ... }
```

### Шаг 3: Создать `packages/shared/src/errors.ts`

```typescript
export const UNAUTHENTICATED = { statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' }
export const FORBIDDEN = { statusCode: 403, error: 'Forbidden', message: 'Forbidden' }
export const CSRF_FAILED = { statusCode: 403, error: 'Forbidden', message: 'CSRF token mismatch' }
export function isMutation(method: string): boolean { return ['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase()) }
```

### Шаг 4: Обновить все импорты

В каждом модуле заменить локальные определения на импорт из `@perepelkin-home/shared`.

### Шаг 5: Обновить `package.json` корня

Добавить `packages/shared` в workspace, добавить в `build`/`dev`/`typecheck` скрипты.

## Подводные камни

- **Важно:** `packages/shared` не должен зависеть от React или Fastify — это чистые TS-типы и утилиты.
- `ApiClient` в модулях — это **frontend** интерфейс; `errors.ts` — **backend**. Можно сделать два подмодуля: `shared/frontend` и `shared/backend`, или объединить (ошибки — чистые объекты, не зависят от фреймворка).
- `formatDate` в каждом модуле имеет slightly different signature (`string | unknown` vs `string`). Выбрать единый: `(iso: string) => string`, вызывающие стороны приводят тип.
- Добавить `packages/shared` в workspace и в скрипты `build`/`dev`/`typecheck` **до** изменения импортов.

## Валидация

- `npm run typecheck` — 0 ошибок
- `npm run build` — все пакеты собираются
- `npm test` — все тесты проходят
- `grep -r "ApiClient" modules/` — 0 локальных определений (только импорты)
