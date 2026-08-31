# [P3] Убрать мёртвый код и orphaned директории

## Приоритет: Низкий
## Оценка: 1/10 (~10 минут)
## Скоуп: Корень проекта

## Проблема

В корне проекта есть директории/файлы, которые не используются кодом:

| Путь | Описание | Статус |
|------|----------|--------|
| `.10x/` | Решения и handoff от предыдущего инструмента | ✅ Удалено |
| `.superpowers/sdd/` | Пустая директория | ✅ Удалено |
| `shots2/` | Старые скриншоты (должно быть в `.scratch/`) | ✅ Удалено |
| `docs/superpowers/` | Спецификации已完成ного todo-модуля | Оставлено как история |

Кроме того, в `seed.ts:61` — verbose `NonNullable` assertion:

```typescript
const adminUser = core.users.getByUsername(admin.username) as NonNullable<ReturnType<typeof core.users.getByUsername>>
```

## Что сделать

1. **Удалить мёртвые директории:** ✅ Готово

Директории `.10x/`, `.superpowers/sdd/`, `shots2/` удалены, добавлены в `.gitignore`.

2. **Упростить assertion в seed.ts:**

```typescript
// Было (строка 61):
const adminUser = core.users.getByUsername(admin.username) as NonNullable<ReturnType<typeof core.users.getByUsername>>

// Стало:
const adminUser = core.users.getByUsername(admin.username)!
// Админ только что создан — assertion безопасен
```

Или лучше — добавить null check:

```typescript
const adminUser = core.users.getByUsername(admin.username)
if (!adminUser) throw new Error('Failed to create/find admin user')
```

## Подводные камни

- `docs/superpowers/` — не удалять, это полезный контекст для будущих разработчиков.

## Валидация

- `ls` в корне — чисто
- `npm run build` — ничего не сломано (удалённые директории не используются)
