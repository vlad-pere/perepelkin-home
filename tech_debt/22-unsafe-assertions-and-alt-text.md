# [P3] Мелкие a11y и type-safety правки

## Приоритет: Низкий
## Оценка: 1/10 (~15 минут)
## Файлы: `modules/diary/src/ui.tsx`, `modules/shopping/src/ui.tsx`

## Проблема

### 1. Пустые `alt=""` на фото в diary (строки 398, 597)

Все пользовательские фото имеют `alt=""`, что помечает их как декоративные. В контексте дневника фото **смысловые** — их стоит описать.

### 2. `e.target as Node` в shopping (строка 484)

Type assertion теряет типизацию event target.

## Что сделать

### Diary: `alt` тексты

```tsx
// Строка 398 — фото в записи
<img src={...} alt={`Фото к записи: ${row.title}`} />

// Строка 597 — превью в форме
<img src={...} alt={values.title || 'Предпросмотр фото'} />
```

### Shopping: `instanceof Node`

```typescript
// Строка 484 — click outside handler
if (e.target instanceof Node && rootRef.current && !rootRef.current.contains(e.target)) {
  onClose()
}
```

## Подводные камни

- `alt` с шаблонной строкой — если `row.title` пустой, alt будет "Фото к записи: ". Это acceptable (пустой title — edge case).
- `instanceof Node` — проверяет что `e.target` — DOM-узел, а не текстовый нод или что-то экзотическое. Более безопасно чем `as Node`.

## Валидация

- `npm run typecheck`
- Экранный ридер: фото в дневнике теперь имеют осмысленный alt
