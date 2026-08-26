import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import './ui.css';
import {
  clampRating,
  formatScore,
  isRated,
  moneyCoefficient,
  RATING_PARAMS,
  scoreOf,
  sortActive,
  sortBought,
  STATUS_BOUGHT,
  STATUS_LABELS,
  STATUS_PLANNED,
  STATUS_WANT,
  type Rating,
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

type RatingValue = Rating | null;

interface ItemValues {
  title: string;
  status: StatusValue;
  reach: RatingValue;
  impact: RatingValue;
  confidence: RatingValue;
  complexity: RatingValue;
  price: string;
  link: string;
  comment: string;
}

const SCALE = [1, 2, 3, 4, 5] as const;

const DEFAULT_VALUES: ItemValues = {
  title: '',
  status: STATUS_WANT,
  reach: null,
  impact: null,
  confidence: null,
  complexity: null,
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

function ratingFromRow(value: number | null | undefined): RatingValue {
  return typeof value === 'number' && Number.isFinite(value) ? clampRating(value) : null;
}

function fromRow(row: RiceItem): ItemValues {
  return {
    title: row.title ?? '',
    status: normalizeStatus(row.status),
    reach: ratingFromRow(row.reach),
    impact: ratingFromRow(row.impact),
    confidence: ratingFromRow(row.confidence),
    complexity: ratingFromRow(row.complexity),
    price: row.price === null || row.price === undefined ? '' : String(row.price),
    link: row.link ?? '',
    comment: row.comment ?? '',
  };
}

function parsePrice(values: ItemValues): number | null {
  const raw = values.price.trim();
  if (raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function buildPayload(values: ItemValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: values.title.trim(),
    status: values.status,
    link: values.link.trim(),
    comment: values.comment.trim(),
  };
  for (const p of RATING_PARAMS) {
    const value = values[p.name];
    if (value !== null) payload[p.name] = value;
  }
  const price = parsePrice(values);
  if (price !== null) payload.price = price;
  return payload;
}

function formatCoef(coef: number | null): string | null {
  if (coef === null) return null;
  return Number(coef.toFixed(1)).toString();
}

function formatPrice(price: number | null): string | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  return `~ ${new Intl.NumberFormat('ru-RU').format(Math.round(price))} ₽`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function safeHttpUrl(value: string | null): string | null {
  if (value === null || value === '') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    /* не ссылка */
  }
  return null;
}

function InfoIcon(): ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="10.5" x2="12" y2="16.5" />
      <line x1="12" y1="7.2" x2="12" y2="7.3" />
    </svg>
  );
}

function DotsIcon(): ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

function LinkIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M19 5l-8.5 8.5" />
      <path d="M15.5 13.5V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2h3.5" />
    </svg>
  );
}

export default function ShoppingModule({ moduleId, api, canWrite }: ShoppingUiProps) {
  const base = `/api/modules/${moduleId}/item`;
  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [items, setItems] = useState<RiceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RiceItem | null>(null);
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

  const run = useCallback(
    async (action: () => Promise<void>, fallback: string): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
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
      setEditing(null);
      await loadAll();
    }, 'Не удалось удалить покупку');
  };

  const all = items ?? [];
  const active = useMemo(
    () =>
      sortActive(
        all.filter(
          (i) => normalizeStatus(i.status) !== STATUS_BOUGHT && isRated(i),
        ),
        all.map((i) => i.price),
      ),
    [all],
  );
  const backlog = useMemo(
    () =>
      sortActive(
        all.filter(
          (i) => normalizeStatus(i.status) !== STATUS_BOUGHT && !isRated(i),
        ),
        all.map((i) => i.price),
      ),
    [all],
  );
  const bought = useMemo(
    () => sortBought(all.filter((i) => normalizeStatus(i.status) === STATUS_BOUGHT)),
    [all],
  );
  const pricePool = useMemo(
    () =>
      active
        .map((i) => i.price)
        .filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0),
    [active],
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

  const rowCommon = {
    busy,
    canWrite,
    editingId: editing?.id ?? null,
    prices: pricePool,
    onEdit: (row: RiceItem) => {
      setEditing(row);
      setAddOpen(false);
    },
    onCancelEdit: () => setEditing(null),
    onSave,
    onSetStatus,
    onDelete,
  };

  return (
    <main className="shopping">

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {(active.length > 0 || backlog.length > 0 || bought.length > 0) && (
        <p className="shopping-stats">
          {[
            active.length > 0 ? `в списке ${active.length}` : null,
            backlog.length > 0 ? `идеи ${backlog.length}` : null,
            bought.length > 0 ? `куплено ${bought.length}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {canWrite && (
        <div className="shopping-add">
          {addOpen ? (
            <ItemForm
              key={`add-${formKey}`}
              initial={DEFAULT_VALUES}
              labels={{ rated: 'Добавить с оценкой', unrated: 'Записать идею в бэклог' }}
              pricePool={pricePool}
              busy={busy}
              onSubmit={(values) => {
                onCreate(values);
                setAddOpen(false);
              }}
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
              ? 'Записывайте любые идеи — от мелочей до крупной техники. Оценённые покупки сами выстроятся по приоритету.'
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
              <p className="shopping-hint">
                Пока никто ничего не оценил — оцените идеи из бэклога, и здесь появится порядок.
              </p>
            ) : (
              <ul className="shopping-list">
                {active.map((row) => (
                  <ItemRow key={row.id} row={row} {...rowCommon} />
                ))}
              </ul>
            )}
          </section>

          {backlog.length > 0 && (
            <section aria-label="Идеи без оценок">
              <div className="shopping-section-head">
                <h2 className="shopping-section-title">Идеи без оценок</h2>
                <span className="shopping-section-count">{backlog.length}</span>
              </div>
              <p className="shopping-section-hint">
                Накидывайте всё подряд: чтобы идея попала в список, нужны четыре оценки и примерная
                сумма — денежный коэффициент посчитается сам относительно других покупок.
              </p>
              <ul className="shopping-list">
                {backlog.map((row) => (
                  <BacklogRow key={row.id} row={row} {...rowCommon} />
                ))}
              </ul>
            </section>
          )}

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
                    <ItemRow key={row.id} row={row} {...rowCommon} />
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

interface RowShared {
  busy: boolean;
  canWrite: boolean;
  editingId: number | null;
  prices: number[];
  onEdit: (row: RiceItem) => void;
  onCancelEdit: () => void;
  onSave: (row: RiceItem, values: ItemValues) => void;
  onSetStatus: (row: RiceItem, status: StatusValue) => void;
  onDelete: (row: RiceItem) => void;
}

interface ItemMenuProps {
  row: RiceItem;
  busy: boolean;
  showStatuses: boolean;
  onSetStatus: (status: StatusValue) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ItemMenu({ row, busy, showStatuses, onSetStatus, onEdit, onDelete }: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const act = (fn: () => void): void => {
    setOpen(false);
    fn();
  };

  const current = normalizeStatus(row.status);

  return (
    <div className="shopping-menu-wrap" ref={rootRef}>
      <button
        className="shopping-iconbtn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Действия с покупкой"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          setOpen((v) => !v);
        }}
      >
        <DotsIcon />
      </button>
      {open && (
        <div className="shopping-menu" role="menu" aria-label="Действия с покупкой">
          {confirming ? (
            <div className="shopping-menu-confirm">
              <span>Удалить безвозвратно?</span>
              <div className="shopping-menu-confirm-actions">
                <button
                  className="btn-danger-solid shopping-menu-btn"
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => act(onDelete)}
                >
                  Удалить
                </button>
                <button
                  className="btn-ghost shopping-menu-btn"
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              {showStatuses &&
                STATUS_OPTIONS.filter((o) => o.value !== current).map((o) => (
                  <button
                    key={o.value}
                    className="shopping-menu-item"
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => act(() => onSetStatus(o.value))}
                  >
                    {o.value === STATUS_BOUGHT && current !== STATUS_BOUGHT
                      ? 'Купить'
                      : o.label}
                  </button>
                ))}
              {showStatuses && (
                <button
                  className="shopping-menu-item on"
                  type="button"
                  role="menuitem"
                  aria-current="true"
                  disabled
                >
                  {STATUS_LABELS[current]} ✓
                </button>
              )}
              {showStatuses && <div className="shopping-menu-sep" role="separator" />}
              <button
                className="shopping-menu-item"
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => act(onEdit)}
              >
                Изменить
              </button>
              <div className="shopping-menu-sep" role="separator" />
              <button
                className="shopping-menu-item danger"
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                Удалить…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ItemRowProps extends RowShared {
  row: RiceItem;
}

function ItemRow(props: ItemRowProps) {
  const { row, busy, canWrite, editingId } = props;
  const [infoOpen, setInfoOpen] = useState(false);

  if (editingId === row.id) {
    return (
      <li className="shopping-row">
        <ItemForm
          key={row.id}
          initial={fromRow(row)}
          labels={{ rated: 'Сохранить с оценкой', unrated: 'Сохранить и убрать в бэклог' }}
          pricePool={props.prices}
          busy={busy}
          onSubmit={(values) => props.onSave(row, values)}
          onCancel={props.onCancelEdit}
        />
      </li>
    );
  }

  const price = formatPrice(row.price);
  const href = safeHttpUrl(row.link);
  const done = row.status === STATUS_BOUGHT;

  return (
    <li className={`shopping-row${done ? ' done' : ''}`}>
      <div className="shopping-score" title="Балл приоритета RICE">
        <span className="shopping-score-num">{formatScore(scoreOf(row, props.prices))}</span>
        <span className="shopping-score-cap">балл</span>
      </div>
      <div className="shopping-row-main">
        <span className="shopping-row-title">{row.title}</span>
        {price !== null && <span className="shopping-price">{price}</span>}
      </div>
      <div className="shopping-tools">
        {href !== null && (
          <a
            className="shopping-iconbtn"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Открыть ссылку: ${row.title}`}
            title="Ссылка на магазин"
          >
            <LinkIcon />
          </a>
        )}
        <button
          className="shopping-iconbtn"
          type="button"
          aria-expanded={infoOpen}
          aria-controls={`shopping-info-${row.id}`}
          aria-label="Подробнее о покупке"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <InfoIcon />
        </button>
        {canWrite && (
          <ItemMenu
            row={row}
            busy={busy}
            showStatuses
            onSetStatus={(status) => props.onSetStatus(row, status)}
            onEdit={() => props.onEdit(row)}
            onDelete={() => props.onDelete(row)}
          />
        )}
      </div>
      {infoOpen && (
        <div className="shopping-info" id={`shopping-info-${row.id}`}>
          <div className="shopping-info-grid">
            {RATING_PARAMS.map((p) => (
              <span key={p.name} className="shopping-info-param">
                <i>{p.label}</i> {clampRating(row[p.name as keyof RiceItem])}/5
              </span>
            ))}
            {(() => {
              const coef = formatCoef(moneyCoefficient(row.price, props.prices));
              return (
                <>
                  <span className="shopping-info-param">
                    <i>Деньги</i> {coef === null ? '—' : `${coef} · из суммы`}
                  </span>
                  {price !== null && <span className="shopping-info-param"><i>Сумма</i> ~{price.replace('~ ', '')}</span>}
                </>
              );
            })()}
          </div>
          <div className="shopping-info-facts">
            <span>
              Статус: {STATUS_LABELS[normalizeStatus(row.status)]}
              {done && ` с ${formatDate(row.updated_at)}`}
            </span>
            {href !== null && (
              <a href={href} target="_blank" rel="noopener noreferrer" className="shopping-link">
                открыть магазин ↗
              </a>
            )}
            {row.created_by_username !== null && (
              <span>
                Записал(а): {row.created_by_username} · {formatDate(row.created_at)}
              </span>
            )}
          </div>
          {row.comment !== null && row.comment !== '' && (
            <p className="shopping-note">{row.comment}</p>
          )}
        </div>
      )}
    </li>
  );
}

function BacklogRow(props: ItemRowProps) {
  const { row, busy, canWrite, editingId } = props;

  if (editingId === row.id) {
    return (
      <li className="shopping-row backlog">
        <ItemForm
          key={row.id}
          initial={fromRow(row)}
          labels={{ rated: 'Оценить и добавить в список', unrated: 'Сохранить без оценки' }}
          pricePool={props.prices}
          busy={busy}
          onSubmit={(values) => props.onSave(row, values)}
          onCancel={props.onCancelEdit}
        />
      </li>
    );
  }

  const price = formatPrice(row.price);

  return (
    <li className="shopping-row backlog">
      <div className="shopping-row-main">
        <span className="shopping-row-title">{row.title}</span>
        {price !== null && <span className="shopping-price">{price}</span>}
      </div>
      {canWrite && (
        <div className="shopping-tools">
          <button
            className="btn-primary shopping-evaluate"
            type="button"
            disabled={busy}
            onClick={() => props.onEdit(row)}
          >
            Оценить
          </button>
          <ItemMenu
            row={row}
            busy={busy}
            showStatuses={false}
            onSetStatus={(status) => props.onSetStatus(row, status)}
            onEdit={() => props.onEdit(row)}
            onDelete={() => props.onDelete(row)}
          />
        </div>
      )}
    </li>
  );
}

function ItemForm({
  initial,
  labels,
  pricePool,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ItemValues;
  labels: { rated: string; unrated: string };
  pricePool: number[];
  busy: boolean;
  onSubmit: (values: ItemValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ItemValues>(initial);

  const setValue = <K extends keyof ItemValues>(name: K, value: ItemValues[K]): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  const price = parsePrice(values);
  const complete = isRated({ ...values, price });
  const previewScore = complete ? scoreOf({ ...values, price }, [...pricePool]) : null;
  const moneyNow = formatCoef(moneyCoefficient(price, pricePool));

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

      <fieldset className="shopping-ratings-fieldset">
        <legend className="shopping-ratings-legend">
          Оценки от 1 до 5 — можно оставить на потом
        </legend>
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
        <div className="shopping-money">
          <div className="shopping-rp-head">
            <span className="shopping-rp-label">Деньги</span>
            <span className="shopping-rp-hint">
              впишите сумму — коэффициент посчитается сам относительно других покупок
              {moneyNow !== null && ` · сейчас ${moneyNow} из 5`}
            </span>
          </div>
          <input
            className="field-input shopping-money-input"
            type="number"
            min="1"
            step="any"
            inputMode="decimal"
            value={values.price}
            disabled={busy}
            onChange={(e) => setValue('price', e.target.value)}
            placeholder="₽ примерно"
            aria-label="Примерная сумма в рублях"
          />
        </div>
      </fieldset>

      {complete ? (
        <p className="shopping-preview" aria-live="polite">
          Предварительный балл: <strong>{formatScore(previewScore)}</strong>
          <span className="shopping-preview-formula">
            (охват × польза × уверенность) ÷ ((деньги + сложность) ÷ 2), деньги — из суммы
          </span>
        </p>
      ) : (
        <p className="shopping-preview shopping-preview-empty" aria-live="polite">
          {moneyNow === null && values.reach !== null && values.impact !== null && values.confidence !== null && values.complexity !== null
            ? 'Осталось указать сумму — и покупка займёт место в списке.'
            : 'Без полной оценки и суммы покупка попадёт в бэклог идей — вернуться к ней можно в любой момент.'}
        </p>
      )}

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
          {busy ? 'Сохраняем…' : complete ? labels.rated : labels.unrated}
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
  value: RatingValue;
  disabled: boolean;
  onChange: (value: RatingValue) => void;
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
            onClick={() => onChange(value === v ? null : v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
