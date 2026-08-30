import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface WifeWishlistUiProps {
  moduleId: string;
  api: ApiClient;
  canWrite: boolean;
}

interface ItemRow {
  id: number;
  title: string;
  note: string | null;
  link: string | null;
  done: boolean;
}

interface ManifestInfo {
  name: string;
  description: string;
}

interface FormValues {
  title: string;
  note: string;
  link: string;
}

const EMPTY_VALUES: FormValues = { title: '', note: '', link: '' };

export function WifeWishlist({ moduleId, api, canWrite }: WifeWishlistUiProps) {
  const base = `/api/modules/${moduleId}/item`;
  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ItemRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [m, d] = await Promise.all([
        api<{ manifest: ManifestInfo }>(`/api/modules/${moduleId}/manifest`),
        api<{ items: ItemRow[] }>(base),
      ]);
      setMeta(m.manifest);
      setItems(d.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить хотелки');
    }
  }, [api, base, moduleId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const onCreate = async (values: FormValues): Promise<void> => {
    if (busy) return;
    const bad = validate(values);
    if (bad !== null) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: 'POST', body: buildPayload(values) });
      setFormKey((k) => k + 1);
      setAddOpen(false);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось добавить хотелку');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (row: ItemRow, values: FormValues): Promise<void> => {
    if (busy) return;
    const bad = validate(values);
    if (bad !== null) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: buildPayload(values) });
      setEditing(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось сохранить хотелку');
    } finally {
      setBusy(false);
    }
  };

  const onToggleDone = async (row: ItemRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: { done: !row.done } });
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось обновить хотелку');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: ItemRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось удалить хотелку');
    } finally {
      setBusy(false);
    }
  };

  const { active, done } = useMemo(() => partition(items ?? []), [items]);

  if (error !== null && items === null) {
    return (
      <main className="wl">
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost wl-retry" type="button" onClick={() => void loadAll()}>
          Повторить
        </button>
      </main>
    );
  }

  if (meta === null || items === null) {
    return (
      <main className="wl">
        <p className="wl-hint">Загружаем…</p>
      </main>
    );
  }

  return (
    <main className="wl">
      <h1 className="wl-title">{meta.name}</h1>
      {meta.description !== '' && <p className="wl-sub">{meta.description}</p>}

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="wl-add">
          {addOpen ? (
            <WlForm
              key={formKey}
              initial={EMPTY_VALUES}
              submitLabel="Добавить хотелку"
              busy={busy}
              onSubmit={(values) => void onCreate(values)}
              onCancel={() => setAddOpen(false)}
            />
          ) : (
            <button
              className="btn-primary wl-add-toggle"
              type="button"
              onClick={() => setAddOpen(true)}
            >
              Добавить хотелку
            </button>
          )}
        </div>
      )}

      <section className="wl-section" aria-label="Хотелки">
        <header className="wl-section-head">
          <h2 className="wl-section-title">Хотелки</h2>
          {active.length > 0 && <p className="wl-section-hint">{countRu(active.length)}</p>}
        </header>

        {active.length === 0 ? (
          <div className="wl-empty">
            <p className="wl-empty-title">Все хотелки исполнены</p>
            {canWrite && <p className="wl-empty-text">Добавьте новую — и она появится здесь.</p>}
          </div>
        ) : (
          <ul className="wl-list">
            {active.map((row) =>
              editing?.id === row.id ? (
                <li className="wl-card" key={row.id}>
                  <WlForm
                    key={row.id}
                    initial={fromRow(row)}
                    submitLabel="Сохранить"
                    busy={busy}
                    onSubmit={(values) => void onSave(row, values)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <li className="wl-card" key={row.id}>
                  {canWrite ? (
                    <button
                      className="wl-done"
                      type="button"
                      disabled={busy}
                      onClick={() => void onToggleDone(row)}
                      aria-label={`Исполнено: ${row.title}`}
                      title="Исполнить"
                    >
                      ✓
                    </button>
                  ) : (
                    <span className="wl-dot" aria-hidden="true" />
                  )}
                  <div className="wl-card-main">
                    <h3 className="wl-card-name">{row.title}</h3>
                    {row.note !== null && row.note !== '' && <p className="wl-card-desc">{row.note}</p>}
                    {safeUrl(row.link) !== null && (
                      <a
                        className="wl-card-link"
                        href={safeUrl(row.link) as string}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Где посмотреть
                        <span className="wl-card-arrow" aria-hidden="true">
                          →
                        </span>
                      </a>
                    )}
                  </div>
                  {canWrite && (
                    <div className="wl-card-actions">
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
                  {confirmDelete?.id === row.id && (
                    <div className="wl-confirm">
                      <span>Удалить хотелку? Действие необратимо.</span>
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
              ),
            )}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="wl-section wl-section-archive" aria-label="Архив исполненных">
          <header className="wl-section-head">
            <h2 className="wl-section-title wl-section-title-archive">Исполнено</h2>
            <p className="wl-section-hint">{done.length}</p>
          </header>
          <ul className="wl-list">
            {done.map((row) => (
              <li className="wl-card wl-card-done" key={row.id}>
                {canWrite ? (
                  <button
                    className="wl-done on"
                    type="button"
                    disabled={busy}
                    onClick={() => void onToggleDone(row)}
                    aria-label={`Вернуть в список: ${row.title}`}
                    title="Вернуть в список"
                  >
                    ✓
                  </button>
                ) : (
                  <span className="wl-dot on" aria-hidden="true" />
                )}
                <div className="wl-card-main">
                  <h3 className="wl-card-name">{row.title}</h3>
                  {row.note !== null && row.note !== '' && <p className="wl-card-desc">{row.note}</p>}
                  {safeUrl(row.link) !== null && (
                    <a
                      className="wl-card-link"
                      href={safeUrl(row.link) as string}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Где посмотреть
                      <span className="wl-card-arrow" aria-hidden="true">
                        →
                      </span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default WifeWishlist;

function WlForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FormValues;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: FormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const set = (name: keyof FormValues, value: string): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  return (
    <form
      className="wl-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <label className="field">
        <span className="field-label">Что хочется</span>
        <input
          className="field-input"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Хотелка"
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Описание</span>
        <textarea
          className="field-input"
          rows={2}
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Пара слов, почему этого хочется"
        />
      </label>
      <label className="field">
        <span className="field-label">Ссылка</span>
        <input
          className="field-input"
          type="url"
          value={values.link}
          onChange={(e) => set('link', e.target.value)}
          placeholder="https://… (необязательно)"
        />
      </label>
      <div className="wl-form-actions">
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

function partition(items: ItemRow[]): { active: ItemRow[]; done: ItemRow[] } {
  const active: ItemRow[] = [];
  const done: ItemRow[] = [];
  for (const item of items) {
    if (item.done) done.push(item);
    else active.push(item);
  }
  active.sort((a, b) => a.id - b.id);
  done.sort((a, b) => b.id - a.id);
  return { active, done };
}

function countRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} хотелок`;
  if (mod10 === 1) return `${n} хотелка`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} хотелки`;
  return `${n} хотелок`;
}

function validate(values: FormValues): string | null {
  if (values.title.trim() === '') return 'Введите, чего хочется';
  if (values.link.trim() !== '' && safeUrl(values.link) === null) {
    return 'Ссылка должна начинаться с http:// или https://';
  }
  return null;
}

function buildPayload(values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = { title: values.title.trim() };
  payload.note = values.note.trim();
  if (values.link.trim() !== '') payload.link = values.link.trim();
  return payload;
}

function fromRow(row: ItemRow): FormValues {
  return {
    title: row.title ?? '',
    note: row.note ?? '',
    link: row.link ?? '',
  };
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    /* не ссылка */
  }
  return null;
}
