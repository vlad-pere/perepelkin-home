import { beforeEach, describe, expect, it } from 'vitest';
import { createScopedStore } from '../src/store.js';
import { registerModule } from '../src/registry.js';
import type { SqlDb } from '../src/store.js';

class FakeDb implements SqlDb {
  rows = new Map<string, string>();

  prepare(sql: string) {
    if (sql.startsWith('SELECT value FROM module_data')) {
      return {
        get: (...p: unknown[]) => {
          const [moduleId, key] = p as [string, string];
          const value = this.rows.get(`${moduleId}\u0000${key}`);
          return value === undefined ? undefined : { value };
        },
        all: () => [],
        run: () => ({}),
      };
    }
    if (sql.includes('ORDER BY key')) {
      return {
        get: () => undefined,
        all: (...p: unknown[]) => {
          const [moduleId] = p as [string];
          return [...this.rows.entries()]
            .filter(([k]) => k.startsWith(`${moduleId}\u0000`))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => ({ key: k.slice(moduleId.length + 1), value: v }));
        },
        run: () => ({}),
      };
    }
    if (sql.startsWith('INSERT INTO module_data')) {
      return {
        get: () => undefined,
        all: () => [],
        run: (...p: unknown[]) => {
          const [moduleId, key, value] = p as [string, string, string];
          this.rows.set(`${moduleId}\u0000${key}`, value);
          return {};
        },
      };
    }
    return {
      get: () => undefined,
      all: () => [],
      run: (...p: unknown[]) => {
        const [moduleId, key] = p as [string, string];
        this.rows.delete(`${moduleId}\u0000${key}`);
        return {};
      },
    };
  }
}

const db = new FakeDb();

beforeEach(() => {
  db.rows.clear();
});

describe('core.store', () => {
  it('rejects unknown modules', () => {
    expect(() => createScopedStore(db, 'nope')).toThrow(/unknown module/i);
  });

  it('sets, gets and lists JSON values', () => {
    registerModule({ id: 'notes', name: 'Notes', description: '' });
    const store = createScopedStore(db, 'notes');

    expect(store.get('missing')).toBeUndefined();
    store.set('title', 'Дом');
    store.set('tags', ['a', 'b']);
    store.set('count', 3);
    expect(store.get('title')).toBe('Дом');
    expect(store.get('tags')).toEqual(['a', 'b']);
    expect(store.get('count')).toBe(3);
    expect(store.list()).toEqual([
      { key: 'count', value: 3 },
      { key: 'tags', value: ['a', 'b'] },
      { key: 'title', value: 'Дом' },
    ]);
  });

  it('overwrites and deletes', () => {
    const store = createScopedStore(db, 'notes');
    store.set('k', 1);
    store.set('k', 2);
    expect(store.get('k')).toBe(2);
    store.delete('k');
    expect(store.get('k')).toBeUndefined();
  });

  it('validates keys', () => {
    const store = createScopedStore(db, 'notes');
    expect(() => store.set('', 1)).toThrow(/key/i);
    expect(() => store.set('x'.repeat(201), 1)).toThrow(/key/i);
  });
});
