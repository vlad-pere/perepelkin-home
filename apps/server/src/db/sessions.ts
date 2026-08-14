import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuthMode } from '@perepelkin-home/core';

export interface Session {
  token: string;
  csrfToken: string;
  expiresAt: number;
}

export interface SessionUser {
  id: number;
  username: string;
  password_hash: string;
  auth_mode: AuthMode;
  is_admin: number;
  created_at: string;
}

export interface SessionWithUser extends Session {
  user: SessionUser;
}

interface SessionRow {
  token: string;
  csrf_token: string;
  expires_at: number;
  id: number;
  username: string;
  password_hash: string;
  auth_mode: AuthMode;
  is_admin: number;
  created_at: string;
}

const insertSession = (db: Database.Database, token: string, userId: number, csrfToken: string, expiresAt: number) =>
  db.prepare('INSERT INTO sessions (token, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, csrfToken, expiresAt);

const selectSession = (db: Database.Database, token: string) =>
  db
    .prepare(
      `SELECT s.token, s.csrf_token, s.expires_at, u.id, u.username, u.password_hash, u.auth_mode, u.is_admin, u.created_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .get(token) as SessionRow | undefined;

const deleteStmt = (db: Database.Database, token: string) =>
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);

export function createSession(
  db: Database.Database,
  userId: number,
  ttlMs: number,
): Session {
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + ttlMs;
  insertSession(db, token, userId, csrfToken, expiresAt);
  return { token, csrfToken, expiresAt };
}

export function getSession(
  db: Database.Database,
  token: string,
  now: number = Date.now(),
): SessionWithUser | null {
  const row = selectSession(db, token);
  if (!row) return null;
  if (row.expires_at <= now) {
    deleteStmt(db, token);
    return null;
  }
  return {
    token: row.token,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    user: {
      id: row.id,
      username: row.username,
      password_hash: row.password_hash,
      auth_mode: row.auth_mode,
      is_admin: row.is_admin,
      created_at: row.created_at,
    },
  };
}

export function deleteSession(db: Database.Database, token: string): void {
  deleteStmt(db, token);
}

export function deleteSessionsForUser(db: Database.Database, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function deleteExpiredSessions(db: Database.Database, now: number = Date.now()): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}
