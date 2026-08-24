import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import './ui.css';
import {
  clampRating,
  formatScore,
  RATING_PARAMS,
  scoreOf,
  sortActive,
  sortBought,
  STATUS_BOUGHT,
  STATUS_LABELS,
  STATUS_PLANNED,
  STATUS_WANT,
  type Rating,
  type RatingFieldName,
  type RiceItem,
  type StatusValue,
} from './rice.js';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface ShoppingUiProps {
  moduleId: string;
  api: ApiClient;
  canWrite: boolean;
}

interface ManifestInfo {
  name: string;
  description: string;
}

interface ItemValues {
  title: string;
  status: StatusValue;
  reach: Rating;
  impact: Rating;
  confidence: Rating;
  cost: Rating;
  complexity: Rating;
  price: string;
  link: string;
  comment: string;
}

const SCALE = [1, 2, 3, 4, 5] as const;

const DEFAULT_VALUES: ItemValues = {
  title: '',
  status: STATUS_WANT,
  reach: 3,
  impact: 3,
  confidence: 3,
  cost: 3,
  complexity: 3,
  price: '',
  link: '',
  comment: '',
};

const STATUS_OPTIONS: Array<{ value: StatusValue; label: string }> = [
  { value: STATUS_WANT, label: 'Хочу' },
  { value: STATUS_PLANNED, label: 'В планах' },
  { value: STATUS_BOUGHT, label: 'Куплено' },
];

function normalizeStatus(value: number): StatusValue {
  if (value === STATUS_PLANNED || value === STATUS_BOUGHT) return value;
  return STATUS_WANT;
}

function fromRow(row: RiceItem): ItemValues {
  return {
    title: row.title ?? '',
    status: normalizeStatus(row.status),
    reach: clampRating(row.reach),
    impact: clampRating(row.impact),
    confidence: clampRating(row.confidence),
    cost: clampRating(row.cost),
    complexity: clampRating(row.complexity),
    price: row.price === null || row.price === undefined ? '' : String(row.price),
    link: row.link ?? '',
    comment: row.comment ?? '',
  };
}

function buildPayload(values: ItemValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: values.title.trim(),
    status: values.status,
    reach: values.reach,
    impact: values.impact,
    confidence: values.confidence,
    cost: values.cost,
    complexity: values.complexity,
    link: values.link.trim(),
    comment: values.comment.trim(),
  };
  const price = values.price.trim();
  if (price !== '' && Number.isFinite(Number(price))) {
    payload.price = Number(price);
  }
  return payload;
}

function ratingsLine(row: RiceItem): string {
  return RATING_PARAMS.map((p) => `${p.label} ${clampRating(row[p.name as RatingFieldName])}`).join(' · ');
}

function formatPrice(price: number | null): string | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  return `~ ${new Intl.NumberFormat('ru-RU').format(Math.round(price))} ₽`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    /* не ссылка */
  }
  return null;
}

export default function ShoppingModule({ moduleId, api, canWrite }: ShoppingUiProps) {
  const base = `/api/modules/${moduleId}/item`;
  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [items, setItems] = useState<RiceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RiceItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RiceItem | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [showBought, setShowBought] = useState(false);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [m, d] = await Promise.all([
        api<{ manifest: ManifestInfo }>(`/api/modules/${moduleId}/manifest`),
        api<{ items: RiceItem[] }>(base),
      ]);
      setMeta(m.manifest);
      setItems(d.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список покупок');
    }
  }, [api, base, moduleId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const run = useCallback(
    async (action: () => Promise<void>, fallback: string): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        fail(err, fallback);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const onCreate = (values: ItemValues): void => {
    if (values.title.trim() === '') {
      setError('Введите название покупки');
      return;
    }
    void run(async () => {
      await api(base, { method: 'POST', body: buildPayload(values) });
      setFormKey((k) => k + 1);
      setAddOpen(false);
      await loadAll();
    }, 'Не удалось добавить покупку');
  };

  const onSave = (row: RiceItem, values: ItemValues): void => {
    if (values.title.trim() === '') {
      setError('Введите название покупки');
      return;
    }
    void run(async () => {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: buildPayload(values) });
      setEditing(null);
      await loadAll();
    }, 'Не удалось сохранить покупку');
  };

  const onSetStatus = (row: RiceItem, status: StatusValue): void => {
    void run(async () => {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: { status } });
      await loadAll();
    }, 'Не удалось обновить статус');
  };

  const onDelete = (row: RiceItem): void => {
    void run(async () => {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await loadAll();
    }, 'Не удалось удалить покупку');
  };

  const active = useMemo(
    () => sortActive((items ?? []).filter((i) => normalizeStatus(i.status) !== STATUS_BOUGHT)),
    [items],
  );
  const bought = useMemo(
    () => sortBought((items ?? []).filter((i) => normalizeStatus(i.status) === STATUS_BOUGHT)),
    [items],
  );

  if (error !== null && items === null) {
    return (
      <main className="shopping">
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost shopping-retry" type="button" onClick={() => void loadAll()}>
          Повторить
        </button>
      </main>
    );
  }

  if (meta === null || items === null) {
    return (
      <main className="shopping">
        <p className="shopping-hint">Загружаем…</p>
      </main>
    );
  }

  return (
    <main className="shopping">
      <h1 className="shopping-title">{meta.name}</h1>
      {meta.description !== '' && <p className="shopping-sub">{meta.description}</p>}

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {(active.length > 0 || bought.length > 0) && (
        <p className="shopping-stats">
          {active.length > 0
            ? `В списке ${active.length} · в планах ${active.filter((i) => i.status === STATUS_PLANNED).length}`
            : 'Активных покупок нет'}
          {bought.length > 0 && ` · куплено ${bought.length}`}
        </p>
      )}

      {canWrite && (
        <div className="shopping-add">
          {addOpen ? (
            <ItemForm
              key={formKey}
              initial={DEFAULT_VALUES}
              submitLabel="Добавить покупку"
              busy={busy}
              onSubmit={onCreate}
              onCancel={() => setAddOpen(false)}
            />
          ) : (
            <button
              className="btn-primary shopping-add-toggle"
              type="button"
              onClick={() => setAddOpen(true)}
            >
              Добавить покупку
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="shopping-empty">
          <p className="shopping-empty-title">Пока пусто</p>
          <p className="shopping-empty-text">
            {canWrite
              ? 'Добавьте первую покупку, оцените её по шкале — и список сам выстроится по приоритету.'
              : 'Список пока не заполнен.'}
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Порядок покупок">
            <div className="shopping-section-head">
              <h2 className="shopping-section-title">Порядок покупок</h2>
              <span className="shopping-section-count">{active.length}</span>
            </div>
            {active.length === 0 ? (
              <p className="shopping-hint">Активных покупок нет — новые появятся здесь.</p>
            ) : (
              <ul className="shopping-list">
                {active.map((row) => (
                  <ItemRow
                    key={row.id}
                    row={row}
                    busy={busy}
                    canWrite={canWrite}
                    editing={editing?.id === row.id}
                    confirmDelete={confirmDelete?.id === row.id}
                    onEdit={() => {
                      setEditing(row);
                      setConfirmDelete(null);
                    }}
                    onCancelEdit={() => setEditing(null)}
                    onSave={onSave}
                    onSetStatus={(status) => onSetStatus(row, status)}
                    onAskDelete={() => setConfirmDelete(row)}
                    onCancelDelete={() => setConfirmDelete(null)}
                    onDelete={() => onDelete(row)}
                  />
                ))}
              </ul>
            )}
          </section>

          {bought.length > 0 && (
            <section className="shopping-archive" aria-label="Куплено">
              <button
                className="btn-ghost shopping-archive-toggle"
                type="button"
                aria-expanded={showBought}
                onClick={() => setShowBought((v) => !v)}
              >
                Куплено ({bought.length}) {showBought ? '▴' : '▾'}
              </button>
              {showBought && (
                <ul className="shopping-list">
                  {bought.map((row) => (
                    <ItemRow
                      key={row.id}
                      row={row}
                      busy={busy}
                      canWrite={canWrite}
                      editing={editing?.id === row.id}
                      confirmDelete={confirmDelete?.id === row.id}
                      onEdit={() => {
                        setEditing(row);
                        setConfirmDelete(null);
                      }}
                      onCancelEdit={() => setEditing(null)}
                      onSave={onSave}
                      onSetStatus={(status) => onSetStatus(row, status)}
                      onAskDelete={() => setConfirmDelete(row)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onDelete={() => onDelete(row)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

interface ItemRowProps {
  row: RiceItem;
  busy: boolean;
  canWrite: boolean;
  editing: boolean;
  confirmDelete: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (row: RiceItem, values: ItemValues) => void;
  onSetStatus: (status: StatusValue) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

function ItemRow(props: ItemRowProps) {
  const { row, busy, canWrite, editing, confirmDelete } = props;

  if (editing) {
    return (
      <li className="shopping-row">
        <ItemForm
          key={row.id}
          initial={fromRow(row)}
          submitLabel="Сохранить"
          busy={busy}
          onSubmit={(values) => props.onSave(row, values)}
          onCancel={props.onCancelEdit}
        />
      </li>
    );
  }

  const price = formatPrice(row.price);
  const href = row.link !== null && row.link !== '' ? safeHttpUrl(row.link) : null;
  const statusActions: Array<{ to: StatusValue; label: string }> =
    row.status === STATUS_BOUGHT
      ? [{ to: STATUS_WANT, label: 'Вернуть' }]
      : [
          ...(normalizeStatus(row.status) === STATUS_WANT
            ? [{ to: STATUS_PLANNED as StatusValue, label: 'В планы' }]
            : [{ to: STATUS_WANT as StatusValue, label: 'Хочу' }]),
          { to: STATUS_BOUGHT, label: 'Куплено' },
        ];

  return (
    <li className={`shopping-row${row.status === STATUS_BOUGHT ? ' done' : ''}`}>
      <div className="shopping-score" title="Балл приоритета RICE">
        <span className="shopping-score-num">{formatScore(scoreOf(row))}</span>
        <span className="shopping-score-cap">балл</span>
      </div>
      <div className="shopping-row-body">
        <span className="shopping-row-title">{row.title}</span>
        <div className="shopping-row-meta">
          {row.status !== STATUS_BOUGHT && (
            <span className={`shopping-chip${row.status === STATUS_PLANNED ? ' planned' : ''}`}>
              {STATUS_LABELS[normalizeStatus(row.status)]}
            </span>
          )}
          <span className="shopping-ratings" title="Оценки по шкале от 1 до 5">
            {ratingsLine(row)}
          </span>
          {row.status === STATUS_BOUGHT && (
            <span className="shopping-bought-at">с {formatDate(row.updated_at)}</span>
          )}
        </div>

        {(price !== null || href !== null || (row.comment !== null && row.comment !== '')) && (
          <div className="shopping-facts">
            {price !== null && <span className="shopping-price">{price}</span>}
            {href !== null && (
              <a className="shopping-link" href={href} target="_blank" rel="noopener noreferrer">
                ссылка на магазин
              </a>
            )}
            {row.comment !== null && row.comment !== '' && (
              <span className="shopping-note">{row.comment}</span>
            )}
          </div>
        )}

        {row.created_by_username !== null && (
          <span className="shopping-author" title="Кто добавил">
            Записал(а): {row.created_by_username}
          </span>
        )}

        {canWrite && (
          <div className="shopping-actions">
            {statusActions.map((a) => (
              <button
                key={a.to}
                className="btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => props.onSetStatus(a.to)}
              >
                {a.label}
              </button>
            ))}
            <button className="btn-ghost" type="button" disabled={busy} onClick={props.onEdit}>
              Изменить
            </button>
            <button
              className="btn-ghost btn-danger"
              type="button"
              disabled={busy}
              onClick={props.onAskDelete}
            >
              Удалить
            </button>
          </div>
        )}

        {confirmDelete && (
          <div className="shopping-confirm">
            <span>Удалить покупку? Действие необратимо.</span>
            <button className="btn-danger-solid" type="button" disabled={busy} onClick={props.onDelete}>
              {busy ? 'Удаляем…' : 'Удалить'}
            </button>
            <button className="btn-ghost" type="button" disabled={busy} onClick={props.onCancelDelete}>
              Отмена
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function ItemForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ItemValues;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: ItemValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ItemValues>(initial);

  const setValue = <K extends keyof ItemValues>(name: K, value: ItemValues[K]): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  const preview = scoreOf(values);

  return (
    <form
      className="shopping-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <label className="field">
        <span className="field-label">Что купить</span>
        <input
          className="field-input"
          value={values.title}
          onChange={(e) => setValue('title', e.target.value)}
          placeholder="Например, стиральная машина"
          autoFocus
          required
        />
      </label>

      <div
        className="shopping-seg"
        role="radiogroup"
        aria-label="Статус"
      >
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={values.status === o.value}
            className={`shopping-seg-btn${values.status === o.value ? ' on' : ''}`}
            disabled={busy}
            onClick={() => setValue('status', o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <fieldset className="shopping-ratings-fieldset">
        <legend className="shopping-ratings-legend">Оценки по шкале от 1 до 5</legend>
        {RATING_PARAMS.map((p) => (
          <RatingPicker
            key={p.name}
            label={p.label}
            hint={p.hint}
            value={values[p.name]}
            disabled={busy}
            onChange={(v) => setValue(p.name, v)}
          />
        ))}
      </fieldset>

      <p className="shopping-preview" aria-live="polite">
        Предварительный балл: <strong>{formatScore(preview)}</strong>
        <span className="shopping-preview-formula">
          (охват × польза × уверенность) ÷ ((деньги + сложность) ÷ 2)
        </span>
      </p>

      <div className="shopping-form-duo">
        <label className="field">
          <span className="field-label">Цена (~₽)</span>
          <input
            className="field-input"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={values.price}
            onChange={(e) => setValue('price', e.target.value)}
            placeholder="Сколько примерно стоит"
          />
        </label>
        <label className="field">
          <span className="field-label">Ссылка на магазин</span>
          <input
            className="field-input"
            type="url"
            inputMode="url"
            value={values.link}
            onChange={(e) => setValue('link', e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Комментарий</span>
        <textarea
          className="field-input"
          rows={2}
          value={values.comment}
          onChange={(e) => setValue('comment', e.target.value)}
          placeholder="Почему нужна, что учесть при выборе"
        />
      </label>

      <div className="shopping-form-actions">
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

function RatingPicker({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: Rating;
  disabled: boolean;
  onChange: (value: Rating) => void;
}) {
  return (
    <div className="shopping-rp" role="radiogroup" aria-label={`${label}: ${hint}`}>
      <div className="shopping-rp-head">
        <span className="shopping-rp-label">{label}</span>
        <span className="shopping-rp-hint">{hint}</span>
      </div>
      <div className="shopping-rp-scale">
        {SCALE.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            title={`${label}: ${v}`}
            className={`shopping-rp-btn${value === v ? ' on' : ''}`}
            disabled={disabled}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
