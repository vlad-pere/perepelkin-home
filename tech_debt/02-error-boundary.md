# [P1] Добавить ErrorBoundary для предотвращения white screen

## Статус: ✅ Сделано (2026-08-31)
## Приоритет: Высокий
## Оценка: 2/10 (простая задача, ~30 минут)
## Файл: `apps/web/src/App.tsx` + новый `apps/web/src/components/ErrorBoundary.tsx`

> Реализовано: классовый `ErrorBoundary` (`apps/web/src/components/ErrorBoundary.tsx`), корневой boundary вокруг `AuthProvider` + гранулярный boundary вокруг `<Ui />` в `ModulePage` с `key={module.id}` — состояние сбрасывается при смене модуля (все модули матчатся единым роут-паттерном, без `key` `hasError` остался бы `true` между модулями). Фоллбэк — экран «Что-то пошло не так» с кнопкой «Перезагрузить» (`role="alert"`).

## Проблема

В проекте **нет ни одного ErrorBoundary**. Если любой компонент выбросит ошибку during render (сеть упала, битые данные из API, lazy-load failure), React размонтирует всё дерево и пользователь увидит **white screen без возможности восстановления**.

## Что сделать

1. Создать `apps/web/src/components/ErrorBoundary.tsx` — классовый компонент с `componentDidCatch`:

```tsx
interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

// catchingErrors: показать экран с кнопкой "Перезагрузить"
// На экране: сообщение на русском, кнопка перезагрузки, при желании — details ошибки
```

2. Обернуть в `App.tsx`:
   - Корневой `<ErrorBoundary>` вокруг `<AppRoutes />` (ловит все ошибки приложения)
   - Опционально: отдельный `<ErrorBoundary>` внутри `<ModulePage>` вокруг `<Ui />` (ловит ошибки конкретного модуля, не роняет весь app)

3. На fallback экране — кнопка `window.location.href = '/'` для soft-restart.

## Подводные камни

- ErrorBoundary ловит только ошибки **rendering**, не ошибки в `useEffect`/async. Для async нужен отдельный handling (retry, error state в hooks).
- Не ловит ошибки в event handlers — для них нужен глобальный `window.onerror` / `unhandledrejection` (отдельная задача, не в этом scope).
- Классовый компонент — единственный способ сделать ErrorBoundary в React (хуки не 지원ают `componentDidCatch`).

## Валидация

- `npm run typecheck`
- Искусственно выбросить ошибку в любом компоненте → должен показаться fallback UI, а не white screen
- Кнопка перезагрузки должна возвращать на главную
