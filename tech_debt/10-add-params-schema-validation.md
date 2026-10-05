# [P2] Добавить params schema с pattern на admin grant routes

## Приоритет: Средний
## Оценка: 1/10 (~10 минут)
## Файл: `apps/server/src/routes/admin.ts`, строки 188, 197

## Проблема

PUT и DELETE руты для грантов принимают `moduleId` из URL без валидации pattern:

```typescript
// admin.ts:188 — PUT
schema: { body: setGrantSchema }
// нет params schema!

// admin.ts:197 — DELETE
schema: { params: { type: 'object', properties: { moduleId: { type: 'string' } } } }
// есть params, но нет pattern
```

`moduleId` проходит в `core.grants.remove()` как произвольная строка. Хотя SQL использует параметризованные запросы (инъекция невозможна), отсутствие pattern — defense-in-depth gap.

## Что сделать

```typescript
const moduleIdParamSchema = {
  type: 'object',
  properties: {
    moduleId: { type: 'string', pattern: '^[a-z0-9-]{1,64}$' }
  },
  required: ['moduleId']
}

// PUT /api/admin/modules/:moduleId/grants — добавить:
schema: { body: setGrantSchema, params: moduleIdParamSchema }

// DELETE /api/admin/modules/:moduleId/grants — обновить:
schema: { params: moduleIdParamSchema }
```

Импортировать `MODULE_ID_PATTERN` из core (или захардкодить — pattern уже есть в `registry.ts`).

## Подводные камни

- Fastify валидация работает через AJV. Pattern в params — стандартная фича.
- Тест `admin.test.ts` уже передаёт валидные moduleId — тесты не упадут. Добавить негативный тест: `DELETE /api/admin/modules/!!!INVALID/grants` → 400.

## Валидация

- `npm test` — admin.test.ts проходит
- Ручная: `curl -X DELETE /api/admin/modules/../../etc/passwd/grants` → 400 (не 500)
