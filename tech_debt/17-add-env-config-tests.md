# [P2] Добавить тесты для env.ts и config.ts

## Приоритет: Средний
## Оценка: 2/10 (~30 минут)
## Файлы: `apps/server/src/env.ts`, `apps/server/src/config.ts`

## Проблема

- `env.ts` — кастомный `.env` парсер (обрабатывает кавычки, `export` префикс, комментарии) — **ноль тестов**.
- `config.ts` — `parsePort()`, `parseBool()`, `parseSessionTtl()`, `parseFileSizeMb()` — **ноль unit-тестов** (только S3 конфиг протестирован в `storage.test.ts`).

Edge cases не покрыты:
- `PORT=abc` → что вернёт `parsePort`?
- `SESSION_TTL_HOURS=-1` → parseSessionTtl вернёт отрицательное?
- `MAX_FILE_SIZE_MB=0` → parseFileSizeMb вернёт 0?
- `.env` файл с escape-последовательностями в кавычках

## Что сделать

### `apps/server/src/env.test.ts`

```typescript
describe('loadEnvFile', () => {
  it('parses basic key=value', ...)
  it('handles single-quoted values', ...)
  it('handles double-quoted values', ...)
  it('strips export prefix', ...)
  it('ignores comments', ...)
  it('ignores empty lines', ...)
  it('handles values containing =', ...)
  it('returns empty object for missing file', ...)
  it('handles Windows CRLF line endings', ...)
})
```

### `apps/server/src/config.test.ts`

```typescript
describe('parsePort', () => {
  it('returns default for empty env', ...)
  it('parses valid port', ...)
  it('throws for non-numeric', ...)
  it('throws for port 0', ...)
  it('throws for port > 65535', ...)
})

describe('parseBool', () => {
  it('returns default for empty env', ...)
  it('returns true for "true"', ...)
  it('returns false for "false"', ...)
  it('returns default for random string', ...)
})

describe('parseSessionTtl', () => {
  it('returns default for empty env', ...)
  it('parses hours to ms', ...)
  it('throws for negative', ...)
  it('throws for 0', ...)
})

describe('parseFileSizeMb', () => {
  it('returns default for empty env', ...)
  it('clamps to max', ...)
  it('throws for 0', ...)
  it('throws for negative', ...)
})
```

## Подводные камни

- `env.ts` использует `fs.readFileSync` — нужно мокать `fs` или передавать контент строкой (проверить текущий API).
- `parseFileSizeMb` теперь будет дефолтиться в 8 MB (после задачи #3) — тесты должны отражать это.
- Не тратить время на тестирование `config.ts` для S3 — оно уже покрыто в `storage.test.ts`.

## Валидация

- `npm test` — все новые тесты зелёные
- `npm run build` — сборка не сломана
