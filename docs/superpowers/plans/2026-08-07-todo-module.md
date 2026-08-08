# Модуль «Список дел» с прогресс-баром — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Добавить модуль «Список дел» (`todo`) с общим прогресс-баром и удобным списком: добавить дело, отметить одним кликом, редактировать, удалять.

**Architecture:** Бэкенд — простой декларативный модуль (`kind: "simple"`): существующий CRUD-генератор даёт таблицы, валидацию, права (`core.can`) и CSRF. Прогресс-бар и галочки — собственный React-компонент `modules/todo/src/ui.tsx` (образец — `modules/admin/`), который переопределяет общий CRUD-UI **только для этого модуля** через реестр `CODE_UI` в `apps/web/src/modules/registry.tsx`.

**Tech Stack:** TypeScript (npm workspaces), React 19, Vite, Fastify + better-sqlite3, Vitest.

## Global Constraints

- Node >= 24, npm >= 11. TypeScript `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` (типы импортируются через `import type` / inline `type`).
- React 19. Новых production-зависимостей не добавляем: модулю нужен только `react`, web уже зависит от core/admin.
- Манифест: id `^[a-z0-9-]{1,64}$`, имя сущности/поля `^[a-z][a-zA-Z0-9_]{0,63}$`, зарезервированы `id`, `created_at`, `updated_at`, `created_by`. Типы полей: `text`, `textarea`, `number`, `date`, `boolean`.
- Доступ к данным — только через REST CRUD модуля (`/api/modules/todo/task`); права и CSRF уже обеспечивает сервер. UI лишь скрывает кнопки при `canWrite === false`.
- CSS — только дизайн-токены из `apps/web/src/styles.css` (`--font-display`, `--accent`, `--ink-soft`, `--line`, `--accent-soft`, `--ease`, …). Тёплый минимализм, никаких градиентов/сине-фиолетовых. Классы кнопок/полей общие (`btn-primary`, `btn-ghost`, `btn-danger`, `btn-danger-solid`, `field`, `field-input`, `auth-error`) — не переопределяем.
- Весь UI-текст — по-русски.
- `dist/` в gitignore: собранные артефакты модуля не коммитим, `package-lock.json` — коммитим.
- Каждый шаг заканчивается коммитом.

---

### Task 1: Модуль `todo` — манифест, пакет и автотест CRUD

**Files:**
- Create: `modules/todo/manifest.json`
- Create: `modules/todo/package.json`
- Modify: `apps/server/test/repo-modules.test.ts`

**Interfaces:**
- Consumes: нечего (новый модуль). Существующий хост `mountModule` и CRUD-генератор из `apps/server/src/modules/{host,crud}.ts`.
- Produces: модуль `todo` с сущностью `task` и REST-эндпоинтами `/api/modules/todo/task` (GET list, POST create, PATCH `/:rowId`, DELETE `/:rowId`), тела ответов `{ items: TaskRow[] }` / `{ item: TaskRow }`, где `TaskRow` = поля сущности + `id`, `created_by`, `created_at`, `updated_at`.

> **Status:** DONE — все задачи реализованы и закоммичены (`b6bd172..bb57c2b`), финальное whole-branch ревью чистое (Ready to merge: Yes). Остаточные мелочи см. в конце документа.

- [x] **Step 1: Write the failing test**

Добавить в `apps/server/test/repo-modules.test.ts` после существующего `it('mounts the reference maintenance module…')`:

```ts
it('mounts the todo module from modules/ and runs CRUD', async () => {
  const { modules, errors } = loadManifests(MODULES_DIR);
  expect(errors).toEqual([]);
  const manifest = modules.find((m) => m.id === 'todo');
  expect(manifest).toBeDefined();
  expect(manifest!.kind).toBe('simple');

  await mountModule(world.app, { db: world.db, core: world.core, manifest: manifest! });
  const user = world.core.users.getByUsername('member')!;
  const group = world.core.groups.create({ name: 'todo-group' });
  world.core.groups.addMember(group.id, user.id);
  world.core.grants.set(group.id, 'todo', { canRead: true, canWrite: true });

  const client = new Client(world.app);
  await client.login('member', 'secret123');

  const created = await client.inject('POST', '/api/modules/todo/task', {
    title: 'Собрать коробки',
    done: false,
  });
  expect(created.statusCode).toBe(201);
  const id = (created.json() as { item: { id: number } }).item.id;

  const toggled = await client.inject('PATCH', `/api/modules/todo/task/${id}`, { done: true });
  expect(toggled.statusCode).toBe(200);
  expect((toggled.json() as { item: { done: boolean } }).item.done).toBe(true);

  const listed = await client.inject('GET', '/api/modules/todo/task');
  expect(listed.statusCode).toBe(200);
  expect((listed.json() as { items: unknown[] }).items).toHaveLength(1);

  const deleted = await client.inject('DELETE', `/api/modules/todo/task/${id}`);
  expect(deleted.statusCode).toBe(204);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test -w @perepelkin-home/server`
Expected: FAIL — `expect(manifest).toBeDefined()` не проходит (модуля `todo` ещё нет).

- [x] **Step 3: Create the module manifest**

Создать `modules/todo/manifest.json`:

```json
{
  "id": "todo",
  "name": "Список дел",
  "description": "Общий список дел: по дому, по переезду, куда угодно.",
  "kind": "simple",
  "entities": [
    {
      "name": "task",
      "label": "Дело",
      "fields": [
        { "name": "title", "label": "Дело", "type": "text", "required": true },
        { "name": "note", "label": "Заметка", "type": "textarea" },
        { "name": "when", "label": "Дата", "type": "date" },
        { "name": "done", "label": "Сделано", "type": "boolean" }
      ],
      "defaultSort": { "field": "done", "direction": "asc" }
    }
  ]
}
```

- [x] **Step 4: Create the workspace package**

Создать `modules/todo/package.json`:

```json
{
  "name": "@perepelkin-home/module-todo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./ui": {
      "types": "./dist/ui.d.ts",
      "import": "./dist/ui.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json && node scripts/copy-css.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "react": "^19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "typescript": "^5"
  }
}
```

- [x] **Step 5: Link the new workspace**

Run (в корне репозитория): `npm install`
Expected: workspace `@perepelkin-home/module-todo` зарегистрирован, `package-lock.json` обновлён.

- [x] **Step 6: Run test to verify it passes**

Run: `npm run test -w @perepelkin-home/server`
Expected: PASS — все тесты, включая `mounts the todo module from modules/ and runs CRUD`.

- [x] **Step 7: Commit**

```bash
git add modules/todo/manifest.json modules/todo/package.json package-lock.json apps/server/test/repo-modules.test.ts
git commit -m "Модуль todo: манифест, пакет и тест CRUD"
```

---

### Task 2: Свой интерфейс модуля «Список дел» и регистрация в web

**Files:**
- Create: `modules/todo/tsconfig.json`
- Create: `modules/todo/src/globals.d.ts`
- Create: `modules/todo/scripts/copy-css.mjs`
- Create: `modules/todo/src/ui.tsx`
- Create: `modules/todo/src/ui.css`
- Modify: `apps/web/src/modules/registry.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: REST CRUD модуля из Task 1 (`/api/modules/todo/task`), контракт `ModuleUiProps` (`{ moduleId: string; api: ModuleApiClient; currentUserId: number; canWrite: boolean }` из `apps/web/src/modules/registry.tsx`).
- Produces: lazy-компонент `@perepelkin-home/module-todo/ui` (default-экспорт `TodoModule`), который принимает `{ moduleId: string; api: ApiClient; canWrite: boolean }`; `resolveModuleUi` теперь отдаёт кастомный UI для `todo`.

- [x] **Step 1: Package config**

Создать `modules/todo/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

Создать `modules/todo/src/globals.d.ts`:

```ts
declare module '*.css';
```

Создать `modules/todo/scripts/copy-css.mjs` (копирует `src/ui.css` в `dist/`, т.к. `tsc` не переносит css):

```js
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
copyFileSync(join(root, 'src', 'ui.css'), join(root, 'dist', 'ui.css'));
```

- [x] **Step 2: Write the UI component**

Создать `modules/todo/src/ui.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface TodoUiProps {
  moduleId: string;
  api: ApiClient;
  canWrite: boolean;
}

interface TaskRow {
  id: number;
  title: string;
  note: string | null;
  when: string | null;
  done: boolean;
}

interface ManifestInfo {
  name: string;
  description: string;
}

interface TaskValues {
  title: string;
  note: string;
  when: string;
}

const EMPTY_VALUES: TaskValues = { title: '', note: '', when: '' };

export default function TodoModule({ moduleId, api, canWrite }: TodoUiProps) {
  const base = `/api/modules/${moduleId}/task`;
  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [items, setItems] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskRow | null>(null);
  const [formKey, setFormKey] = useState(0);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [m, d] = await Promise.all([
        api<{ manifest: ManifestInfo }>(`/api/modules/${moduleId}/manifest`),
        api<{ items: TaskRow[] }>(base),
      ]);
      setMeta(m.manifest);
      setItems(d.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список дел');
    }
  }, [api, base, moduleId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const onCreate = async (values: TaskValues): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: 'POST', body: buildTaskPayload(values) });
      setFormKey((k) => k + 1);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось добавить дело');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (row: TaskRow, values: TaskValues): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: buildTaskPayload(values) });
      setEditing(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось сохранить дело');
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (row: TaskRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: { done: !row.done } });
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось обновить дело');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: TaskRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось удалить дело');
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(() => sortTasks(items ?? []), [items]);

  if (error !== null && items === null) {
    return (
      <main className="todo">
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost todo-retry" type="button" onClick={() => void loadAll()}>
          Повторить
        </button>
      </main>
    );
  }

  if (meta === null || items === null) {
    return (
      <main className="todo">
        <p className="todo-hint">Загружаем…</p>
      </main>
    );
  }

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const countText =
    total === 0 ? 'Пока нет дел' : percent === 100 ? 'Всё сделано' : `${done} из ${total} сделано`;

  return (
    <main className="todo">
      <h1 className="todo-title">{meta.name}</h1>
      {meta.description !== '' && <p className="todo-sub">{meta.description}</p>}

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <section className="todo-progress" aria-label="Прогресс">
        <div className="todo-progress-meta">
          <span className="todo-progress-count">{countText}</span>
          {total > 0 && percent < 100 && (
            <span className="todo-progress-percent">{percent}%</span>
          )}
        </div>
        <div
          className="todo-progress-track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="todo-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </section>

      {canWrite && (
        <div className="todo-add">
          <TaskForm
            key={formKey}
            initial={EMPTY_VALUES}
            submitLabel="Добавить дело"
            busy={busy}
            onSubmit={(values) => void onCreate(values)}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="todo-empty">
          <p className="todo-empty-title">Пока пусто</p>
          {canWrite && (
            <p className="todo-empty-text">Добавьте первое дело — и оно появится здесь.</p>
          )}
        </div>
      ) : (
        <ul className="todo-list">
          {sorted.map((row) => (
            <li className={`todo-row${row.done ? ' done' : ''}`} key={row.id}>
              {editing?.id === row.id ? (
                <TaskForm
                  key={row.id}
                  initial={fromRow(row)}
                  submitLabel="Сохранить"
                  busy={busy}
                  onSubmit={(values) => void onSave(row, values)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="todo-row-main">
                  {canWrite ? (
                    <input
                      className="todo-check"
                      type="checkbox"
                      checked={row.done}
                      disabled={busy}
                      onChange={() => void onToggle(row)}
                      aria-label={row.title}
                    />
                  ) : (
                    <span className={`todo-dot${row.done ? ' on' : ''}`} aria-hidden="true" />
                  )}
                  <div className="todo-row-body">
                    <span className="todo-row-title">{row.title}</span>
                    {row.when !== null && row.when !== '' && (
                      <span className="todo-row-when">{formatDate(row.when)}</span>
                    )}
                    {row.note !== null && row.note !== '' && (
                      <span className="todo-row-note">{row.note}</span>
                    )}
                  </div>
                  {canWrite && (
                    <div className="todo-row-actions">
                      <button
                        className="btn-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(row);
                          setConfirmDelete(null);
                        }}
                      >
                        Изменить
                      </button>
                      <button
                        className="btn-ghost btn-danger"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDelete(row)}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              )}

              {confirmDelete?.id === row.id && (
                <div className="todo-confirm">
                  <span>Удалить дело? Действие необратимо.</span>
                  <button
                    className="btn-danger-solid"
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(row)}
                  >
                    {busy ? 'Удаляем…' : 'Удалить'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => setConfirmDelete(null)}>
                    Отмена
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function TaskForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: TaskValues;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: TaskValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<TaskValues>(initial);
  const set = (name: keyof TaskValues, value: string): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  return (
    <form
      className="todo-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="todo-form-row">
        <label className="field todo-field-title">
          <span className="field-label">Дело</span>
          <input
            className="field-input"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Что нужно сделать"
            autoFocus
            required
          />
        </label>
        <label className="field todo-field-when">
          <span className="field-label">Дата</span>
          <input
            className="field-input"
            type="date"
            value={values.when}
            onChange={(e) => set('when', e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Заметка</span>
        <textarea
          className="field-input"
          rows={2}
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Необязательно"
        />
      </label>
      <div className="todo-form-actions">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : submitLabel}
        </button>
        {onCancel && (
          <button className="btn-ghost" type="button" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function sortTasks(tasks: TaskRow[]): TaskRow[] {
  const byDate = (a: TaskRow, b: TaskRow): number => {
    const da = a.when ?? '';
    const db = b.when ?? '';
    if (da === '' && db === '') return 0;
    if (da === '') return 1;
    if (db === '') return -1;
    return da.localeCompare(db);
  };
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const d = byDate(a, b);
    if (d !== 0) return d;
    return a.id - b.id;
  });
}

function fromRow(row: TaskRow): TaskValues {
  return {
    title: row.title ?? '',
    note: row.note ?? '',
    when: row.when ?? '',
  };
}

function buildTaskPayload(values: TaskValues): Record<string, unknown> {
  const payload: Record<string, unknown> = { title: values.title.trim() };
  payload.note = values.note.trim();
  if (values.when !== '') payload.when = values.when;
  return payload;
}

function formatDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
```

Замечание (осознанное ограничение): при редактировании пустая дата не отправится на сервер (формат `YYYY-MM-DD` валидируется сервером, пустая строка не проходит), поэтому однажды поставленную дату очистить нельзя. Заметку очищать можно — она всегда отправляется строкой. Общий CRUD-UI ведёт себя так же.

- [x] **Step 3: Write the styles**

Создать `modules/todo/src/ui.css`:

```css
.todo {
  padding-top: 40px;
}

.todo-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 36px;
  line-height: 1.12;
  letter-spacing: 0.005em;
  overflow-wrap: anywhere;
  animation: fade-up 0.7s var(--ease) both;
}

.todo-sub {
  margin: 12px 0 0;
  color: var(--ink-soft);
  animation: fade-up 0.7s var(--ease) 0.08s both;
}

.todo-hint {
  margin: 18px 0 0;
  color: var(--ink-muted);
  animation: fade-up 0.5s var(--ease) both;
}

.todo .auth-error {
  margin-top: 20px;
}

.todo-retry {
  margin-top: 14px;
}

.todo-progress {
  margin-top: 40px;
  animation: fade-up 0.7s var(--ease) 0.12s both;
}

.todo-progress-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.todo-progress-count {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 19px;
}

.todo-progress-percent {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-muted);
}

.todo-progress-track {
  height: 10px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.todo-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.6s var(--ease);
}

.todo-add {
  margin-top: 28px;
  animation: fade-up 0.7s var(--ease) 0.16s both;
}

.todo-form {
  padding: 20px 0 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.todo-form-row {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 16px;
}

.todo-form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-list {
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
}

.todo-row {
  padding: 18px 4px;
  border-top: 1px solid var(--line);
  animation: fade-up 0.6s var(--ease) both;
}

.todo-row:last-child {
  border-bottom: 1px solid var(--line);
}

.todo-row-main {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.todo-check {
  width: 19px;
  height: 19px;
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.todo-dot {
  width: 12px;
  height: 12px;
  margin-top: 5px;
  flex-shrink: 0;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
}

.todo-dot.on {
  border-color: var(--accent);
  background: var(--accent);
}

.todo-row-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.todo-row-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.todo-row.done .todo-row-title {
  color: var(--ink-muted);
  text-decoration: line-through;
  text-decoration-color: var(--line-strong);
}

.todo-row-when {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.todo-row-note {
  font-size: 14px;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.todo-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.todo-confirm {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--error-line);
  border-radius: 12px;
  background: var(--error-bg);
  color: var(--error-text);
  font-size: 14px;
  animation: fade-up 0.3s var(--ease) both;
}

.todo-empty {
  margin-top: 28px;
  padding: 32px 24px;
  border: 1px dashed var(--line-strong);
  border-radius: 16px;
  text-align: center;
  animation: fade-up 0.6s var(--ease) 0.1s both;
}

.todo-empty-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 19px;
}

.todo-empty-text {
  margin: 6px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
}

.todo button:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 640px) {
  .todo {
    padding-top: 28px;
  }

  .todo-title {
    font-size: 30px;
  }

  .todo-progress {
    margin-top: 28px;
  }

  .todo-form-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .todo-form-actions {
    width: 100%;
  }

  .todo-form-actions .btn-primary {
    flex: 1;
  }

  .todo-list {
    margin-top: 20px;
  }

  .todo-row {
    padding: 16px 2px;
  }

  .todo-row-main {
    gap: 12px;
  }

  .todo-row-actions .btn-ghost {
    min-height: 44px;
  }

  .todo-empty {
    padding: 28px 20px;
  }
}
```

- [x] **Step 4: Build the module package**

Run: `npm run build -w @perepelkin-home/module-todo`
Expected: `dist/ui.js`, `dist/ui.d.ts`, `dist/ui.css` созданы.

Run: `npm run typecheck -w @perepelkin-home/module-todo`
Expected: PASS.

- [x] **Step 5: Register the UI in the web registry**

В `apps/web/src/modules/registry.tsx` заменить содержимое (регистрируем lazy-UI для `todo`, кастомный UI имеет приоритет над CRUD-UI):

```tsx
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModuleAccess, ModuleKind } from '@perepelkin-home/core';
import { CrudModule } from './CrudModule';

export interface ModuleApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface ModuleUiProps {
  moduleId: string;
  api: ModuleApiClient;
  currentUserId: number;
  canWrite: boolean;
}

export type ModuleUiComponent = ComponentType<ModuleUiProps>;

const CODE_UI: Record<string, LazyExoticComponent<ModuleUiComponent>> = {
  todo: lazy(() => import('@perepelkin-home/module-todo/ui')),
};

export function resolveModuleUi(id: string, kind: ModuleKind): ModuleUiComponent | null {
  const custom = CODE_UI[id];
  if (custom) return custom;
  if (kind === 'simple') return CrudModule;
  return null;
}

export function ModuleUnavailable({ module }: { module: ModuleAccess }) {
  return (
    <main className="crud">
      <h1 className="crud-title">{module.name}</h1>
      <p className="crud-sub">Для этого модуля пока нет интерфейса. Попробуйте позже.</p>
    </main>
  );
}
```

- [x] **Step 6: Add the web dependency**

В `apps/web/package.json` в секцию `dependencies` (после `@perepelkin-home/module-admin`) добавить:

```json
    "@perepelkin-home/module-todo": "*",
```

Затем в корне: `npm install`
Expected: `node_modules/@perepelkin-home/module-todo` → symlink на `modules/todo`.

- [x] **Step 7: Validate web build**

Run: `npm run typecheck -w @perepelkin-home/web`
Expected: PASS.

Run: `npm run build -w @perepelkin-home/web`
Expected: PASS — в бандл попадает lazy-чанк UI модуля (Vite разрешает `@perepelkin-home/module-todo/ui` через `dist/ui.js`).

- [x] **Step 8: Commit**

```bash
git add modules/todo/tsconfig.json modules/todo/src/ modules/todo/scripts/ apps/web/src/modules/registry.tsx apps/web/package.json package-lock.json
git commit -m "Интерфейс модуля «Список дел»: прогресс-бар и регистрация в web"
```

---

### Task 3: Сборка и деплой — корневые скрипты, Dockerfile, README

**Files:**
- Modify: `package.json` (корневой)
- Modify: `Dockerfile`
- Modify: `README.md`

**Interfaces:**
- Consumes: workspace `@perepelkin-home/module-todo` из Task 1–2.
- Produces: сборка (`npm run build`) и `npm run dev` собирают `module-todo` перед `server`/`web`; прод-образ содержит манифест и package.json модуля.

- [x] **Step 1: Update root scripts**

В корневом `package.json`:

`build`:
```json
"build": "npm run build -w @perepelkin-home/core && npm run build -w @perepelkin-home/module-admin && npm run build -w @perepelkin-home/module-todo && npm run build -w @perepelkin-home/server && npm run build -w @perepelkin-home/web",
```

`dev`:
```json
"dev": "npm run build -w @perepelkin-home/core && npm run build -w @perepelkin-home/module-admin && npm run build -w @perepelkin-home/module-todo && concurrently -n server,web -c auto \"npm:dev:server\" \"npm:dev:web\"",
```

- [x] **Step 2: Update the Dockerfile**

В `Dockerfile`:

1. В build-стадии (рядом с `COPY modules/maintenance/package.json …`, до `npm ci`):
```dockerfile
COPY modules/todo/package.json modules/todo/package.json
```
2. В runtime-стадии (рядом с `COPY modules/maintenance/package.json …`, до `npm ci`):
```dockerfile
COPY modules/todo/package.json modules/todo/package.json
```
3. В runtime-стадии (рядом с `COPY modules/maintenance/manifest.json …`):
```dockerfile
COPY modules/todo/manifest.json modules/todo/manifest.json
```

Пояснение: `npm ci` в обеих стадиях требует наличие package.json всех workspace-пакетов из lock-файла. `manifest.json` нужен серверу, который читает `MODULES_DIR` (в compose каталог `./modules` монтируется read-only и перекрывает образ). Собранный `dist` модуля в образ переносить не нужно: сервер его не импортирует, а web-бандл уже содержит UI (в отличие от admin, который сервер импортирует в рантайме).

- [x] **Step 3: Update README**

В `README.md` в разделе «Модули», после подраздела «Простой модуль (только `manifest.json`)» и перед «Код-модуль», добавить подраздел:

```markdown
### Простой модуль со своим интерфейсом

Иногда простому модулю нужен свой экран вместо общего CRUD-UI (например, список дел с прогресс-баром). Тогда модуль остаётся декларативным (`kind: "simple"`, бэкенд — общий CRUD), а в `apps/web/src/modules/registry.tsx` для его id регистрируется собственный React-компонент — он имеет приоритет над общим UI. Пример — `modules/todo/` (страница в пакете модуля, как у `modules/admin/`). Добавление такого модуля требует пересборки фронтенда (`npm run build`).
```

- [x] **Step 4: Validate full build**

Run (в корне): `npm run build`
Expected: PASS — core → admin → todo → server → web собираются последовательно.

- [x] **Step 5: Commit**

```bash
git add package.json Dockerfile README.md
git commit -m "Сборка и деплой: module-todo в скриптах, Dockerfile, README"
```

---

### Task 4: Финальная валидация (typecheck, тесты, E2E через Playwright)

**Files:**
- No source changes (только проверки).

- [x] **Step 1: Full static checks and tests**

Run (в корне):
```bash
npm run typecheck
npm test
npm run build
```
Expected: все три проходят (typecheck — все workspace-пакеты; `npm test` — vitest core + server, включая новый тест CRUD `todo`; `npm run build` — полная сборка).

- [x] **Step 2: E2E smoke-проверка через Playwright (скилл `webapp-testing`)**

Сценарий:
1. `npm run seed` (если нужно) и `npm run dev` (сервер 3000, web 5173).
2. Войти как администратор, в `/admin` → «Доступы к модулям» выдать группе «Семья» чтение+запись на модуль «Список дел».
3. Открыть `/m/todo`:
   - Пустой список → «Пока нет дел», форма добавления видна.
   - Добавить дело «Собрать коробки» с датой и заметкой → появляется в списке, прогресс «0 из 1».
   - Отметить галочкой → «1 из 1», «Всё сделано», дело уходит вниз.
   - Добавить второе дело без даты → порядок: невыполненное сверху, выполненное снизу.
   - «Изменить» → правка текста, «Сохранить» → текст обновляется.
   - «Удалить» → подтверждение → дело исчезает.
   - Перезагрузить страницу → данные и прогресс сохранились (персистентность).
4. Пользователь-гость (без записи, с чтением) → видит список и прогресс, нет формы добавления, чекбоксов и кнопок.

Expected: все шаги проходят, скриншоты сохранены в `.scratch/`. Если что-то не так — вернуться к Task 2 и исправить.

- [x] **Step 3: Report validation result**

Кратко отчитаться: primary signal (работающая страница в браузере), secondary signals (typecheck/test/build), скриншоты, остаточные риски.

---

## Self-Review (заполняется при написании плана)

**1. Покрытие спеки:** манифест+данные → Task 1; прогресс-бар, добавление, галочка, редактирование, удаление, read-only, пустой список, ошибка с повтором, сортировка → Task 2 (ui.tsx/ui.css); реестр UI → Task 2 Step 5; сборка/деплой/README → Task 3; тесты и E2E → Tasks 1 и 4. Пункт «прогресс-бар только для этого модуля» обеспечен тем, что `resolveModuleUi` возвращает кастомный UI только для id `todo`, остальные простые модули — `CrudModule`.

**2. Плейсхолдеры:** кода нет неопределённых шагов; все команды и содержимое файлов приведены.

**3. Типы:** `TaskRow`, `TaskValues`, `ApiClient`, `TodoUiProps` определены в Task 2 и используются согласованно; `TodoModule` совместим с `ModuleUiComponent` (принимает подмножество пропсов `ModuleUiProps`); тест из Task 1 использует только уже существующие хелперы (`Client.inject`, `loadManifests`, `mountModule`).

**Принятое ограничение:** пустую дату при редактировании очистить нельзя (серверная валидация `YYYY-MM-DD`); заметку очищать можно. Действие не расширяет общий CRUD и не трогает серверный код.

---

## Статус выполнения

Все шаги выполнены и закоммичены: `59b8bec` (Task 1), `bf3d968`+`06fd16e` (Task 2), `bb57c2b` (Task 3), Task 4 — валидация без изменений (typecheck/test/build PASS; E2E 15/15 шагов, скриншоты в `.scratch/shots/`). Финальное whole-branch ревью (`b6bd172..bb57c2b`): **Ready to merge: Yes**, 0 Critical, 0 Important. Отчёт Task 4: `.superpowers/sdd/2026-08-07-todo-module/task-4-report.md` (вне git).

### Отложенные мелочи (не блокируют, по результатам ревью)

1. `README.md` — таблица скриптов (строка «Сборка core/admin…» для `dev` и «Сборка core, module-admin, server, web» для `build`) не упоминает module-todo; раздел «Простой модуль со своим интерфейсом» уже добавлен.
2. Диалог подтверждения удаления: кнопка «Отмена» не имеет `disabled={busy}` (косметика).
3. Поле «Дело» с пробелами проходит HTML-валидацию, а после `trim()` сервер отвечает англ. ошибкой «field "title" must not be empty»; желательна клиентская проверка с русским текстом.
4. Дату при редактировании очистить нельзя (зафиксировано как принятое ограничение выше; общий CrudModule ведёт себя так же).
5. Корневой `typecheck` зависит от предварительной сборки модулей (`dist/ui.d.ts` для web) — существующий паттерн (как у admin), не регрессия.
