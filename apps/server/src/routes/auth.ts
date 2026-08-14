import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { MeResponse, ModuleKind } from '@perepelkin-home/core';
import type { Config } from '../config.js';
import type { Core, UserRow } from '../core.js';
import { toUser } from '../core.js';
import { verifyLogin } from '../auth/passwords.js';
import { createSession, deleteSession } from '../db/sessions.js';
import { SESSION_COOKIE } from '../constants.js';
import { requireAuth, csrfOk } from '../hooks.js';
import { secretSchema, usernameSchema } from '../schemas.js';

const loginBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['username', 'password'],
  properties: {
    username: usernameSchema,
    password: secretSchema,
  },
};

export interface AuthRoutesDeps {
  db: Database.Database;
  config: Config;
  core: Core;
}

export function buildMe(
  core: Core,
  db: Database.Database,
  user: UserRow,
  csrfToken: string,
): MeResponse & { csrfToken: string } {
  const groupIds = core.users.groupIds(user.id);
  const kindById = new Map(
    (
      db.prepare('SELECT id, kind FROM modules').all() as Array<{ id: string; kind: ModuleKind }>
    ).map((r) => [r.id, r.kind] as const),
  );
  const modules = core
    .listModules()
    .map((m) => {
      const kind = kindById.get(m.id) ?? 'code';
      return {
        ...m,
        kind,
        route: m.id === 'admin' ? '/admin' : `/m/${m.id}`,
        canRead: core.canForGroups(groupIds, user.is_admin === 1, m.id, 'read'),
        canWrite: core.canForGroups(groupIds, user.is_admin === 1, m.id, 'write'),
      };
    })
    .filter((m) => m.canRead || m.canWrite);

  return {
    user: toUser(user),
    groups: core.groups.listForUser(user.id),
    modules,
    csrfToken,
  };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { db, config, core } = deps;

  app.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: { body: loginBodySchema },
    },
    async (req, reply) => {
      const { username, password } = req.body as { username: string; password: string };

      const user = core.users.getByUsername(username);
      if (!user) {
        return reply
          .code(401)
          .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Неверное имя пользователя, пинкод или пароль' } });
      }
      const ok = await verifyLogin(password, user);
      if (!ok) {
        return reply
          .code(401)
          .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Неверное имя пользователя, пинкод или пароль' } });
      }

      const session = createSession(db, user.id, config.sessionTtlMs);
      reply.setCookie(SESSION_COOKIE, session.token, {
        path: '/',
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        maxAge: Math.floor(config.sessionTtlMs / 1000),
      });

      return reply.send(buildMe(core, db, user, session.csrfToken));
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.csrfToken && !csrfOk(req)) {
      return reply.code(403).send({ error: { code: 'CSRF_FAILED', message: 'Недостаточно прав' } });
    }
    if (req.sessionToken) {
      deleteSession(db, req.sessionToken);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    const user = req.user as UserRow;
    return buildMe(core, db, user, req.csrfToken as string);
  });
}
