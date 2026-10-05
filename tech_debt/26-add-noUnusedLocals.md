# [P3] Включить noUnusedLocals в tsconfig

## Приоритет: Низкий
## Оценка: 2/10 (~15 минут на правку + авто-fix)
## Файл: `tsconfig.base.json`

## Проблема

`tsconfig.base.json` включает `strict: true`, но **не включает** `noUnusedLocals` и `noUnusedParameters`. Это позволяет мёртвые локальные переменные и неиспользуемые параметры функций.

## Что сделать

1. **Добавить в `tsconfig.base.json`:**

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

2. **Запустить `npm run typecheck`** — будут ошибки для неиспользуемых переменных.

3. **Исправить все ошибки:**
   - Убрать неиспользуемые переменные
   - Переименовать неиспользуемые параметры: добавить `_` префикс (например, `_req` → `_req`)

## Подводные камни

- `noUnusedParameters` потребует `_` prefix для неиспользуемых параметров во всех обработчиках Fastify (`(req, reply) => ...` где `reply` не используется).
- Начать с `noUnusedLocals` — это проще и ловит больше мусора. `noUnusedParameters` можно добавить позже.
- Если ошибок слишком много (>30), начать только с `noUnusedLocals`.

## Валидация

- `npm run typecheck` — 0 ошибок
- `npm run build` — сборка проходит
