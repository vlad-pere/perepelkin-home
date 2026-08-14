import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA_VERSION = 4;

export const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS module_grants (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL,
      can_read INTEGER NOT NULL DEFAULT 0,
      can_write INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS module_data (
      module_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (module_id, key)
    );
  `,
  2: `
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('simple', 'code')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      manifest_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS module_migrations (
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (module_id, version)
    );
  `,
  3: `
    ALTER TABLE users ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'pin' CHECK (auth_mode IN ('pin', 'password'));
    UPDATE users SET auth_mode = 'password';
  `,
  4: `
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      pin_hash TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO users_new (id, username, password_hash, pin_hash, is_admin, created_at)
      SELECT id, username,
        CASE WHEN auth_mode = 'password' THEN password_hash ELSE NULL END,
        CASE WHEN auth_mode = 'pin' THEN password_hash ELSE NULL END,
        is_admin, created_at
      FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `,
};

function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current >= SCHEMA_VERSION) return;
  // Пересоздание таблиц внутри миграций требует отключения FK: PRAGMA нельзя
  // менять внутри транзакции, поэтому выключаем до и возвращаем после.
  db.pragma('foreign_keys = OFF');
  try {
    for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
      const sql = MIGRATIONS[version];
      if (sql === undefined) throw new Error(`Missing migration for schema version ${version}`);
      db.transaction(() => db.exec(sql))();
      db.pragma(`user_version = ${version}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export function openDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}
