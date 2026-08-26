import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  validateManifest,
  type ManifestEntity,
  type ManifestField,
  type ModuleManifest,
} from '@perepelkin-home/core';
import type { ModuleApiClient } from './registry';
import './crud.css';

interface CrudRow {
  id: number;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

type FormValues = Record<string, string | number | boolean>;

export interface CrudModuleProps {
  moduleId: string;
  api: ModuleApiClient;
  canWrite: boolean;
}

export function CrudModule({ moduleId, api, canWrite }: CrudModuleProps) {
  const [manifest, setManifest] = useState<ModuleManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ manifest: ModuleManifest }>(`/api/modules/${moduleId}/manifest`)
      .then((data) => {
        if (cancelled) return;
        setManifest(validateManifest(data.manifest));
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить модуль');
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, api]);

  if (error !== null) {
    return (
      <main className="crud">
        <p className="auth-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (manifest === null) {
    return (
      <main className="crud">
        <p className="crud-hint">Загружаем…</p>
      </main>
    );
  }

  return (
    <main className="crud">
      {manifest.description !== '' && <p className="crud-sub">{manifest.description}</p>}

      <div className="crud-entities">
        {manifest.entities.map((entity) => (
          <EntitySection
            key={entity.name}
            entity={entity}
            moduleId={moduleId}
            api={api}
            canWrite={canWrite}
          />
        ))}
      </div>
    </main>
  );
}

function EntitySection({
  entity,
  moduleId,
  api,
  canWrite,
}: {
  entity: ManifestEntity;
  moduleId: string;
  api: ModuleApiClient;
  canWrite: boolean;
}) {
  const base = `/api/modules/${moduleId}/${entity.name}`;
  const [items, setItems] = useState<CrudRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CrudRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrudRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: CrudRow[] }>(base);
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список');
    }
  }, [api, base]);

  useEffect(() => {
    void load();
  }, [load]);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const onCreate = async (values: FormValues): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: 'POST', body: buildPayload(entity, values) });
      setCreating(false);
      await load();
    } catch (err) {
      fail(err, 'Не удалось добавить запись');
    } finally {
      setBusy(false);
    }
  };

  const onUpdate = async (row: CrudRow, values: FormValues): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'PATCH', body: buildPayload(entity, values) });
      setEditing(null);
      await load();
    } catch (err) {
      fail(err, 'Не удалось сохранить запись');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: CrudRow): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await load();
    } catch (err) {
      fail(err, 'Не удалось удалить запись');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="crud-entity">
      <div className="crud-entity-head">
        <h2 className="crud-entity-title">{entity.label}</h2>
        {canWrite && (
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              setCreating((v) => !v);
              setEditing(null);
            }}
          >
            {creating ? 'Свернуть' : 'Добавить'}
          </button>
        )}
      </div>

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <EntityForm
          entity={entity}
          initial={null}
          onSubmit={onCreate}
          onCancel={() => setCreating(false)}
          busy={busy}
          submitLabel="Добавить запись"
        />
      )}

      {items === null ? (
        <p className="crud-hint">Загружаем…</p>
      ) : items.length === 0 ? (
        <div className="crud-empty">
          <p className="crud-empty-title">Пока пусто</p>
          {canWrite && (
            <p className="crud-empty-text">Добавьте первую запись — и она появится здесь.</p>
          )}
        </div>
      ) : (
        <ul className="crud-list">
          {items.map((row) =>
            editing?.id === row.id ? (
              <li className="crud-row" key={row.id}>
                <EntityForm
                  entity={entity}
                  initial={row}
                  onSubmit={(values) => void onUpdate(row, values)}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                  submitLabel="Сохранить"
                />
              </li>
            ) : (
              <li className="crud-row" key={row.id}>
                <div className="crud-row-fields">
                  {entity.fields.map((field) => (
                    <div className="crud-cell" key={field.name}>
                      <span className="crud-cell-label">{field.label}</span>
                      <span className="crud-cell-value">
                        <FieldValue field={field} value={row[field.name]} />
                      </span>
                    </div>
                  ))}
                </div>

                {row.created_by_username !== null && (
                  <div className="crud-row-meta">Записал(а): {row.created_by_username}</div>
                )}

                {canWrite && (
                  <div className="crud-row-actions">
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(row);
                        setCreating(false);
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
                  <div className="crud-confirm">
                    <span>Удалить запись? Действие необратимо.</span>
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
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function EntityForm({
  entity,
  initial,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  entity: ManifestEntity;
  initial: CrudRow | null;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const [values, setValues] = useState<FormValues>(() => initialValues(entity, initial));

  const setValue = (name: string, value: string | number | boolean): void => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  return (
    <form
      className="crud-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="crud-form-grid">
        {entity.fields.map((field) =>
          field.type === 'boolean' ? (
            <label className="crud-check" key={field.name}>
              <input
                type="checkbox"
                checked={values[field.name] === true}
                onChange={(e) => setValue(field.name, e.target.checked)}
              />
              <span>{field.label}</span>
            </label>
          ) : (
            <label className={`field crud-field crud-field-${field.type}`} key={field.name}>
              <span className="field-label">{field.label}</span>
              <FieldInput
                field={field}
                value={values[field.name] ?? ''}
                onChange={(v) => setValue(field.name, v)}
              />
            </label>
          ),
        )}
      </div>
      <div className="crud-form-actions">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : submitLabel}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ManifestField;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const required = field.required === true;
  if (field.type === 'textarea') {
    return (
      <textarea
        className="field-input"
        rows={3}
        required={required}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        className="field-input"
        type="number"
        step="any"
        inputMode="decimal"
        required={required}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'date') {
    return (
      <input
        className="field-input"
        type="date"
        required={required}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'url') {
    return (
      <input
        className="field-input"
        type="url"
        inputMode="url"
        required={required}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="field-input"
      type="text"
      required={required}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function initialValues(entity: ManifestEntity, row: CrudRow | null): FormValues {
  const values: FormValues = {};
  for (const field of entity.fields) {
    const existing = row?.[field.name];
    if (existing !== undefined && existing !== null) {
      values[field.name] = existing as string | number | boolean;
    } else if (field.type === 'boolean') {
      values[field.name] = false;
    } else {
      values[field.name] = '';
    }
  }
  return values;
}

function buildPayload(entity: ManifestEntity, values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of entity.fields) {
    const raw = values[field.name];
    if (field.type === 'boolean') {
      payload[field.name] = raw === true;
    } else if (field.type === 'number') {
      if (raw === '') continue;
      payload[field.name] = Number(raw);
    } else if (field.type === 'date') {
      if (raw === '') continue;
      payload[field.name] = String(raw);
    } else {
      payload[field.name] = String(raw ?? '');
    }
  }
  return payload;
}

function FieldValue({ field, value }: { field: ManifestField; value: unknown }): ReactNode {
  if (field.type === 'boolean') {
    return value === true ? (
      <span className="crud-bool crud-bool-on">Да</span>
    ) : (
      <span className="crud-bool">Нет</span>
    );
  }
  if (value === null || value === undefined || value === '') {
    return <span className="crud-na">—</span>;
  }
  if (field.type === 'date') return formatDate(value);
  if (field.type === 'url') {
    const href = safeHttpUrl(String(value));
    return href !== null ? (
      <a className="crud-link" href={href} target="_blank" rel="noopener noreferrer">
        {String(value)}
      </a>
    ) : (
      String(value)
    );
  }
  return String(value);
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

function formatDate(value: unknown): string {
  const iso = String(value);
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
