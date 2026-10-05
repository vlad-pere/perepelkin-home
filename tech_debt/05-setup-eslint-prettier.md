# [P1] Добавить ESLint + Prettier

## Приоритет: Высокий
## Оценка: 3/10 (~1 час на настройку + авто-fix)
## Скоуп: Весь проект

## Проблема

В проекте **нет ни линтера, ни форматтера**. Нет `.eslintrc`, `eslint.config.js`, `.prettierrc`. Нет скриптов `lint` или `format` в `package.json`. Это значит:

- Нет детекции неиспользуемых импортов на уровне редактора
- Нет единообразного форматирования
- Нет ловли ошибок типа `==` вместо `===`, пропущенных зависимостей в `useEffect`, etc.
- `verbatimModuleSyntax` в tsconfig частично компенсирует, но не заменяет линтер

## Что сделать

1. **Установить** в корневой `package.json` (devDependencies):
   - `eslint` (flat config)
   - `@eslint/js`
   - `typescript-eslint`
   - `eslint-plugin-react-hooks`
   - `eslint-plugin-react-refresh`
   - `prettier`
   - `eslint-config-prettier` (отключает ESLint-правила, конфликтующие с Prettier)

2. **Создать `eslint.config.js`** (корень проекта):

```js
import js from '@eslint/js'
import ts from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    }
  },
  { ignores: ['**/dist/', '**/node_modules/', '**/.scratch/', '.10x/', '.superpowers/'] }
)
```

3. **Создать `.prettierrc`** (минимальный):

```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }
```

4. **Добавить скрипты** в корневой `package.json`:
   - `"lint": "eslint ."`
   - `"lint:fix": "eslint . --fix"`
   - `"format": "prettier --write ."`

5. **Запустить `npm run lint:fix`** — авто-fix всего что можно.

6. **Добавить в CI** (опционально): шаг `npm run lint` в workflows.

## Подводные камни

- Flat config (eslint.config.js) — стандарт с ESLint 9. Не использовать legacy `.eslintrc`.
- `eslint-plugin-react-hooks` — критически важен: ловит `useEffect` с пропущенными зависимостями.
- После установки будут ошибки в существующем коде — нужно будет пройтись по `lint:fix`, остальное — ручные правки.
- Не ставить `@typescript-eslint/recommended-requiring-type-checking` — он медленный и шумный для этого проекта.

## Валидация

- `npx eslint .` — 0 ошибок (или только `warn`)
- `npx prettier --check .` — все файлы отформатированы
- Редактор подхватывает ESLint-плагин и показывает ошибки инлайн
