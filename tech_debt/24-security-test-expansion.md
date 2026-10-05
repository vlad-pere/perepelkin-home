# [P3] Расширить security.test.ts

## Приоритет: Низкий
## Оценка: 2/10 (~30 минут)
## Файл: `apps/server/test/security.test.ts`

## Проблема

`security.test.ts` содержит **один тест** — проверяет что CSP не содержит `upgrade-insecure-requests`. Не проверяются:

- HSTS заголовок (`strict-transport-security`)
- Cookie атрибуты (`httpOnly`, `secure`, `sameSite`)
- Rate limiting (возвращается ли 429)
- Security headers (`x-content-type-options`, `x-frame-options`, `referrer-policy`)

## Что сделать

Расширить `security.test.ts`:

```typescript
describe('Security headers', () => {
  it('sets HSTS header', async () => {
    const res = await inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['strict-transport-security']).toContain('max-age=')
  })

  it('sets x-content-type-options', async () => {
    const res = await inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('sets sameSite cookie', async () => {
    const res = await inject({ method: 'POST', url: '/api/auth/login', ... })
    const cookie = res.headers['set-cookie']
    expect(cookie).toContain('SameSite=Strict')
  })

  it('returns 429 after rate limit exceeded', async () => {
    for (let i = 0; i < 11; i++) {
      await inject({ method: 'POST', url: '/api/auth/login', ... })
    }
    const res = await inject({ method: 'POST', url: '/api/auth/login', ... })
    expect(res.statusCode).toBe(429)
  })
})
```

## Подводные камни

- Rate limit тест медленный (нужно 11 запросов). Использовать `fastify.inject` (in-process, не HTTP).
- Cookie testing в Fastify: `res.cookies` массив объектов, или парсить `set-cookie` header вручную.
- `app.close()` в `afterAll` — корректно закрывает DB и server.

## Валидация

- `npm test` — все новые тесты зелёные
- Убедиться что тесты не хрупкие (не зависят от timing, не используют `sleep`)
