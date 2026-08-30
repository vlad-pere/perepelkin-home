import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface MaintenanceUiProps {
  moduleId: string;
  api: ApiClient;
  currentUserId: number;
  canWrite: boolean;
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  category: number;
  interval_months: number | null;
  next_due: string | null;
  notes: string | null;
  completion_count: number;
  last_completed: string | null;
  created_at: string;
}

interface CompletionRow {
  id: number;
  task_id: number;
  completed_at: string;
  notes: string | null;
  amount: number | null;
}

interface DigestData {
  overdue: TaskRow[];
  upcoming: TaskRow[];
  noDate: TaskRow[];
  today: string;
}

interface ManifestInfo {
  name: string;
  description: string;
}

const CATEGORIES = ['Дом', 'Машина', 'Техника', 'Прочее'] as const;

function categoryLabel(n: number): string {
  return CATEGORIES[n] ?? 'Прочее';
}

interface TaskFormValues {
  title: string;
  description: string;
  category: number;
  interval_months: string;
  next_due: string;
  notes: string;
}

const EMPTY_TASK: TaskFormValues = {
  title: '',
  description: '',
  category: 0,
  interval_months: '',
  next_due: '',
  notes: '',
};

interface CompleteFormValues {
  completed_at: string;
  notes: string;
  amount: string;
  next_due: string;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultNextDue(task: TaskRow): string {
  if (task.next_due) return task.next_due;
  if (task.interval_months) {
    const d = new Date();
    d.setMonth(d.getMonth() + task.interval_months);
    return d.toISOString().slice(0, 10);
  }
  return todayStr();
}

export default function MaintenanceModule({ moduleId, api, currentUserId, canWrite }: MaintenanceUiProps) {
  const base = `/api/modules/${moduleId}`;
  const [meta, setMeta] = useState<ManifestInfo | null>(null);
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [historyTask, setHistoryTask] = useState<TaskRow | null>(null);
  const [historyData, setHistoryData] = useState<CompletionRow[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [m, d, t] = await Promise.all([
        api<{ manifest: ManifestInfo }>(`${base}/manifest`),
        api<DigestData>(`${base}/digest`),
        api<{ items: TaskRow[] }>(`${base}/task`),
      ]);
      setMeta(m.manifest);
      setDigest(d);
      setTasks(t.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    }
  }, [api, base, moduleId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const onCreate = async (values: TaskFormValues): Promise<void> => {
    if (busy) return;
    if (values.title.trim() === '') {
      setError('Введите название');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/task`, {
        method: 'POST',
        body: {
          title: values.title.trim(),
          description: values.description.trim() || null,
          category: values.category,
          interval_months: values.interval_months !== '' ? Number(values.interval_months) : null,
          next_due: values.next_due || null,
          notes: values.notes.trim() || null,
        },
      });
      setFormKey((k) => k + 1);
      setAddOpen(false);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось создать задачу');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (row: TaskRow, values: TaskFormValues): Promise<void> => {
    if (busy) return;
    if (values.title.trim() === '') {
      setError('Введите название');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/task/${row.id}`, {
        method: 'PATCH',
        body: {
          title: values.title.trim(),
          description: values.description.trim() || null,
          category: values.category,
          interval_months: values.interval_months !== '' ? Number(values.interval_months) : null,
          next_due: values.next_due || null,
          notes: values.notes.trim() || null,
        },
      });
      setEditing(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async (row: TaskRow, values: CompleteFormValues): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/task/${row.id}/complete`, {
        method: 'POST',
        body: {
          completed_at: values.completed_at || todayStr(),
          notes: values.notes.trim() || null,
          amount: values.amount !== '' ? Number(values.amount) : null,
          next_due: values.next_due || null,
        },
      });
      setCompleting(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось отметить выполнение');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: TaskRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/task/${row.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await loadAll();
    } catch (err) {
      fail(err, 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (row: TaskRow): Promise<void> => {
    setHistoryTask(row);
    setHistoryData(null);
    try {
      const data = await api<{ completions: CompletionRow[] }>(`${base}/task/${row.id}/history`);
      setHistoryData(data.completions);
    } catch (err) {
      fail(err, 'Не удалось загрузить историю');
    }
  };

  const filteredTasks = useMemo(() => {
    const list = tasks ?? [];
    if (filterCategory === null) return list;
    return list.filter((t) => t.category === filterCategory);
  }, [tasks, filterCategory]);

  const groupedTasks = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;

    const RU_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

    const overdue: TaskRow[] = [];
    const thisM: TaskRow[] = [];
    const nextM: TaskRow[] = [];
    const noDate: TaskRow[] = [];
    const monthBuckets = new Map<string, TaskRow[]>();

    for (const t of filteredTasks) {
      if (!t.next_due) { noDate.push(t); continue; }
      if (t.next_due < today) { overdue.push(t); continue; }
      if (t.next_due.startsWith(thisMonth)) { thisM.push(t); continue; }
      if (t.next_due.startsWith(nextMonth)) { nextM.push(t); continue; }
      const ym = t.next_due.slice(0, 7);
      const bucket = monthBuckets.get(ym);
      if (bucket) { bucket.push(t); } else { monthBuckets.set(ym, [t]); }
    }

    const laterGroups: Array<{ label: string; items: TaskRow[] }> = [];
    for (const [ym, items] of monthBuckets) {
      const [y, m] = ym.split('-').map(Number);
      const label = `${RU_MONTHS[m! - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`;
      laterGroups.push({ label, items });
    }

    const groups: Array<{ label: string; items: TaskRow[] }> = [];
    if (overdue.length) groups.push({ label: 'Просрочено', items: overdue });
    if (thisM.length) groups.push({ label: 'Этот месяц', items: thisM });
    if (nextM.length) groups.push({ label: 'Следующий месяц', items: nextM });
    for (const g of laterGroups) groups.push(g);
    if (noDate.length) groups.push({ label: 'Без даты', items: noDate });

    return groups;
  }, [filteredTasks]);

  if (error !== null && tasks === null) {
    return (
      <main className="mtc">
        <p className="auth-error" role="alert">
          {error}
        </p>
        <button className="btn-ghost mtc-retry" type="button" onClick={() => void loadAll()}>
          Повторить
        </button>
      </main>
    );
  }

  if (meta === null || tasks === null || digest === null) {
    return (
      <main className="mtc">
        <p className="mtc-hint">Загружаем…</p>
      </main>
    );
  }

  return (
    <main className="mtc">
      {meta.description !== '' && <p className="mtc-sub">{meta.description}</p>}

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {/* Digest */}
      {(digest.overdue.length > 0 || digest.upcoming.length > 0) && (
        <section className="mtc-digest" aria-label="Дайджест">
          {digest.overdue.length > 0 && (
            <div className="mtc-digest-group mtc-digest-overdue">
              <h3 className="mtc-digest-title">Просрочено</h3>
              <ul className="mtc-digest-list">
                {digest.overdue.map((t) => (
                  <li className="mtc-digest-item overdue" key={t.id}>
                    <span className="mtc-digest-name">{t.title}</span>
                    <span className="mtc-digest-date">{formatDate(String(t.next_due))}</span>
                    {canWrite && (
                      <button
                        className="btn-ghost btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => setCompleting(t)}
                      >
                        Выполнено
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {digest.upcoming.length > 0 && (
            <div className="mtc-digest-group mtc-digest-upcoming">
              <h3 className="mtc-digest-title">Ближайшие</h3>
              <ul className="mtc-digest-list">
                {digest.upcoming.slice(0, 5).map((t) => (
                  <li className="mtc-digest-item" key={t.id}>
                    <span className="mtc-digest-name">{t.title}</span>
                    <span className="mtc-digest-date">{formatDate(String(t.next_due))}</span>
                    {canWrite && (
                      <button
                        className="btn-ghost btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => setCompleting(t)}
                      >
                        Выполнено
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {digest.overdue.length === 0 && digest.upcoming.length === 0 && (
        <div className="mtc-digest-empty">
          <p className="mtc-digest-empty-text">Всё под контролем</p>
        </div>
      )}

      {/* Add button */}
      {canWrite && (
        <div className="mtc-add">
          {addOpen ? (
            <TaskForm
              key={formKey}
              initial={EMPTY_TASK}
              submitLabel="Добавить задачу"
              busy={busy}
              onSubmit={(v) => void onCreate(v)}
              onCancel={() => setAddOpen(false)}
            />
          ) : (
            <button
              className="btn-primary mtc-add-toggle"
              type="button"
              onClick={() => setAddOpen(true)}
            >
              Добавить задачу
            </button>
          )}
        </div>
      )}

      {/* Category filter */}
      <div className="mtc-filters">
        <button
          className={`mtc-filter${filterCategory === null ? ' active' : ''}`}
          type="button"
          onClick={() => setFilterCategory(null)}
        >
          Все
        </button>
        {CATEGORIES.map((label, i) => (
          <button
            key={i}
            className={`mtc-filter${filterCategory === i ? ' active' : ''}`}
            type="button"
            onClick={() => setFilterCategory(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {groupedTasks.length === 0 ? (
        <div className="mtc-empty">
          <p className="mtc-empty-title">Пока пусто</p>
          {canWrite && (
            <p className="mtc-empty-text">Добавьте первую задачу — обслуживание, замену, ревизию.</p>
          )}
        </div>
      ) : (
        groupedTasks.map((group) => (
          <section key={group.label} className="mtc-group" aria-label={group.label}>
            <h3 className="mtc-group-title">{group.label}</h3>
            <ul className="mtc-list">
              {group.items.map((row) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  busy={busy}
                  canWrite={canWrite}
                  editing={editing}
                  confirmDelete={confirmDelete}
                  onEdit={() => setEditing(row)}
                  onCancelEdit={() => setEditing(null)}
                  onSave={(v) => void onSave(row, v)}
                  onComplete={() => setCompleting(row)}
                  onHistory={() => void openHistory(row)}
                  onDeleteRequest={() => setConfirmDelete(row)}
                  onDeleteCancel={() => setConfirmDelete(null)}
                  onDelete={() => void onDelete(row)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Complete modal */}
      {completing && (
        <CompleteModal
          task={completing}
          busy={busy}
          onSubmit={(v) => void onComplete(completing, v)}
          onCancel={() => setCompleting(null)}
        />
      )}

      {/* History modal */}
      {historyTask && (
        <HistoryModal
          task={historyTask}
          completions={historyData}
          onClose={() => {
            setHistoryTask(null);
            setHistoryData(null);
          }}
        />
      )}
    </main>
  );
}

// --- Sub-components ---

function TaskRow({
  row,
  busy,
  canWrite,
  editing,
  confirmDelete,
  onEdit,
  onCancelEdit,
  onSave,
  onComplete,
  onHistory,
  onDeleteRequest,
  onDeleteCancel,
  onDelete,
}: {
  row: TaskRow;
  busy: boolean;
  canWrite: boolean;
  editing: TaskRow | null;
  confirmDelete: TaskRow | null;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (v: TaskFormValues) => void;
  onComplete: () => void;
  onHistory: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDelete: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  if (editing?.id === row.id) {
    return (
      <li className="mtc-row">
        <TaskForm
          initial={fromRow(row)}
          submitLabel="Сохранить"
          busy={busy}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      </li>
    );
  }

  const overdue = isOverdue(row);

  return (
    <li className={`mtc-row${overdue ? ' overdue' : ''}`}>
      <div className="mtc-status" title={overdue ? 'Просрочено' : 'В порядке'}>
        <span className="mtc-status-icon">{overdue ? '⚠' : '✓'}</span>
      </div>
      <div className="mtc-row-main">
        <span className="mtc-row-title">{row.title}</span>
        <span className="mtc-category-badge">{categoryLabel(row.category)}</span>
        {row.next_due && (
          <span className={`mtc-row-due${overdue ? ' overdue' : ''}`}>
            {formatDate(row.next_due)}
          </span>
        )}
      </div>
      <div className="mtc-row-tools">
        <button
          className="mtc-iconbtn"
          type="button"
          aria-expanded={infoOpen}
          aria-label="Подробнее"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v-.01"/></svg>
        </button>
        {canWrite && (
          <button
            className="mtc-iconbtn"
            type="button"
            aria-label="Действия"
            onClick={onComplete}
            title="Выполнено"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5 6.5-8"/></svg>
          </button>
        )}
      </div>

      {infoOpen && (
        <div className="mtc-info" ref={infoRef}>
          {row.description && <p className="mtc-info-text">{row.description}</p>}
          <div className="mtc-info-grid">
            {row.interval_months != null && (
              <span className="mtc-info-param"><i>Интервал</i> каждые {row.interval_months} мес.</span>
            )}
            {row.completion_count > 0 && (
              <span className="mtc-info-param"><i>Выполнено</i> {row.completion_count} раз{row.last_completed ? `, последний ${formatDate(row.last_completed)}` : ''}</span>
            )}
            <span className="mtc-info-param"><i>Создано</i> {formatDate(row.created_at)}</span>
          </div>
          {row.notes && <p className="mtc-info-note">{row.notes}</p>}
          {canWrite && (
            <div className="mtc-info-actions">
              <button className="btn-ghost btn-sm" type="button" disabled={busy} onClick={onEdit}>
                Изменить
              </button>
              <button className="btn-ghost btn-sm" type="button" disabled={busy} onClick={onHistory}>
                История
              </button>
              <button className="btn-ghost btn-danger btn-sm" type="button" disabled={busy} onClick={onDeleteRequest}>
                Удалить
              </button>
            </div>
          )}
        </div>
      )}

      {confirmDelete?.id === row.id && (
        <div className="mtc-confirm">
          <span>Удалить задачу? Вся история будет удалена.</span>
          <button className="btn-danger-solid" type="button" disabled={busy} onClick={onDelete}>
            {busy ? 'Удаляем…' : 'Удалить'}
          </button>
          <button className="btn-ghost" type="button" disabled={busy} onClick={onDeleteCancel}>
            Отмена
          </button>
        </div>
      )}
    </li>
  );
}

function TaskForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: TaskFormValues;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<TaskFormValues>(initial);
  const set = (name: keyof TaskFormValues, value: string | number): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  return (
    <form
      className="mtc-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="mtc-form-row">
        <label className="field mtc-field-title">
          <span className="field-label">Название</span>
          <input
            className="field-input"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Замена фильтра, ТО машины…"
            autoFocus
            required
          />
        </label>
        <label className="field mtc-field-cat">
          <span className="field-label">Категория</span>
          <select
            className="field-input"
            value={values.category}
            onChange={(e) => set('category', Number(e.target.value))}
          >
            {CATEGORIES.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Описание</span>
        <textarea
          className="field-input"
          rows={2}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Необязательно"
        />
      </label>
      <div className="mtc-form-row">
        <label className="field mtc-field-interval">
          <span className="field-label">Интервал (мес.)</span>
          <input
            className="field-input"
            type="number"
            min={1}
            step={1}
            value={values.interval_months}
            onChange={(e) => set('interval_months', e.target.value)}
            placeholder="6"
          />
        </label>
        <label className="field mtc-field-date">
          <span className="field-label">Следующая дата</span>
          <input
            className="field-input"
            type="date"
            value={values.next_due}
            onChange={(e) => set('next_due', e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Заметки</span>
        <textarea
          className="field-input"
          rows={2}
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Необязательно"
        />
      </label>
      <div className="mtc-form-actions">
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

function CompleteModal({
  task,
  busy,
  onSubmit,
  onCancel,
}: {
  task: TaskRow;
  busy: boolean;
  onSubmit: (values: CompleteFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CompleteFormValues>({
    completed_at: todayStr(),
    notes: '',
    amount: '',
    next_due: defaultNextDue(task),
  });
  const set = (name: keyof CompleteFormValues, value: string): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  return (
    <div className="mtc-overlay" onClick={onCancel}>
      <div className="mtc-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="mtc-modal-title">Выполнено: {task.title}</h3>
        <form
          className="mtc-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit(values);
          }}
        >
          <div className="mtc-form-row">
            <label className="field">
              <span className="field-label">Дата выполнения</span>
              <input
                className="field-input"
                type="date"
                value={values.completed_at}
                onChange={(e) => set('completed_at', e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Сумма (₽)</span>
              <input
                className="field-input"
                type="number"
                min={0}
                step={0.01}
                value={values.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Следующая дата</span>
            <input
              className="field-input"
              type="date"
              value={values.next_due}
              onChange={(e) => set('next_due', e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Комментарий</span>
            <textarea
              className="field-input"
              rows={2}
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Необязательно"
            />
          </label>
          <div className="mtc-form-actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Отметить'}
            </button>
            <button className="btn-ghost" type="button" onClick={onCancel} disabled={busy}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryModal({
  task,
  completions,
  onClose,
}: {
  task: TaskRow;
  completions: CompletionRow[] | null;
  onClose: () => void;
}) {
  const totalSpent = useMemo(() => {
    if (!completions) return 0;
    return completions.reduce((sum, c) => sum + (c.amount ?? 0), 0);
  }, [completions]);

  return (
    <div className="mtc-overlay" onClick={onClose}>
      <div className="mtc-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="mtc-modal-title">История: {task.title}</h3>
        {completions === null ? (
          <p className="mtc-hint">Загружаем…</p>
        ) : completions.length === 0 ? (
          <p className="mtc-hint">Пока нет выполнений</p>
        ) : (
          <>
            {totalSpent > 0 && (
              <p className="mtc-history-total">
                Итого потрачено: <strong>{totalSpent.toLocaleString('ru-RU')} ₽</strong>
              </p>
            )}
            <ul className="mtc-history-list">
              {completions.map((c) => (
                <li className="mtc-history-item" key={c.id}>
                  <div className="mtc-history-main">
                    <span className="mtc-history-date">{formatDate(c.completed_at)}</span>
                    {c.amount != null && c.amount > 0 && (
                      <span className="mtc-history-amount">{c.amount.toLocaleString('ru-RU')} ₽</span>
                    )}
                  </div>
                  {c.notes && <span className="mtc-history-notes">{c.notes}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mtc-form-actions">
          <button className="btn-ghost" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function fromRow(row: TaskRow): TaskFormValues {
  return {
    title: row.title ?? '',
    description: row.description ?? '',
    category: row.category ?? 0,
    interval_months: row.interval_months != null ? String(row.interval_months) : '',
    next_due: row.next_due ?? '',
    notes: row.notes ?? '',
  };
}

function isOverdue(row: TaskRow): boolean {
  if (!row.next_due) return false;
  return row.next_due < todayStr();
}

function formatDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
