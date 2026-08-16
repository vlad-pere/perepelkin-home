import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type Database from 'better-sqlite3';
import type { CrudGuards } from './crud.js';
import type { ByteStorage } from './storage.js';
import { badRequest, notFound, payloadTooLarge } from '../errors.js';

/**
 * Допустимые типы файлов модулей. Только растровые изображения: SVG исключён
 * (скриптовые возможности), pdf/doc и т.п. не нужны для фото-дневника.
 */
export const ALLOWED_FILE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

const FILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StoredFile {
  id: string;
  moduleId: string;
  name: string;
  mime: string;
  size: number;
  createdBy: number | null;
  createdAt: string;
}

export interface FilesServiceOptions {
  db: Database.Database;
  /** Байты файлов; метаданные — в БД, ключ объекта — id файла. */
  storage: ByteStorage;
  maxFileSize: number;
}

export interface FilesService {
  maxFileSize: number;
  create(input: {
    moduleId: string;
    name: string;
    mime: string;
    buffer: Buffer;
    createdBy: number | null;
  }): Promise<StoredFile>;
  get(moduleId: string, id: string): StoredFile | null;
  read(id: string): Promise<Buffer>;
  remove(moduleId: string, id: string): Promise<boolean>;
}

interface FileRow {
  id: string;
  module_id: string;
  name: string;
  mime: string;
  size: number;
  created_by: number | null;
  created_at: string;
}

function sanitizeName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/]/g, '_')
    .replace(/[^\p{L}\p{N}._ -]/gu, '')
    .trim()
    .slice(0, 200);
  return cleaned === '' ? 'photo' : cleaned;
}

function toStoredFile(row: FileRow): StoredFile {
  return {
    id: row.id,
    moduleId: row.module_id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Переиспользуемое хранилище файлов модулей: метаданные в БД, байты в ByteStorage. */
export function createFilesService(opts: FilesServiceOptions): FilesService {
  const { db, storage, maxFileSize } = opts;

  const selectStmt = db.prepare('SELECT * FROM files WHERE id = ? AND module_id = ?');
  const insertStmt = db.prepare(
    'INSERT INTO files (id, module_id, name, mime, size, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const deleteStmt = db.prepare('DELETE FROM files WHERE id = ? AND module_id = ?');

  return {
    maxFileSize,
    async create({ moduleId, name, mime, buffer, createdBy }) {
      if (buffer.length > maxFileSize) throw payloadTooLarge();
      const id = randomUUID();
      insertStmt.run(id, moduleId, sanitizeName(name), mime, buffer.length, createdBy ?? null);
      try {
        await storage.put(id, buffer);
      } catch (err) {
        deleteStmt.run(id, moduleId);
        throw err;
      }
      const row = selectStmt.get(id, moduleId) as FileRow | undefined;
      if (!row) throw new Error('file row disappeared after insert');
      return toStoredFile(row);
    },
    get(moduleId, id) {
      if (!FILE_ID_PATTERN.test(id)) return null;
      const row = selectStmt.get(id, moduleId) as FileRow | undefined;
      return row ? toStoredFile(row) : null;
    },
    read(id) {
      return storage.get(id);
    },
    async remove(moduleId, id) {
      if (!FILE_ID_PATTERN.test(id)) return false;
      const row = selectStmt.get(id, moduleId) as FileRow | undefined;
      if (!row) return false;
      deleteStmt.run(id, moduleId);
      await storage.remove(id);
      return true;
    },
  };
}

export interface ModuleFileRoutesOptions {
  files: FilesService;
  moduleId: string;
  guards: CrudGuards;
}

function mediaTypeOf(contentType: unknown): string {
  if (typeof contentType !== 'string') return '';
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

function fileNameOf(req: FastifyRequest): string {
  const raw = (req.query as { name?: unknown } | null)?.name;
  return typeof raw === 'string' ? raw : 'photo';
}

/** Монтирует роуты файлов модуля под его read/write гарды (как CRUD и manifest). */
export function registerModuleFileRoutes(
  app: FastifyInstance,
  opts: ModuleFileRoutesOptions,
): void {
  const { files, moduleId, guards } = opts;

  app.get('/files/:fileId', { preHandler: guards.read }, async (req, reply) => {
    const fileId = (req.params as { fileId?: string }).fileId;
    const record = files.get(moduleId, fileId ?? '');
    if (!record) throw notFound('Файл не найден');
    return reply
      .header('content-type', record.mime)
      .header('content-length', record.size)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(await files.read(record.id));
  });

  app.post(
    '/files',
    { preHandler: guards.write, bodyLimit: files.maxFileSize },
    async (req, reply) => {
      const mime = mediaTypeOf(req.headers['content-type']);
      if (!ALLOWED_FILE_MIMES.includes(mime as (typeof ALLOWED_FILE_MIMES)[number])) {
        throw badRequest(mime === '' ? 'Отсутствует Content-Type' : `Неподдерживаемый тип файла "${mime}"`);
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw badRequest('Пустое тело запроса');
      }
      if (body.length > files.maxFileSize) throw payloadTooLarge();
      const record = await files.create({
        moduleId,
        name: fileNameOf(req),
        mime,
        buffer: body,
        createdBy: req.user?.id ?? null,
      });
      return reply.code(201).send({ file: record });
    },
  );

  app.delete('/files/:fileId', { preHandler: guards.write }, async (req, reply) => {
    const fileId = (req.params as { fileId?: string }).fileId;
    const removed = await files.remove(moduleId, fileId ?? '');
    if (!removed) throw notFound('Файл не найден');
    return reply.code(204).send();
  });
}
