# [P2] Сделать root build/dev/test скрипты динамическими

## Приоритет: Средний
## Оценка: 2/10 (~15 минут)
## Файл: `package.json` (корень)

## Проблема

`build`, `dev`, `typecheck` скрипты в корневом `package.json` **вручную перечисляют** каждый workspace:

```json
"build": "npm run build -w @perepelkin-home/core && npm run build -w @perepelkin-home/module-admin && npm run build -w @perepelkin-home/module-todo && ..."
```

Добавление нового модуля требует редактирования **3 скриптов**. Это хрупко и забывается.

## Что сделать

Использовать npm workspaces фичу `-ws --if-present`:

```json
{
  "scripts": {
    "build": "npm run build -ws --if-present",
    "dev": "npm run build -ws --if-present && concurrently -n server,web -k \"npm run dev -w @perepelkin-home/server\" \"npm run dev -w @perepelkin-home/web\"",
    "typecheck": "tsc -b",
    "test": "npm run test -ws --if-present"
  }
}
```

Для `dev` — `npm run build -ws --if-present` построит все workspaces (порядок зависит от npm workspace topology). Затем `concurrently` запустит сервер и web.

## Подводные камни

- **Порядок сборки:** `core` должен собираться **до** модулей и `server`. npm workspaces `-ws` не гарантирует топологический порядок. Если это критично — добавить `npm run build -w @perepelkin-home/core && npm run build -ws --if-present` (core первым, потом все остальные).
- **`--if-present`** — пропускает workspaces без скрипта `build`. Это безопасно.
- **`typecheck`** уже использует `tsc -b` (build mode) с project references — это корректно и не требует изменений.

## Валидация

- `npm run build` — все пакеты собираются в правильном порядке
- `npm run dev` — сервер и web стартуют
- Добавить фиктивный workspace с `build` скриптом → `npm run build` его подхватит без правок
