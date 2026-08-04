import type { FastifyReply, FastifyRequest } from 'fastify';
import type Database from 'better-sqlite3';
import { deleteSession, getSession } from './db/sessions.js';
import { CSRF_HEADER, SESSION_COOKIE } from './constants.js';

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

export function csrfOk(req: FastifyRequest): boolean {
  return req.csrfToken !== null && req.headers[CSRF_HEADER] === req.csrfToken;
}

export function resolveSession(db: Database.Database, req: FastifyRequest, reply: FastifyReply): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  const session = getSession(db, token);
  if (session) {
    req.user = session.user;
    req.sessionToken = session.token;
    req.csrfToken = session.csrfToken;
  } else {
    deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!req.user) return reply.code(401).send(UNAUTHENTICATED);
  if (isMutation(req.method) && !csrfOk(req)) return reply.code(403).send(CSRF_FAILED);
  return undefined;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!req.user) return reply.code(401).send(UNAUTHENTICATED);
  if (!req.user.is_admin) return reply.code(403).send(FORBIDDEN);
  if (isMutation(req.method) && !csrfOk(req)) return reply.code(403).send(CSRF_FAILED);
  return undefined;
}
