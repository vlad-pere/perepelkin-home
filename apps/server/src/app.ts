import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';

import type { Config } from './config.js';
import { buildCore } from './core.js';
import { adminModuleInfo } from '@perepelkin-home/module-admin';
import { deleteExpiredSessions } from './db/sessions.js';
import { resolveSession } from './hooks.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerModulesFromDisk } from './modules/host.js';
import { ApiError } from './errors.js';

export interface AppOptions {
  db: Database.Database;
  config: Config;
  logger?: boolean;
}

export async function createApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db, config } = opts;
  const core = buildCore(db);
  core.registerModule(adminModuleInfo);
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });

  app.decorateRequest('core', { getter: () => core });
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);
  app.decorateRequest('csrfToken', null);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.cookieSecure
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '15 minutes',
  });

  app.addHook('preHandler', async (req, reply) => {
    resolveSession(db, req, reply);
  });  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Некорректные данные' } });
    }
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (typeof err.statusCode === 'number') {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code ?? 'ERROR', message: err.message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' } });
  });

  deleteExpiredSessions(db);

  registerAuthRoutes(app, { db, config, core });
  registerAdminRoutes(app, core);

  if (config.modulesDir) {
    await registerModulesFromDisk(app, { db, core, modulesDir: config.modulesDir });
  }

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Не найдено' } });
    });
  }

  return app;
}
