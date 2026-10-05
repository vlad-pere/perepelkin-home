# [P2] Убрать async из resolveSession preHandler обёртки

## Приоритет: Средний
## Оценка: 1/10 (~5 минут)
## Файл: `apps/server/src/app.tsx`, строки 88-89

## Проблема

```typescript
// app.ts:88-89
preHandler: async (req, reply) => {
  await resolveSession(db, req, reply)
}
```

`resolveSession` — **синхронная** функция. Оборачивание в `async` создаёт ненужный Promise wrapper. Fastify обрабатывает async preHandler иначе (createReplyFromErrorPacket), что добавляет overhead.

## Что сделать

```typescript
preHandler: (req, reply) => {
  resolveSession(db, req, reply)
}
```

## Подводные камни

- Если `resolveSession` когда-нибудь станет async, обёртка понадобится. Но сейчас — нет.
- Fastify типизирует `preHandler` как ` preHandlerAsync` — проверить что синхронный handler проходит typecheck.

## Валидация

- `npm run typecheck`
- `npm test` — auth тесты проходят
