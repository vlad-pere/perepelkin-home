import { isModuleRegistered } from './registry.js';

/** Минимальный структурный интерфейс для better-sqlite3 `Database`. */
export interface SqlPrepared {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

export interface SqlDb {
  prepare(sql: string): SqlPrepared;
}

export interface ScopedStoreEntry {
  key: string;
  value: unknown;
}

export interface ScopedStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  list(): ScopedStoreEntry[];
}

const MAX_KEY_LENGTH = 200;

export function createScopedStore(db: SqlDb, moduleId: string): ScopedStore {
  if (!isModuleRegistered(moduleId)) {
    throw new Error(`Cannot open store for unknown module "${moduleId}"`);
  }

  const getStmt = db.prepare('SELECT value FROM module_data WHERE module_id = ? AND key = ?');
  const setStmt = db.prepare(
    'INSERT INTO module_data (module_id, key, value) VALUES (?, ?, ?) ON CONFLICT(module_id, key) DO UPDATE SET value = excluded.value',
  );
  const deleteStmt = db.prepare('DELETE FROM module_data WHERE module_id = ? AND key = ?');
  const listStmt = db.prepare('SELECT key, value FROM module_data WHERE module_id = ? ORDER BY key');

  function assertKey(key: string): void {
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw new Error('Key must be a non-empty string up to 200 characters');
    }
  }

  return {
    get(key: string): unknown {
      assertKey(key);
      const row = getStmt.get(moduleId, key) as { value: string } | undefined;
      if (!row) return undefined;
      return JSON.parse(row.value);
    },
    set(key: string, value: unknown): void {
      assertKey(key);
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error('Value must be JSON-serializable');
      }
      setStmt.run(moduleId, key, serialized);
    },
    delete(key: string): void {
      assertKey(key);
      deleteStmt.run(moduleId, key);
    },
    list(): ScopedStoreEntry[] {
      const rows = listStmt.all(moduleId) as { key: string; value: string }[];
      return rows.map((row) => ({ key: row.key, value: JSON.parse(row.value) }));
    },
  };
}
