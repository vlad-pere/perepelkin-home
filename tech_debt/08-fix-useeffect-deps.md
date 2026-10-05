# [P1] Исправить useEffect dependency array в admin и Login

## Приоритет: Высокий
## Оценка: 2/10 (~20 минут)
## Файлы: `modules/admin/src/ui.tsx`, `apps/web/src/pages/Login.tsx`

## Проблема

### Admin: `useEffect([], [])` с unstable `load` (3 места)

```typescript
// modules/admin/src/ui.tsx, UsersPanel ~line 144
useEffect(() => { load() }, [])  // ← load не в deps
// То же самое в GroupsPanel ~line 430 и GrantsPanel ~line 668
```

`load` — async функция, которая ссылается на `api` и `fail` из пропсов/замыкания. Без `useCallback` + deps, `load` пересоздаётся каждый рендер. ESLint `react-hooks/exhaustive-deps` зафлагает это. В текущем коде это работает (api — стабильная ссылка на module-level export), но **технически некорректно** и хрупко.

### Login: `useEffect` без dependency array

```typescript
// apps/web/src/pages/Login.tsx, строки 63-71
useEffect(() => {
  const onKey = (e: KeyboardEvent): void => {
    if (!isPin) return;
    if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
    else if (e.key === 'Backspace') pressBackspace();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);  // cleanup ЕСТЬ
});
// Нет dependency array → обработчик перерегистрируется каждый рендер
```

Cleanup **есть** (строка 70), но **нет dependency array** — `useEffect(() => {...})` без второго аргумента. Это значит:
- Обработчик перерегистрируется **каждый рендер** (creating + removing listener на каждом рендере)
- `isPin` в замыкании **мёртвый** после первого рендера — если `isPin` изменится, обработчик не обновится

## Что сделать

### Admin (3 компонента)

Вариант А (простой): обернуть `load` в `useCallback` с правильными deps:

```typescript
const load = useCallback(async () => {
  try {
    const data = await api.get<...>(`/api/admin/...`)
    setItems(data)
  } catch (e) { fail(e) }
}, [api])  // api — стабильная ссылка, эффект не будет пересоздаваться

useEffect(() => { load() }, [load])
```

Вариант Б (ещё проще): инлайнить fetch в useEffect:

```typescript
useEffect(() => {
  let cancelled = false
  api.get<...>(`/api/admin/...`).then(data => {
    if (!cancelled) setItems(data)
  }).catch(fail)
  return () => { cancelled = true }
}, [])  // api — module-level constant, безопасно
```

Рекомендую **вариант Б** — проще, нет лишнего `useCallback`.

### Login

```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent): void => {
    if (!isPin) return;
    if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
    else if (e.key === 'Backspace') pressBackspace();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [isPin]);  // Добавить dependency array
```

Но `pressDigit` и `pressBackspace` тоже пересоздаются каждый рендер. Чтобы обработчик видел актуальные версии — либо инлайнить их в handler, либо обернуть в `useCallback` с deps `[secret, isPin, setSecret, setIsPin]`.

Простой вариант: инлайнить логику прямо в `onKey` (без отдельных функций) или принять что PIN-ввод — это не performance-critical path и текущий pattern (перерегистрация на каждый рендер) acceptable.

## Подводные камни

- `api` в admin — это `useApiClient(me.user.id)` из App.tsx. Если `userId` не меняется, ссылка стабильна. Но если `useApiClient` не мемоизирован, deps `[api]` могут вызвать infinite loop. Проверить `useApiClient`.
- В Login: `pressDigit` и `pressBackspace` зависят от `pin`, `setPin`, `isPin`, `setIsPin`. Если инлайнить в handler, deps — `[isPin]` (pin/setPin/setIsPin стабильны из useState).

## Валидация

- `npm run typecheck`
- ESLint: `react-hooks/exhaustive-deps` — 0 ошибок в этих файлах
- Ручная проверка: admin загружает данные при первом рендере; Login реагирует на клавиатуру без утечек
