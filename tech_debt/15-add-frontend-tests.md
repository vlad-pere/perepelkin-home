# [P1] Добавить минимальное тестовое покрытие фронтенда

## Приоритет: Высокий
## Оценка: 5/10 (~3-4 часа)
## Скоуп: `apps/web/`, `modules/*/src/`

## Проблема

Во всём `apps/web/` **ноль тестов**. Единственный тест во фронтенде — `modules/shopping/src/rice.test.ts` (чистая логика). Не протестированы:

- `api.ts` — error handling, CSRF token management
- `auth.tsx` — login/logout flow, context provider
- `registry.tsx` — resolveModuleUi
- Ключевые user flows (login → module CRUD → logout)

## Стратегия (TDD-first)

Фронтенд-тесты дорогостоящи в поддержании. Сфокусируемся на **интеграционных тестах критических путей**, не на unit-тестах каждого компонента.

### Уровень 1: Unit-тесты чистой логики (vitest)

Добавить тесты для:
- `apps/web/src/api.ts` — `api()` функция (mock fetch, проверить retry, 401 redirect, error handling)
- `apps/web/src/modules/registry.tsx` — `resolveModuleUi()` (маппинг kind → component)
- `modules/*/src/utils.ts` (после разбиения god components) — `formatDate`, `safeHttpUrl`, `buildPayload`

### Уровень 2: Компонентные тесты (vitest + @testing-library/react)

Добавить тесты для:
- `apps/web/src/pages/Login.tsx` — рендер формы, сабмит, обработка ошибок
- `apps/web/src/auth.tsx` — `AuthProvider` + `useAuth()` context

### Уровень 3: E2E (Playwright) — критический путь

Создать `apps/web/e2e/` с одним тестовым сценарием:
1. Login → отображается HomePage
2. Navigate to todo module → видим список задач
3. Создать задачу → она появляется в списке
4. Удалить задачу → она исчезает
5. Logout → редирект на login

## Что сделать

### Шаг 1: Настроить vitest для фронтенда

`apps/web/package.json`:
```json
{
  "devDependencies": {
    "vitest": "^3",
    "@testing-library/react": "^16",
    "@testing-library/jest-dom": "^6",
    "jsdom": "^26"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'jsdom' } })
```

### Шаг 2: Unit-тесты api.ts

```typescript
// apps/web/src/api.test.ts
describe('api()', () => {
  it('throws ApiError on non-ok response', ...)
  it('redirects to /login on 401', ...)
  it('retries on 502/503/504', ...)
  it('aborts on signal', ...)
})
```

### Шаг 3: Компонентные тесты Login

```typescript
// apps/web/src/pages/Login.test.tsx
describe('Login page', () => {
  it('renders username and password fields', ...)
  it('shows error on failed login', ...)
  it('calls onLogin on successful submit', ...)
})
```

### Шаг 4: Обновить корневой test script

`package.json` (root):
```json
"test": "npm run test -ws --if-present"
```

## Подводные камни

- **@testing-library/react** требует React 18+. Проверить версию React в проекте.
- **jsdom** не поддерживает CSS-layout. Тесты проверяют DOM-структуру и поведение, не визуал.
- **CSRF token** в `api.ts` — нужно мокать localStorage/sessionStorage.
- **React Router** — компоненты используют `useParams`, `useNavigate` — нужно оборачивать в `<MemoryRouter>` в тестах.
- **Начать с unit-тестов** (уровень 1), не с E2E. E2E — дорого в поддержании, начинать только после стабилизации API.
- Обновить `root test script` на `npm run test -ws --if-present` — это автоматически подхватит тесты новых модулей.

## Валидация

- `npm test` — все новые тесты проходят
- `npm run build` — сборка не сломана
- Покрытие: хотя бы `api.ts`, `registry.tsx`, `Login.tsx`
