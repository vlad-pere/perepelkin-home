import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, MIGRATIONS } from '../src/db/db.js';

const tempDirs: string[] = [];
const openDbs: Database.Database[] = [];

function track<T extends Database.Database>(db: T): T {
  openDbs.push(db);
  return db;
}

function tempDbFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'domo-db-'));
  tempDirs.push(dir);
  return join(dir, 'test.db');
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    if (db.open) db.close();
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface TableInfo {
  name: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

describe('schema v3', () => {
  it('creates modules and module_migrations tables on a fresh db', () => {
    const db = track(openDb(':memory:'));
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('modules');
    expect(names).toContain('module_migrations');
    db.close();
  });

  it('modules has v2 columns and the kind CHECK constraint', () => {
    const db = track(openDb(':memory:'));
    const cols = db.prepare('PRAGMA table_info(modules)').all() as TableInfo[];
    const col = (name: string): TableInfo => {
      const c = cols.find((c) => c.name === name);
      if (!c) throw new Error(`no column ${name}`);
      return c;
    };
    expect(col('id').pk).toBe(1);
    expect(col('kind').notnull).toBe(1);
    expect(col('name').notnull).toBe(1);
    expect(col('description').dflt_value).toBe("''");
    expect(col('manifest_json').notnull).toBe(1);
    expect(col('version').dflt_value).toBe('1');
    expect(col('status').dflt_value).toBe("'active'");
    expect(col('error').notnull).toBe(0);
    expect(col('created_at').notnull).toBe(1);

    const insert = db.prepare(
      'INSERT INTO modules (id, kind, name, manifest_json) VALUES (?, ?, ?, ?)',
    );
    expect(() => insert.run('m1', 'bogus', 'Mod', '{}')).toThrow();
    db.close();
  });

  it('module_migrations cascades on module delete', () => {
    const db = track(openDb(':memory:'));
    db.prepare(
      "INSERT INTO modules (id, kind, name, manifest_json) VALUES ('m1', 'simple', 'Mod', '{}')",
    ).run();
    db.prepare('INSERT INTO module_migrations (module_id, version, applied_at) VALUES (?, ?, ?)').run(
      'm1',
      1,
      '2026-01-01T00:00:00.000Z',
    );
    db.prepare("DELETE FROM modules WHERE id = 'm1'").run();
    expect(db.prepare('SELECT * FROM module_migrations').all()).toHaveLength(0);
    db.close();
  });

  it('users has auth_mode with pin default and a CHECK constraint', () => {
    const db = track(openDb(':memory:'));
    const cols = db.prepare('PRAGMA table_info(users)').all() as TableInfo[];
    const col = cols.find((c) => c.name === 'auth_mode');
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(1);
    expect(col!.dflt_value).toBe("'pin'");

    db.prepare("INSERT INTO users (username, password_hash) VALUES ('a', 'h')").run();
    expect(db.prepare("SELECT auth_mode FROM users WHERE username = 'a'").get()).toEqual({
      auth_mode: 'pin',
    });

    expect(() =>
      db.prepare("INSERT INTO users (username, password_hash, auth_mode) VALUES ('b', 'h', 'bogus')").run(),
    ).toThrow();
    db.close();
  });

  it('is idempotent on reopen and preserves data', () => {
    const file = tempDbFile();
    const db1 = track(openDb(file));
    db1.prepare(
      "INSERT INTO modules (id, kind, name, manifest_json) VALUES ('m1', 'simple', 'Mod', '{}')",
    ).run();
    expect(db1.pragma('user_version', { simple: true })).toBe(3);
    db1.close();

    const db2 = track(openDb(file));
    expect(db2.pragma('user_version', { simple: true })).toBe(3);
    expect(db2.prepare("SELECT id, kind FROM modules WHERE id = 'm1'").get()).toEqual({
      id: 'm1',
      kind: 'simple',
    });
    db2.close();
  });

  it('upgrades a v1 database and preserves existing data', () => {
    const file = tempDbFile();
    const raw = track(new Database(file));
    raw.exec(MIGRATIONS[1]!);
    raw.pragma('user_version = 1');
    raw.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('alice', 'hash');
    raw.prepare('INSERT INTO groups (name) VALUES (?)').run('family');
    raw.close();

    const db = track(openDb(file));
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(db.prepare("SELECT username FROM users WHERE username = 'alice'").get()).toEqual({
      username: 'alice',
    });
    expect(db.prepare("SELECT auth_mode FROM users WHERE username = 'alice'").get()).toEqual({
      auth_mode: 'password',
    });
    expect(db.prepare("SELECT name FROM groups WHERE name = 'family'").get()).toEqual({
      name: 'family',
    });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'modules'").get(),
    ).toBeTruthy();
    db.close();
  });
});
