import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type Database from 'better-sqlite3';
import type { ManifestEntity, ManifestField, ModuleManifest, FieldType } from '@perepelkin-home/core';
import { badRequest, notFound } from '../errors.js';

export interface CrudGuards {
  read: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
  write: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
}

export function tableName(moduleId: string, entityName: string): string {
  return `module_${moduleId}_${entityName}`;
}

export function columnType(type: FieldType): string {
  switch (type) {
    case 'text':
    case 'textarea':
    case 'date':
      return 'TEXT';
    case 'number':
      return 'REAL';
    case 'boolean':
      return 'INTEGER';
  }
}

export function createEntityTableSql(moduleId: string, entity: ManifestEntity): string {
  const columns = entity.fields.map(
    (field) => `"${field.name}" ${columnType(field.type)}${field.required ? ' NOT NULL' : ''}`,
  );
  return `CREATE TABLE IF NOT EXISTS "${tableName(moduleId, entity.name)}" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${columns.join(',\n    ')},
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );`;
}

function validateFieldValue(field: ManifestField, value: unknown): string | null {
  switch (field.type) {
    case 'text':
    case 'textarea':
      if (typeof value !== 'string') return `field "${field.name}" must be a string`;
      if (field.required && value.trim() === '') return `field "${field.name}" must not be empty`;
      return null;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `field "${field.name}" must be a number`;
      }
      return null;
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return `field "${field.name}" must be a date in YYYY-MM-DD format`;
      }
      return null;
    }
    case 'boolean':
      if (typeof value !== 'boolean') return `field "${field.name}" must be a boolean`;
      return null;
  }
}

/**
 * Валидирует тело запроса против полей сущности.
 * `patch=false` — create: требуются все `required`-поля.
 * `patch=true` — update: проверяются только переданные поля.
 */
function validateBody(entity: ManifestEntity, body: unknown, patch: boolean): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('Body must be a JSON object');
  }
  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!entity.fields.some((f) => f.name === key)) throw badRequest(`Unknown field "${key}"`);
  }

  const clean: Record<string, unknown> = {};
  for (const field of entity.fields) {
    const has = Object.prototype.hasOwnProperty.call(record, field.name);
    if (has) {
      const error = validateFieldValue(field, record[field.name]);
      if (error !== null) throw badRequest(error);
      clean[field.name] = record[field.name];
    } else if (!patch && field.required) {
      throw badRequest(`Missing required field "${field.name}"`);
    }
  }
  return clean;
}

function toDbValue(field: ManifestField, value: unknown): unknown {
  return field.type === 'boolean' ? (value === true ? 1 : 0) : value;
}

function fromDbValue(field: ManifestField, value: unknown): unknown {
  if (field.type === 'boolean') return value === 1 || value === true;
  return value;
}

function toRow(row: Record<string, unknown>, entity: ManifestEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of entity.fields) {
    out[field.name] = fromDbValue(field, row[field.name]);
  }
  out.id = row.id;
  out.created_by = row.created_by;
  out.created_at = row.created_at;
  out.updated_at = row.updated_at;
  return out;
}

function parseRowId(raw: unknown): number {
  const id = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid row id');
  return id;
}

export function registerCrudRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database; manifest: ModuleManifest; guards: CrudGuards },
): void {
  const { db, manifest, guards } = opts;

  for (const entity of manifest.entities) {
    const table = tableName(manifest.id, entity.name);
    const columns = entity.fields.map((f) => f.name);
    const sortField = entity.defaultSort?.field;
    const sortDirection = entity.defaultSort?.direction ?? 'asc';

    const listStmt = db.prepare(
      sortField ? `SELECT * FROM "${table}" ORDER BY "${sortField}" ${sortDirection}` : `SELECT * FROM "${table}" ORDER BY id`,
    );
    const getStmt = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`);
    const deleteStmt = db.prepare(`DELETE FROM "${table}" WHERE id = ?`);
    const insertStmt = db.prepare(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}, created_by)
       VALUES (${columns.map(() => '?').join(', ')}, ?)`,
    );

    app.get(`/${entity.name}`, { preHandler: guards.read }, async () => {
      const rows = listStmt.all() as Array<Record<string, unknown>>;
      return { items: rows.map((row) => toRow(row, entity)) };
    });

    app.post(`/${entity.name}`, { preHandler: guards.write }, async (req, reply) => {
      const clean = validateBody(entity, req.body, false);
      const values = columns.map((name) => {
        const field = entity.fields.find((f) => f.name === name)!;
        return toDbValue(field, clean[name]);
      });
      const result = insertStmt.run(...values, req.user?.id ?? null);
      const row = getStmt.get(result.lastInsertRowid) as Record<string, unknown>;
      return reply.code(201).send({ item: toRow(row, entity) });
    });

    app.patch(`/${entity.name}/:rowId`, { preHandler: guards.write }, async (req) => {
      const rowId = parseRowId((req.params as { rowId?: string }).rowId);
      const clean = validateBody(entity, req.body, true);
      const keys = Object.keys(clean);
      if (keys.length === 0) throw badRequest('No fields to update');

      const sets = keys.map((name) => `"${name}" = ?`);
      const values = keys.map((name) => {
        const field = entity.fields.find((f) => f.name === name)!;
        return toDbValue(field, clean[name]);
      });
      const stmt = db.prepare(
        `UPDATE "${table}" SET ${sets.join(', ')},
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      );
      const result = stmt.run(...values, rowId);
      if (result.changes === 0) throw notFound('Запись не найдена');
      const row = getStmt.get(rowId) as Record<string, unknown>;
      return { item: toRow(row, entity) };
    });

    app.delete(`/${entity.name}/:rowId`, { preHandler: guards.write }, async (req, reply) => {
      const rowId = parseRowId((req.params as { rowId?: string }).rowId);
      const result = deleteStmt.run(rowId);
      if (result.changes === 0) throw notFound('Запись не найдена');
      return reply.code(204).send();
    });
  }
}
