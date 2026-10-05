# [P2] Добавить <main> тег в ModulePage + unsafe me! assertions

## Приоритет: Средний
## Оценка: 1/10 (~10 минут)
## Файл: `apps/web/src/App.tsx`, строки 40, 84

## Проблема

### 1. Unsafe `me!` non-null assertions (строки 40, 84)

```tsx
const api = useApiClient(me!.user.id)
```

`me` может быть `null` (если статус `'loading'` или `'unauthenticated'`). Код выше проверяет `status === 'authenticated'` перед рендером, но `ModulePage` не имеет собственного guard. Если компонент будет использован в другом контексте — runtime error.

### 2. Отсутствие `<main>` в ModulePage

`HomePage` обёрнут в `<main>`, но `ModulePage` — нет. Это проблема семантики HTML и a11y.

## Что сделать

```tsx
function ModulePage() {
  const { me } = useAuth();
  const { moduleId } = useParams();

  // Early guard — безопасный, без нарушения hooks rules
  if (!me) return <Navigate to="/login" replace />;

  const module = me.modules.find((m) => m.id === moduleId);
  if (!module) return <Navigate to="/" replace />;
  if (module.route !== `/m/${module.id}`) return <Navigate to={module.route} replace />;

  const Ui = resolveModuleUi(module.id, module.kind);

  return (
    <div className="shell">
      <Topbar />
      <main>
        {Ui ? (
          <Ui moduleId={module.id} api={api} currentUserId={me.user.id} canWrite={module.canWrite} />
        ) : (
          <ModuleUnavailable module={module} />
        )}
      </main>
    </div>
  );
}
```

**Примечание по hooks rules:** `useAuth()` вызывается до early return — это корректно. Хуки в `Root` (родителе) уже проверяют `status === 'authenticated'`, поэтому `me` всегда будет non-null когда `ModulePage` рендерится. Но собственный guard — defense-in-depth.

`<AppShell>` **не существует** в проекте — обёртка это `<div className="shell">`.

## Подводные камни

- `status === 'authenticated'` и `me !== null` — оба условия должны быть. Если `useAuth()` вернёт `{ status: 'authenticated', me: null }` (теоретически), early return защитит.
- `<main>` внутри `<AppShell>` — проверить что `AppShell` не оборачивает в `<main>` уже (если оборачивает — дублирование тегов).

## Валидация

- `npm run typecheck`
- HTML-валидатор: рендер модуля содержит один `<main>` тег
