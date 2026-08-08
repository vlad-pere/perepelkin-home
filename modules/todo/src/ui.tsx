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
    if (values.title.trim() === '') {
      setError('Введите название дела');
      return;
    }
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
    if (values.title.trim() === '') {
      setError('Введите название дела');
      return;
    }
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
                    <span
                      className={`todo-dot${row.done ? ' on' : ''}`}
                      role="img"
                      aria-label={row.done ? 'Выполнено' : 'Не выполнено'}
                    />
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
                  <button
                    className="btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(null)}
                  >
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
