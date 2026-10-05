# [P2] Убрать дублированные зависимости, CSS, и globals.d.ts

## Приоритет: Средний
## Оценка: 1/10 (~15 минут)
## Файлы: `apps/web/package.json`, `modules/admin/src/ui.css`, `modules/move/src/`, `modules/shopping/src/`

## Проблема

### 1. Дубликат `@fontsource/spectral` в `apps/web/package.json`

```json
"@fontsource/spectral": "^5",        // ← строка 21: мёртвый дубликат
"@fontsource/spectral": "^5.3.0",    // ← строка 22: используется
```

JSON допускает дублирующие ключи, но значение берётся последнее. Строка 21 — мусор.

### 2. Дублированные CSS-классы `.btn-danger-solid`

Определены **идентично** в:
- `apps/web/src/styles.css` (строки 359-387)
- `modules/admin/src/ui.css` (строки 275-327)

Admin модуль переопределяет глобальные стили.

### 3. Отсутствует `globals.d.ts` в move и shopping

`modules/move/src/ui.tsx` и `modules/shopping/src/ui.tsx` импортируют CSS (`import './ui.css'`), но у них нет `globals.d.ts` с `declare module '*.css'`. Остальные 4 модуля (admin, todo, wishlist, diary) имеют.

## Что сделать

1. **`apps/web/package.json`:** удалить строку 21 (`"@fontsource/spectral": "^5"`).

2. **`modules/admin/src/ui.css`:** удалить строки 275-327 (дубликаты `.btn-danger-solid`, `.btn-danger`). Оставить только глобальные определения в `styles.css`.

3. **Создать `modules/move/src/globals.d.ts`:**
   ```typescript
   declare module '*.css'
   ```

4. **Создать `modules/shopping/src/globals.d.ts`:**
   ```typescript
   declare module '*.css'
   ```

## Подводные камни

- Удаляя CSS из admin, проверить что ни один элемент в admin не использует стили, которых нет в глобальном `styles.css`. Сравнить классы `.btn-danger-solid` и `.btn-danger` — они **идентичны** (background, border, padding, color), безопасно удалять.
- `globals.d.ts` нужен только для TypeScript — Vite обрабатывает CSS без declaration. Но отсутствие файла — inconsistency.

## Валидация

- `npm run typecheck` — 0 ошибок
- `npm run build` — все модули собираются
- Ручная: кнопки "Удалить" в admin выглядят как раньше
