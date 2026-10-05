# [P1] Разбить God Components (shopping, admin, diary)

## Приоритет: Высокий
## Оценка: 4/10 (~2-3 часа на три модуля)
## Файлы: `modules/shopping/src/ui.tsx` (942), `modules/admin/src/ui.tsx` (804), `modules/diary/src/ui.tsx` (716)

## Проблема

Три компонента значительно превышают порог читаемости:

| Модуль | Строк | Компонентов/функций | useState |
|--------|-------|---------------------|----------|
| shopping | 942 | 12+ (ItemMenu, ItemRow, BacklogRow, ItemForm, RatingPicker, 6 utils) | ~10 |
| admin | 804 | 4 крупных (UsersPanel, GroupsPanel, GrantsPanel, CredentialInputs) | 12+ |
| diary | 716 | 3 крупных (DiaryModule, EntryForm, 8 utils) | 8 |

Такие файлы невозможно быстро понять, отрефакторить или добавить фичу.

## Что сделать

### Shopping (`modules/shopping/src/ui.tsx` → 5 файлов)

```
modules/shopping/src/
  ui.tsx          — только ShoppingModule ( main orchestrator, ~200 строк)
  ItemMenu.tsx    — dropdown menu с confirm (~120 строк)
  ItemRow.tsx     — строка товара (~115 строк)
  ItemForm.tsx    — форма добавления/редактирования (~133 строк)
  utils.ts        — normalizeStatus, ratingFromRow, fromRow, parsePrice,
                    buildPayload, formatCoef, formatPrice, formatDate, safeHttpUrl
```

### Admin (`modules/admin/src/ui.tsx` → 4 файла)

```
modules/admin/src/
  ui.tsx           — только AdminPage (роутинг между табами, ~80 строк)
  UsersPanel.tsx   — управление пользователями (~280 строк)
  GroupsPanel.tsx  — управление группами (~240 строк)
  GrantsPanel.tsx  — управление грантами (~95 строк)
  CredentialInputs.tsx — уже выделен, оставить как есть
```

### Diary (`modules/diary/src/ui.tsx` → 3 файла)

```
modules/diary/src/
  ui.tsx           — DiaryModule (оркестратор, ~200 строк)
  EntryForm.tsx    — форма записи с фото (~180 строк)
  utils.ts         — parsePhotos, todayISO, formatDay, groupByDate,
                    fromRow, validateValues, buildEntryPayload
```

## Порядок разбиения

1. **Начать с admin** — самый чистый (3 независимых панели, легко выделить).
2. **Затем diary** — 2 крупных блока + утилиты.
3. **Потом shopping** — самый большой, но структура ясна.

Каждый шаг — отдельный коммит. Не менять логику, только переместить код.

## Подводные камни

- **Экспорты:** каждый выделенный компонент должен быть `export default` или named export. Проверить что `ui.tsx` (entry point модуля) корректно реэкспортирует всё нужное.
- **CSS-классы:** при перемещении компонентов в отдельные файлы убедиться, что CSS-импорты (`import './ui.css'`) остаются в `ui.tsx` или добавляются в каждый новый файл.
- **Зависимости между компонентами:** `ItemMenu` вызывает `onEdit`, `onDelete` через props — нет circular dependencies. `UsersPanel` и `GroupsPanel` независимы.
- **Не менять поведение.** Только файловая структура. Логику, имена переменных, стили — не трогать.

## Валидация

- `npm run typecheck` после каждого шага
- `npm run build` после каждого шага
- Ручная проверка: каждый модуль работает как раньше (CRUD, меню, формы)
