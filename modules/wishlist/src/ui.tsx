import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface WishlistProps {
  moduleId: string;
  api: ApiClient;
  canWrite: boolean;
  /** Публичная гостевая страница: без управления, со своим шапкой. */
  public?: boolean;
}

interface GiftRow {
  id: number;
  name: string;
  description: string | null;
  link: string | null;
  category: string | null;
}

interface ManifestInfo {
  name: string;
  description: string;
}

interface FormValues {
  name: string;
  description: string;
  link: string;
  category: string;
}

interface Section {
  category: string;
  hint: string;
  gifts: GiftRow[];
}

const CATEGORIES = ['Новоселье', 'Дочке'] as const;

const CATEGORY_HINTS: Record<string, string> = {
  'Новоселье': 'Вещи для дома и быта',
  'Дочке': 'Игрушки и подарки для малышки',
};

const EMPTY_VALUES: FormValues = { name: '', description: '', link: '', category: CATEGORIES[0] };

export function Wishlist({ moduleId, api, canWrite, public: isPublic }: WishlistProps) {
  const base = `/api/modules/${moduleId}/gift`;
  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [items, setItems] = useState<GiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<GiftRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GiftRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [m, d] = await Promise.all([
        api<{ manifest: ManifestInfo }>(`/api/modules/${moduleId}/manifest`),
        api<{ items: GiftRow[] }>(base),
      ]);
      setMeta(m.manifest);
      setItems(d.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить подарки');
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
      fail(err, 'Не удалось добавить подарок');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (row: GiftRow, values: FormValues): Promise<void> => {
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
      fail(err, 'Не удалось сохранить подарок');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: GiftRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось удалить подарок');
    } finally {
      setBusy(false);
    }
  };

  const sections = useMemo(() => groupByCategory(items ?? []), [items]);

  if (error !== null && items === null) {
    return (
      <main className="wish">
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost wish-retry" type="button" onClick={() => void loadAll()}>
          Повторить
        </button>
      </main>
    );
  }

  if (meta === null || items === null) {
    return (
      <main className="wish">
        <p className="wish-hint">Загружаем…</p>
      </main>
    );
  }

  return (
    <main className={`wish${isPublic ? ' wish-public' : ''}`}>
      {isPublic ? (
        <header className="wish-public-head">
          <span className="wish-eyebrow">Дом Перепелкиных</span>
          <h1 className="wish-title">{meta.name}</h1>
          {meta.description !== '' && <p className="wish-intro">{meta.description}</p>}
        </header>
      ) : (
        <>
          <h1 className="wish-title">{meta.name}</h1>
          {meta.description !== '' && <p className="wish-sub">{meta.description}</p>}
        </>
      )}

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {!isPublic && canWrite && (
        <div className="wish-add">
          {addOpen ? (
            <GiftForm
              key={formKey}
              initial={EMPTY_VALUES}
              submitLabel="Добавить подарок"
              busy={busy}
              onSubmit={(values) => void onCreate(values)}
              onCancel={() => setAddOpen(false)}
            />
          ) : (
            <button
              className="btn-primary wish-add-toggle"
              type="button"
              onClick={() => setAddOpen(true)}
            >
              Добавить подарок
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="wish-empty">
          <p className="wish-empty-title">Пока пусто</p>
          {!isPublic && canWrite && (
            <p className="wish-empty-text">Добавьте первый подарок — и он появится здесь.</p>
          )}
        </div>
      ) : (
        <div className="wish-sections">
          {sections.map((section) => (
            <section className="wish-section" key={section.category}>
              <header className="wish-section-head">
                <h2 className="wish-section-title">{section.category}</h2>
                {section.hint !== '' && <p className="wish-section-hint">{section.hint}</p>}
              </header>
              <ul className="wish-list">
                {section.gifts.map((gift) =>
                  editing?.id === gift.id ? (
                    <li className="wish-card" key={gift.id}>
                      <GiftForm
                        key={gift.id}
                        initial={fromRow(gift)}
                        submitLabel="Сохранить"
                        busy={busy}
                        onSubmit={(values) => void onSave(gift, values)}
                        onCancel={() => setEditing(null)}
                      />
                    </li>
                  ) : (
                    <li className="wish-card" key={gift.id}>
                      <div className="wish-card-main">
                        <h3 className="wish-card-name">{gift.name}</h3>
                        {gift.description !== null && gift.description !== '' && (
                          <p className="wish-card-desc">{gift.description}</p>
                        )}
                        {safeUrl(gift.link) !== null && (
                          <a
                            className="wish-card-link"
                            href={safeUrl(gift.link) as string}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Перейти к подарку
                            <span className="wish-card-arrow" aria-hidden="true">
                              →
                            </span>
                          </a>
                        )}
                      </div>
                      {!isPublic && canWrite && (
                        <div className="wish-card-actions">
                          <button
                            className="btn-ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditing(gift);
                              setConfirmDelete(null);
                            }}
                          >
                            Изменить
                          </button>
                          <button
                            className="btn-ghost btn-danger"
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDelete(gift)}
                          >
                            Удалить
                          </button>
                        </div>
                      )}
                      {confirmDelete?.id === gift.id && (
                        <div className="wish-confirm">
                          <span>Удалить подарок? Действие необратимо.</span>
                          <button
                            className="btn-danger-solid"
                            type="button"
                            disabled={busy}
                            onClick={() => void onDelete(gift)}
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
            </section>
          ))}
        </div>
      )}

      {isPublic && <footer className="wish-foot">С любовью, семья Перепелкиных</footer>}
    </main>
  );
}

export default Wishlist;

function GiftForm({
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
      className="wish-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <label className="field">
        <span className="field-label">Название</span>
        <input
          className="field-input"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Что это"
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Описание</span>
        <textarea
          className="field-input"
          rows={3}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Почему было бы приятно это получить"
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
      <label className="field">
        <span className="field-label">Раздел</span>
        <select
          className="field-input"
          value={values.category}
          onChange={(e) => set('category', e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="wish-form-actions">
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

function groupByCategory(items: GiftRow[]): Section[] {
  const byCategory = new Map<string, GiftRow[]>();
  for (const gift of items) {
    const key = gift.category ?? '';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(gift);
  }

  const sections: Section[] = [];
  for (const category of CATEGORIES) {
    const gifts = byCategory.get(category);
    if (gifts !== undefined) {
      sections.push({ category, hint: CATEGORY_HINTS[category] ?? '', gifts });
    }
  }
  for (const [category, gifts] of byCategory) {
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      sections.push({ category: category === '' ? 'Ещё' : category, hint: '', gifts });
    }
  }
  return sections;
}

function validate(values: FormValues): string | null {
  if (values.name.trim() === '') return 'Введите название подарка';
  if (values.link.trim() !== '' && safeUrl(values.link) === null) {
    return 'Ссылка должна начинаться с http:// или https://';
  }
  return null;
}

function buildPayload(values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: values.name.trim(), category: values.category };
  payload.description = values.description.trim();
  if (values.link.trim() !== '') payload.link = values.link.trim();
  return payload;
}

function fromRow(row: GiftRow): FormValues {
  return {
    name: row.name ?? '',
    description: row.description ?? '',
    link: row.link ?? '',
    category: row.category ?? CATEGORIES[0],
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
