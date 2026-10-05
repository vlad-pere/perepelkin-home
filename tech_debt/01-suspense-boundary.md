# [P0] Добавить Suspense boundary для lazy-загрузки модулей

## Статус: ✅ Сделано (2026-08-31)
## Приоритет: Критический
## Оценка: 1/10 (простая правка, 5 минут)
## Файл: `apps/web/src/App.tsx`

## Проблема

`registry.tsx` использует `React.lazy()` для code-splitting UI модулей (todo, wishlist, diary, move, shopping), но `App.tsx` рендерит их **без `<Suspense>` boundary**. Когда React gặp lazy-компонент без fallback, он выбрасывает ошибку:

> "A React component suspended while rendering, but no fallback UI was specified."

Это **runtime crash** — приложение упадёт при попытке открыть любой модуль с code-split UI.

## Текущий код

```tsx
// apps/web/src/App.tsx, строки 70-92
function ModulePage() {
  const { me } = useAuth();
  const { moduleId } = useParams();
  const module = me?.modules.find((m) => m.id === moduleId);
  if (!module) return <Navigate to="/" replace />;
  if (module.route !== `/m/${module.id}`) return <Navigate to={module.route} replace />;
  const Ui = resolveModuleUi(module.id, module.kind);
  // Ui — lazy-компонент (React.lazy), но нет Suspense fallback

  return (
    <div className="shell">
      <Topbar />
      {Ui ? (
        <Ui moduleId={module.id} api={api} currentUserId={me!.user.id} canWrite={module.canWrite} />
      ) : (
        <ModuleUnavailable module={module} />
      )}
    </div>
  );
}
```

## Что сделать

1. Обернуть рендер `<Ui />` в `<Suspense fallback={<Splash />}>` — компонент `Splash` уже импортирован в `App.tsx`.

```tsx
import { Suspense } from 'react'

// Внутри ModulePage, заменить блок {Ui ? ...} на:
{Ui ? (
  <Suspense fallback={<Splash />}>
    <Ui moduleId={module.id} api={api} currentUserId={me!.user.id} canWrite={module.canWrite} />
  </Suspense>
) : (
  <ModuleUnavailable module={module} />
)}
```

2. Проверить, что `Splash` импортируется корректно (он уже используется на странице логина).

## Подводные камни

- `Splash` — это полноэкранная заставка. Для lazy-загрузки модуля (milliseconds) она может быть избыточной. Можно сделать мини-спиннер внутри shell вместо полного Splash, но Splash — самый быстрый путь.
- `resolveModuleUi` для `kind: 'code'` возвращает синхронный компонент — для них Suspense не нужен, но и не вредит.

## Валидация

- `npm run typecheck`
- `npm run build`
- В открытом браузере: открыть модуль todo/wishlist/diary — не должно быть white screen
