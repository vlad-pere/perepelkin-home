import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface DiaryUiProps {
  moduleId: string;
  api: ApiClient;
  canWrite: boolean;
}

interface EntryRow {
  id: number;
  date: string;
  title: string;
  text: string;
  mood: string | null;
  category: string | null;
  photos: string | null;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
}

interface ManifestInfo {
  name: string;
  description: string;
}

interface EntryValues {
  date: string;
  title: string;
  text: string;
  mood: string;
  category: string;
}

interface PickedPhotos {
  /** Файлы уже загруженные (id), которые остаются привязанными к записи. */
  keep: string[];
  /** Новые файлы, ещё не загруженные на сервер. */
  add: File[];
}

const EMPTY_VALUES: EntryValues = { date: todayISO(), title: '', text: '', mood: '', category: '' };

const MOODS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '😊', label: 'Хорошо' },
  { value: '🙂', label: 'Спокойно' },
  { value: '🥳', label: 'Праздник' },
  { value: '😮', label: 'Любопытно' },
  { value: '😤', label: 'Хлопотно' },
  { value: '😢', label: 'Грустно' },
];

const CATEGORY_SUGGESTIONS = ['Ремонт', 'Гости', 'Сад и двор', 'Быт', 'Техника', 'Покупки', 'Другое'];

const ALL_CATEGORIES = '__all__';

export default function DiaryModule({ moduleId, api, canWrite }: DiaryUiProps) {
  const base = `/api/modules/${moduleId}/entry`;
  const uploadBase = `/api/modules/${moduleId}/files`;
  const fileUrl = useCallback(
    (id: string) => `/api/modules/${moduleId}/files/${id}`,
    [moduleId],
  );

  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [items, setItems] = useState<EntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EntryRow | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [m, d] = await Promise.all([
        api<{ manifest: ManifestInfo }>(`/api/modules/${moduleId}/manifest`),
        api<{ items: EntryRow[] }>(base),
      ]);
      setMeta(m.manifest);
      setItems(d.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить дневник');
    }
  }, [api, base, moduleId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const uploadFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      const ids: string[] = [];
      try {
        for (const file of files) {
          const res = await api<{ file: { id: string } }>(
            `${uploadBase}?name=${encodeURIComponent(file.name)}`,
            { method: 'POST', body: file },
          );
          ids.push(res.file.id);
        }
        return ids;
      } catch (err) {
        await Promise.allSettled(
          ids.map((id) => api(`${uploadBase}/${id}`, { method: 'DELETE' })),
        );
        throw err;
      }
    },
    [api, uploadBase],
  );

  const deleteFiles = useCallback(
    async (ids: string[]): Promise<void> => {
      await Promise.allSettled(ids.map((id) => api(`${uploadBase}/${id}`, { method: 'DELETE' })));
    },
    [api, uploadBase],
  );

  const onCreate = useCallback(
    async (values: EntryValues, photos: PickedPhotos): Promise<void> => {
      if (busy) return;
      const invalid = validateValues(values);
      if (invalid !== null) {
        setError(invalid);
        return;
      }
      setBusy(true);
      setError(null);
      let uploaded: string[] = [];
      try {
        uploaded = await uploadFiles(photos.add);
        await api(base, {
          method: 'POST',
          body: {
            ...buildEntryPayload(values),
            photos: JSON.stringify([...photos.keep, ...uploaded]),
          },
        });
        setFormKey((k) => k + 1);
        setAddOpen(false);
        await loadAll();
      } catch (err) {
        await deleteFiles(uploaded);
        fail(err, 'Не удалось добавить запись');
      } finally {
        setBusy(false);
      }
    },
    [api, base, busy, deleteFiles, loadAll, uploadFiles],
  );

  const onSave = useCallback(
    async (row: EntryRow, values: EntryValues, photos: PickedPhotos): Promise<void> => {
      if (busy) return;
      const invalid = validateValues(values);
      if (invalid !== null) {
        setError(invalid);
        return;
      }
      setBusy(true);
      setError(null);
      const removed = parsePhotos(row.photos).filter((id) => !photos.keep.includes(id));
      let uploaded: string[] = [];
      try {
        uploaded = await uploadFiles(photos.add);
        await api(`${base}/${row.id}`, {
          method: 'PATCH',
          body: {
            ...buildEntryPayload(values),
            photos: JSON.stringify([...photos.keep, ...uploaded]),
          },
        });
        setEditing(null);
        await loadAll();
        await deleteFiles(removed);
      } catch (err) {
        await deleteFiles(uploaded);
        fail(err, 'Не удалось сохранить запись');
      } finally {
        setBusy(false);
      }
    },
    [api, base, busy, deleteFiles, loadAll, uploadFiles],
  );

  const onDelete = useCallback(
    async (row: EntryRow): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await deleteFiles(parsePhotos(row.photos));
        await api(`${base}/${row.id}`, { method: 'DELETE' });
        setConfirmDelete(null);
        await loadAll();
      } catch (err) {
        fail(err, 'Не удалось удалить запись');
      } finally {
        setBusy(false);
      }
    },
    [api, base, busy, deleteFiles, loadAll],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of items ?? []) {
      if (row.category !== null && row.category.trim() !== '') {
        set.add(row.category.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (items ?? []).filter((row) => {
      if (category !== ALL_CATEGORIES && row.category !== category) return false;
      if (q === '') return true;
      return row.title.toLowerCase().includes(q) || row.text.toLowerCase().includes(q);
    });
    return groupByDate(rows);
  }, [items, query, category]);

  if (error !== null && items === null) {
    return (
      <main className="diary">
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost diary-retry" type="button" onClick={() => void loadAll()}>
          Повторить
        </button>
      </main>
    );
  }

  if (meta === null || items === null) {
    return (
      <main className="diary">
        <p className="diary-hint">Загружаем…</p>
      </main>
    );
  }

  return (
    <main className="diary">
      {meta.description !== '' && <p className="diary-sub">{meta.description}</p>}

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <div className="diary-toolbar">
        <input
          className="field-input diary-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по записям"
          aria-label="Поиск по записям"
        />
        {canWrite && (
          <button
            className="btn-primary diary-add-toggle"
            type="button"
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? 'Закрыть' : 'Добавить запись'}
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="diary-chips" role="group" aria-label="Разделы">
          <button
            type="button"
            className={`diary-chip${category === ALL_CATEGORIES ? ' active' : ''}`}
            onClick={() => setCategory(ALL_CATEGORIES)}
          >
            Все
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`diary-chip${category === c ? ' active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {canWrite && addOpen && (
        <section className="diary-form-wrap" aria-label="Новая запись">
          <EntryForm
            key={formKey}
            initial={EMPTY_VALUES}
            fileUrl={fileUrl}
            submitLabel="Опубликовать"
            busy={busy}
            onSubmit={(values, photos) => void onCreate(values, photos)}
            onCancel={() => setAddOpen(false)}
          />
        </section>
      )}

      {filtered.length === 0 ? (
        <div className="diary-empty">
          <p className="diary-empty-title">
            {items.length === 0 ? 'Дневник пока пуст' : 'Ничего не нашлось'}
          </p>
          <p className="diary-empty-text">
            {items.length === 0
              ? canWrite
                ? 'Запишите первое событие из жизни дома — и оно появится здесь.'
                : 'Когда здесь появятся записи, они будут собраны по дням.'
              : 'Попробуйте изменить поиск или выбрать другой раздел.'}
          </p>
        </div>
      ) : (
        <div className="diary-timeline">
          {filtered.map((day) => (
            <section className="diary-day" key={day.date} aria-label={formatDay(day.date)}>
              <h2 className="diary-day-title">
                <span>{formatDay(day.date)}</span>
                {day.date === todayISO() && <span className="diary-today">Сегодня</span>}
              </h2>
              <div className="diary-day-list">
                {day.entries.map((row) => (
                  <article className="diary-entry" key={row.id}>
                    {editing?.id === row.id ? (
                      <EntryForm
                        key={row.id}
                        initial={fromRow(row)}
                        fileUrl={fileUrl}
                        existingPhotos={parsePhotos(row.photos)}
                        submitLabel="Сохранить"
                        busy={busy}
                        onSubmit={(values, photos) => void onSave(row, values, photos)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <div className="diary-entry-meta">
                          {row.mood !== null && row.mood !== '' && (
                            <span className="diary-mood" title="Настроение">
                              {row.mood}
                            </span>
                          )}
                          {row.category !== null && row.category.trim() !== '' && (
                            <span className="diary-cat">{row.category.trim()}</span>
                          )}
                          {row.created_by_username !== null && (
                            <span className="diary-author" title="Кто записал">
                              {row.created_by_username}
                            </span>
                          )}
                        </div>
                        <h3 className="diary-entry-title">{row.title}</h3>
                        <p className="diary-entry-text">{row.text}</p>
                        {parsePhotos(row.photos).length > 0 && (
                          <div className="diary-photos" role="group" aria-label="Фото">
                            {parsePhotos(row.photos).map((id) => (
                              <a
                                key={id}
                                className="diary-photo"
                                href={fileUrl(id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img src={fileUrl(id)} alt="" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        )}
                        {canWrite && (
                          <div className="diary-entry-actions">
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
                      </>
                    )}

                    {confirmDelete?.id === row.id && (
                      <div className="diary-confirm">
                        <span>Удалить запись вместе с фото? Действие необратимо.</span>
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
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function EntryForm({
  initial,
  fileUrl,
  existingPhotos = [],
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: EntryValues;
  fileUrl: (id: string) => string;
  existingPhotos?: string[];
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: EntryValues, photos: PickedPhotos) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<EntryValues>(initial);
  const [keep, setKeep] = useState<string[]>(existingPhotos);
  const [picked, setPicked] = useState<Array<{ file: File; url: string }>>([]);
  const pickedRef = useRef(picked);

  const setPickedBoth = (next: Array<{ file: File; url: string }>): void => {
    pickedRef.current = next;
    setPicked(next);
  };

  useEffect(() => {
    const files = pickedRef.current;
    return () => files.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (name: keyof EntryValues, value: string): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const next = files.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setPickedBoth([...pickedRef.current, ...next]);
    e.target.value = '';
  };

  const removePicked = (index: number): void => {
    setPickedBoth(pickedRef.current.filter((_, i) => i !== index));
    const removed = pickedRef.current[index];
    if (removed) URL.revokeObjectURL(removed.url);
  };

  const removeKeep = (id: string): void => {
    setKeep((k) => k.filter((x) => x !== id));
  };

  return (
    <form
      className="diary-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values, { keep, add: pickedRef.current.map((p) => p.file) });
      }}
    >
      <div className="diary-form-grid">
        <label className="field diary-field-date">
          <span className="field-label">Дата</span>
          <input
            className="field-input"
            type="date"
            value={values.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </label>
        <label className="field diary-field-cat">
          <span className="field-label">Раздел</span>
          <input
            className="field-input"
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Ремонт, гости, сад…"
            list="diary-categories"
          />
          <datalist id="diary-categories">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Заголовок</span>
        <input
          className="field-input"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Что случилось"
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Рассказ</span>
        <textarea
          className="field-input"
          rows={5}
          value={values.text}
          onChange={(e) => set('text', e.target.value)}
          placeholder="Как прошёл день в доме…"
          required
        />
      </label>
      <fieldset className="diary-mood-field">
        <legend className="field-label">Настроение</legend>
        <div className="diary-mood-row">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`diary-mood-btn${values.mood === m.value ? ' active' : ''}`}
              onClick={() => set('mood', values.mood === m.value ? '' : m.value)}
              title={m.label}
              aria-pressed={values.mood === m.value}
              disabled={busy}
            >
              <span className="diary-mood-emoji">{m.value}</span>
              <span className="diary-mood-label">{m.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {(keep.length > 0 || picked.length > 0) && (
        <div className="diary-form-photos" role="group" aria-label="Выбранные фото">
          {keep.map((id) => (
            <div className="diary-form-photo" key={id}>
              <img src={fileUrl(id)} alt="" />
              <button
                type="button"
                className="diary-photo-remove"
                aria-label="Убрать фото"
                disabled={busy}
                onClick={() => removeKeep(id)}
              >
                ✕
              </button>
            </div>
          ))}
          {picked.map((p, i) => (
            <div className="diary-form-photo" key={p.url}>
              <img src={p.url} alt="" />
              <button
                type="button"
                className="diary-photo-remove"
                aria-label="Убрать фото"
                disabled={busy}
                onClick={() => removePicked(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="diary-upload">
        <span className="btn-ghost">Добавить фото</span>
        <input type="file" accept="image/*" multiple onChange={onPick} disabled={busy} />
      </label>

      <div className="diary-form-actions">
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

interface DayGroup {
  date: string;
  entries: EntryRow[];
}

function groupByDate(entries: EntryRow[]): DayGroup[] {
  const map = new Map<string, EntryRow[]>();
  for (const row of entries) {
    const list = map.get(row.date) ?? [];
    list.push(row);
    map.set(row.date, list);
  }
  return [...map.entries()]
    .map(([date, rows]) => ({ date, entries: rows.sort((a, b) => b.id - a.id) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function fromRow(row: EntryRow): EntryValues {
  return {
    date: row.date ?? '',
    title: row.title ?? '',
    text: row.text ?? '',
    mood: row.mood ?? '',
    category: row.category ?? '',
  };
}

function validateValues(values: EntryValues): string | null {
  if (values.date === '') return 'Укажите дату';
  if (values.title.trim() === '') return 'Введите заголовок';
  if (values.text.trim() === '') return 'Расскажите, что случилось';
  return null;
}

function buildEntryPayload(values: EntryValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    date: values.date,
    title: values.title.trim(),
    text: values.text.trim(),
  };
  if (values.mood !== '') payload.mood = values.mood;
  if (values.category.trim() !== '') payload.category = values.category.trim();
  return payload;
}

function parsePhotos(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDay(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
