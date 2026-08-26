import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type Database from 'better-sqlite3';
import type { Action, ModuleManifest } from '@perepelkin-home/core';
import type { Core } from '../core.js';
import { csrfOk } from '../hooks.js';
import { ensureEntityTable, registerCrudRoutes } from './crud.js';
import { registerModuleFileRoutes, type FilesService } from './files.js';
import { loadManifests } from './loader.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RouteSpec {
  method: HttpMethod;
  path: string;
  action: Action;
}

export interface ModuleContext {
  /** Регистрирует произвольный роут код-модуля под защитой гарда на `action`. */
  route(spec: RouteSpec, handler: (req: FastifyRequest, reply: FastifyReply) => void | Promise<void>): void;
}

export type CodeModuleRegister = (app: FastifyInstance, ctx: ModuleContext) => void | Promise<void>;

const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Требуется вход' },
};
const FORBIDDEN = {
  error: { code: 'FORBIDDEN', message: 'Недостаточно прав' },
};
const CSRF_FAILED = {
  error: { code: 'CSRF_FAILED', message: 'Недостаточно прав' },
};

function isMutation(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

export function makeModuleGuard(core: Core, moduleId: string, action: Action) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    if (!req.user) return reply.code(401).send(UNAUTHENTICATED);
    if (!core.can({ id: req.user.id, isAdmin: req.user.is_admin === 1 }, moduleId, action)) {
      return reply.code(403).send(FORBIDDEN);
    }
    if (isMutation(req.method) && !csrfOk(req)) return reply.code(403).send(CSRF_FAILED);
    return undefined;
  };
}

export interface MountModuleOptions {
  db: Database.Database;
  core: Core;
  manifest: ModuleManifest;
  /** Только для код-модулей: регистрирует произвольные роуты через `ctx.route`. */
  register?: CodeModuleRegister;
  /** Переиспользуемое хранилище файлов; если задано — модулю доступны роуты `/files`. */
  files?: FilesService;
}

export async function mountModule(app: FastifyInstance, opts: MountModuleOptions): Promise<void> {
  const { db, core, manifest } = opts;
  const moduleId = manifest.id;
  syncModule(db, manifest);

  const publicRead = manifest.publicRead === true;
  const noopGuard = async (_req: FastifyRequest, _reply: FastifyReply): Promise<FastifyReply | undefined> =>
    undefined;
  /** Read-роуты публичных модулей открыты без входа; write-роуты всегда под гардом. */
  const guardFor = (action: Action): typeof noopGuard =>
    publicRead && action === 'read' ? noopGuard : makeModuleGuard(core, moduleId, action);

  let registerError: unknown;
  await app.register(
    async (moduleApp) => {
      try {
        const readGuard = guardFor('read');
        const writeGuard = guardFor('write');
        const ctx: ModuleContext = {
          route(spec, handler) {
            moduleApp.route({
              method: spec.method,
              url: spec.path,
              preHandler: guardFor(spec.action),
              handler,
            });
          },
        };

        moduleApp.get('/manifest', { preHandler: readGuard }, async () => ({ manifest }));

        if (manifest.kind === 'simple') {
          registerCrudRoutes(moduleApp, { db, manifest, guards: { read: readGuard, write: writeGuard } });
        }

        if (opts.files) {
          registerModuleFileRoutes(moduleApp, {
            files: opts.files,
            moduleId,
            guards: { read: readGuard, write: writeGuard },
          });
        }

        if (opts.register) await opts.register(moduleApp, ctx);
      } catch (err) {
        registerError = err;
      }
    },
    { prefix: `/api/modules/${moduleId}` },
  );

  if (registerError !== undefined) throw registerError;
  core.registerModule({
    id: moduleId,
    name: manifest.name,
    description: manifest.description,
    ...(manifest.icon === undefined ? {} : { icon: manifest.icon }),
    ...(manifest.color === undefined ? {} : { color: manifest.color }),
  });
}

/** Персистит манифест в `modules`/`module_migrations` и создаёт entity-таблицы. */
export function syncModule(db: Database.Database, manifest: ModuleManifest): void {
  const json = JSON.stringify(manifest);
  const existing = db.prepare('SELECT version, manifest_json FROM modules WHERE id = ?').get(manifest.id) as
    | { version: number; manifest_json: string }
    | undefined;

  db.transaction(() => {
    if (!existing || existing.manifest_json !== json) {
      const version = existing ? existing.version + 1 : 1;
      db.prepare(
        `INSERT INTO modules (id, kind, name, description, manifest_json, version, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           name = excluded.name,
           description = excluded.description,
           manifest_json = excluded.manifest_json,
           version = excluded.version,
           status = 'active',
           error = NULL`,
      ).run(manifest.id, manifest.kind, manifest.name, manifest.description, json, version);

      db.prepare('INSERT INTO module_migrations (module_id, version, applied_at) VALUES (?, ?, ?)').run(
        manifest.id,
        version,
        new Date().toISOString(),
      );
    } else {
      db.prepare(
        `UPDATE modules SET status = 'active', error = NULL, name = ?, description = ? WHERE id = ?`,
      ).run(manifest.name, manifest.description, manifest.id);
    }

    for (const entity of manifest.entities) {
      ensureEntityTable(db, manifest.id, entity);
    }
  })();
}

export interface RegisterModulesOptions {
  db: Database.Database;
  core: Core;
  modulesDir: string;
  log?: FastifyBaseLogger;
  codeLoader?: (id: string, manifest: ModuleManifest) => CodeModuleRegister | undefined;
  files?: FilesService;
}

export interface RegisterModulesResult {
  mounted: string[];
  broken: string[];
}

/**
 * Регистрирует модули из каталога `modulesDir` (по одному подкаталогу на модуль,
 * манифест в `manifest.json`). Ошибки регистрации изолируются: модуль получает
 * `status='broken'`, остальные продолжают работать.
 */
export async function registerModulesFromDisk(
  app: FastifyInstance,
  opts: RegisterModulesOptions,
): Promise<RegisterModulesResult> {
  const { db, core, modulesDir } = opts;
  const log = opts.log ?? app.log;
  const { modules, errors } = loadManifests(modulesDir);
  const mounted: string[] = [];
  const broken: string[] = [];

  for (const err of errors) {
    markBroken(db, err.id, err.message);
    broken.push(err.id);
    log.error({ module: err.id, error: err.message }, 'module manifest invalid');
  }

  for (const manifest of modules) {
    try {
      const register = opts.codeLoader?.(manifest.id, manifest);
      await mountModule(app, { db, core, manifest, register, files: opts.files });
      mounted.push(manifest.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markBroken(db, manifest.id, message);
      broken.push(manifest.id);
      log.error({ module: manifest.id, error: message }, 'module registration failed');
    }
  }

  return { mounted, broken };
}

function markBroken(db: Database.Database, id: string, message: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO modules (id, kind, name, description, manifest_json, version, status)
     VALUES (?, 'code', ?, '', '{}', 1, 'broken')`,
  ).run(id, id);
  db.prepare('UPDATE modules SET status = ?, error = ? WHERE id = ?').run('broken', message, id);
}
