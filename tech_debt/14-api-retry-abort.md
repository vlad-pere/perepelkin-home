# [P2] Добавить retry/abort в API-слой

## Приоритет: Средний
## Оценка: 3/10 (~1 час)
## Файл: `apps/web/src/api.ts`

## Проблема

`api()` функция не имеет:
- Retry logic для transient network errors (502, 503, 504, network error)
- AbortController support (net cleanup при unmount компонента)
- Request timeout (зависший запрос блокирует UI навсегда)
- 401 redirect использует `window.location.assign` (полная перезагрузка страницы вместо SPA-навигации)

## Текущий код

```typescript
// api.ts:20-64
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await fetch(url, { method, headers, body: ... })
  if (resp.status === 401) {
    window.location.assign('/login')  // ← полный reload
    throw new ApiError(401, 'Session expired')
  }
  if (!resp.ok) throw new ApiError(resp.status, ...)
  return resp.json()
}
```

## Что сделать

1. **Retry с экспоненциальным backoff** для 502/503/504 и network errors:

```typescript
async function apiWithRetry<T>(method: string, path: string, body?: unknown, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await api<T>(method, path, body)
    } catch (e) {
      if (attempt === retries || !isRetryable(e)) throw e
      await sleep(1000 * 2 ** attempt)  // 1s, 2s
    }
  }
  throw new Error('unreachable')
}

function isRetryable(e: unknown): boolean {
  if (e instanceof ApiError) return [502, 503, 504].includes(e.status)
  if (e instanceof TypeError) return e.message.includes('fetch')  // network error
  return false
}
```

2. **AbortController** — добавить параметр `signal`:

```typescript
export async function api<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(url, { method, headers, body: ..., signal })
  // ...
}
```

Использование в компонентах:
```typescript
useEffect(() => {
  const ctrl = new AbortController()
  api('GET', '/api/items', undefined, ctrl.signal).then(setItems)
  return () => ctrl.abort()
}, [])
```

3. **Timeout** — обернуть fetch в `Promise.race` с таймаутом (10 сек):

```typescript
const timeout = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new ApiError(408, 'Request timeout')), 10000)
)
const resp = await Promise.race([fetch(url, opts), timeout])
```

## Подводные камни

- AbortController выбрасывает `AbortError` — нужно отличать от `ApiError` в error handling компонентов.
- Retry для POST/PUT/PATCH — **опасно** (идемпотентность не гарантирована). Retry только для GET.
- 401 redirect через `window.location.assign` — заменить на React Router `navigate('/login')`, но для этого нужно пробросить `navigate` в api.ts (или использовать window.location — проще, надёжнее для edge cases).
- Не перекомплицировать: retry + abort + timeout — можно сделать за 1 час, но если начинать добавлять кэширование и deduplication — это уже отдельный проект.

## Валидация

- `npm run typecheck`
- Ручная: выдернуть сетевой кабель → запрос retry-ается 2 раза, потом показывает ошибку
- Ручная: unmount компонента → abort, нет утечки
