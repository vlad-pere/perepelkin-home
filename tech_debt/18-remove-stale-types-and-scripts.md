# [P2] Убрать stale @types/better-sqlite3 и copy-css дупликацию

## Приоритет: Средний
## Оценка: 2/10 (~20 минут)
## Файлы: `apps/server/package.json`, `modules/*/scripts/copy-css.mjs`

## Проблема

### 1. `@types/better-sqlite3` v7 при `better-sqlite3` v13

`@types/better-sqlite3` был deprecated на v8. `better-sqlite3` v13+ поставляет собственные TypeScript-типы. Текущий `@types/better-sqlite3` v7.6.13 конфликтует с реальным API v13.

### 2. `scripts/copy-css.mjs` продублирован 6 раз

Каждый модуль (admin, todo, wishlist, diary, move, shopping) содержит **идентичный** `scripts/copy-css.mjs`:

```javascript
import { cpSync } from 'fs'
cpSync('src/ui.css', 'dist/ui.css')
```

Если логика изменится, нужно править 6 файлов.

## Что сделать

### 1. Убрать `@types/better-sqlite3`

```bash
npm uninstall @types/better-sqlite3 -w @perepelkin-home/server
```

Проверить что типы резолвятся из `better-sqlite3` напрямую:

```bash
npx tsc -b apps/server  # должен пройти без ошибок
```

### 2. Вынести copy-css в общий скрипт

Создать `scripts/copy-css.mjs` в корне проекта:

```javascript
import { cpSync } from 'fs'
cpSync('src/ui.css', 'dist/ui.css')
```

В каждом модуле обновить `package.json`:

```json
"scripts": {
  "build": "tsc -p tsconfig.build.json && node ../../scripts/copy-css.mjs"
}
```

Удалить локальные `modules/*/scripts/copy-css.mjs`.

## Подводные камни

- **@types/better-sqlite3:** перед удалением проверить `node_modules/better-sqlite3/dist/` на наличие `.d.ts` файлов. Если типов нет — удаление сломает typecheck.
- **copy-css:** если путь `../../scripts/copy-css.mjs` не резолвится из-за workspace structure, проверить `pwd` при выполнении build script. npm workspaces выполняют скрипты из корня модуля, путь `../../` будет от `modules/admin/` → корень проекта. Это корректно.

## Валидация

- `npm run typecheck` — 0 ошибок после удаления @types
- `npm run build` — все модули собираются, CSS копируется
